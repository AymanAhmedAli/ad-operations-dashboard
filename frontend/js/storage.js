/*
  Thin wrapper around localStorage. Services are the ONLY code allowed to
  import this module — pages must never touch localStorage directly, so that
  swapping a service's backing store for a real API later is a one-file change.
*/

export const STORAGE_KEYS = {
  fortigate: 'ithub_fgt',
  fortigateSource: 'ithub_fgt_source',
  tonerItems: 'ithub_toner_items',
  tonerTxns: 'ithub_toner_txns',
  tonerSource: 'ithub_toner_source',
};

export function storageGet(key, fallback){
  try{
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  }catch(e){
    // Private browsing / quota exceeded / JSON corruption — fall back silently,
    // the app still works in-memory for the session.
    return fallback;
  }
}

export function storageSet(key, val){
  try{
    localStorage.setItem(key, JSON.stringify(val));
  }catch(e){
    /* ignore — non-critical persistence */
  }
}
