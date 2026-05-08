/**
 * D.Mike — buildResponseSurface tests (V0.4 Phase 4 — Konturplot).
 *
 * Verifies that the response-surface grid evaluates a saved spec model at
 * each (x, y) gridpoint with the categorical predictors held at their
 * `fixings`. Uses analytical models so each grid cell is checkable.
 */

import { suite, test, assertAlmostEqual, assertEqual } from '../test-utils.js';
import { buildResponseSurface } from '../../js/engines/response-optimization-engine.js';

suite('buildResponseSurface — pure-continuous quadratic surface', () => {
  // Model: y = 10 + 2·X1 − X1² + 3·X2 + 0.5·X1·X2
  // Expressed via spec + linear coefficients on the model matrix
  // [Intercept, X1, X1², X2, X1·X2]:
  //   coef = [10, 2, -1, 3, 0.5]
  const spec = {
    predictors: [
      { id: 'X1', kind: 'continuous' },
      { id: 'X2', kind: 'continuous' },
    ],
    terms: [
      { id: 'X1',    factors: [{ id: 'X1', degree: 1 }] },
      { id: 'X1²',   factors: [{ id: 'X1', degree: 2 }] },
      { id: 'X2',    factors: [{ id: 'X2', degree: 1 }] },
      { id: 'X1·X2', factors: [{ id: 'X1', degree: 1 }, { id: 'X2', degree: 1 }] },
    ],
  };
  const model = {
    spec,
    coef: [10, 2, -1, 3, 0.5],
    factorSpec: [
      { name: 'X1', low: -1, high: 1 },
      { name: 'X2', low: -1, high: 1 },
    ],
  };
  const surface = buildResponseSurface(model, { xId: 'X1', yId: 'X2', gridSize: 5 });

  test('grid is N × N', () => {
    assertEqual(surface.grid.length, 5);
    assertEqual(surface.grid[0].length, 5);
  });

  test('axis ticks span the bounds and are evenly spaced', () => {
    assertAlmostEqual(surface.xTicks[0], -1, 1e-12);
    assertAlmostEqual(surface.xTicks[4],  1, 1e-12);
    assertAlmostEqual(surface.yTicks[0], -1, 1e-12);
    assertAlmostEqual(surface.yTicks[4],  1, 1e-12);
  });

  test('grid values match the analytical model', () => {
    const truth = (x1, x2) => 10 + 2 * x1 - x1 * x1 + 3 * x2 + 0.5 * x1 * x2;
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        const x1 = surface.xTicks[j];
        const x2 = surface.yTicks[i];
        assertAlmostEqual(surface.grid[i][j], truth(x1, x2), 1e-9, `(${j},${i})`);
      }
    }
  });
});

suite('buildResponseSurface — mixed model honours categorical fixings', () => {
  // y = X + 5·effect_B − 1·effect_C  (Tool: A reference, deviations B=5, C=-1)
  // Expressed via spec with effect-coded categorical Tool. Coefficients:
  //   [Intercept, X, Tool=B, Tool=C]
  //   = [0, 1, 5, -1]
  const spec = {
    predictors: [
      { id: 'X',    kind: 'continuous' },
      { id: 'Tool', kind: 'categorical', levels: ['A', 'B', 'C'], reference: 'A' },
    ],
    terms: [
      { id: 'X',    factors: [{ id: 'X' }] },
      { id: 'Tool', factors: [{ id: 'Tool' }] },
    ],
  };
  const model = {
    spec,
    coef: [0, 1, 5, -1],
    factorSpec: [
      { name: 'X',    low: -1, high: 1 },
      { name: 'Tool', low: -1, high: 1 },
    ],
  };

  test('fixing Tool=B shifts the entire surface up by 5', () => {
    // Build surfaces with X swept on the X axis. Y axis must also be
    // continuous, so we need ≥ 2 continuous predictors — but here we only
    // have one. The function must therefore reject this configuration.
    let threw = false;
    try { buildResponseSurface(model, { xId: 'X', yId: 'Tool' }); } catch { threw = true; }
    assertEqual(threw, true, 'categorical y axis must be rejected');
  });
});

suite('buildResponseSurface — mixed model with two continuous + one categorical', () => {
  // y = X1 + X2 + 5·effect_B
  // Coefficients on [Intercept, X1, X2, Tool=B] = [0, 1, 1, 5]
  const spec = {
    predictors: [
      { id: 'X1',   kind: 'continuous' },
      { id: 'X2',   kind: 'continuous' },
      { id: 'Tool', kind: 'categorical', levels: ['A', 'B'], reference: 'A' },
    ],
    terms: [
      { id: 'X1',   factors: [{ id: 'X1' }] },
      { id: 'X2',   factors: [{ id: 'X2' }] },
      { id: 'Tool', factors: [{ id: 'Tool' }] },
    ],
  };
  const model = {
    spec,
    coef: [0, 1, 1, 5],
    factorSpec: [
      { name: 'X1',   low: -1, high: 1 },
      { name: 'X2',   low: -1, high: 1 },
      { name: 'Tool', low: -1, high: 1 },
    ],
  };

  test('Tool=A surface is X1 + X2 (Tool indicator = -1, β = 5 → -5)', () => {
    const s = buildResponseSurface(model, { xId: 'X1', yId: 'X2', fixings: { Tool: 'A' }, gridSize: 5 });
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      const expected = s.xTicks[j] + s.yTicks[i] - 5;
      assertAlmostEqual(s.grid[i][j], expected, 1e-9);
    }
  });

  test('Tool=B surface is X1 + X2 + 5 (Tool indicator = +1)', () => {
    const s = buildResponseSurface(model, { xId: 'X1', yId: 'X2', fixings: { Tool: 'B' }, gridSize: 5 });
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      const expected = s.xTicks[j] + s.yTicks[i] + 5;
      assertAlmostEqual(s.grid[i][j], expected, 1e-9);
    }
  });

  test('default fixing falls back to the reference level (A)', () => {
    const s = buildResponseSurface(model, { xId: 'X1', yId: 'X2', gridSize: 3 });
    // Reference (A) → indicator = -1 → β = 5 contributes -5.
    assertAlmostEqual(s.grid[1][1], 0 + 0 - 5, 1e-9);
  });
});
