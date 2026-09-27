<#
    Report Center routes.
    GET  /api/reports/types
    POST /api/reports/generate              { typeId, filters }
    POST /api/reports/management-summary
#>
function Register-ReportRoutes {
    Add-PodeRoute -Method Get -Path '/api/reports/types' -ScriptBlock {
        Write-PodeJsonResponse -Value @(Get-ReportTypes)
    }
    Add-PodeRoute -Method Post -Path '/api/reports/generate' -ScriptBlock {
        $b = $WebEvent.Data
        if([string]::IsNullOrWhiteSpace($b.typeId)){
            Write-PodeJsonResponse -StatusCode 400 -Value @{ error = 'Missing "typeId" in request body.' }
            return
        }
        $filters = if($b.filters){ $b.filters } else { @{} }
        Write-PodeJsonResponse -Value (New-Report -TypeId $b.typeId -Filters $filters)
    }
    Add-PodeRoute -Method Post -Path '/api/reports/management-summary' -ScriptBlock {
        Write-PodeJsonResponse -Value (New-ManagementSummary)
    }
}
