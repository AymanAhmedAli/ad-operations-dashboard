/*
  Toner Inventory service.

  Unlike Active Directory/FortiGate/Printers (external systems this app only
  ever reads), toner records are this app's own data — once the backend
  (../../backend, SQL Server Express) is reachable, it's the real system of
  record and is used for everything by default. A local CSV/Excel/JSON
  import still overrides it (e.g. staging a fresh inventory list before the
  backend is fully set up); clearing that import goes back to trying the
  live backend first, exactly like every other service here. If neither an
  import nor the backend is available, this falls back to a local,
  localStorage-persisted list that starts empty — transactions still work
  offline against whatever the user has added, but nothing is fabricated.

  Endpoints used:
    GET  /api/toner/inventory
    GET  /api/toner/transactions
    POST /api/toner/transactions/preview
    POST /api/toner/transactions/confirm
*/
import { storageGet, storageSet, STORAGE_KEYS } from '../storage.js';
import { redactRow, delay, uid } from '../utils.js';
import { setDataSourceMode, setState } from '../state.js';
import { apiGet, apiPost } from '../api-client.js';

// The local fallback store: either an explicit import, or (if none) a
// mutable working copy that starts empty - used whenever the live backend
// isn't in play.
let localItems = storageGet(STORAGE_KEYS.tonerItems, null) || [];
let localTransactions = storageGet(STORAGE_KEYS.tonerTxns, null) || [];
let isImported = storageGet(STORAGE_KEYS.tonerSource, 'none') === 'imported';
let mode = isImported ? 'imported' : 'none';
setDataSourceMode('toner', mode);

function persistLocal(){
  storageSet(STORAGE_KEYS.tonerItems, localItems);
  storageSet(STORAGE_KEYS.tonerTxns, localTransactions);
  storageSet(STORAGE_KEYS.tonerSource, isImported ? 'imported' : 'none');
}
function setMode(next){ mode = next; setDataSourceMode('toner', mode); }

// The backend's GET endpoints return raw SQL column names (PascalCase);
// everything else in this app expects the same lowercase/camelCase shape
// the rest of this file already uses.
function normalizeItem(row){
  return { id: row.Id, manufacturer: row.Manufacturer, model: row.Model, compatible: row.Compatible, qty: Number(row.Qty), min: Number(row.Min), unitCost: Number(row.UnitCost), location: row.Location };
}
function normalizeTxn(row){
  return { id: row.Id, itemId: row.ItemId, type: row.Type, model: row.Model, qty: Number(row.Qty), delta: Number(row.Delta), printer: row.Printer, department: row.Department, issuedTo: row.IssuedTo, by: row.LoggedBy, notes: row.Notes, time: row.CreatedAt };
}

async function tryLiveItems(){
  try{
    const res = await apiGet('/toner/inventory');
    if(Array.isArray(res)) return res.map(normalizeItem);
  }catch(err){ /* backend/database unreachable */ }
  return null;
}

export async function getInventory(){
  await delay(0);
  if(isImported){ setMode('imported'); return localItems; }
  const live = await tryLiveItems();
  if(live){ setMode('live'); return live; }
  setMode('none');
  return localItems;
}
export async function getTransactions(){
  await delay(0);
  let transactions = localTransactions;
  if(!isImported){
    try{
      const res = await apiGet('/toner/transactions');
      if(Array.isArray(res)) transactions = res.map(normalizeTxn);
    }catch(err){ /* backend/database unreachable - use the local log */ }
  }
  setState({ tonerTransactions: transactions });
  return transactions;
}
export async function getSource(){ return mode; }

export function getStockState(item){
  if(item.qty <= 0) return 'out';
  if(item.qty < item.min) return 'low';
  return 'ok';
}

export async function importInventoryFromRows(rows){
  localItems = rows.map(r => {
    const x = redactRow(r);
    x.id = x.id || uid();
    x.qty = Number(x.qty || 0);
    x.min = Number(x.min || 0);
    x.unitCost = Number(x.unitCost || 0);
    return x;
  });
  isImported = true;
  persistLocal();
  setMode('imported');
}
export async function clearImport(){
  localItems = [];
  isImported = false;
  persistLocal();
  await getInventory();
}

/*
  previewTransaction() performs the calculation and validation only — it
  never mutates inventory. The page always shows this result to the user and
  calls confirmTransaction() only after they explicitly confirm, so a
  transaction can never be applied silently. When the backend is live, the
  exact same rule is enforced server-side too (see
  backend/modules/Toner.Service.psm1) - the frontend never trusts its own
  math over the database's, it just mirrors the same contract locally when
  the backend isn't reachable.
*/
export async function previewTransaction(input){
  if(!isImported){
    try{
      return await apiPost('/toner/transactions/preview', input);
    }catch(err){ /* backend/database unreachable - fall through to local calculation */ }
  }
  return previewTransactionLocally(input);
}

function previewTransactionLocally({ type, itemId, qty, printer, department, issuedTo, by, notes, direction }){
  const item = localItems.find(i => i.id === itemId);
  if(!item) return { valid: false, error: 'Unknown toner item.' };
  qty = Math.max(1, Number(qty || 1));

  let delta = 0, label = type;
  if(type === 'Issue') delta = -qty;
  else if(type === 'Receive') delta = qty;
  else if(type === 'Return') delta = qty;
  else if(type === 'Adjustment'){ delta = direction === '-' ? -qty : qty; label = `Adjustment (${direction})`; }

  if(delta < 0 && item.qty + delta < 0){
    return { valid: false, error: `Cannot issue/decrease ${qty} — only ${item.qty} in stock.` };
  }

  return {
    valid: true,
    proposed: {
      id: uid(),
      time: new Date().toISOString().slice(0, 16).replace('T', ' '),
      type: label,
      itemId,
      model: `${item.manufacturer} ${item.model}`,
      qty: Math.abs(delta),
      delta,
      printer: printer || '',
      department: department || '',
      issuedTo: issuedTo || '',
      by: by || '',
      notes: notes || '',
      resultingStock: item.qty + delta,
      currentStock: item.qty,
    },
  };
}

// Applies a transaction object previously returned by previewTransaction().
export async function confirmTransaction(proposed){
  if(!isImported){
    try{
      const res = await apiPost('/toner/transactions/confirm', proposed);
      if(res && res.success) return res.transaction;
    }catch(err){ /* backend/database unreachable - fall through to local apply */ }
  }
  const item = localItems.find(i => i.id === proposed.itemId);
  if(item) item.qty += proposed.delta;
  localTransactions.push(proposed);
  persistLocal();
  setState({ tonerTransactions: localTransactions });
  return proposed;
}

/* Semantic convenience wrappers around previewTransaction() — the UI still
   always renders the preview and requires an explicit confirmTransaction(). */
export function issueToner({ itemId, qty, printer, department, issuedTo, by, notes }){
  return previewTransaction({ type: 'Issue', itemId, qty, printer, department, issuedTo, by, notes });
}
export function receiveStock({ itemId, qty, by, notes }){
  return previewTransaction({ type: 'Receive', itemId, qty, by, notes });
}
export function returnToner({ itemId, qty, by, notes }){
  return previewTransaction({ type: 'Return', itemId, qty, by, notes });
}
export function adjustStock({ itemId, qty, direction, by, notes }){
  return previewTransaction({ type: 'Adjustment', itemId, qty, direction, by, notes });
}
