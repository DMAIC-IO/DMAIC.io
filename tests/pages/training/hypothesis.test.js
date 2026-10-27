/**
 * Hypothesis test helpers of lesson 5: z statistic, two-sided p, the
 * "as far out" check and the decision, plus seeded shares against theory.
 */
import { suite, test, assertClose, assertEqual, assertTrue } from '../../test-utils.js';
import { mulberry32 } from '../../../js/engines/random-variates-engine.js';
import { drawSample } from '../../../js/pages/training/processes.js';
import { zStatistic, twoSidedP, isAsFarOut, decide } from '../../../js/pages/training/hypothesis.js';

/** Share of seeded sample means under H₀ at least as far from 500 as `observed`. */
function farShare(observed, seed = 1, samples = 10000) {
  const rng = mulberry32(seed);
  let far = 0;
  for (let i = 0; i < samples; i++) {
    const values = drawSample('fill-a', 10, rng);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (isAsFarOut(mean, 500, observed)) far++;
  }
  return far / samples;
}

suite('hypothesis', () => {
  test('z and p match the reference table', () => {
    const rows = [[500.8, 1.2649, 0.2059], [501.2, 1.8974, 0.0578], [501.6, 2.5298, 0.0114]];
    for (const [mean, z, p] of rows) {
      const actual = zStatistic(mean, 500, 2, 10);
      assertClose(actual, z, 1e-3);
      assertClose(twoSidedP(actual), p, 5e-4);
    }
  });

  test('p is symmetric', () => {
    assertEqual(twoSidedP(-2.53), twoSidedP(2.53));
  });

  test('boundary counts as far out', () => {
    assertTrue(isAsFarOut(501.6, 500, 501.6));
    assertTrue(isAsFarOut(498.4, 500, 501.6));
    assertTrue(!isAsFarOut(501.59, 500, 501.6));
  });

  test('decision follows alpha', () => {
    assertEqual(decide(0.0578), 'keep');
    assertEqual(decide(0.0114), 'reject');
    assertEqual(decide(0.05), 'keep');
  });

  test('seeded shares match theory', () => {
    assertClose(farShare(500.8), 0.206, 0.012);
    assertClose(farShare(501.2), 0.058, 0.007);
    assertClose(farShare(501.6), 0.0114, 0.003);
  });
});
