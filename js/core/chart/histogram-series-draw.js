/**
 * D.Mike — SVG drawing for the series path of the histogram chart type
 * (histogram-series-draw.js): overlapping bars on shared bins, per-series
 * normal curves, Pareto line with right %-axis, boxplot strip.
 * Stateless; the chart type passes scales, plot area and its uid.
 */

import { svgEl, svgText, resolveColor, dashArray, createPattern, formatNum } from './chart-core.js';
import { h } from '../dom.js';
import { seriesMoments } from './histogram-series.js';

/** Fallback pattern line colour when the theme variable is unavailable. */
const PATTERN_LINE_FALLBACK = 'rgba(0,0,0,0.5)';

/**
 * Default pattern line colour: the theme's secondary text colour, so the
 * pattern stays visible in dark mode (read at render time, like chart-base).
 * @returns {string}
 */
function patternLineColor() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--color-text-secondary').trim();
  return v || PATTERN_LINE_FALLBACK;
}
/** Width reserved right of the plot for the Pareto %-axis. */
export const PARETO_AXIS_W = 48;
/** Cumulative line colour, same as types/pareto.js. */
export const PARETO_COLOR = '#ef4444';
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
    if (patId) createPattern(defs, patId, { ...s, patternColor: s.patternColor || patternLineColor() });
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

/**
 * Tooltip body for bin `bi`: range, then count and share per visible series,
 * then the cumulative share when the Pareto line is shown.
 * @param {{ series: object[], binData: object, bi: number, locale: string,
 *           t: (key: string) => string, cumPct?: number|null }} p
 * @returns {HTMLElement}
 */
export function binTooltip({ series, binData, bi, locale, t, cumPct = null }) {
  const first = series.findIndex((s, si) => s.visible !== false && binData.bins[si][bi]);
  const ref = binData.bins[first][bi];
  const rows = [h('div', null, `${t('range')}: ${formatNum(ref.xMin, 2, locale)} – ${formatNum(ref.xMax, 2, locale)}`)];
  series.forEach((s, si) => {
    const bin = binData.bins[si][bi];
    if (s.visible === false || !bin) return;
    const total = binData.bins[si].reduce((a, b) => a + b.count, 0);
    const pct = total > 0 ? (bin.count / total) * 100 : 0;
    rows.push(h('div', null,
      h('b', { style: `color:${resolveColor(s.borderColor)}` }, s.name),
      `: ${bin.count} (${formatNum(pct, 1, locale)} %)`));
  });
  if (cumPct != null) rows.push(h('div', null, `${t('cumulative')}: ${formatNum(cumPct, 1, locale)} %`));
  return h('div', null, ...rows);
}

/**
 * Pareto overlay of one series: cumulative-% polyline with dots (in the
 * clipped plot group) and a right 0–100 % axis (in the svg).
 * @param {SVGSVGElement} svg
 * @param {SVGGElement} group
 * @param {{xMin:number,xMax:number}[]} bins
 * @param {number[]} cum - cumulativePercent(bins)
 * @param {Function} xScale
 * @param {{x:number,y:number,w:number,h:number}} pa
 * @param {{ color: string, label: string, tickSize: number }} o
 */
export function drawPareto(svg, group, bins, cum, xScale, pa, o) {
  const yPct = (p) => pa.y + pa.h - (p / 100) * pa.h;
  const pts = bins.map((b, i) => `${xScale(b.xMax).toFixed(2)},${yPct(cum[i]).toFixed(2)}`);
  if (bins.length) pts.unshift(`${xScale(bins[0].xMin).toFixed(2)},${yPct(0).toFixed(2)}`);
  svgEl('polyline', { points: pts.join(' '), fill: 'none', stroke: o.color, 'stroke-width': 2, 'data-pareto': '' }, group);
  bins.forEach((b, i) => {
    svgEl('circle', { cx: xScale(b.xMax), cy: yPct(cum[i]), r: 3, fill: o.color, 'data-pareto-dot': '' }, group);
  });
  const ax = pa.x + pa.w;
  svgEl('line', { x1: ax, y1: pa.y, x2: ax, y2: pa.y + pa.h, stroke: o.color, 'stroke-width': 1, 'data-pareto': '' }, svg);
  [0, 25, 50, 75, 100].forEach((p) => {
    const y = yPct(p);
    svgEl('line', { x1: ax, y1: y, x2: ax + 5, y2: y, stroke: o.color, 'stroke-width': 1 }, svg);
    svgText(`${p}%`, { x: ax + 8, y: y + 4, 'text-anchor': 'start', 'font-size': `${o.tickSize}px`, fill: o.color, 'data-pareto-tick': '' }, svg);
  });
  const lx = ax + PARETO_AXIS_W - 6;
  const ly = pa.y + pa.h / 2;
  svgText(o.label, {
    x: lx, y: ly, 'text-anchor': 'middle', 'font-size': `${o.tickSize}px`, fill: o.color,
    transform: `rotate(90, ${lx}, ${ly})`,
  }, svg);
}

/** Box height and gap of the boxplot strip in px. */
export const BOX_H = 22;
export const BOX_GAP = 6;

/**
 * Height of the boxplot strip for `rows` boxes.
 * @param {number} rows
 * @returns {number}
 */
export function stripHeight(rows) {
  return rows > 0 ? rows * (BOX_H + BOX_GAP) + BOX_GAP : 0;
}

/**
 * Boxplot strip below the plot: one horizontal box per row on the bars' x scale.
 * @param {SVGSVGElement} svg
 * @param {SVGDefsElement} defs
 * @param {string|number} uid
 * @param {{ si: number, series: object, stats: object }[]} rows
 * @param {Function} xScale
 * @param {{x:number,w:number}} pa
 * @param {number} top - y of the strip's upper edge
 */
export function drawBoxStrip(svg, defs, uid, rows, xScale, pa, top) {
  const clipId = `hist-strip-${uid}`;
  const clip = svgEl('clipPath', { id: clipId }, defs);
  svgEl('rect', { x: pa.x, y: top, width: pa.w, height: stripHeight(rows.length) }, clip);
  const g = svgEl('g', { 'clip-path': `url(#${clipId})`, 'data-box-strip': '' }, svg);
  rows.forEach(({ si, series, stats }, ri) => {
    const y = top + BOX_GAP + ri * (BOX_H + BOX_GAP);
    const cy = y + BOX_H / 2;
    const stroke = resolveColor(series.borderColor);
    const box = svgEl('g', { 'data-box': si }, g);
    const line = (x1, y1, x2, y2, extra = {}) => svgEl('line', { x1, y1, x2, y2, stroke, 'stroke-width': 1.5, ...extra }, box);
    line(xScale(stats.whiskerLo), cy, xScale(stats.q1), cy);
    line(xScale(stats.q3), cy, xScale(stats.whiskerHi), cy);
    line(xScale(stats.whiskerLo), y + 5, xScale(stats.whiskerLo), y + BOX_H - 5);
    line(xScale(stats.whiskerHi), y + 5, xScale(stats.whiskerHi), y + BOX_H - 5);
    const x1 = xScale(stats.q1);
    svgEl('rect', {
      x: x1, y, width: Math.max(1, xScale(stats.q3) - x1), height: BOX_H,
      fill: resolveColor(series.fillColor), 'fill-opacity': 0.35, stroke, 'stroke-width': 1.5, 'data-box-iqr': '',
    }, box);
    line(xScale(stats.median), y, xScale(stats.median), y + BOX_H, { 'stroke-width': 2.5, 'data-box-median': '' });
    const mx = xScale(stats.mean);
    svgEl('path', { d: `M${mx},${cy - 5}L${mx + 5},${cy}L${mx},${cy + 5}L${mx - 5},${cy}Z`, fill: stroke, 'data-box-mean': '' }, box);
    stats.outliers.forEach((v) => {
      svgEl('circle', { cx: xScale(v), cy, r: 2.5, fill: 'none', stroke, 'stroke-width': 1.2, 'data-box-outlier': '' }, box);
    });
  });
}

/**
 * Tooltip body of one box.
 * @param {{ series: object, stats: object, locale: string, t: (key: string) => string }} p
 * @returns {HTMLElement}
 */
export function boxTooltip({ series, stats, locale, t }) {
  const f = (v) => formatNum(v, 3, locale);
  const rows = [
    h('div', null, h('b', { style: `color:${resolveColor(series.borderColor)}` }, series.name)),
    h('div', null, `n = ${stats.n}`),
    h('div', null, `Min: ${f(stats.min)}`),
    h('div', null, `Q1: ${f(stats.q1)}`),
    h('div', null, `${t('median')}: ${f(stats.median)}`),
    h('div', null, `${t('mean')}: ${f(stats.mean)}`),
    h('div', null, `Q3: ${f(stats.q3)}`),
    h('div', null, `Max: ${f(stats.max)}`),
  ];
  if (stats.outliers.length) rows.push(h('div', null, `${t('outliers')}: ${stats.outliers.length}`));
  return h('div', null, ...rows);
}
