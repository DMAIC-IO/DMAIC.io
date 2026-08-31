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
import {
  runVarianceDecomposition,
  vcTermRows, isUnbalanced, hasClampedTerm,
  pickLargestTerm, interpretationKey, intOrDash, vcCsvText, totalSdValue,
} from '../../js/modules/multi-vari/multi-vari-analysis.js';

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

// ─── Task 18: variance-components table view helpers ──────────────────────
//
// Pure, DOM-free formatting/derivation logic behind the table's view methods
// (multi-vari.js's vcTerms(), interpretationText(), showUnbalancedNote(),
// showClampedNote(), exportCsv()) lives here so it is testable without an
// Alpine/DOM environment — see multi-vari.js for the thin i18n wrapping.

suite('vcTermRows — table rows, Error row included, empty when the decomposition failed', () => {
  test('returns result.vc.terms unchanged', () => {
    const terms = [{ id: 'A', percent: 60 }, { id: 'Error', percent: 40 }];
    assertEqual(vcTermRows({ vc: { terms } }), terms);
  });

  test('returns [] when vc is null (decomposition failed)', () => {
    assertDeepEqual(vcTermRows({ vc: null }), []);
  });

  test('returns [] when result itself is null', () => {
    assertDeepEqual(vcTermRows(null), []);
  });
});

suite('isUnbalanced — the honesty-rule gate', () => {
  test('true when result.balanced === false', () => {
    assertTrue(isUnbalanced({ balanced: false }));
  });

  test('false when result.balanced === true', () => {
    assertEqual(isUnbalanced({ balanced: true }), false);
  });

  test('false when result is null', () => {
    assertEqual(isUnbalanced(null), false);
  });
});

suite('hasClampedTerm — REML-clamped-to-0 note gate', () => {
  test('true when at least one term is clamped', () => {
    assertTrue(hasClampedTerm([{ id: 'A', clamped: false }, { id: 'B', clamped: true }]));
  });

  test('false when no term is clamped', () => {
    assertEqual(hasClampedTerm([{ id: 'A', clamped: false }]), false);
  });

  test('false on an empty term list', () => {
    assertEqual(hasClampedTerm([]), false);
  });
});

suite('pickLargestTerm — the term the interpretation sentence names', () => {
  test('picks the term with the largest percent share, Error included', () => {
    const terms = [
      { id: 'A', percent: 20 },
      { id: 'B(A)', percent: 55 },
      { id: 'Error', percent: 25 },
    ];
    assertEqual(pickLargestTerm(terms).id, 'B(A)');
  });

  test('Error can win when repeat variation dominates', () => {
    const terms = [{ id: 'A', percent: 10 }, { id: 'Error', percent: 90 }];
    assertEqual(pickLargestTerm(terms).id, 'Error');
  });

  test('a tie keeps the first-seen term (stable, not engine-order-dependent)', () => {
    const terms = [{ id: 'A', percent: 50 }, { id: 'B', percent: 50 }];
    assertEqual(pickLargestTerm(terms).id, 'A');
  });

  test('null on an empty or missing term list', () => {
    assertEqual(pickLargestTerm([]), null);
    assertEqual(pickLargestTerm(undefined), null);
  });
});

suite('interpretationKey — Error gets its own honest sentence', () => {
  test('the Error term maps to interpretationError', () => {
    assertEqual(interpretationKey({ id: 'Error' }), 'interpretationError');
  });

  test('any other term maps to interpretation', () => {
    assertEqual(interpretationKey({ id: 'B(A)' }), 'interpretation');
  });
});

suite('intOrDash — REML has no degrees of freedom', () => {
  test('a finite number formats as an integer string', () => {
    assertEqual(intOrDash(3), '3');
    assertEqual(intOrDash(0), '0');
  });

  test('null (REML path) formats as an en dash, never "null" or "NaN"', () => {
    assertEqual(intOrDash(null), '–');
    assertEqual(intOrDash(NaN), '–');
    assertEqual(intOrDash(undefined), '–');
  });
});

suite('totalSdValue — total row\'s standard deviation', () => {
  // The template cannot call Math.sqrt() directly: Alpine CSP's evaluator
  // resolves a bare identifier only against the component scope, and Math is
  // not in it — the expression throws "Undefined variable: Math"
  // (vendor/alpinejs/csp.js, Identifier case). The square root has to be
  // computed here and exposed through a data-fn method (totalSd()).
  test('square root of totalVariance', () => {
    assertEqual(totalSdValue({ totalVariance: 12.25 }), 3.5);
  });

  test('NaN when totalVariance is missing or non-finite, never a thrown error', () => {
    assertTrue(Number.isNaN(totalSdValue({ totalVariance: NaN })));
    assertTrue(Number.isNaN(totalSdValue(null)));
    assertTrue(Number.isNaN(totalSdValue(undefined)));
  });
});

suite('vcCsvText — CSV export mirrors the on-screen table', () => {
  const HEAD = ['Komponente', 'FG', 'SS', 'MS', 'Varianz', 'Std.abw.', 'Anteil %'];
  const termLabelFn = (t) => (t.id === 'Error' ? 'Rest (Wiederholung)' : t.label);

  test('one row per term plus a totals row, dot as decimal separator', () => {
    const vc = {
      totalVariance: 12.5,
      terms: [
        { id: 'A', label: 'Schicht', df: 2, ss: 30, ms: 15, variance: 7.5, sd: 2.7386, percent: 60 },
        { id: 'Error', label: 'Error', df: 9, ss: 20, ms: 2.2222, variance: 5, sd: 2.2361, percent: 40 },
      ],
    };
    const csv = vcCsvText(vc, HEAD, 'Gesamt', termLabelFn);
    const lines = csv.split('\n');
    assertEqual(lines.length, 4, 'header + 2 terms + total');
    assertEqual(lines[0], HEAD.join(','));
    assertEqual(lines[1], '"Schicht",2,30,15,7.5,2.7386,60');
    assertEqual(lines[2], '"Rest (Wiederholung)",9,20,2.2222,5,2.2361,40');
    assertEqual(lines[3], `"Gesamt",,,,${12.5},${Math.sqrt(12.5)},100`);
  });

  test('REML rows (df/ss/ms null) leave those cells empty, not "null"', () => {
    const vc = {
      totalVariance: 5,
      terms: [
        { id: 'A', label: 'Schicht', df: null, ss: null, ms: null, variance: 3, sd: 1.7321, percent: 60 },
      ],
    };
    const csv = vcCsvText(vc, HEAD, 'Gesamt', termLabelFn);
    assertEqual(csv.split('\n')[1], '"Schicht",,,,3,1.7321,60');
  });

  test('a term label containing a double quote is escaped, not left to break the CSV', () => {
    const vc = {
      totalVariance: 1,
      terms: [{ id: 'A', label: 'Maß "Toleranz"', df: 1, ss: 1, ms: 1, variance: 1, sd: 1, percent: 100 }],
    };
    const csv = vcCsvText(vc, HEAD, 'Gesamt', (t) => t.label);
    assertEqual(csv.split('\n')[1], '"Maß ""Toleranz""",1,1,1,1,1,100');
  });
});
