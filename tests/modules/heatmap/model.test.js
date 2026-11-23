/**
 * Heatmap: Model (domain/model.js) — Schema, Vorgaben und Ableitungen.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/heatmap/domain/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import heatmapChart from '../../../js/widgets/heatmap-chart/schema.js';
import { storedSource } from '../../helpers/stored-source.js';

const ref = (c) => ({ instanceId: 'w', sheetId: 's', columnId: c });

/** Die Slots des alten Pickers (Altmodul `DATASET_SLOTS`), als Literal festgehalten. */
const OLD_SLOTS = [
  { key: 'x', minCount: 1, required: true },
  { key: 'g', minCount: 1, required: true },
  { key: 'v', types: ['numeric', 'currency', 'percent'], minCount: 1 },
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

/** Beispiel „Zykluszeit nach Schicht × Linie“: Arbeitsblatt `heatmap-zykluszeit-schicht-linie`. */
const EX_SCHICHT = expand([['Früh', 15], ['Spät', 15], ['Nacht', 15]]);
const EX_LINIE = expand([
  ['L1', 5], ['L2', 5], ['L3', 5], ['L1', 5], ['L2', 5], ['L3', 5], ['L1', 5], ['L2', 5], ['L3', 5],
]);
const EX_ZYKLUS = [
  44, 40, 43, 41, 42, 60, 56, 59, 57, 58, 75, 71, 74, 72, 73,
  49, 45, 48, 46, 47, 64, 60, 63, 61, 62, 79, 75, 78, 76, 77,
  55, 51, 54, 52, 53, 70, 66, 69, 67, 68, 84, 80, 83, 81, 82,
];

/** Altprojekt-Fixture: Linie (drei Stufen), Ausschuss, Schicht (zwei Stufen). */
const LINIE = ['Linie 1', 'Linie 1', 'Linie 2', 'Linie 2', 'Linie 3', 'Linie 1', 'Linie 3', 'Linie 2'];
const AUSSCHUSS = [10, 5, 8, 12, 7, 3, 4, 2];
const SCHICHT = ['Früh', 'Spät', 'Früh', 'Spät', 'Früh', 'Früh', 'Spät', 'Früh'];

const SRC = storedSource({ w: { sheets: [{ id: 's', name: 'S', state: {
  rowCount: 45,
  columns: [
    { id: 'linie', name: 'Linie', type: 'text', values: LINIE },
    { id: 'ausschuss', name: 'Ausschuss', type: 'numeric', values: AUSSCHUSS },
    { id: 'schicht', name: 'Schicht', type: 'text', values: SCHICHT },
    { id: 'ex-schicht', name: 'Schicht', type: 'text', values: EX_SCHICHT },
    { id: 'ex-linie', name: 'Linie', type: 'text', values: EX_LINIE },
    { id: 'ex-zyklus', name: 'Zykluszeit', type: 'numeric', values: EX_ZYKLUS },
    { id: 'leer', name: 'Leer', type: 'text', values: ['', '', ''] },
  ],
} }] } });

/**
 * @param {object|null} x @param {object|null} g @param {object|null} v
 * @param {object} [rest]
 */
const stored = (x, g, v, rest = {}) => State.fromJSON({ ...new State().toJSON(), datasets: [{ x, g, v }], ...rest });

suite('heatmap: Model — Schema und Vorgaben', () => {
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

  test('Vorgabe: eine leere Zeile, Diagramm leer, kein Inhalt', () => {
    const m = new State();
    assertDeepEqual(JSON.parse(JSON.stringify(m.datasets)), [{ x: null, g: null, v: null }]);
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(JSON.parse(JSON.stringify(m.chart)), {});
    assertEqual(State.schema.view.chart.kind, heatmapChart.edits().kind);
    assertEqual(m.hasContent(), false);
  });

  test('hasContent schon mit einem Slot, auch nur v, oder mit aggregation sum', () => {
    assertEqual(stored(ref('linie'), null, null).hasContent(), true);
    assertEqual(stored(null, null, ref('ausschuss')).hasContent(), true);
    assertEqual(State.fromJSON({ ...new State().toJSON(), aggregation: 'sum' }).hasContent(), true);
  });
});

suite('heatmap: Model — derived', () => {
  test('stats: Altprojekt (Summe) gleich der Altrechnung, mit Summen', () => {
    const { stats } = evaluateDerived(stored(ref('linie'), ref('schicht'), ref('ausschuss'), { aggregation: 'sum' }), SRC);
    assertDeepEqual(stats, {
      xCategories: ['Linie 1', 'Linie 2', 'Linie 3'],
      yCategories: ['Früh', 'Spät'],
      cells: [[13, 10, 7], [5, 12, 4]],
      rowTotals: [30, 21],
      colTotals: [18, 22, 11],
      total: 51,
    });
  });

  test('stats: Beispiel „Zykluszeit“ (Mittelwert) gleich der Altrechnung, Summen null', () => {
    const { stats } = evaluateDerived(stored(ref('ex-linie'), ref('ex-schicht'), ref('ex-zyklus')), SRC);
    assertDeepEqual(stats, {
      xCategories: ['L1', 'L2', 'L3'],
      yCategories: ['Früh', 'Spät', 'Nacht'],
      cells: [[42, 58, 73], [47, 62, 77], [53, 68, 82]],
      rowTotals: null,
      colTotals: null,
      total: null,
    });
  });

  test('stats: Zählen ohne v mit Summen', () => {
    const { stats } = evaluateDerived(stored(ref('linie'), ref('schicht'), null), SRC);
    assertDeepEqual(stats, {
      xCategories: ['Linie 1', 'Linie 2', 'Linie 3'],
      yCategories: ['Früh', 'Spät'],
      cells: [[2, 2, 1], [1, 1, 1]],
      rowTotals: [5, 3],
      colTotals: [3, 3, 2],
      total: 8,
    });
  });

  test('stats: leere Wertzelle null, Summen überspringen sie', () => {
    const src = storedSource({ w: { sheets: [{ id: 's', name: 'S', state: {
      rowCount: 3,
      columns: [
        { id: 'x', name: 'X', type: 'text', values: ['A', 'B', 'A'] },
        { id: 'g', name: 'G', type: 'text', values: ['P', 'P', 'Q'] },
        { id: 'v', name: 'V', type: 'numeric', values: [1, 2, 4] },
      ],
    } }] } });
    const mean = evaluateDerived(stored(ref('x'), ref('g'), ref('v')), src).stats;
    assertDeepEqual(mean.cells, [[1, 2], [4, null]]);
    assertEqual(mean.total, null);
    const sum = evaluateDerived(stored(ref('x'), ref('g'), ref('v'), { aggregation: 'sum' }), src).stats;
    assertDeepEqual(sum, { xCategories: ['A', 'B'], yCategories: ['P', 'Q'], cells: [[1, 2], [4, null]], rowTotals: [3, 4], colTotals: [5, 2], total: 7 });
  });

  test('stats: null ohne x oder g, ohne Werte und bei gelöschter Spalte (auch v)', () => {
    assertEqual(evaluateDerived(new State(), SRC).stats, null);
    assertEqual(evaluateDerived(stored(ref('linie'), null, ref('ausschuss')), SRC).stats, null);
    assertEqual(evaluateDerived(stored(null, ref('schicht'), null), SRC).stats, null);
    assertEqual(evaluateDerived(stored(ref('leer'), ref('schicht'), null), SRC).stats, null);
    assertEqual(evaluateDerived(stored(ref('weg'), ref('schicht'), null), SRC).stats, null);
    assertEqual(evaluateDerived(stored(ref('linie'), ref('weg'), null), SRC).stats, null);
    assertEqual(evaluateDerived(stored(ref('linie'), ref('schicht'), ref('weg')), SRC).stats, null);
  });

  test('activeParams: aggregation nur mit v, auch wenn die Spalte fehlt', () => {
    assertDeepEqual(evaluateDerived(stored(ref('linie'), ref('schicht'), null), SRC).activeParams, []);
    assertDeepEqual(evaluateDerived(stored(ref('linie'), ref('schicht'), ref('ausschuss')), SRC).activeParams, ['aggregation']);
    assertDeepEqual(evaluateDerived(stored(null, null, ref('weg')), SRC).activeParams, ['aggregation']);
  });

  test('activeColumnSlots ist fest', () => {
    assertDeepEqual(evaluateDerived(new State(), SRC).activeColumnSlots, ['x', 'g', 'v']);
  });
});
