/**
 * D.Mike — Bonett variance tests: unit tests (white paper) and fixture validation.
 */

import { suite, test, assertAlmostEqual, assertEqual } from '../test-utils.js';
import { trimmedMean, bonettKurtosis, bonettRatioCI } from '../../js/engines/bonett-engine.js';

const Z975 = 1.959963984540054;

suite('Bonett — helpers', () => {
  test('trimmedMean trims floor(n·p) values per tail', () => {
    assertAlmostEqual(trimmedMean([1, 2, 3, 4, 5, 6, 7, 8, 9, 100], 1 / (2 * Math.sqrt(6))), 5.5, 1e-12);
  });
  test('bonettKurtosis uses the plain mean for n <= 5', () => {
    const x = [1, 2, 4, 7, 11], m = 5;
    const num = 5 * x.reduce((s, v) => s + (v - m) ** 4, 0);
    const den = x.reduce((s, v) => s + (v - m) ** 2, 0) ** 2;
    assertAlmostEqual(bonettKurtosis(x), num / den, 1e-12);
  });
});

suite('Bonett — ratio CI from summary statistics (Banga & Fox 2013)', () => {
  test('example 1: two roots, CI [0.253, 8.634]', () => {
    const r = bonettRatioCI({ n1: 10, n2: 12, var1: 1.150 ** 2, var2: 1.043 ** 2, kurt1: 2.704, kurt2: 3.671 }, Z975);
    assertEqual(r.roots.length, 2);
    assertAlmostEqual(r.roots[0], 0.200, { absolute: 0.0005 });
    assertAlmostEqual(r.roots[1], 6.824, { absolute: 0.002 });
    assertAlmostEqual(r.lower, 0.253, { absolute: 0.0005 });
    assertAlmostEqual(r.upper, 8.634, { absolute: 0.005 });
  });
  test('example 2: four roots, hull [0.001, 124.07]', () => {
    const r = bonettRatioCI({ n1: 169, n2: 7, var1: 301.855 ** 2, var2: 4606.170 ** 2, kurt1: 1.877, kurt2: 6.761 }, Z975);
    assertEqual(r.roots.length, 4);
    // Middle roots are ill-conditioned w.r.t. the paper's 3-decimal inputs (relative tolerance, ledgered ruling).
    assertAlmostEqual(r.roots[1], 3.282, { relative: 1e-2 });
    assertAlmostEqual(r.roots[2], 10.194, { relative: 1e-2 });
    assertAlmostEqual(r.roots[3], 39685.0, { relative: 1e-3 });
    assertAlmostEqual(r.upper, 124.072, { absolute: 0.05 });
  });
});
