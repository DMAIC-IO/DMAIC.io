/**
 * D.Mike — Variance Inflation Factor Engine (vif-engine.js)
 *
 * Computes Variance Inflation Factors (VIF) for each term
 * in a coded experimental design matrix.
 *
 * Pure functions — no DOM, no side effects.
 *
 * Formula:
 *   VIF_j = (X'X)⁻¹_jj × n
 *
 * For orthogonal designs (e.g. full 2^k factorials),
 * X'X = nI → (X'X)⁻¹ diag = 1/n → all VIFs = 1.
 *
 * VIF > 1 indicates multicollinearity between model terms.
 * VIF ≤ 5 is generally acceptable, VIF > 10 is problematic.
 */

import {
  matTranspose, matMul, matInverse, buildModelMatrix,
} from './regression-engine.js';

// ─── Main Function ────────────────────────────────────────────────

/**
 * Compute Variance Inflation Factors for each model term.
 *
 * Builds the model matrix X (intercept + main effects + 2-factor interactions),
 * then computes VIF_j = diag_j((X'X)⁻¹) × n for each non-intercept term.
 *
 * @param {number[][]} codedMatrix - n×k coded design matrix (values: −1, 0, +1)
 * @returns {{ term: string, vif: number }[]} VIF for each model term (excluding intercept)
 */
export function computeVIF(codedMatrix) {
  const { X, termNames } = buildModelMatrix(codedMatrix, { interactions: true });
  const Xt = matTranspose(X);
  const XtX = matMul(Xt, X);
  const XtXinv = matInverse(XtX);

  if (!XtXinv) {
    return termNames.slice(1).map(t => ({ term: t, vif: Infinity }));
  }

  const n = X.length;
  const results = [];

  // Skip intercept (index 0), compute VIF for each term
  for (let j = 1; j < termNames.length; j++) {
    const vif = XtXinv[j][j] * n;
    results.push({ term: termNames[j], vif });
  }

  return results;
}
