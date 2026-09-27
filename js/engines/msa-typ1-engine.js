/**
 * D.Mike — MSA Typ 1 Engine (msa-typ1-engine.js)
 * Pure computation functions for Measurement System Analysis Type 1.
 * No DOM access — this module is testable in isolation.
 *
 * Spec: docs/modules/MSA-TYP1.md
 */

/**
 * Parse a raw text block into an array of numbers.
 * Accepts newline, semicolon, comma, or tab as delimiters.
 * Supports both dot and comma as decimal separator.
 * @param {string} raw
 * @returns {number[]}
 */
export function parseValues(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(/[\n;,\t]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => parseFloat(s.replace(',', '.')))
    .filter(v => !isNaN(v));
}

import { mean, stddev } from './stats-utils.js';
export { mean, stddev };

import { tPValue } from './math-utils.js';

/**
 * Tolerance mode: one-sided when exactly one of LSL/USL is a finite number.
 * @param {number} lsl
 * @param {number} usl
 * @returns {'one-sided'|'two-sided'}
 */
export function limitMode(lsl, usl) {
  return Number.isFinite(lsl) !== Number.isFinite(usl) ? 'one-sided' : 'two-sided';
}

/**
 * One-sample t-test of the bias against 0 (Minitab type 1 "Test Bias = 0").
 * @param {number} bias - x̄ − reference
 * @param {number} sg - sample standard deviation
 * @param {number} n - number of values
 * @returns {{ t: number|null, df: number, p: number|null }}
 */
export function biasTTest(bias, sg, n) {
  const df = n - 1;
  if (!(sg > 0) || n < 2 || !Number.isFinite(bias)) return { t: null, df, p: null };
  const t = bias / (sg / Math.sqrt(n));
  return { t, df, p: tPValue(t, df) };
}

/**
 * Detect measurement resolution from data.
 * Returns the smallest non-zero absolute difference between sorted values.
 * @param {number[]} values
 * @returns {number} resolution (0 if undetectable)
 */
export function detectResolution(values) {
  if (values.length < 2) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  let minDiff = Infinity;
  for (let i = 1; i < sorted.length; i++) {
    const d = Math.abs(sorted[i] - sorted[i - 1]);
    if (d > 1e-12 && d < minDiff) minDiff = d;
  }
  return minDiff === Infinity ? 0 : minDiff;
}

/**
 * Validate input parameters.
 * @param {object} params
 * @param {number} params.ref - Reference value
 * @param {number} params.lsl - Lower spec limit
 * @param {number} params.usl - Upper spec limit
 * @param {number[]} values - Measurement values
 * @returns {{ valid: boolean, errorKey: string|null, errorVars: object|null, mode?: 'one-sided'|'two-sided' }}
 */
export function validate(params, values) {
  if (isNaN(params.ref)) {
    return { valid: false, errorKey: 'modules.msa-typ1.errRefMissing', errorVars: null };
  }
  const hasLsl = Number.isFinite(params.lsl);
  const hasUsl = Number.isFinite(params.usl);
  if (!hasLsl && !hasUsl) {
    return { valid: false, errorKey: 'modules.msa-typ1.errLimitsMissing', errorVars: null };
  }
  if (hasLsl && hasUsl && params.usl <= params.lsl) {
    return { valid: false, errorKey: 'modules.msa-typ1.errUslLeqLsl', errorVars: null };
  }
  if (values.length < 25) {
    return { valid: false, errorKey: 'modules.msa-typ1.errTooFewValues', errorVars: { n: values.length } };
  }
  return { valid: true, errorKey: null, errorVars: null, mode: hasLsl && hasUsl ? 'two-sided' : 'one-sided' };
}

/**
 * Run the full MSA Typ 1 analysis.
 * @param {object} params
 * @param {number} params.ref - Reference value (x_ref)
 * @param {number} params.lsl - Lower specification limit
 * @param {number} params.usl - Upper specification limit
 * @param {number} params.k1 - Tolerance fraction factor (e.g. 0.20)
 * @param {number} params.k2 - Spread coverage factor (e.g. 3 = 6·s)
 * @param {number[]} values - Measurement values (≥ 25)
 * @returns {object} Analysis results
 */
export function analyze(params, values) {
  const { ref, lsl, usl, k1, k2 } = params;
  const n = values.length;
  const xbar = mean(values);
  const sg = stddev(values);
  const xmin = Math.min(...values);
  const xmax = Math.max(...values);
  const range = xmax - xmin;

  // Bias
  const bias = xbar - ref;

  // Resolution
  const resolution = detectResolution(values);

  // Outlier threshold (3σ from mean)
  const upperThreshold = xbar + 3 * sg;
  const lowerThreshold = xbar - 3 * sg;

  // Per-value details
  const details = values.map((v, i) => ({
    index: i + 1,
    value: v,
    deviation: v - ref,
    devFromMean: Math.abs(v - xbar),
    isOutlier: v > upperThreshold || v < lowerThreshold,
  }));

  const mode = limitMode(lsl, usl);
  // range === 0 means the values are bit-for-bit identical — an exact
  // signal (no summation rounding involved), unlike sg/bias which can carry
  // floating-point noise around 1e-15 even for constant input.
  const biasTest = range === 0 ? { t: null, df: n - 1, p: null } : biasTTest(bias, sg, n);
  const common = {
    mode, n, xbar, sg, xmin, xmax, range, bias, biasTest, resolution,
    upperThreshold, lowerThreshold, details,
    params: { ref, lsl, usl, k1, k2 },
  };

  if (mode === 'one-sided') {
    return {
      ...common,
      T: null, biasPercent: null, Cg: null, Cgk: null,
      cgStatus: null, cgkStatus: null, overall: 'none',
      tolUsage: null, varEv: null, varEvBias: null,
      resPercent: null, zoneHi: null, zoneLo: null,
    };
  }

  const T = usl - lsl;
  const biasPercent = (bias / T) * 100;

  // Capability indices
  const Cg = (k1 * T) / (2 * k2 * sg);
  const Cgk = ((k1 * T / 2) - Math.abs(bias)) / (k2 * sg);

  // Tolerance usage / %Var(EV) = 100·k1/Cg, algebraically 2·k2·sg/T
  const tolUsage = (2 * k2 * sg / T) * 100;
  const varEvBias = Cgk > 0 ? (100 * k1) / Cgk : null;

  const resPercent = resolution > 0 ? (resolution / T) * 100 : 0;

  // Status
  const cgStatus = Cg >= 1.33 ? 'pass' : Cg >= 1.0 ? 'warn' : 'fail';
  const cgkStatus = Cgk >= 1.33 ? 'pass' : Cgk >= 1.0 ? 'warn' : 'fail';
  const overall = (cgStatus === 'pass' && cgkStatus === 'pass') ? 'pass'
    : (cgStatus === 'fail' || cgkStatus === 'fail') ? 'fail'
    : 'warn';

  // k1*T zone bounds
  const zoneHi = ref + k1 * T / 2;
  const zoneLo = ref - k1 * T / 2;

  return {
    ...common,
    T, biasPercent, Cg, Cgk, cgStatus, cgkStatus, overall,
    tolUsage, varEv: tolUsage, varEvBias, resPercent, zoneHi, zoneLo,
  };
}

/**
 * Generate example measurement data.
 * 50 values around a nominal of 50.000 mm with slight positive bias.
 * @returns {{ params: object, values: number[] }}
 */
export function generateExampleData() {
  const ref = 50.0;
  const values = [];
  for (let i = 0; i < 50; i++) {
    // Box-Muller transform for normal random
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    values.push(parseFloat((ref + 0.002 + z * 0.005).toFixed(4)));
  }
  return {
    params: {
      name: '',  // will be set by i18n
      ref: 50.0,
      unit: 'mm',
      lsl: 49.95,
      usl: 50.05,
      k1: 0.2,
      k2: 3,
    },
    values,
  };
}
