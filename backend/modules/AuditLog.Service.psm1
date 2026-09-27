<#
    Audit Log Service — CSV-based action tracker.
    Records every user action: login, logout, page views, and data changes.
    No external dependencies required.
#>

Import-Module "$PSScriptRoot/SharedState.psm1"

function Initialize-AuditLog {
    param([string]$LogPath = "C:\IT-Operations-Hub\audit.csv")
    Set-SharedConfig -Name 'AuditLog.Path' -Value $LogPath

    # Create CSV file with headers if not exists
    if(-not (Test-Path $LogPath)){
        "id,username,action,details,ip,timestamp" | Out-File -FilePath $LogPath -Encoding UTF8
    }
}

function Add-AuditLog {
    param(
        [Parameter(Mandatory)][string]$Username,
        [Parameter(Mandatory)][string]$Action,
        [string]$Details = '',
        [string]$Ip = ''
    )
    $logPath = Get-SharedConfig -Name 'AuditLog.Path'
    if(-not $logPath){ return }

    try {
        # Use a mutex to prevent race conditions when multiple requests
        # write to the CSV at nearly the same time (this caused duplicate
        # IDs before — line count is not safe under concurrent writes).
        $mutex = New-Object System.Threading.Mutex($false, 'ITOpsHub_AuditLog_Mutex')
        $mutex.WaitOne() | Out-Null
        try {
            # ID = current max ID in file + 1 (safe under the mutex lock)
            $existing = Import-Csv -Path $logPath -ErrorAction SilentlyContinue
            $nextId = if($existing){ ([int]($existing | Measure-Object -Property id -Maximum).Maximum) + 1 } else { 1 }

            $Details = $Details -replace '"', '""'
            $timestamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')

            "$nextId,$Username,$Action,`"$Details`",$Ip,$timestamp" |
                Out-File -FilePath $logPath -Append -Encoding UTF8
        } finally {
            $mutex.ReleaseMutex() | Out-Null
        }
    } catch {
        Write-Verbose "AuditLog error: $($_.Exception.Message)"
    }
}

function Get-AuditLog {
    param(
        [int]$Limit = 100,
        [string]$Username = '',
        [string]$Action = ''
    )
    $logPath = Get-SharedConfig -Name 'AuditLog.Path'
    if(-not $logPath -or -not (Test-Path $logPath)){ return @() }

    try {
        $rows = Import-Csv -Path $logPath

        # Filter by username if provided
        if($Username){ $rows = $rows | Where-Object { $_.username -eq $Username } }

        # Filter by action if provided
        if($Action){ $rows = $rows | Where-Object { $_.action -eq $Action } }

        # Return last N records (most recent first)
        $rows = $rows | Sort-Object timestamp -Descending | Select-Object -First $Limit

        return $rows
    } catch {
        Write-Verbose "AuditLog read error: $($_.Exception.Message)"
        return @()
    }
}

Export-ModuleMember -Function Initialize-AuditLog, Add-AuditLog, Get-AuditLog

