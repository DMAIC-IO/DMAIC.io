/**
 * trend.js — Hypothesis-score trend chart for the D.Mike chart framework.
 *
 * Behaviour-preserving port of the Ishikawa module's former bespoke
 * `renderTrend()` *canvas* render (CANVAS → SVG). One polyline per hypothesis
 * across an ordered list of snapshot "states" (oldest → current). The x-axis is
 * a CATEGORICAL state index (0 … xCount-1), the y-axis a FIXED 0…9 score domain.
 * Per state a vertical grid line + a two-line x label (date / truncated name);
 * per integer score a horizontal grid line + a right-aligned mono label. Each
 * series draws a white halo dot under a coloured dot, plus a bold value label
 * above the point. An interactive legend (drawn in `_renderData`) toggles series
 * visibility.
 *
 * Geometry parity: the framework's primary x/yScale come from `generateTicks`-
 * NICED bounds + padding, so they DON'T land on the true plot edges
 * (xScale(0) ≠ pa.x, yScale(9) ≠ pa.top). Drawing data with them would shift the
 * geometry ~8–17%. Therefore ALL data + axes/labels use LOCAL scales pinned to
 * the RAW extents and the real plot area, exactly as the legacy canvas code did
 * and as gantt.js / cumulative-cost.js do:
 *   xPos(i) = pa.x + (xCount===1 ? 0 : (i/(xCount-1)) * pa.w)   // state index → px
 *   yPos(v) = pa.y + (1 - v/9) * pa.h                            // fixed 0..9 domain
 * The same local mapping is reused by `_findNearby` so the tooltip ring lands on
 * the data point.
 *
 * Config (precomputed by `computeTrendConfig()` in the ishikawa module — pure,
 * unit-tested):
 *   {
 *     series: [{ sid, name, color, points:[{x,y}], visible }],
 *     xLabels: [{ date, name }],   // one per state
 *     xCount, yDomain: [0,9],
 *     layout: { padT, padR, padB, padL },
 *   }
 */

import ChartBase from '../chart-base.js';
import { h } from '../../dom.js';
import { svgEl, svgText, resolveColor } from '../chart-core.js';

const FONT_MAIN = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const FONT_MONO = "'SF Mono', 'Cascadia Code', Consolas, 'Liberation Mono', monospace";

const GRID_COLOR = 'rgba(128,128,128,0.15)';
const GRID_LABEL = 'rgba(128,128,128,0.5)';

export default class TrendChart extends ChartBase {
  /**
   * @param {HTMLElement} container
   * @param {Object} config
   * @param {Object} context
   */
  constructor(container, config, context) {
    const defaults = {
      series: [],
      xLabels: [],
      xCount: 0,
      yDomain: [0, 9],
      layout: { padT: 30, padR: 30, padB: 55, padL: 45 },
      // Pin extents — no auto-padding, so the (hidden) framework scales line up
      // with the module-owned geometry.
      xMin: 0,
      xMax: Math.max(1, ((config && config.xCount) || 1) - 1),
      yMin: 0,
      yMax: 9,
      // Suppress every standard decoration; the trend draws its own grid,
      // labels, ticks and interactive legend in _renderData.
      categoricalX: true,
      categoricalY: true,
      showXTicks: false,
      showYTicks: false,
      showXLabel: false,
      showYLabel: false,
      showTitle: false,
      showLegend: false,
      showCrosshair: false,
    };
    super(container, Object.assign(defaults, config), context);
    this.config.xMin = 0;
    this.config.xMax = Math.max(1, (this.config.xCount || 1) - 1);
    this.config.yMin = 0;
    this.config.yMax = 9;
  }

  // ── Layout override — fixed margins matching the legacy canvas pad ──

  /** @override */
  _getPlotArea() {
    const size = this._getSize();
    const L = this.config.layout || {};
    const left = L.padL != null ? L.padL : 45;
    const top = L.padT != null ? L.padT : 30;
    const right = L.padR != null ? L.padR : 30;
    const bottom = L.padB != null ? L.padB : 55;
    return {
      x: left,
      y: top,
      w: Math.max(1, size.w - left - right),
      h: Math.max(1, size.h - top - bottom),
      totalW: size.w,
      totalH: size.h,
      rMargin: right,
    };
  }

  // ── Abstract: data extent (categorical x index; fixed 0..9 y) ──

  /** @override */
  _getDataExtent() {
    return { xMin: 0, xMax: Math.max(1, (this.config.xCount || 1) - 1), yMin: 0, yMax: 9 };
  }

  // ── Abstract: render grid, labels, polylines, dots, interactive legend ──

  /** @override */
  _renderData(svg, plotGroup, xScale, yScale, xTick, yTick, plotArea, _defs) {
    const cfg = this.config;
    const series = cfg.series || [];
    const xLabels = cfg.xLabels || [];
    const xCount = cfg.xCount || xLabels.length || 0;
    if (!series.length || xCount < 1) return;

    const pa = plotArea;

    // ── Local scales pinned to the RAW extents (legacy parity) ──────
    const xPos = (i) => pa.x + (xCount === 1 ? 0 : (i / (xCount - 1)) * pa.w);
    const yPos = (v) => pa.y + (1 - v / 9) * pa.h;
    this._localXPos = xPos;
    this._localYPos = yPos;

    // ── Y grid: integers 0..9 + right-aligned mono labels ───────────
    for (let i = 0; i <= 9; i++) {
      const y = yPos(i);
      svgEl('line', {
        x1: pa.x, y1: y, x2: pa.x + pa.w, y2: y,
        stroke: GRID_COLOR, 'stroke-width': 1,
      }, svg);
      svgText(String(i), {
        x: pa.x - 8, y: y + 4,
        'text-anchor': 'end', 'font-size': '11', fill: GRID_LABEL, 'font-family': FONT_MONO,
      }, svg);
    }

    // ── X grid: one vertical line per state + two-line x label ───────
    xLabels.forEach((lbl, i) => {
      const x = xPos(i);
      svgEl('line', {
        x1: x, y1: pa.y, x2: x, y2: pa.y + pa.h,
        stroke: GRID_COLOR, 'stroke-width': 1,
      }, svg);
      svgText(lbl.date || '', {
        x, y: pa.y + pa.h + 6 + 9,
        'text-anchor': 'middle', 'font-size': '10', fill: GRID_LABEL, 'font-family': FONT_MONO,
      }, svg);
      svgText(lbl.name || '', {
        x, y: pa.y + pa.h + 20 + 9,
        'text-anchor': 'middle', 'font-size': '10', fill: GRID_LABEL, 'font-family': FONT_MONO,
      }, svg);
    });

    // ── Series: polyline + halo/coloured dots + bold value labels ───
    const hitPoints = [];
    series.forEach((s) => {
      if (s.visible === false) return;
      const col = resolveColor(s.color);
      const pts = s.points || [];
      if (!pts.length) return;

      // Polyline.
      const d = pts.map((p, pi) => `${pi === 0 ? 'M' : 'L'}${xPos(p.x)},${yPos(p.y)}`).join(' ');
      svgEl('path', {
        d, fill: 'none', stroke: col, 'stroke-width': 2.5,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      }, plotGroup);

      // Dots + value labels.
      pts.forEach((p) => {
        const px = xPos(p.x);
        const py = yPos(p.y);
        svgEl('circle', { cx: px, cy: py, r: 4.5, fill: '#fff' }, plotGroup);
        svgEl('circle', { cx: px, cy: py, r: 3, fill: col }, plotGroup);
        svgText(p.y.toFixed(1), {
          x: px, y: py - 7,
          'text-anchor': 'middle', 'font-size': '10', 'font-weight': 'bold',
          fill: col, 'font-family': FONT_MONO,
        }, plotGroup);
        hitPoints.push({ px, py, name: s.name, color: col, val: p.y });
      });
    });
    this._hitPoints = hitPoints;

    // ── Interactive legend (clickable: toggles series visibility) ───
    this._drawInteractiveLegend(svg, pa);
  }

  /**
   * Hand-drawn, clickable legend. The framework's built-in `_drawLegend` is a
   * static SVG decoration (no click-to-toggle), so — to preserve the bespoke
   * interactive show/hide — the legend is drawn here with per-item click
   * handlers that flip `series[i].visible` and re-render.
   * @private
   */
  _drawInteractiveLegend(svg, pa) {
    const series = this.config.series || [];
    if (!series.length) return;

    const styles = getComputedStyle(document.documentElement);
    const textSecondary = (styles.getPropertyValue('--color-text-secondary').trim()) || '#5a6270';

    // Flow legend items across the bottom gutter (below the x labels).
    const baseY = pa.y + pa.h + 44;
    let x = pa.x;
    const rowH = 18;
    let y = baseY;
    const maxX = pa.x + pa.w;

    series.forEach((s) => {
      const label = s.name && s.name.length > 35 ? `${s.name.substring(0, 33)  }…` : (s.name || '');
      const itemW = 18 + label.length * 6.2 + 14;
      if (x + itemW > maxX && x > pa.x) { x = pa.x; y += rowH; }

      const g = svgEl('g', {
        transform: `translate(${x}, ${y})`,
        style: 'cursor:pointer',
        'data-trend-toggle': s.sid,
      }, svg);
      // Transparent hit rect so the whole item is clickable.
      svgEl('rect', {
        x: 0, y: -10, width: itemW - 8, height: 16, fill: 'transparent',
      }, g);
      const dim = s.visible === false ? 0.35 : 1;
      svgEl('circle', { cx: 5, cy: 0, r: 5, fill: resolveColor(s.color), opacity: dim }, g);
      svgText(label, {
        x: 16, y: 4, 'font-size': '11', fill: textSecondary,
        'font-family': FONT_MAIN, opacity: dim,
      }, g);

      g.addEventListener('click', () => {
        s.visible = s.visible === false;
        if (typeof this.config.onToggle === 'function') this.config.onToggle(s.sid, s.visible === false);
        this.render();
      });

      x += itemW;
    });
  }

  // ── Abstract: no framework legend (interactive one drawn in _renderData) ──

  /** @override */
  _getLegendItems() {
    return [];
  }

  // ── Editor descriptors — per-series colour/name/visibility toggle ──

  /** @override */
  _getSeriesDescriptors() {
    const series = this.config.series || [];
    return series.map((s, index) => ({
      index,
      getName: () => s.name,
      setName: (v) => { s.name = v; },
      getColor: () => resolveColor(s.color),
      setColor: (c) => { s.color = c; },
      isVisible: () => s.visible !== false,
      setVisible: (v) => { s.visible = v; },
    }));
  }

  // ── Abstract: tooltip row (● name <b>val</b>) for the nearest point ──

  /** @override */
  _findNearby(dataX, dataY, proximityPx) {
    const pts = this._hitPoints;
    if (!pts || !pts.length || !this._localXPos || !this._localYPos) return [];

    // Hit-test in the SAME local pixel space the points were drawn in.
    const mxPx = this._localXPos(dataX);
    const myPx = this._localYPos(dataY);

    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const dist = Math.sqrt((mxPx - pts[i].px) ** 2 + (myPx - pts[i].py) ** 2);
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    if (best < 0 || bestDist > proximityPx) return [];

    const p = pts[best];
    // p.name is USER INPUT → DOM textContent escapes it natively.
    const node = h('div', null,
      h('span', { style: `color:${p.color}` }, '●'),
      ` ${p.name} `,
      h('b', null, p.val.toFixed(1)),
    );
    return [{ node, px: p.px, py: p.py, color: p.color }];
  }
}
