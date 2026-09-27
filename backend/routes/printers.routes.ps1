<#
    Printer routes.
    GET    /api/printers            list configured printers with live-polled status
    POST   /api/printers             { ip, name?, port?, manufacturer?, model?, department?, location? }
    DELETE /api/printers/:ip        removes a UI-added printer (does not touch config/printers.psd1)
#>
function Register-PrinterRoutes {
    Add-PodeRoute -Method Get -Path '/api/printers' -ScriptBlock {
        Write-PodeJsonResponse -Value (Get-Printers)
    }

    Add-PodeRoute -Method Post -Path '/api/printers' -ScriptBlock {
        $b = $WebEvent.Data
        if([string]::IsNullOrWhiteSpace($b.ip)){
            Write-PodeJsonResponse -StatusCode 400 -Value @{ success = $false; error = 'ip is required' }
            return
        }
        $printer = @{
            name = $(if([string]::IsNullOrWhiteSpace($b.name)){ $b.ip } else { $b.name })
            ip = $b.ip
            port = $(if($b.port){ [int]$b.port } else { 161 })
            manufacturer = $b.manufacturer
            model = $b.model
            department = $b.department
            location = $b.location
        }
        try{
            Add-ConfiguredPrinter -Printer $printer
            Write-PodeJsonResponse -Value @{ success = $true }
        } catch {
            Write-PodeJsonResponse -StatusCode 400 -Value @{ success = $false; error = $_.Exception.Message }
        }
    }

    Add-PodeRoute -Method Delete -Path '/api/printers/:ip' -ScriptBlock {
        Remove-ConfiguredPrinter -Ip $WebEvent.Parameters['ip']
        Write-PodeJsonResponse -Value @{ success = $true }
    }
}
