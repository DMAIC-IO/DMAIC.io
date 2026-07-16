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
 * Group a flat values array by subgroup id, preserving first-seen order of
 * the ids (not a numeric/lexical sort — the id sequence in `subgroups`
 * defines group order).
 * @param {number[]} values
 * @param {Array} subgroups — subgroup id per value, same length as values
 * @returns {number[][]}
 */
function _groupInOrder(values, subgroups) {
  const groups = [];
  const seen = [];
  for (let i = 0; i < values.length; i++) {
    const sg = subgroups[i];
    let idx = seen.indexOf(sg);
    if (idx === -1) { seen.push(sg); groups.push([]); idx = seen.length - 1; }
    groups[idx].push(values[i]);
  }
  return groups;
}

/**
 * Compute control limits for the primary/secondary chart pair, for both
 * chart types (I-MR, X̄-R) and both limits modes (from-study, given).
 *
 * `given` mode formulas (Spec § 4) are computed directly from µ₀/σ₀ — no
 * delegation. `from-study` mode delegates the baseline aggregation to
 * {@link computeIMR}/{@link computeXbarR} in control-chart-engine.js.
 *
 * Note on X̄-R from-study UCL/LCL: computeXbarR's own subchart limits use
 * the tabulated A2 constant (rounded to 3 decimals), which is precise
 * enough for shop-floor SPC but not for the fixture's 1e-9 tolerance. Since
 * computeXbarR's `sigma` field is already the exact d2-derived σ_x̄, we
 * recompute UCL/LCL here as cl ± 3·σ_x̄ instead of trusting the A2-based
 * limits — mathematically equivalent, just not rounded through A2.
 *
 * @param {object} inputs see validate()
 * @returns {{chartType: string, n: number, primary: object, secondary: object}}
 */
function _computeLimits(inputs) {
  const { chartType, values, subgroups, limitsMode, mu0, sigma0 } = inputs;

  if (chartType === 'i-mr') {
    if (limitsMode === 'given') {
      const cl = mu0, sigma = sigma0;
      const ucl = cl + 3 * sigma, lcl = cl - 3 * sigma;
      const mrCl = 1.128 * sigma, mrUcl = 3.267 * mrCl, mrLcl = 0;
      const secondary = values.map((v, i) => (i === 0 ? null : Math.abs(v - values[i - 1])));
      return {
        chartType, n: 1,
        primary:   { series: values.slice(), cl, ucl, lcl, sigma },
        secondary: { series: secondary,      cl: mrCl, ucl: mrUcl, lcl: mrLcl },
      };
    }
    // from-study — baselineK is a count of baseline units, which is exactly
    // what computeIMR's `baselineEnd` expects for I-MR (index == count here).
    const imr = computeIMR(values, undefined, inputs.baselineK, null, undefined);
    return {
      chartType, n: 1,
      primary:   { series: values.slice(), cl: imr.subcharts.i.cl, ucl: imr.subcharts.i.ucl, lcl: imr.subcharts.i.lcl, sigma: imr.subcharts.i.sigma },
      secondary: { series: imr.subcharts.mr.values, cl: imr.subcharts.mr.cl, ucl: imr.subcharts.mr.ucl, lcl: imr.subcharts.mr.lcl },
    };
  }

  // xbar-r — validate() already guarantees equal subgroup sizes.
  const groupSize = subgroups.filter(s => s === subgroups[0]).length;

  if (limitsMode === 'given') {
    const cl = mu0;
    const sigmaXbar = sigma0 / Math.sqrt(groupSize);
    const ucl = cl + 3 * sigmaXbar, lcl = cl - 3 * sigmaXbar;
    const rCl = SPC_CONSTANTS.d2[groupSize] * sigma0;
    const rUcl = SPC_CONSTANTS.D4[groupSize] * rCl, rLcl = SPC_CONSTANTS.D3[groupSize] * rCl;
    const groups = _groupInOrder(values, subgroups);
    const xbars = groups.map(g => g.reduce((a, b) => a + b, 0) / g.length);
    const rs    = groups.map(g => Math.max(...g) - Math.min(...g));
    return {
      chartType, n: groupSize,
      primary:   { series: xbars, cl, ucl, lcl, sigma: sigmaXbar },
      secondary: { series: rs,    cl: rCl, ucl: rUcl, lcl: rLcl },
    };
  }

  // from-study — baselineK counts baseline subgroups; computeXbarR's
  // baselineEnd is a flat raw-value index, so multiply by groupSize.
  const xbarR = computeXbarR(values, groupSize, inputs.baselineK * groupSize, null, undefined);
  const cl = xbarR.subcharts.xbar.cl;
  const sigma = xbarR.subcharts.xbar.sigma; // already σ_x̄ = R̄/(d2·√n) — no further division
  return {
    chartType, n: groupSize,
    primary:   { series: xbarR.subcharts.xbar.values, cl, ucl: cl + 3 * sigma, lcl: cl - 3 * sigma, sigma },
    secondary: { series: xbarR.subcharts.r.values, cl: xbarR.subcharts.r.cl, ucl: xbarR.subcharts.r.ucl, lcl: xbarR.subcharts.r.lcl },
  };
}

/**
 * Compute a time axis aligned with the primary chart's series (one entry
 * per primary point). Falls back to 1-based point indices when the caller
 * supplies no timestamps. For X̄-R, timestamps are grouped per subgroup
 * (same order as `_computeLimits`) and averaged, since the primary series
 * is one point per subgroup, not per raw value.
 * @param {object} inputs see validate()
 * @param {object} limits return value of _computeLimits(inputs)
 * @returns {Array<number>}
 */
function _timeAxis(inputs, limits) {
  if (!Array.isArray(inputs.timestamps)) {
    return limits.primary.series.map((_, i) => i + 1);
  }
  if (inputs.chartType === 'i-mr') return inputs.timestamps.slice();
  // xbar-r: group timestamps in subgroup order, average each group.
  const groups = _groupInOrder(inputs.timestamps.map(t => {
    const ms = typeof t === 'string' ? Date.parse(t) : Number(t);
    return Number.isFinite(ms) ? ms : NaN;
  }), inputs.subgroups);
  return groups.map(g => g.reduce((a, b) => a + b, 0) / g.length);
}

/**
 * Analyze stability data (I-MR or Xbar-R) for MSA Typ 6.
 * Grenzen-Berechnung (from-study + given) und Nelson-Regel-Aggregation
 * landen hier; Drift-Test und Verdict/Ampel folgen in Tasks 5–6.
 * @param {object} inputs see validate()
 * @returns {object} throws Error(code) on invalid input
 */
export function analyze(inputs) {
  const v = validate(inputs);
  if (!v.ok) { const e = new Error(v.code); e.code = v.code; e.params = v.params; throw e; }
  const limits = _computeLimits(inputs);

  const enabled = Array.isArray(inputs.enabledRules) && inputs.enabledRules.length
    ? inputs.enabledRules : DEFAULT_ENABLED_RULES;
  const primaryViolations = evaluateNelsonRules(
    limits.primary.series, limits.primary.cl, limits.primary.sigma, enabled,
  );
  const byIndex = new Map();
  for (const viol of primaryViolations) {
    if (!byIndex.has(viol.index)) byIndex.set(viol.index, new Set());
    byIndex.get(viol.index).add(viol.ruleId);
  }
  const timestamps = _timeAxis(inputs, limits);
  const ruleViolations = [...byIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([i, rules]) => ({
      primaryIndex: i, time: timestamps[i], value: limits.primary.series[i],
      ruleIds: [...rules].sort((a, b) => a - b),
    }));

  return {
    meta: {
      chartType: limits.chartType, limitsMode: inputs.limitsMode, n: limits.n,
      subgroupCount: limits.primary.series.length, pointCount: inputs.values.length,
      baselineK: inputs.baselineK, warnings: [],
    },
    primary:   { ...limits.primary, label: inputs.chartType === 'i-mr' ? 'i' : 'xbar', violations: primaryViolations },
    secondary: { ...limits.secondary, label: inputs.chartType === 'i-mr' ? 'MR' : 'R' },
    drift: null,           // Task 5
    ruleViolations,
    verdict: null,         // Task 6
    interpretation: null,  // Task 6
  };
}

export { NELSON_RULES, DEFAULT_ENABLED_RULES };
