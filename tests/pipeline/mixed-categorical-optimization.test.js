/**
 * Pipeline test — mixed-model optimisation (V0.4 Phase 4).
 *
 * Trains a regression model with one continuous + one 3-level categorical
 * predictor, persists it via `saveModel` *with the ModelSpec attached*, and
 * runs the response optimiser. The optimiser must:
 *
 *   1. Detect categorical predictors via `model.spec`.
 *   2. Enumerate the Cartesian product of level combinations.
 *   3. Run continuous Nelder–Mead inside each cell.
 *   4. Return the global best — with `xOpt` carrying the optimal categorical
 *      label and `isHybrid: true`.
 *
 * Synthetic ground truth: y = 1 + 2·X − 3·X² + tool-effect, max at (X=1/3, Tool=B)
 * with y_true = 1 + 2·(1/3) − 3·(1/9) + 5 = 1 + 2/3 − 1/3 + 5 = 6.3333.
 */

import { suite, test, assertAlmostEqual, assertEqual } from '../test-utils.js';
import {
  fitFromSpec, generatePolynomialTerms,
} from '../../js/engines/regression-engine.js';
import {
  saveModel, getModel, computeDataHash, buildDataSnapshot,
} from '../../js/core/models-store.js';
import { optimizeResponses, predictFromModel } from '../../js/engines/response-optimization-engine.js';

function makeStateManager() {
  const state = {};
  return {
    get(p) { return p.split('.').reduce((o, k) => o?.[k], state); },
    set(p, v) {
      const k = p.split('.'); let o = state;
      for (let i = 0; i < k.length - 1; i++) { o[k[i]] ??= {}; o = o[k[i]]; }
      o[k[k.length - 1]] = v;
    },
  };
}

suite('Pipeline — mixed continuous + 3-level categorical optimisation', () => {
  // 2 continuous levels × 3 categorical levels × 2 reps = 12 runs.
  // To recover the X² coefficient we need ≥ 3 distinct X values; use {-1, 0, 1}.
  const Xs   = [-1, -1, -1,  0,  0,  0,  1,  1,  1, -1,  0,  1];
  const Tool = ['A','B','C','A','B','C','A','B','C','B','C','A'];
  // True model:  y = 1 + 2·X − 3·X² + (A: -2, B: +5, C: -3)
  function trueY(x, tool) {
    const base = 1 + 2 * x - 3 * x * x;
    if (tool === 'A') return base - 2;
    if (tool === 'B') return base + 5;
    return base - 3;             // C
  }
  const ys = Xs.map((x, i) => trueY(x, Tool[i]));

  const predictors = [
    { id: 'X',    kind: 'continuous' },
    { id: 'Tool', kind: 'categorical', levels: ['A', 'B', 'C'], reference: 'A' },
  ];
  const spec = { predictors, terms: generatePolynomialTerms(predictors, 2) };
  const fit  = fitFromSpec(spec, { columns: { X: Xs, Tool }, y: ys }, { confLevel: 0.95 });

  test('fit recovers the 1 + 2·X − 3·X² + Tool structure (R² ≈ 1)', () => {
    if (fit.diagnostics.R2 < 0.999) {
      throw new Error(`expected near-perfect R², got ${fit.diagnostics.R2}`);
    }
  });

  // Persist with spec attached — this is what the regression module's
  // _saveAsModel will do at runtime.
  const sm = makeStateManager();
  const factorSpec = [
    { name: 'X',    low: -1, high: 1 },
    { name: 'Tool', low: -1, high: 1 },          // nominal — categorical bounds are derived from spec.levels
  ];
  const modelId = saveModel(sm, {
    name: 'Mixed model',
    experimentId: null,
    responseSpec: { sourceColumn: 'col_y', transform: 'identity', aggregateOver: null },
    termSet: ['Intercept', ...spec.terms.map(t => t.id)],
    coef: fit.ols.beta,
    rSqAdj: fit.diagnostics.adjR2,
    factorSpec,
    spec,                     // ← Phase-4 contract
    dataSnapshot: buildDataSnapshot({
      X: Xs.map(v => [v]), y: ys, factorSpec, termSet: spec.terms.map(t => t.id),
    }),
    dataHash: computeDataHash(Xs.map(v => [v]), ys),
  });

  test('predictFromModel handles label-style categorical input', () => {
    const m = getModel(sm, modelId);
    const yHat = predictFromModel(m, { X: 1, Tool: 'B' });
    // True y at (X=1, Tool=B): 1 + 2 − 3 + 5 = 5
    assertAlmostEqual(yHat, 5, 1e-6);
  });

  test('predictFromModel handles positional input with categorical label', () => {
    const m = getModel(sm, modelId);
    const yHat = predictFromModel(m, [0, 'C']);
    // True y at (X=0, Tool=C): 1 + 0 − 0 − 3 = -2
    assertAlmostEqual(yHat, -2, 1e-6);
  });

  test('hybrid optimiser lands at Tool=B and X ≈ 1/3', () => {
    const m = getModel(sm, modelId);
    const opt = optimizeResponses(
      [m],
      [{ kind: 'max', lower: -10, upper: 10, weight: 1 }],
      [[-1, 1], [-1, 1]],
      { nStarts: 6, seed: 42 },
    );
    assertEqual(opt.isHybrid, true);
    assertEqual(opt.xOpt[1], 'B', `expected Tool=B, got ${opt.xOpt[1]}`);
    // Analytical maximum of (1 + 2X - 3X² + 5) is at X = 1/3.
    assertAlmostEqual(opt.xOpt[0], 1 / 3, 0.05);
    // y at the optimum: 1 + 2/3 - 1/3 + 5 = 6 + 1/3 = 6.3333…
    assertAlmostEqual(opt.yPredictions[0], 6 + 1 / 3, 0.05);
  });

  test('xOptByName mirrors the positional xOpt with named keys', () => {
    const m = getModel(sm, modelId);
    const opt = optimizeResponses(
      [m],
      [{ kind: 'max', lower: -10, upper: 10, weight: 1 }],
      [[-1, 1], [-1, 1]],
      { nStarts: 6, seed: 42 },
    );
    assertEqual(opt.xOptByName.Tool, 'B');
    assertAlmostEqual(opt.xOptByName.X, opt.xOpt[0], 1e-12);
  });
});

suite('Pipeline — pure-continuous fallback still works', () => {
  // Sanity: existing continuous-only optimisation must keep producing isHybrid=false.
  const Xs1 = [-1, -1,  1,  1];
  const Xs2 = [-1,  1, -1,  1];
  const ys  = Xs1.map((x1, i) => 50 + 5 * x1 - 3 * Xs2[i]);

  const predictors = [
    { id: 'X1', kind: 'continuous' },
    { id: 'X2', kind: 'continuous' },
  ];
  const spec = { predictors, terms: generatePolynomialTerms(predictors, 1) };
  const fit  = fitFromSpec(spec, { columns: { X1: Xs1, X2: Xs2 }, y: ys });

  const sm = makeStateManager();
  const factorSpec = [
    { name: 'X1', low: -1, high: 1 },
    { name: 'X2', low: -1, high: 1 },
  ];
  const modelId = saveModel(sm, {
    name: 'Cont',
    termSet: ['Intercept', ...spec.terms.map(t => t.id)],
    coef: fit.ols.beta,
    rSqAdj: fit.diagnostics.adjR2,
    factorSpec,
    spec,
    dataSnapshot: buildDataSnapshot({
      X: Xs1.map((v, i) => [v, Xs2[i]]), y: ys, factorSpec, termSet: spec.terms.map(t => t.id),
    }),
    dataHash: computeDataHash(Xs1.map((v, i) => [v, Xs2[i]]), ys),
    responseSpec: { sourceColumn: 'col_y', transform: 'identity', aggregateOver: null },
  });

  test('all-continuous spec uses the non-hybrid path', () => {
    const opt = optimizeResponses(
      [getModel(sm, modelId)],
      [{ kind: 'max', lower: 40, upper: 60, weight: 1 }],
      [[-1, 1], [-1, 1]],
      { nStarts: 6, seed: 1 },
    );
    assertEqual(opt.isHybrid, false);
    // Optimal (X1=+1, X2=-1) gives y = 50 + 5 + 3 = 58.
    assertAlmostEqual(opt.xOpt[0],  1, 0.05);
    assertAlmostEqual(opt.xOpt[1], -1, 0.05);
  });
});
