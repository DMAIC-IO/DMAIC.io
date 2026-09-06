/**
 * Tests for js/ui/dmaic-tiles-layout.js — resolveCollapsed() menuMode override.
 * The width heuristic (estimateTilesWidth) was replaced by a real
 * scrollWidth/clientWidth measurement in dmaic-tiles.js — see
 * docs/superpowers/specs/2026-09-06-kachelreihe-messen-statt-schaetzen-design.md.
 */
import { suite, test, assertEqual } from '../test-utils.js';
import { resolveCollapsed } from '../../js/ui/dmaic-tiles-layout.js';

suite('dmaic-tiles-layout', () => {
  test('resolveCollapsed auto: true when the row overflows', () => {
    assertEqual(resolveCollapsed({ overflows: true, menuMode: 'auto' }), true);
  });

  test('resolveCollapsed auto: false when the row fits', () => {
    assertEqual(resolveCollapsed({ overflows: false, menuMode: 'auto' }), false);
  });

  test('resolveCollapsed compact: always true, even when the row fits', () => {
    assertEqual(resolveCollapsed({ overflows: false, menuMode: 'compact' }), true);
  });

  test('resolveCollapsed full: always false, even when the row overflows', () => {
    assertEqual(resolveCollapsed({ overflows: true, menuMode: 'full' }), false);
  });

  test('resolveCollapsed defaults menuMode to auto', () => {
    assertEqual(resolveCollapsed({ overflows: true }), true);
  });
});
