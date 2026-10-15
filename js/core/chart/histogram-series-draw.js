/**
 * D.Mike — SVG drawing for the series path of the histogram chart type
 * (histogram-series-draw.js): overlapping bars on shared bins, per-series
 * normal curves, Pareto line with right %-axis, boxplot strip.
 * Stateless; the chart type passes scales, plot area and its uid.
 */

import { svgEl, resolveColor, dashArray, createPattern } from './chart-core.js';
import { seriesMoments } from './histogram-series.js';

/** Default pattern line colour of the series path (matches the old module look). */
const PATTERN_LINE = 'rgba(0,0,0,0.5)';
/** Sample points per normal curve. */
const CURVE_STEPS = 120;

/**
 * Draw the bars of every visible series on the shared bins.
 * @param {SVGGElement} group - clipped plot group
 * @param {SVGDefsElement} defs
 * @param {string|number} uid - chart-unique id part for pattern ids
 * @param {object[]} series - config.series
 * @param {{ bins: {xMin:number,xMax:number,count:number}[][] }} binData - from binAll
 * @param {Function} xScale
 * @param {Function} yScale
 * @param {number} barGap - px between neighbouring bars
 */
export function drawSeriesBars(group, defs, uid, series, binData, xScale, yScale, barGap) {
  const gap = Number.isFinite(barGap) ? Math.max(0, barGap) : 1;
  const y0 = yScale(0);
  series.forEach((s, si) => {
    if (s.visible === false) return;
    const bins = binData.bins[si] || [];
    const patId = s.pattern ? `hist-pat-${uid}-${si}` : null;
    if (patId) createPattern(defs, patId, { ...s, patternColor: s.patternColor || PATTERN_LINE });
    const bw = s.borderStyle === 'none' ? 0 : (s.borderWidth ?? 1);
    const da = dashArray(s.borderStyle, bw || 1);
    bins.forEach((b, bi) => {
      if (b.count <= 0) return;
      const x = xScale(b.xMin) + gap / 2;
      const w = Math.max(0, xScale(b.xMax) - xScale(b.xMin) - gap);
      const y = yScale(b.count);
      const attrs = {
        x, y, width: w, height: Math.max(0, y0 - y),
        fill: resolveColor(s.fillColor), stroke: resolveColor(s.borderColor), 'stroke-width': bw,
        'data-series': si, 'data-bin': bi,
      };
      if (da !== 'none') attrs['stroke-dasharray'] = da;
      svgEl('rect', attrs, group);
      if (patId) {
        svgEl('rect', {
          x, y, width: w, height: Math.max(0, y0 - y), fill: `url(#${patId})`,
          'pointer-events': 'none', 'data-pattern': '', 'data-series': si,
        }, group);
      }
    });
  });
}

/**
 * Peak height of a series' normal curve in count units.
 * @param {number[]} values
 * @param {number} binWidth
 * @returns {number} 0 when the standard deviation is 0
 */
export function normalPeak(values, binWidth) {
  const { n, sd } = seriesMoments(values);
  return sd > 0 ? (n * binWidth) / (sd * Math.sqrt(2 * Math.PI)) : 0;
}

/**
 * Draw one normal curve per visible series (scaled by n · binWidth).
 * @param {SVGGElement} group
 * @param {object[]} series
 * @param {number} binWidth
 * @param {Function} xScale
 * @param {Function} yScale
 * @param {number} xFrom - left end of the visible x range
 * @param {number} xTo - right end of the visible x range
 */
export function drawNormalCurves(group, series, binWidth, xScale, yScale, xFrom, xTo) {
  series.forEach((s, si) => {
    if (s.visible === false || s.showNormalCurve === false) return;
    const { n, mean, sd } = seriesMoments(s.values);
    if (n < 2 || !(sd > 0)) return;
    const scale = n * binWidth;
    let d = '';
    for (let i = 0; i <= CURVE_STEPS; i++) {
      const x = xFrom + ((xTo - xFrom) * i) / CURVE_STEPS;
      const z = (x - mean) / sd;
      const yv = scale * Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));
      d += `${i === 0 ? 'M' : 'L'}${xScale(x).toFixed(2)},${yScale(yv).toFixed(2)}`;
    }
    svgEl('path', {
      d, fill: 'none', stroke: resolveColor(s.borderColor), 'stroke-width': 2, 'data-normal': si,
    }, group);
  });
}
