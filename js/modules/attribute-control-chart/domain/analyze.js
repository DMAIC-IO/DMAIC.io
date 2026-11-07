/**
 * D.Mike — Attributive Regelkarte: Rechnung.
 *
 * Rein: vom Model und einem Spaltenleser zu Grenzen, Verletzungen und der
 * Lesefläche als Zahlen. Kein DOM, keine Texte.
 */

import { getAttributeChartType, evaluateAttributeRules } from '../../../engines/attribute-control-chart-engine.js';
import { finiteOrNull, zipPoints } from '../../../core/agent/agent-results.js';

/** Raw column → numbers, everything else null (keeps positions for pairing). */
function numericColumn(readColumn, ref) {
  return readColumn(ref).map(v => (typeof v === 'number' && !isNaN(v)) ? v : null);
}

/**
 * Run the attribute control chart analysis for a model state.
 * @param {{ chartTypeId: string, defectsRef: object|null, sizeRef: object|null, constantN: number, baselineCount: number|null, enabledRules: readonly number[] }} state
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

/**
 * Eindeutige Paare (Punkt, Regel), nach Punkt sortiert.
 * @param {{ index: number, ruleId: number }[]} violations
 * @returns {{ index: number, ruleId: number }[]}
 */
export function uniqueViolations(violations) {
  const seen = new Set();
  const out = [];
  for (const v of violations) {
    const k = `${v.index}-${v.ruleId}`;
    if (!seen.has(k)) { seen.add(k); out.push({ index: v.index, ruleId: v.ruleId }); }
  }
  return out.sort((a, b) => a.index - b.index);
}

/**
 * Die verletzenden Punkte: Indizes ohne Doppelte, aufsteigend.
 * @param {{ index: number }[]} violations rohe oder entdoppelte Verletzungen
 * @returns {number[]}
 */
export function signalIndices(violations) {
  return [...new Set(violations.map((v) => v.index))].sort((a, b) => a - b);
}

/**
 * Ende der Basisphase im Diagramm: `baselineCount`, solange es kleiner als
 * die Punktzahl ist, sonst `null` (keine Basisphase markieren).
 * @param {number|null|undefined} baselineCount
 * @param {number} length Zahl der gezeichneten Punkte
 * @returns {number|null}
 */
export function baselineEndOf(baselineCount, length) {
  return baselineCount && baselineCount < length ? baselineCount : null;
}

/** Einzelwert oder `null`, wenn die Größe je Punkt wechselt. */
const scalar = (v) => (Array.isArray(v) ? null : finiteOrNull(v));

/**
 * Das Ergebnis als Zahlen: Kartentyp, Größe, verwertete Punkte, Grenzen
 * (`null`, wenn sie je Punkt wechseln), Verletzungen und verletzende Punkte.
 * @param {ReturnType<typeof analyzeState>} analysis
 * @param {string} chartTypeId
 * @returns {{ chartType: string, statistic: string, valid: number, cl: number|null, ucl: number|null,
 *   lcl: number|null, sigma: number|null, variableLimits: boolean,
 *   violations: { index: number, ruleId: number }[], signals: number[] }|null}
 */
export function resultOf(analysis, chartTypeId) {
  if (!analysis?.result) return null;
  const r = analysis.result;
  const violations = uniqueViolations(analysis.violations);
  return {
    chartType: chartTypeId,
    statistic: r.statistic,
    valid: analysis.valid,
    cl: finiteOrNull(r.cl),
    ucl: scalar(r.ucl),
    lcl: scalar(r.lcl),
    sigma: scalar(r.sigma),
    variableLimits: Boolean(r.variableLimits),
    violations,
    signals: signalIndices(violations),
  };
}

/**
 * Je gezeichnetem Punkt eine Zeile `{ value, n, ucl, lcl, signal }`.
 * @param {ReturnType<typeof analyzeState>} analysis
 * @returns {object[]}
 */
export function pointsOf(analysis) {
  if (!analysis?.result) return [];
  const r = analysis.result;
  return zipPoints({ value: r.values, n: analysis.n, ucl: r.ucl, lcl: r.lcl },
    { signal: signalIndices(analysis.violations) }).rows;
}
