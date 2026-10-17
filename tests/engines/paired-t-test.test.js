/**
 * D.Mike — Paired t-test engine: pairing and wrapper behaviour.
 * Reference values live in paired-t-test.fixtures.json (hypothesis-tests.test.js).
 */

import { suite, test, assertEqual, assertAlmostEqual, assertTrue, assertThrows } from '../test-utils.js';
import { pairDifferences, pairedTTest, oneSampleTTest } from '../../js/engines/hypothesis-test-engine.js';

const TOL = { relative: 1e-12, absolute: 1e-12 };

suite('Hypothesis — pairDifferences', () => {
  test('pairs complete rows and computes d = x1 − x2', () => {
    const p = pairDifferences([5, 7, 9], [4, 7, 10]);
    assertEqual(JSON.stringify(p.d), JSON.stringify([1, 0, -1]));
    assertEqual(p.dropped, 0);
  });

  test('drops a row with a gap in either column', () => {
    const p = pairDifferences([1, null, 3, 4], [1, 2, '', 5]);
    assertEqual(JSON.stringify(p.x1), JSON.stringify([1, 4]));
    assertEqual(JSON.stringify(p.x2), JSON.stringify([1, 5]));
    assertEqual(p.dropped, 2);
  });

  test('drops non-numbers and non-finite values', () => {
    const p = pairDifferences([1, 'a', NaN, Infinity, 5], [1, 2, 3, 4, 6]);
    assertEqual(JSON.stringify(p.d), JSON.stringify([0, -1]));
    assertEqual(p.dropped, 3);
  });

  test('surplus rows of the longer column count as dropped', () => {
    const p = pairDifferences([1, 2, 3, 4, 5], [1, 2, 3]);
    assertEqual(p.d.length, 3);
    assertEqual(p.dropped, 2);
  });

  test('handles empty or missing input', () => {
    const p = pairDifferences(undefined, [1, 2]);
    assertEqual(p.d.length, 0);
    assertEqual(p.dropped, 2);
  });
});

suite('Hypothesis — pairedTTest', () => {
  const x1 = [12.1, 11.8, 12.6, 12.0, 12.4, 11.9, 12.3, 12.2];
  const x2 = [11.7, 11.6, 12.0, 11.9, 11.8, 11.7, 12.1, 11.8];

  test('equals the one-sample t-test on the differences', () => {
    const d = x1.map((v, i) => v - x2[i]);
    const ref = oneSampleTTest(d, 0.1, 'greater', 0.05);
    const r = pairedTTest(x1, x2, 0.1, 'greater', 0.05);
    for (const k of ['statistic', 'pValue', 'df', 'mean', 'stddev', 'se']) {
      assertAlmostEqual(r[k], ref[k], TOL, k);
    }
    assertAlmostEqual(r.ci[0], ref.ci[0], TOL, 'ci lower');
    assertAlmostEqual(r.ci[1], ref.ci[1], TOL, 'ci upper');
    assertEqual(r.reject, ref.reject);
  });

  test('labels the result and reports both sample means', () => {
    const r = pairedTTest(x1, x2);
    assertEqual(r.testName, 'Paired t-Test');
    assertAlmostEqual(r.mean1, 12.1625, TOL, 'mean1');
    assertAlmostEqual(r.mean2, 11.825, TOL, 'mean2');
    assertAlmostEqual(r.meanDiff, r.mean, TOL, 'meanDiff');
    assertAlmostEqual(r.stddevDiff, r.stddev, TOL, 'stddevDiff');
    assertEqual(r.n, 8);
  });

  test('defaults to μ_d₀ = 0, two-sided', () => {
    const r = pairedTTest(x1, x2);
    assertEqual(r.direction, 'two-sided');
    assertTrue(r.statistic > 0, 'positive t for x1 > x2');
  });

  test('throws for unequal lengths', () => {
    assertThrows(() => pairedTTest([1, 2, 3], [1, 2]));
  });

  test('throws for fewer than 2 pairs', () => {
    assertThrows(() => pairedTTest([1], [2]));
  });
});
