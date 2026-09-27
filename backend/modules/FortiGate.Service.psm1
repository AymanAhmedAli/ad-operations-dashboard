<#
    FortiGate service - real calls to the FortiGate REST API
    (https://<device>/api/v2/monitor/...). Requires ITHUB_FORTIGATE_BASE_URL
    and ITHUB_FORTIGATE_API_TOKEN to be set on the host running this server.
    When not configured, or the device is unreachable, every function
    returns a clearly-typed "unavailable" result - never fabricated data.
#>

Import-Module "$PSScriptRoot/SharedState.psm1"

function Initialize-FortiGate {
    param([string]$BaseUrl, [string]$ApiToken, [bool]$ValidateCertificate = $true)
    Set-SharedConfig -Name 'FortiGate.BaseUrl' -Value $BaseUrl
    Set-SharedConfig -Name 'FortiGate.ApiToken' -Value $ApiToken
    Set-SharedConfig -Name 'FortiGate.ValidateCertificate' -Value $ValidateCertificate
}

function Test-FortiGateAvailable {
    $baseUrl = Get-SharedConfig -Name 'FortiGate.BaseUrl'
    $apiToken = Get-SharedConfig -Name 'FortiGate.ApiToken'
    if([string]::IsNullOrWhiteSpace($baseUrl) -or [string]::IsNullOrWhiteSpace($apiToken)){
        return $false
    }
    try{
        Invoke-FortiGateApi -Path '/api/v2/monitor/system/status' -ErrorAction Stop | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Get-UnavailableResult {
    param([string]$Detail = 'FortiGate base URL/API token are not configured, or the device is unreachable from this server.')
    @{ available = $false; error = $Detail; data = $null }
}

function Invoke-FortiGateApi {
    param([Parameter(Mandatory)][string]$Path)
    $baseUrl = Get-SharedConfig -Name 'FortiGate.BaseUrl'
    $apiToken = Get-SharedConfig -Name 'FortiGate.ApiToken'
    $validateCertificate = Get-SharedConfig -Name 'FortiGate.ValidateCertificate'
    $uri = "$($baseUrl.TrimEnd('/'))$Path`?access_token=$apiToken"
    $params = @{ Uri = $uri; Method = 'GET'; TimeoutSec = 8; ErrorAction = 'Stop' }
    if(-not $validateCertificate){ $params.SkipCertificateCheck = $true }
    Invoke-RestMethod @params
}

function Get-FortiGateDevice {
    if(-not (Test-FortiGateAvailable)){ return Get-UnavailableResult }
    try{
        $status = Invoke-FortiGateApi -Path '/api/v2/monitor/system/status'
        $perf   = Invoke-FortiGateApi -Path '/api/v2/monitor/system/resource/usage?scope=global&resource=all'
        $r = $status.results
        @{ available = $true; error = $null; data = @{
            hostname = $r.hostname
            model    = $r.model_name
            firmware = "$($r.version) build$($r.build)"
            serial   = $r.serial
            cpu      = $($perf.results.cpu[0].current -as [int])
            memory   = $($perf.results.mem[0].current -as [int])
            sessions = $($perf.results.session[0].current -as [int])
            uptime   = "$([int]($status.results.system_time_uptime_seconds/86400)) days"
        }}
    } catch {
        @{ available = $true; error = $_.Exception.Message; data = $null }
    }
}

function Get-FortiGateInterfaces {
    if(-not (Test-FortiGateAvailable)){ return Get-UnavailableResult }
    try{
        $res = Invoke-FortiGateApi -Path '/api/v2/monitor/system/interface'
        $data = $res.results.PSObject.Properties | ForEach-Object {
            @{ name = $_.Name; role = $_.Value.role; ip = "$($_.Value.ip)/$($_.Value.netmask)"; status = $(if($_.Value.link){'up'}else{'down'}) }
        }
        @{ available = $true; error = $null; data = $data }
    } catch {
        @{ available = $true; error = $_.Exception.Message; data = $null }
    }
}

function Get-FortiGateVpnTunnels {
    if(-not (Test-FortiGateAvailable)){ return Get-UnavailableResult }
    try{
        $res = Invoke-FortiGateApi -Path '/api/v2/monitor/vpn/ipsec'
        $data = $res.results | ForEach-Object {
            @{ name = $_.name; type = 'IPsec'; peer = $_.remote_gw; status = $(if($_.proxyid[0].status -eq 'up'){'up'}else{'down'}) }
        }
        @{ available = $true; error = $null; data = $data }
    } catch {
        @{ available = $true; error = $_.Exception.Message; data = $null }
    }
}

function Get-FortiGateVpnUsers {
    if(-not (Test-FortiGateAvailable)){ return Get-UnavailableResult }
    try{
        $res = Invoke-FortiGateApi -Path '/api/v2/monitor/vpn/ssl'
        $data = $res.results | ForEach-Object { $_.sessions } | ForEach-Object {
            @{ username = $_.user; sourceIp = $_.source_ip; connectedSince = $_.login_time; duration = $null }
        }
        @{ available = $true; error = $null; data = $data }
    } catch {
        @{ available = $true; error = $_.Exception.Message; data = $null }
    }
}

function Get-FortiGateConnectedDevices {
    if(-not (Test-FortiGateAvailable)){ return Get-UnavailableResult }
    try{
        $res = Invoke-FortiGateApi -Path '/api/v2/monitor/user/device/query'
        $data = $res.results | ForEach-Object {
            @{ hostname = $_.hostname; ip = $_.ip; mac = $_.mac; vendor = $_.hardware_vendor; iface = $_.interface; vlan = $_.vlan_id; bandwidthMbps = $null }
        }
        @{ available = $true; error = $null; data = $data }
    } catch {
        @{ available = $true; error = $_.Exception.Message; data = $null }
    }
}

function Get-FortiGateSecurityEvents {
    if(-not (Test-FortiGateAvailable)){ return Get-UnavailableResult }
    try{
        $res = Invoke-FortiGateApi -Path '/api/v2/log/memory/event?rows=50'
        $data = $res.results | ForEach-Object {
            @{ time = $_.date + ' ' + $_.time; severity = $_.level; event = $_.msg }
        }
        @{ available = $true; error = $null; data = $data }
    } catch {
        @{ available = $true; error = $_.Exception.Message; data = $null }
    }
}

Export-ModuleMember -Function Initialize-FortiGate, Test-FortiGateAvailable, Get-FortiGateDevice, Get-FortiGateInterfaces, Get-FortiGateVpnTunnels, Get-FortiGateVpnUsers, Get-FortiGateConnectedDevices, Get-FortiGateSecurityEvents
