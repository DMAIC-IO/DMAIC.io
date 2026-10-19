import { suite, test, assertEqual } from '../test-utils.js';
import {
  LARGE_SAMPLE_N, isNormalByAD, meanRoute, isConstant, ciContains, varianceRoute,
} from '../../js/modules/hypothesis-test/hypothesis-test-routing.js';

// C1-017: normality is judged by Anderson-Darling alone; for means the
// parametric test is kept when every group has n >= LARGE_SAMPLE_N.

suite('Hypothesis Test Routing — isNormalByAD', () => {
  test('normal when the AD p-value is at least alpha', () => {
    assertEqual(isNormalByAD({ pValue: 0.05 }, 0.05), true);
    assertEqual(isNormalByAD({ pValue: 0.3 }, 0.05), true);
  });

  test('not normal when the AD p-value is below alpha', () => {
    assertEqual(isNormalByAD({ pValue: 0.049 }, 0.05), false);
  });
});

suite('Hypothesis Test Routing — meanRoute', () => {
  test('large-sample threshold is 20 per group', () => {
    assertEqual(LARGE_SAMPLE_N, 20);
  });

  test('parametric when all groups are normal, regardless of n', () => {
    assertEqual(meanRoute(true, [5, 8]), 'parametric');
  });

  test('rank test when a group is non-normal and some group has n < 20', () => {
    assertEqual(meanRoute(false, [25, 19]), 'rank');
    assertEqual(meanRoute(false, [10]), 'rank');
  });

  test('parametric (large n) when non-normal but every group has n >= 20', () => {
    assertEqual(meanRoute(false, [20, 31]), 'parametric-large-n');
    assertEqual(meanRoute(false, [20]), 'parametric-large-n');
  });
});

suite('Hypothesis Test Routing — isConstant', () => {
  test('exactly equal values are constant', () => {
    assertEqual(isConstant([0.4, 0.4, 0.4]), true);
    assertEqual(isConstant([0, 0, 0]), true);
  });

  test('a hand-typed constant shift is constant despite rounding noise', () => {
    // Each difference is 0.3 on paper but differs in the last bits
    const x1 = [5.2, 5.4, 5.1, 5.6, 10.3, 1.5];
    const x2 = [4.9, 5.1, 4.8, 5.3, 10, 1.2];
    const d = x1.map((v, i) => v - x2[i]);
    assertEqual(d.every(v => v === d[0]), false);
    assertEqual(isConstant(d), true);
  });

  test('a real spread is not constant', () => {
    assertEqual(isConstant([0.4, 0.2, 0.6]), false);
    assertEqual(isConstant([1e-6, 2e-6, 3e-6]), false);
  });
});

suite('Hypothesis Test Routing — ciContains', () => {
  test('true when the target lies inside the interval or on its edge', () => {
    assertEqual(ciContains([-0.2, 0.5], 0), true);
    assertEqual(ciContains([0, 0.5], 0), true);
  });

  test('false when the interval lies on one side of the target', () => {
    // One-sided test not rejected while the two-sided CI excludes μ₀
    assertEqual(ciContains([-0.9, -0.3], 0), false);
    assertEqual(ciContains([0.1, 0.6], 0), false);
  });

  test('false without an interval', () => {
    assertEqual(ciContains(null, 0), false);
  });
});

suite('Hypothesis routing — varianceRoute', () => {
  test('one sample, normal → chi2', () => assertEqual(varianceRoute('one', true), 'chi2'));
  test('one sample, non-normal → bonett1', () => assertEqual(varianceRoute('one', false), 'bonett1'));
  test('two samples, normal → ftest', () => assertEqual(varianceRoute('two', true), 'ftest'));
  test('two samples, non-normal → bonett2', () => assertEqual(varianceRoute('two', false), 'bonett2'));
});
