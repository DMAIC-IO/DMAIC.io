/**
 * DMAIC.io — Chunk loading (chunks.js)
 *
 * The build splits the bundle into js/app.min.js plus js/chunks/*.min.js.
 * This module owns everything chunk-related at runtime:
 *   - loadChunk / lazyChunk: dynamic import with one shared error path
 *     (a translated toast, configured once at boot from app.js);
 *   - prefetchChunks: after boot, on idle, a <link rel="modulepreload"> per
 *     chunk from the build's manifest, so a later import() of the same URL is
 *     served from the module map — offline included.
 */

/** Rejection of a chunk import; `cause` is the browser's original error. */
export class ChunkLoadError extends Error {
  constructor(cause) {
    super('chunk load failed', { cause });
    this.name = 'ChunkLoadError';
  }
}

const defaultHandler = (err) => console.error(err);
let errorHandler = defaultHandler;

/** Failures within this window after a report are not reported again. */
const REPORT_COOLDOWN_MS = 5000;
let clock = () => Date.now();
let lastReportAt = -Infinity;

/**
 * Configure the reaction to a failed chunk import (app.js: a toast).
 * Resets the report cooldown.
 * @param {((err: ChunkLoadError) => void)|null} fn  null restores the default
 * @param {{ now?: () => number }} [opts]  now: clock for the cooldown (tests)
 */
export function setChunkErrorHandler(fn, { now = () => Date.now() } = {}) {
  errorHandler = fn || defaultHandler;
  clock = now;
  lastReportAt = -Infinity;
}

/**
 * Mark rejections of already reported chunk imports as handled, so a caller
 * that does not catch them adds no "Uncaught (in promise)" after the toast.
 * @param {EventTarget} target  window in the app
 */
export function guardChunkRejections(target) {
  target.addEventListener('unhandledrejection', (ev) => {
    if (ev.reason instanceof ChunkLoadError) ev.preventDefault();
  });
}

/**
 * Await `importer()`; on failure report through the configured handler (at
 * most once per REPORT_COOLDOWN_MS) and rethrow as ChunkLoadError.
 * @template T
 * @param {() => Promise<T>} importer
 * @returns {Promise<T>}
 */
export async function loadChunk(importer) {
  try {
    return await importer();
  } catch (cause) {
    const err = new ChunkLoadError(cause);
    // One toast per burst: every render after a failed KaTeX load, say,
    // would otherwise stack another one.
    const now = clock();
    if (now - lastReportAt >= REPORT_COOLDOWN_MS) {
      lastReportAt = now;
      errorHandler(err);
    }
    throw err;
  }
}

/**
 * Cached lazy loader: the first call imports, later calls share the promise.
 * A failed import is not cached here, so the next call imports again. Note
 * that Chromium caches a failed module fetch itself; recovery from a network
 * failure then needs a page reload (see docs/ARCHITECTURE.md §7).
 * @template T
 * @param {() => Promise<T>} importer
 * @returns {() => Promise<T>}
 */
export function lazyChunk(importer) {
  let pending = null;
  return () => {
    pending ??= loadChunk(importer).catch((err) => {
      pending = null;
      throw err;
    });
    return pending;
  };
}

/**
 * Chunk URLs from the build's `<script type="application/json" id="chunk-manifest">`.
 * @param {Document} [doc]
 * @returns {string[]}  [] when missing, empty or malformed (dev runs, tests)
 */
export function readChunkManifest(doc = document) {
  const text = doc.getElementById('chunk-manifest')?.textContent?.trim();
  if (!text) return [];
  try {
    const list = JSON.parse(text);
    return Array.isArray(list) ? list.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

const onIdle = (fn) => (typeof requestIdleCallback === 'function'
  ? requestIdleCallback(fn, { timeout: 2000 })
  : setTimeout(fn, 0));

/**
 * On idle, append a modulepreload link per manifest chunk. Resolves when
 * every link has loaded or failed and then sets `data-chunks-prefetched="1"`
 * on <html> — the point from which the offline promise holds.
 * @param {{ doc?: Document, schedule?: (fn: () => void) => void }} [opts]
 * @returns {Promise<void>}
 */
export function prefetchChunks({ doc = document, schedule = onIdle } = {}) {
  const hrefs = readChunkManifest(doc);
  const done = () => { doc.documentElement.dataset.chunksPrefetched = '1'; };
  if (!hrefs.length) {
    done();
    return Promise.resolve();
  }
  return new Promise((resolve) => schedule(() => {
    const settled = hrefs.map((href) => new Promise((settle) => {
      const link = doc.createElement('link');
      link.rel = 'modulepreload';
      link.href = href;
      link.addEventListener('load', settle, { once: true });
      link.addEventListener('error', settle, { once: true });
      doc.head.append(link);
    }));
    Promise.all(settled).then(() => { done(); resolve(); });
  }));
}
