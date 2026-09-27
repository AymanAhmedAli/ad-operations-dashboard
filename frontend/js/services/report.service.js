/*
  Report service — aggregates the other services into the Report Center's
  structured output. Deliberately does NOT call the backend's own
  /api/reports/* endpoints directly, even though they exist
  (../../backend/routes/reports.routes.ps1) - composing from ad/fortigate/
  printer/toner/alerts here means a report always reflects whatever each of
  those already resolved (live backend, a local import, or none), the exact
  same data its own page is showing. Calling the backend's aggregate
  endpoints directly could disagree with that (e.g. if AD data was imported
  locally, but the backend's report endpoint used its own live AD instead).
*/
import * as ad from './active-directory.service.js';
import * as fortigate from './fortigate.service.js';
import * as printer from './printer.service.js';
import * as toner from './toner.service.js';
import * as alerts from './alert.service.js';
import { DEPARTMENTS } from '../mock-data.js';
import { delay } from '../utils.js';

export const REPORT_TYPES = [
 {id:'ad_users', label:'Active Directory Users'},
 {id:'ad_locked', label:'Locked Accounts'},
 {id:'ad_disabled', label:'Disabled Accounts'},
 {id:'ad_pwdexp', label:'Password Expiration'},
 {id:'ad_inactiveusers', label:'Inactive Users'},
 {id:'ad_computers', label:'Computer Inventory'},
 {id:'ad_inactivecomputers', label:'Inactive Computers'},
 {id:'fgt_overview', label:'FortiGate Overview'},
 {id:'fgt_interfaces', label:'FortiGate Interfaces'},
 {id:'fgt_devices', label:'FortiGate Connected Devices'},
 {id:'fgt_vpnusers', label:'VPN Users'},
 {id:'fgt_events', label:'FortiGate Security Events'},
 {id:'prn_inventory', label:'Printer Inventory'},
 {id:'prn_offline', label:'Offline Printers'},
 {id:'prn_toner', label:'Toner Levels'},
 {id:'prn_pagecounts', label:'Printer Page Counts'},
 {id:'toner_current', label:'Current Toner Inventory'},
 {id:'toner_low', label:'Low Toner Stock'},
 {id:'toner_txns', label:'Toner Transactions'},
 {id:'toner_bydept', label:'Toner Consumption by Department'},
 {id:'toner_byprinter', label:'Toner Consumption by Printer'},
];

export async function getReportTypes(){ return REPORT_TYPES; }

async function aggregateTonerByDept(){
  const txns = await toner.getTransactions();
  const m = {};
  txns.filter(t => t.type === 'Issue').forEach(t => { m[t.department] = (m[t.department] || 0) + t.qty; });
  return Object.keys(m).map(k => ({ department: k, unitsIssued: m[k] }));
}
async function aggregateTonerByPrinter(){
  const txns = await toner.getTransactions();
  const m = {};
  txns.filter(t => t.type === 'Issue').forEach(t => { m[t.printer] = (m[t.printer] || 0) + t.qty; });
  return Object.keys(m).map(k => ({ printer: k, unitsIssued: m[k] }));
}

async function datasetForReport(id){
  switch(id){
    case 'ad_users': return ad.getUsers();
    case 'ad_locked': return (await ad.getInsights()).locked;
    case 'ad_disabled': return (await ad.getInsights()).disabled;
    case 'ad_pwdexp': return (await ad.getInsights()).expiring7;
    case 'ad_inactiveusers': return (await ad.getInsights()).inactiveUsers30;
    case 'ad_computers': return ad.getComputers();
    case 'ad_inactivecomputers': return (await ad.getInsights()).inactiveComputers30;
    case 'fgt_overview': return [await fortigate.getDevice()];
    case 'fgt_interfaces': return fortigate.getInterfaces();
    case 'fgt_devices': return fortigate.getConnectedDevices();
    case 'fgt_vpnusers': return fortigate.getVpnUsers();
    case 'fgt_events': return fortigate.getSecurityEvents();
    case 'prn_inventory': return printer.getPrinters();
    case 'prn_offline': return (await printer.getPrinters()).filter(p => !p.online);
    case 'prn_toner': return printer.getPrinters();
    case 'prn_pagecounts': return (await printer.getPrinters()).slice().sort((a, b) => b.pageCount - a.pageCount);
    case 'toner_current': return toner.getInventory();
    case 'toner_low': return (await toner.getInventory()).filter(i => toner.getStockState(i) !== 'ok');
    case 'toner_txns': return toner.getTransactions();
    case 'toner_bydept': return aggregateTonerByDept();
    case 'toner_byprinter': return aggregateTonerByPrinter();
    default: return [];
  }
}

function applyFilters(rows, filters = {}){
  let out = rows;
  if(filters.department) out = out.filter(r => r.department === filters.department);
  if(filters.location) out = out.filter(r => r.location && r.location.toLowerCase().includes(filters.location.toLowerCase()));
  if(filters.status) out = out.filter(r => JSON.stringify(r).toLowerCase().includes(filters.status.toLowerCase()));
  if(filters.deviceType) out = out.filter(r => JSON.stringify(r).toLowerCase().includes(filters.deviceType.toLowerCase()));
  return out;
}

export async function generateReport(typeId, filters = {}){
  await delay();
  const meta = REPORT_TYPES.find(r => r.id === typeId);
  let rows = await datasetForReport(typeId);
  rows = applyFilters(rows || [], filters);
  const missing = [];
  if(typeId.startsWith('toner_by') && rows.length === 0) missing.push('No toner issue transactions recorded yet for this breakdown');
  if(typeId === 'toner_txns' && rows.length === 0) missing.push('No transactions recorded during the selected period');
  return { meta, rows, filters, missing, generatedAt: new Date().toISOString() };
}

// Natural-language report requests -> {typeId, filters} or a one-off {custom}
// result for questions that don't map to a single report type.
export async function askNaturalLanguage(question){
  await delay();
  const s = question.toLowerCase();
  const filters = { range: 'all', department: '', location: '', status: '', deviceType: '' };
  const dept = DEPARTMENTS.find(d => s.includes(d.toLowerCase()));
  if(dept) filters.department = dept;

  if(s.includes('hikvision')){
    const result = await fortigate.askQuestion(question);
    return { custom: result };
  }
  if(s.includes('critical')){
    const rows = (await alerts.getAlerts()).filter(a => a.severity === 'critical');
    return { custom: { text: 'Critical infrastructure issues (Alerts — Critical severity):', rows } };
  }
  let typeId;
  if(s.includes('locked')) typeId = 'ad_locked';
  else if(s.includes('disabled')) typeId = 'ad_disabled';
  else if(s.includes('toner') && s.includes('consumption') && s.includes('department')) typeId = 'toner_bydept';
  else if(s.includes('toner') && s.includes('consumption')) typeId = 'toner_byprinter';
  else if(s.includes('toner') && (s.includes('below') || s.includes('under'))) typeId = 'prn_toner';
  else if(s.includes('computer') && s.includes('inactive')) typeId = 'ad_inactivecomputers';
  else if(s.includes('printer')) typeId = 'prn_inventory';
  else if(s.includes('vpn')) typeId = 'fgt_vpnusers';
  else typeId = 'ad_users';

  return { typeId, filters };
}

/* Management Summary — a concise, non-technical roll-up plus a "Technical
   Details" expansion, computed purely from currently loaded data. */
export async function generateManagementSummary(){
  const [insights, fgStatus, device, interfaces, tunnels, printers, items, criticalAlerts] = await Promise.all([
    ad.getInsights(), fortigate.getOverallStatus(), fortigate.getDevice(), fortigate.getInterfaces(),
    fortigate.getVpnTunnels(), printer.getPrinters(), toner.getInventory(), alerts.getCriticalCount(),
  ]);

  const offline = printers.filter(p => !p.online).length;
  const lowToner = items.filter(i => toner.getStockState(i) !== 'ok').length;
  const stockValue = items.reduce((s, i) => s + i.qty * i.unitCost, 0);

  const adHealth = (insights.locked.length + insights.disabled.length) > 3 ? 'warn' : (insights.locked.length ? 'warn' : 'ok');
  const netHealth = fgStatus === 'healthy' ? 'ok' : (fgStatus === 'critical' ? 'crit' : 'warn');
  const printerHealth = offline > 1 ? 'crit' : (offline ? 'warn' : 'ok');
  const tonerHealth = lowToner ? 'warn' : 'ok';

  const risks = [];
  if(insights.locked.length) risks.push(`${insights.locked.length} locked AD account(s) may be blocking staff from working.`);
  if(fgStatus !== 'healthy') risks.push('FortiGate is reporting a WAN, VPN or CPU condition that needs attention.');
  if(offline) risks.push(`${offline} printer(s) are offline, disrupting printing for affected departments.`);
  if(lowToner) risks.push(`${lowToner} toner item(s) are low or out of stock — reorder to avoid a printing outage.`);
  if(insights.inactiveComputers30.length) risks.push(`${insights.inactiveComputers30.length} computer(s) have been inactive 30+ days — review for retirement.`);

  const actions = [];
  if(insights.locked.length) actions.push('Unlock affected AD accounts after identity verification (KB-AD-001).');
  if(fgStatus !== 'healthy') actions.push('Investigate FortiGate WAN/VPN/CPU alerts and engage ISP if WAN-side.');
  if(offline) actions.push('Dispatch a technician to restore offline printers (KB-PRN-001).');
  if(lowToner) actions.push('Raise a purchase request for low/out-of-stock toner items.');
  if(!risks.length) actions.push('No major risks detected in the currently loaded data — continue routine monitoring.');

  return {
    generatedAt: new Date().toISOString(),
    health: { ad: adHealth, network: netHealth, printers: printerHealth, toner: tonerHealth, criticalAlerts },
    risks, actions,
    technical: {
      adUsers: (await ad.getUsers()).length, locked: insights.locked.length, disabled: insights.disabled.length,
      expiring7: insights.expiring7.length, inactiveComputers: insights.inactiveComputers30.length,
      cpu: device ? device.cpu : null, memory: device ? device.memory : null,
      interfacesDown: interfaces.filter(i => i.status === 'down').length,
      tunnelsDown: tunnels.filter(t => t.status === 'down').length,
      printersOffline: offline,
      printersNeedToner: printers.filter(p => ['warning', 'critical'].includes(printer.getStatus(p))).length,
      lowToner, stockValue,
    },
  };
}
