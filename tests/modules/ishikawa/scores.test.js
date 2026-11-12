/**
 * Tests for modules/ishikawa/domain/scores.js und die Ergänzungen in
 * domain/tree.js (effCat, nextId, nextStableId).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { scoreOf, paretoItems, diffRows, compareRows } from '../../../js/modules/ishikawa/domain/scores.js';
import { effCat, nextId, nextStableId } from '../../../js/modules/ishikawa/domain/tree.js';

const row = (id, over = {}) => ({
  id, stableId: `H-${String(id).padStart(3, '0')}`, parentId: null, category: '',
  name: `R${id}`, description: '', ratings: {}, status: 'open', ...over,
});

suite('ishikawa/domain/scores', () => {
  test('scoreOf: Mittel über abgegebene Bewertungen, ohne Bewertung null', () => {
    assertEqual(scoreOf(row(1, { ratings: { 1: 4, 2: 7 } })), 5.5);
    assertEqual(scoreOf(row(1, { ratings: { 3: 0 } })), 0);
    assertEqual(scoreOf(row(1)), null);
  });

  test('paretoItems: ohne Bewertung entfällt, absteigend, Name sonst stableId', () => {
    const rows = [
      row(1, { category: 'man', ratings: { 1: 3 } }),
      row(2, { category: 'method', name: '  ', ratings: { 1: 8 } }),
      row(3, { category: 'machine' }),
    ];
    assertDeepEqual(paretoItems(rows), [
      { stableId: 'H-002', name: 'H-002', category: 'method', score: 8 },
      { stableId: 'H-001', name: 'R1', category: 'man', score: 3 },
    ]);
  });

  test('paretoItems: Unterursache trägt die Kategorie ihrer Hauptursache', () => {
    const rows = [row(1, { category: 'material' }), row(2, { parentId: 1, ratings: { 1: 2 } })];
    assertEqual(paretoItems(rows)[0].category, 'material');
  });

  test('paretoItems: gleiche Scores behalten die Listenreihenfolge', () => {
    const rows = [row(1, { ratings: { 1: 5 } }), row(2, { ratings: { 1: 5 } })];
    assertDeepEqual(paretoItems(rows).map((i) => i.stableId), ['H-001', 'H-002']);
  });

  test('diffRows: Änderung über 0,01, fehlender Score zählt als 0, nur gemeinsame Zeilen', () => {
    const snap = [row(1, { ratings: { 1: 4 } }), row(2, { ratings: { 1: 5 } }), row(3, { ratings: { 1: 2 } }), row(9)];
    const now = [
      row(1, { ratings: { 1: 6 } }),
      row(2, { ratings: { 1: 5 } }),
      row(3),
      row(4, { ratings: { 1: 9 } }),
    ];
    assertDeepEqual(diffRows(now, snap), [
      { stableId: 'H-001', name: 'R1', before: 4, after: 6, delta: 2 },
      { stableId: 'H-003', name: 'R3', before: 2, after: 0, delta: -2 },
    ]);
  });

  test('diffRows: Unterschied von höchstens 0,01 zählt nicht', () => {
    const snap = [row(1, { ratings: { 1: 4, 2: 5 } })];
    const now = [row(1, { ratings: { 1: 4, 2: 5 } })];
    assertDeepEqual(diffRows(now, snap), []);
  });

  test('diffRows: Grenze — genau 0,01 zählt nicht, 0,02 zählt', () => {
    const zeros = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [i + 1, 0]));
    const snap = [row(1, { ratings: zeros })];
    assertDeepEqual(diffRows([row(1, { ratings: { ...zeros, 1: 1 } })], snap), []);
    assertDeepEqual(diffRows([row(1, { ratings: { ...zeros, 1: 1, 2: 1 } })], snap),
      [{ stableId: 'H-001', name: 'R1', before: 0, after: 0.02, delta: 0.02 }]);
  });

  test('compareRows: neue und entfernte stableIds, dazu die Score-Änderungen', () => {
    const snap = [row(1, { ratings: { 1: 8 } }), row(2), row(9)];
    const now = [row(1, { ratings: { 1: 7 } }), row(2), row(5)];
    assertDeepEqual(compareRows(now, snap), {
      added: ['H-005'],
      removed: ['H-009'],
      changed: [{ stableId: 'H-001', name: 'R1', before: 8, after: 7, delta: -1 }],
    });
  });
});

suite('ishikawa/domain/tree — Ergänzungen', () => {
  test('effCat: eigene Kategorie, sonst die der Vorfahren; Waise und Zyklus leer', () => {
    const rows = [row(1, { category: 'man' }), row(2, { parentId: 1 }), row(3, { parentId: 2 }),
      row(4, { parentId: 99 }), row(5, { parentId: 6 }), row(6, { parentId: 5 })];
    assertEqual(effCat(rows, rows[0]), 'man');
    assertEqual(effCat(rows, rows[2]), 'man');
    assertEqual(effCat(rows, rows[3]), '');
    assertEqual(effCat(rows, rows[4]), '');
    assertEqual(effCat(rows, undefined), '');
  });

  test('nextId: max + 1, leer 1', () => {
    assertEqual(nextId([]), 1);
    assertEqual(nextId([{ id: 3 }, { id: 7 }, { id: 2 }]), 8);
  });

  test('nextStableId: über Zeilen und Snapshot-Zeilen', () => {
    assertEqual(nextStableId([], []), 'H-001');
    const snaps = [{ data: { rows: [row(12)] } }];
    assertEqual(nextStableId([row(3)], snaps), 'H-013');
    assertEqual(nextStableId([row(3), { ...row(4), stableId: 'X' }], []), 'H-004');
  });
});
