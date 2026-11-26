/**
 * Tests for modules/five-why/domain/tree.js — Durchlauf in Anzeigereihenfolge
 * (Ebene 5 ohne `children`), Suche, ids, nächste id, Löschen samt Teilbaum und
 * die Kennzahlen der Statistikleiste samt Verzweigungen.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import {
  MAX_LEVEL, walk, findNode, allIds, parentIds, nextId, removeSubtree, treeStats,
} from '../../../js/modules/five-why/domain/tree.js';

const plain = (v) => JSON.parse(JSON.stringify(v));

/** Knoten auf Ebene `level` (auf Ebene 5 ohne `children`). */
function node(id, level, parentId, answer = '', children = []) {
  return level < 5 ? { id, level, parentId, answer, children } : { id, level, parentId, answer };
}

/**
 * Zwei Wurzeln: 3 mit Kette 7 → 8 → 12 → 20 (Ebene 5) und zweitem Kind 11;
 * 5 mit Kind 6. Wie das Altprojekt nach der Migration.
 */
const TREE = [
  node(3, 1, null, 'a', [
    node(7, 2, 3, 'b', [node(8, 3, 7, 'c', [node(12, 4, 8, 'd', [node(20, 5, 12, 'e')])])]),
    node(11, 2, 3, ''),
  ]),
  node(5, 1, null, 'f', [node(6, 2, 5, 'g')]),
];

suite('five-why tree — Durchlauf und Suche', () => {
  test('MAX_LEVEL ist 5', () => {
    assertEqual(MAX_LEVEL, 5);
  });
  test('walk: Tiefe zuerst, mit Ebene und Elternknoten; Ebene 5 ohne children', () => {
    const seen = [];
    walk(TREE, (n, depth, parent) => seen.push([n.id, depth, parent ? parent.id : null]));
    assertDeepEqual(seen, [[3, 1, null], [7, 2, 3], [8, 3, 7], [12, 4, 8], [20, 5, 12], [11, 2, 3], [5, 1, null], [6, 2, 5]]);
  });
  test('walk: leere Liste ruft nichts', () => {
    let n = 0;
    walk([], () => { n++; });
    assertEqual(n, 0);
  });
  test('findNode findet Wurzeln und tiefe Knoten, sonst null', () => {
    assertEqual(findNode(TREE, 3)?.answer, 'a');
    assertEqual(findNode(TREE, 20)?.answer, 'e');
    assertEqual(findNode(TREE, 6)?.answer, 'g');
    assertEqual(findNode(TREE, 99), null);
    assertEqual(findNode([], 1), null);
  });
  test('allIds in Anzeigereihenfolge, parentIds nur mit Unterfragen', () => {
    assertDeepEqual(allIds(TREE), [3, 7, 8, 12, 20, 11, 5, 6]);
    assertDeepEqual(parentIds(TREE), [3, 7, 8, 12, 5]);
  });
  test('nextId: größte id + 1, im leeren Baum 1', () => {
    assertEqual(nextId(TREE), 21);
    assertEqual(nextId([]), 1);
    assertEqual(nextId([node(4, 1, null)]), 5);
  });
});

suite('five-why tree — removeSubtree', () => {
  test('ein Blatt: nur seine id', () => {
    const t = plain(TREE);
    assertDeepEqual(removeSubtree(t, 11), [11]);
    assertDeepEqual(allIds(t), [3, 7, 8, 12, 20, 5, 6]);
  });
  test('ein verschachtelter Knoten samt Teilbaum', () => {
    const t = plain(TREE);
    assertDeepEqual(removeSubtree(t, 8), [8, 12, 20]);
    assertDeepEqual(allIds(t), [3, 7, 11, 5, 6]);
  });
  test('eine Wurzel samt Teilbaum', () => {
    const t = plain(TREE);
    assertDeepEqual(removeSubtree(t, 3), [3, 7, 8, 12, 20, 11]);
    assertDeepEqual(allIds(t), [5, 6]);
  });
  test('Ebene 5', () => {
    const t = plain(TREE);
    assertDeepEqual(removeSubtree(t, 20), [20]);
    assertDeepEqual(findNode(t, 12)?.children, []);
  });
  test('unbekannte id: nichts entfernt', () => {
    const t = plain(TREE);
    assertDeepEqual(removeSubtree(t, 99), []);
    assertEqual(JSON.stringify(t), JSON.stringify(TREE));
  });
});

suite('five-why tree — treeStats', () => {
  test('leerer Baum', () => {
    assertDeepEqual(treeStats([]), { totalNodes: 0, maxDepth: 0, branches: 0, answered: 0 });
  });
  test('Fragen, Tiefe, Verzweigungen, Antworten', () => {
    assertDeepEqual(treeStats(TREE), { totalNodes: 8, maxDepth: 5, branches: 1, answered: 7 });
  });
  test('je Knoten zählen die Unterfragen über die erste hinaus; Wurzeln nebeneinander zählen nicht', () => {
    const t = [
      node(1, 1, null, '', [node(2, 2, 1), node(3, 2, 1), node(4, 2, 1)]),
      node(5, 1, null, '', [node(6, 2, 5), node(7, 2, 5)]),
      node(8, 1, null),
    ];
    assertEqual(treeStats(t).branches, 3);
  });
  test('Antwort nur aus Leerzeichen zählt nicht als beantwortet', () => {
    const t = [node(1, 1, null, '   ', [node(2, 2, 1, ' x ')])];
    assertDeepEqual(treeStats(t), { totalNodes: 2, maxDepth: 2, branches: 0, answered: 1 });
  });
});
