/**
 * control-chart.js — SPC control chart type for the D.Mike chart framework.
 * Renders a single subchart (I, MR, X̄, R, or S) with:
 * - Zone bands (A/B/C)
 * - Control lines (CL, UCL, LCL)
 * - Data line with points
 * - Violation markers (enlarged + ring)
 * - Optional phase divider (baseline | monitoring)
 */

import ChartBase from '../chart-base.js';
import { h } from '../../dom.js';
import { svgEl, resolveColor, formatNum, drawMarker } from '../chart-core.js';

export default class ControlChartType extends ChartBase {
  /**
   * @param {HTMLElement} container
   * @param {Object} config
   * @param {Object} context
   */
  constructor(container, config, context) {
    const defaults = {
      /** @type {(number|null)[]} */
      values: [],
      /** Center line */
      cl: 0,
      /** Upper control limit */
      ucl: 0,
      /** Lower control limit */
      lcl: 0,
      /** Estimated sigma */
      sigma: 0,
      /** Index labels (1-based) */
      labels: [],
      /** Set of indices that are violations */
      violationIndices: new Set(),
      /** Set of indices marked excluded by the user (Phase-I exclusion) */
      excludedIndices: new Set(),
      /** Color for excluded points */
      excludedColor: 'var(--color-text-tertiary)',
      /** Index marking end of baseline (null = no divider) */
      baselineEnd: null,
      /** Optional list of stage boundary indices for multi-stage charts */
      stageBoundaries: null,
      /** Show zone bands */
      showZones: true,
      /** Zone colors */
      zoneAColor: 'rgba(239,68,68,0.06)',
      zoneBColor: 'rgba(234,179,8,0.06)',
      zoneCColor: 'rgba(34,197,94,0.06)',
      /** Line/point colors */
      lineColor: 'var(--color-accent)',
      pointColor: 'var(--color-accent)',
      violationColor: 'var(--color-error)',
      clColor: 'var(--color-success)',
      uclColor: 'var(--color-error)',
      lclColor: 'var(--color-error)',
      phaseColor: 'var(--color-warning)',
      /** Upper / lower specification limits (null = not shown) */
      usl: null,
      lsl: null,
      uslColor: 'var(--color-warning)',
      lslColor: 'var(--color-warning)',
      /** Point radius */
      pointRadius: 3,
      violationRadius: 5,
      /** Point marker styling (applies to non-violation, in-spec points) */
      pointSymbol: 'circle',
      pointSize: 6,             // diameter (px); overrides pointRadius when set
      pointStroke: null,        // null = no border
      pointStrokeWidth: 0,
    };
    super(container, Object.assign(defaults, config), context);
  }

  // ── Abstract Implementation ────────────────────────────────────────

  /** @override */
  _getDataExtent() {
    const { values, ucl, lcl, cl, sigma, usl, lsl } = this.config;
    const valid = values.filter(v => v !== null && v !== undefined);
    if (!valid.length) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };

    const yVals = [...valid];
    const flat = (v) => Array.isArray(v) ? v : [v];
    const clArr = flat(cl);
    const sigmaArr = flat(sigma);
    flat(ucl).forEach(v => yVals.push(v));
    flat(lcl).forEach(v => yVals.push(v));
    clArr.forEach(c => yVals.push(c));
    // Pad ±3.2σ around the matching center line (same length when both arrays)
    for (let i = 0; i < Math.max(clArr.length, sigmaArr.length); i++) {
      const c = clArr[i] ?? clArr[0];
      const s = sigmaArr[i] ?? sigmaArr[0];
      yVals.push(c + 3.2 * s, c - 3.2 * s);
    }
    if (usl != null) yVals.push(usl);
    if (lsl != null) yVals.push(lsl);
    const yMin = Math.min(...yVals);
    const yMax = Math.max(...yVals);
    const pad = (yMax - yMin) * 0.05 || 1;

    return {
      xMin: 0.5,
      xMax: values.length + 0.5,
      yMin: yMin - pad,
      yMax: yMax + pad,
    };
  }

  /**
   * @override
   * plotGroup already has clip-path from ChartBase — no need to clip children.
   */
  _renderData(svg, plotGroup, xScale, yScale, xTick, yTick, plotArea, _defs) {
    const { values, cl, ucl, lcl, sigma, violationIndices, baselineEnd, showZones } = this.config;
    if (!values.length) return;

    const variableLimits = Array.isArray(ucl) || Array.isArray(lcl) || Array.isArray(sigma);
    const sigmaScalar = !Array.isArray(sigma) ? sigma : 0;

    // ── Zone bands (only meaningful for constant σ) ──
    if (showZones && !variableLimits && sigma > 0) {
      const zones = [
        { from: cl + 2 * sigma, to: cl + 3 * sigma, color: this.config.zoneAColor },
        { from: cl + sigma, to: cl + 2 * sigma, color: this.config.zoneBColor },
        { from: cl, to: cl + sigma, color: this.config.zoneCColor },
        { from: cl - sigma, to: cl, color: this.config.zoneCColor },
        { from: cl - 2 * sigma, to: cl - sigma, color: this.config.zoneBColor },
        { from: cl - 3 * sigma, to: cl - 2 * sigma, color: this.config.zoneAColor },
      ];

      for (const z of zones) {
        const y1 = Math.max(yScale(z.to), plotArea.y);
        const y2 = Math.min(yScale(z.from), plotArea.y + plotArea.h);
        if (y2 > y1) {
          plotGroup.appendChild(svgEl('rect', {
            x: plotArea.x, y: y1, width: plotArea.w, height: y2 - y1,
            fill: z.color,
          }));
        }
      }
    }

    // ── σ grid lines (only for constant σ) ──
    if (!variableLimits && sigmaScalar > 0) {
      for (let m = -3; m <= 3; m++) {
        if (m === 0) continue;
        const y = yScale(cl + m * sigmaScalar);
        if (y >= plotArea.y && y <= plotArea.y + plotArea.h) {
          plotGroup.appendChild(svgEl('line', {
            x1: plotArea.x, y1: y, x2: plotArea.x + plotArea.w, y2: y,
            stroke: resolveColor('var(--color-border-secondary)'), 'stroke-width': 0.5,
            'stroke-dasharray': '3,3',
          }));
        }
      }
    }

    // ── Control lines (UCL, CL, LCL) ──
    if (Array.isArray(ucl)) {
      this._drawSteppedLine(plotGroup, xScale, yScale, ucl, this.config.uclColor, 'UCL', true);
    } else {
      this._drawControlLine(plotGroup, plotArea, yScale, ucl, this.config.uclColor, 'UCL', true);
    }
    if (Array.isArray(cl)) {
      this._drawSteppedLine(plotGroup, xScale, yScale, cl, this.config.clColor, 'CL', false);
    } else {
      this._drawControlLine(plotGroup, plotArea, yScale, cl, this.config.clColor, 'CL', false);
    }
    if (Array.isArray(lcl)) {
      this._drawSteppedLine(plotGroup, xScale, yScale, lcl, this.config.lclColor, 'LCL', true);
    } else {
      this._drawControlLine(plotGroup, plotArea, yScale, lcl, this.config.lclColor, 'LCL', true);
    }

    // ── Specification limits (USL, LSL) ──
    if (this.config.usl != null) {
      this._drawControlLine(plotGroup, plotArea, yScale, this.config.usl, this.config.uslColor, 'USL', false);
    }
    if (this.config.lsl != null) {
      this._drawControlLine(plotGroup, plotArea, yScale, this.config.lsl, this.config.lslColor, 'LSL', false);
    }

    // ── Stage dividers (multiple) ──
    const stageBoundaries = Array.isArray(this.config.stageBoundaries)
      ? this.config.stageBoundaries.filter(b => b > 0 && b < values.length)
      : [];
    for (const b of stageBoundaries) {
      const sx = xScale(b + 0.5);
      plotGroup.appendChild(svgEl('line', {
        x1: sx, y1: plotArea.y, x2: sx, y2: plotArea.y + plotArea.h,
        stroke: resolveColor(this.config.phaseColor), 'stroke-width': 1.5,
        'stroke-dasharray': '6,4',
      }));
    }

    // ── Phase divider (legacy single-baseline) ──
    if (baselineEnd !== null && baselineEnd < values.length) {
      const px = xScale(baselineEnd + 0.5);
      plotGroup.appendChild(svgEl('line', {
        x1: px, y1: plotArea.y, x2: px, y2: plotArea.y + plotArea.h,
        stroke: resolveColor(this.config.phaseColor), 'stroke-width': 1.5,
        'stroke-dasharray': '6,4',
      }));
    }

    // ── Data line ──
    let pathD = '';
    for (let i = 0; i < values.length; i++) {
      if (values[i] === null) continue;
      const x = xScale(i + 1);
      const y = yScale(values[i]);
      pathD += (pathD === '' ? `M${x},${y}` : ` L${x},${y}`);
    }
    if (pathD) {
      plotGroup.appendChild(svgEl('path', {
        d: pathD, fill: 'none',
        stroke: resolveColor(this.config.lineColor), 'stroke-width': 1.8,
      }));
    }

    // ── Data points ──
    const violSet = violationIndices instanceof Set ? violationIndices : new Set(violationIndices);
    const exclSet = this.config.excludedIndices instanceof Set
      ? this.config.excludedIndices
      : new Set(this.config.excludedIndices || []);
    const hasUSL = this.config.usl != null;
    const hasLSL = this.config.lsl != null;

    for (let i = 0; i < values.length; i++) {
      if (values[i] === null) continue;
      const x = xScale(i + 1);
      const y = yScale(values[i]);
      const isExcluded = exclSet.has(i);
      const isViol = violSet.has(i);
      const isOutOfSpec = (hasUSL && values[i] > this.config.usl)
                       || (hasLSL && values[i] < this.config.lsl);

      // Excluded points: render as a gray ✕ and skip the regular marker logic.
      if (isExcluded) {
        const r = (this.config.pointSize ?? this.config.pointRadius * 2) / 2;
        const c = resolveColor(this.config.excludedColor);
        plotGroup.appendChild(svgEl('line', {
          x1: x - r, y1: y - r, x2: x + r, y2: y + r,
          stroke: c, 'stroke-width': 1.5, opacity: 0.7,
        }));
        plotGroup.appendChild(svgEl('line', {
          x1: x - r, y1: y + r, x2: x + r, y2: y - r,
          stroke: c, 'stroke-width': 1.5, opacity: 0.7,
        }));
        continue;
      }

      if (isViol) {
        plotGroup.appendChild(svgEl('circle', {
          cx: x, cy: y, r: this.config.violationRadius + 4,
          fill: 'none', stroke: resolveColor(this.config.violationColor),
          'stroke-width': 2, opacity: 0.4,
        }));
      } else if (isOutOfSpec) {
        plotGroup.appendChild(svgEl('circle', {
          cx: x, cy: y, r: this.config.violationRadius + 3,
          fill: 'none', stroke: resolveColor(this.config.uslColor),
          'stroke-width': 1.5, opacity: 0.5,
        }));
      }

      const pointColor = isViol
        ? this.config.violationColor
        : isOutOfSpec
          ? this.config.uslColor
          : this.config.pointColor;

      if (isViol || isOutOfSpec) {
        // Special marker: keep the original solid-circle highlight.
        plotGroup.appendChild(svgEl('circle', {
          cx: x, cy: y,
          r: this.config.violationRadius,
          fill: resolveColor(pointColor),
        }));
      } else {
        const sym = this.config.pointSymbol || 'circle';
        const sizePx = this.config.pointSize ?? (this.config.pointRadius * 2);
        const r = sizePx / 2;
        const stroke = this.config.pointStroke != null
          ? resolveColor(this.config.pointStroke)
          : 'none';
        const sw = this.config.pointStrokeWidth ?? 0;
        drawMarker(plotGroup, sym, x, y, r, resolveColor(pointColor), stroke, sw);
      }
    }

    // ── Zone labels (right edge) ──
    if (showZones && sigma > 0) {
      const zoneLabels = [
        { y: cl + 2.5 * sigma, label: 'A', color: 'var(--color-error)' },
        { y: cl + 1.5 * sigma, label: 'B', color: 'var(--color-warning)' },
        { y: cl + 0.5 * sigma, label: 'C', color: 'var(--color-success)' },
        { y: cl - 0.5 * sigma, label: 'C', color: 'var(--color-success)' },
        { y: cl - 1.5 * sigma, label: 'B', color: 'var(--color-warning)' },
        { y: cl - 2.5 * sigma, label: 'A', color: 'var(--color-error)' },
      ];
      for (const z of zoneLabels) {
        const yp = yScale(z.y);
        if (yp >= plotArea.y && yp <= plotArea.y + plotArea.h) {
          const txt = svgEl('text', {
            x: plotArea.x + plotArea.w - 6, y: yp + 4,
            fill: resolveColor(z.color), 'font-size': 9, 'font-weight': 500,
            'text-anchor': 'end', opacity: 0.6,
          });
          txt.textContent = z.label;
          plotGroup.appendChild(txt);
        }
      }
    }
  }

  /** @override */
  _getLegendItems() {
    return [];
  }

  /** @override */
  _findNearby(dataX, dataY, proximityPx) {
    const { values, violationIndices } = this.config;
    const results = [];
    const violSet = violationIndices instanceof Set ? violationIndices : new Set(violationIndices);

    for (let i = 0; i < values.length; i++) {
      if (values[i] === null) continue;
      const px = i + 1;
      const py = values[i];
      const dx = Math.abs(px - dataX);
      const dy = Math.abs(py - dataY);
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= proximityPx * 2) {
        const isViol = violSet.has(i);
        const node = h('div', null,
          h('strong', null, `#${i + 1}`),
          h('br'),
          formatNum(values[i], null, this.locale),
          isViol ? h('br') : null,
          isViol ? h('span', { style: `color:${resolveColor('var(--color-error)')}` }, '⚑ Nelson Rule') : null,
        );
        results.push({
          node,
          px, py,
          color: resolveColor(isViol ? 'var(--color-error)' : 'var(--color-accent)'),
          dist,
        });
      }
    }

    results.sort((a, b) => a.dist - b.dist);
    return results.slice(0, 1);
  }

  // ── Series Descriptors (for base editor) ────────────────────────

  /** @override */
  _getSeriesDescriptors() {
    const cfg = this.config;
    return [{
      index: 0,
      getName: () => cfg.title || 'Data Points',
      setName: (v) => { cfg.title = v; },
      getColor: () => cfg.pointColor || 'var(--color-accent)',
      setColor: (c) => { cfg.pointColor = c; },
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

  // ── Private helpers ────────────────────────────────────────────────

  /**
   * Draw a horizontal control line with label.
   * @private
   */
  _drawControlLine(plotGroup, plotArea, yScale, value, color, label, dashed) {
    const y = yScale(value);
    if (y < plotArea.y - 10 || y > plotArea.y + plotArea.h + 10) return;

    plotGroup.appendChild(svgEl('line', {
      x1: plotArea.x, y1: y, x2: plotArea.x + plotArea.w, y2: y,
      stroke: resolveColor(color), 'stroke-width': 1.5,
      'stroke-dasharray': dashed ? '6,4' : 'none',
    }));

    const txt = svgEl('text', {
      x: plotArea.x - 4, y: y + 4,
      fill: resolveColor(color), 'font-size': 10, 'font-weight': 500,
      'text-anchor': 'end',
    });
    txt.textContent = `${label} ${formatNum(value, null, this.locale)}`;
    plotGroup.appendChild(txt);
  }

  /**
   * Draw a stepped (per-sample) control line — used for variable-n attribute
   * charts where UCL/LCL change with subgroup size.
   * The label shows the mean of the limit values (typical convention).
   * @private
   */
  _drawSteppedLine(plotGroup, xScale, yScale, valuesArr, color, label, dashed) {
    if (!valuesArr || !valuesArr.length) return;
    let pathD = '';
    for (let i = 0; i < valuesArr.length; i++) {
      const v = valuesArr[i];
      if (v == null || !Number.isFinite(v)) continue;
      const x1 = xScale(i + 0.5);
      const x2 = xScale(i + 1.5);
      const y = yScale(v);
      pathD += (pathD === '' ? `M${x1},${y}` : ` L${x1},${y}`);
      pathD += ` L${x2},${y}`;
    }
    if (pathD) {
      plotGroup.appendChild(svgEl('path', {
        d: pathD, fill: 'none',
        stroke: resolveColor(color), 'stroke-width': 1.5,
        'stroke-dasharray': dashed ? '6,4' : 'none',
      }));
    }
    // Label using the mean of the limit array (left edge)
    const finite = valuesArr.filter(v => v != null && Number.isFinite(v));
    if (finite.length) {
      const mean = finite.reduce((a, b) => a + b, 0) / finite.length;
      const yMean = yScale(mean);
      const txt = svgEl('text', {
        x: xScale(0.5) - 4, y: yMean + 4,
        fill: resolveColor(color), 'font-size': 10, 'font-weight': 500,
        'text-anchor': 'end',
      });
      txt.textContent = `${label}̄ ${formatNum(mean, null, this.locale)}`;
      plotGroup.appendChild(txt);
    }
  }
}
