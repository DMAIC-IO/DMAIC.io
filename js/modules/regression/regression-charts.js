/**
 * D.Mike — Regression Charts Mixin (regression-charts.js)
 * Chart rendering methods extracted from regression.js.
 * Mixed into the module object via Object.assign — all methods use `this`.
 */

import { regressionCurvePoints, confidenceBand, predictionBand, normalQuantile, predictMulti } from '../../engines/regression-engine.js';
import { getChartColors } from '../../core/chart/chart-core.js';
import { esc } from '../../core/html-utils.js';

/** @type {Record<string, Function>} */
export const chartsMethods = {

  _switchTab(tabId) {
    this._activeTab = tabId;
    const c = this._container;
    c.querySelectorAll('.dmike-tab').forEach(t => t.classList.toggle('dmike-tab--active', t.dataset.tab === tabId));
    c.querySelectorAll('.dmike-tab-content').forEach(t => t.classList.toggle('dmike-tab-content--active', t.dataset.tabContent === tabId));
    this._save();
    this._renderActiveChart();
  },

  // ─── Charts ────────────────────────────────────────────────

  _destroyCharts() {
    for (const ch of this._charts) {
      if (ch && typeof ch.destroy === 'function') ch.destroy();
    }
    this._charts = [];
  },

  async _renderActiveChart() {
    this._destroyCharts();
    const r = this._getActiveResult();
    if (!r) return;

    switch (this._activeTab) {
      case 'scatter': await this._renderScatterChart(r); break;
      case 'residuals': await this._renderResidualChart(r); break;
      case 'order': await this._renderOrderChart(r); break;
      case 'qq': await this._renderQQChart(r); break;
      case 'histogram': await this._renderHistogramChart(r); break;
      case 'ss-pie': await this._renderSSPieChart(r); break;
      case 'main-effects': await this._renderMainEffectsChart(r); break;
      case 'interaction': await this._renderInteractionChart(r); break;
    }
  },

  async _renderScatterChart(r) {
    const t = (k, v) => this._context.i18n.t(`modules.regression.${k}`, v);
    const plotEl = this._container.querySelector('[data-ref="chart-scatter"]');
    if (!plotEl) return;
    plotEl.innerHTML = '';

    // Multi-X polynomial: Actual vs Predicted
    if (r.multiX && r.xCount > 1) {
      const nameY = r._nameY || 'Y';
      const chart = await this._context.chartManager.create(plotEl, 'scatter', {
        title: t('tabActualVsPredicted'),
        xLabel: `${nameY} (${t('fittedValues')})`,
        yLabel: `${nameY} (${t('dataPoints')})`,
        showLegend: true,
        series: [
          {
            name: '',
            color: 'rgba(0,0,0,0)',
            markerSize: 0,
            x: [Math.min(...r.yHat, ...r.ys), Math.max(...r.yHat, ...r.ys)],
            y: [Math.min(...r.yHat, ...r.ys), Math.max(...r.yHat, ...r.ys)],
            connectLine: { show: true, dash: 'dash', width: 1.5, color: 'var(--color-chart-2)' },
            hideLegend: true,
          },
          {
            name: t('dataPoints'),
            color: 'var(--color-chart-1)',
            markerSize: 4,
            strokeWidth: 0.75,
            x: r.yHat,
            y: r.ys,
            symbol: 'circle',
          },
        ],
      });
      this._charts.push(chart);
      return;
    }

    // Single-X: scatter with regression curve
    const nameX = r._nameX || (r._xNames ? r._xNames[0] : 'X');
    const nameY = r._nameY || 'Y';

    // Get X and Y data
    const xs = r.multiX ? r.xMatrix[0] : r.xs;
    const ys = r.ys;

    const series = [
      {
        name: t('dataPoints'),
        color: 'var(--color-chart-1)',
        markerSize: 4,
        strokeWidth: 0.75,
        x: xs,
        y: ys,
        symbol: 'circle',
      },
    ];

    const curvePts = regressionCurvePoints(r);
    if (curvePts.length > 0) {
      series.push({
        name: t('regressionLine'),
        color: 'rgba(0,0,0,0)',
        stroke: 'rgba(0,0,0,0)',
        markerSize: 0,
        x: curvePts.map(p => p.x),
        y: curvePts.map(p => p.y),
        connectLine: { show: true, dash: 'solid', width: 2, color: 'var(--color-error)', foreground: true },
      });

      if (this._showCI && r.multiX) {
        const upper = [], lower = [];
        for (const pt of curvePts) {
          const band = confidenceBand(r, pt.x);
          if (band) {
            upper.push({ x: pt.x, y: band.upper });
            lower.push({ x: pt.x, y: band.lower });
          }
        }
        if (upper.length > 0) {
          series.push({
            name: `CI ${(r.confLevel * 100).toFixed(0)}%`,
            color: 'rgba(0,0,0,0)', stroke: 'rgba(0,0,0,0)', markerSize: 0,
            x: upper.map(p => p.x), y: upper.map(p => p.y),
            connectLine: { show: true, dash: 'dash', width: 1.2, color: 'var(--color-chart-2)' },
          });
          series.push({
            name: '', color: 'rgba(0,0,0,0)', stroke: 'rgba(0,0,0,0)', markerSize: 0,
            x: lower.map(p => p.x), y: lower.map(p => p.y),
            connectLine: { show: true, dash: 'dash', width: 1.2, color: 'var(--color-chart-2)' },
            hideLegend: true,
          });
        }
      }

      if (this._showPI && r.multiX) {
        const upper = [], lower = [];
        for (const pt of curvePts) {
          const band = predictionBand(r, pt.x);
          if (band) {
            upper.push({ x: pt.x, y: band.upper });
            lower.push({ x: pt.x, y: band.lower });
          }
        }
        if (upper.length > 0) {
          series.push({
            name: `PI ${(r.confLevel * 100).toFixed(0)}%`,
            color: 'rgba(0,0,0,0)', stroke: 'rgba(0,0,0,0)', markerSize: 0,
            x: upper.map(p => p.x), y: upper.map(p => p.y),
            connectLine: { show: true, dash: 'dot', width: 1.2, color: 'var(--color-chart-4)' },
          });
          series.push({
            name: '', color: 'rgba(0,0,0,0)', stroke: 'rgba(0,0,0,0)', markerSize: 0,
            x: lower.map(p => p.x), y: lower.map(p => p.y),
            connectLine: { show: true, dash: 'dot', width: 1.2, color: 'var(--color-chart-4)' },
            hideLegend: true,
          });
        }
      }
    }

    const chart = await this._context.chartManager.create(plotEl, 'scatter', {
      title: `${nameX} → ${nameY}`,
      xLabel: nameX,
      yLabel: nameY,
      showLegend: true,
      series,
    });
    this._charts.push(chart);
  },

  async _renderResidualChart(r) {
    const t = (k, v) => this._context.i18n.t(`modules.regression.${k}`, v);
    const plotEl = this._container.querySelector('[data-ref="chart-residuals"]');
    if (!plotEl) return;
    plotEl.innerHTML = '';

    const chart = await this._context.chartManager.create(plotEl, 'scatter', {
      title: t('residualsVsFitted'),
      xLabel: t('fittedValues'),
      yLabel: t('residuals'),
      showLegend: false,
      refLines: [{ dir: 'h', value: 0, dash: 'dash', width: 1, color: 'var(--color-error)', label: '0' }],
      series: [{
        name: t('residuals'),
        color: 'var(--color-chart-3)',
        markerSize: 4,
        strokeWidth: 0.75,
        x: r.yHat,
        y: r.residuals,
        symbol: 'circle',
      }],
    });
    this._charts.push(chart);
  },

  async _renderOrderChart(r) {
    const t = (k, v) => this._context.i18n.t(`modules.regression.${k}`, v);
    const plotEl = this._container.querySelector('[data-ref="chart-order"]');
    if (!plotEl) return;
    plotEl.innerHTML = '';

    const indices = r.residuals.map((_, i) => i + 1);

    const chart = await this._context.chartManager.create(plotEl, 'scatter', {
      title: t('residualsVsOrder'),
      xLabel: t('observationNr'),
      yLabel: t('residuals'),
      showLegend: false,
      refLines: [{ dir: 'h', value: 0, dash: 'dash', width: 1, color: 'var(--color-error)', label: '0' }],
      series: [{
        name: t('residuals'),
        color: 'var(--color-chart-4)',
        markerSize: 4,
        strokeWidth: 0.75,
        x: indices,
        y: r.residuals,
        symbol: 'circle',
        connectLine: { show: true, dash: 'solid', width: 1, color: 'var(--color-chart-4)' },
      }],
    });
    this._charts.push(chart);
  },

  async _renderQQChart(r) {
    const t = (k, v) => this._context.i18n.t(`modules.regression.${k}`, v);
    const plotEl = this._container.querySelector('[data-ref="chart-qq"]');
    if (!plotEl) return;
    plotEl.innerHTML = '';

    const sorted = [...r.residuals].sort((a, b) => a - b);
    const n = sorted.length;
    const resMean = sorted.reduce((s, v) => s + v, 0) / n;
    const resStd = Math.sqrt(sorted.reduce((s, v) => s + (v - resMean) ** 2, 0) / (n - 1));
    const theoretical = sorted.map((_, i) => normalQuantile((i + 0.5) / n));
    const standardized = sorted.map(v => resStd > 0 ? (v - resMean) / resStd : 0);

    const lo = Math.min(Math.min(...theoretical), Math.min(...standardized));
    const hi = Math.max(Math.max(...theoretical), Math.max(...standardized));

    const chart = await this._context.chartManager.create(plotEl, 'scatter', {
      title: t('qqTitle'),
      xLabel: t('theoreticalQuantiles'),
      yLabel: t('standardizedResiduals'),
      showLegend: false,
      series: [
        {
          name: '',
          color: 'rgba(0,0,0,0)', markerSize: 0,
          x: [lo, hi], y: [lo, hi],
          connectLine: { show: true, dash: 'dash', width: 1.5, color: 'var(--color-chart-2)' },
          hideLegend: true,
        },
        {
          name: t('residuals'),
          color: 'var(--color-chart-5)',
          markerSize: 4,
          strokeWidth: 0.75,
          x: theoretical,
          y: standardized,
          symbol: 'circle',
        },
      ],
    });
    this._charts.push(chart);
  },

  async _renderHistogramChart(r) {
    const t = (k, v) => this._context.i18n.t(`modules.regression.${k}`, v);
    const plotEl = this._container.querySelector('[data-ref="chart-histogram"]');
    if (!plotEl) return;
    plotEl.innerHTML = '';

    const chart = await this._context.chartManager.create(plotEl, 'histogram', {
      title: t('histTitle'),
      xLabel: t('residuals'),
      yLabel: t('frequency'),
      showLegend: false,
      showNormalCurve: true,
      data: r.residuals,
    });
    this._charts.push(chart);
  },

  // ─── SS Pie Chart ─────────────────────────────────────────

  async _renderSSPieChart(r) {
    const t = (k, v) => this._context.i18n.t(`modules.regression.${k}`, v);
    const plotEl = this._container.querySelector('[data-ref="chart-ss-pie"]');
    if (!plotEl) return;
    plotEl.innerHTML = '';

    const items = [];
    const coefs = r.coefDetails || [];
    for (let j = 0; j < coefs.length; j++) {
      const c = coefs[j];
      if (c.term === 'Intercept') continue;
      const ss = c.t != null ? c.t ** 2 * r.MSE : 0;
      items.push({ label: c.term, ss });
    }
    items.push({ label: t('sourceResiduals'), ss: r.SSE });

    const colors = getChartColors();
    if (!this._ssPieState || this._ssPieState.length !== items.length) {
      this._ssPieState = items.map(() => true);
    }

    const wrap = document.createElement('div');
    wrap.className = 'reg__ss-pie-wrap';

    const listEl = document.createElement('div');
    listEl.className = 'reg__ss-pie-list';

    const chartEl = document.createElement('div');
    chartEl.className = 'reg__ss-pie-chart';

    const barEl = document.createElement('div');
    barEl.className = 'reg__ss-pie-bars';

    wrap.appendChild(listEl);
    wrap.appendChild(chartEl);
    wrap.appendChild(barEl);
    plotEl.appendChild(wrap);

    const fmtNum = (v) => v.toLocaleString(this._context.language === 'en' ? 'en-US' : 'de-DE', { maximumFractionDigits: 2 });

    for (let i = 0; i < items.length; i++) {
      const row = document.createElement('label');
      row.className = 'reg__ss-pie-item';
      const swatch = `<span class="reg__ss-pie-swatch" style="background:${colors[i % colors.length]}"></span>`;
      row.innerHTML = `<input type="checkbox" checked data-ss-idx="${i}">${swatch}<span class="reg__ss-pie-label">${esc(items[i].label)}</span><span class="reg__ss-pie-val">${fmtNum(items[i].ss)}</span>`;
      if (!this._ssPieState[i]) row.querySelector('input').checked = false;
      listEl.appendChild(row);
    }

    const buildSlices = () => items
      .map((it, i) => ({ name: it.label, value: it.ss, color: colors[i % colors.length] }))
      .filter((_, i) => this._ssPieState[i]);

    const buildBarConfig = () => {
      const visible = items
        .map((it, i) => ({ it, color: colors[i % colors.length], visible: this._ssPieState[i] }))
        .filter(v => v.visible)
        .sort((a, b) => b.it.ss - a.it.ss);
      return {
        categories: visible.map(v => v.it.label),
        groups: [{
          name: t('ssLabel'),
          values: visible.map(v => v.it.ss),
          colors: visible.map(v => v.color),
        }],
        yLabel: t('ssLabel'),
        showLegend: false,
        categoryGap: 0.35,
      };
    };

    let chart = await this._context.chartManager.create(chartEl, 'pie', {
      slices: buildSlices(),
      showLegend: false,
      showTitle: false,
    });
    this._charts.push(chart);

    let barChart = await this._context.chartManager.create(barEl, 'bar', buildBarConfig());
    this._charts.push(barChart);

    listEl.addEventListener('change', (e) => {
      const cb = e.target.closest('[data-ss-idx]');
      if (!cb) return;
      this._ssPieState[+cb.dataset.ssIdx] = cb.checked;
      this._context.chartManager.update(chart, { slices: buildSlices() });
      this._context.chartManager.update(barChart, buildBarConfig());
    });
  },

  // ─── Effect Plots (Minitab-style) ────────────���────────────

  /**
   * Compute predictor means from the filtered X data matrix.
   */
  _getXMeans(r) {
    return r.xMatrix.map(col => col.reduce((s, v) => s + v, 0) / col.length);
  },

  /**
   * Return indices of predictors that have at least one active (non-excluded) term.
   */
  _getActivePredictorIndices(r) {
    const excluded = new Set(r.excludeTerms || []);
    const xNames = r._xNames || [];
    const allTerms = r.allTerms || [];
    const active = [];
    for (let xi = 0; xi < xNames.length; xi++) {
      const name = xNames[xi];
      const hasActive = allTerms.some(term => term !== 'Intercept' && term.includes(name) && !excluded.has(term));
      if (hasActive) active.push(xi);
    }
    return active;
  },

  /**
   * Return Set of predictor indices that participate in at least one active
   * interaction term (a term containing the '·' separator). Their effect is
   * already represented in the interaction plot, so the main-effects plot
   * should omit them to avoid a misleading marginal view.
   */
  _getInteractionPredictorIndices(r) {
    const excluded = new Set(r.excludeTerms || []);
    const xNames = r._xNames || [];
    const allTerms = r.allTerms || [];
    const result = new Set();
    for (const term of allTerms) {
      if (term === 'Intercept' || excluded.has(term)) continue;
      if (!term.includes('·')) continue;
      for (let xi = 0; xi < xNames.length; xi++) {
        if (term.includes(xNames[xi])) result.add(xi);
      }
    }
    return result;
  },

  /**
   * Main Effects Plot: one sub-chart per predictor.
   * Each chart varies Xi from min->max while holding others at their mean,
   * plotting predicted Y. A reference line shows the overall Y mean.
   */
  async _renderMainEffectsChart(r) {
    const t = (k, v) => this._context.i18n.t(`modules.regression.${k}`, v);
    const plotEl = this._container.querySelector('[data-ref="chart-main-effects"]');
    if (!plotEl || !r.multiX) return;
    plotEl.innerHTML = '';

    const xMeans = this._getXMeans(r);
    const yMean = r.ys.reduce((s, v) => s + v, 0) / r.ys.length;
    const xNames = r._xNames || [];
    const STEPS = 50;
    const activeIndices = new Set(this._getActivePredictorIndices(r));
    const interactionIndices = this._getInteractionPredictorIndices(r);

    const grid = document.createElement('div');
    grid.className = 'reg__effects-grid';
    plotEl.appendChild(grid);

    for (let xi = 0; xi < r.xCount; xi++) {
      if (!activeIndices.has(xi)) continue;
      if (interactionIndices.has(xi)) continue;
      const col = r.xMatrix[xi];
      const xMin = Math.min(...col);
      const xMax = Math.max(...col);
      const step = (xMax - xMin) / (STEPS - 1);

      const lineX = [], lineY = [];
      for (let s = 0; s < STEPS; s++) {
        const xVal = xMin + s * step;
        const xVals = [...xMeans];
        xVals[xi] = xVal;
        const pred = predictMulti(r, xVals);
        lineX.push(xVal);
        lineY.push(pred.yHat);
      }

      const cell = document.createElement('div');
      cell.className = 'reg__effects-cell';
      grid.appendChild(cell);

      const chart = await this._context.chartManager.create(cell, 'scatter', {
        title: xNames[xi] || `X${xi + 1}`,
        xLabel: xNames[xi] || `X${xi + 1}`,
        yLabel: t('meanResponse'),
        titleSize: 13,
        labelSize: 11,
        tickSize: 10,
        showLegend: false,
        refLines: [{ dir: 'h', value: yMean, dash: 'dash', width: 1, color: 'var(--color-text-tertiary)', label: '' }],
        series: [{
          name: xNames[xi],
          color: 'var(--color-chart-1)',
          markerSize: 0,
          x: lineX,
          y: lineY,
          connectLine: { show: true, dash: 'solid', width: 2.5, color: 'var(--color-chart-1)' },
        }],
      });
      this._charts.push(chart);
    }
  },

  /**
   * Interaction Plot: for each pair (Xi, Xj), plot predicted Y vs Xi
   * at 3 levels of Xj (min, mean, max), holding others at their mean.
   */
  async _renderInteractionChart(r) {
    const t = (k, v) => this._context.i18n.t(`modules.regression.${k}`, v);
    const plotEl = this._container.querySelector('[data-ref="chart-interaction"]');
    if (!plotEl || !r.multiX || r.xCount < 2) return;
    plotEl.innerHTML = '';

    const xMeans = this._getXMeans(r);
    const xNames = r._xNames || [];
    const STEPS = 50;
    const levelColors = ['var(--color-chart-1)', 'var(--color-chart-3)', 'var(--color-error)'];
    const activeIndices = new Set(this._getActivePredictorIndices(r));

    const grid = document.createElement('div');
    grid.className = 'reg__effects-grid';
    plotEl.appendChild(grid);

    for (let i = 0; i < r.xCount; i++) {
      if (!activeIndices.has(i)) continue;
      for (let j = 0; j < r.xCount; j++) {
        if (i === j) continue;
        if (!activeIndices.has(j)) continue;

        const colI = r.xMatrix[i];
        const colJ = r.xMatrix[j];
        const xiMin = Math.min(...colI);
        const xiMax = Math.max(...colI);
        const xjMin = Math.min(...colJ);
        const xjMean = xMeans[j];
        const xjMax = Math.max(...colJ);
        const step = (xiMax - xiMin) / (STEPS - 1);

        const levels = [
          { val: xjMin, label: `${xNames[j]} ${t('levelLow')}` },
          { val: xjMean, label: `${xNames[j]} ${t('levelMid')}` },
          { val: xjMax, label: `${xNames[j]} ${t('levelHigh')}` },
        ];

        const series = levels.map((lev, li) => {
          const lineX = [], lineY = [];
          for (let s = 0; s < STEPS; s++) {
            const xVal = xiMin + s * step;
            const xVals = [...xMeans];
            xVals[i] = xVal;
            xVals[j] = lev.val;
            const pred = predictMulti(r, xVals);
            lineX.push(xVal);
            lineY.push(pred.yHat);
          }
          return {
            name: lev.label,
            color: levelColors[li],
            markerSize: 0,
            x: lineX,
            y: lineY,
            connectLine: { show: true, dash: 'solid', width: 2, color: levelColors[li] },
          };
        });

        const cell = document.createElement('div');
        cell.className = 'reg__effects-cell';
        grid.appendChild(cell);

        const chart = await this._context.chartManager.create(cell, 'scatter', {
          title: `${xNames[i]} × ${xNames[j]}`,
          xLabel: xNames[i],
          yLabel: t('meanResponse'),
          titleSize: 13,
          labelSize: 11,
          tickSize: 10,
          showLegend: true,
          series,
        });
        this._charts.push(chart);
      }
    }
  },
};
