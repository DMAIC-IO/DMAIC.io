/**
 * cumulative-cost.js — Dual-axis cost timeline chart for the D.Mike framework.
 *
 * Behaviour-preserving port of the Ishikawa module's former bespoke
 * `renderCostChart(mode)` SVG builder. Two money/hours series over a TIME x-axis
 * (ms), drawn against TWO independent y-scales: money on the LEFT, hours on the
 * RIGHT. Rendered as TWO instances — `mode='cumulative'` (running totals, units
 * € / h) and `mode='rate'` (per-day step shape, units €/d / h/d).
 *
 * Dual-axis follows the PARETO pattern (zero ChartBase changes):
 *   - `_getPlotArea()` reserves a wide left gutter (legend + money-axis labels)
 *     and a right margin (hours-axis labels).
 *   - ALL data + hand-drawn axes use LOCAL scales pinned to the raw extents,
 *     NOT the framework's primary x/yScale. The framework scales come from
 *     `generateTicks`-NICED bounds, so they do not land on the true plot edges
 *     (xScale(minT) ≠ pa.x, yScale(0) ≠ baseline) — the curves would float off
 *     the hand-drawn axis labels. `_renderData` defines `localX`
 *     `[minT,maxT]→[pa.x,pa.x+pa.w]`, `yMoney` `[0,peakMoney]→[baseline,top]`
 *     and `yHours` `[0,peakHours]→[baseline,top]`, matching the bespoke
 *     scales exactly so money 0→baseline / peak→top and time spans full width.
 *   - The legend, axis labels and date ticks are written onto the unclipped
 *     `svg` arg (they live in the gutters, not inside the clipped plot group).
 *
 * Geometry is precomputed by `computeCostConfig()` in the ishikawa module
 * (pure, unit-tested) and handed in as config:
 *   {
 *     mode, moneyPts: [{t,v}], hoursPts: [{t,v}],
 *     peakMoney, peakHours, xDomain: { min, max },
 *     ticks: number[], tickLabels: string[], stepDays,
 *     moneyUnit, hoursUnit, now, showToday, lang,
 *     layout: { labelW, padL, padR, padT, padB, innerH },
 *   }
 *
 * The pinned `xMin/xMax` config still feeds `_getDataExtent` (auto-range +
 * tooltip hit-testing), but the DRAWING uses the local `localX` above so the
 * time axis lands exactly on `[pa.x, pa.x+pa.w]`.
 *
 * The cost chart has NO hover tooltip in the original → `_findNearby()` → [].
 */

import ChartBase from '../chart-base.js';
import { svgEl, svgText, resolveColor } from '../chart-core.js';

const FONT_MAIN = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const FONT_MONO = "'SF Mono', 'Cascadia Code', Consolas, 'Liberation Mono', monospace";

/** Literal series colours — kept for visual parity with the legacy SVG. */
const MONEY_COLOR = '#16a34a';
const HOURS_COLOR = '#2563eb';

export default class CumulativeCost extends ChartBase {
  /**
   * @param {HTMLElement} container
   * @param {Object} config
   * @param {Object} context
   */
  constructor(container, config, context) {
    const dom = (config && config.xDomain) || { min: 0, max: 1 };
    const defaults = {
      mode: 'cumulative',
      moneyPts: [],
      hoursPts: [],
      peakMoney: 0,
      peakHours: 0,
      ticks: [],
      tickLabels: [],
      moneyUnit: '€',
      hoursUnit: 'h',
      layout: { labelW: 220, padL: 8, padR: 48, padT: 16, padB: 28, innerH: 140 },
      // Pin the time domain — no auto-padding, so xScale lines up with the
      // legacy module-owned geometry exactly.
      xMin: dom.min,
      xMax: dom.max,
      // Suppress every standard decoration; this type draws its own axis
      // labels, legend, date ticks and baseline in _renderData. The framework
      // primary yScale still drives the (hidden) LEFT money axis.
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
    this.config.xMin = dom.min;
    this.config.xMax = dom.max;
  }

  // ── Layout override — wide left gutter (legend + money axis), right axis ──

  /** @override */
  _getPlotArea() {
    const size = this._getSize();
    const L = this.config.layout || {};
    const left = (L.labelW || 220) + (L.padL || 8);
    const top = L.padT || 16;
    const right = L.padR || 48;
    const bottom = L.padB || 28;
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

  // ── Abstract: data extent (pinned time domain; y = money domain) ──

  /** @override */
  _getDataExtent() {
    const d = this.config.xDomain || { min: 0, max: 1 };
    const maxMoney = Math.max(this.config.peakMoney || 0, 1);
    return { xMin: d.min, xMax: d.max, yMin: 0, yMax: maxMoney };
  }

  // ── Abstract: render the two paths, axes, ticks, today line, legend ──

  /** @override */
  _renderData(svg, plotGroup, xScale, yScale, xTick, yTick, plotArea, _defs) {
    const cfg = this.config;
    const moneyPts = cfg.moneyPts || [];
    const hoursPts = cfg.hoursPts || [];
    if (!moneyPts.length && !hoursPts.length) return;

    const pa = plotArea;
    const ticks = cfg.ticks || [];
    const tickLabels = cfg.tickLabels || [];
    const maxMoney = Math.max(cfg.peakMoney || 0, 1);
    const maxHours = Math.max(cfg.peakHours || 0, 1);

    // ── Local scales pinned to the RAW extents (legacy parity) ──────
    // The framework's primary xScale/yScale are built from generateTicks-NICED
    // bounds, so they DON'T land on the true plot edges (xScale(minT) ≠ pa.x,
    // yScale(0) ≠ baseline). Draw every datum + hand-drawn axis with local
    // scales pinned exactly to [minT,maxT]→[pa.x,pa.x+pa.w] and
    // [0,peak]→[baseline,top], mirroring the bespoke `xScale`/`yMoney`/`yHours`.
    const dom = cfg.xDomain || { min: 0, max: 1 };
    const minT = dom.min;
    const maxT = dom.max;
    const span = Math.max(maxT - minT, 86400000);
    const localX = (t) => pa.x + ((t - minT) / span) * pa.w;
    const yMoney = (v) => pa.y + pa.h - (v / maxMoney) * pa.h;
    const yHours = (v) => pa.y + pa.h - (v / maxHours) * pa.h;

    const styles = getComputedStyle(document.documentElement);
    const get = (p, fb) => styles.getPropertyValue(p).trim() || fb;
    const borderSecondary = get('--color-border-secondary', '#e8ebef');
    const borderPrimary = get('--color-border-primary', '#c8cdd3');
    const textTertiary = get('--color-text-tertiary', '#9aa0a8');
    const textSecondary = get('--color-text-secondary', '#5a6270');
    const accent = get('--color-accent', '#2563eb');

    const moneyColor = resolveColor(MONEY_COLOR);
    const hoursColor = resolveColor(HOURS_COLOR);

    // ── Baseline (x-axis) ──────────────────────────────────────────
    svgEl('line', {
      x1: pa.x, y1: pa.y + pa.h, x2: pa.x + pa.w, y2: pa.y + pa.h,
      stroke: borderPrimary, 'stroke-width': 1,
    }, svg);

    // ── Date tick lines + labels ───────────────────────────────────
    ticks.forEach((t, i) => {
      const x = localX(t);
      svgEl('line', {
        x1: x, y1: pa.y, x2: x, y2: pa.y + pa.h,
        stroke: borderSecondary, 'stroke-width': 1,
      }, svg);
      svgText(tickLabels[i] != null ? tickLabels[i] : '', {
        x, y: pa.y + pa.h + 14,
        'text-anchor': 'middle', 'font-size': '10', fill: textTertiary,
        'font-family': FONT_MONO,
      }, svg);
    });

    // ── Today line (dashed, accent) ────────────────────────────────
    if (cfg.showToday && typeof cfg.now === 'number') {
      const x = localX(cfg.now);
      svgEl('line', {
        x1: x, y1: pa.y, x2: x, y2: pa.y + pa.h,
        stroke: accent, 'stroke-width': 1.5, 'stroke-dasharray': '3,3',
      }, svg);
    }

    // ── Money path (LEFT axis = local yMoney) ──────────────────────
    if (moneyPts.length) {
      const d = moneyPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${localX(p.t)},${yMoney(p.v)}`).join(' ');
      svgEl('path', {
        d, fill: 'none', stroke: moneyColor, 'stroke-width': 2,
      }, plotGroup);
    }

    // ── Hours path (RIGHT axis = local yHours) ─────────────────────
    if (hoursPts.length) {
      const d = hoursPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${localX(p.t)},${yHours(p.v)}`).join(' ');
      svgEl('path', {
        d, fill: 'none', stroke: hoursColor, 'stroke-width': 2, 'stroke-dasharray': '4,2',
      }, plotGroup);
    }

    // ── LEFT axis labels (money) ───────────────────────────────────
    const fmtMoney = (v) => v.toLocaleString(cfg.lang === 'de' ? 'de-DE' : 'en-GB', { maximumFractionDigits: 0 });
    const fmtHours = (v) => v.toLocaleString(cfg.lang === 'de' ? 'de-DE' : 'en-GB', { maximumFractionDigits: 1 });
    svgText(`${fmtMoney(cfg.peakMoney || 0)} ${cfg.moneyUnit}`, {
      x: pa.x - 4, y: pa.y + 4,
      'font-size': '10', 'text-anchor': 'end', fill: moneyColor, 'font-family': FONT_MONO,
    }, svg);
    svgText('0', {
      x: pa.x - 4, y: pa.y + pa.h - 2,
      'font-size': '10', 'text-anchor': 'end', fill: moneyColor, 'font-family': FONT_MONO,
    }, svg);

    // ── RIGHT axis labels (hours) ──────────────────────────────────
    svgText(`${fmtHours(cfg.peakHours || 0)} ${cfg.hoursUnit}`, {
      x: pa.x + pa.w + 4, y: pa.y + 4,
      'font-size': '10', 'text-anchor': 'start', fill: hoursColor, 'font-family': FONT_MONO,
    }, svg);
    svgText('0', {
      x: pa.x + pa.w + 4, y: pa.y + pa.h - 2,
      'font-size': '10', 'text-anchor': 'start', fill: hoursColor, 'font-family': FONT_MONO,
    }, svg);

    // ── Legend (left gutter, two rows) ─────────────────────────────
    // Hand-drawn (like pareto's decorations): the original legend sits in the
    // LEFT gutter at translate(labelW-8, padT+innerH/2), which the framework's
    // right-side legend cannot reproduce. Lines at gutter-relative x and the
    // green-solid / blue-dashed swatches match the bespoke geometry.
    const gx = (cfg.layout.labelW || 220) - 8;
    const gy = pa.y + pa.h / 2;
    const g = svgEl('g', { transform: `translate(${gx}, ${gy})` }, svg);
    svgEl('line', { x1: -70, y1: -8, x2: -50, y2: -8, stroke: moneyColor, 'stroke-width': 2 }, g);
    svgText(cfg.moneyLabel || 'Money', {
      x: -46, y: -4, 'font-size': '11', fill: textSecondary, 'font-family': FONT_MAIN,
    }, g);
    svgEl('line', { x1: -70, y1: 10, x2: -50, y2: 10, stroke: hoursColor, 'stroke-width': 2, 'stroke-dasharray': '4,2' }, g);
    svgText(cfg.hoursLabel || 'Hours', {
      x: -46, y: 14, 'font-size': '11', fill: textSecondary, 'font-family': FONT_MAIN,
    }, g);
  }

  // ── Abstract: no framework legend (hand-drawn in _renderData) ──

  /** @override */
  _getLegendItems() {
    return [];
  }

  // ── Abstract: no tooltip (the bespoke cost chart had none) ──

  /** @override */
  _findNearby() {
    return [];
  }
}
