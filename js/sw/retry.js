/**
 * D.Mike service worker — network helpers: retry, timeout, bounded fan-out.
 *
 * The chunk retry lives in the worker on purpose: while the module loader
 * waits for the worker's response, the worker retries, so a short network
 * glitch never reaches the module map (Chromium remembers a failed module
 * fetch per document).
 */

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch with retries. A network error and a non-ok status both count as a
 * failed attempt; after the last one the last error is thrown.
 * @param {Request|string} request
 * @param {{ attempts?: number, delays?: number[], fetch?: Function, sleep?: (ms: number) => Promise<void> }} [opts]
 *   delays[i] is the wait before attempt i + 2
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(request, {
  attempts = 3,
  delays = [500, 1000],
  fetch: doFetch = (r) => fetch(r),
  sleep = wait,
} = {}) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(delays[Math.min(i - 1, delays.length - 1)]);
    try {
      const response = await doFetch(request);
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status} for ${request.url ?? request}`);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/**
 * Settle with `promise`, or reject once `ms` have passed.
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @returns {Promise<T>}
 */
export function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Run `fn` over `items` with at most `limit` calls in flight. Rejects with the
 * first failure; after it no further item starts.
 * @template T
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<void>} fn
 * @returns {Promise<void>}
 */
export async function runLimited(items, limit, fn) {
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      const item = items[next++];
      try {
        await fn(item);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
