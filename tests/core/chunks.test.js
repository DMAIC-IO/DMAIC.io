import { suite, test, assert, assertEqual, assertDeepEqual, afterEach } from '../test-utils.js';
import {
  ChunkLoadError, setChunkErrorHandler, loadChunk, lazyChunk,
  readChunkManifest, prefetchChunks,
} from '../../js/core/chunks.js';

/** Detached document carrying an optional manifest script. */
function docWithManifest(json) {
  const doc = document.implementation.createHTMLDocument('t');
  if (json !== undefined) {
    const s = doc.createElement('script');
    s.type = 'application/json';
    s.id = 'chunk-manifest';
    s.textContent = json;
    doc.head.append(s);
  }
  return doc;
}

suite('chunks — loadChunk / lazyChunk', () => {
  afterEach(() => setChunkErrorHandler(null));

  test('loadChunk resolves to the importer result', async () => {
    assertEqual(await loadChunk(() => Promise.resolve(42)), 42);
  });

  test('loadChunk failure calls the handler and rethrows a ChunkLoadError', async () => {
    const seen = [];
    setChunkErrorHandler((err) => seen.push(err));
    const cause = new TypeError('Failed to fetch dynamically imported module');
    let thrown = null;
    try { await loadChunk(() => Promise.reject(cause)); } catch (e) { thrown = e; }
    assert(thrown instanceof ChunkLoadError, 'rethrows ChunkLoadError');
    assertEqual(thrown.cause, cause);
    assertEqual(seen.length, 1);
    assertEqual(seen[0], thrown);
  });

  test('without a configured handler the failure goes to console.error', async () => {
    const orig = console.error;
    const calls = [];
    console.error = (...a) => calls.push(a);
    try {
      await loadChunk(() => Promise.reject(new Error('x'))).catch(() => {});
    } finally { console.error = orig; }
    assertEqual(calls.length, 1);
  });

  test('lazyChunk imports once and returns the same promise', async () => {
    let n = 0;
    const get = lazyChunk(() => { n++; return Promise.resolve({ lib: 1 }); });
    const a = get();
    const b = get();
    assertEqual(a, b);
    assertEqual(await a, await b);
    assertEqual(n, 1);
  });

  test('lazyChunk retries after a failure', async () => {
    setChunkErrorHandler(() => {});
    let n = 0;
    const get = lazyChunk(() => (++n === 1 ? Promise.reject(new Error('offline')) : Promise.resolve('ok')));
    await get().catch(() => {});
    assertEqual(await get(), 'ok');
    assertEqual(n, 2);
  });
});

suite('chunks — manifest and prefetch', () => {
  test('readChunkManifest tolerates missing, empty and malformed manifests', () => {
    assertDeepEqual(readChunkManifest(docWithManifest()), []);
    assertDeepEqual(readChunkManifest(docWithManifest('')), []);
    assertDeepEqual(readChunkManifest(docWithManifest('{nope')), []);
    assertDeepEqual(readChunkManifest(docWithManifest('["js/chunks/a.min.js"]')), ['js/chunks/a.min.js']);
  });

  test('prefetchChunks appends one modulepreload link per entry inside schedule()', () => {
    const doc = docWithManifest('["js/chunks/a.min.js","js/chunks/b.min.js"]');
    let scheduled = null;
    prefetchChunks({ doc, schedule: (fn) => { scheduled = fn; } });
    assertEqual(doc.querySelectorAll('link[rel="modulepreload"]').length, 0, 'nothing before idle');
    scheduled();
    const hrefs = [...doc.querySelectorAll('link[rel="modulepreload"]')].map((l) => l.getAttribute('href'));
    assertDeepEqual(hrefs, ['js/chunks/a.min.js', 'js/chunks/b.min.js']);
  });

  test('prefetchChunks with an empty manifest is a no-op that still marks completion', async () => {
    const doc = docWithManifest();
    await prefetchChunks({ doc, schedule: (fn) => fn() });
    assertEqual(doc.querySelectorAll('link').length, 0);
    assertEqual(doc.documentElement.dataset.chunksPrefetched, '1');
  });

  test('prefetchChunks resolves once every link settled, failures included', async () => {
    const s = document.createElement('script');
    s.type = 'application/json';
    s.id = 'chunk-manifest';
    s.textContent = JSON.stringify(['../js/core/uid.js', '../js/core/does-not-exist-xyz.js']);
    document.head.append(s);
    try {
      await prefetchChunks({ schedule: (fn) => fn() });
      assertEqual(document.documentElement.dataset.chunksPrefetched, '1');
    } finally {
      s.remove();
      document.querySelectorAll('link[rel="modulepreload"]').forEach((l) => l.remove());
      delete document.documentElement.dataset.chunksPrefetched;
    }
  });
});
