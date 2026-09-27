/*
  Hash router + the single delegated event listener for everything rendered
  inside #view. Pages never attach their own DOM event listeners — instead
  their render() markup carries data-action / data-enter / data-change
  attributes, and each page's getActions() returns a { actionName: handler }
  map that this router dispatches into after every render. This keeps pages
  free of manual listener wiring/cleanup and keeps inline JS out of HTML.
*/
import { setState } from './state.js';
import { renderLoading, renderError } from './components/empty-state.js';

import * as dashboardPage from './pages/dashboard.page.js';
import * as adPage from './pages/active-directory.page.js';
import * as fortigatePage from './pages/fortigate.page.js';
import * as networkMapPage from './pages/network-map.page.js';
import * as printersPage from './pages/printers.page.js';
import * as tonerPage from './pages/toner.page.js';
import * as kbPage from './pages/knowledge-base.page.js';
import * as reportsPage from './pages/reports.page.js';
import * as alertsPage from './pages/alerts.page.js';
import * as assistantPage from './pages/assistant.page.js';

export const ROUTES = [
  { id: 'dashboard', group: 'Overview', label: 'Dashboard', icon: '&#9635;', title: 'IT Operations Dashboard', sub: 'Unified view of directory, network, print and inventory health', page: dashboardPage, errorMessage: 'Could not load the dashboard.' },
  { id: 'active-directory', group: 'Infrastructure', label: 'Active Directory', icon: '&#128100;', title: 'Active Directory', sub: 'Users and computers — imported or live data, analyzed automatically', page: adPage, errorMessage: 'Could not load Active Directory data.' },
  { id: 'fortigate', group: 'Infrastructure', label: 'FortiGate', icon: '&#128225;', title: 'FortiGate', sub: 'Firewall, VPN and network device information', page: fortigatePage, errorMessage: 'Could not load FortiGate data.' },
  { id: 'network-map', group: 'Infrastructure', label: 'Network Map', icon: '&#127760;', title: 'Network Map', sub: 'Visual topology of connected devices, VLANs and printers', page: networkMapPage, errorMessage: 'Could not load the network map.' },
  { id: 'printers', group: 'Infrastructure', label: 'Printers', icon: '&#128424;', title: 'Printer Monitoring', sub: 'Status, toner and usage across the print fleet', page: printersPage, errorMessage: 'Could not load printer data.' },
  { id: 'toner', group: 'Infrastructure', label: 'Toner Inventory', icon: '&#129529;', title: 'Toner Inventory', sub: 'Stock levels, valuation and consumable transactions', page: tonerPage, errorMessage: 'Could not load toner inventory data.' },
  { id: 'knowledge-base', group: 'Support', label: 'Knowledge Base', icon: '&#128218;', title: 'IT Knowledge Base', sub: 'Search procedures, commands and verification steps', page: kbPage, errorMessage: 'Could not load the Knowledge Base.' },
  { id: 'assistant', group: 'Support', label: 'IT Assistant', icon: '&#128172;', title: 'IT Support Assistant', sub: 'Describe an issue to get a guided diagnostic path', page: assistantPage, errorMessage: 'Could not load the IT Assistant.' },
  { id: 'alerts', group: 'Support', label: 'Alerts', icon: '&#9888;', title: 'Alerts', sub: 'Active issues linked to recommended Knowledge Base procedures', page: alertsPage, errorMessage: 'Could not load alerts.' },
  { id: 'reports', group: 'Insights', label: 'Reports', icon: '&#128202;', title: 'Report Center', sub: 'Generate structured operational reports on demand', page: reportsPage, errorMessage: 'Could not load the Report Center.' },
];
const ROUTE_IDS = new Set(ROUTES.map(r => r.id));
const DEFAULT_ROUTE = 'dashboard';

let currentActions = {};
let viewEl = null;

function dispatch(name, el, ev){
  const fn = currentActions[name];
  if(fn) fn(el, ev);
}

function wireDelegation(){
  viewEl = document.getElementById('view');
  viewEl.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if(!el) return;
    dispatch(el.dataset.action, el, e);
  });
  viewEl.addEventListener('keydown', (e) => {
    // Some automation/IME input methods report Enter via keyCode 13 without a
    // matching e.key, so check both instead of relying on e.key alone.
    if(e.key !== 'Enter' && e.keyCode !== 13) return;
    const el = e.target.closest('[data-enter]');
    if(!el) return;
    e.preventDefault();
    dispatch(el.dataset.enter, el, e);
  });
  viewEl.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if(!el) return;
    dispatch(el.dataset.change, el, e);
  });
}

export function setViewActions(actions){
  currentActions = actions || {};
}

export function parseHash(){
  const raw = location.hash.replace(/^#\/?/, '');
  return ROUTE_IDS.has(raw) ? raw : DEFAULT_ROUTE;
}

export function navigate(routeId){
  if(!ROUTE_IDS.has(routeId)) return;
  if(location.hash === '#/' + routeId){
    renderRoute();
  } else {
    location.hash = '/' + routeId;
  }
}

export async function renderRoute(){
  const routeId = parseHash();
  const route = ROUTES.find(r => r.id === routeId);
  setState({ currentRoute: routeId });

  document.getElementById('topbarTitle').textContent = route.title;
  document.getElementById('topbarSub').textContent = route.sub;
  viewEl.innerHTML = renderLoading(`Loading ${route.label}…`);

  try{
    const html = await route.page.render();
    viewEl.innerHTML = html;
    setViewActions(route.page.getActions ? route.page.getActions() : {});
    if(route.page.postRender) route.page.postRender();
  }catch(err){
    console.error(`[${route.id}] render failed`, err);
    viewEl.innerHTML = renderError(route.errorMessage);
    setViewActions({});
  }
}

export function rerender(){
  return renderRoute();
}

export function initRouter(){
  wireDelegation();
  window.addEventListener('hashchange', renderRoute);
  if(!location.hash){
    // Setting an empty hash fires 'hashchange' itself, which will call renderRoute().
    location.hash = '/' + DEFAULT_ROUTE;
  } else {
    renderRoute();
  }
}
