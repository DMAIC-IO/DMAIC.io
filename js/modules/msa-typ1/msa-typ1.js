/**
 * D.Mike — MSA Typ 1 Module (msa-typ1.js)
 * Measure phase: Measurement System Analysis Type 1.
 * Evaluates gage repeatability (Cg) and bias (Cgk).
 *
 * Data source: column from a Worksheet module (referenced by column ID).
 *
 * Spec: docs/modules/MSA-TYP1.md
 */

import { validate, analyze } from '../../engines/msa-typ1-engine.js';
import { ColumnPicker, getColumnValues } from '../../ui/column-picker.js';
import { provisionWorksheet as _provisionWorksheet, removeProvisionedWorksheet as _removeProvisionedWorksheet } from '../../core/examples-registry.js';

/** Mapping: KPI name → Algorithm Lab algorithm ID. */
const ALGO_LAB_IDS = { Cg: 'cg', Cgk: 'cgk' };

/** Small code icon SVG for Algorithm Lab links. */
const ALGO_LINK_SVG = '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';

/** @param {number} v @param {number} d @returns {string} */
function fmt(v, d = 4) { return v.toFixed(d); }

export default {
  id: 'msa-typ1',
  phase: 'measure',
  icon: 'target',
  i18nKey: 'modules.msa-typ1',
  version: '1.1.0',

  _container: null,
  _context: null,
  _t: null,
  _result: null,
  /** @type {{ instanceId: string, sheetId: string, columnId: string }|null} */
  _columnRef: null,
  /** Instance id of a worksheet provisioned by loadExample; tracked so a follow-up load can remove the previous one. */
  _exampleWorksheetId: null,
  _picker: null,
  _params: { name: '', ref: NaN, unit: 'mm', lsl: NaN, usl: NaN, k1: 0.2, k2: 4 },
  _charts: [],
  _renderGen: 0,
  _eventUnsubs: [],

  help: () => import('./msa-typ1-help.js'),

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;
    this._t = (key, vars) => context.i18n.t(key, vars);

    // Load module CSS
    if (!document.getElementById('msa-typ1-css')) {
      const link = document.createElement('link');
      link.id = 'msa-typ1-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/msa-typ1/msa-typ1.css';
      document.head.appendChild(link);
    }

    const onModuleActivated = ({ instanceId }) => {
      if (instanceId === context.instanceId) this._picker?.refresh();
    };
    context.eventBus.on('module:activated', onModuleActivated);
    this._eventUnsubs.push(() => context.eventBus.off('module:activated', onModuleActivated));

    container.innerHTML = '';
    this._render();
  },

  async destroy() {
    for (const unsub of this._eventUnsubs) unsub();
    this._eventUnsubs = [];
    this._picker?.destroy();
    this._picker = null;
    this._destroyCharts();
    this._container.innerHTML = '';
  },

  onLanguageChange() {
    this._render();
    if (this._result) {
      this._renderResults(this._result);
    }
  },

  onThemeChange() {
    if (this._result) {
      this._destroyCharts();
      this._renderCharts(this._result, ++this._renderGen);
    }
  },

  // ─── Data hooks ─────────────────────────────────────────────

  getState() {
    this._readInputs();
    return {
      params: { ...this._params },
      columnRef: this._columnRef ? { ...this._columnRef } : null,
      lastResult: this._result,
      exampleWorksheetId: this._exampleWorksheetId,
    };
  },

  setState(data) {
    if (!data) return;
    if (data.params) this._params = { ...this._params, ...data.params };
    if (data.columnRef !== undefined) this._columnRef = data.columnRef ? { ...data.columnRef } : null;
    if (data.exampleWorksheetId !== undefined) this._exampleWorksheetId = data.exampleWorksheetId;
    this._result = data.lastResult || null;
    this._render();
    if (this._result) {
      this._renderResults(this._result);
    }
    this._tryAutoAnalysis();
  },

  /**
   * Load a catalog example into the module. MSA-Typ1 examples ship a full
   * worksheet (`sourceWorksheetData`) and the module state using the literal
   * placeholder `__source__` as instanceId in `columnRef`. On load we
   * provision a fresh worksheet, rewrite the placeholder, then apply state.
   *
   * @param {{ meta: object, data: object }} payload
   */
  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = this._t;

    const hasContent = !!this._columnRef || !!this._result;
    if (hasContent && this._context?.confirmPopout) {
      const ok = await this._context.confirmPopout(t('moduleHelp.confirmOverwrite'), { danger: true });
      if (!ok) return;
    }

    const data = { ...payload.data };

    if (data.sourceWorksheetData) {
      const wsState = data.sourceWorksheetData;
      delete data.sourceWorksheetData;
      if (this._exampleWorksheetId) {
        _removeProvisionedWorksheet(this._context, this._exampleWorksheetId);
        this._exampleWorksheetId = null;
      }
      const ref = _provisionWorksheet(this._context, wsState);
      if (ref) {
        this._exampleWorksheetId = ref.instanceId;
        data.exampleWorksheetId = ref.instanceId;
        if (data.columnRef && data.columnRef.instanceId === '__source__') {
          data.columnRef = { ...data.columnRef, instanceId: ref.instanceId };
        }
      }
    }

    this.setState(data);
    this._save();

    const lang = this._context.i18n.getLanguage();
    const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
    this._context.notify?.(t('moduleHelp.exampleLoaded', { title }), 'success');
  },

  // ─── Column Values ─────────────────────────────────────────

  /**
   * Read the actual numeric values from the referenced column.
   * @returns {number[]}
   */
  _getColumnValues() {
    if (!this._columnRef) return [];
    return getColumnValues(this._context.stateManager, this._columnRef)
      .filter(v => v != null && typeof v === 'number' && !isNaN(v));
  },

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    this._picker?.destroy();
    this._picker = null;

    const t = this._t;
    const p = this._params;

    this._container.innerHTML = `
      <div class="module-msa-typ1 dmike-split">
        <div class="dmike-split__input">
          <div class="dmike-split__section-title">${t('modules.msa-typ1.sectionParams')}</div>

          <div class="field-group">
            <label>${t('modules.msa-typ1.featureName')}</label>
            <input type="text" class="field" data-ref="inp-name" placeholder="${t('modules.msa-typ1.featureNamePh')}" value="${this._esc(p.name)}">
          </div>

          <div class="msa-typ1__row">
            <div class="field-group">
              <label>${t('modules.msa-typ1.refValue')}</label>
              <input type="text" class="field field--num" data-ref="inp-ref" placeholder="50.000" inputmode="decimal" value="${isNaN(p.ref) ? '' : p.ref}">
            </div>
            <div class="field-group">
              <label>${t('modules.msa-typ1.unit')}</label>
              <input type="text" class="field" data-ref="inp-unit" value="${this._esc(p.unit)}" placeholder="mm">
            </div>
          </div>

          <div class="msa-typ1__row">
            <div class="field-group">
              <label>${t('modules.msa-typ1.lsl')}</label>
              <input type="text" class="field field--num" data-ref="inp-lsl" placeholder="49.950" inputmode="decimal" value="${isNaN(p.lsl) ? '' : p.lsl}">
            </div>
            <div class="field-group">
              <label>${t('modules.msa-typ1.usl')}</label>
              <input type="text" class="field field--num" data-ref="inp-usl" placeholder="50.050" inputmode="decimal" value="${isNaN(p.usl) ? '' : p.usl}">
            </div>
          </div>

          <div class="msa-typ1__row">
            <div class="field-group">
              <label>${t('modules.msa-typ1.k1Label')}</label>
              <select class="field" data-ref="inp-k1">
                <option value="0.2"${p.k1 === 0.2 ? ' selected' : ''}>0.20 (20 %)</option>
                <option value="0.15"${p.k1 === 0.15 ? ' selected' : ''}>0.15 (15 %)</option>
                <option value="0.1"${p.k1 === 0.1 ? ' selected' : ''}>0.10 (10 %)</option>
              </select>
            </div>
            <div class="field-group">
              <label>${t('modules.msa-typ1.k2Label')}</label>
              <select class="field" data-ref="inp-k2">
                <option value="3"${p.k2 === 3 ? ' selected' : ''}>3 (99.73 %)</option>
                <option value="4"${p.k2 === 4 ? ' selected' : ''}>4 (99.99 %)</option>
                <option value="6"${p.k2 === 6 ? ' selected' : ''}>6</option>
              </select>
            </div>
          </div>

          <div class="dmike-split__section-title">${t('modules.msa-typ1.sectionValues')}</div>

          <div class="field-group">
            <label>${t('modules.msa-typ1.columnSelectLabel')}</label>
            <div data-ref="col-picker-wrap"></div>
          </div>

          <div class="msa-typ1__error" data-ref="error-box"></div>
        </div>

        <div class="dmike-split__output">
          <div data-ref="results"></div>
        </div>
      </div>
    `;

    const wrap = this._container.querySelector('[data-ref="col-picker-wrap"]');
    this._picker = new ColumnPicker(wrap, this._context, {
      mode: 'single',
      types: ['numeric'],
      onChange: (ref) => {
        this._columnRef = ref;
        this._save();
        this._tryAutoAnalysis();
      },
    });
    if (this._columnRef) this._picker.value = this._columnRef;

    this._bindEvents();
  },

  _bindEvents() {
    const c = this._container;
    const autoRun = this._debounce(() => { this._save(); this._tryAutoAnalysis(); }, 600);
    c.querySelectorAll('[data-ref^="inp-"]').forEach(el => {
      el.addEventListener('input', autoRun);
      el.addEventListener('change', autoRun);
    });
  },

  // ─── Actions ────────────────────────────────────────────────

  /**
   * Automatically run analysis if all required inputs are present and valid.
   * Silently hides results when data is incomplete (no error shown).
   */
  _tryAutoAnalysis() {
    this._readInputs();

    if (!this._columnRef) return this._clearResults();

    const values = this._getColumnValues();
    if (values.length === 0) return this._clearResults();

    const p = this._params;
    const ref = this._parseNum(p.ref);
    const lsl = this._parseNum(p.lsl);
    const usl = this._parseNum(p.usl);

    const validation = validate({ ref, lsl, usl }, values);
    if (!validation.valid) return this._clearResults();

    this._hideError();

    const k1 = parseFloat(p.k1);
    const k2 = parseFloat(p.k2);
    const result = analyze({ ref, lsl, usl, k1, k2 }, values);
    this._result = result;
    this._renderResults(result);
    this._save();
  },

  /**
   * Clear results when data is incomplete.
   */
  _clearResults() {
    this._result = null;
    const resultsEl = this._container?.querySelector('[data-ref="results"]');
    if (resultsEl) resultsEl.innerHTML = '';
    this._destroyCharts();
  },

  _runAnalysis() {
    this._readInputs();

    // Get values from referenced worksheet column
    const values = this._getColumnValues();

    if (!this._columnRef) {
      this._showError(this._t('modules.msa-typ1.errNoColumnSelected'));
      return;
    }

    const p = this._params;
    const ref = this._parseNum(p.ref);
    const lsl = this._parseNum(p.lsl);
    const usl = this._parseNum(p.usl);
    const k1 = parseFloat(p.k1);
    const k2 = parseFloat(p.k2);

    const validation = validate({ ref, lsl, usl }, values);
    if (!validation.valid) {
      this._showError(this._t(validation.errorKey, validation.errorVars));
      return;
    }
    this._hideError();

    const result = analyze({ ref, lsl, usl, k1, k2 }, values);
    this._result = result;
    this._renderResults(result);
    this._save();
  },

  // ─── Render Results ─────────────────────────────────────────

  async _renderResults(r) {
    this._destroyCharts();
    const gen = ++this._renderGen;

    const t = this._t;
    const unit = this._params.unit || '';
    const name = this._params.name || '–';

    const resultsEl = this._container.querySelector('[data-ref="results"]');
    if (!resultsEl) return;

    const statusLabel = {
      pass: t('modules.msa-typ1.statusPass'),
      fail: t('modules.msa-typ1.statusFail'),
      warn: t('modules.msa-typ1.statusWarn'),
    };

    const badgeLabel = {
      pass: t('modules.msa-typ1.capable'),
      fail: t('modules.msa-typ1.notCapable'),
      warn: t('modules.msa-typ1.condCapable'),
    };

    let html = '';

    // Status bar
    html += `<div class="msa-typ1__status-bar msa-typ1__status-bar--${r.overall}">
      <span class="msa-typ1__status-label">${statusLabel[r.overall]}</span>
      <span class="msa-typ1__status-detail">— ${name} — n = ${r.n}</span>
    </div>`;

    // KPI cards (global dmike-kpi-strip)
    const kpiMod = { pass: 'dmike-kpi--good', warn: 'dmike-kpi--warn', fail: 'dmike-kpi--bad' };

    html += `<div class="dmike-kpi-strip">
      <div class="dmike-kpi ${kpiMod[r.cgStatus] || ''}">
        <div class="dmike-kpi-label">Cg (${t('modules.msa-typ1.repeatability')}) <button class="msa-typ1__algo-link" data-algo-id="${ALGO_LAB_IDS.Cg}" title="Algorithm Lab">${ALGO_LINK_SVG}</button></div>
        <div class="dmike-kpi-value">${fmt(r.Cg)}</div>
        <div class="dmike-kpi-sub">${t('modules.msa-typ1.threshold')}: ≥ 1.33 · ${badgeLabel[r.cgStatus]}</div>
      </div>
      <div class="dmike-kpi ${kpiMod[r.cgkStatus] || ''}">
        <div class="dmike-kpi-label">Cgk (${t('modules.msa-typ1.withBias')}) <button class="msa-typ1__algo-link" data-algo-id="${ALGO_LAB_IDS.Cgk}" title="Algorithm Lab">${ALGO_LINK_SVG}</button></div>
        <div class="dmike-kpi-value">${fmt(r.Cgk)}</div>
        <div class="dmike-kpi-sub">${t('modules.msa-typ1.threshold')}: ≥ 1.33 · ${badgeLabel[r.cgkStatus]}</div>
      </div>
      <div class="dmike-kpi">
        <div class="dmike-kpi-label">${t('modules.msa-typ1.biasLabel')}</div>
        <div class="dmike-kpi-value">${fmt(r.bias)}</div>
        <div class="dmike-kpi-sub">${fmt(r.biasPercent)} % ${t('modules.msa-typ1.ofTolerance')} · ${unit}</div>
      </div>
      <div class="dmike-kpi">
        <div class="dmike-kpi-label">${t('modules.msa-typ1.spreadSg')}</div>
        <div class="dmike-kpi-value">${fmt(r.sg)}</div>
        <div class="dmike-kpi-sub">${t('modules.msa-typ1.tolUsage')}: ${fmt(r.tolUsage)} %</div>
      </div>
    </div>`;

    // Stats panel
    html += `<div class="dmike-split__output-section">${t('modules.msa-typ1.statsTitle')}</div>
    <div class="msa-typ1__stats-panel">
      ${this._statsRow(t('modules.msa-typ1.statN'), r.n)}
      ${this._statsRow(t('modules.msa-typ1.statMean'), `${fmt(r.xbar)} ${unit}`)}
      ${this._statsRow(t('modules.msa-typ1.statStddev'), `${fmt(r.sg)} ${unit}`)}
      ${this._statsRow(t('modules.msa-typ1.statMin'), `${fmt(r.xmin)} ${unit}`)}
      ${this._statsRow(t('modules.msa-typ1.statMax'), `${fmt(r.xmax)} ${unit}`)}
      ${this._statsRow(t('modules.msa-typ1.statRange'), `${fmt(r.range)} ${unit}`)}
      ${this._statsRow(t('modules.msa-typ1.statRef'), `${fmt(r.params.ref)} ${unit}`)}
      ${this._statsRow(t('modules.msa-typ1.statTol'), `${fmt(r.T)} ${unit}`)}
      ${this._statsRow(t('modules.msa-typ1.statResolution'), r.resolution > 0 ? `${fmt(r.resolution)} ${unit} (${fmt(r.resPercent)} % T)` : '–')}
      ${this._statsRow('k₁ / k₂', `${r.params.k1} / ${r.params.k2}`)}
    </div>`;

    // Chart containers
    html += `<div class="dmike-split__output-section">${t('modules.msa-typ1.runChartTitle')}</div>
    <div class="msa-typ1__chart-plot" data-ref="chart-run"></div>`;

    html += `<div class="dmike-split__output-section">${t('modules.msa-typ1.histTitle')}</div>
    <div class="msa-typ1__chart-plot" data-ref="chart-hist"></div>`;

    // Interpretation
    html += `<div class="dmike-split__output-section">${t('modules.msa-typ1.formulasTitle')}</div>
    <div class="msa-typ1__interpretation">
      <p><strong>Cg</strong> = (k₁ · T) / (2 · k₂ · sg) = (${r.params.k1} · ${fmt(r.T)}) / (2 · ${r.params.k2} · ${fmt(r.sg)}) = <strong>${fmt(r.Cg)}</strong></p>
      <p><strong>Cgk</strong> = (k₁ · T/2 − |x̄ − x<sub>ref</sub>|) / (k₂ · sg) = (${fmt(r.params.k1 * r.T / 2)} − ${fmt(Math.abs(r.bias))}) / (${r.params.k2} · ${fmt(r.sg)}) = <strong>${fmt(r.Cgk)}</strong></p>
      <div style="height:12px"></div>
      <p><span class="msa-typ1__tag msa-typ1__tag--pass">Cg ≥ 1.33</span> ${t('modules.msa-typ1.interpCgPass')}</p>
      <p><span class="msa-typ1__tag msa-typ1__tag--pass">Cgk ≥ 1.33</span> ${t('modules.msa-typ1.interpCgkPass')}</p>
      <p><span class="msa-typ1__tag msa-typ1__tag--warn">1.00 ≤ ${t('modules.msa-typ1.value')} &lt; 1.33</span> ${t('modules.msa-typ1.interpWarn')}</p>
      <p><span class="msa-typ1__tag msa-typ1__tag--fail">${t('modules.msa-typ1.value')} &lt; 1.00</span> ${t('modules.msa-typ1.interpFail')}</p>
    </div>`;


    resultsEl.innerHTML = html;

    // Algorithm Lab link icons
    resultsEl.querySelectorAll('.msa-typ1__algo-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.stopPropagation();
        const algoId = link.dataset.algoId;
        if (algoId && this._context.eventBus) {
          this._context.eventBus.emit('lab:navigate', { algoId, tab: 'docs' });
        }
      });
    });

    // Render charts
    await this._renderCharts(r, gen);
  },

  // ─── SVG Charts ────────────────────────────────────────────

  async _renderCharts(r, gen) {
    const values = r.details.map(d => d.value);
    await this._renderRunChart(r, values);
    if (gen !== this._renderGen) return;
    await this._renderHistogram(r, values);
  },

  async _renderRunChart(r, values) {
    const el = this._container.querySelector('[data-ref="chart-run"]');
    if (!el) return;

    const t = this._t;
    const indices = values.map((_, i) => i + 1);

    const normalIdx = [], normalVal = [], outIdx = [], outVal = [];
    r.details.forEach(d => {
      if (d.isOutlier) { outIdx.push(d.index); outVal.push(d.value); }
      else { normalIdx.push(d.index); normalVal.push(d.value); }
    });

    const chart = await this._context.chartManager.create(el, 'scatter', {
      xLabel: t('modules.msa-typ1.chartIndex'),
      showLegend: true,
      markerSize: 5,
      series: [
        // Main data line
        { name: t('modules.msa-typ1.chartValues'), color: 'var(--color-accent)',
          x: indices, y: values,
          connectLine: { show: true, color: 'var(--color-text-secondary)', width: 1.5, dash: 'solid' }
        },
        // Outliers (if any) — separate series with open circle markers
        ...(outIdx.length > 0 ? [{
          name: t('modules.msa-typ1.chartOutliers'), color: 'var(--color-error)',
          stroke: 'var(--color-error)', strokeWidth: 2,
          x: outIdx, y: outVal,
          symbol: 'circle'
        }] : [])
      ],
      refLines: [
        { dir: 'h', value: r.params.ref, label: 'Ref', dash: 'dash', width: 1.5, color: 'var(--color-success)' },
        { dir: 'h', value: r.xbar, label: 'x̄', dash: 'dot', width: 1, color: 'var(--color-info)' },
        { dir: 'h', value: r.params.usl, label: 'USL', dash: 'dash', width: 1, color: 'var(--color-error)' },
        { dir: 'h', value: r.params.lsl, label: 'LSL', dash: 'dash', width: 1, color: 'var(--color-error)' },
      ],
      refAreas: [
        { dir: 'y', min: r.zoneLo, max: r.zoneHi, label: 'k₁·T', color: 'rgba(52,199,89,0.06)' }
      ],
    });
    this._charts.push(chart);
  },

  async _renderHistogram(r, values) {
    const el = this._container.querySelector('[data-ref="chart-hist"]');
    if (!el) return;

    const chart = await this._context.chartManager.create(el, 'histogram', {
      data: values,
      binMethod: 'sturges',
      showNormalCurve: true,
      barColor: 'var(--color-accent)',
      normalCurveColor: 'var(--color-info)',
      showLegend: true,
      specLimits: { lsl: r.params.lsl, usl: r.params.usl, target: r.params.ref },
    });
    this._charts.push(chart);
  },

  _destroyCharts() {
    if (this._charts) {
      for (const c of this._charts) {
        this._context.chartManager.destroy(c);
      }
    }
    this._charts = [];
  },

  // ─── Helpers ────────────────────────────────────────────────

  _statsRow(label, value) {
    return `<div class="msa-typ1__stats-row">
      <span class="msa-typ1__stats-row-label">${label}</span>
      <span class="msa-typ1__stats-row-value">${value}</span>
    </div>`;
  },

  _readInputs() {
    const c = this._container;
    if (!c) return;
    const q = (ref) => c.querySelector(`[data-ref="${ref}"]`);
    const v = (ref) => q(ref)?.value ?? '';

    this._params.name = v('inp-name');
    this._params.ref = this._parseNum(v('inp-ref'));
    this._params.unit = v('inp-unit') || 'mm';
    this._params.lsl = this._parseNum(v('inp-lsl'));
    this._params.usl = this._parseNum(v('inp-usl'));
    this._params.k1 = parseFloat(v('inp-k1'));
    this._params.k2 = parseFloat(v('inp-k2'));

    // Column ref is managed by ColumnPicker onChange
  },

  _parseNum(s) {
    if (s == null || s === '') return NaN;
    return parseFloat(String(s).replace(',', '.').trim());
  },

  _showError(msg) {
    const el = this._container.querySelector('[data-ref="error-box"]');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('visible');
    clearTimeout(this._errorTimer);
    this._errorTimer = setTimeout(() => this._hideError(), 6000);
  },

  _hideError() {
    const el = this._container?.querySelector('[data-ref="error-box"]');
    if (el) el.classList.remove('visible');
  },

  _save() {
    this._readInputs();
    if (this._context?.stateManager && this._context?.instanceId) {
      this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
    }
  },

  _notify(msg, type) {
    if (this._context?.notify) {
      this._context.notify(msg, type);
    }
  },

  _esc(s) {
    if (!s) return '';
    const el = document.createElement('span');
    el.textContent = s;
    return el.innerHTML;
  },

  _debounce(fn, ms) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  },

};
