/**
 * D.Mike — Rare-Event Control Chart Module (rare-event-chart.js)
 *
 * g-Chart  (count of opportunities between events)
 * t-Chart  (time between events — Nelson power transform)
 *
 * Both detect drifts in the rate of rare events (failures, accidents,
 * incidents) where Shewhart-style charts on counts/intervals fail because
 * the underlying distribution is geometric / exponential, not normal.
 */

import { ColumnPicker, getColumnValues, getColumnName } from '../../ui/column-picker.js';
import { computeGChart, computeTChart } from '../../engines/rare-event-chart-engine.js';
import { esc } from '../../core/html-utils.js';

const TYPES = ['g', 't'];

export default {
  id: 'rare-event-chart',
  phase: 'control',
  icon: 'activity',
  i18nKey: 'modules.rare-event-chart',
  version: '1.0.0',

  _container: null,
  _context: null,
  _chartTypeId: 'g',
  _columnRef: null,
  _picker: null,
  _chart: null,
  _autoRunTimer: null,

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    if (!document.getElementById('rare-event-chart-css')) {
      const link = document.createElement('link');
      link.id = 'rare-event-chart-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/rare-event-chart/rare-event-chart.css';
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
    this._destroyChart();
    this._container.innerHTML = '';
  },

  onLanguageChange() {
    this._destroyChart();
    this._destroyPicker();
    this._render();
    this._initPicker();
    this._bindEvents();
    this._runAnalysis();
  },

  onThemeChange() {},

  getState() {
    return { chartTypeId: this._chartTypeId, columnRef: this._columnRef };
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

  help: () => import('./rare-event-chart-help.js'),

  // ─── State ──────────────────────────────────────────────────

  _loadState(s) {
    this._chartTypeId = TYPES.includes(s.chartTypeId) ? s.chartTypeId : 'g';
    this._columnRef = s.columnRef || null;
  },

  _save() {
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
  },

  // ─── Render ─────────────────────────────────────────────────

  _t(key, vars) { return this._context.i18n.t(`modules.rare-event-chart.${key}`, vars); },

  _render() {
    this._container.innerHTML = `
      <div class="rec dmike-split">
        <div class="rec__input dmike-split__input">

          <div class="dmike-split__section-title">${this._t('sectionChartType')}</div>
          <div class="field-group">
            <label>${this._t('chartType')}</label>
            <select class="field" data-ref="chart-type">
              <option value="g"${this._chartTypeId === 'g' ? ' selected' : ''}>${this._t('type_g')}</option>
              <option value="t"${this._chartTypeId === 't' ? ' selected' : ''}>${this._t('type_t')}</option>
            </select>
            <span class="rec__hint">${this._t('typeHint_' + this._chartTypeId)}</span>
          </div>

          <div class="dmike-split__section-title">${this._t('sectionData')}</div>
          <div class="field-group">
            <label>${this._t('dataColumn')}</label>
            <div data-ref="col-picker-wrap"></div>
            <span class="rec__hint">${this._t('dataHint_' + this._chartTypeId)}</span>
          </div>

        </div>

        <div class="rec__output dmike-split__output">
          <div data-ref="stats-bar"></div>
          <div data-ref="chart-wrap"></div>
        </div>
      </div>
    `;
  },

  _initPicker() {
    const wrap = this._container.querySelector('[data-ref="col-picker-wrap"]');
    if (!wrap) return;
    this._picker = new ColumnPicker(wrap, this._context, {
      mode: 'single',
      types: ['numeric'],
      minCount: 2,
      onChange: (ref) => {
        this._columnRef = ref;
        this._save();
        this._scheduleAutoRun();
      },
    });
    if (this._columnRef) this._picker.value = this._columnRef;
  },

  _destroyPicker() {
    if (this._picker) { this._picker.destroy(); this._picker = null; }
  },

  _bindEvents() {
    this._container.addEventListener('change', (e) => {
      if (e.target.dataset?.ref === 'chart-type') {
        this._chartTypeId = e.target.value;
        this._save();
        this._destroyPicker();
        this._render();
        this._initPicker();
        this._scheduleAutoRun();
      }
    });
  },

  _scheduleAutoRun() {
    clearTimeout(this._autoRunTimer);
    this._autoRunTimer = setTimeout(() => this._runAnalysis(), 120);
  },

  // ─── Analysis ───────────────────────────────────────────────

  async _runAnalysis() {
    const statsBar = this._container.querySelector('[data-ref="stats-bar"]');
    const chartWrap = this._container.querySelector('[data-ref="chart-wrap"]');
    const clear = () => {
      this._destroyChart();
      if (statsBar) statsBar.innerHTML = '';
      if (chartWrap) chartWrap.innerHTML = '';
    };

    if (!this._columnRef) { clear(); return; }
    const raw = getColumnValues(this._context.stateManager, this._columnRef);
    const valid = raw.filter(v => typeof v === 'number' && !isNaN(v));
    const minPositive = (this._chartTypeId === 't')
      ? valid.filter(v => v > 0).length
      : valid.length;
    if (minPositive < 2) { clear(); return; }

    if (this._chartTypeId === 'g') {
      const r = computeGChart(valid);
      this._renderStats({ cl: r.cl, ucl: r.ucl, lcl: r.lcl, sigma: r.sigma, n: valid.length, signals: this._countSignals(r.values, r.ucl, r.lcl) });
      await this._renderChartScalar(r.values, r.cl, r.ucl, r.lcl, r.sigma, this._t('yLabel_g'));
    } else {
      const r = computeTChart(valid);
      const transformedVals = r.transformed.filter(v => v !== null);
      const signals = this._countSignals(r.transformed, r.ucl, r.lcl);
      this._renderStats({
        cl: r.clOriginal, ucl: r.uclOriginal, lcl: r.lclOriginal,
        sigma: r.sigma, n: transformedVals.length, signals,
        transformedNote: true,
      });
      await this._renderChartScalar(r.transformed, r.cl, r.ucl, r.lcl, r.sigma, this._t('yLabel_t'));
    }
  },

  _countSignals(values, ucl, lcl) {
    let s = 0;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v == null) continue;
      if (v > ucl || v < lcl) s++;
    }
    return s;
  },

  _renderStats({ cl, ucl, lcl, sigma, n, signals, transformedNote }) {
    const statsBar = this._container.querySelector('[data-ref="stats-bar"]');
    if (!statsBar) return;
    const fmt = (v) => Number.isFinite(v) ? v.toFixed(3) : '–';
    const cls = signals === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad';
    const note = transformedNote
      ? `<span class="rec__hint">${this._t('originalScaleNote')}</span>` : '';
    statsBar.innerHTML = `<div class="dmike-kpi-strip">
      <div class="dmike-kpi">
        <div class="dmike-kpi-value">${fmt(cl)}</div>
        <div class="dmike-kpi-label">${this._t('statCL')}</div>
        <div class="dmike-kpi-sub">σ̂ = ${fmt(sigma)}</div>
      </div>
      <div class="dmike-kpi">
        <div class="dmike-kpi-value">${fmt(ucl)}</div>
        <div class="dmike-kpi-label">UCL / LCL</div>
        <div class="dmike-kpi-sub">${fmt(lcl)}</div>
      </div>
      <div class="dmike-kpi ${cls}">
        <div class="dmike-kpi-value">${signals}</div>
        <div class="dmike-kpi-label">${this._t('statSignals')}</div>
        <div class="dmike-kpi-sub">${this._t('statOf', { total: n })}</div>
      </div>
    </div>${note}`;
  },

  async _renderChartScalar(values, cl, ucl, lcl, sigma, yLabel) {
    this._destroyChart();
    const chartWrap = this._container.querySelector('[data-ref="chart-wrap"]');
    if (!chartWrap) return;
    chartWrap.innerHTML = '';

    const colName = getColumnName(this._context.stateManager, this._columnRef);
    const wrapper = document.createElement('div');
    wrapper.className = 'rec__chart-section';
    const header = document.createElement('div');
    header.className = 'rec__chart-header';
    const sigCount = this._countSignals(values, ucl, lcl);
    const isStable = sigCount === 0;
    header.innerHTML = `
      <span class="rec__chart-title">${esc(this._t('chartTitle_' + this._chartTypeId, { col: colName }))}</span>
      <span class="rec__badge ${isStable ? 'rec__badge--stable' : 'rec__badge--unstable'}">
        ${isStable ? this._t('stable') : this._t('unstable', { count: sigCount })}
      </span>
    `;
    wrapper.appendChild(header);
    const plotEl = document.createElement('div');
    plotEl.className = 'rec__plot-wrap';
    wrapper.appendChild(plotEl);
    chartWrap.appendChild(wrapper);

    // Build a violation index set so out-of-limit points get the standard red marker.
    const violationIndices = new Set();
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v == null) continue;
      if (v > ucl || v < lcl) violationIndices.add(i);
    }

    this._chart = await this._context.chartManager.create(plotEl, 'control-chart', {
      title: '',
      xLabel: this._t('xLabelSample'),
      yLabel,
      showLegend: false,
      showTitle: false,
      values,
      cl, ucl, lcl, sigma,
      violationIndices,
      usl: null, lsl: null,
      // Zone bands assume normal — disable for rare-event charts (they make
      // the geometric/exponential case look misleadingly Gaussian).
      showZones: false,
    });
  },

  _destroyChart() {
    if (this._chart) {
      this._context.chartManager.destroy(this._chart);
      this._chart = null;
    }
  },
};
