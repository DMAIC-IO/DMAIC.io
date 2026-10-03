/**
 * Tests for js/ui/dmaic-tiles-layout.js — resolveCollapsed() menuMode override.
 * The width heuristic (estimateTilesWidth) was replaced by a real
 * scrollWidth/clientWidth measurement in dmaic-tiles.js — see
 * docs/superpowers/specs/2026-09-06-kachelreihe-messen-statt-schaetzen-design.md.
 */
import { suite, test, assertEqual } from '../test-utils.js';
import { resolveCollapsed, resolveTight, MIN_ACTIVE_NAME_PX } from '../../js/ui/dmaic-tiles-layout.js';

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

suite('dmaic-tiles-layout: tight tier', () => {
  test('resolveTight: false while the row is not collapsed', () => {
    assertEqual(resolveTight({ collapsed: false, nameRendered: 0, nameFull: 120 }), false);
  });

  test('resolveTight: false when the active name keeps the minimum width', () => {
    assertEqual(resolveTight({ collapsed: true, nameRendered: MIN_ACTIVE_NAME_PX, nameFull: 176 }), false);
  });

  test('resolveTight: true when the active name is squeezed below the minimum', () => {
    assertEqual(resolveTight({ collapsed: true, nameRendered: MIN_ACTIVE_NAME_PX - 1, nameFull: 176 }), true);
  });

  test('resolveTight: a short name shown in full is never squeezed', () => {
    assertEqual(resolveTight({ collapsed: true, nameRendered: 30, nameFull: 30 }), false);
  });
});
