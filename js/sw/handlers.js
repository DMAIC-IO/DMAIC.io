/**
 * D.Mike service worker — fetch handlers per strategy (see strategy.js).
 * Dependencies come in through createHandlers so the handlers run in tests
 * without a worker scope.
 */
import { fetchWithRetry, withTimeout } from './retry.js';

const MATCH = { ignoreVary: true };

/**
 * @param {{ caches: CacheStorage, cacheName: string, fetch: (r: Request) => Promise<Response>, timeoutMs: number }} deps
 *   cacheName is this worker's own cache; timeoutMs bounds every network-first attempt
 * @returns {{ page: Function, 'cache-first': Function, 'network-first': Function }}
 */
export function createHandlers({ caches, cacheName, fetch, timeoutMs }) {
  return {
    /** Network first with a timeout; offline the cached shell. */
    async page(request) {
      try {
        return await withTimeout(fetch(request), timeoutMs);
      } catch (err) {
        const cached = await (await caches.open(cacheName)).match('index.html', MATCH);
        if (cached) return cached;
        throw err;
      }
    },

    /** Hashed files: the cache (own version first), else the network with retries. */
    async 'cache-first'(request) {
      return (await fromCache(request)) ?? fetchWithRetry(request, { fetch });
    },

    /**
     * Data files: fresh from the network, the cache when offline. A hanging
     * request, an error status and a redirect (captive portal) count as
     * offline; without a cached copy an error status is passed through.
     */
    async 'network-first'(request) {
      let response;
      try {
        response = await withTimeout(fetch(request), timeoutMs);
        if (response.ok && !response.redirected) return response;
      } catch (err) {
        const cached = await fromCache(request);
        if (cached) return cached;
        throw err;
      }
      return (await fromCache(request)) ?? response;
    },
  };

  /** The own cache first: older version caches hold stale unhashed files. */
  async function fromCache(request) {
    return (await (await caches.open(cacheName)).match(request, MATCH))
      ?? (await caches.match(request, MATCH));
  }
}
