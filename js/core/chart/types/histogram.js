/**
 * histogram.js — Histogram chart type for the D.Mike chart framework.
 * Supports: auto-binning (Sturges/Scott/Freedman-Diaconis/manual) or precomputed bins,
 * normal curve overlay, spec limit lines, tooltips.
 * Series path (`config.series`): several series on shared bins, count axis, patterns,
 * per-series normal curve, Pareto line, boxplot strip — used by the histogram module.
 */

import ChartBase from '../chart-base.js';
import { h } from '../../dom.js';
import {
  svgEl, resolveColor, formatNum, getChartColors
} from '../chart-core.js';
import {
  edSection, edSelectRow, edCheckboxRow, edInlineNum, edColorPair, edRangeRow, openColorPicker,
} from '../chart-editor.js';
import { binAll, seriesMoments, cumulativePercent, computeBoxStats } from '../histogram-series.js';
import {
  drawSeriesBars, drawNormalCurves, normalPeak, binTooltip, drawPareto, PARETO_AXIS_W, PARETO_COLOR,
  stripHeight, drawBoxStrip, boxTooltip, BOX_H, BOX_GAP,
} from '../histogram-series-draw.js';

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
      // Precomputed bins [{ x0, x1, count }] — when set, data/binMethod/binCount are ignored.
      bins: null,
      barColor: null,
      barBorderColor: null,
      showNormalCurve: false,
      normalCurveColor: null,
      normalCurves: [],
      // Series path (histogram module) — used only when series is a non-empty array
      series: null,
      binWidth: null,
      barGap: 1,
      pareto: false,
      boxplotStrip: false,
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

  /**
   * Bins to draw: the precomputed `config.bins` (densities derived from the
   * counts) or bins computed from `config.data`. Null when there is nothing.
   * @private
   * @returns {{ bins: {x0: number, x1: number, count: number, density: number}[], binWidth: number } | null}
   */
  _resolveBins() {
    const pre = this.config.bins;
    if (Array.isArray(pre) && pre.length) {
      const total = pre.reduce((s, b) => s + (b.count || 0), 0);
      const bins = pre.map((b) => {
        const w = b.x1 - b.x0;
        return {
          x0: b.x0, x1: b.x1, count: b.count,
          density: total > 0 && w > 0 ? b.count / (total * w) : 0,
          highlight: b.highlight === true,
        };
      });
      return { bins, binWidth: bins[0].x1 - bins[0].x0 };
    }
    const data = this.config.data || [];
    if (!data.length) return null;
    return buildBins(data, computeBinCount(data, this.config.binMethod, this.config.binCount));
  }

  /** Series path is active: config.series is a non-empty array. */
  _isSeriesMode() {
    return Array.isArray(this.config.series) && this.config.series.length > 0;
  }

  /** Shared bins of the series path (cached on the instance for tooltips). */
  _resolveSeriesBins() {
    this._seriesBins = binAll(this.config.series, this.config.binWidth || null);
    return this._seriesBins;
  }

  /**
   * Extent of the series path: shared bin range, count axis with 12 % headroom.
   * Vertical only — `orientation` is ignored on this path.
   * @private
   */
  _getSeriesExtent() {
    const res = this._resolveSeriesBins();
    if (!res.bins.some(b => b.length)) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
    let top = 0;
    this.config.series.forEach((s, si) => {
      if (s.visible === false) return;
      for (const b of res.bins[si]) top = Math.max(top, b.count);
      if (s.showNormalCurve !== false) top = Math.max(top, normalPeak(s.values, res.binWidth));
    });
    return { xMin: res.globalMin, xMax: res.globalMax, yMin: 0, yMax: (top || 1) * 1.12 };
  }

  // ── Abstract Implementation: Data Extent ─────────────────────────

  /** @override */
  _getDataExtent() {
    if (this._isSeriesMode()) return this._getSeriesExtent();
    const resolved = this._resolveBins();
    if (!resolved) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
    const { bins } = resolved;

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

  /** Index of the single visible series when the Pareto line applies, else -1. */
  _paretoSeriesIndex() {
    if (!this._isSeriesMode() || !this.config.pareto) return -1;
    const vis = [];
    this.config.series.forEach((s, si) => { if (s.visible !== false) vis.push(si); });
    return vis.length === 1 ? vis[0] : -1;
  }

  /**
   * Cumulative % at the right edge of bin `bi` while the Pareto line is shown.
   * @param {number} bi
   * @returns {number|null}
   */
  _paretoCumAt(bi) {
    const si = this._paretoSeriesIndex();
    const res = this._seriesBins;
    if (si < 0 || !res || !res.bins[si][bi]) return null;
    return cumulativePercent(res.bins[si])[bi];
  }

  /** @override Reserve room for the Pareto %-axis right of the plot (series mode only). */
  _getPlotArea() {
    const pa = super._getPlotArea();
    if (this._paretoSeriesIndex() < 0) return pa;
    return { ...pa, w: pa.w - PARETO_AXIS_W, rMargin: pa.rMargin + PARETO_AXIS_W };
  }

  /**
   * Visible series with box statistics, in series order (strip rows).
   * @returns {{ si: number, series: object, stats: object }[]}
   */
  _stripRows() {
    if (!this._isSeriesMode() || !this.config.boxplotStrip) return [];
    const rows = [];
    this.config.series.forEach((s, si) => {
      if (s.visible === false) return;
      const stats = computeBoxStats(s.values);
      if (stats) rows.push({ si, series: s, stats });
    });
    return rows;
  }

  /** @override Room for the boxplot strip below the x-axis title. */
  _getMargins() {
    const m = super._getMargins();
    const extra = stripHeight(this._stripRows().length);
    return extra ? { ...m, bottom: m.bottom + extra } : m;
  }

  /** @override Legend starts right of the Pareto %-axis. */
  _drawLegend(svg, pa, size, textColor) {
    const shift = this._paretoSeriesIndex() >= 0 ? PARETO_AXIS_W : 0;
    super._drawLegend(svg, { ...pa, w: pa.w + shift }, size, textColor);
  }

  // ── Abstract Implementation: Render Data ─────────────────────────

  /** @override */
  _renderData(svg, plotGroup, xScale, yScale, xTick, _yTick, _plotArea, defs) {
    if (this._isSeriesMode()) {
      const res = this._seriesBins || this._resolveSeriesBins();
      drawSeriesBars(plotGroup, defs, this._uid, this.config.series, res, xScale, yScale, this.config.barGap);
      drawNormalCurves(plotGroup, this.config.series, res.binWidth, xScale, yScale, xTick.min, xTick.max);
      const pi = this._paretoSeriesIndex();
      if (pi >= 0 && res.bins[pi].length) {
        drawPareto(svg, plotGroup, res.bins[pi], cumulativePercent(res.bins[pi]), xScale, _plotArea, {
          color: PARETO_COLOR, label: this._th('paretoCum'),
          tickSize: this.config.tickSize || 11, locale: this.locale,
        });
      }
      const rows = this._stripRows();
      this._stripRowsCache = rows;
      this._stripTop = rows.length ? _plotArea.totalH - stripHeight(rows.length) : null;
      if (rows.length) drawBoxStrip(svg, defs, this._uid, rows, xScale, _plotArea, this._stripTop);
      return;
    }
    const resolved = this._resolveBins();
    if (!resolved) return;
    const { bins, binWidth } = resolved;

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

      // Highlighted precomputed bins take their colour from the CSS class,
      // so both themes apply.
      const colours = bins[i].highlight
        ? { class: 'chart-histogram__bar chart-histogram__bar--highlight' }
        : { class: 'chart-histogram__bar', fill: barFill, stroke: barStroke };
      svgEl('rect', {
        x, y, width: w, height: rectH,
        'fill-opacity': 0.6, 'stroke-width': 1,
        ...colours,
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

  /**
   * i18n for chart.editor.histogram.<key> (falls back to the key).
   * @param {string} key
   * @returns {string}
   */
  _th(key) {
    const full = `chart.editor.histogram.${key}`;
    const val = this.context?.i18n?.t(full);
    return val && val !== full ? val : key;
  }

  /**
   * @override
   * @param {HTMLElement} inner
   * @param {function} t
   * @param {function} onUpdate - re-render and rebuild the editor
   * @param {function} [onChange] - re-render, keep the editor DOM, notify onEditorChange
   */
  _buildTypeEditor(inner, t, onUpdate, onChange = onUpdate) {
    if (this._isSeriesMode()) { this._buildSeriesTypeEditor(inner, onUpdate, onChange); return; }
    const cfg = this.config;
    const th = (key) => this._th(key);

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

  /**
   * Editor of the series path: Display section and per-series fields.
   * @param {HTMLElement} inner
   * @param {function} onUpdate
   * @param {function} onChange
   */
  _buildSeriesTypeEditor(inner, onUpdate, onChange) {
    const cfg = this.config;
    const th = (k) => this._th(k);
    const disp = edSection(th('display'));
    disp.dataset.edSection = 'display';
    disp.appendChild(edCheckboxRow(th('pareto'), !!cfg.pareto, (v) => { cfg.pareto = v; onUpdate(); }));
    disp.appendChild(edCheckboxRow(th('boxplotStrip'), !!cfg.boxplotStrip, (v) => { cfg.boxplotStrip = v; onUpdate(); }));
    disp.appendChild(edInlineNum(th('barGap'), cfg.barGap ?? 1, (v) => { cfg.barGap = Math.max(0, v); onChange(); }, 0, 20, 1));
    inner.prepend(disp);

    const patterns = ['', '/', '\\', 'x', '-', '|', '+', '.']
      .map(v => ({ value: v, label: v === '' ? '—' : v === 'x' ? '×' : v === '.' ? '·' : v }));
    const styles = ['solid', 'dash', 'dot', 'none']
      .map(v => ({ value: v, label: th(`style${v[0].toUpperCase()}${v.slice(1)}`) }));
    (this._seriesItemEls || []).forEach((item, si) => {
      const s = cfg.series[si];
      const details = item.querySelector('.dmike-chart-ed-series-details');
      if (!s || !details) return;
      const normal = edCheckboxRow(th('normal'), s.showNormalCurve !== false, (v) => { s.showNormalCurve = v; onChange(); });
      normal.querySelector('input').dataset.ed = 'normal';
      const pat = edSelectRow(th('pattern'), patterns, s.pattern || '', (v) => { s.pattern = v; onChange(); });
      pat.querySelector('select').dataset.ed = 'pattern';
      const bst = edSelectRow(th('borderStyle'), styles, s.borderStyle || 'solid', (v) => { s.borderStyle = v; onChange(); });
      bst.querySelector('select').dataset.ed = 'borderStyle';
      const { el: pcRow, swatch: pcSw } = edColorPair(th('patternColor'), s.patternColor || 'rgba(0,0,0,0.5)', (e) => {
        openColorPicker(e, s.patternColor || 'rgba(0,0,0,0.5)', (c) => { s.patternColor = c; pcSw.style.background = c; onChange(); });
      });
      const solid = edRangeRow(th('patternSolidity'), s.patternSolidity ?? 0.4, (v) => { s.patternSolidity = v; onChange(); }, 0.1, 1, 0.1);
      details.append(normal, pat, bst, pcRow, solid);
    });
  }

  /** @override */
  _getSeriesDescriptors() {
    if (this._isSeriesMode()) {
      return this.config.series.map((s, index) => ({
        index,
        getName: () => s.name, setName: (v) => { s.name = v; },
        getColor: () => s.fillColor, setColor: (c) => { s.fillColor = c; },
        isVisible: () => s.visible !== false, setVisible: (v) => { s.visible = v; },
        getStroke: () => s.borderColor, setStroke: (c) => { s.borderColor = c; },
        getStrokeWidth: () => s.borderWidth ?? 1, setStrokeWidth: (v) => { s.borderWidth = v; },
      }));
    }
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

  /**
   * Legend of the series path: a rect per visible series, a line per drawn normal curve.
   * @returns {{type: string, color: string, label: string, width?: number}[]}
   */
  _getSeriesLegendItems() {
    const items = [];
    const curves = [];
    this.config.series.forEach((s, si) => {
      if (s.visible === false) return;
      items.push({ type: 'rect', color: s.fillColor, label: s.name, patternId: s.pattern ? `hist-pat-${this._uid}-${si}` : null });
      const { n, sd } = seriesMoments(s.values);
      if (s.showNormalCurve !== false && n >= 2 && sd > 0) {
        curves.push({ type: 'line', color: s.borderColor, width: 2, label: `${s.name} · ${this._th('normal')}` });
      }
    });
    if (this._paretoSeriesIndex() >= 0) {
      curves.push({ type: 'line', color: PARETO_COLOR, width: 2, label: this._th('paretoCum') });
    }
    return [...items, ...curves];
  }

  /**
   * Every label the series legend can show — curve and Pareto entries
   * included, hidden series too — so the measured legend width fits the
   * longest entry and stays put while series are toggled. The base class
   * only measures series names.
   * @override
   */
  _getAllLegendLabels() {
    if (!this._isSeriesMode()) return super._getAllLegendLabels();
    const labels = [];
    this.config.series.forEach((s) => {
      labels.push(s.name);
      if (s.showNormalCurve !== false) labels.push(`${s.name} · ${this._th('normal')}`);
    });
    if (this.config.pareto) labels.push(this._th('paretoCum'));
    return labels;
  }

  /** @override */
  _getLegendItems() {
    if (this._isSeriesMode()) return this._getSeriesLegendItems();
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

  /**
   * Tooltip hit-test of the series path: the shared bin under the cursor,
   * only up to the height of its highest visible bar.
   * @param {number} dataX
   * @param {number} dataY
   * @returns {{node: HTMLElement}[]}
   */
  _findNearbySeries(dataX, dataY) {
    const rows = this._stripRowsCache || [];
    if (rows.length && this._stripTop != null) {
      const py = this._yScale(dataY);
      if (py >= this._stripTop) {
        const ri = Math.floor((py - this._stripTop - BOX_GAP / 2) / (BOX_H + BOX_GAP));
        const row = rows[ri];
        if (!row) return [];
        return [{ node: boxTooltip({ series: row.series, stats: row.stats, locale: this.locale, t: (k) => this._th(k) }) }];
      }
    }
    const res = this._seriesBins;
    if (!res) return [];
    const series = this.config.series;
    const first = series.findIndex((s, si) => s.visible !== false && res.bins[si].length);
    if (first < 0) return [];
    const bi = res.bins[first].findIndex((b, i, arr) =>
      dataX >= b.xMin && (dataX < b.xMax || (i === arr.length - 1 && dataX <= b.xMax)));
    if (bi < 0) return [];
    let top = 0;
    series.forEach((s, si) => { if (s.visible !== false && res.bins[si][bi]) top = Math.max(top, res.bins[si][bi].count); });
    if (dataY < 0 || dataY > top) return [];
    return [{ node: binTooltip({ series, binData: res, bi, locale: this.locale, t: (k) => this._th(k), cumPct: this._paretoCumAt?.(bi) ?? null }) }];
  }

  /** @override */
  _findNearby(dataX, dataY, _proximityPx) {
    if (this._isSeriesMode()) return this._findNearbySeries(dataX, dataY);
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
