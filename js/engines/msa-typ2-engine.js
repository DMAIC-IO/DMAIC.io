/**
 * D.Mike — MSA Typ 2/3 Engine (msa-typ2-engine.js)
 * Pure computation functions for Measurement System Analysis.
 *
 * Typ 2: ANOVA-based crossed study — operators × parts × replicates.
 * Typ 3: one-way random-effects ANOVA — parts × replicates, no operator
 *        (automatisierte Messsysteme). Selected implicitly when
 *        `data.operators` is null/undefined/empty.
 *
 * No DOM access — this module is testable in isolation.
 *
 * Spec: docs/modules/MSA-TYP2.md
 */

import { mean, stddev } from './stats-utils.js';
export { mean, stddev };

// ═══════════════════════════════════════════════════════════
//  F-DISTRIBUTION (from math-utils.js)
// ═══════════════════════════════════════════════════════════

import { lnGamma, betaIncomplete, fPValue } from './math-utils.js';

// Re-export for backward compatibility
export { lnGamma, betaIncomplete };

/**
 * P-value from the F-distribution: P(F > fStat).
 * @param {number} fStat
 * @param {number} df1
 * @param {number} df2
 * @returns {number}
 */
export function fDistPValue(fStat, df1, df2) {
  if (fStat <= 0) return 1;
  if (!isFinite(fStat)) return 0;
  return fPValue(fStat, df1, df2);
}

// ═══════════════════════════════════════════════════════════
//  CONTROL CHART CONSTANTS
// ═══════════════════════════════════════════════════════════

/** A2, D3, D4 constants indexed by subgroup size n (2..6). */
const CONTROL_CONSTANTS = {
  2: { A2: 1.880, D3: 0, D4: 3.267 },
  3: { A2: 1.023, D3: 0, D4: 2.575 },
  4: { A2: 0.729, D3: 0, D4: 2.282 },
  5: { A2: 0.577, D3: 0, D4: 2.115 },
  6: { A2: 0.483, D3: 0, D4: 2.004 },
};

export function getControlConstants(n) {
  return CONTROL_CONSTANTS[n] || CONTROL_CONSTANTS[6];
}

// ═══════════════════════════════════════════════════════════
//  VALIDATION
// ═══════════════════════════════════════════════════════════

/** True when `operators` is absent/empty → Typ-3 (no operator) mode. */
function isTyp3Data(data) {
  return !data.operators || !Array.isArray(data.operators) || data.operators.length === 0;
}

/**
 * Validate input data for Gage R&R analysis. Routes to Typ 3 if no operators.
 * @param {{ parts: string[], operators?: string[]|null, measurements: number[] }} data
 * @param {{ lsl?: number, usl?: number }} options
 * @returns {{ valid: boolean, errorKey: string|null, errorVars?: object|null, mode?: string, p?: number, o?: number, r?: number }}
 */
export function validate(data, options = {}) {
  if (isTyp3Data(data)) return validateTyp3(data, options);

  const { parts, operators, measurements } = data;

  if (!parts || !operators || !measurements) {
    return { valid: false, errorKey: 'modules.msa-typ2.errDataMissing' };
  }

  const n = measurements.length;
  if (parts.length !== n || operators.length !== n) {
    return { valid: false, errorKey: 'modules.msa-typ2.errColumnLengthMismatch' };
  }

  if (n === 0) {
    return { valid: false, errorKey: 'modules.msa-typ2.errNoData' };
  }

  // Check numeric
  for (let i = 0; i < n; i++) {
    if (typeof measurements[i] !== 'number' || isNaN(measurements[i])) {
      return { valid: false, errorKey: 'modules.msa-typ2.errNonNumeric', errorVars: { row: i + 1 } };
    }
  }

  const uniqueParts = [...new Set(parts)];
  const uniqueOps = [...new Set(operators)];
  const p = uniqueParts.length;
  const o = uniqueOps.length;

  if (p < 2) {
    return { valid: false, errorKey: 'modules.msa-typ2.errTooFewParts', errorVars: { n: p } };
  }
  if (o < 2) {
    return { valid: false, errorKey: 'modules.msa-typ2.errTooFewOperators', errorVars: { n: o } };
  }

  // Check balanced design
  const cellCounts = {};
  for (let i = 0; i < n; i++) {
    const key = `${parts[i]}|||${operators[i]}`;
    cellCounts[key] = (cellCounts[key] || 0) + 1;
  }

  const counts = Object.values(cellCounts);
  const r = counts[0];
  const expectedCells = p * o;

  if (counts.length !== expectedCells) {
    return { valid: false, errorKey: 'modules.msa-typ2.errUnbalanced' };
  }
  if (!counts.every(c => c === r)) {
    return { valid: false, errorKey: 'modules.msa-typ2.errUnbalanced' };
  }
  if (r < 2) {
    return { valid: false, errorKey: 'modules.msa-typ2.errTooFewReplicates', errorVars: { n: r } };
  }

  // Tolerance check
  if (!isNaN(options.lsl) && !isNaN(options.usl) && options.usl <= options.lsl) {
    return { valid: false, errorKey: 'modules.msa-typ2.errUslLeqLsl' };
  }

  return { valid: true, errorKey: null, errorVars: null, mode: 'typ2', p, o, r };
}

/**
 * Validate Typ-3 input (no operator column).
 * @param {{ parts: string[], measurements: number[] }} data
 * @param {{ lsl?: number, usl?: number }} options
 */
function validateTyp3(data, options = {}) {
  const { parts, measurements } = data;

  if (!parts || !measurements) {
    return { valid: false, errorKey: 'modules.msa-typ2.errDataMissing' };
  }

  const n = measurements.length;
  if (parts.length !== n) {
    return { valid: false, errorKey: 'modules.msa-typ2.errColumnLengthMismatch' };
  }
  if (n === 0) {
    return { valid: false, errorKey: 'modules.msa-typ2.errNoData' };
  }

  for (let i = 0; i < n; i++) {
    if (typeof measurements[i] !== 'number' || isNaN(measurements[i])) {
      return { valid: false, errorKey: 'modules.msa-typ2.errNonNumeric', errorVars: { row: i + 1 } };
    }
  }

  const partCounts = {};
  for (const pl of parts) partCounts[pl] = (partCounts[pl] || 0) + 1;
  const uniqueParts = Object.keys(partCounts);
  const p = uniqueParts.length;
  if (p < 2) {
    return { valid: false, errorKey: 'modules.msa-typ2.errTooFewParts', errorVars: { n: p } };
  }

  const counts = Object.values(partCounts);
  const r = counts[0];
  if (!counts.every(c => c === r)) {
    return { valid: false, errorKey: 'modules.msa-typ2.errUnbalanced' };
  }
  if (r < 2) {
    return { valid: false, errorKey: 'modules.msa-typ2.errTooFewReplicates', errorVars: { n: r } };
  }

  if (!isNaN(options.lsl) && !isNaN(options.usl) && options.usl <= options.lsl) {
    return { valid: false, errorKey: 'modules.msa-typ2.errUslLeqLsl' };
  }

  return { valid: true, errorKey: null, errorVars: null, mode: 'typ3', p, o: 0, r };
}

// ═══════════════════════════════════════════════════════════
//  MAIN ANALYSIS
// ═══════════════════════════════════════════════════════════

/**
 * Run the full ANOVA-based Gage R&R analysis. Routes to Typ 3 if no operators.
 * @param {{ parts: string[], operators?: string[]|null, measurements: number[] }} data
 * @param {{ alpha?: number, studyVarMultiplier?: number, lsl?: number, usl?: number }} options
 * @returns {object}
 */
export function analyze(data, options = {}) {
  if (isTyp3Data(data)) return analyzeTyp3(data, options);

  const alpha = options.alpha ?? 0.05;
  const k = options.studyVarMultiplier ?? 5.15;
  const tolerance = (!isNaN(options.lsl) && !isNaN(options.usl)) ? options.usl - options.lsl : null;

  const { parts, operators, measurements } = data;
  const n = measurements.length;

  const partLabels = [...new Set(parts)];
  const operatorLabels = [...new Set(operators)];
  const p = partLabels.length;
  const o = operatorLabels.length;

  // Build cell structure: cellData[partLabel][operatorLabel] = [values]
  const cellData = {};
  for (const pl of partLabels) {
    cellData[pl] = {};
    for (const ol of operatorLabels) cellData[pl][ol] = [];
  }
  for (let i = 0; i < n; i++) {
    cellData[parts[i]][operators[i]].push(measurements[i]);
  }
  const r = cellData[partLabels[0]][operatorLabels[0]].length;

  // Grand mean
  const grandMean = mean(measurements);

  // Part means, operator means, cell means
  const partMeans = {};
  for (const pl of partLabels) {
    const vals = [];
    for (const ol of operatorLabels) vals.push(...cellData[pl][ol]);
    partMeans[pl] = mean(vals);
  }

  const operatorMeans = {};
  for (const ol of operatorLabels) {
    const vals = [];
    for (const pl of partLabels) vals.push(...cellData[pl][ol]);
    operatorMeans[ol] = mean(vals);
  }

  const cellMeans = {};
  const cellRanges = {};
  for (const pl of partLabels) {
    cellMeans[pl] = {};
    cellRanges[pl] = {};
    for (const ol of operatorLabels) {
      const vals = cellData[pl][ol];
      cellMeans[pl][ol] = mean(vals);
      cellRanges[pl][ol] = Math.max(...vals) - Math.min(...vals);
    }
  }

  // ─── ANOVA Sum of Squares ──────────────────────────────

  // SS_Part = o * r * Σ (Y_i.. - Y_...)²
  let ssPart = 0;
  for (const pl of partLabels) ssPart += (partMeans[pl] - grandMean) ** 2;
  ssPart *= o * r;

  // SS_Operator = p * r * Σ (Y_.j. - Y_...)²
  let ssOperator = 0;
  for (const ol of operatorLabels) ssOperator += (operatorMeans[ol] - grandMean) ** 2;
  ssOperator *= p * r;

  // SS_Interaction = r * Σ_i Σ_j (Y_ij. - Y_i.. - Y_.j. + Y_...)²
  let ssInteract = 0;
  for (const pl of partLabels) {
    for (const ol of operatorLabels) {
      ssInteract += (cellMeans[pl][ol] - partMeans[pl] - operatorMeans[ol] + grandMean) ** 2;
    }
  }
  ssInteract *= r;

  // SS_Equipment = Σ_i Σ_j Σ_k (Y_ijk - Y_ij.)²
  let ssEquip = 0;
  for (const pl of partLabels) {
    for (const ol of operatorLabels) {
      const cm = cellMeans[pl][ol];
      for (const v of cellData[pl][ol]) ssEquip += (v - cm) ** 2;
    }
  }

  // SS_Total = Σ (Y_ijk - Y_...)²
  let ssTotal = 0;
  for (let i = 0; i < n; i++) ssTotal += (measurements[i] - grandMean) ** 2;

  // Degrees of freedom
  const dfPart = p - 1;
  const dfOperator = o - 1;
  const dfInteract = (p - 1) * (o - 1);
  const dfEquip = p * o * (r - 1);
  const dfTotal = n - 1;

  // Mean squares
  const msPart = ssPart / dfPart;
  const msOperator = ssOperator / dfOperator;
  const msInteract = ssInteract / dfInteract;
  const msEquip = ssEquip / dfEquip;

  // F-statistics and p-values (test against interaction term first)
  const fInteract = msInteract / msEquip;
  const pInteract = fDistPValue(fInteract, dfInteract, dfEquip);

  // When msInteract = msEquip = 0 (e.g. all-zero data), fInteract is NaN and
  // there is no evidence for interaction — follow the Minitab convention and pool.
  const interactionSignificant = !Number.isNaN(fInteract) && pInteract < alpha;
  const interactionPooled = !interactionSignificant;

  let anova;
  let sigma2Equip, sigma2Interact, sigma2Operator, sigma2Part;

  if (interactionPooled) {
    // Pool interaction with equipment
    const ssEquipPooled = ssEquip + ssInteract;
    const dfEquipPooled = dfEquip + dfInteract;
    const msEquipPooled = ssEquipPooled / dfEquipPooled;

    const fPart = msPart / msEquipPooled;
    const pPart = fDistPValue(fPart, dfPart, dfEquipPooled);
    const fOperator = msOperator / msEquipPooled;
    const pOperator = fDistPValue(fOperator, dfOperator, dfEquipPooled);

    anova = {
      part: { ss: ssPart, df: dfPart, ms: msPart, f: fPart, pValue: pPart },
      operator: { ss: ssOperator, df: dfOperator, ms: msOperator, f: fOperator, pValue: pOperator },
      interact: null, // pooled
      equip: { ss: ssEquipPooled, df: dfEquipPooled, ms: msEquipPooled },
      total: { ss: ssTotal, df: dfTotal },
    };

    sigma2Equip = msEquipPooled;
    sigma2Interact = 0;
    sigma2Operator = Math.max(0, (msOperator - msEquipPooled) / (p * r));
    sigma2Part = Math.max(0, (msPart - msEquipPooled) / (o * r));
  } else {
    // Interaction significant — keep separate
    const fPart = msPart / msInteract;
    const pPart = fDistPValue(fPart, dfPart, dfInteract);
    const fOperator = msOperator / msInteract;
    const pOperator = fDistPValue(fOperator, dfOperator, dfInteract);

    anova = {
      part: { ss: ssPart, df: dfPart, ms: msPart, f: fPart, pValue: pPart },
      operator: { ss: ssOperator, df: dfOperator, ms: msOperator, f: fOperator, pValue: pOperator },
      interact: { ss: ssInteract, df: dfInteract, ms: msInteract, f: fInteract, pValue: pInteract },
      equip: { ss: ssEquip, df: dfEquip, ms: msEquip },
      total: { ss: ssTotal, df: dfTotal },
    };

    sigma2Equip = msEquip;
    sigma2Interact = Math.max(0, (msInteract - msEquip) / r);
    sigma2Operator = Math.max(0, (msOperator - msInteract) / (p * r));
    sigma2Part = Math.max(0, (msPart - msInteract) / (o * r));
  }

  // ─── Derived Metrics ───────────────────────────────────

  const sigma2Repeat = sigma2Equip;
  const sigma2Reprod = sigma2Operator + sigma2Interact;
  const sigma2GRR = sigma2Repeat + sigma2Reprod;
  const sigma2Total = sigma2GRR + sigma2Part;

  const sigmaRepeat = Math.sqrt(sigma2Repeat);
  const sigmaReprod = Math.sqrt(sigma2Reprod);
  const sigmaOperator = Math.sqrt(sigma2Operator);
  const sigmaInteract = Math.sqrt(sigma2Interact);
  const sigmaGRR = Math.sqrt(sigma2GRR);
  const sigmaPart = Math.sqrt(sigma2Part);
  const sigmaTotal = Math.sqrt(sigma2Total);

  // Build variance component entries
  function buildVC(variance, sigma) {
    const studyVar = k * sigma;
    const pctContribution = sigma2Total > 0 ? (variance / sigma2Total) * 100 : 0;
    const pctStudyVar = sigmaTotal > 0 ? (sigma / sigmaTotal) * 100 : 0;
    const pctTolerance = tolerance ? (studyVar / tolerance) * 100 : null;
    return { variance, sigma, studyVar, pctContribution, pctStudyVar, pctTolerance };
  }

  const varComp = {
    repeatability: buildVC(sigma2Repeat, sigmaRepeat),
    reproducibility: buildVC(sigma2Reprod, sigmaReprod),
    operator: buildVC(sigma2Operator, sigmaOperator),
    interact: buildVC(sigma2Interact, sigmaInteract),
    grr: buildVC(sigma2GRR, sigmaGRR),
    part: buildVC(sigma2Part, sigmaPart),
    total: buildVC(sigma2Total, sigmaTotal),
  };

  // ndc
  const ndc = sigmaGRR > 0 ? Math.floor(1.41 * sigmaPart / sigmaGRR) : (sigmaPart > 0 ? 999 : 0);

  // Status
  const pctGRR = varComp.grr.pctStudyVar;
  const grrStatus = pctGRR < 10 ? 'pass' : pctGRR < 30 ? 'warn' : 'fail';
  const ndcStatus = ndc >= 5 ? 'pass' : 'fail';

  // Control chart limits
  const allRanges = [];
  for (const pl of partLabels) {
    for (const ol of operatorLabels) allRanges.push(cellRanges[pl][ol]);
  }
  const rBar = mean(allRanges);
  const cc = getControlConstants(r);
  const xbarCL = grandMean;
  const xbarUCL = xbarCL + cc.A2 * rBar;
  const xbarLCL = xbarCL - cc.A2 * rBar;
  const rCL = rBar;
  const rUCL = cc.D4 * rBar;
  const rLCL = cc.D3 * rBar;

  return {
    mode: 'typ2',
    n, p, o, r,
    partLabels, operatorLabels,
    grandMean,
    anova,
    interactionSignificant,
    interactionPooled,
    alpha,
    varComp,
    ndc,
    grrStatus,
    ndcStatus,
    cellData,
    cellMeans,
    cellRanges,
    partMeans,
    operatorMeans,
    controlChart: { xbarCL, xbarUCL, xbarLCL, rCL, rUCL, rLCL, rBar, A2: cc.A2, D3: cc.D3, D4: cc.D4 },
    params: { alpha, studyVarMultiplier: k, tolerance, lsl: options.lsl, usl: options.usl },
    warnings: [],
  };
}

// ═══════════════════════════════════════════════════════════
//  TYP-3 ANALYSIS (no operator — one-way random effects)
// ═══════════════════════════════════════════════════════════

/**
 * Run one-way random-effects ANOVA (parts only, no operator column).
 * Used for automated measurement systems where operator influence is absent.
 * @param {{ parts: string[], measurements: number[] }} data
 * @param {{ alpha?: number, studyVarMultiplier?: number, lsl?: number, usl?: number }} options
 * @returns {object}
 */
function analyzeTyp3(data, options = {}) {
  const alpha = options.alpha ?? 0.05;
  const k = options.studyVarMultiplier ?? 5.15;
  const tolerance = (!isNaN(options.lsl) && !isNaN(options.usl)) ? options.usl - options.lsl : null;

  const { parts, measurements } = data;
  const n = measurements.length;

  const partLabels = [...new Set(parts)];
  const p = partLabels.length;

  // Group measurements by part
  const cellData = {};
  for (const pl of partLabels) cellData[pl] = [];
  for (let i = 0; i < n; i++) cellData[parts[i]].push(measurements[i]);
  const r = cellData[partLabels[0]].length;

  // Means & per-part ranges
  const grandMean = mean(measurements);
  const partMeans = {};
  const cellMeans = {};
  const cellRanges = {};
  for (const pl of partLabels) {
    const vals = cellData[pl];
    const m = mean(vals);
    partMeans[pl] = m;
    cellMeans[pl] = m;
    cellRanges[pl] = Math.max(...vals) - Math.min(...vals);
  }

  // ─── ANOVA (one-way) ───────────────────────────────────
  let ssPart = 0;
  for (const pl of partLabels) ssPart += (partMeans[pl] - grandMean) ** 2;
  ssPart *= r;

  let ssEquip = 0;
  for (const pl of partLabels) {
    const pm = partMeans[pl];
    for (const v of cellData[pl]) ssEquip += (v - pm) ** 2;
  }

  let ssTotal = 0;
  for (let i = 0; i < n; i++) ssTotal += (measurements[i] - grandMean) ** 2;

  const dfPart = p - 1;
  const dfEquip = p * (r - 1);
  const dfTotal = n - 1;
  const msPart = ssPart / dfPart;
  const msEquip = ssEquip / dfEquip;

  const fPart = msEquip > 0 ? msPart / msEquip : NaN;
  const pPart = Number.isFinite(fPart) ? fDistPValue(fPart, dfPart, dfEquip) : NaN;

  const anova = {
    part: { ss: ssPart, df: dfPart, ms: msPart, f: fPart, pValue: pPart },
    operator: null,
    interact: null,
    equip: { ss: ssEquip, df: dfEquip, ms: msEquip },
    total: { ss: ssTotal, df: dfTotal },
  };

  // ─── Variance components ──────────────────────────────
  const sigma2Repeat = msEquip;
  const sigma2Part = Math.max(0, (msPart - msEquip) / r);
  const sigma2GRR = sigma2Repeat;
  const sigma2Total = sigma2GRR + sigma2Part;

  const sigmaRepeat = Math.sqrt(sigma2Repeat);
  const sigmaGRR = Math.sqrt(sigma2GRR);
  const sigmaPart = Math.sqrt(sigma2Part);
  const sigmaTotal = Math.sqrt(sigma2Total);

  function buildVC(variance, sigma) {
    const studyVar = k * sigma;
    const pctContribution = sigma2Total > 0 ? (variance / sigma2Total) * 100 : 0;
    const pctStudyVar = sigmaTotal > 0 ? (sigma / sigmaTotal) * 100 : 0;
    const pctTolerance = tolerance ? (studyVar / tolerance) * 100 : null;
    return { variance, sigma, studyVar, pctContribution, pctStudyVar, pctTolerance };
  }

  const zeroVC = {
    variance: 0, sigma: 0, studyVar: 0,
    pctContribution: 0, pctStudyVar: 0,
    pctTolerance: tolerance ? 0 : null,
  };
  const varComp = {
    repeatability: buildVC(sigma2Repeat, sigmaRepeat),
    reproducibility: { ...zeroVC },
    operator: { ...zeroVC },
    interact: { ...zeroVC },
    grr: buildVC(sigma2GRR, sigmaGRR),
    part: buildVC(sigma2Part, sigmaPart),
    total: buildVC(sigma2Total, sigmaTotal),
  };

  const ndc = sigmaGRR > 0 ? Math.floor(1.41 * sigmaPart / sigmaGRR) : (sigmaPart > 0 ? 999 : 0);
  const pctGRR = varComp.grr.pctStudyVar;
  const grrStatus = pctGRR < 10 ? 'pass' : pctGRR < 30 ? 'warn' : 'fail';
  const ndcStatus = ndc >= 5 ? 'pass' : 'fail';

  // ─── Control chart (subgroups = parts, size r) ────────
  const allRanges = partLabels.map(pl => cellRanges[pl]);
  const rBar = mean(allRanges);
  const cc = getControlConstants(r);
  const xbarCL = grandMean;
  const xbarUCL = xbarCL + cc.A2 * rBar;
  const xbarLCL = xbarCL - cc.A2 * rBar;
  const rCL = rBar;
  const rUCL = cc.D4 * rBar;
  const rLCL = cc.D3 * rBar;

  // ─── Warnings ─────────────────────────────────────────
  const warnings = [];
  if (r === 2) warnings.push('warnFewReplicatesTyp3');

  return {
    mode: 'typ3',
    n, p, o: 0, r,
    partLabels, operatorLabels: [],
    grandMean,
    anova,
    interactionSignificant: false,
    interactionPooled: false,
    alpha,
    varComp,
    ndc,
    grrStatus,
    ndcStatus,
    cellData,
    cellMeans,
    cellRanges,
    partMeans,
    operatorMeans: {},
    controlChart: { xbarCL, xbarUCL, xbarLCL, rCL, rUCL, rLCL, rBar, A2: cc.A2, D3: cc.D3, D4: cc.D4 },
    params: { alpha, studyVarMultiplier: k, tolerance, lsl: options.lsl, usl: options.usl },
    warnings,
  };
}

// ═══════════════════════════════════════════════════════════
//  EXAMPLE DATA GENERATOR
// ═══════════════════════════════════════════════════════════

/**
 * Generate example Gage R&R data.
 * 10 parts, 3 operators (A/B/C), 2 replicates = 60 rows.
 * Operator B has slight positive bias. Produces %GRR ~ 15-25%.
 * @returns {{ parts: string[], operators: string[], measurements: number[], params: object }}
 */
export function generateExampleData() {
  const partTrueValues = [25.00, 25.02, 24.98, 25.04, 24.96, 25.01, 25.03, 24.99, 25.05, 24.97];
  const operatorBias = { A: 0, B: 0.003, C: -0.001 };
  const operatorLabels = ['A', 'B', 'C'];
  const r = 2;
  const sigma = 0.006; // within-operator repeatability

  const parts = [];
  const operators = [];
  const measurements = [];

  // Simple seeded pseudo-random for reproducibility
  let seed = 42;
  function rand() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  }
  function randn() {
    const u1 = rand() || 0.0001;
    const u2 = rand();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  for (let pi = 0; pi < partTrueValues.length; pi++) {
    for (const op of operatorLabels) {
      for (let rep = 0; rep < r; rep++) {
        parts.push(String(pi + 1));
        operators.push(op);
        const v = partTrueValues[pi] + operatorBias[op] + randn() * sigma;
        measurements.push(parseFloat(v.toFixed(4)));
      }
    }
  }

  return {
    parts,
    operators,
    measurements,
    params: {
      lsl: 24.90,
      usl: 25.10,
      alpha: 0.05,
      studyVarMultiplier: 5.15,
    },
  };
}
