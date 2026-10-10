/**
 * D.Mike — service worker registration.
 *
 * The worker (built to sw.js next to index.html, scope = the deployment
 * directory) makes the app work offline after a reload. Without service
 * worker support — plain http on a non-localhost host, an old browser — the
 * app runs as before; prefetchChunks() still covers the open page.
 */

/**
 * Register sw.js. Never throws and never shows a toast: a missing sw.js in an
 * unbuilt dev tree is normal.
 * @param {{ nav?: Navigator|object, url?: string }} [opts]
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export function registerServiceWorker({ nav = globalThis.navigator, url = 'sw.js' } = {}) {
  if (!nav?.serviceWorker) return Promise.resolve(null);
  return nav.serviceWorker.register(url).catch((err) => {
    console.warn('[sw] registration failed:', err?.message ?? err);
    return null;
  });
}
