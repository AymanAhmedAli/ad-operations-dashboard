/* FortiGate page. All data access goes through fortigate.service.js. */
import { esc, num } from '../utils.js';
import { dataTable } from '../components/table.js';
import { pill, dataSourceBadge } from '../components/badges.js';
import { queryBox } from '../components/query-box.js';
import { importPanel, setImportStatus, switchImportTab, parseImportFile, parseImportJSON } from '../components/import-panel.js';
import { renderEmpty } from '../components/empty-state.js';
import { rerender } from '../router.js';
import * as fortigate from '../services/fortigate.service.js';

function statusToTone(s){ return { up: 'ok', down: 'crit' }[s] || 'unknown'; }

const COLS = {
  iface: [{ key: 'name', label: 'Interface' }, { key: 'role', label: 'Role' }, { key: 'ip', label: 'IP' }, { key: 'status', label: 'Status', render: r => pill(statusToTone(r.status), r.status) }],
  device: [{ key: 'hostname', label: 'Hostname' }, { key: 'ip', label: 'IP' }, { key: 'mac', label: 'MAC' }, { key: 'vendor', label: 'Vendor' }, { key: 'vlan', label: 'VLAN', num: true }, { key: 'bandwidthMbps', label: 'Mbps', num: true }],
  vpnuser: [{ key: 'username', label: 'User' }, { key: 'sourceIp', label: 'Source IP' }, { key: 'connectedSince', label: 'Connected Since' }, { key: 'duration', label: 'Duration' }],
  event: [{ key: 'time', label: 'Time' }, { key: 'severity', label: 'Severity' }, { key: 'event', label: 'Event' }],
};

export async function render(){
  // getSource() must run after the data calls resolve, not in parallel with
  // them - it just reads whatever mode they last set, so calling it
  // concurrently can report the previous render's mode.
  const [device, interfaces, vpnTunnels, vpnUsers, connectedDevices, securityEvents, status] = await Promise.all([
    fortigate.getDevice(), fortigate.getInterfaces(), fortigate.getVpnTunnels(), fortigate.getVpnUsers(),
    fortigate.getConnectedDevices(), fortigate.getSecurityEvents(), fortigate.getOverallStatus(),
  ]);
  const source = await fortigate.getSource();

  const hint = source === 'imported'
    ? '<div class="hint">Live monitoring is not connected in this environment. All values below are imported data, not a real-time feed.</div>'
    : source === 'none'
      ? '<div class="hint">No FortiGate data available. Import a device export below or connect a live backend.</div>'
      : '';

  return `
  <div class="section-head"><h2>FortiGate</h2>${dataSourceBadge(source)}</div>
  ${hint}
  ${importPanel({ id: 'fgtimport', label: 'FortiGate', sampleHint: 'hostname, ip, mac, vendor, iface, vlan, bandwidthMbps (connected devices) — or a full device JSON object' })}
  ${queryBox('fgt', ['Show offline interfaces', 'Show Hikvision devices', 'Show devices connected to VLAN 20', 'Show current VPN users', 'Which devices consume the most bandwidth?', 'Show critical FortiGate events'])}
  ${device ? `
  <div class="stat-grid">
    <div class="stat"><div class="label">Hostname</div><div class="value" style="font-size:16px;">${esc(device.hostname)}</div><div class="sub">${esc(device.model)} · ${esc(device.firmware)}</div></div>
    <div class="stat ${device.cpu > 85 ? 'crit' : device.cpu > 60 ? 'warn' : 'ok'}"><div class="label">CPU</div><div class="value">${device.cpu}%</div></div>
    <div class="stat ${device.memory > 90 ? 'crit' : device.memory > 75 ? 'warn' : 'ok'}"><div class="label">Memory</div><div class="value">${device.memory}%</div></div>
    <div class="stat"><div class="label">Sessions</div><div class="value">${num(device.sessions)}</div></div>
    <div class="stat"><div class="label">Uptime</div><div class="value" style="font-size:15px;">${esc(device.uptime)}</div></div>
    <div class="stat ${status === 'healthy' ? 'ok' : 'warn'}"><div class="label">Overall Status</div><div class="value" style="font-size:15px;">${status[0].toUpperCase() + status.slice(1)}</div></div>
  </div>
  <div class="section-head"><h3>Interfaces</h3></div>
  ${dataTable(COLS.iface, interfaces)}
  <div class="section-head"><h3>VPN Tunnels (Site-to-Site)</h3></div>
  ${dataTable([{ key: 'name', label: 'Tunnel' }, { key: 'type', label: 'Type' }, { key: 'peer', label: 'Peer' }, { key: 'status', label: 'Status', render: r => pill(statusToTone(r.status), r.status) }], vpnTunnels)}
  <div class="section-head"><h3>Active SSL VPN Users</h3></div>
  ${dataTable(COLS.vpnuser, vpnUsers)}
  <div class="section-head"><h3>Connected Devices</h3></div>
  ${dataTable(COLS.device, connectedDevices)}
  <div class="section-head"><h3>Security Events</h3></div>
  ${dataTable([{ key: 'time', label: 'Time' }, { key: 'severity', label: 'Severity', render: r => pill(r.severity === 'critical' ? 'crit' : r.severity === 'warning' ? 'warn' : 'unknown', r.severity) }, { key: 'event', label: 'Event' }], securityEvents)}
  ` : renderEmpty('No FortiGate data available. Import a device export above or connect a live backend.')}
  `;
}

export function postRender(){ switchImportTab('fgtimport', 'file'); }

export function getActions(){
  async function runAskFgt(){
    const input = document.getElementById('fgt_input');
    const box = document.getElementById('fgt_answer');
    const q = input.value.trim();
    if(!q) return;
    const result = await fortigate.askQuestion(q);
    const cols = COLS[result.entity] || COLS.device;
    box.innerHTML = `<div class="qa-answer">${esc(result.text)}${result.rows.length ? dataTable(cols, result.rows) : renderEmpty('No data is currently available for this item.')}</div>`;
  }
  return {
    'ask:fgt': runAskFgt,
    'ask-example:fgt': (el) => { document.getElementById('fgt_input').value = el.dataset.example; runAskFgt(); },

    'import-tab': (el) => switchImportTab(el.dataset.panel, el.dataset.tab),
    // Each handler below awaits rerender() BEFORE calling setImportStatus():
    // rerender() replaces the whole page, including the *_status div the
    // message targets, so writing the message first gets it wiped out before
    // the browser ever paints it.
    'import-file': async (el) => {
      const panel = el.dataset.panel;
      const file = document.getElementById(panel + '_file').files[0];
      if(!file){ setImportStatus(panel, false, 'Choose a CSV or Excel file first.'); return; }
      let ok = true, msg;
      try{
        const rows = await parseImportFile(file);
        await fortigate.importDeviceDataFromRows(rows);
        msg = `Imported ${rows.length} row(s) from ${file.name}. Data marked as Imported.`;
      }catch(err){ ok = false; msg = 'Could not parse file: ' + err.message; }
      await rerender();
      setImportStatus(panel, ok, msg);
    },
    'import-json': async (el) => {
      const panel = el.dataset.panel;
      const raw = document.getElementById(panel + '_json').value.trim();
      if(!raw){ setImportStatus(panel, false, 'Paste JSON first.'); return; }
      let ok = true, msg;
      try{
        const rows = parseImportJSON(raw);
        await fortigate.importDeviceDataFromRows(rows);
        msg = `Loaded ${rows.length} row(s) from pasted JSON. Data marked as Imported.`;
      }catch(err){ ok = false; msg = 'Invalid JSON: ' + err.message; }
      await rerender();
      setImportStatus(panel, ok, msg);
    },
    'import-reset': async (el) => {
      await fortigate.clearImport();
      await rerender();
      setImportStatus(el.dataset.panel, true, 'Import cleared.');
    },
  };
}
