/**
 * D.Mike — Time-Weighted Control Chart Module (time-weighted-chart.js)
 *
 * EWMA and CUSUM charts. Both detect small persistent shifts much earlier
 * than Shewhart charts (I-MR, X̄-R) by integrating information across points.
 */

import {
  ColumnPicker, getColumnValues, getColumnName,
} from '../../ui/column-picker.js';

import {
  computeEWMA, computeCUSUM, estimateSigma,
} from '../../engines/time-weighted-chart-engine.js';

import { esc } from '../../core/html-utils.js';

const DEFAULTS = {
  chartTypeId: 'ewma',
  sigmaMethod: 'mr',     // 'mr' | 'sd'
  baselineCount: null,   // null = full series
  targetOverride: null,  // null = use baseline mean
  sigmaOverride:  null,  // null = use estimateSigma
  // EWMA
  lambda: 0.2,
  L: 3,
  // CUSUM
  kSigma: 0.5,
  hSigma: 4,
};

export default {
  id: 'time-weighted-chart',
  phase: 'control',
  icon: 'activity',
  i18nKey: 'modules.time-weighted-chart',
  version: '1.0.0',

  _container: null,
  _context: null,
  _chartTypeId: DEFAULTS.chartTypeId,
  _columnRef: null,
  _sigmaMethod: DEFAULTS.sigmaMethod,
  _baselineCount: DEFAULTS.baselineCount,
  _targetOverride: DEFAULTS.targetOverride,
  _sigmaOverride: DEFAULTS.sigmaOverride,
  _lambda: DEFAULTS.lambda,
  _L: DEFAULTS.L,
  _kSigma: DEFAULTS.kSigma,
  _hSigma: DEFAULTS.hSigma,
  _picker: null,
  _charts: [],
  _autoRunTimer: null,

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    if (!document.getElementById('time-weighted-chart-css')) {
      const link = document.createElement('link');
      link.id = 'time-weighted-chart-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/time-weighted-chart/time-weighted-chart.css';
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
      chartTypeId: this._chartTypeId,
      columnRef: this._columnRef,
      sigmaMethod: this._sigmaMethod,
      baselineCount: this._baselineCount,
      targetOverride: this._targetOverride,
      sigmaOverride: this._sigmaOverride,
      lambda: this._lambda,
      L: this._L,
      kSigma: this._kSigma,
      hSigma: this._hSigma,
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

  help: () => import('./time-weighted-chart-help.js'),

  // ─── State ──────────────────────────────────────────────────

  /** @private */
  _loadState(s) {
    this._chartTypeId = s.chartTypeId || DEFAULTS.chartTypeId;
    this._columnRef = s.columnRef || null;
    this._sigmaMethod = s.sigmaMethod || DEFAULTS.sigmaMethod;
    this._baselineCount = s.baselineCount ?? DEFAULTS.baselineCount;
    this._targetOverride = s.targetOverride ?? DEFAULTS.targetOverride;
    this._sigmaOverride  = s.sigmaOverride  ?? DEFAULTS.sigmaOverride;
    this._lambda = Number.isFinite(s.lambda) ? s.lambda : DEFAULTS.lambda;
    this._L      = Number.isFinite(s.L)      ? s.L      : DEFAULTS.L;
    this._kSigma = Number.isFinite(s.kSigma) ? s.kSigma : DEFAULTS.kSigma;
    this._hSigma = Number.isFinite(s.hSigma) ? s.hSigma : DEFAULTS.hSigma;
  },

  /** @private */
  _save() {
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
  },

  // ─── Render ─────────────────────────────────────────────────

  /** @private */
  _t(key, vars) {
    return this._context.i18n.t(`modules.time-weighted-chart.${key}`, vars);
  },

  /** @private */
  _render() {
    const isEWMA = this._chartTypeId === 'ewma';

    this._container.innerHTML = `
      <div class="twc dmike-split">
        <div class="twc__input dmike-split__input">

          <div class="dmike-split__section-title">${this._t('sectionChartType')}</div>
          <div class="field-group">
            <label>${this._t('chartType')}</label>
            <select class="field" data-ref="chart-type">
              <option value="ewma"${isEWMA ? ' selected' : ''}>${this._t('type_ewma')}</option>
              <option value="cusum"${!isEWMA ? ' selected' : ''}>${this._t('type_cusum')}</option>
            </select>
            <span class="twc__hint">${this._t('typeHint_' + this._chartTypeId)}</span>
          </div>

          <div class="dmike-split__section-title">${this._t('sectionData')}</div>
          <div class="field-group">
            <label>${this._t('dataColumn')}</label>
            <div data-ref="col-picker-wrap"></div>
          </div>

          <div class="field-group">
            <label>${this._t('baselineCount')}</label>
            <input type="number" class="field field--num" data-ref="baseline-count"
              value="${this._baselineCount ?? ''}" min="2" placeholder="${this._t('baselineAll')}">
            <span class="twc__hint">${this._t('baselineHint')}</span>
          </div>

          <div class="dmike-split__section-title">${this._t('sectionEstimation')}</div>
          <div class="twc__row-2">
            <div class="field-group">
              <label>${this._t('targetOverride')}</label>
              <input type="number" class="field field--num" data-ref="target-override"
                value="${this._targetOverride ?? ''}" placeholder="${this._t('targetAuto')}" step="any">
            </div>
            <div class="field-group">
              <label>${this._t('sigmaOverride')}</label>
              <input type="number" class="field field--num" data-ref="sigma-override"
                value="${this._sigmaOverride ?? ''}" placeholder="${this._t('sigmaAuto')}" step="any" min="0">
            </div>
          </div>
          <div class="field-group">
            <label>${this._t('sigmaMethod')}</label>
            <select class="field" data-ref="sigma-method">
              <option value="mr"${this._sigmaMethod === 'mr' ? ' selected' : ''}>${this._t('sigma_mr')}</option>
              <option value="sd"${this._sigmaMethod === 'sd' ? ' selected' : ''}>${this._t('sigma_sd')}</option>
            </select>
            <span class="twc__hint">${this._t('sigmaMethodHint')}</span>
          </div>

          <div class="dmike-split__section-title">${this._t('sectionParams_' + this._chartTypeId)}</div>
          ${isEWMA ? `
            <div class="twc__param-note">${this._t('paramNote_ewma')}</div>
            <div class="twc__row-2">
              <div class="field-group">
                <label>${this._t('lambda')}</label>
                <input type="number" class="field field--num" data-ref="lambda"
                  value="${this._lambda}" step="0.05" min="0.05" max="1">
              </div>
              <div class="field-group">
                <label>${this._t('L')}</label>
                <input type="number" class="field field--num" data-ref="L"
                  value="${this._L}" step="0.1" min="1" max="5">
              </div>
            </div>
          ` : `
            <div class="twc__param-note">${this._t('paramNote_cusum')}</div>
            <div class="twc__row-2">
              <div class="field-group">
                <label>${this._t('kSigma')}</label>
                <input type="number" class="field field--num" data-ref="kSigma"
                  value="${this._kSigma}" step="0.1" min="0.1" max="2">
              </div>
              <div class="field-group">
                <label>${this._t('hSigma')}</label>
                <input type="number" class="field field--num" data-ref="hSigma"
                  value="${this._hSigma}" step="0.5" min="2" max="10">
              </div>
            </div>
          `}

        </div>

        <div class="twc__output dmike-split__output">
          <div data-ref="stats-bar"></div>
          <div data-ref="charts-wrap"></div>
        </div>
      </div>
    `;
  },

  /** @private */
  _initPicker() {
    const wrap = this._container.querySelector('[data-ref="col-picker-wrap"]');
    if (!wrap) return;
    this._picker = new ColumnPicker(wrap, this._context, {
      mode: 'single',
      types: ['numeric'],
      minCount: 3,
      onChange: (ref) => {
        this._columnRef = ref;
        this._save();
        this._scheduleAutoRun();
      },
    });
    if (this._columnRef) this._picker.value = this._columnRef;
  },

  /** @private */
  _destroyPicker() {
    if (this._picker) { this._picker.destroy(); this._picker = null; }
  },

  /** @private */
  _bindEvents() {
    this._container.addEventListener('change', (e) => {
      const ref = e.target.dataset?.ref;
      if (!ref) return;

      const num = (v) => { const f = parseFloat(v); return Number.isFinite(f) ? f : null; };
      const int = (v) => { const i = parseInt(v); return Number.isFinite(i) ? i : null; };

      let needsRerender = false;
      switch (ref) {
        case 'chart-type':
          this._chartTypeId = e.target.value;
          needsRerender = true;
          break;
        case 'sigma-method':
          this._sigmaMethod = e.target.value;
          break;
        case 'baseline-count':
          this._baselineCount = int(e.target.value);
          break;
        case 'target-override':
          this._targetOverride = num(e.target.value);
          break;
        case 'sigma-override': {
          const v = num(e.target.value);
          this._sigmaOverride = (v != null && v >= 0) ? v : null;
          break;
        }
        case 'lambda': {
          const v = num(e.target.value);
          this._lambda = (v != null && v > 0 && v <= 1) ? v : DEFAULTS.lambda;
          break;
        }
        case 'L': {
          const v = num(e.target.value);
          this._L = (v != null && v > 0) ? v : DEFAULTS.L;
          break;
        }
        case 'kSigma': {
          const v = num(e.target.value);
          this._kSigma = (v != null && v > 0) ? v : DEFAULTS.kSigma;
          break;
        }
        case 'hSigma': {
          const v = num(e.target.value);
          this._hSigma = (v != null && v > 0) ? v : DEFAULTS.hSigma;
          break;
        }
      }
      this._save();
      if (needsRerender) {
        this._destroyPicker();
        this._render();
        this._initPicker();
      }
      this._scheduleAutoRun();
    });
  },

  /** @private */
  _scheduleAutoRun() {
    clearTimeout(this._autoRunTimer);
    this._autoRunTimer = setTimeout(() => this._runAnalysis(), 120);
  },

  // ─── Analysis ───────────────────────────────────────────────

  /** @private */
  async _runAnalysis() {
    const statsBar  = this._container.querySelector('[data-ref="stats-bar"]');
    const chartsWrap = this._container.querySelector('[data-ref="charts-wrap"]');

    const clear = () => {
      this._destroyCharts();
      if (statsBar) statsBar.innerHTML = '';
      if (chartsWrap) chartsWrap.innerHTML = '';
    };

    if (!this._columnRef) { clear(); return; }
    const raw = getColumnValues(this._context.stateManager, this._columnRef);
    const values = raw.filter(v => typeof v === 'number' && !isNaN(v));
    if (values.length < 3) { clear(); return; }

    const blEnd = (this._baselineCount && this._baselineCount > 0)
      ? Math.min(this._baselineCount, values.length)
      : values.length;
    const baseline = values.slice(0, blEnd);

    // Resolve target & sigma
    const targetAuto = baseline.reduce((s, x) => s + x, 0) / baseline.length;
    const target = this._targetOverride != null ? this._targetOverride : targetAuto;

    const sigmaAuto = estimateSigma(baseline, this._sigmaMethod);
    const sigma = (this._sigmaOverride != null && this._sigmaOverride > 0)
      ? this._sigmaOverride
      : sigmaAuto;

    if (!(sigma > 0)) { clear(); return; }

    if (this._chartTypeId === 'ewma') {
      const r = computeEWMA(values, target, sigma, this._lambda, this._L);
      this._renderStatsEWMA(r, target, sigma, values.length);
      await this._renderChartEWMA(r);
    } else {
      const r = computeCUSUM(values, target, sigma, this._kSigma, this._hSigma);
      this._renderStatsCUSUM(r, target, sigma, values.length);
      await this._renderChartCUSUM(r, values.length);
    }
  },

  /** @private */
  _renderStatsEWMA(r, target, sigma, total) {
    const statsBar = this._container.querySelector('[data-ref="stats-bar"]');
    if (!statsBar) return;

    const fmt = (v) => Number.isFinite(v) ? v.toFixed(4) : '–';
    const sigCount = r.signals.length;
    const cls = sigCount === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad';

    statsBar.innerHTML = `<div class="dmike-kpi-strip">
      <div class="dmike-kpi">
        <div class="dmike-kpi-value">${fmt(target)}</div>
        <div class="dmike-kpi-label">${this._t('statTarget')}</div>
        <div class="dmike-kpi-sub">σ̂ = ${fmt(sigma)}</div>
      </div>
      <div class="dmike-kpi">
        <div class="dmike-kpi-value">${fmt(r.sigmaSteady)}</div>
        <div class="dmike-kpi-label">${this._t('statSigmaSteady')}</div>
        <div class="dmike-kpi-sub">λ = ${this._lambda}</div>
      </div>
      <div class="dmike-kpi ${cls}">
        <div class="dmike-kpi-value">${sigCount}</div>
        <div class="dmike-kpi-label">${this._t('statSignals')}</div>
        <div class="dmike-kpi-sub">${this._t('statOf', { total })}</div>
      </div>
    </div>`;
  },

  /** @private */
  _renderStatsCUSUM(r, target, sigma, total) {
    const statsBar = this._container.querySelector('[data-ref="stats-bar"]');
    if (!statsBar) return;

    const fmt = (v) => Number.isFinite(v) ? v.toFixed(4) : '–';
    const sigCount = r.signalsHi.length + r.signalsLo.length;
    const cls = sigCount === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad';

    statsBar.innerHTML = `<div class="dmike-kpi-strip">
      <div class="dmike-kpi">
        <div class="dmike-kpi-value">${fmt(target)}</div>
        <div class="dmike-kpi-label">${this._t('statTarget')}</div>
        <div class="dmike-kpi-sub">σ̂ = ${fmt(sigma)}</div>
      </div>
      <div class="dmike-kpi">
        <div class="dmike-kpi-value">${fmt(r.h)}</div>
        <div class="dmike-kpi-label">${this._t('statHLimit')}</div>
        <div class="dmike-kpi-sub">k = ${fmt(r.k)}</div>
      </div>
      <div class="dmike-kpi ${cls}">
        <div class="dmike-kpi-value">${sigCount}</div>
        <div class="dmike-kpi-label">${this._t('statSignals')}</div>
        <div class="dmike-kpi-sub">${this._t('statOf', { total })}</div>
      </div>
    </div>`;
  },

  /** @private */
  async _renderChartEWMA(r) {
    this._destroyCharts();
    const chartsWrap = this._container.querySelector('[data-ref="charts-wrap"]');
    if (!chartsWrap) return;
    chartsWrap.innerHTML = '';

    const colName = getColumnName(this._context.stateManager, this._columnRef);
    const sigCount = r.signals.length;
    const isStable = sigCount === 0;

    const wrapper = document.createElement('div');
    wrapper.className = 'twc__chart-section';
    const header = document.createElement('div');
    header.className = 'twc__chart-header';
    header.innerHTML = `
      <span class="twc__chart-title">${esc(this._t('chartTitle_ewma', { col: colName }))}</span>
      <span class="twc__badge ${isStable ? 'twc__badge--stable' : 'twc__badge--unstable'}">
        ${isStable ? this._t('stable') : this._t('unstable', { count: sigCount })}
      </span>
    `;
    wrapper.appendChild(header);
    const plotEl = document.createElement('div');
    plotEl.className = 'twc__plot-wrap';
    wrapper.appendChild(plotEl);
    chartsWrap.appendChild(wrapper);

    const chart = await this._context.chartManager.create(plotEl, 'control-chart', {
      title: '',
      xLabel: this._t('xLabelSample'),
      yLabel: this._t('yLabel_ewma'),
      showLegend: false,
      showTitle: false,
      values: r.values,
      cl: r.cl,
      ucl: r.ucl,      // array → stepped limits
      lcl: r.lcl,      // array → stepped limits
      sigma: r.sigma,  // array → no zones (correct: σ_zi varies by point)
      violationIndices: new Set(r.signals),
      usl: null, lsl: null,
      showZones: false,
    });
    this._charts.push(chart);
  },

  /** @private */
  async _renderChartCUSUM(r, n) {
    this._destroyCharts();
    const chartsWrap = this._container.querySelector('[data-ref="charts-wrap"]');
    if (!chartsWrap) return;
    chartsWrap.innerHTML = '';

    const colName = getColumnName(this._context.stateManager, this._columnRef);

    // C⁺ chart
    {
      const wrapper = document.createElement('div');
      wrapper.className = 'twc__chart-section';
      const header = document.createElement('div');
      header.className = 'twc__chart-header';
      const sigCount = r.signalsHi.length;
      const isStable = sigCount === 0;
      header.innerHTML = `
        <span class="twc__chart-title">${esc(this._t('chartTitle_cusum_plus', { col: colName }))}</span>
        <span class="twc__badge ${isStable ? 'twc__badge--stable' : 'twc__badge--unstable'}">
          ${isStable ? this._t('stable') : this._t('unstable', { count: sigCount })}
        </span>
      `;
      wrapper.appendChild(header);
      const plotEl = document.createElement('div');
      plotEl.className = 'twc__plot-wrap';
      wrapper.appendChild(plotEl);
      chartsWrap.appendChild(wrapper);

      const chart = await this._context.chartManager.create(plotEl, 'control-chart', {
        title: '',
        xLabel: this._t('xLabelSample'),
        yLabel: 'C⁺',
        showLegend: false,
        showTitle: false,
        values: r.cPlus,
        cl: 0,
        ucl: r.h,
        lcl: 0,
        sigma: 0,            // suppress σ zones
        violationIndices: new Set(r.signalsHi),
        usl: null, lsl: null,
        showZones: false,
      });
      this._charts.push(chart);
    }

    // C⁻ chart
    {
      const wrapper = document.createElement('div');
      wrapper.className = 'twc__chart-section';
      const header = document.createElement('div');
      header.className = 'twc__chart-header';
      const sigCount = r.signalsLo.length;
      const isStable = sigCount === 0;
      header.innerHTML = `
        <span class="twc__chart-title">${esc(this._t('chartTitle_cusum_minus', { col: colName }))}</span>
        <span class="twc__badge ${isStable ? 'twc__badge--stable' : 'twc__badge--unstable'}">
          ${isStable ? this._t('stable') : this._t('unstable', { count: sigCount })}
        </span>
      `;
      wrapper.appendChild(header);
      const plotEl = document.createElement('div');
      plotEl.className = 'twc__plot-wrap';
      wrapper.appendChild(plotEl);
      chartsWrap.appendChild(wrapper);

      const chart = await this._context.chartManager.create(plotEl, 'control-chart', {
        title: '',
        xLabel: this._t('xLabelSample'),
        yLabel: 'C⁻',
        showLegend: false,
        showTitle: false,
        values: r.cMinus,
        cl: 0,
        ucl: r.h,
        lcl: 0,
        sigma: 0,
        violationIndices: new Set(r.signalsLo),
        usl: null, lsl: null,
        showZones: false,
      });
      this._charts.push(chart);
    }
  },

  // ─── Helpers ────────────────────────────────────────────────

  /** @private */
  _destroyCharts() {
    for (const c of this._charts) {
      this._context.chartManager.destroy(c);
    }
    this._charts = [];
  },
};
