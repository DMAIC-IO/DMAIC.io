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

/**
 * Equal-width histogram bins of the finite values — the persisted, compact
 * form of a replicate or permutation distribution.
 * @param {ArrayLike<number>} values
 * @param {number} [binCount=30]
 * @returns {Array<{x0: number, x1: number, count: number}>}
 */
export function summarizeBins(values, binCount = 30) {
  if (!Number.isInteger(binCount) || binCount < 1) fail('invalid-options', 'binCount must be a positive integer');
  let lo = Infinity;
  let hi = -Infinity;
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    const x = values[i];
    if (!Number.isFinite(x)) continue;
    n++;
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  if (n === 0) return [];
  if (lo === hi) return [{ x0: lo - 0.5, x1: hi + 0.5, count: n }];
  const w = (hi - lo) / binCount;
  const bins = Array.from({ length: binCount }, (_, i) => ({
    x0: lo + i * w,
    x1: i === binCount - 1 ? hi : lo + (i + 1) * w,
    count: 0,
  }));
  for (let i = 0; i < values.length; i++) {
    const x = values[i];
    if (!Number.isFinite(x)) continue;
    bins[Math.min(binCount - 1, Math.floor((x - lo) / w))].count++;
  }
  return bins;
}

function* bootstrapSummary(samples, combine, v, rng, p) {
  const estimate = combine(samples);
  const replicates = yield* bootstrapReplicates(samples, combine, v.B, rng, p);
  const influence = jackknifeInfluence(samples, combine);
  return summarizeBootstrap(estimate, replicates, influence, v.confidence);
}

// ── Permutation ─────────────────────────────────────────────────────────────

/**
 * a ≥ b up to floating-point noise (same rule as the R reference scripts), so
 * permutations that reproduce the observed T count as "at least as extreme".
 * @param {number} a
 * @param {number} b
 */
export function ge(a, b) {
  return a >= b - 1e-10 * Math.max(1, Math.abs(b));
}

/** Hit predicate for a permutation statistic t given observed T0. */
function hitFor(direction, T0) {
  if (direction === 'greater') return (t) => ge(t, T0);
  if (direction === 'less') return (t) => ge(-t, -T0);
  const a = Math.abs(T0);
  return (t) => ge(Math.abs(t), a);
}

/** C(n, k), or Infinity as soon as an intermediate value exceeds limit. */
function binomialUpTo(n, k, limit) {
  const kk = Math.min(k, n - k);
  let c = 1;
  for (let i = 0; i < kk; i++) {
    c = (c * (n - i)) / (i + 1); // exact: every intermediate is C(n, i + 1)
    if (c > limit) return Infinity;
  }
  return c;
}

/**
 * Number of distinct assignments of the pooled values to groups of the given
 * sizes (N! / Π nᵢ!), or Infinity when it exceeds `limit`.
 * @param {number[]} sizes
 * @param {number} limit
 * @returns {number}
 */
export function countAssignments(sizes, limit) {
  let remaining = sizes.reduce((s, n) => s + n, 0);
  let total = 1;
  for (let g = 0; g < sizes.length - 1; g++) {
    const c = binomialUpTo(remaining, sizes[g], limit);
    if (c === Infinity) return Infinity;
    total *= c;
    if (total > limit) return Infinity;
    remaining -= sizes[g];
  }
  return total;
}

/** 2ⁿ sign flips, or Infinity above limit or beyond a safe 31-bit bitmask. */
function signFlipCount(n, limit) {
  if (n > 30) return Infinity;
  const c = 2 ** n;
  return c > limit ? Infinity : c;
}

/** k-subsets of 0…n−1 in lexicographic order; yields one reused array. */
function* combinations(n, k) {
  if (k > n) return;
  const idx = Array.from({ length: k }, (_, i) => i);
  for (;;) {
    yield idx;
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

/** Every assignment of positions 0…N−1 to groups; yields a reused label array. */
function* assignments(N, sizes) {
  const labels = new Int32Array(N);
  function* place(g, free) {
    if (g === sizes.length - 1) {
      for (const pos of free) labels[pos] = g;
      yield labels;
      return;
    }
    const mark = new Uint8Array(free.length);
    for (const c of combinations(free.length, sizes[g])) {
      mark.fill(0);
      for (const i of c) mark[i] = 1;
      const rest = [];
      for (let i = 0; i < free.length; i++) {
        if (mark[i]) labels[free[i]] = g; else rest.push(free[i]);
      }
      yield* place(g + 1, rest);
    }
  }
  yield* place(0, Array.from({ length: N }, (_, i) => i));
}

/**
 * Permutation distribution of Tfun over regroupings of the pooled samples.
 * Finite `count` → full enumeration (exact p = hits / count, no RNG draws);
 * otherwise B Fisher–Yates shuffles of one persistent working copy,
 * p = (1 + hits) / (B + 1).
 */
function* permuteGroups(samples, Tfun, hit, count, B, rng, p) {
  const sizes = samples.map((s) => s.length);
  const N = sizes.reduce((s, n) => s + n, 0);
  const pooled = new Float64Array(N);
  let off = 0;
  for (const s of samples) { pooled.set(s, off); off += s.length; }
  const bufs = sizes.map((n) => new Float64Array(n));
  let hits = 0;

  if (Number.isFinite(count)) {
    const fill = new Int32Array(sizes.length);
    const distribution = new Float64Array(count);
    let r = 0;
    for (const labels of assignments(N, sizes)) {
      fill.fill(0);
      for (let i = 0; i < N; i++) { const g = labels[i]; bufs[g][fill[g]++] = pooled[i]; }
      const t = Tfun(bufs);
      distribution[r++] = t;
      if (hit(t)) hits++;
      if (++p.done % p.chunkSize === 0) yield { done: p.done, total: p.total };
    }
    return { pValue: hits / count, exact: true, permutations: count, distribution };
  }

  const work = Float64Array.from(pooled);
  const distribution = new Float64Array(B);
  for (let b = 0; b < B; b++) {
    for (let i = N - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = work[i]; work[i] = work[j]; work[j] = tmp;
    }
    let o = 0;
    for (let g = 0; g < bufs.length; g++) { bufs[g].set(work.subarray(o, o + sizes[g])); o += sizes[g]; }
    const t = Tfun(bufs);
    distribution[b] = t;
    if (hit(t)) hits++;
    if (++p.done % p.chunkSize === 0) yield { done: p.done, total: p.total };
  }
  return { pValue: (1 + hits) / (B + 1), exact: false, permutations: B, distribution };
}

/** Sign-flip distribution of fn(±d): exact via bitmask, else B random flips. */
function* signFlips(d, fn, hit, count, B, rng, p) {
  const n = d.length;
  const buf = new Float64Array(n);
  let hits = 0;
  if (Number.isFinite(count)) {
    const distribution = new Float64Array(count);
    for (let m = 0; m < count; m++) {
      for (let i = 0; i < n; i++) buf[i] = (m >> i) & 1 ? -d[i] : d[i];
      const t = fn(buf);
      distribution[m] = t;
      if (hit(t)) hits++;
      if (++p.done % p.chunkSize === 0) yield { done: p.done, total: p.total };
    }
    return { pValue: hits / count, exact: true, permutations: count, distribution };
  }
  const distribution = new Float64Array(B);
  for (let b = 0; b < B; b++) {
    for (let i = 0; i < n; i++) buf[i] = rng() < 0.5 ? -d[i] : d[i];
    const t = fn(buf);
    distribution[b] = t;
    if (hit(t)) hits++;
    if (++p.done % p.chunkSize === 0) yield { done: p.done, total: p.total };
  }
  return { pValue: (1 + hits) / (B + 1), exact: false, permutations: B, distribution };
}

/**
 * Holm step-down adjustment, identical to R p.adjust(p, "holm").
 * @param {number[]} p raw p-values
 * @returns {number[]} adjusted p-values in input order
 */
export function holm(p) {
  const m = p.length;
  const order = p.map((_, i) => i).sort((a, b) => p[a] - p[b] || a - b);
  const out = new Array(m);
  let run = 0;
  order.forEach((idx, j) => {
    run = Math.max(run, Math.min(1, (m - j) * p[idx]));
    out[idx] = run;
  });
  return out;
}

function permutationResult(estimate, test) {
  return {
    estimate, se: null, bias: null,
    ci: { percentile: null, bca: null, bcaFallback: false },
    test,
  };
}

/** T for permutationTwo: θ(x) − θ(y), or log θ(x) − log θ(y) for ratio. */
function twoSampleT(v) {
  return v.contrast === 'ratio'
    ? (gs) => Math.log(v.fn(gs[0])) - Math.log(v.fn(gs[1]))
    : (gs) => v.fn(gs[0]) - v.fn(gs[1]);
}

const sizesOf = (samples) => samples.map((s) => s.length);
const orB = (count, B) => (Number.isFinite(count) ? count : B);

function kPairs(k) {
  const pairs = [];
  for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) pairs.push([i, j]);
  return pairs;
}

function* permutationTwoRun(v, rng, p) {
  const Tfun = twoSampleT(v);
  const T0 = Tfun(v.samples);
  const count = countAssignments(sizesOf(v.samples), v.exactThreshold);
  const t = yield* permuteGroups(v.samples, Tfun, hitFor(v.direction, T0), count, v.B, rng, p);
  return permutationResult(contrastFn(v)(v.samples), { observed: T0, ...t });
}

function* permutationPairedRun(v, rng, p) {
  const d = v.samples[0];
  const T0 = v.fn(d);
  const count = signFlipCount(d.length, v.exactThreshold);
  const t = yield* signFlips(d, v.fn, hitFor(v.direction, T0), count, v.B, rng, p);
  return permutationResult(T0, { observed: T0, ...t });
}

function permutationKTotal(v) {
  const sizes = sizesOf(v.samples);
  let total = orB(countAssignments(sizes, v.exactThreshold), v.B) + sizes.length * v.B;
  for (const [i, j] of kPairs(sizes.length)) {
    total += orB(countAssignments([sizes[i], sizes[j]], v.exactThreshold), v.B) + v.B;
  }
  return total;
}

function* permutationKRun(v, rng, p) {
  const gs = v.samples;
  const pooled = new Float64Array(gs.reduce((s, g) => s + g.length, 0));
  let off = 0;
  for (const g of gs) { pooled.set(g, off); off += g.length; }
  const theta = v.fn(pooled);
  const Tfun = (bufs) => {
    let s = 0;
    for (const b of bufs) { const d = v.fn(b) - theta; s += b.length * d * d; }
    return s;
  };
  const T0 = Tfun(gs);
  const count = countAssignments(sizesOf(gs), v.exactThreshold);
  const global = yield* permuteGroups(gs, Tfun, (t) => ge(t, T0), count, v.B, rng, p);

  const groups = [];
  for (const g of gs) {
    const s = yield* bootstrapSummary([g], (b) => v.fn(b[0]), v, rng, p);
    groups.push({ estimate: s.estimate, ci: s.ci });
  }

  const diff = (b) => v.fn(b[0]) - v.fn(b[1]);
  const posthoc = [];
  for (const [i, j] of kPairs(gs.length)) {
    const pair = [gs[i], gs[j]];
    const D0 = diff(pair);
    const pairCount = countAssignments([gs[i].length, gs[j].length], v.exactThreshold);
    const t = yield* permuteGroups(pair, diff, hitFor('two-sided', D0), pairCount, v.B, rng, p);
    const s = yield* bootstrapSummary(pair, diff, v, rng, p);
    posthoc.push({ i, j, contrast: s.estimate, ci: s.ci, pRaw: t.pValue, pHolm: null, exact: t.exact });
  }
  const adjusted = holm(posthoc.map((h) => h.pRaw));
  posthoc.forEach((h, idx) => { h.pHolm = adjusted[idx]; });

  return { ...permutationResult(theta, { observed: T0, ...global }), groups, posthoc };
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
  permutationTwo: {
    total: (v) => orB(countAssignments(sizesOf(v.samples), v.exactThreshold), v.B),
    run: permutationTwoRun,
  },
  permutationPaired: {
    total: (v) => orB(signFlipCount(v.samples[0].length, v.exactThreshold), v.B),
    run: permutationPairedRun,
  },
  permutationK: {
    total: permutationKTotal,
    run: permutationKRun,
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
