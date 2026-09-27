/*
  Shared Loading / No Data / Error states. Pages use these while awaiting
  service Promises so a future slow (or failing) real API has somewhere to
  render into without each page inventing its own markup.
*/
import { esc } from '../utils.js';

export function renderLoading(message = 'Loading…'){
  return `<div class="state-panel loading"><span class="spinner" aria-hidden="true"></span>${esc(message)}</div>`;
}

export function renderEmpty(message = 'No data found.'){
  return `<div class="state-panel empty">${esc(message)}</div>`;
}

export function renderError(message = 'Something went wrong.'){
  return `<div class="state-panel error">${esc(message)}</div>`;
}
