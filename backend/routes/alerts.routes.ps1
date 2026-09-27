<#
    Alerts routes.
    GET /api/alerts
#>
function Register-AlertRoutes {
    Add-PodeRoute -Method Get -Path '/api/alerts' -ScriptBlock {
        Write-PodeJsonResponse -Value (Get-Alerts)
    }
}
