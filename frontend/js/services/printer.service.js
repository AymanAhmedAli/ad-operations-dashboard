/*
  Printer service.

  Unlike Active Directory/FortiGate/Toner, printers have no CSV/Excel/JSON
  import path - the real backend (../../backend/routes/printers.routes.ps1),
  which polls printers over SNMP (see backend/modules/Printer.Service.psm1),
  is the only source. addPrinter()/removePrinter() tell that backend to
  add/drop a device from its real SNMP polling list (persisted server-side in
  backend/config/printers.local.json) - see the Printers page's "Add printer
  by IP" panel. If the backend isn't reachable, or nothing is configured to
  poll yet, this returns an empty list with mode 'none' rather than
  fabricating printers.

  Endpoints used: GET/POST /api/printers, DELETE /api/printers/:ip
*/
import { DEPARTMENTS } from '../mock-data.js';
import { delay } from '../utils.js';
import { setDataSourceMode } from '../state.js';
import { apiGet, apiPost, apiDelete } from '../api-client.js';

let mode = 'none';
setDataSourceMode('printers', mode);

function setMode(next){ mode = next; setDataSourceMode('printers', mode); }

async function resolvePrinters(){
  try{
    const res = await apiGet('/printers');
    if(res && res.available){ setMode('live'); return res.data; }
  }catch(err){ /* backend unreachable - fall through to no data */ }
  setMode('none');
  return [];
}

export async function getPrinters(){ await delay(0); return resolvePrinters(); }
export async function getSource(){ return mode; }

// Toner status rule: Healthy >20% · Warning 10-20% · Critical <10% · Offline
// devices are always "offline" regardless of their last-known toner reading.
export function getStatus(printer){
  if(!printer.online) return 'offline';
  if(printer.tonerPct < 10) return 'critical';
  if(printer.tonerPct <= 20) return 'warning';
  return 'healthy';
}

// Adds a printer to the backend's real SNMP polling list. Only `ip` is
// required; every other field is optional inventory metadata SNMP can't
// supply itself. Throws (via apiPost's ApiError) if the backend is
// unreachable or rejects the request - the page decides how to show that.
export async function addPrinter({ ip, name, port, manufacturer, model, department, location }){
  return apiPost('/printers', { ip, name, port, manufacturer, model, department, location });
}
export async function removePrinter(ip){
  return apiDelete('/printers/' + encodeURIComponent(ip));
}

export async function askQuestion(question){
  const printers = await resolvePrinters();
  const s = question.toLowerCase();

  if(s.includes('need') && s.includes('toner')){
    const rows = printers.filter(p => ['warning', 'critical'].includes(getStatus(p)));
    return { text: `${rows.length} printer(s) need toner attention.`, rows };
  }
  const belowMatch = s.match(/below\s*(\d+)/);
  if(belowMatch){
    const n = Number(belowMatch[1]);
    const rows = printers.filter(p => p.tonerPct !== null && p.tonerPct !== undefined && p.tonerPct < n);
    return { text: `${rows.length} printer(s) with toner below ${n}%.`, rows };
  }
  if(s.includes('offline')){
    const rows = printers.filter(p => !p.online);
    return { text: `${rows.length} printer(s) currently offline.`, rows };
  }
  const dept = DEPARTMENTS.find(d => s.includes(d.toLowerCase()));
  if(dept){
    const rows = printers.filter(p => p.department === dept);
    return { text: `${rows.length} printer(s) in ${dept}.`, rows };
  }
  if(s.includes('highest') && s.includes('page')){
    if(!printers.length) return { text: 'No printers are currently available.', rows: [] };
    const top = printers.slice().sort((a, b) => b.pageCount - a.pageCount)[0];
    return { text: `Highest page count: ${top.name} with ${top.pageCount.toLocaleString()} pages.`, rows: [top] };
  }
  return { text: 'No data is currently available for this item, or the question was not recognized.', rows: [] };
}
