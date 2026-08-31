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
