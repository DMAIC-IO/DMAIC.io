/**
 * D.Mike — Transformed I-MR Control Chart Module (transformed-imr-chart.js)
 *
 * Box-Cox-transformed I-MR for right-skewed or otherwise non-normal data.
 * Either auto-fits λ via Anderson-Darling or accepts a user-supplied value.
 * The chart is plotted on the transformed scale (where SPC limits are valid);
 * a side table shows the back-transformed limits on the original scale for
 * interpretation.
 */

import {
  ColumnPicker, getColumnValues, getColumnName,
} from '../../ui/column-picker.js';

import { computeTransformedIMR } from '../../engines/transformed-chart-engine.js';
import { esc } from '../../core/html-utils.js';

export default {
  id: 'transformed-imr-chart',
  phase: 'control',
  icon: 'activity',
  i18nKey: 'modules.transformed-imr-chart',
  version: '1.0.0',

  _container: null,
  _context: null,
  _columnRef: null,
  _lambdaMode: 'auto',  // 'auto' | 'manual'
  _lambdaManual: 0,
  _picker: null,
  _charts: [],
  _autoRunTimer: null,
  _lastLambda: null,

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    if (!document.getElementById('transformed-imr-chart-css')) {
      const link = document.createElement('link');
      link.id = 'transformed-imr-chart-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/transformed-imr-chart/transformed-imr-chart.css';
      document.head.appendChild(link);
    }

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) this._loadState(saved);

    this._render();
    this._initPicker();
    this._bindEvents();
    this._runAnalysis();
  },

  async destroy() {
    clearTimeout(this._autoRunTimer);
    this._destroyPicker();
    this._destroyCharts();
    this._container.innerHTML = '';
  },

  onLanguageChange() {
    this._destroyCharts();
    this._destroyPicker();
    this._render();
    this._initPicker();
    this._bindEvents();
    this._runAnalysis();
  },

  onThemeChange() {},

  getState() {
    return {
      columnRef: this._columnRef,
      lambdaMode: this._lambdaMode,
      lambdaManual: this._lambdaManual,
    };
  },

  setState(data) {
    if (data) this._loadState(data);
    if (this._container) {
      this._destroyPicker();
      this._render();
      this._initPicker();
      this._bindEvents();
      this._runAnalysis();
    }
  },

  help: () => import('./transformed-imr-chart-help.js'),

  _loadState(s) {
    this._columnRef = s.columnRef || null;
    this._lambdaMode = s.lambdaMode === 'manual' ? 'manual' : 'auto';
    this._lambdaManual = Number.isFinite(s.lambdaManual) ? s.lambdaManual : 0;
  },

  _save() {
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
  },

  _t(key, vars) { return this._context.i18n.t(`modules.transformed-imr-chart.${key}`, vars); },

  _render() {
    this._container.innerHTML = `
      <div class="timr dmike-split">
        <div class="timr__input dmike-split__input">

          <div class="dmike-split__section-title">${this._t('sectionData')}</div>
          <div class="field-group">
            <label>${this._t('dataColumn')}</label>
            <div data-ref="col-picker"></div>
            <span class="timr__hint">${this._t('positiveHint')}</span>
          </div>

          <div class="dmike-split__section-title">${this._t('sectionLambda')}</div>
          <div class="timr__lambda-row">
            <div class="field-group">
              <label>${this._t('lambdaMode')}</label>
              <select class="field" data-ref="lambda-mode">
                <option value="auto"${this._lambdaMode === 'auto' ? ' selected' : ''}>${this._t('lambdaAuto')}</option>
                <option value="manual"${this._lambdaMode === 'manual' ? ' selected' : ''}>${this._t('lambdaManual')}</option>
              </select>
            </div>
            <div class="field-group">
              <label>λ</label>
              <input type="number" class="field field--num" data-ref="lambda-manual"
                value="${this._lambdaManual}" step="0.05" min="-3" max="3"
                ${this._lambdaMode === 'auto' ? 'disabled' : ''}>
            </div>
          </div>
          <span class="timr__hint">${this._t('lambdaHint')}</span>

        </div>

        <div class="timr__output dmike-split__output">
          <div data-ref="error-area"></div>
          <div data-ref="stats-bar"></div>
          <div data-ref="charts-wrap"></div>
          <div data-ref="limits-wrap"></div>
        </div>
      </div>
    `;
  },

  _initPicker() {
    const wrap = this._container.querySelector('[data-ref="col-picker"]');
    if (!wrap) return;
    this._picker = new ColumnPicker(wrap, this._context, {
      mode: 'single', types: ['numeric'], minCount: 5,
      onChange: (ref) => { this._columnRef = ref; this._save(); this._scheduleAutoRun(); },
    });
    if (this._columnRef) this._picker.value = this._columnRef;
  },

  _destroyPicker() {
    if (this._picker) { this._picker.destroy(); this._picker = null; }
  },

  _bindEvents() {
    this._container.addEventListener('change', (e) => {
      const ref = e.target.dataset?.ref;
      if (ref === 'lambda-mode') {
        this._lambdaMode = e.target.value === 'manual' ? 'manual' : 'auto';
        this._save();
        const manualEl = this._container.querySelector('[data-ref="lambda-manual"]');
        if (manualEl) manualEl.disabled = (this._lambdaMode === 'auto');
        this._scheduleAutoRun();
      }
      if (ref === 'lambda-manual') {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) {
          this._lambdaManual = v;
          this._save();
          if (this._lambdaMode === 'manual') this._scheduleAutoRun();
        }
      }
    });
  },

  _scheduleAutoRun() {
    clearTimeout(this._autoRunTimer);
    this._autoRunTimer = setTimeout(() => this._runAnalysis(), 120);
  },

  // ─── Analysis ───────────────────────────────────────────────

  _showError(msg) {
    const errorArea = this._container.querySelector('[data-ref="error-area"]');
    const statsBar  = this._container.querySelector('[data-ref="stats-bar"]');
    const chartsWrap = this._container.querySelector('[data-ref="charts-wrap"]');
    const limitsWrap = this._container.querySelector('[data-ref="limits-wrap"]');
    if (errorArea) errorArea.innerHTML = `<div class="timr__error">${esc(msg)}</div>`;
    if (statsBar)  statsBar.innerHTML = '';
    if (chartsWrap) chartsWrap.innerHTML = '';
    if (limitsWrap) limitsWrap.innerHTML = '';
    this._destroyCharts();
  },

  _clear() {
    const errorArea = this._container.querySelector('[data-ref="error-area"]');
    const statsBar  = this._container.querySelector('[data-ref="stats-bar"]');
    const chartsWrap = this._container.querySelector('[data-ref="charts-wrap"]');
    const limitsWrap = this._container.querySelector('[data-ref="limits-wrap"]');
    if (errorArea)  errorArea.innerHTML = '';
    if (statsBar)   statsBar.innerHTML = '';
    if (chartsWrap) chartsWrap.innerHTML = '';
    if (limitsWrap) limitsWrap.innerHTML = '';
    this._destroyCharts();
  },

  async _runAnalysis() {
    if (!this._columnRef) { this._clear(); return; }
    const raw = getColumnValues(this._context.stateManager, this._columnRef);
    const values = raw.filter(v => typeof v === 'number' && !isNaN(v));
    if (values.length < 5) { this._clear(); return; }
    if (values.some(v => v <= 0)) {
      this._showError(this._t('errPositiveOnly'));
      return;
    }

    let result;
    try {
      result = computeTransformedIMR(values, {
        lambda: this._lambdaMode === 'manual' ? this._lambdaManual : undefined,
      });
    } catch (e) {
      const key = e.message === 'errPositiveOnly' ? 'errPositiveOnly' : 'errCompute';
      this._showError(this._t(key, { msg: e.message }));
      return;
    }

    this._lastLambda = result.lambda;
    // Sync UI lambda input when auto-fitting
    if (this._lambdaMode === 'auto') {
      const manualEl = this._container.querySelector('[data-ref="lambda-manual"]');
      if (manualEl) manualEl.value = result.lambda;
    }

    // Clear any previous error
    const errorArea = this._container.querySelector('[data-ref="error-area"]');
    if (errorArea) errorArea.innerHTML = '';

    this._renderStats(result, values.length);
    await this._renderCharts(result);
    this._renderLimitsTable(result);
  },

  _renderStats(r, total) {
    const statsBar = this._container.querySelector('[data-ref="stats-bar"]');
    if (!statsBar) return;
    const fmt = (v) => Number.isFinite(v) ? v.toFixed(3) : '–';
    const cls = r.signalsI.length === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad';
    statsBar.innerHTML = `<div class="dmike-kpi-strip">
      <div class="dmike-kpi">
        <div class="dmike-kpi-value">${fmt(r.lambda)}</div>
        <div class="dmike-kpi-label">λ ${r.lambdaAuto ? this._t('lambdaAutoTag') : this._t('lambdaManualTag')}</div>
        <div class="dmike-kpi-sub">${this._t('boxCoxLabel')}</div>
      </div>
      <div class="dmike-kpi">
        <div class="dmike-kpi-value">${fmt(r.iLimits.cl)}</div>
        <div class="dmike-kpi-label">CL (y)</div>
        <div class="dmike-kpi-sub">σ̂ = ${fmt(r.iLimits.sigma)}</div>
      </div>
      <div class="dmike-kpi ${cls}">
        <div class="dmike-kpi-value">${r.signalsI.length}</div>
        <div class="dmike-kpi-label">${this._t('statSignals')}</div>
        <div class="dmike-kpi-sub">${this._t('statOf', { total })}</div>
      </div>
    </div>`;
  },

  async _renderCharts(r) {
    this._destroyCharts();
    const chartsWrap = this._container.querySelector('[data-ref="charts-wrap"]');
    if (!chartsWrap) return;
    chartsWrap.innerHTML = '';

    const colName = getColumnName(this._context.stateManager, this._columnRef);
    const wrapper = document.createElement('div');
    wrapper.className = 'timr__chart-section';
    const header = document.createElement('div');
    header.className = 'timr__chart-header';
    const isStable = r.signalsI.length === 0;
    header.innerHTML = `
      <span class="timr__chart-title">${esc(this._t('chartTitle', { col: colName, lambda: r.lambda }))}</span>
      <span class="timr__badge ${isStable ? 'timr__badge--stable' : 'timr__badge--unstable'}">
        ${isStable ? this._t('stable') : this._t('unstable', { count: r.signalsI.length })}
      </span>
    `;
    wrapper.appendChild(header);
    const plotEl = document.createElement('div');
    plotEl.className = 'timr__plot-wrap';
    wrapper.appendChild(plotEl);
    chartsWrap.appendChild(wrapper);

    const chart = await this._context.chartManager.create(plotEl, 'control-chart', {
      title: '',
      xLabel: this._t('xLabelSample'),
      yLabel: this._t('yLabel'),
      showLegend: false,
      showTitle: false,
      values: r.transformed,
      cl: r.iLimits.cl, ucl: r.iLimits.ucl, lcl: r.iLimits.lcl, sigma: r.iLimits.sigma,
      violationIndices: new Set(r.signalsI),
      usl: null, lsl: null,
      showZones: true,
    });
    this._charts.push(chart);
  },

  _renderLimitsTable(r) {
    const wrap = this._container.querySelector('[data-ref="limits-wrap"]');
    if (!wrap) return;
    const fmt = (v) => Number.isFinite(v) ? v.toFixed(3) : '–';
    wrap.innerHTML = `
      <table class="timr__limits-table">
        <thead><tr>
          <th>${this._t('thLimit')}</th>
          <th>${this._t('thTransformed')}</th>
          <th>${this._t('thOriginal')}</th>
        </tr></thead>
        <tbody>
          <tr><td>UCL</td><td>${fmt(r.iLimits.ucl)}</td><td>${fmt(r.iLimitsOriginal.ucl)}</td></tr>
          <tr><td>CL</td><td>${fmt(r.iLimits.cl)}</td><td>${fmt(r.iLimitsOriginal.cl)}</td></tr>
          <tr><td>LCL</td><td>${fmt(r.iLimits.lcl)}</td><td>${fmt(r.iLimitsOriginal.lcl)}</td></tr>
        </tbody>
      </table>
    `;
  },

  _destroyCharts() {
    for (const c of this._charts) this._context.chartManager.destroy(c);
    this._charts = [];
  },
};
