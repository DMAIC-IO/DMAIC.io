/**
 * Insight gates: when a gated insight block opens.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import {
  MIN_DRAWS_PER_N, emptyStepCounts, mergeCounts, isGateOpen, gateHint,
} from '../../../js/pages/training/gates.js';

const counts = (count, perN = {}) => ({ count, perN });

suite('gates', () => {
  test('minimum draws per n is 100', () => {
    assertEqual(MIN_DRAWS_PER_N, 100);
  });

  test('block without gate is open', () => {
    assertEqual(isGateOpen({ type: 'insight' }, emptyStepCounts()), true);
  });

  test('revealAfter counts draws', () => {
    const block = { revealAfter: 50 };
    assertEqual(isGateOpen(block, counts(49)), false);
    assertEqual(isGateOpen(block, counts(50)), true);
  });

  test('revealAfterN needs 100 draws per n', () => {
    const block = { revealAfterN: 3 };
    assertEqual(isGateOpen(block, counts(0, { skewed: { 2: 100, 5: 100, 30: 99 } })), false);
    assertEqual(isGateOpen(block, counts(0, { skewed: { 2: 100, 5: 100, 30: 100 } })), true);
  });

  test('revealAfterShapes needs several populations', () => {
    const block = { revealAfterShapes: 2, revealAfterN: 3 };
    const skewed = { 2: 100, 5: 100, 30: 100 };
    assertEqual(isGateOpen(block, counts(0, { skewed })), false);
    assertEqual(isGateOpen(block, counts(0, { skewed, uniform: { 2: 100, 5: 100, 30: 100 } })), true);
    assertEqual(isGateOpen(block, counts(0, { skewed, uniform: { 2: 100, 5: 100 } })), false);
  });

  test('all present conditions must hold', () => {
    const block = { revealAfter: 10, revealAfterN: 1 };
    assertEqual(isGateOpen(block, counts(5, { a: { 2: 100 } })), false);
    assertEqual(isGateOpen(block, counts(10, { a: { 2: 100 } })), true);
  });

  test('counts of another step do not open the gate', () => {
    const block = { revealAfter: 50 };
    const otherStep = counts(500);
    assertEqual(isGateOpen(block, otherStep), true);
    assertEqual(isGateOpen(block, emptyStepCounts()), false);
  });

  test('revealAfterValues counts values', () => {
    const block = { revealAfterValues: 100 };
    assertEqual(isGateOpen(block, counts(99)), false);
    assertEqual(isGateOpen(block, counts(100)), true);
  });

  test('revealAfterEach needs every reported process', () => {
    const block = { revealAfterEach: 100 };
    assertEqual(isGateOpen(block, counts(150, { a: { 1: 150 }, b: { 1: 0 } })), false);
    assertEqual(isGateOpen(block, counts(100, { a: { 1: 150 }, b: { 1: 100 } })), true);
    assertEqual(isGateOpen(block, counts(500, {})), false);
  });

  test('hints for value gates', () => {
    assertDeepEqual(gateHint({ revealAfterValues: 100 }), { key: 'course.insightLockedValues', params: { k: 100 } });
    assertDeepEqual(gateHint({ revealAfterEach: 100 }), { key: 'course.insightLockedEach', params: { k: 100 } });
  });

  test('revealAfterSamples counts samples', () => {
    const block = { revealAfterSamples: 5 };
    assertEqual(isGateOpen(block, counts(4)), false);
    assertEqual(isGateOpen(block, counts(5)), true);
  });

  test('hint for the sample gate', () => {
    assertDeepEqual(gateHint({ revealAfterSamples: 5 }), { key: 'course.insightLockedSamples', params: { k: 5 } });
  });

  test('mergeCounts keeps maxima', () => {
    const a = mergeCounts(emptyStepCounts(), { count: 80, perN: { skewed: { 2: 100, 5: 40 } } });
    const b = mergeCounts(a, { count: 60, perN: { skewed: { 2: 30, 5: 90 }, uniform: { 2: 10 } } });
    assertDeepEqual(b, { count: 80, perN: { skewed: { 2: 100, 5: 90 }, uniform: { 2: 10 } } });
    assertDeepEqual(emptyStepCounts(), { count: 0, perN: {} });
  });

  test('gateHint returns key and params per gate kind', () => {
    assertDeepEqual(gateHint({ revealAfter: 5 }), { key: 'course.insightLocked', params: {} });
    assertDeepEqual(gateHint({ revealAfterN: 3 }), { key: 'course.insightLockedN', params: { n: 3 } });
    assertDeepEqual(gateHint({ revealAfterShapes: 2, revealAfterN: 3 }),
      { key: 'course.insightLockedShapes', params: { shapes: 2, n: 3 } });
  });
  test('revealAfterSettings counts n and level independently', () => {
    const block = { revealAfterSettings: 2 };
    assertEqual(isGateOpen(block, counts(0, { 0.95: { 5: 100, 40: 100 }, 0.99: { 40: 100 } })), true);
    assertEqual(isGateOpen(block, counts(0, { 0.95: { 5: 100, 40: 100 } })), false);
    assertEqual(isGateOpen(block, counts(0, { 0.95: { 5: 100 }, 0.99: { 40: 99 } })), false);
    assertEqual(isGateOpen(block, emptyStepCounts()), false);
  });

  test('hint for the settings gate', () => {
    assertDeepEqual(gateHint({ revealAfterSettings: 2 }), { key: 'course.insightLockedSettings', params: { k: 2 } });
  });
});
