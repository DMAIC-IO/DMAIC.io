/**
 * Boxplot: Model (domain/model.js) — Schema, Vorgaben und Ableitungen.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/boxplot/domain/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { CHART_COLORS } from '../../../js/core/chart/chart-colors.js';
import boxplotChart from '../../../js/widgets/boxplot-chart/schema.js';
import { storedSource } from '../../helpers/stored-source.js';

const ref = (c) => ({ instanceId: 'w', sheetId: 's', columnId: c });
const row = (value, group = null) => ({ value, group });

/** Die Slots des alten Pickers (Altmodul), als Literal festgehalten. */
const OLD_SLOTS = [
  { key: 'value', types: ['numeric'], minCount: 1, required: true },
  { key: 'group', group: true },
];

/** @param {any} s @returns {Record<string, any>} */
const traits = (s) => ({
  types: s.types ? [...s.types] : undefined,
  minCount: s.minCount || undefined,
  required: s.required || undefined,
  group: s.group || undefined,
});

/** Arbeitsblatt der Altprojekt-Fixture, dazu eine Spalte mit nur einem Wert. */
const SRC = storedSource({ w: { sheets: [{ id: 's', name: 'S', state: {
  rowCount: 12,
  columns: [
    { id: 'a', name: 'Durchsatz', type: 'numeric', values: [10, 11, 12, 11, 10, 12, 11, 45, 10, 11, 12, 11] },
    { id: 'b', name: 'Zeit', type: 'numeric', values: [20, 22, 21, 23, 22, 20, 21, 22, 23, 21, 22, 20] },
    { id: 'g', name: 'Linie', type: 'text', values: ['L1', 'L2', 'L1', 'L2', 'L1', 'L2', 'L1', 'L2', 'L1', 'L2', 'L1', 'L2'] },
    { id: 'one', name: 'Eins', type: 'numeric', values: [7] },
    { id: 'same', name: 'Gleich', type: 'numeric', values: [5, 5, 5] },
  ],
} }] } });
const stored = (over = {}) => State.fromJSON({ ...new State().toJSON(), datasets: [row(ref('a'), ref('g')), row(ref('b'))], ...over });

suite('boxplot: Model — Schema und Vorgaben', () => {
  test('Slots und ihre Merkmale gleich dem alten Picker, nullbar, Reihenfarben', () => {
    const slots = State.schema.fields.datasets.slots;
    assertDeepEqual(Object.keys(slots), OLD_SLOTS.map((s) => s.key));
    for (const { key, ...old } of OLD_SLOTS) {
      assertDeepEqual(traits(slots[key]), traits(old), key);
      assertEqual(slots[key].nullable, true, key);
    }
    assertDeepEqual([...State.schema.fields.datasets.colors], [...CHART_COLORS]);
  });

  test('Vorgaben: Konfidenzniveau 95 auch bei anderem Kontext, Statistik an, Diagramm leer, kein Inhalt', () => {
    const m = new State({ cycle: 'dmaic', confidenceLevel: 80, power: 80 });
    assertEqual(m.confLevel, 95);
    assertEqual(m.showStats, true);
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(JSON.parse(JSON.stringify(m.chart)), {});
    assertEqual(State.schema.view.chart.kind, boxplotChart.edits().kind);
    assertEqual(m.hasContent(), false);
    assertEqual(stored().hasContent(), true);
  });

  test('confLevel nur > 0 (sonst Vorgabe des Ansichtsfelds), ohne Obergrenze', () => {
    for (const bad of [0, -5]) assertEqual(State.fromJSON({ _schema: { version: '1.0' }, confLevel: bad }).confLevel, 95, String(bad));
    assertEqual(State.fromJSON({ _schema: { version: '1.0' }, confLevel: 150 }).confLevel, 150);
  });

  test('chart nimmt boxColors mit Lücken', () => {
    const m = State.fromJSON({ _schema: { version: '1.0' }, chart: { boxColors: [null, '#123456'] } });
    assertDeepEqual(JSON.parse(JSON.stringify(m.chart)), { boxColors: [null, '#123456'] });
  });
});

suite('boxplot: Model — derived', () => {
  test('stats: je Box Name und Kennzahlen wie am Altmodul (Ausreißer 45 in L2)', () => {
    const { stats } = evaluateDerived(stored(), SRC);
    assertDeepEqual(stats.map((s) => [s.name, s.stats.n]), [['Durchsatz — L1', 6], ['Durchsatz — L2', 6], ['Zeit', 12]]);
    assertEqual(stats[1].stats.max, 45);
    assertEqual(stats[1].stats.median, 11);
    assertEqual(stats[0].stats.mean, 65 / 6);
    assertTrue(Array.isArray(stats[0].ci.mean), 'Intervall des Mittelwerts fehlt');
  });

  test('stats: Werte ohne Streuung ergeben kein NaN', () => {
    const { stats } = evaluateDerived(stored({ datasets: [row(ref('same'))] }), SRC);
    assertEqual(stats[0].stats.n, 3);
    assertEqual(stats[0].stats.stddev, 0);
    assertTrue(JSON.stringify(stats).indexOf('NaN') < 0, 'NaN im Ergebnis');
    for (const v of Object.values(stats[0].stats)) assertTrue(v === null || Number.isFinite(v), 'nicht endliche Zahl');
  });

  test('stats folgt dem Konfidenzniveau', () => {
    const wide = evaluateDerived(stored({ confLevel: 99 }), SRC).stats[2].ci.mean;
    const narrow = evaluateDerived(stored({ confLevel: 80 }), SRC).stats[2].ci.mean;
    assertTrue(wide[1] - wide[0] > narrow[1] - narrow[0], 'Intervall bei 99 % nicht breiter als bei 80 %');
  });

  test('stats: null ohne Zeile, bei Fehler und bei gelöschter Spalte', () => {
    assertEqual(evaluateDerived(new State(), SRC).stats, null);
    assertEqual(evaluateDerived(stored({ datasets: [row(null)] }), SRC).stats, null);
    assertEqual(evaluateDerived(stored({ datasets: [row(ref('a')), row(ref('one'))] }), SRC).stats, null);
    assertEqual(evaluateDerived(stored({ datasets: [row(ref('gone'))] }), SRC).stats, null);
    assertEqual(evaluateDerived(stored({ datasets: [row(ref('a'), ref('gone'))] }), SRC).stats, null);
  });

  test('activeColumnSlots ist fest', () => {
    assertDeepEqual(evaluateDerived(new State(), SRC).activeColumnSlots, ['value', 'group']);
  });
});
