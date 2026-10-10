/**
 * D.Mike — High-precision normal distribution (normal-precise.js)
 * Reference values: R 4.x pnorm / qnorm.
 */

import { suite, test, assertAlmostEqual, assertEqual, assertTrue } from '../test-utils.js';
import { normalCdfPrecise, normalQuantilePrecise } from '../../js/engines/normal-precise.js';

suite('normal-precise — normalQuantilePrecise (AS241, as R qnorm)', () => {
  const cases = [
    [0.975, 1.959963984540054],
    [0.3, -0.5244005127080407],
    [1e-10, -6.361340902404056],
    [0.5, 0],
  ];
  for (const [p, expected] of cases) {
    test(`qnorm(${p})`, () => {
      assertAlmostEqual(normalQuantilePrecise(p), expected, { absolute: 1e-15, relative: 1e-15 });
    });
  }
  test('boundaries and invalid input', () => {
    assertEqual(normalQuantilePrecise(0), -Infinity);
    assertEqual(normalQuantilePrecise(1), Infinity);
    assertTrue(Number.isNaN(normalQuantilePrecise(-0.1)));
    assertTrue(Number.isNaN(normalQuantilePrecise(1.1)));
    assertTrue(Number.isNaN(normalQuantilePrecise(NaN)));
  });
});

suite('normal-precise — normalCdfPrecise (Marsaglia 2004, as R pnorm)', () => {
  const cases = [
    [1.96, 0.9750021048517795],
    [-1, 0.15865525393145707],
    [-3, 0.0013498980316301],
    [0, 0.5],
  ];
  for (const [x, expected] of cases) {
    test(`pnorm(${x})`, () => {
      assertAlmostEqual(normalCdfPrecise(x), expected, 1e-15);
    });
  }
  test('tails, infinities and NaN', () => {
    assertEqual(normalCdfPrecise(-40), 0);
    assertEqual(normalCdfPrecise(40), 1);
    assertEqual(normalCdfPrecise(-Infinity), 0);
    assertEqual(normalCdfPrecise(Infinity), 1);
    assertTrue(Number.isNaN(normalCdfPrecise(NaN)));
  });
  test('round trip qnorm(pnorm(x)) on [-5, 5]', () => {
    for (let x = -5; x <= 5; x += 0.25) {
      assertAlmostEqual(normalQuantilePrecise(normalCdfPrecise(x)), x, 1e-9, `x = ${x}`);
    }
  });
});
