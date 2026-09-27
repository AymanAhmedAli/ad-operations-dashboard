/*
  Report Center page. All report generation goes through report.service.js —
  this page has no idea whether a report's rows came from mock data or (later)
  POST /api/reports/generate; it only renders whatever the service returns.
*/
import { esc, fmtDateTime } from '../utils.js';
import { dataTable } from '../components/table.js';
import { pill } from '../components/badges.js';
import { queryBox } from '../components/query-box.js';
import { renderEmpty } from '../components/empty-state.js';
import { DEPARTMENTS } from '../mock-data.js';
import * as reportService from '../services/report.service.js';

function reportColumns(rows){
  if(!rows.length) return [{ key: '_', label: '—' }];
  return Object.keys(rows[0]).slice(0, 8).map(k => ({ key: k, label: k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()) }));
}

function renderReportOutput(report){
  return `
  <div class="card" style="padding:16px;margin-top:14px;">
    <div class="section-head"><h3>${esc(report.meta.label)}</h3></div>
    ${report.rows.length ? dataTable(reportColumns(report.rows), report.rows) : renderEmpty('No data is currently available for this item.')}
    <div class="report-meta" style="margin-top:12px;">
      <span>Report Generated At: <b>${fmtDateTime(report.generatedAt)}</b></span>
      <span>Filters Applied: <b>${Object.entries(report.filters).filter(([k, v]) => v && v !== 'all').map(([k, v]) => `${k}=${v}`).join(', ') || 'None'}</b></span>
      <span>Data Available: <b>${report.rows.length} record(s)</b></span>
      <span>Data Missing: <b>${report.missing.length ? esc(report.missing.join('; ')) : 'None'}</b></span>
    </div>
  </div>`;
}

export async function render(){
  const types = await reportService.getReportTypes();
  return `
  <div class="section-head"><h2>Report Center</h2></div>
  <div class="card" style="padding:16px;">
    <div class="report-form">
      <label class="field"><span>Report Type</span><select id="rep_type">${types.map(r => `<option value="${r.id}">${esc(r.label)}</option>`).join('')}</select></label>
      <label class="field"><span>Date Range</span><select id="rep_range"><option value="all">All time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label>
      <label class="field"><span>Department</span><select id="rep_dept"><option value="">All</option>${DEPARTMENTS.map(d => `<option>${d}</option>`).join('')}</select></label>
      <label class="field"><span>Location</span><input type="text" id="rep_location" placeholder="Any"></label>
      <label class="field"><span>Status</span><input type="text" id="rep_status" placeholder="Any"></label>
      <label class="field"><span>Device Type</span><input type="text" id="rep_devicetype" placeholder="Any"></label>
    </div>
    <div class="toolbar" style="margin-top:12px;"><button class="btn primary" data-action="generate-report">Generate Report</button></div>
  </div>
  ${queryBox('nlreport', ['Create a report of locked AD accounts', 'Give me all printers with toner below 20%', 'Create a monthly toner consumption report', 'Show Hikvision devices detected through FortiGate', 'Create a report of computers inactive for 60 days'])}
  <div id="report_output"></div>
  <div class="section-head"><h2>Management Summary</h2></div>
  <div class="card" style="padding:16px;">
    <button class="btn primary" data-action="generate-summary">Generate IT Management Summary</button>
    <div id="mgmt_summary" style="margin-top:14px;"></div>
  </div>
  `;
}

function renderManagementSummary(summary){
  const h = summary.health;
  const toneLabel = (t) => t === 'ok' ? 'Healthy' : t === 'crit' ? 'Critical' : 'Warning';
  return `
  <div class="summary-block">
    <div><b>Executive Summary</b> <span class="badge ai">AI Generated Recommendation</span></div>
    <p style="margin:0;">As of ${fmtDateTime(summary.generatedAt)}, IT operations are ${summary.risks.length ? 'operating with ' + summary.risks.length + ' notable risk area(s) requiring attention' : 'stable with no major risks identified'} across directory, network, print and toner inventory (based on currently loaded imported/live data).</p>
    <div class="summary-health">
      <div class="item">Active Directory ${pill(h.ad, toneLabel(h.ad))}</div>
      <div class="item">Network / FortiGate ${pill(h.network, toneLabel(h.network))}</div>
      <div class="item">Printers ${pill(h.printers, toneLabel(h.printers))}</div>
      <div class="item">Toner Inventory ${pill(h.toner, toneLabel(h.toner))}</div>
      <div class="item">Critical Alerts ${pill(h.criticalAlerts ? 'crit' : 'ok', h.criticalAlerts + ' active')}</div>
    </div>
    <div><b>Major Risks</b></div>
    <div class="risk-list">${summary.risks.length ? summary.risks.map(r => `<div class="risk-item">&#8226; ${esc(r)}</div>`).join('') : '<div class="risk-item">None identified.</div>'}</div>
    <div><b>Recommended IT Actions</b></div>
    <div class="risk-list">${summary.actions.map(a => `<div class="risk-item">&#8226; ${esc(a)}</div>`).join('')}</div>
    <details><summary style="cursor:pointer;color:var(--text-muted);font-size:12.5px;">Technical Details</summary>
      <div class="risk-list" style="margin-top:8px;">
        <div class="risk-item">AD: ${summary.technical.adUsers} users, ${summary.technical.locked} locked, ${summary.technical.disabled} disabled, ${summary.technical.expiring7} expiring passwords, ${summary.technical.inactiveComputers} inactive computers.</div>
        <div class="risk-item">FortiGate: CPU ${summary.technical.cpu === null ? '—' : summary.technical.cpu + '%'}, Memory ${summary.technical.memory === null ? '—' : summary.technical.memory + '%'}, ${summary.technical.interfacesDown} interface(s) down, ${summary.technical.tunnelsDown} tunnel(s) down.</div>
        <div class="risk-item">Printers: ${summary.technical.printersOffline} offline, ${summary.technical.printersNeedToner} need toner.</div>
        <div class="risk-item">Toner: ${summary.technical.lowToner} item(s) low/out of stock, est. stock value $${summary.technical.stockValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}.</div>
      </div>
    </details>
  </div>`;
}

export function getActions(){
  async function runNlReport(){
    const input = document.getElementById('nlreport_input');
    const answerBox = document.getElementById('nlreport_answer');
    const q = input.value.trim();
    if(!q) return;
    const parsed = await reportService.askNaturalLanguage(q);
    if(parsed.custom){
      answerBox.innerHTML = `<div class="qa-answer">${esc(parsed.custom.text)}${parsed.custom.rows.length ? dataTable(reportColumns(parsed.custom.rows), parsed.custom.rows) : renderEmpty('No data is currently available for this item.')}</div>`;
      return;
    }
    const report = await reportService.generateReport(parsed.typeId, parsed.filters);
    answerBox.innerHTML = `<div class="qa-answer">Interpreted as: <b>${esc(report.meta.label)}</b>${Object.values(parsed.filters).some(v => v && v !== 'all') ? ' (filtered)' : ''}. Full report generated below.</div>`;
    document.getElementById('report_output').innerHTML = renderReportOutput(report);
  }

  return {
    'generate-report': async () => {
      const typeId = document.getElementById('rep_type').value;
      const filters = {
        range: document.getElementById('rep_range').value,
        department: document.getElementById('rep_dept').value,
        location: document.getElementById('rep_location').value,
        status: document.getElementById('rep_status').value,
        deviceType: document.getElementById('rep_devicetype').value,
      };
      const report = await reportService.generateReport(typeId, filters);
      document.getElementById('report_output').innerHTML = renderReportOutput(report);
    },
    'ask:nlreport': runNlReport,
    'ask-example:nlreport': (el) => { document.getElementById('nlreport_input').value = el.dataset.example; runNlReport(); },
    'generate-summary': async () => {
      const summary = await reportService.generateManagementSummary();
      document.getElementById('mgmt_summary').innerHTML = renderManagementSummary(summary);
    },
  };
}
