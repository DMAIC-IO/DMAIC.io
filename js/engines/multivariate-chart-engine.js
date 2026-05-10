/**
 * D.Mike — Multivariate Control Chart Engine (multivariate-chart-engine.js)
 *
 * Hotelling T² control chart for individual observations on p correlated
 * variables. Detects shifts in any one variable OR in their relationships
 * (covariance structure) — Shewhart-on-each-variable misses the latter.
 *
 *   T²_i = (x_i - x̄)' S⁻¹ (x_i - x̄)
 *
 * Phase II UCL (individuals, m baseline observations, p variables):
 *   UCL = (p (m + 1) (m − 1)) / (m² − m·p) · F_{α, p, m − p}
 *
 * For typical SPC the α = 0.0027 (3-sigma equivalent) tail is used.
 *
 * No DOM, no state — pure stateless functions.
 */

import { fQuantile } from './math-utils.js';

const ALPHA_DEFAULT = 0.0027;

// ── Linear-algebra helpers (small matrices only — p typically ≤ 10) ──

/** Mean column-wise. */
function colMeans(rows) {
  const p = rows[0].length;
  const m = rows.length;
  const out = new Array(p).fill(0);
  for (const r of rows) for (let j = 0; j < p; j++) out[j] += r[j];
  for (let j = 0; j < p; j++) out[j] /= m;
  return out;
}

/** Sample covariance matrix (n-1 denominator). */
function covariance(rows) {
  const p = rows[0].length;
  const m = rows.length;
  const xbar = colMeans(rows);
  const cov = Array.from({ length: p }, () => new Array(p).fill(0));
  for (const r of rows) {
    for (let i = 0; i < p; i++) {
      for (let j = 0; j < p; j++) {
        cov[i][j] += (r[i] - xbar[i]) * (r[j] - xbar[j]);
      }
    }
  }
  for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) cov[i][j] /= (m - 1);
  return { mean: xbar, cov };
}

/**
 * Invert a small matrix via Gauss-Jordan. Throws on singularity.
 * @param {number[][]} A
 * @returns {number[][]}
 */
function invertMatrix(A) {
  const n = A.length;
  // Build [A | I]
  const M = A.map((row, i) => {
    const r = row.slice();
    for (let j = 0; j < n; j++) r.push(i === j ? 1 : 0);
    return r;
  });
  for (let i = 0; i < n; i++) {
    // Partial pivot
    let pivot = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(M[r][i]) > Math.abs(M[pivot][i])) pivot = r;
    }
    if (Math.abs(M[pivot][i]) < 1e-12) throw new Error('invertMatrix: singular matrix');
    if (pivot !== i) [M[i], M[pivot]] = [M[pivot], M[i]];
    const piv = M[i][i];
    for (let j = 0; j < 2 * n; j++) M[i][j] /= piv;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const factor = M[r][i];
      if (factor === 0) continue;
      for (let j = 0; j < 2 * n; j++) M[r][j] -= factor * M[i][j];
    }
  }
  return M.map(row => row.slice(n));
}

/** Quadratic form x' A x for column vector x and matrix A. */
function quadForm(x, A) {
  const n = x.length;
  let s = 0;
  for (let i = 0; i < n; i++) {
    let row = 0;
    for (let j = 0; j < n; j++) row += A[i][j] * x[j];
    s += x[i] * row;
  }
  return s;
}

// ── Hotelling T² ─────────────────────────────────────────────────────

/**
 * @typedef {Object} HotellingT2Result
 * @property {number[]} t2          — T² statistic per observation
 * @property {number} ucl           — Phase II control limit
 * @property {number} cl            — informational center (mean of T² ≈ p·(m-1)/(m-p))
 * @property {number[]} mean        — column means
 * @property {number[][]} cov       — sample covariance matrix
 * @property {number[][]} covInv    — inverse covariance
 * @property {number} m             — baseline sample size used to estimate S
 * @property {number} p             — number of variables
 * @property {number[]} signals     — indices where T²_i > UCL
 */

/**
 * Compute Hotelling T² for individual observations.
 * @param {number[][]} data — m × p (rows = observations, cols = variables)
 * @param {Object} [options]
 * @param {number} [options.alpha=0.0027] — type-I error for the UCL
 * @param {number} [options.baselineEnd]  — number of preliminary rows used to
 *   estimate mean+cov; defaults to all rows
 * @returns {HotellingT2Result}
 */
export function computeHotellingT2(data, options = {}) {
  if (!Array.isArray(data) || data.length < 2) {
    throw new Error('computeHotellingT2: need at least 2 observations');
  }
  const p = data[0].length;
  if (!Number.isInteger(p) || p < 2) {
    throw new Error('computeHotellingT2: need at least 2 variables');
  }
  for (const row of data) {
    if (!Array.isArray(row) || row.length !== p) {
      throw new Error('computeHotellingT2: rows must all have the same length');
    }
  }
  const alpha = options.alpha ?? ALPHA_DEFAULT;
  const blEnd = options.baselineEnd && options.baselineEnd > p
    ? Math.min(options.baselineEnd, data.length)
    : data.length;
  const baseline = data.slice(0, blEnd);
  const m = baseline.length;
  if (m <= p) {
    throw new Error('computeHotellingT2: baseline size m must exceed number of variables p');
  }

  const { mean, cov } = covariance(baseline);
  const covInv = invertMatrix(cov);

  const t2 = data.map(row => {
    const dx = row.map((v, j) => v - mean[j]);
    return quadForm(dx, covInv);
  });

  // Phase II UCL for individuals
  const fCrit = fQuantile(1 - alpha, p, m - p);
  const factor = (p * (m + 1) * (m - 1)) / (m * m - m * p);
  const ucl = factor * fCrit;
  const cl = (p * (m - 1)) / (m - p);  // expected mean of T² under H0

  const signals = [];
  for (let i = 0; i < t2.length; i++) if (t2[i] > ucl) signals.push(i);

  return { t2, ucl, cl, mean, cov, covInv, m, p, signals };
}

// ── Unified Dispatcher ───────────────────────────────────────────────

/**
 * Unified dispatcher.
 *   "hotelling-t2" → flat {t2.ucl, t2.cl, t2.signal_count, t2.first, t2.last, t2.max}
 *
 * @param {Object} inputs
 * @param {"hotelling-t2"} inputs.mode
 * @param {number[][]} inputs.data
 * @param {number} [inputs.alpha]
 * @param {number} [inputs.baselineEnd]
 * @returns {Object}
 */
export function analyze(inputs) {
  if (!inputs || typeof inputs.mode !== 'string') {
    throw new Error('analyze: inputs.mode (string) is required');
  }
  if (inputs.mode !== 'hotelling-t2') {
    throw new Error(`analyze: unknown mode '${inputs.mode}'`);
  }
  const r = computeHotellingT2(inputs.data || [], {
    alpha: inputs.alpha,
    baselineEnd: inputs.baselineEnd,
  });
  const max = r.t2.reduce((a, b) => Math.max(a, b), -Infinity);
  return {
    't2.ucl':          r.ucl,
    't2.cl':           r.cl,
    't2.signal_count': r.signals.length,
    't2.first':        r.t2[0],
    't2.last':         r.t2[r.t2.length - 1],
    't2.max':          max,
    't2.m':            r.m,
    't2.p':            r.p,
  };
}
