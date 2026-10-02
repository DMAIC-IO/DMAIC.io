/**
 * D.Mike — Matrix Utility Tests
 *
 * Guards the generic matrix helpers extracted from `regression-engine.js`.
 */

import { suite, test, assertEqual, assertDeepEqual, assertAlmostEqual } from '../test-utils.js';
import {
  matTranspose, matMul, matTrace, matIdentity, matInverse, matCholesky, matInverseSPD,
} from '../../js/engines/matrix-utils.js';

suite('Matrix utilities', () => {
  test('transposes a rectangular matrix', () => {
    assertDeepEqual(matTranspose([[1, 2, 3], [4, 5, 6]]), [[1, 4], [2, 5], [3, 6]]);
  });

  test('multiplies conformable matrices', () => {
    assertDeepEqual(matMul([[1, 2], [3, 4]], [[5, 6], [7, 8]]), [[19, 22], [43, 50]]);
  });

  test('sums the diagonal', () => {
    assertAlmostEqual(matTrace([[1, 9], [9, 4]]), 5, 1e-12);
  });

  test('builds an identity matrix', () => {
    assertDeepEqual(matIdentity(3), [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  });

  test('inverts a matrix so that A · A⁻¹ = I', () => {
    const A = [[4, 7], [2, 6]];
    const prod = matMul(A, matInverse(A));
    assertAlmostEqual(prod[0][0], 1, 1e-12);
    assertAlmostEqual(prod[0][1], 0, 1e-12);
    assertAlmostEqual(prod[1][0], 0, 1e-12);
    assertAlmostEqual(prod[1][1], 1, 1e-12);
  });
});

suite('Matrix utilities — symmetric positive definite', () => {
  test('Cholesky factor of a 2x2 SPD matrix', () => {
    const L = matCholesky([[4, 2], [2, 3]]);
    assertAlmostEqual(L[0][0], 2, 1e-15);
    assertAlmostEqual(L[0][1], 0, 1e-15);
    assertAlmostEqual(L[1][0], 1, 1e-15);
    assertAlmostEqual(L[1][1], Math.SQRT2, 1e-15);
  });

  test('a matrix that is not positive definite has no Cholesky factor', () => {
    assertEqual(matCholesky([[1, 2], [2, 1]]), null);
    assertEqual(matInverseSPD([[1, 2], [2, 1]]), null);
  });

  test('SPD inverse matches the Gauss-Jordan inverse', () => {
    const A = [[4, 1, 0.5], [1, 3, 0.2], [0.5, 0.2, 2]];
    const a = matInverseSPD(A);
    const b = matInverse(A);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) assertAlmostEqual(a[i][j], b[i][j], 1e-12);
    }
  });
});
