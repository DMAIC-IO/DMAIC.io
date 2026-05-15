/**
 * heatmap.js — Heatmap / pivot grid for two categorical factors.
 *
 * Cells are arranged in an `nY × nX` grid (one row per Y-level, one
 * column per X-level). Cell colour is the chart accent at a linear
 * opacity from 0.08 (min value) to 0.95 (max value). NaN / missing
 * cells render as a light-gray placeholder.
 *
 * Config:
 *   xCategories: string[]      — column labels (top→bottom in cells matrix)
 *   yCategories: string[]      — row labels
 *   cells: number[][]          — cells[yi][xi]; NaN for missing
 *   cellGap: 1                 — px gap between cells
 *   valueDecimals: 1           — digits for inline value labels and tooltip
 *   valueLabel: ''             — semantic prefix in tooltip ('n' / 'Mittelwert')
 *   showCellLabels: true       — draw values inside cells when they fit
 *   showYLabel/showXLabel come from base; row/col labels are drawn here.
 */

import ChartBase from '../chart-base.js';
import { svgEl, svgText, resolveColor, formatNum } from '../chart-core.js';

export default class HeatmapChart extends ChartBase {
  /**
   * @param {HTMLElement} container
   * @param {Object} config
   * @param {Object} context
   */
  constructor(container, config, context) {
    const defaults = {
      xCategories: [],
      yCategories: [],
      cells: [],
      cellGap: 1,
      valueDecimals: 1,
      valueLabel: '',
      showCellLabels: true,
      // No standard legend; the colour ramp is implicit + cell labels carry values.
      showLegend: false,
      showXTicks: false,
      showYTicks: false,
    };
    super(container, Object.assign(defaults, config), context);
  }

  /** @override */
  _getDataExtent() {
    return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
  }

  /** @override */
  _renderData(svg, plotGroup, xScale, yScale, xTick, yTick, plotArea, defs) {
    const xCats = this.config.xCategories || [];
    const yCats = this.config.yCategories || [];
    const cells = this.config.cells || [];
    const nX = xCats.length;
    const nY = yCats.length;
    if (!nX || !nY) return;

    const gap = Math.max(0, this.config.cellGap);
    const cellW = Math.max(1, (plotArea.w - gap * (nX - 1)) / nX);
    const cellH = Math.max(1, (plotArea.h - gap * (nY - 1)) / nY);

    // Min/max across finite cell values.
    let minV = Infinity, maxV = -Infinity;
    for (let yi = 0; yi < nY; yi++) {
      const row = cells[yi] || [];
      for (let xi = 0; xi < nX; xi++) {
        const v = row[xi];
        if (Number.isFinite(v)) {
          if (v < minV) minV = v;
          if (v > maxV) maxV = v;
        }
      }
    }
    const hasRange = Number.isFinite(minV) && Number.isFinite(maxV);
    const span = hasRange ? (maxV - minV) : 0;

    const accent = resolveColor('var(--color-accent)');
    const missing = resolveColor('var(--color-background-secondary)');

    this._cellRects = [];

    for (let yi = 0; yi < nY; yi++) {
      const row = cells[yi] || [];
      const cy = plotArea.y + yi * (cellH + gap);
      for (let xi = 0; xi < nX; xi++) {
        const cx = plotArea.x + xi * (cellW + gap);
        const v = row[xi];
        if (!Number.isFinite(v)) {
          svgEl('rect', {
            x: cx, y: cy, width: cellW, height: cellH,
            fill: missing, 'fill-opacity': 0.6,
          }, plotGroup);
          continue;
        }
        const t = span > 0 ? (v - minV) / span : 0.5;
        // 0.08 .. 0.95 — keep the lowest cell visible against the background.
        const opacity = 0.08 + t * (0.95 - 0.08);
        svgEl('rect', {
          x: cx, y: cy, width: cellW, height: cellH,
          fill: accent, 'fill-opacity': opacity,
        }, plotGroup);

        this._cellRects.push({
          xi, yi, val: v,
          x: cx, y: cy, w: cellW, h: cellH,
        });

        if (this.config.showCellLabels && cellW >= 36 && cellH >= 18) {
          // Use dark text on light cells (low opacity), light text on dark cells.
          const txtFill = opacity > 0.5
            ? resolveColor('var(--color-background-primary)')
            : resolveColor('var(--color-text-primary)');
          svgText(formatNum(v, this.config.valueDecimals, this.locale), {
            x: cx + cellW / 2,
            y: cy + cellH / 2 + 4,
            'text-anchor': 'middle',
            'font-size': `${this.config.tickSize || 11}px`,
            'font-weight': 500,
            fill: txtFill,
            'pointer-events': 'none',
          }, plotGroup);
        }
      }
    }

    // Column labels below the grid.
    const colLabelY = plotArea.y + plotArea.h + 14;
    for (let xi = 0; xi < nX; xi++) {
      const cx = plotArea.x + xi * (cellW + gap) + cellW / 2;
      svgText(xCats[xi], {
        x: cx, y: colLabelY,
        'text-anchor': 'middle',
        'font-size': `${this.config.tickSize || 11}px`,
        fill: resolveColor('var(--color-text-secondary)'),
      }, svg);
    }
    // Row labels to the left of the grid.
    for (let yi = 0; yi < nY; yi++) {
      const cy = plotArea.y + yi * (cellH + gap) + cellH / 2 + 4;
      svgText(yCats[yi], {
        x: plotArea.x - 6, y: cy,
        'text-anchor': 'end',
        'font-size': `${this.config.tickSize || 11}px`,
        fill: resolveColor('var(--color-text-secondary)'),
      }, svg);
    }
  }

  /** @override */
  _getLegendItems() {
    return [];
  }

  /** @override */
  _findNearby(dataX, dataY, proximityPx) {
    const cells = this._cellRects;
    if (!cells || !cells.length) return [];
    const px = this._xScale(dataX);
    const py = this._yScale(dataY);
    const hit = cells.find(c => px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h);
    if (!hit) return [];
    const xCats = this.config.xCategories || [];
    const yCats = this.config.yCategories || [];
    const valPrefix = this.config.valueLabel ? `${this.config.valueLabel}: ` : '';
    return [{
      html: `<b>${yCats[hit.yi]} · ${xCats[hit.xi]}</b><br>${valPrefix}${formatNum(hit.val, this.config.valueDecimals, this.locale)}`,
      px: hit.x + hit.w / 2,
      py: hit.y + hit.h / 2,
    }];
  }
}
