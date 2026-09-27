/*
  Generic, dependency-free helpers shared across services, components and pages.
  Nothing in this file knows about IT-domain concepts (AD, FortiGate, etc.) —
  that logic belongs in js/services/.
*/

export function esc(s){
  return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function fmtDate(iso){
  if(!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  if(isNaN(d)) return esc(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
export function fmtDateTime(iso){
  const d = new Date(iso);
  if(isNaN(d)) return esc(iso);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function fmtClock(d){
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function daysFromToday(iso){
  const d = new Date(iso + 'T00:00:00');
  return Math.round((d - new Date()) / 86400000);
}
export function isExpiringWithin(iso, n){ const d = daysFromToday(iso); return d >= 0 && d <= n; }
export function isPastDue(iso){ return daysFromToday(iso) < 0; }
export function isInactive(iso, n){ return daysFromToday(iso) <= -n; }
export function isRecent(iso, n){ const d = daysFromToday(iso); return d < 0 && d >= -n; }

export function num(n){ return (n === undefined || n === null || isNaN(n)) ? '—' : Number(n).toLocaleString(); }
export function money(n){ return '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
export function uid(){ return Math.random().toString(36).slice(2, 9); }

// Simulated network latency so the UI's loading states are actually exercised
// while services are still backed by mock data. Remove once real fetch() calls
// provide their own (much larger, variable) latency.
export function delay(ms = 180){ return new Promise(resolve => setTimeout(resolve, ms)); }

/* ---------- Import helpers (CSV / Excel / JSON / redaction / field-mapping) ---------- */

// Anything that looks like a secret gets masked before it ever enters app state.
const SECRET_KEY_RE = /pass|pwd|secret|token|apikey|api_key|credential|privatekey|private_key/i;
const SECRET_VALUE_RE = /^[A-Za-z0-9+/_=-]{20,}$/;
export function redactRow(row){
  const out = {};
  for(const k in row){
    const v = row[k];
    if(SECRET_KEY_RE.test(k)){ out[k] = '[REDACTED]'; continue; }
    if(typeof v === 'string' && SECRET_VALUE_RE.test(v.trim())){ out[k] = '[REDACTED]'; continue; }
    out[k] = v;
  }
  return out;
}

// Renames arbitrary spreadsheet/JSON column headers onto our internal field
// names using a per-domain alias table (see each service's ALIASES constant).
export function mapRow(raw, aliases, booleanFields = []){
  const norm = {};
  for(const k in raw) norm[k.trim().toLowerCase()] = raw[k];
  const out = {};
  for(const field in aliases){
    for(const alias of aliases[field]){
      if(norm[alias] !== undefined){ out[field] = norm[alias]; break; }
    }
  }
  booleanFields.forEach(f => {
    if(f in out) out[f] = /^(true|yes|1|enabled|locked)$/i.test(String(out[f]).trim());
  });
  return out;
}

export function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if(!lines.length) return [];
  const splitLine = l => {
    const out = []; let cur = '', q = false;
    for(let i = 0; i < l.length; i++){
      const c = l[i];
      if(c === '"'){ q = !q; }
      else if(c === ',' && !q){ out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out.map(s => s.trim());
  };
  const headers = splitLine(lines[0]);
  return lines.slice(1).map(l => {
    const cells = splitLine(l);
    const row = {};
    headers.forEach((h, i) => row[h] = cells[i]);
    return row;
  });
}

export function readFileAsText(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsText(file);
  });
}
export function readFileAsArrayBuffer(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsArrayBuffer(file);
  });
}
