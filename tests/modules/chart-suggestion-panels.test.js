/**
 * Unit tests for chart-suggestion domain/panels.js (zusammengesetzte Vorschauen als Zellenliste).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { buildPreview } from '../../js/modules/chart-suggestion/domain/panels.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { CHART_COLORS } from '../../js/core/chart/chart-colors.js';
import { checkValue } from '../../js/core/model.js';

const L = {
  frequency: 'Häufigkeit', observation: 'Beobachtung', count: 'Anzahl', proportion: 'Anteil', mean: 'Mittelwert',
  other: 'Sonstige', otherCategories: '{n} weitere', percentile: 'Perzentil', variable: 'Variable', value: 'Wert', cumulativeSum: 'Kumulierte Summe',
  previewUnavailable: 'Für „{type}“ keine Vorschau.',
};
function col(id, role, values) {
  return { id, name: id, role, type: role === 'date' ? 'date' : (role === 'continuous' ? 'numeric' : 'text'), values, roleConfirmed: false };
}
const num = (id, vals) => col(id, 'continuous', vals);
const cat = (id, vals) => col(id, 'categorical', vals);
const ramp = (n, k = 1) => Array.from({ length: n }, (_, i) => 10 + ((i * 7 * k) % 5) + i * 0.1);

/** Baut die Vorschau und prüft jede Zelle gegen ihr Widget-Schema. */
function built(type, cols) {
  const p = buildPreview(type, cols, L);
  if (p.kind === 'single') checkValue(WIDGETS[p.widget].schema.props.config, 'c', p.config);
  if (p.kind === 'panels') {
    for (const c of p.cells) if (c.widget) checkValue(WIDGETS[c.widget].schema.props.config, c.key, c.config);
    assertEqual(new Set(p.cells.map((c) => c.key)).size, p.cells.length, `${type} Schlüssel eindeutig`);
    assertDeepEqual(buildPreview(type, cols, L), p, `${type} deterministisch`);
  }
  return p;
}

suite('chart-suggestion domain — buildPreview', () => {
  test('scatter-matrix: 3 Spalten, 9 Zellen, Diagonale als Beschriftung', () => {
    const p = built('scatter-matrix', [num('a', ramp(8)), num('b', ramp(8, 2)), num('c', ramp(8, 3))]);
    assertEqual(p.layout, 'matrix');
    assertEqual(p.n, 3);
    assertEqual(p.note, null);
    assertEqual(p.cells.length, 9);
    assertEqual(p.cells[0].widget, null);
    assertEqual(p.cells[0].label, 'a');
    assertEqual(p.cells[4].label, 'b');
    assertEqual(p.cells[1].widget, 'scatter-chart');
    assertEqual(p.cells[1].config.series[0].name, 'b vs a');
  });

  test('scatter-matrix: mehr als 6 Spalten werden gekürzt, eine Spalte ergibt none', () => {
    const many = Array.from({ length: 8 }, (_, i) => num(`c${i}`, ramp(5, i + 1)));
    const p = built('scatter-matrix', many);
    assertEqual(p.n, 6);
    assertEqual(p.cells.length, 36);
    assertDeepEqual(p.note, { shown: 6, total: 8 });
    assertEqual(buildPreview('scatter-matrix', [num('a', ramp(5))], L).kind, 'none');
  });

  test('main-effects: je Faktor eine Zelle mit gemeinsamen y-Grenzen und Gesamtmittel', () => {
    const y = [1, 2, 3, 4, 5, 6];
    const p = built('main-effects', [num('y', y), cat('f1', ['a', 'a', 'b', 'b', 'c', 'c']), cat('f2', ['x', 'y', 'x', 'y', 'x', 'y'])]);
    assertEqual(p.layout, 'row');
    assertEqual(p.n, 2);
    assertEqual(p.cells.length, 2);
    const [c1, c2] = p.cells;
    assertEqual(c1.widget, 'scatter-chart');
    assertEqual(c1.config.yMin, c2.config.yMin);
    assertEqual(c1.config.yMax, c2.config.yMax);
    // Bereich 1,5 … 5,5 samt Gesamtmittel 3,5: 15 % von 4 = 0,6
    assertEqual(Math.round(c1.config.yMin * 100) / 100, 0.9);
    assertEqual(Math.round(c1.config.yMax * 100) / 100, 6.1);
    assertDeepEqual(c1.config.xTickLabels, ['a', 'b', 'c']);
    assertEqual(c1.config.refLines[0].value, 3.5);
  });

  test('main-effects: Faktor ohne Stufen ergibt eine Platzhalterzelle', () => {
    const p = built('main-effects', [num('y', [1, 2, 3]), cat('f1', ['a', 'b', 'a']), cat('f2', [null, null, null])]);
    assertEqual(p.cells[0].placeholder, false);
    assertEqual(p.cells[1].placeholder, true);
    assertEqual(p.cells[1].widget, null);
    assertEqual(p.cells[1].label, 'Für „main-effects“ keine Vorschau.');
  });

  test('main-effects: ohne Zahlenwerte entsteht nur die Platzhalterzelle', () => {
    const p = built('main-effects', [num('y', ['x', 'y', 'z']), cat('f1', ['a', 'b', 'a'])]);
    assertEqual(p.cells.length, 1);
    assertEqual(p.cells[0].placeholder, true);
    assertEqual(p.cells[0].widget, null);
    assertEqual(p.cells[0].label, 'Für „main-effects“ keine Vorschau.');
  });

  test('interaction-plot: eine Reihe je Stufe von B, fehlender Zellmittelwert null', () => {
    const p = built('interaction-plot', [num('y', [1, 2, 3]), cat('a', ['a1', 'a1', 'a2']), cat('b', ['b1', 'b2', 'b1'])]);
    assertEqual(p.kind, 'single');
    assertEqual(p.widget, 'scatter-chart');
    assertEqual(p.config.series.length, 2);
    assertDeepEqual(p.config.series[0].y, [1, 3]);
    assertDeepEqual(p.config.series[1].y, [2, null]);
    assertDeepEqual(p.config.xTickLabels, ['a1', 'a2']);
    assertEqual('legendTitle' in p.config, false);
    assertEqual(buildPreview('interaction-plot', [num('y', [1]), cat('a', ['a'])], L).kind, 'none');
  });

  test('boxplot: zwei Gruppenspalten ergeben eine Zeile, eine Gruppenspalte ein Diagramm', () => {
    const y = [1, 2, 3, 4, 5, 6];
    const a = ['p', 'q', 'p', 'q', 'p', 'q'], b = ['u', 'u', 'u', 'v', 'v', 'v'];
    const p = built('boxplot', [num('y', y), cat('a', a), cat('b', b)]);
    assertEqual(p.layout, 'row');
    assertEqual(p.n, 2);
    assertEqual(p.cells.length, 2);
    assertEqual(p.cells[0].widget, 'boxplot-chart');
    assertEqual(p.cells[0].config.xMin, p.cells[1].config.xMin);
    assertEqual(p.cells[0].config.xMax, p.cells[1].config.xMax);
    // Wertebereich 1 … 6, Rand 5 % von 5 = 0,25
    assertEqual(p.cells[0].config.xMin, 0.75);
    assertEqual(p.cells[0].config.xMax, 6.25);
    assertDeepEqual(p.cells[0].config.groups.map((g) => g.color), [CHART_COLORS[0], CHART_COLORS[1]]);
    assertDeepEqual(p.cells[0].config.groups.map((g) => g.name), ['p', 'q']);
    assertEqual(p.cells.every((c) => c.label === ''), true);
    assertEqual(p.cells[0].config.title, 'b: u');
    assertEqual(p.cells[0].config.groups.length, 2);
    const single = built('boxplot', [num('y', y), cat('a', a)]);
    assertEqual(single.kind, 'single');
    assertEqual(single.widget, 'boxplot-chart');
  });

  test('scatter-marginal: vier Zellen in fester Reihenfolge', () => {
    const cols = [num('x', ramp(12)), num('y', ramp(12, 2))];
    for (const [type, widget] of [['scatter-marginal-boxplot', 'boxplot-chart'], ['scatter-marginal-histogram', 'histogram-chart']]) {
      const p = built(type, cols);
      assertEqual(p.layout, 'marginal');
      assertEqual(p.cells.length, 4);
      assertEqual(p.cells[0].widget, widget);
      assertEqual(p.cells[1].widget, null);
      assertEqual(p.cells[1].label, '');
      assertEqual(p.cells[2].widget, 'scatter-chart');
      assertEqual(p.cells[3].widget, widget);
      assertEqual(p.cells[3].config.orientation, type.endsWith('boxplot') ? 'vertical' : 'horizontal');
      assertEqual(p.cells[0].config.xMin, p.cells[2].config.xMin);
      assertEqual(p.cells[3].config.yMin, p.cells[2].config.yMin);
    }
    assertEqual(buildPreview('scatter-marginal-boxplot', [num('x', [1, 2])], L).kind, 'none');
  });

  test('cusum: zwei Regelkarten C⁺ und C⁻, zu kurz oder ohne Streuung none', () => {
    const p = built('cusum', [num('v', [10, 11, 9, 10, 12, 8, 10, 13, 7, 10])]);
    assertEqual(p.layout, 'stack');
    assertEqual(p.cells.length, 2);
    assertEqual(p.cells[0].config.title, 'C⁺');
    assertEqual(p.cells[1].config.title, 'C⁻');
    assertEqual(p.cells.every((c) => c.label === ''), true);
    assertEqual(p.cells[0].widget, 'control-chart');
    assertEqual(p.cells[0].config.ucl.length, 1);
    assertEqual(Array.isArray(p.cells[0].config.violationIndices), true);
    const shift = Array.from({ length: 20 }, (_, i) => 10 + (i % 2 ? 0.2 : -0.2) + (i >= 10 ? 3 : 0));
    const q = built('cusum', [num('v', shift)]);
    const h = q.cells[0].config.ucl[0];
    assertEqual(q.cells[1].config.ucl[0], h);
    assertEqual(h > 0, true);
    assertEqual(q.cells[0].config.values.length, 20);
    assertDeepEqual(q.cells[0].config.violationIndices, [11, 12, 13, 14, 15, 16, 17, 18, 19]);
    assertDeepEqual(q.cells[1].config.violationIndices, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    assertEqual(buildPreview('cusum', [num('v', [1, 2])], L).kind, 'none');
    assertEqual(buildPreview('cusum', [num('v', [5, 5, 5, 5])], L).kind, 'none');
  });

  test('nicht zusammengesetzte Typen laufen über buildChartConfig', () => {
    const p = built('histogram', [num('v', ramp(10))]);
    assertEqual(p.kind, 'single');
    assertEqual(p.widget, 'histogram-chart');
    assertEqual(buildPreview('histogram', [], L).kind, 'none');
    assertEqual(buildPreview('unbekannt', [num('v', [1])], L).kind, 'none');
  });
});
