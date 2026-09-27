/*
  IT Support Assistant service. diagnose(text) always resolves to:
    { technology, possibleCauses, checks, commands, knowledgeBaseArticles }
  Tries the real backend (../../backend/routes/assistant.routes.ps1) first -
  the exact same rule engine runs there (see
  backend/modules/Assistant.Service.psm1) - falling back to the identical
  rules bundled below if the backend isn't reachable. The Assistant page
  only ever reads this same shape either way.

  Diagnostic suggestions only: this service never proposes a destructive
  action before a diagnostic/verification step.
*/
import { searchArticles } from './knowledge-base.service.js';
import { delay } from '../utils.js';
import { apiPost } from '../api-client.js';

const RULES = [
 {test:s=>/(cannot|can't|unable to).*(login|log in|sign in).*domain|domain.*(login|log in)/.test(s),
  technology:'Active Directory / Domain Authentication',
  possibleCauses:['Account locked out','Account disabled','Password expired','Workstation cannot reach a domain controller','Incorrect DNS configuration'],
  checks:['Is the user account locked?','Is the account disabled?','Is the password expired?','Can the workstation communicate with a domain controller?','Is DNS pointing to the correct internal DNS server?'],
  commands:[{cmd:'Get-ADUser username -Properties LockedOut,Enabled,PasswordExpired',verifies:'Checks lockout, enabled and expiry state in one call'},{cmd:'Test-NetConnection dc01.contoso.local -Port 389',verifies:'Confirms LDAP reachability to a domain controller'},{cmd:'nslookup contoso.local',verifies:'Confirms DNS resolves the domain correctly'}],
  knowledgeBaseArticles:['KB-AD-001','KB-AD-004']},
 {test:s=>/locked|lockout/.test(s),
  technology:'Active Directory — Account Lockout',
  possibleCauses:['Repeated bad password attempts (often a cached credential on a phone or mapped drive)','Manual/security-triggered lockout'],
  checks:['Confirm the account is actually locked','Identify the source device generating bad attempts (Event ID 4740)','Unlock the account','Confirm the user removes any cached bad credential'],
  commands:[{cmd:'Get-ADUser username -Properties LockedOut',verifies:'Confirms lockout state'},{cmd:'Unlock-ADAccount -Identity username',verifies:'Clears the lockout'}],
  knowledgeBaseArticles:['KB-AD-001']},
 {test:s=>/disabled account|account.*disabled|enable.*account/.test(s),
  technology:'Active Directory — Disabled Account',
  possibleCauses:['Account disabled during offboarding','Account disabled by policy or security action'],
  checks:['Confirm with HR/manager that reinstatement is authorized','Confirm the account isn’t mid-offboarding','Enable the account','Confirm password status'],
  commands:[{cmd:'Get-ADUser username -Properties Enabled',verifies:'Confirms current state'},{cmd:'Enable-ADAccount -Identity username',verifies:'Enables the account'}],
  knowledgeBaseArticles:['KB-AD-003']},
 {test:s=>/password.*(expir)/.test(s),
  technology:'Active Directory — Password Expiry',
  possibleCauses:['Password aged past the maximum policy age','User unaware of upcoming expiry'],
  checks:['Confirm current password expiry date','Reset or have the user change the password','Force change at next logon if resetting on their behalf'],
  commands:[{cmd:'Get-ADUser username -Properties PasswordExpired,PasswordLastSet',verifies:'Confirms expiry status'}],
  knowledgeBaseArticles:['KB-AD-002','KB-POL-001']},
 {test:s=>/vpn/.test(s),
  technology:'FortiGate — VPN',
  possibleCauses:['SSL VPN authentication failure','IPsec Phase 1/2 mismatch','WAN interface down at one end','Peer unreachable'],
  checks:['Is this a remote user (SSL VPN) or site-to-site (IPsec) tunnel?','Check Phase 1 / Phase 2 or SSL VPN session status','Confirm peer/WAN reachability','Review VPN logs for negotiation errors'],
  commands:[{cmd:'get vpn ssl monitor',verifies:'Lists connected SSL VPN sessions'},{cmd:'diagnose vpn tunnel list',verifies:'Shows IPsec tunnel/SA status'}],
  knowledgeBaseArticles:['KB-FTG-003','KB-FTG-010']},
 {test:s=>/wan down|no internet|internet.*down/.test(s),
  technology:'FortiGate — WAN Connectivity',
  possibleCauses:['ISP outage','Modem/ONT failure','Interface misconfiguration'],
  checks:['Check the physical link on the FortiGate port and ISP modem','Confirm interface status on the FortiGate','Test WAN failover'],
  commands:[{cmd:'get system interface physical',verifies:'Shows link state per interface'}],
  knowledgeBaseArticles:['KB-FTG-002']},
 {test:s=>/high cpu|fortigate.*slow|firewall.*slow/.test(s),
  technology:'FortiGate — Performance',
  possibleCauses:['AV/IPS scan spike','Session count near capacity','Possible DoS pattern'],
  checks:['Identify top CPU-consuming process','Check session count vs. baseline','Review recent policy/signature changes'],
  commands:[{cmd:'get system performance status',verifies:'Shows CPU/memory snapshot'},{cmd:'diagnose sys top',verifies:'Shows per-process CPU'}],
  knowledgeBaseArticles:['KB-FTG-001']},
 {test:s=>/printer.*(offline|not responding)|offline.*printer/.test(s),
  technology:'Printers — Offline',
  possibleCauses:['Network/cable/Wi-Fi issue at the device','Switch port or AP down','IP address changed'],
  checks:['Ping the printer IP','Check the device panel network status','Confirm the switch port/AP is up','Restart the print spooler if the device responds'],
  commands:[{cmd:'ping <printer-ip>',verifies:'Confirms the printer responds on the network'},{cmd:'Restart-Service -Name Spooler',verifies:'Clears a stuck spooler'}],
  knowledgeBaseArticles:['KB-PRN-001']},
 {test:s=>/toner/.test(s),
  technology:'Printers — Toner',
  possibleCauses:['Consumable naturally depleted','Faulty toner sensor'],
  checks:['Confirm the toner level on the device panel','Check Toner Inventory for stock and compatible model','Replace and log the Issue transaction'],
  commands:[],
  knowledgeBaseArticles:['KB-PRN-002']},
 {test:s=>/dhcp|no ip address|apipa|169\.254/.test(s),
  technology:'Networking — DHCP',
  possibleCauses:['Exhausted DHCP scope','Rogue DHCP server','Faulty cable/port/Wi-Fi'],
  checks:['Confirm physical/Wi-Fi link is active','Release and renew the IP','Check DHCP scope utilization','Check for a rogue DHCP server on the segment'],
  commands:[{cmd:'ipconfig /release',verifies:'Releases the invalid lease'},{cmd:'ipconfig /renew',verifies:'Requests a new lease'},{cmd:'ipconfig /all',verifies:'Confirms the new address and DNS servers'}],
  knowledgeBaseArticles:['KB-NET-001']},
 {test:s=>/inactive computer|stale (device|computer)|computer.*inactive/.test(s),
  technology:'Active Directory — Inactive Computer',
  possibleCauses:['Device retired without AD cleanup','Device on long-term leave/storage'],
  checks:['Confirm the device isn’t a known spare/seasonal machine','Confirm with the assigned department','Disable if retirement is confirmed'],
  commands:[{cmd:'Get-ADComputer -Filter * -Properties LastLogonTimestamp',verifies:'Lists computers and their last contact time'}],
  knowledgeBaseArticles:['KB-AD-005']},
 {test:s=>/slow|freeze|not responding|hang/.test(s),
  technology:'Windows Workstation — Performance',
  possibleCauses:['Resource-heavy process','Low disk space','Pending updates','Malware'],
  checks:['Check Task Manager for a runaway process','Check free disk space','Check for pending updates','Run a malware scan if unexplained'],
  commands:[{cmd:'Get-Process | Sort-Object CPU -Descending | Select-Object -First 10',verifies:'Identifies top CPU consumers'}],
  knowledgeBaseArticles:['KB-WIN-001','KB-TRB-001']},
 {test:s=>/outlook|mail|365|office 365|can'?t sign in/.test(s),
  technology:'Microsoft 365 — Sign-in / Mail',
  possibleCauses:['Account issue in source directory','Service health incident','MFA misconfiguration','Corrupt local profile'],
  checks:['Confirm the account is enabled and unlocked','Check Microsoft 365 service health','Confirm MFA is functioning','Recreate the Outlook profile if isolated to one app'],
  commands:[],
  knowledgeBaseArticles:['KB-M365-001']},
 {test:s=>/phishing|suspicious email|spam/.test(s),
  technology:'Security — Phishing',
  possibleCauses:['Targeted or bulk phishing campaign'],
  checks:['Do not click links or open attachments','Confirm sender/headers','Check if others received it','Block sender and purge if confirmed malicious'],
  commands:[],
  knowledgeBaseArticles:['KB-SEC-001']},
];

export async function diagnose(text){
  try{ return await apiPost('/assistant/diagnose', { text }); }
  catch(err){ /* backend unreachable - fall through to the local rule engine */ }

  await delay(0);
  const s = text.toLowerCase();
  const rule = RULES.find(r => r.test(s));
  if(rule){
    const { test, ...rest } = rule;
    return rest;
  }
  const matches = await searchArticles(text);
  if(matches.length){
    return {
      technology: 'General IT Issue',
      possibleCauses: ['See matched Knowledge Base article(s) below for likely causes.'],
      checks: matches[0].procedure,
      commands: matches[0].commands || [],
      knowledgeBaseArticles: matches.map(a => a.code),
    };
  }
  return {
    technology: 'Unrecognized',
    possibleCauses: ['No data is currently available for this item.'],
    checks: ['Ask a more specific question, e.g. naming the device, error message, or affected system.'],
    commands: [],
    knowledgeBaseArticles: [],
  };
}
