/**
 * D.Mike — Data Transformation Model (data-transformation-model.js)
 *
 * Pure state container + pure transform math for the Data Transformation module.
 * Holds the currently selected transform type, the referenced worksheet column
 * and the id of any worksheet provisioned by an example load. The actual
 * transformed series, charts and stats are derived transiently in the view.
 *
 * Transform math (applyTransform, optimizeBoxCox, optimizeYeoJohnson) and the
 * TRANSFORMS table live here as pure functions — no DOM, no i18n, no view logic.
 */

import { andersonDarling } from '../../engines/normality-test-engine.js';

// ═══════════════════════════════════════════════════════════════
// Transform definitions
// ═══════════════════════════════════════════════════════════════

export const TRANSFORMS = [
  {
    id: 'boxcox', nameKey: 'tfBoxCox', descKey: 'tfBoxCoxDesc',
    params: [{ key: 'lambda', labelKey: 'paramLambda', val: 0, min: -5, max: 5, step: 0.1 }],
  },
  {
    id: 'yeojohnson', nameKey: 'tfYeoJohnson', descKey: 'tfYeoJohnsonDesc',
    params: [{ key: 'lambda', labelKey: 'paramLambda', val: 1, min: -5, max: 5, step: 0.1 }],
  },
  {
    id: 'johnson_su', nameKey: 'tfJohnsonSU', descKey: 'tfJohnsonSUDesc',
    params: [
      { key: 'gamma', labelKey: 'paramGamma', val: 0, min: -5, max: 5, step: 0.1 },
      { key: 'delta', labelKey: 'paramDelta', val: 1, min: 0.1, max: 10, step: 0.1 },
      { key: 'xi', labelKey: 'paramXi', val: 0, min: -100, max: 100, step: 0.5 },
      { key: 'lambdaJ', labelKey: 'paramLambdaJ', val: 1, min: 0.1, max: 100, step: 0.5 },
    ],
  },
  {
    id: 'johnson_sb', nameKey: 'tfJohnsonSB', descKey: 'tfJohnsonSBDesc',
    params: [
      { key: 'gamma', labelKey: 'paramGamma', val: 0, min: -5, max: 5, step: 0.1 },
      { key: 'delta', labelKey: 'paramDelta', val: 1, min: 0.1, max: 10, step: 0.1 },
      { key: 'xi', labelKey: 'paramXi', val: 0, min: -100, max: 100, step: 0.5 },
      { key: 'lambdaJ', labelKey: 'paramLambdaJ', val: 1, min: 0.1, max: 100, step: 0.5 },
    ],
  },
  { id: 'log', nameKey: 'tfLog', descKey: 'tfLogDesc', params: [] },
  { id: 'log10', nameKey: 'tfLog10', descKey: 'tfLog10Desc', params: [] },
  { id: 'sqrt', nameKey: 'tfSqrt', descKey: 'tfSqrtDesc', params: [] },
  { id: 'inverse', nameKey: 'tfInverse', descKey: 'tfInverseDesc', params: [] },
  { id: 'square', nameKey: 'tfSquare', descKey: 'tfSquareDesc', params: [] },
];

const TRANSFORM_IDS = TRANSFORMS.map(t => t.id);

// ═══════════════════════════════════════════════════════════════
// Transform functions (pure)
// ═══════════════════════════════════════════════════════════════

/**
 * Apply a transform to a numeric series.
 * @param {number[]} data
 * @param {string} tfId
 * @param {function(string):number} paramFn — (key) => number
 * @returns {number[]}
 */
export function applyTransform(data, tfId, paramFn) {
  const lam = paramFn('lambda');
  switch (tfId) {
    case 'boxcox':
      if (data.some(x => x <= 0)) throw new Error('errBoxCoxPositive');
      return data.map(x => Math.abs(lam) < 1e-8 ? Math.log(x) : (Math.pow(x, lam) - 1) / lam);
    case 'yeojohnson':
      return data.map(x => {
        if (x >= 0) return Math.abs(lam) < 1e-8 ? Math.log(x + 1) : (Math.pow(x + 1, lam) - 1) / lam;
        return Math.abs(lam - 2) < 1e-8 ? -Math.log(-x + 1) : -(Math.pow(-x + 1, 2 - lam) - 1) / (2 - lam);
      });
    case 'johnson_su': {
      const g = paramFn('gamma'), d = paramFn('delta'), xi = paramFn('xi'), la = paramFn('lambdaJ');
      return data.map(x => g + d * Math.asinh((x - xi) / la));
    }
    case 'johnson_sb': {
      const g = paramFn('gamma'), d = paramFn('delta'), xi = paramFn('xi'), la = paramFn('lambdaJ');
      return data.map(x => {
        const z = (x - xi) / la;
        if (z <= 0 || z >= 1) throw new Error('errJohnsonSBRange');
        return g + d * Math.log(z / (1 - z));
      });
    }
    case 'log':
      if (data.some(x => x <= 0)) throw new Error('errLogPositive');
      return data.map(x => Math.log(x));
    case 'log10':
      if (data.some(x => x <= 0)) throw new Error('errLog10Positive');
      return data.map(x => Math.log10(x));
    case 'sqrt':
      if (data.some(x => x < 0)) throw new Error('errSqrtNonNeg');
      return data.map(x => Math.sqrt(x));
    case 'inverse':
      if (data.some(x => x === 0)) throw new Error('errInverseZero');
      return data.map(x => 1 / x);
    case 'square':
      return data.map(x => x * x);
    default:
      throw new Error('Unknown transform');
  }
}

/** Optimize Box-Cox λ via grid search on Anderson-Darling statistic. */
export function optimizeBoxCox(data) {
  if (data.some(x => x <= 0)) return 1;
  let bestLam = 1, bestAD = Infinity;
  for (let l = -3; l <= 3; l += 0.05) {
    const t = data.map(x => Math.abs(l) < 1e-8 ? Math.log(x) : (Math.pow(x, l) - 1) / l);
    try {
      const ad = andersonDarling(t);
      if (ad.statisticAdj < bestAD) { bestAD = ad.statisticAdj; bestLam = l; }
    } catch { /* skip invalid */ }
  }
  return Math.round(bestLam * 100) / 100;
}

/** Optimize Yeo-Johnson λ via grid search on Anderson-Darling statistic. */
export function optimizeYeoJohnson(data) {
  let bestLam = 1, bestAD = Infinity;
  for (let l = -3; l <= 3; l += 0.05) {
    const t = data.map(x => {
      if (x >= 0) return Math.abs(l) < 1e-8 ? Math.log(x + 1) : (Math.pow(x + 1, l) - 1) / l;
      return Math.abs(l - 2) < 1e-8 ? -Math.log(-x + 1) : -(Math.pow(-x + 1, 2 - l) - 1) / (2 - l);
    });
    try {
      const ad = andersonDarling(t);
      if (ad.statisticAdj < bestAD) { bestAD = ad.statisticAdj; bestLam = l; }
    } catch { /* skip invalid */ }
  }
  return Math.round(bestLam * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════

/** @param {*} d @returns {{instanceId:string,sheetId:string,columnId:string}|null} */
function columnRefFromJSON(d) {
  if (!d || typeof d !== 'object') return null;
  if (d.instanceId == null || d.sheetId == null || d.columnId == null) return null;
  return {
    instanceId: String(d.instanceId),
    sheetId: String(d.sheetId),
    columnId: String(d.columnId),
  };
}

export class State {
  /** Currently selected transform id. */
  currentTF = 'boxcox';

  /** Referenced source worksheet column, or null. */
  columnRef = null;

  /** Instance id of a worksheet provisioned by loadExample (for cleanup on re-load). */
  exampleWorksheetId = null;

  /** @returns {boolean} true if any meaningful field is set (drives confirmPopout). */
  hasContent() {
    return Boolean(this.columnRef);
  }

  toJSON() {
    return {
      currentTF: this.currentTF,
      columnRef: this.columnRef ? { ...this.columnRef } : null,
      exampleWorksheetId: this.exampleWorksheetId,
    };
  }

  /**
   * Deserialize and validate. Always returns a valid State even for
   * null/undefined/malformed input.
   * @param {*} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;
    s.currentTF = TRANSFORM_IDS.includes(d.currentTF) ? d.currentTF : 'boxcox';
    s.columnRef = columnRefFromJSON(d.columnRef);
    s.exampleWorksheetId = typeof d.exampleWorksheetId === 'string' ? d.exampleWorksheetId : null;
    return s;
  }
}
