/*
  Natural-language "ask a question" box used on the Active Directory, FortiGate,
  Printers and Reports pages. Markup only — wiring lives in each page's
  getActions(), registered under the `ask:<id>` action name (see router.js for
  how data-action / data-enter get dispatched).
*/
import { esc } from '../utils.js';

export function queryBox(id, examples){
  return `<div class="card" style="padding:14px 16px;">
    <div class="querybox">
      <input type="text" id="${id}_input" data-enter="ask:${id}" placeholder="Ask a question in plain language…">
      <button class="btn primary" data-action="ask:${id}">Ask</button>
    </div>
    <div class="qa-examples">${examples.map(e => `<button data-action="ask-example:${id}" data-example="${esc(e)}">${esc(e)}</button>`).join('')}</div>
    <div id="${id}_answer" style="margin-top:10px;"></div>
  </div>`;
}
