/*
  Alerts service. Tries the real backend
  (../../backend/routes/alerts.routes.ps1) — it computes alerts from
  whatever real AD/FortiGate/Printer/Toner data it can currently reach. If
  the backend isn't reachable, this returns an empty list rather than
  fabricating alerts.

  Endpoint used: GET /api/alerts
  The alert-type -> KB/impact/first-checks linking table stays client-side
  either way (it's just used to render whatever alerts come back).
*/
import { ALERT_LINKS } from '../mock-data.js';
import { delay } from '../utils.js';
import { apiGet } from '../api-client.js';

export async function getAlerts(){
  await delay(0);
  try{ return await apiGet('/alerts'); }
  catch(err){ return []; }
}
export async function getCriticalCount(){
  const alerts = await getAlerts();
  return alerts.filter(a => a.severity === 'critical').length;
}
export function getAlertLink(type){ return ALERT_LINKS[type] || null; }
