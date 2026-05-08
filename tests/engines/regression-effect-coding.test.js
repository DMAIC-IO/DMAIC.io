/**
 * D.Mike — Effect-Coding & Block-ANOVA Engine Tests
 *
 * Validates the building blocks of V0.4 Phase 3:
 *
 *   - `buildEffectCodedColumns` produces the right sum-to-zero indicator matrix
 *   - `blockTypeIIISS` recovers a one-way ANOVA's classical F and p when the
 *     block consists of all indicators of a categorical factor.
 *
 * The textbook one-way ANOVA case has hand-computable values:
 *
 *   3 groups (A, B, C) with 2 observations each:
 *     A: 10, 11   (mean 10.5)
 *     B: 13, 14   (mean 13.5)
 *     C: 16, 17   (mean 16.5)
 *   Grand mean = 13.5,  SS_treatment = 36,  SS_within = 1.5
 *   df_t = 2, df_e = 3   →   F = 18 / 0.5 = 36   →   p ≈ 0.0083
 */

import { suite, test, assertAlmostEqual, assertEqual } from '../test-utils.js';
import {
  olsRegression, buildEffectCodedColumns, blockTypeIIISS,
} from '../../js/engines/regression-engine.js';

// ─── Effect-coded indicator builder ───────────────────────────────

suite('Effect coding — sum-to-zero contrasts', () => {
  test('reference level gets all −1', () => {
    const X = buildEffectCodedColumns(['A', 'B', 'C'], ['A', 'B', 'C'], 'A');
    assertEqual(X[0][0], -1);
    assertEqual(X[0][1], -1);
  });

  test('non-reference levels get a single +1', () => {
    const X = buildEffectCodedColumns(['A', 'B', 'C'], ['A', 'B', 'C'], 'A');
    // B → [+1, 0]
    assertEqual(X[1][0],  1);
    assertEqual(X[1][1],  0);
    // C → [0, +1]
    assertEqual(X[2][0],  0);
    assertEqual(X[2][1],  1);
  });

  test('column count is k − 1 for k levels', () => {
    const X = buildEffectCodedColumns(['x', 'y', 'z', 'w'], ['x', 'y', 'z', 'w'], 'x');
    assertEqual(X[0].length, 3);
  });

  test('column sums are zero (sum-to-zero contrasts) for a balanced design', () => {
    const X = buildEffectCodedColumns(['A', 'B', 'C', 'A', 'B', 'C'], ['A', 'B', 'C'], 'A');
    const colSum = (j) => X.reduce((s, row) => s + row[j], 0);
    assertEqual(colSum(0), 0);
    assertEqual(colSum(1), 0);
  });

  test('reference can be any of the levels', () => {
    const X = buildEffectCodedColumns(['A', 'B', 'C'], ['A', 'B', 'C'], 'B');
    // B becomes the reference, so its row is [-1, -1]; A and C get e_1, e_2.
    assertEqual(X[1][0], -1); assertEqual(X[1][1], -1);
    assertEqual(X[0][0],  1); assertEqual(X[0][1],  0);
    assertEqual(X[2][0],  0); assertEqual(X[2][1],  1);
  });

  test('rejects unknown reference level', () => {
    let threw = false;
    try { buildEffectCodedColumns(['A'], ['A', 'B'], 'Q'); } catch { threw = true; }
    assertEqual(threw, true);
  });
});

// ─── Block Type-III SS — one-way ANOVA recovered ──────────────────

suite('Block Type-III SS — three-level one-way ANOVA', () => {
  const labels = ['A', 'A', 'B', 'B', 'C', 'C'];
  const y      = [10, 11, 13, 14, 16, 17];
  const indicators = buildEffectCodedColumns(labels, ['A', 'B', 'C'], 'A');
  // Build the model matrix with an intercept column prepended.
  const X = indicators.map(row => [1, ...row]);
  const ols = olsRegression(X, y);

  test('intercept ≈ grand mean (sum-to-zero coding makes this exact)', () => {
    assertAlmostEqual(ols.beta[0], 13.5, 1e-9);
  });

  test('block SS recovers SS_treatment = 36', () => {
    const block = blockTypeIIISS(ols, [1, 2]);
    assertAlmostEqual(block.ss, 36, 1e-9, `SS_block = ${block.ss}`);
    assertEqual(block.df, 2);
  });

  test('block F = 36 and p ≈ 0.0083 (matches one-way ANOVA)', () => {
    const block = blockTypeIIISS(ols, [1, 2]);
    assertAlmostEqual(block.fStat, 36, 1e-6);
    if (!(block.pValue > 0.005 && block.pValue < 0.012)) {
      throw new Error(`expected p ≈ 0.0083, got ${block.pValue}`);
    }
  });

  test('residuals match SS_within = 1.5', () => {
    assertAlmostEqual(ols.SSE, 1.5, 1e-9);
  });
});

// ─── Block Type-III SS — degenerate cases ──────────────────────────

suite('Block Type-III SS — degenerate cases', () => {
  test('empty block returns zero everything and p = 1', () => {
    const ols = olsRegression([[1, 1], [1, 2], [1, 3]], [4, 5, 6]);
    const block = blockTypeIIISS(ols, []);
    assertEqual(block.ss, 0);
    assertEqual(block.df, 0);
    assertEqual(block.pValue, 1);
  });

  test('single-column block ≡ classical t² · MSE', () => {
    // Linear fit with deliberate noise so MSE > 0 (avoids 0·∞ degeneracy
    // in the t²·MSE formula at perfect fits).
    const X = [[1, 1], [1, 2], [1, 3], [1, 4], [1, 5]];
    const y = [3.1, 5.2, 6.8, 9.1, 10.9];
    const ols = olsRegression(X, y);
    const block = blockTypeIIISS(ols, [1]);
    const expectedSS = ols.tValues[1] ** 2 * ols.MSE;
    assertAlmostEqual(block.ss, expectedSS, 1e-9, 'SS via block matches t²·MSE');
  });
});
