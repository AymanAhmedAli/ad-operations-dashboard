/*
  Small, dependency-free SVG/CSS charts for dashboard widgets. Every input
  here must be a real, already-computed count (stock states, printer
  statuses, etc.) — these components never invent a distribution or a trend
  line; if there's nothing to chart, render an empty state instead (see
  callers in dashboard.page.js).
*/
import { esc } from '../utils.js';

const TONE_VAR = { ok: 'var(--ok)', warn: 'var(--warn)', crit: 'var(--crit)', unknown: 'var(--unknown)', accent: 'var(--brand-1)', accent2: 'var(--brand-2)' };

// segments: [{ label, value, tone }]
export function donutChart(segments, { size = 108, thickness = 14 } = {}){
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const cx = size / 2, cy = size / 2;

  const arcs = total <= 0 ? '' : segments.filter(s => s.value > 0).map(s => {
    const frac = s.value / total;
    const dash = frac * c;
    const circle = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${TONE_VAR[s.tone] || TONE_VAR.unknown}" stroke-width="${thickness}" stroke-dasharray="${dash} ${c - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"></circle>`;
    offset += dash;
    return circle;
  }).join('');

  const emptyRing = total <= 0 ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border)" stroke-width="${thickness}"></circle>` : '';
  const centerLabel = total <= 0 ? 'No data' : `${total}`;

  return `
  <div class="donut-chart">
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Breakdown chart">
      ${emptyRing}${arcs}
      <text x="${cx}" y="${cy - 2}" text-anchor="middle" class="donut-center-value">${esc(centerLabel)}</text>
      <text x="${cx}" y="${cy + 14}" text-anchor="middle" class="donut-center-label">${total <= 0 ? '' : 'items'}</text>
    </svg>
    <div class="donut-legend">
      ${segments.map(s => `<div class="donut-legend-item"><span class="dot" style="background:${TONE_VAR[s.tone] || TONE_VAR.unknown}"></span>${esc(s.label)} <b>${s.value}</b></div>`).join('')}
    </div>
  </div>`;
}

// bars: [{ label, value, tone }]
export function barChart(bars, { height = 120 } = {}){
  const max = Math.max(1, ...bars.map(b => b.value));
  return `
  <div class="bar-chart" style="height:${height}px;">
    ${bars.map(b => `
      <div class="bar-chart-col">
        <div class="bar-chart-value">${b.value}</div>
        <div class="bar-chart-track">
          <div class="bar-chart-fill" style="height:${Math.max(2, Math.round((b.value / max) * 100))}%;background:${TONE_VAR[b.tone] || TONE_VAR.accent}"></div>
        </div>
        <div class="bar-chart-label">${esc(b.label)}</div>
      </div>`).join('')}
  </div>`;
}
