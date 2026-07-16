/**
 * color-schemes.js — Shared sequential color ramps for heat/contour visuals.
 *
 * Each entry is a list of RGB anchor stops; `getColor(t, scheme)` does a
 * linear interpolation between adjacent stops for `t ∈ [0, 1]`.
 *
 * Used by:
 *   - js/core/chart/types/heatmap.js
 *   - js/modules/contour-plot/contour-plot-render.js
 */

export const COLOR_SCHEMES = {
  viridis:   [[68,1,84],[72,35,116],[64,67,135],[52,94,141],[33,145,140],[53,183,121],[143,215,68],[253,231,37]],
  plasma:    [[13,8,135],[84,2,163],[139,10,165],[185,50,137],[219,92,104],[244,136,73],[254,188,43],[240,249,33]],
  thermal:   [[4,35,100],[12,60,150],[30,100,200],[80,170,220],[180,220,180],[240,220,100],[240,160,50],[200,50,30],[140,10,10]],
  green:     [[5,30,15],[10,60,25],[15,95,40],[25,140,60],[50,180,80],[100,210,110],[160,230,160],[220,250,220]],
  grayscale: [[30,30,30],[60,60,60],[95,95,95],[130,130,130],[165,165,165],[195,195,195],[220,220,220],[245,245,245]],
};

function lerpColor(c1, c2, t) {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ];
}

/**
 * Sample a color from a scheme.
 * @param {number} t - Position 0..1 along the ramp
 * @param {string} scheme - Key into COLOR_SCHEMES (falls back to 'viridis')
 * @returns {[number,number,number]} RGB triplet, 0-255 per channel
 */
export function getColor(t, scheme) {
  const colors = COLOR_SCHEMES[scheme] || COLOR_SCHEMES.viridis;
  const tt = Math.max(0, Math.min(1, t));
  const idx = tt * (colors.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, colors.length - 1);
  return lerpColor(colors[lo], colors[hi], idx - lo);
}

/** Relative luminance (0..1) for picking readable text over a colored cell. */
export function rgbLuminance([r, g, b]) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
