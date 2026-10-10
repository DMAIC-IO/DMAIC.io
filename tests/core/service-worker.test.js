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

  test('registers sw.js relative to the page', async () => {
    const calls = [];
    const nav = { serviceWorker: { register: async (url) => { calls.push(url); return { scope: 'x' }; } } };
    const reg = await registerServiceWorker({ nav });
    assertDeepEqual(calls, ['sw.js']);
    assertEqual(reg.scope, 'x');
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
