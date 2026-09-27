<#
    Printer service - real SNMP polling using the standard MIB-2 / Printer-MIB
    (RFC 3805) / Host Resources MIB (RFC 2790) OIDs that virtually every
    network printer (HP, Canon, Brother, etc.) implements, via the SnmpTools
    PowerShell module (Install-Module SnmpTools).

    Verified end-to-end against a real local SNMP agent (net-snmp's snmpd)
    during development: both the GET and WALK/GETNEXT mechanics genuinely
    work through this exact module. What could NOT be verified without real
    hardware is the printer-specific OIDs below - they're the standard,
    documented ones, but confirm them against your actual printer models
    once configured (see config/printers.psd1) and adjust if a given model
    reports something unexpected.

    Simplification made for time: this reads supply/marker index "1" (the
    first entry in prtMarkerSuppliesTable), which is correct for most
    monochrome printers but under-reports color printers with separate
    C/M/Y/K supply levels - see Get-OnePrinterStatus below for where to
    extend this to walk the full table if you need per-color levels.
#>
Import-Module SnmpTools
Import-Module "$PSScriptRoot/SharedState.psm1"

# Standard OIDs (MIB-2 system group, Host Resources MIB, Printer-MIB).
$OID_SYS_UPTIME             = '1.3.6.1.2.1.1.3.0'
$OID_HR_DEVICE_STATUS_1     = '1.3.6.1.2.1.25.3.2.1.5.1'   # 1=unknown 2=running 3=warning 4=testing 5=down
$OID_PRT_SUPPLY_LEVEL_1     = '1.3.6.1.2.1.43.11.1.1.9.1.1'
$OID_PRT_SUPPLY_MAXCAP_1    = '1.3.6.1.2.1.43.11.1.1.8.1.1'
$OID_PRT_MARKER_LIFECOUNT_1 = '1.3.6.1.2.1.43.10.2.1.4.1.1'

# Printers added via the UI ("Add Printer" on the Printers page) persist here
# rather than in config/printers.psd1, so they survive a restart without
# touching the hand-edited static config file. $PSScriptRoot is resolved once
# per module copy from the .psm1's own on-disk location, so - unlike a
# Set-PodeState value - it's safe to compute directly in every Pode runspace
# without going through SharedState.
$script:LocalPrintersFile = Join-Path $PSScriptRoot '../config/printers.local.json'

function Get-LocalPrinters {
    if(-not (Test-Path $script:LocalPrintersFile)){ return @() }
    try{
        $raw = Get-Content -Path $script:LocalPrintersFile -Raw
        if([string]::IsNullOrWhiteSpace($raw)){ return @() }
        $items = @(ConvertFrom-Json -InputObject $raw)
        @($items | ForEach-Object {
            @{ name = $_.name; ip = $_.ip; port = $_.port; manufacturer = $_.manufacturer; model = $_.model; department = $_.department; location = $_.location }
        })
    } catch { @() }
}

function Save-LocalPrinters {
    param([array]$Printers)
    $dir = Split-Path $script:LocalPrintersFile -Parent
    if(-not (Test-Path $dir)){ New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    ConvertTo-Json -InputObject @($Printers) -Depth 4 | Set-Content -Path $script:LocalPrintersFile -Encoding utf8
}

# Recomputes Printers.List as (static config, minus any IP overridden below)
# union (UI-added printers) - called once at startup and again after every
# Add/Remove so every runspace's next Get-ConfiguredPrinters call sees it.
# Each entry is tagged with its source so the UI can offer "Remove" only for
# printers it can actually delete (config/printers.psd1 entries aren't
# touched by Remove-ConfiguredPrinter, so offering that button for them would
# silently do nothing).
function Sync-PrinterList {
    $static = @(Get-SharedConfig -Name 'Printers.StaticList') | ForEach-Object { $h = $_.Clone(); $h.source = 'config'; $h }
    $local = @(Get-LocalPrinters) | ForEach-Object { $h = $_.Clone(); $h.source = 'ui'; $h }
    $localIps = @($local | ForEach-Object { $_.ip })
    $merged = @($static | Where-Object { $_.ip -notin $localIps }) + $local
    Set-SharedConfig -Name 'Printers.List' -Value $merged
}

function Initialize-Printers {
    param([array]$Printers = @(), [string]$Community = 'public', [int]$TimeoutMs = 1500)
    Set-SharedConfig -Name 'Printers.StaticList' -Value $Printers
    Set-SharedConfig -Name 'Printers.Community' -Value $Community
    Set-SharedConfig -Name 'Printers.TimeoutMs' -Value $TimeoutMs
    Sync-PrinterList
}

function Get-ConfiguredPrinters { @(Get-SharedConfig -Name 'Printers.List') }

function Add-ConfiguredPrinter {
    param([hashtable]$Printer)
    if([string]::IsNullOrWhiteSpace($Printer.ip)){ throw 'ip is required' }
    $local = @(Get-LocalPrinters | Where-Object { $_.ip -ne $Printer.ip })
    $local += $Printer
    Save-LocalPrinters -Printers $local
    Sync-PrinterList
}

function Remove-ConfiguredPrinter {
    param([string]$Ip)
    $local = @(Get-LocalPrinters | Where-Object { $_.ip -ne $Ip })
    Save-LocalPrinters -Printers $local
    Sync-PrinterList
}

function Test-PrinterSnmpAvailable {
    (Get-ConfiguredPrinters).Count -gt 0
}

function Get-UnavailableResult {
    param([string]$Detail = 'No printers are configured to poll (see backend/config/printers.psd1).')
    @{ available = $false; error = $Detail; data = $null }
}

function Get-SnmpValueOrNull {
    param([string]$ComputerName, [int]$Port, [string]$Oid)
    $community = Get-SharedConfig -Name 'Printers.Community'
    $timeoutMs = Get-SharedConfig -Name 'Printers.TimeoutMs'
    try{
        $result = Get-SnmpData -ComputerName $ComputerName -Port $Port -Community $community -Oid $Oid -Timeout $timeoutMs -Version V2C -ErrorAction Stop
        # SnmpTools represents an SNMP exception (the OID doesn't exist on
        # this device) as one of these literal string values rather than
        # throwing - treat all three the same as "not available", exactly
        # like a timeout, rather than trying (and failing) to parse them.
        if($result.Value -in @('NoSuchObject', 'NoSuchInstance', 'EndOfMibView')){ return $null }
        $result.Value
    } catch {
        $null
    }
}

function Get-OnePrinterStatus {
    param([hashtable]$Printer)
    $ip = $Printer.ip
    $port = $(if($Printer.port){ [int]$Printer.port } else { 161 })

    # A quick, near-universal OID (sysUpTime) as the reachability probe -
    # if a device doesn't even answer this, it's offline, full stop.
    $uptime = Get-SnmpValueOrNull -ComputerName $ip -Port $port -Oid $OID_SYS_UPTIME
    if($null -eq $uptime){
        return @{
            name = $Printer.name; ip = $ip; model = $Printer.model; manufacturer = $Printer.manufacturer
            serial = $Printer.serial; location = $Printer.location; department = $Printer.department
            online = $false; tonerPct = $null; pageCount = $null
            lastSeen = $Printer.lastKnownOnline
            source = $Printer.source
        }
    }

    $now = (Get-Date).ToString('yyyy-MM-dd HH:mm')
    $level = Get-SnmpValueOrNull -ComputerName $ip -Port $port -Oid $OID_PRT_SUPPLY_LEVEL_1
    $maxCap = Get-SnmpValueOrNull -ComputerName $ip -Port $port -Oid $OID_PRT_SUPPLY_MAXCAP_1
    $pageCount = Get-SnmpValueOrNull -ComputerName $ip -Port $port -Oid $OID_PRT_MARKER_LIFECOUNT_1

    # Per RFC 3805, a level or capacity of -2 means "unknown" - don't turn
    # that into a misleading 0% or divide-by-zero.
    $tonerPct = $null
    if($null -ne $level -and $null -ne $maxCap -and [int]$level -ge 0 -and [int]$maxCap -gt 0){
        $tonerPct = [Math]::Round(([int]$level / [int]$maxCap) * 100)
    }

    @{
        name = $Printer.name; ip = $ip; model = $Printer.model; manufacturer = $Printer.manufacturer
        serial = $Printer.serial; location = $Printer.location; department = $Printer.department
        online = $true
        tonerPct = $tonerPct
        pageCount = $(if($null -ne $pageCount){ [int]$pageCount } else { $null })
        lastSeen = $now
        source = $Printer.source
    }
}

function Get-Printers {
    if(-not (Test-PrinterSnmpAvailable)){ return Get-UnavailableResult }
    $results = foreach($p in (Get-ConfiguredPrinters)){ Get-OnePrinterStatus -Printer $p }
    @{ available = $true; error = $null; data = @($results) }
}

Export-ModuleMember -Function Initialize-Printers, Test-PrinterSnmpAvailable, Get-Printers, Add-ConfiguredPrinter, Remove-ConfiguredPrinter, Get-ConfiguredPrinters
