/**
 * interval-stack.js — Stacked confidence intervals for the D.Mike chart framework.
 *
 * One row per sample, each row holding one or two horizontal segments
 * (lo … hi) on a shared value axis, plus a vertical reference line at the true
 * value. Rows are stacked top-down: rows[0] is the newest and sits on top. A
 * segment that misses the reference carries the `--miss` modifier; a `kind`
 * becomes `chart-interval__segment--<kind>`. All colours come from chart.css
 * via those classes — nothing is painted inline.
 *
 * Geometry: like trend.js, data and ticks use a LOCAL x scale pinned to the raw
 * `xDomain` (the framework's primary scale is niced and would not land on the
 * plot edges). Segments are clipped to the domain.
 *
 * Config:
 *   {
 *     xDomain: [lo, hi], xLabel: string,
 *     reference: { value: number, label: string },
 *     rows: [{ segments: [{ lo, hi, hit: boolean, kind?: string }] }],
 *     capacity?: number,                 // row slots reserved (default rows.length)
 *     legend?: [{ kind: string, label: string }],
 *   }
 */

import ChartBase, { X_TICKS_BOTTOM } from '../chart-base.js';
import { svgEl, svgText, generateTicks, formatNum } from '../chart-core.js';

/** Height of the band above the plot for the reference label and legend. */
const TOP_BAND = 18;

export default class IntervalStackChart extends ChartBase {
  /**
   * @param {HTMLElement} container
   * @param {Object} config
   * @param {Object} context
   */
  constructor(container, config, context) {
    const defaults = {
      xDomain: [0, 1],
      reference: null,
      rows: [],
      legend: [],
      categoricalX: true,
      categoricalY: true,
      showXTicks: false,
      showYTicks: false,
      showYLabel: false,
      showTitle: false,
      showLegend: false,
      showCrosshair: false,
    };
    super(container, Object.assign(defaults, config), context);
    const [lo, hi] = this.config.xDomain;
    Object.assign(this.config, { xMin: lo, xMax: hi, yMin: 0, yMax: 1 });
  }

  /** @override Tick labels are drawn by the type, below the plot. */
  _getBottomTickGutter() {
    return X_TICKS_BOTTOM;
  }

  /** @override Band for the reference label and the legend. */
  _getTopGutter() {
    return TOP_BAND;
  }

  /** @override */
  _getDataExtent() {
    const [lo, hi] = this.config.xDomain;
    return { xMin: lo, xMax: hi, yMin: 0, yMax: 1 };
  }

  /** @override */
  _renderData(svg, plotGroup, xScale, yScale, xTick, yTick, pa) {
    const cfg = this.config;
    const [d0, d1] = cfg.xDomain;
    const clamp = (v) => Math.min(d1, Math.max(d0, v));
    const xPos = (v) => pa.x + ((clamp(v) - d0) / (d1 - d0)) * pa.w;

    // ── X ticks on the raw domain ──
    const ticks = generateTicks(d0, d1).ticks.filter((v) => v >= d0 - 1e-9 && v <= d1 + 1e-9);
    ticks.forEach((v) => {
      const x = xPos(v);
      svgEl('line', {
        class: 'chart-interval__tick', x1: x, y1: pa.y + pa.h, x2: x, y2: pa.y + pa.h + 5,
      }, svg);
      svgText(formatNum(v, null, this.locale), {
        class: 'chart-interval__tick-label', x, y: pa.y + pa.h + 18, 'text-anchor': 'middle',
      }, svg);
    });

    // ── Rows: newest on top, one line per segment within the row ──
    const rows = cfg.rows || [];
    const slots = Math.max(cfg.capacity || 0, rows.length, 1);
    const slotH = pa.h / slots;
    rows.forEach((row, i) => {
      const segs = row.segments || [];
      const width = Math.max(1, Math.min(3, (slotH * 0.6) / Math.max(1, segs.length)));
      segs.forEach((seg, k) => {
        if (!Number.isFinite(seg.lo) || !Number.isFinite(seg.hi)) return;
        const y = pa.y + i * slotH + ((k + 1) * slotH) / (segs.length + 1);
        const cls = ['chart-interval__segment'];
        if (seg.kind) cls.push(`chart-interval__segment--${seg.kind}`);
        if (!seg.hit) cls.push('chart-interval__segment--miss');
        svgEl('line', {
          class: cls.join(' '), x1: xPos(seg.lo), y1: y, x2: xPos(seg.hi), y2: y, 'stroke-width': width,
        }, plotGroup);
      });
    });

    // ── Reference line and its label above the plot ──
    if (cfg.reference && Number.isFinite(cfg.reference.value)) {
      const x = xPos(cfg.reference.value);
      svgEl('line', { class: 'chart-interval__reference', x1: x, y1: pa.y, x2: x, y2: pa.y + pa.h }, svg);
      if (cfg.reference.label) {
        svgText(cfg.reference.label, {
          class: 'chart-interval__label', x, y: pa.y - 6, 'text-anchor': 'middle',
        }, svg);
      }
    }

    // ── Legend: right-aligned in the band above the plot ──
    let right = pa.x + pa.w;
    [...(cfg.legend || [])].reverse().forEach((item) => {
      const text = svgText(item.label, {
        class: 'chart-interval__label', x: right, y: pa.y - 6, 'text-anchor': 'end',
      }, svg);
      const textW = typeof text.getComputedTextLength === 'function' && text.getComputedTextLength()
        ? text.getComputedTextLength() : item.label.length * 6.5;
      const lineEnd = right - textW - 6;
      svgEl('line', {
        class: `chart-interval__swatch chart-interval__swatch--${item.kind}`,
        x1: lineEnd - 16, y1: pa.y - 10, x2: lineEnd, y2: pa.y - 10, 'stroke-width': 3,
      }, svg);
      right = lineEnd - 30;
    });
  }
}
