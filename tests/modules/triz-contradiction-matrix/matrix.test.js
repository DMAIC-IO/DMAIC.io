/**
 * Tests for modules/triz-contradiction-matrix/domain/matrix.js — Form der
 * 39×39-Tabelle, Stichproben, die Diagonalzellen mit Listen, `lookup` und
 * `recommendationOf` je Zustand und eine Prüfsumme über die ganze Tabelle
 * (gebildet aus der früheren Quelldatei `matrix.json`, mit ihr tief gleich).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { cyrb53 } from '../../../js/core/hash.js';
import {
  MATRIX, PARAMETER_COUNT, PRINCIPLE_COUNT, lookup, recommendationOf,
} from '../../../js/modules/triz-contradiction-matrix/domain/matrix.js';

suite('triz-contradiction-matrix Tabelle — Form', () => {
  test('39 Parameter, 40 Prinzipien, 39 Zeilen zu je 39 Zellen', () => {
    assertEqual(PARAMETER_COUNT, 39);
    assertEqual(PRINCIPLE_COUNT, 40);
    assertEqual(MATRIX.length, PARAMETER_COUNT);
    for (const row of MATRIX) assertEqual(row.length, PARAMETER_COUNT);
  });
  test('jede Zelle ist null oder eine Liste aus 1 bis 4 verschiedenen ganzen Zahlen 1 bis 40', () => {
    let filled = 0;
    let empty = 0;
    for (const row of MATRIX) {
      for (const cell of row) {
        if (cell === null) { empty++; continue; }
        filled++;
        assertTrue(cell.length >= 1 && cell.length <= 4, `length ${cell.length}`);
        assertEqual(new Set(cell).size, cell.length);
        for (const id of cell) assertTrue(Number.isInteger(id) && id >= 1 && id <= PRINCIPLE_COUNT, `id ${id}`);
      }
    }
    assertEqual(filled, 1243);
    assertEqual(empty, 278);
  });
  test('eingefroren bis in die Zellen', () => {
    assertTrue(Object.isFrozen(MATRIX));
    assertTrue(MATRIX.every((row) => Object.isFrozen(row)));
    assertTrue(MATRIX.flat().every((cell) => cell === null || Object.isFrozen(cell)));
  });
  test('Stichproben', () => {
    assertDeepEqual([...MATRIX[0][2]], [15, 8, 29, 34]);
    assertDeepEqual([...MATRIX[8][13]], [8, 3, 26, 14]);
    assertDeepEqual([...MATRIX[13][0]], [1, 8, 40, 15]);
    assertDeepEqual([...MATRIX[20][32]], [26, 35, 10]);
    assertEqual(MATRIX[0][1], null);
    assertEqual(MATRIX[8][38], null);
  });
  test('die Diagonale ist leer bis auf die Zellen 32, 33, 34, 36 und 37 (unverändert aus der Quelle)', () => {
    const lists = {};
    MATRIX.forEach((row, i) => { if (row[i] !== null) lists[i + 1] = [...row[i]]; });
    assertDeepEqual(lists, {
      32: [2, 5, 13, 16], 33: [2, 13, 15], 34: [7, 1, 4, 16], 36: [12, 26], 37: [34, 27, 25],
    });
  });
});

suite('triz-contradiction-matrix Tabelle — Prüfsumme', () => {
  test('cyrb53 über JSON der Tabelle gleicht der früheren Quelldatei', () => {
    assertEqual(cyrb53(JSON.stringify(MATRIX)), 1461895991295664);
  });
});

suite('triz-contradiction-matrix Tabelle — lookup', () => {
  test('Paar mit Eintrag liefert die Zelle in Reihenfolge', () => {
    assertDeepEqual([...lookup(9, 14)], [8, 3, 26, 14]);
    assertDeepEqual([...lookup(21, 33)], [26, 35, 10]);
  });
  test('leere Zelle → null', () => {
    assertEqual(lookup(1, 2), null);
    assertEqual(lookup(9, 39), null);
  });
  test('fehlender Parameter → null', () => {
    assertEqual(lookup(null, 3), null);
    assertEqual(lookup(1, null), null);
    assertEqual(lookup(null, null), null);
  });
  test('gleiches Paar → null, auch auf einer Diagonalzelle mit Liste', () => {
    assertEqual(lookup(5, 5), null);
    assertEqual(lookup(32, 32), null);
  });
});

suite('triz-contradiction-matrix Tabelle — recommendationOf', () => {
  test('incomplete, solange ein Parameter fehlt', () => {
    assertDeepEqual(recommendationOf(null, null), { status: 'incomplete', ids: [] });
    assertDeepEqual(recommendationOf(9, null), { status: 'incomplete', ids: [] });
    assertDeepEqual(recommendationOf(null, 14), { status: 'incomplete', ids: [] });
  });
  test('sameParameter bei gleichem Paar', () => {
    assertDeepEqual(recommendationOf(5, 5), { status: 'sameParameter', ids: [] });
    assertDeepEqual(recommendationOf(32, 32), { status: 'sameParameter', ids: [] });
  });
  test('noEntry bei leerer Zelle', () => {
    assertDeepEqual(recommendationOf(1, 2), { status: 'noEntry', ids: [] });
    assertDeepEqual(recommendationOf(9, 39), { status: 'noEntry', ids: [] });
  });
  test('found mit den ids in Zellreihenfolge, als eigene Liste', () => {
    const r = recommendationOf(1, 3);
    assertDeepEqual(r, { status: 'found', ids: [15, 8, 29, 34] });
    assertTrue(!Object.isFrozen(r.ids));
    r.ids.push(99);
    assertDeepEqual([...MATRIX[0][2]], [15, 8, 29, 34]);
  });
});
