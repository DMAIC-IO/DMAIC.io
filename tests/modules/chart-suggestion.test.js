/**
 * Unit tests for the chart-suggestion Model (chart-suggestion-model.js).
 *
 * The Model wraps the shared core rule-engine (getSuggestionsFor) plus the
 * selection state, pick-preservation, prefill adapters and persistence. The
 * pure rule-engine itself is covered separately in tests/core/chart-suggestions.test.js.
 */
import { suite, test, assertEqual } from '../test-utils.js';
import { State } from '../../js/modules/chart-suggestion/chart-suggestion-model.js';

function sel(columns, extra = {}) {
  return { sourceInstanceId: 'ws-1', sourceSheetId: 'sheet-1', ts: 123, columns, ...extra };
}
function col(id, role, values, name) {
  return { id, name: name || id, role, type: role === 'date' ? 'date' : (role === 'continuous' ? 'numeric' : 'text'), values };
}
const cont = (n, id) => col(id || 'c', 'continuous', Array.from({ length: n }, (_, i) => i + 1));
const cat = (vals, id) => col(id || 'g', 'categorical', vals);

suite('chart-suggestion Model — defaults & persistence', () => {
  test('constructor sets null defaults', () => {
    const s = new State();
    assertEqual(s.selection, null);
    assertEqual(s.selectedChartType, null);
    assertEqual(s.exampleWorksheetId, null);
  });

  test('hasContent false on empty default', () => {
    assertEqual(new State().hasContent(), false);
  });

  test('hasContent true when selection has columns', () => {
    const s = new State();
    s.selection = sel([cont(20)]);
    assertEqual(s.hasContent(), true);
  });

  test('hasContent false when selection has empty columns', () => {
    const s = new State();
    s.selection = sel([]);
    assertEqual(s.hasContent(), false);
  });

  test('toJSON shape matches legacy getState', () => {
    const s = new State();
    s.selection = sel([cont(5, 'a')]);
    s.selectedChartType = 'histogram';
    s.exampleWorksheetId = 'ex-1';
    const j = s.toJSON();
    assertEqual(Object.keys(j).sort().join(','), 'exampleWorksheetId,selectedChartType,selection');
    assertEqual(j.selectedChartType, 'histogram');
    assertEqual(j.exampleWorksheetId, 'ex-1');
    assertEqual(j.selection.sourceInstanceId, 'ws-1');
    assertEqual(j.selection.columns.length, 1);
  });

  test('toJSON deep-copies nested selection + column values (no shared refs)', () => {
    const s = new State();
    const c = cont(3, 'a');
    s.selection = sel([c]);
    const j = s.toJSON();
    assertEqual(j.selection === s.selection, false);
    assertEqual(j.selection.columns === s.selection.columns, false);
    assertEqual(j.selection.columns[0] === s.selection.columns[0], false);
    assertEqual(j.selection.columns[0].values === s.selection.columns[0].values, false);
    // structuredClone must succeed (proxy-safe / no functions)
    const cloned = structuredClone(j);
    assertEqual(cloned.selection.columns[0].values[0], 1);
    // mutating the clone must not affect the model
    j.selection.columns[0].values[0] = 999;
    assertEqual(s.selection.columns[0].values[0], 1);
  });

  test('toJSON with null selection', () => {
    const j = new State().toJSON();
    assertEqual(j.selection, null);
    assertEqual(j.selectedChartType, null);
    assertEqual(j.exampleWorksheetId, null);
  });

  test('fromJSON(null) → valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s instanceof State, true);
    assertEqual(s.selection, null);
    assertEqual(s.hasContent(), false);
  });

  test('fromJSON(undefined) → valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.selection, null);
    assertEqual(s.selectedChartType, null);
  });

  test('fromJSON(malformed) → valid default', () => {
    const s = State.fromJSON({ selection: 42, selectedChartType: {}, exampleWorksheetId: [] });
    assertEqual(s.selection, null);
    assertEqual(s.selectedChartType, null);
    assertEqual(s.exampleWorksheetId, null);
  });

  test('fromJSON restores selection with columns', () => {
    const s = State.fromJSON({
      selection: sel([cont(5, 'a')]),
      selectedChartType: 'boxplot',
      exampleWorksheetId: 'ex-9',
    });
    assertEqual(s.selectedChartType, 'boxplot');
    assertEqual(s.exampleWorksheetId, 'ex-9');
    assertEqual(s.selection.columns.length, 1);
    assertEqual(s.selection.columns[0].id, 'a');
  });

  test('toJSON → fromJSON roundtrip is lossless', () => {
    const s = new State();
    s.selection = sel([cont(20, 'x'), cat(['A', 'B', 'A'], 'g')]);
    s.selectedChartType = 'main-effects';
    s.exampleWorksheetId = 'ex-rt';
    const back = State.fromJSON(s.toJSON());
    assertEqual(JSON.stringify(back.toJSON()), JSON.stringify(s.toJSON()));
  });

  test('fromJSON drops non-array columns to []', () => {
    const s = State.fromJSON({ selection: { sourceInstanceId: 'w', columns: 'nope' } });
    assertEqual(Array.isArray(s.selection.columns), true);
    assertEqual(s.selection.columns.length, 0);
  });
});

suite('chart-suggestion Model — recomputeSuggestions (rule branches)', () => {
  test('empty selection → no suggestions, null pick', () => {
    const s = new State();
    s.recomputeSuggestions();
    assertEqual(s.suggestions.length, 0);
    assertEqual(s.selectedChartType, null);
  });

  test('single continuous (n>=20) → histogram top', () => {
    const s = new State();
    s.selection = sel([cont(20, 'a')]);
    s.recomputeSuggestions();
    assertEqual(s.suggestions[0].type, 'histogram');
    assertEqual(s.selectedChartType, 'histogram');
    // histogram, boxplot, ivp, run-chart, probability-plot
    assertEqual(s.suggestions.length >= 4, true);
  });

  test('single continuous (n<20) hides histogram', () => {
    const s = new State();
    s.selection = sel([cont(10, 'a')]);
    s.recomputeSuggestions();
    assertEqual(s.suggestions.some(x => x.type === 'histogram'), false);
    assertEqual(s.suggestions[0].type, 'boxplot');
  });

  test('single categorical → pareto top, bar, pie', () => {
    const s = new State();
    s.selection = sel([cat(['R', 'B', 'R', 'G', 'B'], 'g')]);
    s.recomputeSuggestions();
    assertEqual(s.suggestions[0].type, 'pareto');
    assertEqual(s.suggestions.some(x => x.type === 'bar'), true);
  });

  test('two continuous → scatter top', () => {
    const s = new State();
    s.selection = sel([cont(10, 'a'), cont(10, 'b')]);
    s.recomputeSuggestions();
    assertEqual(s.suggestions[0].type, 'scatter');
    assertEqual(s.suggestions.length, 3);
  });

  test('three continuous → scatter-matrix top + bubble', () => {
    const s = new State();
    s.selection = sel([cont(10, 'a'), cont(10, 'b'), cont(10, 'c')]);
    s.recomputeSuggestions();
    assertEqual(s.suggestions[0].type, 'scatter-matrix');
    assertEqual(s.suggestions.some(x => x.type === 'bubble'), true);
  });

  test('continuous + categorical → boxplotByGroup top', () => {
    const s = new State();
    s.selection = sel([cont(10, 'y'), cat(['A', 'A', 'B', 'B', 'A'], 'g')]);
    s.recomputeSuggestions();
    assertEqual(s.suggestions[0].type, 'boxplot');
    assertEqual(s.suggestions.some(x => x.type === 'main-effects'), true);
  });

  test('two categorical → bar top, pareto/mosaic/heatmap', () => {
    const s = new State();
    s.selection = sel([cat(['X', 'Y', 'Z', 'X'], 'a'), cat(['P', 'Q', 'P', 'Q'], 'b')]);
    s.recomputeSuggestions();
    assertEqual(s.suggestions[0].type, 'bar');
    const types = s.suggestions.map(x => x.type);
    assertEqual(types.includes('mosaic'), true);
    assertEqual(types.includes('heatmap'), true);
  });

  test('date + continuous → run-chart top, control/ewma/cusum gated by n', () => {
    const s = new State();
    const dates = Array.from({ length: 30 }, (_, i) => `2024-01-${String(i + 1).padStart(2, '0')}`);
    s.selection = sel([col('d', 'date', dates), cont(30, 'v')]);
    s.recomputeSuggestions();
    assertEqual(s.suggestions[0].type, 'run-chart');
    const types = s.suggestions.map(x => x.type);
    assertEqual(types.includes('control-chart'), true);
    assertEqual(types.includes('ewma'), true);
  });

  test('preserves user pick when still valid', () => {
    const s = new State();
    s.selection = sel([cont(20, 'a')]);
    s.selectedChartType = 'run-chart';
    s.recomputeSuggestions();
    assertEqual(s.selectedChartType, 'run-chart');
  });

  test('resets pick to top when previous pick no longer valid', () => {
    const s = new State();
    s.selection = sel([cont(20, 'a')]);
    s.selectedChartType = 'mosaic'; // not in single-continuous rule
    s.recomputeSuggestions();
    assertEqual(s.selectedChartType, 'histogram');
  });
});

suite('chart-suggestion Model — buildPrefill', () => {
  const srcId = 'ws-1', sheetId = 'sheet-1';

  test('null when no source ids', () => {
    const s = new State();
    s.selection = { sourceInstanceId: null, sourceSheetId: null, columns: [cont(10, 'a'), cont(10, 'b')] };
    s.selectedChartType = 'scatter';
    assertEqual(s.buildPrefill(), null);
  });

  test('null for types without a target module (pie/control-chart/scatter-matrix)', () => {
    const s = new State();
    s.selection = sel([cat(['a', 'b'], 'g')]);
    s.selectedChartType = 'pie';
    assertEqual(s.buildPrefill(), null);
  });

  test('scatter → xy-plot with two cont refs', () => {
    const s = new State();
    s.selection = { sourceInstanceId: srcId, sourceSheetId: sheetId, columns: [cont(10, 'a'), cont(10, 'b')] };
    s.selectedChartType = 'scatter';
    const p = s.buildPrefill();
    assertEqual(p.target, 'xy-plot');
    assertEqual(p.state.datasets[0].xRef.columnId, 'a');
    assertEqual(p.state.datasets[0].yRef.columnId, 'b');
    assertEqual(p.state.datasets[0].xRef.instanceId, srcId);
    assertEqual(p.state.datasets[0].xRef.sheetId, sheetId);
  });

  test('histogram → histogram target with datasets', () => {
    const s = new State();
    s.selection = { sourceInstanceId: srcId, sourceSheetId: sheetId, columns: [cont(20, 'a')] };
    s.selectedChartType = 'histogram';
    const p = s.buildPrefill();
    assertEqual(p.target, 'histogram');
    assertEqual(p.state.datasets[0].valueRef.columnId, 'a');
  });

  test('bar with 1 cont + 1 cat → mean-per-level', () => {
    const s = new State();
    s.selection = { sourceInstanceId: srcId, sourceSheetId: sheetId, columns: [cont(10, 'y'), cat(['A', 'B'], 'g')] };
    s.selectedChartType = 'bar';
    const p = s.buildPrefill();
    assertEqual(p.target, 'bar');
    assertEqual(p.state.xRef.columnId, 'g');
    assertEqual(p.state.yRef.columnId, 'y');
    assertEqual(p.state.gRef, null);
  });

  test('bar with 2 cat → stacked cross-tab', () => {
    const s = new State();
    s.selection = { sourceInstanceId: srcId, sourceSheetId: sheetId, columns: [cat(['X'], 'a'), cat(['P'], 'b')] };
    s.selectedChartType = 'bar';
    const p = s.buildPrefill();
    assertEqual(p.target, 'bar');
    assertEqual(p.state.xRef.columnId, 'a');
    assertEqual(p.state.gRef.columnId, 'b');
    assertEqual(p.state.chartConfig.stacked, true);
  });

  test('mosaic needs 2 cat', () => {
    const s = new State();
    s.selection = { sourceInstanceId: srcId, sourceSheetId: sheetId, columns: [cat(['X'], 'a'), cat(['P'], 'b')] };
    s.selectedChartType = 'mosaic';
    const p = s.buildPrefill();
    assertEqual(p.target, 'mosaic');
    assertEqual(p.state.xRef.columnId, 'a');
    assertEqual(p.state.gRef.columnId, 'b');
  });

  test('heatmap with 1 cont + 2 cat → mean cell config', () => {
    const s = new State();
    s.selection = { sourceInstanceId: srcId, sourceSheetId: sheetId, columns: [cont(10, 'y'), cat(['A'], 'a'), cat(['P'], 'b')] };
    s.selectedChartType = 'heatmap';
    const p = s.buildPrefill();
    assertEqual(p.target, 'heatmap');
    assertEqual(p.state.vRef.columnId, 'y');
    assertEqual(p.state.chartConfig.aggregation, 'mean');
  });

  test('run → run-chart with single columnRef', () => {
    const s = new State();
    s.selection = { sourceInstanceId: srcId, sourceSheetId: sheetId, columns: [cont(10, 'a')] };
    s.selectedChartType = 'run-chart';
    const p = s.buildPrefill();
    assertEqual(p.target, 'run-chart');
    assertEqual(p.state.columnRef.columnId, 'a');
  });

  test('probability-plot → probability-plot target', () => {
    const s = new State();
    s.selection = { sourceInstanceId: srcId, sourceSheetId: sheetId, columns: [cont(10, 'a')] };
    s.selectedChartType = 'probability-plot';
    const p = s.buildPrefill();
    assertEqual(p.target, 'probability-plot');
    assertEqual(p.state.columnRef.columnId, 'a');
  });
});
