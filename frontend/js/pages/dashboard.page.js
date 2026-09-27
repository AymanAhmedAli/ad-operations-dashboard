/* Dashboard page — KPI strip + operational widgets + section shortcuts.
   Page code never touches mock data directly; everything below comes from
   a service call, and every chart/list only ever renders real, already-
   computed counts — never an invented trend or distribution. */
import { esc, num } from '../utils.js';
import { pill, dataSourceBadge } from '../components/badges.js';
import { donutChart, barChart } from '../components/mini-chart.js';
import { navigate } from '../router.js';
import { getOverallDataMode } from '../state.js';

import * as ad from '../services/active-directory.service.js';
import * as fortigate from '../services/fortigate.service.js';
import * as printer from '../services/printer.service.js';
import * as toner from '../services/toner.service.js';
import * as alerts from '../services/alert.service.js';

const SECTION_META = {
  'active-directory': { label: 'Active Directory', desc: 'Users, computers, lockouts and password expiry', color: 'var(--ic-violet)', icon: '&#128100;' },
  fortigate: { label: 'FortiGate', desc: 'Firewall health, VPN tunnels and connected devices', color: 'var(--ic-blue)', icon: '&#128225;' },
  'network-map': { label: 'Network Map', desc: 'Visual topology of connected devices, VLANs and printers', color: 'var(--ic-blue)', icon: '&#127760;' },
  printers: { label: 'Printers', desc: 'Status, toner and page counts across the fleet', color: 'var(--ic-green)', icon: '&#128424;' },
  toner: { label: 'Toner Inventory', desc: 'Stock levels, valuation and issue/receive transactions', color: 'var(--ic-orange)', icon: '&#129529;' },
  'knowledge-base': { label: 'Knowledge Base', desc: 'Searchable procedures across every IT domain', color: 'var(--ic-cyan)', icon: '&#128218;' },
  reports: { label: 'Reports', desc: 'Structured, filterable operational reports', color: 'var(--ic-amber)', icon: '&#128202;' },
  alerts: { label: 'Alerts', desc: 'Issues auto-linked to the recommended fix', color: 'var(--ic-rose)', icon: '&#9888;' },
  assistant: { label: 'IT Assistant', desc: 'Guided diagnostics for the current issue', color: 'var(--ic-pink)', icon: '&#128172;' },
};

function statusToTone(s){ return { healthy: 'ok', warning: 'warn', critical: 'crit', offline: 'unknown', up: 'ok', down: 'crit' }[s] || 'unknown'; }

export async function render(){
  const [users, fgStatus, printers, tonerItems, tonerTxns, activeAlerts] = await Promise.all([
    ad.getUsers(), fortigate.getOverallStatus(),
    printer.getPrinters(), toner.getInventory(), toner.getTransactions(), alerts.getAlerts(),
  ]);
  const insights = await ad.getInsights();
  // getSource() must run after the AD data calls resolve, not in parallel
  // with them - it just reads whatever mode they last set, so calling it
  // concurrently can report the previous render's mode.
  const adSource = await ad.getSource();

  const offlinePrinters = printers.filter(p => !p.online).length;
  const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical').length;
  const tonerByState = { ok: 0, low: 0, out: 0 };
  tonerItems.forEach(t => tonerByState[toner.getStockState(t)]++);
  const printersByStatus = { healthy: 0, warning: 0, critical: 0, offline: 0 };
  printers.forEach(p => printersByStatus[printer.getStatus(p)]++);

  // Five headline numbers only - the full per-domain breakdowns live on
  // each section's own page. No fabricated trend arrows here: none of
  // this data has a real history to compare against yet.
  const kpiStrip = `
    <div class="kpi-strip">
      <div class="kpi-chip"><div class="kpi-icon" style="background:var(--ic-violet)">&#128100;</div><div class="kpi-body"><div class="kpi-value">${num(users.length)}</div><div class="kpi-label">AD Users</div></div></div>
      <div class="kpi-chip"><div class="kpi-icon" style="background:${insights.locked.length ? 'var(--ic-rose)' : 'var(--ic-green)'}">&#128274;</div><div class="kpi-body"><div class="kpi-value">${num(insights.locked.length)}</div><div class="kpi-label">Locked Accounts</div></div></div>
      <div class="kpi-chip"><div class="kpi-icon" style="background:var(--ic-blue)">&#128225;</div><div class="kpi-body"><div class="kpi-value" style="font-size:15px;">${pill(statusToTone(fgStatus), fgStatus[0].toUpperCase() + fgStatus.slice(1))}</div><div class="kpi-label">FortiGate</div></div></div>
      <div class="kpi-chip"><div class="kpi-icon" style="background:${offlinePrinters ? 'var(--ic-rose)' : 'var(--ic-green)'}">&#128424;</div><div class="kpi-body"><div class="kpi-value">${num(offlinePrinters)}</div><div class="kpi-label">Offline Printers</div></div></div>
      <div class="kpi-chip"><div class="kpi-icon" style="background:${criticalAlerts ? 'var(--ic-pink)' : 'var(--ic-green)'}">&#9888;</div><div class="kpi-body"><div class="kpi-value">${num(criticalAlerts)}</div><div class="kpi-label">Critical Alerts</div></div></div>
    </div>`;

  const alertsWidget = `
    <div class="widget-card">
      <div class="widget-header"><h3>Active Alerts</h3><span class="small-muted">${activeAlerts.length}</span></div>
      ${activeAlerts.length ? `<div class="mini-list">${activeAlerts.slice(0, 5).map(a => `
        <div class="mini-list-item" data-action="go" data-route="alerts" style="cursor:pointer;">
          ${pill(a.severity === 'critical' ? 'crit' : 'warn', a.severity)}
          <div class="mini-list-main">
            <div class="mini-list-title">${esc(a.type)}</div>
            <div class="mini-list-sub">${esc(a.message)}</div>
          </div>
        </div>`).join('')}</div>` : '<div class="widget-empty">No active alerts.</div>'}
    </div>`;

  const tonerDonutWidget = `
    <div class="widget-card">
      <div class="widget-header"><h3>Toner Stock Health</h3></div>
      ${donutChart([
        { label: 'In Stock', value: tonerByState.ok, tone: 'ok' },
        { label: 'Low Stock', value: tonerByState.low, tone: 'warn' },
        { label: 'Out of Stock', value: tonerByState.out, tone: 'crit' },
      ])}
    </div>`;

  const printersBarWidget = `
    <div class="widget-card">
      <div class="widget-header"><h3>Printers by Status</h3></div>
      ${barChart([
        { label: 'Healthy', value: printersByStatus.healthy, tone: 'ok' },
        { label: 'Warning', value: printersByStatus.warning, tone: 'warn' },
        { label: 'Critical', value: printersByStatus.critical, tone: 'crit' },
        { label: 'Offline', value: printersByStatus.offline, tone: 'unknown' },
      ])}
    </div>`;

  const recentTxns = tonerTxns.slice().reverse().slice(0, 5);
  const txnsWidget = `
    <div class="widget-card">
      <div class="widget-header"><h3>Recent Toner Transactions</h3><span class="widget-menu" data-action="go" data-route="toner" style="cursor:pointer;">&#8250;</span></div>
      ${recentTxns.length ? `<div class="mini-list">${recentTxns.map(t => `
        <div class="mini-list-item">
          ${pill(t.type.startsWith('Issue') ? 'warn' : t.type.startsWith('Receive') ? 'ok' : 'unknown', t.type)}
          <div class="mini-list-main">
            <div class="mini-list-title">${esc(t.model)} &times; ${esc(t.qty)}</div>
            <div class="mini-list-sub">${esc(t.department || t.printer || '—')} · ${esc(t.time)}</div>
          </div>
        </div>`).join('')}</div>` : '<div class="widget-empty">No transactions recorded yet.</div>'}
    </div>`;

  const navCards = Object.keys(SECTION_META).map(routeId => {
    const m = SECTION_META[routeId];
    return `<div class="nav-card" data-action="go" data-route="${routeId}"><div class="ic" style="background:${m.color}">${m.icon}</div><h3>${esc(m.label)}</h3><p>${esc(m.desc)}</p></div>`;
  }).join('');

  return `
    <div class="info-banner">
      <div class="ib-head"><div class="ib-icon">&#8505;</div><h3>Data Source: ${esc(getOverallDataMode())}</h3></div>
      <p>Every figure below comes from imported data or a live backend feed across Active Directory, FortiGate, printers and toner — nothing is fabricated. Use each section's Import panel to load your own CSV, Excel or JSON export, or connect a live backend for real-time data.</p>
      <div class="ib-checks">
        <span><span class="tick">&#10003;</span> Rule-based Knowledge Base search</span>
        <span><span class="tick">&#10003;</span> CSV / Excel / JSON import per section</span>
        <span><span class="tick">&#10003;</span> Natural-language queries &amp; reports</span>
        <span><span class="tick">&#10003;</span> Toner transactions with confirm-before-apply</span>
      </div>
    </div>
    <div class="section-head"><h2>Operational Summary</h2>${dataSourceBadge(adSource)}</div>
    ${kpiStrip}
    <div class="widget-grid">
      ${alertsWidget}
      ${tonerDonutWidget}
      ${printersBarWidget}
      ${txnsWidget}
    </div>
    <div class="section-head"><h2>Sections</h2></div>
    <div class="nav-cards">${navCards}</div>
  `;
}

export function getActions(){
  return {
    go: (el) => navigate(el.dataset.route),
  };
}
