/**
 * probability-plot.js — Normal Probability Plot (Wahrscheinlichkeitsnetz)
 * for the D.Mike chart framework.
 *
 * Plots ordered data against theoretical normal quantiles with a fitted
 * reference line through Q1/Q3. The Y-axis displays probability percentages
 * at standard normal quantile positions, matching traditional probability
 * paper.
 *
 * Supports multiple series in the same plot (e.g. one series per group
 * level). Each series gets its own markers and its own Q1/Q3 fit line.
 *
 * Config:
 *   series: [{ name, values, color, lineColor, markerSymbol, markerSize,
 *              markerStroke, markerStrokeWidth, visible }]
 *     — Preferred multi-series shape.
 *   data: number[]
 *     — Legacy single-series shape; synthesized into one series internally
 *       using markerColor / lineColor / markerSymbol / … from config.
 */

import ChartBase from '../chart-base.js';
import {
  svgEl, svgText, resolveColor, formatNum, getChartColors, drawMarker,
} from '../chart-core.js';

// ── Statistical helpers (self-contained) ────────────────────────

/**
 * Inverse normal (quantile) function — Beasley-Springer-Moro.
 * @param {number} p - Probability ∈ (0, 1)
 * @returns {number} z-value
 */
function normalQuantile(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  const a = [
    -3.969683028665376e+01, 2.209460984245205e+02,
    -2.759285104469687e+02, 1.383577518672690e+02,
    -3.066479806614716e+01, 2.506628277459239e+00,
  ];
  const b = [
    -5.447609879822406e+01, 1.615858368580409e+02,
    -1.556989798598866e+02, 6.680131188771972e+01,
    -1.328068155288572e+01,
  ];
  const c = [
    -7.784894002430293e-03, -3.223964580411365e-01,
    -2.400758277161838e+00, -2.549732539343734e+00,
    4.374664141464968e+00, 2.938163982698783e+00,
  ];
  const d = [
    7.784695709041462e-03, 3.224671290700398e-01,
    2.445134137142996e+00, 3.754408661907416e+00,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q, r;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
      / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
}

/**
 * Plotting positions using Blom's formula: (i - 3/8) / (n + 1/4).
 * @param {number} n - Sample size
 * @returns {number[]} Array of probabilities
 */
function blomPositions(n) {
  const pos = [];
  for (let i = 1; i <= n; i++) {
    pos.push((i - 0.375) / (n + 0.25));
  }
  return pos;
}

/** Probability-axis tick percentages for a normal probability plot. */
const PROB_TICKS = [1, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99];

export default class ProbabilityPlot extends ChartBase {
  /**
   * @param {HTMLElement} container
   * @param {Object} config
   * @param {Object} context
   */
  constructor(container, config, context) {
    const defaults = {
      data: [],
      series: null,
      markerColor: null,
      lineColor: null,
      markerSymbol: 'circle',
      markerSize: 8,
      markerStroke: null,
      markerStrokeWidth: 1,
      distribution: 'normal',
      showYTicks: false,  // suppress default linear Y ticks
    };
    super(container, Object.assign(defaults, config), context);
  }

  // ── Series normalization ───────────────────────────────────────

  /**
   * Resolve config.series — falls back to a single synthesized series
   * built from config.data when no explicit series array is provided.
   * Mutates config.series so editor/tooltip can read back the same shape.
   *
   * @returns {Array<Object>} non-empty series array (may still contain
   *   entries with fewer than 2 values; callers must skip those).
   */
  _resolveSeries() {
    const cfg = this.config;
    if (Array.isArray(cfg.series) && cfg.series.length > 0) {
      return cfg.series;
    }
    const syn = [{
      name: cfg.title || 'Data',
      values: Array.isArray(cfg.data) ? cfg.data : [],
      color: cfg.markerColor,
      lineColor: cfg.lineColor,
      markerSymbol: cfg.markerSymbol,
      markerSize: cfg.markerSize,
      markerStroke: cfg.markerStroke,
      markerStrokeWidth: cfg.markerStrokeWidth,
      visible: true,
    }];
    cfg.series = syn;
    return syn;
  }

  /** Series filtered to those with enough values to render (n ≥ 2). */
  _renderableSeries() {
    return this._resolveSeries().filter(
      s => s && s.visible !== false && Array.isArray(s.values) && s.values.length >= 2,
    );
  }

  /** Resolved fill / line color for a series, falling back through palette. */
  _seriesColors(s, idx) {
    const chartColors = getChartColors();
    const fallbackFill = chartColors[idx % chartColors.length] || 'var(--color-chart-1)';
    const fillColor = s.color || fallbackFill;
    const lineColor = s.lineColor || fillColor;
    return { fillColor, lineColor };
  }

  // ── Data Extent ────────────────────────────────────────────────

  /** @override */
  _getDataExtent() {
    const series = this._renderableSeries();
    if (series.length === 0) {
      return { xMin: -1, xMax: 1, yMin: -2.5, yMax: 2.5 };
    }

    let xMin = Infinity, xMax = -Infinity;
    let yMin = Infinity, yMax = -Infinity;

    for (const s of series) {
      const sorted = [...s.values].sort((a, b) => a - b);
      const n = sorted.length;
      const positions = blomPositions(n);
      if (sorted[0] < xMin) xMin = sorted[0];
      if (sorted[n - 1] > xMax) xMax = sorted[n - 1];
      const zLo = normalQuantile(positions[0]);
      const zHi = normalQuantile(positions[n - 1]);
      if (zLo < yMin) yMin = zLo;
      if (zHi > yMax) yMax = zHi;
    }

    return { xMin, xMax, yMin, yMax };
  }

  // ── Render Data ───────────────────────────────────────────────

  /** @override */
  _renderData(svg, plotGroup, xScale, yScale, xTick, yTick, plotArea, defs) {
    const series = this._renderableSeries();
    if (series.length === 0) return;

    // ── Custom probability Y-axis ticks & grid ──
    const styles = getComputedStyle(document.documentElement);
    const tickColor = styles.getPropertyValue('--color-text-secondary').trim() || '#5a6270';
    const gridColor = styles.getPropertyValue('--color-border').trim() || '#e0e0e0';

    for (const pct of PROB_TICKS) {
      const z = normalQuantile(pct / 100);
      const py = yScale(z);

      // Skip ticks outside the plot area
      if (py < plotArea.y - 1 || py > plotArea.y + plotArea.h + 1) continue;

      // Grid line
      svgEl('line', {
        x1: plotArea.x, y1: py,
        x2: plotArea.x + plotArea.w, y2: py,
        stroke: gridColor,
        'stroke-width': 0.5,
        'stroke-dasharray': '3,3',
        opacity: 0.4,
      }, plotGroup);

      // Tick mark (rendered outside clip, so add to svg directly)
      svgEl('line', {
        x1: plotArea.x - 5, y1: py,
        x2: plotArea.x, y2: py,
        stroke: tickColor, 'stroke-width': 1,
      }, svg);

      // Label
      svgText(`${pct}%`, {
        x: plotArea.x - 10, y: py + 4,
        'text-anchor': 'end',
        'font-size': `${this.config.tickSize}px`,
        fill: tickColor,
      }, svg);
    }

    // Persisted state used by tooltip
    this._seriesRender = [];

    const xExt = this._getDataExtent();
    const pad = (xExt.xMax - xExt.xMin) * 0.1 || 1;

    for (let sIdx = 0; sIdx < series.length; sIdx++) {
      const s = series[sIdx];
      const sorted = [...s.values].sort((a, b) => a - b);
      const n = sorted.length;
      const positions = blomPositions(n);
      const zScores = positions.map(p => normalQuantile(p));

      const { fillColor, lineColor } = this._seriesColors(s, sIdx);
      const markerFill = resolveColor(fillColor);
      const lineCol = resolveColor(lineColor);

      // ── Reference line (fit through Q1 and Q3) ──
      const q1i = Math.floor(n * 0.25);
      const q3i = Math.floor(n * 0.75);
      const z1 = zScores[q1i], z3 = zScores[q3i];
      const v1 = sorted[q1i], v3 = sorted[q3i];
      const slope = (z3 - z1) / (v3 - v1 || 1);
      const intercept = z1 - slope * v1;

      const lineX0 = xExt.xMin - pad;
      const lineX1 = xExt.xMax + pad;
      const lineY0 = slope * lineX0 + intercept;
      const lineY1 = slope * lineX1 + intercept;

      svgEl('line', {
        x1: xScale(lineX0), y1: yScale(lineY0),
        x2: xScale(lineX1), y2: yScale(lineY1),
        stroke: lineCol,
        'stroke-width': 2,
        'stroke-dasharray': '6,3',
      }, plotGroup);

      // ── Data points ──
      const markerR = (s.markerSize ?? this.config.markerSize ?? 8) / 2;
      const symbol = s.markerSymbol || this.config.markerSymbol || 'circle';
      const strokeColor = resolveColor(s.markerStroke || this.config.markerStroke || 'var(--color-text-primary)');
      const strokeW = s.markerStrokeWidth ?? this.config.markerStrokeWidth ?? 1;

      for (let i = 0; i < n; i++) {
        const px = xScale(sorted[i]);
        const py = yScale(zScores[i]);
        drawMarker(plotGroup, symbol, px, py, markerR,
          markerFill, strokeColor, strokeW);
      }

      this._seriesRender.push({
        name: s.name || `Series ${sIdx + 1}`,
        sorted, zScores, positions,
      });
    }
  }

  // ── Legend ─────────────────────────────────────────────────────

  /** @override */
  _getLegendItems() {
    const series = this._resolveSeries();
    const items = [];
    for (let i = 0; i < series.length; i++) {
      const s = series[i];
      if (s.visible === false) continue;
      const { fillColor, lineColor } = this._seriesColors(s, i);
      items.push({
        type: 'marker',
        symbol: s.markerSymbol || this.config.markerSymbol || 'circle',
        color: fillColor,
        stroke: s.markerStroke || this.config.markerStroke || 'var(--color-text-primary)',
        strokeWidth: s.markerStrokeWidth ?? this.config.markerStrokeWidth ?? 1,
        label: s.name || `Series ${i + 1}`,
      });
      items.push({ type: 'line', color: lineColor, label: `${s.name || `Series ${i + 1}`} — Fit`, dash: '6,3' });
    }
    return items;
  }

  // ── Series Descriptors (for base editor) ────────────────────────

  /** @override */
  _getSeriesDescriptors() {
    const cfg = this.config;
    const series = this._resolveSeries();
    const chartColors = getChartColors();
    const descriptors = [];

    for (let i = 0; i < series.length; i++) {
      const idx = i;
      const fallbackFill = chartColors[i % chartColors.length] || 'rgba(76,114,176,1)';
      const s = series[i];

      // Marker descriptor
      descriptors.push({
        index: descriptors.length,
        getName: () => s.name || `Series ${idx + 1}`,
        setName: (v) => { s.name = v; },
        getColor: () => s.color || fallbackFill,
        setColor: (c) => { s.color = c; },
        isVisible: () => s.visible !== false,
        setVisible: (v) => { s.visible = v; },
        getSymbol: () => s.markerSymbol || cfg.markerSymbol || 'circle',
        setSymbol: (v) => { s.markerSymbol = v; },
        getSize: () => s.markerSize ?? cfg.markerSize ?? 8,
        setSize: (v) => { s.markerSize = v; },
        getStroke: () => s.markerStroke || cfg.markerStroke || 'rgba(34,34,34,1)',
        setStroke: (v) => { s.markerStroke = v; },
        getStrokeWidth: () => s.markerStrokeWidth ?? cfg.markerStrokeWidth ?? 1,
        setStrokeWidth: (v) => { s.markerStrokeWidth = v; },
      });

      // Fit-line descriptor
      descriptors.push({
        index: descriptors.length,
        getName: () => `${s.name || `Series ${idx + 1}`} — Fit`,
        setName: () => {},
        getColor: () => s.lineColor || s.color || fallbackFill,
        setColor: (c) => { s.lineColor = c; },
        isVisible: () => s.visible !== false,
        setVisible: () => {},
        getStroke: () => s.lineColor || s.color || fallbackFill,
        setStroke: (c) => { s.lineColor = c; },
      });
    }

    return descriptors;
  }

  // ── Tooltip: find nearest point ───────────────────────────────

  /** @override */
  _findNearby(dataX, dataY, proximityPx) {
    const all = this._seriesRender;
    if (!all || all.length === 0) return [];

    let bestDist = Infinity;
    let bestSeries = -1;
    let bestIdx = -1;
    const mx = this._xScale(dataX);
    const my = this._yScale(dataY);

    for (let sIdx = 0; sIdx < all.length; sIdx++) {
      const s = all[sIdx];
      for (let i = 0; i < s.sorted.length; i++) {
        const px = this._xScale(s.sorted[i]);
        const py = this._yScale(s.zScores[i]);
        const dist = Math.hypot(px - mx, py - my);
        if (dist < bestDist) {
          bestDist = dist;
          bestSeries = sIdx;
          bestIdx = i;
        }
      }
    }

    if (bestIdx < 0 || bestDist > proximityPx * 2) return [];

    const s = all[bestSeries];
    const pct = (s.positions[bestIdx] * 100).toFixed(1);
    const val = s.sorted[bestIdx];
    const z = s.zScores[bestIdx];
    const px = this._xScale(val);
    const py = this._yScale(z);

    const nameLine = all.length > 1 ? `<b>${s.name}</b><br>` : '';
    return [{
      html: nameLine
        + `<b>${formatNum(val, 4, this.locale)}</b><br>`
        + `z = ${formatNum(z, 3, this.locale)}<br>`
        + `P = ${pct}%`,
      px, py,
    }];
  }
}