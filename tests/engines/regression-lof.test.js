/**
 * D.Mike — Lack-of-Fit Engine Tests
 *
 * Validates the SS_PE / SS_LoF decomposition and the F-test against a
 * textbook-style hand-computable example, plus edge cases (no replicates,
 * saturated fit, perfect agreement).
 */

import { suite, test, assertAlmostEqual, assertEqual } from '../test-utils.js';
import { lackOfFitTest } from '../../js/engines/regression-engine.js';

// ─── Hand-computable case ──────────────────────────────────────────
//
// 3 design points at x = 1, 2, 3, each replicated twice (n = 6). The data
// is mildly quadratic; fitting a straight line leaves systematic
// residuals that the LoF test should flag as significant.
//
// Pure-error sum of squares (within-group variation):
//   x = 1: (10.0 − 10.1)² + (10.2 − 10.1)²  = 0.02
//   x = 2: (11.8 − 11.9)² + (12.0 − 11.9)²  = 0.02
//   x = 3: (14.0 − 14.1)² + (14.2 − 14.1)²  = 0.02
//   SS_PE = 0.06,  df_PE = 3·(2−1) = 3
//
// Linear OLS fit ŷ = 7.1333 + 2.45·x gives SSE ≈ 0.9233 with df_E = n−p = 4.
//   SS_LoF = SSE − SS_PE = 0.8633,  df_LoF = 1
//   F = (0.8633/1) / (0.06/3) = 43.17  →  p ≈ 0.0072 (F-dist, df = 1, 3)

const yLinearFit = [10.0, 10.2, 11.8, 12.0, 14.0, 14.2];
const predictedLinear = [9.58333333, 9.58333333, 12.03333333, 12.03333333, 14.48333333, 14.48333333];
const replicatesByDesignPoint = [[0, 1], [2, 3], [4, 5]];

suite('Lack-of-Fit — textbook quadratic-vs-linear', () => {
  test('detects significant LoF when a linear fit misses curvature', () => {
    const lof = lackOfFitTest(yLinearFit, predictedLinear, replicatesByDesignPoint, 4);
    assertEqual(lof.dfPE,  3, 'df_PE');
    assertEqual(lof.dfLoF, 1, 'df_LoF');
    assertAlmostEqual(lof.ssPE,  0.06,    1e-6,  'SS_PE');
    assertAlmostEqual(lof.ssLoF, 0.86333, 1e-3,  'SS_LoF');
    assertAlmostEqual(lof.fStat, 43.1667, 1e-2,  'F statistic');
    // p ≈ 0.0072 — definitely below the 0.05 gate
    if (!(lof.pValue < 0.01)) throw new Error(`expected p < 0.01, got ${lof.pValue}`);
  });
});

// ─── Edge cases ────────────────────────────────────────────────────

suite('Lack-of-Fit — edge cases', () => {
  test('returns null when replicateGroups is empty', () => {
    const lof = lackOfFitTest([1, 2, 3], [1.1, 2.1, 2.9], [], 1);
    assertEqual(lof, null);
  });

  test('returns null when no group has ≥ 2 usable points', () => {
    // Singleton "groups" carry no pure-error information.
    const lof = lackOfFitTest([1, 2, 3], [1.1, 2.1, 2.9], [[0], [1], [2]], 1);
    assertEqual(lof, null);
  });

  test('returns null when df_LoF would be ≤ 0 (saturated fit)', () => {
    // All four observations are replicates of one design point → df_PE = 3,
    // and a 4-parameter fit has df_E = 0 → df_LoF = -3 → null.
    const lof = lackOfFitTest([1, 1.1, 0.9, 1.0], [1, 1, 1, 1], [[0, 1, 2, 3]], 0);
    assertEqual(lof, null);
  });

  test('MS_PE = 0 with non-zero LoF residual (F = ∞, p = 0)', () => {
    // Three design points, each replicated twice. Replicates agree exactly
    // (SS_PE = 0); predictions are deliberately biased toward the overall mean
    // so SS_LoF > 0. With n = 6 and a 2-parameter fit, df_E = 4 → df_LoF = 1.
    const lof = lackOfFitTest(
      [10, 10, 12, 12, 14, 14],
      [12, 12, 12, 12, 12, 12],
      [[0, 1], [2, 3], [4, 5]],
      4,
    );
    assertEqual(lof.dfPE,  3, 'df_PE');
    assertEqual(lof.dfLoF, 1, 'df_LoF');
    assertAlmostEqual(lof.ssPE,  0,  1e-12, 'SS_PE');
    assertAlmostEqual(lof.ssLoF, 16, 1e-9,  'SS_LoF');
    assertEqual(lof.fStat,  Infinity, 'F = Infinity');
    assertEqual(lof.pValue, 0,        'p = 0');
  });

  test('MS_PE = 0 with zero LoF (perfect fit, p = 1)', () => {
    // Replicates exact AND predictions exact. The msPE = 0 branch returns
    // pValue = 1 since msLoF is also 0.
    const lof = lackOfFitTest(
      [10, 10, 12, 12, 14, 14],
      [10, 10, 12, 12, 14, 14],
      [[0, 1], [2, 3], [4, 5]],
      4,
    );
    assertEqual(lof.fStat,  0, 'F = 0');
    assertEqual(lof.pValue, 1, 'p = 1');
  });

  test('drops missing values inside a group instead of breaking', () => {
    // Group [0,1,2] has a NaN at index 1 — the function should use the two
    // remaining usable observations and still report a valid result.
    const y         = [10, NaN, 10.2, 12, 12.1];
    const predicted = [10.1, 10.1, 10.1, 12.05, 12.05];
    const lof = lackOfFitTest(y, predicted, [[0, 1, 2], [3, 4]], 3);
    // Group 0: usable {10, 10.2}, mean 10.1, SS_PE += 0.02
    // Group 1: {12, 12.1}, mean 12.05, SS_PE += 0.005
    assertAlmostEqual(lof.ssPE, 0.025, 1e-6, 'SS_PE with one NaN dropped');
    assertEqual(lof.dfPE, 2, 'df_PE counts only usable points');
  });
});
