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
 *
 * The category axis runs exactly from the first to the last slot
 * (-0.5 … n-0.5), so the bars fill the plot width.
 *
 * Category labels that are wider than their slot wrap onto up to three lines
 * (the bottom margin grows with them); only when the slots get too narrow to
 * wrap sensibly are the labels rotated by 45° instead. Rotated labels get a
 * bottom (and, if needed, left) margin measured from their length; labels
 * longer than ROTATED_MAX_SHARE of the chart height end in an ellipsis.
 */

import ChartBase, { X_TICKS_BOTTOM, FONT_MAIN } from '../chart-base.js';
import { h } from '../../dom.js';
import {
  svgEl, svgText, resolveColor, formatNum, getChartColors, generateTicks
} from '../chart-core.js';

/** Most lines a wrapped category label takes; the rest ends in an ellipsis. */
const MAX_LABEL_LINES = 3;
/** Narrower category slots (px) rotate their labels instead of wrapping them. */
const MIN_WRAP_SLOT = 50;
/** Rotation (degrees) of category labels in slots too narrow to wrap. */
const ROTATE_DEG = 45;
/** Most of the chart height (share) the rotated labels may take below the plot. */
const ROTATED_MAX_SHARE = 0.4;
/** Baseline offset (px) of the category labels below the plot. */
const LABEL_OFFSET = 14;
/** Horizontal room (px) kept free on each side of a wrapped label. */
const LABEL_PAD = 4;

/**
 * Break a label into lines no wider than `maxWidth`: at spaces first, a word
 * that is too wide on its own is split by characters. Past `maxLines` the
 * last kept line ends in an ellipsis.
 * @param {string} text
 * @param {number} maxWidth px
 * @param {(s: string) => number} measure width of a string in px
 * @param {number} maxLines
 * @returns {string[]} at least one line
 */
export function wrapCategoryLabel(text, maxWidth, measure, maxLines) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maxWidth) { line = candidate; continue; }
    if (line) lines.push(line);
    let rest = word;
    while (rest.length > 1 && measure(rest) > maxWidth) {
      let n = 1;
      while (n < rest.length && measure(rest.slice(0, n + 1)) <= maxWidth) n++;
      lines.push(rest.slice(0, n));
      rest = rest.slice(n);
    }
    line = rest;
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && measure(`${last}…`) > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

/**
 * Shorten a label to `maxWidth`, ending in an ellipsis when cut.
 * @param {string} text
 * @param {number} maxWidth px
 * @param {(s: string) => number} measure width of a string in px
 * @returns {string}
 */
export function ellipsizeLabel(text, maxWidth, measure) {
  const s = String(text ?? '');
  if (measure(s) <= maxWidth) return s;
  let cut = s;
  while (cut && measure(`${cut.trimEnd()}…`) > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

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
      categoricalX: true,  // suppress the "X-Achse Skala" toggle in the editor
      xExact: true,        // the category axis is not nice-rounded
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

  /**
   * @override — the category axis spans exactly the slots, without the
   * generic 6 % padding; configured xMin/xMax and zoom still win.
   */
  _getAxisBounds() {
    const bounds = super._getAxisBounds();
    if (this._viewState) return bounds;
    const n = (this.config.categories || []).length;
    if (!n) return bounds;
    return {
      ...bounds,
      xMin: this.config.xMin ?? -0.5,
      xMax: this.config.xMax ?? n - 0.5,
    };
  }

  /* ── Render Data ─────────────────────────────────────────── */

  /** @override */
  _renderData(svg, plotGroup, xScale, yScale, xTick, yTick, plotArea, _defs) {
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
    const layout = this._categoryLabelLayout();

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

      this._drawCategoryLabel(svg, layout, ci, catCx, plotArea.y + plotArea.h + LABEL_OFFSET);
    }
  }

  /**
   * One category label below the plot: plain, wrapped into tspans, or
   * rotated when the slots are too narrow to wrap.
   * @private
   */
  _drawCategoryLabel(svg, layout, ci, x, y) {
    const attrs = {
      class: 'dmike-bar__category',
      x, y,
      'text-anchor': 'middle',
      'font-size': `${this.config.tickSize || 11}px`,
      fill: resolveColor('var(--color-text-secondary)'),
    };
    const lines = layout.lines[ci];
    if (layout.rotated) {
      svgText(lines[0], { ...attrs, 'text-anchor': 'end', transform: `rotate(-${ROTATE_DEG} ${x} ${y})` }, svg);
    } else if (lines.length === 1) {
      svgText(lines[0], attrs, svg);
    } else {
      const text = svgEl('text', attrs, svg);
      lines.forEach((line, i) => {
        svgEl('tspan', { x, dy: i === 0 ? 0 : layout.lineHeight }, text).textContent = line;
      });
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
  _findNearby(dataX, dataY, _proximityPx) {
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
      for (const hit of hits) {
        const cx = hit.x + hit.w / 2;
        const px = this._xScale(dataX);
        const d = Math.abs(cx - px);
        if (d < bestDist) { bestDist = d; best = hit; }
      }
    }
    if (!best) return [];

    const g = groups[best.gi];
    return [{
      node: h('div', null,
        h('b', null, cats[best.ci]),
        h('br'),
        `${g ? g.name : ''}: ${formatNum(best.val, 1, this.locale)}`,
      ),
      px: best.x + best.w / 2,
      py: best.y,
    }];
  }

  /** @override — category labels are drawn below the plot. */
  _getBottomTickGutter() {
    return X_TICKS_BOTTOM;
  }

  /** @override — room for wrapped lines, or for the drop of rotated labels. */
  _getBottomExtra() {
    const layout = this._categoryLabelLayout();
    if (layout.rotated) {
      const fontSize = this.config.tickSize || 11;
      const sin = Math.sin(ROTATE_DEG * Math.PI / 180);
      // baseline end at LABEL_OFFSET, the text start drops by width·sin; the
      // descenders reach a little further down
      const drop = LABEL_OFFSET + layout.maxWidth * sin + fontSize * 0.5;
      return Math.max(0, Math.ceil(drop) - X_TICKS_BOTTOM + LABEL_PAD);
    }
    const most = Math.max(1, ...layout.lines.map(l => l.length));
    return (most - 1) * layout.lineHeight;
  }

  /**
   * @override — rotated labels hang down to the left of their slot; the
   * first ones may need more room than the y axis labels.
   */
  _measureLeftMargin() {
    const base = super._measureLeftMargin();
    const fontSize = this.config.tickSize || 11;
    const rad = ROTATE_DEG * Math.PI / 180;
    // the slot width depends on the left margin itself: settle it in two passes
    let margin = base;
    for (let pass = 0; pass < 2; pass++) {
      this._leftMargin = margin;
      const layout = this._categoryLabelLayout();
      if (!layout.rotated) return base;
      let need = 0;
      layout.widths.forEach((w, i) => {
        need = Math.max(need, w * Math.cos(rad) + fontSize * Math.sin(rad) - (i + 0.5) * layout.slot);
      });
      margin = Math.max(base, Math.ceil(need) + LABEL_PAD);
    }
    return margin;
  }

  /**
   * How the category labels are drawn — the one rule both the drawing and
   * the margins follow. The slot width comes from the exact category range,
   * so it is known before the margins are.
   * @private
   * @returns {{rotated: boolean, lines: string[][], lineHeight: number,
   *   slot: number, widths: number[], maxWidth: number}}
   */
  _categoryLabelLayout() {
    const cats = (this.config.categories || []).map(c => String(c ?? ''));
    const fontSize = this.config.tickSize || 11;
    const lineHeight = Math.round(fontSize * 1.25);
    const bounds = this._getAxisBounds();
    const exact = this.config.xExact && bounds.xMax > bounds.xMin;
    const tick = exact ? { min: bounds.xMin, max: bounds.xMax } : generateTicks(bounds.xMin, bounds.xMax);
    const slot = cats.length ? this._getPlotWidth() / (tick.max - tick.min) : 0;
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${fontSize}px ${FONT_MAIN}`;
    const measure = (str) => ctx.measureText(str).width;
    if (slot < MIN_WRAP_SLOT) {
      const sin = Math.sin(ROTATE_DEG * Math.PI / 180);
      const cap = Math.max(60, (this._getSize().h * ROTATED_MAX_SHARE) / sin);
      const lines = cats.map(c => [ellipsizeLabel(c, cap, measure)]);
      const widths = lines.map(l => measure(l[0]));
      return { rotated: true, lines, lineHeight, slot, widths, maxWidth: Math.max(0, ...widths) };
    }
    const lines = cats.map(c => wrapCategoryLabel(c, slot - 2 * LABEL_PAD, measure, MAX_LABEL_LINES));
    return { rotated: false, lines, lineHeight, slot, widths: [], maxWidth: 0 };
  }
}
