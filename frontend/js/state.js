/*
  Minimal centralized store — no Redux/Vuex, just an object + a subscribe list.
  Services update `dataSourceMode` when they import/reset data; pages/components
  read/write everything else (filters, selections, conversation history).
*/

const state = {
  currentRoute: 'dashboard',
  // Per-domain source flag: 'none' | 'imported' | 'live'. 'none' means no
  // data is available yet (no import, no reachable live backend) — it is
  // never filled with fabricated placeholder content.
  dataSourceMode: { ad: 'none', fortigate: 'none', printers: 'none', toner: 'none' },
  currentUser: 'it.support@contoso.com',
  filters: {
    adView: 'all',
    printersView: 'all',
    kbCategory: 'All',
  },
  selectedKnowledgeArticle: null,
  assistantConversation: [],
  tonerTransactions: [],
  lastUpdated: new Date(),
};

const listeners = new Set();

export function getState(){
  return state;
}

export function setState(patch){
  Object.assign(state, patch);
  listeners.forEach(fn => fn(state));
}

export function updateFilters(patch){
  Object.assign(state.filters, patch);
  listeners.forEach(fn => fn(state));
}

export function setDataSourceMode(domain, mode){
  state.dataSourceMode = { ...state.dataSourceMode, [domain]: mode };
  listeners.forEach(fn => fn(state));
}

export function subscribe(fn){
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Derived "overall" mode used by the topbar / sidebar badges.
export function getOverallDataMode(){
  const modes = Object.values(state.dataSourceMode);
  if(modes.every(m => m === 'live')) return 'Live';
  if(modes.every(m => m === 'imported')) return 'Imported Data';
  if(modes.every(m => m === 'none')) return 'No Data';
  if(modes.some(m => m === 'imported' || m === 'live')) return 'Partial Data';
  return 'No Data';
}
