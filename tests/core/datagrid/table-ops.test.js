/** Reine Tabellenoperationen (core/datagrid/table/ops.js). */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { TableData } from '../../../js/core/table-data.js';
import {
  setRange, insertRows, deleteRows, moveRowData, insertColumn, deleteColumn, moveColumnData,
  sortPermutation, applyPermutation, invertPermutation, convertColumn,
} from '../../../js/core/datagrid/table/ops.js';

const mk = () => TableData.fromJSON({ rowCount: 4, columns: [[1, 2, 3, 4], ['a', 'b', 'c', 'd']] });
const snap = (t) => JSON.stringify(t.toJSON());

suite('Tabellenoperationen', () => {
  test('setRange und Umkehr', () => {
    const t = mk(); const s = snap(t);
    const { before } = setRange(t, 0, 1, [[20, 30], ['B', 'C']]);
    assertDeepEqual(t.columns[0], [1, 20, 30, 4]);
    assertDeepEqual(before, [[2, 3], ['b', 'c']]);
    setRange(t, 0, 1, before);
    assertEqual(snap(t), s);
  });

  test('setRange außerhalb wirft', () => {
    let threw = false;
    try { setRange(mk(), 0, 3, [[1, 2]]); } catch { threw = true; }
    assertEqual(threw, true);
  });

  test('setRange mit zu breitem Block lässt die Tabelle unverändert', () => {
    const t = mk(); const s = snap(t);
    let threw = false;
    try { setRange(t, 1, 0, [['x'], [1]]); } catch { threw = true; }
    assertEqual(threw, true);
    assertEqual(snap(t), s);
  });

  test('insertColumn mit zu vielen Werten wirft, zu wenige werden aufgefüllt', () => {
    const t = mk();
    let threw = false;
    try { insertColumn(t, 0, [1, 2, 3, 4, 5]); } catch { threw = true; }
    assertEqual(threw, true);
    assertEqual(t.columns.length, 2);
    insertColumn(t, 0, [1]);
    assertDeepEqual(t.columns[0], [1, null, null, null]);
  });

  test('insertRows und deleteRows hin und zurück', () => {
    const t = mk(); const s = snap(t);
    insertRows(t, 2, 2);
    assertEqual(t.rowCount, 6);
    assertDeepEqual(t.columns[0], [1, 2, null, null, 3, 4]);
    deleteRows(t, 2, 2);
    assertEqual(snap(t), s);
    const { removed } = deleteRows(t, 1, 2);
    assertEqual(t.rowCount, 2);
    assertDeepEqual(removed, [[2, 3], ['b', 'c']]);
    insertRows(t, 1, 2);
    setRange(t, 0, 1, removed);
    assertEqual(snap(t), s);
  });

  test('moveRowData hin und zurück', () => {
    const t = mk(); const s = snap(t);
    moveRowData(t, 0, 2);
    assertDeepEqual(t.columns[0], [2, 3, 1, 4]);
    assertDeepEqual(t.columns[1], ['b', 'c', 'a', 'd']);
    moveRowData(t, 2, 0);
    assertEqual(snap(t), s);
  });

  test('Spalten einfügen, löschen, verschieben', () => {
    const t = mk(); const s = snap(t);
    insertColumn(t, 1);
    assertDeepEqual(t.columns[1], [null, null, null, null]);
    const vals = deleteColumn(t, 1);
    assertEqual(vals.length, 4);
    insertColumn(t, 0, [9, 8, 7, 6]);
    assertDeepEqual(t.columns[0], [9, 8, 7, 6]);
    assertDeepEqual(deleteColumn(t, 0), [9, 8, 7, 6]);
    moveColumnData(t, 0, 1);
    assertDeepEqual(t.columns[0], ['a', 'b', 'c', 'd']);
    moveColumnData(t, 1, 0);
    assertEqual(snap(t), s);
  });

  test('sortPermutation: Zahlen aufsteigend, null am Ende, stabil', () => {
    assertDeepEqual(sortPermutation([3, null, 1, 2, 1], 'asc'), [2, 4, 3, 0, 1]);
    assertDeepEqual(sortPermutation([3, null, 1, 2], 'desc'), [0, 3, 2, 1]);
    assertDeepEqual(sortPermutation(['b', 'a', null], 'asc'), [1, 0, 2]);
  });

  test('applyPermutation und invertPermutation stellen die Ordnung wieder her', () => {
    const t = mk(); const s = snap(t);
    const perm = sortPermutation([4, 2, 9, 1], 'asc');
    applyPermutation(t, perm);
    assertDeepEqual(t.columns[0], [4, 2, 3, 1].map((_, i) => [1, 2, 3, 4][perm[i]]));
    assertDeepEqual(t.columns[1], perm.map((p) => ['a', 'b', 'c', 'd'][p]));
    applyPermutation(t, invertPermutation(perm));
    assertEqual(snap(t), s);
  });

  test('convertColumn wie setColumnType', () => {
    assertDeepEqual(convertColumn(['1', '2,5', 'x', null], 'text', 'numeric'), [1, 2.5, null, null]);
    assertDeepEqual(convertColumn([1, 0, 2, '1', null], 'numeric', 'binary'), [1, 0, null, 1, null]);
    assertDeepEqual(convertColumn([1, null, 2.5], 'numeric', 'text'), ['1', null, '2.5']);
    assertDeepEqual(convertColumn(['31.12.2025', null], 'text', 'date'), ['2025-12-31', null]);
    assertDeepEqual(convertColumn(['9'], 'text', 'time'), ['9:00']);
    const v = [1, 2];
    const same = convertColumn(v, 'numeric', 'numeric');
    assertEqual(same !== v, true);
    assertDeepEqual(same, [1, 2]);
  });
});
