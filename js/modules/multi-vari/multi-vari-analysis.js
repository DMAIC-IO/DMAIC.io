/**
 * D.Mike — Multi-Vari Analysis Assembly (multi-vari-analysis.js)
 *
 * The seam between the two engines the module consumes: `computeMultiVari`
 * (js/engines/multi-vari-engine.js) groups the rows for the chart,
 * `computeVarianceComponents` (js/engines/variance-components-engine.js)
 * decomposes their variance. Kept in its own DOM-free file — unlike the rest
 * of the module's wiring, which lives inline in multi-vari.js's `data()` —
 * so it stays testable without an Alpine/DOM environment, and so the two
 * cross-engine rules below have exactly one place to be correct:
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
 *
 * See docs/superpowers/specs/2026-08-31-multi-vari-design.md.
 */

import { computeVarianceComponents } from '../../engines/variance-components-engine.js';

/**
 * Run the variance decomposition on `computeMultiVari`'s cleaned rows and
 * assemble the module's `result` for the template.
 *
 * The decomposition is allowed to fail (a singular model, REML without
 * convergence) without taking the chart down with it — the picture stands on
 * its own; a failure is reported via `vcError` and `result.vc` stays null.
 *
 * @param {ReturnType<typeof import('../../engines/multi-vari-engine.js').computeMultiVari>} g
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
    vc,
  };

  return { result, vcError };
}

// ─── Task 18: variance-components table view helpers ──────────────────────
//
// Pure formatting/derivation logic behind the table's view methods. Kept
// here — not inline in multi-vari.js's data() — for the same reason as
// runVarianceDecomposition() above: testable without an Alpine/DOM
// environment. What still lives in multi-vari.js is only the thin wrapping
// that needs `this.result` or the i18n `_t()` translator.

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
 * Honesty-rule gate (spec): an unbalanced design makes the variance
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
 * template on purpose: Alpine CSP's expression evaluator refuses any bare
 * global identifier (`Math` included) with "Accessing global variables is
 * prohibited in the CSP build" — see vendor/alpinejs/csp.js.
 * @param {{totalVariance: number}|null|undefined} vc
 * @returns {number} NaN when totalVariance is missing or non-finite.
 */
export function totalSdValue(vc) {
  return vc && Number.isFinite(vc.totalVariance) ? Math.sqrt(vc.totalVariance) : NaN;
}

/**
 * CSV text for the variance-components table — the same columns as the
 * on-screen table, dot as decimal separator, term labels quoted (they can
 * contain a comma or a quote from user column names). `head` and
 * `totalLabel` arrive already translated; `termLabelFn` only localizes the
 * Error row.
 * @param {{terms: Array<object>, totalVariance: number}} vc — result.vc
 * @param {string[]} head — 7 translated column headers
 * @param {string} totalLabel — translated "Total" row label
 * @param {(term: object) => string} termLabelFn
 * @returns {string}
 */
export function vcCsvText(vc, head, totalLabel, termLabelFn) {
  const cell = (v) => (Number.isFinite(v) ? String(v) : '');
  const lines = [head.join(',')];
  for (const t of vc.terms) {
    lines.push([
      `"${termLabelFn(t).replace(/"/g, '""')}"`,
      cell(t.df), cell(t.ss), cell(t.ms), cell(t.variance), cell(t.sd), cell(t.percent),
    ].join(','));
  }
  lines.push([`"${totalLabel}"`, '', '', '', cell(vc.totalVariance),
    cell(Math.sqrt(vc.totalVariance)), '100'].join(','));
  return lines.join('\n');
}
