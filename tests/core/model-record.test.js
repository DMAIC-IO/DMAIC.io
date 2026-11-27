/**
 * Tests for js/core/model-record.js — the pure helpers that build a saved
 * model record (data hash, self-contained data snapshot).
 */

import { suite, test, assertEqual } from '../test-utils.js';
import { computeDataHash, buildDataSnapshot } from '../../js/core/model-record.js';
import * as store from '../../js/core/models-store.js';

suite('ModelRecord — computeDataHash', () => {
  test('produces 8-char hex hash', () => {
    const h = computeDataHash([[1, 2], [3, 4]], [10, 20]);
    assertEqual(h.length, 8);
    assertEqual(/^[0-9a-f]{8}$/.test(h), true);
  });

  test('hashes are deterministic for the same input', () => {
    const a = computeDataHash([[1, 2], [3, 4]], [10, 20]);
    const b = computeDataHash([[1, 2], [3, 4]], [10, 20]);
    assertEqual(a, b);
  });

  test('hashes differ when X changes', () => {
    const a = computeDataHash([[1, 2]], [10]);
    const b = computeDataHash([[1, 3]], [10]);
    assertEqual(a !== b, true);
  });

  test('hashes differ when y changes', () => {
    const a = computeDataHash([[1, 2]], [10]);
    const b = computeDataHash([[1, 2]], [11]);
    assertEqual(a !== b, true);
  });
});

suite('ModelRecord — buildDataSnapshot', () => {
  test('captures X, y, factorSpec, termSet plus a fingerprint', () => {
    const snap = buildDataSnapshot({
      X: [[1, 0], [1, 1]],
      y: [5, 7],
      factorSpec: [{ name: 'X1', low: 0, high: 1 }],
      termSet: ['1', 'X1'],
      experimentId: 'exp-7',
      responseColumn: 'col_y',
    });
    assertEqual(snap.X.length, 2);
    assertEqual(snap.y.length, 2);
    assertEqual(snap.termSet.length, 2);
    assertEqual(snap.sourceFingerprint.experimentId, 'exp-7');
    assertEqual(snap.sourceFingerprint.responseColumn, 'col_y');
    assertEqual(typeof snap.sourceFingerprint.workbookHash, 'string');
  });

  test('clones X and y so callers cannot mutate the snapshot', () => {
    const X = [[1, 0]];
    const y = [5];
    const snap = buildDataSnapshot({
      X, y,
      factorSpec: [{ name: 'X1' }],
      termSet: ['1', 'X1'],
    });
    X[0][0] = 99;
    y[0] = 99;
    assertEqual(snap.X[0][0], 1);
    assertEqual(snap.y[0], 5);
  });
});

suite('ModelRecord — models-store re-exports', () => {
  test('models-store hands out the same functions until K2 removes it', () => {
    assertEqual(store.computeDataHash, computeDataHash);
    assertEqual(store.buildDataSnapshot, buildDataSnapshot);
  });
});
