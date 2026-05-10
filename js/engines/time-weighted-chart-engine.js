/**
 * D.Mike — Time-Weighted Control Chart Engine (time-weighted-chart-engine.js)
 *
 * Pure algorithms for time-weighted SPC charts:
 *   - EWMA (Exponentially Weighted Moving Average)
 *   - CUSUM (Cumulative Sum, tabular two-sided form)
 *
 * Both detect small persistent shifts much earlier than Shewhart (I-MR / X̄-R)
 * because they integrate information across multiple points.
 *
 * No DOM, no state — all functions stateless and testable.
 */

// ── d2 constant for sigma estimation from MR̄ (I-MR style) ──
const D2_N2 = 1.128;

// ── Helpers ──

/** Sample mean of a numeric array. */
function mean(arr) {
  if (!arr.length) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

/** Sample standard deviation (n-1 denominator). */
function sampleSD(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  let ss = 0;
  for (let i = 0; i < arr.length; i++) ss += (arr[i] - m) ** 2;
  return Math.sqrt(ss / (arr.length - 1));
}

/** σ̂ from mean moving range (I-MR convention, n=2). */
function sigmaFromMR(arr) {
  if (arr.length < 2) return 0;
  let mrSum = 0;
  for (let i = 1; i < arr.length; i++) mrSum += Math.abs(arr[i] - arr[i - 1]);
  const mrBar = mrSum / (arr.length - 1);
  return mrBar / D2_N2;
}

/**
 * Pick the sigma estimate from a baseline subset.
 * @param {number[]} baseline
 * @param {'sd'|'mr'} method
 * @returns {number}
 */
export function estimateSigma(baseline, method = 'sd') {
  if (method === 'mr') return sigmaFromMR(baseline);
  return sampleSD(baseline);
}

// ── EWMA ──

/**
 * @typedef {Object} EWMAResult
 * @property {number[]} values    — the EWMA values z_i
 * @property {number[]} ucl       — per-point UCL (transient limits)
 * @property {number[]} lcl       — per-point LCL
 * @property {number[]} sigma     — per-point σ_zi
 * @property {number} cl          — center line (target μ₀)
 * @property {number} sigmaSteady — steady-state σ_z (informational)
 * @property {number[]} signals   — indices where z is outside the limits
 */

/**
 * Compute an EWMA chart against a target μ₀.
 *   z_i = λ·x_i + (1-λ)·z_{i-1},  z_0 = μ₀
 *   σ_zi = σ · sqrt( λ/(2-λ) · (1 - (1-λ)^(2i)) )
 *   UCL_i / LCL_i = μ₀ ± L·σ_zi
 *
 * @param {number[]} values   — observed series
 * @param {number} target     — target / center line μ₀
 * @param {number} sigma      — process σ (e.g. from I-MR)
 * @param {number} [lambda=0.2] — smoothing weight, typical 0.05…0.4
 * @param {number} [L=3]      — limit width in σ-units
 * @returns {EWMAResult}
 */
export function computeEWMA(values, target, sigma, lambda = 0.2, L = 3) {
  if (!Array.isArray(values)) throw new Error('computeEWMA: values must be an array');
  if (!(lambda > 0 && lambda <= 1)) throw new Error('computeEWMA: lambda must be in (0, 1]');
  if (!(sigma > 0)) throw new Error('computeEWMA: sigma must be > 0');

  const n = values.length;
  const z = new Array(n);
  const ucl = new Array(n);
  const lcl = new Array(n);
  const sigmaArr = new Array(n);
  const signals = [];

  let prev = target;
  for (let i = 0; i < n; i++) {
    const zi = lambda * values[i] + (1 - lambda) * prev;
    z[i] = zi;
    prev = zi;

    const factor = (lambda / (2 - lambda)) * (1 - Math.pow(1 - lambda, 2 * (i + 1)));
    const s = sigma * Math.sqrt(factor);
    sigmaArr[i] = s;
    ucl[i] = target + L * s;
    lcl[i] = target - L * s;

    if (zi > ucl[i] || zi < lcl[i]) signals.push(i);
  }

  const sigmaSteady = sigma * Math.sqrt(lambda / (2 - lambda));

  return {
    values: z,
    ucl,
    lcl,
    sigma: sigmaArr,
    cl: target,
    sigmaSteady,
    signals,
  };
}

// ── CUSUM (tabular two-sided) ──

/**
 * @typedef {Object} CUSUMResult
 * @property {number[]} cPlus     — upper CUSUM C_i⁺
 * @property {number[]} cMinus    — lower CUSUM C_i⁻ (always ≥ 0; signed for plotting only)
 * @property {number} h           — decision interval (in original units, i.e. h·σ)
 * @property {number} k           — slack (in original units, i.e. k·σ)
 * @property {number} cl          — center line (always 0 for CUSUM)
 * @property {number[]} signalsHi — indices where C⁺ > h
 * @property {number[]} signalsLo — indices where C⁻ > h
 */

/**
 * Compute a tabular two-sided CUSUM chart against target μ₀ in standardized
 * (σ-scaled) form. Defaults k=0.5, h=4 are recommended for detecting a 1σ shift.
 *
 *   C_i⁺ = max( 0, (x_i - (μ₀ + Kσ))     + C_{i-1}⁺ )
 *   C_i⁻ = max( 0, ((μ₀ - Kσ) - x_i)     + C_{i-1}⁻ )
 *   signal when C⁺ > Hσ  or  C⁻ > Hσ
 *
 * @param {number[]} values
 * @param {number} target
 * @param {number} sigma
 * @param {number} [kSigma=0.5] — slack in σ-units
 * @param {number} [hSigma=4]   — decision interval in σ-units
 * @returns {CUSUMResult}
 */
export function computeCUSUM(values, target, sigma, kSigma = 0.5, hSigma = 4) {
  if (!Array.isArray(values)) throw new Error('computeCUSUM: values must be an array');
  if (!(sigma > 0)) throw new Error('computeCUSUM: sigma must be > 0');

  const k = kSigma * sigma;
  const h = hSigma * sigma;

  const n = values.length;
  const cPlus  = new Array(n);
  const cMinus = new Array(n);
  const signalsHi = [];
  const signalsLo = [];

  let pPrev = 0, mPrev = 0;
  for (let i = 0; i < n; i++) {
    const dev = values[i] - target;
    const p = Math.max(0, dev - k + pPrev);
    const mneg = Math.max(0, -dev - k + mPrev);
    cPlus[i]  = p;
    cMinus[i] = mneg;
    pPrev = p;
    mPrev = mneg;
    if (p    > h) signalsHi.push(i);
    if (mneg > h) signalsLo.push(i);
  }

  return {
    cPlus,
    cMinus,
    h,
    k,
    cl: 0,
    signalsHi,
    signalsLo,
  };
}

// ── Unified Dispatcher (Algorithm Lab / Fixture Replay) ──

/**
 * Unified dispatcher. Modes:
 *   "ewma"  → flat {ewma.cl, ewma.ucl_mean, ewma.lcl_mean, ewma.sigma_steady, ewma.signal_count}
 *   "cusum" → flat {cusum.h, cusum.k, cusum.signal_count_hi, cusum.signal_count_lo,
 *                   cusum.cplus_last, cusum.cminus_last}
 *
 * @param {Object} inputs
 * @param {"ewma"|"cusum"} inputs.mode
 * @param {number[]} inputs.values
 * @param {number} inputs.target
 * @param {number} inputs.sigma
 * @param {number} [inputs.lambda]
 * @param {number} [inputs.L]
 * @param {number} [inputs.kSigma]
 * @param {number} [inputs.hSigma]
 * @returns {Object}
 */
export function analyze(inputs) {
  if (!inputs || typeof inputs.mode !== 'string') {
    throw new Error('analyze: inputs.mode (string) is required');
  }
  if (inputs.mode === 'ewma') {
    const r = computeEWMA(inputs.values || [], inputs.target, inputs.sigma, inputs.lambda, inputs.L);
    const meanArr = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
    return {
      'ewma.cl':           r.cl,
      'ewma.ucl_mean':     meanArr(r.ucl),
      'ewma.lcl_mean':     meanArr(r.lcl),
      'ewma.sigma_steady': r.sigmaSteady,
      'ewma.signal_count': r.signals.length,
    };
  }
  if (inputs.mode === 'cusum') {
    const r = computeCUSUM(inputs.values || [], inputs.target, inputs.sigma, inputs.kSigma, inputs.hSigma);
    return {
      'cusum.h':                r.h,
      'cusum.k':                r.k,
      'cusum.signal_count_hi':  r.signalsHi.length,
      'cusum.signal_count_lo':  r.signalsLo.length,
      'cusum.cplus_last':       r.cPlus[r.cPlus.length - 1] ?? 0,
      'cusum.cminus_last':      r.cMinus[r.cMinus.length - 1] ?? 0,
    };
  }
  throw new Error(`analyze: unknown mode '${inputs.mode}'`);
}
