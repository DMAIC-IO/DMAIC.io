/**
 * D.Mike — Declarative routing layer.
 * Registers a reactive `route` Alpine store plus the `$route` magic and the
 * `x-route` directive so module templates can resolve their own sub-path
 * without imperative tab wiring. CSP-safe: `x-route` reads its attribute
 * value literally and never evaluates an Alpine expression.
 * NOTE: `x-route` is a reusable primitive currently consumed by no shipping
 * template — regression drives tabs via `$route.go` + an `activeTab` watch
 * (not via `x-route`). Do not assume `x-route` is in active use.
 */

const INITIAL = { kind: 'root', projectId: null, phaseId: null, instanceId: null, moduleType: null, pageId: null, sub: [] };

/**
 * True when the sub-path's head segment equals `key`.
 * @param {string[]} sub
 * @param {string} key
 * @returns {boolean}
 */
export function subMatches(sub, key) {
  return Array.isArray(sub) && sub.length > 0 && sub[0] === key;
}

/**
 * Register the route store, `$route` magic, and `x-route` directive.
 * Idempotent — guarded so repeated calls (tests, re-init) are harmless.
 * @param {object} Alpine - the csp.js default export
 * @param {{ onGo: (sub: string[]) => void }} opts
 */
export function registerRouteDirectives(Alpine, { onGo }) {
  if (Alpine.store('route') === undefined) {
    Alpine.store('route', { ...INITIAL });
  }

  // $route → the CURRENT route store plus a scoped go() that delegates to the
  // router. Modules read $route.sub for their own tail and call $route.go(...).
  Alpine.magic('route', () => {
    const store = Alpine.store('route');
    return {
      get sub() { return store.sub; },
      get instanceId() { return store.instanceId; },
      matches: (key) => subMatches(store.sub, key),
      go: (sub) => onGo(Array.isArray(sub) ? sub : [sub]),
    };
  });

  // x-route="scatter" → show element only while the route sub head === "scatter".
  // Reads the literal attribute value (el.getAttribute) — no expression eval.
  Alpine.directive('route', (el, { expression }, { effect }) => {
    const key = (expression || el.getAttribute('x-route') || '').trim();
    effect(() => {
      const store = Alpine.store('route');
      el.style.display = subMatches(store.sub, key) ? '' : 'none';
    });
  });
}

/**
 * Replace the route store contents (the Router calls this on every apply).
 * @param {object} Alpine
 * @param {object} route - a Route object
 */
export function setRouteStore(Alpine, route) {
  const store = Alpine.store('route');
  if (!store) return;
  Object.assign(store, { ...INITIAL, ...route });
}
