/**
 * bar.js — Grouped or stacked bar chart type for the D.Mike chart framework.
 * Renders vertical bars per category, either side-by-side (grouped, default)
 * or stacked into a single bar per category (`stacked: true`).
 *
 * Config:
 *   categories: string[]           — category labels on X axis
 *   groups: [{ name, values[], color, colors[] }] — one series per group;
 *                                    optional `colors[]` overrides `color` per bar (index = category)
 *   stacked: false                 — when true, segments stack within a single bar per category
 *   barGap: 4                      — gap in px between bars within a group (grouped mode only)
 *   categoryGap: 0.3               — fraction of category width reserved as spacing (0–0.8)
 */

import ChartBase from '../chart-base.js';
import {
  svgEl, svgText, resolveColor, formatNum, getChartColors
} from '../chart-core.js';

export default class BarChart extends ChartBase {
  /**
   * @param {HTMLElement} container
   * @param {Object} config
   * @param {Object} context
   */
  constructor(container, config, context) {
    const defaults = {
      categories: [],
      groups: [],
      stacked: false,
      barGap: 4,
      categoryGap: 0.3,
      yMin: 0,
      showXTicks: false,   // we draw our own category labels
    };
    super(container, Object.assign(defaults, config), context);
  }

  /* ── Data Extent ─────────────────────────────────────────── */

  /** @override */
  _getDataExtent() {
    const cats = this.config.categories || [];
    const groups = (this.config.groups || []).filter(g => g.visible !== false);
    if (!cats.length || !groups.length) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };

    let yMax = 0;
    if (this.config.stacked) {
      // Stacked: yMax is the per-category sum across visible groups.
      for (let ci = 0; ci < cats.length; ci++) {
        let sum = 0;
        for (const g of groups) sum += Math.max(0, (g.values || [])[ci] || 0);
        if (sum > yMax) yMax = sum;
      }
    } else {
      for (const g of groups) {
        for (const v of (g.values || [])) {
          if (v > yMax) yMax = v;
        }
      }
    }
    if (yMax === 0) yMax = 1;

    return {
      xMin: -0.5,
      xMax: cats.length - 0.5,
      yMin: 0,
      yMax,
    };
  }

  /* ── Render Data ─────────────────────────────────────────── */

  /** @override */
  _renderData(svg, plotGroup, xScale, yScale, xTick, yTick, plotArea, defs) {
    const cats = this.config.categories || [];
    const allGroups = this.config.groups || [];
    // Build visible-only list, keeping original indices for color/config lookup
    const visibleEntries = [];
    allGroups.forEach((g, origIdx) => {
      if (g.visible !== false) visibleEntries.push({ group: g, origIdx });
    });
    if (!cats.length || !visibleEntries.length) return;

    const chartColors = getChartColors();
    const nCats = cats.length;
    const nGroups = visibleEntries.length;
    const barGap = this.config.barGap;
    const catGap = Math.max(0, Math.min(0.8, this.config.categoryGap));

    // Category width in pixels
    const catWidthPx = Math.abs(xScale(1) - xScale(0));
    const usable = catWidthPx * (1 - catGap);
    const stacked = this.config.stacked === true;
    const barW = stacked
      ? Math.max(4, usable)
      : Math.max(4, (usable - (nGroups - 1) * barGap) / nGroups);
    const groupWidth = stacked ? barW : (nGroups * barW + (nGroups - 1) * barGap);

    const yBase = yScale(0);

    // Store geometry for tooltip. For stacked mode the y-extent of each
    // segment is in *data* coordinates (yBot, yTop) — that's what
    // _findNearby uses to pick the right segment under the cursor.
    this._barRects = [];

    for (let ci = 0; ci < nCats; ci++) {
      const catCx = xScale(ci);
      const groupStartX = catCx - groupWidth / 2;

      if (stacked) {
        const bx = groupStartX;
        let cumValue = 0;
        for (let vi = 0; vi < nGroups; vi++) {
          const { group: g, origIdx } = visibleEntries[vi];
          const val = Math.max(0, (g.values || [])[ci] || 0);
          if (val <= 0) continue;
          const perBar = Array.isArray(g.colors) ? g.colors[ci] : null;
          const color = resolveColor(perBar || g.color || chartColors[origIdx % chartColors.length] || `var(--color-chart-${origIdx + 1})`);
          const barStroke = resolveColor(g.stroke || perBar || g.color || chartColors[origIdx % chartColors.length] || `var(--color-chart-${origIdx + 1})`);
          const barSW = g.strokeWidth ?? 1;
          const yTop = yScale(cumValue + val);
          const yBot = yScale(cumValue);
          const bh = yBot - yTop;
          if (bh <= 0) { cumValue += val; continue; }

          svgEl('rect', {
            x: bx, y: yTop,
            width: barW, height: bh,
            fill: color,
            'fill-opacity': 0.75,
            stroke: barStroke,
            'stroke-width': barSW,
            rx: 1,
          }, plotGroup);

          this._barRects.push({
            ci, gi: origIdx, val,
            x: bx, y: yTop, w: barW, h: bh,
            yBot: cumValue, yTop: cumValue + val,
          });
          cumValue += val;
        }
      } else {
        for (let vi = 0; vi < nGroups; vi++) {
          const { group: g, origIdx } = visibleEntries[vi];
          const val = (g.values || [])[ci] || 0;
          const perBar = Array.isArray(g.colors) ? g.colors[ci] : null;
          const color = resolveColor(perBar || g.color || chartColors[origIdx % chartColors.length] || `var(--color-chart-${origIdx + 1})`);
          const barStroke = resolveColor(g.stroke || perBar || g.color || chartColors[origIdx % chartColors.length] || `var(--color-chart-${origIdx + 1})`);
          const barSW = g.strokeWidth ?? 1;
          const bx = groupStartX + vi * (barW + barGap);
          const by = yScale(val);
          const bh = yBase - by;

          if (bh <= 0) continue;

          svgEl('rect', {
            x: bx, y: by,
            width: barW, height: bh,
            fill: color,
            'fill-opacity': 0.75,
            stroke: barStroke,
            'stroke-width': barSW,
            rx: 1,
          }, plotGroup);

          this._barRects.push({ ci, gi: origIdx, val, x: bx, y: by, w: barW, h: bh });
        }
      }

      // Category label (rotated if needed)
      const label = cats[ci];
      const labelX = catCx;
      const labelY = plotArea.y + plotArea.h + 14;

      if (nCats > 6 || cats.some(c => c.length > 8)) {
        svgText(label, {
          x: labelX, y: labelY,
          'text-anchor': 'end',
          'font-size': `${this.config.tickSize || 11}px`,
          fill: resolveColor('var(--color-text-secondary)'),
          transform: `rotate(-30 ${labelX} ${labelY})`,
        }, svg);
      } else {
        svgText(label, {
          x: labelX, y: labelY,
          'text-anchor': 'middle',
          'font-size': `${this.config.tickSize || 11}px`,
          fill: resolveColor('var(--color-text-secondary)'),
        }, svg);
      }
    }
  }

  /* ── Legend Items ────────────────────────────────────────── */

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

  /* ── Series Descriptors (for base editor) ────────────────── */

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
      getStroke: () => g.stroke || g.color || chartColors[i % chartColors.length],
      setStroke: (c) => { g.stroke = c; },
      getStrokeWidth: () => g.strokeWidth ?? 1,
      setStrokeWidth: (v) => { g.strokeWidth = v; },
    }));
  }

  /* ── Find Nearby (tooltip) ──────────────────────────────── */

  /** @override */
  _findNearby(dataX, dataY, proximityPx) {
    const rects = this._barRects;
    if (!rects || !rects.length) return [];

    const cats = this.config.categories || [];
    const groups = this.config.groups || [];
    const stacked = this.config.stacked === true;

    // Find bar under cursor (in data coords)
    const ci = Math.round(dataX);
    if (ci < 0 || ci >= cats.length) return [];

    let best;
    if (stacked) {
      // Each segment owns a [yBot, yTop) data-y band — pick the one
      // straddling the cursor's data-y, or the closest band when above
      // the stack.
      const stackHits = rects.filter(r => r.ci === ci);
      if (!stackHits.length) return [];
      best = stackHits.find(r => dataY >= r.yBot && dataY <= r.yTop);
      if (!best) {
        // Cursor above the stack: snap to the topmost segment.
        let topY = -Infinity;
        for (const r of stackHits) if (r.yTop > topY) { topY = r.yTop; best = r; }
      }
    } else {
      const hits = rects.filter(r => r.ci === ci && dataY >= 0 && dataY <= r.val * 1.05);
      if (!hits.length) return [];
      // Pick closest group
      let bestDist = Infinity;
      for (const h of hits) {
        const cx = h.x + h.w / 2;
        const px = this._xScale(dataX);
        const d = Math.abs(cx - px);
        if (d < bestDist) { bestDist = d; best = h; }
      }
    }
    if (!best) return [];

    const g = groups[best.gi];
    return [{
      html: `<b>${cats[best.ci]}</b><br>${g ? g.name : ''}: ${formatNum(best.val, 1, this.locale)}`,
      px: best.x + best.w / 2,
      py: best.y,
    }];
  }
}
