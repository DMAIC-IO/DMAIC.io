/**
 * D.Mike — chart window for dashboard tiles (tile-chart-window.js)
 *
 * Cuts the control chart data of a tile to its last N points. Shared by the
 * SPC and the attribute SPC tile; key figures stay on all points, only the
 * picture is windowed. Tile contract: the lifecycle in js/pages/dashboard/tile-render.js.
 */

/**
 * Chart data for the last `lastN` points (0 = all): series and limit arrays
 * are cut, violation indices and the baseline end shifted into the window.
 * `xOffset` is the number of points cut off in front, so the chart keeps the
 * real sample numbers. `xMin`/`xMax` pin the x axis to the window (half a
 * step around the points); the 6 % default padding would widen it to the next
 * tick on a compact chart.
 * @param {{values: Array<number|null>, cl: any, ucl: any, lcl: any, sigma: any}} result - engine result
 * @param {Set<number>} violationIndices
 * @param {number|null} baselineEnd
 * @param {number} lastN
 * @returns {{values: Array<number|null>, cl: any, ucl: any, lcl: any, sigma: any, violationIndices: Set<number>, baselineEnd: number|null, xOffset: number, xMin: number, xMax: number}}
 */
export function windowed(result, violationIndices, baselineEnd, lastN) {
  const offset = lastN > 0 ? Math.max(0, result.values.length - lastN) : 0;
  const cut = (v) => (Array.isArray(v) ? v.slice(offset) : v);
  const shifted = new Set([...violationIndices].filter(i => i >= offset).map(i => i - offset));
  const end = baselineEnd != null && baselineEnd - offset > 0 ? baselineEnd - offset : null;
  return {
    values: cut(result.values), cl: cut(result.cl), ucl: cut(result.ucl), lcl: cut(result.lcl), sigma: cut(result.sigma),
    violationIndices: shifted, baselineEnd: end, xOffset: offset,
    xMin: offset + 0.5, xMax: result.values.length + 0.5,
  };
}
