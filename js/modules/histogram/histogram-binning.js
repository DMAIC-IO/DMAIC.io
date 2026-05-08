/**
 * D.Mike — Histogram Binning Engine (histogram-binning.js)
 * Pure functions for bin computation, statistics, and bar patterns.
 */

import { niceNum, svgEl } from '../../core/chart/chart-core.js';

// ─── Binning Engine ─────────────────────────────────────────
export function autoBinCount(n) {
  return Math.max(3, Math.ceil(Math.log2(n) + 1));
}

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
      } else {
        if (v >= edge && v < upper) count++;
      }
    }
    bins.push({ xMin: edge, xMax: upper, count });
    edge = upper;
  }
  return bins;
}

export function globalRange(seriesData) {
  const allVals = [];
  seriesData.forEach(s => {
    if (s.visible === false) return;
    allVals.push(...s.values);
  });
  if (!allVals.length) return { min: 0, max: 1, count: 0 };
  return { min: Math.min(...allVals), max: Math.max(...allVals), count: allVals.length };
}

export function autoBinWidth(seriesData) {
  const range = globalRange(seriesData);
  if (range.count === 0) return 1;
  const nBins = autoBinCount(range.count);
  const raw = (range.max - range.min) / nBins;
  if (raw <= 0) return 1;
  return niceNum(raw, true);
}

export function binAll(seriesData, binWidth) {
  const range = globalRange(seriesData);
  if (range.count === 0) return { bins: [], globalMin: 0, globalMax: 1, binWidth: 1 };
  const bw = binWidth || autoBinWidth(seriesData);
  let gMin = Math.floor(range.min / bw) * bw;
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
export function percentile(sorted, p) {
  const n = sorted.length;
  const k = (p / 100) * (n - 1);
  const f = Math.floor(k);
  const c = k - f;
  if (f + 1 < n) return sorted[f] + c * (sorted[f + 1] - sorted[f]);
  return sorted[f];
}

// ─── Boxplot Stats ──────────────────────────────────────────
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
  return { min: s[0], max: s[n - 1], q1, median, q3, whiskerLo, whiskerHi, outliers, mean };
}

// ─── Pattern helper ─────────────────────────────────────────
export function createBarPattern(defs, id, s) {
  const size = 8;
  const pat = svgEl('pattern', {
    id, patternUnits: 'userSpaceOnUse', width: size, height: size,
  }, defs);
  const lineColor = s.patternColor || 'rgba(0,0,0,0.5)';
  const sw = s.patternSolidity ? s.patternSolidity * 2 : 0.8;
  switch (s.pattern) {
    case '/':  svgEl('line', { x1: 0, y1: size, x2: size, y2: 0, stroke: lineColor, 'stroke-width': sw }, pat); break;
    case '\\': svgEl('line', { x1: 0, y1: 0, x2: size, y2: size, stroke: lineColor, 'stroke-width': sw }, pat); break;
    case '-':  svgEl('line', { x1: 0, y1: size / 2, x2: size, y2: size / 2, stroke: lineColor, 'stroke-width': sw }, pat); break;
    case '|':  svgEl('line', { x1: size / 2, y1: 0, x2: size / 2, y2: size, stroke: lineColor, 'stroke-width': sw }, pat); break;
    case 'x':
      svgEl('line', { x1: 0, y1: size, x2: size, y2: 0, stroke: lineColor, 'stroke-width': sw }, pat);
      svgEl('line', { x1: 0, y1: 0, x2: size, y2: size, stroke: lineColor, 'stroke-width': sw }, pat);
      break;
    case '+':
      svgEl('line', { x1: 0, y1: size / 2, x2: size, y2: size / 2, stroke: lineColor, 'stroke-width': sw }, pat);
      svgEl('line', { x1: size / 2, y1: 0, x2: size / 2, y2: size, stroke: lineColor, 'stroke-width': sw }, pat);
      break;
    case '.':  svgEl('circle', { cx: size / 2, cy: size / 2, r: sw, fill: lineColor }, pat); break;
  }
}
