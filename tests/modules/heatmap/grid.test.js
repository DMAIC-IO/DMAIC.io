/**
 * Heatmap: Raster und Summen (domain/grid.js) gegen Werte von Hand und gegen
 * die Altrechnung.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { buildGrid, hasGrid, totalsOf, additive } from '../../../js/modules/heatmap/domain/grid.js';

const REF_X = { instanceId: 'i1', sheetId: 's1', columnId: 'cx' };
const REF_G = { instanceId: 'i1', sheetId: 's1', columnId: 'cg' };
const REF_V = { instanceId: 'i1', sheetId: 's1', columnId: 'cv' };
const GONE = { instanceId: 'i1', sheetId: 's1', columnId: 'weg' };

/** Spaltenleser über `{ x, g, v }`; andere Bezüge sind nicht lesbar. */
function reader(map) {
  const byId = { cx: map.x, cg: map.g, cv: map.v };
  return {
    values: (ref) => byId[ref.columnId] ?? null,
    name: (ref) => (byId[ref.columnId] ? ref.columnId : null),
  };
}

const row = (x, g, v = null) => ({ x, g, v });
const EMPTY = { xCategories: [], yCategories: [], cells: [] };

suite('heatmap: Raster — Zählen (ohne V)', () => {
  // X bildet die Spalten, G die Zeilen.
  const DATA_X = ['A', 'A', 'B', 'B', 'C', 'C', 'B', 'A', 'A', 'B'];
  const DATA_G = ['X', 'Y', 'X', 'Y', 'X', 'Y', 'X', 'Y', 'X', 'Z'];

  test('Stufen beider Achsen in der Reihenfolge des ersten Auftretens', () => {
    const d = buildGrid(row(REF_X, REF_G), reader({ x: DATA_X, g: DATA_G }), 'mean');
    assertDeepEqual(d.xCategories, ['A', 'B', 'C']);
    assertDeepEqual(d.yCategories, ['X', 'Y', 'Z']);
  });

  test('Zählwerte gleich der Handrechnung, leere Zählzelle 0', () => {
    const d = buildGrid(row(REF_X, REF_G), reader({ x: DATA_X, g: DATA_G }), 'mean');
    assertDeepEqual(d.cells, [[2, 2, 1], [2, 1, 1], [0, 1, 0]]);
  });

  test('leere X- oder G-Zelle fällt aus beiden Achsen und den Zählwerten', () => {
    const d = buildGrid(row(REF_X, REF_G), reader({ x: ['A', '', 'A', 'B', null, 'C'], g: ['X', 'Y', 'X', 'Y', 'X', ''] }), 'mean');
    assertDeepEqual(d.xCategories, ['A', 'B']);
    assertDeepEqual(d.yCategories, ['X', 'Y']);
    assertDeepEqual(d.cells, [[2, 0], [0, 1]]);
  });

  test('keine gültigen Paare → leer', () => {
    assertDeepEqual(buildGrid(row(REF_X, REF_G), reader({ x: ['', '', ''], g: ['X', 'Y', 'Z'] }), 'mean'), EMPTY);
  });

  test('fehlender X- oder G-Bezug, fehlende Zeile → leer', () => {
    const r = reader({ x: DATA_X, g: DATA_G });
    assertDeepEqual(buildGrid(row(REF_X, null), r, 'mean'), EMPTY);
    assertDeepEqual(buildGrid(row(null, REF_G), r, 'mean'), EMPTY);
    assertDeepEqual(buildGrid(row(null, null, REF_V), r, 'mean'), EMPTY);
    assertDeepEqual(buildGrid(undefined, r, 'mean'), EMPTY);
  });

  test('nicht lesbare Spalte → leer, auch für v', () => {
    const r = reader({ x: ['A'], g: ['X'], v: [1] });
    assertDeepEqual(buildGrid(row(GONE, REF_G), r, 'mean'), EMPTY);
    assertDeepEqual(buildGrid(row(REF_X, GONE), r, 'mean'), EMPTY);
    assertDeepEqual(buildGrid(row(REF_X, REF_G, GONE), r, 'sum'), EMPTY);
  });
});

suite('heatmap: Raster — Werte (mit V)', () => {
  // Spalten A, B; Zeilen X, Y. (A,X): 10, 30; (A,Y): 20; (B,X): 40; (B,Y): leer.
  const X = ['A', 'A', 'A', 'B'];
  const G = ['X', 'X', 'Y', 'X'];
  const V = [10, 30, 20, 40];

  test('Mittelwert je Zelle, leere Wertzelle null', () => {
    const d = buildGrid(row(REF_X, REF_G, REF_V), reader({ x: X, g: G, v: V }), 'mean');
    assertDeepEqual(d, { xCategories: ['A', 'B'], yCategories: ['X', 'Y'], cells: [[20, 40], [20, null]] });
  });

  test('Summe je Zelle, leere Wertzelle null', () => {
    const d = buildGrid(row(REF_X, REF_G, REF_V), reader({ x: X, g: G, v: V }), 'sum');
    assertDeepEqual(d.cells, [[40, 40], [20, null]]);
  });

  test('nicht numerische V-Werte fallen heraus, „2,5“ zählt', () => {
    const d = buildGrid(row(REF_X, REF_G, REF_V), reader({ x: ['A', 'A', 'A', 'A'], g: ['X', 'X', 'X', 'X'], v: [10, 'oops', 30, ''] }), 'mean');
    assertDeepEqual(d.cells, [[20]]);
    const comma = buildGrid(row(REF_X, REF_G, REF_V), reader({ x: ['A', 'A'], g: ['X', 'X'], v: ['2,5', 1.5] }), 'sum');
    assertDeepEqual(comma.cells, [[4]]);
  });

  test('gelesen bis zur kürzesten der gesetzten Spalten', () => {
    const d = buildGrid(row(REF_X, REF_G, REF_V), reader({ x: ['A', 'B', 'C'], g: ['X', 'Y', 'Z'], v: [5, 7] }), 'sum');
    assertDeepEqual(d, { xCategories: ['A', 'B'], yCategories: ['X', 'Y'], cells: [[5, null], [null, 7]] });
  });

  test('Altprojekt (Summe) gleich der Altrechnung: Früh 13/10/7, Spät 5/12/4', () => {
    const d = buildGrid(row(REF_X, REF_G, REF_V), reader({
      x: ['Linie 1', 'Linie 1', 'Linie 2', 'Linie 2', 'Linie 3', 'Linie 1', 'Linie 3', 'Linie 2'],
      g: ['Früh', 'Spät', 'Früh', 'Spät', 'Früh', 'Früh', 'Spät', 'Früh'],
      v: [10, 5, 8, 12, 7, 3, 4, 2],
    }), 'sum');
    assertDeepEqual(d, {
      xCategories: ['Linie 1', 'Linie 2', 'Linie 3'],
      yCategories: ['Früh', 'Spät'],
      cells: [[13, 10, 7], [5, 12, 4]],
    });
    assertDeepEqual(totalsOf(d.cells), { rowTotals: [30, 21], colTotals: [18, 22, 11], total: 51 });
  });
});

suite('heatmap: Summen und Prädikate', () => {
  test('totalsOf überspringt null', () => {
    assertDeepEqual(totalsOf([[20, 40], [20, null]]), { rowTotals: [60, 20], colTotals: [40, 40], total: 80 });
    assertDeepEqual(totalsOf([]), { rowTotals: [], colTotals: [], total: 0 });
  });

  test('hasGrid: beide Achsen nicht leer', () => {
    assertEqual(hasGrid(EMPTY), false);
    assertEqual(hasGrid({ xCategories: ['A'], yCategories: [], cells: [] }), false);
    assertEqual(hasGrid({ xCategories: ['A'], yCategories: ['X'], cells: [[1]] }), true);
  });

  test('additive: ohne v oder mit sum', () => {
    assertEqual(additive(row(REF_X, REF_G), 'mean'), true);
    assertEqual(additive(row(REF_X, REF_G, REF_V), 'sum'), true);
    assertEqual(additive(row(REF_X, REF_G, REF_V), 'mean'), false);
    assertEqual(additive(undefined, 'mean'), true);
  });
});
