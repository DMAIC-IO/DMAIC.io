/**
 * D.Mike — Histogram series math (histogram-series.js)
 * Pure functions, no DOM: shared bins across several series, box statistics,
 * moments and Pareto cumulation. Used by the series path of types/histogram.js.
 */

import { niceNum } from './chart-core.js';

// ─── Binning Engine ─────────────────────────────────────────
/**
 * Sturges bin count with a floor of 3.
 * @param {number} n - number of values
 * @returns {number}
 */
export function autoBinCount(n) {
  return Math.max(3, Math.ceil(Math.log2(n) + 1));
}

/**
 * Count values into [edge, upper) bins; the last bin is closed.
 * @param {number[]} values
 * @param {number} globalMin
 * @param {number} globalMax
 * @param {number} binWidth
 * @returns {{xMin:number,xMax:number,count:number}[]}
 */
export function computeBins(values, globalMin, globalMax, binWidth) {
  const bins = [];
  let edge = globalMin;
  while (edge < globalMax - binWidth * 0.0001) {
    const upper = Math.min(edge + binWidth, globalMax);
    let count = 0;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (upper >= globalMax) {
        if (v >= edge && v <= upper) count++;
      } else if (v >= edge && v < upper) count++;
    }
    bins.push({ xMin: edge, xMax: upper, count });
    edge = upper;
  }
  return bins;
}

/**
 * Min, max and value count over all visible series.
 * @param {{values:number[],visible?:boolean}[]} seriesData
 * @returns {{min:number,max:number,count:number}}
 */
export function globalRange(seriesData) {
  const allVals = [];
  seriesData.forEach(s => {
    if (s.visible === false) return;
    allVals.push(...s.values);
  });
  if (!allVals.length) return { min: 0, max: 1, count: 0 };
  return { min: Math.min(...allVals), max: Math.max(...allVals), count: allVals.length };
}

/**
 * Nice automatic bin width over all visible series.
 * @param {{values:number[],visible?:boolean}[]} seriesData
 * @returns {number}
 */
export function autoBinWidth(seriesData) {
  const range = globalRange(seriesData);
  if (range.count === 0) return 1;
  const nBins = autoBinCount(range.count);
  const raw = (range.max - range.min) / nBins;
  if (raw <= 0) return 1;
  return niceNum(raw, true);
}

/**
 * Bin all series on one shared set of edges; hidden series yield [].
 * @param {{values:number[],visible?:boolean}[]} seriesData
 * @param {number|null} [binWidth] - automatic when falsy
 * @returns {{bins:{xMin:number,xMax:number,count:number}[][],globalMin:number,globalMax:number,binWidth:number}}
 */
export function binAll(seriesData, binWidth) {
  const range = globalRange(seriesData);
  if (range.count === 0) return { bins: [], globalMin: 0, globalMax: 1, binWidth: 1 };
  const bw = binWidth || autoBinWidth(seriesData);
  const gMin = Math.floor(range.min / bw) * bw;
  let gMax = Math.ceil(range.max / bw) * bw;
  if (gMax <= gMin) gMax = gMin + bw;
  const result = [];
  seriesData.forEach(s => {
    if (s.visible === false) { result.push([]); return; }
    result.push(computeBins(s.values, gMin, gMax, bw));
  });
  return { bins: result, globalMin: gMin, globalMax: gMax, binWidth: bw };
}

// ─── Statistics Engine ──────────────────────────────────────
/**
 * Linear-interpolated percentile of a sorted array.
 * @param {number[]} sorted
 * @param {number} p - 0..100
 * @returns {number}
 */
export function percentile(sorted, p) {
  const n = sorted.length;
  const k = (p / 100) * (n - 1);
  const f = Math.floor(k);
  const c = k - f;
  if (f + 1 < n) return sorted[f] + c * (sorted[f + 1] - sorted[f]);
  return sorted[f];
}

// ─── Boxplot Stats ──────────────────────────────────────────
/**
 * Box-plot statistics (1.5 IQR whiskers) of a value list.
 * @param {number[]} values
 * @returns {{min:number,max:number,q1:number,median:number,q3:number,whiskerLo:number,whiskerHi:number,outliers:number[],mean:number,n:number}|null}
 */
export function computeBoxStats(values) {
  if (!values || values.length === 0) return null;
  const s = values.slice().sort((a, b) => a - b);
  const n = s.length;
  const q1 = percentile(s, 25);
  const median = percentile(s, 50);
  const q3 = percentile(s, 75);
  const iqr = q3 - q1;
  const wLo = q1 - 1.5 * iqr;
  const wHi = q3 + 1.5 * iqr;
  let whiskerLo = s[0], whiskerHi = s[n - 1];
  for (let i = 0; i < n; i++) { if (s[i] >= wLo) { whiskerLo = s[i]; break; } }
  for (let i = n - 1; i >= 0; i--) { if (s[i] <= wHi) { whiskerHi = s[i]; break; } }
  const outliers = [];
  for (let i = 0; i < n; i++) {
    if (s[i] < whiskerLo || s[i] > whiskerHi) outliers.push(s[i]);
  }
  const mean = values.reduce((a, b) => a + b, 0) / n;
  return { min: s[0], max: s[n - 1], q1, median, q3, whiskerLo, whiskerHi, outliers, mean, n };
}

/**
 * Count, mean and sample standard deviation of a value list.
 * @param {number[]} values
 * @returns {{ n: number, mean: number, sd: number }} sd is 0 for fewer than two values
 */
export function seriesMoments(values) {
  const n = values ? values.length : 0;
  if (n === 0) return { n: 0, mean: 0, sd: 0 };
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / n;
  if (n < 2) return { n, mean, sd: 0 };
  let ss = 0;
  for (const v of values) ss += (v - mean) ** 2;
  return { n, mean, sd: Math.sqrt(ss / (n - 1)) };
}

/**
 * Cumulative percentage at the right edge of every bin.
 * @param {{ count: number }[]} bins
 * @returns {number[]} same length as bins; all 0 when the total count is 0
 */
export function cumulativePercent(bins) {
  let total = 0;
  for (const b of bins) total += b.count;
  let cum = 0;
  return bins.map((b) => {
    cum += b.count;
    return total > 0 ? (cum / total) * 100 : 0;
  });
}
