/**
 * D.Mike — Resampling engine: validation, executeJob protocol, bootstrap jobs.
 */

import { suite, test, assertAlmostEqual, assertEqual, assertTrue } from '../test-utils.js';
import {
  validateJob, executeJob, runJobSync, ResamplingError, STATISTICS,
} from '../../js/engines/resampling-engine.js';
import { mulberry32 } from '../../js/engines/random-variates-engine.js';

const X = [9.98, 10.02, 10.05, 9.95, 10.01, 9.99, 10.03, 10.07, 9.96, 10.00];
const Y = [10.10, 10.04, 10.12, 10.08, 10.15, 10.06, 10.11, 10.09];

function job(kind, data, statistic = { id: 'mean' }, options = {}) {
  return { kind, data, statistic, options: { B: 2000, seed: 42, confidence: 0.95, ...options } };
}

function assertCode(fn, code) {
  try { fn(); } catch (err) {
    assertTrue(err instanceof ResamplingError, `expected ResamplingError, got ${err && err.name}: ${err && err.message}`);
    assertEqual(err.code, code);
    return;
  }
  throw new Error(`expected ResamplingError "${code}", nothing thrown`);
}

suite('resampling-engine — validateJob', () => {
  test('defaults', () => {
    const v = validateJob(job('bootstrapOne', { x: X }));
    assertEqual(v.contrast, 'difference');
    assertEqual(v.direction, 'two-sided');
    assertEqual(v.exactThreshold, 20000);
    assertTrue(v.samples[0] instanceof Float64Array);
  });
  test('paired → one sample of differences', () => {
    const v = validateJob(job('bootstrapPaired', { x: [3, 5, 9], y: [1, 1, 2] }));
    assertEqual(Array.from(v.samples[0]).join(','), '2,4,7');
  });
  test('invalid-options', () => {
    assertCode(() => validateJob(null), 'invalid-options');
    assertCode(() => validateJob(job('bootstrapThree', { x: X })), 'invalid-options');
    assertCode(() => validateJob(job('bootstrapOne', { x: 'abc' })), 'invalid-options');
    assertCode(() => validateJob(job('bootstrapOne', { x: [1, 2, NaN] })), 'invalid-options');
    assertCode(() => validateJob(job('bootstrapOne', { x: [1, 2, '3'] })), 'invalid-options');
    assertCode(() => validateJob(job('bootstrapOne', { x: X }, { id: 'cpk' })), 'invalid-options');
    assertCode(() => validateJob(job('bootstrapOne', { x: X }, { id: 'mean' }, { B: 0 })), 'invalid-options');
    assertCode(() => validateJob(job('bootstrapOne', { x: X }, { id: 'mean' }, { B: 2.5 })), 'invalid-options');
    assertCode(() => validateJob(job('bootstrapOne', { x: X }, { id: 'mean' }, { seed: 1.5 })), 'invalid-options');
    assertCode(() => validateJob(job('bootstrapOne', { x: X }, { id: 'mean' }, { confidence: 1 })), 'invalid-options');
    assertCode(() => validateJob(job('bootstrapTwo', { x: X, y: Y }, { id: 'mean' }, { contrast: 'sum' })), 'invalid-options');
    assertCode(() => validateJob(job('permutationTwo', { x: X, y: Y }, { id: 'mean' }, { direction: 'up' })), 'invalid-options');
    assertCode(() => validateJob(job('bootstrapPaired', { x: [1, 2, 3], y: [1, 2] })), 'invalid-options');
  });
  test('insufficient-data', () => {
    assertCode(() => validateJob(job('bootstrapOne', { x: [1] })), 'insufficient-data');
    assertCode(() => validateJob(job('bootstrapTwo', { x: X, y: [1] })), 'insufficient-data');
    assertCode(() => validateJob(job('permutationK', { groups: [X, Y] })), 'insufficient-data');
  });
  test('invalid-statistic-for-mode', () => {
    assertCode(() => validateJob(job('bootstrapPaired', { x: X, y: X }, { id: 'stddev' })), 'invalid-statistic-for-mode');
    assertCode(() => validateJob(job('permutationK', { groups: [X, Y, X] }, { id: 'ppk', params: { usl: 11 } })), 'invalid-statistic-for-mode');
  });
  test('invalid-limits', () => {
    assertCode(() => validateJob(job('bootstrapOne', { x: X }, { id: 'ppk', params: { lsl: 11, usl: 10 } })), 'invalid-limits');
  });
  test('non-positive-ratio', () => {
    assertCode(() => validateJob(job('bootstrapTwo', { x: [1, -2, 3], y: Y }, { id: 'mean' }, { contrast: 'ratio' })), 'non-positive-ratio');
    assertCode(() => validateJob(job('permutationTwo', { x: [1, 1, 1], y: Y }, { id: 'stddev' }, { contrast: 'ratio' })), 'non-positive-ratio');
  });
});

suite('resampling-engine — executeJob protocol', () => {
  test('validation happens on the first next()', () => {
    const it = executeJob(job('bootstrapOne', { x: [1] }));
    assertCode(() => it.next(), 'insufficient-data');
  });
  test('progress every chunk and a final tick, done reaches total', () => {
    const it = executeJob(job('bootstrapOne', { x: X }, { id: 'mean' }, { B: 1050 }), { chunkSize: 500 });
    const ticks = [];
    let r = it.next();
    while (!r.done) { ticks.push(r.value); r = it.next(); }
    assertEqual(ticks.map((t) => t.done).join(','), '500,1000,1050');
    assertTrue(ticks.every((t) => t.total === 1050));
  });
  test('no duplicate final tick when B is a multiple of chunkSize', () => {
    const it = executeJob(job('bootstrapOne', { x: X }, { id: 'mean' }, { B: 1000 }), { chunkSize: 500 });
    const ticks = [];
    let r = it.next();
    while (!r.done) { ticks.push(r.value.done); r = it.next(); }
    assertEqual(ticks.join(','), '500,1000');
  });
  test('invalid chunkSize → invalid-options', () => {
    assertCode(() => executeJob(job('bootstrapOne', { x: X }), { chunkSize: 0 }).next(), 'invalid-options');
  });
});

suite('resampling-engine — bootstrap jobs', () => {
  test('bootstrapOne: estimate, replicate count, RNG order', () => {
    const r = runJobSync(job('bootstrapOne', { x: X }));
    assertAlmostEqual(r.estimate, STATISTICS.mean(X), 1e-15);
    assertEqual(r.replicates.length, 2000);
    const rng = mulberry32(42);
    const first = X.map(() => X[Math.floor(rng() * X.length)]);
    assertEqual(r.replicates[0], STATISTICS.mean(first));
    assertTrue(r.se > 0);
    assertAlmostEqual(r.bias, r.replicates.reduce((s, t) => s + t, 0) / 2000 - r.estimate, 1e-12);
    assertTrue(r.ci.percentile[0] < r.estimate && r.estimate < r.ci.percentile[1]);
    assertTrue(r.ci.bca[0] < r.estimate && r.estimate < r.ci.bca[1]);
    assertEqual(r.ci.bcaFallback, false);
  });
  test('same seed → identical, other seed → different', () => {
    const a = runJobSync(job('bootstrapOne', { x: X }));
    const b = runJobSync(job('bootstrapOne', { x: X }));
    const c = runJobSync(job('bootstrapOne', { x: X }, { id: 'mean' }, { seed: 43 }));
    assertEqual(a.ci.bca.join(','), b.ci.bca.join(','));
    assertTrue(a.ci.bca.join(',') !== c.ci.bca.join(','));
  });
  test('bootstrapTwo: x indices first, then y; difference and ratio', () => {
    const r = runJobSync(job('bootstrapTwo', { x: X, y: Y }));
    assertAlmostEqual(r.estimate, STATISTICS.mean(X) - STATISTICS.mean(Y), 1e-15);
    const rng = mulberry32(42);
    const xs = X.map(() => X[Math.floor(rng() * X.length)]);
    const ys = Y.map(() => Y[Math.floor(rng() * Y.length)]);
    assertEqual(r.replicates[0], STATISTICS.mean(xs) - STATISTICS.mean(ys));
    const q = runJobSync(job('bootstrapTwo', { x: X, y: Y }, { id: 'mean' }, { contrast: 'ratio' }));
    assertAlmostEqual(q.estimate, STATISTICS.mean(X) / STATISTICS.mean(Y), 1e-15);
    assertEqual(q.replicates[0], STATISTICS.mean(xs) / STATISTICS.mean(ys));
  });
  test('bootstrapPaired equals bootstrapOne on the differences', () => {
    const x = [42.1, 38.5, 45.0, 51.2, 39.8, 47.3];
    const y = [36.4, 35.9, 39.2, 44.8, 37.1, 40.5];
    const d = x.map((v, i) => v - y[i]);
    const p = runJobSync(job('bootstrapPaired', { x, y }, { id: 'median' }));
    const o = runJobSync(job('bootstrapOne', { x: d }, { id: 'median' }));
    assertEqual(Array.from(p.replicates).join(','), Array.from(o.replicates).join(','));
    assertEqual(p.ci.bca.join(','), o.ci.bca.join(','));
  });

  // Review Focus 2: non-finite replicates must never crash a run.
  test('degenerate Ppk resamples (sd = 0) are skipped, run completes', () => {
    const x = [5, 5, 5, 5, 5, 5, 5, 5, 5, 6];
    const r = runJobSync(job('bootstrapOne', { x }, { id: 'ppk', params: { lsl: 4, usl: 7 } }));
    assertTrue(Number.isFinite(r.estimate));
    assertTrue(Array.from(r.replicates).some((t) => !Number.isFinite(t)));
    assertTrue(Number.isFinite(r.se));
    assertTrue(r.ci.percentile === null || r.ci.percentile.every(Number.isFinite));
    assertTrue(r.ci.bca === null || r.ci.bca.every(Number.isFinite));
  });
  test('constant data: mean → null intervals; Ppk → infinite estimate, null intervals', () => {
    const x = [7, 7, 7, 7, 7, 7, 7, 7, 7, 7];
    const m = runJobSync(job('bootstrapOne', { x }));
    assertEqual(m.ci.percentile, null);
    assertEqual(m.ci.bca, null);
    assertEqual(m.ci.bcaFallback, true);
    assertEqual(m.se, 0);
    const p = runJobSync(job('bootstrapOne', { x }, { id: 'ppk', params: { lsl: 6, usl: 8 } }));
    assertEqual(p.estimate, Infinity);
    assertEqual(p.ci.percentile, null);
    assertEqual(p.ci.bca, null);
    assertEqual(p.se, null);
  });
  test('BCa not computable (no replicate below t0) → percentile with bcaFallback', () => {
    const x = [1, 1, 1, 1, 1, 1, 2, 3];
    const r = runJobSync(job('bootstrapOne', { x }, { id: 'median' }));
    assertEqual(r.ci.bcaFallback, true);
    assertTrue(r.ci.percentile !== null);
    assertEqual(r.ci.bca.join(','), r.ci.percentile.join(','));
  });
});
