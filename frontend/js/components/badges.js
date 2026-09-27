/* Status pills + the shared Data Source Indicator component. */
import { esc } from '../utils.js';

export function pill(tone, label){
  return `<span class="pill ${tone}">${esc(label)}</span>`;
}

export function badge(kind, label){
  return `<span class="badge ${kind}">${esc(label)}</span>`;
}

const SOURCE_MODE_MAP = {
  none: { cls: 'demo', label: 'No Data' },
  imported: { cls: 'imported', label: 'Imported Data' },
  live: { cls: 'live', label: 'Live Data' },
};

// The single component every page uses to show whether the data on screen is
// user-imported, a live feed, or unavailable. Never shows fabricated demo
// content — 'none' means exactly that: nothing has been imported and no live
// backend is reachable yet.
export function dataSourceBadge(mode = 'none'){
  const m = SOURCE_MODE_MAP[mode] || SOURCE_MODE_MAP.none;
  return `<span class="badge ${m.cls}">${esc(m.label)}</span>`;
}
