/**
 * D.Mike — Resampling statistics (resampling-statistics.js)
 *
 * Statistic catalogue for the resampling engine. Each statistic takes a
 * Float64Array (or number[]) and returns a number, never mutating its input;
 * all definitions follow R (sample variance n − 1, quantile type 7,
 * mean(x, trim), Ppk with the overall sample standard deviation as in
 * process-capability-engine.js). Degenerate input yields NaN / ±Infinity
 * rather than an exception — the engine skips non-finite replicates.
 */

/** Error with a machine-readable code; the module maps codes to i18n keys. */
export class ResamplingError extends Error {
  /**
   * @param {'insufficient-data'|'invalid-limits'|'non-positive-ratio'|'invalid-statistic-for-mode'|'degenerate-statistic'|'invalid-options'} code
   * @param {string} [message]
   */
  constructor(code, message) {
    super(message || code);
    this.name = 'ResamplingError';
    this.code = code;
  }
}

function sum(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i];
  return s;
}

function mean(v) {
  return sum(v) / v.length;
}

/** Two-pass sample variance (n − 1). */
function variance(v) {
  const n = v.length;
  if (n < 2) return NaN;
  const m = mean(v);
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const d = v[i] - m;
    ss += d * d;
  }
  return ss / (n - 1);
}

function stddev(v) {
  return Math.sqrt(variance(v));
}

/** Sorted copy — never sorts the caller's array. */
function sortedCopy(v) {
  return Float64Array.from(v).sort();
}

function median(v) {
  const s = sortedCopy(v);
  const n = s.length;
  if (n === 0) return NaN;
  const half = Math.floor(n / 2);
  return n % 2 === 1 ? s[half] : (s[half - 1] + s[half]) / 2;
}

/** R quantile(type = 7). */
function quantile(v, { p }) {
  const s = sortedCopy(v);
  const n = s.length;
  if (n === 0) return NaN;
  const index = 1 + (n - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  const qs = s[lo - 1];
  if (index > lo && s[hi - 1] !== qs) {
    const h = index - lo;
    return (1 - h) * qs + h * s[hi - 1];
  }
  return qs;
}

/** R mean(x, trim): trim ≥ 0.5 → median; else drop floor(n·trim) per side. */
function trimmedMean(v, { trim }) {
  const n = v.length;
  if (n === 0) return NaN;
  if (trim <= 0) return mean(v);
  if (trim >= 0.5) return median(v);
  const s = sortedCopy(v);
  const lo = Math.floor(n * trim);
  return mean(s.subarray(lo, n - lo));
}

function cv(v) {
  return stddev(v) / mean(v);
}

/** Ppk with the overall sample standard deviation; one or two limits. */
function ppk(v, { lsl, usl }) {
  const m = mean(v);
  const s = stddev(v);
  const candidates = [];
  if (Number.isFinite(usl)) candidates.push((usl - m) / (3 * s));
  if (Number.isFinite(lsl)) candidates.push((m - lsl) / (3 * s));
  return Math.min(...candidates);
}

/** Raw statistic functions: (values, params) => number. No validation. */
export const STATISTICS = {
  mean: (v) => mean(v),
  median: (v) => median(v),
  stddev: (v) => stddev(v),
  variance: (v) => variance(v),
  trimmedMean,
  quantile,
  cv: (v) => cv(v),
  ppk,
};

/** Statistic ids in catalogue order. */
export const STATISTIC_IDS = ['mean', 'median', 'stddev', 'variance', 'trimmedMean', 'quantile', 'cv', 'ppk'];

function isLimit(x) {
  return x === null || x === undefined || Number.isFinite(x);
}

/**
 * Resolve a statistic description into a validated function.
 * @param {string} id
 * @param {object} [params]
 * @returns {(values: Float64Array|number[]) => number}
 * @throws {ResamplingError} invalid-options | invalid-limits
 */
export function makeStatistic(id, params = {}) {
  if (!STATISTIC_IDS.includes(id)) {
    throw new ResamplingError('invalid-options', `unknown statistic "${id}"`);
  }
  const p = params || {};
  if (id === 'trimmedMean') {
    if (typeof p.trim !== 'number' || !(p.trim >= 0 && p.trim < 0.5)) {
      throw new ResamplingError('invalid-options', 'trim must be in [0, 0.5)');
    }
    return (v) => trimmedMean(v, { trim: p.trim });
  }
  if (id === 'quantile') {
    if (typeof p.p !== 'number' || !(p.p > 0 && p.p < 1)) {
      throw new ResamplingError('invalid-options', 'p must be in (0, 1)');
    }
    return (v) => quantile(v, { p: p.p });
  }
  if (id === 'ppk') {
    if (!isLimit(p.lsl) || !isLimit(p.usl)) {
      throw new ResamplingError('invalid-limits', 'limits must be finite numbers');
    }
    const hasL = Number.isFinite(p.lsl);
    const hasU = Number.isFinite(p.usl);
    if (!hasL && !hasU) throw new ResamplingError('invalid-limits', 'Ppk needs LSL or USL');
    if (hasL && hasU && p.lsl >= p.usl) throw new ResamplingError('invalid-limits', 'LSL must be below USL');
    const limits = { lsl: hasL ? p.lsl : null, usl: hasU ? p.usl : null };
    return (v) => ppk(v, limits);
  }
  const fn = STATISTICS[id];
  return (v) => fn(v);
}
