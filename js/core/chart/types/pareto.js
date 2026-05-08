/**
 * pareto.js — Pareto chart type for the D.Mike chart framework.
 * Bars sorted by descending value + cumulative percentage line (dual Y-axis).
 * Supports: category colors, configurable threshold line, cumulative line/dot styling.
 *
 * Config:
 *   items: Array<{ name: string, value: number, color?: string }>
 *   maxItems: number (default 20)
 *
 *   Threshold reference line (the "80 % line"):
 *     refLineValue: number (default 80) — percentage value, 0 = hidden
 *     refLineColor: string
 *     refLineDash:  string ('solid'|'dash'|'dot'|'dashdot'|'longdash')
 *     refLineWidth: number
 *
 *   Cumulative line:
 *     cumulativeColor: string
 *     cumDash:  string
 *     cumWidth: number
 *
 *   Cumulative dots:
 *     cumDotSymbol: string (any chart-core marker symbol)
 *     cumDotSize:   number (radius)
 *     cumDotFill:   string
 *     cumDotStroke:      string
 *     cumDotStrokeWidth: number
 */

import ChartBase from '../chart-base.js';
import {
  svgEl, svgText, resolveColor, formatNum, dashArray, drawMarker, createPattern
} from '../chart-core.js';

/** Default cumulative line color */
const CUM_COLOR = '#ef4444';

/** Margins — extra right for %-axis label, extra bottom for rotated labels */
const PARETO_MARGIN = { top: 48, right: 72, bottom: 90, left: 72 };

/** Font families (must match chart-base.js) */
const FONT_MAIN = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

export default class ParetoChart extends ChartBase {
  /**
   * @param {HTMLElement} container
   * @param {Object} config
   * @param {Object} context
   */
  constructor(container, config, context) {
    const defaults = {
      items: [],
      maxItems: 20,
      yMin: 0,
      barOpacity: 0.75,
      showLegend: false,
      showCrosshair: false,
      showXTicks: false,

      // Threshold reference line
      refLineValue: 80,
      refLineColor: CUM_COLOR,
      refLineDash: 'dash',
      refLineWidth: 1,

      // Cumulative line
      cumulativeColor: CUM_COLOR,
      cumDash: 'solid',
      cumWidth: 2,

      // Cumulative dots
      cumDotSymbol: 'circle',
      cumDotSize: 3.5,
      cumDotFill: CUM_COLOR,
      cumDotStroke: '#ffffff',
      cumDotStrokeWidth: 1.5,
    };
    super(container, Object.assign(defaults, config), context);
  }

  // ── Layout override — wider right margin for %-axis ───────────

  /** @override */
  _getPlotArea() {
    const size = this._getSize();
    return {
      x: PARETO_MARGIN.left,
      y: PARETO_MARGIN.top,
      w: size.w - PARETO_MARGIN.left - PARETO_MARGIN.right,
      h: size.h - PARETO_MARGIN.top - PARETO_MARGIN.bottom,
      totalW: size.w,
      totalH: size.h,
      rMargin: PARETO_MARGIN.right,
    };
  }

  // ── Data helpers ───────────────────────────────────────────────

  /** @private */
  _getItems() {
    const src = this.config.items || [];
    const max = this.config.maxItems || 20;
    return src.slice(0, max);
  }

  // ── Abstract Implementation: Data Extent ──────────────────────

  /** @override */
  _getDataExtent() {
    const items = this._getItems();
    if (!items.length) return { xMin: -0.5, xMax: 0.5, yMin: 0, yMax: 1 };
    const maxVal = Math.max(...items.map(d => d.value), 0);
    return {
      xMin: -0.5,
      xMax: items.length - 0.5,
      yMin: 0,
      yMax: maxVal * 1.12,
    };
  }

  // ── Abstract Implementation: Render Data ──────────────────────

  /** @override */
  _renderData(svg, plotGroup, xScale, yScale, xTick, yTick, plotArea, defs) {
    const items = this._getItems();
    if (!items.length) return;

    // Store for tooltips
    this._items = items;

    const cfg = this.config;
    const totalValue = items.reduce((s, d) => s + d.value, 0);
    const barWidth = Math.min(40, (plotArea.w / items.length) * 0.65);
    const cumColor = resolveColor(cfg.cumulativeColor || CUM_COLOR);

    // Read theme colors
    const styles = getComputedStyle(document.documentElement);
    const textSecondary = styles.getPropertyValue('--color-text-secondary').trim() || '#5a6270';
    const textPrimary = styles.getPropertyValue('--color-text-primary').trim() || '#1a1a2e';

    // ── Bars ────────────────────────────────────────────────────
    const defaultOpacity = cfg.barOpacity ?? 0.75;

    items.forEach((d, i) => {
      const cx = xScale(i);
      const yTop = yScale(d.value);
      const yBase = yScale(0);
      const h = yBase - yTop;
      if (h <= 0) return;

      const color = d.color ? resolveColor(d.color) : resolveColor('var(--color-chart-1)');
      const opacity = d.opacity ?? defaultOpacity;
      const bx = cx - barWidth / 2;

      // Color fill
      svgEl('rect', {
        x: bx, y: yTop, width: barWidth, height: h,
        rx: 3, fill: color, 'fill-opacity': opacity,
      }, plotGroup);

      // Pattern overlay
      if (d.pattern && d.pattern !== '') {
        const patId = `pareto-pat-${this._uid}-${i}`;
        createPattern(defs, patId, {
          pattern: d.pattern,
          color: color,
          patternSolidity: 0.6,
        });
        svgEl('rect', {
          x: bx, y: yTop, width: barWidth, height: h,
          rx: 3, fill: `url(#${patId})`,
        }, plotGroup);
      }

      // Score label above bar
      svgText(formatNum(d.value, 1, this.locale), {
        x: cx, y: yTop - 5,
        'text-anchor': 'middle',
        'font-size': '10px',
        'font-weight': '700',
        fill: color,
      }, plotGroup);
    });

    // ── Cumulative % line (secondary Y axis: 0–105%) ────────────
    if (totalValue > 0) {
      // Scale goes to 105% so the 100% point is not clipped at the top edge
      const cumScale = (pct) => plotArea.y + plotArea.h - (pct / 105) * plotArea.h;

      let cumSum = 0;
      const pts = [];
      items.forEach((d, i) => {
        cumSum += d.value;
        const pct = (cumSum / totalValue) * 100;
        pts.push({ x: xScale(i), y: cumScale(pct), pct });
      });

      // Cumulative line
      const polyPoints = pts.map(p => `${p.x},${p.y}`).join(' ');
      const lineAttrs = {
        points: polyPoints,
        fill: 'none',
        stroke: cumColor,
        'stroke-width': cfg.cumWidth ?? 2,
      };
      const da = dashArray(cfg.cumDash, cfg.cumWidth ?? 2);
      if (da !== 'none') lineAttrs['stroke-dasharray'] = da;
      svgEl('polyline', lineAttrs, plotGroup);

      // Cumulative dots
      const dotFill = resolveColor(cfg.cumDotFill || cumColor);
      const dotStroke = resolveColor(cfg.cumDotStroke || '#ffffff');
      const dotSW = cfg.cumDotStrokeWidth ?? 1.5;
      const dotR = cfg.cumDotSize ?? 3.5;
      const dotSymbol = cfg.cumDotSymbol || 'circle';

      pts.forEach(p => {
        drawMarker(plotGroup, dotSymbol, p.x, p.y, dotR, dotFill, dotStroke, dotSW, {});
      });

      // Threshold reference line (e.g. 80%)
      const refVal = cfg.refLineValue ?? 80;
      if (refVal > 0) {
        const yRef = cumScale(refVal);
        const refColor = resolveColor(cfg.refLineColor || cumColor);
        const refAttrs = {
          x1: plotArea.x, y1: yRef,
          x2: plotArea.x + plotArea.w, y2: yRef,
          stroke: refColor,
          'stroke-opacity': 0.4,
          'stroke-width': cfg.refLineWidth ?? 1,
        };
        const refDa = dashArray(cfg.refLineDash || 'dash', cfg.refLineWidth ?? 1);
        if (refDa !== 'none') refAttrs['stroke-dasharray'] = refDa;
        svgEl('line', refAttrs, plotGroup);

        // Label on right edge
        svgText(refVal + '%', {
          x: plotArea.x + plotArea.w + 8,
          y: yRef + 3,
          'text-anchor': 'start',
          'font-size': '10px',
          'font-weight': '600',
          fill: refColor,
          'fill-opacity': 0.6,
        }, svg);
      }

      // Right-side Y axis: cumulative % ticks + tick labels
      const tickColor = textSecondary;
      [0, 25, 50, 75, 100].forEach(pct => {
        const y = cumScale(pct);
        svgEl('line', {
          x1: plotArea.x + plotArea.w, y1: y,
          x2: plotArea.x + plotArea.w + 5, y2: y,
          stroke: tickColor, 'stroke-width': 1,
        }, svg);
        svgText(pct + '%', {
          x: plotArea.x + plotArea.w + 8,
          y: y + 4,
          'text-anchor': 'start',
          'font-size': '11px',
          fill: tickColor,
        }, svg);
      });

      // Right Y-axis label (rotated)
      const rLabelX = plotArea.x + plotArea.w + PARETO_MARGIN.right - 10;
      const rLabelY = plotArea.y + plotArea.h / 2;
      svgText(cfg.rightYLabel || 'Kumulativ %', {
        x: rLabelX,
        y: rLabelY,
        'text-anchor': 'middle',
        'font-size': '12px',
        'font-weight': '600',
        fill: textPrimary,
        'font-family': FONT_MAIN,
        transform: `rotate(90, ${rLabelX}, ${rLabelY})`,
      }, svg);
    }

    // ── Rotated X-axis labels ───────────────────────────────────
    items.forEach((d, i) => {
      const cx = xScale(i);
      const label = d.name.length > 16 ? d.name.substring(0, 14) + '\u2026' : d.name;
      const txt = svgText(label, {
        x: 0, y: 0,
        'text-anchor': 'start',
        'font-size': '10px',
        fill: textSecondary,
        transform: `translate(${cx}, ${plotArea.y + plotArea.h + 8}) rotate(40)`,
      }, svg);
      txt.style.pointerEvents = 'none';
    });
  }

  // ── Abstract Implementation: Legend Items ──────────────────────

  /** @override */
  _getLegendItems() {
    return [];
  }

  // ── Series Descriptors (for base editor) ────────────────────────

  /** @override */
  _getSeriesDescriptors() {
    const cfg = this.config;
    return [{
      index: 0,
      getName: () => 'Cumulative',
      setName: () => {},
      getColor: () => cfg.cumDotFill || CUM_COLOR,
      setColor: (c) => { cfg.cumDotFill = c; },
      isVisible: () => true,
      setVisible: () => {},
      getSymbol: () => cfg.cumDotSymbol || 'circle',
      setSymbol: (v) => { cfg.cumDotSymbol = v; },
      getSize: () => (cfg.cumDotSize ?? 3.5) * 2,
      setSize: (v) => { cfg.cumDotSize = v / 2; },
      getStroke: () => cfg.cumDotStroke || '#ffffff',
      setStroke: (v) => { cfg.cumDotStroke = v; },
      getStrokeWidth: () => cfg.cumDotStrokeWidth ?? 1.5,
      setStrokeWidth: (v) => { cfg.cumDotStrokeWidth = v; },
    }];
  }

  // ── Abstract Implementation: Find Nearby ──────────────────────

  /** @override */
  _findNearby(dataX, dataY, proximityPx) {
    const items = this._items;
    if (!items || !items.length) return [];

    const idx = Math.round(dataX);
    if (idx < 0 || idx >= items.length) return [];

    const d = items[idx];
    if (dataY < 0 || dataY > d.value * 1.15) return [];

    const totalValue = items.reduce((s, it) => s + it.value, 0);
    let cumSum = 0;
    for (let i = 0; i <= idx; i++) cumSum += items[i].value;
    const cumPct = totalValue > 0 ? ((cumSum / totalValue) * 100).toFixed(1) : '0';

    const px = this._xScale(idx);
    const py = this._yScale(d.value);

    return [{
      html: `<b>${d.name}</b><br>`
        + `${formatNum(d.value, 1, this.locale)}<br>`
        + `Σ ${cumPct}%`,
      px, py,
      color: d.color || 'var(--color-chart-1)',
    }];
  }
}
