/**
 * D.Mike — Resampling runner contract. Every ResamplingRunner (inline today,
 * web worker later) must pass this suite: bit-identical results for any chunk
 * size, progress up to total, AbortError on cancel, engine errors passed on.
 *
 * Usage: defineRunnerContract('inline', (chunkSize) => createInlineRunner({ chunkSize }));
 */

import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { runJobSync, ResamplingError } from '../../js/engines/resampling-engine.js';

const X = [9.98, 10.02, 10.05, 9.95, 10.01, 9.99, 10.03, 10.07, 9.96, 10.00];
const Y = [10.10, 10.04, 10.12, 10.08, 10.15, 10.06, 10.11, 10.09];

// Small B keeps chunkSize = 1 fast (every chunk awaits a macrotask).
const JOBS = [
  { kind: 'bootstrapOne', data: { x: X }, statistic: { id: 'median' },
    options: { B: 60, seed: 3, confidence: 0.9 } },
  { kind: 'permutationTwo', data: { x: X, y: Y }, statistic: { id: 'mean' },
    options: { B: 60, seed: 4, confidence: 0.95, exactThreshold: 0 } },
  { kind: 'permutationK', data: { groups: [[1.2, 2.3], [2.9, 3.4], [0.8, 1.1]] }, statistic: { id: 'mean' },
    options: { B: 40, seed: 5, confidence: 0.95 } },
];

/** Deep equality where numbers and typed-array elements must be bit-identical. */
function assertBitIdentical(a, b, path = 'result') {
  if (typeof a === 'number' || typeof b === 'number') {
    assertTrue(Object.is(a, b), `${path}: ${a} !== ${b}`);
    return;
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    assertEqual(a, b, path);
    return;
  }
  if (ArrayBuffer.isView(a) || Array.isArray(a)) {
    assertEqual(a.length, b.length, `${path}.length`);
    assertEqual(Object.getPrototypeOf(a), Object.getPrototypeOf(b), `${path} type`);
    for (let i = 0; i < a.length; i++) assertBitIdentical(a[i], b[i], `${path}[${i}]`);
    return;
  }
  const ka = Object.keys(a).sort();
  assertEqual(ka.join(','), Object.keys(b).sort().join(','), `${path} keys`);
  for (const k of ka) assertBitIdentical(a[k], b[k], `${path}.${k}`);
}

async function rejection(promise) {
  try { await promise; } catch (err) { return err; }
  throw new Error('expected the run to reject');
}

/**
 * Register the runner contract suite.
 * @param {string} label
 * @param {(chunkSize: number) => {run: Function}} factory
 */
export function defineRunnerContract(label, factory) {
  suite(`resampling runner contract — ${label}`, () => {
    for (const job of JOBS) {
      test(`${job.kind}: bit-identical for chunk sizes 1, 500 and B`, async () => {
        const reference = runJobSync(job);
        for (const chunkSize of [1, 500, job.options.B]) {
          const result = await factory(chunkSize).run(job);
          assertBitIdentical(result, reference, `chunkSize ${chunkSize}`);
        }
      });
    }

    test('progress is monotonic and reaches total', async () => {
      const calls = [];
      await factory(7).run(JOBS[2], { onProgress: (done, total) => calls.push([done, total]) });
      assertTrue(calls.length > 1);
      const total = calls[0][1];
      assertTrue(calls.every(([, t]) => t === total));
      for (let i = 1; i < calls.length; i++) assertTrue(calls[i][0] > calls[i - 1][0]);
      assertEqual(calls[calls.length - 1][0], total);
    });

    // Review Focus 3: cancel (and module destroy) must stop a running job.
    test('abort during the run rejects with AbortError', async () => {
      const controller = new AbortController();
      let calls = 0;
      const err = await rejection(factory(10).run(JOBS[0], {
        signal: controller.signal,
        onProgress: () => { calls++; controller.abort(); },
      }));
      assertEqual(err.name, 'AbortError');
      assertTrue(calls >= 1);
    });

    test('an already aborted signal rejects without progress', async () => {
      const controller = new AbortController();
      controller.abort();
      let calls = 0;
      const err = await rejection(factory(10).run(JOBS[0], {
        signal: controller.signal, onProgress: () => { calls++; },
      }));
      assertEqual(err.name, 'AbortError');
      assertEqual(calls, 0);
    });

    test('invalid jobs reject with the engine ResamplingError', async () => {
      const bad = { ...JOBS[0], data: { x: [1] } };
      const err = await rejection(factory(10).run(bad));
      assertTrue(err instanceof ResamplingError);
      assertEqual(err.code, 'insufficient-data');
    });
  });
}
