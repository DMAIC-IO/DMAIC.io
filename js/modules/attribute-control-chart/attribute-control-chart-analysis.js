/**
 * D.Mike — Attribute control chart shared analysis (attribute-control-chart-analysis.js)
 *
 * Pure: from a model State and a column reader to the chart result and its
 * rule violations. Used by the module view and the dashboard tile. No DOM.
 */

import { getAttributeChartType, evaluateAttributeRules } from '../../engines/attribute-control-chart-engine.js';

/** Raw column → numbers, everything else null (keeps positions for pairing). */
function numericColumn(readColumn, ref) {
  return readColumn(ref).map(v => (typeof v === 'number' && !isNaN(v)) ? v : null);
}

/**
 * Run the attribute control chart analysis for a model state.
 * @param {import('./attribute-control-chart-model.js').State} state
 * @param {(ref: object) => any[]} readColumn - raw worksheet column values
 * @returns {{ result: object, ct: object, violations: Array<{index: number}>, n: number[]|number|null, valid: number }|null}
 *   null without a defects column, without a size column (p, u), with fewer
 *   than two usable points or when the computation throws (logged)
 */
export function analyzeState(state, readColumn) {
  if (!state.defectsRef) return null;
  const ct = getAttributeChartType(state.chartTypeId);
  if (!ct) return null;

  const defectsRaw = numericColumn(readColumn, state.defectsRef);
  const typeId = state.chartTypeId;
  const baselineEnd = state.baselineCount;

  let result, n, valid;
  try {
    if (typeId === 'p' || typeId === 'u') {
      if (!state.sizeRef) return null;
      const sizesRaw = numericColumn(readColumn, state.sizeRef);
      const pairs = [];
      const len = Math.min(defectsRaw.length, sizesRaw.length);
      for (let i = 0; i < len; i++) {
        if (defectsRaw[i] != null && sizesRaw[i] != null && sizesRaw[i] > 0) pairs.push([defectsRaw[i], sizesRaw[i]]);
      }
      if (pairs.length < 2) return null;
      const defects = pairs.map(p => p[0]);
      const sizes = pairs.map(p => p[1]);
      result = ct.compute({ defects, n: sizes, baselineEnd });
      n = sizes;
      valid = pairs.length;
    } else if (typeId === 'np') {
      const defects = defectsRaw.filter(v => v != null);
      if (defects.length < 2) return null;
      result = ct.compute({ defects, n: state.constantN, baselineEnd });
      n = result.n;
      valid = defects.length;
    } else { // c
      const defects = defectsRaw.filter(v => v != null);
      if (defects.length < 2) return null;
      result = ct.compute({ defects, baselineEnd });
      n = null;
      valid = defects.length;
    }
  } catch (err) {
    console.error('attribute-control-chart compute error', err);
    return null;
  }

  const violations = evaluateAttributeRules(
    result.values, result.cl, result.ucl, result.lcl, result.sigma, state.enabledRules,
  );
  return { result, ct, violations, n, valid };
}
