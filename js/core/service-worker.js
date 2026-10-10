/**
 * D.Mike — service worker registration.
 *
 * The worker (built to sw.js next to index.html, scope = the deployment
 * directory) makes the app work offline after a reload. Without service
 * worker support — plain http on a non-localhost host, an old browser — the
 * app runs as before; prefetchChunks() still covers the open page.
 */

const SW_URL = 'sw.js';

/**
 * The CSP enforces Trusted Types (`require-trusted-types-for 'script'`), and
 * register() is a script-URL sink. The CSP allows exactly one policy,
 * `dmaic-sw`, and it lets nothing through but sw.js. One policy per Trusted
 * Types factory: a second createPolicy with the same name would throw.
 */
let swPolicy = null;

/** @returns {string|TrustedScriptURL} `url` as the sink accepts it */
function scriptUrl(url, tt) {
  if (!tt?.createPolicy) return url;
  if (swPolicy?.tt !== tt) {
    swPolicy = {
      tt,
      policy: tt.createPolicy('dmaic-sw', {
        createScriptURL: (value) => {
          if (value !== SW_URL) throw new TypeError(`dmaic-sw refuses ${value}`);
          return value;
        },
      }),
    };
  }
  return swPolicy.policy.createScriptURL(url);
}

/**
 * Register sw.js. Never throws and never shows a toast: a missing sw.js in an
 * unbuilt dev tree is normal.
 * @param {{ nav?: Navigator|object, tt?: TrustedTypePolicyFactory|object, url?: string }} [opts]
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export function registerServiceWorker({
  nav = globalThis.navigator, tt = globalThis.trustedTypes, url = SW_URL,
} = {}) {
  if (!nav?.serviceWorker) return Promise.resolve(null);
  return Promise.resolve()
    .then(() => nav.serviceWorker.register(scriptUrl(url, tt)))
    .catch((err) => {
      console.warn('[sw] registration failed:', err?.message ?? err);
      return null;
    });
}
