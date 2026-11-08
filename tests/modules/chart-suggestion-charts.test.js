/**
 * Unit tests for chart-suggestion domain/charts.js (Vorschaukonfigurationen als Widget-Eingaben).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { buildChartConfig } from '../../js/modules/chart-suggestion/domain/charts.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { checkValue } from '../../js/core/model.js';

const L = {
  frequency: 'Häufigkeit', observation: 'Beobachtung', count: 'Anzahl', proportion: 'Anteil', mean: 'Mittelwert',
  other: 'Sonstige', otherCategories: '{n} weitere', percentile: 'Perzentil', variable: 'Variable', value: 'Wert', cumulativeSum: 'Kumulierte Summe',
};
function col(id, role, values, name) {
  return { id, name: name || id, role, type: role === 'date' ? 'date' : (role === 'continuous' ? 'numeric' : 'text'), values, roleConfirmed: false };
}
const num = (vals, id) => col(id || 'c', 'continuous', vals);
const cat = (vals, id) => col(id || 'g', 'categorical', vals);
const dat = (vals, id) => col(id || 'd', 'date', vals);
const ramp = (n) => Array.from({ length: n }, (_, i) => 10 + ((i * 7) % 5) + i * 0.1);

/** Baut, prüft gegen das Widget-Schema und liefert das Ergebnis. */
function built(type, cols) {
  const r = buildChartConfig(type, cols, L);
  if (r) checkValue(WIDGETS[r.widget].schema.props.config, 'c', r.config);
  return r;
}

suite('chart-suggestion domain — buildChartConfig', () => {
  test('Widget je Typ, kein chartType in config', () => {
    const cases = {
      histogram: [[num(ramp(10))], 'histogram-chart'],
      boxplot: [[num(ramp(10))], 'boxplot-chart'],
      'individual-value-plot': [[num(ramp(10))], 'individual-value-plot-chart'],
      'run-chart': [[num(ramp(10))], 'run-chart'],
      scatter: [[num(ramp(10), 'x'), num(ramp(10), 'y')], 'scatter-chart'],
      bubble: [[num([1, 2, 3], 'x'), num([4, 5, 6], 'y'), num([1, 4, 9], 's')], 'scatter-chart'],
      bar: [[cat(['a', 'b', 'a'])], 'bar-chart'],
      mosaic: [[cat(['a', 'b', 'a'], 'g1'), cat(['x', 'x', 'y'], 'g2')], 'mosaic-chart'],
      heatmap: [[cat(['a', 'b', 'a'], 'g1'), cat(['x', 'x', 'y'], 'g2')], 'heatmap-chart'],
      pareto: [[cat(['a', 'b', 'a'])], 'pareto-chart'],
      pie: [[cat(['a', 'b', 'a'])], 'pie-chart'],
      'probability-plot': [[num(ramp(10))], 'probability-plot-chart'],
      'control-chart': [[num(ramp(10))], 'control-chart'],
      'transformed-imr-chart': [[num(ramp(10))], 'control-chart'],
      ewma: [[num(ramp(10))], 'control-chart'],
    };
    for (const [type, [cols, widget]] of Object.entries(cases)) {
      const r = built(type, cols);
      assertEqual(r?.widget, widget, type);
      assertEqual('chartType' in r.config, false, `${type} chartType`);
      assertEqual('legendTitle' in r.config, false, `${type} legendTitle`);
    }
  });

  test('zu wenig Spalten und unbekannter Typ ergeben null', () => {
    assertEqual(buildChartConfig('scatter', [num([1, 2])], L), null);
    assertEqual(buildChartConfig('bubble', [num([1]), num([2])], L), null);
    assertEqual(buildChartConfig('pie', [num([1, 2])], L), null);
    assertEqual(buildChartConfig('mosaic', [cat(['a'])], L), null);
    assertEqual(buildChartConfig('histogram', [], L), null);
    assertEqual(buildChartConfig('nope', [num([1])], L), null);
  });

  test('Histogramm: Achsentitel und Daten', () => {
    const { config } = built('histogram', [num(['1', '2,5', ''], 'Länge')]);
    assertEqual(config.yLabel, 'Häufigkeit');
    assertDeepEqual(config.data, [1, 2.5]);
    assertEqual(config.showNormalCurve, true);
  });

  test('Verlaufsdiagramm: Median', () => {
    assertEqual(built('run-chart', [num([1, 5, 2])]).config.median, 2);
    assertEqual(built('run-chart', [num([1, 5, 2, 4])]).config.median, 3);
    assertEqual(built('run-chart', [num([1, 5, 2])]).config.xLabel, 'Beobachtung');
  });

  test('Boxplot mehrerer Antworten: Variable/Wert', () => {
    const { config } = built('boxplot', [num([1, 2], 'a'), num([3, 4], 'b')]);
    assertEqual(config.xLabel, 'Variable');
    assertEqual(config.yLabel, 'Wert');
    assertEqual(config.showLegend, true);
  });

  test('Streudiagramm: nicht lesbare Paare fallen weg', () => {
    const { config } = built('scatter', [num([1, '2,5', '', 4], 'x'), num([10, 20, 30, 'x'], 'y')]);
    assertDeepEqual(config.series[0].x, [1, 2.5]);
    assertDeepEqual(config.series[0].y, [10, 20]);
  });

  test('Datumslinien: xAxis date, kein xTickFormat, keine legendTitle', () => {
    const d = dat(['2026-01-02', '2026-01-01', '2026-01-03'], 'Tag');
    const { widget, config } = built('scatter', [d, num([2, 1, 3], 'y'), cat(['a', 'a', 'b'], 'g')]);
    assertEqual(widget, 'scatter-chart');
    assertEqual(config.xAxis, 'date');
    assertEqual('xTickFormat' in config, false);
    assertEqual('legendTitle' in config, false);
    assertEqual(config.series.length, 2);
    assertEqual(config.series[0].x[0] < config.series[0].x[1] || config.series[0].x.length === 2, true);
    assertEqual(config.showLegend, true);
  });

  test('Blase: Größen und Rohwerte', () => {
    const { config } = built('bubble', [num([1, 2, 3], 'x'), num([4, 5, 6], 'y'), num([1, 4, 9], 's')]);
    assertEqual(config.showLegend, false);
    assertDeepEqual(config.series[0].sizeValues, [1, 4, 9]);
    assertEqual(config.series[0].sizes[0], 6);
    assertEqual(config.series[0].sizes[2], 28);
  });

  test('Balken: gestapelt, nach Mittelwert, Zählung', () => {
    const stacked = built('bar', [cat(['a', 'b', 'a'], 'A'), cat(['x', 'x', 'y'], 'B')]).config;
    assertEqual(stacked.stacked, true);
    assertEqual(stacked.yLabel, 'Anzahl');
    const means = built('bar', [num([1, 3, 5], 'y'), cat(['a', 'a', 'b'], 'f')]).config;
    assertDeepEqual(means.categories, ['a', 'b']);
    assertDeepEqual(means.groups[0].values, [2, 5]);
    const counts = built('bar', [cat(['a', 'b', 'a'], 'f')]).config;
    assertDeepEqual(counts.groups[0].values, [2, 1]);
  });

  test('Heatmap: Mittelwerte mit leerer Zelle als null', () => {
    const { config } = built('heatmap', [num([1, 2], 'y'), cat(['a', 'b'], 'A'), cat(['x', 'y'], 'B')]);
    assertEqual(config.valueLabel, 'Mittelwert');
    assertEqual(config.valueDecimals, 2);
    assertEqual(config.cells.flat().includes(null), true);
    assertEqual(config.cells.flat().some(Number.isNaN), false);
    const counts = built('heatmap', [cat(['a', 'b'], 'A'), cat(['x', 'y'], 'B')]).config;
    assertEqual(counts.valueLabel, 'Anzahl');
    assertEqual(counts.valueDecimals, 0);
  });

  test('Pareto: Sonstige-Texte', () => {
    const { config } = built('pareto', [cat(['a', 'b', 'a'])]);
    assertEqual(config.otherLabel, 'Sonstige');
    assertEqual(config.otherCountTemplate, '{n} weitere');
    assertEqual(config.items[0].name, 'a');
    assertEqual(config.items[0].value, 2);
  });

  test('Torte: Segmente mit name', () => {
    const { config } = built('pie', [cat(['a', 'b', 'a'])]);
    assertDeepEqual(config.slices.map(s => [s.name, s.value]), [['a', 2], ['b', 1]]);
    assertEqual('label' in config.slices[0], false);
  });

  test('Wahrscheinlichkeitsnetz: Perzentil', () => {
    assertEqual(built('probability-plot', [num(ramp(10))]).config.yLabel, 'Perzentil');
  });

  test('Regelkarte: Grenzen als einelementige Listen', () => {
    const { config } = built('control-chart', [num(ramp(10))]);
    for (const k of ['cl', 'ucl', 'lcl', 'sigma']) assertEqual(config[k].length, 1, k);
    assertEqual(config.xLabel, 'Beobachtung');
    assertEqual(typeof config.labels[0], 'string');
  });

  test('transformierte IMR und EWMA: Signale aufsteigend als Liste', () => {
    const series = {
      'transformed-imr-chart': [10, 11, 10.5, 12, 11.5, 10.2, 11.1, 10.8, 25, 11.3, 10.9, 11.7],
      ewma: [...ramp(10), ...ramp(10).map((v) => v + 20)],
    };
    for (const [type, vals] of Object.entries(series)) {
      const { config } = built(type, [num(vals)]);
      assertEqual(Array.isArray(config.violationIndices), true, type);
      assertDeepEqual(config.violationIndices, [...config.violationIndices].sort((a, b) => a - b), type);
      assertEqual(config.showZones, false);
      for (const k of ['cl', 'ucl', 'lcl']) assertEqual(Array.isArray(config[k]), true, `${type} ${k}`);
    }
    assertEqual(built('ewma', [num(series.ewma)]).config.violationIndices.length > 0, true);
  });

  test('zu kurze oder nicht positive Reihen ergeben null', () => {
    assertEqual(buildChartConfig('control-chart', [num([1])], L), null);
    assertEqual(buildChartConfig('transformed-imr-chart', [num([1, 2, -3, 4])], L), null);
    assertEqual(buildChartConfig('ewma', [num([1, 2])], L), null);
  });
});
