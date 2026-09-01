/**
 * multi-vari.js — Multi-vari strip for the D.Mike chart framework.
 *
 * Renders ONE strip:
 *   - one panel per level of factor 3, separated by vertical dividers
 *   - a label band above the plot area carrying the panel levels
 *   - one slot per level of factor 1; the series (factor 2) sit inside it
 *     with a deterministic, index-based offset
 *   - every single measurement as a point, coloured/symbolised per series
 *   - a short cross tick at the group mean, and a line connecting the
 *     series means across the axis levels — the characteristic multi-vari
 *     line pattern
 *   - one continuous reference line at the grand mean
 *
 * `ChartBase` provides a single plot area and cannot facet; the panel grid
 * comes from the module stacking several instances of this type — each one
 * strip — with a shared y-domain, as with `gage-run-chart`.
 *
 * Panel geometry is derived from `plotArea` directly rather than from the x
 * scale: `generateTicks` widens the numeric x range to nice boundaries,
 * which would leave the last panel short of the frame. Consequence:
 * horizontal zoom/pan is inert here, while the y axis still zooms — the
 * useful direction.
 *
 * NO random jitter: the series offset is purely index-based, or every
 * visual-regression snapshot would be flaky.
 */

import ChartBase from '../chart-base.js';
import { h } from '../../dom.js';
import { svgEl, svgText, resolveColor, formatNum, drawMarker, getChartColors } from '../chart-core.js';

/** Symbol sequence cycled per series, as in the gage run chart. */
const SERIES_SYMBOLS = ['circle', 'square', 'diamond', 'triangle', 'triangle-down', 'cross', 'star'];

/** Height of the label band drawn above the plot area. */
const BAND_H = 20;

export default class MultiVariChartType extends ChartBase {
  constructor(container, config, context) {
    const defaults = {
      /** @type {Array<{panelLevel: string, groups: Array<object>}>} one strip */
      panels: [],
      /** Full factor-2 level list — keeps colours stable across all strips. */
      seriesLevels: [],
      /** Level of factor 4; empty hides the strip label. */
      rowLabel: '',
      /** Reference line (grand mean); null hides it. */
      refValue: null,
      refLabel: '',
      /** Shared y-domain across all strips. */
      sharedYMin: null,
      sharedYMax: null,

      showPoints: true,
      connectMeans: true,
      showGroupMean: true,
      /** Fraction of the slot width the series are spread across. */
      seriesSpread: 0.6,

      pointSize: 6,
      pointStrokeWidth: 0,
      lineWidth: 1.4,
      refColor: 'var(--color-text-secondary)',
      dividerColor: 'var(--color-border)',
      bandColor: 'var(--color-text-secondary)',

      // The x axis carries panels, not numbers.
      categoricalX: true,
      showXTicks: false,
    };
    super(container, Object.assign(defaults, config), context);
  }

  // ── Colours and symbols ─────────────────────────────────────────────

  /** Resolved colour for series index i. */
  _seriesColor(i) {
    const colors = getChartColors();
    return resolveColor(colors[i % colors.length]);
  }

  /** Symbol for series index i. */
  _seriesSymbol(i) {
    return SERIES_SYMBOLS[i % SERIES_SYMBOLS.length];
  }

  // ── Geometry ──────────────────────────────────────────────────────

  /**
   * Slots of a panel: one slot per axis level, with one x position per
   * series inside it, index-based offset.
   *
   * @param {object} panel
   * @param {number} x0 — left edge of the panel in pixels
   * @param {number} panelW — panel width in pixels
   * @returns {Array<{level: string, seriesLevel: string, seriesIndex: number,
   *                  x: number, values: number[], mean: number}>}
   */
  _layoutPanel(panel, x0, panelW) {
    const seriesLevels = this.config.seriesLevels || [];
    const groups = panel.groups || [];
    if (!groups.length) return [];

    const slotW = panelW / groups.length;
    const spread = slotW * this.config.seriesSpread;
    const out = [];

    groups.forEach((group, gi) => {
      const centre = x0 + slotW * (gi + 0.5);
      for (const s of group.series) {
        const seriesIndex = Math.max(0, seriesLevels.indexOf(s.level));
        const n = Math.max(1, seriesLevels.length);
        // Symmetric around the slot centre regardless of which series are
        // actually populated in this group — otherwise the points would
        // shift whenever a series is missing from a cell.
        const offset = n === 1 ? 0 : (seriesIndex / (n - 1) - 0.5) * spread;
        out.push({
          level: group.level,
          seriesLevel: s.level,
          seriesIndex,
          x: centre + offset,
          values: s.values,
          mean: s.mean,
        });
      }
    });
    return out;
  }

  /** @override — x spans the panels, y the shared or observed range. */
  _getDataExtent() {
    const panels = this.config.panels || [];

    let yMin = this.config.sharedYMin;
    let yMax = this.config.sharedYMax;
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
      let lo = Infinity;
      let hi = -Infinity;
      // Looped rather than Math.min(...values): a worksheet can carry more
      // values than the argument limit allows.
      for (const p of panels) {
        for (const g of p.groups) {
          for (const s of g.series) {
            for (const v of s.values) {
              if (!Number.isFinite(v)) continue;
              if (v < lo) lo = v;
              if (v > hi) hi = v;
            }
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
    const bandTop = plotArea.y - BAND_H;

    // ── Label band (above the plot area, therefore unclipped) ──
    svgEl('line', {
      x1: plotArea.x, y1: bandTop, x2: plotArea.x + plotArea.w, y2: bandTop,
      stroke: dividerColor, 'stroke-width': 1,
    }, svg);

    panels.forEach((panel, i) => {
      const x0 = plotArea.x + i * panelW;
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
      if (panel.panelLevel) {
        svgText(panel.panelLevel, {
          x: x0 + panelW / 2, y: bandTop + BAND_H - 6,
          'text-anchor': 'middle', 'font-size': `${this.config.tickSize}px`,
          fill: bandColor, class: 'tick-label', 'data-mv-panel-label': String(i),
        }, svg);
      }
    });

    // ── Strip label ──
    // Inside the plot area, not the margin: the left margin belongs to the
    // y axis, where the label would collide with the tick labels.
    if (this.config.rowLabel) {
      svgText(this.config.rowLabel, {
        x: plotArea.x + 6, y: plotArea.y + 14,
        'text-anchor': 'start', 'font-size': '11px', 'font-weight': 600,
        fill: bandColor, 'data-mv-row-label': '1',
      }, plotGroup);
    }

    // ── Reference line across the whole strip ──
    if (Number.isFinite(this.config.refValue)) {
      const yRef = yScale(this.config.refValue);
      if (yRef >= plotArea.y && yRef <= plotArea.y + plotArea.h) {
        const refColor = resolveColor(this.config.refColor);
        svgEl('line', {
          x1: plotArea.x, y1: yRef, x2: plotArea.x + plotArea.w, y2: yRef,
          stroke: refColor, 'stroke-width': 1.5, 'stroke-dasharray': '6,4',
          'data-mv-ref': '1',
        }, plotGroup);
        if (this.config.refLabel) {
          svgText(this.config.refLabel, {
            x: plotArea.x + plotArea.w - 6, y: yRef - 5,
            'text-anchor': 'end', 'font-size': '10px', 'font-weight': 500, fill: refColor,
          }, plotGroup);
        }
      }
    }

    // ── Points, mean ticks, mean lines ──
    panels.forEach((panel, i) => {
      const x0 = plotArea.x + i * panelW;
      const slots = this._layoutPanel(panel, x0, panelW);
      if (!slots.length) return;
      const slotW = panelW / Math.max(1, panel.groups.length);

      // Group mean: short cross tick across the slot width.
      if (this.config.showGroupMean) {
        panel.groups.forEach((group, gi) => {
          if (!Number.isFinite(group.mean)) return;
          const centre = x0 + slotW * (gi + 0.5);
          const half = slotW * 0.35;
          svgEl('line', {
            x1: centre - half, y1: yScale(group.mean),
            x2: centre + half, y2: yScale(group.mean),
            stroke: resolveColor(this.config.bandColor), 'stroke-width': 1.5,
            'data-mv-group-mean': `${i}|${group.level}`,
          }, plotGroup);
        });
      }

      // Per series: mean line across the axis levels, then the points.
      const bySeries = new Map();
      for (const slot of slots) {
        if (!bySeries.has(slot.seriesLevel)) bySeries.set(slot.seriesLevel, []);
        bySeries.get(slot.seriesLevel).push(slot);
      }

      for (const [seriesLevel, group] of bySeries) {
        const color = this._seriesColor(group[0].seriesIndex);
        const symbol = this._seriesSymbol(group[0].seriesIndex);

        if (this.config.connectMeans && group.length > 1) {
          const d = group
            .filter(s => Number.isFinite(s.mean))
            .map((s, idx) => `${idx === 0 ? 'M' : 'L'}${s.x},${yScale(s.mean)}`)
            .join('');
          if (d) {
            svgEl('path', {
              d, fill: 'none', stroke: color, 'stroke-width': this.config.lineWidth,
              'data-mv-mean-line': `${i}|${seriesLevel}`,
            }, plotGroup);
          }
        }

        if (!this.config.showPoints) continue;
        const r = this.config.pointSize / 2;
        for (const slot of group) {
          for (const v of slot.values) {
            if (!Number.isFinite(v)) continue;
            const marker = drawMarker(plotGroup, symbol, slot.x, yScale(v), r,
              color, 'none', this.config.pointStrokeWidth);
            marker?.setAttribute('data-mv-point', `${i}|${slot.level}|${slot.seriesLevel}`);
            marker?.setAttribute('data-mv-x', String(slot.x));
          }
        }
      }
    });
  }

  /** @override */
  _getLegendItems() {
    const levels = this.config.seriesLevels || [];
    if (!levels.length) return [];
    return levels.map((level, i) => ({
      type: 'marker',
      symbol: this._seriesSymbol(i),
      color: this._seriesColor(i),
      label: level,
    }));
  }

  /** @override */
  _findNearby(dataX, dataY, proximityPx) {
    const panels = this.config.panels || [];
    const pa = this._plotArea;
    if (!panels.length || !pa || !this._xScale || !this._yScale) return [];

    const px = this._xScale(dataX);
    const py = this._yScale(dataY);
    const panelW = pa.w / panels.length;

    const results = [];
    panels.forEach((panel, i) => {
      const slots = this._layoutPanel(panel, pa.x + i * panelW, panelW);
      for (const slot of slots) {
        for (const v of slot.values) {
          const sy = this._yScale(v);
          const dist = Math.hypot(slot.x - px, sy - py);
          if (dist > proximityPx * 2) continue;
          const node = h('div', null,
            h('strong', null, slot.level),
            panel.panelLevel ? ` · ${panel.panelLevel}` : '',
            this.config.rowLabel ? ` · ${this.config.rowLabel}` : '',
            h('br'),
            `${slot.seriesLevel}: `,
            formatNum(v, null, this.locale),
          );
          results.push({
            node,
            px: slot.x,
            py: sy,
            color: this._seriesColor(slot.seriesIndex),
            dist,
          });
        }
      }
    });

    results.sort((a, b) => a.dist - b.dist);
    return results.slice(0, 1);
  }

  /** @override — one editable descriptor per series. */
  _getSeriesDescriptors() {
    const cfg = this.config;
    return (cfg.seriesLevels || []).map((level, i) => ({
      index: i,
      getName: () => level,
      setName: () => {},
      getColor: () => this._seriesColor(i),
      setColor: () => {},
      isVisible: () => true,
      setVisible: () => {},
      getSymbol: () => this._seriesSymbol(i),
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
