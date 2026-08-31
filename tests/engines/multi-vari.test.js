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
