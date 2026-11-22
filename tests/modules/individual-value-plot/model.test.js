/**
 * Einzelwertdiagramm: Model (domain/model.js) — Schema, Vorgaben und Ableitungen.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/individual-value-plot/domain/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { CHART_COLORS } from '../../../js/core/chart/chart-colors.js';
import individualValuePlotChart from '../../../js/widgets/individual-value-plot-chart/schema.js';
import { storedSource } from '../../helpers/stored-source.js';

const ref = (c) => ({ instanceId: 'w', sheetId: 's', columnId: c });
const row = (value, group = null, group2 = null, group3 = null) => ({ value, group, group2, group3 });
const ctx = (confidenceLevel) => ({ cycle: 'dmaic', confidenceLevel, power: 80 });

/** Die Slots des alten Pickers (Altmodul), als Literal festgehalten. */
const OLD_SLOTS = [
  { key: 'value', types: ['numeric'], minCount: 1, required: true },
  { key: 'group', group: true },
  { key: 'group2', group: true },
  { key: 'group3', group: true },
];

/** @param {any} s @returns {Record<string, any>} */
const traits = (s) => ({
  types: s.types ? [...s.types] : undefined,
  minCount: s.minCount || undefined,
  required: s.required || undefined,
  group: s.group || undefined,
});

const SRC = storedSource({ w: { sheets: [{ id: 's', name: 'S', state: {
  rowCount: 5,
  columns: [
    { id: 'a', name: 'A', type: 'numeric', values: [10, 12, 8, 15, 25] },
    { id: 'one', name: 'Eins', type: 'numeric', values: [7] },
    { id: 'g', name: 'G', type: 'text', values: ['x', 'x', 'x', 'y', 'y'] },
  ],
} }] } });
const stored = (over = {}) => State.fromJSON({ ...new State().toJSON(), datasets: [row(ref('a'))], ...over });

suite('individual-value-plot: Model — Schema und Vorgaben', () => {
  test('Slots und ihre Merkmale gleich dem alten Picker, nullbar, Reihenfarben', () => {
    const slots = State.schema.fields.datasets.slots;
    assertDeepEqual(Object.keys(slots), OLD_SLOTS.map((s) => s.key));
    for (const { key, ...old } of OLD_SLOTS) {
      assertDeepEqual(traits(slots[key]), traits(old), key);
      assertEqual(slots[key].nullable, true, key);
    }
    assertDeepEqual([...State.schema.fields.datasets.colors], [...CHART_COLORS]);
  });

  test('Vorgaben: Konfidenzniveau aus dem Kontext, Statistik an, Diagramm leer', () => {
    assertEqual(new State(ctx(90)).confLevel, 90);
    assertEqual(new State().confLevel, 95);
    const m = new State();
    assertEqual(m.showStats, true);
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(JSON.parse(JSON.stringify(m.chart)), {});
    assertEqual(State.schema.view.chart.kind, individualValuePlotChart.edits().kind);
  });

  test('Vorgabe aus dem Kontext wird auf den Feldbereich geklemmt', () => {
    assertEqual(new State(ctx(99.95)).confLevel, 99.9);
    assertEqual(new State(ctx(0.05)).confLevel, 0.1);
  });

  test('confLevel nur in (0, 100)', () => {
    for (const bad of [0, 100, 150]) {
      let threw = false;
      try { State.fromJSON({ _schema: { version: '1.0' }, confLevel: bad }); } catch { threw = true; }
      assertTrue(threw, `confLevel ${bad} angenommen`);
    }
  });
});

suite('individual-value-plot: Model — derived', () => {
  test('stats: je Gruppe Name, Kennzahlen und Intervalle; Einzelwert ohne Streuung → null statt NaN', () => {
    const m = stored({ datasets: [row(ref('a'), ref('g')), row(ref('one'))] });
    const { stats } = evaluateDerived(m, SRC);
    assertDeepEqual(stats.map((s) => s.name), ['A — x', 'A — y', 'Eins']);
    assertEqual(stats[0].stats.n, 3);
    assertEqual(stats[0].stats.mean, 10);
    assertEqual(stats[2].stats.n, 1);
    assertEqual(stats[2].stats.stddev, null);
    assertEqual(stats[2].stats.variance, null);
    assertEqual(stats[2].stats.seMean, null);
    assertTrue(JSON.stringify(stats).indexOf('NaN') < 0, 'NaN im Ergebnis');
  });

  test('stats folgt dem Konfidenzniveau', () => {
    const wide = evaluateDerived(stored({ confLevel: 99 }), SRC).stats[0].ci.mean;
    const narrow = evaluateDerived(stored({ confLevel: 80 }), SRC).stats[0].ci.mean;
    assertTrue(wide[1] - wide[0] > narrow[1] - narrow[0], 'Intervall bei 99 % nicht breiter als bei 80 %');
  });

  test('stats: null ohne Zeile, bei Fehler und bei gelöschter Spalte', () => {
    assertEqual(evaluateDerived(new State(), SRC).stats, null);
    assertEqual(evaluateDerived(stored({ datasets: [row(ref('a'), ref('missing'))] }), SRC).stats, null);
    assertEqual(evaluateDerived(stored({ datasets: [row(ref('gone'))] }), SRC).stats, null);
  });

  test('activeParams und activeColumnSlots sind fest', () => {
    const d = evaluateDerived(new State(), SRC);
    assertDeepEqual(d.activeParams, ['confLevel']);
    assertDeepEqual(d.activeColumnSlots, ['value', 'group', 'group2', 'group3']);
  });
});
