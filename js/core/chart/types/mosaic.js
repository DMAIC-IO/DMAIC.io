/**
 * mosaic.js — Mosaic plot for two categorical variables.
 *
 * Visualises the joint distribution of two categorical factors A and B:
 *   - Plot is divided into one column per A-level. Column WIDTH is
 *     proportional to the marginal count of that A-level.
 *   - Within a column, the height of each B segment is proportional to
 *     the conditional count of B given A. So column heights all fill
 *     the plot, and segment heights show P(B|A) directly.
 *
 * Compared to a 100%-stacked bar (equal column widths), the mosaic
 * encodes the marginal A distribution in the column widths.
 *
 * Config (same shape as the 2-cat stacked bar):
 *   categories: string[]                 — A-levels (column labels)
 *   groups:     [{ name, values[], color }] — one entry per B-level;
 *                                          values[i] = count(A_i, B_j)
 *   columnGap:  2  — px gap between columns
 *   segmentGap: 1  — px gap between segments inside a column
 *   showCellLabels: true — draw count text inside cells big enough
 */

import ChartBase from '../chart-base.js';
import { svgEl, svgText, resolveColor, formatNum, getChartColors } from '../chart-core.js';

export default class MosaicChart extends ChartBase {
  /**
   * @param {HTMLElement} container
   * @param {Object} config
   * @param {Object} context
   */
  constructor(container, config, context) {
    const defaults = {
      categories: [],
      groups: [],
      columnGap: 2,
      segmentGap: 1,
      showCellLabels: true,
      // Mosaic uses plotArea pixels directly — no numeric axes.
      showXTicks: false,
      showYTicks: false,
    };
    super(container, Object.assign(defaults, config), context);
  }

  /** @override */
  _getDataExtent() {
    // Returning [0,1]×[0,1] keeps chart-base happy without affecting the
    // mosaic rendering, which uses plotArea pixels directly.
    return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
  }

  /** @override */
  _renderData(svg, plotGroup, xScale, yScale, xTick, yTick, plotArea, defs) {
    const cats = this.config.categories || [];
    const groups = (this.config.groups || []).filter(g => g.visible !== false);
    if (!cats.length || !groups.length) return;

    const chartColors = getChartColors();
    const colGap = Math.max(0, this.config.columnGap);
    const segGap = Math.max(0, this.config.segmentGap);

    // Marginal A counts (column totals).
    const colTotals = cats.map((_, ci) => {
      let s = 0;
      for (const g of groups) s += Math.max(0, (g.values || [])[ci] || 0);
      return s;
    });
    const grandTotal = colTotals.reduce((a, b) => a + b, 0);
    if (grandTotal <= 0) return;

    // Pixel layout for columns: width proportional to colTotals.
    const totalGapPx = colGap * (cats.length - 1);
    const usableW = Math.max(0, plotArea.w - totalGapPx);
    let cursorX = plotArea.x;

    this._cellRects = [];

    for (let ci = 0; ci < cats.length; ci++) {
      const colW = usableW * (colTotals[ci] / grandTotal);
      const colTotal = colTotals[ci];

      if (colTotal > 0 && colW > 0) {
        const segs = groups.map((g, gi) => ({
          gi,
          name: g.name,
          val: Math.max(0, (g.values || [])[ci] || 0),
          color: g.color || chartColors[gi % chartColors.length] || `var(--color-chart-${gi + 1})`,
        }));
        const visibleSegs = segs.filter(s => s.val > 0);
        const totalSegGap = segGap * Math.max(0, visibleSegs.length - 1);
        const usableH = Math.max(0, plotArea.h - totalSegGap);

        let cursorY = plotArea.y;
        for (const seg of visibleSegs) {
          const segH = usableH * (seg.val / colTotal);
          if (segH > 0) {
            const fill = resolveColor(seg.color);
            svgEl('rect', {
              x: cursorX, y: cursorY,
              width: colW, height: segH,
              fill, 'fill-opacity': 0.78,
              stroke: fill, 'stroke-width': 0.6,
            }, plotGroup);
            this._cellRects.push({
              ci, gi: seg.gi,
              count: seg.val, colTotal,
              x: cursorX, y: cursorY, w: colW, h: segH,
            });
            // Inline count label when the cell is large enough to read.
            if (this.config.showCellLabels && colW >= 32 && segH >= 16) {
              svgText(formatNum(seg.val, 0, this.locale), {
                x: cursorX + colW / 2,
                y: cursorY + segH / 2 + 4,
                'text-anchor': 'middle',
                'font-size': `${this.config.tickSize || 11}px`,
                'font-weight': 500,
                fill: resolveColor('var(--color-text-primary)'),
                'pointer-events': 'none',
              }, plotGroup);
            }
            cursorY += segH + segGap;
          }
        }
      }

      // Column label below the plot.
      svgText(cats[ci], {
        x: cursorX + colW / 2,
        y: plotArea.y + plotArea.h + 14,
        'text-anchor': 'middle',
        'font-size': `${this.config.tickSize || 11}px`,
        fill: resolveColor('var(--color-text-secondary)'),
      }, svg);

      cursorX += colW + colGap;
    }
  }

  /** @override */
  _getLegendItems() {
    const chartColors = getChartColors();
    return (this.config.groups || [])
      .map((g, i) => ({ g, i }))
      .filter(({ g }) => g.visible !== false)
      .map(({ g, i }) => ({
        type: 'rect',
        color: g.color || chartColors[i % chartColors.length] || `var(--color-chart-${i + 1})`,
        label: g.name || `Group ${i + 1}`,
      }));
  }

  /** @override */
  _getSeriesDescriptors() {
    const cfg = this.config;
    const groups = cfg.groups || [];
    const chartColors = getChartColors();
    return groups.map((g, i) => ({
      index: i,
      getName: () => g.name || `Group ${i + 1}`,
      setName: (v) => { g.name = v; },
      getColor: () => g.color || chartColors[i % chartColors.length],
      setColor: (c) => { g.color = c; },
      isVisible: () => g.visible !== false,
      setVisible: (v) => { g.visible = v; },
    }));
  }

  /** @override */
  _findNearby(dataX, dataY, proximityPx) {
    const cells = this._cellRects;
    if (!cells || !cells.length) return [];
    // dataX/dataY are in [0,1]; convert to pixels via the scales.
    const px = this._xScale(dataX);
    const py = this._yScale(dataY);
    const cats = this.config.categories || [];
    const groups = this.config.groups || [];
    const hit = cells.find(c => px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h);
    if (!hit) return [];
    const aName = cats[hit.ci];
    const bName = groups[hit.gi]?.name || '';
    const cond = hit.colTotal > 0 ? hit.count / hit.colTotal : 0;
    return [{
      html: `<b>${aName} · ${bName}</b><br>${this.config.tooltipCountLabel || 'n'} = ${formatNum(hit.count, 0, this.locale)} (${formatNum(cond * 100, 1, this.locale)}%)`,
      px: hit.x + hit.w / 2,
      py: hit.y + hit.h / 2,
    }];
  }
}
