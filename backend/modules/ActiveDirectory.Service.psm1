Import-Module "$PSScriptRoot/SharedState.psm1"

function Initialize-ActiveDirectory {
    param([string]$Domain)
    Set-SharedConfig -Name 'ActiveDirectory.Domain' -Value $Domain
}

function Test-ActiveDirectoryAvailable {
    $moduleReady = [bool](Get-Module -ListAvailable -Name ActiveDirectory)
    if(-not $moduleReady){ return $false }
    try{
        Import-Module ActiveDirectory -ErrorAction Stop
        Get-ADDomain -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Get-UnavailableResult {
    param([string]$Detail = 'ActiveDirectory module not available.')
    @{ available = $false; error = $Detail; data = $null }
}

function Get-AdUsers {
    if(-not (Test-ActiveDirectoryAvailable)){ return Get-UnavailableResult }
    $props = @('DisplayName','EmailAddress','Department','Title','DistinguishedName','Enabled','LockedOut','PasswordExpired','PasswordLastSet','LastLogonDate','Created','msDS-UserPasswordExpiryTimeComputed')
    $users = Get-ADUser -Filter * -Properties $props | ForEach-Object {
        $expiryRaw = $_.'msDS-UserPasswordExpiryTimeComputed'
        $expiry = $null
        if($expiryRaw -and $expiryRaw -ne 9223372036854775807 -and $expiryRaw -ne 0){
            $expiry = [datetime]::FromFileTime($expiryRaw).ToString('yyyy-MM-dd')
        }
        @{
            username        = $_.SamAccountName
            displayName     = $_.DisplayName
            email           = $_.EmailAddress
            department      = $_.Department
            jobTitle        = $_.Title
            ou              = $_.DistinguishedName
            enabled         = [bool]$_.Enabled
            locked          = [bool]$_.LockedOut
            passwordExpiry  = $expiry
            passwordLastSet = $(if($_.PasswordLastSet){ $_.PasswordLastSet.ToString('yyyy-MM-dd') })
            lastLogon       = $(if($_.LastLogonDate){ $_.LastLogonDate.ToString('yyyy-MM-dd') })
            created         = $(if($_.Created){ $_.Created.ToString('yyyy-MM-dd') })
        }
    }
    @{ available = $true; error = $null; data = $users }
}

function Get-AdComputers {
    if(-not (Test-ActiveDirectoryAvailable)){ return Get-UnavailableResult }
    $props = 'OperatingSystem','OperatingSystemVersion','DistinguishedName','Enabled','LastLogonDate'
    $computers = Get-ADComputer -Filter * -Properties $props | ForEach-Object {
        @{
            computerName = $_.Name
            os           = $_.OperatingSystem
            version      = $_.OperatingSystemVersion
            ou           = $_.DistinguishedName
            enabled      = [bool]$_.Enabled
            lastLogon    = $(if($_.LastLogonDate){ $_.LastLogonDate.ToString('yyyy-MM-dd') })
            lastSeen     = $(if($_.LastLogonDate){ $_.LastLogonDate.ToString('yyyy-MM-dd') })
        }
    }
    @{ available = $true; error = $null; data = $computers }
}

function Unlock-AdUserAccount {
    param([Parameter(Mandatory)][string]$Username)
    if(-not (Test-ActiveDirectoryAvailable)){ return Get-UnavailableResult }
    try{
        Unlock-ADAccount -Identity $Username -ErrorAction Stop
        $user = Get-ADUser -Identity $Username -Properties LockedOut
        @{ available = $true; error = $null; data = @{ username = $Username; locked = [bool]$user.LockedOut } }
    } catch {
        @{ available = $true; error = $_.Exception.Message; data = $null }
    }
}

function Get-AdInsights {
    $users = Get-AdUsers
    $computers = Get-AdComputers
    if(-not $users.available -or -not $computers.available){ return $null }
    $today = Get-Date
    @{
        locked              = @($users.data | Where-Object { $_.locked })
        disabled            = @($users.data | Where-Object { -not $_.enabled })
        expiring7           = @($users.data | Where-Object { $_.passwordExpiry -and ([datetime]$_.passwordExpiry) -le $today.AddDays(7) })
        inactiveUsers30     = @($users.data | Where-Object { $_.lastLogon -and ([datetime]$_.lastLogon) -le $today.AddDays(-30) })
        inactiveComputers30 = @($computers.data | Where-Object { $_.lastSeen -and ([datetime]$_.lastSeen) -le $today.AddDays(-30) })
        recentlyCreated     = @($users.data | Where-Object { $_.created -and ([datetime]$_.created) -ge $today.AddDays(-30) })
    }
}


function Test-AdCredentials {
    <#
    .SYNOPSIS
    Validates AD username and password by attempting an authenticated
    Get-ADUser call with the supplied credential. If the credential is
    wrong, this throws (caught below). This reuses the same AD module
    connection path already proven to work in this environment, instead
    of PrincipalContext.ValidateCredentials which was unreliable here.
    #>
    param(
        [Parameter(Mandatory)][string]$Username,
        [Parameter(Mandatory)][string]$Password
    )
    try {
        $domain = $env:USERDNSDOMAIN
        $securePwd = ConvertTo-SecureString $Password -AsPlainText -Force
        $cred = New-Object System.Management.Automation.PSCredential("$domain\$Username", $securePwd)

        # This call only succeeds if the credential actually authenticates
        $user = Get-ADUser -Identity $Username -Credential $cred `
            -Properties DisplayName, EmailAddress, Department, Title, MemberOf `
            -ErrorAction Stop

        # Restrict dashboard access to IT admins only (Domain Admins group).
        $isAdmin = $user.MemberOf -match "CN=Domain Admins,"
        if(-not $isAdmin){
            return @{ success = $false; error = "Access denied." }
        }

        return @{
            success     = $true
            username    = $user.SamAccountName
            displayName = $user.DisplayName
            email       = $user.EmailAddress
            department  = $user.Department
            title       = $user.Title
        }
    }
    catch {
        return @{ success = $false; error = 'Invalid username or password.' }
    }
}

Export-ModuleMember -Function Initialize-ActiveDirectory, Test-ActiveDirectoryAvailable, Get-AdUsers, Get-AdComputers, Unlock-AdUserAccount, Get-AdInsights, Test-AdCredentials
