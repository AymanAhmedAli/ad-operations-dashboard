/*
  Minimal reusable modal dialog, mounted into the #modal-root element that
  already exists in index.html. Used today for the Toner Inventory
  "confirm before applying" transaction preview; any future confirmation
  dialog (e.g. a destructive backend action) can reuse the same component.
*/

let rootEl = null;

function getRoot(){
  if(!rootEl) rootEl = document.getElementById('modal-root');
  return rootEl;
}

function escHandler(e){
  if(e.key === 'Escape') closeModal();
}

// html: modal body markup. actions: { [data-action value]: (el, event) => void }
export function openModal(html, actions = {}){
  const root = getRoot();
  if(!root) return;
  root.innerHTML = `<div class="modal-backdrop" data-action="close"><div class="modal-card" role="dialog" aria-modal="true">${html}</div></div>`;
  root.hidden = false;
  root.onclick = (e) => {
    const el = e.target.closest('[data-action]');
    if(!el) return;
    if(el.dataset.action === 'close' && e.target === el){ closeModal(); return; }
    const fn = actions[el.dataset.action];
    if(fn) fn(el, e);
  };
  document.addEventListener('keydown', escHandler);
}

export function closeModal(){
  const root = getRoot();
  if(!root) return;
  root.hidden = true;
  root.innerHTML = '';
  root.onclick = null;
  document.removeEventListener('keydown', escHandler);
}
