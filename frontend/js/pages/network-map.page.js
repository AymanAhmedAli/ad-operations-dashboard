/*
  Network Map page — a visual topology of whatever FortiGate/printer data is
  currently loaded (imported or live). Purely a different view of data the
  FortiGate and Printer pages already show; it holds no state and fetches
  nothing of its own beyond those two services. Like every other page, it
  never invents nodes or links that aren't backed by real rows.
*/
import { esc, num } from '../utils.js';
import { pill, dataSourceBadge } from '../components/badges.js';
import { renderEmpty } from '../components/empty-state.js';
import { navigate } from '../router.js';
import * as fortigate from '../services/fortigate.service.js';
import * as printer from '../services/printer.service.js';

function statusToTone(s){ return { healthy: 'ok', warning: 'warn', critical: 'crit', offline: 'unknown' }[s] || 'unknown'; }

// Same combine rule used by dashboard.page.js for a per-page overall badge:
// imported beats live beats none, since an import always overrides that page.
function combineSource(a, b){
  if(a === 'imported' || b === 'imported') return 'imported';
  if(a === 'live' || b === 'live') return 'live';
  return 'none';
}

function polarPoint(cx, cy, r, angle){
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

// Hub-and-spoke SVG: the FortiGate device at the center, one node per VLAN
// cluster and one for printers, spaced evenly around it. Below the diagram,
// each node gets its own detail card listing the real rows behind it.
function topologySvg(hub, nodes){
  const w = 820, h = 360, cx = w / 2, cy = h / 2 - 6, r = 142, nodeR = 32;
  const n = Math.max(nodes.length, 1);
  const placed = nodes.map((node, i) => {
    const angle = (2 * Math.PI * i / n) - Math.PI / 2;
    return { ...node, ...polarPoint(cx, cy, r, angle) };
  });
  const links = placed.map(p => `<line x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}" class="map-link"></line>`).join('');
  const nodeEls = placed.map(p => `
    <g class="map-node" data-tone="${p.tone}" data-action="go" data-route="${p.route}">
      <circle cx="${p.x}" cy="${p.y}" r="${nodeR}"></circle>
      <text x="${p.x}" y="${p.y + 6}" text-anchor="middle" class="map-node-icon">${p.icon}</text>
      <text x="${p.x}" y="${p.y + nodeR + 17}" text-anchor="middle" class="map-node-label">${esc(p.label)}</text>
      <text x="${p.x}" y="${p.y + nodeR + 31}" text-anchor="middle" class="map-node-count">${p.count} device${p.count === 1 ? '' : 's'}</text>
    </g>`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" class="network-map-svg" xmlns="http://www.w3.org/2000/svg">
    ${links}
    <g class="map-hub" data-tone="${hub.tone}" data-action="go" data-route="fortigate">
      <circle cx="${cx}" cy="${cy}" r="42"></circle>
      <text x="${cx}" y="${cy - 6}" text-anchor="middle" class="map-hub-icon">&#128225;</text>
      <text x="${cx}" y="${cy + 15}" text-anchor="middle" class="map-hub-label">${esc(hub.label)}</text>
    </g>
    ${nodeEls}
  </svg>`;
}

export async function render(){
  // Each getSource() must run after its domain's data calls resolve, not in
  // parallel with them - it just reads whatever mode they last set, so
  // calling it concurrently can report the previous render's mode.
  const [device, interfaces, connectedDevices, printers, fgStatus] = await Promise.all([
    fortigate.getDevice(), fortigate.getInterfaces(), fortigate.getConnectedDevices(),
    printer.getPrinters(), fortigate.getOverallStatus(),
  ]);
  const [fgSource, prnSource] = await Promise.all([fortigate.getSource(), printer.getSource()]);
  const source = combineSource(fgSource, prnSource);

  const vlanGroups = {};
  connectedDevices.forEach(d => { (vlanGroups[d.vlan] ??= []).push(d); });
  const vlanIds = Object.keys(vlanGroups).sort((a, b) => Number(a) - Number(b));

  const hasAnything = device || connectedDevices.length || printers.length;

  if(!hasAnything){
    return `
    <div class="section-head"><h2>Network Map</h2>${dataSourceBadge(source)}</div>
    ${renderEmpty('No network data available yet. Import or connect FortiGate and printer data to see the topology here.')}
    <div class="nav-cards" style="margin-top:14px;">
      <div class="nav-card" data-action="go" data-route="fortigate"><div class="ic" style="background:var(--ic-blue)">&#128225;</div><h3>FortiGate</h3><p>Import a device export or connect a live backend</p></div>
      <div class="nav-card" data-action="go" data-route="printers"><div class="ic" style="background:var(--ic-green)">&#128424;</div><h3>Printers</h3><p>Import a printer list or connect a live backend</p></div>
    </div>`;
  }

  const nodes = [
    ...vlanIds.map(vlan => ({
      id: `vlan-${vlan}`, label: `VLAN ${vlan}`, icon: '&#127760;', count: vlanGroups[vlan].length,
      tone: 'ok', route: 'fortigate', devices: vlanGroups[vlan], kind: 'vlan',
    })),
    ...(printers.length ? [{
      id: 'printers', label: 'Printers', icon: '&#128424;', count: printers.length,
      tone: printers.some(p => !p.online) ? 'warn' : 'ok', route: 'printers', devices: printers, kind: 'printers',
    }] : []),
  ];

  const hub = {
    label: device ? device.hostname : 'FortiGate',
    tone: device ? statusToTone(fgStatus) : 'unknown',
  };

  const interfaceRows = interfaces.length ? `
    <div class="widget-card">
      <div class="widget-header"><h3>Interfaces</h3><span class="widget-menu" data-action="go" data-route="fortigate" style="cursor:pointer;">&#8250;</span></div>
      <div class="mini-list">${interfaces.map(i => `
        <div class="mini-list-item">
          ${pill(i.status === 'up' ? 'ok' : 'crit', i.status)}
          <div class="mini-list-main">
            <div class="mini-list-title">${esc(i.name)} — ${esc(i.role || '')}</div>
            <div class="mini-list-sub">${esc(i.ip || '—')}</div>
          </div>
        </div>`).join('')}</div>
    </div>` : '';

  const clusterCards = nodes.map(node => {
    if(node.kind === 'printers'){
      return `
      <div class="widget-card">
        <div class="widget-header"><h3>${node.icon} Printers</h3><span class="widget-menu" data-action="go" data-route="printers" style="cursor:pointer;">&#8250;</span></div>
        <div class="mini-list">${node.devices.map(p => `
          <div class="mini-list-item">
            ${pill(p.online ? 'ok' : 'unknown', p.online ? 'online' : 'offline')}
            <div class="mini-list-main">
              <div class="mini-list-title">${esc(p.name)}</div>
              <div class="mini-list-sub">${esc(p.ip || '—')} · ${esc(p.location || '—')}</div>
            </div>
          </div>`).join('')}</div>
      </div>`;
    }
    return `
    <div class="widget-card">
      <div class="widget-header"><h3>${node.icon} ${esc(node.label)}</h3><span class="small-muted">${node.count} device${node.count === 1 ? '' : 's'}</span></div>
      <div class="mini-list">${node.devices.map(d => `
        <div class="mini-list-item">
          <div class="mini-list-main">
            <div class="mini-list-title">${esc(d.hostname || d.ip)}</div>
            <div class="mini-list-sub">${esc(d.ip)} · ${esc(d.vendor || 'Unknown vendor')} · ${num(d.bandwidthMbps)} Mbps</div>
          </div>
        </div>`).join('')}</div>
    </div>`;
  }).join('');

  return `
  <div class="section-head"><h2>Network Map</h2>${dataSourceBadge(source)}</div>
  <div class="stat-grid">
    <div class="stat ${hub.tone === 'ok' ? 'ok' : hub.tone === 'crit' ? 'crit' : 'warn'}"><div class="label">Gateway</div><div class="value" style="font-size:15px;">${esc(hub.label)}</div></div>
    <div class="stat"><div class="label">Connected Devices</div><div class="value">${num(connectedDevices.length)}</div></div>
    <div class="stat"><div class="label">VLANs</div><div class="value">${num(vlanIds.length)}</div></div>
    <div class="stat"><div class="label">Printers</div><div class="value">${num(printers.length)}</div></div>
  </div>
  <div class="card" style="padding:10px;">${topologySvg(hub, nodes)}</div>
  <div class="widget-grid">
    ${interfaceRows}
    ${clusterCards}
  </div>
  `;
}

export function getActions(){
  return {
    go: (el) => navigate(el.dataset.route),
  };
}
