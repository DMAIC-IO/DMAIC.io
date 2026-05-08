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
      /** Index marking end of baseline (null = no divider) */
      baselineEnd: null,
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

    const yVals = [...valid, ucl, lcl, cl + 3.2 * sigma, cl - 3.2 * sigma];
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
  _renderData(svg, plotGroup, xScale, yScale, xTick, yTick, plotArea, defs) {
    const { values, cl, ucl, lcl, sigma, violationIndices, baselineEnd, showZones } = this.config;
    if (!values.length) return;

    // ── Zone bands ──
    if (showZones && sigma > 0) {
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

    // ── σ grid lines ──
    if (sigma > 0) {
      for (let m = -3; m <= 3; m++) {
        if (m === 0) continue;
        const y = yScale(cl + m * sigma);
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
    this._drawControlLine(plotGroup, plotArea, yScale, ucl, this.config.uclColor, 'UCL', true);
    this._drawControlLine(plotGroup, plotArea, yScale, cl, this.config.clColor, 'CL', false);
    this._drawControlLine(plotGroup, plotArea, yScale, lcl, this.config.lclColor, 'LCL', true);

    // ── Specification limits (USL, LSL) ──
    if (this.config.usl != null) {
      this._drawControlLine(plotGroup, plotArea, yScale, this.config.usl, this.config.uslColor, 'USL', false);
    }
    if (this.config.lsl != null) {
      this._drawControlLine(plotGroup, plotArea, yScale, this.config.lsl, this.config.lslColor, 'LSL', false);
    }

    // ── Phase divider ──
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
    const hasUSL = this.config.usl != null;
    const hasLSL = this.config.lsl != null;

    for (let i = 0; i < values.length; i++) {
      if (values[i] === null) continue;
      const x = xScale(i + 1);
      const y = yScale(values[i]);
      const isViol = violSet.has(i);
      const isOutOfSpec = (hasUSL && values[i] > this.config.usl)
                       || (hasLSL && values[i] < this.config.lsl);

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
        let html = `<strong>#${i + 1}</strong><br>${formatNum(values[i], null, this.locale)}`;
        if (isViol) {
          html += `<br><span style="color:${resolveColor('var(--color-error)')}">&#9873; Nelson Rule</span>`;
        }
        results.push({
          html,
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
      getSize: () => cfg.pointSize ?? (cfg.pointRadius * 2) ?? 6,
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
}
