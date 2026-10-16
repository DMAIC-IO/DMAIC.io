/**
 * D.Mike — Kano chart config tests (kano-chart.test.js)
 * Pure Better/Worse scatter config shared by the module and the dashboard tile.
 */

import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { bubbleSizes, kanoScatterConfig } from '../../js/modules/kano/kano-chart.js';

const row = (label, cs, ds, importanceMean = null) => ({ label, cs, ds, importanceMean });

suite('kano-chart — bubbleSizes', () => {
  test('10 px at w̄ = 1, 26 px at w̄ = 9, 10 px without importance', () => {
    assertDeepEqual(bubbleSizes([row('a', 0, 0, 1), row('b', 0, 0, 9), row('c', 0, 0, 5), row('d', 0, 0, null)]),
      [10, 26, 18, 10]);
  });
});

suite('kano-chart — kanoScatterConfig', () => {
  test('one series per plotted item: |ds| on x, cs on y', () => {
    const { series } = kanoScatterConfig([row('A', 0.8, -0.2), row('B', 0.1, -0.9)], { importance: false, sizeLabel: 'W' });
    assertEqual(series.length, 2);
    assertDeepEqual(series.map(s => s.name), ['A', 'B']);
    assertDeepEqual(series[0].x, [0.2]);
    assertDeepEqual(series[0].y, [0.8]);
    assertEqual(series[0].color, 'var(--color-chart-1)');
    assertEqual(series[0].symbol, 'circle');
    assertEqual(series[0].markerSize, 8);
    assertEqual(series[0].strokeWidth, 1);
    assertEqual(series[0].sizes, undefined);
  });

  test('rows without cs or ds are left out', () => {
    const { series } = kanoScatterConfig([row('A', null, null), row('B', 0.5, -0.5), row('C', 0.2, null)],
      { importance: true, sizeLabel: 'W' });
    assertDeepEqual(series.map(s => s.name), ['B']);
  });

  test('no plottable row: empty series', () => {
    assertEqual(kanoScatterConfig([row('A', null, null)], { importance: true, sizeLabel: 'W' }).series.length, 0);
    assertEqual(kanoScatterConfig([], { importance: true, sizeLabel: 'W' }).series.length, 0);
  });

  test('with importance: sizes, sizeValues and sizeLabel per series', () => {
    const { series } = kanoScatterConfig([row('A', 0.5, -0.5, 9), row('B', 0.5, -0.5, null)],
      { importance: true, sizeLabel: 'Mean importance' });
    assertDeepEqual(series[0].sizes, [26]);
    assertDeepEqual(series[0].sizeValues, [9]);
    assertEqual(series[0].sizeLabel, 'Mean importance');
    assertDeepEqual(series[1].sizes, [10]);
    assertDeepEqual(series[1].sizeValues, [null]);
  });

  test('two dashed reference lines at 0.5', () => {
    const { refLines } = kanoScatterConfig([], { importance: false, sizeLabel: '' });
    assertDeepEqual(refLines, [
      { dir: 'h', value: 0.5, dash: 'dash', width: 1, color: 'var(--color-text-tertiary)' },
      { dir: 'v', value: 0.5, dash: 'dash', width: 1, color: 'var(--color-text-tertiary)' },
    ]);
  });
});
