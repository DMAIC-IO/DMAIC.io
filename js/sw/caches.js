/**
 * D.Mike service worker — cache names and which caches activate deletes. Pure.
 *
 * Several deployments share the origin (/app/v1.2.0/, /app/v1.2/,
 * /app/latest/), each with its own worker; the scope path in the name keeps
 * their caches apart. A scope keeps two versions: the current one, and the
 * newest previous one for tabs a skipWaiting takeover left on old chunks.
 */

export const CACHE_PREFIX = 'dmaic:';

/**
 * @param {string} scope  registration scope (absolute URL)
 * @param {string} version
 * @returns {string}  e.g. 'dmaic:/app/v1.2.0/:3f9a1c2e'
 */
export function cacheName(scope, version) {
  return `${CACHE_PREFIX}${new URL(scope).pathname}:${version}`;
}

/**
 * Caches of this scope to delete on activate: all but the current version
 * and the newest previous one. Other scopes and foreign caches are never
 * listed.
 * @param {string[]} names  as caches.keys() returns them (creation order)
 * @param {string} scope
 * @param {string} version  the activating worker's version
 * @returns {string[]}
 */
export function cachesToDelete(names, scope, version) {
  const current = cacheName(scope, version);
  const own = current.slice(0, current.length - version.length);
  const older = names.filter((n) => n.startsWith(own) && n !== current);
  return older.slice(0, -1);
}
