/**
 * D.Mike — Run Chart Engine (run-chart-engine.js)
 *
 * Pure algorithms for run charts: median line + four runs tests
 * (clustering, mixtures, trends, oscillation) following the standard
 * Minitab convention (normal-approximation p-values).
 *
 * No DOM, no state — all functions are stateless and testable.
 */

// ── Helpers ──

/** Sample median (linear interpolation for even-length samples). */
function median(arr) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  const m = s.length;
  return m % 2 ? s[(m - 1) >> 1] : 0.5 * (s[m / 2 - 1] + s[m / 2]);
}

/**
 * Standard-normal CDF Φ(z) using a numerically stable series via erf.
 * Abramowitz & Stegun 7.1.26 — relative error < 1.5e-7.
 */
function phi(z) {
  // Φ(z) = 0.5 * (1 + erf(z / sqrt(2)))
  const t = z / Math.SQRT2;
  const sign = t < 0 ? -1 : 1;
  const x = Math.abs(t);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const tt = 1 / (1 + p * x);
  const y = 1 - (((((a5 * tt + a4) * tt) + a3) * tt + a2) * tt + a1) * tt * Math.exp(-x * x);
  const erf = sign * y;
  return 0.5 * (1 + erf);
}

// ── Runs about the median ──

/**
 * Compute number of runs about the median plus expected value, variance and
 * z-statistics (clustering & mixtures).
 *
 * Points equal to the median are excluded from the runs count (Minitab
 * convention) — they are neither above nor below.
 *
 * @param {number[]} values
 * @param {number} med — sample median
 * @returns {{ runs: number, m1: number, m2: number, expected: number, variance: number,
 *             z: number, pClustering: number, pMixtures: number }}
 */
export function runsAboutMedian(values, med) {
  // Build sign sequence, dropping points equal to the median
  const signs = [];
  for (const v of values) {
    if (v > med) signs.push(1);
    else if (v < med) signs.push(-1);
    // ties to median are dropped
  }
  const N = signs.length;
  const m1 = signs.filter(s => s === 1).length;  // above
  const m2 = signs.filter(s => s === -1).length; // below

  // Count runs (groups of consecutive equal signs)
  let runs = 0;
  for (let i = 0; i < N; i++) {
    if (i === 0 || signs[i] !== signs[i - 1]) runs++;
  }

  // Mean and variance under the null hypothesis of randomness (Wald-Wolfowitz)
  const expected = (N > 0) ? (2 * m1 * m2) / N + 1 : 0;
  const variance = (N > 1)
    ? (2 * m1 * m2 * (2 * m1 * m2 - N)) / (N * N * (N - 1))
    : 0;
  const sd = variance > 0 ? Math.sqrt(variance) : 0;
  const z = sd > 0 ? (runs - expected) / sd : 0;

  // Continuity correction is optional — Minitab uses raw z; keep it simple.
  // Clustering: too FEW runs → low z → small p
  // Mixtures:   too MANY runs → high z → 1 - Φ(z) small
  const pClustering = sd > 0 ? phi(z) : 1;
  const pMixtures   = sd > 0 ? 1 - phi(z) : 1;

  return { runs, m1, m2, expected, variance, z, pClustering, pMixtures };
}

// ── Runs up or down ──

/**
 * Compute number of runs up or down (a "run" is a maximal sequence of
 * differences with the same sign), plus z-statistics (trends & oscillation).
 *
 * Ties (consecutive equal values) are merged: only the first of a tied pair
 * contributes a sign, following the Minitab convention.
 *
 * @param {number[]} values
 * @returns {{ runs: number, expected: number, variance: number, z: number,
 *             pTrends: number, pOscillation: number }}
 */
export function runsUpDown(values) {
  // Build sign of differences, skipping ties
  const diffSigns = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1]) diffSigns.push(1);
    else if (values[i] < values[i - 1]) diffSigns.push(-1);
  }
  const m = diffSigns.length;
  // For runs-up-down counting, n = m + 1 effective points
  const n = m + 1;

  let runs = 0;
  for (let i = 0; i < m; i++) {
    if (i === 0 || diffSigns[i] !== diffSigns[i - 1]) runs++;
  }

  // Standard formulas (Bradley 1968 / Minitab)
  const expected = n > 1 ? (2 * n - 1) / 3 : 0;
  const variance = n > 1 ? (16 * n - 29) / 90 : 0;
  const sd = variance > 0 ? Math.sqrt(variance) : 0;
  const z = sd > 0 ? (runs - expected) / sd : 0;

  // Trends:      too FEW runs up/down → small z → small p (monotone trend)
  // Oscillation: too MANY runs up/down → large z → small p (zig-zag)
  const pTrends      = sd > 0 ? phi(z) : 1;
  const pOscillation = sd > 0 ? 1 - phi(z) : 1;

  return { runs, expected, variance, z, pTrends, pOscillation };
}

// ── Top-level compute ──

/**
 * @typedef {Object} RunChartResult
 * @property {number[]} values
 * @property {number} median
 * @property {number} runsAboutMedian
 * @property {number} runsUpDown
 * @property {number} pClustering
 * @property {number} pMixtures
 * @property {number} pTrends
 * @property {number} pOscillation
 * @property {{above: number[], below: number[], onMedian: number[]}} indices
 */

/**
 * Compute median + all four runs-test statistics for a numeric series.
 * @param {number[]} rawValues
 * @returns {RunChartResult}
 */
export function computeRunChart(rawValues) {
  const values = rawValues.filter(v => typeof v === 'number' && !isNaN(v));
  const med = median(values);
  const aboutMed = runsAboutMedian(values, med);
  const upDown   = runsUpDown(values);

  const above = [];
  const below = [];
  const onMedian = [];
  values.forEach((v, i) => {
    if (v > med) above.push(i);
    else if (v < med) below.push(i);
    else onMedian.push(i);
  });

  return {
    values,
    median: med,
    runsAboutMedian: aboutMed.runs,
    runsUpDown: upDown.runs,
    pClustering: aboutMed.pClustering,
    pMixtures:   aboutMed.pMixtures,
    pTrends:      upDown.pTrends,
    pOscillation: upDown.pOscillation,
    indices: { above, below, onMedian },
  };
}

// ── Unified Dispatcher (Algorithm Lab / Fixture Replay) ──

/**
 * Unified dispatcher. Supports a single mode "run-chart"; values are required.
 * Returns a flat object so JSON fixtures can pin keys directly.
 *
 * @param {Object} inputs
 * @param {"run-chart"} inputs.mode
 * @param {number[]} inputs.values
 * @returns {Object}
 */
export function analyze(inputs) {
  if (!inputs || typeof inputs.mode !== 'string') {
    throw new Error('analyze: inputs.mode (string) is required');
  }
  if (inputs.mode !== 'run-chart') {
    throw new Error(`analyze: unknown mode '${inputs.mode}'`);
  }
  if (!Array.isArray(inputs.values)) {
    throw new Error('analyze: inputs.values (number[]) is required');
  }
  const r = computeRunChart(inputs.values);
  return {
    median: r.median,
    runsAboutMedian: r.runsAboutMedian,
    runsUpDown: r.runsUpDown,
    pClustering:  r.pClustering,
    pMixtures:    r.pMixtures,
    pTrends:      r.pTrends,
    pOscillation: r.pOscillation,
  };
}
