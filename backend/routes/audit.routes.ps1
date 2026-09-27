<#
    Audit Log routes.
    GET /api/audit/logs              — get all logs
    GET /api/audit/logs?user=x       — filter by user
    GET /api/audit/logs?action=x     — filter by action
#>

function Register-AuditRoutes {
    Add-PodeRoute -Method Get -Path '/api/audit/logs' -ScriptBlock {
        $username = $WebEvent.Query['user']
        $action   = $WebEvent.Query['action']
        $limit    = $WebEvent.Query['limit']
        if(-not $limit){ $limit = 100 }

        $logs = Get-AuditLog -Limit ([int]$limit) -Username ($username ?? '') -Action ($action ?? '')
        Write-PodeJsonResponse -Value @{ available = $true; data = $logs }
    }
}
