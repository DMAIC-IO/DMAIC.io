/**
 * Pipeline test — LoF gate blocks the optimiser.
 *
 * Generates quadratic data on a 3-level design with replicates, fits a
 * deliberately-too-simple linear model, and verifies the full chain:
 *
 *   1. lackOfFitTest detects the misspecification (p << 0.05).
 *   2. The saved model carries that lofPValue.
 *   3. The response-optimization module's `diagnose` (domain/diagnose.js)
 *      returns a blocking reason that names the offending model — i.e. the
 *      optimise button stays disabled.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import {
  runMultiRegression, lackOfFitTest,
} from '../../js/engines/regression-engine.js';
import { diagnose } from '../../js/modules/response-optimization/domain/diagnose.js';
import { modelRecord } from '../helpers/model-record.js';

/** Ein Datensatz als Eingabe von `diagnose` (wie `derived models` der Optimierung). */
function diagnoseModel(m) {
  return { id: m.id, name: m.name, rSqAdj: m.rSqAdj, lofPValue: m.lofPValue, factorNames: m.factorSpec.map(f => f.name) };
}

suite('Pipeline — LoF gates the optimiser', () => {
  // 3-level single-factor design: x ∈ {-1, 0, +1}, each replicated 3×.
  // True model is strongly quadratic: y = 2 + 0·x + 5·x²  (curvature only).
  // A linear fit will leave the curvature in the residuals → LoF significant.
  const xs = [
    -1, -1, -1,
     0,  0,  0,
     1,  1,  1,
  ];
  const yNoise = [-0.05, 0.04, -0.02, 0.03, -0.04, 0.01, -0.02, 0.03, 0.05];
  const y = xs.map((x, i) => 2 + 5 * x * x + yNoise[i]);
  const replicateGroups = [[0, 1, 2], [3, 4, 5], [6, 7, 8]];

  // Linear fit (degree 1). Two parameters → df_E = 9 − 2 = 7.
  const fit = runMultiRegression([xs], y, 1, 0.95, ['X']);
  const lof = lackOfFitTest(y, fit.yHat, replicateGroups, fit.dfRes);

  test('LoF test flags significant misspecification', () => {
    if (!lof) throw new Error('expected a LoF result, got null');
    if (!(lof.pValue < 0.001)) throw new Error(`expected p < 0.001, got ${lof.pValue}`);
  });

  // The saved model record with the computed LoF p-value.
  const factorSpec = [{ name: 'X', low: -1, high: 1 }];
  const model = modelRecord({
    id: 'm-bad',
    name: 'Bad Linear Fit',
    experimentId: 'exp-quadratic',
    responseColumn: 'col_y',
    X: xs.map(v => [v]), y, factorSpec,
    termSet: fit.reg.terms,
    coef: fit.reg.coeffs,
    rSqAdj: fit.adjR2,
    lofPValue: lof.pValue,
  });

  test('saved model carries the LoF p-value', () => {
    const m = model;
    if (!Number.isFinite(m.lofPValue)) {
      throw new Error(`expected finite lofPValue, got ${m.lofPValue}`);
    }
    if (!(m.lofPValue < 0.05)) {
      throw new Error(`expected p < 0.05 (gate threshold), got ${m.lofPValue}`);
    }
  });

  test('diagnose() returns a blocking reason naming the LoF model', () => {
    // diagnose() returns structured { type, name, value } objects; the module
    // formats them with i18n. The test only needs to verify that a lackOfFit
    // reason is emitted for the right model.
    const reasons = diagnose([model.id], [diagnoseModel(model)]);
    if (!Array.isArray(reasons) || reasons.length === 0) {
      throw new Error(`expected at least one blocking reason, got ${JSON.stringify(reasons)}`);
    }
    const lofReason = reasons.find(r => r.type === 'lackOfFit');
    if (!lofReason) {
      throw new Error(`expected a lackOfFit reason, got ${JSON.stringify(reasons)}`);
    }
    if (lofReason.name !== 'Bad Linear Fit') {
      throw new Error(`reason should name the model, got: ${lofReason.name}`);
    }
  });

  test('a model without lofPValue passes the LoF gate (no replicates → undecidable)', () => {
    const clean = modelRecord({
      id: 'm-clean',
      name: 'Clean Model',
      responseColumn: 'col_y2',
      X: xs.map(v => [v]), y, factorSpec,
      termSet: fit.reg.terms,
      coef: fit.reg.coeffs,
      rSqAdj: 0.95,                  // above MIN_R2_ADJ
      lofPValue: null,                // ← undecidable
    });
    const reasons = diagnose([clean.id], [diagnoseModel(model), diagnoseModel(clean)]);
    assertEqual(reasons.length, 0, `expected no blocking reasons, got ${JSON.stringify(reasons)}`);
  });
});
