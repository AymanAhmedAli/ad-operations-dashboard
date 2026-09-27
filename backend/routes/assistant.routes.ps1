<#
    IT Support Assistant routes.
    POST /api/assistant/diagnose   { text }
#>
function Register-AssistantRoutes {
    Add-PodeRoute -Method Post -Path '/api/assistant/diagnose' -ScriptBlock {
        $text = $WebEvent.Data.text
        if([string]::IsNullOrWhiteSpace($text)){
            Write-PodeJsonResponse -StatusCode 400 -Value @{ error = 'Missing "text" in request body.' }
            return
        }
        Write-PodeJsonResponse -Value (Invoke-AssistantDiagnose -Text $text)
    }
}
