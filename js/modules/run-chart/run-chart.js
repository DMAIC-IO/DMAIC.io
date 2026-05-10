/**
 * D.Mike — Run Chart Module (run-chart.js)
 *
 * Plots a numeric series over sample number with a median reference line and
 * runs four standard pattern tests (clustering, mixtures, trends, oscillation).
 *
 * Use case: quick first look at process behavior before building control
 * limits — answers "is there obvious non-randomness?"
 */

import { ColumnPicker, getColumnValues, getColumnName } from '../../ui/column-picker.js';
import { computeRunChart } from '../../engines/run-chart-engine.js';
import { esc } from '../../core/html-utils.js';

const DEFAULT_ALPHA = 0.05;

export default {
  id: 'run-chart',
  phase: 'data',
  group: 'visualize',
  icon: 'activity',
  i18nKey: 'modules.run-chart',
  version: '1.0.0',

  _container: null,
  _context: null,
  _columnRef: null,
  _alpha: DEFAULT_ALPHA,
  _picker: null,
  _chart: null,
  _autoRunTimer: null,

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    if (!document.getElementById('run-chart-css')) {
      const link = document.createElement('link');
      link.id = 'run-chart-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/run-chart/run-chart.css';
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
    return {
      columnRef: this._columnRef,
      alpha: this._alpha,
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

  help: () => import('./run-chart-help.js'),

  // ─── State ──────────────────────────────────────────────────

  /** @private */
  _loadState(saved) {
    this._columnRef = saved.columnRef || null;
    this._alpha = Number.isFinite(saved.alpha) ? saved.alpha : DEFAULT_ALPHA;
  },

  /** @private */
  _save() {
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
  },

  // ─── Render ─────────────────────────────────────────────────

  /** @private */
  _t(key, vars) {
    return this._context.i18n.t(`modules.run-chart.${key}`, vars);
  },

  /** @private */
  _render() {
    this._container.innerHTML = `
      <div class="run-chart dmike-split">
        <div class="run-chart__input dmike-split__input">

          <div class="dmike-split__section-title">${this._t('sectionData')}</div>
          <div class="field-group">
            <label>${this._t('dataColumn')}</label>
            <div data-ref="col-picker-wrap"></div>
          </div>

          <div class="dmike-split__section-title">${this._t('sectionSettings')}</div>
          <div class="field-group">
            <label>${this._t('alpha')}</label>
            <input type="number" class="field field--num" data-ref="alpha"
              value="${this._alpha}" step="0.01" min="0.001" max="0.5">
            <span class="run-chart__hint">${this._t('alphaHint')}</span>
          </div>

        </div>

        <div class="run-chart__output dmike-split__output">
          <div data-ref="stats-bar"></div>
          <div data-ref="chart-wrap"></div>
          <div data-ref="tests-wrap"></div>
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
      minCount: 2,
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
      if (e.target.dataset?.ref === 'alpha') {
        const v = parseFloat(e.target.value);
        this._alpha = (Number.isFinite(v) && v > 0 && v < 1) ? v : DEFAULT_ALPHA;
        this._save();
        this._scheduleAutoRun();
      }
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
    const chartWrap = this._container.querySelector('[data-ref="chart-wrap"]');
    const testsWrap = this._container.querySelector('[data-ref="tests-wrap"]');

    const clear = () => {
      this._destroyChart();
      if (statsBar)  statsBar.innerHTML  = '';
      if (chartWrap) chartWrap.innerHTML = '';
      if (testsWrap) testsWrap.innerHTML = '';
    };

    if (!this._columnRef) { clear(); return; }
    const raw = getColumnValues(this._context.stateManager, this._columnRef);
    const values = raw.filter(v => typeof v === 'number' && !isNaN(v));
    if (values.length < 3) { clear(); return; }

    const r = computeRunChart(values);

    this._renderStats(r);
    await this._renderChart(r);
    this._renderTests(r);
  },

  /** @private */
  _renderStats(r) {
    const statsBar = this._container.querySelector('[data-ref="stats-bar"]');
    if (!statsBar) return;
    const fmt = (v) => Number.isFinite(v) ? v.toFixed(4) : '–';

    const flagged = [
      r.pClustering, r.pMixtures, r.pTrends, r.pOscillation,
    ].filter(p => p < this._alpha).length;

    statsBar.innerHTML = `<div class="dmike-kpi-strip">
      <div class="dmike-kpi">
        <div class="dmike-kpi-value">${fmt(r.median)}</div>
        <div class="dmike-kpi-label">${this._t('statMedian')}</div>
        <div class="dmike-kpi-sub">${this._t('statN', { n: r.values.length })}</div>
      </div>
      <div class="dmike-kpi">
        <div class="dmike-kpi-value">${r.runsAboutMedian}</div>
        <div class="dmike-kpi-label">${this._t('statRunsAbout')}</div>
        <div class="dmike-kpi-sub">${this._t('statRunsUpDown', { count: r.runsUpDown })}</div>
      </div>
      <div class="dmike-kpi ${flagged === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad'}">
        <div class="dmike-kpi-value">${flagged}</div>
        <div class="dmike-kpi-label">${this._t('statFlagged')}</div>
        <div class="dmike-kpi-sub">${this._t('statAlpha', { a: this._alpha })}</div>
      </div>
    </div>`;
  },

  /** @private */
  async _renderChart(r) {
    this._destroyChart();
    const chartWrap = this._container.querySelector('[data-ref="chart-wrap"]');
    if (!chartWrap) return;
    chartWrap.innerHTML = '';

    const colName = getColumnName(this._context.stateManager, this._columnRef);

    const wrapper = document.createElement('div');
    wrapper.className = 'run-chart__chart-section';
    const header = document.createElement('div');
    header.className = 'run-chart__chart-header';
    header.innerHTML = `<span class="run-chart__chart-title">${esc(this._t('chartTitle', { col: colName }))}</span>`;
    wrapper.appendChild(header);

    const plotEl = document.createElement('div');
    plotEl.className = 'run-chart__plot-wrap';
    wrapper.appendChild(plotEl);
    chartWrap.appendChild(wrapper);

    this._chart = await this._context.chartManager.create(plotEl, 'run-chart', {
      title: '',
      xLabel: this._t('xLabelSample'),
      yLabel: colName,
      showLegend: false,
      showTitle: false,
      values: r.values,
      median: r.median,
      colorBySide: true,
    });
  },

  /** @private */
  _renderTests(r) {
    const wrap = this._container.querySelector('[data-ref="tests-wrap"]');
    if (!wrap) return;

    const a = this._alpha;
    const tests = [
      { id: 'clustering',  p: r.pClustering,  obs: r.runsAboutMedian },
      { id: 'mixtures',    p: r.pMixtures,    obs: r.runsAboutMedian },
      { id: 'trends',      p: r.pTrends,      obs: r.runsUpDown },
      { id: 'oscillation', p: r.pOscillation, obs: r.runsUpDown },
    ];

    const fmtP = (p) => p < 0.0001 ? '< 0.0001' : p.toFixed(4);

    const rows = tests.map(t => {
      const flagged = t.p < a;
      const cls = flagged ? 'run-chart__test-status--bad' : 'run-chart__test-status--ok';
      const status = flagged ? this._t('flagFail') : this._t('flagPass');
      return `<div class="run-chart__test-row">
        <div class="run-chart__test-name">
          <strong>${esc(this._t('test_' + t.id))}</strong>
          <span class="run-chart__test-desc">${esc(this._t('testDesc_' + t.id))}</span>
        </div>
        <div class="run-chart__test-pvalue">${fmtP(t.p)}</div>
        <div class="run-chart__test-status ${cls}">${status}</div>
      </div>`;
    }).join('');

    wrap.innerHTML = `
      <div class="run-chart__tests-panel">
        <div class="run-chart__tests-header">${this._t('testsTitle')}</div>
        <div class="run-chart__tests-grid">${rows}</div>
      </div>
    `;
  },

  // ─── Helpers ────────────────────────────────────────────────

  /** @private */
  _destroyChart() {
    if (this._chart) {
      this._context.chartManager.destroy(this._chart);
      this._chart = null;
    }
  },
};
