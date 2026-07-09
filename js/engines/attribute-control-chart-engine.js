/**
 * D.Mike — Attribute Control Chart Engine (attribute-control-chart-engine.js)
 *
 * Pure SPC algorithms for attribute (count/proportion) control charts:
 *   p   — proportion defective, variable subgroup size
 *   np  — number defective,     constant subgroup size
 *   c   — defects per unit,     constant area of opportunity
 *   u   — defects per unit,     variable area of opportunity
 *
 * No DOM, no state — all functions stateless and testable.
 *
 * For variable-n charts (p, u), UCL/LCL/sigma are returned as arrays (one per
 * subgroup). For constant-n charts (np, c, and p/u with constant n), they are
 * returned as scalars (so the chart renderer can draw a single horizontal line).
 */

// ── Chart Type Definitions ──

/**
 * @typedef {Object} AttributeChartResult
 * @property {(number|null)[]} values     — plotted statistic per subgroup (p, count, c, u)
 * @property {number} cl                  — center line
 * @property {number|number[]} ucl        — upper control limit (scalar OR per-point)
 * @property {number|number[]} lcl        — lower control limit (scalar OR per-point)
 * @property {number|number[]} sigma      — sigma estimate (scalar OR per-point)
 * @property {boolean} variableLimits     — true → ucl/lcl/sigma are arrays
 * @property {number[]} [n]               — subgroup sizes used (when variable)
 * @property {string} statistic           — 'proportion' | 'count' | 'rate'
 */

/**
 * @typedef {Object} AttributeChartTypeDef
 * @property {string} id
 * @property {boolean} requiresSampleSize  — true for p, u (subgroup size column needed)
 * @property {boolean} requiresConstantN   — true for np (single n input)
 * @property {function(Object): AttributeChartResult} compute
 */

/** @type {AttributeChartTypeDef[]} */
export const ATTRIBUTE_CHART_TYPES = [
  { id: 'p',  requiresSampleSize: true,  requiresConstantN: false, compute: (i) => computeP(i.defects, i.n, i.baselineEnd) },
  { id: 'np', requiresSampleSize: false, requiresConstantN: true,  compute: (i) => computeNP(i.defects, i.n, i.baselineEnd) },
  { id: 'c',  requiresSampleSize: false, requiresConstantN: false, compute: (i) => computeC(i.defects, i.baselineEnd) },
  { id: 'u',  requiresSampleSize: true,  requiresConstantN: false, compute: (i) => computeU(i.defects, i.n, i.baselineEnd) },
];

/**
 * Get attribute chart type definition by id.
 * @param {string} id
 * @returns {AttributeChartTypeDef|undefined}
 */
export function getAttributeChartType(id) {
  return ATTRIBUTE_CHART_TYPES.find(ct => ct.id === id);
}

// ── Helpers ──

/** Sum an array of numbers. */
function sum(arr) { let s = 0; for (let i = 0; i < arr.length; i++) s += arr[i]; return s; }

/**
 * Compute baseline aggregate p̄ = ΣD / Σn over the baseline window.
 * @private
 */
function _baselinePBar(defects, sizes, blEnd) {
  const dSum = sum(defects.slice(0, blEnd));
  const nSum = sum(sizes.slice(0, blEnd));
  return nSum > 0 ? dSum / nSum : 0;
}

// ── Compute Functions ──

/**
 * p-Chart (proportion defective). Subgroup sizes may vary.
 * @param {number[]} defects — count of defective units per subgroup
 * @param {number[]} sizes   — subgroup size n_i (must match defects.length)
 * @param {number} [baselineEnd] — index after last baseline subgroup (defaults to all)
 * @returns {AttributeChartResult}
 */
export function computeP(defects, sizes, baselineEnd) {
  if (!Array.isArray(defects) || !Array.isArray(sizes) || defects.length !== sizes.length) {
    throw new Error('computeP: defects and sizes must be equal-length arrays');
  }
  const k = defects.length;
  const blEnd = baselineEnd && baselineEnd > 0 ? Math.min(baselineEnd, k) : k;

  const pBar = _baselinePBar(defects, sizes, blEnd);
  const values = defects.map((d, i) => sizes[i] > 0 ? d / sizes[i] : null);

  // Constant-n shortcut: scalar limits + zones work
  const allEqual = sizes.every(n => n === sizes[0]);
  if (allEqual && sizes[0] > 0) {
    const sigma = Math.sqrt(pBar * (1 - pBar) / sizes[0]);
    return {
      values,
      cl: pBar,
      ucl: pBar + 3 * sigma,
      lcl: Math.max(0, pBar - 3 * sigma),
      sigma,
      variableLimits: false,
      n: sizes.slice(),
      statistic: 'proportion',
    };
  }

  // Variable n → per-point limits (stepped chart)
  const sigmaArr = sizes.map(n => n > 0 ? Math.sqrt(pBar * (1 - pBar) / n) : 0);
  const uclArr = sigmaArr.map(s => pBar + 3 * s);
  const lclArr = sigmaArr.map(s => Math.max(0, pBar - 3 * s));
  return {
    values,
    cl: pBar,
    ucl: uclArr,
    lcl: lclArr,
    sigma: sigmaArr,
    variableLimits: true,
    n: sizes.slice(),
    statistic: 'proportion',
  };
}

/**
 * np-Chart (number defective). Constant subgroup size.
 * @param {number[]} defects
 * @param {number} n — constant subgroup size
 * @param {number} [baselineEnd]
 * @returns {AttributeChartResult}
 */
export function computeNP(defects, n, baselineEnd) {
  if (!Array.isArray(defects)) throw new Error('computeNP: defects must be an array');
  if (!Number.isFinite(n) || n <= 0) throw new Error('computeNP: n (constant subgroup size) must be > 0');
  const k = defects.length;
  const blEnd = baselineEnd && baselineEnd > 0 ? Math.min(baselineEnd, k) : k;

  const pBar = sum(defects.slice(0, blEnd)) / (n * blEnd);
  const cl = n * pBar;
  const sigma = Math.sqrt(n * pBar * (1 - pBar));

  return {
    values: defects.slice(),
    cl,
    ucl: cl + 3 * sigma,
    lcl: Math.max(0, cl - 3 * sigma),
    sigma,
    variableLimits: false,
    n: Array.from({ length: k }, () => n),
    statistic: 'count',
  };
}

/**
 * c-Chart (defects per unit, constant area of opportunity).
 * @param {number[]} counts — defect count per unit
 * @param {number} [baselineEnd]
 * @returns {AttributeChartResult}
 */
export function computeC(counts, baselineEnd) {
  if (!Array.isArray(counts)) throw new Error('computeC: counts must be an array');
  const k = counts.length;
  const blEnd = baselineEnd && baselineEnd > 0 ? Math.min(baselineEnd, k) : k;

  const cBar = blEnd > 0 ? sum(counts.slice(0, blEnd)) / blEnd : 0;
  const sigma = Math.sqrt(cBar);

  return {
    values: counts.slice(),
    cl: cBar,
    ucl: cBar + 3 * sigma,
    lcl: Math.max(0, cBar - 3 * sigma),
    sigma,
    variableLimits: false,
    statistic: 'count',
  };
}

/**
 * u-Chart (defects per unit, variable area of opportunity).
 * @param {number[]} counts — total defect count per subgroup
 * @param {number[]} sizes  — inspection units per subgroup (may vary; constant allowed)
 * @param {number} [baselineEnd]
 * @returns {AttributeChartResult}
 */
export function computeU(counts, sizes, baselineEnd) {
  if (!Array.isArray(counts) || !Array.isArray(sizes) || counts.length !== sizes.length) {
    throw new Error('computeU: counts and sizes must be equal-length arrays');
  }
  const k = counts.length;
  const blEnd = baselineEnd && baselineEnd > 0 ? Math.min(baselineEnd, k) : k;

  const uBar = (() => {
    const s = sum(sizes.slice(0, blEnd));
    return s > 0 ? sum(counts.slice(0, blEnd)) / s : 0;
  })();

  const values = counts.map((c, i) => sizes[i] > 0 ? c / sizes[i] : null);

  const allEqual = sizes.every(n => n === sizes[0]);
  if (allEqual && sizes[0] > 0) {
    const sigma = Math.sqrt(uBar / sizes[0]);
    return {
      values,
      cl: uBar,
      ucl: uBar + 3 * sigma,
      lcl: Math.max(0, uBar - 3 * sigma),
      sigma,
      variableLimits: false,
      n: sizes.slice(),
      statistic: 'rate',
    };
  }

  const sigmaArr = sizes.map(n => n > 0 ? Math.sqrt(uBar / n) : 0);
  const uclArr = sigmaArr.map(s => uBar + 3 * s);
  const lclArr = sigmaArr.map(s => Math.max(0, uBar - 3 * s));
  return {
    values,
    cl: uBar,
    ucl: uclArr,
    lcl: lclArr,
    sigma: sigmaArr,
    variableLimits: true,
    n: sizes.slice(),
    statistic: 'rate',
  };
}

// ── Attribute-Chart Nelson Rules ──
//
// Attribute charts traditionally rely on Rule 1 (point beyond limits) plus a
// reduced set of pattern rules. Rules involving zones (5–8) require a
// constant sigma to be meaningful. We expose 1, 2, 3 as the standard set;
// 5–8 are evaluated only for constant-σ charts (np, c, and constant-n p/u).

/**
 * Reduced set of Nelson rules applicable to attribute charts.
 * Rule 4 (alternating) is excluded — discrete counts produce frequent ties.
 */
export const ATTRIBUTE_NELSON_RULES = [
  { id: 1, short: { de: '1 Punkt > UCL/LCL', en: '1 point beyond limits' }, desc: { de: 'Ein Punkt außerhalb der Eingriffsgrenzen', en: 'One point outside the control limits' } },
  { id: 2, short: { de: '9 gleiche Seite',    en: '9 same side' },          desc: { de: '9 aufeinanderfolgende Punkte auf derselben Seite der Mittellinie', en: '9 consecutive points on the same side of the center line' } },
  { id: 3, short: { de: '6 steigend/fallend', en: '6 increasing/decreasing'}, desc: { de: '6 aufeinanderfolgende steigende oder fallende Punkte', en: '6 consecutive increasing or decreasing points' } },
  { id: 5, short: { de: '2/3 > 2σ',  en: '2/3 > 2σ' }, desc: { de: '2 von 3 aufeinanderfolgenden Punkten jenseits 2σ (gleiche Seite, nur konstantes σ)', en: '2 of 3 consecutive points beyond 2σ (same side, constant σ only)' } },
  { id: 6, short: { de: '4/5 > 1σ',  en: '4/5 > 1σ' }, desc: { de: '4 von 5 aufeinanderfolgenden Punkten jenseits 1σ (gleiche Seite, nur konstantes σ)', en: '4 of 5 consecutive points beyond 1σ (same side, constant σ only)' } },
];

/** Default enabled rules for attribute charts. */
export const ATTR_DEFAULT_ENABLED_RULES = [1, 2, 3];

/**
 * Evaluate attribute-chart Nelson rules. Supports per-point limits.
 * @param {(number|null)[]} values
 * @param {number} cl
 * @param {number|number[]} ucl
 * @param {number|number[]} lcl
 * @param {number|number[]} sigma
 * @param {number[]} enabledRules
 * @returns {{ index: number, ruleId: number }[]}
 */
export function evaluateAttributeRules(values, cl, ucl, lcl, sigma, enabledRules) {
  const violations = [];
  const n = values.length;
  const enabled = new Set(enabledRules);

  const uclAt = (i) => Array.isArray(ucl) ? ucl[i] : ucl;
  const lclAt = (i) => Array.isArray(lcl) ? lcl[i] : lcl;
  const variableSigma = Array.isArray(sigma);

  // Rule 1: Beyond limits
  if (enabled.has(1)) {
    for (let i = 0; i < n; i++) {
      if (values[i] == null) continue;
      if (values[i] > uclAt(i) || values[i] < lclAt(i)) {
        violations.push({ index: i, ruleId: 1 });
      }
    }
  }

  // Rule 2: 9 consecutive same side of CL
  if (enabled.has(2)) {
    let count = 1, prevSide = 0;
    for (let i = 0; i < n; i++) {
      if (values[i] == null) { count = 0; prevSide = 0; continue; }
      const s = values[i] > cl ? 1 : values[i] < cl ? -1 : 0;
      if (s === 0) { count = 0; prevSide = 0; continue; }
      if (s === prevSide) count++; else { count = 1; prevSide = s; }
      if (count >= 9) {
        for (let j = i - 8; j <= i; j++) violations.push({ index: j, ruleId: 2 });
      }
    }
  }

  // Rule 3: 6 consecutive increasing or decreasing
  if (enabled.has(3)) {
    let incr = 1, decr = 1;
    for (let i = 1; i < n; i++) {
      if (values[i] == null || values[i - 1] == null) { incr = 1; decr = 1; continue; }
      if (values[i] > values[i - 1])      { incr++; decr = 1; }
      else if (values[i] < values[i - 1]) { decr++; incr = 1; }
      else { incr = 1; decr = 1; }
      if (incr >= 6) for (let j = i - 5; j <= i; j++) violations.push({ index: j, ruleId: 3 });
      if (decr >= 6) for (let j = i - 5; j <= i; j++) violations.push({ index: j, ruleId: 3 });
    }
  }

  // Rules 5 & 6 require constant sigma (zones are only meaningful then)
  if (!variableSigma && sigma > 0) {
    if (enabled.has(5)) {
      for (let i = 2; i < n; i++) {
        if ([i, i - 1, i - 2].some(j => values[j] == null)) continue;
        for (const dir of [1, -1]) {
          const beyond = [i - 2, i - 1, i].filter(j => dir * (values[j] - cl) > 2 * sigma);
          if (beyond.length >= 2) beyond.forEach(j => violations.push({ index: j, ruleId: 5 }));
        }
      }
    }
    if (enabled.has(6)) {
      for (let i = 4; i < n; i++) {
        if ([i, i - 1, i - 2, i - 3, i - 4].some(j => values[j] == null)) continue;
        for (const dir of [1, -1]) {
          const beyond = [i - 4, i - 3, i - 2, i - 1, i].filter(j => dir * (values[j] - cl) > sigma);
          if (beyond.length >= 4) beyond.forEach(j => violations.push({ index: j, ruleId: 6 }));
        }
      }
    }
  }

  // Deduplicate
  const seen = new Set();
  return violations.filter(v => {
    const k = `${v.index}-${v.ruleId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ── Unified Dispatcher (Algorithm Lab / Fixture Replay) ──

/**
 * Unified dispatcher for attribute control charts. Returns a flat result
 * shape so JSON fixtures can pin keys like "p.cl", "p.ucl_mean", "violationCount".
 *
 * Modes:
 *   "p"  | "np" | "c" | "u"  → flat {"<id>.cl","<id>.ucl_mean","<id>.lcl_mean","<id>.sigma_mean"}
 *                              (mean is over all points; for constant-n charts that
 *                              equals the scalar limit)
 *   "nelson"                  → {violationCount, rulesTriggered, violationIndices}
 *
 * @param {Object} inputs
 * @param {"p"|"np"|"c"|"u"|"nelson"} inputs.mode
 * @param {number[]} [inputs.defects]
 * @param {number[]|number} [inputs.n] — array (p, u) or scalar (np)
 * @param {number} [inputs.baselineEnd]
 * @param {number[]} [inputs.values]   — for nelson
 * @param {number} [inputs.cl]         — for nelson
 * @param {number|number[]} [inputs.ucl] — for nelson
 * @param {number|number[]} [inputs.lcl] — for nelson
 * @param {number|number[]} [inputs.sigma] — for nelson
 * @param {number[]} [inputs.enabledRules] — for nelson
 * @returns {Object} flat result
 */
export function analyze(inputs) {
  if (!inputs || typeof inputs.mode !== 'string') {
    throw new Error('analyze: inputs.mode (string) is required');
  }
  const mode = inputs.mode;

  if (mode === 'p' || mode === 'np' || mode === 'c' || mode === 'u') {
    let r;
    if (mode === 'p') {
      r = computeP(inputs.defects || [], inputs.n || [], inputs.baselineEnd);
    } else if (mode === 'np') {
      r = computeNP(inputs.defects || [], inputs.n, inputs.baselineEnd);
    } else if (mode === 'c') {
      r = computeC(inputs.defects || [], inputs.baselineEnd);
    } else {
      r = computeU(inputs.defects || [], inputs.n || [], inputs.baselineEnd);
    }
    const meanArr = (a) => Array.isArray(a) ? (a.length ? sum(a) / a.length : 0) : a;
    return {
      [`${mode}.cl`]:        r.cl,
      [`${mode}.ucl_mean`]:  meanArr(r.ucl),
      [`${mode}.lcl_mean`]:  meanArr(r.lcl),
      [`${mode}.sigma_mean`]: meanArr(r.sigma),
      [`${mode}.variableLimits`]: r.variableLimits,
    };
  }

  if (mode === 'nelson') {
    const violations = evaluateAttributeRules(
      inputs.values || [],
      inputs.cl,
      inputs.ucl,
      inputs.lcl,
      inputs.sigma,
      inputs.enabledRules || ATTR_DEFAULT_ENABLED_RULES,
    );
    const triggered = [...new Set(violations.map(v => v.ruleId))].sort((a, b) => a - b);
    const indices = [...new Set(violations.map(v => v.index))].sort((a, b) => a - b);
    return {
      violationCount: violations.length,
      rulesTriggered: triggered,
      violationIndices: indices,
    };
  }

  throw new Error(`analyze: unknown mode '${mode}'`);
}