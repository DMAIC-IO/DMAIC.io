/**
 * D.Mike — Resampling engine (resampling-engine.js)
 *
 * Bootstrap intervals and permutation tests as a pure, seeded generator:
 * executeJob(job) yields { done, total } after every chunk of resamples and
 * returns a plain-data ResamplingResult. Jobs contain no functions and results
 * only numbers, arrays and Float64Arrays, so a future web-worker runner can
 * drive the same generator unchanged. One mulberry32 PRNG per job, consumed in
 * a fixed order — chunk boundaries never change a result.
 *
 * @see docs/superpowers/specs/2026-10-09-resampling-module-design.md
 */

import { mulberry32 } from './random-variates-engine.js';
import { ResamplingError, STATISTIC_IDS, makeStatistic } from './resampling-statistics.js';
import { percentileCI, bcaCI, jackknifeInfluence } from './resampling-intervals.js';

export { ResamplingError, STATISTICS, STATISTIC_IDS, makeStatistic } from './resampling-statistics.js';
export { normInter, percentileCI, bcaCI, jackknifeInfluence } from './resampling-intervals.js';

export const JOB_KINDS = [
  'bootstrapOne', 'bootstrapTwo', 'bootstrapPaired',
  'permutationTwo', 'permutationPaired', 'permutationK',
];

const LOCATION_STATISTICS = ['mean', 'median', 'trimmedMean'];

/** Statistics allowed per job kind (spec: paired location only, no Ppk for k). */
export const STATISTICS_BY_KIND = {
  bootstrapOne: STATISTIC_IDS,
  bootstrapTwo: STATISTIC_IDS,
  bootstrapPaired: LOCATION_STATISTICS,
  permutationTwo: STATISTIC_IDS,
  permutationPaired: LOCATION_STATISTICS,
  permutationK: STATISTIC_IDS.filter((id) => id !== 'ppk'),
};

export const DEFAULT_EXACT_THRESHOLD = 20000;
const MAX_B = 1000000;
const CONTRASTS = ['difference', 'ratio'];
const DIRECTIONS = ['two-sided', 'greater', 'less'];

function fail(code, message) {
  throw new ResamplingError(code, message);
}

function toSample(values, name) {
  if (!Array.isArray(values) && !ArrayBuffer.isView(values)) fail('invalid-options', `${name} must be an array`);
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) fail('invalid-options', `${name}[${i}] is not a finite number`);
    out[i] = v;
  }
  return out;
}

/**
 * Validate a job and normalize it for the job runners.
 * @param {object} job ResamplingJob
 * @returns {object} ValidJob
 * @throws {ResamplingError}
 */
export function validateJob(job) {
  if (!job || typeof job !== 'object') fail('invalid-options', 'job must be an object');
  const { kind } = job;
  if (!JOB_KINDS.includes(kind)) fail('invalid-options', `unknown job kind "${kind}"`);
  const stat = job.statistic && typeof job.statistic === 'object' ? job.statistic : {};
  if (STATISTIC_IDS.includes(stat.id) && !STATISTICS_BY_KIND[kind].includes(stat.id)) {
    fail('invalid-statistic-for-mode', `statistic "${stat.id}" is not allowed for ${kind}`);
  }
  const fn = makeStatistic(stat.id, stat.params || {});

  const o = job.options && typeof job.options === 'object' ? job.options : {};
  if (!Number.isInteger(o.B) || o.B < 1 || o.B > MAX_B) fail('invalid-options', 'B must be an integer in 1…1e6');
  if (!Number.isInteger(o.seed)) fail('invalid-options', 'seed must be an integer');
  if (typeof o.confidence !== 'number' || !(o.confidence > 0 && o.confidence < 1)) {
    fail('invalid-options', 'confidence must be in (0, 1)');
  }
  const contrast = o.contrast === undefined ? 'difference' : o.contrast;
  if (!CONTRASTS.includes(contrast)) fail('invalid-options', `unknown contrast "${contrast}"`);
  const direction = o.direction === undefined ? 'two-sided' : o.direction;
  if (!DIRECTIONS.includes(direction)) fail('invalid-options', `unknown direction "${direction}"`);
  const exactThreshold = o.exactThreshold === undefined ? DEFAULT_EXACT_THRESHOLD : o.exactThreshold;
  if (!Number.isInteger(exactThreshold) || exactThreshold < 0) fail('invalid-options', 'exactThreshold must be an integer ≥ 0');

  const d = job.data && typeof job.data === 'object' ? job.data : {};
  let samples;
  if (kind === 'permutationK') {
    if (!Array.isArray(d.groups)) fail('invalid-options', 'groups must be an array');
    samples = d.groups.map((g, i) => toSample(g, `groups[${i}]`));
    if (samples.length < 3) fail('insufficient-data', 'at least 3 groups are required');
  } else if (kind === 'bootstrapOne') {
    samples = [toSample(d.x, 'x')];
  } else {
    samples = [toSample(d.x, 'x'), toSample(d.y, 'y')];
  }
  for (const s of samples) if (s.length < 2) fail('insufficient-data', 'every sample needs at least 2 values');

  if (kind === 'bootstrapPaired' || kind === 'permutationPaired') {
    const [x, y] = samples;
    if (x.length !== y.length) fail('invalid-options', 'paired samples must have equal length');
    samples = [x.map((v, i) => v - y[i])];
  }
  if (contrast === 'ratio' && (kind === 'bootstrapTwo' || kind === 'permutationTwo')) {
    for (const s of samples) {
      if (s.some((v) => v <= 0)) fail('non-positive-ratio', 'ratio needs positive values');
      const t = fn(s);
      if (!(Number.isFinite(t) && t > 0)) fail('non-positive-ratio', 'ratio needs a positive statistic in both samples');
    }
  }
  return {
    kind, statisticId: stat.id, fn, samples,
    B: o.B, seed: o.seed, confidence: o.confidence, contrast, direction, exactThreshold,
  };
}

// ── Bootstrap ───────────────────────────────────────────────────────────────

/** Statistic of two samples per the contrast: θ(x) − θ(y) or θ(x) / θ(y). */
function contrastFn(v) {
  return v.contrast === 'ratio'
    ? (gs) => v.fn(gs[0]) / v.fn(gs[1])
    : (gs) => v.fn(gs[0]) - v.fn(gs[1]);
}

/**
 * B bootstrap replicates; each resample draws every group in order.
 * @returns {Float64Array}
 */
function* bootstrapReplicates(samples, combine, B, rng, p) {
  const bufs = samples.map((s) => new Float64Array(s.length));
  const reps = new Float64Array(B);
  for (let b = 0; b < B; b++) {
    for (let g = 0; g < samples.length; g++) {
      const src = samples[g];
      const dst = bufs[g];
      const n = src.length;
      for (let i = 0; i < n; i++) dst[i] = src[Math.floor(rng() * n)];
    }
    reps[b] = combine(bufs);
    if (++p.done % p.chunkSize === 0) yield { done: p.done, total: p.total };
  }
  return reps;
}

/**
 * Estimate, SE, bias and both intervals from the replicates. Non-finite
 * replicates are skipped; BCa falls back to the percentile interval.
 * @param {number} estimate
 * @param {Float64Array} replicates
 * @param {Float64Array} influence jackknife influence values
 * @param {number} confidence
 */
export function summarizeBootstrap(estimate, replicates, influence, confidence) {
  let n = 0;
  let s = 0;
  for (let i = 0; i < replicates.length; i++) {
    if (Number.isFinite(replicates[i])) { n++; s += replicates[i]; }
  }
  const m = n > 0 ? s / n : NaN;
  let se = null;
  if (n >= 2) {
    let ss = 0;
    for (let i = 0; i < replicates.length; i++) {
      if (Number.isFinite(replicates[i])) { const d = replicates[i] - m; ss += d * d; }
    }
    se = Math.sqrt(ss / (n - 1));
  }
  const bias = n >= 1 && Number.isFinite(estimate) ? m - estimate : null;
  const percentile = percentileCI(replicates, confidence);
  const bcaRaw = bcaCI(replicates, estimate, influence, confidence);
  return {
    estimate,
    se,
    bias,
    ci: { percentile, bca: bcaRaw === null ? percentile : bcaRaw, bcaFallback: bcaRaw === null },
    replicates,
  };
}

function* bootstrapSummary(samples, combine, v, rng, p) {
  const estimate = combine(samples);
  const replicates = yield* bootstrapReplicates(samples, combine, v.B, rng, p);
  const influence = jackknifeInfluence(samples, combine);
  return summarizeBootstrap(estimate, replicates, influence, v.confidence);
}

// ── Job runners ─────────────────────────────────────────────────────────────

const JOB_RUNNERS = {
  bootstrapOne: {
    total: (v) => v.B,
    run: (v, rng, p) => bootstrapSummary(v.samples, (gs) => v.fn(gs[0]), v, rng, p),
  },
  bootstrapPaired: {
    total: (v) => v.B,
    run: (v, rng, p) => bootstrapSummary(v.samples, (gs) => v.fn(gs[0]), v, rng, p),
  },
  bootstrapTwo: {
    total: (v) => v.B,
    run: (v, rng, p) => bootstrapSummary(v.samples, contrastFn(v), v, rng, p),
  },
};

/**
 * Run a job as a generator: yields { done, total } every `chunkSize` units of
 * work (plus a final tick), returns the ResamplingResult. Validation runs on
 * the first next().
 * @param {object} job ResamplingJob
 * @param {{ chunkSize?: number }} [opts]
 */
export function* executeJob(job, { chunkSize = 500 } = {}) {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) fail('invalid-options', 'chunkSize must be a positive integer');
  const v = validateJob(job);
  const runner = JOB_RUNNERS[v.kind];
  if (!runner) fail('invalid-options', `job kind "${v.kind}" is not implemented`);
  const p = { done: 0, total: runner.total(v), chunkSize };
  const result = yield* runner.run(v, mulberry32(v.seed), p);
  if (p.done % chunkSize !== 0) yield { done: p.done, total: p.total };
  return result;
}

/**
 * Run a job to completion synchronously (tests, tools).
 * @param {object} job
 * @param {{ chunkSize?: number }} [opts]
 */
export function runJobSync(job, opts) {
  const it = executeJob(job, opts);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}
