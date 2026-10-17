/**
 * D.Mike — High-precision normal distribution (normal-precise.js)
 * Reference values: R 4.x pnorm / qnorm.
 */

import { suite, test, assertAlmostEqual, assertEqual, assertTrue } from '../test-utils.js';
import { normalCdfPrecise, normalQuantilePrecise, normalUpperTailPrecise } from '../../js/engines/normal-precise.js';

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

suite('normal-precise — normalUpperTailPrecise (reference: scipy.stats.norm.sf)', () => {
  const cases = [
    [0, 0.5],
    [1, 0.15865525393145707],
    [2.9999, 0.001350341282954925],
    [3.0001, 0.0013494549132607172],
    [5, 2.866515718791933e-07],
    [10, 7.61985302416047e-24],
    [30, 4.906713927147908e-198],
    [-2, 0.9772498680518208],
  ];
  for (const [x, expected] of cases) {
    test(`sf(${x})`, () => {
      assertAlmostEqual(normalUpperTailPrecise(x), expected, { relative: 1e-12 });
    });
  }
  test('sf(-Infinity) = 1', () => {
    assertEqual(normalUpperTailPrecise(-Infinity), 1);
  });
  test('sf(NaN) = NaN', () => {
    assertTrue(Number.isNaN(normalUpperTailPrecise(NaN)));
  });
});
