/**
 * D.Mike — Mixed-kind D/A/G-optimal design tests (V0.4 Phase 4)
 *
 * The optimal-design exchange algorithms used to use a single 5-level grid
 * for every factor when fitting quadratic models. For categorical factors
 * that produced fractional level codings (-0.5, 0.5) which don't correspond
 * to any real category. The fix threads `categoricalFlags` through
 * generateDesign → optimalDesign → coordinateExchange so each factor uses
 * its proper candidate set.
 *
 * What the tests check:
 *   1. D-optimal (quadratic) with mixed factors never puts fractional values
 *      in the categorical column.
 *   2. The continuous column still gets the dense 5-level grid (so we don't
 *      regress the non-mixed case's exploration ability).
 *   3. Linear-model paths via pointExchange already worked correctly (they
 *      use fullFactorialGeneral); regression test confirms unchanged output.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import { generateDesign, dOptimalDesign } from '../../js/engines/doe-planner-engine.js';

// ─── Mixed quadratic D-optimal: categorical column stays discrete ──

suite('Mixed D-optimal (quadratic) — categorical column has only discrete codings', () => {
  const factors = [
    { id: 1, name: 'X',    kind: 'continuous',  levels: ['-1', '1'] },
    { id: 2, name: 'Tool', kind: 'categorical', levels: ['A', 'B', 'C'] },
  ];
  const design = generateDesign(factors, {
    designType: 'dopt', optimalQuadratic: true, optimalRuns: 12,
    randomize: false, seed: 17,
  });

  test('every categorical-column value is one of {-1, 0, +1}', () => {
    const allowed = new Set([-1, 0, 1]);
    for (const row of design.codedMatrix) {
      if (!allowed.has(row[1])) {
        throw new Error(`fractional categorical level leaked: ${row[1]}`);
      }
    }
  });

  test('continuous column explores the 5-level grid', () => {
    const allowed = new Set([-1, -0.5, 0, 0.5, 1]);
    for (const row of design.codedMatrix) {
      if (!allowed.has(row[0])) {
        throw new Error(`unexpected continuous level: ${row[0]}`);
      }
    }
    // Quality check — coordinate exchange should normally pick at least 3
    // distinct continuous levels for a quadratic-friendly design. (If this
    // ever flakes we can drop it; the per-factor levels constraint is the
    // real test.)
    const seen = new Set(design.codedMatrix.map(r => r[0]));
    if (seen.size < 3) {
      throw new Error(`expected ≥ 3 distinct continuous levels, saw ${seen.size}`);
    }
  });

  test('all three categorical levels are used', () => {
    const seen = new Set(design.codedMatrix.map(r => r[1]));
    assertEqual(seen.size, 3);
  });
});

// ─── Mixed linear D-optimal — already worked, regression check ────

suite('Mixed D-optimal (linear) — pointExchange path still correct', () => {
  const factors = [
    { id: 1, name: 'X',    kind: 'continuous',  levels: ['-1', '1'] },
    { id: 2, name: 'Tool', kind: 'categorical', levels: ['A', 'B', 'C'] },
  ];
  const design = generateDesign(factors, {
    designType: 'dopt', optimalQuadratic: false, optimalRuns: 6,
    randomize: false, seed: 17,
  });

  test('linear D-optimal with one categorical factor produces only valid codings', () => {
    const validCont = new Set([-1, 1]);
    const validCat  = new Set([-1, 0, 1]);
    for (const row of design.codedMatrix) {
      if (!validCont.has(row[0])) throw new Error(`continuous out of grid: ${row[0]}`);
      if (!validCat.has(row[1]))  throw new Error(`categorical out of set: ${row[1]}`);
    }
  });
});

// ─── Pure-continuous quadratic — unchanged behaviour ──────────────

suite('Pure-continuous D-optimal (quadratic) — still uses 5-level grid', () => {
  const factors = [
    { id: 1, name: 'X1', kind: 'continuous', levels: ['-1', '1'] },
    { id: 2, name: 'X2', kind: 'continuous', levels: ['-1', '1'] },
  ];
  const design = generateDesign(factors, {
    designType: 'dopt', optimalQuadratic: true, optimalRuns: 12,
    randomize: false, seed: 17,
  });

  test('every value is on the 5-level grid', () => {
    const allowed = new Set([-1, -0.5, 0, 0.5, 1]);
    for (const row of design.codedMatrix) {
      for (const v of row) {
        if (!allowed.has(v)) throw new Error(`unexpected level ${v}`);
      }
    }
  });

  test('engine direct-call API still respects the legacy contract', () => {
    // Calling dOptimalDesign without categoricalFlags must default to all
    // factors using the 5-level grid (matches pre-V0.4 behaviour).
    const coded = dOptimalDesign(2, 12, { quadratic: true, levelCounts: [2, 2], seed: 17 });
    const allowed = new Set([-1, -0.5, 0, 0.5, 1]);
    for (const row of coded) {
      for (const v of row) {
        if (!allowed.has(v)) throw new Error(`unexpected level ${v}`);
      }
    }
  });
});
