/*
  FortiGate service.

  Data precedence: an explicit JSON import always wins; otherwise this tries
  the real backend (../../backend/routes/fortigate.routes.ps1). If neither an
  import nor a reachable device is available (no base URL/API token set, or
  the device doesn't respond - see backend/modules/FortiGate.Service.psm1),
  this returns an empty shape with mode 'none'. This app never claims a
  device is being monitored live unless that real connector is actually
  configured and responding, and never fills the gap with a fabricated
  device - see getSource().

  Endpoints used:
    GET /api/fortigate/device
    GET /api/fortigate/interfaces
    GET /api/fortigate/vpn-tunnels
    GET /api/fortigate/vpn-users
    GET /api/fortigate/connected-devices
    GET /api/fortigate/security-events
*/
import { storageGet, storageSet, STORAGE_KEYS } from '../storage.js';
import { redactRow, delay } from '../utils.js';
import { setDataSourceMode } from '../state.js';
import { apiGet } from '../api-client.js';

const EMPTY_DATA = { device: null, interfaces: [], vpnTunnels: [], vpnUsers: [], connectedDevices: [], securityEvents: [] };

let importedData = storageGet(STORAGE_KEYS.fortigate, null);
let isImported = storageGet(STORAGE_KEYS.fortigateSource, 'none') === 'imported';
let mode = isImported ? 'imported' : 'none';
setDataSourceMode('fortigate', mode);

function persist(){
  storageSet(STORAGE_KEYS.fortigate, importedData);
  storageSet(STORAGE_KEYS.fortigateSource, isImported ? 'imported' : 'none');
}
function setMode(next){ mode = next; setDataSourceMode('fortigate', mode); }

// Fetches every FortiGate sub-resource in parallel and assembles them into
// the same shape used elsewhere. All 6 endpoints share one
// Test-FortiGateAvailable() check on the backend, so they agree on
// availability - if the device probe says unavailable, none of the others
// are worth calling either.
async function fetchLive(){
  const device = await apiGet('/fortigate/device');
  if(!device || !device.available) return null;
  const [interfaces, vpnTunnels, vpnUsers, connectedDevices, securityEvents] = await Promise.all([
    apiGet('/fortigate/interfaces'), apiGet('/fortigate/vpn-tunnels'), apiGet('/fortigate/vpn-users'),
    apiGet('/fortigate/connected-devices'), apiGet('/fortigate/security-events'),
  ]);
  return {
    device: device.data,
    interfaces: interfaces.data, vpnTunnels: vpnTunnels.data, vpnUsers: vpnUsers.data,
    connectedDevices: connectedDevices.data, securityEvents: securityEvents.data,
  };
}

async function resolveData(){
  if(isImported){ setMode('imported'); return importedData; }
  try{
    const live = await fetchLive();
    if(live){ setMode('live'); return live; }
  }catch(err){ /* backend unreachable - fall through to no data */ }
  setMode('none');
  return EMPTY_DATA;
}

export async function getDevice(){ await delay(0); return (await resolveData()).device; }
export async function getInterfaces(){ await delay(0); return (await resolveData()).interfaces; }
export async function getVpnTunnels(){ await delay(0); return (await resolveData()).vpnTunnels; }
export async function getVpnUsers(){ await delay(0); return (await resolveData()).vpnUsers; }
export async function getConnectedDevices(){ await delay(0); return (await resolveData()).connectedDevices; }
export async function getSecurityEvents(){ await delay(0); return (await resolveData()).securityEvents; }
export async function getSource(){ return mode; }

export async function getOverallStatus(){
  const data = await resolveData();
  if(!data.device) return 'offline';
  const anyDown = data.interfaces.some(i => i.status === 'down') || data.vpnTunnels.some(t => t.status === 'down');
  const anyCritEvent = data.securityEvents.some(e => e.severity === 'critical');
  if(anyDown || anyCritEvent) return 'warning';
  if(data.device.cpu > 85 || data.device.memory > 90) return 'critical';
  return 'healthy';
}

export async function importDeviceDataFromRows(rows){
  const current = await resolveData();
  // A single full-device export replaces everything; otherwise treat the rows
  // as a connected-devices table (the most common thing an IT team exports).
  if(rows.length === 1 && rows[0].device){
    importedData = rows[0];
  } else {
    importedData = { ...current, connectedDevices: rows.map(redactRow) };
  }
  isImported = true;
  persist();
  setMode('imported');
}
export async function clearImport(){
  importedData = null;
  isImported = false;
  persist();
  await resolveData();
}

export async function askQuestion(question){
  const data = await resolveData();
  const s = question.toLowerCase();

  if(s.includes('offline') && s.includes('interface')){
    const rows = data.interfaces.filter(i => i.status === 'down');
    return { text: `${rows.length} interface(s) currently down.`, rows, entity: 'iface' };
  }
  if(s.includes('hikvision')){
    const rows = data.connectedDevices.filter(d => d.vendor.toLowerCase().includes('hikvision'));
    return { text: `${rows.length} Hikvision device(s) detected via FortiGate.`, rows, entity: 'device' };
  }
  const vlanMatch = s.match(/vlan\s*(\d+)/);
  if(vlanMatch){
    const vlan = Number(vlanMatch[1]);
    const rows = data.connectedDevices.filter(d => d.vlan === vlan);
    return { text: `${rows.length} device(s) on VLAN ${vlan}.`, rows, entity: 'device' };
  }
  if(s.includes('vpn') && s.includes('user')){
    return { text: `${data.vpnUsers.length} active SSL VPN user(s).`, rows: data.vpnUsers, entity: 'vpnuser' };
  }
  if(s.includes('bandwidth')){
    const rows = data.connectedDevices.slice().sort((a, b) => b.bandwidthMbps - a.bandwidthMbps).slice(0, 5);
    return { text: 'Top bandwidth-consuming devices.', rows, entity: 'device' };
  }
  if(s.includes('critical') && s.includes('event')){
    const rows = data.securityEvents.filter(e => e.severity === 'critical');
    return { text: `${rows.length} critical FortiGate event(s).`, rows, entity: 'event' };
  }
  return { text: 'No data is currently available for this item, or the question was not recognized.', rows: [], entity: 'device' };
}
