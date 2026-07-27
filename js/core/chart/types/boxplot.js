/**
 * boxplot.js — Horizontal box plot chart type for the D.Mike chart framework.
 * Supports: multiple groups (stacked vertically), outlier markers,
 * mean diamonds, whiskers at 1.5×IQR, per-group tooltips.
 *
 * Config:
 *   groups: [{ name, values }]  — raw numeric arrays per group
 *   boxHeight: 0.6              — fraction of slot height (0–1)
 *   showOutliers: true
 *   showMean: true
 *   boxColors: []               — override colors per group
 */

import ChartBase from '../chart-base.js';
import { h } from '../../dom.js';
import {
  svgEl, svgText, resolveColor, formatNum, getChartColors, drawMarker
} from '../chart-core.js';
import {
  edSection, edCheckboxRow, edInlineNum,
  edMarkerSection
} from '../chart-editor.js';

/* ── Statistics helpers ─────────────────────────────────────── */

/**
 * Linear interpolation percentile.
 * @param {number[]} sorted
 * @param {number} p - 0–100
 * @returns {number}
 */
function percentile(sorted, p) {
  const n = sorted.length;
  const k = (p / 100) * (n - 1);
  const f = Math.floor(k);
  const c = k - f;
  if (f + 1 < n) return sorted[f] + c * (sorted[f + 1] - sorted[f]);
  return sorted[f];
}

/**
 * Compute box-plot five-number summary + outliers + mean.
 * @param {number[]} values
 * @returns {{ q1, median, q3, whiskerLo, whiskerHi, outliers, mean, min, max, n }|null}
 */
function boxStats(values) {
  if (!values || values.length === 0) return null;
  const s = values.slice().sort((a, b) => a - b);
  const n = s.length;
  const q1 = percentile(s, 25);
  const median = percentile(s, 50);
  const q3 = percentile(s, 75);
  const iqr = q3 - q1;
  const fenceLo = q1 - 1.5 * iqr;
  const fenceHi = q3 + 1.5 * iqr;
  let whiskerLo = s[0];
  let whiskerHi = s[n - 1];
  for (let i = 0; i < n; i++) { if (s[i] >= fenceLo) { whiskerLo = s[i]; break; } }
  for (let i = n - 1; i >= 0; i--) { if (s[i] <= fenceHi) { whiskerHi = s[i]; break; } }
  const outliers = [];
  for (let i = 0; i < n; i++) {
    if (s[i] < whiskerLo || s[i] > whiskerHi) outliers.push(s[i]);
  }
  const mean = values.reduce((a, b) => a + b, 0) / n;
  return { q1, median, q3, whiskerLo, whiskerHi, outliers, mean, min: s[0], max: s[n - 1], n };
}

/* ── Chart Type ─────────────────────────────────────────────── */

export default class BoxplotChart extends ChartBase {
  /**
   * @param {HTMLElement} container
   * @param {Object} config
   * @param {Object} context
   */
  constructor(container, config, context) {
    const isVertical = config?.orientation === 'vertical';
    const defaults = {
      groups: [],         // [{ name: string, values: number[] }]
      orientation: 'horizontal',  // 'horizontal' (default, data on X) | 'vertical' (data on Y)
      boxHeight: 0.6,     // fraction of slot dimension perpendicular to data axis
      showOutliers: true,
      showMean: true,
      // Suppress numeric ticks on the group axis — group names are drawn manually.
      showXTicks: !isVertical,
      showYTicks: isVertical,
      boxColors: [],
      // Outlier marker styling — null fields fall back to per-group color.
      outlierSymbol: 'circle',
      outlierSize: 6,
      outlierColor: null,        // fill; null = transparent (hollow)
      outlierStroke: null,       // border; null = group color
      outlierStrokeWidth: 1.5,
    };
    super(container, Object.assign(defaults, config), context);
  }

  /* ── Data Extent ─────────────────────────────────────────── */

  /**
   * @override — extent along the data axis spans the union of values;
   * extent along the group axis covers [-0.5, n-0.5]. Axis assignment
   * depends on orientation: horizontal → data on X, vertical → data on Y.
   */
  _getDataExtent() {
    const groups = this.config.groups || [];
    const visible = groups.filter(g => g.visible !== false);
    if (!visible.length) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };

    let dMin = Infinity, dMax = -Infinity;
    for (const g of visible) {
      if (!g.values || !g.values.length) continue;
      for (const v of g.values) {
        if (v < dMin) dMin = v;
        if (v > dMax) dMax = v;
      }
    }
    if (!isFinite(dMin)) { dMin = 0; dMax = 1; }

    // Pad the data axis by 5 %.
    const pad = (dMax - dMin) * 0.05 || 0.5;
    const dataMin = dMin - pad;
    const dataMax = dMax + pad;
    const groupMin = -0.5;
    const groupMax = visible.length - 0.5;

    return this.config.orientation === 'vertical'
      ? { xMin: groupMin, xMax: groupMax, yMin: dataMin, yMax: dataMax }
      : { xMin: dataMin,  xMax: dataMax,  yMin: groupMin, yMax: groupMax };
  }

  /**
   * @override — in the default horizontal orientation the group axis is Y, so
   * the left gutter holds the category names instead of numeric ticks. In
   * vertical orientation they sit below the plot and the base default applies.
   */
  _getYAxisLabels() {
    if (this.config.orientation === 'vertical') return super._getYAxisLabels();
    const groups = this.config.groups || [];
    return {
      labels: groups.map((g, i) => g.name || `Group ${i + 1}`),
      mono: false,
    };
  }

  /* ── Render ──────────────────────────────────────────────── */

  /** @override */
  _renderData(svg, plotGroup, xScale, yScale, _xTick, _yTick, plotArea, _defs) {
    const allGroups = this.config.groups || [];
    // Build visible-only list, keeping original indices for color/config lookup
    const visibleEntries = [];
    allGroups.forEach((g, origIdx) => {
      if (g.visible !== false) visibleEntries.push({ group: g, origIdx });
    });
    if (!visibleEntries.length) return;

    const chartColors = getChartColors();
    const cfg = this.config;
    const nGroups = visibleEntries.length;
    const isVertical = cfg.orientation === 'vertical';

    // In vertical orientation the data axis is Y and the group axis is X;
    // in horizontal (default) it's the other way round.
    const dataScale  = isVertical ? yScale : xScale;
    const groupScale = isVertical ? xScale : yScale;

    // Theme colors for category labels
    const textColor = resolveColor('var(--color-text-secondary)');
    const tickSize = cfg.tickSize || 11;

    // Store computed stats for tooltip (indexed by visible position)
    this._groupStats = [];
    this._visibleEntries = visibleEntries;

    for (let i = 0; i < nGroups; i++) {
      const { group: g, origIdx } = visibleEntries[i];
      const stats = boxStats(g.values);
      this._groupStats.push(stats);
      if (!stats) continue;

      const color = resolveColor(
        (cfg.boxColors && cfg.boxColors[origIdx]) || chartColors[origIdx % chartColors.length] || 'var(--color-chart-1)'
      );
      const boxStroke = resolveColor(
        (cfg.boxStrokes && cfg.boxStrokes[origIdx]) || color
      );
      const boxSW = (cfg.boxStrokeWidths && cfg.boxStrokeWidths[origIdx]) ?? 1.5;

      const groupCentre = groupScale(i);
      const slotSpan = Math.abs(groupScale(0) - groupScale(1));
      const boxSpan = slotSpan * (cfg.boxHeight || 0.6);
      const halfSpan = boxSpan / 2;
      const capSpan = halfSpan * 0.5;

      const dQ1  = dataScale(stats.q1);
      const dQ3  = dataScale(stats.q3);
      const dMed = dataScale(stats.median);
      const dWLo = dataScale(stats.whiskerLo);
      const dWHi = dataScale(stats.whiskerHi);

      if (isVertical) {
        // ── Vertical: data on Y, groups on X ──
        // Whisker spines (vertical lines from cap to box)
        svgEl('line', {
          x1: groupCentre, y1: dWLo, x2: groupCentre, y2: dQ1,
          stroke: boxStroke, 'stroke-width': boxSW,
        }, plotGroup);
        svgEl('line', {
          x1: groupCentre, y1: dQ3, x2: groupCentre, y2: dWHi,
          stroke: boxStroke, 'stroke-width': boxSW,
        }, plotGroup);
        // Whisker caps (horizontal lines)
        svgEl('line', {
          x1: groupCentre - capSpan, y1: dWLo, x2: groupCentre + capSpan, y2: dWLo,
          stroke: boxStroke, 'stroke-width': boxSW,
        }, plotGroup);
        svgEl('line', {
          x1: groupCentre - capSpan, y1: dWHi, x2: groupCentre + capSpan, y2: dWHi,
          stroke: boxStroke, 'stroke-width': boxSW,
        }, plotGroup);
        // Box (IQR) — note Y axis points down, so q3 has smaller pixel-y than q1.
        svgEl('rect', {
          x: groupCentre - halfSpan, y: Math.min(dQ1, dQ3),
          width: boxSpan, height: Math.max(1, Math.abs(dQ3 - dQ1)),
          fill: color, 'fill-opacity': 0.35,
          stroke: boxStroke, 'stroke-width': boxSW,
          rx: 2,
        }, plotGroup);
        // Median (horizontal line across box)
        svgEl('line', {
          x1: groupCentre - halfSpan, y1: dMed, x2: groupCentre + halfSpan, y2: dMed,
          stroke: color, 'stroke-width': 2.5,
        }, plotGroup);
        // Mean diamond
        if (cfg.showMean) {
          const dM = dataScale(stats.mean);
          const dSize = Math.min(halfSpan * 0.45, 5);
          svgEl('polygon', {
            points: `${groupCentre},${dM - dSize} ${groupCentre + dSize},${dM} ${groupCentre},${dM + dSize} ${groupCentre - dSize},${dM}`,
            fill: color, stroke: resolveColor('var(--color-bg-primary)'), 'stroke-width': 0.8,
          }, plotGroup);
        }
        // Outliers
        if (cfg.showOutliers && stats.outliers.length) {
          const oSym = cfg.outlierSymbol || 'circle';
          const oR = (cfg.outlierSize ?? 6) / 2;
          const oFill = cfg.outlierColor != null ? resolveColor(cfg.outlierColor) : 'none';
          const oStroke = cfg.outlierStroke != null ? resolveColor(cfg.outlierStroke) : color;
          const oSW = cfg.outlierStrokeWidth ?? 1.5;
          for (const ov of stats.outliers) {
            drawMarker(plotGroup, oSym, groupCentre, dataScale(ov), oR, oFill, oStroke, oSW);
          }
        }
        // Category label below the plot area
        svgText(g.name || `Group ${i + 1}`, {
          x: groupCentre,
          y: plotArea.y + plotArea.h + tickSize + 4,
          'text-anchor': 'middle',
          'dominant-baseline': 'hanging',
          'font-size': `${tickSize}px`,
          fill: textColor,
        }, svg);
      } else {
        // ── Horizontal (default): data on X, groups on Y ──
        const yCentre = groupCentre;
        // Whisker lines (horizontal)
        svgEl('line', {
          x1: dWLo, y1: yCentre, x2: dQ1, y2: yCentre,
          stroke: boxStroke, 'stroke-width': boxSW,
        }, plotGroup);
        svgEl('line', {
          x1: dQ3, y1: yCentre, x2: dWHi, y2: yCentre,
          stroke: boxStroke, 'stroke-width': boxSW,
        }, plotGroup);
        // Whisker caps (vertical)
        svgEl('line', {
          x1: dWLo, y1: yCentre - capSpan, x2: dWLo, y2: yCentre + capSpan,
          stroke: boxStroke, 'stroke-width': boxSW,
        }, plotGroup);
        svgEl('line', {
          x1: dWHi, y1: yCentre - capSpan, x2: dWHi, y2: yCentre + capSpan,
          stroke: boxStroke, 'stroke-width': boxSW,
        }, plotGroup);
        // Box (IQR)
        svgEl('rect', {
          x: dQ1, y: yCentre - halfSpan,
          width: Math.max(1, dQ3 - dQ1), height: boxSpan,
          fill: color, 'fill-opacity': 0.35,
          stroke: boxStroke, 'stroke-width': boxSW,
          rx: 2,
        }, plotGroup);
        // Median line
        svgEl('line', {
          x1: dMed, y1: yCentre - halfSpan, x2: dMed, y2: yCentre + halfSpan,
          stroke: color, 'stroke-width': 2.5,
        }, plotGroup);
        // Mean diamond
        if (cfg.showMean) {
          const dM = dataScale(stats.mean);
          const dSize = Math.min(halfSpan * 0.45, 5);
          svgEl('polygon', {
            points: `${dM},${yCentre - dSize} ${dM + dSize},${yCentre} ${dM},${yCentre + dSize} ${dM - dSize},${yCentre}`,
            fill: color, stroke: resolveColor('var(--color-bg-primary)'), 'stroke-width': 0.8,
          }, plotGroup);
        }
        // Outliers
        if (cfg.showOutliers && stats.outliers.length) {
          const oSym = cfg.outlierSymbol || 'circle';
          const oR = (cfg.outlierSize ?? 6) / 2;
          const oFill = cfg.outlierColor != null ? resolveColor(cfg.outlierColor) : 'none';
          const oStroke = cfg.outlierStroke != null ? resolveColor(cfg.outlierStroke) : color;
          const oSW = cfg.outlierStrokeWidth ?? 1.5;
          for (const ov of stats.outliers) {
            drawMarker(plotGroup, oSym, dataScale(ov), yCentre, oR, oFill, oStroke, oSW);
          }
        }
        // Category label to the left of the plot area
        svgText(g.name || `Group ${i + 1}`, {
          x: plotArea.x - 8,
          y: yCentre,
          'text-anchor': 'end',
          'dominant-baseline': 'central',
          'font-size': `${tickSize}px`,
          fill: textColor,
        }, svg);
      }
    }
  }

  /* ── Legend ───────────────────────────────────────────────── */

  /** @override */
  _getLegendItems() {
    const groups = this.config.groups || [];
    const chartColors = getChartColors();
    return groups
      .map((g, i) => ({ g, i }))
      .filter(({ g }) => g.visible !== false)
      .map(({ g, i }) => ({
        type: 'rect',
        color: (this.config.boxColors && this.config.boxColors[i]) || chartColors[i % chartColors.length],
        label: g.name || `Group ${i + 1}`,
      }));
  }

  /* ── Tooltip ─────────────────────────────────────────────── */

  /** @override */
  _findNearby(dataX, dataY, _proximityPx) {
    const entries = this._visibleEntries || [];
    if (!this._groupStats || !entries.length) return [];

    const isVertical = this.config.orientation === 'vertical';
    // Group axis carries the slot index; data axis carries the measurement.
    const groupCoord = isVertical ? dataX : dataY;
    const dataCoord  = isVertical ? dataY : dataX;

    const idx = Math.round(groupCoord);
    if (idx < 0 || idx >= entries.length) return [];

    const stats = this._groupStats[idx];
    if (!stats) return [];

    const { group: g, origIdx } = entries[idx];

    // Check if cursor is within whisker range along the data axis (with margin).
    const margin = (stats.whiskerHi - stats.whiskerLo) * 0.1 || 1;
    if (dataCoord < stats.whiskerLo - margin || dataCoord > stats.whiskerHi + margin) return [];

    const loc = this.locale || 'en';
    const dec = this.config.xDec ?? 4;
    const px = isVertical ? this._xScale(idx) : this._xScale(stats.median);
    const py = isVertical ? this._yScale(stats.median) : this._yScale(idx);
    const chartColors = getChartColors();
    const color = resolveColor(
      (this.config.boxColors && this.config.boxColors[origIdx]) || chartColors[origIdx % chartColors.length] || 'var(--color-chart-1)'
    );

    const t = (key) => {
      if (this.context && this.context.i18n) {
        const full = `chart.boxplot.${key}`;
        const val = this.context.i18n.t(full);
        if (val !== full) return val;
      }
      return key;
    };

    return [{
      node: h('div', null,
        h('b', { style: `color:${color}` }, g.name || `Group ${origIdx + 1}`),
        h('br'),
        `n = ${stats.n}`, h('br'),
        `${t('min')}: ${formatNum(stats.min, dec, loc)}`, h('br'),
        `Q1: ${formatNum(stats.q1, dec, loc)}`, h('br'),
        `${t('median')}: ${formatNum(stats.median, dec, loc)}`, h('br'),
        `Q3: ${formatNum(stats.q3, dec, loc)}`, h('br'),
        `${t('max')}: ${formatNum(stats.max, dec, loc)}`, h('br'),
        `${t('mean')}: ${formatNum(stats.mean, dec, loc)}`,
        stats.outliers.length ? h('br') : null,
        stats.outliers.length ? `${t('outliers')}: ${stats.outliers.length}` : null,
      ),
      px,
      py,
      color,
    }];
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
      getColor: () => (cfg.boxColors && cfg.boxColors[i]) || chartColors[i % chartColors.length],
      setColor: (c) => { if (!cfg.boxColors) cfg.boxColors = []; cfg.boxColors[i] = c; },
      isVisible: () => g.visible !== false,
      setVisible: (v) => { g.visible = v; },
      getStroke: () => (cfg.boxStrokes && cfg.boxStrokes[i]) || 'var(--color-text-primary)',
      setStroke: (c) => { if (!cfg.boxStrokes) cfg.boxStrokes = []; cfg.boxStrokes[i] = c; },
      getStrokeWidth: () => (cfg.boxStrokeWidths && cfg.boxStrokeWidths[i]) ?? 1.5,
      setStrokeWidth: (v) => { if (!cfg.boxStrokeWidths) cfg.boxStrokeWidths = []; cfg.boxStrokeWidths[i] = v; },
    }));
  }

  /* ── Type-Specific Editor ────────────────────────────────── */

  /** @override */
  _buildTypeEditor(inner, _t, onUpdate) {
    const cfg = this.config;
    const th = (key) => {
      if (this.context && this.context.i18n) {
        const full = `chart.editor.boxplot.${key}`;
        const val = this.context.i18n.t(full);
        if (val !== full) return val;
      }
      return key;
    };

    // ── Appearance ──
    const sec = edSection(th('appearance'));

    sec.appendChild(edCheckboxRow(th('showOutliers'), cfg.showOutliers !== false, (v) => {
      cfg.showOutliers = v;
      onUpdate();
    }));

    sec.appendChild(edCheckboxRow(th('showMean'), cfg.showMean !== false, (v) => {
      cfg.showMean = v;
      onUpdate();
    }));

    sec.appendChild(edInlineNum(th('boxHeight'), (cfg.boxHeight || 0.6) * 100, (v) => {
      cfg.boxHeight = Math.max(0.1, Math.min(1, v / 100));
      onUpdate();
    }, 10, 100, 5));

    inner.appendChild(sec);

    // ── Outlier marker styling ──
    if (cfg.showOutliers !== false) {
      const tk = (key) => {
        if (this.context && this.context.i18n) {
          const full = `chart.editor.marker.${key}`;
          const val = this.context.i18n.t(full);
          if (val !== full) return val;
        }
        return key;
      };
      const render = () => this.render();
      const transparent = 'rgba(0,0,0,0)';

      inner.appendChild(edMarkerSection(
        th('outlierMarker'),
        {
          getSymbol:      () => cfg.outlierSymbol || 'circle',
          setSymbol:      (v) => { cfg.outlierSymbol = v; },
          getSize:        () => cfg.outlierSize ?? 6,
          setSize:        (v) => { cfg.outlierSize = v; },
          getColor:       () => cfg.outlierColor || transparent,
          setColor:       (v) => { cfg.outlierColor = v; },
          getStroke:      () => cfg.outlierStroke || 'rgba(80,80,80,1)',
          setStroke:      (v) => { cfg.outlierStroke = v; },
          getStrokeWidth: () => cfg.outlierStrokeWidth ?? 1.5,
          setStrokeWidth: (v) => { cfg.outlierStrokeWidth = v; },
          onChange:       render,
        },
        tk,
      ));
    }
  }
}
