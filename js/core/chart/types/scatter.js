/**
 * scatter.js — Scatter plot chart type for the D.Mike chart framework.
 * Supports: multiple series, 7 marker symbols, connecting lines,
 * error bars (X/Y), error bands, per-point tooltips.
 */

import ChartBase from '../chart-base.js';
import {
  svgEl, drawMarker, dashArray, resolveColor, resolveError,
  dataExtent, formatNum, createPattern, getChartColors
} from '../chart-core.js';


export default class ScatterChart extends ChartBase {
  /**
   * @param {HTMLElement} container
   * @param {Object} config
   * @param {Object} context
   */
  constructor(container, config, context) {
    const defaults = {
      series: [],
    };
    super(container, Object.assign(defaults, config), context);
  }

  // ── Abstract Implementation: Data Extent ─────────────────────────

  /** @override */
  _getDataExtent() {
    const series = (this.config.series || []).filter((s) => s.visible !== false);
    if (!series.length) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };

    const xExt = dataExtent(series, 'x');
    const yExt = dataExtent(series, 'y');

    // Include error bars in extent
    series.forEach((s) => {
      const eb = s.errorBars;
      if (!eb || !eb.show) return;
      for (let i = 0; i < s.x.length; i++) {
        if (eb.yMode && eb.yMode !== 'none') {
          if (eb.yPlus && eb.yPlus[i] != null) {
            const yp = resolveError(eb.yMode, s.y[i], eb.yPlus[i], +1);
            if (yp !== null) yExt.max = Math.max(yExt.max, yp);
          }
          if (eb.yMinus && eb.yMinus[i] != null) {
            const ym = resolveError(eb.yMode, s.y[i], eb.yMinus[i], -1);
            if (ym !== null) yExt.min = Math.min(yExt.min, ym);
          }
        }
        if (eb.xMode && eb.xMode !== 'none') {
          if (eb.xPlus && eb.xPlus[i] != null) {
            const xp = resolveError(eb.xMode, s.x[i], eb.xPlus[i], +1);
            if (xp !== null) xExt.max = Math.max(xExt.max, xp);
          }
          if (eb.xMinus && eb.xMinus[i] != null) {
            const xm = resolveError(eb.xMode, s.x[i], eb.xMinus[i], -1);
            if (xm !== null) xExt.min = Math.min(xExt.min, xm);
          }
        }
      }
    });

    return { xMin: xExt.min, xMax: xExt.max, yMin: yExt.min, yMax: yExt.max };
  }

  // ── Abstract Implementation: Render Data ─────────────────────────

  /** @override */
  _renderData(svg, plotGroup, xScale, yScale, xTick, yTick, plotArea, defs) {
    const series = this.config.series || [];
    const rawMs = this.config.markerSize;
    const markerR = (rawMs !== undefined && rawMs <= 0) ? 0 : (rawMs || 0) / 2 + 1;

    // 1) Error bands (filled polygons — behind everything)
    this._renderErrorBands(plotGroup, series, xScale, yScale, defs);

    // 2) Error bars (whiskers + caps)
    this._renderErrorBars(plotGroup, series, xScale, yScale);

    // 3) Connecting lines (background)
    this._renderConnectLines(plotGroup, series, xScale, yScale, false);

    // 4) Data markers
    this._renderMarkers(plotGroup, series, xScale, yScale, markerR);

    // 5) Foreground connecting lines (above markers)
    this._renderConnectLines(plotGroup, series, xScale, yScale, true);
  }

  /**
   * Render error bands as filled polygons.
   * @private
   */
  _renderErrorBands(plotGroup, series, xScale, yScale, defs) {
    series.forEach((s, si) => {
      if (s.visible === false) return;
      const eb = s.errorBars;
      if (!eb || !eb.show || !eb.bandShow) return;
      if (!eb.yMode || eb.yMode === 'none') return;
      if (!eb.yPlus && !eb.yMinus) return;

      const topPts = [];
      const botPts = [];
      for (let i = 0; i < s.x.length; i++) {
        const px = xScale(s.x[i]);
        const baseY = s.y[i];
        const ypv = eb.yPlus ? resolveError(eb.yMode, baseY, eb.yPlus[i], +1) : baseY;
        const ymv = eb.yMinus ? resolveError(eb.yMode, baseY, eb.yMinus[i], -1) : baseY;
        topPts.push(`${px},${yScale(ypv !== null ? ypv : baseY)}`);
        botPts.push(`${px},${yScale(ymv !== null ? ymv : baseY)}`);
      }
      botPts.reverse();
      const polyPoints = topPts.concat(botPts).join(' ');

      // Fill
      svgEl('polygon', {
        points: polyPoints,
        fill: resolveColor(eb.bandColor || 'rgba(0,0,0,0.05)'),
        stroke: 'none'
      }, plotGroup);

      // Pattern overlay
      if (eb.bandPattern && eb.bandPattern !== '') {
        const patId = `errband-pat-${this._uid}-${si}`;
        createPattern(defs, patId, {
          pattern: eb.bandPattern,
          patternColor: eb.bandPatternColor,
          patternSolidity: eb.bandPatternSolidity,
          color: eb.bandColor || s.color
        });
        svgEl('polygon', {
          points: polyPoints,
          fill: `url(#${patId})`,
          stroke: 'none'
        }, plotGroup);
      }
    });
  }

  /**
   * Render error bars (whiskers + caps).
   * @private
   */
  _renderErrorBars(plotGroup, series, xScale, yScale) {
    series.forEach((s) => {
      if (s.visible === false) return;
      const eb = s.errorBars;
      if (!eb || !eb.show) return;
      const eColor = resolveColor(eb.color || s.color);
      const eWidth = eb.width || 1.2;
      const eCap = eb.capSize !== undefined ? eb.capSize : 4;

      for (let i = 0; i < s.x.length; i++) {
        const cx = xScale(s.x[i]);
        const cy = yScale(s.y[i]);

        // Y error bars
        if (eb.yMode && eb.yMode !== 'none') {
          if (eb.yPlus && eb.yPlus[i] != null) {
            const yTop = yScale(resolveError(eb.yMode, s.y[i], eb.yPlus[i], +1));
            svgEl('line', { x1: cx, y1: cy, x2: cx, y2: yTop, stroke: eColor, 'stroke-width': eWidth }, plotGroup);
            svgEl('line', { x1: cx - eCap, y1: yTop, x2: cx + eCap, y2: yTop, stroke: eColor, 'stroke-width': eWidth }, plotGroup);
          }
          if (eb.yMinus && eb.yMinus[i] != null) {
            const yBot = yScale(resolveError(eb.yMode, s.y[i], eb.yMinus[i], -1));
            svgEl('line', { x1: cx, y1: cy, x2: cx, y2: yBot, stroke: eColor, 'stroke-width': eWidth }, plotGroup);
            svgEl('line', { x1: cx - eCap, y1: yBot, x2: cx + eCap, y2: yBot, stroke: eColor, 'stroke-width': eWidth }, plotGroup);
          }
        }

        // X error bars
        if (eb.xMode && eb.xMode !== 'none') {
          if (eb.xPlus && eb.xPlus[i] != null) {
            const xRight = xScale(resolveError(eb.xMode, s.x[i], eb.xPlus[i], +1));
            svgEl('line', { x1: cx, y1: cy, x2: xRight, y2: cy, stroke: eColor, 'stroke-width': eWidth }, plotGroup);
            svgEl('line', { x1: xRight, y1: cy - eCap, x2: xRight, y2: cy + eCap, stroke: eColor, 'stroke-width': eWidth }, plotGroup);
          }
          if (eb.xMinus && eb.xMinus[i] != null) {
            const xLeft = xScale(resolveError(eb.xMode, s.x[i], eb.xMinus[i], -1));
            svgEl('line', { x1: cx, y1: cy, x2: xLeft, y2: cy, stroke: eColor, 'stroke-width': eWidth }, plotGroup);
            svgEl('line', { x1: xLeft, y1: cy - eCap, x2: xLeft, y2: cy + eCap, stroke: eColor, 'stroke-width': eWidth }, plotGroup);
          }
        }
      }
    });
  }

  /**
   * Render connecting lines between points.
   * @private
   */
  _renderConnectLines(plotGroup, series, xScale, yScale, foregroundOnly = false) {
    series.forEach((s) => {
      if (s.visible === false) return;
      const cl = s.connectLine;
      if (!cl || !cl.show) return;
      if (!!cl.foreground !== foregroundOnly) return;
      if (s.x.length < 2) return;

      const pts = [];
      for (let i = 0; i < s.x.length; i++) {
        pts.push(`${xScale(s.x[i])},${yScale(s.y[i])}`);
      }
      const lineAttrs = {
        points: pts.join(' '),
        fill: 'none',
        stroke: resolveColor(cl.color || s.color),
        'stroke-width': cl.width || 1.5
      };
      const da = dashArray(cl.dash || 'solid', cl.width || 1.5);
      if (da !== 'none') lineAttrs['stroke-dasharray'] = da;
      svgEl('polyline', lineAttrs, plotGroup);
    });
  }

  /**
   * Render data point markers.
   * @private
   */
  _renderMarkers(plotGroup, series, xScale, yScale, markerR) {
    series.forEach((s) => {
      if (s.visible === false) return;
      // Per-series markerSize overrides global
      if (s.markerSize !== undefined && s.markerSize <= 0) return;
      const r = s.markerSize !== undefined ? s.markerSize / 2 + 1 : markerR;
      if (r <= 0) return;
      const sym = s.symbol || 'circle';
      const strokeC = resolveColor(s.stroke || 'var(--color-text-primary)');
      const strokeW = s.strokeWidth !== undefined ? s.strokeWidth : 1.5;

      for (let i = 0; i < s.x.length; i++) {
        const cx = xScale(s.x[i]);
        const cy = yScale(s.y[i]);
        drawMarker(plotGroup, sym, cx, cy, r,
          resolveColor(s.color), strokeC, strokeW, {});
      }
    });
  }

  // ── Abstract Implementation: Legend Items ────────────────────────

  /** @override */
  _getLegendItems() {
    const items = [];
    (this.config.series || []).forEach((s) => {
      if (s.visible === false) return;
      items.push({
        type: 'marker',
        color: s.color,
        stroke: s.stroke || 'var(--color-text-primary)',
        strokeWidth: s.strokeWidth !== undefined ? s.strokeWidth : 1.5,
        symbol: s.symbol || 'circle',
        label: s.name || 'Series'
      });
    });
    return items;
  }

  // ── Abstract Implementation: Find Nearby ─────────────────────────

  /** @override */
  _findNearby(dataX, dataY, proximityPx) {
    const results = [];
    const series = this.config.series || [];
    const xScale = this._xScale;
    const yScale = this._yScale;
    if (!xScale || !yScale) return results;

    const mxPx = xScale(dataX);
    const myPx = yScale(dataY);

    series.forEach((s, si) => {
      if (s.visible === false) return;
      // Still allow tooltip for line-only series (markerSize: 0)
      for (let i = 0; i < s.x.length; i++) {
        const px = xScale(s.x[i]);
        const py = yScale(s.y[i]);
        const dist = Math.sqrt((mxPx - px) ** 2 + (myPx - py) ** 2);
        if (dist <= proximityPx) {
          results.push({ si, i, dist, px, py });
        }
      }
    });

    results.sort((a, b) => a.dist - b.dist);

    const xName = (this.config.xLabel || 'X').split('(')[0].trim();
    const yName = (this.config.yLabel || 'Y').split('(')[0].trim();

    return results.map((pt) => {
      const s = series[pt.si];
      let html = `<b style="color:${resolveColor(s.color)}">${s.name || 'Series'}</b><br>`;
      html += `${xName}: ${formatNum(s.x[pt.i], null, this.locale)}<br>`;
      html += `${yName}: ${formatNum(s.y[pt.i], null, this.locale)}`;

      // Error bar info
      const eb = s.errorBars;
      if (eb && eb.show) {
        if (eb.yMode && eb.yMode !== 'none' && (eb.yMinus || eb.yPlus)) {
          const ymv = eb.yMinus ? resolveError(eb.yMode, s.y[pt.i], eb.yMinus[pt.i], -1) : null;
          const ypv = eb.yPlus ? resolveError(eb.yMode, s.y[pt.i], eb.yPlus[pt.i], +1) : null;
          if (ymv !== null || ypv !== null) {
            html += `<br><span style="opacity:.7">${yName}: `;
            html += `${ymv !== null ? formatNum(ymv, 1, this.locale) : '–'} … ${ypv !== null ? formatNum(ypv, 1, this.locale) : '–'}`;
            html += '</span>';
          }
        }
        if (eb.xMode && eb.xMode !== 'none' && (eb.xMinus || eb.xPlus)) {
          const xmv = eb.xMinus ? resolveError(eb.xMode, s.x[pt.i], eb.xMinus[pt.i], -1) : null;
          const xpv = eb.xPlus ? resolveError(eb.xMode, s.x[pt.i], eb.xPlus[pt.i], +1) : null;
          if (xmv !== null || xpv !== null) {
            html += `<br><span style="opacity:.7">${xName}: `;
            html += `${xmv !== null ? formatNum(xmv, 1, this.locale) : '–'} … ${xpv !== null ? formatNum(xpv, 1, this.locale) : '–'}`;
            html += '</span>';
          }
        }
      }

      return { html, px: pt.px, py: pt.py, color: resolveColor(s.color) };
    });
  }

  /* ── Type-Specific Editor: per-series marker styling ───── */

  /** @override */
  // Marker editing is handled globally by the series descriptors in chart-base.

  /* ── Series Descriptors (for base editor) ────────────────── */

  /** @override */
  _getSeriesDescriptors() {
    const cfg = this.config;
    const series = cfg.series || [];
    const chartColors = getChartColors();
    return series.map((s, i) => ({
      index: i,
      getName: () => s.name || `Series ${i + 1}`,
      setName: (v) => { s.name = v; },
      getColor: () => s.color || chartColors[i % chartColors.length],
      setColor: (c) => { s.color = c; },
      isVisible: () => s.visible !== false,
      setVisible: (v) => { s.visible = v; },
      getSymbol: () => s.symbol || 'circle',
      setSymbol: (v) => { s.symbol = v; },
      getSize: () => (s.markerSize !== undefined ? s.markerSize : (cfg.markerSize ?? 8)),
      setSize: (v) => { s.markerSize = v; },
      getStroke: () => s.stroke || 'var(--color-text-primary)',
      setStroke: (v) => { s.stroke = v; },
      getStrokeWidth: () => (s.strokeWidth !== undefined ? s.strokeWidth : 1.5),
      setStrokeWidth: (v) => { s.strokeWidth = v; },
    }));
  }
}
