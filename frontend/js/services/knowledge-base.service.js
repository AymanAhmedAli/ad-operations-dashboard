/*
  Knowledge Base service. Tries the real backend
  (../../backend/routes/knowledge-base.routes.ps1) first, falling back to
  the bundled KB_ARTICLES copy if it's unreachable — the content is
  identical either way today, but the backend copy is the one that could
  actually be edited/expanded later without shipping a new frontend build.

  Endpoints used:
    GET /api/knowledge-base/articles
    GET /api/knowledge-base/categories
    GET /api/knowledge-base/articles/:code
    GET /api/knowledge-base/articles/:code/related
    GET /api/knowledge-base/search?q=...
*/
import { KB_ARTICLES, KB_CATEGORIES } from '../mock-data.js';
import { delay } from '../utils.js';
import { apiGet } from '../api-client.js';

export async function getArticles(){
  await delay(0);
  try{ return await apiGet('/knowledge-base/articles'); }
  catch(err){ return KB_ARTICLES; }
}
export async function getCategories(){
  try{ return await apiGet('/knowledge-base/categories'); }
  catch(err){ return KB_CATEGORIES; }
}
export async function getArticleByCode(code){
  await delay(0);
  try{ return await apiGet(`/knowledge-base/articles/${encodeURIComponent(code)}`); }
  catch(err){ return KB_ARTICLES.find(a => a.code === code) || null; }
}

function scoreArticle(article, tokens){
  const hay = [article.title, article.category, ...(article.tags || []), article.problem, ...(article.symptoms || [])].join(' ').toLowerCase();
  return tokens.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
}
function searchLocally(query, limit){
  const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  if(!tokens.length) return [];
  return KB_ARTICLES
    .map(a => ({ a, score: scoreArticle(a, tokens) }))
    .filter(x => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map(x => x.a);
}

export async function searchArticles(query, limit = 5){
  await delay(0);
  try{ return await apiGet(`/knowledge-base/search?q=${encodeURIComponent(query)}`); }
  catch(err){ return searchLocally(query, limit); }
}

// Related = same category or shared tags, ranked by tag overlap, excluding itself.
function relatedLocally(code, limit){
  const current = KB_ARTICLES.find(a => a.code === code);
  if(!current) return [];
  const currentTags = new Set(current.tags || []);
  return KB_ARTICLES
    .filter(a => a.code !== code)
    .map(a => {
      const tagOverlap = (a.tags || []).filter(t => currentTags.has(t)).length;
      const sameCategory = a.category === current.category ? 1 : 0;
      return { a, score: tagOverlap * 2 + sameCategory };
    })
    .filter(x => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map(x => x.a);
}

export async function getRelatedArticles(code, limit = 3){
  await delay(0);
  try{ return await apiGet(`/knowledge-base/articles/${encodeURIComponent(code)}/related`); }
  catch(err){ return relatedLocally(code, limit); }
}
