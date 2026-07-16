/**
 * D.Mike — Factorial (factorial.js)
 * Shared integer factorial used by the calculator and the contour formula scope.
 */

/**
 * Factorial of a (rounded) number.
 * @param {number} n
 * @returns {number} n! — NaN for n<0, Infinity for n>170
 */
export function factorial(n) {
  const m = Math.round(n);
  if (m < 0) return NaN;
  if (m <= 1) return 1;
  if (m > 170) return Infinity;
  let r = 1;
  for (let i = 2; i <= m; i++) r *= i;
  return r;
}
