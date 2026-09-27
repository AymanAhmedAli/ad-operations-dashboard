<#
    Toner Inventory routes - the fully real, database-backed module.
    GET  /api/toner/inventory
    GET  /api/toner/transactions
    POST /api/toner/transactions/preview     { type, itemId, qty, printer, department, issuedTo, by, notes, direction }
    POST /api/toner/transactions/confirm     { ...the object returned by /preview... }
#>
function Register-TonerRoutes {
    Add-PodeRoute -Method Get -Path '/api/toner/inventory' -ScriptBlock {
        if(-not (Test-DatabaseAvailable)){
            Write-PodeJsonResponse -StatusCode 503 -Value @{ error = 'Database is not reachable from this server.' }
            return
        }
        Write-PodeJsonResponse -Value @(Get-TonerInventory)
    }
    Add-PodeRoute -Method Get -Path '/api/toner/transactions' -ScriptBlock {
        if(-not (Test-DatabaseAvailable)){
            Write-PodeJsonResponse -StatusCode 503 -Value @{ error = 'Database is not reachable from this server.' }
            return
        }
        Write-PodeJsonResponse -Value @(Get-TonerTransactions)
    }
    Add-PodeRoute -Method Post -Path '/api/toner/transactions/preview' -ScriptBlock {
        if(-not (Test-DatabaseAvailable)){
            Write-PodeJsonResponse -StatusCode 503 -Value @{ error = 'Database is not reachable from this server.' }
            return
        }
        $b = $WebEvent.Data
        $result = New-TonerTransactionPreview -Type $b.type -ItemId $b.itemId -Qty ([int]$b.qty) `
            -Printer $b.printer -Department $b.department -IssuedTo $b.issuedTo -LoggedBy $b.by -Notes $b.notes `
            -Direction $(if($b.direction){ $b.direction } else { '+' })
        Write-PodeJsonResponse -Value $result
    }
    Add-PodeRoute -Method Post -Path '/api/toner/transactions/confirm' -ScriptBlock {
        if(-not (Test-DatabaseAvailable)){
            Write-PodeJsonResponse -StatusCode 503 -Value @{ error = 'Database is not reachable from this server.' }
            return
        }
        try{
            $confirmed = Confirm-TonerTransaction -Proposed $WebEvent.Data
            Write-PodeJsonResponse -Value @{ success = $true; transaction = $confirmed }
        } catch {
            Write-PodeJsonResponse -StatusCode 409 -Value @{ success = $false; error = $_.Exception.Message }
        }
    }
}
