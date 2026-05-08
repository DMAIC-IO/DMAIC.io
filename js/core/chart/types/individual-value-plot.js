/**
 * individual-value-plot.js — Vertical individual value plot for the
 * D.Mike chart framework. Each group becomes a vertical column of points,
 * with horizontal jitter so overlapping observations remain visible.
 *
 * Optional overlays:
 *   - Mean diamond (per group)
 *   - Median tick (per group)
 *   - Group connection line through means
 *   - Overall mean reference line (full plot width)
 *
 * Config:
 *   groups: [{ name, values, visible? }]   raw numeric arrays per group
 *   jitter: 0.6                            fraction of slot width (0–1)
 *   showMean:   true
 *   showMedian: false
 *   connectMeans: false
 *   showOverallMean: false
 *   pointColors: []                        per-group point fill overrides
 *   pointSymbol:      'circle'
 *   pointSize:        6
 *   pointStrokeWidth: 1.2
 */

import ChartBase from '../chart-base.js';
import {
  svgEl, svgText, resolveColor, formatNum, getChartColors, drawMarker,
} from '../chart-core.js';
import {
  edSection, edCheckboxRow, edRangeRow,
} from '../chart-editor.js';

/* ── Statistics helpers ─────────────────────────────────────── */

/** @param {number[]} sorted @param {number} p */
function percentile(sorted, p) {
  const n = sorted.length;
  const k = (p / 100) * (n - 1);
  const f = Math.floor(k);
  const c = k - f;
  if (f + 1 < n) return sorted[f] + c * (sorted[f + 1] - sorted[f]);
  return sorted[f];
}

/**
 * Deterministic pseudo-random in [-0.5, 0.5] from an integer index.
 * Stable across renders so jitter doesn't dance during interaction.
 */
function jitterOffset(i) {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return (x - Math.floor(x)) - 0.5;
}

/** @param {number[]} values */
function groupStats(values) {
  if (!values || !values.length) return null;
  const s = values.slice().sort((a, b) => a - b);
  const n = s.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const median = percentile(s, 50);
  const min = s[0];
  const max = s[n - 1];
  let sumSq = 0;
  for (const v of values) sumSq += (v - mean) * (v - mean);
  const sd = n > 1 ? Math.sqrt(sumSq / (n - 1)) : 0;
  return { n, mean, median, min, max, sd };
}

/* ── Chart Type ─────────────────────────────────────────────── */

export default class IndividualValuePlotChart extends ChartBase {
  /**
   * @param {HTMLElement} container
   * @param {Object} config
   * @param {Object} context
   */
  constructor(container, config, context) {
    const defaults = {
      groups: [],            // [{ name, values, visible? }]
      jitter: 0.6,           // fraction of slot width (0–1)
      showMean: true,
      showMedian: false,
      connectMeans: false,
      showOverallMean: false,
      showXTicks: false,     // we draw category labels ourselves
      pointColors: [],
      pointSymbol: 'circle',
      pointSize: 6,
      pointStrokeWidth: 1.2,
    };
    super(container, Object.assign(defaults, config), context);
  }

  /* ── Data Extent ─────────────────────────────────────────── */

  /** @override — vertical: X = group index, Y = data values */
  _getDataExtent() {
    const groups = this.config.groups || [];
    const visible = groups.filter((g) => g.visible !== false);
    if (!visible.length) return { xMin: -0.5, xMax: 0.5, yMin: 0, yMax: 1 };

    let yMin = Infinity, yMax = -Infinity;
    for (const g of visible) {
      if (!g.values || !g.values.length) continue;
      for (const v of g.values) {
        if (v < yMin) yMin = v;
        if (v > yMax) yMax = v;
      }
    }
    if (!isFinite(yMin)) { yMin = 0; yMax = 1; }

    // Pad Y by 7 % on both ends
    const pad = (yMax - yMin) * 0.07 || 0.5;
    return {
      xMin: -0.5,
      xMax: visible.length - 0.5,
      yMin: yMin - pad,
      yMax: yMax + pad,
    };
  }

  /* ── Render ──────────────────────────────────────────────── */

  /** @override */
  _renderData(svg, plotGroup, xScale, yScale, _xTick, _yTick, plotArea) {
    const allGroups = this.config.groups || [];
    const visibleEntries = [];
    allGroups.forEach((g, origIdx) => {
      if (g.visible !== false) visibleEntries.push({ group: g, origIdx });
    });
    if (!visibleEntries.length) return;

    const cfg = this.config;
    const chartColors = getChartColors();
    const tickSize = cfg.tickSize || 11;
    const textColor = resolveColor('var(--color-text-secondary)');

    const slotW = Math.abs(xScale(1) - xScale(0));
    const jitterFrac = Math.max(0, Math.min(1, cfg.jitter ?? 0.6));
    const jitterPx = slotW * jitterFrac * 0.5;

    const r = (cfg.pointSize ?? 6) / 2;
    const sym = cfg.pointSymbol || 'circle';
    const strokeW = cfg.pointStrokeWidth ?? 1.2;

    // Cache for tooltips and overlays
    this._groupStats = [];
    this._visibleEntries = visibleEntries;

    // Optional connecting line through group means
    if (cfg.connectMeans) {
      const pts = [];
      for (let i = 0; i < visibleEntries.length; i++) {
        const stats = groupStats(visibleEntries[i].group.values);
        if (!stats) continue;
        pts.push(`${xScale(i)},${yScale(stats.mean)}`);
      }
      if (pts.length >= 2) {
        svgEl('polyline', {
          points: pts.join(' '),
          fill: 'none',
          stroke: resolveColor('var(--color-text-tertiary)'),
          'stroke-width': 1,
          'stroke-dasharray': '4 3',
        }, plotGroup);
      }
    }

    // Optional overall mean reference line
    if (cfg.showOverallMean) {
      let total = 0, count = 0;
      for (const { group: g } of visibleEntries) {
        for (const v of g.values || []) {
          if (typeof v === 'number' && !isNaN(v)) { total += v; count++; }
        }
      }
      if (count > 0) {
        const yMean = yScale(total / count);
        svgEl('line', {
          x1: plotArea.x, y1: yMean,
          x2: plotArea.x + plotArea.w, y2: yMean,
          stroke: resolveColor('var(--color-text-secondary)'),
          'stroke-width': 1,
          'stroke-dasharray': '6 4',
        }, plotGroup);
      }
    }

    // Per-group rendering
    for (let i = 0; i < visibleEntries.length; i++) {
      const { group: g, origIdx } = visibleEntries[i];
      const values = (g.values || []).filter((v) => typeof v === 'number' && !isNaN(v));
      const stats = groupStats(values);
      this._groupStats.push(stats);
      if (!stats) continue;

      const color = resolveColor(
        (cfg.pointColors && cfg.pointColors[origIdx])
          || chartColors[origIdx % chartColors.length]
          || 'var(--color-chart-1)'
      );
      const stroke = resolveColor(
        (cfg.pointStrokes && cfg.pointStrokes[origIdx]) || color
      );

      const xCentre = xScale(i);

      // Individual points with deterministic jitter
      for (let j = 0; j < values.length; j++) {
        const dx = jitterPx > 0 ? jitterOffset(origIdx * 9973 + j) * 2 * jitterPx : 0;
        const cx = xCentre + dx;
        const cy = yScale(values[j]);
        drawMarker(plotGroup, sym, cx, cy, r, color, stroke, strokeW);
      }

      // Median tick — scales with the jitter cloud, plus a small margin so
      // it stays visible (and slightly overshoots the outer points) when
      // jitter is set. With jitter = 0 we fall back to a small fixed tick.
      if (cfg.showMedian) {
        const halfW = jitterPx > 0
          ? jitterPx + Math.max(slotW * 0.04, 3)
          : Math.max(slotW * 0.08, 5);
        const yMed = yScale(stats.median);
        svgEl('line', {
          x1: xCentre - halfW, y1: yMed, x2: xCentre + halfW, y2: yMed,
          stroke: color, 'stroke-width': 2.5,
        }, plotGroup);
      }

      // Mean diamond
      if (cfg.showMean) {
        const xM = xCentre;
        const yM = yScale(stats.mean);
        const dSize = Math.min(slotW * 0.12, 7);
        svgEl('polygon', {
          points: `${xM},${yM - dSize} ${xM + dSize},${yM} ${xM},${yM + dSize} ${xM - dSize},${yM}`,
          fill: color,
          stroke: resolveColor('var(--color-bg-primary)'),
          'stroke-width': 1,
        }, plotGroup);
      }

      // Category label (drawn on svg root, below plot area). Offset scales
      // with tickSize so the spacing stays consistent if the user changes
      // chart font sizes; the +14 px on top of the font height keeps the
      // label clearly detached from the axis frame.
      svgText(g.name || `Group ${i + 1}`, {
        x: xCentre,
        y: plotArea.y + plotArea.h + tickSize + 14,
        'text-anchor': 'middle',
        'dominant-baseline': 'hanging',
        'font-size': `${tickSize}px`,
        fill: textColor,
      }, svg);
    }
  }

  /* ── Legend ──────────────────────────────────────────────── */

  /** @override */
  _getLegendItems() {
    const groups = this.config.groups || [];
    const chartColors = getChartColors();
    return groups
      .map((g, i) => ({ g, i }))
      .filter(({ g }) => g.visible !== false)
      .map(({ g, i }) => ({
        type: 'marker',
        symbol: this.config.pointSymbol || 'circle',
        color: (this.config.pointColors && this.config.pointColors[i])
          || chartColors[i % chartColors.length],
        stroke: (this.config.pointColors && this.config.pointColors[i])
          || chartColors[i % chartColors.length],
        strokeWidth: this.config.pointStrokeWidth ?? 1.2,
        label: g.name || `Group ${i + 1}`,
      }));
  }

  /* ── Tooltip ─────────────────────────────────────────────── */

  /** @override */
  _findNearby(dataX, dataY, _proximityPx) {
    const entries = this._visibleEntries || [];
    if (!this._groupStats || !entries.length) return [];

    const idx = Math.round(dataX);
    if (idx < 0 || idx >= entries.length) return [];
    if (Math.abs(dataX - idx) > 0.5) return [];

    const stats = this._groupStats[idx];
    if (!stats) return [];

    if (dataY < stats.min || dataY > stats.max) {
      const margin = (stats.max - stats.min) * 0.1 || 1;
      if (dataY < stats.min - margin || dataY > stats.max + margin) return [];
    }

    const { group: g, origIdx } = entries[idx];
    const loc = this.locale || 'en';
    const dec = this.config.yDec ?? 4;
    const px = this._xScale(idx);
    const py = this._yScale(stats.mean);
    const chartColors = getChartColors();
    const color = resolveColor(
      (this.config.pointColors && this.config.pointColors[origIdx])
        || chartColors[origIdx % chartColors.length]
        || 'var(--color-chart-1)'
    );

    const t = (key) => {
      if (this.context && this.context.i18n) {
        const full = `chart.individualValuePlot.${key}`;
        const val = this.context.i18n.t(full);
        if (val !== full) return val;
      }
      return key;
    };

    return [{
      html: `<b style="color:${color}">${g.name || `Group ${origIdx + 1}`}</b><br>`
        + `n = ${stats.n}<br>`
        + `${t('mean')}: ${formatNum(stats.mean, dec, loc)}<br>`
        + `${t('median')}: ${formatNum(stats.median, dec, loc)}<br>`
        + `${t('sd')}: ${formatNum(stats.sd, dec, loc)}<br>`
        + `${t('min')}: ${formatNum(stats.min, dec, loc)}<br>`
        + `${t('max')}: ${formatNum(stats.max, dec, loc)}`,
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
      getColor: () => (cfg.pointColors && cfg.pointColors[i]) || chartColors[i % chartColors.length],
      setColor: (c) => { if (!cfg.pointColors) cfg.pointColors = []; cfg.pointColors[i] = c; },
      isVisible: () => g.visible !== false,
      setVisible: (v) => { g.visible = v; },
      getSymbol: () => cfg.pointSymbol || 'circle',
      setSymbol: (v) => { cfg.pointSymbol = v; },
      getSize: () => cfg.pointSize ?? 6,
      setSize: (v) => { cfg.pointSize = v; },
      getStroke: () => (cfg.pointStrokes && cfg.pointStrokes[i])
        || (cfg.pointColors && cfg.pointColors[i])
        || chartColors[i % chartColors.length],
      setStroke: (c) => { if (!cfg.pointStrokes) cfg.pointStrokes = []; cfg.pointStrokes[i] = c; },
      getStrokeWidth: () => cfg.pointStrokeWidth ?? 1.2,
      setStrokeWidth: (v) => { cfg.pointStrokeWidth = v; },
    }));
  }

  /* ── Type-Specific Editor ────────────────────────────────── */

  /** @override */
  _buildTypeEditor(inner, _t, onUpdate) {
    const cfg = this.config;
    const th = (key) => {
      if (this.context && this.context.i18n) {
        const full = `chart.editor.individualValuePlot.${key}`;
        const val = this.context.i18n.t(full);
        if (val !== full) return val;
      }
      return key;
    };

    const sec = edSection(th('appearance'));

    sec.appendChild(edCheckboxRow(th('showMean'), cfg.showMean !== false, (v) => {
      cfg.showMean = v; onUpdate();
    }));
    sec.appendChild(edCheckboxRow(th('showMedian'), cfg.showMedian === true, (v) => {
      cfg.showMedian = v; onUpdate();
    }));
    sec.appendChild(edCheckboxRow(th('connectMeans'), cfg.connectMeans === true, (v) => {
      cfg.connectMeans = v; onUpdate();
    }));
    sec.appendChild(edCheckboxRow(th('showOverallMean'), cfg.showOverallMean === true, (v) => {
      cfg.showOverallMean = v; onUpdate();
    }));
    sec.appendChild(edRangeRow(th('jitter'), Math.round((cfg.jitter ?? 0.6) * 100), (v) => {
      cfg.jitter = Math.max(0, Math.min(1, v / 100));
      // Use render() — not onUpdate() — so we don't rebuild the editor (and
      // tear down the live slider element) on every drag step.
      this.render();
    }, 0, 100, 5));

    inner.appendChild(sec);
  }
}
