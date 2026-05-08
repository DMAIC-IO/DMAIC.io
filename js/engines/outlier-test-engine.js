/**
 * D.Mike — Outlier Test Engine (outlier-test-engine.js)
 *
 * Six classical procedures for identifying outliers in univariate samples:
 *
 *   - Grubbs' Test (single & two-sided)         — assumes normality, n ≥ 3
 *   - Dixon Q Test (Q, r11, r22 by n)            — small samples, n = 3..30
 *   - Generalized ESD (Rosner 1983)              — multiple outliers, n ≥ 15
 *   - Tukey IQR Rule (boxplot rule)              — distribution-free
 *   - Hampel Identifier (median + MAD)           — distribution-free, robust
 *   - Z-Score / Modified Z-Score                  — normality-based
 *
 * All routines return a uniform shape:
 *   {
 *     test:        string,        // method id
 *     n:           number,
 *     outliers:    Array<{ index, value, statistic? }>,
 *     parameters:  object,        // method-specific (alpha, threshold, …)
 *     critical?:   number,        // critical value when applicable
 *     statistic?:  number,        // single test statistic (Grubbs, Dixon)
 *     pValue?:     number,        // when computable (Grubbs)
 *     reject?:     boolean,       // single-step methods
 *     ...
 *   }
 */

import { tInv } from './math-utils.js';

// ─── Shared helpers ─────────────────────────────────────────

/** Median of a numeric array (does not mutate input). */
function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return NaN;
  return n % 2 ? s[(n - 1) / 2] : 0.5 * (s[n / 2 - 1] + s[n / 2]);
}

/**
 * Quartiles via the linear-interpolation rule (R-7 / Excel-style),
 * which is also what the boxplot chart uses.
 */
function quartiles(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const n = s.length;
  const q = (p) => {
    const k = (p / 100) * (n - 1);
    const f = Math.floor(k);
    const c = k - f;
    return f + 1 < n ? s[f] + c * (s[f + 1] - s[f]) : s[f];
  };
  return { q1: q(25), median: q(50), q3: q(75) };
}

function meanSd(arr) {
  const n = arr.length;
  const mean = arr.reduce((s, x) => s + x, 0) / n;
  let ss = 0;
  for (const x of arr) ss += (x - mean) * (x - mean);
  const sd = n > 1 ? Math.sqrt(ss / (n - 1)) : 0;
  return { mean, sd };
}

/**
 * Median Absolute Deviation, scaled to be a consistent estimator of σ
 * under normality (factor 1/Φ⁻¹(0.75) ≈ 1.4826).
 */
function mad(arr) {
  const med = median(arr);
  const dev = arr.map((x) => Math.abs(x - med));
  const rawMad = median(dev);
  return { median: med, mad: rawMad, madScaled: rawMad * 1.4826 };
}

// ─── Grubbs' Test ───────────────────────────────────────────

/**
 * Critical value for Grubbs' test at the given significance level.
 *
 *   G_crit = ((n-1)/√n) · √(t² / (n-2+t²))
 *
 * with t the upper α/(2n) quantile of t(n−2) for the two-sided test
 * and α/n for the one-sided test (Bonferroni correction).
 */
function grubbsCritical(n, alpha, side) {
  if (n < 3) return NaN;
  const tailProb = side === 'two-sided' ? alpha / (2 * n) : alpha / n;
  const tCrit = tInv(1 - tailProb, n - 2);
  return ((n - 1) / Math.sqrt(n)) * Math.sqrt(tCrit * tCrit / (n - 2 + tCrit * tCrit));
}

/**
 * p-value of an observed Grubbs statistic G via numerical inversion of the
 * critical-value relation. G_crit decreases monotonically as α grows, so
 * solve G_crit(α) = G by bisection on log α.
 */
function grubbsPValue(G, n, side) {
  let lo = 1e-12, hi = 0.999;
  for (let iter = 0; iter < 80; iter++) {
    const mid = Math.sqrt(lo * hi);
    if (!isFinite(mid) || mid <= 0) break;
    const Gm = grubbsCritical(n, mid, side);
    if (Gm < G) hi = mid; else lo = mid;
    if (hi / lo < 1.0001) break;
  }
  return Math.max(0, Math.min(1, Math.sqrt(lo * hi)));
}

/**
 * Grubbs' test for a single outlier.
 * @param {number[]} data
 * @param {number} [alpha=0.05]
 * @param {'two-sided'|'upper'|'lower'} [side='two-sided']
 */
export function grubbsTest(data, alpha = 0.05, side = 'two-sided') {
  const n = data.length;
  if (n < 3) throw new Error('min3');
  const { mean, sd } = meanSd(data);
  if (sd === 0) throw new Error('zeroVariance');

  let idx, value, G;
  if (side === 'upper') {
    idx = 0; value = data[0];
    for (let i = 1; i < n; i++) if (data[i] > value) { value = data[i]; idx = i; }
    G = (value - mean) / sd;
  } else if (side === 'lower') {
    idx = 0; value = data[0];
    for (let i = 1; i < n; i++) if (data[i] < value) { value = data[i]; idx = i; }
    G = (mean - value) / sd;
  } else {
    let maxAbs = -Infinity;
    for (let i = 0; i < n; i++) {
      const a = Math.abs(data[i] - mean);
      if (a > maxAbs) { maxAbs = a; idx = i; value = data[i]; }
    }
    G = maxAbs / sd;
  }

  const critical = grubbsCritical(n, alpha, side);
  const reject = G > critical;
  const pValue = grubbsPValue(G, n, side);

  return {
    test: 'grubbs',
    n,
    parameters: { alpha, side },
    statistic: G,
    critical,
    pValue,
    reject,
    mean,
    sd,
    outliers: reject ? [{ index: idx, value, statistic: G }] : [],
  };
}

// ─── Dixon Q Test ───────────────────────────────────────────

/**
 * Critical values for Dixon's Q test (Rorabacher 1991, two-sided),
 * indexed by [n][alphaKey]. n covers 3..30. Approximated for missing α
 * via log-linear interpolation between 0.10 / 0.05 / 0.01.
 *
 * The variant is selected from n:
 *   r10 (Q):  n =  3..7
 *   r11:      n =  8..10
 *   r21:      n = 11..13
 *   r22:      n = 14..30
 */
const DIXON_TABLE = {
  // r10
  3:  { '0.10': 0.886, '0.05': 0.941, '0.01': 0.988 },
  4:  { '0.10': 0.679, '0.05': 0.765, '0.01': 0.889 },
  5:  { '0.10': 0.557, '0.05': 0.642, '0.01': 0.780 },
  6:  { '0.10': 0.482, '0.05': 0.560, '0.01': 0.698 },
  7:  { '0.10': 0.434, '0.05': 0.507, '0.01': 0.637 },
  // r11
  8:  { '0.10': 0.479, '0.05': 0.554, '0.01': 0.683 },
  9:  { '0.10': 0.441, '0.05': 0.512, '0.01': 0.635 },
  10: { '0.10': 0.409, '0.05': 0.477, '0.01': 0.597 },
  // r21
  11: { '0.10': 0.517, '0.05': 0.576, '0.01': 0.679 },
  12: { '0.10': 0.490, '0.05': 0.546, '0.01': 0.642 },
  13: { '0.10': 0.467, '0.05': 0.521, '0.01': 0.615 },
  // r22
  14: { '0.10': 0.492, '0.05': 0.546, '0.01': 0.641 },
  15: { '0.10': 0.472, '0.05': 0.525, '0.01': 0.616 },
  16: { '0.10': 0.454, '0.05': 0.507, '0.01': 0.595 },
  17: { '0.10': 0.438, '0.05': 0.490, '0.01': 0.577 },
  18: { '0.10': 0.424, '0.05': 0.475, '0.01': 0.561 },
  19: { '0.10': 0.412, '0.05': 0.462, '0.01': 0.547 },
  20: { '0.10': 0.401, '0.05': 0.450, '0.01': 0.535 },
  21: { '0.10': 0.391, '0.05': 0.440, '0.01': 0.524 },
  22: { '0.10': 0.382, '0.05': 0.430, '0.01': 0.514 },
  23: { '0.10': 0.374, '0.05': 0.421, '0.01': 0.505 },
  24: { '0.10': 0.367, '0.05': 0.413, '0.01': 0.497 },
  25: { '0.10': 0.360, '0.05': 0.406, '0.01': 0.489 },
  26: { '0.10': 0.354, '0.05': 0.399, '0.01': 0.486 },
  27: { '0.10': 0.348, '0.05': 0.393, '0.01': 0.475 },
  28: { '0.10': 0.342, '0.05': 0.387, '0.01': 0.469 },
  29: { '0.10': 0.337, '0.05': 0.381, '0.01': 0.463 },
  30: { '0.10': 0.332, '0.05': 0.376, '0.01': 0.457 },
};

/** Dixon Q variant for a given sample size. */
function dixonVariant(n) {
  if (n <= 7) return 'r10';
  if (n <= 10) return 'r11';
  if (n <= 13) return 'r21';
  return 'r22';
}

/**
 * Pick the closest tabulated critical value, with log-linear interpolation
 * between α = {0.10, 0.05, 0.01} when an off-table α is requested.
 */
function dixonCritical(n, alpha) {
  const row = DIXON_TABLE[n];
  if (!row) return NaN;
  const a = alpha;
  if (a <= 0.01) return row['0.01'];
  if (a >= 0.10) return row['0.10'];
  // log-linear in α
  const a1 = a >= 0.05 ? 0.10 : 0.05;
  const a2 = a >= 0.05 ? 0.05 : 0.01;
  const c1 = row[a1.toFixed(2)];
  const c2 = row[a2.toFixed(2)];
  const t = (Math.log(a) - Math.log(a1)) / (Math.log(a2) - Math.log(a1));
  return c1 + t * (c2 - c1);
}

/**
 * Compute the Dixon Q ratio according to the variant.
 * Returns the maximum of the upper / lower test ratio plus its index.
 */
function dixonStatistic(sortedAsc, side) {
  const n = sortedAsc.length;
  const variant = dixonVariant(n);
  const x = sortedAsc;
  const range = x[n - 1] - x[0];
  if (range === 0) throw new Error('zeroVariance');

  const upperGap = (xn1, xnk) => Math.abs(x[n - 1] - x[n - 1 - xn1]) / Math.abs(x[n - 1] - x[xnk]);
  const lowerGap = (x1k, xkk) => Math.abs(x[x1k] - x[0]) / Math.abs(x[xkk] - x[0]);

  let qUp, qLow, idxUp, idxLow;
  if (variant === 'r10') {
    qUp  = upperGap(1, 0);              idxUp  = n - 1;
    qLow = lowerGap(1, n - 1);          idxLow = 0;
  } else if (variant === 'r11') {
    qUp  = upperGap(1, 1);              idxUp  = n - 1;
    qLow = lowerGap(1, n - 2);          idxLow = 0;
  } else if (variant === 'r21') {
    qUp  = upperGap(2, 1);              idxUp  = n - 1;
    qLow = lowerGap(2, n - 2);          idxLow = 0;
  } else {
    qUp  = upperGap(2, 2);              idxUp  = n - 1;
    qLow = lowerGap(2, n - 3);          idxLow = 0;
  }

  if (side === 'upper')  return { variant, q: qUp,  sortedIdx: idxUp,  side: 'upper' };
  if (side === 'lower')  return { variant, q: qLow, sortedIdx: idxLow, side: 'lower' };
  return qUp >= qLow
    ? { variant, q: qUp,  sortedIdx: idxUp,  side: 'upper' }
    : { variant, q: qLow, sortedIdx: idxLow, side: 'lower' };
}

/**
 * Dixon Q test for a single outlier.
 * @param {number[]} data
 * @param {number} [alpha=0.05]
 * @param {'two-sided'|'upper'|'lower'} [side='two-sided']
 */
export function dixonQTest(data, alpha = 0.05, side = 'two-sided') {
  const n = data.length;
  if (n < 3 || n > 30) throw new Error('dixonRange');
  const sortedIdx = data.map((v, i) => i).sort((a, b) => data[a] - data[b]);
  const sorted = sortedIdx.map((i) => data[i]);
  const stat = dixonStatistic(sorted, side);
  const critical = dixonCritical(n, alpha);
  const reject = stat.q > critical;
  const origIdx = sortedIdx[stat.sortedIdx];
  return {
    test: 'dixon-q',
    n,
    parameters: { alpha, side, variant: stat.variant },
    statistic: stat.q,
    critical,
    reject,
    side: stat.side,
    outliers: reject ? [{ index: origIdx, value: data[origIdx], statistic: stat.q }] : [],
  };
}

// ─── Generalized ESD (Rosner 1983) ──────────────────────────

/**
 * Critical λ_i for the generalized ESD test (Rosner 1983).
 *   p   = 1 − α / (2(n − i + 1))
 *   t   = t_(p, n − i − 1)
 *   λ_i = ((n − i) · t) / √((n − i − 1 + t²) · (n − i + 1))
 */
function esdLambda(n, i, alpha) {
  const p = 1 - alpha / (2 * (n - i + 1));
  const df = n - i - 1;
  if (df <= 0) return NaN;
  const t = tInv(p, df);
  return ((n - i) * t) / Math.sqrt((df + t * t) * (n - i + 1));
}

/**
 * Generalized ESD many-outlier test.
 * @param {number[]} data
 * @param {number} [alpha=0.05]
 * @param {number} [maxOutliers] — defaults to ⌊n/4⌋, capped at 10 for cost.
 */
export function generalizedESD(data, alpha = 0.05, maxOutliers) {
  const n = data.length;
  if (n < 4) throw new Error('min4');
  const k = maxOutliers ?? Math.min(10, Math.max(1, Math.floor(n / 4)));

  // Work on copies + original-index mapping.
  const remainingIdx = data.map((_, i) => i);
  const remainingVal = [...data];

  const steps = [];
  for (let i = 1; i <= k; i++) {
    if (remainingVal.length < 3) break;
    const { mean, sd } = meanSd(remainingVal);
    if (sd === 0) break;
    let maxR = -Infinity, maxJ = -1;
    for (let j = 0; j < remainingVal.length; j++) {
      const r = Math.abs(remainingVal[j] - mean) / sd;
      if (r > maxR) { maxR = r; maxJ = j; }
    }
    const lambda = esdLambda(n, i, alpha);
    const removedIdx = remainingIdx[maxJ];
    const removedVal = remainingVal[maxJ];
    steps.push({ i, R: maxR, lambda, index: removedIdx, value: removedVal, mean, sd });
    remainingIdx.splice(maxJ, 1);
    remainingVal.splice(maxJ, 1);
  }

  // Largest i for which R_i > λ_i is the number of outliers.
  let detected = 0;
  for (let s = 0; s < steps.length; s++) {
    if (steps[s].R > steps[s].lambda) detected = s + 1;
  }

  const outliers = steps.slice(0, detected).map((s) => ({
    index: s.index, value: s.value, statistic: s.R, critical: s.lambda,
  }));

  return {
    test: 'generalized-esd',
    n,
    parameters: { alpha, maxOutliers: k },
    steps,
    detected,
    outliers,
  };
}

// ─── Tukey IQR Rule ─────────────────────────────────────────

/**
 * Boxplot rule. Default factor 1.5 marks "potential" outliers; 3.0 marks
 * "extreme" outliers in the standard Tukey-fence definition.
 * @param {number[]} data
 * @param {number} [factor=1.5]
 */
export function tukeyIQR(data, factor = 1.5) {
  const n = data.length;
  if (n < 4) throw new Error('min4');
  const { q1, median: med, q3 } = quartiles(data);
  const iqr = q3 - q1;
  const lower = q1 - factor * iqr;
  const upper = q3 + factor * iqr;
  const outliers = [];
  for (let i = 0; i < n; i++) {
    if (data[i] < lower || data[i] > upper) {
      outliers.push({ index: i, value: data[i], statistic: data[i] < lower ? lower - data[i] : data[i] - upper });
    }
  }
  return {
    test: 'tukey-iqr',
    n,
    parameters: { factor },
    q1, median: med, q3, iqr,
    fenceLower: lower,
    fenceUpper: upper,
    outliers,
  };
}

// ─── Hampel Identifier ──────────────────────────────────────

/**
 * Robust outlier identifier based on the median and the scaled MAD.
 *   |xᵢ − median| / (1.4826 · MAD) > k
 * Default k = 3, corresponding to ≈ ±3σ for normal data.
 * @param {number[]} data
 * @param {number} [k=3]
 */
export function hampelIdentifier(data, k = 3) {
  const n = data.length;
  if (n < 3) throw new Error('min3');
  const m = mad(data);
  if (m.madScaled === 0) {
    return {
      test: 'hampel',
      n,
      parameters: { k },
      median: m.median,
      mad: m.mad,
      madScaled: 0,
      threshold: 0,
      outliers: [],
      degenerate: true,
    };
  }
  const threshold = k * m.madScaled;
  const outliers = [];
  for (let i = 0; i < n; i++) {
    const dev = Math.abs(data[i] - m.median);
    if (dev > threshold) {
      outliers.push({ index: i, value: data[i], statistic: dev / m.madScaled });
    }
  }
  return {
    test: 'hampel',
    n,
    parameters: { k },
    median: m.median,
    mad: m.mad,
    madScaled: m.madScaled,
    threshold,
    outliers,
  };
}

// ─── Z-Score / Modified Z-Score ─────────────────────────────

/**
 * Plain Z-score outlier test.
 *   |xᵢ − x̄| / s > threshold (default 3)
 * Bias warning: x̄ and s are themselves affected by the outliers.
 * @param {number[]} data
 * @param {number} [threshold=3]
 */
export function zScoreOutliers(data, threshold = 3) {
  const n = data.length;
  if (n < 3) throw new Error('min3');
  const { mean, sd } = meanSd(data);
  if (sd === 0) {
    return {
      test: 'z-score',
      n,
      parameters: { threshold },
      mean,
      sd,
      outliers: [],
      degenerate: true,
    };
  }
  const outliers = [];
  for (let i = 0; i < n; i++) {
    const z = (data[i] - mean) / sd;
    if (Math.abs(z) > threshold) {
      outliers.push({ index: i, value: data[i], statistic: z });
    }
  }
  return {
    test: 'z-score',
    n,
    parameters: { threshold },
    mean, sd,
    outliers,
  };
}

/**
 * Iglewicz-Hoaglin modified Z-score:
 *   M_i = 0.6745 (xᵢ − median) / MAD
 * Robust to the masking effect that hits the plain Z-score.
 * @param {number[]} data
 * @param {number} [threshold=3.5]
 */
export function modifiedZScore(data, threshold = 3.5) {
  const n = data.length;
  if (n < 3) throw new Error('min3');
  const m = mad(data);
  if (m.mad === 0) {
    return {
      test: 'modified-z',
      n,
      parameters: { threshold },
      median: m.median,
      mad: 0,
      outliers: [],
      degenerate: true,
    };
  }
  const outliers = [];
  for (let i = 0; i < n; i++) {
    const M = 0.6745 * (data[i] - m.median) / m.mad;
    if (Math.abs(M) > threshold) {
      outliers.push({ index: i, value: data[i], statistic: M });
    }
  }
  return {
    test: 'modified-z',
    n,
    parameters: { threshold },
    median: m.median,
    mad: m.mad,
    outliers,
  };
}

// ─── Aggregator ─────────────────────────────────────────────

/**
 * Run every applicable test and return a unified report. Tests that are
 * inapplicable for the current sample size are reported with `applicable: false`
 * so the UI can render a uniform table without per-test special cases.
 *
 * @param {number[]} data
 * @param {object} [opts]
 * @param {number} [opts.alpha=0.05]
 * @param {'two-sided'|'upper'|'lower'} [opts.side='two-sided']
 * @param {number} [opts.tukeyFactor=1.5]
 * @param {number} [opts.hampelK=3]
 * @param {number} [opts.zThreshold=3]
 * @param {number} [opts.modZThreshold=3.5]
 * @param {number} [opts.esdMaxOutliers]
 * @param {Set<string>} [opts.enabled]   — restrict to a subset of test ids
 */
export function runAllOutlierTests(data, opts = {}) {
  const {
    alpha = 0.05,
    side = 'two-sided',
    tukeyFactor = 1.5,
    hampelK = 3,
    zThreshold = 3,
    modZThreshold = 3.5,
    esdMaxOutliers,
    enabled,
  } = opts;

  const n = data.length;
  const want = (id) => !enabled || enabled.has(id);
  const wrap = (id, fn) => {
    if (!want(id)) return null;
    try { return fn(); } catch (e) { return { test: id, applicable: false, reason: e.message || 'error', n }; }
  };

  return {
    n,
    parameters: { alpha, side, tukeyFactor, hampelK, zThreshold, modZThreshold, esdMaxOutliers },
    grubbs:        wrap('grubbs',          () => grubbsTest(data, alpha, side)),
    'dixon-q':     wrap('dixon-q',         () => dixonQTest(data, alpha, side)),
    'generalized-esd': wrap('generalized-esd', () => generalizedESD(data, alpha, esdMaxOutliers)),
    'tukey-iqr':   wrap('tukey-iqr',       () => tukeyIQR(data, tukeyFactor)),
    hampel:        wrap('hampel',          () => hampelIdentifier(data, hampelK)),
    'z-score':     wrap('z-score',         () => zScoreOutliers(data, zThreshold)),
    'modified-z':  wrap('modified-z',      () => modifiedZScore(data, modZThreshold)),
  };
}

// Internal helpers exposed for unit tests (not part of the public API).
export const _internal = { median, quartiles, meanSd, mad, grubbsCritical, dixonCritical, esdLambda };
