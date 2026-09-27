<#
    Thin data-access wrapper so every other module talks to the database
    through one place. Swapping SQL Server Express for another provider
    later only means changing this file.

    Uses Microsoft.Data.SqlClient directly (bundled with the SqlServer
    PowerShell module) rather than Invoke-Sqlcmd, because the installed
    Invoke-Sqlcmd has no real parameterized-query support (-SqlParameters
    doesn't exist on it) - only its -Variable option, which is plain text
    substitution and is NOT safe against SQL injection. Real ADO.NET
    parameters (@name placeholders bound through SqlParameter) are what
    actually keep query text and values separated.
#>
Import-Module SqlServer -ErrorAction SilentlyContinue   # brings in the Microsoft.Data.SqlClient assembly
Import-Module "$PSScriptRoot/SharedState.psm1"

function Initialize-Database {
    param([Parameter(Mandatory)][string]$ConnectionString)
    Set-SharedConfig -Name 'Database.ConnectionString' -Value $ConnectionString
}

function Test-DatabaseAvailable {
    if(-not (Get-SharedConfig -Name 'Database.ConnectionString')){ return $false }
    try{
        Invoke-Db -Query 'SELECT 1' | Out-Null
        return $true
    } catch {
        Write-Warning "Database not reachable: $($_.Exception.Message)"
        return $false
    }
}

# $params is a hashtable of name -> value, matching @name placeholders in
# $query. Returns an array of PSCustomObjects (one per result row) for
# SELECTs; an empty array for statements with no result set.
function Invoke-Db {
    param(
        [Parameter(Mandatory)][string]$Query,
        [hashtable]$Params = @{}
    )
    $connectionString = Get-SharedConfig -Name 'Database.ConnectionString'
    if(-not $connectionString){
        throw 'Database has not been initialized. Call Initialize-Database first.'
    }

    $connection = [Microsoft.Data.SqlClient.SqlConnection]::new($connectionString)
    try{
        $connection.Open()
        $command = $connection.CreateCommand()
        $command.CommandText = $Query
        foreach($key in $Params.Keys){
            $value = $Params[$key]
            $null = $command.Parameters.AddWithValue("@$key", $(if($null -eq $value){ [DBNull]::Value } else { $value }))
        }

        $reader = $command.ExecuteReader()
        try{
            $rows = [System.Collections.Generic.List[psobject]]::new()
            while($reader.Read()){
                $row = [ordered]@{}
                for($i = 0; $i -lt $reader.FieldCount; $i++){
                    $val = $reader.GetValue($i)
                    $row[$reader.GetName($i)] = $(if($val -is [DBNull]){ $null } else { $val })
                }
                $rows.Add([pscustomobject]$row)
            }
            ,$rows.ToArray()
        } finally {
            $reader.Close()
        }
    } finally {
        $connection.Close()
    }
}

Export-ModuleMember -Function Initialize-Database, Test-DatabaseAvailable, Invoke-Db
