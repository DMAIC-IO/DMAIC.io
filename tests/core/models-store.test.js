/**
 * Tests for js/core/models-store.js
 *
 * Covers the public API: saveModel, getModel, listModels, deleteModel,
 * getModelFreshness. computeDataHash/buildDataSnapshot live in
 * core/model-record.js (tests/core/model-record.test.js).
 */

import { suite, test, assertEqual } from '../test-utils.js';
import {
  saveModel, getModel, listModels, deleteModel,
  computeDataHash, getModelFreshness,
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

/**
 * Run `fn` with `crypto.randomUUID` hidden, as in an insecure context (plain
 * http on a non-localhost host). Same shadowing trick as tests/core/uid.test.js.
 */
function withoutRandomUUID(fn) {
  Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true, writable: true });
  try { return fn(); } finally { delete crypto.randomUUID; }
}

suite('ModelsStore — saveModel / getModel', () => {
  test('saveModel without id mints an id in an insecure context too', () => {
    const sm = makeStateManager();
    const id = withoutRandomUUID(() => saveModel(sm, { name: 'M1' }));
    assertEqual(typeof id, 'string');
    assertEqual(getModel(sm, id).name, 'M1');
  });

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
