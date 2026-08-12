/**
 * dmaic-tiles-layout.js — pure collapse-decision helpers for the phase tiles.
 * No DOM, no side effects: given per-tile text and a text-measure function,
 * decide whether the tile bar must collapse inactive tiles to letter+progress.
 * Kept separate from dmaic-tiles.js so the heuristic is unit-testable with an
 * injected measure (no canvas/browser layout needed).
 */

/** Fixed per-tile chrome budget (px): segment paddings + divider + trigger. */
const PER_TILE_CHROME = 44;
/** Representative ZEG label used for width budgeting. */
const ZEG_SAMPLE = '100%';

/**
 * Estimated total width (px) if every tile were fully expanded.
 * @param {Array<{letter:string, name:string, hasZeg:boolean}>} tiles
 * @param {(text:string) => number} measure - text → px (e.g. canvas measureText)
 * @returns {number}
 */
export function estimateTilesWidth(tiles, measure) {
  return tiles.reduce((sum, t) => {
    const zeg = t.hasZeg ? measure(ZEG_SAMPLE) : 0;
    return sum + measure(t.letter) + measure(t.name) + zeg + PER_TILE_CHROME;
  }, 0);
}

/**
 * Decide the collapsed state. Config override wins over the heuristic.
 * @param {{est:number, budget:number, menuMode?:('auto'|'compact'|'full')}} args
 * @returns {boolean}
 */
export function resolveCollapsed({ est, budget, menuMode = 'auto' }) {
  if (menuMode === 'compact') return true;
  if (menuMode === 'full') return false;
  return est > budget;
}
