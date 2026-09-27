/*
  Reusable CSV / Excel / paste-JSON import widget used by FortiGate and Toner
  Inventory (Active Directory and Printers have no import step - see their
  own services). This module only knows how to read a file/textarea into an
  array of plain row objects — it has no idea what a "device" or "toner item"
  is. Each page wires the resulting rows into its own service (e.g.
  fortigateService.importDeviceDataFromRows(rows)).
*/
import { esc } from '../utils.js';
import { parseCSV, readFileAsText, readFileAsArrayBuffer } from '../utils.js';

export function importPanel(cfg){
  // cfg: { id, label, sampleHint }
  return `<details class="importpanel" id="${cfg.id}">
    <summary>&#8635; Import ${esc(cfg.label)} data</summary>
    <div class="importpanel-body">
      <div class="import-tabs">
        <button class="active" data-action="import-tab" data-panel="${cfg.id}" data-tab="file">CSV / Excel</button>
        <button data-action="import-tab" data-panel="${cfg.id}" data-tab="json">Paste JSON</button>
      </div>
      <div data-panel-file="${cfg.id}">
        <div class="dropzone">
          <input type="file" accept=".csv,.xlsx,.xls" id="${cfg.id}_file">
          <div class="hint" style="margin-top:6px;">Expected columns: ${esc(cfg.sampleHint)}</div>
        </div>
        <button class="btn primary sm" style="margin-top:8px;" data-action="import-file" data-panel="${cfg.id}">Import File</button>
      </div>
      <div data-panel-json="${cfg.id}" hidden>
        <textarea id="${cfg.id}_json" rows="4" style="width:100%;" placeholder='[{"...": "..."}]'></textarea>
        <button class="btn primary sm" style="margin-top:8px;" data-action="import-json" data-panel="${cfg.id}">Load JSON</button>
      </div>
      <div id="${cfg.id}_status"></div>
      <div class="hint">If a live backend is connected, it will be used automatically once no import is active. <button class="btn ghost sm" data-action="import-reset" data-panel="${cfg.id}">Clear import</button></div>
    </div>
  </details>`;
}

export function setImportStatus(id, ok, message){
  const el = document.getElementById(id + '_status');
  if(el) el.innerHTML = `<div class="status-msg ${ok ? 'ok' : 'err'}">${esc(message)}</div>`;
}

export function switchImportTab(panelId, tab){
  const root = document.getElementById(panelId);
  if(!root) return;
  root.querySelectorAll('.import-tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const filePanel = root.querySelector(`[data-panel-file="${panelId}"]`);
  const jsonPanel = root.querySelector(`[data-panel-json="${panelId}"]`);
  if(filePanel) filePanel.hidden = tab !== 'file';
  if(jsonPanel) jsonPanel.hidden = tab !== 'json';
}

// Reads a File (CSV or Excel) into an array of plain row objects.
export async function parseImportFile(file){
  if(/\.(xlsx|xls)$/i.test(file.name)){
    const buf = await readFileAsArrayBuffer(file);
    const wb = XLSX.read(buf, { type: 'array' }); // global from the CDN <script> in index.html
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
  }
  const text = await readFileAsText(file);
  return parseCSV(text);
}

// Parses pasted JSON into an array of plain row objects, accepting either a
// bare array or a {rows|users|computers|items: [...]} wrapper object.
export function parseImportJSON(raw){
  let data = JSON.parse(raw);
  if(!Array.isArray(data)) data = data.rows || data.users || data.computers || data.items || [data];
  return data;
}
