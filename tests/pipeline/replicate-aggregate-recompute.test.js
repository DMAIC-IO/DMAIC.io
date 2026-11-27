/**
 * Pipeline test — replicate-aggregate-recompute.
 *
 * When a user edits a measurement inside a replicate group, the worksheet's
 * Y_Mean / Y_LnVar formula columns should recompute automatically; the model
 * trained on the previous aggregates becomes stale.
 *
 * This test exercises the *math* contract of that recompute: aggregating y
 * over `replicateGroups` is what the worksheet formulas deliver, and
 * `computeDataHash` against the record's `dataHash` is what tells a stale model. The formula engine's
 * own correctness (AVERAGEIF / VARIF) is covered by the datagrid tests.
 */

import { suite, test, assertAlmostEqual, assertEqual } from '../test-utils.js';
import { runMultiRegression } from '../../js/engines/regression-engine.js';
import { computeDataHash } from '../../js/core/model-record.js';
import { modelRecord } from '../helpers/model-record.js';

/** Gleicher Hash der aktuellen Daten wie beim Training: das Modell ist frisch. */
function isFresh(model, current) {
  return computeDataHash(current.X, current.y) === model.dataHash;
}

/** Aggregate y over replicate groups — mirrors what AVERAGEIF / VARIF produce
 *  in the worksheet helper columns. Singletons pass through unchanged. */
function aggregate(y, groups) {
  const groupOf = new Map();
  groups.forEach((g, gi) => g.forEach(i => groupOf.set(i, gi)));
  const meanByGroup = groups.map(g => g.reduce((s, i) => s + y[i], 0) / g.length);
  const yMean = y.map((_, i) => groupOf.has(i) ? meanByGroup[groupOf.get(i)] : y[i]);
  return yMean;
}

suite('Pipeline — replicate-aggregate recompute → model goes stale', () => {
  // 2² design replicated 3× (12 runs, 4 unique design points).
  const X = [
    [-1, -1], [-1, -1], [-1, -1],
    [-1,  1], [-1,  1], [-1,  1],
    [ 1, -1], [ 1, -1], [ 1, -1],
    [ 1,  1], [ 1,  1], [ 1,  1],
  ];
  const replicateGroups = [[0,1,2], [3,4,5], [6,7,8], [9,10,11]];
  const yRaw = [10.0, 10.2, 10.1,  8.0,  8.1,  7.9,  20.0, 20.1, 20.2,  18.0, 17.9, 18.1];

  const yMean1 = aggregate(yRaw, replicateGroups);
  const xCols  = [X.map(r => r[0]), X.map(r => r[1])];
  const fit1   = runMultiRegression(xCols, yMean1, 1, 0.95, ['X1', 'X2']);

  const factorSpec = [{ name: 'X1', low: -1, high: 1 }, { name: 'X2', low: -1, high: 1 }];
  const model = modelRecord({
    name: 'Y_mean',
    experimentId: 'exp-1',
    responseColumn: 'col_y_mean',
    transform: 'mean',
    X, y: yMean1, factorSpec,
    termSet: fit1.reg.terms,
    coef: fit1.reg.coeffs,
    rSqAdj: fit1.adjR2,
  });

  test('fresh state: source data identical to training snapshot', () => {
    assertEqual(isFresh(model, { X, y: yMean1 }), true);
  });

  test('aggregate changes when one replicate cell changes', () => {
    const yEdited = [...yRaw];
    yEdited[1] = 11.5; // user edited row 1 (group [0,1,2]); mean of group shifts
    const yMean2 = aggregate(yEdited, replicateGroups);
    // Group 0's new mean: (10.0 + 11.5 + 10.1) / 3 = 10.5333…; previously 10.1.
    assertAlmostEqual(yMean2[0], (10.0 + 11.5 + 10.1) / 3, 1e-9);
    // Other groups untouched.
    assertAlmostEqual(yMean2[3], yMean1[3], 1e-12);
  });

  test('model becomes stale when the aggregated y differs', () => {
    const yEdited = [...yRaw]; yEdited[1] = 11.5;
    const yMean2  = aggregate(yEdited, replicateGroups);
    assertEqual(isFresh(model, { X, y: yMean2 }), false);
  });

  test('snapshot stays untouched — old prediction still reproducible', () => {
    const m = model;
    // The snapshot's y is exactly the y that flowed into training.
    assertEqual(m.dataSnapshot.y.length, yMean1.length);
    for (let i = 0; i < yMean1.length; i++) {
      assertAlmostEqual(m.dataSnapshot.y[i], yMean1[i], 1e-12);
    }
    // Hash on the snapshot still matches the original — the snapshot is the SoT.
    assertEqual(computeDataHash(m.dataSnapshot.X, m.dataSnapshot.y), m.dataHash);
  });
});
