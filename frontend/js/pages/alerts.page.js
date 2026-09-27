/* Alerts page. Alert data + the alert-type -> KB linking table both come from alert.service.js. */
import { esc } from '../utils.js';
import { pill } from '../components/badges.js';
import { setState } from '../state.js';
import { navigate } from '../router.js';
import * as alertService from '../services/alert.service.js';
import * as kb from '../services/knowledge-base.service.js';
import { renderEmpty } from '../components/empty-state.js';

export async function render(){
  const alerts = await alertService.getAlerts();
  const cards = await Promise.all(alerts.map(async (a) => {
    const link = alertService.getAlertLink(a.type);
    let kbTitle = '';
    if(link){
      const article = await kb.getArticleByCode(link.kb);
      kbTitle = article ? ` — ${esc(article.title)}` : '';
    }
    return `<div class="alert-card ${a.severity === 'critical' ? 'crit' : 'warn'}">
        <div class="stripe"></div>
        <div class="alert-body">
          <div class="alert-top"><strong>${esc(a.type)}</strong>${pill(a.severity === 'critical' ? 'crit' : 'warn', a.severity)}</div>
          <div>${esc(a.message)}</div>
          <div class="alert-meta">${esc(a.time)}</div>
          <button class="btn ghost sm" style="align-self:flex-start;" data-action="toggle-detail">View recommended response</button>
          <div class="alert-detail">
            ${link ? `<div><b>Possible Impact:</b> ${esc(link.impact)}</div>
            <div><b>Recommended KB:</b> <a href="#" data-action="open-kb" data-code="${link.kb}">${link.kb}${kbTitle}</a></div>
            <div><b>Suggested First Checks:</b><ul>${link.checks.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>` : '<div>No linked procedure available for this alert type.</div>'}
          </div>
        </div>
      </div>`;
  }));

  return `
  <div class="section-head"><h2>Alerts</h2></div>
  <div class="stat-grid">
    <div class="stat crit">Critical<div class="value">${alerts.filter(a => a.severity === 'critical').length}</div></div>
    <div class="stat warn">Warning<div class="value">${alerts.filter(a => a.severity === 'warning').length}</div></div>
  </div>
  <div class="alert-list">${cards.length ? cards.join('') : renderEmpty('No alerts available. Alerts are computed by the backend from live Active Directory, FortiGate, printer and toner data.')}</div>`;
}

export function getActions(){
  return {
    'toggle-detail': (el) => el.nextElementSibling.classList.toggle('open'),
    'open-kb': (el) => { setState({ selectedKnowledgeArticle: el.dataset.code }); navigate('knowledge-base'); },
  };
}
