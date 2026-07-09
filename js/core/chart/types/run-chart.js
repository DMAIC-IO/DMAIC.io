/**
 * run-chart.js — Run chart type for the D.Mike chart framework.
 *
 * Shows a numeric series over sample number with:
 *   - Median reference line (single horizontal)
 *   - Data line + points
 *   - Optional highlighting of points above/below the median
 *
 * No control limits, no zones — that's the whole point of a run chart.
 * For SPC limits, use the 'control-chart' type instead.
 */

import ChartBase from '../chart-base.js';
import { h } from '../../dom.js';
import { svgEl, resolveColor, formatNum, drawMarker } from '../chart-core.js';

export default class RunChartType extends ChartBase {
  constructor(container, config, context) {
    const defaults = {
      /** @type {number[]} */
      values: [],
      /** Median (center reference line) */
      median: 0,
      /** Show median line label on the left edge */
      showMedianLabel: true,
      /** Color the points by side relative to median */
      colorBySide: true,
      lineColor: 'var(--color-accent)',
      pointColor: 'var(--color-accent)',
      aboveColor: 'var(--color-accent)',
      belowColor: 'var(--color-info)',
      onMedianColor: 'var(--color-text-tertiary)',
      medianColor: 'var(--color-text-secondary)',
      pointRadius: 3,
      pointSymbol: 'circle',
      pointSize: 6,
      pointStroke: null,
      pointStrokeWidth: 0,
    };
    super(container, Object.assign(defaults, config), context);
  }

  /** @override */
  _getDataExtent() {
    const { values, median } = this.config;
    const valid = values.filter(v => v != null && Number.isFinite(v));
    if (!valid.length) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };

    const yVals = [...valid, median];
    const yMin = Math.min(...yVals);
    const yMax = Math.max(...yVals);
    const pad = (yMax - yMin) * 0.08 || 1;
    return {
      xMin: 0.5,
      xMax: values.length + 0.5,
      yMin: yMin - pad,
      yMax: yMax + pad,
    };
  }

  /** @override */
  _renderData(svg, plotGroup, xScale, yScale, xTick, yTick, plotArea, _defs) {
    const { values, median, colorBySide } = this.config;
    if (!values.length) return;

    // ── Median reference line ──
    const yMed = yScale(median);
    if (yMed >= plotArea.y && yMed <= plotArea.y + plotArea.h) {
      plotGroup.appendChild(svgEl('line', {
        x1: plotArea.x, y1: yMed, x2: plotArea.x + plotArea.w, y2: yMed,
        stroke: resolveColor(this.config.medianColor), 'stroke-width': 1.5,
        'stroke-dasharray': '6,4',
      }));
      if (this.config.showMedianLabel) {
        const txt = svgEl('text', {
          x: plotArea.x - 4, y: yMed + 4,
          fill: resolveColor(this.config.medianColor),
          'font-size': 10, 'font-weight': 500, 'text-anchor': 'end',
        });
        txt.textContent = `M ${formatNum(median, null, this.locale)}`;
        plotGroup.appendChild(txt);
      }
    }

    // ── Data line ──
    let pathD = '';
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v == null || !Number.isFinite(v)) continue;
      const x = xScale(i + 1);
      const y = yScale(v);
      pathD += (pathD === '' ? `M${x},${y}` : ` L${x},${y}`);
    }
    if (pathD) {
      plotGroup.appendChild(svgEl('path', {
        d: pathD, fill: 'none',
        stroke: resolveColor(this.config.lineColor), 'stroke-width': 1.8,
      }));
    }

    // ── Data points ──
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v == null || !Number.isFinite(v)) continue;
      const x = xScale(i + 1);
      const y = yScale(v);

      let color;
      if (colorBySide) {
        if (v > median) color = this.config.aboveColor;
        else if (v < median) color = this.config.belowColor;
        else color = this.config.onMedianColor;
      } else {
        color = this.config.pointColor;
      }

      const sym = this.config.pointSymbol || 'circle';
      const sizePx = this.config.pointSize ?? (this.config.pointRadius * 2);
      const r = sizePx / 2;
      const stroke = this.config.pointStroke != null ? resolveColor(this.config.pointStroke) : 'none';
      const sw = this.config.pointStrokeWidth ?? 0;
      drawMarker(plotGroup, sym, x, y, r, resolveColor(color), stroke, sw);
    }
  }

  /** @override */
  _getLegendItems() { return []; }

  /** @override */
  _findNearby(dataX, dataY, proximityPx) {
    const { values, median } = this.config;
    const results = [];
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v == null || !Number.isFinite(v)) continue;
      const px = i + 1;
      const py = v;
      const dx = Math.abs(px - dataX);
      const dy = Math.abs(py - dataY);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= proximityPx * 2) {
        const side = v > median ? '↑' : v < median ? '↓' : '=';
        const node = h('div', null,
          h('strong', null, `#${i + 1}`),
          ` ${side}`,
          h('br'),
          formatNum(v, null, this.locale),
        );
        results.push({
          node, px, py,
          color: resolveColor(this.config.pointColor),
          dist,
        });
      }
    }
    results.sort((a, b) => a.dist - b.dist);
    return results.slice(0, 1);
  }

  /** @override */
  _getSeriesDescriptors() {
    const cfg = this.config;
    return [{
      index: 0,
      getName: () => cfg.title || 'Run',
      setName: (v) => { cfg.title = v; },
      getColor: () => cfg.pointColor || 'var(--color-accent)',
      setColor: (c) => { cfg.pointColor = c; cfg.aboveColor = c; },
      isVisible: () => true,
      setVisible: () => {},
      getSymbol: () => cfg.pointSymbol || 'circle',
      setSymbol: (v) => { cfg.pointSymbol = v; },
      getSize: () => cfg.pointSize ?? (cfg.pointRadius * 2),
      setSize: (v) => { cfg.pointSize = v; },
      getStroke: () => cfg.pointStroke || 'rgba(0,0,0,0)',
      setStroke: (v) => { cfg.pointStroke = v; },
      getStrokeWidth: () => cfg.pointStrokeWidth ?? 0,
      setStrokeWidth: (v) => { cfg.pointStrokeWidth = v; },
    }];
  }
}
