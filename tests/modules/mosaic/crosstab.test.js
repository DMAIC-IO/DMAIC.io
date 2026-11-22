/**
 * Mosaikdiagramm: Kreuztabelle (domain/crosstab.js) gegen Werte von Hand.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { buildCrossTab, totalsOf } from '../../../js/modules/mosaic/domain/crosstab.js';
import { PALETTE } from '../../../js/core/chart/chart-data-prep.js';

const REF_X = { instanceId: 'i1', sheetId: 's1', columnId: 'cx' };
const REF_G = { instanceId: 'i1', sheetId: 's1', columnId: 'cg' };
const ROW = { x: REF_X, g: REF_G };

/** Spaltenleser über `{ x, g }`; andere Bezüge sind nicht lesbar. */
function reader(map) {
  return {
    values: (ref) => (ref.columnId === 'cx' ? map.x : ref.columnId === 'cg' ? map.g : null),
    name: (ref) => ref.columnId,
  };
}

const DATA_X = ['A', 'A', 'B', 'B', 'C', 'C', 'B', 'A', 'A', 'B'];
const DATA_G = ['X', 'Y', 'X', 'Y', 'X', 'Y', 'X', 'Y', 'X', 'Z'];

suite('mosaic: Kreuztabelle', () => {
  test('Kategorien und Gruppen in der Reihenfolge des ersten Auftretens', () => {
    const d = buildCrossTab(ROW, reader({ x: DATA_X, g: DATA_G }));
    assertDeepEqual(d.categories, ['A', 'B', 'C']);
    assertDeepEqual(d.groups.map((g) => g.name), ['X', 'Y', 'Z']);
  });

  test('Häufigkeiten wie die Kreuztabelle von Hand', () => {
    const d = buildCrossTab(ROW, reader({ x: DATA_X, g: DATA_G }));
    // X: A=2, B=2, C=1 · Y: A=2, B=1, C=1 · Z: A=0, B=1, C=0
    assertDeepEqual(d.groups.map((g) => g.values), [[2, 2, 1], [2, 1, 1], [0, 1, 0]]);
  });

  test('Farben der Gruppen aus der gemeinsamen Palette, reihum', () => {
    const d = buildCrossTab(ROW, reader({ x: DATA_X, g: DATA_G }));
    assertDeepEqual(d.groups.map((g) => g.color), [PALETTE[0], PALETTE[1], PALETTE[2]]);
    const many = Array.from({ length: 13 }, (_, i) => `g${i}`);
    const wide = buildCrossTab(ROW, reader({ x: many.map(() => 'A'), g: many }));
    assertEqual(wide.groups[12].color, PALETTE[0]);
  });

  test('leere X- oder G-Zellen fallen auf beiden Achsen heraus', () => {
    const d = buildCrossTab(ROW, reader({ x: ['A', '', 'A', 'B', null], g: ['X', 'Y', 'X', 'Y', 'X'] }));
    assertDeepEqual(d.categories, ['A', 'B']);
    assertDeepEqual(d.groups.map((g) => g.name), ['X', 'Y']);
    assertDeepEqual(d.groups.map((g) => g.values), [[2, 0], [0, 1]]);
  });

  test('Zahlen zählen als Text ihrer Kategorie', () => {
    const d = buildCrossTab(ROW, reader({ x: [1, 1, 2], g: ['a', 'b', 'a'] }));
    assertDeepEqual(d.categories, ['1', '2']);
  });

  test('gelesen wird bis zur kürzeren Spalte', () => {
    const d = buildCrossTab(ROW, reader({ x: ['A', 'B', 'C'], g: ['X', 'Y'] }));
    assertDeepEqual(d.categories, ['A', 'B']);
    assertDeepEqual(d.groups.map((g) => g.name), ['X', 'Y']);
  });

  test('leer: ohne Zeile, ohne Slot, ohne gültiges Paar, leere oder nicht lesbare Spalte', () => {
    const empty = { categories: [], groups: [] };
    assertDeepEqual(buildCrossTab(undefined, reader({ x: DATA_X, g: DATA_G })), empty);
    assertDeepEqual(buildCrossTab({ x: REF_X, g: null }, reader({ x: DATA_X, g: DATA_G })), empty);
    assertDeepEqual(buildCrossTab({ x: null, g: REF_G }, reader({ x: DATA_X, g: DATA_G })), empty);
    assertDeepEqual(buildCrossTab(ROW, reader({ x: ['', '', ''], g: ['X', 'Y', 'Z'] })), empty);
    assertDeepEqual(buildCrossTab(ROW, reader({ x: [], g: [] })), empty);
    assertDeepEqual(buildCrossTab({ x: REF_X, g: { ...REF_G, columnId: 'weg' } }, reader({ x: DATA_X, g: DATA_G })), empty);
  });

  test('totalsOf: Summe je Kategorie, je Gruppe und insgesamt', () => {
    const d = buildCrossTab(ROW, reader({ x: DATA_X, g: DATA_G }));
    assertDeepEqual(totalsOf(d.groups, d.categories.length), { rowTotals: [4, 4, 2], colTotals: [5, 4, 1], total: 10 });
    assertDeepEqual(totalsOf([], 0), { rowTotals: [], colTotals: [], total: 0 });
  });
});
