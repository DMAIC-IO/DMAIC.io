/**
 * Balkendiagramm: Diagrammdaten und Tabelle (domain/chart-data.js) gegen
 * Werte von Hand und gegen die Altrechnung.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { buildChartData, hasData, frequencyTotal, tableRows } from '../../../js/modules/bar/domain/chart-data.js';
import { PALETTE } from '../../../js/core/chart/chart-data-prep.js';

const REF_X = { instanceId: 'i1', sheetId: 's1', columnId: 'cx' };
const REF_Y = { instanceId: 'i1', sheetId: 's1', columnId: 'cy' };
const REF_G = { instanceId: 'i1', sheetId: 's1', columnId: 'cg' };
const GONE = { instanceId: 'i1', sheetId: 's1', columnId: 'weg' };

/** Spaltenleser über `{ x, y, g }`; Namen C1/C2/C3, andere Bezüge sind nicht lesbar. */
function reader(map, names = { cx: 'C1', cy: 'C2', cg: 'C3' }) {
  const byId = { cx: map.x, cy: map.y, cg: map.g };
  return {
    values: (ref) => byId[ref.columnId] ?? null,
    name: (ref) => (byId[ref.columnId] ? names[ref.columnId] ?? null : null),
  };
}

const row = (x, y = null, g = null) => ({ x, y, g });
const EMPTY = { categories: [], groups: [] };
const valuesOf = (d) => d.groups.map((g) => g.values);

suite('bar: Daten — nur X (Häufigkeit)', () => {
  const DATA_X = ['A', 'B', 'A', 'C', 'B'];

  test('eine Reihe mit Häufigkeiten in der Reihenfolge des ersten Auftretens, benannt nach X', () => {
    const d = buildChartData(row(REF_X), reader({ x: DATA_X }), 'mean');
    assertDeepEqual(d.categories, ['A', 'B', 'C']);
    assertDeepEqual(d.groups, [{ name: 'C1', values: [2, 2, 1], color: PALETTE[0] }]);
  });

  test('leere X-Zellen fallen heraus', () => {
    const d = buildChartData(row(REF_X), reader({ x: ['A', '', null, 'B', 'A'] }), 'mean');
    assertDeepEqual(d.categories, ['A', 'B']);
    assertDeepEqual(valuesOf(d), [[2, 1]]);
  });

  test('leer: ohne Zeile, ohne X, ohne Werte, nicht lesbares X, nur leere Zellen', () => {
    assertDeepEqual(buildChartData(undefined, reader({ x: DATA_X }), 'mean'), EMPTY);
    assertDeepEqual(buildChartData(row(null, REF_Y, REF_G), reader({ x: DATA_X, y: [1], g: ['a'] }), 'mean'), EMPTY);
    assertDeepEqual(buildChartData(row(REF_X), reader({ x: [] }), 'mean'), EMPTY);
    assertDeepEqual(buildChartData(row(GONE), reader({ x: DATA_X }), 'mean'), EMPTY);
    assertDeepEqual(buildChartData(row(REF_X), reader({ x: ['', null] }), 'mean'), EMPTY);
  });

  test('Reihenname leer, wenn die Spalte keinen Namen hat', () => {
    const d = buildChartData(row(REF_X), reader({ x: ['A'] }, {}), 'mean');
    assertEqual(d.groups[0].name, '');
  });
});

suite('bar: Daten — X + Y', () => {
  const DATA_X = ['A', 'B', 'A', 'C', 'B'];
  const DATA_Y = [10, 20, 30, 40, 50];

  test('Mittelwert je Kategorie, Reihe benannt nach Y', () => {
    const d = buildChartData(row(REF_X, REF_Y), reader({ x: DATA_X, y: DATA_Y }), 'mean');
    assertDeepEqual(d.categories, ['A', 'B', 'C']);
    assertDeepEqual(d.groups, [{ name: 'C2', values: [20, 35, 40], color: PALETTE[0] }]);
  });

  test('Summe je Kategorie', () => {
    const d = buildChartData(row(REF_X, REF_Y), reader({ x: DATA_X, y: DATA_Y }), 'sum');
    assertDeepEqual(valuesOf(d), [[40, 70, 40]]);
  });

  test('nicht numerische Y fallen heraus; die Kategorie bleibt, Mittelwert der leeren Zelle 0', () => {
    const m = buildChartData(row(REF_X, REF_Y), reader({ x: ['A', 'A', 'B', 'C'], y: ['10', 'x', '20', null] }), 'mean');
    assertDeepEqual(m.categories, ['A', 'B', 'C']);
    assertDeepEqual(valuesOf(m), [[10, 20, 0]]);
    const s = buildChartData(row(REF_X, REF_Y), reader({ x: ['A', 'A', 'B', 'C'], y: [10, 'x', 5, ''] }), 'sum');
    assertDeepEqual(valuesOf(s), [[10, 5, 0]]);
  });

  test('Text „2,5“ zählt als Zahl, ein Wahrheitswert nicht', () => {
    const d = buildChartData(row(REF_X, REF_Y), reader({ x: ['A', 'A', 'B'], y: ['2,5', '1.5', true] }), 'sum');
    assertDeepEqual(valuesOf(d), [[4, 0]]);
  });

  test('gelesen bis zur kürzeren Spalte', () => {
    const d = buildChartData(row(REF_X, REF_Y), reader({ x: ['A', 'B', 'C'], y: [1, 2] }), 'sum');
    assertDeepEqual(d.categories, ['A', 'B']);
  });

  test('nicht lesbare Wertespalte → keine Daten', () => {
    assertDeepEqual(buildChartData(row(REF_X, GONE), reader({ x: DATA_X }), 'mean'), EMPTY);
  });
});

suite('bar: Daten — X + G', () => {
  const DATA_X = ['A', 'B', 'A', 'C', 'B'];
  const DATA_G = ['X', 'Y', 'X', 'Y', 'X'];

  test('eine Reihe je Gruppe mit Häufigkeit je Zelle, Farben aus PALETTE', () => {
    const d = buildChartData(row(REF_X, null, REF_G), reader({ x: DATA_X, g: DATA_G }), 'mean');
    assertDeepEqual(d.categories, ['A', 'B', 'C']);
    assertDeepEqual(d.groups, [
      { name: 'X', values: [2, 1, 0], color: PALETTE[0] },
      { name: 'Y', values: [0, 1, 1], color: PALETTE[1] },
    ]);
  });

  test('Kategorie auch bei fehlender Gruppe (Wert 0), leere Gruppenzelle fällt heraus', () => {
    const d = buildChartData(row(REF_X, null, REF_G), reader({ x: ['A', 'A', 'B', 'C'], g: ['X', '', 'X', null] }), 'mean');
    assertDeepEqual(d.categories, ['A', 'B', 'C']);
    assertDeepEqual(d.groups.map((g) => [g.name, g.values]), [['X', [1, 1, 0]]]);
  });

  test('Farben reihum über zwölf Farben', () => {
    assertEqual(PALETTE.length, 12);
    const g = Array.from({ length: 13 }, (_, i) => `G${i}`);
    const d = buildChartData(row(REF_X, null, REF_G), reader({ x: g.map(() => 'A'), g }), 'mean');
    assertEqual(d.groups[12].color, PALETTE[0]);
  });

  test('alle Gruppenzellen leer → keine Reihen, keine Daten', () => {
    const d = buildChartData(row(REF_X, null, REF_G), reader({ x: ['A', 'B'], g: ['', null] }), 'mean');
    assertDeepEqual(d.groups, []);
    assertEqual(hasData(d), false);
  });

  test('nicht lesbare Gruppenspalte → keine Daten', () => {
    assertDeepEqual(buildChartData(row(REF_X, null, GONE), reader({ x: DATA_X }), 'mean'), EMPTY);
  });
});

suite('bar: Daten — X + Y + G', () => {
  test('Mittelwert je Zelle', () => {
    const d = buildChartData(row(REF_X, REF_Y, REF_G), reader({ x: ['A', 'A', 'B', 'B'], y: [10, 30, 20, 40], g: ['X', 'Y', 'X', 'Y'] }), 'mean');
    assertDeepEqual(d.categories, ['A', 'B']);
    assertDeepEqual(d.groups.map((g) => [g.name, g.values]), [['X', [10, 20]], ['Y', [30, 40]]]);
  });

  test('Summe je Zelle', () => {
    const d = buildChartData(row(REF_X, REF_Y, REF_G), reader({ x: ['A', 'A', 'B'], y: [10, 5, 20], g: ['X', 'X', 'X'] }), 'sum');
    assertDeepEqual(valuesOf(d), [[15, 20]]);
  });

  test('Altprojekt (Linie × Typ, Ausschuss) gleich der Altrechnung', () => {
    const x = ['Linie 1', 'Linie 1', 'Linie 2', 'Linie 2', 'Linie 3', 'Linie 1', 'Linie 3', 'Linie 2'];
    const y = [10, 5, 8, 12, 7, 3, 4, 2];
    const g = ['Typ A', 'Typ B', 'Typ A', 'Typ B', 'Typ A', 'Typ A', 'Typ B', 'Typ A'];
    const s = buildChartData(row(REF_X, REF_Y, REF_G), reader({ x, y, g }), 'sum');
    assertDeepEqual(s.categories, ['Linie 1', 'Linie 2', 'Linie 3']);
    assertDeepEqual(s.groups.map((r) => [r.name, r.values]), [['Typ A', [13, 10, 7]], ['Typ B', [5, 12, 4]]]);
    const m = buildChartData(row(REF_X, REF_Y, REF_G), reader({ x, y, g }), 'mean');
    assertDeepEqual(valuesOf(m), [[6.5, 5, 7], [5, 12, 4]]);
  });
});

suite('bar: Daten — hasData, frequencyTotal, tableRows', () => {
  test('hasData: Kategorien und Reihen nicht leer', () => {
    assertEqual(hasData(EMPTY), false);
    assertEqual(hasData({ categories: ['A'], groups: [] }), false);
    assertEqual(hasData({ categories: [], groups: [{ name: 'G', values: [], color: '' }] }), false);
    assertEqual(hasData({ categories: ['A'], groups: [{ name: 'G', values: [1], color: '' }] }), true);
  });

  test('frequencyTotal: Summe aller Werte über alle Reihen', () => {
    const d = buildChartData(row(REF_X, null, REF_G), reader({ x: ['A', 'B', 'A', 'C', 'B'], g: ['X', 'Y', 'X', 'Y', 'X'] }), 'mean');
    assertEqual(frequencyTotal(d), 5);
    assertEqual(frequencyTotal(EMPTY), 0);
  });

  test('tableRows: Reihe × Kategorie, reihenweise, mit Farbe der Reihe', () => {
    const d = buildChartData(row(REF_X, null, REF_G), reader({ x: ['A', 'B', 'A'], g: ['X', 'Y', 'X'] }), 'mean');
    assertDeepEqual(tableRows(d), [
      { color: PALETTE[0], name: 'A', group: 'X', value: 2 },
      { color: PALETTE[0], name: 'B', group: 'X', value: 0 },
      { color: PALETTE[1], name: 'A', group: 'Y', value: 0 },
      { color: PALETTE[1], name: 'B', group: 'Y', value: 1 },
    ]);
    assertDeepEqual(tableRows(EMPTY), []);
  });
});
