/**
 * Pareto-Diagramm: Model (domain/model.js) — Schema, Vorgaben und Ableitungen.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertAlmostEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/pareto/domain/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import paretoChart from '../../../js/widgets/pareto-chart/schema.js';
import { storedSource } from '../../helpers/stored-source.js';

const ref = (c) => ({ instanceId: 'w', sheetId: 's', columnId: c });

/** Die Slots des alten Pickers (Altmodul), als Literal festgehalten. */
const OLD_SLOTS = [
  { key: 'x', minCount: 1, required: true },
  { key: 'y', types: ['numeric', 'currency', 'percent'], minCount: 1 },
  { key: 'g', group: true },
];

/** Die Aggregationen der Rechnung (Altmodul `AGGREGATIONS`), als Literal festgehalten. */
const AGGREGATIONS = ['sum', 'mean'];

/** @param {any} s @returns {Record<string, any>} */
const traits = (s) => ({
  types: s.types ? [...s.types] : undefined,
  minCount: s.minCount || undefined,
  required: s.required || undefined,
  group: s.group || undefined,
});

/** Beispiel „Reklamationskosten Q2“: Arbeitsblatt `pareto-reklamationskosten`. */
const GRUND = [
  'Verspätete Lieferung', 'Transportschaden', 'Falschlieferung', 'Beschädigte Verpackung', 'Verspätete Lieferung',
  'Verspätete Lieferung', 'Maßabweichung', 'Transportschaden', 'Verspätete Lieferung', 'Falschlieferung',
  'Maßabweichung', 'Verspätete Lieferung', 'Transportschaden', 'Verspätete Lieferung', 'Maßabweichung',
  'Beschädigte Verpackung', 'Verspätete Lieferung', 'Falschlieferung', 'Maßabweichung', 'Transportschaden',
  'Verspätete Lieferung', 'Maßabweichung', 'Verspätete Lieferung', 'Falschlieferung', 'Maßabweichung',
  'Verspätete Lieferung', 'Transportschaden', 'Maßabweichung', 'Verspätete Lieferung', 'Maßabweichung',
  'Falschlieferung', 'Verspätete Lieferung', 'Maßabweichung', 'Beschädigte Verpackung', 'Verspätete Lieferung',
  'Maßabweichung', 'Falschlieferung', 'Maßabweichung', 'Verspätete Lieferung', 'Maßabweichung',
  'Sonstige', 'Falschlieferung', 'Maßabweichung', 'Verspätete Lieferung', 'Maßabweichung',
  'Transportschaden', 'Verspätete Lieferung', 'Maßabweichung', 'Falschlieferung', 'Maßabweichung',
];
const KOSTEN = [
  420, 380, 220, 95, 510, 480, 1850, 290, 360, 175,
  1620, 540, 340, 460, 1490, 110, 520, 195, 1730, 270,
  490, 1540, 380, 210, 1680, 410, 320, 1410, 530, 1590,
  165, 470, 1520, 105, 440, 1640, 185, 1380, 510, 1550,
  60, 200, 1470, 400, 1610, 310, 460, 1490, 155, 1400,
];

/** Altprojekt-Fixture: Fehlerart (sechs Stufen), Kosten, Schicht (zwei Stufen). */
const ART = ['Kratzer', 'Kratzer', 'Kratzer', 'Delle', 'Delle', 'Riss', 'Riss', 'Riss', 'Grat', 'Grat', 'Lunker', 'Lunker', 'Fleck', 'Fleck'];
const WERT = [40, 20, 10, 12, 18, 8, 12, 4, 5, 5, 3, 3, 2, 2];
const SCHICHT = ['Schicht A', 'Schicht A', 'Schicht B', 'Schicht A', 'Schicht B', 'Schicht A', 'Schicht B', 'Schicht B', 'Schicht A', 'Schicht B', 'Schicht A', 'Schicht B', 'Schicht A', 'Schicht B'];

const SRC = storedSource({ w: { sheets: [{ id: 's', name: 'S', state: {
  rowCount: 50,
  columns: [
    { id: 'grund', name: 'Reklamationsgrund', type: 'text', values: GRUND },
    { id: 'kosten', name: 'Kosten', type: 'currency', values: KOSTEN },
    { id: 'art', name: 'Fehlerart', type: 'text', values: ART },
    { id: 'wert', name: 'Kosten', type: 'numeric', values: WERT },
    { id: 'schicht', name: 'Schicht', type: 'text', values: SCHICHT },
    { id: 'leer', name: 'Leer', type: 'text', values: ['', '', ''] },
  ],
} }] } });

/**
 * @param {object|null} x @param {object|null} y @param {object|null} g
 * @param {object} [rest]
 */
const stored = (x, y, g, rest = {}) => State.fromJSON({ ...new State().toJSON(), datasets: [{ x, y, g }], ...rest });

suite('pareto: Model — Schema und Vorgaben', () => {
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

  test('aggregation: Literal im Schema gleich der Rechnung, Vorgabe sum', () => {
    const field = State.schema.fields.aggregation;
    assertDeepEqual([...field.values], AGGREGATIONS);
    assertEqual(new State().aggregation, 'sum');
  });

  test('Vorgabe: eine leere Zeile, Diagramm leer, kein Inhalt', () => {
    const m = new State();
    assertDeepEqual(JSON.parse(JSON.stringify(m.datasets)), [{ x: null, y: null, g: null }]);
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(JSON.parse(JSON.stringify(m.chart)), {});
    assertEqual(State.schema.view.chart.kind, paretoChart.edits().kind);
    assertEqual(m.hasContent(), false);
  });

  test('hasContent schon mit einem Slot, auch nur y oder g, und mit aggregation mean', () => {
    assertEqual(stored(ref('art'), null, null).hasContent(), true);
    assertEqual(stored(null, ref('wert'), null).hasContent(), true);
    assertEqual(stored(null, null, ref('schicht')).hasContent(), true);
    assertEqual(State.fromJSON({ ...new State().toJSON(), aggregation: 'mean' }).hasContent(), true);
  });
});

suite('pareto: Model — derived', () => {
  test('stats: Beispiel „Reklamationskosten Q2“ gleich der Altrechnung, Summe 36135', () => {
    const { stats } = evaluateDerived(stored(ref('grund'), ref('kosten'), null), SRC);
    assertEqual(stats.total, 36135);
    assertDeepEqual(stats.rows.map((r) => [r.name, r.value]), [
      ['Maßabweichung', 24970], ['Verspätete Lieferung', 7380], ['Transportschaden', 1910],
      ['Falschlieferung', 1505], ['Beschädigte Verpackung', 310], ['Sonstige', 60],
    ]);
    assertAlmostEqual(stats.rows[0].cumPct, (24970 / 36135) * 100, 1e-9);
    assertAlmostEqual(stats.rows[5].cumPct, 100, 1e-9);
    assertDeepEqual(Object.keys(stats.rows[0]), ['name', 'value', 'cumPct']);
  });

  test('stats: Altprojekt (Mittelwert, gestapelt) gleich der Altrechnung, Summe 106', () => {
    const { stats } = evaluateDerived(stored(ref('art'), ref('wert'), ref('schicht'), { aggregation: 'mean' }), SRC);
    assertEqual(stats.total, 106);
    assertDeepEqual(stats.rows.map((r) => [r.name, r.value, r.cumPct.toFixed(1)]), [
      ['Kratzer', 40, '37.7'], ['Delle', 30, '66.0'], ['Riss', 16, '81.1'],
      ['Grat', 10, '90.6'], ['Lunker', 6, '96.2'], ['Fleck', 4, '100.0'],
    ]);
  });

  test('stats: Häufigkeit ohne Wertespalte', () => {
    const { stats } = evaluateDerived(stored(ref('art'), null, null), SRC);
    assertEqual(stats.total, 14);
    assertDeepEqual(stats.rows.map((r) => [r.name, r.value]), [
      ['Kratzer', 3], ['Riss', 3], ['Delle', 2], ['Grat', 2], ['Lunker', 2], ['Fleck', 2],
    ]);
  });

  test('stats: null ohne X, ohne Werte und bei gelöschter Spalte (auch y und g)', () => {
    assertEqual(evaluateDerived(new State(), SRC).stats, null);
    assertEqual(evaluateDerived(stored(null, ref('wert'), ref('schicht')), SRC).stats, null);
    assertEqual(evaluateDerived(stored(ref('leer'), null, null), SRC).stats, null);
    assertEqual(evaluateDerived(stored(ref('weg'), null, null), SRC).stats, null);
    assertEqual(evaluateDerived(stored(ref('art'), ref('weg'), null), SRC).stats, null);
    assertEqual(evaluateDerived(stored(ref('art'), null, ref('weg')), SRC).stats, null);
  });

  test('activeParams: aggregation nur mit gesetztem y, auch wenn die Spalte fehlt', () => {
    assertDeepEqual(evaluateDerived(new State(), SRC).activeParams, []);
    assertDeepEqual(evaluateDerived(stored(ref('art'), null, ref('schicht')), SRC).activeParams, []);
    assertDeepEqual(evaluateDerived(stored(ref('art'), ref('wert'), null), SRC).activeParams, ['aggregation']);
    assertDeepEqual(evaluateDerived(stored(ref('art'), ref('weg'), null), SRC).activeParams, ['aggregation']);
  });

  test('activeColumnSlots ist fest', () => {
    assertDeepEqual(evaluateDerived(new State(), SRC).activeColumnSlots, ['x', 'y', 'g']);
  });
});
