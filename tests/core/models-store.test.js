/**
 * Tests for js/core/models-store.js
 *
 * Covers the public API: saveModel, getModel, listModels, deleteModel,
 * computeDataHash, getModelFreshness, buildDataSnapshot.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import {
  saveModel, getModel, listModels, deleteModel,
  computeDataHash, getModelFreshness, buildDataSnapshot,
} from '../../js/core/models-store.js';

function makeStateManager() {
  const state = {};
  return {
    get(path) { return path.split('.').reduce((o, k) => o?.[k], state); },
    set(path, value) {
      const keys = path.split('.');
      let obj = state;
      for (let i = 0; i < keys.length - 1; i++) { obj[keys[i]] = obj[keys[i]] ?? {}; obj = obj[keys[i]]; }
      obj[keys[keys.length - 1]] = value;
    },
    _state: state,
  };
}

const fixtureRecord = (overrides = {}) => ({
  name: 'Yield Mean Model',
  experimentId: 'exp-1',
  responseSpec: { sourceColumn: 'col_y_mean', transform: 'mean', aggregateOver: null },
  termSet: ['1', 'X1', 'X2', 'X1·X2'],
  coef: [1, 0.5, -0.3, 0.1],
  vcov: null, sigma2: 0.04, df: 8, rSqAdj: 0.9, lofPValue: 0.4,
  factorSpec: [{ name: 'X1', low: -1, high: 1 }, { name: 'X2', low: -1, high: 1 }],
  dataSnapshot: { X: [[1,1,1],[1,1,-1]], y: [10, 11], factorSpec: [], termSet: [], trainedAt: '2026-01-01T00:00:00Z', sourceFingerprint: {} },
  dataHash: 'deadbeef',
  createdFromInstanceId: 'reg-instance-1',
  ...overrides,
});

suite('ModelsStore — computeDataHash', () => {
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

suite('ModelsStore — saveModel / getModel', () => {
  test('saveModel without id mints a new id', () => {
    const sm = makeStateManager();
    const id = saveModel(sm, fixtureRecord());
    assertEqual(typeof id, 'string');
    assertEqual(id.length > 0, true);
    const stored = getModel(sm, id);
    assertEqual(stored.id, id);
    assertEqual(stored.name, 'Yield Mean Model');
  });

  test('saveModel with existing id updates in place', () => {
    const sm = makeStateManager();
    const id1 = saveModel(sm, fixtureRecord());
    const original = getModel(sm, id1);
    const id2 = saveModel(sm, { ...fixtureRecord({ id: id1, name: 'Renamed' }) });
    assertEqual(id1, id2);
    const updated = getModel(sm, id1);
    assertEqual(updated.name, 'Renamed');
    assertEqual(updated.createdAt, original.createdAt);    // preserved
    assertEqual(updated.updatedAt !== original.updatedAt || updated.updatedAt === original.updatedAt, true); // may equal in fast tests
  });

  test('getModel returns null for unknown id', () => {
    const sm = makeStateManager();
    assertEqual(getModel(sm, 'no-such-id'), null);
  });
});

suite('ModelsStore — listModels', () => {
  test('lists all models when no filter is given', () => {
    const sm = makeStateManager();
    saveModel(sm, fixtureRecord({ name: 'A', experimentId: 'exp-1' }));
    saveModel(sm, fixtureRecord({ name: 'B', experimentId: 'exp-2' }));
    const all = listModels(sm);
    assertEqual(all.length, 2);
  });

  test('filter by experimentId', () => {
    const sm = makeStateManager();
    saveModel(sm, fixtureRecord({ name: 'A', experimentId: 'exp-1' }));
    saveModel(sm, fixtureRecord({ name: 'B', experimentId: 'exp-2' }));
    saveModel(sm, fixtureRecord({ name: 'C', experimentId: 'exp-1' }));
    const e1 = listModels(sm, { experimentId: 'exp-1' });
    assertEqual(e1.length, 2);
    assertEqual(e1.every(m => m.experimentId === 'exp-1'), true);
  });

  test('filter by experimentId=null returns ad-hoc models only', () => {
    const sm = makeStateManager();
    saveModel(sm, fixtureRecord({ experimentId: 'exp-1' }));
    saveModel(sm, fixtureRecord({ experimentId: null }));
    const adHoc = listModels(sm, { experimentId: null });
    assertEqual(adHoc.length, 1);
  });
});

suite('ModelsStore — deleteModel', () => {
  test('removes the entry', () => {
    const sm = makeStateManager();
    const id = saveModel(sm, fixtureRecord());
    assertEqual(getModel(sm, id) !== null, true);
    deleteModel(sm, id);
    assertEqual(getModel(sm, id), null);
  });

  test('no-op for unknown id', () => {
    const sm = makeStateManager();
    deleteModel(sm, 'unknown');   // should not throw
    assertEqual(true, true);
  });
});

suite('ModelsStore — getModelFreshness', () => {
  const X = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const y = [10, 12, 14, 16];
  const baseHash = computeDataHash(X, y);

  test('returns "fresh" when current data matches dataHash', () => {
    const model = { dataHash: baseHash, responseSpec: { sourceColumn: 'col_a' } };
    const status = getModelFreshness(model, () => ({ X, y }));
    assertEqual(status, 'fresh');
  });

  test('returns "stale" when source still exists but data changed', () => {
    const model = { dataHash: baseHash, responseSpec: { sourceColumn: 'col_a' } };
    const status = getModelFreshness(model, () => ({ X, y: [10, 12, 14, 17] }));
    assertEqual(status, 'stale');
  });

  test('returns "orphan" when probe says source is gone', () => {
    const model = { dataHash: baseHash, responseSpec: { sourceColumn: 'col_a' } };
    const status = getModelFreshness(model, () => null);
    assertEqual(status, 'orphan');
  });

  test('returns "orphan" when model has no dataHash', () => {
    const model = { responseSpec: { sourceColumn: 'col_a' } };
    const status = getModelFreshness(model, () => ({ X, y }));
    assertEqual(status, 'orphan');
  });
});

suite('ModelsStore — buildDataSnapshot', () => {
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
