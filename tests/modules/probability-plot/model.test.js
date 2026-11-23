/**
 * Wahrscheinlichkeitsnetz: Model (domain/model.js) — Schema, Vorgaben,
 * Ableitungen und Kommandos.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/probability-plot/domain/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { CHART_COLORS } from '../../../js/core/chart/chart-colors.js';
import { referenceLineOf } from '../../../js/core/chart/types/probability-plot.js';
import probabilityPlotChart from '../../../js/widgets/probability-plot-chart/schema.js';
import { storedSource } from '../../helpers/stored-source.js';

const ref = (c) => ({ instanceId: 'w', sheetId: 's', columnId: c });
const row = (valueRef, groupRef = null) => ({ valueRef, groupRef });
const plain = (v) => JSON.parse(JSON.stringify(v));

/** Die Slots des alten Pickers (Altmodul), als Literal festgehalten. */
const OLD_SLOTS = [
  { key: 'valueRef', types: ['numeric'], minCount: 2, required: true },
  { key: 'groupRef', group: true },
];

/** @param {any} s @returns {Record<string, any>} */
const traits = (s) => ({
  types: s.types ? [...s.types] : undefined,
  minCount: s.minCount || undefined,
  required: s.required || undefined,
  group: s.group || undefined,
});

/** Arbeitsblatt der Altprojekt-Fixture, dazu Spalten mit einem bzw. gleichen Werten. */
const A = [10, 12, 11, 13, 12, 14, 11, 15, 13, 12, 14, 16];
const B = [20, 22, 21, 23, 22, 24, 21, 25, 23, 22, 24, 26];
const SRC = storedSource({ w: { sheets: [{ id: 's', name: 'S', state: {
  rowCount: 12,
  columns: [
    { id: 'a', name: 'A', type: 'numeric', values: A },
    { id: 'b', name: 'B', type: 'numeric', values: B },
    { id: 'g', name: 'G', type: 'text', values: ['g1', 'g2', 'g1', 'g2', 'g1', 'g2', 'g1', 'g2', 'g1', 'g2', 'g1', 'g2'] },
    { id: 'one', name: 'Eins', type: 'numeric', values: [7] },
    { id: 'same', name: 'Gleich', type: 'numeric', values: [5, 5, 5] },
  ],
} }] } });
const G1 = [10, 11, 12, 11, 13, 14];

/** Stand der Altprojekt-Fixture nach der Migration (Reihen „A — g1“, „A — g2“, „B“). */
const legacy = (over = {}) => State.fromJSON({
  datasets: [row(ref('a'), ref('g')), row(ref('b'))],
  seriesOverrides: [
    { name: 'Linie Eins', color: '#aa3355', visible: true },
    { name: 'A — g2', visible: false },
    { name: 'B', lineColor: '#336699', markerSymbol: 'square', visible: true },
  ],
  confLevel: 90, ...over,
});
const stored = (over = {}) => State.fromJSON({ ...new State().toJSON(), datasets: [row(ref('a'), ref('g')), row(ref('b'))], ...over });

suite('probability-plot: Model — Schema und Vorgaben', () => {
  test('Slots und ihre Merkmale gleich dem alten Picker, nullbar, Reihenfarben', () => {
    const slots = State.schema.fields.datasets.slots;
    assertDeepEqual(Object.keys(slots), OLD_SLOTS.map((s) => s.key));
    for (const { key, ...old } of OLD_SLOTS) {
      assertDeepEqual(traits(slots[key]), traits(old), key);
      assertEqual(slots[key].nullable, true, key);
    }
    assertDeepEqual([...State.schema.fields.datasets.colors], [...CHART_COLORS]);
  });

  test('Vorgaben: eine leere Zeile, Konfidenzniveau 95 auch bei anderem Kontext, Statistik an, kein Inhalt', () => {
    const m = new State({ cycle: 'dmaic', confidenceLevel: 80, power: 80 });
    assertDeepEqual(plain(m.datasets), [row(null)]);
    assertEqual(m.confLevel, 95);
    assertEqual(m.showStats, true);
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(plain(m.chart), {});
    assertDeepEqual(plain(m.legacySeries), []);
    assertEqual(State.schema.view.chart.kind, probabilityPlotChart.edits().kind);
    assertEqual(m.hasContent(), false);
    assertEqual(stored().hasContent(), true);
  });

  test('confLevel nur > 0 (sonst Vorgabe des Ansichtsfelds), ohne Obergrenze', () => {
    for (const bad of [0, -5]) assertEqual(State.fromJSON({ _schema: { version: '1.0' }, confLevel: bad }).confLevel, 95, String(bad));
    assertEqual(State.fromJSON({ _schema: { version: '1.0' }, confLevel: 150 }).confLevel, 150);
  });

  test('legacySeries: Schlüssel gleich den Reihenschlüsseln des Widgets plus name', () => {
    const keys = Object.keys(State.schema.view.legacySeries.item.shape).sort();
    assertDeepEqual(keys, ['name', ...probabilityPlotChart.editable.series].sort());
    const shape = /** @type {any} */ (probabilityPlotChart.edits().shape).series.item.shape;
    for (const k of probabilityPlotChart.editable.series) assertEqual(State.schema.view.legacySeries.item.shape[k].kind, shape[k].kind, k);
  });
});

suite('probability-plot: Model — derived', () => {
  test('stats: Altprojekt mit ausgeblendeter Reihe und Namen aus legacySeries', () => {
    const { stats } = evaluateDerived(legacy(), SRC);
    assertDeepEqual(stats.map((s) => [s.name, s.stats.n]), [['Linie Eins', 6], ['B', 12]]);
    assertEqual(stats[0].stats.mean, G1.reduce((a, b) => a + b, 0) / 6);
    assertDeepEqual(stats[0].referenceLine, referenceLineOf(G1));
    assertDeepEqual(stats[1].referenceLine, referenceLineOf(B));
    assertTrue(Array.isArray(stats[0].ci.mean), 'Intervall des Mittelwerts fehlt');
  });

  test('stats: im Editor ausgeblendete Reihe fehlt, label wird Name', () => {
    const m = stored({ chart: { series: [{ name: 'A — g2', visible: false }, { name: 'B', label: 'Mein B' }] } });
    const { stats } = evaluateDerived(m, SRC);
    assertDeepEqual(stats.map((s) => s.name), ['A — g1', 'Mein B']);
  });

  test('stats folgt dem Konfidenzniveau', () => {
    const wide = evaluateDerived(stored({ confLevel: 99 }), SRC).stats[2].ci.mean;
    const narrow = evaluateDerived(stored({ confLevel: 80 }), SRC).stats[2].ci.mean;
    assertTrue(wide[1] - wide[0] > narrow[1] - narrow[0], 'Intervall bei 99 % nicht breiter als bei 80 %');
  });

  test('stats: Werte ohne Streuung ergeben null statt NaN', () => {
    const { stats } = evaluateDerived(stored({ datasets: [row(ref('same'))] }), SRC);
    assertEqual(stats[0].stats.n, 3);
    assertEqual(stats[0].stats.stddev, 0);
    assertTrue(JSON.stringify(stats).indexOf('NaN') < 0, 'NaN im Ergebnis');
    for (const v of Object.values(stats[0].stats)) assertTrue(v === null || Number.isFinite(v), 'nicht endliche Zahl');
  });

  test('stats: null ohne Zeile, bei Fehler, bei gelöschter Spalte und wenn alles ausgeblendet ist', () => {
    assertEqual(evaluateDerived(new State(), SRC).stats, null);
    assertEqual(evaluateDerived(stored({ datasets: [row(null)] }), SRC).stats, null);
    assertEqual(evaluateDerived(stored({ datasets: [row(ref('a')), row(ref('one'))] }), SRC).stats, null);
    assertEqual(evaluateDerived(stored({ datasets: [row(ref('gone'))] }), SRC).stats, null);
    assertEqual(evaluateDerived(stored({ datasets: [row(ref('a'), ref('gone'))] }), SRC).stats, null);
    assertEqual(evaluateDerived(stored({ datasets: [row(ref('b'))], chart: { series: [{ name: 'B', visible: false }] } }), SRC).stats, null);
  });

  test('distribution und activeColumnSlots sind fest', () => {
    const d = evaluateDerived(new State(), SRC);
    assertEqual(d.distribution, 'normal');
    assertDeepEqual([...d.activeColumnSlots], ['valueRef', 'groupRef']);
  });
});

suite('probability-plot: Model — Kommandos', () => {
  test('clearLegacySeries leert', () => {
    const m = legacy();
    assertEqual(m.legacySeries.length, 3);
    m.clearLegacySeries({});
    assertDeepEqual(plain(m.legacySeries), []);
    assertDeepEqual(evaluateDerived(m, SRC).stats.map((s) => s.name), ['A — g1', 'A — g2', 'B']);
  });
});
