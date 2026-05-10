/**
 * D.Mike — Transformed I-MR Control Chart Engine (transformed-chart-engine.js)
 *
 * For right-skewed or otherwise non-normal data (lifetime, cost, defect rate),
 * applying I-MR directly produces wrong limits — too many false alarms above
 * the mean, too few below. This engine fits an optimal Box-Cox λ via
 * Anderson-Darling, transforms the data, computes I-MR limits on the
 * transformed scale, and back-transforms the limits to the original scale
 * for interpretation.
 *
 *   y = (x^λ − 1) / λ   for λ ≠ 0
 *   y = ln(x)           for λ = 0
 *
 * Back-transform:
 *   x = (λ·y + 1)^(1/λ) for λ ≠ 0
 *   x = exp(y)          for λ = 0
 *
 * Pure stateless functions. Re-uses the existing Anderson-Darling test from
 * the normality-test engine to score candidate λ values.
 */

import { computeIMR } from './control-chart-engine.js';
import { andersonDarling } from './normality-test-engine.js';

const LAMBDA_GRID_STEP = 0.05;
const LAMBDA_MIN = -3;
const LAMBDA_MAX = 3;

/**
 * Apply the Box-Cox transform with the given λ.
 * @param {number[]} data
 * @param {number} lambda
 * @returns {number[]}
 */
export function boxCox(data, lambda) {
  if (Math.abs(lambda) < 1e-8) return data.map(x => Math.log(x));
  return data.map(x => (Math.pow(x, lambda) - 1) / lambda);
}

/**
 * Inverse Box-Cox: y → x. Returns NaN when the transform back-projects out of
 * the real domain (e.g. λ·y + 1 ≤ 0 with non-integer 1/λ).
 * @param {number} y
 * @param {number} lambda
 * @returns {number}
 */
export function boxCoxInverse(y, lambda) {
  if (Math.abs(lambda) < 1e-8) return Math.exp(y);
  const base = lambda * y + 1;
  if (base <= 0) return NaN;
  return Math.pow(base, 1 / lambda);
}

/**
 * Find the λ that minimises the Anderson-Darling statistic on the transformed
 * data. Grid search over [-3, 3] in steps of 0.05.
 * @param {number[]} data — must be all > 0
 * @returns {{ lambda: number, ad: number }}
 */
export function findOptimalLambda(data) {
  if (data.some(x => !Number.isFinite(x) || x <= 0)) {
    throw new Error('findOptimalLambda: data must be strictly positive');
  }
  let bestLam = 1, bestAD = Infinity;
  for (let l = LAMBDA_MIN; l <= LAMBDA_MAX + 1e-9; l += LAMBDA_GRID_STEP) {
    const t = boxCox(data, l);
    try {
      const r = andersonDarling(t);
      if (r.statisticAdj < bestAD) {
        bestAD = r.statisticAdj;
        bestLam = l;
      }
    } catch { /* skip invalid */ }
  }
  return { lambda: Math.round(bestLam * 100) / 100, ad: bestAD };
}

/**
 * @typedef {Object} TransformedIMRResult
 * @property {number} lambda           — λ used
 * @property {boolean} lambdaAuto      — true if λ was auto-fitted
 * @property {number[]} transformed    — y values
 * @property {{cl, ucl, lcl, sigma}} iLimits        — limits on transformed (y) scale
 * @property {{cl, ucl, lcl, sigma}} mrLimits       — MR limits on y scale
 * @property {{cl, ucl, lcl}} iLimitsOriginal       — back-transformed I limits
 * @property {number[]} signalsI       — indices outside transformed I limits
 */

/**
 * Compute Box-Cox-transformed I-MR. If `lambda` is omitted, fits the optimal
 * value via {@link findOptimalLambda}.
 *
 * @param {number[]} values   — strictly positive measurements
 * @param {Object} [options]
 * @param {number} [options.lambda]
 * @param {number} [options.baselineEnd]
 * @returns {TransformedIMRResult}
 */
export function computeTransformedIMR(values, options = {}) {
  if (!Array.isArray(values)) throw new Error('computeTransformedIMR: values must be an array');
  if (values.some(x => !Number.isFinite(x) || x <= 0)) {
    throw new Error('errPositiveOnly');
  }
  let lambda = options.lambda;
  let lambdaAuto = false;
  if (!Number.isFinite(lambda)) {
    const fit = findOptimalLambda(values);
    lambda = fit.lambda;
    lambdaAuto = true;
  }

  const transformed = boxCox(values, lambda);
  const r = computeIMR(transformed, 1, options.baselineEnd);
  const sub = r.subcharts;

  const iLimits  = { cl: sub.i.cl, ucl: sub.i.ucl, lcl: sub.i.lcl, sigma: sub.i.sigma };
  const mrLimits = { cl: sub.mr.cl, ucl: sub.mr.ucl, lcl: sub.mr.lcl, sigma: sub.mr.sigma };

  // Back-transform of the I-chart limits. Note: a back-transformed sigma is
  // not meaningful, so we only return CL/UCL/LCL on the original scale.
  const iLimitsOriginal = {
    cl:  boxCoxInverse(iLimits.cl,  lambda),
    ucl: boxCoxInverse(iLimits.ucl, lambda),
    lcl: boxCoxInverse(iLimits.lcl, lambda),
  };

  const signalsI = [];
  for (let i = 0; i < transformed.length; i++) {
    if (transformed[i] > iLimits.ucl || transformed[i] < iLimits.lcl) signalsI.push(i);
  }

  return {
    lambda, lambdaAuto, transformed,
    iLimits, mrLimits, iLimitsOriginal,
    signalsI,
  };
}

// ── Unified Dispatcher ───────────────────────────────────────────────

/**
 * Unified dispatcher.
 *   "transformed-i-mr" → flat result with λ, transformed-scale I/MR limits,
 *                         and back-transformed I limits.
 *
 * @param {Object} inputs
 * @param {"transformed-i-mr"} inputs.mode
 * @param {number[]} inputs.values
 * @param {number} [inputs.lambda]
 * @param {number} [inputs.baselineEnd]
 * @returns {Object}
 */
export function analyze(inputs) {
  if (!inputs || typeof inputs.mode !== 'string') {
    throw new Error('analyze: inputs.mode (string) is required');
  }
  if (inputs.mode !== 'transformed-i-mr') {
    throw new Error(`analyze: unknown mode '${inputs.mode}'`);
  }
  const r = computeTransformedIMR(inputs.values || [], {
    lambda: inputs.lambda,
    baselineEnd: inputs.baselineEnd,
  });
  return {
    'lambda':           r.lambda,
    'lambda_auto':      r.lambdaAuto,
    'i.cl':             r.iLimits.cl,
    'i.ucl':            r.iLimits.ucl,
    'i.lcl':            r.iLimits.lcl,
    'i.sigma':          r.iLimits.sigma,
    'mr.cl':            r.mrLimits.cl,
    'mr.ucl':           r.mrLimits.ucl,
    'mr.lcl':           r.mrLimits.lcl,
    'i.cl_original':    r.iLimitsOriginal.cl,
    'i.ucl_original':   r.iLimitsOriginal.ucl,
    'i.lcl_original':   r.iLimitsOriginal.lcl,
    'signal_count':     r.signalsI.length,
  };
}
