<#
    Pester tests for Toner.Service.psm1's business logic (stock math,
    validation, atomic apply), with Invoke-Db mocked so these run without a
    live SQL Server Express instance. Run with:  Invoke-Pester ./tests
#>
BeforeAll {
    Import-Module "$PSScriptRoot/../modules/Database.psm1" -Force
    Import-Module "$PSScriptRoot/../modules/Toner.Service.psm1" -Force
}

Describe 'New-TonerTransactionPreview' {

    It 'computes a negative delta and resulting stock for an Issue' {
        Mock -ModuleName Toner.Service Invoke-Db {
            @{ Id = 't1'; Manufacturer = 'HP'; Model = 'CF287A (87A)'; Qty = 6 }
        }
        $result = New-TonerTransactionPreview -Type Issue -ItemId 't1' -Qty 1 -Printer 'PRN-FIN-01' -Department 'Finance' -IssuedTo 'Test User' -LoggedBy 'it.support@contoso.com'

        $result.valid | Should -BeTrue
        $result.proposed.delta | Should -Be -1
        $result.proposed.resultingStock | Should -Be 5
        $result.proposed.model | Should -Be 'HP CF287A (87A)'
    }

    It 'rejects an Issue that would drive stock negative' {
        Mock -ModuleName Toner.Service Invoke-Db {
            @{ Id = 't4'; Manufacturer = 'HP'; Model = 'CF287X (High Yield)'; Qty = 0 }
        }
        $result = New-TonerTransactionPreview -Type Issue -ItemId 't4' -Qty 1 -LoggedBy 'it.support@contoso.com'

        $result.valid | Should -BeFalse
        $result.error | Should -Match 'only 0 in stock'
    }

    It 'computes a positive delta for Receive' {
        Mock -ModuleName Toner.Service Invoke-Db {
            @{ Id = 't2'; Manufacturer = 'Canon'; Model = 'C-EXV51 Toner'; Qty = 2 }
        }
        $result = New-TonerTransactionPreview -Type Receive -ItemId 't2' -Qty 10 -LoggedBy 'it.support@contoso.com'

        $result.valid | Should -BeTrue
        $result.proposed.delta | Should -Be 10
        $result.proposed.resultingStock | Should -Be 12
    }

    It 'honors the Adjustment direction (decrease)' {
        Mock -ModuleName Toner.Service Invoke-Db {
            @{ Id = 't3'; Manufacturer = 'Brother'; Model = 'TN-3480'; Qty = 5 }
        }
        $result = New-TonerTransactionPreview -Type Adjustment -Direction '-' -ItemId 't3' -Qty 2 -LoggedBy 'it.support@contoso.com'

        $result.valid | Should -BeTrue
        $result.proposed.delta | Should -Be -2
        $result.proposed.type | Should -Be 'Adjustment (-)'
    }

    It 'returns invalid for an unknown item' {
        Mock -ModuleName Toner.Service Invoke-Db { $null }
        $result = New-TonerTransactionPreview -Type Issue -ItemId 'does-not-exist' -Qty 1 -LoggedBy 'it.support@contoso.com'

        $result.valid | Should -BeFalse
        $result.error | Should -Be 'Unknown toner item.'
    }
}

Describe 'Get-TonerStockState' {
    It 'reports out when qty is zero' {
        Get-TonerStockState -Item @{ Qty = 0; Min = 2 } | Should -Be 'out'
    }
    It 'reports low when qty is below min but above zero' {
        Get-TonerStockState -Item @{ Qty = 1; Min = 2 } | Should -Be 'low'
    }
    It 'reports ok when qty meets or exceeds min' {
        Get-TonerStockState -Item @{ Qty = 4; Min = 4 } | Should -Be 'ok'
    }
}
