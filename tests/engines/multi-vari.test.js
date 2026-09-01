/**
 * D.Mike — Multi-Vari grouping engine tests.
 *
 * The engine groups only — no statistics. Everything asserted here is
 * bookkeeping: which level ends up where, which rows are dropped, and which
 * mean belongs to which bucket.
 */

import { suite, test, assertEqual, assertDeepEqual, assertAlmostEqual } from '../test-utils.js';
import {
  MIN_FACTORS, MAX_FACTORS,
  MAX_AXIS_LEVELS, MAX_SERIES_LEVELS, MAX_PANELS,
  levelKey, orderLevels, cleanRows, computeMultiVari,
} from '../../js/engines/multi-vari-engine.js';

/** Two factors, balanced: 2 shifts × 2 machines × 2 repeats. */
const TWO = {
  measurements: [10, 12, 20, 22, 30, 32, 40, 42],
  factors: [
    { name: 'Schicht', values: ['F', 'F', 'F', 'F', 'S', 'S', 'S', 'S'] },
    { name: 'Maschine', values: ['1', '1', '2', '2', '1', '1', '2', '2'] },
  ],
};

suite('Multi-Vari engine — level keys and ordering', () => {
  test('level keys are trimmed strings, null becomes the empty key', () => {
    assertEqual(levelKey('  F '), 'F');
    assertEqual(levelKey(3), '3');
    assertEqual(levelKey(null), '');
    assertEqual(levelKey(undefined), '');
  });

  test('all-numeric levels sort numerically, not lexically', () => {
    assertDeepEqual(orderLevels(['10', '3', '15', '4']), ['3', '4', '10', '15']);
  });

  test('mixed levels fall back to locale ordering', () => {
    assertDeepEqual(orderLevels(['Nacht', 'Früh', 'Spät']), ['Früh', 'Nacht', 'Spät']);
  });
});

suite('Multi-Vari engine — row cleaning', () => {
  test('keeps every complete row', () => {
    const { rows, droppedRows } = cleanRows(TWO.measurements, TWO.factors);
    assertEqual(rows.length, 8);
    assertEqual(droppedRows, 0);
  });

  test('drops rows with a non-numeric measurement or an empty factor cell', () => {
    const { rows, droppedRows } = cleanRows(
      [10, 'x', 20, 30],
      [
        { name: 'A', values: ['F', 'F', '', 'S'] },
        { name: 'B', values: ['1', '1', '2', '2'] },
      ],
    );
    assertEqual(rows.length, 2);
    assertEqual(droppedRows, 2);
    assertDeepEqual(rows.map(r => r.y), [10, 30]);
  });
});

suite('Multi-Vari engine — two factors', () => {
  test('rejects fewer than MIN_FACTORS and more than MAX_FACTORS columns', () => {
    let threw = 0;
    try { computeMultiVari({ measurements: [1, 2], factors: [{ name: 'A', values: ['1', '2'] }] }); }
    catch { threw++; }
    const five = new Array(MAX_FACTORS + 1).fill(0)
      .map((_, i) => ({ name: `F${i}`, values: ['1', '2'] }));
    try { computeMultiVari({ measurements: [1, 2], factors: five }); } catch { threw++; }
    assertEqual(threw, 2);
    assertEqual(MIN_FACTORS, 2);
  });

  test('reports the factors with their ordered levels', () => {
    const r = computeMultiVari(TWO);
    assertDeepEqual(r.factors.map(f => f.name), ['Schicht', 'Maschine']);
    assertDeepEqual(r.factors[0].levels, ['F', 'S']);
    assertDeepEqual(r.seriesLevels, ['1', '2']);
  });

  test('builds one strip with one panel and one group per axis level', () => {
    const r = computeMultiVari(TWO);
    assertEqual(r.strips.length, 1);
    assertEqual(r.strips[0].rowLevel, '');
    assertEqual(r.strips[0].panels.length, 1);
    assertEqual(r.strips[0].panels[0].panelLevel, '');
    assertDeepEqual(r.strips[0].panels[0].groups.map(g => g.level), ['F', 'S']);
  });

  test('a group carries one series per factor-2 level, values in row order', () => {
    const g = computeMultiVari(TWO).strips[0].panels[0].groups[0];
    assertDeepEqual(g.series.map(s => s.level), ['1', '2']);
    assertDeepEqual(g.series[0].values, [10, 12]);
    assertAlmostEqual(g.series[0].mean, 11, 1e-12);
    assertAlmostEqual(g.series[1].mean, 21, 1e-12);
    assertAlmostEqual(g.mean, 16, 1e-12);
  });

  test('reports n, grand mean and the observed y range', () => {
    const r = computeMultiVari(TWO);
    assertEqual(r.n, 8);
    assertEqual(r.droppedRows, 0);
    assertAlmostEqual(r.grandMean, 26, 1e-12);
    assertEqual(r.yMin, 10);
    assertEqual(r.yMax, 42);
  });

  test('an empty input yields empty levels and a usable y range', () => {
    const r = computeMultiVari({
      measurements: [],
      factors: [{ name: 'A', values: [] }, { name: 'B', values: [] }],
    });
    assertEqual(r.n, 0);
    assertDeepEqual(r.seriesLevels, []);
    assertEqual(r.yMin, 0);
    assertEqual(r.yMax, 1);
  });
});

suite('Multi-Vari engine — cleaned data', () => {
  test('cleaned data omits dropped rows and matches n', () => {
    const r = computeMultiVari({
      measurements: [10, 'x', 20, 30],
      factors: [
        { name: 'A', values: ['F', 'F', '', 'S'] },
        { name: 'B', values: ['1', '1', '2', '2'] },
      ],
    });
    assertEqual(r.n, 2);
    assertEqual(r.cleaned.response.length, r.n);
    assertDeepEqual(r.cleaned.response, [10, 30]);
    assertDeepEqual(r.cleaned.factorValues[0], ['F', 'S']);
    assertDeepEqual(r.cleaned.factorValues[1], ['1', '2']);
  });
});

/** Three factors, balanced: 2 shifts × 2 machines × 2 nests × 1 repeat. */
const THREE = {
  measurements: [10, 11, 12, 13, 20, 21, 22, 23],
  factors: [
    { name: 'Schicht', values: ['F', 'F', 'F', 'F', 'S', 'S', 'S', 'S'] },
    { name: 'Maschine', values: ['1', '1', '2', '2', '1', '1', '2', '2'] },
    { name: 'Nest', values: ['N1', 'N2', 'N1', 'N2', 'N1', 'N2', 'N1', 'N2'] },
  ],
};

/** Four factors: THREE, run twice under two batches. */
const FOUR = {
  measurements: [...THREE.measurements, ...THREE.measurements.map(v => v + 5)],
  factors: [
    ...THREE.factors.map(f => ({ name: f.name, values: [...f.values, ...f.values] })),
    { name: 'Charge', values: [...new Array(8).fill('C1'), ...new Array(8).fill('C2')] },
  ],
};

/** n synthetic levels for one factor, one observation each. */
function manyLevels(count, other = '1') {
  const measurements = [];
  const a = [];
  const b = [];
  for (let i = 0; i < count; i++) {
    measurements.push(i);
    a.push(String(i));
    b.push(other);
  }
  return { measurements, factors: [{ name: 'A', values: a }, { name: 'B', values: b }] };
}

suite('Multi-Vari engine — panels and strips', () => {
  test('three factors put the third factor into panels of one strip', () => {
    const r = computeMultiVari(THREE);
    assertEqual(r.strips.length, 1);
    assertDeepEqual(r.strips[0].panels.map(p => p.panelLevel), ['N1', 'N2']);
    assertEqual(r.panelCount, 2);
  });

  test('a panel keeps only the values of its own third-factor level', () => {
    const panel = computeMultiVari(THREE).strips[0].panels[0];
    assertDeepEqual(panel.groups[0].series[0].values, [10]);
    assertDeepEqual(panel.groups[0].series[1].values, [12]);
  });

  test('four factors stack one strip per fourth-factor level', () => {
    const r = computeMultiVari(FOUR);
    assertDeepEqual(r.strips.map(s => s.rowLevel), ['C1', 'C2']);
    assertEqual(r.strips[1].panels.length, 2);
    assertEqual(r.panelCount, 4);
    assertDeepEqual(r.strips[1].panels[0].groups[0].series[0].values, [15]);
  });

  test('an axis level absent from a panel still yields an empty group', () => {
    const r = computeMultiVari({
      measurements: [1, 2, 3],
      factors: [
        { name: 'A', values: ['x', 'y', 'y'] },
        { name: 'B', values: ['1', '1', '2'] },
        { name: 'C', values: ['P1', 'P2', 'P2'] },
      ],
    });
    const panel = r.strips[0].panels[1];   // P2 has no 'x'
    assertDeepEqual(panel.groups.map(g => g.level), ['x', 'y']);
    assertEqual(panel.groups[0].series.length, 0);
    assertEqual(panel.groups[0].mean, null);
  });
});

suite('Multi-Vari engine — balance', () => {
  test('a fully crossed design with equal cell sizes is balanced', () => {
    const r = computeMultiVari(TWO);
    assertEqual(r.balanced, true);
    assertDeepEqual(r.warnings, []);
  });

  test('unequal cell sizes raise the unbalanced warning', () => {
    const r = computeMultiVari({
      measurements: [10, 12, 14, 20, 30, 40],
      factors: [
        { name: 'A', values: ['F', 'F', 'F', 'F', 'S', 'S'] },
        { name: 'B', values: ['1', '1', '1', '2', '1', '2'] },
      ],
    });
    assertEqual(r.balanced, false);
    assertEqual(r.warnings.includes('unbalanced'), true);
    assertEqual(r.warnings.includes('emptyCells'), false);
  });

  test('a missing combination raises the emptyCells warning', () => {
    const r = computeMultiVari({
      measurements: [10, 20, 30],
      factors: [
        { name: 'A', values: ['F', 'F', 'S'] },
        { name: 'B', values: ['1', '2', '1'] },
      ],
    });
    assertEqual(r.balanced, false);
    assertEqual(r.warnings.includes('emptyCells'), true);
  });
});

suite('Multi-Vari engine — size limits', () => {
  test('more than MAX_AXIS_LEVELS levels on factor 1 is reported', () => {
    const r = computeMultiVari(manyLevels(31));
    assertEqual(r.warnings.includes('tooManyAxisLevels'), true);
  });

  test('exactly MAX_AXIS_LEVELS levels is still fine', () => {
    const r = computeMultiVari(manyLevels(30));
    assertEqual(r.warnings.includes('tooManyAxisLevels'), false);
  });

  test('more than MAX_SERIES_LEVELS levels on factor 2 is reported', () => {
    const base = manyLevels(13);
    const r = computeMultiVari({
      measurements: base.measurements,
      factors: [
        { name: 'A', values: base.factors[0].values.map(() => 'x') },
        { name: 'B', values: base.factors[0].values },
      ],
    });
    assertEqual(r.warnings.includes('tooManySeriesLevels'), true);
  });

  test('more than MAX_PANELS panels is reported', () => {
    // 7 panel levels × 7 strip levels = 49 panels, one above the limit.
    const measurements = [];
    const a = []; const b = []; const c = []; const d = [];
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        measurements.push(i * 7 + j);
        a.push('x'); b.push('1'); c.push(`P${i}`); d.push(`R${j}`);
      }
    }
    const r = computeMultiVari({
      measurements,
      factors: [
        { name: 'A', values: a }, { name: 'B', values: b },
        { name: 'C', values: c }, { name: 'D', values: d },
      ],
    });
    assertEqual(r.panelCount, 49);
    assertEqual(r.warnings.includes('tooManyPanels'), true);
  });
});

suite('Multi-Vari engine — balance follows the model form', () => {
  /**
   * Nested, balanced, inner labels globally unique: three machines with two
   * parts each, two measurements per part. The raw level product is 3 × 6 = 18
   * cells — twelve of which a nested plan can never occupy. Measured against
   * that product the design looks incomplete; measured against what the model
   * form can reach it is exactly full.
   */
  const NESTED_UNIQUE = {
    measurements: [10.1, 10.3, 10.9, 11.0, 12.2, 12.4, 12.8, 13.1, 9.4, 9.6, 8.8, 9.0],
    factors: [
      {
        name: 'Maschine',
        values: ['M1', 'M1', 'M1', 'M1', 'M2', 'M2', 'M2', 'M2', 'M3', 'M3', 'M3', 'M3'],
      },
      {
        name: 'Teil',
        values: ['P1', 'P1', 'P2', 'P2', 'P3', 'P3', 'P4', 'P4', 'P5', 'P5', 'P6', 'P6'],
      },
    ],
  };

  test('nested: globally unique inner labels are balanced, no warning', () => {
    const r = computeMultiVari({ ...NESTED_UNIQUE, modelForm: 'nested' });
    assertEqual(r.balanced, true);
    assertDeepEqual(r.warnings, [], `unexpected warnings: ${JSON.stringify(r.warnings)}`);
  });

  test('crossed: the same data is genuinely incomplete', () => {
    const r = computeMultiVari({ ...NESTED_UNIQUE, modelForm: 'crossed' });
    assertEqual(r.balanced, false);
    assertEqual(r.warnings.includes('emptyCells'), true);
  });

  test('the default is the stricter crossed reading', () => {
    const r = computeMultiVari(NESTED_UNIQUE);
    assertEqual(r.balanced, false);
  });

  test('the model form does not paper over unequal cell sizes', () => {
    const r = computeMultiVari({
      measurements: [10, 12, 14, 20, 30, 31, 40, 41],
      factors: [
        { name: 'A', values: ['M1', 'M1', 'M1', 'M1', 'M2', 'M2', 'M2', 'M2'] },
        { name: 'B', values: ['P1', 'P1', 'P1', 'P2', 'P3', 'P3', 'P4', 'P4'] },
      ],
      modelForm: 'nested',
    });
    assertEqual(r.balanced, false);
    assertEqual(r.warnings.includes('unbalanced'), true);
  });
});

suite('Multi-Vari engine — a size limit blocks rendering', () => {
  test('within the limits the result is renderable and carries no limit entry', () => {
    const r = computeMultiVari(TWO);
    assertEqual(r.renderable, true);
    assertDeepEqual(r.limits, []);
  });

  test('too many axis levels: not renderable, and the limit names the column', () => {
    const r = computeMultiVari(manyLevels(31));
    assertEqual(r.renderable, false);
    assertEqual(r.limits.length, 1);
    assertEqual(r.limits[0].code, 'tooManyAxisLevels');
    assertEqual(r.limits[0].column, 'A');
    assertEqual(r.limits[0].count, 31);
    assertEqual(r.limits[0].max, MAX_AXIS_LEVELS);
  });

  test('too many series levels: the second column is named', () => {
    const base = manyLevels(13);
    const r = computeMultiVari({
      measurements: base.measurements,
      factors: [
        { name: 'Achse', values: base.factors[0].values.map(() => 'x') },
        { name: 'Serie', values: base.factors[0].values },
      ],
    });
    assertEqual(r.renderable, false);
    assertEqual(r.limits[0].code, 'tooManySeriesLevels');
    assertEqual(r.limits[0].column, 'Serie');
    assertEqual(r.limits[0].max, MAX_SERIES_LEVELS);
  });

  test('too many panels: the panel columns are named', () => {
    const measurements = [];
    const a = []; const b = []; const c = []; const d = [];
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        measurements.push(i * 7 + j);
        a.push('x'); b.push('1'); c.push(`P${i}`); d.push(`R${j}`);
      }
    }
    const r = computeMultiVari({
      measurements,
      factors: [
        { name: 'A', values: a }, { name: 'B', values: b },
        { name: 'Panel', values: c }, { name: 'Zeile', values: d },
      ],
    });
    assertEqual(r.renderable, false);
    assertEqual(r.limits[0].code, 'tooManyPanels');
    assertEqual(r.limits[0].column, 'Panel, Zeile');
    assertEqual(r.limits[0].count, 49);
    assertEqual(r.limits[0].max, MAX_PANELS);
  });

  test('exactly at the limit the chart is still drawn', () => {
    const r = computeMultiVari(manyLevels(MAX_AXIS_LEVELS));
    assertEqual(r.renderable, true);
    assertDeepEqual(r.limits, []);
  });
});
