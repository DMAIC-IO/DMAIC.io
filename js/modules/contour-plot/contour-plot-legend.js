/**
 * D.Mike — Contour Plot: Legend model
 *
 * Pure colorbar-legend builder, extracted from contour-plot.js to break the
 * import cycle with contour-plot-render.js (which consumes it via _buildLegend).
 */

/**
 * Pure colorbar-legend builder. Mirrors the swatch math the imperative
 * `_buildLegend` used: up to 10 evenly-spaced steps across [zMin, zMax],
 * each step colored via `getColor(t, scheme)` and labelled `value.toFixed(1)`.
 *
 * @param {number} zMin Minimum z value.
 * @param {number} zMax Maximum z value.
 * @param {number} n Requested number of levels (capped at 10).
 * @param {string} scheme Color-scheme key passed through to `getColor`.
 * @param {(t:number, scheme:string)=>number[]} getColor Returns `[r,g,b]`.
 * @param {string} title Legend title text.
 * @returns {{title:string, items:{color:string, value:string}[]}}
 */
export function legendModel(zMin, zMax, n, scheme, getColor, title) {
  const steps = Math.min(n, 10);
  const items = [];
  for (let k = 0; k < steps; k++) {
    const t = steps === 1 ? 0 : k / (steps - 1);
    const v = zMin + t * (zMax - zMin);
    const c = getColor(t, scheme);
    items.push({ color: `rgb(${c[0]},${c[1]},${c[2]})`, value: v.toFixed(1) });
  }
  return { title, items };
}
