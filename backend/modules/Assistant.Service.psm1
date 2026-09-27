<#
    IT Support Assistant service - the same rule-based diagnostic engine as
    the frontend prototype (js/services/assistant.service.js), ported so a
    real backend deployment behaves identically. Falls back to a Knowledge
    Base search when no rule matches. Diagnostic suggestions only - never
    proposes a destructive action before a diagnostic/verification step.
#>
Import-Module "$PSScriptRoot/KnowledgeBase.Service.psm1"

$script:Rules = @(
    @{ pattern='(cannot|can''t|unable to).*(login|log in|sign in).*domain|domain.*(login|log in)';
       technology='Active Directory / Domain Authentication';
       possibleCauses=@('Account locked out','Account disabled','Password expired','Workstation cannot reach a domain controller','Incorrect DNS configuration');
       checks=@('Is the user account locked?','Is the account disabled?','Is the password expired?','Can the workstation communicate with a domain controller?','Is DNS pointing to the correct internal DNS server?');
       commands=@(@{cmd='Get-ADUser username -Properties LockedOut,Enabled,PasswordExpired'; verifies='Checks lockout, enabled and expiry state in one call'}, @{cmd='Test-NetConnection dc01.contoso.local -Port 389'; verifies='Confirms LDAP reachability to a domain controller'});
       kb=@('KB-AD-001','KB-AD-004') },
    @{ pattern='locked|lockout';
       technology='Active Directory — Account Lockout';
       possibleCauses=@('Repeated bad password attempts (often a cached credential on a phone or mapped drive)','Manual/security-triggered lockout');
       checks=@('Confirm the account is actually locked','Identify the source device generating bad attempts (Event ID 4740)','Unlock the account');
       commands=@(@{cmd='Get-ADUser username -Properties LockedOut'; verifies='Confirms lockout state'}, @{cmd='Unlock-ADAccount -Identity username'; verifies='Clears the lockout'});
       kb=@('KB-AD-001') },
    @{ pattern='disabled account|account.*disabled|enable.*account';
       technology='Active Directory — Disabled Account';
       possibleCauses=@('Account disabled during offboarding','Account disabled by policy or security action');
       checks=@('Confirm with HR/manager that reinstatement is authorized','Enable the account','Confirm password status');
       commands=@(@{cmd='Get-ADUser username -Properties Enabled'; verifies='Confirms current state'}, @{cmd='Enable-ADAccount -Identity username'; verifies='Enables the account'});
       kb=@('KB-AD-003') },
    @{ pattern='password.*(expir)';
       technology='Active Directory — Password Expiry';
       possibleCauses=@('Password aged past the maximum policy age','User unaware of upcoming expiry');
       checks=@('Confirm current password expiry date','Reset or have the user change the password');
       commands=@(@{cmd='Get-ADUser username -Properties PasswordExpired,PasswordLastSet'; verifies='Confirms expiry status'});
       kb=@('KB-AD-002','KB-POL-001') },
    @{ pattern='vpn';
       technology='FortiGate — VPN';
       possibleCauses=@('SSL VPN authentication failure','IPsec Phase 1/2 mismatch','WAN interface down at one end');
       checks=@('Is this a remote user (SSL VPN) or site-to-site (IPsec) tunnel?','Check Phase 1 / Phase 2 or SSL VPN session status','Confirm peer/WAN reachability');
       commands=@(@{cmd='get vpn ssl monitor'; verifies='Lists connected SSL VPN sessions'}, @{cmd='diagnose vpn tunnel list'; verifies='Shows IPsec tunnel/SA status'});
       kb=@('KB-FTG-003','KB-FTG-010') },
    @{ pattern='wan down|no internet|internet.*down';
       technology='FortiGate — WAN Connectivity';
       possibleCauses=@('ISP outage','Modem/ONT failure','Interface misconfiguration');
       checks=@('Check the physical link on the FortiGate port and ISP modem','Confirm interface status on the FortiGate');
       commands=@(@{cmd='get system interface physical'; verifies='Shows link state per interface'});
       kb=@('KB-FTG-002') },
    @{ pattern='high cpu|fortigate.*slow|firewall.*slow';
       technology='FortiGate — Performance';
       possibleCauses=@('AV/IPS scan spike','Session count near capacity','Possible DoS pattern');
       checks=@('Identify top CPU-consuming process','Check session count vs. baseline');
       commands=@(@{cmd='get system performance status'; verifies='Shows CPU/memory snapshot'});
       kb=@('KB-FTG-001') },
    @{ pattern='printer.*(offline|not responding)|offline.*printer';
       technology='Printers — Offline';
       possibleCauses=@('Network/cable/Wi-Fi issue at the device','Switch port or AP down','IP address changed');
       checks=@('Ping the printer IP','Check the device panel network status');
       commands=@(@{cmd='ping <printer-ip>'; verifies='Confirms the printer responds on the network'});
       kb=@('KB-PRN-001') },
    @{ pattern='toner';
       technology='Printers — Toner';
       possibleCauses=@('Consumable naturally depleted','Faulty toner sensor');
       checks=@('Confirm the toner level on the device panel','Check Toner Inventory for stock and compatible model');
       commands=@();
       kb=@('KB-PRN-002') },
    @{ pattern='dhcp|no ip address|apipa|169\.254';
       technology='Networking — DHCP';
       possibleCauses=@('Exhausted DHCP scope','Rogue DHCP server','Faulty cable/port/Wi-Fi');
       checks=@('Confirm physical/Wi-Fi link is active','Release and renew the IP','Check DHCP scope utilization');
       commands=@(@{cmd='ipconfig /release'; verifies='Releases the invalid lease'}, @{cmd='ipconfig /renew'; verifies='Requests a new lease'});
       kb=@('KB-NET-001') },
    @{ pattern='inactive computer|stale (device|computer)|computer.*inactive';
       technology='Active Directory — Inactive Computer';
       possibleCauses=@('Device retired without AD cleanup','Device on long-term leave/storage');
       checks=@('Confirm the device isn''t a known spare/seasonal machine','Confirm with the assigned department');
       commands=@(@{cmd='Get-ADComputer -Filter * -Properties LastLogonTimestamp'; verifies='Lists computers and their last contact time'});
       kb=@('KB-AD-005') },
    @{ pattern='slow|freeze|not responding|hang';
       technology='Windows Workstation — Performance';
       possibleCauses=@('Resource-heavy process','Low disk space','Pending updates','Malware');
       checks=@('Check Task Manager for a runaway process','Check free disk space');
       commands=@(@{cmd='Get-Process | Sort-Object CPU -Descending | Select-Object -First 10'; verifies='Identifies top CPU consumers'});
       kb=@('KB-WIN-001','KB-TRB-001') },
    @{ pattern='outlook|mail|365|office 365|can''?t sign in';
       technology='Microsoft 365 — Sign-in / Mail';
       possibleCauses=@('Account issue in source directory','Service health incident','MFA misconfiguration');
       checks=@('Confirm the account is enabled and unlocked','Check Microsoft 365 service health');
       commands=@();
       kb=@('KB-M365-001') },
    @{ pattern='phishing|suspicious email|spam';
       technology='Security — Phishing';
       possibleCauses=@('Targeted or bulk phishing campaign');
       checks=@('Do not click links or open attachments','Confirm sender/headers','Block sender and purge if confirmed malicious');
       commands=@();
       kb=@('KB-SEC-001') }
)

function Invoke-AssistantDiagnose {
    param([Parameter(Mandatory)][string]$Text)
    $s = $Text.ToLower()
    $rule = $script:Rules | Where-Object { $s -match $_.pattern } | Select-Object -First 1
    if($rule){
        return @{ technology = $rule.technology; possibleCauses = $rule.possibleCauses; checks = $rule.checks; commands = $rule.commands; knowledgeBaseArticles = $rule.kb }
    }
    $matches = Search-KbArticles -Query $Text
    if($matches.Count -gt 0){
        return @{
            technology = 'General IT Issue'
            possibleCauses = @('See matched Knowledge Base article(s) below for likely causes.')
            checks = $matches[0].procedure
            commands = $matches[0].commands
            knowledgeBaseArticles = @($matches | ForEach-Object { $_.code })
        }
    }
    @{
        technology = 'Unrecognized'
        possibleCauses = @('No data is currently available for this item.')
        checks = @('Ask a more specific question, e.g. naming the device, error message, or affected system.')
        commands = @()
        knowledgeBaseArticles = @()
    }
}

Export-ModuleMember -Function Invoke-AssistantDiagnose
