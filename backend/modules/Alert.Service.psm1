<#
    Alerts service - unlike the frontend prototype (which used a fixed demo
    alert list), this backend computes alerts for real from whatever the
    other services actually report. If a dependency (AD/FortiGate/Printers)
    is unavailable, that category is simply skipped rather than faked.
#>
Import-Module "$PSScriptRoot/Database.psm1"
Import-Module "$PSScriptRoot/ActiveDirectory.Service.psm1"
Import-Module "$PSScriptRoot/FortiGate.Service.psm1"
Import-Module "$PSScriptRoot/Printer.Service.psm1"
Import-Module "$PSScriptRoot/Toner.Service.psm1"

$script:AlertLinks = @{
    'AD Account Locked'    = @{ impact='The affected user cannot authenticate until the account is unlocked.'; kb='KB-AD-001'; checks=@('Confirm the lockout with Get-ADUser -Properties LockedOut','Check Event ID 4740 on the domain controller for the source of the bad password attempts','Verify the user is not using a cached credential on another device','Unlock the account and ask the user to re-authenticate') }
    'Printer Offline'      = @{ impact='Users at the affected location cannot print until connectivity is restored.'; kb='KB-PRN-001'; checks=@('Ping the printer IP address','Check the printer power and network status at the device','Confirm the switch port or access point serving the printer is up') }
    'Toner Critical'       = @{ impact='The printer will stop producing legible output and may pause the print queue.'; kb='KB-PRN-002'; checks=@('Confirm the reported toner percentage on the device panel','Check Toner Inventory for the matching consumable and current stock','Replace the toner cartridge and log the Issue transaction') }
    'WAN Down'             = @{ impact='Internet-dependent services (cloud apps, email, remote VPN) may be degraded or unavailable.'; kb='KB-FTG-002'; checks=@('Check physical link and ISP modem/ONT status','Confirm the interface status in the FortiGate dashboard','Test failover to the secondary WAN link') }
    'FortiGate High CPU'   = @{ impact='Firewall throughput and VPN performance may degrade, risking dropped sessions.'; kb='KB-FTG-001'; checks=@('Identify top CPU-consuming processes/proxies on the FortiGate','Check for an active IPS/AV scan spike or DoS pattern','Review concurrent session count against the device baseline') }
    'VPN Down'             = @{ impact='Remote connectivity for the affected branch or remote users may be unavailable.'; kb='KB-FTG-010'; checks=@('Check Phase 1 (IKE) status','Check Phase 2 (IPsec SA) status','Confirm peer/remote gateway reachability') }
    'Inactive Computer'    = @{ impact='The device may be stale, powered off permanently, or missing security patches.'; kb='KB-AD-005'; checks=@('Confirm the device is not simply powered off long-term','Check whether the assigned user still requires the device','Disable or decommission the computer object if confirmed retired') }
    'Password Expiring'    = @{ impact='Users will be locked out of domain and email/VPN access once the password expires.'; kb='KB-AD-002'; checks=@('Identify all accounts with passwords expiring within 7 days','Notify affected users with reset instructions') }
}

function Get-AlertLink { param([string]$Type) $script:AlertLinks[$Type] }

function New-Alert {
    param([string]$Severity, [string]$Type, [string]$Message, $Time)
    @{ id = [guid]::NewGuid().ToString('n').Substring(0,10); severity = $Severity; type = $Type; message = $Message; time = $Time; kb = $script:AlertLinks[$Type].kb }
}

function Get-Alerts {
    $alerts = [System.Collections.Generic.List[hashtable]]::new()
    $now = (Get-Date).ToString('yyyy-MM-dd HH:mm')

    $insights = Get-AdInsights
    if($insights){
        foreach($u in $insights.locked){
            $alerts.Add((New-Alert -Severity 'critical' -Type 'AD Account Locked' -Message "$($u.username) ($($u.displayName)) account is locked" -Time $now))
        }
        if($insights.expiring7.Count -gt 0){
            $alerts.Add((New-Alert -Severity 'warning' -Type 'Password Expiring' -Message "$($insights.expiring7.Count) account(s) have passwords expiring within 7 days" -Time $now))
        }
        foreach($c in $insights.inactiveComputers30){
            $alerts.Add((New-Alert -Severity 'warning' -Type 'Inactive Computer' -Message "$($c.computerName) has not checked in since $($c.lastSeen)" -Time $now))
        }
    }

    $fgtInterfaces = Get-FortiGateInterfaces
    if($fgtInterfaces.available){
        foreach($i in ($fgtInterfaces.data | Where-Object { $_.status -eq 'down' -and $_.role -like '*WAN*' })){
            $alerts.Add((New-Alert -Severity 'critical' -Type 'WAN Down' -Message "$($i.name) interface has been down" -Time $now))
        }
    }
    $fgtTunnels = Get-FortiGateVpnTunnels
    if($fgtTunnels.available){
        foreach($t in ($fgtTunnels.data | Where-Object { $_.status -eq 'down' })){
            $alerts.Add((New-Alert -Severity 'critical' -Type 'VPN Down' -Message "IPsec tunnel $($t.name) is down" -Time $now))
        }
    }
    $fgtDevice = Get-FortiGateDevice
    if($fgtDevice.available -and $fgtDevice.data.cpu -gt 80){
        $alerts.Add((New-Alert -Severity 'warning' -Type 'FortiGate High CPU' -Message "$($fgtDevice.data.hostname) CPU utilization at $($fgtDevice.data.cpu)%" -Time $now))
    }

    $printers = Get-Printers
    if($printers.available){
        foreach($p in ($printers.data | Where-Object { -not $_.online })){
            $alerts.Add((New-Alert -Severity 'critical' -Type 'Printer Offline' -Message "$($p.name) ($($p.department)) has been offline since $($p.lastSeen)" -Time $now))
        }
    }

    if(Test-DatabaseAvailable){
        foreach($t in (Get-TonerInventory)){
            if((Get-TonerStockState -Item $t) -ne 'ok'){
                $alerts.Add((New-Alert -Severity 'critical' -Type 'Toner Critical' -Message "$($t.Manufacturer) $($t.Model) is low/out of stock ($($t.Qty) remaining)" -Time $now))
            }
        }
    }

    ,$alerts.ToArray()
}

Export-ModuleMember -Function Get-Alerts, Get-AlertLink
