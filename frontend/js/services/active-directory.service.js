/*
  Active Directory service.

  No CSV/Excel/JSON import for this domain - it only ever shows the real
  backend (../../backend/routes/active-directory.routes.ps1). If that isn't
  reachable, it returns an empty result with mode 'none' rather than
  fabricating AD users/computers to fill the gap. Every function keeps
  returning the exact same shape regardless of which of the two (none/live)
  actually served it - pages never know or care which happened, only the
  data-source badge does.

  Endpoints used:
    GET /api/active-directory/users
    GET /api/active-directory/computers
*/
import { DEPARTMENTS } from '../mock-data.js';
import { delay, isExpiringWithin, isPastDue, isInactive, isRecent } from '../utils.js';
import { setDataSourceMode } from '../state.js';
import { apiGet, apiPost } from '../api-client.js';

let usersMode = 'none';
let computersMode = 'none';
syncSourceFlag();

function combinedMode(){
  if(usersMode === 'live' || computersMode === 'live') return 'live';
  return 'none';
}
function syncSourceFlag(){ setDataSourceMode('ad', combinedMode()); }

async function resolveUsers(){
  try{
    const res = await apiGet('/active-directory/users');
    if(res && res.available){ usersMode = 'live'; syncSourceFlag(); return res.data; }
  }catch(err){ /* backend unreachable */ }
  usersMode = 'none'; syncSourceFlag();
  return [];
}

async function resolveComputers(){
  try{
    const res = await apiGet('/active-directory/computers');
    if(res && res.available){ computersMode = 'live'; syncSourceFlag(); return res.data; }
  }catch(err){ /* backend unreachable */ }
  computersMode = 'none'; syncSourceFlag();
  return [];
}

export async function getUsers(){ await delay(0); return resolveUsers(); }
export async function getComputers(){ await delay(0); return resolveComputers(); }
export async function getDepartments(){ return DEPARTMENTS; }
export async function getSource(){ return combinedMode(); }

export async function unlockUser(username){
  const res = await apiPost(`/active-directory/users/${encodeURIComponent(username)}/unlock`);
  if(!res || !res.available) throw new Error((res && res.error) || 'Active Directory is not available from this server.');
  if(res.error) throw new Error(res.error);
  return res.data;
}

export async function getInsights(resolvedUsers, resolvedComputers){
  const users = resolvedUsers !== undefined ? resolvedUsers : await resolveUsers();
  const computers = resolvedComputers !== undefined ? resolvedComputers : await resolveComputers();
  return {
    locked:              users.filter(u => u.locked),
    disabled:            users.filter(u => !u.enabled),
    expiring7:           users.filter(u => u.passwordExpiry && (isExpiringWithin(u.passwordExpiry, 7) || isPastDue(u.passwordExpiry))),
    inactiveUsers30:     users.filter(u => u.lastLogon && isInactive(u.lastLogon, 30)),
    inactiveComputers30: computers.filter(c => c.lastSeen && isInactive(c.lastSeen, 30)),
    recentlyCreated:     users.filter(u => u.created && isRecent(u.created, 30)),
  };
}
// Note: askQuestion() calls getInsights() without pre-resolved users/computers
// intentionally — it has no access to the render() lifecycle data.
// Known behavior: may show slightly different counts from summary cards
// if called during a dashboard refresh. Acceptable for current use case.
export async function askQuestion(question){
  await delay(0);
  const s = question.toLowerCase();
  const insights = await getInsights();
  const dept = DEPARTMENTS.find(d => s.includes(d.toLowerCase()));

  if(s.includes('locked')){
    const rows = dept ? insights.locked.filter(u => u.department === dept) : insights.locked;
    return { text: `${rows.length} account(s) currently locked${dept ? ` in ${dept}` : ''}.`, rows, entity: 'user', view: 'locked' };
  }
  if(s.includes('disabled')){
    const rows = dept ? insights.disabled.filter(u => u.department === dept) : insights.disabled;
    return { text: `${rows.length} disabled user(s)${dept ? ` in ${dept}` : ''}.`, rows, entity: 'user', view: 'disabled' };
  }
  if(s.includes('expire') || s.includes('expiring') || s.includes('password')){
    return { text: `${insights.expiring7.length} password(s) expiring within 7 days (including any already past due).`, rows: insights.expiring7, entity: 'user', view: 'expiring' };
  }
  if(s.includes('computer') && s.includes('inactive')){
    return { text: `${insights.inactiveComputers30.length} computer(s) inactive for more than 30 days.`, rows: insights.inactiveComputers30, entity: 'computer', view: 'inactivecomputers' };
  }
  if(s.includes('inactive') && (s.includes('user') || s.includes('account'))){
    return { text: `${insights.inactiveUsers30.length} user(s) inactive for more than 30 days.`, rows: insights.inactiveUsers30, entity: 'user', view: 'inactiveusers' };
  }
  if(s.includes('recent') || s.includes('new account') || s.includes('created')){
    return { text: `${insights.recentlyCreated.length} account(s) created within the last 30 days.`, rows: insights.recentlyCreated, entity: 'user', view: 'recent' };
  }
  return { text: 'No data is currently available for this item, or the question was not recognized. Try one of the example questions below.', rows: [], entity: 'user', view: null };
}
