import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../test-utils.js';
import { checkValue, defaultOf, describeType, isWidget } from '../../js/core/model.js';
import histogramChart from '../../js/widgets/histogram-chart/schema.js';
import controlChart from '../../js/widgets/control-chart/schema.js';
import probabilityPlotChart from '../../js/widgets/probability-plot-chart/schema.js';
import scatterChart from '../../js/widgets/scatter-chart/schema.js';
import barChart from '../../js/widgets/bar-chart/schema.js';
import mosaicChart from '../../js/widgets/mosaic-chart/schema.js';
import runChart from '../../js/widgets/run-chart/schema.js';
import paretoChart from '../../js/widgets/pareto-chart/schema.js';
import Bar from '../../js/core/chart/types/bar.js';
import Mosaic from '../../js/core/chart/types/mosaic.js';
import RunChart from '../../js/core/chart/types/run-chart.js';
import Pareto from '../../js/core/chart/types/pareto.js';

suite('Diagramm-Widgets: Schemas', () => {
  test('ein Widget je Typ', () => {
    assertDeepEqual([histogramChart, controlChart, probabilityPlotChart, scatterChart].map((w) => [w.name, w.chartType]), [
      ['histogram-chart', 'histogram'], ['control-chart', 'control-chart'],
      ['probability-plot-chart', 'probability-plot'], ['scatter-chart', 'scatter'],
    ]);
    assertTrue(isWidget(histogramChart));
  });

  test('config: Basis und Typschlüssel, unbekannter Schlüssel abgelehnt, null erlaubt', () => {
    const cfg = { title: 'H', showLegend: false, barGap: 1, series: [{ name: 'A', values: [1, 2], fillColor: 'red' }] };
    assertDeepEqual(checkValue(histogramChart.props.config, 'c', cfg), cfg);
    assertEqual(checkValue(histogramChart.props.config, 'c', null), null);
    assertThrows(() => checkValue(histogramChart.props.config, 'c', { nope: 1 }), /unknown c key "nope"/);
    assertThrows(() => checkValue(histogramChart.props.config, 'c', { series: [{ name: 'A', values: ['x'] }] }), /c\.series\[0\]\.values\[0\]/);
  });

  test('bins und showLabel werden angenommen, bins ist nicht editable', () => {
    const cfg = { data: [], bins: [{ x0: 0, x1: 1, count: 2 }], refLines: [{ dir: 'v', value: 1, label: 'a', showLabel: true }] };
    assertDeepEqual(checkValue(histogramChart.props.config, 'c', cfg), cfg);
    assertTrue(!histogramChart.editable.base.includes('bins'));
    assertDeepEqual(Object.keys(histogramChart.edits().fields || {}).filter((k) => k === 'bins'), []);
  });

  test('edits(): bearbeitbare Teilmenge, alles optional, Reihen mit Namen', () => {
    const e = histogramChart.edits();
    assertDeepEqual(defaultOf(e), {});
    assertDeepEqual(histogramChart.editable.base, ['title', 'showTitle', 'xLabel', 'yLabel', 'showXLabel', 'showYLabel', 'showLegend',
      'titleSize', 'labelSize', 'tickSize', 'showXTicks', 'showYTicks', 'bgColor', 'refLines', 'refAreas', 'barGap', 'pareto', 'boxplotStrip']);
    assertDeepEqual(histogramChart.editable.series, ['fillColor', 'borderColor', 'borderWidth', 'borderStyle', 'pattern', 'patternColor', 'patternSolidity', 'visible', 'showNormalCurve']);
    assertDeepEqual(checkValue(e, 'e', { title: 'X', series: [{ name: 'A', fillColor: 'red' }] }), { title: 'X', series: [{ name: 'A', fillColor: 'red' }] });
    assertThrows(() => checkValue(e, 'e', { binWidth: 2 }), /unknown e key "binWidth"/);
    assertThrows(() => checkValue(e, 'e', { series: [{ fillColor: 'red' }] }), /name/);
    assertTrue(describeType(e).startsWith('{ title?: string'));
  });

  test('Regelkarte: Grenzen als Liste, Indizes als Liste', () => {
    const cfg = { values: [1, 2], cl: [1.5], ucl: [3, 3], lcl: [0, 0], sigma: [0.5], violationIndices: [1], showZones: true };
    assertDeepEqual(checkValue(controlChart.props.config, 'c', cfg), cfg);
    assertDeepEqual(controlChart.editable.series, []);
    assertTrue(controlChart.editable.base.includes('pointColor'));
  });

  test('Streudiagramm und Wahrscheinlichkeitsnetz: Reihen', () => {
    checkValue(scatterChart.props.config, 'c', { series: [{ name: 'R', x: [1], y: [2], color: 'var(--color-chart-3)', markerSize: 4, strokeWidth: 0.75, symbol: 'circle' }], refLines: [{ dir: 'h', value: 0, dash: 'dash', width: 1, color: 'var(--color-error)', label: '0' }] });
    checkValue(probabilityPlotChart.props.config, 'c', { series: [{ name: 'R', values: [0.1, -0.2], color: 'var(--color-chart-5)' }] });
    assertDeepEqual(scatterChart.editable.series, ['color', 'visible', 'symbol', 'markerSize', 'stroke', 'strokeWidth']);
  });

  test('Balken, Mosaik, Verlauf, Pareto: Name und Typ', () => {
    assertDeepEqual([barChart, mosaicChart, runChart, paretoChart].map((w) => [w.name, w.chartType]), [
      ['bar-chart', 'bar'], ['mosaic-chart', 'mosaic'], ['run-chart', 'run-chart'], ['pareto-chart', 'pareto'],
    ]);
  });

  test('Balken, Mosaik, Verlauf, Pareto: Konfigurationen des Moduls bestehen', () => {
    const groups = [{ name: 'B1', values: [1, 2], color: 'var(--color-chart-1)' }];
    const bar = { title: '', xLabel: 'A', yLabel: 'Anzahl', categories: ['x', 'y'], groups, stacked: true, showLegend: true };
    assertDeepEqual(checkValue(barChart.props.config, 'c', bar), bar);
    const mosaic = { title: '', xLabel: 'A', yLabel: 'Anteil', categories: ['x', 'y'], groups, showLegend: true, columnGap: 2, segmentGap: 1, showCellLabels: true };
    assertDeepEqual(checkValue(mosaicChart.props.config, 'c', mosaic), mosaic);
    const run = { values: [1, 2, 3], median: 2, pointColor: 'var(--color-chart-1)', lineColor: 'var(--color-chart-1)' };
    assertDeepEqual(checkValue(runChart.props.config, 'c', run), run);
    const other = { otherBucket: true, otherLabel: 'Sonstige', otherCountTemplate: '{n} weitere' };
    const items = { title: 'T', items: [{ name: 'a', value: 3, color: 'var(--color-chart-1)' }], ...other };
    assertDeepEqual(checkValue(paretoChart.props.config, 'c', items), items);
    const cross = { categories: ['x', 'y'], groups, showLegend: true, ...other };
    assertDeepEqual(checkValue(paretoChart.props.config, 'c', cross), cross);
  });

  test('legendTitle wird abgelehnt', () => {
    for (const w of [barChart, mosaicChart, runChart, paretoChart]) {
      assertThrows(() => checkValue(w.props.config, 'c', { legendTitle: 'x' }), /unknown c key "legendTitle"/);
    }
  });

  test('bearbeitbar: Basis plus editorKeys des Typs, Listen ohne bearbeitbaren Teil', () => {
    assertDeepEqual(barChart.editable.base, Bar.editorKeys);
    assertDeepEqual(runChart.editable.base, RunChart.editorKeys);
    assertDeepEqual(mosaicChart.editable.base, Mosaic.editorKeys);
    assertDeepEqual(paretoChart.editable.base, Pareto.editorKeys);
    for (const w of [barChart, mosaicChart, runChart, paretoChart]) assertDeepEqual(w.editable.series, []);
  });
});
