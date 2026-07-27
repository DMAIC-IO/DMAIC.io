/**
 * D.Mike — Gage Run Chart Engine Tests
 *
 * Covers grouping, part ordering, appraiser ordering, means, the balanced
 * flag and row splitting, plus a fixture replay of the `analyze` dispatcher.
 */

import {
  suite, test, assertEqual, assertDeepEqual, assertAlmostEqual, assertThrows,
} from '../test-utils.js';
import {
  computeGageRunChart, panelsFromCells, splitPanelRows, analyze,
} from '../../js/engines/gage-run-chart-engine.js';

async function loadFixture(path) {
  const resp = await fetch(new URL(path, import.meta.url));
  return resp.json();
}

function getTol(tc, tolerances) {
  const key = tc.tolerance_override;
  return key && tolerances.overrides?.[key]
    ? tolerances.overrides[key]
    : tolerances.default;
}

suite('Gage Run Chart — grouping & ordering', () => {
  test('groups measurements into one panel per part', () => {
    const r = computeGageRunChart({
      parts:        ['1', '1', '2', '2'],
      operators:    ['A', 'B', 'A', 'B'],
      measurements: [10, 12, 20, 22],
    });
    assertDeepEqual(r.parts, ['1', '2']);
    assertEqual(r.panels.length, 2);
    assertEqual(r.panels[0].part, '1');
    assertDeepEqual(r.panels[0].series.map(s => s.operator), ['A', 'B']);
    assertDeepEqual(r.panels[0].series[0].values, [10]);
  });

  test('orders parts numerically when every label is a number', () => {
    const r = computeGageRunChart({
      parts:        [10, 3, 15, 4],
      operators:    ['A', 'A', 'A', 'A'],
      measurements: [1, 2, 3, 4],
    });
    // Lexicographic ordering would give 10, 15, 3, 4.
    assertDeepEqual(r.parts, ['3', '4', '10', '15']);
  });

  test('orders parts lexicographically when a label is not numeric', () => {
    const r = computeGageRunChart({
      parts:        ['10', 'B', '3'],
      operators:    ['A', 'A', 'A'],
      measurements: [1, 2, 3],
    });
    assertDeepEqual(r.parts, ['10', '3', 'B']);
  });

  test('keeps appraisers in first-appearance order, not sorted', () => {
    const r = computeGageRunChart({
      parts:        ['1', '1', '1'],
      operators:    ['C', 'A', 'B'],
      measurements: [1, 2, 3],
    });
    assertDeepEqual(r.operators, ['C', 'A', 'B']);
  });

  test('keeps repeat measurements in worksheet row order', () => {
    const r = computeGageRunChart({
      parts:        ['1', '1', '1'],
      operators:    ['A', 'A', 'A'],
      measurements: [3, 1, 2],
    });
    assertDeepEqual(r.panels[0].series[0].values, [3, 1, 2]);
  });
});

suite('Gage Run Chart — statistics', () => {
  test('computes series means and the grand mean', () => {
    const r = computeGageRunChart({
      parts:        ['1', '1', '1', '1'],
      operators:    ['A', 'A', 'B', 'B'],
      measurements: [10, 20, 30, 50],
    });
    assertAlmostEqual(r.panels[0].series[0].mean, 15, 1e-12);
    assertAlmostEqual(r.panels[0].series[1].mean, 40, 1e-12);
    assertAlmostEqual(r.grandMean, 27.5, 1e-12);
    assertEqual(r.n, 4);
  });

  test('reports the data span for the shared y-domain', () => {
    const r = computeGageRunChart({
      parts:        ['1', '1'],
      operators:    ['A', 'A'],
      measurements: [-2.5, 7],
    });
    assertAlmostEqual(r.yMin, -2.5, 1e-12);
    assertAlmostEqual(r.yMax, 7, 1e-12);
  });
});

suite('Gage Run Chart — study without appraisers', () => {
  test('yields one series per panel when the operator column is omitted', () => {
    const r = computeGageRunChart({
      parts:        ['1', '1', '2'],
      measurements: [5, 7, 9],
    });
    assertEqual(r.hasOperators, false);
    assertDeepEqual(r.operators, ['']);
    assertEqual(r.panels[0].series.length, 1);
    assertDeepEqual(r.panels[0].series[0].values, [5, 7]);
  });

  test('treats a blank appraiser cell as the unnamed appraiser', () => {
    const r = computeGageRunChart({
      parts:        ['1', '1'],
      operators:    ['A', '  '],
      measurements: [5, 7],
    });
    assertDeepEqual(r.operators, ['A', '']);
  });
});

suite('Gage Run Chart — robustness', () => {
  test('flags an unbalanced design', () => {
    const r = computeGageRunChart({
      parts:        ['1', '1', '2'],
      operators:    ['A', 'B', 'A'],
      measurements: [1, 2, 3],
    });
    // Part 2 has no measurement from appraiser B.
    assertEqual(r.balanced, false);
    assertDeepEqual(r.warnings, ['unbalanced']);
  });

  test('does not flag a fully crossed design', () => {
    const r = computeGageRunChart({
      parts:        ['1', '1', '2', '2'],
      operators:    ['A', 'B', 'A', 'B'],
      measurements: [1, 2, 3, 4],
    });
    assertEqual(r.balanced, true);
    assertDeepEqual(r.warnings, []);
  });

  test('drops rows with an empty part or a non-numeric measurement', () => {
    const r = computeGageRunChart({
      parts:        ['1', '', '2', '2'],
      operators:    ['A', 'A', 'A', 'A'],
      measurements: [1, 2, null, 4],
    });
    assertEqual(r.droppedRows, 2);
    assertEqual(r.n, 2);
  });

  test('counts trailing rows of an over-long column as dropped', () => {
    const r = computeGageRunChart({
      parts:        ['1', '1', '1'],
      operators:    ['A', 'A', 'A'],
      measurements: [1, 2],
    });
    assertEqual(r.n, 2);
    assertEqual(r.droppedRows, 1);
  });

  test('returns an empty, renderable result for no usable data', () => {
    const r = computeGageRunChart({ parts: [], operators: [], measurements: [] });
    assertEqual(r.n, 0);
    assertDeepEqual(r.panels, []);
    assertEqual(r.yMin, 0);
    assertEqual(r.yMax, 1);
  });

  test('rejects non-array input', () => {
    assertThrows(() => computeGageRunChart({ parts: null, measurements: [] }));
  });
});

suite('Gage Run Chart — Panels aus fertiger Zellmatrix', () => {
  const CELLS = {
    '1': { A: [10, 20], B: [30, 50] },
    '2': { A: [20, 30], B: [55, 65] },
  };

  test('übernimmt Panel- und Serienreihenfolge unverändert', () => {
    const r = panelsFromCells(['2', '1'], ['B', 'A'], CELLS);
    assertDeepEqual(r.panels.map(p => p.part), ['2', '1']);
    assertDeepEqual(r.panels[0].series.map(s => s.operator), ['B', 'A']);
  });

  test('berechnet Serien-Mittelwerte, Gesamtmittelwert und Spanne', () => {
    const r = panelsFromCells(['1', '2'], ['A', 'B'], CELLS);
    assertAlmostEqual(r.panels[0].series[0].mean, 15, 1e-12);
    assertAlmostEqual(r.grandMean, 35, 1e-12);
    assertEqual(r.n, 8);
    assertAlmostEqual(r.yMin, 10, 1e-12);
    assertAlmostEqual(r.yMax, 65, 1e-12);
  });

  test('lässt leere Zellen weg statt eine leere Serie zu zeichnen', () => {
    const r = panelsFromCells(['1'], ['A', 'B'], { '1': { A: [5], B: [] } });
    assertEqual(r.panels[0].series.length, 1);
    assertEqual(r.panels[0].series[0].operator, 'A');
  });

  test('lässt Panels ohne jeden Wert weg', () => {
    const r = panelsFromCells(['1', '2'], ['A'], { '1': { A: [5] }, '2': { A: [] } });
    assertDeepEqual(r.panels.map(p => p.part), ['1']);
  });

  test('verwirft nicht-numerische Werte', () => {
    const r = panelsFromCells(['1'], ['A'], { '1': { A: [5, null, NaN, '7'] } });
    assertDeepEqual(r.panels[0].series[0].values, [5]);
  });

  test('liefert ein renderbares Ergebnis ohne Daten', () => {
    const r = panelsFromCells([], [], {});
    assertDeepEqual(r.panels, []);
    assertEqual(r.n, 0);
    assertEqual(r.yMin, 0);
    assertEqual(r.yMax, 1);
  });
});

suite('Gage Run Chart — row splitting', () => {
  const panels = [1, 2, 3, 4, 5].map(p => ({ part: String(p), series: [] }));

  test('splits panels into rows of the requested size', () => {
    const rows = splitPanelRows(panels, 2);
    assertEqual(rows.length, 3);
    assertDeepEqual(rows[0].map(p => p.part), ['1', '2']);
    assertDeepEqual(rows[2].map(p => p.part), ['5']);
  });

  test('falls back to a single row for an invalid size', () => {
    assertEqual(splitPanelRows(panels, 0).length, 1);
  });

  test('returns no rows for no panels', () => {
    assertDeepEqual(splitPanelRows([], 3), []);
  });
});

suite('Gage Run Chart — analyze dispatcher', () => {
  test('rejects an unknown mode', () => {
    assertThrows(() => analyze({ mode: 'nope', parts: [], measurements: [] }));
  });

  test('rejects missing arrays', () => {
    assertThrows(() => analyze({ mode: 'gage-run-chart' }));
  });
});

const data = await loadFixture('../fixtures/msa/gage-run-chart.fixtures.json');

suite('Gage Run Chart — fixture validation', () => {
  for (const tc of data.test_cases) {
    if (!tc.expected || Object.keys(tc.expected).length === 0) continue;

    test(`${tc.id}: ${tc.description}`, () => {
      const got = analyze(tc.inputs);
      const tol = getTol(tc, data.tolerances);

      for (const [key, val] of Object.entries(tc.expected)) {
        const actual = got[key];
        if (typeof val === 'number') {
          assertAlmostEqual(actual, val, tol,
            `${tc.id}: ${key} = ${actual}, expected ${val}`);
        } else {
          assertDeepEqual(actual, val,
            `${tc.id}: ${key} = ${JSON.stringify(actual)}, expected ${JSON.stringify(val)}`);
        }
      }
    });
  }
});
