/**
 * Tests for thinTickLabels in core/chart/chart-base.js
 */
import { suite, test, assertDeepEqual } from '../test-utils.js';
import { thinTickLabels } from '../../js/core/chart/chart-base.js';

suite('thinTickLabels', () => {
  test('no overlap keeps every label', () => {
    // 3 chars * 10 * 0.6 = 18 px wide, 100 px apart
    assertDeepEqual(thinTickLabels(['a01', 'a02', 'a03'], [0, 100, 200], { fontSize: 10 }), [0, 1, 2]);
  });

  test('overlap keeps every k-th label from index 0', () => {
    // 8 chars * 10 * 0.6 = 48 px wide; 30 px apart → k = 2 (60 px ≥ 48 + 4)
    const labels = ['01.01.25', '02.01.25', '03.01.25', '04.01.25', '05.01.25'];
    assertDeepEqual(thinTickLabels(labels, [0, 30, 60, 90, 120], { fontSize: 10 }), [0, 2, 4]);
  });

  test('picks the smallest sufficient k', () => {
    // 48 px wide, 20 px apart: k=2 → 40 (<52), k=3 → 60 (≥52)
    const labels = Array.from({ length: 7 }, () => '01.01.25');
    assertDeepEqual(thinTickLabels(labels, [0, 20, 40, 60, 80, 100, 120], { fontSize: 10 }), [0, 3, 6]);
  });

  test('respects minGap', () => {
    // 18 px wide, 20 px apart: default gap 4 → k=2; gap 0 → k=1
    assertDeepEqual(thinTickLabels(['a01', 'a02', 'a03'], [0, 20, 40], { fontSize: 10, minGap: 0 }), [0, 1, 2]);
    assertDeepEqual(thinTickLabels(['a01', 'a02', 'a03'], [0, 20, 40], { fontSize: 10 }), [0, 2]);
  });

  test('single and empty', () => {
    assertDeepEqual(thinTickLabels(['x'], [5], { fontSize: 10 }), [0]);
    assertDeepEqual(thinTickLabels([], [], { fontSize: 10 }), []);
  });
});
