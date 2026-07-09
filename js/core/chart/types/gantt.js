/**
 * gantt.js — Gantt timeline chart type for the D.Mike chart framework.
 *
 * Behaviour-preserving port of the Ishikawa module's former bespoke
 * `renderGantt()` SVG builder. One horizontal bar per task, laid out on a
 * TIME x-axis (ms) with a fixed-height row grid; a wide left gutter holds the
 * row labels. Adaptive date ticks across the top, an optional dashed "today"
 * line, and per-bar tooltips (label · responsible / start → end).
 *
 * The whole geometry is precomputed by `computeGanttConfig()` in the ishikawa
 * module (pure, unit-tested) and handed in as config:
 *   {
 *     tasks: [{ start, end, label, status, color, responsible, startDate, endDate }],
 *     xDomain: { minT, maxT },
 *     ticks: number[],        // ms positions
 *     tickLabels: string[],   // preformatted date labels (locale-aware)
 *     stepDays, now, showToday,
 *     layout: { labelW, padL, padR, padT, padB, rowH },
 *   }
 *
 * Geometry parity: the framework's primary `xScale` is built from
 * `generateTicks`-NICED bounds, so it does NOT land on the true plot edges
 * (xScale(minT) ≠ pa.x, xScale(maxT) ≠ pa.x+pa.w) — bars/ticks would shift and
 * compress. `_renderData` therefore draws bars, date ticks and the today line
 * with a LOCAL x scale pinned exactly to the raw `[minT,maxT] → [pa.x,
 * pa.x+pa.w]`, mirroring the legacy `xScale(t) = labelW + padL +
 * ((t-minT)/span) * innerW`. Date tick labels and row labels are drawn by hand
 * (like pareto draws its rotated labels) because they sit in the top/left
 * gutters, not on the standard tick bands. The same local mapping is reused by
 * `_findNearby` so the tooltip ring lands on the bar.
 */

import ChartBase from '../chart-base.js';
import { h } from '../../dom.js';
import { svgEl, svgText, resolveColor } from '../chart-core.js';

const FONT_MAIN = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const FONT_MONO = "'SF Mono', 'Cascadia Code', Consolas, 'Liberation Mono', monospace";

/** Truncate with an ellipsis (mirrors the module helper). */
function truncate(s, n) {
  return s.length > n ? `${s.substring(0, n - 1)  }…` : s;
}

export default class GanttChart extends ChartBase {
  /**
   * @param {HTMLElement} container
   * @param {Object} config
   * @param {Object} context
   */
  constructor(container, config, context) {
    const xDomain = (config && config.xDomain) || { minT: 0, maxT: 1 };
    const defaults = {
      tasks: [],
      ticks: [],
      tickLabels: [],
      layout: { labelW: 220, padL: 8, padR: 16, padT: 30, padB: 24, rowH: 26 },
      // Pin the time domain — no auto-padding, so xScale lines up with the
      // legacy module-owned geometry exactly.
      xMin: xDomain.minT,
      xMax: xDomain.maxT,
      // Suppress every standard decoration; the gantt draws its own labels,
      // date ticks and (no) y-grid in _renderData.
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
    // Force the pinned domain even if a global default merged a null over it.
    this.config.xMin = xDomain.minT;
    this.config.xMax = xDomain.maxT;
  }

  // ── Layout override — wide left gutter for row labels ────────────

  /** @override */
  _getPlotArea() {
    const size = this._getSize();
    const L = this.config.layout || {};
    const left = (L.labelW || 220) + (L.padL || 8);
    const top = L.padT || 30;
    const right = L.padR || 16;
    const bottom = L.padB || 24;
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

  // ── Abstract: data extent (pinned time domain, row count on Y) ───

  /** @override */
  _getDataExtent() {
    const d = this.config.xDomain || { minT: 0, maxT: 1 };
    const tasks = this.config.tasks || [];
    return { xMin: d.minT, xMax: d.maxT, yMin: 0, yMax: Math.max(1, tasks.length) };
  }

  // ── Abstract: render the bars, row labels, date ticks, today line ─

  /** @override */
  _renderData(svg, plotGroup, xScale, yScale, xTick, yTick, plotArea, _defs) {
    const cfg = this.config;
    const tasks = cfg.tasks || [];
    if (!tasks.length) return;

    const pa = plotArea;
    const L = cfg.layout || {};
    const labelW = L.labelW || 220;
    const padT = L.padT || 30;
    const rowH = L.rowH || 26;
    const ticks = cfg.ticks || [];
    const tickLabels = cfg.tickLabels || [];

    // ── Local x scale pinned to the RAW time domain (legacy parity) ──
    // The framework's primary xScale is built from generateTicks-NICED bounds,
    // so xScale(minT) ≠ pa.x and xScale(maxT) ≠ pa.x+pa.w — bars and ticks would
    // be shifted/compressed. Mirror the bespoke `xScale(t) = labelW + padL +
    // ((t-minT)/span)*innerW` exactly: [minT,maxT] → [pa.x, pa.x+pa.w].
    const dom = cfg.xDomain || { minT: 0, maxT: 1 };
    const minT = dom.minT;
    const maxT = dom.maxT;
    const span = Math.max(maxT - minT, 86400000);
    const localX = (t) => pa.x + ((t - minT) / span) * pa.w;

    const styles = getComputedStyle(document.documentElement);
    const get = (p, fb) => styles.getPropertyValue(p).trim() || fb;
    const borderSecondary = get('--color-border-secondary', '#e8ebef');
    const textTertiary = get('--color-text-tertiary', '#9aa0a8');
    const textPrimary = get('--color-text-primary', '#1a1a2e');
    const accent = get('--color-accent', '#2563eb');

    const rowsBottom = padT + tasks.length * rowH;

    // ── Date tick lines + labels (top gutter) ───────────────────────
    ticks.forEach((t, i) => {
      const x = localX(t);
      svgEl('line', {
        x1: x, y1: padT - 4, x2: x, y2: rowsBottom,
        stroke: borderSecondary, 'stroke-width': 1,
      }, svg);
      svgText(tickLabels[i] != null ? tickLabels[i] : '', {
        x, y: padT - 8,
        'text-anchor': 'middle', 'font-size': '10', fill: textTertiary,
        'font-family': FONT_MONO,
      }, svg);
    });

    // ── Today line (dashed, accent) ────────────────────────────────
    if (cfg.showToday && typeof cfg.now === 'number') {
      const x = localX(cfg.now);
      svgEl('line', {
        x1: x, y1: padT - 6, x2: x, y2: rowsBottom,
        stroke: accent, 'stroke-width': 1.5, 'stroke-dasharray': '3,3',
      }, svg);
      svgText(cfg.todayLabel || 'Today', {
        x: x + 4, y: padT - 8,
        'font-size': '10', fill: accent, 'font-family': FONT_MONO,
      }, svg);
    }

    // ── Bars + row labels ──────────────────────────────────────────
    const barPositions = [];
    tasks.forEach((it, i) => {
      const y = padT + i * rowH + 4;
      const barH = rowH - 10;
      const x1 = localX(it.start);
      const x2 = localX(it.end);
      const w = Math.max(2, x2 - x1);

      // Row label in the left gutter.
      svgText(truncate(it.label, 30), {
        x: labelW - 8, y: y + barH / 2 + 4,
        'text-anchor': 'end', 'font-size': '11', fill: textPrimary,
        'font-family': FONT_MAIN,
      }, svg);

      // Bar.
      svgEl('rect', {
        x: x1, y, width: w, height: barH,
        rx: 3, ry: 3, fill: resolveColor(it.color || '#94a3b8'), opacity: 0.85,
      }, plotGroup);

      barPositions.push({ x: x1 + w / 2, y: y + barH / 2 });
    });
    this._barPositions = barPositions;
    // Stash the LOCAL x mapping so _findNearby hit-tests in the same pixel
    // space the bars were drawn in (the framework _xScale is niced and would
    // land the tooltip ring off the bar).
    this._localX = localX;
  }

  // ── Abstract: no legend ──────────────────────────────────────────

  /** @override */
  _getLegendItems() {
    return [];
  }

  // ── Abstract: tooltip rows (label · responsible / start → end) ───

  /** @override */
  _findNearby(dataX, dataY, proximityPx) {
    const tasks = this.config.tasks || [];
    const pos = this._barPositions;
    if (!tasks.length || !pos || !this._localX || !this._yScale) return [];

    // Hit-test in the SAME local-x pixel space the bars were drawn in.
    const mxPx = this._localX(dataX);
    const myPx = this._yScale(dataY);

    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < pos.length; i++) {
      const dist = Math.sqrt((mxPx - pos[i].x) ** 2 + (myPx - pos[i].y) ** 2);
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    if (best < 0 || bestDist > proximityPx) return [];

    const it = tasks[best];
    // label + responsible are USER INPUT → DOM textContent escapes them natively.
    const resp = it.responsible ? ` · ${it.responsible}` : '';
    const node = h('div', null,
      h('b', { style: `color:${resolveColor(it.color)}` }, `${it.label}${resp}`),
      h('br'),
      `${it.startDate} → ${it.endDate}`,
    );
    return [{ node, px: pos[best].x, py: pos[best].y, color: resolveColor(it.color) }];
  }
}
