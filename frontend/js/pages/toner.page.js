/*
  Toner Inventory page. All reads/writes go through toner.service.js — this
  page never touches localStorage or the mock array directly. The transaction
  flow always shows a preview (in a modal) before confirmTransaction() applies
  anything, matching the "never silently change inventory" requirement.
*/
import { esc, money } from '../utils.js';
import { dataTable } from '../components/table.js';
import { pill, dataSourceBadge } from '../components/badges.js';
import { importPanel, setImportStatus, switchImportTab, parseImportFile, parseImportJSON } from '../components/import-panel.js';
import { openModal, closeModal } from '../components/modal.js';
import { getState } from '../state.js';
import { rerender } from '../router.js';
import * as toner from '../services/toner.service.js';
import * as printer from '../services/printer.service.js';
import { DEPARTMENTS } from '../mock-data.js';

const TXN_TYPES = ['Receive Stock', 'Issue Toner', 'Return Toner', 'Stock Adjustment'];
let activeTxnType = 'Issue Toner';

export async function render(){
  // getSource() must run after getInventory() resolves, not in parallel with
  // it - it just reads whatever mode getInventory()'s internal fetch last
  // set, so calling it concurrently can report the previous render's mode.
  const [items, transactions, printers] = await Promise.all([
    toner.getInventory(), toner.getTransactions(), printer.getPrinters(),
  ]);
  const source = await toner.getSource();
  const totalValue = items.reduce((s, i) => s + i.qty * i.unitCost, 0);
  const low = items.filter(i => toner.getStockState(i) === 'low').length;
  const out = items.filter(i => toner.getStockState(i) === 'out').length;

  const cols = [
    { key: 'manufacturer', label: 'Manufacturer' }, { key: 'model', label: 'Model' }, { key: 'compatible', label: 'Compatible Printer' },
    { key: 'qty', label: 'Qty', num: true }, { key: 'min', label: 'Min', num: true },
    { key: 'state', label: 'Status', render: r => { const st = toner.getStockState(r); return pill(st === 'ok' ? 'ok' : st === 'low' ? 'warn' : 'crit', st === 'ok' ? 'In Stock' : st === 'low' ? 'Low Stock' : 'Out of Stock'); } },
    { key: 'unitCost', label: 'Unit Cost', num: true, render: r => money(r.unitCost) },
    { key: 'value', label: 'Value', num: true, render: r => money(r.qty * r.unitCost) },
    { key: 'location', label: 'Location' },
  ];
  const txnCols = [
    { key: 'time', label: 'Date' },
    { key: 'type', label: 'Type', render: r => pill(r.type.startsWith('Issue') ? 'warn' : r.type.startsWith('Receive') ? 'ok' : 'unknown', r.type) },
    { key: 'model', label: 'Toner Model' }, { key: 'qty', label: 'Qty', num: true }, { key: 'printer', label: 'Printer' },
    { key: 'department', label: 'Department' }, { key: 'issuedTo', label: 'Issued To' }, { key: 'by', label: 'Logged By' }, { key: 'notes', label: 'Notes' },
  ];

  return `
  <div class="section-head"><h2>Toner Inventory</h2>${dataSourceBadge(source)}</div>
  ${importPanel({ id: 'tonerimport', label: 'Toner Stock', sampleHint: 'manufacturer, model, compatible, qty, min, unitCost, location' })}
  <div class="stat-grid">
    <div class="stat">Current Stock (units)<div class="value">${items.reduce((s, i) => s + i.qty, 0)}</div></div>
    <div class="stat ${low ? 'warn' : 'ok'}">Low Stock Items<div class="value">${low}</div></div>
    <div class="stat ${out ? 'crit' : 'ok'}">Out of Stock Items<div class="value">${out}</div></div>
    <div class="stat">Estimated Stock Value<div class="value" style="font-size:20px;">${money(totalValue)}</div></div>
  </div>
  ${dataTable(cols, items, { emptyText: source === 'none' ? 'No data available. Import a toner stock list above or connect a live backend.' : 'No matching records.' })}
  <div class="section-head"><h3>Record a Transaction</h3><span class="small-muted">Nothing is applied until you confirm the preview.</span></div>
  <div class="card" style="padding:16px;">
    ${items.length ? `
    <div class="toolbar" style="margin-bottom:10px;">
      ${TXN_TYPES.map(t => `<button class="chip-btn ${activeTxnType === t ? 'active' : ''}" data-action="set-txn-type" data-type="${t}">${t}</button>`).join('')}
    </div>
    ${renderTonerForm(activeTxnType, items, printers)}
    <div id="txn_error"></div>
    ` : '<div class="hint">Import a toner stock list above before recording transactions.</div>'}
  </div>
  <div class="section-head"><h3>Transaction History</h3></div>
  ${dataTable(txnCols, transactions.slice().reverse(), { emptyText: 'No transactions recorded yet.' })}
  `;
}

function renderTonerForm(type, items, printers){
  const itemOptions = items.map(i => `<option value="${esc(i.id)}">${esc(i.manufacturer)} ${esc(i.model)} (${i.qty} in stock)</option>`).join('');
  const printerOptions = printers.map(p => `<option value="${esc(p.name)}">${esc(p.name)} — ${esc(p.department)}</option>`).join('');
  const common = `<label class="field"><span>Toner Model</span><select id="txn_item">${itemOptions}</select></label>
    <label class="field"><span>Quantity</span><input type="number" id="txn_qty" min="1" value="1"></label>`;

  if(type === 'Issue Toner'){
    return `<div class="txn-form">
      ${common}
      <label class="field"><span>Printer</span><select id="txn_printer">${printerOptions}</select></label>
      <label class="field"><span>Department</span><select id="txn_dept">${DEPARTMENTS.map(d => `<option>${d}</option>`).join('')}</select></label>
      <label class="field"><span>Issued To</span><input type="text" id="txn_issuedto" placeholder="Name of requester"></label>
      <label class="field"><span>Logged By</span><input type="text" id="txn_by" value="${esc(getState().currentUser)}"></label>
      <label class="field wide"><span>Notes</span><input type="text" id="txn_notes" placeholder="Optional"></label>
    </div>
    <div class="toolbar" style="margin-top:10px;"><button class="btn primary" data-action="preview-txn" data-type="Issue">Preview Transaction</button></div>`;
  }
  if(type === 'Receive Stock'){
    return `<div class="txn-form">${common}
      <label class="field"><span>Logged By</span><input type="text" id="txn_by" value="${esc(getState().currentUser)}"></label>
      <label class="field wide"><span>Notes</span><input type="text" id="txn_notes" placeholder="e.g. PO number"></label>
    </div>
    <div class="toolbar" style="margin-top:10px;"><button class="btn primary" data-action="preview-txn" data-type="Receive">Preview Transaction</button></div>`;
  }
  if(type === 'Return Toner'){
    return `<div class="txn-form">${common}
      <label class="field"><span>Logged By</span><input type="text" id="txn_by" value="${esc(getState().currentUser)}"></label>
      <label class="field wide"><span>Notes</span><input type="text" id="txn_notes" placeholder="Reason for return"></label>
    </div>
    <div class="toolbar" style="margin-top:10px;"><button class="btn primary" data-action="preview-txn" data-type="Return">Preview Transaction</button></div>`;
  }
  return `<div class="txn-form">${common}
    <label class="field"><span>Adjustment Direction</span><select id="txn_dir"><option value="+">Increase (+)</option><option value="-">Decrease (−)</option></select></label>
    <label class="field"><span>Logged By</span><input type="text" id="txn_by" value="${esc(getState().currentUser)}"></label>
    <label class="field wide"><span>Reason</span><input type="text" id="txn_notes" placeholder="e.g. cycle count correction"></label>
  </div>
  <div class="toolbar" style="margin-top:10px;"><button class="btn primary" data-action="preview-txn" data-type="Adjustment">Preview Transaction</button></div>`;
}

function readForm(type){
  const itemId = document.getElementById('txn_item').value;
  const qty = document.getElementById('txn_qty').value;
  const by = document.getElementById('txn_by').value || getState().currentUser;
  const notesEl = document.getElementById('txn_notes');
  const notes = notesEl ? notesEl.value : '';
  const base = { itemId, qty, by, notes };
  if(type === 'Issue'){
    return { ...base, printer: document.getElementById('txn_printer').value, department: document.getElementById('txn_dept').value, issuedTo: document.getElementById('txn_issuedto').value || '—' };
  }
  if(type === 'Adjustment'){
    return { ...base, direction: document.getElementById('txn_dir').value };
  }
  return base;
}

const SERVICE_BY_TYPE = {
  Issue: (input) => toner.issueToner(input),
  Receive: (input) => toner.receiveStock(input),
  Return: (input) => toner.returnToner(input),
  Adjustment: (input) => toner.adjustStock(input),
};

function previewModalHtml(proposed){
  return `
    <b>Proposed Transaction — not yet applied</b>
    <table style="margin-top:8px;">
      <tr><td>Type</td><td>${esc(proposed.type)}</td></tr>
      <tr><td>Toner</td><td>${esc(proposed.model)}</td></tr>
      <tr><td>Quantity</td><td>${proposed.qty} (${proposed.delta > 0 ? '+' : ''}${proposed.delta} to stock)</td></tr>
      ${proposed.printer ? `<tr><td>Printer</td><td>${esc(proposed.printer)}</td></tr>` : ''}
      ${proposed.department ? `<tr><td>Department</td><td>${esc(proposed.department)}</td></tr>` : ''}
      ${proposed.issuedTo ? `<tr><td>Issued To</td><td>${esc(proposed.issuedTo)}</td></tr>` : ''}
      <tr><td>Logged By</td><td>${esc(proposed.by)}</td></tr>
      <tr><td>Notes</td><td>${esc(proposed.notes || '—')}</td></tr>
      <tr><td>Resulting Stock</td><td>${proposed.currentStock} &rarr; ${proposed.resultingStock}</td></tr>
    </table>
    <div class="toolbar" style="margin-top:14px;">
      <button class="btn primary" data-action="confirm">Confirm Transaction</button>
      <button class="btn ghost" data-action="cancel">Cancel</button>
    </div>`;
}

export function postRender(){ switchImportTab('tonerimport', 'file'); }

export function getActions(){
  return {
    'set-txn-type': (el) => { activeTxnType = el.dataset.type; rerender(); },

    'preview-txn': async (el) => {
      const type = el.dataset.type;
      const input = readForm(type);
      const result = await SERVICE_BY_TYPE[type](input);
      const errorEl = document.getElementById('txn_error');
      if(!result.valid){
        if(errorEl) errorEl.innerHTML = `<div class="status-msg err">${esc(result.error)}</div>`;
        return;
      }
      if(errorEl) errorEl.innerHTML = '';
      openModal(previewModalHtml(result.proposed), {
        confirm: async () => {
          await toner.confirmTransaction(result.proposed);
          closeModal();
          rerender();
        },
        cancel: () => closeModal(),
      });
    },

    // Each handler below awaits rerender() BEFORE calling setImportStatus():
    // rerender() replaces the whole page, including the *_status div the
    // message targets, so writing the message first gets it wiped out before
    // the browser ever paints it.
    'import-tab': (el) => switchImportTab(el.dataset.panel, el.dataset.tab),
    'import-file': async (el) => {
      const panel = el.dataset.panel;
      const file = document.getElementById(panel + '_file').files[0];
      if(!file){ setImportStatus(panel, false, 'Choose a CSV or Excel file first.'); return; }
      let ok = true, msg;
      try{
        const rows = await parseImportFile(file);
        await toner.importInventoryFromRows(rows);
        msg = `Imported ${rows.length} row(s) from ${file.name}. Data marked as Imported.`;
      }catch(err){ ok = false; msg = 'Could not parse file: ' + err.message; }
      await rerender();
      setImportStatus(panel, ok, msg);
    },
    'import-json': async (el) => {
      const panel = el.dataset.panel;
      const raw = document.getElementById(panel + '_json').value.trim();
      if(!raw){ setImportStatus(panel, false, 'Paste JSON first.'); return; }
      let ok = true, msg;
      try{
        const rows = parseImportJSON(raw);
        await toner.importInventoryFromRows(rows);
        msg = `Loaded ${rows.length} row(s) from pasted JSON. Data marked as Imported.`;
      }catch(err){ ok = false; msg = 'Invalid JSON: ' + err.message; }
      await rerender();
      setImportStatus(panel, ok, msg);
    },
    'import-reset': async (el) => {
      await toner.clearImport();
      await rerender();
      setImportStatus(el.dataset.panel, true, 'Import cleared.');
    },
  };
}
