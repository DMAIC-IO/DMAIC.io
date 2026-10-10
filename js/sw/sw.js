/**
 * D.Mike service worker — install, activate and fetch handlers only; the
 * logic lives in strategy.js, caches.js and retry.js. The build bundles this
 * file into app/dev/sw.js and defines VERSION and PRECACHE.
 * Spec: docs/superpowers/specs/2026-10-10-service-worker-offline-design.md
 */
/* global VERSION, PRECACHE */
import { strategyFor } from './strategy.js';
import { cacheName, cachesToDelete } from './caches.js';
import { fetchWithRetry, withTimeout, runLimited } from './retry.js';

const SCOPE = self.registration.scope;
const CACHE = cacheName(SCOPE, VERSION);
const LISTED = new Set(PRECACHE);
const PAGE_TIMEOUT_MS = 3000;
const PRECACHE_CONCURRENCY = 8;
const MATCH = { ignoreVary: true };

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      await runLimited(PRECACHE, PRECACHE_CONCURRENCY, async (url) => {
        // cache: 'reload' — never fill the cache from a stale HTTP cache entry.
        const response = await fetchWithRetry(new Request(url, { cache: 'reload' }));
        await cache.put(url, response);
      });
    } catch (err) {
      // An incomplete cache must never serve: the previous worker stays.
      await caches.delete(CACHE);
      throw err;
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const stale = cachesToDelete(await caches.keys(), SCOPE, VERSION);
    await Promise.all(stale.map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const strategy = strategyFor(event.request, { scope: SCOPE, precache: LISTED });
  if (strategy === 'passthrough') return;
  event.respondWith(HANDLERS[strategy](event.request));
});

const HANDLERS = {
  /** Network first with a timeout; offline the cached shell. */
  async page(request) {
    try {
      return await withTimeout(fetch(request), PAGE_TIMEOUT_MS);
    } catch (err) {
      const cached = await (await caches.open(CACHE)).match('index.html', MATCH);
      if (cached) return cached;
      throw err;
    }
  },

  /** Hashed files: any cache of the origin, else the network with retries. */
  async 'cache-first'(request) {
    return (await caches.match(request, MATCH)) ?? fetchWithRetry(request);
  },

  /** Data files: fresh from the network, the cache when offline. */
  async 'network-first'(request) {
    try {
      return await fetch(request);
    } catch (err) {
      const cached = await caches.match(request, MATCH);
      if (cached) return cached;
      throw err;
    }
  },
};
