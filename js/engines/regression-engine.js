/**
 * D.Mike — Regression Analysis Engine (regression-engine.js)
 *
 * Central pure-math library for regression and linear algebra.
 * Shared by the Regression module and the DoE Planner module.
 *
 * Provides:
 *   - Matrix operations (transpose, multiply, invert, determinant, …)
 *   - Model matrix construction (polynomial & coded DOE designs)
 *   - OLS regression (normal equations)
 *   - Type I and Type III sum of squares
 *   - Polynomial (degree 1–3, multi-X with interactions)
 *   - Exponential (single-X), Logarithmic (single-X), Power (single-X)
 *   - Statistical distribution functions (normal, t, F)
 *   - Diagnostics (VIF, Durbin-Watson, residuals, normal order statistics)
 *
 * No DOM, no side effects.
 */

import { mean, stddev } from './stats-utils.js';

// ── Basic statistics ────────────────────────────────────────────────

/** @param {number[]} arr */
function sum(arr) { return arr.reduce((s, v) => s + v, 0); }

// ── Distribution helpers (from math-utils.js) ─────────────────────

import {
  normalCDF, normalQuantile, erfc,
  tCDF, tInv, tPValue, fCDF, fPValue, fQuantile,
} from './math-utils.js';

// ── Matrix operations (public) ─────────────────────────────────────

/**
 * Transpose a matrix.
 * @param {number[][]} A - m×n matrix
 * @returns {number[][]} n×m transposed matrix
 */
export function matTranspose(A) {
  const m = A.length;
  const n = A[0].length;
  const T = Array.from({ length: n }, () => new Array(m));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      T[j][i] = A[i][j];
    }
  }
  return T;
}

/**
 * Multiply two matrices.
 * @param {number[][]} A - m×p matrix
 * @param {number[][]} B - p×n matrix
 * @returns {number[][]} m×n result
 */
export function matMul(A, B) {
  const m = A.length;
  const p = A[0].length;
  const n = B[0].length;
  const C = Array.from({ length: m }, () => new Array(n).fill(0));
  for (let i = 0; i < m; i++) {
    for (let k = 0; k < p; k++) {
      const aik = A[i][k];
      if (aik === 0) continue;
      for (let j = 0; j < n; j++) {
        C[i][j] += aik * B[k][j];
      }
    }
  }
  return C;
}

/**
 * Compute the trace (sum of diagonal) of a square matrix.
 * @param {number[][]} A - n×n matrix
 * @returns {number}
 */
export function matTrace(A) {
  let s = 0;
  for (let i = 0; i < A.length; i++) s += A[i][i];
  return s;
}

/**
 * Create an identity matrix.
 * @param {number} n - Size
 * @returns {number[][]}
 */
export function matIdentity(n) {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_j, j) => (i === j ? 1 : 0))
  );
}

/**
 * Compute the determinant of a square matrix using LU decomposition.
 * @param {number[][]} A - n×n matrix
 * @returns {number}
 */
export function matDeterminant(A) {
  const n = A.length;
  if (n === 1) return A[0][0];
  if (n === 2) return A[0][0] * A[1][1] - A[0][1] * A[1][0];

  const U = A.map(row => [...row]);
  let sign = 1;

  for (let k = 0; k < n; k++) {
    let maxVal = Math.abs(U[k][k]);
    let maxRow = k;
    for (let i = k + 1; i < n; i++) {
      if (Math.abs(U[i][k]) > maxVal) {
        maxVal = Math.abs(U[i][k]);
        maxRow = i;
      }
    }
    if (maxRow !== k) {
      [U[k], U[maxRow]] = [U[maxRow], U[k]];
      sign *= -1;
    }
    if (Math.abs(U[k][k]) < 1e-15) return 0;
    for (let i = k + 1; i < n; i++) {
      const factor = U[i][k] / U[k][k];
      for (let j = k; j < n; j++) {
        U[i][j] -= factor * U[k][j];
      }
    }
  }

  let det = sign;
  for (let i = 0; i < n; i++) det *= U[i][i];
  return det;
}

/**
 * Invert a square matrix via Gauss-Jordan elimination.
 * @param {number[][]} A - n×n matrix
 * @returns {number[][]|null} Inverse matrix, or null if singular
 */
export function matInverse(A) {
  const n = A.length;

  // Equilibrate: row + column scaling brings mixed-scale matrices (e.g. X'X
  // where one predictor has magnitude 1 and another magnitude 1e-10) into a
  // regime where a fixed pivot tolerance is meaningful. Without this, a
  // well-conditioned but poorly scaled matrix is rejected as "singular".
  // If A = R·A₂·C with R=diag(r), C=diag(c), then (A⁻¹)[i][j] = P[i][j] / (c[i]·r[j]).
  const rowScale = new Array(n);
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let j = 0; j < n; j++) {
      const v = Math.abs(A[i][j]);
      if (v > m) m = v;
    }
    rowScale[i] = m > 0 ? m : 1;
  }
  const A1 = A.map((row, i) => row.map(v => v / rowScale[i]));
  const colScale = new Array(n);
  for (let j = 0; j < n; j++) {
    let m = 0;
    for (let i = 0; i < n; i++) {
      const v = Math.abs(A1[i][j]);
      if (v > m) m = v;
    }
    colScale[j] = m > 0 ? m : 1;
  }
  const A2 = A1.map(row => row.map((v, j) => v / colScale[j]));

  const aug = A2.map((row, i) => {
    const r = [...row];
    for (let j = 0; j < n; j++) r.push(i === j ? 1 : 0);
    return r;
  });
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-15) return null;
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= pivot;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = aug[row][col];
      for (let j = 0; j < 2 * n; j++) aug[row][j] -= f * aug[col][j];
    }
  }
  const P = aug.map(row => row.slice(n));

  const inv = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_j, j) => P[i][j] / (colScale[i] * rowScale[j]))
  );
  return inv;
}

// ── Matrix operations (private, kept for internal use) ─────────────

/**
 * Solve normal equations X'X β = X'y via Gauss elimination.
 * @param {number[][]} X — design matrix (n × p)
 * @param {number[]} y — response vector
 * @returns {number[]} — coefficients
 */
function solveNormalEquations(X, y) {
  const p = X[0].length, n = X.length;
  const XtX = Array.from({ length: p }, () => Array(p).fill(0));
  const Xty = Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      Xty[j] += X[i][j] * y[i];
      for (let k = 0; k < p; k++) {
        XtX[j][k] += X[i][j] * X[i][k];
      }
    }
  }
  const aug = XtX.map((row, i) => [...row, Xty[i]]);
  for (let col = 0; col < p; col++) {
    let maxRow = col;
    for (let row = col + 1; row < p; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    for (let row = col + 1; row < p; row++) {
      const f = aug[row][col] / aug[col][col];
      for (let j = col; j <= p; j++) aug[row][j] -= f * aug[col][j];
    }
  }
  const result = Array(p).fill(0);
  for (let i = p - 1; i >= 0; i--) {
    result[i] = aug[i][p];
    for (let j = i + 1; j < p; j++) result[i] -= aug[i][j] * result[j];
    result[i] /= aug[i][i];
  }
  return result;
}

// invertMatrix removed — use exported matInverse instead

// ── Polynomial design matrix ────────────────────────────────────────

/**
 * Build design matrix for polynomial regression with interactions.
 * Degree 1: intercept + main effects (x₁, x₂, …)
 * Degree 2: + squared terms (x₁², x₂², …) + 2-way interactions (x₁·x₂, …)
 * Degree 3: + cubic terms (x₁³, …) + 3-way cross-terms
 *
 * @param {number[][]} xCols — k arrays of x values (each length n)
 * @param {number} degree — polynomial degree (1, 2, or 3)
 * @param {string[]} xNames — column names for labeling terms
 * @returns {{ X: number[][], terms: string[] }}
 */
function buildPolyDesignMatrix(xCols, degree, xNames) {
  const k = xCols.length;
  const n = xCols[0].length;
  const terms = ['Intercept'];

  // Start with intercept column
  const columns = [Array(n).fill(1)];

  // Main effects
  for (let i = 0; i < k; i++) {
    terms.push(xNames[i]);
    columns.push([...xCols[i]]);
  }

  if (degree >= 2) {
    // Squared terms
    for (let i = 0; i < k; i++) {
      terms.push(`${xNames[i]}²`);
      columns.push(xCols[i].map(v => v * v));
    }
    // 2-way interactions
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        terms.push(`${xNames[i]}·${xNames[j]}`);
        columns.push(xCols[i].map((v, r) => v * xCols[j][r]));
      }
    }
  }

  if (degree >= 3) {
    // Cubic terms
    for (let i = 0; i < k; i++) {
      terms.push(`${xNames[i]}³`);
      columns.push(xCols[i].map(v => v * v * v));
    }
    // 3-way interactions (x₁²·x₂, x₁·x₂², for each pair)
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        terms.push(`${xNames[i]}²·${xNames[j]}`);
        columns.push(xCols[i].map((v, r) => v * v * xCols[j][r]));
        terms.push(`${xNames[i]}·${xNames[j]}²`);
        columns.push(xCols[i].map((v, r) => v * xCols[j][r] * xCols[j][r]));
      }
    }
    // 3-way interactions (x₁·x₂·x₃ for distinct triples)
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        for (let l = j + 1; l < k; l++) {
          terms.push(`${xNames[i]}·${xNames[j]}·${xNames[l]}`);
          columns.push(xCols[i].map((v, r) => v * xCols[j][r] * xCols[l][r]));
        }
      }
    }
  }

  // Transpose: columns → row-major design matrix
  const X = Array.from({ length: n }, (_, r) => columns.map(col => col[r]));
  return { X, terms };
}

// ── Coded DOE model matrix ─────────────────────────────────────────

/**
 * Build a model matrix from a coded design matrix (±1 levels).
 *
 * Two calling conventions:
 *
 *   (1) explicit term list (new): pass `opts.terms` as an array of
 *       canonical term ids (see js/engines/doe-terms.js — "M0", "Q1",
 *       "I0_1", "I0_1_2", …). The matrix gets exactly those columns,
 *       in that order, plus an intercept column up front unless
 *       `opts.intercept === false`.
 *
 *   (2) legacy: pass `opts.interactions` (default true) and optionally
 *       `opts.excludedInteractions` as [a,b] pairs to omit. Produces
 *       intercept + main effects + 2-factor interactions (minus the
 *       excluded ones). Quadratic terms are not generated in this mode
 *       — callers that need them must use the new term-list form.
 *
 * @param {number[][]} codedMatrix - n×k coded design matrix
 * @param {object} [opts]
 * @param {string[]} [opts.terms] - Canonical term ids (preferred). When
 *   present, `interactions` and `excludedInteractions` are ignored.
 * @param {boolean} [opts.interactions=true] - Legacy: include 2FI
 * @param {boolean} [opts.intercept=true] - Include intercept column
 * @param {Array<[number, number]>} [opts.excludedInteractions] - Legacy:
 *   2FI pairs [a,b] (0-based factor indices, order irrelevant) to omit
 * @returns {{ X: number[][], termNames: string[] }}
 */
export function buildModelMatrix(codedMatrix, opts = {}) {
  const includeIntercept = opts.intercept !== false;
  const n = codedMatrix.length;
  const k = codedMatrix[0].length;
  const letter = (j) => String.fromCharCode(65 + j);

  // ── New form: explicit term ids ──────────────────────────────
  if (Array.isArray(opts.terms)) {
    const termNames = [];
    const X = Array.from({ length: n }, () => []);

    if (includeIntercept) {
      termNames.push('Intercept');
      for (let i = 0; i < n; i++) X[i].push(1);
    }

    for (const id of opts.terms) {
      if (typeof id !== 'string' || id.length < 2) continue;
      const tag = id[0];
      if (tag === 'M') {
        const f = parseInt(id.slice(1), 10);
        if (!Number.isFinite(f) || f < 0 || f >= k) continue;
        termNames.push(letter(f));
        for (let i = 0; i < n; i++) X[i].push(codedMatrix[i][f]);
      } else if (tag === 'Q') {
        const f = parseInt(id.slice(1), 10);
        if (!Number.isFinite(f) || f < 0 || f >= k) continue;
        termNames.push(`${letter(f)  }²`);
        for (let i = 0; i < n; i++) {
          const v = codedMatrix[i][f];
          X[i].push(v * v);
        }
      } else if (tag === 'I') {
        const parts = id.slice(1).split('_').map(s => parseInt(s, 10));
        if (parts.some(p => !Number.isFinite(p) || p < 0 || p >= k)) continue;
        if (parts.length < 2) continue;
        const sorted = [...new Set(parts)].sort((a, b) => a - b);
        termNames.push(sorted.map(letter).join('×'));
        for (let i = 0; i < n; i++) {
          let prod = 1;
          for (const f of sorted) prod *= codedMatrix[i][f];
          X[i].push(prod);
        }
      }
    }

    return { X, termNames };
  }

  // ── Legacy form: interactions + excludedInteractions ─────────
  const includeIx = opts.interactions !== false;
  const excluded = opts.excludedInteractions || [];

  const excludedSet = new Set();
  for (const pair of excluded) {
    if (!Array.isArray(pair) || pair.length !== 2) continue;
    const a = Math.min(pair[0], pair[1]);
    const b = Math.max(pair[0], pair[1]);
    if (a === b) continue;
    excludedSet.add(`${a  }_${  b}`);
  }

  const termNames = [];
  const X = Array.from({ length: n }, () => []);

  // Intercept
  if (includeIntercept) {
    termNames.push('Intercept');
    for (let i = 0; i < n; i++) X[i].push(1);
  }

  // Main effects
  for (let j = 0; j < k; j++) {
    termNames.push(String.fromCharCode(65 + j));
    for (let i = 0; i < n; i++) X[i].push(codedMatrix[i][j]);
  }

  // 2-factor interactions
  if (includeIx) {
    for (let a = 0; a < k; a++) {
      for (let b = a + 1; b < k; b++) {
        if (excludedSet.has(`${a  }_${  b}`)) continue;
        termNames.push(`${String.fromCharCode(65 + a)  }\u00d7${  String.fromCharCode(65 + b)}`);
        for (let i = 0; i < n; i++) {
          X[i].push(codedMatrix[i][a] * codedMatrix[i][b]);
        }
      }
    }
  }

  return { X, termNames };
}

// ── OLS Regression (generic) ───────────────────────────────────────

/**
 * @typedef {object} OLSResult
 * @property {number[]} beta - Regression coefficients (length p)
 * @property {number[]} predicted - Predicted (fitted) values (length n)
 * @property {number[]} residuals - Residuals y - ŷ (length n)
 * @property {number} SST - Total sum of squares
 * @property {number} SSR - Regression sum of squares
 * @property {number} SSE - Error (residual) sum of squares
 * @property {number} rSquared - R²
 * @property {number} rSquaredAdj - Adjusted R²
 * @property {number} MSE - Mean squared error
 * @property {number} sigma - Root MSE (std. error of residuals)
 * @property {number[]} seBeta - Standard errors of coefficients
 * @property {number[]} tValues - t-statistics for coefficients
 * @property {number[]} pValues - p-values for coefficients (two-tailed)
 * @property {number} dfModel - Model degrees of freedom (p-1, excl. intercept)
 * @property {number} dfError - Error degrees of freedom (n-p)
 * @property {number} fStatistic - Overall F-statistic
 * @property {number} fPValue - p-value for overall F-test
 * @property {number[][]} XtXinv - Inverse of X'X (for SE, prediction intervals)
 */

/**
 * Fit an OLS linear regression model: y = Xβ + ε
 * Uses the normal equations: β = (X'X)⁻¹ X'y
 *
 * This is the low-level API that accepts a pre-built model matrix.
 * For polynomial regression from raw columns, use runMultiRegression().
 * For DOE designs, build the matrix with buildModelMatrix() first.
 *
 * @param {number[][]} X - n×p model matrix (including intercept column)
 * @param {number[]} y - n×1 response vector
 * @returns {OLSResult|null} null if X'X is singular
 */
export function olsRegression(X, y) {
  const n = X.length;
  const p = X[0].length;

  // Build X'X and X'y
  const XtX = Array.from({ length: p }, () => Array(p).fill(0));
  const Xty = Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      Xty[j] += X[i][j] * y[i];
      for (let k = 0; k < p; k++) {
        XtX[j][k] += X[i][j] * X[i][k];
      }
    }
  }

  const XtXinv = matInverse(XtX);
  if (!XtXinv) return null;

  // β = (X'X)⁻¹ X'y
  const beta = [];
  for (let j = 0; j < p; j++) {
    let s = 0;
    for (let k = 0; k < p; k++) s += XtXinv[j][k] * Xty[k];
    beta.push(s);
  }

  // Fitted values & residuals
  const predicted = X.map(row =>
    row.reduce((s, xij, j) => s + xij * beta[j], 0)
  );
  const residuals = y.map((yi, i) => yi - predicted[i]);

  // Sum of squares
  const yMean = y.reduce((s, v) => s + v, 0) / n;
  const SST = y.reduce((s, v) => s + (v - yMean) ** 2, 0);
  const SSE = residuals.reduce((s, r) => s + r * r, 0);
  const SSR = SST - SSE;

  // Degrees of freedom
  const dfModel = p - 1;
  const dfError = Math.max(n - p, 1);

  // Mean squares
  const MSR = dfModel > 0 ? SSR / dfModel : 0;
  const MSE = SSE / dfError;
  const sigma = Math.sqrt(MSE);

  // R²
  const rSquared = SST > 0 ? SSR / SST : 0;
  const rSquaredAdj = SST > 0 && n > p
    ? 1 - (SSE / dfError) / (SST / (n - 1))
    : 0;

  // Coefficient standard errors, t-values, p-values
  const seBeta = [];
  const tValues = [];
  const pValues = [];
  for (let j = 0; j < p; j++) {
    const se = Math.sqrt(MSE * Math.abs(XtXinv[j][j]));
    const t = se > 0 ? beta[j] / se : 0;
    const pv = se > 0 ? tPValue(t, dfError) : 1;
    seBeta.push(se);
    tValues.push(t);
    pValues.push(pv);
  }

  // Overall F-test
  const fStatistic = MSE > 0 ? MSR / MSE : 0;
  const fPVal = dfModel > 0 && MSE > 0
    ? fPValue(fStatistic, dfModel, dfError)
    : 1;

  return {
    beta, predicted, residuals,
    SST, SSR, SSE,
    rSquared, rSquaredAdj,
    MSE, sigma,
    seBeta, tValues, pValues,
    dfModel, dfError,
    fStatistic, fPValue: fPVal,
    XtXinv,
  };
}

// ── Type III Sum of Squares ────────────────────────────────────────

/**
 * Compute Type III (adjusted) sum of squares for each term.
 * For each term j, SS_j = t_j² × MSE.
 * This is equivalent to the "extra sum of squares" approach for orthogonal designs.
 *
 * @param {OLSResult} ols - OLS regression result (from olsRegression)
 * @returns {{ termSS: number[], termDF: number[], termMS: number[], termF: number[], termP: number[] }}
 */
export function typeIIISS(ols) {
  const p = ols.beta.length;
  const termSS = [];
  const termDF = [];
  const termMS = [];
  const termF = [];
  const termP = [];

  // Skip intercept (j=0), compute for each model term
  for (let j = 1; j < p; j++) {
    const ss = ols.tValues[j] ** 2 * ols.MSE;
    const df = 1;
    const ms = ss / df;
    const f = ols.MSE > 0 ? ms / ols.MSE : 0;
    const pv = ols.MSE > 0 ? fPValue(f, df, ols.dfError) : 1;

    termSS.push(ss);
    termDF.push(df);
    termMS.push(ms);
    termF.push(f);
    termP.push(pv);
  }

  return { termSS, termDF, termMS, termF, termP };
}

// ── Lack-of-Fit Test ────────────────────────────────────────────

/**
 * Lack-of-Fit F-test using replicate observations to estimate pure error.
 *
 * Decomposes SSE = SS_PE + SS_LoF where SS_PE is the within-replicate-group
 * variation (does not depend on the model). The F-test compares model
 * misspecification against pure noise.
 *
 * `replicateGroups` are arrays of indices into y/predicted that share identical
 * factor settings. Singletons (rows not in any group) contribute 0 to both SS_PE
 * and df_PE — callers can therefore omit them. Indices must already be aligned
 * to the y/predicted vectors actually used in the OLS fit.
 *
 * @param {number[]} y         - response vector (length n)
 * @param {number[]} predicted - fitted values (length n)
 * @param {number[][]} replicateGroups - groups of repeated-design-point indices
 * @param {number} dfError     - residual degrees of freedom (n − p)
 * @returns {{ fStat: number, dfLoF: number, dfPE: number, ssLoF: number, ssPE: number, pValue: number } | null}
 *   null when no replicates are usable (df_PE ≤ 0) or the design is saturated at
 *   the unique-points level (df_LoF ≤ 0).
 */
export function lackOfFitTest(y, predicted, replicateGroups, dfError) {
  if (!Array.isArray(replicateGroups) || replicateGroups.length === 0) return null;

  let ssPE = 0;
  let dfPE = 0;
  for (const group of replicateGroups) {
    if (!Array.isArray(group) || group.length < 2) continue;
    const usable = group.filter(i => Number.isFinite(y[i]));
    if (usable.length < 2) continue;
    const groupMean = usable.reduce((s, i) => s + y[i], 0) / usable.length;
    for (const i of usable) ssPE += (y[i] - groupMean) ** 2;
    dfPE += usable.length - 1;
  }

  if (dfPE <= 0) return null;
  const dfLoF = dfError - dfPE;
  if (dfLoF <= 0) return null;

  let sse = 0;
  for (let i = 0; i < y.length; i++) {
    if (!Number.isFinite(y[i]) || !Number.isFinite(predicted[i])) continue;
    sse += (y[i] - predicted[i]) ** 2;
  }
  const ssLoF = Math.max(sse - ssPE, 0);
  const msLoF = ssLoF / dfLoF;
  const msPE  = ssPE  / dfPE;

  // No variation between replicates → F is undefined. By convention: if there
  // is any LoF residual, the model fails the test (p = 0); otherwise it's a
  // perfect fit (p = 1).
  if (msPE <= 0) {
    return {
      fStat:  msLoF > 0 ? Infinity : 0,
      dfLoF, dfPE, ssLoF, ssPE,
      pValue: msLoF > 0 ? 0 : 1,
    };
  }

  const fStat  = msLoF / msPE;
  const pValue = fPValue(fStat, dfLoF, dfPE);
  return { fStat, dfLoF, dfPE, ssLoF, ssPE, pValue };
}

// ── Effect coding & block ANOVA (V0.4 Phase 3) ─────────────────────

/**
 * Effect-code a categorical factor into k − 1 indicator columns.
 *
 * Effect coding (sum-to-zero contrasts) maps each level to a row of indicators:
 *
 *   reference        → [-1, -1, …, -1]   (length k − 1)
 *   non-reference j  → e_j               (a single +1 at position j, 0 elsewhere)
 *
 * Compared with dummy coding, the intercept estimates the *grand mean* across
 * levels rather than the reference-cell mean, and each indicator coefficient
 * reads as the deviation of its level from the grand mean (the deviation of
 * the reference level is the negative sum of the others). This matches the
 * default behaviour of R's `contr.sum`.
 *
 * @param {Array<string|number>} labels - one label per row (length n)
 * @param {Array<string|number>} levels - the k distinct levels in display order
 * @param {string|number} reference     - the level treated as the reference
 * @returns {number[][]} n × (k − 1) indicator matrix
 * @throws if `reference` is not in `levels` or k < 2
 */
export function buildEffectCodedColumns(labels, levels, reference) {
  if (!Array.isArray(levels) || levels.length < 2) {
    throw new Error('effect coding requires at least 2 levels');
  }
  const refIdx = levels.findIndex(l => l === reference);
  if (refIdx < 0) throw new Error(`reference level ${JSON.stringify(reference)} not found in levels`);
  const nonRef = levels.filter((_, i) => i !== refIdx);
  return labels.map(label => {
    if (label === reference) return new Array(nonRef.length).fill(-1);
    const j = nonRef.indexOf(label);
    if (j < 0) throw new Error(`unknown level ${JSON.stringify(label)}`);
    const row = new Array(nonRef.length).fill(0);
    row[j] = 1;
    return row;
  });
}

/**
 * Compute Type-III sum of squares for a block of model-matrix columns
 * (typically the n − 1 indicators that encode one categorical factor).
 *
 * For a block of size m, SS_block = Σ_j t_j² · MSE  is *not* correct because
 * the indicators are not orthogonal in general — instead we use the standard
 * extra-SS approach: SS_block = β_block' (V_block)^(−1) β_block where V_block
 * is the corresponding sub-matrix of MSE · (X'X)^(−1). For a single column
 * (m = 1) this collapses to the t² · MSE form already in `typeIIISS`.
 *
 * @param {OLSResult} ols - result from olsRegression
 * @param {number[]} columnIndices - 0-based positions of the block's columns in β
 * @returns {{ ss: number, df: number, ms: number, fStat: number, pValue: number }}
 */
export function blockTypeIIISS(ols, columnIndices) {
  const m = columnIndices.length;
  if (m === 0) return { ss: 0, df: 0, ms: 0, fStat: 0, pValue: 1 };

  // β sub-vector and (X'X)^(−1) sub-matrix.
  const beta = columnIndices.map(i => ols.beta[i]);
  const subInv = columnIndices.map(i => columnIndices.map(j => ols.XtXinv[i][j]));

  // SS_block = β' V^(−1) β   with   V = MSE · (X'X)^(−1)_{block,block}
  // ⇒ SS_block = (1 / MSE) · β' inv(subInv) β       — but inv(subInv) is what's
  //   needed: subInv corresponds to the variance-covariance scale of β, and the
  //   quadratic form for the F-statistic is β' (subInv)^(−1) β / MSE.
  const subInvInv = matInverse(subInv);
  if (!subInvInv) {
    // Singular sub-block (e.g. perfectly aliased indicators) — no information.
    return { ss: 0, df: m, ms: 0, fStat: 0, pValue: 1 };
  }

  let quad = 0;
  for (let a = 0; a < m; a++) {
    for (let b = 0; b < m; b++) {
      quad += beta[a] * subInvInv[a][b] * beta[b];
    }
  }
  const ss = quad;                  // already in y-space because subInv was the (X'X)^(−1) scale
  const df = m;
  const ms = ss / df;
  const fStat = ols.MSE > 0 ? ms / ols.MSE : 0;
  const pValue = ols.MSE > 0 ? fPValue(fStat, df, ols.dfError) : 1;
  return { ss, df, ms, fStat, pValue };
}

// ── ModelSpec compiler (V0.4 Phase 3) ──────────────────────────────
//
// A ModelSpec is a structured description of which terms a regression model
// contains. The compiler turns it into a model matrix, a block map (one entry
// per term) and a list of human-readable column names. Downstream:
//
//   const { X, blockMap, termNames } = compileModelSpec(spec, data);
//   const ols = olsRegression(X, data.y);
//   const blockSS = blockMap.map(b => blockTypeIIISS(ols, b.columnIndices));
//
// Mathematical contract (matches R's `model.matrix(formula, contrasts.arg)`
// with `contr.sum` for unordered factors):
//
//   - Continuous main effect at degree d  →  d columns: X, X², …, X^d
//   - Categorical main effect (k levels)  →  k − 1 effect-coded indicators
//                                              (sum-to-zero, see
//                                              `buildEffectCodedColumns`)
//   - Interaction = Kronecker-style product of the involved expansions:
//       continuous × continuous (degrees d1, d2)  →  d1 · d2 columns
//       continuous × categorical (k levels)        →  d · (k − 1) columns
//       categorical × categorical (k1, k2)         →  (k1 − 1)(k2 − 1) columns
//
// Block-level Type-III sums of squares come out right because every term
// occupies a contiguous, named block of the model matrix; `blockTypeIIISS`
// applied to that block reproduces R's `drop1(..., test="F")` row.
//
// The intercept is implicit and not represented in `terms`.
//
// ─── Type definitions ─────────────────────────────────────────────

/**
 * @typedef {object} Predictor
 * @property {string} id              Unique identifier (used as a key into `data.columns`).
 * @property {'continuous'|'categorical'} kind
 * @property {Array<string|number>} [levels]   Required for categorical predictors,
 *   in display order. The first one is also the default reference if `reference` is missing.
 * @property {string|number} [reference]       Reference level for effect coding
 *   (categorical only). Defaults to `levels[0]`.
 */

/**
 * @typedef {{ id: string, degree?: number }} TermFactor
 *   `degree` is the polynomial power for continuous predictors (defaults to 1
 *   and is ignored for categorical predictors).
 */

/**
 * @typedef {object} Term
 * @property {string} id            Unique label, e.g. 'X1', 'X1^2', 'X1:Tool'.
 * @property {TermFactor[]} factors The predictors that compose the term.
 *   A single-element list is a main effect; multi-element is an interaction.
 */

/**
 * @typedef {object} ModelSpec
 * @property {Predictor[]} predictors
 * @property {Term[]} terms
 * @property {boolean} [includeIntercept=true]
 */

/**
 * @typedef {object} BlockEntry
 * @property {string} id              Matches Term.id (or 'Intercept').
 * @property {number[]} columnIndices 0-based positions in X.
 * @property {number} df              Block degrees of freedom = column count.
 * @property {string[]} columnNames   Per-column human-readable label.
 */

/**
 * @typedef {object} CompiledSpec
 * @property {number[][]} X           Model matrix, rows aligned to data.
 * @property {BlockEntry[]} blockMap  One entry per term (intercept first if present).
 * @property {string[]} termNames     Flat list of column names — `X[*]` index → name.
 * @property {string[]} predictorIds  Order in which predictors appear in spec.
 */

/**
 * Compile a ModelSpec against actual data into a model matrix.
 *
 * @param {ModelSpec} spec
 * @param {{ columns: Record<string, Array<number|string>>, y?: number[] }} data
 *   `columns[predictorId]` is a number[] for continuous, (string|number)[] for
 *   categorical. All columns must share the same length. (`y` is optional and
 *   only inspected for length-consistency, not used for matrix construction.)
 * @returns {CompiledSpec}
 * @throws if a predictor is referenced by a term but not declared, if column
 *   lengths disagree, if a categorical value is not in its predictor's levels,
 *   or if a continuous column has non-finite values.
 */
export function compileModelSpec(spec, data) {
  if (!spec || !Array.isArray(spec.predictors) || !Array.isArray(spec.terms)) {
    throw new Error('compileModelSpec: spec must have predictors[] and terms[]');
  }
  const cols = data?.columns || {};
  const lengths = Object.values(cols).map(c => Array.isArray(c) ? c.length : 0);
  if (lengths.length === 0) throw new Error('compileModelSpec: data.columns is empty');
  const n = lengths[0];
  for (const len of lengths) {
    if (len !== n) throw new Error(`compileModelSpec: column length mismatch (expected ${n}, got ${len})`);
  }
  if (data.y && data.y.length !== n) {
    throw new Error(`compileModelSpec: y length ${data.y.length} ≠ data length ${n}`);
  }

  // Pre-compute per-predictor expansions:
  //   continuous → cache of [X^1, X^2, …] keyed by max needed degree
  //   categorical → effect-coded indicator matrix (one row per observation,
  //                                                k−1 columns) + per-column labels
  const expansions = new Map();   // predictorId → { kind, columnsByDegree?, indicators?, indicatorNames? }
  for (const pred of spec.predictors) {
    const colData = cols[pred.id];
    if (!Array.isArray(colData)) {
      throw new Error(`compileModelSpec: missing data for predictor "${pred.id}"`);
    }
    if (pred.kind === 'continuous') {
      // Validate numeric.
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(colData[i])) {
          throw new Error(`compileModelSpec: non-finite value in continuous predictor "${pred.id}" at row ${i}`);
        }
      }
      expansions.set(pred.id, { kind: 'continuous', linear: colData.map(v => Number(v)), powerCache: new Map() });
    } else if (pred.kind === 'categorical') {
      if (!Array.isArray(pred.levels) || pred.levels.length < 2) {
        throw new Error(`compileModelSpec: categorical predictor "${pred.id}" needs ≥ 2 levels`);
      }
      const reference = pred.reference ?? pred.levels[0];
      const indicators = buildEffectCodedColumns(colData, pred.levels, reference);
      const nonRef = pred.levels.filter(l => l !== reference);
      const indicatorNames = nonRef.map(l => `${pred.id}=${String(l)}`);
      expansions.set(pred.id, { kind: 'categorical', indicators, indicatorNames, levels: pred.levels, reference });
    } else {
      throw new Error(`compileModelSpec: unknown kind "${pred.kind}" for predictor "${pred.id}"`);
    }
  }

  // Helper: get the m-column expansion of a single TermFactor for a given row.
  // Returns an array of m numbers and a parallel array of m sub-labels.
  // For interactions we then take the Kronecker product of these arrays.
  function expandFactorRow(rowIdx, tf) {
    const exp = expansions.get(tf.id);
    if (!exp) throw new Error(`compileModelSpec: term references unknown predictor "${tf.id}"`);
    if (exp.kind === 'continuous') {
      const degree = Math.max(1, Math.floor(tf.degree ?? 1));
      // Single-column at the requested power. For interaction terms we treat
      // each TermFactor independently — combining two TermFactors of the same
      // continuous predictor is the caller's choice (they get X · X = X²
      // implicitly only if they list it that way).
      const v = exp.linear[rowIdx];
      return [Math.pow(v, degree)];
    }
    // categorical → row of k − 1 indicators
    return exp.indicators[rowIdx].slice();
  }
  function factorSubLabel(tf) {
    const exp = expansions.get(tf.id);
    if (exp.kind === 'continuous') {
      const degree = Math.max(1, Math.floor(tf.degree ?? 1));
      return [degree === 1 ? tf.id : `${tf.id}^${degree}`];
    }
    return [...exp.indicatorNames];
  }

  // Kronecker product of label arrays — pairs each label from `a` with each
  // label from `b`. Used to name interaction columns.
  function kroneckerLabels(a, b) {
    const out = [];
    for (const la of a) for (const lb of b) out.push(`${la}·${lb}`);
    return out;
  }

  // Assemble columns term by term. Each term contributes a contiguous block.
  const X = Array.from({ length: n }, () => []);
  const termNames = [];
  const blockMap = [];

  const includeIntercept = spec.includeIntercept !== false;
  if (includeIntercept) {
    for (let i = 0; i < n; i++) X[i].push(1);
    termNames.push('Intercept');
    blockMap.push({ id: 'Intercept', columnIndices: [0], df: 1, columnNames: ['Intercept'] });
  }

  for (const term of spec.terms) {
    if (!Array.isArray(term.factors) || term.factors.length === 0) {
      throw new Error(`compileModelSpec: term "${term.id}" must have ≥ 1 factor`);
    }
    // Expand row by row, taking the Kronecker product across the term's factors.
    const rowsExpanded = new Array(n);
    let labels = factorSubLabel(term.factors[0]);
    for (let f = 1; f < term.factors.length; f++) {
      labels = kroneckerLabels(labels, factorSubLabel(term.factors[f]));
    }
    const m = labels.length;
    for (let i = 0; i < n; i++) {
      let acc = expandFactorRow(i, term.factors[0]);
      for (let f = 1; f < term.factors.length; f++) {
        const next = expandFactorRow(i, term.factors[f]);
        const combined = new Array(acc.length * next.length);
        let k = 0;
        for (const a of acc) for (const b of next) combined[k++] = a * b;
        acc = combined;
      }
      if (acc.length !== m) {
        throw new Error(`compileModelSpec: term "${term.id}" row ${i} expanded to ${acc.length} cols, expected ${m}`);
      }
      rowsExpanded[i] = acc;
    }

    const startCol = X[0].length;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < m; k++) X[i].push(rowsExpanded[i][k]);
    }
    const columnIndices = [];
    for (let k = 0; k < m; k++) columnIndices.push(startCol + k);

    // Column naming: continuous-only terms (main effect or pure-continuous
    // interaction) collapse to the term id ('X', 'X^2', 'X1·X2'). Anything
    // touching a categorical predictor keeps its indicator-level label
    // ('Tool=HSS', 'X·Tool=B') so the coef table can identify the level.
    const touchesCategorical = term.factors.some(tf => expansions.get(tf.id).kind === 'categorical');
    const columnNames = touchesCategorical
      ? labels.slice()
      : labels.map(() => term.id);
    termNames.push(...columnNames);
    blockMap.push({ id: term.id, columnIndices, df: m, columnNames });
  }

  return {
    X,
    blockMap,
    termNames,
    predictorIds: spec.predictors.map(p => p.id),
  };
}

// ── Polynomial term generator ──────────────────────────────────────

/**
 * Emit the canonical Term[] for a polynomial regression of given degree
 * over the supplied predictors. Honours predictor kinds:
 *
 *   - continuous  → linear (always), squared (degree ≥ 2), cubed (degree ≥ 3)
 *   - categorical → main effect only (the n − 1 indicators are handled by
 *                   compileModelSpec); no quadratic.
 *
 * Interactions are added at degree ≥ 2:
 *   - 2-way for every pair of predictors (cont × cont, cont × cat, cat × cat)
 *
 * At degree 3, mixed-power interactions (X²·Y, X·Y²) are added only between
 * pairs of *continuous* predictors, matching the behaviour of
 * `buildPolyDesignMatrix`. Three-way interactions are added between distinct
 * triples regardless of kind.
 *
 * Term ids follow the existing convention: `X`, `X²`, `X·Y`, `X²·Y`, etc.
 *
 * @param {Predictor[]} predictors - in display order
 * @param {1|2|3} degree
 * @returns {Term[]}
 */
export function generatePolynomialTerms(predictors, degree) {
  const terms = [];
  const ids = predictors.map(p => p.id);
  const isCat = (p) => p.kind === 'categorical';

  // Linear main effects (every predictor).
  for (const p of predictors) {
    terms.push({ id: p.id, factors: [{ id: p.id, degree: 1 }] });
  }

  if (degree >= 2) {
    // Squared main effects (continuous only).
    for (const p of predictors) {
      if (isCat(p)) continue;
      terms.push({ id: `${p.id}²`, factors: [{ id: p.id, degree: 2 }] });
    }
    // 2-way interactions, all pairs.
    for (let i = 0; i < predictors.length; i++) {
      for (let j = i + 1; j < predictors.length; j++) {
        terms.push({
          id: `${ids[i]}·${ids[j]}`,
          factors: [{ id: ids[i], degree: 1 }, { id: ids[j], degree: 1 }],
        });
      }
    }
  }

  if (degree >= 3) {
    // Cubic main effects (continuous only).
    for (const p of predictors) {
      if (isCat(p)) continue;
      terms.push({ id: `${p.id}³`, factors: [{ id: p.id, degree: 3 }] });
    }
    // X²·Y and X·Y² (continuous × continuous only — these powers are not
    // meaningful for categorical indicators).
    for (let i = 0; i < predictors.length; i++) {
      for (let j = i + 1; j < predictors.length; j++) {
        if (isCat(predictors[i]) || isCat(predictors[j])) continue;
        terms.push({
          id: `${ids[i]}²·${ids[j]}`,
          factors: [{ id: ids[i], degree: 2 }, { id: ids[j], degree: 1 }],
        });
        terms.push({
          id: `${ids[i]}·${ids[j]}²`,
          factors: [{ id: ids[i], degree: 1 }, { id: ids[j], degree: 2 }],
        });
      }
    }
    // 3-way interactions (distinct triples).
    for (let i = 0; i < predictors.length; i++) {
      for (let j = i + 1; j < predictors.length; j++) {
        for (let l = j + 1; l < predictors.length; l++) {
          terms.push({
            id: `${ids[i]}·${ids[j]}·${ids[l]}`,
            factors: [
              { id: ids[i], degree: 1 },
              { id: ids[j], degree: 1 },
              { id: ids[l], degree: 1 },
            ],
          });
        }
      }
    }
  }

  return terms;
}

// ── fitFromSpec: spec → fitted model with full diagnostics ─────────

/**
 * @typedef {object} BlockSummary
 * @property {string} id        Term id (or 'Intercept').
 * @property {number} df
 * @property {number} ss
 * @property {number} ms
 * @property {number} fStat
 * @property {number} pValue
 */

/**
 * @typedef {object} CoefDetail
 * @property {string} blockId   Term id this column belongs to.
 * @property {string} columnName
 * @property {number} coeff
 * @property {number} se
 * @property {number} t
 * @property {number} pval
 * @property {number} ciLow
 * @property {number} ciHigh
 */

/**
 * @typedef {object} FitFromSpecResult
 * @property {ModelSpec} spec
 * @property {BlockEntry[]} blockMap
 * @property {string[]} termNames
 * @property {OLSResult} ols
 * @property {BlockSummary[]} blocks      One entry per non-intercept block.
 * @property {CoefDetail[]} coefDetails   One entry per model-matrix column (excl. intercept).
 * @property {{ R2: number, adjR2: number, R2pred: number|null, PRESS: number|null,
 *             dw: number, sigma: number, fStat: number, fPValue: number,
 *             dfModel: number, dfError: number, n: number }} diagnostics
 * @property {(values: Record<string, number|string>) => number} predict
 * @property {string} equation
 */

/**
 * Fit a regression model described by a ModelSpec against data.
 *
 * Single source of truth — orchestrates compileModelSpec → olsRegression →
 * per-block Type-III SS → CIs (PRESS, Durbin-Watson when feasible).
 *
 * @param {ModelSpec} spec
 * @param {{ columns: Record<string, Array<number|string>>, y: number[] }} data
 * @param {object} [opts]
 * @param {number} [opts.confLevel=0.95]
 * @returns {FitFromSpecResult}
 */
export function fitFromSpec(spec, data, opts = {}) {
  const confLevel = opts.confLevel ?? 0.95;
  if (!Array.isArray(data.y)) throw new Error('fitFromSpec: data.y must be an array');

  const compiled = compileModelSpec(spec, data);
  const { X, blockMap, termNames } = compiled;
  const n = data.y.length;
  if (X.length !== n) throw new Error(`fitFromSpec: y length ${n} ≠ X rows ${X.length}`);

  const ols = olsRegression(X, data.y);
  if (!ols) throw new Error('fitFromSpec: model is rank-deficient (X\'X singular)');

  // Per-block Type-III SS — skip the intercept block, callers don't want an
  // ANOVA row for it.
  const blocks = [];
  for (const block of blockMap) {
    if (block.id === 'Intercept') continue;
    const bss = blockTypeIIISS(ols, block.columnIndices);
    blocks.push({
      id: block.id,
      df: bss.df,
      ss: bss.ss,
      ms: bss.ms,
      fStat: bss.fStat,
      pValue: bss.pValue,
    });
  }

  // Per-coef details — SE, t, p, CI.
  const tCrit = ols.dfError > 0 ? tInv((1 + confLevel) / 2, ols.dfError) : 0;
  const coefDetails = [];
  for (const block of blockMap) {
    if (block.id === 'Intercept') continue;
    block.columnIndices.forEach((colIdx, k) => {
      const se = ols.seBeta[colIdx];
      const t  = ols.tValues[colIdx];
      const p  = ols.pValues[colIdx];
      const b  = ols.beta[colIdx];
      coefDetails.push({
        blockId: block.id,
        columnName: block.columnNames[k],
        coeff: b, se, t, pval: p,
        ciLow:  b - tCrit * se,
        ciHigh: b + tCrit * se,
      });
    });
  }

  // PRESS / R²pred via leverage (h_ii). Falls back to null if X'X is singular,
  // which can't happen here because we already guarded above — but keep the
  // null path for callers that disable the diagnostic explicitly later.
  let PRESS = 0;
  for (let i = 0; i < n; i++) {
    let hii = 0;
    for (let a = 0; a < X[i].length; a++) {
      for (let b = 0; b < X[i].length; b++) {
        hii += X[i][a] * ols.XtXinv[a][b] * X[i][b];
      }
    }
    const denom = 1 - hii;
    PRESS += denom > 1e-12 ? (ols.residuals[i] / denom) ** 2 : 0;
  }
  const R2pred = ols.SST > 0 ? 1 - PRESS / ols.SST : 0;

  // Durbin-Watson — measures lag-1 autocorrelation in residuals.
  let dw = 0;
  if (ols.SSE > 0) {
    for (let i = 1; i < ols.residuals.length; i++) {
      dw += (ols.residuals[i] - ols.residuals[i - 1]) ** 2;
    }
    dw /= ols.SSE;
  }

  // Predict closure: takes an object { predictorId: value, ... } and returns ŷ.
  // For continuous predictors the value is a number; for categorical, a level
  // label. The closure builds a single-row spec evaluation by reusing the
  // compileModelSpec machinery on a 1-row dataset.
  const predict = (values) => {
    const oneRowColumns = {};
    for (const p of spec.predictors) {
      oneRowColumns[p.id] = [values[p.id]];
    }
    const onceCompiled = compileModelSpec(spec, { columns: oneRowColumns });
    const row = onceCompiled.X[0];
    let yHat = 0;
    for (let i = 0; i < row.length; i++) yHat += row[i] * ols.beta[i];
    return yHat;
  };

  // Equation string — collapses each block to a "+ β·name" or "+ β·col[level]"
  // line. Useful for the sticky panel and the help overlay.
  const f = (v) => (v == null || !isFinite(v)) ? '?' : v.toFixed(4);
  let equation = `ŷ = ${f(ols.beta[0])}`;
  for (const cd of coefDetails) {
    equation += ` ${cd.coeff >= 0 ? '+' : '−'} ${f(Math.abs(cd.coeff))}·${cd.columnName}`;
  }

  return {
    spec,
    blockMap,
    termNames,
    ols,
    blocks,
    coefDetails,
    diagnostics: {
      R2: ols.rSquared,
      adjR2: ols.rSquaredAdj,
      R2pred,
      PRESS,
      dw,
      sigma: ols.sigma,
      fStat: ols.fStatistic,
      fPValue: ols.fPValue,
      dfModel: ols.dfModel,
      dfError: ols.dfError,
      n,
    },
    predict,
    equation,
  };
}

// ── Re-exported distribution functions (from math-utils.js) ─────

export { normalCDF, erfc, normalQuantile };
export { fCDF as fDistCDF, fQuantile as fDistQuantile, tCDF as tDistCDF, tPValue as tDistPValue };

// ── Normal order statistics ────────────────────────────────────────

/**
 * Compute expected normal order statistics for a normal probability plot.
 * Uses the Blom approximation: Φ⁻¹((i - 3/8) / (n + 1/4))
 *
 * @param {number} n - Number of observations
 * @returns {number[]} Expected z-scores (sorted)
 */
export function normalOrderStatistics(n) {
  const result = [];
  for (let i = 1; i <= n; i++) {
    const p = (i - 0.375) / (n + 0.25);
    result.push(normalQuantile(p));
  }
  return result;
}

// ── Single-X regression models (non-linear transforms) ──────────────

/**
 * Simple linear regression: y = a + bx (used internally for linearized models)
 * @param {Array<{x:number,y:number}>} data
 * @returns {{ coeffs: number[], predict: function(number): number, terms: string[], p: number, type: string }}
 */
function linearRegression(data) {
  const xs = data.map(d => d.x), ys = data.map(d => d.y);
  const mx = mean(xs), my = mean(ys);
  const ssxy = sum(data.map(d => (d.x - mx) * (d.y - my)));
  const ssxx = sum(xs.map(x => (x - mx) ** 2));
  const b = ssxy / ssxx;
  const a = my - b * mx;
  return { coeffs: [a, b], predict: x => a + b * x, terms: ['Intercept', 'x'], p: 2, type: 'linear' };
}

/**
 * Exponential regression: y = a · e^(bx)
 * @param {Array<{x:number,y:number}>} data
 */
function exponentialRegression(data) {
  const filtered = data.filter(d => d.y > 0);
  const logData = filtered.map(d => ({ x: d.x, y: Math.log(d.y) }));
  const lr = linearRegression(logData);
  const a = Math.exp(lr.coeffs[0]), b = lr.coeffs[1];
  return {
    coeffs: [a, b],
    predict: x => a * Math.exp(b * x),
    terms: ['a', 'b'],
    p: 2,
    type: 'exponential',
    transformedData: filtered,
  };
}

/**
 * Logarithmic regression: y = a + b·ln(x)
 * @param {Array<{x:number,y:number}>} data
 */
function logarithmicRegression(data) {
  const filtered = data.filter(d => d.x > 0);
  const logData = filtered.map(d => ({ x: Math.log(d.x), y: d.y }));
  const lr = linearRegression(logData);
  const a = lr.coeffs[0], b = lr.coeffs[1];
  return {
    coeffs: [a, b],
    predict: x => a + b * Math.log(x),
    terms: ['Intercept', 'ln(x)'],
    p: 2,
    type: 'logarithmic',
    transformedData: filtered,
  };
}

/**
 * Power regression: y = a · x^b
 * @param {Array<{x:number,y:number}>} data
 */
function powerRegression(data) {
  const filtered = data.filter(d => d.x > 0 && d.y > 0);
  const logData = filtered.map(d => ({ x: Math.log(d.x), y: Math.log(d.y) }));
  const lr = linearRegression(logData);
  const a = Math.exp(lr.coeffs[0]), b = lr.coeffs[1];
  return {
    coeffs: [a, b],
    predict: x => a * Math.pow(x, b),
    terms: ['a', 'b'],
    p: 2,
    type: 'power',
    transformedData: filtered,
  };
}

// ── Shared analysis logic ───────────────────────────────────────────

/**
 * Compute ANOVA, R², coefficient details, Durbin-Watson from a design matrix and results.
 * @param {number[][]} X — design matrix (n × p)
 * @param {number[]} ys — response values
 * @param {number[]} coeffs — fitted coefficients
 * @param {string[]} terms — term labels
 * @param {number} confLevel
 * @returns {Object} analysis results
 */
function analyzeModel(X, ys, coeffs, terms, confLevel) {
  const n = ys.length;
  const p = terms.length;

  const yHat = X.map(row => sum(row.map((v, j) => v * coeffs[j])));
  const residuals = ys.map((y, i) => y - yHat[i]);
  const yMean = mean(ys);

  const SST = sum(ys.map(y => (y - yMean) ** 2));
  const SSE = sum(residuals.map(r => r ** 2));
  const SSR = SST - SSE;
  const dfReg = p - 1;
  const dfRes = n - p;
  const dfTot = n - 1;
  const MSR = dfReg > 0 ? SSR / dfReg : 0;
  const MSE = dfRes > 0 ? SSE / dfRes : 0;
  const Fstat = MSE > 0 ? MSR / MSE : 0;
  const R2 = SST > 0 ? 1 - SSE / SST : 0;
  const adjR2 = (n - p) > 0 ? 1 - (1 - R2) * (n - 1) / (n - p) : 0;
  const Se = Math.sqrt(MSE);
  const fPVal = dfReg > 0 && MSE > 0 ? fPValue(Fstat, dfReg, dfRes) : 1;

  // Coefficient details (SE, t, p, CI)
  const XtX = Array.from({ length: p }, () => Array(p).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < p; j++) {
      for (let k = 0; k < p; k++) {
        XtX[j][k] += X[i][j] * X[i][k];
      }
    }
  }
  const invXtX = matInverse(XtX);
  const tCrit = dfRes > 0 ? tInv((1 + confLevel) / 2, dfRes) : 0;
  const coefDetails = [];
  for (let j = 0; j < p; j++) {
    if (invXtX) {
      const se = Math.sqrt(MSE * Math.abs(invXtX[j][j]));
      const tVal = se > 0 ? coeffs[j] / se : (coeffs[j] !== 0 ? (coeffs[j] > 0 ? Infinity : -Infinity) : 0);
      const pval = se > 0 ? tPValue(tVal, dfRes) : (coeffs[j] !== 0 ? 0 : 1);
      coefDetails.push({
        term: terms[j],
        coeff: coeffs[j],
        se,
        t: tVal,
        pval,
        ciLow: coeffs[j] - tCrit * se,
        ciHigh: coeffs[j] + tCrit * se,
      });
    } else {
      coefDetails.push({
        term: terms[j],
        coeff: coeffs[j],
        se: null, t: null, pval: null, ciLow: null, ciHigh: null,
      });
    }
  }

  // Durbin-Watson
  let dw = 0;
  if (SSE > 0) {
    for (let i = 1; i < residuals.length; i++) {
      dw += (residuals[i] - residuals[i - 1]) ** 2;
    }
    dw /= SSE;
  }

  // PRESS / R²(pred) — leave-one-out via hat matrix diagonal hᵢᵢ = xᵢ'(X'X)⁻¹xᵢ
  let PRESS = null;
  let R2pred = null;
  if (invXtX) {
    PRESS = 0;
    for (let i = 0; i < n; i++) {
      let hii = 0;
      for (let j = 0; j < p; j++) {
        for (let k = 0; k < p; k++) {
          hii += X[i][j] * invXtX[j][k] * X[i][k];
        }
      }
      const denom = 1 - hii;
      PRESS += denom > 1e-12 ? (residuals[i] / denom) ** 2 : 0;
    }
    R2pred = SST > 0 ? 1 - PRESS / SST : 0;
  }

  return {
    n, p: terms.length, residuals, yHat,
    SST, SSR, SSE, dfReg, dfRes, dfTot, MSR, MSE, Fstat,
    R2, adjR2, R2pred, PRESS, Se, fPVal, dw, confLevel, coefDetails, invXtX,
  };
}

// ── Design matrix row builder ──────────────────────────────────────

/**
 * Build a full design-matrix row for given x values, degree, and k predictors.
 * Mirrors the column order of buildPolyDesignMatrix.
 * @param {number[]} xVals — one value per X variable (length k)
 * @param {number} k — number of X variables
 * @param {number} degree — polynomial degree (1, 2, or 3)
 * @returns {number[]} — full row vector
 */
function buildFullRow(xVals, k, degree) {
  const row = [1];
  for (let i = 0; i < k; i++) row.push(xVals[i]);
  if (degree >= 2) {
    for (let i = 0; i < k; i++) row.push(xVals[i] ** 2);
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) row.push(xVals[i] * xVals[j]);
    }
  }
  if (degree >= 3) {
    for (let i = 0; i < k; i++) row.push(xVals[i] ** 3);
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        row.push(xVals[i] ** 2 * xVals[j]);
        row.push(xVals[i] * xVals[j] ** 2);
      }
    }
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        for (let l = j + 1; l < k; l++) {
          row.push(xVals[i] * xVals[j] * xVals[l]);
        }
      }
    }
  }
  return row;
}

// ── Public API: Polynomial multi-X regression ───────────────────────

/**
 * Run a polynomial regression with one or more X variables.
 * Builds a full model with main effects, polynomial terms, and interactions.
 *
 * @param {number[][]} xColumns — array of X column arrays (each length n)
 * @param {number[]} yValues — Y values (length n)
 * @param {number} degree — polynomial degree (1, 2, or 3)
 * @param {number} confLevel — confidence level (0.90, 0.95, 0.99)
 * @param {string[]} xNames — display names for each X column
 * @returns {RegressionResult}
 */
export function runMultiRegression(xColumns, yValues, degree, confLevel, xNames, excludeTerms = []) {
  const k = xColumns.length;
  const n = yValues.length;

  // Filter rows where all X and Y are finite
  const validRows = [];
  for (let i = 0; i < n; i++) {
    const y = yValues[i];
    if (y == null || !isFinite(y)) continue;
    let allOk = true;
    for (let j = 0; j < k; j++) {
      const v = xColumns[j]?.[i];
      if (v == null || !isFinite(v)) { allOk = false; break; }
    }
    if (allOk) validRows.push(i);
  }

  if (validRows.length < 3) throw new Error('MIN_DATA');

  const filteredX = xColumns.map(col => validRows.map(i => col[i]));
  const filteredY = validRows.map(i => yValues[i]);

  const { X: fullX, terms: allTerms } = buildPolyDesignMatrix(filteredX, degree, xNames);

  // Determine which term indices to keep (exclude requested terms, never exclude Intercept)
  let keepIndices;
  if (excludeTerms.length > 0) {
    keepIndices = [];
    for (let i = 0; i < allTerms.length; i++) {
      if (!excludeTerms.includes(allTerms[i])) keepIndices.push(i);
    }
  } else {
    keepIndices = allTerms.map((_, i) => i);
  }

  const terms = keepIndices.map(i => allTerms[i]);
  const X = fullX.map(row => keepIndices.map(i => row[i]));
  const p = terms.length;

  if (validRows.length <= p) throw new Error('INSUFFICIENT_DF');

  const coeffs = solveNormalEquations(X, filteredY);
  const analysis = analyzeModel(X, filteredY, coeffs, terms, confLevel);

  // Build equation string
  const f = (v) => (v == null || !isFinite(v)) ? '?' : v.toFixed(4);
  let equation = `ŷ = ${f(coeffs[0])}`;
  for (let j = 1; j < terms.length; j++) {
    const c = coeffs[j];
    equation += ` ${c >= 0 ? '+' : '−'} ${f(Math.abs(c))}·${terms[j]}`;
  }

  // Build predict function (uses keepIndices to select from full row)
  const predict = (xVals) => {
    const fullRow = buildFullRow(xVals, k, degree);
    const row = keepIndices.map(i => fullRow[i]);
    return sum(row.map((v, idx) => v * coeffs[idx]));
  };

  return {
    type: 'polynomial',
    degree,
    multiX: true,
    xNames,
    xCount: k,
    allTerms,
    keepIndices,
    excludeTerms: [...excludeTerms],
    reg: { coeffs, predict, terms, p: terms.length, type: 'polynomial' },
    ys: filteredY,
    xMatrix: filteredX,
    equation,
    ...analysis,
  };
}

// ── Public API: Single-X regression (exp, log, power) ───────────────

/**
 * Run a single-X regression analysis (exponential, logarithmic, power).
 * @param {number[]} xValues
 * @param {number[]} yValues
 * @param {string} type — 'exponential'|'logarithmic'|'power'
 * @param {number} confLevel
 * @returns {RegressionResult}
 */
export function runRegression(xValues, yValues, type, confLevel) {
  const len = Math.min(xValues.length, yValues.length);
  const data = [];
  for (let i = 0; i < len; i++) {
    const x = xValues[i], y = yValues[i];
    if (x != null && y != null && isFinite(x) && isFinite(y)) {
      data.push({ x, y });
    }
  }

  if (data.length < 3) throw new Error('MIN_DATA');

  let reg;
  switch (type) {
    case 'exponential': reg = exponentialRegression(data); break;
    case 'logarithmic': reg = logarithmicRegression(data); break;
    case 'power':       reg = powerRegression(data); break;
    default: throw new Error('UNKNOWN_TYPE');
  }

  const useData = reg.transformedData || data;
  const n = useData.length;
  const p = reg.p;

  if (n <= p) throw new Error('INSUFFICIENT_DF');

  const xs = useData.map(d => d.x);
  const ys = useData.map(d => d.y);
  const yHat = useData.map(d => reg.predict(d.x));
  const residuals = ys.map((y, i) => y - yHat[i]);
  const yMean = mean(ys);

  const SST = sum(ys.map(y => (y - yMean) ** 2));
  const SSE = sum(residuals.map(r => r ** 2));
  const SSR = SST - SSE;
  const dfReg = p - 1;
  const dfRes = n - p;
  const dfTot = n - 1;
  const MSR = dfReg > 0 ? SSR / dfReg : 0;
  const MSE = dfRes > 0 ? SSE / dfRes : 0;
  const Fstat = MSE > 0 ? MSR / MSE : 0;
  const R2 = SST > 0 ? 1 - SSE / SST : 0;
  const adjR2 = (n - p) > 0 ? 1 - (1 - R2) * (n - 1) / (n - p) : 0;
  const Se = Math.sqrt(MSE);
  const fPVal = dfReg > 0 && MSE > 0 ? fPValue(Fstat, dfReg, dfRes) : 1;

  // Coefficient details (no SE/t/p for non-linear transforms)
  const coefDetails = reg.terms.map((term, j) => ({
    term, coeff: reg.coeffs[j],
    se: null, t: null, pval: null, ciLow: null, ciHigh: null,
  }));

  // Durbin-Watson
  let dw = 0;
  if (SSE > 0) {
    for (let i = 1; i < residuals.length; i++) {
      dw += (residuals[i] - residuals[i - 1]) ** 2;
    }
    dw /= SSE;
  }

  const equation = buildEquation(type, reg.coeffs);

  return {
    type, multiX: false, reg, n, p, residuals, yHat, xs, ys,
    SST, SSR, SSE, dfReg, dfRes, dfTot, MSR, MSE, Fstat,
    R2, adjR2, Se, fPVal, dw, confLevel, coefDetails, equation,
  };
}

/**
 * Build display equation string for single-X non-linear types.
 * @param {string} type
 * @param {number[]} coeffs
 * @returns {string}
 */
function buildEquation(type, coeffs) {
  const f = (v) => (v == null || !isFinite(v)) ? '?' : v.toFixed(4);
  switch (type) {
    case 'exponential':
      return `ŷ = ${f(coeffs[0])} · e^(${f(coeffs[1])}·x)`;
    case 'logarithmic':
      return `ŷ = ${f(coeffs[0])} + ${f(coeffs[1])}·ln(x)`;
    case 'power':
      return `ŷ = ${f(coeffs[0])} · x^${f(coeffs[1])}`;
    default:
      return '';
  }
}

// ── Prediction helpers ──────────────────────────────────────────────

/**
 * Predict Y for given X values (multi-X polynomial), with prediction interval.
 * @param {Object} result — runMultiRegression result
 * @param {number[]} xVals — one value per X variable
 * @returns {{ yHat: number, piLow: number|null, piHigh: number|null }}
 */
export function predictMulti(result, xVals) {
  const yVal = result.reg.predict(xVals);
  if (!result.invXtX) return { yHat: yVal, piLow: null, piHigh: null };

  // Build full x0 row, then filter to kept terms
  const fullX0 = buildFullRow(xVals, result.xCount, result.degree);
  const x0 = result.keepIndices ? result.keepIndices.map(i => fullX0[i]) : fullX0;

  // hii = x0' (X'X)^-1 x0
  const inv = result.invXtX;
  let hii = 0;
  for (let a = 0; a < x0.length; a++) {
    for (let b = 0; b < x0.length; b++) {
      hii += x0[a] * inv[a][b] * x0[b];
    }
  }

  const tCrit = tInv((1 + result.confLevel) / 2, result.dfRes);
  const sePred = result.Se * Math.sqrt(1 + hii);
  return { yHat: yVal, piLow: yVal - tCrit * sePred, piHigh: yVal + tCrit * sePred };
}

/**
 * Predict Y for a single X value (exponential/logarithmic/power — no PI).
 * @param {Object} result — runRegression result
 * @param {number} xVal
 * @returns {{ yHat: number, piLow: number|null, piHigh: number|null }}
 */
export function predictValue(result, xVal) {
  const yVal = result.reg.predict(xVal);
  return { yHat: yVal, piLow: null, piHigh: null };
}

/**
 * Compute confidence band for polynomial regression (single-X only).
 * @param {Object} result — runMultiRegression result with xCount === 1
 * @param {number} xVal
 * @returns {{ upper: number, lower: number }|null}
 */
export function confidenceBand(result, xVal) {
  return _polyBand(result, xVal, false);
}

/**
 * Compute prediction band for polynomial regression (single-X only).
 * Uses sqrt(1 + hii) — covers the variance of a single new observation,
 * always wider than the confidence band (which uses sqrt(hii)).
 * @param {Object} result — runMultiRegression result with xCount === 1
 * @param {number} xVal
 * @returns {{ upper: number, lower: number }|null}
 */
export function predictionBand(result, xVal) {
  return _polyBand(result, xVal, true);
}

function _polyBand(result, xVal, isPrediction) {
  if (!result.multiX || result.xCount !== 1 || !result.invXtX) return null;

  const fullX0 = [1, xVal];
  if (result.degree >= 2) fullX0.push(xVal ** 2);
  if (result.degree >= 3) fullX0.push(xVal ** 3);
  const x0 = result.keepIndices ? result.keepIndices.map(i => fullX0[i]) : fullX0;

  const inv = result.invXtX;
  let hii = 0;
  for (let a = 0; a < x0.length; a++) {
    for (let b = 0; b < x0.length; b++) {
      hii += x0[a] * inv[a][b] * x0[b];
    }
  }

  const tCrit = tInv((1 + result.confLevel) / 2, result.dfRes);
  const se = result.Se * Math.sqrt(isPrediction ? 1 + hii : hii);
  const yVal = result.reg.predict([xVal]);
  return { upper: yVal + tCrit * se, lower: yVal - tCrit * se };
}

/**
 * Generate regression curve points for plotting (single-X polynomial only).
 * @param {Object} result
 * @param {number} steps
 * @returns {Array<{x:number, y:number}>}
 */
export function regressionCurvePoints(result, steps = 200) {
  if (result.multiX && result.xCount === 1) {
    const xs = result.xMatrix[0];
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const margin = (xMax - xMin) * 0.05;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const x = (xMin - margin) + (xMax - xMin + 2 * margin) * i / steps;
      const y = result.reg.predict([x]);
      if (isFinite(y)) pts.push({ x, y });
    }
    return pts;
  }
  if (!result.multiX) {
    const xMin = Math.min(...result.xs);
    const xMax = Math.max(...result.xs);
    const margin = (xMax - xMin) * 0.05;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const x = (xMin - margin) + (xMax - xMin + 2 * margin) * i / steps;
      const y = result.reg.predict(x);
      if (isFinite(y)) pts.push({ x, y });
    }
    return pts;
  }
  return [];
}

// normalQuantile is re-exported from math-utils.js above.

// ── VIF (Variance Inflation Factor) ────────────────────────────────

/**
 * Compute Variance Inflation Factor for each predictor in a multi-X model.
 * VIF_j = 1 / (1 - R²_j), where R²_j is the R² from regressing X_j on all other X variables.
 * Only meaningful for ≥ 2 predictors.
 *
 * @param {number[][]} xColumns — k arrays of raw x values (each length n)
 * @returns {number[]} — VIF for each predictor (length k)
 */
export function computeVIF(xColumns) {
  const k = xColumns.length;
  if (k < 2) return [1];

  const n = xColumns[0].length;
  const vifs = [];

  for (let j = 0; j < k; j++) {
    // Regress X_j on all other X columns
    const yj = xColumns[j];
    const otherCols = xColumns.filter((_, idx) => idx !== j);

    // Build design matrix [1, x_other1, x_other2, ...]
    const X = [];
    for (let i = 0; i < n; i++) {
      const row = [1];
      for (let m = 0; m < otherCols.length; m++) row.push(otherCols[m][i]);
      X.push(row);
    }

    const coeffs = solveNormalEquations(X, yj);
    const yHat = X.map(row => sum(row.map((v, idx) => v * coeffs[idx])));
    const yMean = mean(yj);
    const SST = sum(yj.map(y => (y - yMean) ** 2));
    const SSE = sum(yj.map((y, i) => (y - yHat[i]) ** 2));
    const R2j = SST > 0 ? 1 - SSE / SST : 0;

    vifs.push(R2j < 1 ? 1 / (1 - R2j) : Infinity);
  }

  return vifs;
}

/** Export helpers for testing and cross-module use */
export { mean, stddev, tInv, fPValue, tPValue, normalQuantile as normalInv };
