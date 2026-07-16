/**
 * DMAIC.io — MSA Typ 6 Engine (msa-typ6-engine.js)
 * Measure phase: Stabilität / Langzeitverhalten.
 *
 * Dünner Wrapper um control-chart-engine.js: nutzt SPC_CONSTANTS,
 * computeIMR, computeXbarR und evaluateNelsonRules; MSA-spezifisch sind
 * hier nur die Grenzen-Modus-Unterscheidung (from-study vs. given),
 * der Drift-Test (Linear-Regression + t-Test) und die MSA-Ampel.
 *
 * Spec: docs/superpowers/specs/2026-07-16-msa-typ6-design.md
 */

import {
  SPC_CONSTANTS, computeIMR, computeXbarR, evaluateNelsonRules,
  DEFAULT_ENABLED_RULES, NELSON_RULES,
} from './control-chart-engine.js';

const VALID_ALPHAS = new Set([0.01, 0.05, 0.10]);
const VALID_CHART_TYPES = new Set(['i-mr', 'xbar-r']);
const MIN_BASELINE = 5;
const MIN_POINTS_IMR = 10;
const MIN_SUBGROUPS_XBARR = 5;
const MIN_SUBGROUP_SIZE = 2;
const MAX_SUBGROUP_SIZE = 25;

/**
 * Validate raw analyze() input for MSA Typ 6 (Stabilität).
 * @param {object} inputs {chartType, values, subgroups?, limitsMode, mu0?, sigma0?, baselineK?, alpha, enabledRules}
 * @returns {{ok: true} | {ok: false, code: string, params?: object}}
 */
export function validate(inputs) {
  if (!inputs || !Array.isArray(inputs.values) || inputs.values.length === 0) {
    return { ok: false, code: 'E_NO_VALUES' };
  }
  if (!VALID_CHART_TYPES.has(inputs.chartType)) {
    return { ok: false, code: 'E_INVALID_CHART_TYPE' };
  }
  if (!VALID_ALPHAS.has(inputs.alpha)) {
    return { ok: false, code: 'E_INVALID_ALPHA' };
  }

  if (inputs.chartType === 'i-mr') {
    if (inputs.values.length < MIN_POINTS_IMR) {
      return { ok: false, code: 'E_TOO_FEW_POINTS', params: { min: MIN_POINTS_IMR } };
    }
  } else {
    // xbar-r
    if (!Array.isArray(inputs.subgroups) || inputs.subgroups.length !== inputs.values.length) {
      return { ok: false, code: 'E_SUBGROUP_MISMATCH' };
    }
    const sizes = new Map();
    for (const sg of inputs.subgroups) sizes.set(sg, (sizes.get(sg) || 0) + 1);
    const uniqSizes = new Set(sizes.values());
    if (uniqSizes.size > 1) return { ok: false, code: 'E_UNEQUAL_SUBGROUP_SIZES' };
    const n = [...uniqSizes][0];
    if (n < MIN_SUBGROUP_SIZE || n > MAX_SUBGROUP_SIZE) {
      return { ok: false, code: 'E_SUBGROUP_SIZE_OUT_OF_RANGE', params: { n, min: MIN_SUBGROUP_SIZE, max: MAX_SUBGROUP_SIZE } };
    }
    if (sizes.size < MIN_SUBGROUPS_XBARR) {
      return { ok: false, code: 'E_TOO_FEW_POINTS', params: { min: MIN_SUBGROUPS_XBARR } };
    }
  }

  if (inputs.limitsMode === 'given') {
    if (!Number.isFinite(inputs.mu0) || !Number.isFinite(inputs.sigma0) || inputs.sigma0 <= 0) {
      return { ok: false, code: 'E_GIVEN_LIMITS_INVALID' };
    }
  } else if (inputs.limitsMode === 'from-study') {
    const k = inputs.baselineK;
    if (!Number.isInteger(k) || k < MIN_BASELINE) {
      return { ok: false, code: 'E_BASELINE_TOO_SMALL', params: { min: MIN_BASELINE } };
    }
    const availableUnits = inputs.chartType === 'i-mr'
      ? inputs.values.length
      : new Set(inputs.subgroups).size;
    if (k > availableUnits) {
      return { ok: false, code: 'E_BASELINE_EXCEEDS_DATA', params: { k, available: availableUnits } };
    }
  } else {
    return { ok: false, code: 'E_INVALID_LIMITS_MODE' };
  }

  return { ok: true };
}

/**
 * Analyze stability data (I-MR or Xbar-R) for MSA Typ 6.
 * Full computation lands in Tasks 3–6; this task only wires validate().
 * @param {object} inputs see validate()
 * @returns {object} throws Error(code) on invalid input
 */
export function analyze(inputs) {
  const v = validate(inputs);
  if (!v.ok) { const e = new Error(v.code); e.code = v.code; e.params = v.params; throw e; }
  throw new Error('NOT_IMPLEMENTED');  // filled in Tasks 3–6
}

export { NELSON_RULES, DEFAULT_ENABLED_RULES };
