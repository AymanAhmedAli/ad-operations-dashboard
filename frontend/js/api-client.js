/*
  Thin fetch() wrapper shared by every service that talks to the real
  backend (see ../../backend). Every call is short-timeout and never throws
  past a service boundary uncaught - services decide what "the backend isn't
  reachable" means for their own data (usually: show an empty/no-data state),
  they never let a network error surface as a broken page.

  The backend's base URL is intentionally NOT hard-coded to one environment:
  set `window.IT_OPS_HUB_API_BASE` (e.g. in index.html, or by the SPFx web
  part before it mounts) to point at a real deployment. Defaults to the
  local dev server from ../../backend/README.md.
*/

const DEFAULT_BASE = 'http://localhost:8081/api';
const DEFAULT_TIMEOUT_MS = 4000;

export class ApiError extends Error {
  constructor(status, message){
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function getBaseUrl(){
  if(typeof window !== 'undefined' && window.IT_OPS_HUB_API_BASE){
    return window.IT_OPS_HUB_API_BASE.replace(/\/$/, '');
  }
  return DEFAULT_BASE;
}

async function request(path, options = {}){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try{
    const res = await fetch(getBaseUrl() + path, {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
      credentials: 'include',
    });
    let body = null;
    try{ body = await res.json(); }catch(e){ /* empty/non-JSON body */ }
    if(!res.ok){
      throw new ApiError(res.status, (body && body.error) || res.statusText || 'Request failed');
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export function apiGet(path, options){ return request(path, { ...options, method: 'GET' }); }
export function apiPost(path, body, options){ return request(path, { ...options, method: 'POST', body }); }
export function apiDelete(path, options){ return request(path, { ...options, method: 'DELETE' }); }

// True once we've confirmed the backend responds at all (any status), so
// callers can distinguish "backend is up but this feature isn't configured"
// from "backend isn't reachable" if they ever need to.
export async function isBackendReachable(){
  try{ await apiGet('/health', { timeoutMs: 2500 }); return true; }
  catch(err){ return false; }
}
