/**
 * gage-run-chart.js — Gage run chart type for the D.Mike chart framework.
 *
 * Renders ONE horizontal strip of part panels:
 *   - one panel per part, separated by vertical dividers
 *   - a label band above the plot carrying the part identifiers
 *   - every single measurement as a point, coloured/symbolised per appraiser
 *   - repeat measurements of the same appraiser connected by a line
 *   - an optional short mean tick per appraiser and panel
 *   - one continuous reference line across the whole strip
 *
 * `ChartBase` provides a single plot area, so a wrapped panel *grid* is built
 * by the module stacking several instances of this type — each one strip —
 * with a shared y-domain. See `docs/superpowers/specs/2026-07-27-gage-run-chart-design.md`.
 *
 * Panel geometry is derived from `plotArea` directly rather than from the x
 * scale: `generateTicks` widens the numeric x range to nice boundaries, which
 * would leave the last panel short of the frame.
 *
 * Consequence: horizontal zoom/pan is inert here — panels keep their place
 * while the y axis still zooms, which is the useful direction for spotting a
 * point that sits off the reference line.
 *
 * Not to be confused with the `run-chart` type (median line + runs tests).
 */

import ChartBase from '../chart-base.js';
import { h } from '../../dom.js';
import { svgEl, svgText, resolveColor, formatNum, drawMarker, getChartColors } from '../chart-core.js';

/** Symbol sequence cycled per appraiser, mirroring Minitab's default. */
const OPERATOR_SYMBOLS = ['circle', 'square', 'diamond', 'triangle', 'triangle-down', 'cross', 'star'];

/** Height of the part-label band drawn above the plot area. */
const BAND_H = 20;

export default class GageRunChartType extends ChartBase {
  constructor(container, config, context) {
    const defaults = {
      /** @type {Array<{part: string, series: Array<{operator: string, values: number[], mean: number}>}>} */
      panels: [],
      /** Full appraiser list across all strips — keeps colours stable per row. */
      operators: [],
      /** Reference line value (grand mean by default); null hides it. */
      refValue: null,
      /** Label drawn at both ends of the reference line. */
      refLabel: '',
      /** Short horizontal mean tick per appraiser and panel. */
      showOperatorMean: true,
      /** Connect repeat measurements of the same appraiser. */
      connectWithin: true,
      /** Shared y-domain across all strips of the same chart. */
      sharedYMin: null,
      sharedYMax: null,

      pointSize: 6,
      pointStrokeWidth: 0,
      lineWidth: 1.4,
      refColor: 'var(--color-text-secondary)',
      dividerColor: 'var(--color-border)',
      bandColor: 'var(--color-text-secondary)',

      // The x axis carries part panels, not numbers — no numeric ticks or grid.
      categoricalX: true,
      showXTicks: false,
    };
    super(container, Object.assign(defaults, config), context);
  }

  // ── Geometry helpers ──────────────────────────────────────────────

  /** Resolved colour for appraiser index i. */
  _operatorColor(i) {
    const colors = getChartColors();
    return resolveColor(colors[i % colors.length]);
  }

  /** Symbol for appraiser index i. */
  _operatorSymbol(i) {
    return OPERATOR_SYMBOLS[i % OPERATOR_SYMBOLS.length];
  }

  /**
   * Lay a panel out into point slots. Every (appraiser, repeat) pair gets its
   * own slot, appraisers staying in contiguous blocks.
   * @param {Object} panel
   * @param {number} x0 — left edge of the panel in pixels
   * @param {number} panelW — panel width in pixels
   * @returns {Array<{operator: string, opIndex: number, value: number, x: number, repeat: number}>}
   */
  _layoutPanel(panel, x0, panelW) {
    const operators = this.config.operators || [];
    const total = panel.series.reduce((sum, s) => sum + s.values.length, 0);
    if (total === 0) return [];

    const slots = [];
    let k = 0;
    for (const s of panel.series) {
      const opIndex = operators.indexOf(s.operator);
      s.values.forEach((value, repeat) => {
        slots.push({
          operator: s.operator,
          opIndex: opIndex < 0 ? 0 : opIndex,
          value,
          repeat,
          x: x0 + (panelW * (k + 0.5)) / total,
        });
        k++;
      });
    }
    return slots;
  }

  /** @override — x spans the panels, y the shared or observed data range. */
  _getDataExtent() {
    const panels = this.config.panels || [];

    // The module normally supplies a shared domain so stacked strips line up;
    // scanning the values is the fallback for a standalone caller. Looped, not
    // Math.min(...values) — a worksheet can carry more values than the argument
    // limit allows.
    let yMin = this.config.sharedYMin;
    let yMax = this.config.sharedYMax;
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
      let lo = Infinity;
      let hi = -Infinity;
      for (const p of panels) {
        for (const s of p.series) {
          for (const v of s.values) {
            if (!Number.isFinite(v)) continue;
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
        }
      }
      if (!Number.isFinite(yMin)) yMin = lo;
      if (!Number.isFinite(yMax)) yMax = hi;
    }
    if (Number.isFinite(this.config.refValue)) {
      yMin = Math.min(yMin, this.config.refValue);
      yMax = Math.max(yMax, this.config.refValue);
    }
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) { yMin = 0; yMax = 1; }
    if (yMin === yMax) { yMin -= 0.5; yMax += 0.5; }

    return { xMin: 0, xMax: Math.max(1, panels.length), yMin, yMax };
  }

  // ── Rendering ─────────────────────────────────────────────────────

  /** @override */
  _renderData(svg, plotGroup, xScale, yScale, xTick, yTick, plotArea, _defs) {
    const panels = this.config.panels || [];
    if (!panels.length) return;

    const panelW = plotArea.w / panels.length;
    const dividerColor = resolveColor(this.config.dividerColor);
    const bandColor = resolveColor(this.config.bandColor);

    // ── Part label band (above the plot area, therefore unclipped) ──
    const bandTop = plotArea.y - BAND_H;
    svgEl('line', {
      x1: plotArea.x, y1: bandTop, x2: plotArea.x + plotArea.w, y2: bandTop,
      stroke: dividerColor, 'stroke-width': 1,
    }, svg);

    panels.forEach((panel, i) => {
      const x0 = plotArea.x + i * panelW;

      // Divider between panels — full height, plus the band above it.
      if (i > 0) {
        const x = Math.round(x0) + 0.5;
        svgEl('line', {
          x1: x, y1: plotArea.y, x2: x, y2: plotArea.y + plotArea.h,
          stroke: dividerColor, 'stroke-width': 1,
        }, plotGroup);
        svgEl('line', {
          x1: x, y1: bandTop, x2: x, y2: plotArea.y,
          stroke: dividerColor, 'stroke-width': 1,
        }, svg);
      }

      svgText(panel.part, {
        x: x0 + panelW / 2, y: bandTop + BAND_H - 6,
        'text-anchor': 'middle', 'font-size': `${this.config.tickSize}px`,
        fill: bandColor, class: 'tick-label',
      }, svg);
    });

    // ── Reference line across the whole strip ──
    if (Number.isFinite(this.config.refValue)) {
      const yRef = yScale(this.config.refValue);
      if (yRef >= plotArea.y && yRef <= plotArea.y + plotArea.h) {
        const refColor = resolveColor(this.config.refColor);
        svgEl('line', {
          x1: plotArea.x, y1: yRef, x2: plotArea.x + plotArea.w, y2: yRef,
          stroke: refColor, 'stroke-width': 1.5, 'stroke-dasharray': '6,4',
        }, plotGroup);
        // Inside the plot at the right edge and lifted off the line — outside
        // on the left it would collide with the y tick label at the same height.
        if (this.config.refLabel) {
          svgText(this.config.refLabel, {
            x: plotArea.x + plotArea.w - 6, y: yRef - 5,
            'text-anchor': 'end', 'font-size': '10px', 'font-weight': 500, fill: refColor,
          }, plotGroup);
        }
      }
    }

    // ── Points, connecting lines, mean ticks ──
    panels.forEach((panel, i) => {
      const x0 = plotArea.x + i * panelW;
      const slots = this._layoutPanel(panel, x0, panelW);
      if (!slots.length) return;

      // Group slots back per appraiser so lines and mean ticks stay per series.
      const bySeries = new Map();
      for (const slot of slots) {
        if (!bySeries.has(slot.operator)) bySeries.set(slot.operator, []);
        bySeries.get(slot.operator).push(slot);
      }

      for (const [, group] of bySeries) {
        const color = this._operatorColor(group[0].opIndex);
        const symbol = this._operatorSymbol(group[0].opIndex);

        if (this.config.connectWithin && group.length > 1) {
          const d = group
            .map((s, idx) => `${idx === 0 ? 'M' : 'L'}${s.x},${yScale(s.value)}`)
            .join('');
          svgEl('path', {
            d, fill: 'none', stroke: color, 'stroke-width': this.config.lineWidth,
          }, plotGroup);
        }

        if (this.config.showOperatorMean && group.length > 1) {
          const mean = group.reduce((sum, s) => sum + s.value, 0) / group.length;
          const yMean = yScale(mean);
          const half = Math.max(4, (panelW / (slots.length + 1)) * 0.6);
          const xMid = (group[0].x + group[group.length - 1].x) / 2;
          svgEl('line', {
            x1: xMid - half, y1: yMean, x2: xMid + half, y2: yMean,
            stroke: color, 'stroke-width': 1, 'stroke-dasharray': '3,2',
          }, plotGroup);
        }

        const r = this.config.pointSize / 2;
        for (const slot of group) {
          drawMarker(plotGroup, symbol, slot.x, yScale(slot.value), r,
            color, 'none', this.config.pointStrokeWidth);
        }
      }
    });
  }

  /** @override */
  _getLegendItems() {
    const operators = this.config.operators || [];
    if (!operators.length || (operators.length === 1 && operators[0] === '')) return [];
    return operators.map((op, i) => ({
      type: 'marker',
      symbol: this._operatorSymbol(i),
      color: this._operatorColor(i),
      label: op,
    }));
  }

  /** @override */
  _findNearby(dataX, dataY, proximityPx) {
    const panels = this.config.panels || [];
    const pa = this._plotArea;
    if (!panels.length || !pa || !this._xScale || !this._yScale) return [];

    // Panel layout is in pixels, so compare in pixels and convert back at the end.
    const px = this._xScale(dataX);
    const py = this._yScale(dataY);
    const panelW = pa.w / panels.length;

    const results = [];
    panels.forEach((panel, i) => {
      const slots = this._layoutPanel(panel, pa.x + i * panelW, panelW);
      for (const slot of slots) {
        const sy = this._yScale(slot.value);
        const dist = Math.hypot(slot.x - px, sy - py);
        if (dist > proximityPx * 2) continue;
        const node = h('div', null,
          h('strong', null, panel.part),
          slot.operator ? ` · ${slot.operator}` : '',
          h('br'),
          formatNum(slot.value, null, this.locale),
        );
        results.push({
          node,
          px: this._xScaleInv(slot.x),
          py: slot.value,
          color: this._operatorColor(slot.opIndex),
          dist,
        });
      }
    });

    results.sort((a, b) => a.dist - b.dist);
    return results.slice(0, 1);
  }

  /** @override — one editable descriptor per appraiser. */
  _getSeriesDescriptors() {
    const cfg = this.config;
    const operators = cfg.operators || [];
    return operators.map((op, i) => ({
      index: i,
      getName: () => op,
      setName: () => {},
      getColor: () => this._operatorColor(i),
      setColor: () => {},
      isVisible: () => true,
      setVisible: () => {},
      getSymbol: () => this._operatorSymbol(i),
      setSymbol: () => {},
      getSize: () => cfg.pointSize,
      setSize: (v) => { cfg.pointSize = v; },
      getStroke: () => 'rgba(0,0,0,0)',
      setStroke: () => {},
      getStrokeWidth: () => cfg.pointStrokeWidth,
      setStrokeWidth: (v) => { cfg.pointStrokeWidth = v; },
    }));
  }
}
