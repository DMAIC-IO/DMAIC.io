/**
 * D.Mike service worker — fetch strategy for one request. Pure.
 *
 * Content-hashed files (chunks, the entry and stylesheet with ?v=, fonts) are
 * cache-first by path, listed or not: a tab opened before a deploy still
 * imports chunks of its own version, which only the previous cache holds.
 * Other files are handled only when the precache list names them.
 */

const CACHE_FIRST = /^(js\/chunks\/|js\/app\.min\.js\?|css\/app\.min\.css\?|css\/fonts\/|assets\/fonts\/)/;

/**
 * @param {{ url: string, method: string, mode: string }} request
 * @param {{ scope: string, precache: Set<string> }} opts  scope is the
 *   registration scope (absolute, ends with '/'); precache holds URLs relative
 *   to it, query included
 * @returns {'page'|'cache-first'|'network-first'|'passthrough'}
 */
export function strategyFor(request, { scope, precache }) {
  if (request.method !== 'GET') return 'passthrough';
  const url = new URL(request.url);
  const base = new URL(scope);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return 'passthrough';
  const path = url.pathname.slice(base.pathname.length);
  if (request.mode === 'navigate') {
    return path === '' || path === 'index.html' ? 'page' : 'passthrough';
  }
  const key = path + url.search;
  if (CACHE_FIRST.test(key)) return 'cache-first';
  return precache.has(key) ? 'network-first' : 'passthrough';
}
