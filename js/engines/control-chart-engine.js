/**
 * D.Mike — Control Chart Engine (control-chart-engine.js)
 *
 * Pure SPC algorithms for control charts: I-MR, X̄-R, X̄-S.
 * Includes Nelson Rules evaluation and process capability (Cpk/Cp).
 * No DOM, no state — all functions are stateless and testable.
 */

// ── SPC Constants (indexed by subgroup size n, 0 & 1 unused) ──

export const SPC_CONSTANTS = {
  d2: [0,0,1.128,1.693,2.059,2.326,2.534,2.704,2.847,2.970,3.078,3.173,3.258,3.336,3.407,3.472,3.532,3.588,3.640,3.689,3.735,3.778,3.819,3.858,3.895,3.931],
  d3: [0,0,0.853,0.888,0.880,0.864,0.848,0.833,0.820,0.808,0.797,0.787,0.778,0.770,0.763,0.756,0.750,0.744,0.739,0.734,0.729,0.724,0.720,0.716,0.712,0.708],
  D3: [0,0,0,0,0,0,0,0.076,0.136,0.184,0.223,0.256,0.284,0.308,0.329,0.348,0.364,0.379,0.392,0.404,0.414,0.425,0.434,0.443,0.452,0.459],
  D4: [0,0,3.267,2.574,2.282,2.114,2.004,1.924,1.864,1.816,1.777,1.744,1.717,1.692,1.671,1.652,1.636,1.621,1.608,1.596,1.586,1.575,1.566,1.557,1.548,1.541],
  A2: [0,0,1.880,1.023,0.729,0.577,0.483,0.419,0.373,0.337,0.308,0.285,0.266,0.249,0.235,0.223,0.212,0.203,0.194,0.187,0.180,0.173,0.167,0.162,0.157,0.153],
  A3: [0,0,2.659,1.954,1.628,1.427,1.287,1.182,1.099,1.032,0.975,0.927,0.886,0.850,0.817,0.789,0.763,0.739,0.718,0.698,0.680,0.663,0.647,0.633,0.619,0.606],
  c4: [0,0,0.7979,0.8862,0.9213,0.9400,0.9515,0.9594,0.9650,0.9693,0.9727,0.9754,0.9776,0.9794,0.9810,0.9823,0.9835,0.9845,0.9854,0.9862,0.9869,0.9876,0.9882,0.9887,0.9892,0.9896],
  B3: [0,0,0,0,0,0,0.030,0.118,0.185,0.239,0.284,0.321,0.354,0.382,0.406,0.428,0.448,0.466,0.482,0.497,0.510,0.523,0.534,0.545,0.555,0.565],
  B4: [0,0,3.267,2.568,2.266,2.089,1.970,1.882,1.815,1.761,1.716,1.679,1.646,1.618,1.594,1.572,1.552,1.534,1.518,1.503,1.490,1.477,1.466,1.455,1.445,1.435],
};

// ── Nelson Rules Definition ──

export const NELSON_RULES = [
  { id: 1, short: { de: '1 Punkt > 3σ', en: '1 point > 3σ' }, desc: { de: 'Ein Punkt außerhalb der 3σ-Grenzen', en: 'One point beyond 3σ limits' } },
  { id: 2, short: { de: '9 gleiche Seite', en: '9 same side' }, desc: { de: '9 aufeinanderfolgende Punkte auf derselben Seite der Mittellinie', en: '9 consecutive points on the same side of the center line' } },
  { id: 3, short: { de: '6 steigend/fallend', en: '6 increasing/decreasing' }, desc: { de: '6 aufeinanderfolgende steigende oder fallende Punkte', en: '6 consecutive increasing or decreasing points' } },
  { id: 4, short: { de: '14 alternierend', en: '14 alternating' }, desc: { de: '14 aufeinanderfolgende alternierend steigende und fallende Punkte', en: '14 consecutive alternating up and down points' } },
  { id: 5, short: { de: '2/3 > 2σ', en: '2/3 > 2σ' }, desc: { de: '2 von 3 aufeinanderfolgenden Punkten jenseits 2σ (gleiche Seite)', en: '2 of 3 consecutive points beyond 2σ (same side)' } },
  { id: 6, short: { de: '4/5 > 1σ', en: '4/5 > 1σ' }, desc: { de: '4 von 5 aufeinanderfolgenden Punkten jenseits 1σ (gleiche Seite)', en: '4 of 5 consecutive points beyond 1σ (same side)' } },
  { id: 7, short: { de: '15 in Zone C', en: '15 in Zone C' }, desc: { de: '15 aufeinanderfolgende Punkte innerhalb 1σ beiderseits', en: '15 consecutive points within 1σ on both sides' } },
  { id: 8, short: { de: '8 außerhalb C', en: '8 outside C' }, desc: { de: '8 aufeinanderfolgende Punkte jenseits 1σ auf beiden Seiten', en: '8 consecutive points beyond 1σ on both sides' } },
];

/** Default enabled rules (1–6 on, 7–8 off) */
export const DEFAULT_ENABLED_RULES = [1, 2, 3, 4, 5, 6];

// ── Chart Type Definitions ──

/**
 * @typedef {Object} SubchartResult
 * @property {(number|null)[]} values
 * @property {number} cl
 * @property {number} ucl
 * @property {number} lcl
 * @property {number} sigma
 */

/**
 * @typedef {Object} ComputeResult
 * @property {Object<string, SubchartResult>} subcharts
 * @property {number[]} labels
 */

/**
 * @typedef {Object} ChartTypeDef
 * @property {string} id
 * @property {{ id: string, yLabel: { de: string, en: string } }[]} subcharts
 * @property {number} minSubgroupSize
 * @property {number} maxSubgroupSize
 * @property {function(number[], number, number): ComputeResult} compute
 */

/** @type {ChartTypeDef[]} */
export const CHART_TYPES = [
  {
    id: 'i-mr',
    subcharts: [
      { id: 'i', yLabel: { de: 'Einzelwert', en: 'Individual Value' } },
      { id: 'mr', yLabel: { de: 'Gleitende Spannweite', en: 'Moving Range' } },
    ],
    minSubgroupSize: 1,
    maxSubgroupSize: 1,
    compute: computeIMR,
  },
  {
    id: 'xbar-r',
    subcharts: [
      { id: 'xbar', yLabel: { de: 'X̄', en: 'X̄' } },
      { id: 'r', yLabel: { de: 'Spannweite R', en: 'Range R' } },
    ],
    minSubgroupSize: 2,
    maxSubgroupSize: 10,
    compute: computeXbarR,
  },
  {
    id: 'xbar-s',
    subcharts: [
      { id: 'xbar', yLabel: { de: 'X̄', en: 'X̄' } },
      { id: 's', yLabel: { de: 'Standardabw. S', en: 'Std Dev S' } },
    ],
    minSubgroupSize: 2,
    maxSubgroupSize: 25,
    compute: computeXbarS,
  },
];

/**
 * Get chart type definition by id.
 * @param {string} id
 * @returns {ChartTypeDef|undefined}
 */
export function getChartType(id) {
  return CHART_TYPES.find(ct => ct.id === id);
}

// ── Compute Functions ──

/**
 * I-MR (Individual & Moving Range) chart computation.
 * @param {number[]} values
 * @param {number} _n — ignored (always 1)
 * @param {number} [baselineEnd] — index after last baseline point
 * @returns {ComputeResult}
 */
export function computeIMR(values, _n, baselineEnd) {
  const blEnd = baselineEnd || values.length;
  const baseline = values.slice(0, blEnd);

  const mrAll = [null];
  for (let i = 1; i < values.length; i++) {
    mrAll.push(Math.abs(values[i] - values[i - 1]));
  }

  const mrBaseline = mrAll.slice(1, blEnd).filter(v => v !== null);
  const mrBar = mrBaseline.reduce((a, b) => a + b, 0) / mrBaseline.length;
  const xBar = baseline.reduce((a, b) => a + b, 0) / baseline.length;

  const d2 = SPC_CONSTANTS.d2[2];
  const D4 = SPC_CONSTANTS.D4[2];
  const D3 = SPC_CONSTANTS.D3[2];
  const sigmaI = mrBar / d2;

  return {
    subcharts: {
      i: { values, cl: xBar, ucl: xBar + 3 * sigmaI, lcl: xBar - 3 * sigmaI, sigma: sigmaI },
      mr: { values: mrAll, cl: mrBar, ucl: D4 * mrBar, lcl: D3 * mrBar, sigma: (D4 * mrBar - mrBar) / 3 },
    },
    labels: values.map((_, i) => i + 1),
  };
}

/**
 * X̄-R (Subgroup Mean & Range) chart computation.
 * @param {number[]} values
 * @param {number} n — subgroup size
 * @param {number} [baselineEnd] — index (in raw values) after last baseline value
 * @returns {ComputeResult}
 */
export function computeXbarR(values, n, baselineEnd) {
  const subgroups = [];
  for (let i = 0; i + n <= values.length; i += n) {
    subgroups.push(values.slice(i, i + n));
  }

  const blEnd = baselineEnd ? Math.ceil(baselineEnd / n) : subgroups.length;
  const means = subgroups.map(sg => sg.reduce((a, b) => a + b, 0) / sg.length);
  const ranges = subgroups.map(sg => Math.max(...sg) - Math.min(...sg));

  const blMeans = means.slice(0, blEnd);
  const blRanges = ranges.slice(0, blEnd);

  const xBarBar = blMeans.reduce((a, b) => a + b, 0) / blMeans.length;
  const rBar = blRanges.reduce((a, b) => a + b, 0) / blRanges.length;

  const A2 = SPC_CONSTANTS.A2[n];
  const D3 = SPC_CONSTANTS.D3[n];
  const D4 = SPC_CONSTANTS.D4[n];
  const d2 = SPC_CONSTANTS.d2[n];
  const sigmaXbar = rBar / (d2 * Math.sqrt(n));

  return {
    subcharts: {
      xbar: { values: means, cl: xBarBar, ucl: xBarBar + A2 * rBar, lcl: xBarBar - A2 * rBar, sigma: sigmaXbar },
      r: { values: ranges, cl: rBar, ucl: D4 * rBar, lcl: D3 * rBar, sigma: (D4 * rBar - rBar) / 3 },
    },
    labels: subgroups.map((_, i) => i + 1),
  };
}

/**
 * X̄-S (Subgroup Mean & Std Dev) chart computation.
 * @param {number[]} values
 * @param {number} n — subgroup size
 * @param {number} [baselineEnd] — index (in raw values) after last baseline value
 * @returns {ComputeResult}
 */
export function computeXbarS(values, n, baselineEnd) {
  const subgroups = [];
  for (let i = 0; i + n <= values.length; i += n) {
    subgroups.push(values.slice(i, i + n));
  }

  const blEnd = baselineEnd ? Math.ceil(baselineEnd / n) : subgroups.length;
  const means = subgroups.map(sg => sg.reduce((a, b) => a + b, 0) / sg.length);
  const stddevs = subgroups.map(sg => {
    const m = sg.reduce((a, b) => a + b, 0) / sg.length;
    return Math.sqrt(sg.reduce((a, v) => a + (v - m) ** 2, 0) / (sg.length - 1));
  });

  const blMeans = means.slice(0, blEnd);
  const blStds = stddevs.slice(0, blEnd);

  const xBarBar = blMeans.reduce((a, b) => a + b, 0) / blMeans.length;
  const sBar = blStds.reduce((a, b) => a + b, 0) / blStds.length;

  const A3 = SPC_CONSTANTS.A3[n];
  const B3 = SPC_CONSTANTS.B3[n];
  const B4 = SPC_CONSTANTS.B4[n];
  const c4 = SPC_CONSTANTS.c4[n];
  const sigmaXbar = sBar / (c4 * Math.sqrt(n));

  return {
    subcharts: {
      xbar: { values: means, cl: xBarBar, ucl: xBarBar + A3 * sBar, lcl: xBarBar - A3 * sBar, sigma: sigmaXbar },
      s: { values: stddevs, cl: sBar, ucl: B4 * sBar, lcl: B3 * sBar, sigma: (B4 * sBar - sBar) / 3 },
    },
    labels: subgroups.map((_, i) => i + 1),
  };
}

// ── Nelson Rules Engine ──

/**
 * @typedef {Object} Violation
 * @property {number} index — data point index
 * @property {number} ruleId — Nelson Rule id (1–8)
 */

/**
 * Evaluate Nelson Rules against a series of values.
 * @param {(number|null)[]} values
 * @param {number} cl — center line
 * @param {number} sigma — estimated sigma
 * @param {number[]} enabledRules — array of rule ids to check
 * @returns {Violation[]}
 */
export function evaluateNelsonRules(values, cl, sigma, enabledRules) {
  const violations = [];
  const n = values.length;
  if (sigma === 0) return violations;

  const side = (v) => (v > cl ? 1 : v < cl ? -1 : 0);
  const zone = (v) => Math.abs(v - cl) / sigma;

  const enabled = new Set(enabledRules);

  // Rule 1: Beyond 3σ
  if (enabled.has(1)) {
    for (let i = 0; i < n; i++) {
      if (values[i] === null) continue;
      if (zone(values[i]) > 3) violations.push({ index: i, ruleId: 1 });
    }
  }

  // Rule 2: 9 consecutive same side
  if (enabled.has(2)) {
    let count = 1, prevSide = 0;
    for (let i = 0; i < n; i++) {
      if (values[i] === null) { count = 0; prevSide = 0; continue; }
      const s = side(values[i]);
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
      if (values[i] === null || values[i - 1] === null) { incr = 1; decr = 1; continue; }
      if (values[i] > values[i - 1]) { incr++; decr = 1; }
      else if (values[i] < values[i - 1]) { decr++; incr = 1; }
      else { incr = 1; decr = 1; }
      if (incr >= 6) { for (let j = i - 5; j <= i; j++) violations.push({ index: j, ruleId: 3 }); }
      if (decr >= 6) { for (let j = i - 5; j <= i; j++) violations.push({ index: j, ruleId: 3 }); }
    }
  }

  // Rule 4: 14 alternating up/down
  if (enabled.has(4)) {
    let alt = 1;
    for (let i = 2; i < n; i++) {
      if (values[i] === null || values[i - 1] === null || values[i - 2] === null) { alt = 1; continue; }
      const d1 = values[i - 1] - values[i - 2];
      const d2v = values[i] - values[i - 1];
      if ((d1 > 0 && d2v < 0) || (d1 < 0 && d2v > 0)) alt++;
      else alt = 1;
      if (alt >= 14) { for (let j = i - 13; j <= i; j++) violations.push({ index: j, ruleId: 4 }); }
    }
  }

  // Rule 5: 2 of 3 beyond 2σ (same side)
  if (enabled.has(5)) {
    for (let i = 2; i < n; i++) {
      if ([i, i - 1, i - 2].some(j => values[j] === null)) continue;
      for (const dir of [1, -1]) {
        const beyond = [i - 2, i - 1, i].filter(j => dir * (values[j] - cl) > 2 * sigma);
        if (beyond.length >= 2) beyond.forEach(j => violations.push({ index: j, ruleId: 5 }));
      }
    }
  }

  // Rule 6: 4 of 5 beyond 1σ (same side)
  if (enabled.has(6)) {
    for (let i = 4; i < n; i++) {
      if ([i, i - 1, i - 2, i - 3, i - 4].some(j => values[j] === null)) continue;
      for (const dir of [1, -1]) {
        const beyond = [i - 4, i - 3, i - 2, i - 1, i].filter(j => dir * (values[j] - cl) > sigma);
        if (beyond.length >= 4) beyond.forEach(j => violations.push({ index: j, ruleId: 6 }));
      }
    }
  }

  // Rule 7: 15 consecutive in Zone C
  if (enabled.has(7)) {
    let count = 0;
    for (let i = 0; i < n; i++) {
      if (values[i] === null) { count = 0; continue; }
      if (zone(values[i]) <= 1) count++; else count = 0;
      if (count >= 15) {
        for (let j = i - 14; j <= i; j++) violations.push({ index: j, ruleId: 7 });
      }
    }
  }

  // Rule 8: 8 consecutive beyond Zone C (both sides)
  if (enabled.has(8)) {
    let count = 0;
    for (let i = 0; i < n; i++) {
      if (values[i] === null) { count = 0; continue; }
      if (zone(values[i]) > 1) count++; else count = 0;
      if (count >= 8) {
        for (let j = i - 7; j <= i; j++) violations.push({ index: j, ruleId: 8 });
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

// ── Cpk Calculator ──

/**
 * @typedef {Object} CapabilityResult
 * @property {number} [cp]
 * @property {number} [cpu]
 * @property {number} [cpl]
 * @property {number} cpk
 */

/**
 * Compute process capability indices.
 * @param {number[]} values — non-null data points
 * @param {number} cl — center line (process mean)
 * @param {number} sigma — estimated process sigma
 * @param {number|null} usl — upper spec limit
 * @param {number|null} lsl — lower spec limit
 * @returns {CapabilityResult|null}
 */
export function computeCapability(values, cl, sigma, usl, lsl) {
  if (sigma === 0) return null;
  const hasUSL = usl !== null && usl !== undefined && !isNaN(usl);
  const hasLSL = lsl !== null && lsl !== undefined && !isNaN(lsl);
  if (!hasUSL && !hasLSL) return null;

  const result = {};
  if (hasUSL && hasLSL) {
    result.cp = (usl - lsl) / (6 * sigma);
    result.cpu = (usl - cl) / (3 * sigma);
    result.cpl = (cl - lsl) / (3 * sigma);
    result.cpk = Math.min(result.cpu, result.cpl);
  } else if (hasUSL) {
    result.cpu = (usl - cl) / (3 * sigma);
    result.cpk = result.cpu;
  } else {
    result.cpl = (cl - lsl) / (3 * sigma);
    result.cpk = result.cpl;
  }
  return result;
}

// ── Unified Dispatcher for Algorithm Lab / Fixture Replay ──

/**
 * Unified control-chart dispatcher. Mirrors the Python fixture generator 1:1
 * and returns a flat result object so fixtures (expected keys like "i.cl",
 * "xbar.ucl", "violationCount", "cpk") roundtrip without transformation.
 *
 * Dispatches on `inputs.mode`:
 *   - "i-mr"      → I-MR chart → flat {"i.cl","i.ucl","i.lcl","i.sigma","mr.cl","mr.ucl","mr.lcl","mr.sigma"}
 *   - "xbar-r"    → X̄-R chart → flat {"xbar.*","r.*"}
 *   - "xbar-s"    → X̄-S chart → flat {"xbar.*","s.*"}
 *   - "nelson"    → {violationCount, rulesTriggered, violationIndices}
 *   - "capability"→ {cp?, cpu?, cpl?, cpk}
 *
 * @param {Object} inputs
 * @param {"i-mr"|"xbar-r"|"xbar-s"|"nelson"|"capability"} inputs.mode
 * @param {number[]} [inputs.values]
 * @param {number} [inputs.n] — subgroup size for xbar-r / xbar-s
 * @param {number} [inputs.baselineEnd]
 * @param {number} [inputs.cl] — center line (nelson, capability)
 * @param {number} [inputs.sigma] — sigma estimate (nelson, capability)
 * @param {number[]} [inputs.enabledRules] — nelson only; default [1..6]
 * @param {number|null} [inputs.usl] — capability only
 * @param {number|null} [inputs.lsl] — capability only
 * @returns {Object} flat result
 */
export function analyze(inputs) {
  if (!inputs || typeof inputs.mode !== 'string') {
    throw new Error('analyze: inputs.mode (string) is required');
  }
  const mode = inputs.mode;

  if (mode === 'i-mr' || mode === 'xbar-r' || mode === 'xbar-s') {
    const values = inputs.values;
    if (!Array.isArray(values)) throw new Error('analyze: inputs.values (number[]) is required');
    let sub;
    if (mode === 'i-mr') {
      sub = computeIMR(values, 1, inputs.baselineEnd).subcharts;
    } else if (mode === 'xbar-r') {
      if (!Number.isFinite(inputs.n)) throw new Error('analyze: inputs.n (subgroup size) is required for xbar-r');
      sub = computeXbarR(values, inputs.n, inputs.baselineEnd).subcharts;
    } else {
      if (!Number.isFinite(inputs.n)) throw new Error('analyze: inputs.n (subgroup size) is required for xbar-s');
      sub = computeXbarS(values, inputs.n, inputs.baselineEnd).subcharts;
    }
    const flat = {};
    for (const subId of Object.keys(sub)) {
      const s = sub[subId];
      flat[`${subId}.cl`]    = s.cl;
      flat[`${subId}.ucl`]   = s.ucl;
      flat[`${subId}.lcl`]   = s.lcl;
      flat[`${subId}.sigma`] = s.sigma;
    }
    return flat;
  }

  if (mode === 'nelson') {
    const values = inputs.values;
    if (!Array.isArray(values)) throw new Error('analyze: inputs.values is required for nelson');
    const cl = inputs.cl;
    const sigma = inputs.sigma;
    const enabled = inputs.enabledRules || DEFAULT_ENABLED_RULES;
    const violations = evaluateNelsonRules(values, cl, sigma, enabled);
    const triggered = [...new Set(violations.map(v => v.ruleId))].sort((a, b) => a - b);
    const indices = [...new Set(violations.map(v => v.index))].sort((a, b) => a - b);
    return {
      violationCount: violations.length,
      rulesTriggered: triggered,
      violationIndices: indices,
    };
  }

  if (mode === 'capability') {
    const cap = computeCapability(
      inputs.values || [],
      inputs.cl,
      inputs.sigma,
      inputs.usl ?? null,
      inputs.lsl ?? null,
    );
    return cap || {};
  }

  throw new Error(`analyze: unknown mode '${mode}'`);
}
