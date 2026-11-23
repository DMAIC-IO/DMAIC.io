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
import boxplotChart from '../../js/widgets/boxplot-chart/schema.js';
import individualValuePlotChart from '../../js/widgets/individual-value-plot-chart/schema.js';
import heatmapChart from '../../js/widgets/heatmap-chart/schema.js';
import Boxplot from '../../js/core/chart/types/boxplot.js';
import IndividualValuePlot from '../../js/core/chart/types/individual-value-plot.js';
import Heatmap from '../../js/core/chart/types/heatmap.js';
import Bar from '../../js/core/chart/types/bar.js';
import Mosaic from '../../js/core/chart/types/mosaic.js';
import RunChart from '../../js/core/chart/types/run-chart.js';
import Pareto from '../../js/core/chart/types/pareto.js';
import ChartBase from '../../js/core/chart/chart-base.js';
import contourChart, { CONTOUR_DEFAULTS } from '../../js/widgets/contour-chart/schema.js';
import ContourChart from '../../js/core/chart/types/contour.js';
import { COLOR_SCHEMES } from '../../js/core/chart/color-schemes.js';
import Pie from '../../js/core/chart/types/pie.js';
import multiVariChart from '../../js/widgets/multi-vari-chart/schema.js';
import gageRunChart from '../../js/widgets/gage-run-chart/schema.js';
import trendChart from '../../js/widgets/trend-chart/schema.js';
import nodeLinks from '../../js/widgets/node-links/schema.js';
import nodeDiagram from '../../js/widgets/node-diagram/schema.js';
import ganttChart from '../../js/widgets/gantt-chart/schema.js';
import cumulativeCostChart from '../../js/widgets/cumulative-cost-chart/schema.js';
import pieChart from '../../js/widgets/pie-chart/schema.js';
import { chartWidget } from '../../js/widgets/chart-parts.js';

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

  test('normalCurveColor wird angenommen, ist aber nicht editable', () => {
    const cfg = { data: [1, 2, 3], showNormalCurve: true, normalCurveColor: 'var(--color-info)' };
    assertDeepEqual(checkValue(histogramChart.props.config, 'c', cfg), cfg);
    assertTrue(!histogramChart.editable.base.includes('normalCurveColor'));
    assertDeepEqual(Object.keys(histogramChart.edits().fields || {}).filter((k) => k === 'normalCurveColor'), []);
  });

  test('bins und showLabel werden angenommen, bins ist nicht editable', () => {
    const cfg = { data: [], bins: [{ x0: 0, x1: 1, count: 2 }], refLines: [{ dir: 'v', value: 1, label: 'a', showLabel: true }] };
    assertDeepEqual(checkValue(histogramChart.props.config, 'c', cfg), cfg);
    assertTrue(!histogramChart.editable.base.includes('bins'));
    assertDeepEqual(Object.keys(histogramChart.edits().fields || {}).filter((k) => k === 'bins'), []);
  });

  test('edits(): Reihen nehmen label an (angezeigter Name), editable.series kennt es nicht', () => {
    for (const w of [histogramChart, scatterChart, probabilityPlotChart]) {
      const v = { series: [{ name: 'A', label: 'Mein A' }] };
      assertDeepEqual(checkValue(w.edits(), 'e', v), v);
      assertTrue(!w.editable.series.includes('label'));
    }
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
    assertDeepEqual(scatterChart.editable.series, ['connectLine', 'color', 'visible', 'symbol', 'markerSize', 'stroke', 'strokeWidth']);
  });

  test('Streudiagramm: Verbindungslinie je Reihe bearbeitbar, Schalter editConnectLine nur in der Konfiguration', () => {
    assertTrue(scatterChart.editable.series.includes('connectLine'));
    assertTrue('editConnectLine' in scatterChart.props.config.shape);
    assertTrue(!('editConnectLine' in scatterChart.edits().shape));
    assertTrue(!scatterChart.editable.base.includes('editConnectLine'));
    const cfg = { editConnectLine: true, series: [{ name: 'R', x: [1], y: [2], connectLine: { show: true, dash: 'dashdot', width: 2 } }] };
    assertDeepEqual(checkValue(scatterChart.props.config, 'c', cfg), cfg);
    assertThrows(() => checkValue(scatterChart.props.config, 'c', { editConnectLine: 'ja' }), /editConnectLine/);
  });

  test('Streudiagramm: Ticks, Verbindungslinie, Blasen, Lücken in y; Histogramm und Wahrscheinlichkeitsnetz: Ausrichtung und Farben', () => {
    const line = { show: true, dash: 'solid', width: 2, color: 'var(--color-chart-1)' };
    const sc = { xTicks: [0, 1, 2], xTickLabels: ['A', 'B', 'C'], xAxis: 'date', series: [{ name: 'R', x: [0, 1, 2], y: [1, null, 3], connectLine: line, sizes: [1, 2, 3], sizeValues: [10, 20, 30], sizeLabel: 'n' }] };
    assertDeepEqual(checkValue(scatterChart.props.config, 'c', sc), sc);
    assertThrows(() => checkValue(scatterChart.props.config, 'c', { connectLine: true }), /unknown c key "connectLine"/);
    assertThrows(() => checkValue(scatterChart.props.config, 'c', { xAxis: 'log' }), /xAxis/);
    const h = { orientation: 'horizontal', barColor: 'var(--color-chart-1)', data: [1, 2] };
    assertDeepEqual(checkValue(histogramChart.props.config, 'c', h), h);
    assertThrows(() => checkValue(histogramChart.props.config, 'c', { orientation: 'diagonal' }), /orientation/);
    const p = { markerColor: 'var(--color-chart-2)', data: [1, 2] };
    assertDeepEqual(checkValue(probabilityPlotChart.props.config, 'c', p), p);
  });

  test('Balken, Mosaik, Verlauf, Pareto: Name und Typ', () => {
    assertDeepEqual([barChart, mosaicChart, runChart, paretoChart].map((w) => [w.name, w.chartType]), [
      ['bar-chart', 'bar'], ['mosaic-chart', 'mosaic'], ['run-chart', 'run-chart'], ['pareto-chart', 'pareto'],
    ]);
  });

  test('Balken, Mosaik, Verlauf, Pareto: Konfigurationen des Moduls bestehen', () => {
    const groups = [{ name: 'B1', values: [1, 2], color: 'var(--color-chart-1)' }];
    const bar = { title: '', xLabel: 'A', yLabel: 'Anzahl', categories: ['x', 'y'], groups, stacked: true, showLegend: true, barGap: 2, categoryGap: 8 };
    assertDeepEqual(checkValue(barChart.props.config, 'c', bar), bar);
    const mosaic = { title: '', xLabel: 'A', yLabel: 'Anteil', categories: ['x', 'y'], groups, showLegend: true, columnGap: 2, segmentGap: 1, showCellLabels: true };
    assertDeepEqual(checkValue(mosaicChart.props.config, 'c', mosaic), mosaic);
    const run = { values: [1, 2, 3], median: 2, pointColor: 'var(--color-chart-1)', lineColor: 'var(--color-chart-1)' };
    assertDeepEqual(checkValue(runChart.props.config, 'c', run), run);
    const other = { otherBucket: true, otherLabel: 'Sonstige', otherCountTemplate: '{n} weitere' };
    const items = { title: 'T', items: [{ name: 'a', value: 3, color: 'var(--color-chart-1)' }], ...other };
    assertDeepEqual(checkValue(paretoChart.props.config, 'c', items), items);
    const cross = { categories: ['x', 'y'], groups, showLegend: true, maxItems: 10, ...other };
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

  test('Boxplot, Einzelwertdiagramm, Heatmap: Name und Typ', () => {
    assertDeepEqual([boxplotChart, individualValuePlotChart, heatmapChart].map((w) => [w.name, w.chartType]), [
      ['boxplot-chart', 'boxplot'], ['individual-value-plot-chart', 'individual-value-plot'], ['heatmap-chart', 'heatmap'],
    ]);
  });

  test('Boxplot, Einzelwertdiagramm, Heatmap: Konfigurationen des Moduls bestehen', () => {
    const groups = [{ name: 'A', values: [1, 2, 3], color: 'var(--color-chart-1)' }, { name: 'B', values: [2, 4], color: 'var(--color-chart-2)' }];
    const box = { title: '', xLabel: 'Y', showLegend: true, showMean: true, showOutliers: true, groups, orientation: 'vertical', boxHeight: 0.5,
      outlierSymbol: 'square', outlierSize: 5, outlierColor: null, outlierStroke: 'red', outlierStrokeWidth: 2, xMin: 0, xMax: 9, titleSize: 12 };
    assertDeepEqual(checkValue(boxplotChart.props.config, 'c', box), box);
    const ivp = { title: '', yLabel: 'Y', showLegend: true, groups, jitter: 0.4, showMean: true, showMedian: true, connectMeans: true, showOverallMean: true };
    assertDeepEqual(checkValue(individualValuePlotChart.props.config, 'c', ivp), ivp);
    const heat = { title: '', xLabel: 'B', yLabel: 'A', xCategories: ['u', 'v'], yCategories: ['p', 'q'], cells: [[1, null], [null, 4]],
      valueLabel: 'n', valueDecimals: 0, colorScheme: 'plasma', showCellLabels: false, cellGap: 2 };
    assertDeepEqual(checkValue(heatmapChart.props.config, 'c', heat), heat);
  });

  test('Einzelwertdiagramm: Symbol, Größe und Farben je Reihe sind bearbeitbar, Lücken in den Farben gültig', () => {
    for (const k of ['pointSymbol', 'pointSize', 'pointColors']) assertTrue(individualValuePlotChart.editable.base.includes(k), k);
    const e = { pointSymbol: 'square', pointSize: 9, pointColors: [null, '#123456'] };
    assertDeepEqual(checkValue(individualValuePlotChart.edits(), 'e', e), e);
    assertThrows(() => checkValue(individualValuePlotChart.edits(), 'e', { pointSize: -1 }), /pointSize/);
  });

  test('Boxplot: Boxfarben sind bearbeitbar, Lücken gültig', () => {
    assertTrue(boxplotChart.editable.base.includes('boxColors'));
    const e = { boxColors: [null, '#123456'] };
    assertDeepEqual(checkValue(boxplotChart.edits(), 'e', e), e);
    assertThrows(() => checkValue(boxplotChart.edits(), 'e', { boxColors: [1] }), /boxColors/);
  });

  test('Streudiagramm: errorBars nimmt die Form an und ist nicht bearbeitbar', () => {
    const eb = { show: true, yMode: 'relative', yPlus: [0.1, null], yMinus: [0.2, null] };
    const cfg = { series: [{ name: 'R', x: [1, 2], y: [1, 2], errorBars: eb }] };
    assertDeepEqual(checkValue(scatterChart.props.config, 'c', cfg), cfg);
    const band = { series: [{ name: 'R', x: [1], y: [1], errorBars: { show: true, bandShow: true, bandColor: 'red' } }] };
    assertDeepEqual(checkValue(scatterChart.props.config, 'c', band), band);
    assertThrows(() => checkValue(scatterChart.props.config, 'c', { series: [{ name: 'R', x: [1], y: [1], errorBars: { ...eb, yMode: 'log' } }] }), /yMode/);
    assertTrue(!scatterChart.editable.series.includes('errorBars'));
  });

  test('Heatmap: squareCells und plotMargins', () => {
    const cfg = { squareCells: true, plotMargins: { top: 6, right: 10, bottom: 22, left: 42 } };
    assertDeepEqual(checkValue(heatmapChart.props.config, 'c', cfg), cfg);
    assertThrows(() => checkValue(heatmapChart.props.config, 'c', { plotMargins: { top: 1 } }), /plotMargins/);
  });

  test('Boxplot: Ausrichtung nur horizontal oder vertical', () => {
    assertThrows(() => checkValue(boxplotChart.props.config, 'c', { orientation: 'diagonal' }), /orientation/);
    assertThrows(() => checkValue(heatmapChart.props.config, 'c', { cells: [['x']] }), /cells/);
  });

  test('Boxplot, Einzelwertdiagramm, Heatmap: bearbeitbar sind Basis plus editorKeys', () => {
    assertDeepEqual(boxplotChart.editable.base, [...Boxplot.editorKeys, 'boxColors']);
    assertDeepEqual(individualValuePlotChart.editable.base, [...IndividualValuePlot.editorKeys, 'pointSymbol', 'pointSize', 'pointColors']);
    assertDeepEqual(heatmapChart.editable.base, Heatmap.editorKeys);
    for (const w of [boxplotChart, individualValuePlotChart, heatmapChart]) assertDeepEqual(w.editable.series, []);
  });
  test('Torte: bearbeitbar ist genau PieChart.editorKeys, keine Achsenschlüssel', () => {
    assertEqual(pieChart.chartType, 'pie');
    assertDeepEqual(pieChart.editable.base, Pie.editorKeys);
    assertDeepEqual(pieChart.editable.series, []);
    assertThrows(() => checkValue(pieChart.edits(), 'e', { xLabel: 'x' }), /unknown e key "xLabel"/);
    assertDeepEqual(checkValue(pieChart.edits(), 'e', { innerRadius: 0.4, sortSlices: 'desc' }), { innerRadius: 0.4, sortSlices: 'desc' });
  });

  test('Torte: slices mit name, value, color; Modul-Schlüssel gültig, legendTitle und label abgelehnt', () => {
    const cfg = { title: 'T', slices: [{ name: 'A', value: 3, color: 'red' }, { name: 'B', value: 1 }], showLegend: true, centerLabel: 'n' };
    assertDeepEqual(checkValue(pieChart.props.config, 'c', cfg), cfg);
    assertThrows(() => checkValue(pieChart.props.config, 'c', { legendTitle: 'x' }), /unknown c key "legendTitle"/);
    assertThrows(() => checkValue(pieChart.props.config, 'c', { slices: [{ label: 'A', value: 1 }] }), /c\.slices\[0\]/);
  });

  test('chartWidget: editable legt die Liste fest, Unbekanntes wirft', () => {
    const w = chartWidget({ name: 'x', type: 'pie', editable: ['showLegend', 'title'] });
    assertDeepEqual(w.editable.base, ['showLegend', 'title']);
    assertThrows(() => checkValue(w.edits(), 'e', { bgColor: 'red' }), /unknown e key "bgColor"/);
    assertThrows(() => chartWidget({ name: 'x', type: 'pie', editable: ['title', 'nope'] }), /nope/);
  });

  test('Multi-Vari: Name, Typ, Konfiguration des Moduls, Basis bearbeitbar', () => {
    assertDeepEqual([multiVariChart.name, multiVariChart.chartType], ['multi-vari-chart', 'multi-vari']);
    const cfg = {
      title: '', showTitle: false, xLabel: 'A', showXLabel: true, yLabel: 'Y', showLegend: true,
      panels: [{ panelLevel: '', groups: [
        { level: 'g1', mean: 2, series: [{ level: 's1', values: [1, 2, 3], mean: 2 }] },
        { level: 'g2', mean: null, series: [] },
      ] }],
      seriesLevels: ['s1'], rowLabel: 'r', refValue: null, refLabel: 'Mittel', sharedYMin: 0, sharedYMax: 4,
      showPoints: true, connectMeans: false, showGroupMean: true,
    };
    assertDeepEqual(checkValue(multiVariChart.props.config, 'c', cfg), cfg);
    assertThrows(() => checkValue(multiVariChart.props.config, 'c', { legendTitle: 'x' }), /unknown c key "legendTitle"/);
    assertDeepEqual(multiVariChart.editable.base, ChartBase.editorKeys);
    assertDeepEqual(multiVariChart.editable.series, []);
  });

  test('Gage-Run: Name, Typ, Streifenkonfiguration mit leerer Zelle, Basis bearbeitbar', () => {
    assertDeepEqual([gageRunChart.name, gageRunChart.chartType], ['gage-run-chart', 'gage-run-chart']);
    const cfg = {
      title: '', showTitle: false, xLabel: 'Teil', showXLabel: true, yLabel: 'Y', showLegend: true,
      panels: [{ part: 'P1', series: [
        { operator: 'A', values: [1, 2], mean: 1.5 },
        { operator: 'B', values: [], mean: null },
      ] }],
      operators: ['A', 'B'], refValue: null, refLabel: 'Mittel', sharedYMin: 0, sharedYMax: 4,
      showOperatorMean: true, connectWithin: false,
    };
    assertDeepEqual(checkValue(gageRunChart.props.config, 'c', cfg), cfg);
    assertThrows(() => checkValue(gageRunChart.props.config, 'c', { legendTitle: 'x' }), /unknown c key "legendTitle"/);
    assertDeepEqual(gageRunChart.editable.base, ChartBase.editorKeys);
    assertDeepEqual(gageRunChart.editable.series, []);
  });
  test('Kontur: Name und Typ, Konfiguration des Moduls besteht', () => {
    assertEqual(contourChart.name, 'contour-chart');
    assertEqual(contourChart.chartType, 'contour');
    const cfg = {
      title: 'T', xLabel: 'x', yLabel: 'y', grid: [[1, null], [3, 4]], xRange: [0, 1], yRange: [0, 2], zLabel: 'z',
      points: [{ x: 0.5, y: 1, z: 2 }], ...CONTOUR_DEFAULTS,
    };
    assertDeepEqual(checkValue(contourChart.props.config, 'c', cfg), cfg);
  });

  test('Kontur: Stufen und Auflösung begrenzt, Farbschemata aus dem Framework', () => {
    assertThrows(() => checkValue(contourChart.props.config, 'c', { numLevels: 3 }), /numLevels/);
    assertThrows(() => checkValue(contourChart.props.config, 'c', { gridRes: 45 }), /gridRes/);
    assertThrows(() => checkValue(contourChart.props.config, 'c', { colorScheme: 'nope' }), /colorScheme/);
    for (const k of Object.keys(COLOR_SCHEMES)) checkValue(contourChart.props.config, 'c', { colorScheme: k });
  });

  test('Kontur: bearbeitbar ist die Basis ohne Legende, dann die eigenen Schlüssel', () => {
    assertTrue(!contourChart.editable.base.includes('showLegend'));
    assertDeepEqual(contourChart.editable.base, ContourChart.editorKeys.filter((k) => k !== 'showLegend'));
    assertDeepEqual(contourChart.editable.base.slice(0, 14), ChartBase.editorKeys.filter((k) => k !== 'showLegend'));
    assertDeepEqual(contourChart.editable.series, []);
  });

  test('Kontur: CONTOUR_DEFAULTS eingefroren mit den festgelegten Werten', () => {
    assertTrue(Object.isFrozen(CONTOUR_DEFAULTS));
    assertDeepEqual({ ...CONTOUR_DEFAULTS }, {
      numLevels: 10, gridRes: 100, colorScheme: 'viridis', showLines: true, showLabels: true, showDataPoints: false,
      markerSymbol: 'circle', markerSize: 10, markerColor: 'var(--color-text-primary)', markerStroke: 'var(--color-bg-primary)',
      markerStrokeWidth: 2, markerStrokeDash: 'solid',
    });
  });

  test('Trend: Name, Typ, volle Konfiguration, hiddenSeries bearbeitbar, Funktion abgelehnt', () => {
    assertDeepEqual([trendChart.name, trendChart.chartType], ['trend-chart', 'trend']);
    const cfg = {
      series: [
        { sid: 'H-001', name: 'A', color: 'var(--ishikawa-line-1)', points: [{ x: 0, y: 2 }, { x: 1, y: null }] },
      ],
      xLabels: [{ date: '01.01.', name: 'S1' }, { date: '02.01.', name: 'S2' }],
      xCount: 2, layout: { padT: 30, padR: 30, padB: 55, padL: 45 }, hiddenSeries: ['H-002'],
    };
    assertDeepEqual(checkValue(trendChart.props.config, 'c', cfg), cfg);
    assertTrue(trendChart.editable.base.includes('hiddenSeries'));
    assertThrows(() => checkValue(trendChart.props.config, 'c', { ...cfg, onToggle: () => {} }), /onToggle/);
    assertThrows(() => checkValue(trendChart.props.config, 'c', { hiddenSeries: [() => 1] }), /hiddenSeries/);
  });

  test('Gantt: Name, Typ, volle Konfiguration, nichts bearbeitbar außer der Basis, Funktion abgelehnt', () => {
    assertDeepEqual([ganttChart.name, ganttChart.chartType], ['gantt-chart', 'gantt']);
    const cfg = {
      tasks: [{ start: 1, end: 2, label: 'A', status: 'done', color: 'var(--ishikawa-status-done)', responsible: 'x', startDate: '01.01.', endDate: '02.01.' }],
      xDomain: { minT: 1, maxT: 2 }, ticks: [1, 2], tickLabels: ['a', 'b'], stepDays: 1, now: 1, showToday: true, todayLabel: 'Heute',
      layout: { labelW: 220, padL: 8, padR: 16, padT: 30, padB: 24, rowH: 26 },
    };
    assertDeepEqual(checkValue(ganttChart.props.config, 'c', cfg), cfg);
    assertThrows(() => checkValue(ganttChart.props.config, 'c', { ...cfg, onToggle: () => {} }), /onToggle/);
    assertThrows(() => checkValue(ganttChart.props.config, 'c', { tasks: [{ start: 'x', end: 2, label: 'A' }] }), /tasks/);
  });

  test('Kostenverlauf: Name, Typ, volle Konfiguration, Modus geprüft', () => {
    assertDeepEqual([cumulativeCostChart.name, cumulativeCostChart.chartType], ['cumulative-cost-chart', 'cumulative-cost']);
    const cfg = {
      mode: 'rate', moneyPts: [{ t: 1, v: 2 }], hoursPts: [{ t: 1, v: 3 }], peakMoney: 2, peakHours: 3,
      xDomain: { min: 1, max: 2 }, ticks: [1], tickLabels: ['a'], stepDays: 1, moneyUnit: '€/d', hoursUnit: 'h/d',
      moneyLabel: 'Geld', hoursLabel: 'Stunden', now: 1, showToday: false, lang: 'de',
      layout: { labelW: 220, padL: 8, padR: 48, padT: 16, padB: 28, innerH: 140 },
    };
    assertDeepEqual(checkValue(cumulativeCostChart.props.config, 'c', cfg), cfg);
    assertThrows(() => checkValue(cumulativeCostChart.props.config, 'c', { ...cfg, mode: 'x' }), /mode/);
    assertThrows(() => checkValue(cumulativeCostChart.props.config, 'c', { ...cfg, moneyPts: [{ t: 1 }] }), /moneyPts/);
  });

  test('Pareto: rightYLabel ist Text, aber nicht im Editor bearbeitbar', () => {
    assertDeepEqual(checkValue(paretoChart.props.config, 'c', { rightYLabel: 'Kumuliert %' }), { rightYLabel: 'Kumuliert %' });
    assertThrows(() => checkValue(paretoChart.props.config, 'c', { rightYLabel: 5 }), /rightYLabel/);
    assertTrue(!paretoChart.editable.base.includes('rightYLabel'));
  });
  test('Knotenlinien: Name, Typ, volle Überlagerungs-Konfiguration, Knoten abgelehnt', () => {
    assertDeepEqual([nodeLinks.name, nodeLinks.chartType], ['node-links', 'node-diagram']);
    const cfg = {
      links: [
        { from: 'a', to: 'b', shape: 'curve', x1: 10, y1: 20, x2: 30, y2: 40, color: 'var(--color-border)', width: 2, dash: '6 4', highlight: true },
        { from: 'a', to: 'c', shape: 'elbow', x1: 10, y1: 20, x2: 50, y2: 60 },
      ],
      highlightClass: 'pc__org-line--hl', padding: 0, origin: 'zero',
    };
    assertDeepEqual(checkValue(nodeLinks.props.config, 'c', cfg), cfg);
    assertThrows(() => checkValue(nodeLinks.props.config, 'c', { ...cfg, nodes: [] }), /nodes/);
    assertThrows(() => checkValue(nodeLinks.props.config, 'c', { origin: 'middle' }), /origin/);
    assertThrows(() => checkValue(nodeLinks.props.config, 'c', { links: [{ from: 'a', to: 'b', shape: 'zigzag' }] }), /shape/);
  });
  test('node-diagram: Name, Typ, Rollen, Schlüssel, unbekannte Form abgelehnt', () => {
    assertDeepEqual([nodeDiagram.name, nodeDiagram.chartType], ['node-diagram', 'node-diagram']);
    const cfg = {
      nodes: [{ id: 'a', x: 1, y: 2, w: 3, h: 4, shape: 'ellipse', fill: 'red', stroke: 'blue', strokeWidth: 2, dash: '4 2', padY: 3, align: 'center', highlight: true, lines: [{ text: 'A', weight: 600, color: 'red', size: 12, muted: true }] }],
      links: [{ id: 'l', from: 'a', to: 'b', shape: 'straight', x1: 1, y1: 2, x2: 3, y2: 4, offset: 5, via: { x: 1, y: 2 }, label: 'hält', arrow: 'end', style: 'wave', width: 2, dash: '6 4', color: 'red', highlight: true }],
      highlightClass: 'hl', padding: 0, origin: 'zero',
    };
    assertDeepEqual(checkValue(nodeDiagram.props.config, 'c', cfg), cfg);
    assertThrows(() => checkValue(nodeDiagram.props.config, 'c', { links: [{ from: 'a', to: 'b', style: 'zig' }] }), /style/);
    assertThrows(() => checkValue(nodeDiagram.props.config, 'c', { links: [{ from: 'a', to: 'b', arrow: 'start' }] }), /arrow/);
    assertThrows(() => checkValue(nodeDiagram.props.config, 'c', { badge: 1 }), /badge/);
    assertDeepEqual(nodeDiagram.roles, ['moveLabel', 'select']);
    assertEqual(checkValue(nodeDiagram.props.config, 'c', { commands: { moveLabel: 'moveLabel' }, commandArgs: { x: 'y' } }).commands.moveLabel, 'moveLabel');
  });
});
