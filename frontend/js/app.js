/*
  App entry point (loaded as the single <script type="module"> in index.html).
  Owns the chrome that surrounds routed pages: sidebar nav, sidebar mode
  indicator, and the topbar's data-mode / refresh / updated-time badges.
  Routed page content itself is entirely owned by router.js + js/pages/*.
*/
import { ROUTES, navigate, initRouter, rerender } from './router.js';
import { getState, subscribe, setState, getOverallDataMode } from './state.js';
import { esc, fmtClock } from './utils.js';

// Theme preference: 'light' | 'dark' in localStorage means an explicit
// choice; absent means "follow the OS" (see css/variables.css's
// prefers-color-scheme block). Kept local to app.js rather than routed
// through storage.js, which is reserved for domain data services.
const THEME_KEY = 'ithub_theme';

function getStoredTheme(){
  try{ return localStorage.getItem(THEME_KEY); }
  catch(e){ return null; }
}
function setStoredTheme(theme){
  try{
    if(theme) localStorage.setItem(THEME_KEY, theme);
    else localStorage.removeItem(THEME_KEY);
  }catch(e){ /* private browsing / quota - theme just won't persist */ }
}
function resolvedTheme(theme){
  return theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
// Standalone: the design tokens live on :root, so data-theme belongs on
// <html>. Hosted (SPFx): tokens are scoped to .it-ops-hub-root instead (see
// vendor-app-src/css/variables.css), since we don't own the host page's
// <html> element - data-theme has to go on that same wrapper div.
function themeRoot(){
  if(typeof window !== 'undefined' && window.__IT_OPS_HUB_HOSTED__){
    return document.querySelector('.it-ops-hub-root') || document.documentElement;
  }
  return document.documentElement;
}
function applyTheme(theme){
  if(theme) themeRoot().setAttribute('data-theme', theme);
  else themeRoot().removeAttribute('data-theme');
  const btn = document.getElementById('themeToggleBtn');
  const icon = document.getElementById('themeToggleIcon');
  const label = document.getElementById('themeToggleLabel');
  if(btn && icon && label){
    const resolved = resolvedTheme(theme);
    // Icon + label show the mode a click will switch TO.
    icon.innerHTML = resolved === 'dark' ? '&#9728;' : '&#127769;';
    label.textContent = resolved === 'dark' ? 'Light Mode' : 'Dark Mode';
    btn.title = resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  }
}

function renderNav(){
  const nav = document.getElementById('navlist');
  const { currentRoute } = getState();
  let lastGroup = null;
  const html = ROUTES.map(r => {
    const groupHeader = r.group !== lastGroup ? `<div class="nav-group-label">${esc(r.group)}</div>` : '';
    lastGroup = r.group;
    return groupHeader + `<button data-route="${r.id}" class="${currentRoute === r.id ? 'active' : ''}"><span class="navicon">${r.icon}</span>${esc(r.label)}</button>`;
  }).join('');
  nav.innerHTML = html;
  nav.querySelectorAll('button[data-route]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.route));
  });
}

function updateChrome(){
  renderNav();
  const modeText = getOverallDataMode();
  const modeBadge = document.getElementById('modeBadgeText');
  const sideMode = document.getElementById('sidebarModeText');
  const timeEl = document.getElementById('updatedTime');
  if(modeBadge) modeBadge.textContent = modeText;
  if(sideMode) sideMode.textContent = modeText;
  if(timeEl) timeEl.textContent = fmtClock(getState().lastUpdated || new Date());
}

function wireChrome(){
  const currentUser = getState().currentUser;
  document.getElementById('sidebarUser').textContent = currentUser;
  document.getElementById('sidebarMode').addEventListener('click', () => navigate('reports'));

  const avatar = document.getElementById('topbarAvatar');
  if(avatar){
    avatar.textContent = (currentUser || '?').trim()[0].toUpperCase();
    avatar.title = currentUser;
  }

  applyTheme(getStoredTheme());
  const themeBtn = document.getElementById('themeToggleBtn');
  if(themeBtn){
    themeBtn.addEventListener('click', () => {
      const next = resolvedTheme(getStoredTheme()) === 'dark' ? 'light' : 'dark';
      setStoredTheme(next);
      applyTheme(next);
    });
  }

  const refreshBtn = document.getElementById('refreshBtn');
  refreshBtn.addEventListener('click', () => {
    setState({ lastUpdated: new Date() });
    refreshBtn.classList.remove('spin');
    void refreshBtn.offsetWidth; // restart the CSS animation
    refreshBtn.classList.add('spin');
    rerender();
  });

  subscribe(updateChrome);
  updateChrome();
}

export function initApp(){
  wireChrome();
  initRouter();
}

// Standalone (plain index.html) entry point. When this module is bundled
// into a host (e.g. the SharePoint web part), the host calls initApp()
// itself instead, after it has injected our HTML skeleton into the page.
if(typeof window !== 'undefined' && !window.__IT_OPS_HUB_HOSTED__){
  initApp();
}
