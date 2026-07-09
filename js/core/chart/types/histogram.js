/**
 * histogram.js — Histogram chart type for the D.Mike chart framework.
 * Supports: auto-binning (Sturges/Scott/Freedman-Diaconis/manual),
 * normal curve overlay, spec limit lines, tooltips.
 */

import ChartBase from '../chart-base.js';
import { h } from '../../dom.js';
import {
  svgEl, resolveColor, formatNum, getChartColors
} from '../chart-core.js';
import {
  edSection, edSelectRow, edCheckboxRow, edInlineNum,
} from '../chart-editor.js';

/**
 * Compute IQR for Freedman-Diaconis rule.
 * @param {number[]} sorted
 * @returns {number}
 */
function iqr(sorted) {
  const n = sorted.length;
  const q1 = sorted[Math.floor(n * 0.25)];
  const q3 = sorted[Math.floor(n * 0.75)];
  return q3 - q1;
}

/**
 * Compute bin count from method.
 * @param {number[]} data - Raw data
 * @param {string} method - 'sturges'|'scott'|'freedman-diaconis'|'manual'
 * @param {number|null} manualCount
 * @returns {number}
 */
function computeBinCount(data, method, manualCount) {
  const n = data.length;
  if (method === 'manual' && manualCount > 0) return manualCount;

  const sorted = [...data].sort((a, b) => a - b);
  const mean = data.reduce((s, v) => s + v, 0) / n;
  const variance = data.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  const stdDev = Math.sqrt(variance);

  switch (method) {
    case 'scott': {
      const binW = 3.49 * stdDev * Math.pow(n, -1 / 3);
      if (binW <= 0) return Math.max(5, Math.ceil(Math.sqrt(n)));
      return Math.max(3, Math.ceil((sorted[n - 1] - sorted[0]) / binW));
    }
    case 'freedman-diaconis': {
      const binW = 2 * iqr(sorted) * Math.pow(n, -1 / 3);
      if (binW <= 0) return Math.max(5, Math.ceil(Math.sqrt(n)));
      return Math.max(3, Math.ceil((sorted[n - 1] - sorted[0]) / binW));
    }
    default: // sturges
      return Math.max(3, Math.ceil(Math.log2(n) + 1));
  }
}

/**
 * Build histogram bins.
 * @param {number[]} data
 * @param {number} binCount
 * @returns {{ bins: { x0: number, x1: number, count: number, density: number }[], binWidth: number }}
 */
function buildBins(data, binCount) {
  const sorted = [...data].sort((a, b) => a - b);
  const dMin = sorted[0];
  const dMax = sorted[sorted.length - 1];
  const range = dMax - dMin || 1;
  const binWidth = range / binCount;
  const n = data.length;

  const bins = [];
  for (let i = 0; i < binCount; i++) {
    bins.push({
      x0: dMin + i * binWidth,
      x1: dMin + (i + 1) * binWidth,
      count: 0,
      density: 0,
    });
  }

  for (const v of data) {
    let idx = Math.floor((v - dMin) / binWidth);
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    bins[idx].count++;
  }

  // Compute density (probability density = count / (n * binWidth))
  for (const bin of bins) {
    bin.density = bin.count / (n * binWidth);
  }

  return { bins, binWidth };
}

/**
 * Normal PDF.
 * @param {number} x
 * @param {number} mean
 * @param {number} stdDev
 * @returns {number}
 */
function normalPdf(x, mean, stdDev) {
  const z = (x - mean) / stdDev;
  return Math.exp(-0.5 * z * z) / (stdDev * Math.sqrt(2 * Math.PI));
}

export default class HistogramChart extends ChartBase {
  /**
   * @param {HTMLElement} container
   * @param {Object} config
   * @param {Object} context
   */
  constructor(container, config, context) {
    const isHorizontal = config?.orientation === 'horizontal';
    const defaults = {
      orientation: 'vertical',  // 'vertical' (default, bars rise up) | 'horizontal' (bars extend right)
      // Pin the density-axis baseline to zero — bars/curve hang off it.
      yMin: isHorizontal ? null : 0,
      xMin: isHorizontal ? 0 : null,
      data: [],
      binMethod: 'sturges',
      binCount: null,
      barColor: null,
      barBorderColor: null,
      showNormalCurve: false,
      normalCurveColor: null,
      normalCurves: [],
    };
    super(container, Object.assign(defaults, config), context);
  }

  /**
   * Build the list of normal curves to render, merging the legacy
   * `showNormalCurve` shorthand (auto-fit to data) with the explicit
   * `normalCurves` array. Returns curves with resolved mean/stdDev/color/label.
   * @private
   * @returns {{ mean: number, stdDev: number, color: string, label: string, lineStyle?: string, strokeWidth?: number }[]}
   */
  _getActiveNormalCurves() {
    const data = this.config.data || [];
    const chartColors = getChartColors();
    const out = [];

    if (this.config.showNormalCurve && data.length > 1) {
      const mean = data.reduce((s, v) => s + v, 0) / data.length;
      const variance = data.reduce((s, v) => s + (v - mean) ** 2, 0) / (data.length - 1);
      const stdDev = Math.sqrt(variance);
      if (stdDev > 0) {
        out.push({
          mean,
          stdDev,
          color: this.config.normalCurveColor || chartColors[1] || 'var(--color-chart-2)',
          label: 'Normal',
        });
      }
    }

    const explicit = Array.isArray(this.config.normalCurves) ? this.config.normalCurves : [];
    for (let i = 0; i < explicit.length; i++) {
      const c = explicit[i];
      if (!c || !Number.isFinite(c.mean) || !Number.isFinite(c.stdDev) || c.stdDev <= 0) continue;
      out.push({
        mean: c.mean,
        stdDev: c.stdDev,
        color: c.color || chartColors[(i + 2) % chartColors.length] || 'var(--color-chart-3)',
        label: c.label || `Normal ${out.length + 1}`,
        lineStyle: c.lineStyle,
        strokeWidth: c.strokeWidth,
      });
    }

    return out;
  }

  // ── Abstract Implementation: Data Extent ─────────────────────────

  /** @override */
  _getDataExtent() {
    const data = this.config.data || [];
    if (!data.length) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };

    const binCount = computeBinCount(data, this.config.binMethod, this.config.binCount);
    const { bins } = buildBins(data, binCount);

    let valMin = bins[0].x0;
    let valMax = bins[bins.length - 1].x1;
    let denMax = 0;
    for (const bin of bins) denMax = Math.max(denMax, bin.density);

    // Include normal curve peaks (auto-fit + explicit curves)
    for (const curve of this._getActiveNormalCurves()) {
      denMax = Math.max(denMax, normalPdf(curve.mean, curve.mean, curve.stdDev));
      valMin = Math.min(valMin, curve.mean - 4 * curve.stdDev);
      valMax = Math.max(valMax, curve.mean + 4 * curve.stdDev);
    }

    // Horizontal: bin values on Y, density on X. Vertical (default): the other way.
    return this.config.orientation === 'horizontal'
      ? { xMin: 0, xMax: denMax, yMin: valMin, yMax: valMax }
      : { xMin: valMin, xMax: valMax, yMin: 0, yMax: denMax };
  }

  // ── Abstract Implementation: Render Data ─────────────────────────

  /** @override */
  _renderData(svg, plotGroup, xScale, yScale, _xTick, _yTick, _plotArea, _defs) {
    const data = this.config.data || [];
    if (!data.length) return;

    const binCount = computeBinCount(data, this.config.binMethod, this.config.binCount);
    const { bins, binWidth } = buildBins(data, binCount);

    const chartColors = getChartColors();
    const barFill = resolveColor(this.config.barColor || chartColors[0] || 'var(--color-chart-1)');
    const barStroke = resolveColor(this.config.barBorderColor || barFill);

    // Store for tooltip
    this._bins = bins;
    this._binWidth = binWidth;

    const isHorizontal = this.config.orientation === 'horizontal';
    // In horizontal mode bin values run along Y and density along X; the
    // bar rectangle starts at density=0 and extends rightward to density.
    const valueScale   = isHorizontal ? yScale : xScale;
    const densityScale = isHorizontal ? xScale : yScale;

    const densityBase = Math.round(densityScale(0));
    const edges = bins.map(b => Math.round(valueScale(b.x0)));
    edges.push(Math.round(valueScale(bins[bins.length - 1].x1)));

    for (let i = 0; i < bins.length; i++) {
      const densityPx = Math.round(densityScale(bins[i].density));
      // Span along the value axis (between consecutive bin edges).
      const e0 = edges[i], e1 = edges[i + 1];
      const valSpan = Math.abs(e1 - e0);
      // Span along the density axis (between zero baseline and density value).
      const densSpan = Math.abs(densityBase - densityPx);
      if (valSpan <= 0 || densSpan <= 0) continue;

      let x, y, w, rectH;
      if (isHorizontal) {
        x = Math.min(densityBase, densityPx);
        y = Math.min(e0, e1);
        w = densSpan;
        rectH = valSpan;
      } else {
        x = Math.min(e0, e1);
        y = Math.min(densityBase, densityPx);
        w = valSpan;
        rectH = densSpan;
      }

      svgEl('rect', {
        x, y, width: w, height: rectH,
        fill: barFill, 'fill-opacity': 0.6,
        stroke: barStroke, 'stroke-width': 1,
      }, plotGroup);
    }

    // Normal curve overlays (auto-fit + explicit curves)
    for (const curve of this._getActiveNormalCurves()) {
      const curveColor = resolveColor(curve.color);
      const points = [];
      const steps = 100;
      const cvMin = curve.mean - 4 * curve.stdDev;
      const cvMax = curve.mean + 4 * curve.stdDev;

      for (let i = 0; i <= steps; i++) {
        const v = cvMin + (cvMax - cvMin) * i / steps;
        const d = normalPdf(v, curve.mean, curve.stdDev);
        if (isHorizontal) {
          points.push(`${densityScale(d)},${valueScale(v)}`);
        } else {
          points.push(`${valueScale(v)},${densityScale(d)}`);
        }
      }

      const attrs = {
        points: points.join(' '),
        fill: 'none',
        stroke: curveColor,
        'stroke-width': curve.strokeWidth || 2,
      };
      if (curve.lineStyle === 'dashed') attrs['stroke-dasharray'] = '6,3';
      svgEl('polyline', attrs, plotGroup);
    }
  }

  // ── Type-Specific Editor ──────────────────────────────────────

  /** @override */
  _buildTypeEditor(inner, t, onUpdate) {
    const cfg = this.config;
    const th = (key) => {
      if (this.context && this.context.i18n) {
        const full = `chart.editor.histogram.${key}`;
        const val = this.context.i18n.t(full);
        if (val !== full) return val;
      }
      return key;
    };

    // ── Binning ──
    const binSec = edSection(th('binning'));

    binSec.appendChild(edSelectRow(th('binMethod'), [
      { value: 'sturges', label: th('sturges') },
      { value: 'scott', label: th('scott') },
      { value: 'freedman-diaconis', label: th('freedmanDiaconis') },
      { value: 'manual', label: th('manual') },
    ], cfg.binMethod, (v) => {
      cfg.binMethod = v;
      onUpdate();
    }));

    if (cfg.binMethod === 'manual') {
      binSec.appendChild(edInlineNum(th('binCount'), cfg.binCount || 10, (v) => {
        cfg.binCount = Math.max(1, Math.round(v));
        onUpdate();
      }, 1, 200, 1));
    }

    inner.appendChild(binSec);

    // ── Normal Curve ──
    const curveSec = edSection(th('normalCurve'));

    curveSec.appendChild(edCheckboxRow(th('showNormalCurve'), Boolean(cfg.showNormalCurve), (v) => {
      cfg.showNormalCurve = v;
      onUpdate();
    }));

    inner.appendChild(curveSec);
  }

  // ── Series Descriptors (for base editor) ──────────────────────

  /** @override */
  _getSeriesDescriptors() {
    const cfg = this.config;
    const chartColors = getChartColors();
    const descriptors = [{
      index: 0,
      getName: () => 'Histogram',
      setName: () => {},
      getColor: () => cfg.barColor || chartColors[0] || 'var(--color-chart-1)',
      setColor: (c) => { cfg.barColor = c; },
      isVisible: () => true,
      setVisible: () => {},
      getStroke: () => cfg.barBorderColor || cfg.barColor || chartColors[0] || 'var(--color-chart-1)',
      setStroke: (c) => { cfg.barBorderColor = c; },
    }];
    if (cfg.showNormalCurve) {
      descriptors.push({
        index: 1,
        getName: () => 'Normal',
        setName: () => {},
        getColor: () => cfg.normalCurveColor || chartColors[1] || 'var(--color-chart-2)',
        setColor: (c) => { cfg.normalCurveColor = c; },
        isVisible: () => true,
        setVisible: () => {},
      });
    }
    const explicit = Array.isArray(cfg.normalCurves) ? cfg.normalCurves : [];
    explicit.forEach((curve, i) => {
      if (!curve || !Number.isFinite(curve.mean) || !Number.isFinite(curve.stdDev) || curve.stdDev <= 0) return;
      const fallback = chartColors[(i + 2) % chartColors.length] || 'var(--color-chart-3)';
      descriptors.push({
        index: descriptors.length,
        getName: () => curve.label || `Normal ${i + 1}`,
        setName: (s) => { curve.label = s; },
        getColor: () => curve.color || fallback,
        setColor: (c) => { curve.color = c; },
        isVisible: () => true,
        setVisible: () => {},
      });
    });
    return descriptors;
  }

  // ── Abstract Implementation: Legend Items ────────────────────────

  /** @override */
  _getLegendItems() {
    const items = [];
    const chartColors = getChartColors();
    const barColor = this.config.barColor || chartColors[0] || 'var(--color-chart-1)';
    items.push({ type: 'rect', color: barColor, label: 'Histogram' });

    if (this.config.showNormalCurve) {
      const curveColor = this.config.normalCurveColor || chartColors[1] || 'var(--color-chart-2)';
      items.push({ type: 'line', color: curveColor, label: 'Normal' });
    }
    const explicit = Array.isArray(this.config.normalCurves) ? this.config.normalCurves : [];
    explicit.forEach((curve, i) => {
      if (!curve || !Number.isFinite(curve.mean) || !Number.isFinite(curve.stdDev) || curve.stdDev <= 0) return;
      const color = curve.color || chartColors[(i + 2) % chartColors.length] || 'var(--color-chart-3)';
      items.push({ type: 'line', color, label: curve.label || `Normal ${i + 1}` });
    });

    return items;
  }

  // ── Abstract Implementation: Find Nearby ─────────────────────────

  /** @override */
  _findNearby(dataX, dataY, _proximityPx) {
    const bins = this._bins;
    if (!bins) return [];

    const isHorizontal = this.config.orientation === 'horizontal';
    // Map cursor data coords onto (value, density) regardless of orientation.
    const valCoord = isHorizontal ? dataY : dataX;
    const denCoord = isHorizontal ? dataX : dataY;

    for (const bin of bins) {
      if (valCoord >= bin.x0 && valCoord < bin.x1 && denCoord >= 0 && denCoord <= bin.density) {
        const midVal = (bin.x0 + bin.x1) / 2;
        const halfDen = bin.density / 2;
        const px = isHorizontal ? this._xScale(halfDen) : this._xScale(midVal);
        const py = isHorizontal ? this._yScale(midVal) : this._yScale(halfDen);

        return [{
          node: h('div', null,
            h('b', null, `${formatNum(bin.x0, 2, this.locale)} – ${formatNum(bin.x1, 2, this.locale)}`),
            h('br'),
            `n = ${bin.count}`,
          ),
          px, py,
        }];
      }
    }

    return [];
  }
}
