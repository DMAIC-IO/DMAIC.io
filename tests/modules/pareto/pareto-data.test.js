/**
 * Pareto-Diagramm: Diagrammdaten und Tabelle (domain/pareto-data.js) gegen
 * Werte von Hand.
 */
import { suite, test, assertEqual, assertDeepEqual, assertAlmostEqual } from '../../test-utils.js';
import { buildChartData, hasData, statsRows } from '../../../js/modules/pareto/domain/pareto-data.js';
import { PALETTE } from '../../../js/core/chart/chart-data-prep.js';

const REF_X = { instanceId: 'i1', sheetId: 's1', columnId: 'cx' };
const REF_Y = { instanceId: 'i1', sheetId: 's1', columnId: 'cy' };
const REF_G = { instanceId: 'i1', sheetId: 's1', columnId: 'cg' };
const GONE = { instanceId: 'i1', sheetId: 's1', columnId: 'weg' };

const DATA_X = ['DefectA', 'DefectB', 'DefectC', 'DefectA', 'DefectB'];
const DATA_Y = [10, 20, 30, 40, 50];
const DATA_G = ['G1', 'G2', 'G1', 'G2', 'G1'];

/** Spaltenleser über `{ x, y, g }`; andere Bezüge sind nicht lesbar. */
function reader(map) {
  const byId = { cx: map.x, cy: map.y, cg: map.g };
  return {
    values: (ref) => byId[ref.columnId] ?? null,
    name: (ref) => ref.columnId,
  };
}

const row = (x, y = null, g = null) => ({ x, y, g });
const EMPTY = { items: [], categories: [], groups: [] };
const valueOf = (data, name) => data.items.find((i) => i.name === name).value;
/** Summe über die Gruppen je Kategorie-Index. */
const total = (data, ci) => data.groups.reduce((s, g) => s + (g.values[ci] || 0), 0);

suite('pareto: Daten — nur X (Häufigkeit)', () => {
  test('zählt je Kategorie in der Reihenfolge des ersten Auftretens', () => {
    const d = buildChartData(row(REF_X), reader({ x: DATA_X }), 'sum');
    assertDeepEqual(d.categories, []);
    assertDeepEqual(d.groups, []);
    assertDeepEqual(d.items.map((i) => i.name), ['DefectA', 'DefectB', 'DefectC']);
    assertDeepEqual(d.items.map((i) => i.value), [2, 2, 1]);
  });

  test('leer: ohne Zeile, ohne X, ohne Werte, nicht lesbares X', () => {
    assertDeepEqual(buildChartData(undefined, reader({ x: DATA_X }), 'sum'), EMPTY);
    assertDeepEqual(buildChartData(row(null, REF_Y, REF_G), reader({ x: DATA_X, y: DATA_Y, g: DATA_G }), 'sum'), EMPTY);
    assertDeepEqual(buildChartData(row(REF_X), reader({ x: [] }), 'sum'), EMPTY);
    assertDeepEqual(buildChartData(row(GONE), reader({ x: DATA_X }), 'sum'), EMPTY);
    assertDeepEqual(buildChartData(row(REF_X), reader({ x: ['', null, ''] }), 'sum'), EMPTY);
  });

  test('leere Kategoriezellen fallen heraus', () => {
    const d = buildChartData(row(REF_X), reader({ x: ['A', '', 'A', null, 'B'] }), 'sum');
    assertDeepEqual(d.items.map((i) => [i.name, i.value]), [['A', 2], ['B', 1]]);
  });

  test('Farben aus PALETTE, reihum über zwölf Farben', () => {
    assertEqual(PALETTE.length, 12);
    const x = Array.from({ length: 13 }, (_, i) => `C${i}`);
    const d = buildChartData(row(REF_X), reader({ x }), 'sum');
    assertEqual(d.items[0].color, PALETTE[0]);
    assertEqual(d.items[1].color, PALETTE[1]);
    assertEqual(d.items[12].color, PALETTE[0]);
  });
});

suite('pareto: Daten — X + Y', () => {
  test('Summe je Kategorie', () => {
    const d = buildChartData(row(REF_X, REF_Y), reader({ x: DATA_X, y: DATA_Y }), 'sum');
    assertEqual(valueOf(d, 'DefectA'), 50);
    assertEqual(valueOf(d, 'DefectB'), 70);
    assertEqual(valueOf(d, 'DefectC'), 30);
  });

  test('Mittelwert je Kategorie', () => {
    const d = buildChartData(row(REF_X, REF_Y), reader({ x: DATA_X, y: DATA_Y }), 'mean');
    assertEqual(valueOf(d, 'DefectA'), 25);
    assertEqual(valueOf(d, 'DefectB'), 35);
    assertEqual(valueOf(d, 'DefectC'), 30);
  });

  test('nicht numerische Y fallen heraus; die Kategorie bleibt, Mittelwert der leeren Zelle 0', () => {
    const d = buildChartData(row(REF_X, REF_Y), reader({ x: ['A', 'A', 'B', 'C'], y: [10, 'x', 5, ''] }), 'sum');
    assertDeepEqual(d.items.map((i) => [i.name, i.value]), [['A', 10], ['B', 5], ['C', 0]]);
    const m = buildChartData(row(REF_X, REF_Y), reader({ x: ['A', 'A', 'B', 'C'], y: [10, 'x', 5, null] }), 'mean');
    assertDeepEqual(m.items.map((i) => [i.name, i.value]), [['A', 10], ['B', 5], ['C', 0]]);
  });

  test('Text „2,5“ zählt als Zahl, ein Wahrheitswert nicht', () => {
    const d = buildChartData(row(REF_X, REF_Y), reader({ x: ['A', 'A', 'B'], y: ['2,5', '1.5', true] }), 'sum');
    assertDeepEqual(d.items.map((i) => [i.name, i.value]), [['A', 4], ['B', 0]]);
  });

  test('gelesen bis zur kürzeren Spalte', () => {
    const d = buildChartData(row(REF_X, REF_Y), reader({ x: ['A', 'B', 'C'], y: [1, 2] }), 'sum');
    assertDeepEqual(d.items.map((i) => i.name), ['A', 'B']);
  });

  test('nicht lesbare Wertespalte → keine Daten', () => {
    assertDeepEqual(buildChartData(row(REF_X, GONE), reader({ x: DATA_X }), 'sum'), EMPTY);
  });
});

suite('pareto: Daten — gestapelt (G)', () => {
  test('X + G: Kategorien und Gruppen mit Häufigkeit je Zelle', () => {
    const d = buildChartData(row(REF_X, null, REF_G), reader({ x: DATA_X, g: DATA_G }), 'sum');
    assertDeepEqual(d.items, []);
    assertDeepEqual(d.categories, ['DefectA', 'DefectB', 'DefectC']);
    assertDeepEqual(d.groups.map((g) => g.name), ['G1', 'G2']);
    assertDeepEqual(d.groups.map((g) => g.values), [[1, 1, 1], [1, 1, 0]]);
    assertDeepEqual(d.groups.map((g) => g.color), [PALETTE[0], PALETTE[1]]);
  });

  test('X + Y + G: Summe und Mittelwert je Zelle', () => {
    const s = buildChartData(row(REF_X, REF_Y, REF_G), reader({ x: DATA_X, y: DATA_Y, g: DATA_G }), 'sum');
    assertEqual(total(s, 0), 50);
    assertEqual(total(s, 1), 70);
    assertEqual(total(s, 2), 30);
    const m = buildChartData(row(REF_X, REF_Y, REF_G), reader({ x: [...DATA_X, 'DefectA'], y: [...DATA_Y, 20], g: [...DATA_G, 'G1'] }), 'mean');
    // DefectA: G1 (10+20)/2 = 15, G2 40
    assertDeepEqual(m.groups.map((g) => g.values[0]), [15, 40]);
  });

  test('Kategorie auch bei fehlender Gruppe (Wert 0), leere Gruppenzelle fällt heraus', () => {
    const d = buildChartData(row(REF_X, null, REF_G), reader({ x: ['A', 'B', 'A'], g: ['G1', '', 'G2'] }), 'sum');
    assertDeepEqual(d.categories, ['A', 'B']);
    assertDeepEqual(d.groups.map((g) => [g.name, g.values]), [['G1', [1, 0]], ['G2', [1, 0]]]);
  });

  test('alle Gruppenzellen leer → keine Gruppen, keine Daten', () => {
    const d = buildChartData(row(REF_X, null, REF_G), reader({ x: ['A', 'B'], g: ['', null] }), 'sum');
    assertDeepEqual(d.groups, []);
    assertEqual(hasData(d), false);
  });

  test('nicht lesbare Gruppenspalte → keine Daten', () => {
    assertDeepEqual(buildChartData(row(REF_X, REF_Y, GONE), reader({ x: DATA_X, y: DATA_Y }), 'sum'), EMPTY);
  });
});

suite('pareto: Daten — hasData', () => {
  test('Einträge oder Kategorien mit Gruppen', () => {
    assertEqual(hasData(EMPTY), false);
    assertEqual(hasData({ items: [{ name: 'A', value: 1, color: '' }], categories: [], groups: [] }), true);
    assertEqual(hasData({ items: [], categories: ['A'], groups: [] }), false);
    assertEqual(hasData({ items: [], categories: ['A'], groups: [{ name: 'G', values: [1], color: '' }] }), true);
  });
});

suite('pareto: Daten — statsRows', () => {
  test('absteigend sortiert, kumulierte Anteile in Prozent', () => {
    const { rows, grandTotal } = statsRows(buildChartData(row(REF_X, REF_Y), reader({ x: DATA_X, y: DATA_Y }), 'sum'));
    assertEqual(grandTotal, 150);
    assertDeepEqual(rows.map((r) => r.name), ['DefectB', 'DefectA', 'DefectC']);
    assertAlmostEqual(rows[0].cumPct, (70 / 150) * 100, 1e-9);
    assertAlmostEqual(rows[1].cumPct, (120 / 150) * 100, 1e-9);
    assertAlmostEqual(rows[2].cumPct, 100, 1e-9);
  });

  test('Häufigkeit: Gleichstand bleibt stabil', () => {
    const { rows, grandTotal } = statsRows(buildChartData(row(REF_X), reader({ x: DATA_X }), 'sum'));
    assertEqual(grandTotal, 5);
    assertDeepEqual(rows.map((r) => r.name), ['DefectA', 'DefectB', 'DefectC']);
    assertAlmostEqual(rows[2].cumPct, 100, 1e-9);
  });

  test('Stapelmodus: Summe über die Gruppen, Farbe je Kategorie-Index', () => {
    const { rows, grandTotal } = statsRows(buildChartData(row(REF_X, REF_Y, REF_G), reader({ x: DATA_X, y: DATA_Y, g: DATA_G }), 'sum'));
    assertEqual(grandTotal, 150);
    assertDeepEqual(rows.map((r) => [r.name, r.value, r.color]), [
      ['DefectB', 70, PALETTE[1]], ['DefectA', 50, PALETTE[0]], ['DefectC', 30, PALETTE[2]],
    ]);
  });

  test('leere Daten → keine Zeilen, Summe 0', () => {
    assertDeepEqual(statsRows(EMPTY), { rows: [], grandTotal: 0 });
  });

  test('negative zählen für Summe und Anteil als 0', () => {
    const { rows, grandTotal } = statsRows({
      items: [
        { name: 'A', value: 10, color: PALETTE[0] },
        { name: 'B', value: -5, color: PALETTE[1] },
        { name: 'C', value: 5, color: PALETTE[2] },
      ],
      categories: [],
      groups: [],
    });
    assertEqual(grandTotal, 15);
    assertDeepEqual(rows.map((r) => r.name), ['A', 'C', 'B']);
    assertAlmostEqual(rows[0].cumPct, (10 / 15) * 100, 1e-9);
    assertAlmostEqual(rows[1].cumPct, 100, 1e-9);
    assertAlmostEqual(rows[2].cumPct, 100, 1e-9);
  });

  test('Summe 0 → Anteile 0', () => {
    const { rows } = statsRows({ items: [{ name: 'A', value: 0, color: '' }], categories: [], groups: [] });
    assertEqual(rows[0].cumPct, 0);
  });
});
