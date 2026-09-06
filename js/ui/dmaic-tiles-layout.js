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
