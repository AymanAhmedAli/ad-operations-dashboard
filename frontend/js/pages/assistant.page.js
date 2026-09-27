/*
  IT Support Assistant page. This page only handles input, output and
  conversation history — all diagnostic logic lives in assistant.service.js,
  so swapping the rule engine for a real AI backend later needs no page change.
*/
import { esc } from '../utils.js';
import { getState, setState } from '../state.js';
import { navigate, rerender } from '../router.js';
import * as assistant from '../services/assistant.service.js';
import * as kb from '../services/knowledge-base.service.js';

const EXAMPLES = [
  'User cannot login to domain.',
  'VPN is down for remote staff.',
  'Printer PRN-SLS-02 is offline.',
  'PC in Finance cannot get DHCP.',
  'FortiGate CPU is very high.',
];

function renderMessage(m){
  if(m.role === 'user') return `<div class="msg user">${esc(m.text)}</div>`;
  const r = m.data;
  const kbRefs = r.kbRefs && r.kbRefs.length
    ? `<div class="kb-ref">Recommended Knowledge Base: ${r.kbRefs.map(k => `<a href="#" data-action="open-kb" data-code="${k.code}">${k.code}${k.title ? ' — ' + esc(k.title) : ''}</a>`).join(' &nbsp;|&nbsp; ')}</div>`
    : '';
  return `<div class="msg bot">
    <div class="block-title">Affected Technology</div>${esc(r.technology)}
    <div class="block-title">Possible Causes</div><ul>${r.possibleCauses.map(c => `<li>${esc(c)}</li>`).join('')}</ul>
    <div class="block-title">Recommended Checks</div><ol>${r.checks.map(c => `<li>${esc(c)}</li>`).join('')}</ol>
    ${r.commands && r.commands.length ? `<div class="block-title">Diagnostic Commands</div><div class="codeblock">${r.commands.map(c => `<div>${esc(c.cmd)} <span class="small-muted">&mdash; ${esc(c.verifies)}</span></div>`).join('')}</div>` : ''}
    ${kbRefs}
  </div>`;
}

export async function render(){
  const log = getState().assistantConversation;
  return `
  <div class="section-head"><h2>IT Support Assistant</h2><span class="badge ai">AI Generated Recommendation</span></div>
  <div class="hint">Diagnostic suggestions only — no destructive action is taken automatically, and no live system is queried. Always confirm on the actual system before acting.</div>
  <div class="card" style="padding:14px 16px;">
    <div class="chatlog" id="assistant_log">${log.length ? log.map(renderMessage).join('') : '<div class="small-muted">Describe an issue below to get started, e.g. "User cannot login to domain."</div>'}</div>
    <div id="assistant-input-row" class="querybox">
      <input type="text" id="assistant_input" data-enter="assistant-ask" placeholder="Describe the issue…">
      <button class="btn primary" data-action="assistant-ask">Diagnose</button>
    </div>
    <div class="qa-examples">${EXAMPLES.map(e => `<button data-action="assistant-example" data-example="${esc(e)}">${esc(e)}</button>`).join('')}</div>
  </div>`;
}

export function postRender(){
  const log = document.getElementById('assistant_log');
  if(log) log.scrollTop = log.scrollHeight;
}

export function getActions(){
  async function runDiagnose(){
    const input = document.getElementById('assistant_input');
    const text = input.value.trim();
    if(!text) return;
    const result = await assistant.diagnose(text);
    const kbRefs = await Promise.all((result.knowledgeBaseArticles || []).map(async code => {
      const article = await kb.getArticleByCode(code);
      return { code, title: article ? article.title : '' };
    }));
    const conversation = getState().assistantConversation.concat(
      { role: 'user', text },
      { role: 'bot', data: { ...result, kbRefs } }
    );
    setState({ assistantConversation: conversation });
    input.value = '';
    rerender();
  }
  return {
    'assistant-ask': runDiagnose,
    'assistant-example': (el) => { document.getElementById('assistant_input').value = el.dataset.example; runDiagnose(); },
    'open-kb': (el) => { setState({ selectedKnowledgeArticle: el.dataset.code }); navigate('knowledge-base'); },
  };
}
