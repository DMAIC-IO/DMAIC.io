/**
 * D.Mike — Matrix Utilities (matrix-utils.js)
 *
 * Generic dense-matrix helpers on `number[][]`. Extracted from
 * `regression-engine.js` so that engines which need plain linear algebra
 * (variance components, regression) share one implementation instead of
 * carrying a copy each.
 *
 * No DOM, no state — all functions are pure.
 */

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
