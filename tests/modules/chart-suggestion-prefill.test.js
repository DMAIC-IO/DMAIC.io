/**
 * Unit tests for chart-suggestion domain/prefill.js (Diagrammtyp → Zielmodul-Vorbelegung).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { buildPrefill, MODULE_PREFILL } from '../../js/modules/chart-suggestion/domain/prefill.js';
import { State as XyState } from '../../js/modules/xy-plot/domain/model.js';

function col(id, role, values, name) {
  return { id, name: name || id, role, type: role === 'date' ? 'date' : (role === 'continuous' ? 'numeric' : 'text'), values, roleConfirmed: false };
}
const cont = (n, id) => col(id || 'c', 'continuous', Array.from({ length: n }, (_, i) => i + 1));
const cat = (vals, id) => col(id || 'g', 'categorical', vals);

suite('chart-suggestion domain — buildPrefill', () => {
  test('MODULE_PREFILL ist exportiert', () => {
    assertEqual(typeof MODULE_PREFILL.histogram, 'function');
  });

  test('null ohne Quellkennungen', () => {
    assertEqual(buildPrefill('scatter', [cont(10, 'a'), cont(10, 'b')], '', ''), null);
    assertEqual(buildPrefill('scatter', [cont(10, 'a'), cont(10, 'b')], 'ws', ''), null);
  });

  test('null für Typen ohne Zielmodul (pie, unbekannt, null)', () => {
    assertEqual(buildPrefill('pie', [cat(['a', 'b'], 'g')], 'ws', 's'), null);
    assertEqual(buildPrefill('nope', [cont(3)], 'ws', 's'), null);
    assertEqual(buildPrefill(null, [cont(3)], 'ws', 's'), null);
  });

  test('scatter → xy-plot mit zwei Bezügen', () => {
    const p = buildPrefill('scatter', [cont(10, 'a'), cont(10, 'b')], 'ws', 's');
    assertEqual(p.target, 'xy-plot');
    assertDeepEqual(p.state.datasets[0].xRef, { instanceId: 'ws', sheetId: 's', columnId: 'a' });
    assertEqual(p.state.datasets[0].yRef.columnId, 'b');
    assertEqual(p.state.datasets[0].groupRef, null);
  });

  test('scatter → xy-plot: die Vorbelegung lädt über die Migration als Zeile x/y', () => {
    const p = buildPrefill('scatter', [cont(10, 'a'), cont(10, 'b')], 'ws', 's');
    const m = XyState.fromJSON(p.state);
    assertDeepEqual(JSON.parse(JSON.stringify(m.datasets)), [{
      x: { instanceId: 'ws', sheetId: 's', columnId: 'a' },
      y: { instanceId: 'ws', sheetId: 's', columnId: 'b' },
      group: null,
      size: null,
    }]);
  });

  test('scatter mit einer stetigen Spalte → null', () => {
    assertEqual(buildPrefill('scatter', [cont(10, 'a')], 'ws', 's'), null);
  });

  test('histogram → datasets mit valueRef', () => {
    const p = buildPrefill('histogram', [cont(20, 'a')], 'ws', 's');
    assertEqual(p.target, 'histogram');
    assertEqual(p.state.datasets[0].valueRef.columnId, 'a');
  });

  test('bar mit 1 stetig + 1 kategorial', () => {
    const p = buildPrefill('bar', [cont(10, 'y'), cat(['A', 'B'], 'g')], 'ws', 's');
    assertEqual(p.target, 'bar');
    assertEqual(p.state.xRef.columnId, 'g');
    assertEqual(p.state.yRef.columnId, 'y');
    assertEqual(p.state.gRef, null);
  });

  test('bar mit 2 kategorial → gestapelt', () => {
    const p = buildPrefill('bar', [cat(['X'], 'a'), cat(['P'], 'b')], 'ws', 's');
    assertEqual(p.state.xRef.columnId, 'a');
    assertEqual(p.state.gRef.columnId, 'b');
    assertEqual(p.state.chartConfig.stacked, true);
  });

  test('mosaic braucht 2 kategoriale', () => {
    assertEqual(buildPrefill('mosaic', [cat(['X'], 'a')], 'ws', 's'), null);
    const p = buildPrefill('mosaic', [cat(['X'], 'a'), cat(['P'], 'b')], 'ws', 's');
    assertEqual(p.target, 'mosaic');
    assertEqual(p.state.gRef.columnId, 'b');
  });

  test('heatmap mit 1 stetig + 2 kategorial → Mittelwert', () => {
    const p = buildPrefill('heatmap', [cont(10, 'y'), cat(['A'], 'a'), cat(['P'], 'b')], 'ws', 's');
    assertEqual(p.target, 'heatmap');
    assertEqual(p.state.vRef.columnId, 'y');
    assertEqual(p.state.chartConfig.aggregation, 'mean');
  });

  test('run-chart, probability-plot → columnRef', () => {
    assertEqual(buildPrefill('run-chart', [cont(10, 'a')], 'ws', 's').state.columnRef.columnId, 'a');
    const p = buildPrefill('probability-plot', [cont(10, 'a')], 'ws', 's');
    assertEqual(p.target, 'probability-plot');
    assertEqual(p.state.columnRef.columnId, 'a');
  });

  test('transformed-imr-chart mit lambdaMode auto', () => {
    const p = buildPrefill('transformed-imr-chart', [cont(30, 'a')], 'ws', 's');
    assertEqual(p.target, 'transformed-imr-chart');
    assertEqual(p.state.lambdaMode, 'auto');
  });

  test('control-chart → I-MR; mit Datumsspalte → null', () => {
    const p = buildPrefill('control-chart', [cont(30, 'a')], 'ws', 's');
    assertEqual(p.target, 'control-chart');
    assertEqual(p.state.chartTypeId, 'i-mr');
    const d = col('d', 'date', ['2026-01-02', '2026-01-01']);
    assertEqual(buildPrefill('control-chart', [d, cont(2, 'a')], 'ws', 's'), null);
  });

  test('boxplot/ivp: ein Gruppenbezug je Reihe', () => {
    const p = buildPrefill('boxplot', [cont(5, 'a'), cont(5, 'b'), cat(['x'], 'g')], 'ws', 's');
    assertEqual(p.state.seriesRefs.length, 2);
    assertEqual(p.state.groupRefs[1].columnId, 'g');
    const q = buildPrefill('individual-value-plot', [cont(5, 'a')], 'ws', 's');
    assertEqual(q.target, 'individual-value-plot');
    assertEqual(q.state.groupRefs[0], null);
  });

  test('pareto', () => {
    const p = buildPrefill('pareto', [cat(['a'], 'x'), cat(['b'], 'y')], 'ws', 's');
    assertEqual(p.target, 'pareto');
    assertEqual(p.state.gRef.columnId, 'y');
  });
});
