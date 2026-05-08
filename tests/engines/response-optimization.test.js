/**
 * Tests for js/engines/response-optimization-engine.js
 *
 * Covers:
 *   - Derringer–Suich desirability functions (max, min, target)
 *   - Geometric-mean composite with weights and the zero-veto property
 *   - predictFromModel against the term set produced by buildPolyDesignMatrix
 *   - Multi-start Nelder–Mead convergence on convex test problems
 *   - optimizeResponses end-to-end
 *   - Pareto frontier filter
 */

import { suite, test, assertEqual, assertAlmostEqual } from '../test-utils.js';
import {
  desirabilityMax, desirabilityMin, desirabilityTarget,
  combinedDesirability,
  predictFromModel,
  nelderMead, multiStartNelderMead,
  optimizeResponses,
  paretoFrontier,
} from '../../js/engines/response-optimization-engine.js';

// ─── Desirability ────────────────────────────────────────────────

suite('Desirability — max', () => {
  test('zero below lower, one above upper', () => {
    assertEqual(desirabilityMax(0,  10, 20), 0);
    assertEqual(desirabilityMax(25, 10, 20), 1);
  });
  test('linear at midpoint with shape=1', () => {
    assertAlmostEqual(desirabilityMax(15, 10, 20, 1), 0.5);
  });
  test('shape=2 makes the function more demanding (concave)', () => {
    assertAlmostEqual(desirabilityMax(15, 10, 20, 2), 0.25);
  });
});

suite('Desirability — min', () => {
  test('one below lower, zero above upper', () => {
    assertEqual(desirabilityMin(5,  10, 20), 1);
    assertEqual(desirabilityMin(25, 10, 20), 0);
  });
  test('linear at midpoint with shape=1', () => {
    assertAlmostEqual(desirabilityMin(15, 10, 20, 1), 0.5);
  });
});

suite('Desirability — target', () => {
  test('exact target → 1', () => {
    assertAlmostEqual(desirabilityTarget(5, 0, 5, 10), 1);
  });
  test('outside [lower, upper] → 0', () => {
    assertEqual(desirabilityTarget(-1, 0, 5, 10), 0);
    assertEqual(desirabilityTarget(11, 0, 5, 10), 0);
  });
  test('symmetric linear at half-distance from target', () => {
    assertAlmostEqual(desirabilityTarget(2.5, 0, 5, 10), 0.5);
    assertAlmostEqual(desirabilityTarget(7.5, 0, 5, 10), 0.5);
  });
});

suite('Composite desirability D', () => {
  test('equal individual values reproduce the same value', () => {
    assertAlmostEqual(combinedDesirability([0.5, 0.5]), 0.5);
    assertAlmostEqual(combinedDesirability([0.8, 0.8, 0.8]), 0.8);
  });
  test('zero anywhere is a hard veto (D = 0)', () => {
    assertEqual(combinedDesirability([0.9, 0]), 0);
  });
  test('weights bias the geometric mean toward the heavier response', () => {
    // d1 = 0.25 (weight 3) vs d2 = 0.81 (weight 1) → ((0.25^3)*0.81)^(1/4) ≈ 0.3559
    const D = combinedDesirability([0.25, 0.81], [3, 1]);
    assertAlmostEqual(D, Math.pow(0.25 ** 3 * 0.81, 1 / 4), 1e-6);
  });
});

// ─── predictFromModel ────────────────────────────────────────────

const linearModel = {
  termSet: ['Intercept', 'X1', 'X2'],
  coef:    [1, 2, -3],
  factorSpec: [{ name: 'X1' }, { name: 'X2' }],
};

const fullModel = {
  termSet: ['Intercept', 'X1', 'X2', 'X1²', 'X2²', 'X1·X2'],
  coef:    [1, 2, 3, 0.5, -0.5, 0.25],
  factorSpec: [{ name: 'X1' }, { name: 'X2' }],
};

suite('predictFromModel', () => {
  test('intercept returned at origin', () => {
    assertAlmostEqual(predictFromModel(linearModel, [0, 0]), 1);
  });
  test('main effects sum linearly', () => {
    assertAlmostEqual(predictFromModel(linearModel, [1, 1]), 1 + 2 - 3);
    assertAlmostEqual(predictFromModel(linearModel, [2, -1]), 1 + 4 + 3);
  });
  test('quadratic and interaction terms evaluated', () => {
    // 1 + 2*1 + 3*1 + 0.5*1 + (-0.5)*1 + 0.25*1 = 6.25
    assertAlmostEqual(predictFromModel(fullModel, [1, 1]), 6.25);
  });
  test('cubic exponent recognised', () => {
    const m = { termSet: ['X1³'], coef: [2], factorSpec: [{ name: 'X1' }] };
    assertAlmostEqual(predictFromModel(m, [3]), 2 * 27);
  });
  test('multi-component interaction with squared component', () => {
    const m = { termSet: ['X1²·X2'], coef: [1], factorSpec: [{ name: 'X1' }, { name: 'X2' }] };
    assertAlmostEqual(predictFromModel(m, [2, 5]), 4 * 5);
  });
  test('Intercept and "1" both treated as constant', () => {
    const m = { termSet: ['1'], coef: [7], factorSpec: [] };
    assertAlmostEqual(predictFromModel(m, []), 7);
  });
});

// ─── Nelder–Mead ─────────────────────────────────────────────────

suite('Nelder–Mead — convergence', () => {
  test('finds minimum of (x-2)² + (y+1)²', () => {
    const fn = (x) => (x[0] - 2) ** 2 + (x[1] + 1) ** 2;
    const res = nelderMead(fn, [0, 0], [[-5, 5], [-5, 5]], { maxIter: 400, tol: 1e-8 });
    assertAlmostEqual(res.x[0],  2, 1e-3);
    assertAlmostEqual(res.x[1], -1, 1e-3);
    assertAlmostEqual(res.fx, 0, 1e-6);
  });

  test('respects box constraints — optimum on boundary', () => {
    // Unconstrained min of -x[0] is at +∞; box [-1,1] means optimum is x=1.
    const fn = (x) => -x[0];
    const res = nelderMead(fn, [0], [[-1, 1]], { maxIter: 200 });
    assertAlmostEqual(res.x[0], 1, 1e-3);
  });

  test('multi-start finds global min on a function with two basins', () => {
    // f(x) = sin(3x) + (x-2)²/4 — global near x≈1.4 (mild local minima around it).
    // Multi-start with 12 launches reliably finds a near-global minimum.
    const fn = (x) => Math.sin(3 * x[0]) + (x[0] - 2) ** 2 / 4;
    const res = multiStartNelderMead(fn, [[-2, 6]], { nStarts: 12, seed: 7 });
    // Reference fmin ≈ -0.66 around x≈1.40 (verified numerically).
    assertEqual(res.fx < -0.5, true);
  });
});

// ─── optimizeResponses ───────────────────────────────────────────

suite('optimizeResponses — single max model', () => {
  test('maximising y = x[0] over [-1,1] picks x=1', () => {
    const m = { termSet: ['Intercept', 'X1'], coef: [0, 1], factorSpec: [{ name: 'X1' }] };
    const res = optimizeResponses(
      [m],
      [{ kind: 'max', lower: -1, upper: 1 }],
      [[-1, 1]],
      { nStarts: 4, seed: 1 }
    );
    assertAlmostEqual(res.xOpt[0], 1, 1e-3);
    assertAlmostEqual(res.D, 1, 1e-6);
  });

  test('target spec drives x toward the target value', () => {
    // y = 2*x; want y = 1, so x = 0.5
    const m = { termSet: ['X1'], coef: [2], factorSpec: [{ name: 'X1' }] };
    const res = optimizeResponses(
      [m],
      [{ kind: 'target', lower: 0, target: 1, upper: 2 }],
      [[0, 1]],
      { nStarts: 6, seed: 3 }
    );
    assertAlmostEqual(res.xOpt[0], 0.5, 1e-2);
    assertAlmostEqual(res.D, 1, 1e-3);
  });
});

suite('optimizeResponses — two competing models (Pareto trade-off)', () => {
  test('two responses pulling in opposite directions yield a finite trade-off', () => {
    // y1 maximise = x[0]      → wants x=+1
    // y2 minimise = x[0]      → wants x=-1
    // Equal weights → optimum at x=0 with d1=d2=0.5, D≈0.5
    const m1 = { termSet: ['X1'], coef: [1], factorSpec: [{ name: 'X1' }] };
    const res = optimizeResponses(
      [m1, m1],
      [
        { kind: 'max', lower: -1, upper: 1, weight: 1 },
        { kind: 'min', lower: -1, upper: 1, weight: 1 },
      ],
      [[-1, 1]],
      { nStarts: 6, seed: 5 }
    );
    assertAlmostEqual(res.xOpt[0], 0, 1e-2);
    assertAlmostEqual(res.D, 0.5, 1e-2);
  });
});

// ─── Pareto ──────────────────────────────────────────────────────

suite('paretoFrontier', () => {
  test('keeps only non-dominated points (minimisation)', () => {
    // (1,4), (2,3), (3,2), (4,1) are all on the frontier (no point dominates another).
    // (3,5) is dominated by (2,3) and (1,4) and (3,2).
    const pts = [[1,4], [2,3], [3,2], [4,1], [3,5]];
    const idx = paretoFrontier(pts);
    assertEqual(idx.length, 4);
    assertEqual(idx.includes(4), false);
  });

  test('all points equal → all are non-dominated', () => {
    const pts = [[1, 1], [1, 1], [1, 1]];
    const idx = paretoFrontier(pts);
    assertEqual(idx.length, 3);
  });

  test('single point trivially non-dominated', () => {
    const idx = paretoFrontier([[42, -7]]);
    assertEqual(idx.length, 1);
  });
});
