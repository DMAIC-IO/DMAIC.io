import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../test-utils.js';
import { checkValue, defaultOf, describeType, isWidget } from '../../js/core/model.js';
import histogramChart from '../../js/widgets/histogram-chart/schema.js';
import controlChart from '../../js/widgets/control-chart/schema.js';
import probabilityPlotChart from '../../js/widgets/probability-plot-chart/schema.js';
import scatterChart from '../../js/widgets/scatter-chart/schema.js';

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
});
