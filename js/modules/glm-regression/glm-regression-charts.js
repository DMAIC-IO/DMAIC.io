/**
 * D.Mike — GLM Regression Charts Mixin (glm-regression-charts.js)
 * Chart rendering methods mixed into the module object via Object.assign.
 * All methods use `this` (bound to module instance).
 */

import { normalOrderStats, computeROC } from '../../engines/glm-engine.js';

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

  _destroyCharts() {
    for (const ch of this._charts) {
      if (ch && typeof ch.destroy === 'function') ch.destroy();
    }
    this._charts = [];
  },

  async _renderActiveChart() {
    this._destroyCharts();
    if (!this._result || !this._result.converged) return;

    switch (this._activeTab) {
      case 'model': break;
      case 'diagnostics': await this._renderDiagnostics(); break;
      case 'roc': await this._safeChart('chart-roc', () => this._renderROCChart()); break;
      case 'prediction': break;
    }
  },

  /**
   * Wrap a chart render call so a single chart failure can't blank the whole
   * tab. On error, fill the container with a short message instead of leaving
   * it empty (which previously looked like a silent layout bug).
   */
  async _safeChart(refName, fn) {
    try { await fn(); }
    catch (err) {
      console.error('[glm-regression] chart render failed', refName, err);
      const el = this._container.querySelector(`[data-ref="${refName}"]`);
      const t = (k) => this._context.i18n.t(`modules.glm-regression.${k}`);
      if (el) el.innerHTML = `<div class="dmike-chart-error">${t('chartError')}: ${err.message || err}</div>`;
    }
  },

  // ─── Diagnostics tab charts ─────────────────────────────────

  async _renderDiagnostics() {
    const r = this._result;
    if (!r) return;
    const t = (k, v) => this._context.i18n.t(`modules.glm-regression.${k}`, v);

    await this._safeChart('chart-residuals', () => this._renderResidualsVsFitted(r, t));
    await this._safeChart('chart-qq',        () => this._renderQQPlot(r, t));
    await this._safeChart('chart-cooks',     () => this._renderCooksPlot(r, t));
  },

  async _renderResidualsVsFitted(r, t) {
    const el = this._container.querySelector('[data-ref="chart-residuals"]');
    if (!el) return;
    el.innerHTML = '';

    const chart = await this._context.chartManager.create(el, 'scatter', {
      title: t('residualsVsFitted'),
      xLabel: t('fittedValues'),
      yLabel: t('devianceResiduals'),
      series: [{
        x: r.fittedValues,
        y: r.devianceResiduals,
        name: t('devianceResiduals'),
        color: 'var(--color-chart-1)',
        markerSize: 5,
        strokeWidth: 0.75,
        symbol: 'circle',
      }],
      refLines: [
        { dir: 'h', value: 0, dash: 'dash', color: 'var(--color-text-secondary)', width: 1 },
      ],
    });
    this._charts.push(chart);
  },

  async _renderQQPlot(r, t) {
    const el = this._container.querySelector('[data-ref="chart-qq"]');
    if (!el) return;
    el.innerHTML = '';

    const sorted = [...r.devianceResiduals].sort((a, b) => a - b);
    const theoretical = normalOrderStats(sorted.length);

    const lo = Math.min(theoretical[0], sorted[0]);
    const hi = Math.max(theoretical[theoretical.length - 1], sorted[sorted.length - 1]);

    const chart = await this._context.chartManager.create(el, 'scatter', {
      title: t('qqTitle'),
      xLabel: t('theoreticalQuantiles'),
      yLabel: t('devianceResiduals'),
      series: [
        {
          x: theoretical,
          y: sorted,
          name: t('devianceResiduals'),
          color: 'var(--color-chart-1)',
          markerSize: 5,
          strokeWidth: 0.75,
          symbol: 'circle',
        },
        {
          x: [lo, hi],
          y: [lo, hi],
          name: 'Reference',
          color: 'rgba(0,0,0,0)',
          stroke: 'rgba(0,0,0,0)',
          markerSize: 0,
          connectLine: { show: true, dash: 'dash', width: 1.5, color: 'var(--color-error)', foreground: true },
        },
      ],
    });
    this._charts.push(chart);
  },

  async _renderCooksPlot(r, t) {
    const el = this._container.querySelector('[data-ref="chart-cooks"]');
    if (!el) return;
    el.innerHTML = '';

    if (!r._cooks) return;

    const indices = r._cooks.map((_, i) => i + 1);
    const threshold = 4 / r.n;

    const chart = await this._context.chartManager.create(el, 'scatter', {
      title: t('cooksTitle'),
      xLabel: t('observationNr'),
      yLabel: t('cooksDistance'),
      yMin: 0,
      series: [{
        x: indices,
        y: r._cooks,
        name: t('cooksDistance'),
        color: 'var(--color-chart-2)',
        markerSize: 4,
        strokeWidth: 0.75,
        symbol: 'circle',
      }],
      refLines: [
        { dir: 'h', value: threshold, dash: 'dash', color: 'var(--color-warning)', width: 1.5, label: `4/n = ${threshold.toFixed(4)}` },
      ],
    });
    this._charts.push(chart);
  },

  // ─── ROC tab chart ──────────────────────────────────────────

  async _renderROCChart() {
    const r = this._result;
    if (!r || r.family.name !== 'binomial') return;

    const el = this._container.querySelector('[data-ref="chart-roc"]');
    if (!el) return;
    el.innerHTML = '';

    const t = (k, v) => this._context.i18n.t(`modules.glm-regression.${k}`, v);
    const roc = computeROC(r.y, r.fittedValues);

    const chart = await this._context.chartManager.create(el, 'scatter', {
      title: `${t('rocCurve')} (AUC = ${roc.auc.toFixed(4)})`,
      xLabel: t('falsePositiveRate'),
      yLabel: t('truePositiveRate'),
      xMin: 0, xMax: 1,
      yMin: 0, yMax: 1,
      series: [
        {
          x: roc.fpr,
          y: roc.tpr,
          name: 'ROC',
          color: 'rgba(0,0,0,0)',
          stroke: 'rgba(0,0,0,0)',
          markerSize: 0,
          connectLine: { show: true, dash: 'solid', width: 2, color: 'var(--color-chart-1)', foreground: true },
        },
        {
          x: [0, 1],
          y: [0, 1],
          name: t('randomClassifier'),
          color: 'rgba(0,0,0,0)',
          stroke: 'rgba(0,0,0,0)',
          markerSize: 0,
          connectLine: { show: true, dash: 'dash', width: 1.5, color: 'var(--color-text-secondary)' },
        },
      ],
    });
    this._charts.push(chart);
  },
};
