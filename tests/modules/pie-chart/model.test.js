/**
 * Tortendiagramm: Model (domain/model.js) — Schema, Vorgaben und Ableitungen.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/pie-chart/domain/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import pieChart from '../../../js/widgets/pie-chart/schema.js';
import { storedSource } from '../../helpers/stored-source.js';

const ref = (c) => ({ instanceId: 'w', sheetId: 's', columnId: c });

/** Die Slots des alten Pickers (Altmodul), als Literal festgehalten. */
const OLD_SLOTS = [
  { key: 'value', minCount: 1, required: true },
  { key: 'label', minCount: 1, group: true },
];

/** @param {any} s @returns {Record<string, any>} */
const traits = (s) => ({
  types: s.types ? [...s.types] : undefined,
  minCount: s.minCount || undefined,
  required: s.required || undefined,
  group: s.group || undefined,
});

const DEFEKTART = ['Kratzer', 'Maßabweichung', 'Risse', 'Verfärbung', 'Verschmutzung', 'Sonstige'];
const AUSSCHUSS = [145, 98, 67, 42, 28, 15];
const GRUND = ['Verspätete Lieferung', 'Transportschaden', 'Falschlieferung', 'Beschädigte Verpackung', 'Fehlende Bedienungsanleitung', 'Sonstige'];
const REKLAMATIONEN = [87, 64, 41, 28, 18, 10];

const SRC = storedSource({ w: { sheets: [{ id: 's', name: 'S', state: {
  rowCount: 6,
  columns: [
    { id: 'art', name: 'Defektart', type: 'text', values: DEFEKTART },
    { id: 'anz', name: 'Anzahl', type: 'numeric', values: AUSSCHUSS },
    { id: 'grund', name: 'Grund', type: 'text', values: GRUND },
    { id: 'rekl', name: 'Anzahl', type: 'numeric', values: REKLAMATIONEN },
    { id: 'kat', name: 'Kategorie', type: 'text', values: ['A', 'B', 'A', '', 'C', 'A'] },
    { id: 'leer', name: 'Leer', type: 'text', values: ['', '', '', '', '', ''] },
  ],
} }] } });
const stored = (value, label) => State.fromJSON({ ...new State().toJSON(), datasets: [{ value, label }] });

suite('pie-chart: Model — Schema und Vorgaben', () => {
  test('Slots und ihre Merkmale gleich dem alten Picker, nullbar, eine Zeile ohne Farben', () => {
    const field = State.schema.fields.datasets;
    assertDeepEqual(Object.keys(field.slots), OLD_SLOTS.map((s) => s.key));
    for (const { key, ...old } of OLD_SLOTS) {
      assertDeepEqual(traits(field.slots[key]), traits(old), key);
      assertEqual(field.slots[key].nullable, true, key);
    }
    assertTrue(!field.multi, 'multi gesetzt');
    assertTrue(!field.colors, 'Reihenfarben gesetzt');
  });

  test('Vorgabe: eine leere Zeile, Diagramm leer, kein Inhalt', () => {
    const m = new State();
    assertDeepEqual(JSON.parse(JSON.stringify(m.datasets)), [{ value: null, label: null }]);
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(JSON.parse(JSON.stringify(m.chart)), {});
    assertEqual(State.schema.view.chart.kind, pieChart.edits().kind);
    assertEqual(m.hasContent(), false);
  });

  test('hasContent schon mit einem Slot, auch nur label', () => {
    assertEqual(stored(ref('anz'), null).hasContent(), true);
    assertEqual(stored(null, ref('art')).hasContent(), true);
  });
});

suite('pie-chart: Model — derived', () => {
  test('stats: Beispiel „Ausschuss nach Defektart“ gleich der Altrechnung, Summe 395', () => {
    const { stats } = evaluateDerived(stored(ref('anz'), ref('art')), SRC);
    assertEqual(stats.total, 395);
    assertDeepEqual(stats.slices.map((s) => s.name), DEFEKTART);
    assertDeepEqual(stats.slices.map((s) => s.value), [145, 98, 67, 42, 28, 15]);
    assertDeepEqual(stats.slices.map((s) => s.share), AUSSCHUSS.map((v) => v / 395));
  });

  test('stats: Beispiel „Reklamationsgründe Q1“ gleich der Altrechnung, Summe 248', () => {
    const { stats } = evaluateDerived(stored(ref('rekl'), ref('grund')), SRC);
    assertEqual(stats.total, 248);
    assertDeepEqual(stats.slices.map((s) => s.name), GRUND);
    assertDeepEqual(stats.slices.map((s) => s.value), [87, 64, 41, 28, 18, 10]);
    assertDeepEqual(stats.slices.map((s) => s.share), REKLAMATIONEN.map((v) => v / 248));
  });

  test('stats: Häufigkeit ohne Beschriftung', () => {
    const { stats } = evaluateDerived(stored(ref('kat'), null), SRC);
    assertDeepEqual(stats, {
      slices: [{ name: 'A', value: 3, share: 0.6 }, { name: 'B', value: 1, share: 0.2 }, { name: 'C', value: 1, share: 0.2 }],
      total: 5,
    });
  });

  test('stats: null ohne Wertespalte, ohne Werte und bei gelöschter Spalte', () => {
    assertEqual(evaluateDerived(new State(), SRC).stats, null);
    assertEqual(evaluateDerived(stored(null, ref('art')), SRC).stats, null);
    assertEqual(evaluateDerived(stored(ref('leer'), null), SRC).stats, null);
    assertEqual(evaluateDerived(stored(ref('weg'), null), SRC).stats, null);
    assertEqual(evaluateDerived(stored(ref('anz'), ref('weg')), SRC).stats, null);
  });

  test('activeColumnSlots ist fest', () => {
    assertDeepEqual(evaluateDerived(new State(), SRC).activeColumnSlots, ['value', 'label']);
  });
});
