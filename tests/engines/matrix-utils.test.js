/**
 * D.Mike — Matrix Utility Tests
 *
 * Guards the generic matrix helpers extracted from `regression-engine.js`.
 */

import { suite, test, assertDeepEqual, assertAlmostEqual } from '../test-utils.js';
import {
  matTranspose, matMul, matTrace, matIdentity, matInverse,
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
