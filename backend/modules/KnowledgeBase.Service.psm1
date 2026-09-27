<#
    Knowledge Base service - authored reference content (not sourced from
    live infrastructure), so it lives here as real, static data rather than
    behind an "unavailable" check. Mirrors the article set in the frontend's
    js/mock-data.js exactly, so both layers agree until this migrates to a
    proper content store.
#>

$script:Articles = @(
    @{ code='KB-AD-001'; title='Unlock Active Directory Account'; category='Active Directory'; tags=@('account locked','lockout','authentication','unlock');
       purpose='Restore sign-in access for a user whose account has been locked out by policy.';
       problem='User cannot authenticate because the account is locked.';
       symptoms=@('User reports "account is locked" or "too many attempts" at logon','Event ID 4740 logged on a domain controller');
       requirements=@('Help Desk or Account Operators AD permissions','Active Directory PowerShell module');
       procedure=@('Verify the user identity.','Check whether the account is locked.','Unlock the account.','Ask the user to authenticate again.','Verify successful login.');
       commands=@(@{cmd='Get-ADUser username -Properties LockedOut'; verifies='Confirms current lockout state before acting'}, @{cmd='Unlock-ADAccount -Identity username'; verifies='Clears the lockout flag'});
       verification='Get-ADUser username -Properties LockedOut'; expectedResult='LockedOut = False';
       rollback='Not applicable — unlocking is non-destructive.'; notes='If lockouts recur within minutes, check for a cached credential on a phone or mapped drive before unlocking again.' },

    @{ code='KB-AD-002'; title='Reset an Expired or Expiring Password'; category='Active Directory'; tags=@('password expiry','reset','expiring');
       purpose='Restore access for a user whose password has expired or is about to expire.';
       problem='User cannot log on because their password has expired, or will expire within days.';
       symptoms=@('Logon prompt shows "Your password has expired"','Password Expiry date is within 7 days in AD');
       requirements=@('Help Desk AD permissions');
       procedure=@('Confirm identity of the requesting user.','Check current PasswordLastSet and expiry policy.','Reset the password or ask the user to change it via Ctrl+Alt+Del.','Set "User must change password at next logon" if resetting on their behalf.','Confirm the new expiry date.');
       commands=@(@{cmd='Get-ADUser username -Properties PasswordExpired,PasswordLastSet'; verifies='Confirms expiry status'}, @{cmd='Set-ADAccountPassword -Identity username -Reset -NewPassword (Read-Host -AsSecureString)'; verifies='Applies a new password'}, @{cmd='Set-ADUser username -ChangePasswordAtLogon $true'; verifies='Forces the user to set their own password on next logon'});
       verification='Get-ADUser username -Properties PasswordLastSet'; expectedResult='PasswordLastSet reflects today''s date';
       rollback='None required.'; notes='Never communicate a temporary password over an unencrypted channel.' },

    @{ code='KB-AD-003'; title='Enable a Disabled Active Directory Account'; category='Active Directory'; tags=@('disabled account','enable','offboarding','reinstate');
       purpose='Reinstate access for a user whose account was disabled.';
       problem='User cannot authenticate because the account is disabled.';
       symptoms=@('Logon fails with no lockout message','Get-ADUser shows Enabled = False');
       requirements=@('Manager or HR confirmation that the account should be reinstated');
       procedure=@('Confirm with HR/manager that reinstatement is authorized.','Check the account is not disabled as part of an active offboarding.','Enable the account.','Confirm password status and reset if required.','Ask the user to log on.');
       commands=@(@{cmd='Get-ADUser username -Properties Enabled'; verifies='Confirms current state'}, @{cmd='Enable-ADAccount -Identity username'; verifies='Enables the account'});
       verification='Get-ADUser username -Properties Enabled'; expectedResult='Enabled = True';
       rollback='Disable-ADAccount -Identity username'; notes='Never re-enable an account disabled as part of a security incident without explicit sign-off.' },

    @{ code='KB-AD-004'; title='Domain Login Troubleshooting'; category='Active Directory'; tags=@('cannot login','domain login','authentication failure');
       purpose='Diagnose a general "cannot log in to domain" report.';
       problem='User cannot login to domain.';
       symptoms=@('Logon fails at the Windows lock screen','"The trust relationship" or generic authentication error');
       requirements=@('Network line of sight to a domain controller from the workstation');
       procedure=@('Is the user account locked?','Is the account disabled?','Is the password expired?','Can the workstation communicate with a domain controller?','Is DNS pointing to the correct internal DNS server?');
       commands=@(@{cmd='Get-ADUser username -Properties LockedOut,Enabled,PasswordExpired'; verifies='Checks lockout, enabled and expiry state in one call'}, @{cmd='Test-NetConnection dc01.contoso.local -Port 389'; verifies='Confirms LDAP reachability to a domain controller'}, @{cmd='nslookup contoso.local'; verifies='Confirms the workstation resolves the domain via internal DNS'});
       verification='Retry logon after remediating the failing check above'; expectedResult='User authenticates successfully';
       rollback='Not applicable.'; notes='Recommended KB pairing: KB-AD-001 and KB-AD-004.' },

    @{ code='KB-AD-005'; title='Identify and Clean Up Inactive Computer Accounts'; category='Active Directory'; tags=@('inactive computer','stale device','cleanup','offline');
       purpose='Identify workstations/servers that have not contacted a domain controller recently.';
       problem='A computer object has not authenticated to the domain in 30+ days.';
       symptoms=@('LastLogonTimestamp older than 30 days','Device does not appear on the network scan');
       requirements=@('Asset records to confirm the device owner/status');
       procedure=@('Query computers inactive beyond the threshold.','Cross-check against the asset register.','Contact the assigned user or department if unclear.','Disable the computer object if retirement is confirmed.','Remove from AD after a grace period.');
       commands=@(@{cmd='Get-ADComputer -Filter * -Properties LastLogonTimestamp | Where-Object { [DateTime]::FromFileTime($_.LastLogonTimestamp) -lt (Get-Date).AddDays(-30) }'; verifies='Lists computers inactive for 30+ days'}, @{cmd='Disable-ADAccount -Identity COMPUTERNAME$'; verifies='Disables a confirmed-retired computer object'});
       verification='Get-ADComputer COMPUTERNAME -Properties Enabled'; expectedResult='Enabled = False (once retirement confirmed)';
       rollback='Enable-ADAccount -Identity COMPUTERNAME$'; notes='Do not disable a device before confirming with the assigned department.' },

    @{ code='KB-FTG-001'; title='FortiGate High CPU Troubleshooting'; category='FortiGate'; tags=@('high cpu','performance','fortigate slow');
       purpose='Diagnose sustained high CPU utilization on a FortiGate appliance.';
       problem='FortiGate CPU utilization is high and impacting throughput.';
       symptoms=@('Dashboard shows sustained CPU above baseline','Users report slow browsing or VPN performance');
       requirements=@('FortiGate admin console or CLI access');
       procedure=@('Identify which daemon/proxy is consuming CPU.','Check for an active AV/IPS scan spike or DoS/flood pattern.','Review session count against the device''s rated capacity.','Check for recent policy, signature or firmware changes.','Consider disabling non-essential deep inspection temporarily if capacity-bound.');
       commands=@(@{cmd='get system performance status'; verifies='Shows current CPU/memory snapshot'}, @{cmd='diagnose sys top'; verifies='Shows per-process CPU consumption'});
       verification='get system performance status'; expectedResult='CPU utilization returns to baseline';
       rollback='Re-enable any inspection profile that was temporarily disabled once load normalizes.'; notes='Sustained high CPU with a session spike can indicate a DoS attempt.' },

    @{ code='KB-FTG-002'; title='FortiGate WAN Interface Down Troubleshooting'; category='FortiGate'; tags=@('wan down','internet down','no internet');
       purpose='Restore connectivity when a WAN interface reports down.';
       problem='A WAN interface on the FortiGate is down.';
       symptoms=@('Interface status shows down in the dashboard','Users report no internet access');
       requirements=@('Physical or remote access to the FortiGate and modem/ONT');
       procedure=@('Check the physical link light on the FortiGate port and ISP modem/ONT.','Confirm the interface status and IP assignment.','Restart the modem/ONT if the carrier link is down.','Fail over to the secondary WAN link if configured.','Contact the ISP with the circuit ID if the outage persists.');
       commands=@(@{cmd='get system interface physical'; verifies='Shows link state per physical interface'}, @{cmd='execute ping 8.8.8.8'; verifies='Confirms upstream reachability once link is restored'});
       verification='get system interface physical'; expectedResult='WAN interface shows link: up';
       rollback='Not applicable.'; notes='Always confirm secondary WAN failover engaged correctly.' },

    @{ code='KB-FTG-003'; title='SSL VPN Connectivity Troubleshooting'; category='FortiGate'; tags=@('vpn down','ssl vpn','remote access','vpn is down');
       purpose='Diagnose remote users unable to connect via SSL VPN.';
       problem='Remote users cannot establish an SSL VPN connection.';
       symptoms=@('FortiClient shows a connection or authentication error','SSL VPN portal is unreachable from outside the network');
       requirements=@('FortiGate admin access','Affected user''s FortiClient version');
       procedure=@('Confirm the SSL VPN service is enabled on the expected WAN interface/port.','Check the user''s account is enabled and not locked.','Review SSL VPN logs for the failed session.','Confirm the FortiClient version is supported.','Test from a known-good external network.');
       commands=@(@{cmd='get vpn ssl monitor'; verifies='Lists currently connected SSL VPN sessions'}, @{cmd='diagnose vpn ssl list'; verifies='Shows detailed state of active/attempted SSL VPN sessions'});
       verification='get vpn ssl monitor'; expectedResult='User session appears as connected';
       rollback='Not applicable.'; notes='Distinct from KB-FTG-010, which covers site-to-site IPsec tunnels.' },

    @{ code='KB-FTG-004'; title='VLAN and Switch Interface Troubleshooting'; category='Networking'; tags=@('vlan','switch port','no network','connectivity');
       purpose='Diagnose a device that cannot reach network resources on a specific VLAN.';
       problem='A device or group of devices on a VLAN has no or partial connectivity.';
       symptoms=@('Device shows "limited connectivity" or no IP','Devices on one VLAN cannot reach another VLAN they are permitted to reach');
       requirements=@('Access to the FortiGate interface/VLAN configuration and managed switch');
       procedure=@('Confirm the device''s switch port VLAN assignment.','Confirm the FortiGate VLAN interface is up.','Check inter-VLAN firewall policy allows the required traffic.','Check for a duplicate IP or exhausted DHCP scope.');
       commands=@(@{cmd='diagnose netlink interface list'; verifies='Lists VLAN interfaces and their state'});
       verification='Ping between a host on the VLAN and a known-good resource'; expectedResult='Successful reply with expected latency';
       rollback='Revert any policy change made during testing.'; notes='CCTV/IoT devices are commonly segmented onto a dedicated VLAN.' },

    @{ code='KB-FTG-010'; title='IPsec VPN Tunnel Troubleshooting'; category='FortiGate'; tags=@('ipsec','tunnel down','site to site vpn','vpn tunnel down');
       purpose='Restore a site-to-site IPsec VPN tunnel that has gone down.';
       problem='An IPsec VPN tunnel to a branch or DR site is down.';
       symptoms=@('Tunnel shows down in the VPN monitor','Branch site loses connectivity to HQ resources');
       requirements=@('FortiGate admin access at the local end');
       procedure=@('Check Phase 1 (IKE) status.','Check Phase 2 (IPsec SA) status.','Confirm peer reachability.','Confirm the local WAN interface used by the tunnel is up.','Review VPN logs for negotiation failures.');
       commands=@(@{cmd='diagnose vpn ike gateway list'; verifies='Shows Phase 1 status per tunnel'}, @{cmd='diagnose vpn tunnel list'; verifies='Shows Phase 2 SA status per tunnel'});
       verification='diagnose vpn tunnel list'; expectedResult='Tunnel status shows selectors and SA as established';
       rollback='Not applicable.'; notes='If Phase 1 fails immediately, suspect a PSK or proposal mismatch after a recent config change.' },

    @{ code='KB-NET-001'; title='Workstation Cannot Obtain a DHCP Address'; category='Networking'; tags=@('dhcp','no ip address','apipa','pc cannot get dhcp');
       purpose='Resolve a workstation that cannot obtain an IP address from DHCP.';
       problem='PC cannot get DHCP / shows an APIPA (169.254.x.x) address.';
       symptoms=@('ipconfig shows 169.254.x.x','No network access, "unidentified network" in Windows');
       requirements=@('Physical or remote access to the affected workstation');
       procedure=@('Confirm the network cable/Wi-Fi association is active.','Release and renew the IP address.','Confirm the switch port VLAN and DHCP scope has available leases.','Check for a rogue DHCP server on the segment.');
       commands=@(@{cmd='ipconfig /release'; verifies='Releases the current (invalid) lease'}, @{cmd='ipconfig /renew'; verifies='Requests a new lease from DHCP'}, @{cmd='ipconfig /all'; verifies='Confirms the new address, gateway and DNS servers assigned'});
       verification='ipconfig /all'; expectedResult='Workstation receives a valid address from the expected scope';
       rollback='Not applicable.'; notes='A scope showing 0 available leases is a common root cause.' },

    @{ code='KB-NET-002'; title='General Wired/Wireless Connectivity Troubleshooting'; category='Networking'; tags=@('no network','wifi down','ethernet','connectivity');
       purpose='Triage a general loss of network connectivity report.';
       problem='A user reports no network / internet access.';
       symptoms=@('Cannot reach internal or external resources','Intermittent drops');
       requirements=@();
       procedure=@('Confirm scope: one user, one floor, or site-wide.','Check physical link/Wi-Fi signal at the device.','Check DHCP address is valid (see KB-NET-001).','Check the relevant switch/AP/FortiGate interface status.','Escalate to KB-FTG-002 if site-wide.');
       commands=@(@{cmd='Test-NetConnection 8.8.8.8'; verifies='Confirms external reachability'});
       verification='Test-NetConnection 8.8.8.8'; expectedResult='PingSucceeded = True';
       rollback='Not applicable.'; notes='' },

    @{ code='KB-PRN-001'; title='Printer Showing Offline'; category='Printers'; tags=@('printer offline','cannot print','printer not responding');
       purpose='Restore a printer that is showing offline.';
       problem='Printer showing offline / not responding to print jobs.';
       symptoms=@('Printer status shows offline on the print server or dashboard','Print jobs stuck in the queue');
       requirements=@('Network access to the printer IP');
       procedure=@('Ping the printer IP address.','Check the printer''s network cable / Wi-Fi status at the device panel.','Confirm the switch port or access point serving the printer is up.','Restart the print spooler on the print server if the device itself responds.','Re-add the printer if the IP address changed.');
       commands=@(@{cmd='ping 192.168.10.31'; verifies='Confirms the printer responds on the network'}, @{cmd='Restart-Service -Name Spooler'; verifies='Clears a stuck print spooler service'});
       verification='ping <printer-ip>'; expectedResult='Printer replies and status returns to Online/Ready';
       rollback='Not applicable.'; notes='' },

    @{ code='KB-PRN-002'; title='Replacing Toner / Critical Toner Level'; category='Printers'; tags=@('toner critical','low toner','replace toner');
       purpose='Respond to a printer reporting critical toner level.';
       problem='Printer toner level is critical and output quality is degrading or about to stop.';
       symptoms=@('Toner percentage below 10% on the dashboard','Faded or streaked printed output');
       requirements=@('Matching toner cartridge available in inventory');
       procedure=@('Confirm the toner percentage on the device panel matches the dashboard reading.','Look up the compatible toner model in Toner Inventory.','Confirm sufficient stock; escalate a purchase request if below minimum.','Replace the cartridge and reset the toner counter if supported.','Log the transaction as an Issue in Toner Inventory.');
       commands=@();
       verification='Check toner level on the device panel after replacement'; expectedResult='Toner level reads at or near 100% after cartridge replacement';
       rollback='Not applicable.'; notes='Always log the Issue transaction so stock levels stay accurate.' },

    @{ code='KB-WIN-001'; title='Windows Workstation Slow Performance / Freeze'; category='Windows'; tags=@('slow pc','freeze','high cpu workstation','not responding');
       purpose='Diagnose a Windows workstation running slowly or freezing.';
       problem='Workstation is slow, unresponsive, or freezes intermittently.';
       symptoms=@('Applications take a long time to open','Explorer or the desktop becomes unresponsive');
       requirements=@('Local admin access to the workstation');
       procedure=@('Check Task Manager for a process consuming excessive CPU, memory or disk.','Check available free disk space on the system drive.','Check for pending Windows updates or a stuck update installation.','Run a malware scan if resource usage is unexplained.','Check startup programs for unnecessary items.');
       commands=@(@{cmd='Get-Process | Sort-Object CPU -Descending | Select-Object -First 10'; verifies='Identifies top CPU-consuming processes'});
       verification='Monitor Task Manager after remediation'; expectedResult='CPU/memory/disk usage returns to normal idle levels';
       rollback='Not applicable.'; notes='' },

    @{ code='KB-M365-001'; title='Outlook / Microsoft 365 Sign-in Issues'; category='Microsoft 365'; tags=@('outlook','m365','office 365','cannot sign in','email down');
       purpose='Resolve a user unable to sign in to Outlook or Microsoft 365.';
       problem='User cannot sign in to Outlook or another Microsoft 365 app.';
       symptoms=@('Repeated credential prompt in Outlook','"Something went wrong" sign-in error');
       requirements=@('Microsoft 365 admin center access');
       procedure=@('Confirm the user''s AD/Entra account is enabled and not locked.','Check for an active service health incident.','Confirm MFA is registered and functioning.','Clear cached credentials and retry sign-in.','Recreate the Outlook profile if isolated to one app.');
       commands=@();
       verification='User successfully signs in to Outlook'; expectedResult='Outlook connects and mail synchronizes';
       rollback='Not applicable.'; notes='' },

    @{ code='KB-SEC-001'; title='Suspected Phishing Email Handling'; category='Security'; tags=@('phishing','suspicious email','spam');
       purpose='Respond safely to a user-reported suspicious or phishing email.';
       problem='A user has received a suspicious email requesting credentials, payment, or containing a suspicious link/attachment.';
       symptoms=@('Unexpected sender requesting urgent action','Link or attachment the user did not expect');
       requirements=@();
       procedure=@('Do not click links or open attachments in the reported message.','Confirm the sender address and headers.','Check if other users received the same message.','Block the sender domain and purge the message if confirmed malicious.','Advise the user to change their password if they clicked a link or entered credentials.');
       commands=@();
       verification='Confirm the message is removed from all mailboxes it was delivered to'; expectedResult='Message purged, sender blocked';
       rollback='Not applicable.'; notes='Never enter credentials into a page linked from a suspicious email, even to "test" it.' },

    @{ code='KB-APP-001'; title='Line-of-Business Application Crash Troubleshooting'; category='Applications'; tags=@('app crash','application not responding','software error');
       purpose='Diagnose a business application that crashes or fails to launch.';
       problem='An application crashes on launch or during use.';
       symptoms=@('Application closes unexpectedly','Error dialog referencing a missing file or exception');
       requirements=@('Access to Windows Event Viewer on the affected machine');
       procedure=@('Reproduce the issue and note the exact error message.','Check the Windows Application event log for the corresponding error.','Confirm the application and any required runtime are up to date.','Try running as a different user profile to rule out a corrupt profile.','Reinstall the application if a repair does not resolve it.');
       commands=@(@{cmd='Get-WinEvent -LogName Application -MaxEvents 20'; verifies='Shows recent application-level errors'});
       verification='Relaunch the application'; expectedResult='Application opens and functions without error';
       rollback='Restore the previous application version if a recent update caused the issue.'; notes='' },

    @{ code='KB-TRB-001'; title='General Workstation Hardware Diagnostic Checklist'; category='Troubleshooting'; tags=@('hardware','general troubleshooting','diagnostic checklist');
       purpose='A general first-response checklist for hardware-related reports.';
       problem='A workstation or peripheral is misbehaving with no specific error identified yet.';
       symptoms=@('Vague report such as "it''s not working"');
       requirements=@();
       procedure=@('Confirm power and cabling.','Confirm the device is recognized in Device Manager.','Check for pending driver or firmware updates.','Test with a known-good cable/port/peripheral to isolate the fault.','Escalate to the specific KB article once the fault is identified.');
       commands=@(@{cmd='Get-PnpDevice | Where-Object Status -ne "OK"'; verifies='Lists devices with a driver or hardware problem'});
       verification='Device functions normally after remediation'; expectedResult='No error in Device Manager';
       rollback='Not applicable.'; notes='' },

    @{ code='KB-SOP-001'; title='New Employee IT Onboarding Procedure'; category='SOP'; tags=@('onboarding','new user','new hire');
       purpose='Standard procedure for provisioning IT access for a new employee.';
       problem='N/A — standard operating procedure.';
       symptoms=@();
       requirements=@('Approved new-hire request from HR with department, title and start date');
       procedure=@('Create the AD user account in the correct OU with standard naming convention.','Add the user to the relevant department security groups.','Provision a mailbox and license in Microsoft 365.','Provision a workstation and join it to the domain.','Set an initial password with "change at next logon".','Confirm the user can log in and access required systems on day one.');
       commands=@(@{cmd='New-ADUser -Name "Full Name" -SamAccountName username -Path "OU=Department,DC=contoso,DC=com" -Enabled $true -ChangePasswordAtLogon $true'; verifies='Creates the account in the correct OU'});
       verification='Get-ADUser username -Properties MemberOf,Enabled'; expectedResult='Account is enabled and a member of the expected groups';
       rollback='Disable-ADAccount -Identity username (if the request is cancelled)'; notes='' },

    @{ code='KB-POL-001'; title='Password Policy Reference'; category='Policies'; tags=@('password policy','complexity','expiry policy');
       purpose='Reference for the organization''s current password policy.';
       problem='N/A — policy reference.';
       symptoms=@();
       requirements=@();
       procedure=@('Minimum length: 12 characters.','Complexity required: upper, lower, number, symbol.','Maximum password age: 90 days.','Account lockout threshold: 5 invalid attempts.','Lockout duration: 30 minutes or Help Desk unlock.');
       commands=@(@{cmd='Get-ADDefaultDomainPasswordPolicy'; verifies='Displays the current domain password policy'});
       verification='Get-ADDefaultDomainPasswordPolicy'; expectedResult='Returned values match the documented policy above';
       rollback='Not applicable.'; notes='Contact IT management before proposing a policy change.' }
)

$script:Categories = @('All','Active Directory','FortiGate','Networking','Printers','Windows','Microsoft 365','Security','Applications','Troubleshooting','SOP','Policies')

function Get-KbArticles { $script:Articles }
function Get-KbCategories { $script:Categories }
function Get-KbArticleByCode { param([string]$Code) $script:Articles | Where-Object { $_.code -eq $Code } | Select-Object -First 1 }

function Search-KbArticles {
    param([Parameter(Mandatory)][string]$Query, [int]$Limit = 5)
    $tokens = $Query.ToLower() -split '\s+' | Where-Object { $_.Length -gt 2 }
    if(-not $tokens){ return @() }
    $scored = foreach($a in $script:Articles){
        $hay = (@($a.title,$a.category) + $a.tags + @($a.problem) + $a.symptoms) -join ' '
        $hay = $hay.ToLower()
        $score = ($tokens | Where-Object { $hay.Contains($_) }).Count
        if($score -gt 0){ [pscustomobject]@{ Article = $a; Score = $score } }
    }
    $scored | Sort-Object -Property Score -Descending | Select-Object -First $Limit -ExpandProperty Article
}

function Get-KbRelatedArticles {
    param([Parameter(Mandatory)][string]$Code, [int]$Limit = 3)
    $current = Get-KbArticleByCode -Code $Code
    if(-not $current){ return @() }
    $currentTags = $current.tags
    $scored = foreach($a in $script:Articles){
        if($a.code -eq $Code){ continue }
        $overlap = ($a.tags | Where-Object { $currentTags -contains $_ }).Count
        $sameCategory = if($a.category -eq $current.category){ 1 } else { 0 }
        $score = $overlap * 2 + $sameCategory
        if($score -gt 0){ [pscustomobject]@{ Article = $a; Score = $score } }
    }
    $scored | Sort-Object -Property Score -Descending | Select-Object -First $Limit -ExpandProperty Article
}

Export-ModuleMember -Function Get-KbArticles, Get-KbCategories, Get-KbArticleByCode, Search-KbArticles, Get-KbRelatedArticles
