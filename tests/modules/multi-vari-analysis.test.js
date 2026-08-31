/**
 * D.Mike — Multi-Vari analysis assembly tests (multi-vari-analysis.js).
 *
 * `runVarianceDecomposition` is the seam between the two engines the module
 * consumes: `computeMultiVari` groups rows for the chart, then this function
 * hands the decomposition exactly the rows that survived that grouping and
 * unions both engines' warnings. Two defects the Pre-Flight-Scan for Task 16
 * caught and ruled on (F4, F2 in progress.md) are pinned here:
 *
 *   - F4: the decomposition must run on `g.cleaned.response` /
 *     `g.cleaned.factorValues`, never the module's raw column arrays —
 *     otherwise it silently describes rows the chart never shows (or trips
 *     over a dropped row's NaN/empty level).
 *   - F2: the module's warnings must be the UNION of both engines' lists,
 *     deduplicated (`unbalanced` can come from either) — otherwise a
 *     decomposition-only warning (e.g. a non-converged REML fit) never
 *     reaches the UI.
 */

import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { computeMultiVari } from '../../js/engines/multi-vari-engine.js';
import { runVarianceDecomposition } from '../../js/modules/multi-vari/multi-vari-analysis.js';

const NESTED_OPTS = (factorNames) => ({ factorNames, modelForm: 'nested', estimator: 'anova' });

suite('runVarianceDecomposition — feeds the decomposition cleaned rows (F4)', () => {
  test('the decomposition sees g.cleaned, not the raw (undropped) rows', () => {
    // 8 raw rows, one measurement is non-numeric → computeMultiVari drops it.
    const measurements = [10, 12, 20, 22, 30, 32, 'n/a', 42];
    const factors = [
      { name: 'Schicht', values: ['F', 'F', 'F', 'F', 'S', 'S', 'S', 'S'] },
      { name: 'Maschine', values: ['1', '1', '2', '2', '1', '1', '2', '2'] },
    ];
    const g = computeMultiVari({ measurements, factors });

    // Fixture sanity: a row really did get dropped, and the cleaned set is
    // shorter than the raw column — otherwise this test would not
    // distinguish "fed cleaned data" from "fed raw data".
    assertEqual(g.droppedRows, 1);
    assertEqual(g.cleaned.response.length, 7);
    assertTrue(g.cleaned.response.length < measurements.length,
      'cleaned response must be shorter than the raw measurement column');

    const { result } = runVarianceDecomposition(g, NESTED_OPTS(['Schicht', 'Maschine']));

    assertEqual(result.vc.n, g.cleaned.response.length,
      'vc.n must match the CLEANED row count, not the raw 8-row column');
    assertTrue(Number.isFinite(result.vc.totalVariance),
      'totalVariance must be finite — raw data would carry the dropped row\'s NaN into the sums');
    for (const term of result.vc.terms) {
      assertTrue(Number.isFinite(term.variance), `term ${term.id} variance must be finite, not NaN`);
    }
  });
});

suite('runVarianceDecomposition — unions both engines\' warnings (F2)', () => {
  test('a decomposition-only warning (noReplicates) surfaces even when the grouping engine is silent', () => {
    // 4 rows, one observation per (Schicht, Maschine) cell: the grouping
    // engine sees a perfectly balanced, fully occupied design (no warning),
    // but the finest nested term has zero residual df — the decomposition
    // engine alone flags `noReplicates`.
    const measurements = [10, 20, 30, 40];
    const factors = [
      { name: 'Schicht', values: ['F', 'F', 'S', 'S'] },
      { name: 'Maschine', values: ['1', '2', '1', '2'] },
    ];
    const g = computeMultiVari({ measurements, factors });
    assertDeepEqual(g.warnings, [], 'fixture must be silent from the grouping engine — that is the point');

    const { result } = runVarianceDecomposition(g, NESTED_OPTS(['Schicht', 'Maschine']));

    assertTrue(result.vc.warnings.includes('noReplicates'), 'fixture must actually trip noReplicates in the VC engine');
    assertTrue(result.warnings.includes('noReplicates'),
      'result.warnings must include a warning the grouping engine never raised');
  });

  test('a warning both engines raise (unbalanced) appears exactly once', () => {
    const measurements = [10, 12, 20, 22, 30, 32, 'n/a', 42];
    const factors = [
      { name: 'Schicht', values: ['F', 'F', 'F', 'F', 'S', 'S', 'S', 'S'] },
      { name: 'Maschine', values: ['1', '1', '2', '2', '1', '1', '2', '2'] },
    ];
    const g = computeMultiVari({ measurements, factors });
    const { result } = runVarianceDecomposition(g, NESTED_OPTS(['Schicht', 'Maschine']));

    // Fixture sanity: both engines actually independently flag 'unbalanced'
    // here (the dropped row leaves one cell short), otherwise the dedup
    // assertion below would pass trivially.
    assertTrue(g.warnings.includes('unbalanced'), 'grouping engine must flag unbalanced in this fixture');
    assertTrue(result.vc.warnings.includes('unbalanced'), 'decomposition engine must flag unbalanced in this fixture');

    const occurrences = result.warnings.filter(w => w === 'unbalanced').length;
    assertEqual(occurrences, 1, 'unbalanced must be deduplicated across the two engines\' warning lists');
  });
});

suite('runVarianceDecomposition — decomposition failure does not break the chart result', () => {
  test('an unsupported model form leaves vc null and reports the failure without touching the grouping fields', () => {
    const measurements = [10, 20, 30, 40];
    const factors = [
      { name: 'Schicht', values: ['F', 'F', 'S', 'S'] },
      { name: 'Maschine', values: ['1', '2', '1', '2'] },
    ];
    const g = computeMultiVari({ measurements, factors });

    const { result, vcError } = runVarianceDecomposition(
      g, { factorNames: ['Schicht', 'Maschine'], modelForm: 'bogus', estimator: 'anova' },
    );

    assertEqual(result.vc, null);
    assertTrue(vcError instanceof Error, 'a thrown decomposition error must be surfaced, not swallowed');
    assertEqual(result.n, g.n);
    assertDeepEqual(result.warnings, g.warnings, 'without a vc, the warnings are just the grouping engine\'s');
  });
});
