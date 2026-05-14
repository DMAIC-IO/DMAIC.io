/**
 * D.Mike — Multivariate Control Chart Module (multivariate-control-chart.js)
 *
 * Hotelling T² for individuals: monitors several correlated variables
 * simultaneously. Detects shifts in any one variable AND deviations from the
 * normal correlation structure (which Shewhart-on-each-variable misses).
 */

import {
  ColumnPicker, getColumnValues, getColumnName,
} from '../../ui/column-picker.js';

import { computeHotellingT2 } from '../../engines/multivariate-chart-engine.js';
import { esc } from '../../core/html-utils.js';
import { provisionWorksheet, removeProvisionedWorksheet } from '../../core/examples-registry.js';

const ALPHA_DEFAULT = 0.0027;

export default {
  id: 'multivariate-control-chart',
  phase: 'control',
  icon: 'activity',
  i18nKey: 'modules.multivariate-control-chart',
  version: '1.0.0',

  _container: null,
  _context: null,
  _columnRefs: [],
  _alpha: ALPHA_DEFAULT,
  _baselineCount: null,
  _picker: null,
  _chart: null,
  _autoRunTimer: null,
  /** Worksheet provisioned by loadExample; replaced on each subsequent load. */
  _exampleWorksheetId: null,

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    if (!document.getElementById('multivariate-control-chart-css')) {
      const link = document.createElement('link');
      link.id = 'multivariate-control-chart-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/multivariate-control-chart/multivariate-control-chart.css';
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
      columnRefs: this._columnRefs,
      alpha: this._alpha,
      baselineCount: this._baselineCount,
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

  help: () => import('./multivariate-control-chart-help.js'),

  /**
   * Load a catalog example. Project payloads carry an inlined source
   * worksheet plus an array of columnRefs whose `instanceId` is the
   * literal placeholder `__source__`. Provision a new worksheet, rewrite
   * each ref, then apply the state.
   *
   * @param {{ meta: object, data: object }} payload
   */
  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = (k) => this._context.i18n.t(k);

    const hasContent = Array.isArray(this._columnRefs) && this._columnRefs.length > 0;
    if (hasContent && this._context?.confirmPopout) {
      const ok = await this._context.confirmPopout(t('moduleHelp.confirmOverwrite'), { danger: true });
      if (!ok) return;
    }

    const data = { ...payload.data };

    if (data.sourceWorksheetData) {
      const wsState = data.sourceWorksheetData;
      delete data.sourceWorksheetData;
      if (this._exampleWorksheetId) {
        removeProvisionedWorksheet(this._context, this._exampleWorksheetId);
        this._exampleWorksheetId = null;
      }
      const ref = provisionWorksheet(this._context, wsState);
      if (ref) {
        this._exampleWorksheetId = ref.instanceId;
        if (Array.isArray(data.columnRefs)) {
          data.columnRefs = data.columnRefs.map(cr =>
            cr?.instanceId === '__source__' ? { ...cr, instanceId: ref.instanceId } : cr,
          );
        }
      }
    }

    this.setState(data);
    this._save();

    const lang = this._context.i18n.getLanguage();
    const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
    this._context.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
  },

  // ─── State ──────────────────────────────────────────────────

  _loadState(s) {
    this._columnRefs = Array.isArray(s.columnRefs) ? s.columnRefs : [];
    this._alpha = Number.isFinite(s.alpha) && s.alpha > 0 && s.alpha < 1 ? s.alpha : ALPHA_DEFAULT;
    this._baselineCount = s.baselineCount ?? null;
  },

  _save() {
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
  },

  // ─── Render ─────────────────────────────────────────────────

  _t(key, vars) {
    return this._context.i18n.t(`modules.multivariate-control-chart.${key}`, vars);
  },

  _render() {
    this._container.innerHTML = `
      <div class="mvcc dmike-split">
        <div class="mvcc__input dmike-split__input">

          <div class="dmike-split__section-title">${this._t('sectionData')}</div>
          <div class="field-group">
            <label>${this._t('variables')}</label>
            <div data-ref="col-picker-wrap"></div>
            <span class="mvcc__hint">${this._t('variablesHint')}</span>
          </div>

          <div class="field-group">
            <label>${this._t('baselineCount')}</label>
            <input type="number" class="field field--num" data-ref="baseline-count"
              value="${this._baselineCount ?? ''}" min="2" placeholder="${this._t('baselineAll')}">
            <span class="mvcc__hint">${this._t('baselineHint')}</span>
          </div>

          <div class="dmike-split__section-title">${this._t('sectionLimit')}</div>
          <div class="field-group">
            <label>${this._t('alpha')}</label>
            <input type="number" class="field field--num" data-ref="alpha"
              value="${this._alpha}" step="0.001" min="0.0001" max="0.5">
            <span class="mvcc__hint">${this._t('alphaHint')}</span>
          </div>

        </div>

        <div class="mvcc__output dmike-split__output">
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
      mode: 'multi',
      types: ['numeric'],
      minCount: 3,
      onChange: (refs) => {
        this._columnRefs = Array.isArray(refs) ? refs : [];
        this._save();
        this._scheduleAutoRun();
      },
    });
    if (this._columnRefs.length) this._picker.value = this._columnRefs;
  },

  _destroyPicker() {
    if (this._picker) { this._picker.destroy(); this._picker = null; }
  },

  _bindEvents() {
    this._container.addEventListener('change', (e) => {
      const ref = e.target.dataset?.ref;
      if (ref === 'baseline-count') {
        const v = parseInt(e.target.value);
        this._baselineCount = isNaN(v) ? null : v;
        this._save();
        this._scheduleAutoRun();
      }
      if (ref === 'alpha') {
        const v = parseFloat(e.target.value);
        this._alpha = (Number.isFinite(v) && v > 0 && v < 1) ? v : ALPHA_DEFAULT;
        this._save();
        this._scheduleAutoRun();
      }
    });
  },

  _scheduleAutoRun() {
    clearTimeout(this._autoRunTimer);
    this._autoRunTimer = setTimeout(() => this._runAnalysis(), 120);
  },

  // ─── Analysis ───────────────────────────────────────────────

  _showError(msg) {
    const chartWrap = this._container.querySelector('[data-ref="chart-wrap"]');
    const statsBar  = this._container.querySelector('[data-ref="stats-bar"]');
    if (statsBar) statsBar.innerHTML = '';
    if (chartWrap) chartWrap.innerHTML = `<div class="mvcc__error">${esc(msg)}</div>`;
    this._destroyChart();
  },

  _clear() {
    const chartWrap = this._container.querySelector('[data-ref="chart-wrap"]');
    const statsBar  = this._container.querySelector('[data-ref="stats-bar"]');
    if (statsBar) statsBar.innerHTML = '';
    if (chartWrap) chartWrap.innerHTML = '';
    this._destroyChart();
  },

  async _runAnalysis() {
    if (!Array.isArray(this._columnRefs) || this._columnRefs.length < 2) {
      this._clear();
      return;
    }

    // Build data matrix; skip rows with any non-numeric entry.
    const cols = this._columnRefs.map(ref => getColumnValues(this._context.stateManager, ref));
    const len = Math.min(...cols.map(c => c.length));
    const rows = [];
    for (let i = 0; i < len; i++) {
      const r = cols.map(c => c[i]);
      if (r.every(v => typeof v === 'number' && !isNaN(v))) rows.push(r);
    }
    const p = this._columnRefs.length;
    if (rows.length <= p) {
      this._showError(this._t('errTooFewRows', { p }));
      return;
    }

    let result;
    try {
      result = computeHotellingT2(rows, {
        alpha: this._alpha,
        baselineEnd: this._baselineCount && this._baselineCount > p ? this._baselineCount : undefined,
      });
    } catch (e) {
      this._showError(this._t('errCompute', { msg: e.message || String(e) }));
      return;
    }

    this._renderStats(result, rows.length);
    await this._renderChart(result);
  },

  _renderStats(r, total) {
    const statsBar = this._container.querySelector('[data-ref="stats-bar"]');
    if (!statsBar) return;
    const fmt = (v) => Number.isFinite(v) ? v.toFixed(3) : '–';
    const cls = r.signals.length === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad';
    statsBar.innerHTML = `<div class="dmike-kpi-strip">
      <div class="dmike-kpi">
        <div class="dmike-kpi-value">${fmt(r.ucl)}</div>
        <div class="dmike-kpi-label">UCL (T²)</div>
        <div class="dmike-kpi-sub">α = ${this._alpha}</div>
      </div>
      <div class="dmike-kpi">
        <div class="dmike-kpi-value">${r.p}</div>
        <div class="dmike-kpi-label">${this._t('statVariables')}</div>
        <div class="dmike-kpi-sub">${this._t('statBaseline', { m: r.m })}</div>
      </div>
      <div class="dmike-kpi ${cls}">
        <div class="dmike-kpi-value">${r.signals.length}</div>
        <div class="dmike-kpi-label">${this._t('statSignals')}</div>
        <div class="dmike-kpi-sub">${this._t('statOf', { total })}</div>
      </div>
    </div>`;
  },

  async _renderChart(r) {
    this._destroyChart();
    const chartWrap = this._container.querySelector('[data-ref="chart-wrap"]');
    if (!chartWrap) return;
    chartWrap.innerHTML = '';

    const colNames = this._columnRefs
      .map(ref => getColumnName(this._context.stateManager, ref))
      .join(', ');
    const isStable = r.signals.length === 0;

    const wrapper = document.createElement('div');
    wrapper.className = 'mvcc__chart-section';
    const header = document.createElement('div');
    header.className = 'mvcc__chart-header';
    header.innerHTML = `
      <span class="mvcc__chart-title">${esc(this._t('chartTitle', { vars: colNames }))}</span>
      <span class="mvcc__badge ${isStable ? 'mvcc__badge--stable' : 'mvcc__badge--unstable'}">
        ${isStable ? this._t('stable') : this._t('unstable', { count: r.signals.length })}
      </span>
    `;
    wrapper.appendChild(header);

    const plotEl = document.createElement('div');
    plotEl.className = 'mvcc__plot-wrap';
    wrapper.appendChild(plotEl);
    chartWrap.appendChild(wrapper);

    this._chart = await this._context.chartManager.create(plotEl, 'control-chart', {
      title: '',
      xLabel: this._t('xLabelSample'),
      yLabel: 'T²',
      showLegend: false,
      showTitle: false,
      values: r.t2,
      cl: r.cl,
      ucl: r.ucl,
      lcl: 0,
      sigma: 0,
      violationIndices: new Set(r.signals),
      usl: null, lsl: null,
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
