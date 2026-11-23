/**
 * Balkendiagramm: Model (domain/model.js) — Schema, Vorgaben und Ableitungen.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/bar/domain/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import barChart from '../../../js/widgets/bar-chart/schema.js';
import { storedSource } from '../../helpers/stored-source.js';

const ref = (c) => ({ instanceId: 'w', sheetId: 's', columnId: c });

/** Die Slots des alten Pickers (Altmodul), als Literal festgehalten. */
const OLD_SLOTS = [
  { key: 'x', minCount: 1, required: true },
  { key: 'y', types: ['numeric', 'currency', 'percent'], minCount: 1 },
  { key: 'g', group: true },
];

/** Die Aggregationen der Rechnung (Altmodul `AGGREGATIONS`), als Literal festgehalten. */
const AGGREGATIONS = ['mean', 'sum'];

/** @param {any} s @returns {Record<string, any>} */
const traits = (s) => ({
  types: s.types ? [...s.types] : undefined,
  minCount: s.minCount || undefined,
  required: s.required || undefined,
  group: s.group || undefined,
});

/** @param {[string, number][]} runs @returns {string[]} */
const expand = (runs) => runs.flatMap(([v, n]) => Array(n).fill(v));

/** Beispiel „Defekte pro Schicht“: Arbeitsblatt `bar-defekte-pro-schicht`. */
const SCHICHT = expand([['Früh', 20], ['Spät', 20], ['Nacht', 20]]);
const DEFEKTART = expand([
  ['Kratzer', 4], ['Maßabweichung', 12], ['Oberfläche', 3], ['Sonstige', 1],
  ['Kratzer', 6], ['Maßabweichung', 7], ['Oberfläche', 5], ['Sonstige', 2],
  ['Kratzer', 5], ['Maßabweichung', 4], ['Oberfläche', 8], ['Sonstige', 3],
]);

/** Altprojekt-Fixture: Linie (drei Stufen), Ausschuss, Typ (zwei Stufen). */
const LINIE = ['Linie 1', 'Linie 1', 'Linie 2', 'Linie 2', 'Linie 3', 'Linie 1', 'Linie 3', 'Linie 2'];
const AUSSCHUSS = [10, 5, 8, 12, 7, 3, 4, 2];
const TYP = ['Typ A', 'Typ B', 'Typ A', 'Typ B', 'Typ A', 'Typ A', 'Typ B', 'Typ A'];

const SRC = storedSource({ w: { sheets: [{ id: 's', name: 'S', state: {
  rowCount: 60,
  columns: [
    { id: 'schicht', name: 'Schicht', type: 'text', values: SCHICHT },
    { id: 'defektart', name: 'Defektart', type: 'text', values: DEFEKTART },
    { id: 'linie', name: 'Linie', type: 'text', values: LINIE },
    { id: 'ausschuss', name: 'Ausschuss', type: 'numeric', values: AUSSCHUSS },
    { id: 'typ', name: 'Typ', type: 'text', values: TYP },
    { id: 'leer', name: 'Leer', type: 'text', values: ['', '', ''] },
  ],
} }] } });

/**
 * @param {object|null} x @param {object|null} y @param {object|null} g
 * @param {object} [rest]
 */
const stored = (x, y, g, rest = {}) => State.fromJSON({ ...new State().toJSON(), datasets: [{ x, y, g }], ...rest });

suite('bar: Model — Schema und Vorgaben', () => {
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

  test('aggregation: Literal im Schema gleich der Rechnung, Vorgabe mean', () => {
    assertDeepEqual([...State.schema.fields.aggregation.values], AGGREGATIONS);
    assertEqual(new State().aggregation, 'mean');
  });

  test('Vorgabe: eine leere Zeile, nicht gestapelt, Diagramm leer, kein Inhalt', () => {
    const m = new State();
    assertDeepEqual(JSON.parse(JSON.stringify(m.datasets)), [{ x: null, y: null, g: null }]);
    assertEqual(m.stacked, false);
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(JSON.parse(JSON.stringify(m.chart)), {});
    assertEqual(State.schema.view.chart.kind, barChart.edits().kind);
    assertEqual(m.hasContent(), false);
  });

  test('hasContent schon mit einem Slot, auch nur y oder g, mit stacked oder aggregation sum', () => {
    assertEqual(stored(ref('schicht'), null, null).hasContent(), true);
    assertEqual(stored(null, ref('ausschuss'), null).hasContent(), true);
    assertEqual(stored(null, null, ref('typ')).hasContent(), true);
    assertEqual(State.fromJSON({ ...new State().toJSON(), stacked: true }).hasContent(), true);
    assertEqual(State.fromJSON({ ...new State().toJSON(), aggregation: 'sum' }).hasContent(), true);
  });
});

suite('bar: Model — derived', () => {
  test('stats: Beispiel „Defekte pro Schicht“ gleich der Altrechnung, Summe 60', () => {
    const { stats } = evaluateDerived(stored(ref('schicht'), null, ref('defektart'), { stacked: true }), SRC);
    assertDeepEqual(stats, {
      categories: ['Früh', 'Spät', 'Nacht'],
      groups: [
        { name: 'Kratzer', values: [4, 6, 5] },
        { name: 'Maßabweichung', values: [12, 7, 4] },
        { name: 'Oberfläche', values: [3, 5, 8] },
        { name: 'Sonstige', values: [1, 2, 3] },
      ],
      total: 60,
    });
    assertDeepEqual(Object.keys(stats.groups[0]), ['name', 'values']);
  });

  test('stats: Altprojekt (Summe, gestapelt) gleich der Altrechnung, ohne Summe', () => {
    const { stats } = evaluateDerived(stored(ref('linie'), ref('ausschuss'), ref('typ'), { aggregation: 'sum' }), SRC);
    assertDeepEqual(stats, {
      categories: ['Linie 1', 'Linie 2', 'Linie 3'],
      groups: [{ name: 'Typ A', values: [13, 10, 7] }, { name: 'Typ B', values: [5, 12, 4] }],
      total: null,
    });
  });

  test('stats: eine Reihe ohne G, benannt nach Y bzw. X', () => {
    const mean = evaluateDerived(stored(ref('linie'), ref('ausschuss'), null), SRC).stats;
    assertDeepEqual(mean, { categories: ['Linie 1', 'Linie 2', 'Linie 3'], groups: [{ name: 'Ausschuss', values: [6, 22 / 3, 5.5] }], total: null });
    const freq = evaluateDerived(stored(ref('linie'), null, null), SRC).stats;
    assertDeepEqual(freq, { categories: ['Linie 1', 'Linie 2', 'Linie 3'], groups: [{ name: 'Linie', values: [3, 3, 2] }], total: 8 });
  });

  test('stats: null ohne X, ohne Werte und bei gelöschter Spalte (auch y und g)', () => {
    assertEqual(evaluateDerived(new State(), SRC).stats, null);
    assertEqual(evaluateDerived(stored(null, ref('ausschuss'), ref('typ')), SRC).stats, null);
    assertEqual(evaluateDerived(stored(ref('leer'), null, null), SRC).stats, null);
    assertEqual(evaluateDerived(stored(ref('weg'), null, null), SRC).stats, null);
    assertEqual(evaluateDerived(stored(ref('linie'), ref('weg'), null), SRC).stats, null);
    assertEqual(evaluateDerived(stored(ref('linie'), null, ref('weg')), SRC).stats, null);
  });

  test('activeParams: aggregation mit y, stacked mit g, auch wenn die Spalte fehlt', () => {
    assertDeepEqual(evaluateDerived(stored(ref('linie'), null, null), SRC).activeParams, []);
    assertDeepEqual(evaluateDerived(stored(ref('linie'), ref('ausschuss'), null), SRC).activeParams, ['aggregation']);
    assertDeepEqual(evaluateDerived(stored(ref('linie'), null, ref('typ')), SRC).activeParams, ['stacked']);
    assertDeepEqual(evaluateDerived(stored(ref('linie'), ref('ausschuss'), ref('typ')), SRC).activeParams, ['aggregation', 'stacked']);
    assertDeepEqual(evaluateDerived(stored(ref('linie'), ref('weg'), ref('weg')), SRC).activeParams, ['aggregation', 'stacked']);
  });

  test('activeColumnSlots ist fest', () => {
    assertDeepEqual(evaluateDerived(new State(), SRC).activeColumnSlots, ['x', 'y', 'g']);
  });
});
