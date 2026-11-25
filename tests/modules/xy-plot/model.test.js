import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/xy-plot/domain/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { computeSeriesStats } from '../../../js/core/stats-panel.js';
import { CHART_COLORS } from '../../../js/core/chart/chart-colors.js';
import scatterChart from '../../../js/widgets/scatter-chart/schema.js';
import { storedSource } from '../../helpers/stored-source.js';
import { spySource } from '../../helpers/sheet-source.js';
import { buildSeries, sourceColumns } from '../../../js/modules/xy-plot/domain/series.js';
import { pickShown, diffEdits } from '../../../js/widgets/chart-edits.js';

const ref = (c) => ({ instanceId: 'w', sheetId: 's', columnId: c });

/** Die Slots des alten Pickers (Altmodul), als Literal festgehalten. */
// Prozent und Währung sind Zahlen (wie im alten Picker seit 1.9.2).
const NUMBER_TYPES = ['numeric', 'currency', 'percent'];
const OLD_SLOTS = [
  { key: 'x', types: NUMBER_TYPES, minCount: 1, required: true },
  { key: 'y', types: NUMBER_TYPES, minCount: 1, required: true },
  { key: 'group', group: true },
  { key: 'size', types: NUMBER_TYPES, minCount: 1 },
];

/** @param {any} s @returns {Record<string, any>} */
const traits = (s) => ({
  types: s.types ? [...s.types] : undefined,
  minCount: s.minCount || undefined,
  required: s.required || undefined,
  group: s.group || undefined,
});

suite('xy-plot: Model — Schema', () => {
  test('Slots und ihre Merkmale gleich dem alten Picker', () => {
    const slots = State.schema.fields.datasets.slots;
    assertDeepEqual(Object.keys(slots), OLD_SLOTS.map((s) => s.key));
    for (const { key, ...old } of OLD_SLOTS) assertDeepEqual(traits(slots[key]), traits(old), key);
  });
  test('Slots nullbar, Vorgabe eine leere Zeile, Farben der Reihen', () => {
    const slots = State.schema.fields.datasets.slots;
    for (const k of Object.keys(slots)) assertEqual(slots[k].nullable, true, k);
    assertDeepEqual(new State().datasets, [{ x: null, y: null, group: null, size: null, errorBars: { mode: 'none' } }]);
    assertDeepEqual([...State.schema.fields.datasets.colors], [...CHART_COLORS]);
  });
  test('Vorgaben im view-Block', () => {
    const m = new State();
    assertEqual(m.showLines, false);
    assertEqual(m.showMarkers, true);
    assertEqual(m.showStats, true);
    assertEqual(m.confLevel, 95);
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(m.legacySeries, []);
    assertEqual(State.schema.view.chart.kind, scatterChart.edits().kind);
  });
  test('confLevel ohne Grenzen', () => {
    assertEqual(State.fromJSON({ _schema: { version: '1.0' }, confLevel: 150 }).confLevel, 150);
  });
});

suite('xy-plot: Model — derived stats', () => {
  const cols = { x: [1, 2, 3, 4, 5, 6], y: [2, 4, 1, 8, 3, 9], g: ['a', 'b', 'a', 'b', 'a', 'b'], one: [7] };
  const data = storedSource({ w: { sheets: [{ id: 's', name: 'S', state: {
    rowCount: 6,
    columns: Object.entries(cols).map(([id, values]) => ({ id, name: id.toUpperCase(), values })),
  } }] } });
  const model = (datasets) => State.fromJSON({ _schema: { version: '1.0' }, datasets });
  const ds = (o) => ({ x: null, y: null, group: null, size: null, ...o });

  test('liest nur über src.read', () => {
    const m = model([ds({ x: ref('x'), y: ref('y') })]);
    assertEqual(evaluateDerived(m, spySource(data)).stats.length, 1);
  });
  test('Werte gleich computeSeriesStats der Y-Werte', () => {
    const m = model([ds({ x: ref('x'), y: ref('y'), group: ref('g') })]);
    m.confLevel = 90;
    const { stats } = evaluateDerived(m, data);
    const expected = computeSeriesStats([
      { name: 'Y — a', values: [2, 1, 3], color: CHART_COLORS[0], visible: true },
      { name: 'Y — b', values: [4, 8, 9], color: CHART_COLORS[1], visible: true },
    ], 0.9).map(({ name, stats: s, ci }) => ({ name, stats: s, ci }));
    assertDeepEqual(stats, expected);
  });
  test('im Editor ausgeblendete Reihe fehlt', () => {
    const m = model([ds({ x: ref('x'), y: ref('y'), group: ref('g') })]);
    m.chart = { series: [{ name: 'Y — a', visible: false }] };
    assertDeepEqual(evaluateDerived(m, data).stats.map((r) => r.name), ['Y — b']);
  });
  test('legacySeries blendet nach Index aus und benennt um', () => {
    const m = model([ds({ x: ref('x'), y: ref('y'), group: ref('g') })]);
    m.legacySeries = [{ visible: false }, { name: 'Neu' }];
    assertDeepEqual(evaluateDerived(m, data).stats.map((r) => r.name), ['Neu']);
  });
  test('gleiche Y-Spalte gegen zwei X: Ausblenden der zweiten Reihe lässt die erste stehen', () => {
    const m = model([ds({ x: ref('x'), y: ref('y') }), ds({ x: ref('y'), y: ref('y') })]);
    const built = buildSeries(m, sourceColumns(data));
    const before = pickShown({ series: built.series }, scatterChart.editable);
    const after = JSON.parse(JSON.stringify(before));
    after.series[1].visible = false;
    m.chart = diffEdits({}, before, after, scatterChart.editable, new Set()).next;
    assertDeepEqual(evaluateDerived(m, data).stats.map((r) => r.name), ['Y (X)']);
  });
  test('ohne fertige Reihe, bei Fehler oder alles ausgeblendet: null', () => {
    assertEqual(evaluateDerived(new State(), data).stats, null);
    assertEqual(evaluateDerived(model([ds({ x: ref('x') })]), data).stats, null);
    assertEqual(evaluateDerived(model([ds({ x: ref('one'), y: ref('one') })]), data).stats, null);
    const hidden = model([ds({ x: ref('x'), y: ref('y') })]);
    hidden.legacySeries = [{ visible: false }];
    assertEqual(evaluateDerived(hidden, data).stats, null);
  });
});

suite('xy-plot: Model — Kommandos', () => {
  test('clearLegacySeries leert', () => {
    const m = State.fromJSON({ _schema: { version: '1.0' }, legacySeries: [{ name: 'N' }, {}] });
    assertEqual(m.legacySeries.length, 2);
    m.clearLegacySeries({});
    assertDeepEqual(m.legacySeries, []);
  });
});

suite('xy-plot: toJSON trotz reaktiver Einträge klonbar (66aac554)', () => {
  // Alpine reicht Array-Einträge als reaktive Proxys heraus. Bleiben sie in
  // toJSON stehen, wirft structuredClone im stateManager und die Speicherung
  // entfällt still — Bezugslinien und -bereiche aus dem Editor gingen verloren.
  test('Proxy-Einträge in chart.refLines/refAreas/series landen als einfache Objekte', () => {
    const s = new State();
    s.chart = {
      refLines: [new Proxy({ dir: 'h', value: 2, color: 'red', width: 1, dash: 'dash' }, {})],
      refAreas: [new Proxy({ dir: 'x', min: 0, max: 1, color: 'blue' }, {})],
      series: [new Proxy({ name: 'A', color: 'green' }, {})],
    };
    const cloned = structuredClone(s.toJSON());
    const chart = cloned.chart ?? cloned.view?.chart;
    assertEqual(chart.refLines[0].value, 2);
    assertEqual(chart.refAreas[0].max, 1);
    assertEqual(chart.series[0].color, 'green');
  });
});
