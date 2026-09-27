/* Active Directory page. All data access goes through active-directory.service.js. */
import { esc, fmtDate } from '../utils.js';
import { dataTable } from '../components/table.js';
import { pill, dataSourceBadge } from '../components/badges.js';
import { queryBox } from '../components/query-box.js';
import { renderEmpty } from '../components/empty-state.js';
import { setImportStatus } from '../components/import-panel.js';
import { openModal, closeModal } from '../components/modal.js';
import { getState, updateFilters } from '../state.js';
import { rerender } from '../router.js';
import * as ad from '../services/active-directory.service.js';

function unlockButton(r){
  return r.locked ? `<button class="btn ghost sm" data-action="unlock-user" data-username="${esc(r.username)}" data-name="${esc(r.displayName || r.username)}">Unlock</button>` : '';
}

const USER_COLS = [
  { key: 'username', label: 'Username' },
  { key: 'displayName', label: 'Display Name' },
  { key: 'email', label: 'Email' },
  { key: 'department', label: 'Department' },
  { key: 'jobTitle', label: 'Job Title' },
  { key: 'ou', label: 'OU' },
  { key: 'enabled', label: 'Enabled', render: r => pill(r.enabled ? 'ok' : 'crit', r.enabled ? 'Enabled' : 'Disabled') },
  { key: 'locked', label: 'Locked', render: r => r.locked ? pill('crit', 'Locked') : pill('ok', 'No') },
  { key: 'passwordExpiry', label: 'Pwd Expiry', render: r => fmtDate(r.passwordExpiry) },
  { key: 'passwordLastSet', label: 'Pwd Last Set', render: r => fmtDate(r.passwordLastSet) },
  { key: 'lastLogon', label: 'Last Login', render: r => fmtDate(r.lastLogon) },
  { key: 'actions', label: '', render: unlockButton },
];
const COMPUTER_COLS = [
  { key: 'computerName', label: 'Computer' },
  { key: 'os', label: 'OS' },
  { key: 'version', label: 'Version' },
  { key: 'ou', label: 'OU' },
  { key: 'enabled', label: 'Enabled', render: r => pill(r.enabled ? 'ok' : 'crit', r.enabled ? 'Enabled' : 'Disabled') },
  { key: 'lastLogon', label: 'Last Logon', render: r => fmtDate(r.lastLogon) },
  { key: 'lastSeen', label: 'Last Seen', render: r => fmtDate(r.lastSeen) },
];
const QUERY_COLS = [
  { key: 'username', label: 'Username' }, { key: 'displayName', label: 'Name' }, { key: 'department', label: 'Dept' },
  { key: 'enabled', label: 'Enabled', render: r => r.enabled ? 'Yes' : 'No' },
  { key: 'locked', label: 'Locked', render: r => r.locked ? 'Yes' : 'No' },
  { key: 'passwordExpiry', label: 'Pwd Expiry', render: r => fmtDate(r.passwordExpiry) },
  { key: 'actions', label: '', render: unlockButton },
];
const QUERY_COMPUTER_COLS = [
  { key: 'computerName', label: 'Computer' }, { key: 'os', label: 'OS' }, { key: 'ou', label: 'OU' }, { key: 'lastSeen', label: 'Last Seen' },
];

export async function render(){
  const [users, computers] = await Promise.all([ad.getUsers(), ad.getComputers()]);
  const insights = await ad.getInsights(users, computers);
  const source = await ad.getSource();
  const view = getState().filters.adView;

  const views = {
    all: { label: 'All Users', rows: users },
    locked: { label: 'Locked Accounts', rows: insights.locked },
    disabled: { label: 'Disabled Accounts', rows: insights.disabled },
    expiring: { label: 'Passwords Expiring ≤ 7 Days', rows: insights.expiring7 },
    inactiveusers: { label: 'Users Inactive 30+ Days', rows: insights.inactiveUsers30 },
    recent: { label: 'Recently Created (30d)', rows: insights.recentlyCreated },
    inactivecomputers: { label: 'Computers Inactive 30+ Days', rows: insights.inactiveComputers30 },
  };
  const activeView = views[view] || views.all;
  const isComputerView = view === 'inactivecomputers';

  return `
  <div class="section-head"><h2>Active Directory</h2>${dataSourceBadge(source)}</div>
  <div id="unlock_status"></div>
  ${queryBox('ad', ['Show me all locked users', 'Which passwords expire this week?', 'Show computers inactive for more than 30 days', 'How many disabled users are in Finance?'])}
  <div class="stat-grid">
    <div class="stat"><div class="label">Users</div><div class="value">${users.length}</div></div>
    <div class="stat crit"><div class="label">Locked</div><div class="value">${insights.locked.length}</div></div>
    <div class="stat warn"><div class="label">Disabled</div><div class="value">${insights.disabled.length}</div></div>
    <div class="stat warn"><div class="label">Expiring ≤ 7d</div><div class="value">${insights.expiring7.length}</div></div>
    <div class="stat"><div class="label">Computers</div><div class="value">${computers.length}</div></div>
    <div class="stat warn"><div class="label">Inactive Computers</div><div class="value">${insights.inactiveComputers30.length}</div></div>
  </div>
  <div class="toolbar">
    ${Object.keys(views).map(k => `<button class="chip-btn ${view === k ? 'active' : ''}" data-action="set-view" data-view="${k}">${esc(views[k].label)} (${views[k].rows.length})</button>`).join('')}
  </div>
  ${dataTable(isComputerView ? COMPUTER_COLS : USER_COLS, activeView.rows, { emptyText: source === 'none' ? 'No data available. Connect a live backend to see Active Directory data.' : 'No matching records.' })}
  `;
}

export function getActions(){
  return {
    'set-view': (el) => { updateFilters({ adView: el.dataset.view }); rerender(); },

    'ask:ad': () => runAskAd(),
    'ask-example:ad': (el) => {
      document.getElementById('ad_input').value = el.dataset.example;
      runAskAd();
    },

    'unlock-user': (el) => {
      const username = el.dataset.username;
      const name = el.dataset.name;
      openModal(`
        <b>Unlock Account — not yet applied</b>
        <p style="margin:12px 0;">Unlock <b>${esc(name)}</b> (${esc(username)})? This calls the real Active Directory unlock action on whatever domain the backend is connected to.</p>
        <div class="toolbar" style="margin-top:14px;">
          <button class="btn primary" data-action="confirm">Unlock</button>
          <button class="btn ghost" data-action="cancel">Cancel</button>
        </div>`, {
        confirm: async () => {
          closeModal();
          // rerender() replaces the whole page - including the #unlock_status
          // div this message targets - so it must finish BEFORE we write the
          // message, not after (setImportStatus-then-rerender would get the
          // message wiped out before the browser ever paints it).
          let ok = true, msg;
          try{
            await ad.unlockUser(username);
            msg = `${username} unlocked.`;
          }catch(err){
            ok = false;
            msg = `Could not unlock ${username}: ${err.message}`;
          }
          await rerender();
          setImportStatus('unlock', ok, msg);
        },
        cancel: () => closeModal(),
      });
    },
  };

  async function runAskAd(){
    const input = document.getElementById('ad_input');
    const box = document.getElementById('ad_answer');
    const q = input.value.trim();
    if(!q) return;
    const result = await ad.askQuestion(q);
    const cols = result.entity === 'computer' ? QUERY_COMPUTER_COLS : QUERY_COLS;
    box.innerHTML = `<div class="qa-answer">${esc(result.text)}${result.rows.length ? dataTable(cols, result.rows) : renderEmpty('No data is currently available for this item.')}</div>`;
    if(result.view){ updateFilters({ adView: result.view }); }
  }
}
