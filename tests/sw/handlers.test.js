import { suite, test, assertEqual } from '../test-utils.js';
import { createHandlers } from '../../js/sw/handlers.js';

const OWN = 'dmike-own';

/** A fake CacheStorage: `contents` maps cache name → { url: response }, in key order (oldest first). */
function fakeCaches(contents) {
  const open = async (name) => ({
    match: async (request) => contents[name]?.[request.url ?? request],
  });
  return {
    open,
    match: async (request) => {
      for (const name of Object.keys(contents)) {
        const hit = contents[name][request.url ?? request];
        if (hit) return hit;
      }
      return undefined;
    },
  };
}

const request = { url: 'https://x/app/examples/index.json' };
const cached = (tag) => ({ ok: true, status: 200, tag });

suite('sw handlers — network-first', () => {
  test('a hanging network falls back to the cache after the timeout', async () => {
    const handlers = createHandlers({
      caches: fakeCaches({ [OWN]: { [request.url]: cached('own') } }),
      cacheName: OWN,
      fetch: () => new Promise(() => {}),
      timeoutMs: 10,
    });
    const res = await handlers['network-first'](request);
    assertEqual(res.tag, 'own');
  });

  test('a redirected response (captive portal) falls back to the cache', async () => {
    const handlers = createHandlers({
      caches: fakeCaches({ [OWN]: { [request.url]: cached('own') } }),
      cacheName: OWN,
      fetch: async () => ({ ok: true, status: 200, redirected: true, tag: 'portal' }),
      timeoutMs: 10,
    });
    const res = await handlers['network-first'](request);
    assertEqual(res.tag, 'own');
  });

  test('a non-ok response falls back to the cache', async () => {
    const handlers = createHandlers({
      caches: fakeCaches({ [OWN]: { [request.url]: cached('own') } }),
      cacheName: OWN,
      fetch: async () => ({ ok: false, status: 503, tag: 'error' }),
      timeoutMs: 10,
    });
    const res = await handlers['network-first'](request);
    assertEqual(res.tag, 'own');
  });

  test('a non-ok response without a cached copy is passed through', async () => {
    const handlers = createHandlers({
      caches: fakeCaches({ [OWN]: {} }),
      cacheName: OWN,
      fetch: async () => ({ ok: false, status: 404, tag: 'missing' }),
      timeoutMs: 10,
    });
    const res = await handlers['network-first'](request);
    assertEqual(res.tag, 'missing');
  });

  test('a fresh network response wins over the cache', async () => {
    const handlers = createHandlers({
      caches: fakeCaches({ [OWN]: { [request.url]: cached('own') } }),
      cacheName: OWN,
      fetch: async () => ({ ok: true, status: 200, tag: 'net' }),
      timeoutMs: 10,
    });
    const res = await handlers['network-first'](request);
    assertEqual(res.tag, 'net');
  });

  test('offline, the own cache wins over an older version cache', async () => {
    const handlers = createHandlers({
      caches: fakeCaches({ 'dmike-old': { [request.url]: cached('old') }, [OWN]: { [request.url]: cached('own') } }),
      cacheName: OWN,
      fetch: async () => { throw new TypeError('Failed to fetch'); },
      timeoutMs: 10,
    });
    const res = await handlers['network-first'](request);
    assertEqual(res.tag, 'own');
  });
});

suite('sw handlers — cache-first', () => {
  test('the own cache wins over an older version cache', async () => {
    const handlers = createHandlers({
      caches: fakeCaches({ 'dmike-old': { [request.url]: cached('old') }, [OWN]: { [request.url]: cached('own') } }),
      cacheName: OWN,
      fetch: async () => { throw new TypeError('Failed to fetch'); },
      timeoutMs: 10,
    });
    const res = await handlers['cache-first'](request);
    assertEqual(res.tag, 'own');
  });

  test('an older version cache still serves when the own cache misses', async () => {
    const handlers = createHandlers({
      caches: fakeCaches({ 'dmike-old': { [request.url]: cached('old') }, [OWN]: {} }),
      cacheName: OWN,
      fetch: async () => { throw new TypeError('Failed to fetch'); },
      timeoutMs: 10,
    });
    const res = await handlers['cache-first'](request);
    assertEqual(res.tag, 'old');
  });
});
