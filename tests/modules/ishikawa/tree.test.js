/**
 * Tests for modules/ishikawa/domain/tree.js — der Ursachenbaum als flache
 * Zeilenliste mit `parentId`: Baumreihenfolge, Teilbaum, Geschwister, Tiefe.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { ordered, subtreeIds, siblingsOf, depthOf } from '../../../js/modules/ishikawa/domain/tree.js';

const row = (id, parentId = null) => ({ id, parentId });

// Listenreihenfolge absichtlich gemischt: Kinder stehen vor ihren Eltern.
//   1 ─┬─ 3 ─── 5
//      └─ 4
//   2 ─── 6
const ROWS = [row(3, 1), row(1), row(5, 3), row(2), row(6, 2), row(4, 1)];

suite('ishikawa/domain/tree', () => {
  test('ordered: Eltern vor Kindern, Geschwister in Listenreihenfolge', () => {
    assertDeepEqual(ordered(ROWS).map((r) => r.id), [1, 3, 5, 4, 2, 6]);
  });

  test('ordered: liefert die Zeilenobjekte selbst', () => {
    assertEqual(ordered(ROWS)[0], ROWS[1]);
  });

  test('ordered: Waise (parentId ohne Zeile) wird als Wurzel behandelt', () => {
    const rows = [row(1), row(7, 99), row(8, 7)];
    assertDeepEqual(ordered(rows).map((r) => r.id), [1, 7, 8]);
  });

  test('ordered: leere Liste', () => {
    assertDeepEqual(ordered([]), []);
  });

  test('subtreeIds: alle Nachkommen in Baumreihenfolge, ohne die Zeile selbst', () => {
    assertDeepEqual(subtreeIds(ROWS, 1), [3, 5, 4]);
    assertDeepEqual(subtreeIds(ROWS, 3), [5]);
    assertDeepEqual(subtreeIds(ROWS, 4), []);
  });

  test('subtreeIds: unbekannte id → []', () => {
    assertDeepEqual(subtreeIds(ROWS, 42), []);
  });

  test('siblingsOf: Zeilen mit demselben Elternknoten in Baumreihenfolge, die Zeile eingeschlossen', () => {
    assertDeepEqual(siblingsOf(ROWS, 4), [3, 4]);
    assertDeepEqual(siblingsOf(ROWS, 2), [1, 2]);
    assertDeepEqual(siblingsOf(ROWS, 5), [5]);
  });

  test('siblingsOf: Waise steht unter den Wurzeln', () => {
    const rows = [row(1), row(7, 99), row(2)];
    assertDeepEqual(siblingsOf(rows, 7), [1, 7, 2]);
    assertDeepEqual(siblingsOf(rows, 1), [1, 7, 2]);
  });

  test('siblingsOf: unbekannte id → []', () => {
    assertDeepEqual(siblingsOf(ROWS, 42), []);
  });

  test('depthOf: Wurzel 0, Kind 1, Enkel 2; Waise 0', () => {
    assertEqual(depthOf(ROWS, 1), 0);
    assertEqual(depthOf(ROWS, 3), 1);
    assertEqual(depthOf(ROWS, 5), 2);
    assertEqual(depthOf([row(7, 99), row(8, 7)], 7), 0);
    assertEqual(depthOf([row(7, 99), row(8, 7)], 8), 1);
  });
});
