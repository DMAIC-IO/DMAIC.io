import { suite, test, assertEqual } from '../test-utils.js';
import {
  LARGE_SAMPLE_N, isNormalByAD, meanRoute,
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
