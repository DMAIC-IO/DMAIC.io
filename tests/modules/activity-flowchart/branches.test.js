/**
 * Activity-Flowchart: Bänder (domain/branches.js) — Block, Lücke ↔ Endindex,
 * `reconcile`, `validBands`.
 */
import { suite, test, assertEqual, assertDeepEqual, assert } from '../../test-utils.js';
import {
  branchOwnerId, memberIndices, blockIndices, reconcile, branchesValid, validBands, knownBands,
  moveBlock, gapToIndex, indexToGap,
} from '../../../js/modules/activity-flowchart/domain/branches.js';

const a = (id, branchId = 'main') => ({ id, kind: 'activity', branchId });
const d = (id, branchId = 'main') => ({ id, kind: 'decision', branchId });
/** a · D [x · E [e1] · y] · b */
const nested = () => [a('a'), d('D'), a('x', 'no:D'), d('E', 'no:D'), a('e1', 'no:E'), a('y', 'no:D'), a('b')];
const ids = (steps) => steps.map((s) => s.id);

suite('Activity-Flowchart Bänder', () => {
  test('branchOwnerId', () => {
    assertEqual(branchOwnerId('no:D'), 'D');
    assertEqual(branchOwnerId('main'), null);
    assertEqual(branchOwnerId('no:'), null);
    assertEqual(branchOwnerId(7), null);
  });

  test('memberIndices zählt verschachtelte Unterbänder mit, ohne die Raute', () => {
    assertDeepEqual(memberIndices(nested(), 'no:D'), [2, 3, 4, 5]);
    assertDeepEqual(memberIndices(nested(), 'no:E'), [4]);
    assertDeepEqual(memberIndices(nested(), 'no:zz'), []);
    assertDeepEqual(memberIndices(nested(), 'main'), [0, 1, 2, 3, 4, 5, 6], 'der Hauptpfad umfasst alle Unterbänder');
  });

  test('blockIndices: Raute samt Band, sonst der Schritt allein', () => {
    assertDeepEqual(blockIndices(nested(), 'D'), [1, 2, 3, 4, 5]);
    assertDeepEqual(blockIndices(nested(), 'x'), [2]);
    assertDeepEqual(blockIndices(nested(), 'zz'), []);
  });

  test('reconcile: Band einer späteren, fehlenden oder Nicht-Raute → main; Eingabe bleibt', () => {
    const steps = [a('x', 'no:D'), d('D'), a('y', 'no:D'), a('z', 'no:y'), a('w', 'no:zz')];
    const out = reconcile(steps);
    assertDeepEqual(out.map((s) => s.branchId), ['main', 'main', 'no:D', 'main', 'main']);
    assertEqual(steps[0].branchId, 'no:D');
    assert(out[2] === steps[2], 'unveränderte Schritte bleiben dieselben Objekte');
    assertEqual(branchesValid(steps), false);
    assertEqual(branchesValid(out), true);
  });

  test('validBands: Hauptpfad und das Band jeder Raute davor; knownBands: alle', () => {
    assertDeepEqual(validBands(nested(), 'a'), ['main']);
    assertDeepEqual(validBands(nested(), 'e1'), ['main', 'no:D', 'no:E']);
    assertDeepEqual(validBands(nested(), 'D'), ['main']);
    assertDeepEqual(validBands(nested(), 'zz'), []);
    assertDeepEqual(knownBands(nested()), ['main', 'no:D', 'no:E']);
  });

  test('moveBlock: Endindex der Raute, der Block wandert geschlossen', () => {
    assertDeepEqual(ids(moveBlock(nested(), 'D', 2)), ['a', 'b', 'D', 'x', 'E', 'e1', 'y']);
    assertDeepEqual(ids(moveBlock(nested(), 'D', 0)), ['D', 'x', 'E', 'e1', 'y', 'a', 'b']);
    assertDeepEqual(ids(moveBlock(nested(), 'b', 0)), ['b', 'a', 'D', 'x', 'E', 'e1', 'y']);
    const gapped = [d('D'), a('x', 'no:D'), a('m'), a('y', 'no:D')];
    assertDeepEqual(ids(moveBlock(gapped, 'D', 0)), ['D', 'x', 'y', 'm']);
  });

  test('gapToIndex: Lücken der Altform (vor dem Verschieben gezählt) → Endindex', () => {
    const s = nested();
    // Einzelschritt b (Index 6): Lücke 0 → 0, Lücke 6/7 (an ihm) → 6.
    assertEqual(gapToIndex(s, 'b', 0), 0);
    assertEqual(gapToIndex(s, 'b', 6), 6);
    assertEqual(gapToIndex(s, 'b', 7), 6);
    assertEqual(gapToIndex(s, 'a', 3), 2);
    // Block D (1…5): jede Lücke im eigenen Bereich ist die eigene Stelle.
    for (const gap of [1, 2, 3, 4, 5, 6]) assertEqual(gapToIndex(s, 'D', gap), 1, `Lücke ${gap}`);
    assertEqual(gapToIndex(s, 'D', 7), 2);
    assertEqual(gapToIndex(s, 'D', 0), 0);
  });

  test('indexToGap ist die Umkehrung für die Hervorhebung', () => {
    const s = nested();
    assertEqual(indexToGap(s, 'D', 0), 0);
    assertEqual(indexToGap(s, 'D', 2), 7);
    assertEqual(indexToGap(s, 'b', 0), 0);
    assertEqual(indexToGap(s, 'a', 2), 3);
    for (const [id, index] of [['D', 0], ['D', 2], ['b', 3], ['a', 4]]) {
      assertEqual(gapToIndex(s, id, indexToGap(s, id, index)), index, `${id} ${index}`);
    }
  });
});
