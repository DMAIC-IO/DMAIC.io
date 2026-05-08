/**
 * Pipeline smoke test — RSM, continuous factors only.
 *
 * Runs the full DoE → Regression → Optimisation chain end-to-end on synthetic
 * data drawn from a known true model. Verifies that:
 *
 *   1. The DoE engine produces a 2² × 3-replicate design with the expected
 *      structure (12 runs, 4 std-order groups of 3).
 *   2. runMultiRegression on those runs recovers the true coefficients within
 *      noise tolerance.
 *   3. saveModel + computeDataHash produce a deterministic hash that round-trips.
 *   4. optimizeResponses lands within tolerance of the true optimum.
 *   5. paretoFrontier on a two-response variant returns a non-empty trade-off
 *      set when the goals conflict.
 *
 * The test does NOT exercise UI — that lives in tools/visual-test/. It is a
 * smoke check that the pipeline plumbing matches between the four slices of
 * Phase 1 (DataGrid, DoE-Worksheet, Models-Store, Response-Optimization).
 */

import { suite, test, assertAlmostEqual, assertEqual } from '../test-utils.js';
import { generateDesign } from '../../js/engines/doe-planner-engine.js';
import { runMultiRegression } from '../../js/engines/regression-engine.js';
import {
  saveModel, getModel, computeDataHash, buildDataSnapshot,
} from '../../js/core/models-store.js';
import {
  optimizeResponses, paretoFrontier,
} from '../../js/engines/response-optimization-engine.js';

function makeStateManager() {
  const state = {};
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

/** Deterministic Box–Muller noise so the test is reproducible. */
function seededNoise(seed = 17) {
  let s = seed >>> 0;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s + 1) / 0x100000001; };
  return () => Math.sqrt(-2 * Math.log(rand())) * Math.cos(2 * Math.PI * rand());
}

// True model used for synthetic data:  y = 50 + 5·X1 - 3·X2 + noise.
// Linear because a 2-level factorial puts X1² = 1 for every run (collinear with
// the intercept), so a degree-2 fit on the same data would be ill-conditioned.
// Pure-linear keeps the smoke test focussed on the Phase-1 plumbing.
// Maximum on [-1,1]² lies at X = (+1, -1) where y_true = 50 + 5 + 3 = 58.
function trueY(x1, x2) { return 50 + 5 * x1 - 3 * x2; }

suite('Pipeline — full RSM (continuous, 2 factors)', () => {
  // 1. Generate the design.
  const design = generateDesign(
    [{ name: 'X1', levels: [-1, 1] }, { name: 'X2', levels: [-1, 1] }],
    { designType: 'full', replicates: 3, randomize: false, seed: 99 }
  );

  test('design has 12 runs and 4 standard-order groups', () => {
    assertEqual(design.actualMatrix.length, 12);
    const stdSet = new Set(design.stdOrder);
    assertEqual(stdSet.size, 4);
  });

  // 2. Synthesize y values from the true model + small Gaussian noise.
  const noise = seededNoise(2026);
  const ys = design.actualMatrix.map(([x1, x2]) => trueY(x1, x2) + 0.3 * noise());

  // 3. Train linear multivariable regression — degree 1 is the right model
  // for a 2-level factorial without center points (no quadratic information).
  const xCols = [
    design.actualMatrix.map(r => r[0]),
    design.actualMatrix.map(r => r[1]),
  ];
  const result = runMultiRegression(xCols, ys, 1, 0.95, ['X1', 'X2']);

  test('regression recovers main effect coefficients within noise', () => {
    const coefByTerm = Object.fromEntries(result.reg.terms.map((t, i) => [t, result.reg.coeffs[i]]));
    assertAlmostEqual(coefByTerm['Intercept'],  50, 0.3);
    assertAlmostEqual(coefByTerm['X1'],          5, 0.3);
    assertAlmostEqual(coefByTerm['X2'],         -3, 0.3);
  });

  test('R²adj is high (well-specified model + low noise)', () => {
    assertEqual(result.adjR2 > 0.9, true);
  });

  // 4. Persist the regression as a model record.
  const sm = makeStateManager();
  const X = design.actualMatrix.map(r => [...r]);
  const factorSpec = [
    { name: 'X1', low: -1, high: 1 },
    { name: 'X2', low: -1, high: 1 },
  ];
  const dataSnapshot = buildDataSnapshot({
    X, y: ys, factorSpec,
    termSet: result.reg.terms,
    experimentId: 'exp-smoke',
    responseColumn: 'col_y',
  });
  const modelId = saveModel(sm, {
    name: 'Yield model',
    experimentId: 'exp-smoke',
    responseSpec: { sourceColumn: 'col_y', transform: 'identity', aggregateOver: null },
    termSet: result.reg.terms,
    coef: result.reg.coeffs,
    sigma2: result.Se ** 2,
    df: result.df,
    rSqAdj: result.adjR2,
    factorSpec,
    dataSnapshot,
    dataHash: computeDataHash(X, ys),
  });

  test('model round-trips through state.models with identical hash', () => {
    const loaded = getModel(sm, modelId);
    assertEqual(loaded.dataHash, computeDataHash(X, ys));
    assertEqual(loaded.termSet.length, result.reg.terms.length);
  });

  // 5. Optimise the saved model toward maximisation. Bounds are the design box.
  test('optimiser lands near the true maximum (+1, -1)', () => {
    const opt = optimizeResponses(
      [getModel(sm, modelId)],
      [{ kind: 'max', lower: 40, upper: 60, weight: 1 }],
      [[-1, 1], [-1, 1]],
      { nStarts: 8, seed: 17, maxIter: 400 }
    );
    assertAlmostEqual(opt.xOpt[0],  1, 0.05);
    assertAlmostEqual(opt.xOpt[1], -1, 0.05);
    // y at the optimum should be near 58 — well into the desirability band's high end.
    assertEqual(opt.D > 0.85, true);
  });
});

suite('Pipeline — competing-response Pareto trade-off', () => {
  // Two responses on the same 2² × 3 design, pulling in opposite directions.
  const design = generateDesign(
    [{ name: 'X1', levels: [-1, 1] }, { name: 'X2', levels: [-1, 1] }],
    { designType: 'full', replicates: 3, randomize: false, seed: 1 }
  );
  const xCols = [
    design.actualMatrix.map(r => r[0]),
    design.actualMatrix.map(r => r[1]),
  ];
  // y_a strictly increases in X1 (best at X1=+1).
  // y_b strictly decreases in X1 (best at X1=-1).
  const yA = design.actualMatrix.map(([x1]) => 10 + 4 * x1);
  const yB = design.actualMatrix.map(([x1]) => 10 - 4 * x1);
  const fitA = runMultiRegression(xCols, yA, 1, 0.95, ['X1', 'X2']);
  const fitB = runMultiRegression(xCols, yB, 1, 0.95, ['X1', 'X2']);

  const sm = makeStateManager();
  const factorSpec = [
    { name: 'X1', low: -1, high: 1 },
    { name: 'X2', low: -1, high: 1 },
  ];
  const idA = saveModel(sm, {
    name: 'A',
    termSet: fitA.reg.terms, coef: fitA.reg.coeffs,
    rSqAdj: fitA.adjR2, factorSpec,
    dataHash: computeDataHash(xCols, yA),
    dataSnapshot: buildDataSnapshot({ X: design.actualMatrix, y: yA, factorSpec, termSet: fitA.reg.terms }),
    responseSpec: { sourceColumn: 'a', transform: 'identity', aggregateOver: null },
  });
  const idB = saveModel(sm, {
    name: 'B',
    termSet: fitB.reg.terms, coef: fitB.reg.coeffs,
    rSqAdj: fitB.adjR2, factorSpec,
    dataHash: computeDataHash(xCols, yB),
    dataSnapshot: buildDataSnapshot({ X: design.actualMatrix, y: yB, factorSpec, termSet: fitB.reg.terms }),
    responseSpec: { sourceColumn: 'b', transform: 'identity', aggregateOver: null },
  });

  test('joint maximisation lands at compromise X1≈0', () => {
    const opt = optimizeResponses(
      [getModel(sm, idA), getModel(sm, idB)],
      [
        { kind: 'max', lower: 6, upper: 14, weight: 1 },
        { kind: 'max', lower: 6, upper: 14, weight: 1 },
      ],
      [[-1, 1], [-1, 1]],
      { nStarts: 6, seed: 11 }
    );
    assertAlmostEqual(opt.xOpt[0], 0, 0.05);
  });

  test('paretoFrontier on the design corner predictions yields multiple non-dominated points', () => {
    const corners = [[-1, 0], [-0.5, 0], [0, 0], [0.5, 0], [1, 0]];
    const points = corners.map(x => {
      // For maximisation, flip sign so the Pareto filter (which expects min) interprets correctly.
      const a = -((10 + 4 * x[0]));
      const b = -((10 - 4 * x[0]));
      return [a, b];
    });
    const idx = paretoFrontier(points);
    // Every point on the line is non-dominated — moving along the trade-off improves one and hurts the other.
    assertEqual(idx.length >= 3, true);
  });
});
