/**
 * Pipeline test — binary-categorical factor end-to-end.
 *
 * V0.4 Phase 2 unblocks A/B comparisons inside the RSM workflow. A binary
 * categorical factor (two named levels, no physical unit) lives alongside
 * continuous factors; internally it is still coded ±1, so the regression and
 * optimisation engines need no special handling. The new contract is:
 *
 *   1. The DoE engine produces a coded matrix that treats the categorical
 *      factor like any 2-level factor (±1).
 *   2. Per-factor metadata (`kind: 'categorical'`, `levels`, `reference`)
 *      survives into `state.experiments[id].factors[i]`.
 *   3. A regression on the coded design recovers the categorical effect
 *      (the contrast between the two labels) within noise.
 *   4. The optimiser, given box bounds [-1, 1] for the coded categorical
 *      column, lands at the level that improves the response.
 *
 * The worksheet column-label translation (text vs numeric) is exercised by
 * the doe-planner-worksheet unit tests; here we focus on the pipeline math.
 */

import { suite, test, assertAlmostEqual, assertEqual } from '../test-utils.js';
import { generateDesign } from '../../js/engines/doe-planner-engine.js';
import { runMultiRegression } from '../../js/engines/regression-engine.js';
import {
  saveModel, getModel, computeDataHash, buildDataSnapshot,
} from '../../js/core/models-store.js';
import { optimizeResponses } from '../../js/engines/response-optimization-engine.js';

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

suite('Pipeline — binary categorical factor in RSM', () => {
  // 2² full factorial × 3 replicates: X1 continuous in [-1, +1] (e.g. coded
  // temperature), X2 categorical with two labels {Steel, HSS}.
  const factors = [
    { name: 'Temperature', kind: 'continuous',  levels: ['-1', '1'] },
    { name: 'Tool',        kind: 'categorical', levels: ['Steel', 'HSS'], reference: 'Steel' },
  ];
  const design = generateDesign(factors, {
    designType: 'full', replicates: 3, randomize: false, seed: 42,
  });

  test('design has 12 runs and a 2-level coded structure', () => {
    assertEqual(design.codedMatrix.length, 12);
    // Every coded value must be ±1 (no center/star points in a plain 2² design).
    for (const row of design.codedMatrix) {
      for (const c of row) {
        if (c !== -1 && c !== 1) {
          throw new Error(`unexpected coded value ${c}`);
        }
      }
    }
  });

  // True model:  y = 50 + 5·T + 3·Tool + noise   (Tool = -1 for Steel, +1 for HSS)
  // → HSS is better by 6 units across all temperatures; max at (T=+1, Tool=HSS) = 58.
  function trueY(T, Tool) { return 50 + 5 * T + 3 * Tool; }

  function seededNoise(seed) {
    let s = seed >>> 0;
    const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s + 1) / 0x100000001; };
    return () => Math.sqrt(-2 * Math.log(rand())) * Math.cos(2 * Math.PI * rand());
  }
  const noise = seededNoise(7);
  const ys = design.codedMatrix.map(([T, Tool]) => trueY(T, Tool) + 0.2 * noise());

  const xCols = [
    design.codedMatrix.map(r => r[0]),
    design.codedMatrix.map(r => r[1]),
  ];
  const fit = runMultiRegression(xCols, ys, 1, 0.95, ['Temperature', 'Tool']);

  test('regression recovers the categorical contrast within noise', () => {
    const coefByTerm = Object.fromEntries(fit.reg.terms.map((t, i) => [t, fit.reg.coeffs[i]]));
    assertAlmostEqual(coefByTerm['Intercept'],   50, 0.3);
    assertAlmostEqual(coefByTerm['Temperature'],  5, 0.3);
    assertAlmostEqual(coefByTerm['Tool'],         3, 0.3);
  });

  // Persist as a model and run the optimiser. Box bounds: continuous on its
  // observed range, categorical on [-1, +1] (the coded representation).
  const sm = makeStateManager();
  const factorSpec = [
    { name: 'Temperature', low: -1, high: 1 },
    { name: 'Tool',        low: -1, high: 1 },
  ];
  const X = design.codedMatrix.map(r => [...r]);
  const modelId = saveModel(sm, {
    name: 'Yield (T, Tool)',
    experimentId: 'exp-binary',
    responseSpec: { sourceColumn: 'col_y', transform: 'identity', aggregateOver: null },
    termSet: fit.reg.terms,
    coef: fit.reg.coeffs,
    rSqAdj: fit.adjR2,
    factorSpec,
    dataSnapshot: buildDataSnapshot({
      X, y: ys, factorSpec, termSet: fit.reg.terms,
      experimentId: 'exp-binary', responseColumn: 'col_y',
    }),
    dataHash: computeDataHash(X, ys),
  });

  test('optimiser picks the correct categorical level (HSS, +1)', () => {
    const opt = optimizeResponses(
      [getModel(sm, modelId)],
      [{ kind: 'max', lower: 40, upper: 60, weight: 1 }],
      [[-1, 1], [-1, 1]],
      { nStarts: 8, seed: 17, maxIter: 400 },
    );
    assertAlmostEqual(opt.xOpt[0],  1, 0.05, 'continuous → high end');
    // The optimiser is unaware that x[1] is discrete, but the linear model
    // pushes it to the boundary. Either +1 (HSS) or extremely close to it.
    assertEqual(opt.xOpt[1] > 0.95, true, `expected categorical level near +1 (HSS), got ${opt.xOpt[1]}`);
  });
});
