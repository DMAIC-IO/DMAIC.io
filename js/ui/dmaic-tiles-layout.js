/**
 * dmaic-tiles-layout.js — pure collapse-decision helper for the phase tiles.
 * No DOM, no side effects: the actual overflow check now happens in
 * dmaic-tiles.js via a real `scrollWidth`/`clientWidth` measurement (see
 * docs/superpowers/specs/2026-09-06-kachelreihe-messen-statt-schaetzen-design.md).
 * This module only keeps the `menuMode` override, which is a cycle config
 * decision, not a layout one.
 */

/**
 * Decide the collapsed state. Config override wins over the measurement.
 * @param {{overflows:boolean, menuMode?:('auto'|'compact'|'full')}} args
 * @returns {boolean}
 */
export function resolveCollapsed({ overflows, menuMode = 'auto' }) {
  if (menuMode === 'compact') return true;
  if (menuMode === 'full') return false;
  return overflows;
}

/**
 * Smallest width (px) the active tile's name may shrink to in the collapsed
 * row before the second tier kicks in.
 */
export const MIN_ACTIVE_NAME_PX = 40;

/**
 * Decide the second, tighter tier: collapsing alone was not enough and the
 * active name is squeezed below its readable minimum. A name shorter than the
 * minimum only counts when it is actually cut.
 * @param {{collapsed:boolean, nameRendered:number, nameFull:number}} args
 * @returns {boolean}
 */
export function resolveTight({ collapsed, nameRendered, nameFull }) {
  return collapsed && nameRendered < Math.min(nameFull, MIN_ACTIVE_NAME_PX);
}
