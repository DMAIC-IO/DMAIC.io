/**
 * Mosaikdiagramm: Model (domain/model.js) — Schema, Vorgaben und Ableitungen.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/mosaic/domain/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import mosaicChart from '../../../js/widgets/mosaic-chart/schema.js';
import { storedSource } from '../../helpers/stored-source.js';

const ref = (c) => ({ instanceId: 'w', sheetId: 's', columnId: c });

/** Die Slots des alten Pickers (Altmodul), als Literal festgehalten. */
const OLD_SLOTS = [
  { key: 'x', minCount: 1, required: true },
  { key: 'g', minCount: 1, required: true },
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
    { id: 'x', name: 'Werk', type: 'text', values: ['A', 'A', 'B', 'B', 'C'] },
    { id: 'g', name: 'Status', type: 'text', values: ['X', 'Y', 'X', 'Y', 'X'] },
    { id: 'leer', name: 'Leer', type: 'text', values: ['', '', '', '', ''] },
  ],
} }] } });
const stored = (x, g) => State.fromJSON({ ...new State().toJSON(), datasets: [{ x, g }] });

suite('mosaic: Model — Schema und Vorgaben', () => {
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
    assertDeepEqual(JSON.parse(JSON.stringify(m.datasets)), [{ x: null, g: null }]);
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(JSON.parse(JSON.stringify(m.chart)), {});
    assertEqual(State.schema.view.chart.kind, mosaicChart.edits().kind);
    assertEqual(m.hasContent(), false);
  });

  test('hasContent schon mit einem Slot', () => {
    assertEqual(stored(ref('x'), null).hasContent(), true);
    assertEqual(stored(null, ref('g')).hasContent(), true);
  });
});

suite('mosaic: Model — derived', () => {
  test('stats: Kreuztabelle mit Summen', () => {
    const { stats } = evaluateDerived(stored(ref('x'), ref('g')), SRC);
    assertDeepEqual(stats, {
      categories: ['A', 'B', 'C'],
      groups: [{ name: 'X', counts: [1, 1, 1] }, { name: 'Y', counts: [1, 1, 0] }],
      rowTotals: [2, 2, 1],
      colTotals: [3, 2],
      total: 5,
    });
  });

  test('stats: null mit leerem Slot, ohne Werte und bei gelöschter Spalte', () => {
    assertEqual(evaluateDerived(new State(), SRC).stats, null);
    assertEqual(evaluateDerived(stored(ref('x'), null), SRC).stats, null);
    assertEqual(evaluateDerived(stored(ref('x'), ref('leer')), SRC).stats, null);
    assertEqual(evaluateDerived(stored(ref('x'), ref('weg')), SRC).stats, null);
  });

  test('activeColumnSlots ist fest', () => {
    assertDeepEqual(evaluateDerived(new State(), SRC).activeColumnSlots, ['x', 'g']);
  });
});
