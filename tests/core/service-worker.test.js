import { suite, test, assert, assertEqual, assertDeepEqual } from '../test-utils.js';
import { registerServiceWorker } from '../../js/core/service-worker.js';

/** Run `fn` with console.warn captured; returns the warnings. */
async function captureWarnings(fn) {
  const warned = [];
  const original = console.warn;
  console.warn = (...args) => warned.push(args.map(String).join(' '));
  try { await fn(); } finally { console.warn = original; }
  return warned;
}

suite('registerServiceWorker', () => {
  test('without serviceWorker (insecure context) it does nothing', async () => {
    const warned = await captureWarnings(async () => {
      assertEqual(await registerServiceWorker({ nav: {} }), null);
    });
    assertDeepEqual(warned, []);
  });

  test('without Trusted Types it registers sw.js relative to the page', async () => {
    const calls = [];
    const nav = { serviceWorker: { register: async (url) => { calls.push(url); return { scope: 'x' }; } } };
    const reg = await registerServiceWorker({ nav, tt: null });
    assertDeepEqual(calls, ['sw.js']);
    assertEqual(reg.scope, 'x');
  });

  test('under Trusted Types it registers through the dmaic-sw policy', async () => {
    const policies = [];
    const tt = {
      createPolicy: (name, rules) => {
        policies.push(name);
        return { createScriptURL: (url) => ({ trusted: rules.createScriptURL(url) }) };
      },
    };
    const calls = [];
    const nav = { serviceWorker: { register: async (url) => { calls.push(url); return {}; } } };
    await registerServiceWorker({ nav, tt });
    await registerServiceWorker({ nav, tt });
    assertDeepEqual(policies, ['dmaic-sw']);
    assertDeepEqual(calls, [{ trusted: 'sw.js' }, { trusted: 'sw.js' }]);
  });

  test('the dmaic-sw policy refuses every URL but sw.js', async () => {
    const tt = { createPolicy: (name, rules) => ({ createScriptURL: rules.createScriptURL }) };
    const nav = { serviceWorker: { register: async () => ({}) } };
    const warned = await captureWarnings(async () => {
      assertEqual(await registerServiceWorker({ nav, tt, url: 'evil.js' }), null);
    });
    assertEqual(warned.length, 1);
    assert(warned[0].startsWith('[sw]'), `prefixed warning: ${warned[0]}`);
  });

  test('a rejected registration only warns', async () => {
    const nav = { serviceWorker: { register: () => Promise.reject(new Error('404 sw.js')) } };
    const warned = await captureWarnings(async () => {
      assertEqual(await registerServiceWorker({ nav }), null);
    });
    assertEqual(warned.length, 1);
    assert(warned[0].startsWith('[sw]'), `prefixed warning: ${warned[0]}`);
  });
});
