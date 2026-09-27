/* Generic data table. Columns: [{key,label,num?,render?(row)}] */
import { esc } from '../utils.js';

export function dataTable(columns, rows, opts = {}){
  const head = columns.map(c => `<th class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`).join('');
  if(!rows || !rows.length){
    return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead>
    <tbody><tr class="empty-row"><td colspan="${columns.length}">${esc(opts.emptyText || 'No matching records.')}</td></tr></tbody></table></div>`;
  }
  const body = rows.map(r => {
    const cells = columns.map(c => `<td class="${c.num ? 'num' : ''}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
