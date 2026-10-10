/**
 * D.Mike service worker — install, activate and fetch handlers only; the
 * logic lives in strategy.js, caches.js, retry.js and handlers.js. The build bundles this
 * file into app/dev/sw.js and defines VERSION and PRECACHE.
 * Spec: docs/superpowers/specs/2026-10-10-service-worker-offline-design.md
 */
/* global VERSION, PRECACHE */
import { strategyFor } from './strategy.js';
import { cacheName, cachesToDelete } from './caches.js';
import { fetchWithRetry, runLimited } from './retry.js';
import { createHandlers } from './handlers.js';

const SCOPE = self.registration.scope;
const CACHE = cacheName(SCOPE, VERSION);
const LISTED = new Set(PRECACHE);
const NETWORK_TIMEOUT_MS = 3000;
const PRECACHE_CONCURRENCY = 8;

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

const HANDLERS = createHandlers({
  caches,
  cacheName: CACHE,
  fetch: (request) => fetch(request),
  timeoutMs: NETWORK_TIMEOUT_MS,
});
