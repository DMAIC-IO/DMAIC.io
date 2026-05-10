/**
 * D.Mike — Rare-Event Control Chart Engine (rare-event-chart-engine.js)
 *
 * Two charts for rare events:
 *   g-chart  — count of opportunities between events (geometric distribution)
 *              Limits via Benneyan (1999): CL = ḡ, UCL/LCL = ḡ ± 3·√(ḡ·(ḡ+1)).
 *   t-chart  — time between events (exponential).
 *              Nelson (1994) power-transform: y = t^(1/3.6) → I-MR limits on y.
 *
 * No DOM, no state — pure stateless functions.
 */

const D2_N2 = 1.128;
const NELSON_POWER = 1 / 3.6;

// ── g-chart ──────────────────────────────────────────────────────────

/**
 * @typedef {Object} GChartResult
 * @property {number[]} values
 * @property {number} cl       — ḡ
 * @property {number} ucl
 * @property {number} lcl
 * @property {number} sigma    — informational, σ̂ = √(ḡ·(ḡ+1))
 */

/**
 * Compute g-chart limits per Benneyan (1999).
 * @param {number[]} counts — opportunities-between-events series (≥ 0)
 * @returns {GChartResult}
 */
export function computeGChart(counts) {
  if (!Array.isArray(counts)) throw new Error('computeGChart: counts must be an array');
  const valid = counts.filter(v => Number.isFinite(v));
  if (!valid.length) {
    return { values: counts.slice(), cl: 0, ucl: 0, lcl: 0, sigma: 0 };
  }
  const gBar = valid.reduce((a, b) => a + b, 0) / valid.length;
  const sigma = Math.sqrt(gBar * (gBar + 1));
  return {
    values: counts.slice(),
    cl: gBar,
    ucl: gBar + 3 * sigma,
    lcl: Math.max(0, gBar - 3 * sigma),
    sigma,
  };
}

// ── t-chart ──────────────────────────────────────────────────────────

/**
 * @typedef {Object} TChartResult
 * @property {number[]} values        — original t values (unchanged for plotting)
 * @property {number[]} transformed   — y = t^(1/3.6)
 * @property {number} cl              — mean(y)
 * @property {number} ucl             — limit on transformed scale
 * @property {number} lcl             — limit on transformed scale (≥ 0)
 * @property {number} sigma           — σ̂ on transformed scale
 * @property {number} clOriginal      — back-transformed CL on the original scale
 * @property {number} uclOriginal     — back-transformed UCL on the original scale
 * @property {number} lclOriginal
 */

/**
 * Compute t-chart limits via Nelson's power transform.
 * Plotting and limits are returned on BOTH scales: the transformed scale is
 * the proper one for the SPC chart, the original scale is provided for
 * interpretation (back-transformed via y^3.6).
 * @param {number[]} times — between-event times (> 0)
 * @returns {TChartResult}
 */
export function computeTChart(times) {
  if (!Array.isArray(times)) throw new Error('computeTChart: times must be an array');
  const valid = times.filter(v => Number.isFinite(v) && v > 0);
  if (valid.length < 2) {
    return {
      values: times.slice(), transformed: times.map(() => 0),
      cl: 0, ucl: 0, lcl: 0, sigma: 0,
      clOriginal: 0, uclOriginal: 0, lclOriginal: 0,
    };
  }

  const transformed = times.map(t => Number.isFinite(t) && t > 0 ? Math.pow(t, NELSON_POWER) : null);
  const yClean = transformed.filter(v => v !== null);
  const yBar = yClean.reduce((a, b) => a + b, 0) / yClean.length;

  // I-MR style sigma estimate from moving range
  let mrSum = 0, mrCount = 0;
  for (let i = 1; i < transformed.length; i++) {
    if (transformed[i] === null || transformed[i - 1] === null) continue;
    mrSum += Math.abs(transformed[i] - transformed[i - 1]);
    mrCount++;
  }
  const mrBar = mrCount > 0 ? mrSum / mrCount : 0;
  const sigma = mrBar / D2_N2;

  const ucl = yBar + 3 * sigma;
  const lcl = Math.max(0, yBar - 3 * sigma);

  // Back-transform for the original-scale labels
  const back = (y) => Math.pow(y, 1 / NELSON_POWER);

  return {
    values: times.slice(),
    transformed,
    cl: yBar,
    ucl, lcl,
    sigma,
    clOriginal:  back(yBar),
    uclOriginal: back(ucl),
    lclOriginal: back(lcl),
  };
}

// ── Unified Dispatcher ───────────────────────────────────────────────

/**
 * Unified dispatcher.
 *   "g"  → flat {g.cl, g.ucl, g.lcl, g.sigma}
 *   "t"  → flat {t.cl, t.ucl, t.lcl, t.sigma, t.cl_original, t.ucl_original, t.lcl_original}
 *
 * @param {Object} inputs
 * @param {"g"|"t"} inputs.mode
 * @param {number[]} inputs.values
 * @returns {Object}
 */
export function analyze(inputs) {
  if (!inputs || typeof inputs.mode !== 'string') {
    throw new Error('analyze: inputs.mode (string) is required');
  }
  if (inputs.mode === 'g') {
    const r = computeGChart(inputs.values || []);
    return {
      'g.cl':    r.cl,
      'g.ucl':   r.ucl,
      'g.lcl':   r.lcl,
      'g.sigma': r.sigma,
    };
  }
  if (inputs.mode === 't') {
    const r = computeTChart(inputs.values || []);
    return {
      't.cl':           r.cl,
      't.ucl':          r.ucl,
      't.lcl':          r.lcl,
      't.sigma':        r.sigma,
      't.cl_original':  r.clOriginal,
      't.ucl_original': r.uclOriginal,
      't.lcl_original': r.lclOriginal,
    };
  }
  throw new Error(`analyze: unknown mode '${inputs.mode}'`);
}
