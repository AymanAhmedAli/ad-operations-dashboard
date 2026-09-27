/* Printer Monitoring page. All data access goes through printer.service.js. */
import { esc, num } from '../utils.js';
import { dataTable } from '../components/table.js';
import { pill, dataSourceBadge } from '../components/badges.js';
import { queryBox } from '../components/query-box.js';
import { setImportStatus } from '../components/import-panel.js';
import { renderEmpty } from '../components/empty-state.js';
import { getState, updateFilters } from '../state.js';
import { rerender } from '../router.js';
import * as printer from '../services/printer.service.js';
import { DEPARTMENTS } from '../mock-data.js';

function statusToTone(s){ return { healthy: 'ok', warning: 'warn', critical: 'crit', offline: 'unknown' }[s] || 'unknown'; }

const QUERY_COLS = [
  { key: 'name', label: 'Printer' }, { key: 'department', label: 'Department' },
  { key: 'status', label: 'Status', render: r => pill(statusToTone(printer.getStatus(r)), printer.getStatus(r)) },
  { key: 'tonerPct', label: 'Toner %', num: true, render: r => r.tonerPct === null || r.tonerPct === undefined ? '—' : r.tonerPct + '%' },
  { key: 'pageCount', label: 'Pages', num: true, render: r => num(r.pageCount) },
];

export async function render(){
  // getSource() must run AFTER getPrinters() resolves, not in parallel with
  // it - it just reads whatever mode getPrinters()'s internal fetch last set,
  // so calling it concurrently can report the previous render's mode.
  const printers = await printer.getPrinters();
  const source = await printer.getSource();
  const view = getState().filters.printersView;

  const views = {
    all: { label: 'All', pred: () => true },
    needtoner: { label: 'Need Toner', pred: p => ['warning', 'critical'].includes(printer.getStatus(p)) },
    offline: { label: 'Offline', pred: p => !p.online },
  };
  const rows = printers.filter(views[view].pred);
  const cols = [
    { key: 'name', label: 'Printer' }, { key: 'ip', label: 'IP' }, { key: 'model', label: 'Model' }, { key: 'manufacturer', label: 'Manufacturer' },
    { key: 'location', label: 'Location' }, { key: 'department', label: 'Department' },
    { key: 'status', label: 'Status', render: r => pill(statusToTone(printer.getStatus(r)), printer.getStatus(r)) },
    { key: 'tonerPct', label: 'Toner %', num: true, render: r => r.tonerPct === null || r.tonerPct === undefined ? '—' : r.tonerPct + '%' },
    { key: 'pageCount', label: 'Page Count', num: true, render: r => num(r.pageCount) },
    { key: 'lastSeen', label: 'Last Seen' },
    { key: 'actions', label: '', render: r => r.source === 'ui' ? `<button class="btn ghost sm" data-action="remove-printer" data-ip="${esc(r.ip)}">Remove</button>` : '' },
  ];
  const offline = printers.filter(p => !p.online).length;
  const needToner = printers.filter(p => ['warning', 'critical'].includes(printer.getStatus(p))).length;

  return `
  <div class="section-head"><h2>Printer Monitoring</h2>${dataSourceBadge(source)}</div>
  <details class="importpanel" id="addprinter">
    <summary>&#128424; Add printer by IP</summary>
    <div class="importpanel-body">
      <div class="hint">Adds the printer to the backend's real SNMP polling list — it starts showing here with live status on the next refresh. Only IP is required; the rest is optional inventory metadata SNMP can't supply itself.</div>
      <div class="txn-form">
        <label class="field"><span>IP Address *</span><input type="text" id="ap_ip" placeholder="10.100.0.3"></label>
        <label class="field"><span>Name</span><input type="text" id="ap_name" placeholder="Defaults to the IP"></label>
        <label class="field"><span>Manufacturer</span><input type="text" id="ap_manufacturer" placeholder="e.g. Canon"></label>
        <label class="field"><span>Model</span><input type="text" id="ap_model"></label>
        <label class="field"><span>Department</span><select id="ap_department"><option value="">—</option>${DEPARTMENTS.map(d => `<option>${esc(d)}</option>`).join('')}</select></label>
        <label class="field"><span>Location</span><input type="text" id="ap_location"></label>
        <label class="field"><span>SNMP Port</span><input type="number" id="ap_port" value="161"></label>
      </div>
      <div id="addprinter_status"></div>
      <div class="toolbar" style="margin-top:4px;"><button class="btn primary sm" data-action="add-printer">Add Printer</button></div>
    </div>
  </details>
  ${queryBox('prn', ['Which printers need toner?', 'Show offline printers', 'Show Finance printers', 'Which printer has the highest page count?', 'Show printers with toner below 15%'])}
  <div class="stat-grid">
    <div class="stat">Total<div class="value">${printers.length}</div></div>
    <div class="stat ${offline ? 'crit' : 'ok'}">Offline<div class="value">${offline}</div></div>
    <div class="stat ${needToner ? 'warn' : 'ok'}">Need Toner<div class="value">${needToner}</div></div>
  </div>
  <div class="toolbar">${Object.keys(views).map(k => `<button class="chip-btn ${view === k ? 'active' : ''}" data-action="set-view" data-view="${k}">${esc(views[k].label)}</button>`).join('')}</div>
  ${dataTable(cols, rows, { emptyText: source === 'none' ? 'No data available. Add a printer above or connect a live backend.' : 'No matching records.' })}
  <div class="hint">Toner status rule: Healthy &gt;20% · Warning 10–20% · Critical &lt;10% · Offline devices show status Offline regardless of toner reading.</div>
  `;
}

export function getActions(){
  async function runAskPrinters(){
    const input = document.getElementById('prn_input');
    const box = document.getElementById('prn_answer');
    const q = input.value.trim();
    if(!q) return;
    const result = await printer.askQuestion(q);
    box.innerHTML = `<div class="qa-answer">${esc(result.text)}${result.rows.length ? dataTable(QUERY_COLS, result.rows) : renderEmpty('No data is currently available for this item.')}</div>`;
  }
  return {
    'set-view': (el) => { updateFilters({ printersView: el.dataset.view }); rerender(); },
    'ask:prn': runAskPrinters,
    'ask-example:prn': (el) => { document.getElementById('prn_input').value = el.dataset.example; runAskPrinters(); },

    'add-printer': async () => {
      const ip = document.getElementById('ap_ip').value.trim();
      if(!ip){ setImportStatus('addprinter', false, 'IP address is required.'); return; }
      // rerender() replaces the whole page - including the #addprinter_status
      // div this message targets - so it must finish BEFORE we write the
      // message, not after (setImportStatus-then-rerender would get the
      // message wiped out before the browser ever paints it).
      let ok = true, msg;
      try{
        await printer.addPrinter({
          ip,
          name: document.getElementById('ap_name').value.trim(),
          manufacturer: document.getElementById('ap_manufacturer').value.trim(),
          model: document.getElementById('ap_model').value.trim(),
          department: document.getElementById('ap_department').value,
          location: document.getElementById('ap_location').value.trim(),
          port: document.getElementById('ap_port').value,
        });
        msg = `${ip} added. It will show live status once the backend can reach it.`;
      }catch(err){
        ok = false;
        msg = 'Could not add printer: ' + err.message;
      }
      await rerender();
      setImportStatus('addprinter', ok, msg);
    },
    'remove-printer': async (el) => {
      try{
        await printer.removePrinter(el.dataset.ip);
        rerender();
      }catch(err){ setImportStatus('addprinter', false, 'Could not remove printer: ' + err.message); }
    },
  };
}
