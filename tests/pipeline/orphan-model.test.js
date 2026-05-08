/**
 * Pipeline test — orphan-model.
 *
 * When the experiment that produced a saved model is deleted from the project,
 * the model becomes "orphaned": it can no longer probe its source for fresh
 * data, but the dataSnapshot stays intact so prior predictions remain
 * reproducible. Re-training is gated by the UI (out of scope for this unit
 * test); the contract verified here is the freshness state and snapshot
 * self-sufficiency.
 */

import { suite, test, assertAlmostEqual, assertEqual } from '../test-utils.js';
import { runMultiRegression } from '../../js/engines/regression-engine.js';
import {
  saveModel, getModel, getModelFreshness, computeDataHash, buildDataSnapshot,
} from '../../js/core/models-store.js';

function makeStateManager(initial = {}) {
  const state = JSON.parse(JSON.stringify(initial));
  return {
    get(p) { return p.split('.').reduce((o, k) => o?.[k], state); },
    set(p, v) {
      const k = p.split('.'); let o = state;
      for (let i = 0; i < k.length - 1; i++) { o[k[i]] ??= {}; o = o[k[i]]; }
      o[k[k.length - 1]] = v;
    },
    _state: state,
  };
}

suite('Pipeline — orphan model after experiment deletion', () => {
  // Build a simple 2² × 2-replicate dataset and fit it.
  const X = [
    [-1, -1], [-1, -1], [-1, 1], [-1, 1],
    [ 1, -1], [ 1, -1], [ 1, 1], [ 1, 1],
  ];
  const y = [10, 10.2, 8, 8.1, 20, 20.1, 18, 18.2];
  const xCols = [X.map(r => r[0]), X.map(r => r[1])];
  const fit = runMultiRegression(xCols, y, 1, 0.95, ['X1', 'X2']);

  // Seed state with the source experiment so the probe can resolve it.
  const sm = makeStateManager({
    experiments: {
      'exp-target': {
        name: 'Target',
        runMatrix: { worksheetRef: { instanceId: 'ws-1', sheetId: 's-1' } },
        responseColumns: [{ columnId: 'col_y', name: 'Y' }],
      },
    },
  });

  const factorSpec = [{ name: 'X1', low: -1, high: 1 }, { name: 'X2', low: -1, high: 1 }];
  const modelId = saveModel(sm, {
    name: 'Y',
    experimentId: 'exp-target',
    responseSpec: { sourceColumn: 'col_y', transform: 'identity', aggregateOver: null },
    termSet: fit.reg.terms,
    coef: fit.reg.coeffs,
    rSqAdj: fit.adjR2,
    factorSpec,
    dataSnapshot: buildDataSnapshot({
      X, y, factorSpec, termSet: fit.reg.terms,
      experimentId: 'exp-target', responseColumn: 'col_y',
    }),
    dataHash: computeDataHash(X, y),
  });

  // A probe that resolves the source iff the experiment is still present.
  function probe(sourceColumn, experimentId) {
    if (experimentId == null) return null;
    if (!sm.get(`experiments.${experimentId}`)) return null;
    return { X, y };
  }

  test('starts fresh while the experiment is present', () => {
    assertEqual(getModelFreshness(getModel(sm, modelId), probe), 'fresh');
  });

  test('becomes orphan when the experiment is deleted', () => {
    const exps = { ...sm.get('experiments') };
    delete exps['exp-target'];
    sm.set('experiments', exps);
    assertEqual(getModelFreshness(getModel(sm, modelId), probe), 'orphan');
  });

  test('snapshot survives orphaning and reproduces the original fit', () => {
    const m = getModel(sm, modelId);
    // Re-run regression on the snapshot — coefficients must match what we saved.
    const snapXCols = [
      m.dataSnapshot.X.map(r => r[0]),
      m.dataSnapshot.X.map(r => r[1]),
    ];
    const refit = runMultiRegression(snapXCols, m.dataSnapshot.y, 1, 0.95, ['X1', 'X2']);
    for (let i = 0; i < m.coef.length; i++) {
      assertAlmostEqual(refit.reg.coeffs[i], m.coef[i], 1e-9, `coef[${i}]`);
    }
  });

  test('snapshot fingerprint preserves the original experiment id even after deletion', () => {
    const m = getModel(sm, modelId);
    assertEqual(m.dataSnapshot.sourceFingerprint.experimentId, 'exp-target');
    assertEqual(m.dataSnapshot.sourceFingerprint.responseColumn, 'col_y');
  });
});
