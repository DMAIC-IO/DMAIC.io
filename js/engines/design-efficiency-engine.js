/**
 * D.Mike — Design Efficiency Engine (design-efficiency-engine.js)
 *
 * Computes D-, A-, G-efficiency, leverage, and condition number
 * for coded experimental design matrices.
 *
 * Pure functions — no DOM, no side effects.
 *
 * Formulas:
 *   D-eff = (det(X'X))^(1/p) / n × 100
 *   A-eff = p / (n · tr((X'X)⁻¹)) × 100
 *   G-eff = p / (n · max(h_ii)) × 100
 *
 * where p = number of model terms (incl. intercept),
 *       n = number of runs,
 *       h_ii = diag(H), H = X(X'X)⁻¹X'
 */

import {
  matTranspose, matMul, matInverse, matDeterminant,
  matTrace, buildModelMatrix,
} from './regression-engine.js';

// ─── Types ────────────────────────────────────────────────────────

/**
 * @typedef {object} DesignEfficiency
 * @property {number} dEfficiency - D-efficiency (0–100%)
 * @property {number} aEfficiency - A-efficiency (0–100%)
 * @property {number} gEfficiency - G-efficiency (0–100%)
 * @property {number} maxLeverage - Maximum leverage (hat value)
 * @property {number} avgLeverage - Average leverage
 * @property {number} conditionNumber - Condition number of X'X
 */

// ─── Main Function ────────────────────────────────────────────────

/**
 * Compute design efficiency metrics for a coded design matrix.
 *
 * Builds the model matrix X (intercept + main effects + 2-factor interactions),
 * then computes D-, A-, G-efficiency plus leverage and condition number.
 *
 * @param {number[][]} codedMatrix - n×k coded design matrix (values: −1, 0, +1)
 * @param {object} [opts]
 * @param {Array<[number, number]>} [opts.excludedInteractions] - 2FI pairs to omit
 * @returns {DesignEfficiency}
 */
export function computeDesignEfficiency(codedMatrix, opts = {}) {
  const { X, termNames } = buildModelMatrix(codedMatrix, {
    interactions: true,
    excludedInteractions: opts.excludedInteractions,
  });
  const n = X.length;
  const p = termNames.length; // includes intercept

  const Xt = matTranspose(X);
  const XtX = matMul(Xt, X);
  const XtXinv = matInverse(XtX);

  if (!XtXinv) {
    return {
      dEfficiency: 0, aEfficiency: 0, gEfficiency: 0,
      maxLeverage: NaN, avgLeverage: p / n,
      conditionNumber: Infinity,
    };
  }

  // D-efficiency: (det(X'X))^(1/p) / n × 100
  const det = matDeterminant(XtX);
  const dEff = det > 0
    ? Math.pow(det, 1 / p) / n * 100
    : 0;

  // A-efficiency: p / (n · tr((X'X)⁻¹)) × 100
  const traceInv = matTrace(XtXinv);
  const aEff = traceInv > 0
    ? (p / traceInv) / n * 100
    : 0;

  // Hat matrix diagonals for G-efficiency
  // H = X (X'X)⁻¹ X'  →  h_ii = X[i] · (X'X)⁻¹ · X[i]'
  let maxLev = 0;
  let sumLev = 0;
  for (let i = 0; i < n; i++) {
    let h = 0;
    for (let a = 0; a < p; a++) {
      for (let b = 0; b < p; b++) {
        h += X[i][a] * XtXinv[a][b] * X[i][b];
      }
    }
    if (h > maxLev) maxLev = h;
    sumLev += h;
  }

  // G-efficiency: p / (n · max(h_ii)) × 100
  const gEff = maxLev > 0
    ? (p / (n * maxLev)) * 100
    : 0;

  // Condition number (simplified: ratio of max/min diagonal of X'X)
  const diag = Array.from({ length: p }, (_, i) => XtX[i][i]);
  const maxD = Math.max(...diag);
  const minD = Math.min(...diag.filter(d => d > 1e-15));
  const condNum = minD > 0 ? maxD / minD : Infinity;

  return {
    dEfficiency: Math.min(dEff, 100),
    aEfficiency: Math.min(aEff, 100),
    gEfficiency: Math.min(gEff, 100),
    maxLeverage: maxLev,
    avgLeverage: sumLev / n,
    conditionNumber: condNum,
  };
}
