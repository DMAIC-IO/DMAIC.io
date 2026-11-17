/**
 * Tests for core/table-data.js — TableData und isCell.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { TableData, isCell } from '../../js/core/table-data.js';

suite('TableData', () => {
  test('fromJSON füllt kurze Spalten mit null auf', () => {
    const t = TableData.fromJSON({ rowCount: 3, columns: [[1], [1, 2, 3]] });
    assertDeepEqual(t.columns, [[1, null, null], [1, 2, 3]]);
    assertEqual(t.rowCount, 3);
    assertEqual(t.rev, 0);
  });

  test('ist nicht erweiterbar, rev bleibt beschreibbar', () => {
    const t = TableData.empty();
    assertEqual(Object.isExtensible(t), false);
    t.rev += 1;
    assertEqual(t.rev, 1);
  });

  test('empty(n) legt n leere Spalten an', () => {
    const t = TableData.empty(2);
    assertDeepEqual(t.toJSON(), { rowCount: 0, columns: [[], []] });
  });

  test('toJSON teilt keine Arrays', () => {
    const t = TableData.fromJSON({ rowCount: 1, columns: [[5]] });
    const j = t.toJSON();
    assertTrue(j.columns[0] !== t.columns[0]);
    assertDeepEqual(j, { rowCount: 1, columns: [[5]] });
  });

  test('get liefert den Zellwert', () => {
    const t = TableData.fromJSON({ rowCount: 2, columns: [[1, 'x']] });
    assertEqual(t.get(0, 1), 'x');
  });

  test('isCell: endliche Zahl, Text, Wahrheitswert, null', () => {
    assertEqual(isCell(NaN), false);
    assertEqual(isCell(Infinity), false);
    assertEqual(isCell({}), false);
    assertEqual(isCell(undefined), false);
    assertTrue(isCell('a') && isCell(1) && isCell(true) && isCell(null));
  });
});
