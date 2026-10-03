/**
 * D.Mike — Variance Inflation Factor Engine (vif-engine.js)
 *
 * Computes Variance Inflation Factors (VIF) for each term
 * in a coded experimental design matrix.
 *
 * Pure functions — no DOM, no side effects.
 *
 * Formula (Minitab): VIF_j = 1 / (1 − R²_j), R²_j from regressing term j on
 * the intercept and all other terms. Computed on centred columns:
 *   VIF_j = (Xc'Xc)⁻¹_jj × Σ (x_ij − x̄_j)²
 *
 * Centring matters as soon as a column does not average to 0 — centre and
 * axial points, squared terms. The uncentred (X'X)⁻¹_jj × n is only right for
 * ±1 columns without centre points (e.g. 2² + 3 centre points: 1.75 instead
 * of 1; CCD A² 1.869 instead of 1.017).
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
 * Builds the model matrix X (intercept + main effects + 2-factor interactions,
 * or `opts.terms`), centres every non-intercept column and computes
 * VIF_j = diag_j((Xc'Xc)⁻¹) × SS_j. A column without variance has VIF ∞.
 *
 * @param {number[][]} codedMatrix - n×k coded design matrix (e.g. −1, 0, +1, ±α)
 * @param {object} [opts]
 * @param {string[]} [opts.terms] - Term ids (M<f>, Q<f>, I<f>_<g>) instead of main + 2FI
 * @param {Array<[number, number]>} [opts.excludedInteractions] - 2FI pairs to omit
 * @returns {{ term: string, vif: number }[]} VIF for each model term (excluding intercept)
 */
export function computeVIF(codedMatrix, opts = {}) {
  const { X, termNames } = buildModelMatrix(
    codedMatrix,
    Array.isArray(opts.terms)
      ? { terms: opts.terms }
      : { interactions: true, excludedInteractions: opts.excludedInteractions },
  );
  const n = X.length;
  const p = termNames.length - 1;
  // Centred columns without the intercept.
  const Xc = Array.from({ length: n }, () => new Array(p));
  const ss = new Array(p);
  for (let j = 0; j < p; j++) {
    let mean = 0;
    for (let i = 0; i < n; i++) mean += X[i][j + 1];
    mean /= n;
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      const d = X[i][j + 1] - mean;
      Xc[i][j] = d;
      s2 += d * d;
    }
    ss[j] = s2;
  }

  const XcTXc = matMul(matTranspose(Xc), Xc);
  const inv = ss.some(v => v < 1e-12) ? null : matInverse(XcTXc);

  if (!inv) {
    return termNames.slice(1).map(t => ({ term: t, vif: Infinity }));
  }

  const results = [];
  for (let j = 0; j < p; j++) {
    results.push({ term: termNames[j + 1], vif: inv[j][j] * ss[j] });
  }

  return results;
}
