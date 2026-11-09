/**
 * D.Mike — Multi-Vari: Rechnung (domain/analysis.js)
 *
 * The seam between the two engines the module consumes: `computeMultiVari`
 * (js/engines/multi-vari-engine.js) groups the rows for the chart,
 * `computeVarianceComponents` (js/engines/variance-components-engine.js)
 * decomposes their variance. DOM-free, so it stays testable without an
 * Alpine/DOM environment, and so the two cross-engine rules below have
 * exactly one place to be correct:
 *
 *  - The decomposition MUST see exactly the rows the chart draws. Handed the
 *    module's raw column arrays, it would run over rows `computeMultiVari`
 *    already dropped (`droppedRows`: an empty factor level, a non-numeric
 *    measurement) — silently describing data the picture never shows, or
 *    tripping over a stray NaN. This function only ever reads
 *    `g.cleaned.response` / `g.cleaned.factorValues`; there is no raw-array
 *    parameter to reach for by mistake.
 *  - Both engines can warn independently (either can flag `unbalanced`; only
 *    the decomposition can flag e.g. `notConverged`), so the module's
 *    warning list is the deduplicated UNION of both — never just one
 *    engine's list, or a non-converged REML fit goes unreported.
 */

import { computeMultiVari } from '../../../engines/multi-vari-engine.js';
import { computeVarianceComponents } from '../../../engines/variance-components-engine.js';

/**
 * Run the variance decomposition on `computeMultiVari`'s cleaned rows and
 * assemble the module's `result` for the template.
 *
 * The decomposition is allowed to fail (a singular model, REML without
 * convergence) without taking the chart down with it — the picture stands on
 * its own; a failure is reported via `vcError` and `result.vc` stays null.
 *
 * @param {ReturnType<typeof import('../../../engines/multi-vari-engine.js').computeMultiVari>} g
 * @param {{factorNames: string[], modelForm: 'nested'|'crossed', estimator: 'anova'|'reml'}} opts
 * @returns {{result: object, vcError: Error|null}}
 */
export function runVarianceDecomposition(g, { factorNames, modelForm, estimator }) {
  let vc = null;
  let vcError = null;
  try {
    vc = computeVarianceComponents({
      response: g.cleaned.response,
      factorValues: g.cleaned.factorValues,
      factorNames,
      modelForm,
      estimator,
    });
  } catch (err) {
    vcError = err instanceof Error ? err : new Error(String(err));
  }

  const result = {
    strips: g.strips.map((s, idx) => ({ idx, rowLevel: s.rowLevel, panels: s.panels })),
    seriesLevels: g.seriesLevels,
    factorNames,
    grandMean: g.grandMean,
    n: g.n,
    droppedRows: g.droppedRows,
    // Union, deduplicated — `unbalanced` is the one code both engines can
    // raise independently; a Set collapses it to a single entry.
    warnings: [...new Set([...g.warnings, ...(vc?.warnings || [])])],
    yMin: g.yMin,
    yMax: g.yMax,
    balanced: g.balanced,
    panelCount: g.panelCount,
    // Size limits travel with the result: `limits` carries the offending
    // column per exceeded limit so the warning can name it, `renderable`
    // gates the chart itself (past a limit nothing is drawn).
    limits: g.limits || [],
    renderable: g.renderable !== false,
    vc,
  };

  return { result, vcError };
}

// ─── Variance-components table helpers ────────────────────────────────────
//
// Pure derivation logic behind the table in the view. The viewmodel
// (viewmodel/present.js) only adds the translations.

/**
 * Rows for the variance-components table, Error row included — `[]` when the
 * decomposition failed (`result.vc === null`) or there is no result yet.
 * @param {{vc?: object|null}|null} result
 * @returns {Array<object>}
 */
export function vcTermRows(result) {
  return result?.vc?.terms || [];
}

/**
 * Honesty-rule gate: an unbalanced design makes the variance
 * components estimator-dependent, and that must show under the table.
 * @param {{balanced?: boolean}|null} result
 * @returns {boolean}
 */
export function isUnbalanced(result) {
  return Boolean(result) && result.balanced === false;
}

/**
 * Whether any row's variance estimate was clamped to 0 (a negative REML
 * estimate) — gates the clamped-note paragraph.
 * @param {Array<{clamped?: boolean}>} terms
 * @returns {boolean}
 */
export function hasClampedTerm(terms) {
  return terms.some((t) => t.clamped);
}

/**
 * The term with the largest variance share, Error row included. Ties keep
 * the first-seen term, so the pick does not depend on the engines' internal
 * term ordering.
 * @param {Array<{percent: number}>} [terms]
 * @returns {object|null}
 */
export function pickLargestTerm(terms) {
  if (!terms || !terms.length) return null;
  return terms.reduce((best, t) => (t.percent > best.percent ? t : best), terms[0]);
}

/**
 * Which i18n key reads the interpretation sentence for a given (largest)
 * term — the Error row gets its own honest phrasing: when repeat variation
 * dominates, the chosen factors explain none of the spread.
 * @param {{id: string}} term
 * @returns {string}
 */
export function interpretationKey(term) {
  return term.id === 'Error' ? 'interpretationError' : 'interpretation';
}

/**
 * Integer or en dash — the REML path reports no degrees of freedom, and the
 * table must show that as "–", never "null" or "NaN".
 * @param {number} v
 * @returns {string}
 */
export function intOrDash(v) {
  return Number.isFinite(v) ? String(v) : '–';
}

/**
 * Standard deviation of the total row (√totalVariance). Pulled out of the
 * template on purpose: Alpine's CSP evaluator resolves a bare identifier
 * only against the component scope (magics plus data), and `Math` is not in
 * it — `Math.sqrt(…)` in a template throws "Undefined variable: Math"
 * (vendor/alpinejs/csp.js, Identifier case). Globals reached through the
 * scope are barred on top of that by checkForDangerousValues().
 * @param {{totalVariance: number}|null|undefined} vc
 * @returns {number} NaN when totalVariance is missing or non-finite.
 */
export function totalSdValue(vc) {
  return vc && Number.isFinite(vc.totalVariance) ? Math.sqrt(vc.totalVariance) : NaN;
}

/**
 * Sum of the terms' variance shares — the total row's percentage.
 *
 * Not the constant 100: the shares are computed per term and rounded for
 * display, and a clamped (zero) component or a REML fit that stopped on the
 * boundary can leave the column summing to something else. Printing a
 * hardcoded 100 under a column that visibly adds up to 97.4 would make the
 * table lie about its own numbers.
 * @param {{terms?: Array<{percent: number}>}|null|undefined} vc
 * @returns {number} NaN when there are no terms.
 */
export function totalPercentValue(vc) {
  const terms = vc?.terms;
  if (!terms || !terms.length) return NaN;
  let sum = 0;
  for (const t of terms) sum += Number.isFinite(t.percent) ? t.percent : 0;
  return sum;
}

/**
 * Reine Rechnung des Moduls: gruppiert die belegten Zeilen für das Diagramm
 * und zerlegt ihre Varianz. Fehler kommen als Schlüssel zurück, nie als
 * Ausnahme: `errNeedFactors` (weniger als zwei Faktoren), `errNoData` (keine
 * verwertbare Zeile), `errCompute` (Engine wirft; bei gescheiterter Zerlegung
 * bleibt das Ergebnis mit `vc: null` erhalten).
 *
 * @param {{measurement: {values: any[], name: string}|null,
 *          factors: Array<{values: any[], name: string}>,
 *          modelForm: 'nested'|'crossed', estimator: 'anova'|'reml'}} input
 * @returns {{result: object|null, error: 'errNeedFactors'|'errNoData'|'errCompute'|null, message?: string}}
 */
export function analyze({ measurement, factors, modelForm, estimator }) {
  if (!measurement) return { result: null, error: null };
  if (factors.length < 2) return { result: null, error: 'errNeedFactors' };

  let g;
  try {
    g = computeMultiVari({ measurements: measurement.values, factors, modelForm });
  } catch (err) {
    return { result: null, error: 'errCompute', message: String(err.message || err) };
  }
  if (g.n === 0) return { result: null, error: 'errNoData' };

  const { result, vcError } = runVarianceDecomposition(g, {
    factorNames: factors.map((f) => f.name), modelForm, estimator,
  });
  if (!Number.isFinite(result.grandMean)) result.grandMean = null;
  if (vcError) return { result, error: 'errCompute', message: String(vcError.message || vcError) };
  return { result, error: null };
}
