/*
  Knowledge Base page. All article access goes through knowledge-base.service.js
  — this page never imports KB_ARTICLES directly. The currently-open article is
  tracked in the shared state (selectedKnowledgeArticle) so other pages
  (Alerts, IT Assistant) can deep-link into a specific article.
*/
import { esc } from '../utils.js';
import { renderEmpty } from '../components/empty-state.js';
import { getState, setState, updateFilters } from '../state.js';
import { rerender, navigate } from '../router.js';
import * as kb from '../services/knowledge-base.service.js';

export async function render(){
  const selected = getState().selectedKnowledgeArticle;
  if(selected){
    return renderArticleAsync(selected);
  }
  const [articles, categories] = await Promise.all([kb.getArticles(), kb.getCategories()]);
  const activeCategory = getState().filters.kbCategory;
  const list = articles.filter(a => activeCategory === 'All' || a.category === activeCategory);

  return `
  <div class="section-head"><h2>IT Knowledge Base</h2><span class="small-muted">${articles.length} articles</span></div>
  <div class="card" style="padding:14px 16px;">
    <div class="querybox">
      <input type="text" id="kbsearch_input" data-enter="kb-search" placeholder="Search IT Knowledge Base &mdash; e.g. &quot;VPN is down&quot;, &quot;user account locked&quot;">
      <button class="btn primary" data-action="kb-search">Search</button>
    </div>
    <div class="qa-examples">${['VPN is down', 'user account locked', 'printer showing offline', 'PC cannot get DHCP', 'FortiGate high CPU'].map(e => `<button data-action="kb-search-example" data-example="${esc(e)}">${esc(e)}</button>`).join('')}</div>
    <div id="kbsearch_result" style="margin-top:12px;"></div>
  </div>
  <div class="cat-filter">${categories.map(c => `<button class="chip-btn ${activeCategory === c ? 'active' : ''}" data-action="set-category" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
  <div class="kb-list">
    ${list.map(a => `<div class="kb-card" data-action="kb-open" data-code="${a.code}">
      <div class="code">${a.code}</div>
      <h4>${esc(a.title)}</h4>
      <div class="cat">${esc(a.category)}</div>
      <div class="kb-tags">${(a.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
    </div>`).join('')}
  </div>`;
}

function articleResultBlock(a, isTop){
  return `
    <div class="qa-answer" style="margin-bottom:8px;">
      <b>${isTop ? 'Recommended Article' : 'Also relevant'}: ${a.code} — ${esc(a.title)}</b>
      <div style="margin-top:6px;"><b>Recommended first checks:</b> ${(a.symptoms && a.symptoms.length ? a.symptoms : a.procedure.slice(0, 2)).map(esc).join('; ')}</div>
      <div style="margin-top:4px;"><b>Troubleshooting procedure:</b><ol>${a.procedure.map(p => `<li>${esc(p)}</li>`).join('')}</ol></div>
      ${a.commands && a.commands.length ? `<div><b>Useful commands:</b><div class="codeblock">${a.commands.map(c => `<div>${esc(c.cmd)}</div>`).join('')}</div></div>` : ''}
      <div style="margin-top:4px;"><b>Verification:</b> ${esc(a.verification || '—')} &rarr; expected: ${esc(a.expectedResult || '—')}</div>
      <div style="margin-top:6px;"><button class="btn sm" data-action="kb-open" data-code="${a.code}">Open Full Article</button></div>
    </div>`;
}

async function renderArticleAsync(code){
  const a = await kb.getArticleByCode(code);
  if(!a){
    setState({ selectedKnowledgeArticle: null });
    return render();
  }
  const related = await kb.getRelatedArticles(code);
  return `
  <button class="btn ghost sm" data-action="kb-back">&larr; Back to Knowledge Base</button>
  <div class="card article-view" style="padding:20px 22px;">
    <div><span class="code" style="color:var(--accent-2);font-size:12px;font-weight:600;">${a.code}</span><h2 style="margin-top:4px;">${esc(a.title)}</h2><div class="small-muted">${esc(a.category)}</div></div>
    <div class="kb-tags">${(a.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
    <div class="block"><h5>Purpose</h5>${esc(a.purpose || '—')}</div>
    <div class="block"><h5>Problem</h5>${esc(a.problem || '—')}</div>
    ${a.symptoms && a.symptoms.length ? `<div class="block"><h5>Symptoms</h5><ul>${a.symptoms.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
    ${a.requirements && a.requirements.length ? `<div class="block"><h5>Requirements</h5><ul>${a.requirements.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
    <div class="block"><h5>Procedure</h5><ol>${a.procedure.map(s => `<li>${esc(s)}</li>`).join('')}</ol></div>
    ${a.commands && a.commands.length ? `<div class="block"><h5>Commands</h5><div class="codeblock">${a.commands.map(c => `<div>${esc(c.cmd)} <span class="small-muted">&mdash; ${esc(c.verifies)}</span></div>`).join('')}</div></div>` : ''}
    <div class="block"><h5>Verification</h5><div class="codeblock"><div>${esc(a.verification || '—')}</div></div></div>
    <div class="block"><h5>Expected Result</h5>${esc(a.expectedResult || '—')}</div>
    <div class="block"><h5>Rollback</h5>${esc(a.rollback || '—')}</div>
    ${a.notes ? `<div class="block"><h5>Notes</h5>${esc(a.notes)}</div>` : ''}
    ${related.length ? `<div class="block"><h5>Related Articles</h5><div class="related-list">${related.map(r => `<a href="#" data-action="kb-open" data-code="${r.code}">${r.code} — ${esc(r.title)}</a>`).join('')}</div></div>` : ''}
  </div>`;
}

export function getActions(){
  async function runSearch(){
    const q = document.getElementById('kbsearch_input').value.trim();
    const box = document.getElementById('kbsearch_result');
    if(!q){ box.innerHTML = ''; return; }
    const matches = await kb.searchArticles(q);
    box.innerHTML = matches.length
      ? matches.map((a, i) => articleResultBlock(a, i === 0)).join('')
      : renderEmpty(`No data is currently available for this item — no Knowledge Base article matched "${q}".`);
  }
  return {
    'kb-search': runSearch,
    'kb-search-example': (el) => { document.getElementById('kbsearch_input').value = el.dataset.example; runSearch(); },
    'set-category': (el) => { updateFilters({ kbCategory: el.dataset.cat }); rerender(); },
    'kb-open': (el) => { setState({ selectedKnowledgeArticle: el.dataset.code }); navigate('knowledge-base'); },
    'kb-back': () => { setState({ selectedKnowledgeArticle: null }); rerender(); },
  };
}
