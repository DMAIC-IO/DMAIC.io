/**
 * D.Mike — MSA Typ 4 Engine (msa-typ4-engine.js)
 * Pure computation for Measurement System Analysis Type 4:
 * linearity and bias over the measurement range.
 * No DOM access — testable in isolation.
 *
 * Spec: docs/modules/MSA-TYP4.md
 */

import { tDistPValue } from './regression-engine.js';

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
