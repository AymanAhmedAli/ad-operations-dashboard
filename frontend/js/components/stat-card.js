/* Dashboard / section summary stat cards. */
import { esc } from '../utils.js';

export function statCard(item){
  return `
    <div class="stat ${item.tone || ''}">
      ${item.icon ? `<div class="stat-top"><div class="stat-icon" style="background:${item.iconColor || 'var(--brand-1)'}">${item.icon}</div>${item.trend ? `<span class="trend-chip ${item.trend.dir}">${item.trend.dir === 'up' ? '&#8599;' : '&#8600;'} ${esc(item.trend.label)}</span>` : ''}</div>` : ''}
      <div class="label">${esc(item.label)}</div>
      <div class="value">${item.value}</div>
      ${item.sub ? `<div class="sub">${esc(item.sub)}</div>` : ''}
    </div>`;
}

export function statGrid(items){
  return `<div class="stat-grid">${items.map(statCard).join('')}</div>`;
}
