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
import {
  svgEl, svgText, resolveColor, formatNum, getChartColors, drawMarker
} from '../chart-core.js';
import {
  edSection, edCheckboxRow, edInlineNum,
  openColorPicker, edMarkerSection
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
    const defaults = {
      groups: [],         // [{ name: string, values: number[] }]
      boxHeight: 0.6,     // fraction of slot height
      showOutliers: true,
      showMean: true,
      showYTicks: false,  // suppress numeric Y ticks — we draw category labels
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

  /** @override — horizontal: X = data values, Y = group index */
  _getDataExtent() {
    const groups = this.config.groups || [];
    const visible = groups.filter(g => g.visible !== false);
    if (!visible.length) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };

    let xMin = Infinity, xMax = -Infinity;
    for (const g of visible) {
      if (!g.values || !g.values.length) continue;
      for (const v of g.values) {
        if (v < xMin) xMin = v;
        if (v > xMax) xMax = v;
      }
    }
    if (!isFinite(xMin)) { xMin = 0; xMax = 1; }

    // Pad X by 5 %
    const pad = (xMax - xMin) * 0.05 || 0.5;
    return {
      xMin: xMin - pad,
      xMax: xMax + pad,
      yMin: -0.5,
      yMax: visible.length - 0.5,
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

      // Y position: group index mapped via yScale (inverted: group 0 at top)
      const yCentre = yScale(i);
      const slotH = Math.abs(yScale(0) - yScale(1));
      const boxH = slotH * (cfg.boxHeight || 0.6);
      const halfH = boxH / 2;

      // X positions
      const xQ1 = xScale(stats.q1);
      const xQ3 = xScale(stats.q3);
      const xMed = xScale(stats.median);
      const xWLo = xScale(stats.whiskerLo);
      const xWHi = xScale(stats.whiskerHi);

      // Whisker lines (horizontal thin lines)
      svgEl('line', {
        x1: xWLo, y1: yCentre, x2: xQ1, y2: yCentre,
        stroke: boxStroke, 'stroke-width': boxSW,
      }, plotGroup);
      svgEl('line', {
        x1: xQ3, y1: yCentre, x2: xWHi, y2: yCentre,
        stroke: boxStroke, 'stroke-width': boxSW,
      }, plotGroup);

      // Whisker caps (vertical lines)
      const capH = halfH * 0.5;
      svgEl('line', {
        x1: xWLo, y1: yCentre - capH, x2: xWLo, y2: yCentre + capH,
        stroke: boxStroke, 'stroke-width': boxSW,
      }, plotGroup);
      svgEl('line', {
        x1: xWHi, y1: yCentre - capH, x2: xWHi, y2: yCentre + capH,
        stroke: boxStroke, 'stroke-width': boxSW,
      }, plotGroup);

      // Box (IQR)
      svgEl('rect', {
        x: xQ1, y: yCentre - halfH,
        width: Math.max(1, xQ3 - xQ1), height: boxH,
        fill: color, 'fill-opacity': 0.35,
        stroke: boxStroke, 'stroke-width': boxSW,
        rx: 2,
      }, plotGroup);

      // Median line
      svgEl('line', {
        x1: xMed, y1: yCentre - halfH, x2: xMed, y2: yCentre + halfH,
        stroke: color, 'stroke-width': 2.5,
      }, plotGroup);

      // Mean diamond
      if (cfg.showMean) {
        const xM = xScale(stats.mean);
        const dSize = Math.min(halfH * 0.45, 5);
        svgEl('polygon', {
          points: `${xM},${yCentre - dSize} ${xM + dSize},${yCentre} ${xM},${yCentre + dSize} ${xM - dSize},${yCentre}`,
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
          drawMarker(plotGroup, oSym, xScale(ov), yCentre, oR, oFill, oStroke, oSW);
        }
      }

      // Category label (drawn outside clip group on svg root)
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

    // Find which visible group band the mouse is in
    const idx = Math.round(dataY);
    if (idx < 0 || idx >= entries.length) return [];

    const stats = this._groupStats[idx];
    if (!stats) return [];

    const { group: g, origIdx } = entries[idx];

    // Check if mouse X is within whisker range (with margin)
    const margin = (stats.whiskerHi - stats.whiskerLo) * 0.1 || 1;
    if (dataX < stats.whiskerLo - margin || dataX > stats.whiskerHi + margin) return [];

    const loc = this.locale || 'en';
    const dec = this.config.xDec ?? 4;
    const px = this._xScale(stats.median);
    const py = this._yScale(idx);
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
      html: `<b style="color:${color}">${g.name || `Group ${origIdx + 1}`}</b><br>`
        + `n = ${stats.n}<br>`
        + `${t('min')}: ${formatNum(stats.min, dec, loc)}<br>`
        + `Q1: ${formatNum(stats.q1, dec, loc)}<br>`
        + `${t('median')}: ${formatNum(stats.median, dec, loc)}<br>`
        + `Q3: ${formatNum(stats.q3, dec, loc)}<br>`
        + `${t('max')}: ${formatNum(stats.max, dec, loc)}<br>`
        + `${t('mean')}: ${formatNum(stats.mean, dec, loc)}`
        + (stats.outliers.length ? `<br>${t('outliers')}: ${stats.outliers.length}` : ''),
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
