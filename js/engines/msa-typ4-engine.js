/**
 * D.Mike — MSA Typ 4 Engine (msa-typ4-engine.js)
 * Pure computation for Measurement System Analysis Type 4:
 * linearity and bias over the measurement range.
 * No DOM access — testable in isolation.
 *
 * Spec: docs/modules/MSA-TYP4.md
 */

import { tDistPValue, tDistCDF } from './regression-engine.js';

const ERR = {
  LENGTH_MISMATCH:   'modules.msa-typ4.errLengthMismatch',
  TOO_FEW_REFS:      'modules.msa-typ4.errTooFewReferences',
  TOO_FEW_REPEATS:   'modules.msa-typ4.errTooFewRepeats',
  INVALID_PV:        'modules.msa-typ4.errInvalidPv',
  NAN_VALUES:        'modules.msa-typ4.errNanValues',
};

/**
 * Validate raw input arrays and parameters.
 * @param {number[]} reference  Long/tidy reference values, one per measurement.
 * @param {number[]} measured   Corresponding measurement values.
 * @param {object}   params     { pvMode: 'tolerance'|'sixSigma', LSL, USL, sigmaP, alpha }
 * @returns {{valid: boolean, errorKey: string|null, errorVars: object|null}}
 */
export function validate(reference, measured, params) {
  if (!Array.isArray(reference) || !Array.isArray(measured)) {
    return { valid: false, errorKey: ERR.NAN_VALUES, errorVars: null };
  }
  if (reference.length !== measured.length) {
    return { valid: false, errorKey: ERR.LENGTH_MISMATCH, errorVars: { r: reference.length, m: measured.length } };
  }
  for (let i = 0; i < reference.length; i++) {
    if (!Number.isFinite(reference[i]) || !Number.isFinite(measured[i])) {
      return { valid: false, errorKey: ERR.NAN_VALUES, errorVars: { row: i + 1 } };
    }
  }
  const uniq = new Set(reference);
  if (uniq.size < 5) {
    return { valid: false, errorKey: ERR.TOO_FEW_REFS, errorVars: { got: uniq.size } };
  }
  const counts = new Map();
  for (const x of reference) counts.set(x, (counts.get(x) || 0) + 1);
  for (const [xRef, n] of counts) {
    if (n < 3) return { valid: false, errorKey: ERR.TOO_FEW_REPEATS, errorVars: { xRef, n } };
  }
  const pv = pvValue(params);
  if (!(pv > 0)) return { valid: false, errorKey: ERR.INVALID_PV, errorVars: null };
  return { valid: true, errorKey: null, errorVars: null };
}

/**
 * Resolve the process-variation denominator (PV) used for %Linearity.
 * @param {object} params { pvMode: 'tolerance'|'sixSigma', LSL, USL, sigmaP }
 * @returns {number}
 * @internal
 */
export function pvValue(params) {
  if (params?.pvMode === 'sixSigma') {
    return 6 * Number(params.sigmaP);
  }
  const T = Number(params?.USL) - Number(params?.LSL);
  return T;
}

/**
 * Compute per-reference statistics: for each unique reference value, a
 * one-sample t-test of H0: mean(measured) == xRef (i.e. bias == 0).
 * Groups by unique reference value (ascending), returns one entry per group.
 * @param {number[]} reference
 * @param {number[]} measured
 * @param {number}   alpha    Significance level (reserved for callers/verdicts; not used internally).
 * @returns {Array<{xRef:number, n:number, mean:number, bias:number, sd:number, tStat:number, pValue:number}>}
 */
export function perReferenceStats(reference, measured, alpha = 0.05) {
  const groups = new Map();
  for (let i = 0; i < reference.length; i++) {
    const x = reference[i];
    if (!groups.has(x)) groups.set(x, []);
    groups.get(x).push(measured[i]);
  }
  const sorted = [...groups.keys()].sort((a, b) => a - b);
  const out = [];
  for (const x of sorted) {
    const y = groups.get(x);
    const n = y.length;
    const m = y.reduce((s, v) => s + v, 0) / n;
    const varSum = y.reduce((s, v) => s + (v - m) ** 2, 0);
    const sd = n > 1 ? Math.sqrt(varSum / (n - 1)) : 0;
    const bias = m - x;
    const tStat = sd > 0 ? bias / (sd / Math.sqrt(n)) : (bias === 0 ? 0 : (bias > 0 ? Infinity : -Infinity));
    // tDistPValue(t, df) — from regression-engine.js (re-exported tPValue from
    // math-utils.js) already returns the TWO-SIDED p-value P(|T| > |t|)
    // (computed via the regularized incomplete beta function on df/(df+t²)).
    // No further doubling/1-minus needed — see regression-engine.js:536 for
    // an existing direct use of the same pattern.
    const pValue = n > 1 && Number.isFinite(tStat)
      ? tDistPValue(tStat, n - 1)
      : (n > 1 ? 0 : 1);
    out.push({ xRef: x, n, mean: m, bias, sd, tStat, pValue });
  }
  return out;
}

/**
 * Inverse of tDistCDF for two-sided (1-α/2) quantile via bisection.
 * @param {number} p 0<p<1
 * @param {number} df
 * @returns {number}
 */
function tQuantile(p, df) {
  // Approximate via Cornish–Fisher; refine with bisection over [0, 50].
  let lo = 0, hi = 50, mid = 0;
  for (let i = 0; i < 60; i++) {
    mid = (lo + hi) / 2;
    if (tDistCDF(mid, df) < p) lo = mid; else hi = mid;
  }
  return mid;
}

/**
 * Simple OLS of bias_ij vs. x_ref_i (per-observation).
 * @param {number[]} reference
 * @param {number[]} measured
 * @param {number}   alpha
 * @returns {object} Regression results.
 */
export function regressBiasVsReference(reference, measured, alpha = 0.05) {
  const N = reference.length;
  const x = reference;
  const b = measured.map((v, i) => v - reference[i]);
  const xBar = x.reduce((s, v) => s + v, 0) / N;
  const bBar = b.reduce((s, v) => s + v, 0) / N;
  let Sxx = 0, Sxb = 0;
  for (let i = 0; i < N; i++) {
    const dx = x[i] - xBar;
    Sxx += dx * dx;
    Sxb += dx * (b[i] - bBar);
  }
  const slope = Sxx > 0 ? Sxb / Sxx : 0;
  const intercept = bBar - slope * xBar;
  let SSE = 0;
  for (let i = 0; i < N; i++) {
    const yhat = slope * x[i] + intercept;
    SSE += (b[i] - yhat) ** 2;
  }
  const dfResid = Math.max(1, N - 2);
  const MSE = SSE / dfResid;
  const seSlope = Sxx > 0 ? Math.sqrt(MSE / Sxx) : Infinity;
  const seIntercept = Sxx > 0 ? Math.sqrt(MSE * (1 / N + (xBar * xBar) / Sxx)) : Infinity;
  const tSlope = Sxx > 0 && seSlope > 0 ? slope / seSlope : 0;
  const tIntercept = Sxx > 0 && seIntercept > 0 ? intercept / seIntercept : 0;
  const pSlope = Sxx > 0 ? 2 * (1 - tDistCDF(Math.abs(tSlope), dfResid)) : 1;
  const pIntercept = Sxx > 0 ? 2 * (1 - tDistCDF(Math.abs(tIntercept), dfResid)) : 1;
  const q = tQuantile(1 - alpha / 2, dfResid);
  const ciSlope = [slope - q * seSlope, slope + q * seSlope];
  const ciIntercept = [intercept - q * seIntercept, intercept + q * seIntercept];
  const ciBand = (xv) => {
    const dx = xv - xBar;
    const se = Sxx > 0 ? Math.sqrt(MSE * (1 / N + (dx * dx) / Sxx)) : Infinity;
    const yhat = slope * xv + intercept;
    return [yhat - q * se, yhat + q * se];
  };
  return { slope, intercept, seSlope, seIntercept, tSlope, tIntercept, pSlope, pIntercept, ciSlope, ciIntercept, ciBand, MSE, N, dfResid };
}

/**
 * AIAG MSA 4th-edition KPIs for linearity study.
 * @param {Array} perRef  Output of perReferenceStats.
 * @param {object} regression  Output of regressBiasVsReference.
 * @param {object} params  { pvMode, LSL, USL, sigmaP, alpha }
 * @returns {{percentLinearity:number, maxPercentBias:number, slopeSignificant:boolean, interceptSignificant:boolean, verdict:{color:string, key:string}}}
 */
export function aiagKpis(perRef, regression, params) {
  const alpha = params.alpha ?? 0.05;
  const pv = pvValue(params);
  const xs = perRef.map(p => p.xRef);
  const range = Math.max(...xs) - Math.min(...xs);
  const percentLinearity = pv > 0 ? 100 * Math.abs(regression.slope) * range / pv : Infinity;
  const maxPercentBias = pv > 0 ? Math.max(...perRef.map(p => Math.abs(p.bias))) * 100 / pv : Infinity;
  const slopeSignificant = regression.pSlope < alpha;
  const interceptSignificant = regression.pIntercept < alpha;
  const worst = Math.max(percentLinearity, maxPercentBias);
  let color, key;
  if (slopeSignificant || interceptSignificant || worst > 10) {
    color = 'red';   key = 'modules.msa-typ4.verdictAiagFail';
  } else if (worst > 5) {
    color = 'yellow'; key = 'modules.msa-typ4.verdictAiagMarginal';
  } else {
    color = 'green'; key = 'modules.msa-typ4.verdictAiagOk';
  }
  return { percentLinearity, maxPercentBias, slopeSignificant, interceptSignificant, verdict: { color, key } };
}
