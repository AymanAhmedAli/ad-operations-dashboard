<#
    Report service - aggregates the other services, mirroring the frontend's
    report.service.js report type list and filter behavior exactly.
#>
Import-Module "$PSScriptRoot/Database.psm1"
Import-Module "$PSScriptRoot/ActiveDirectory.Service.psm1"
Import-Module "$PSScriptRoot/FortiGate.Service.psm1"
Import-Module "$PSScriptRoot/Printer.Service.psm1"
Import-Module "$PSScriptRoot/Toner.Service.psm1"
Import-Module "$PSScriptRoot/Alert.Service.psm1"

$script:ReportTypes = @(
    @{ id='ad_users'; label='Active Directory Users' }, @{ id='ad_locked'; label='Locked Accounts' },
    @{ id='ad_disabled'; label='Disabled Accounts' }, @{ id='ad_pwdexp'; label='Password Expiration' },
    @{ id='ad_inactiveusers'; label='Inactive Users' }, @{ id='ad_computers'; label='Computer Inventory' },
    @{ id='ad_inactivecomputers'; label='Inactive Computers' }, @{ id='fgt_overview'; label='FortiGate Overview' },
    @{ id='fgt_interfaces'; label='FortiGate Interfaces' }, @{ id='fgt_devices'; label='FortiGate Connected Devices' },
    @{ id='fgt_vpnusers'; label='VPN Users' }, @{ id='fgt_events'; label='FortiGate Security Events' },
    @{ id='prn_inventory'; label='Printer Inventory' }, @{ id='prn_offline'; label='Offline Printers' },
    @{ id='prn_toner'; label='Toner Levels' }, @{ id='prn_pagecounts'; label='Printer Page Counts' },
    @{ id='toner_current'; label='Current Toner Inventory' }, @{ id='toner_low'; label='Low Toner Stock' },
    @{ id='toner_txns'; label='Toner Transactions' }, @{ id='toner_bydept'; label='Toner Consumption by Department' },
    @{ id='toner_byprinter'; label='Toner Consumption by Printer' }
)

function Get-ReportTypes { $script:ReportTypes }

function Get-DatasetForReport {
    param([string]$TypeId)
    switch($TypeId){
        'ad_users'             { (Get-AdUsers) }
        'ad_computers'         { (Get-AdComputers) }
        'ad_locked'            { $i = Get-AdInsights; if($i){ @{available=$true; data=$i.locked} } else { @{available=$false; data=$null} } }
        'ad_disabled'          { $i = Get-AdInsights; if($i){ @{available=$true; data=$i.disabled} } else { @{available=$false; data=$null} } }
        'ad_pwdexp'            { $i = Get-AdInsights; if($i){ @{available=$true; data=$i.expiring7} } else { @{available=$false; data=$null} } }
        'ad_inactiveusers'     { $i = Get-AdInsights; if($i){ @{available=$true; data=$i.inactiveUsers30} } else { @{available=$false; data=$null} } }
        'ad_inactivecomputers' { $i = Get-AdInsights; if($i){ @{available=$true; data=$i.inactiveComputers30} } else { @{available=$false; data=$null} } }
        'fgt_overview'         { $r = Get-FortiGateDevice; @{available=$r.available; data=$(if($r.data){,@($r.data)})} }
        'fgt_interfaces'       { (Get-FortiGateInterfaces) }
        'fgt_devices'          { (Get-FortiGateConnectedDevices) }
        'fgt_vpnusers'         { (Get-FortiGateVpnUsers) }
        'fgt_events'           { (Get-FortiGateSecurityEvents) }
        'prn_inventory'        { (Get-Printers) }
        'prn_offline'          { $r = Get-Printers; @{available=$r.available; data=$(if($r.data){,@($r.data | Where-Object { -not $_.online })})} }
        'prn_toner'            { (Get-Printers) }
        'prn_pagecounts'       { $r = Get-Printers; @{available=$r.available; data=$(if($r.data){,@($r.data | Sort-Object -Property pageCount -Descending)})} }
        'toner_current'        { if(Test-DatabaseAvailable){ @{ available = $true; data = @(Get-TonerInventory) } } else { @{ available = $false; data = $null } } }
        'toner_low'            { if(Test-DatabaseAvailable){ @{ available = $true; data = @(Get-TonerInventory | Where-Object { (Get-TonerStockState -Item $_) -ne 'ok' }) } } else { @{ available = $false; data = $null } } }
        'toner_txns'           { if(Test-DatabaseAvailable){ @{ available = $true; data = @(Get-TonerTransactions) } } else { @{ available = $false; data = $null } } }
        'toner_bydept'         { if(Test-DatabaseAvailable){ @{ available = $true; data = @(Get-TonerTransactions | Where-Object { $_.Type -eq 'Issue' } | Group-Object Department | ForEach-Object { @{ department = $_.Name; unitsIssued = ($_.Group | Measure-Object Qty -Sum).Sum } }) } } else { @{ available = $false; data = $null } } }
        'toner_byprinter'      { if(Test-DatabaseAvailable){ @{ available = $true; data = @(Get-TonerTransactions | Where-Object { $_.Type -eq 'Issue' } | Group-Object Printer | ForEach-Object { @{ printer = $_.Name; unitsIssued = ($_.Group | Measure-Object Qty -Sum).Sum } }) } } else { @{ available = $false; data = $null } } }
        default                { @{ available = $true; data = @() } }
    }
}

function Invoke-ReportFilters {
    param([array]$Rows, [hashtable]$Filters)
    $out = $Rows
    if($Filters.department){ $out = $out | Where-Object { $_.department -eq $Filters.department } }
    if($Filters.location){ $out = $out | Where-Object { $_.location -and $_.location -like "*$($Filters.location)*" } }
    ,@($out)
}

function New-Report {
    param([Parameter(Mandatory)][string]$TypeId, [hashtable]$Filters = @{})
    $meta = $script:ReportTypes | Where-Object { $_.id -eq $TypeId } | Select-Object -First 1
    $dataset = Get-DatasetForReport -TypeId $TypeId
    $rows = @( if($dataset.available){ Invoke-ReportFilters -Rows @($dataset.data) -Filters $Filters } )
    $missing = @()
    if(-not $dataset.available){ $missing += "$($meta.label) data source is not available." }
    @{
        meta        = $meta
        rows        = $rows
        filters     = $Filters
        missing     = $missing
        generatedAt = (Get-Date).ToUniversalTime().ToString('o')
    }
}

<#
    Management Summary - concise roll-up computed from whatever is actually
    reachable right now; unavailable domains are noted, not silently
    excluded or replaced with fabricated numbers.
#>
function New-ManagementSummary {
    $insights = Get-AdInsights
    $fgtDevice = Get-FortiGateDevice
    $fgtInterfaces = Get-FortiGateInterfaces
    $fgtTunnels = Get-FortiGateVpnTunnels
    $printers = Get-Printers
    $dbAvailable = Test-DatabaseAvailable
    $tonerItems = if($dbAvailable){ @(Get-TonerInventory) } else { @() }

    $unavailable = @()
    if(-not $insights){ $unavailable += 'Active Directory' }
    if(-not $fgtDevice.available){ $unavailable += 'FortiGate' }
    if(-not $printers.available){ $unavailable += 'Printers' }
    if(-not $dbAvailable){ $unavailable += 'Toner Inventory' }

    $lowToner = @($tonerItems | Where-Object { (Get-TonerStockState -Item $_) -ne 'ok' })
    $stockValue = ($tonerItems | ForEach-Object { $_.Qty * $_.UnitCost } | Measure-Object -Sum).Sum

    $risks = [System.Collections.Generic.List[string]]::new()
    if($insights -and $insights.locked.Count -gt 0){ $risks.Add("$($insights.locked.Count) locked AD account(s) may be blocking staff from working.") }
    if($lowToner.Count -gt 0){ $risks.Add("$($lowToner.Count) toner item(s) are low or out of stock.") }
    foreach($domain in $unavailable){ $risks.Add("$domain data is not available from this server right now.") }

    @{
        generatedAt = (Get-Date).ToUniversalTime().ToString('o')
        unavailable = $unavailable
        risks       = $risks.ToArray()
        technical   = @{
            adLocked       = $(if($insights){ $insights.locked.Count } else { $null })
            adDisabled     = $(if($insights){ $insights.disabled.Count } else { $null })
            fortigateCpu   = $(if($fgtDevice.available){ $fgtDevice.data.cpu } else { $null })
            interfacesDown = $(if($fgtInterfaces.available){ @($fgtInterfaces.data | Where-Object { $_.status -eq 'down' }).Count } else { $null })
            tunnelsDown    = $(if($fgtTunnels.available){ @($fgtTunnels.data | Where-Object { $_.status -eq 'down' }).Count } else { $null })
            lowTonerItems  = $lowToner.Count
            stockValue     = $stockValue
        }
    }
}

Export-ModuleMember -Function Get-ReportTypes, New-Report, New-ManagementSummary
