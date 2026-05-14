/**
 * D.Mike — Outlier Test Module (outlier-test.js)
 * Analyze phase: classical outlier identification on a single numeric column.
 *
 * Methods (any subset can be enabled at once):
 *   - Grubbs' Test
 *   - Dixon Q Test
 *   - Generalized ESD (Rosner 1983)
 *   - Tukey IQR Rule (boxplot fences)
 *   - Hampel Identifier (median + scaled MAD)
 *   - Z-Score
 *   - Modified Z-Score (Iglewicz-Hoaglin)
 *
 * Layout: shared dmike-split (input | output). Output shows per-method cards,
 * a flagged-points summary table, and an individual-value plot with outliers
 * highlighted in the project error color.
 */

import {
  grubbsTest, dixonQTest, generalizedESD,
  tukeyIQR, hampelIdentifier, zScoreOutliers, modifiedZScore,
} from '../../engines/outlier-test-engine.js';

import { ColumnPicker, getColumnValues, getColumnName } from '../../ui/column-picker.js';
import { esc } from '../../core/html-utils.js';
import { provisionWorksheet, removeProvisionedWorksheet } from '../../core/examples-registry.js';

/** Mapping: test id → Algorithm Lab algorithm id. */
const ALGO_LAB_IDS = {
  'grubbs':           'grubbs-test',
  'dixon-q':          'dixon-q-test',
  'generalized-esd':  'generalized-esd',
  'tukey-iqr':        'tukey-iqr',
  'hampel':           'hampel-identifier',
  'z-score':          'z-score-outlier',
  'modified-z':       'modified-z-score',
};

const ALGO_LINK_SVG = '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';

const ALL_METHODS = ['grubbs', 'dixon-q', 'generalized-esd', 'tukey-iqr', 'hampel', 'z-score', 'modified-z'];

function fmt(v, d = 4) { return v != null && isFinite(v) ? v.toFixed(d) : '–'; }

export default {
  id: 'outlier-test',
  phase: 'analyze',
  icon: 'alert-triangle',
  i18nKey: 'modules.outlier-test',
  version: '1.0.0',

  _container: null,
  _context: null,

  // Column selection
  _picker: null,
  _colRef: null,

  // Parameters
  _alpha: null,
  _side: 'two-sided',
  _tukeyFactor: 1.5,
  _hampelK: 3,
  _zThreshold: 3,
  _modZThreshold: 3.5,
  _esdMaxOutliers: null,
  _enabled: null,

  // Which method the chart highlights — 'all' = union over all enabled methods.
  _chartMethod: 'all',

  // Worksheet provisioned by loadExample; tracked so the next example load can
  // remove the previous one instead of leaving orphans in the data phase.
  _exampleWorksheetId: null,

  // Chart
  _chart: null,

  help: () => import('./outlier-test-help.js'),

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    if (!document.getElementById('outlier-test-css')) {
      const link = document.createElement('link');
      link.id = 'outlier-test-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/outlier-test/outlier-test.css';
      document.head.appendChild(link);
    }

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) {
      this._colRef = saved.colRef || null;
      this._alpha = saved.alpha ?? null;
      this._side = saved.side || 'two-sided';
      this._tukeyFactor = saved.tukeyFactor ?? 1.5;
      this._hampelK = saved.hampelK ?? 3;
      this._zThreshold = saved.zThreshold ?? 3;
      this._modZThreshold = saved.modZThreshold ?? 3.5;
      this._esdMaxOutliers = saved.esdMaxOutliers ?? null;
      this._enabled = Array.isArray(saved.enabled) ? new Set(saved.enabled) : null;
      this._chartMethod = saved.chartMethod || 'all';
      if (saved.exampleWorksheetId !== undefined) this._exampleWorksheetId = saved.exampleWorksheetId;
    }

    if (this._alpha == null) {
      const globalConf = (context.stateManager.get('settings.confidenceLevel') ?? 95) / 100;
      this._alpha = +(1 - globalConf).toFixed(4);
    }
    if (!this._enabled) this._enabled = new Set(ALL_METHODS);

    this._render();
  },

  async destroy() {
    this._destroyChart();
    if (this._picker) { this._picker.destroy(); this._picker = null; }
    this._container.innerHTML = '';
  },

  onLanguageChange() { this._render(); },
  onThemeChange() {},

  getState() {
    return {
      colRef: this._picker?.value || this._colRef || null,
      alpha: this._alpha,
      side: this._side,
      tukeyFactor: this._tukeyFactor,
      hampelK: this._hampelK,
      zThreshold: this._zThreshold,
      modZThreshold: this._modZThreshold,
      esdMaxOutliers: this._esdMaxOutliers,
      enabled: Array.from(this._enabled),
      chartMethod: this._chartMethod,
      exampleWorksheetId: this._exampleWorksheetId,
    };
  },

  setState(data) {
    if (!data) return;
    if (data.colRef !== undefined) this._colRef = data.colRef;
    if (data.alpha != null) this._alpha = data.alpha;
    if (data.side) this._side = data.side;
    if (data.tukeyFactor != null) this._tukeyFactor = data.tukeyFactor;
    if (data.hampelK != null) this._hampelK = data.hampelK;
    if (data.zThreshold != null) this._zThreshold = data.zThreshold;
    if (data.modZThreshold != null) this._modZThreshold = data.modZThreshold;
    if (data.esdMaxOutliers !== undefined) this._esdMaxOutliers = data.esdMaxOutliers;
    if (Array.isArray(data.enabled)) this._enabled = new Set(data.enabled);
    if (data.chartMethod) this._chartMethod = data.chartMethod;
    if (data.exampleWorksheetId !== undefined) this._exampleWorksheetId = data.exampleWorksheetId;
    if (this._container) this._render();
  },

  /**
   * Load a catalog example. Provisions the included worksheet, rewrites the
   * `__source__` placeholder in `colRef`, then applies via setState.
   * @param {{ meta: object, data: object }} payload
   */
  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = (k) => this._context.i18n.t(k);

    const hasContent = !!this._colRef;
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
        data.exampleWorksheetId = ref.instanceId;
        if (data.colRef?.instanceId === '__source__') {
          data.colRef = { ...data.colRef, instanceId: ref.instanceId };
        }
      }
    }

    this.setState(data);
    this._save();

    const lang = this._context.i18n.getLanguage();
    const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
    this._context.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
  },

  _save() {
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
  },

  _t(k, v) { return this._context.i18n.t(`modules.outlier-test.${k}`, v); },

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    const t = (k, v) => this._t(k, v);
    this._destroyChart();
    if (this._picker) { this._picker.destroy(); this._picker = null; }

    this._container.innerHTML = `
      <div class="outliertest dmike-split">
        <div class="outliertest__input dmike-split__input">
          ${this._renderConfig(t)}
        </div>
        <div class="outliertest__output dmike-split__output">
          <div class="outliertest__placeholder" data-ref="placeholder">
            <svg width="64" height="64" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <p>${t('placeholderText')}</p>
          </div>
          <div data-ref="results" style="display:none"></div>
        </div>
      </div>
    `;

    this._initPicker();
    this._bindConfigEvents();
    this._runAnalysis();
  },

  _renderConfig(t) {
    const m = (id, label) => `
      <label class="outliertest__method">
        <input type="checkbox" data-method="${id}" ${this._enabled.has(id) ? 'checked' : ''}>
        <span>${label}</span>
      </label>`;

    return `
      <div class="dmike-split__section-title">${t('sectionData')}</div>
      <div class="field-group">
        <label>${t('column')}</label>
        <div data-ref="picker-wrap"></div>
      </div>

      <div class="dmike-split__section-title">${t('sectionMethods')}</div>
      <div class="outliertest__methods">
        ${m('grubbs',          t('mGrubbs'))}
        ${m('dixon-q',         t('mDixon'))}
        ${m('generalized-esd', t('mESD'))}
        ${m('tukey-iqr',       t('mTukey'))}
        ${m('hampel',          t('mHampel'))}
        ${m('z-score',         t('mZScore'))}
        ${m('modified-z',      t('mModZ'))}
      </div>

      <div class="dmike-split__section-title">${t('sectionParams')}</div>
      <div class="field-row">
        <div class="field-group field-group--major">
          <label>${t('side')}</label>
          <select data-ref="side" class="field">
            <option value="two-sided" ${this._side === 'two-sided' ? 'selected' : ''}>${t('sideTwo')}</option>
            <option value="upper" ${this._side === 'upper' ? 'selected' : ''}>${t('sideUpper')}</option>
            <option value="lower" ${this._side === 'lower' ? 'selected' : ''}>${t('sideLower')}</option>
          </select>
        </div>
        <div class="field-group field-group--minor">
          <label>α</label>
          <input type="number" data-ref="alpha" class="field field--num" min="0.001" max="0.5" step="0.01" value="${this._alpha}">
        </div>
      </div>

      <div class="field-row">
        <div class="field-group field-group--minor">
          <label title="${esc(t('tipTukeyFactor'))}">${t('tukeyFactor')}</label>
          <input type="number" data-ref="tukey-factor" class="field field--num" min="0.5" max="5" step="0.1" value="${this._tukeyFactor}">
        </div>
        <div class="field-group field-group--minor">
          <label title="${esc(t('tipHampelK'))}">${t('hampelK')}</label>
          <input type="number" data-ref="hampel-k" class="field field--num" min="1" max="10" step="0.1" value="${this._hampelK}">
        </div>
      </div>

      <div class="field-row">
        <div class="field-group field-group--minor">
          <label title="${esc(t('tipZThreshold'))}">${t('zThreshold')}</label>
          <input type="number" data-ref="z-threshold" class="field field--num" min="1" max="6" step="0.1" value="${this._zThreshold}">
        </div>
        <div class="field-group field-group--minor">
          <label title="${esc(t('tipModZThreshold'))}">${t('modZThreshold')}</label>
          <input type="number" data-ref="modz-threshold" class="field field--num" min="1" max="6" step="0.1" value="${this._modZThreshold}">
        </div>
      </div>

      <div class="field-group">
        <label title="${esc(t('tipEsdMax'))}">${t('esdMax')}</label>
        <input type="number" data-ref="esd-max" class="field field--num" min="1" max="50" step="1" value="${this._esdMaxOutliers ?? ''}" placeholder="${esc(t('esdMaxAuto'))}">
      </div>

      <div class="outliertest__error" data-ref="error-box"></div>
    `;
  },

  _initPicker() {
    const wrap = this._container.querySelector('[data-ref="picker-wrap"]');
    if (!wrap) return;
    this._picker = new ColumnPicker(wrap, this._context, {
      mode: 'single',
      types: ['numeric'],
      minCount: 3,
      onChange: (ref) => {
        this._colRef = ref;
        this._save();
        this._runAnalysis();
      },
    });
    if (this._colRef) this._picker.value = this._colRef;
  },

  _bindConfigEvents() {
    const c = this._container;
    const refresh = () => { this._save(); this._runAnalysis(); };

    c.querySelectorAll('[data-method]').forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.checked) this._enabled.add(cb.dataset.method);
        else this._enabled.delete(cb.dataset.method);
        refresh();
      });
    });

    const sideSel = c.querySelector('[data-ref="side"]');
    if (sideSel) sideSel.addEventListener('change', () => { this._side = sideSel.value; refresh(); });

    const bind = (sel, key, parser = parseFloat, min, max) => {
      const el = c.querySelector(sel);
      if (!el) return;
      el.addEventListener('input', () => {
        const raw = el.value === '' ? null : parser(el.value);
        if (raw == null) { this[key] = null; refresh(); return; }
        if (!isFinite(raw)) return;
        const clamped = (min != null && raw < min) ? min
                       : (max != null && raw > max) ? max
                       : raw;
        this[key] = clamped;
        refresh();
      });
    };
    bind('[data-ref="alpha"]',          '_alpha',        parseFloat, 0.001, 0.5);
    bind('[data-ref="tukey-factor"]',   '_tukeyFactor',  parseFloat, 0.1,  10);
    bind('[data-ref="hampel-k"]',       '_hampelK',      parseFloat, 0.1,  20);
    bind('[data-ref="z-threshold"]',    '_zThreshold',   parseFloat, 0.1,  10);
    bind('[data-ref="modz-threshold"]', '_modZThreshold',parseFloat, 0.1,  10);
    bind('[data-ref="esd-max"]',        '_esdMaxOutliers', (v) => parseInt(v, 10), 1, 50);
  },

  // ─── Data retrieval ─────────────────────────────────────────

  _getData() {
    if (!this._picker?.value) return [];
    const raw = getColumnValues(this._context.stateManager, this._picker.value);
    return raw.filter((v) => v != null && typeof v === 'number' && !isNaN(v));
  },

  _showError(msg) {
    const eb = this._container.querySelector('[data-ref="error-box"]');
    if (!eb) return;
    eb.textContent = msg;
    eb.style.display = 'block';
  },

  _hideError() {
    const eb = this._container.querySelector('[data-ref="error-box"]');
    if (eb) { eb.textContent = ''; eb.style.display = 'none'; }
  },

  _hideResults() {
    const phEl = this._container.querySelector('[data-ref="placeholder"]');
    const resEl = this._container.querySelector('[data-ref="results"]');
    if (phEl) phEl.style.display = '';
    if (resEl) { resEl.style.display = 'none'; resEl.innerHTML = ''; }
    this._destroyChart();
  },

  _destroyChart() {
    if (this._chart && this._context?.chartManager) {
      try { this._context.chartManager.destroy(this._chart); } catch { /* ignore */ }
    }
    this._chart = null;
  },

  // ─── Analysis ───────────────────────────────────────────────

  _runAnalysis() {
    this._hideError();

    const data = this._getData();
    if (data.length < 3) { this._hideResults(); return; }

    const alpha = this._alpha;
    const enabled = this._enabled;

    const results = {};
    const errs = {};

    const safe = (id, fn) => {
      if (!enabled.has(id)) return;
      try { results[id] = fn(); }
      catch (e) { errs[id] = e.message || 'error'; }
    };

    safe('grubbs',          () => grubbsTest(data, alpha, this._side));
    safe('dixon-q',         () => dixonQTest(data, alpha, this._side));
    safe('generalized-esd', () => generalizedESD(data, alpha, this._esdMaxOutliers ?? undefined));
    safe('tukey-iqr',       () => tukeyIQR(data, this._tukeyFactor));
    safe('hampel',          () => hampelIdentifier(data, this._hampelK));
    safe('z-score',         () => zScoreOutliers(data, this._zThreshold));
    safe('modified-z',      () => modifiedZScore(data, this._modZThreshold));

    this._renderResults(data, results, errs);
  },

  // ─── Render results ─────────────────────────────────────────

  _renderResults(data, results, errs) {
    const t = (k, v) => this._t(k, v);
    const resEl = this._container.querySelector('[data-ref="results"]');
    const phEl = this._container.querySelector('[data-ref="placeholder"]');
    if (!resEl) return;
    phEl.style.display = 'none';
    resEl.style.display = 'block';

    const colName = this._colRef ? getColumnName(this._context.stateManager, this._colRef) : t('untitledColumn');

    // Union of flagged indices across enabled methods (used for the chart)
    const flagsByIndex = new Map(); // idx → Set<methodId>
    for (const [id, r] of Object.entries(results)) {
      if (!r?.outliers) continue;
      for (const o of r.outliers) {
        if (!flagsByIndex.has(o.index)) flagsByIndex.set(o.index, new Set());
        flagsByIndex.get(o.index).add(id);
      }
    }
    const flaggedIdxs = [...flagsByIndex.keys()].sort((a, b) => a - b);
    const totalFlagged = flaggedIdxs.length;

    let html = '';

    // ── Summary
    html += `<div class="dmike-split__output-section">${t('sectionSummary')}</div>`;
    html += `<div class="dmike-kpi-strip">
      <div class="dmike-kpi"><div class="dmike-kpi-value">${data.length}</div><div class="dmike-kpi-label">n</div></div>
      <div class="dmike-kpi"><div class="dmike-kpi-value dmike-kpi-value--sm">${esc(colName)}</div><div class="dmike-kpi-label">${t('column')}</div></div>
      <div class="dmike-kpi ${totalFlagged > 0 ? 'dmike-kpi--bad' : 'dmike-kpi--good'}"><div class="dmike-kpi-value">${totalFlagged}</div><div class="dmike-kpi-label">${t('flaggedAny')}</div></div>
      <div class="dmike-kpi"><div class="dmike-kpi-value">${Object.keys(results).length}</div><div class="dmike-kpi-label">${t('methodsRun')}</div></div>
    </div>`;

    // ── Chart with per-method selector
    const availableForChart = ALL_METHODS.filter((id) => this._enabled.has(id) && results[id] && (results[id].outliers?.length ?? 0) > 0);
    if (this._chartMethod !== 'all' && !availableForChart.includes(this._chartMethod)) {
      this._chartMethod = 'all';
    }
    const seg = (val, label) => `<button class="btn--segment outliertest__chart-method-btn${this._chartMethod === val ? ' btn--active' : ''}" data-chart-method="${val}">${label}</button>`;
    let segHtml = seg('all', t('chartMethodAll'));
    for (const mid of availableForChart) {
      segHtml += seg(mid, t('m' + this._labelKey(mid)));
    }

    html += `<div class="dmike-split__output-section">${t('sectionChart')}</div>`;
    html += `<div class="outliertest__chart-method btn-group">${segHtml}</div>`;
    html += `<div class="outliertest__chart-card"><div data-ref="chart" class="outliertest__chart"></div></div>`;

    // ── Per-method cards
    html += `<div class="dmike-split__output-section">${t('sectionMethods')}</div>`;
    for (const id of ALL_METHODS) {
      if (!this._enabled.has(id)) continue;
      if (errs[id]) {
        html += this._renderErrorCard(id, errs[id]);
      } else if (results[id]) {
        html += this._renderMethodCard(id, results[id], data);
      }
    }

    // ── Combined flagged-points table
    if (totalFlagged > 0) {
      html += `<div class="dmike-split__output-section">${t('sectionFlagged')}</div>`;
      html += this._renderFlaggedTable(data, flaggedIdxs, flagsByIndex, results);
    }

    resEl.innerHTML = html;

    // Bind algo links
    resEl.querySelectorAll('.outliertest__algo-link').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this._context.eventBus.emit('lab:navigate', { algoId: btn.dataset.algoId, tab: 'docs' });
      });
    });

    // Bind chart-method selector — re-render the chart only.
    resEl.querySelectorAll('.outliertest__chart-method-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._chartMethod = btn.dataset.chartMethod;
        this._save();
        resEl.querySelectorAll('.outliertest__chart-method-btn').forEach((b) => {
          b.classList.toggle('btn--active', b.dataset.chartMethod === this._chartMethod);
        });
        const idxs = this._chartMethod === 'all'
          ? flaggedIdxs
          : (results[this._chartMethod]?.outliers || []).map((o) => o.index);
        this._renderChart(data, idxs, colName, this._chartMethod, results);
      });
    });

    // Render chart asynchronously — initial render reflects the saved selection.
    const initialIdxs = this._chartMethod === 'all'
      ? flaggedIdxs
      : (results[this._chartMethod]?.outliers || []).map((o) => o.index);
    this._renderChart(data, initialIdxs, colName, this._chartMethod, results);
  },

  _algoLink(testId, label) {
    const algoId = ALGO_LAB_IDS[testId];
    if (!algoId) return esc(label);
    return `${esc(label)} <button class="outliertest__algo-link" data-algo-id="${algoId}" title="Algorithm Lab">${ALGO_LINK_SVG}</button>`;
  },

  _renderErrorCard(id, msg) {
    const t = (k, v) => this._t(k, v);
    return `<div class="outliertest__card outliertest__card--error">
      <div class="outliertest__card-header">${this._algoLink(id, t('m' + this._labelKey(id)))}</div>
      <div class="outliertest__card-error">${t('errInapplicable')}: ${esc(msg)}</div>
    </div>`;
  },

  _labelKey(id) {
    return ({
      'grubbs': 'Grubbs',
      'dixon-q': 'Dixon',
      'generalized-esd': 'ESD',
      'tukey-iqr': 'Tukey',
      'hampel': 'Hampel',
      'z-score': 'ZScore',
      'modified-z': 'ModZ',
    })[id] || 'Grubbs';
  },

  _renderMethodCard(id, r, data) {
    const t = (k, v) => this._t(k, v);
    const label = t('m' + this._labelKey(id));
    const k = r.outliers?.length ?? 0;
    const verdict = k === 0
      ? `<span class="outliertest__verdict outliertest__verdict--clean">✓ ${t('verdictClean')}</span>`
      : `<span class="outliertest__verdict outliertest__verdict--flag">⚠ ${t('verdictFlagged', { count: k })}</span>`;

    let metrics = '';
    let extra = '';

    if (id === 'grubbs') {
      const pBad = r.pValue < r.parameters.alpha;
      metrics = `
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(r.statistic, 4)}</div><div class="dmike-kpi-label">G</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(r.critical, 4)}</div><div class="dmike-kpi-label">Gₜ</div></div>
        <div class="dmike-kpi ${pBad ? 'dmike-kpi--bad' : 'dmike-kpi--good'}"><div class="dmike-kpi-value">${fmt(r.pValue, 4)}</div><div class="dmike-kpi-label">p</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(r.mean, 4)}</div><div class="dmike-kpi-label">x̄</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(r.sd, 4)}</div><div class="dmike-kpi-label">s</div></div>`;
    } else if (id === 'dixon-q') {
      metrics = `
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(r.statistic, 4)}</div><div class="dmike-kpi-label">Q</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(r.critical, 4)}</div><div class="dmike-kpi-label">Qₜ</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value dmike-kpi-value--sm">${esc(r.parameters.variant)}</div><div class="dmike-kpi-label">${t('variant')}</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value dmike-kpi-value--sm">${esc(r.side)}</div><div class="dmike-kpi-label">${t('side')}</div></div>`;
    } else if (id === 'generalized-esd') {
      metrics = `
        <div class="dmike-kpi ${r.detected > 0 ? 'dmike-kpi--bad' : 'dmike-kpi--good'}"><div class="dmike-kpi-value">${r.detected}</div><div class="dmike-kpi-label">${t('detected')}</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${r.parameters.maxOutliers}</div><div class="dmike-kpi-label">${t('esdMax')}</div></div>`;
      // Step trace
      const rows = r.steps.map((s) => `
        <tr class="${s.R > s.lambda ? 'outliertest__step--reject' : ''}">
          <td>${s.i}</td><td>${fmt(s.value, 4)}</td>
          <td>${fmt(s.R, 4)}</td>
          <td>${fmt(s.lambda, 4)}</td>
          <td>${s.R > s.lambda ? '✗' : '✓'}</td>
        </tr>`).join('');
      extra = `<table class="outliertest__steps">
        <thead><tr><th>i</th><th>${t('value')}</th><th>Rᵢ</th><th>λᵢ</th><th>Rᵢ &gt; λᵢ</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    } else if (id === 'tukey-iqr') {
      metrics = `
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(r.q1, 4)}</div><div class="dmike-kpi-label">Q1</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(r.median, 4)}</div><div class="dmike-kpi-label">${t('median')}</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(r.q3, 4)}</div><div class="dmike-kpi-label">Q3</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(r.iqr, 4)}</div><div class="dmike-kpi-label">IQR</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(r.fenceLower, 4)}</div><div class="dmike-kpi-label">${t('fenceLower')}</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(r.fenceUpper, 4)}</div><div class="dmike-kpi-label">${t('fenceUpper')}</div></div>`;
    } else if (id === 'hampel') {
      metrics = `
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(r.median, 4)}</div><div class="dmike-kpi-label">${t('median')}</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(r.mad, 4)}</div><div class="dmike-kpi-label">MAD</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(r.madScaled, 4)}</div><div class="dmike-kpi-label">1.4826·MAD</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(r.parameters.k, 2)}</div><div class="dmike-kpi-label">k</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(r.threshold, 4)}</div><div class="dmike-kpi-label">${t('threshold')}</div></div>`;
      if (r.degenerate) extra = `<div class="outliertest__hint">${t('hintDegenerateMad')}</div>`;
    } else if (id === 'z-score') {
      metrics = `
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(r.mean, 4)}</div><div class="dmike-kpi-label">x̄</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(r.sd, 4)}</div><div class="dmike-kpi-label">s</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(r.parameters.threshold, 2)}</div><div class="dmike-kpi-label">${t('threshold')}</div></div>`;
      if (r.degenerate) extra = `<div class="outliertest__hint">${t('hintDegenerateSd')}</div>`;
    } else if (id === 'modified-z') {
      metrics = `
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(r.median, 4)}</div><div class="dmike-kpi-label">${t('median')}</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(r.mad, 4)}</div><div class="dmike-kpi-label">MAD</div></div>
        <div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(r.parameters.threshold, 2)}</div><div class="dmike-kpi-label">${t('threshold')}</div></div>`;
      if (r.degenerate) extra = `<div class="outliertest__hint">${t('hintDegenerateMad')}</div>`;
    }

    let outlierList = '';
    if (k > 0) {
      const items = r.outliers.slice(0, 12).map((o) => {
        const stat = o.statistic != null ? ` <span class="outliertest__chip-stat">(${fmt(o.statistic, 3)})</span>` : '';
        return `<span class="outliertest__chip">#${o.index + 1}: ${fmt(o.value, 4)}${stat}</span>`;
      }).join('');
      const more = r.outliers.length > 12 ? `<span class="outliertest__chip outliertest__chip--more">+${r.outliers.length - 12}</span>` : '';
      outlierList = `<div class="outliertest__chips">${items}${more}</div>`;
    }

    return `<div class="outliertest__card">
      <div class="outliertest__card-header">
        <span class="outliertest__card-title">${this._algoLink(id, label)}</span>
        ${verdict}
      </div>
      <div class="dmike-kpi-strip">${metrics}</div>
      ${outlierList}
      ${extra}
    </div>`;
  },

  _renderFlaggedTable(data, idxs, flagsByIndex, results) {
    const t = (k, v) => this._t(k, v);
    const cols = ALL_METHODS.filter((id) => this._enabled.has(id) && results[id]);
    const head = cols.map((id) => `<th title="${esc(t('m' + this._labelKey(id)))}">${esc(this._shortLabel(id))}</th>`).join('');
    const rows = idxs.map((idx) => {
      const flags = flagsByIndex.get(idx);
      const cells = cols.map((id) => flags.has(id)
        ? `<td class="outliertest__flag">✓</td>`
        : `<td class="outliertest__no-flag">–</td>`).join('');
      const count = flags.size;
      return `<tr>
        <td>${idx + 1}</td>
        <td>${fmt(data[idx], 4)}</td>
        ${cells}
        <td><strong>${count}</strong></td>
      </tr>`;
    }).join('');
    return `<table class="outliertest__flagged">
      <thead><tr><th>#</th><th>${t('value')}</th>${head}<th>Σ</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  },

  _shortLabel(id) {
    return ({
      'grubbs': 'G',
      'dixon-q': 'Q',
      'generalized-esd': 'ESD',
      'tukey-iqr': 'IQR',
      'hampel': 'Ham',
      'z-score': 'Z',
      'modified-z': 'M-Z',
    })[id] || id;
  },

  // ─── Chart ──────────────────────────────────────────────────

  async _renderChart(data, flaggedIdxs, colName, chartMethod = 'all', _results = null) {
    const chartEl = this._container.querySelector('[data-ref="chart"]');
    if (!chartEl) return;
    this._destroyChart();
    chartEl.innerHTML = '';
    const t = (k, v) => this._t(k, v);

    const flagged = new Set(flaggedIdxs);
    const inliers = [];
    const outliers = [];
    for (let i = 0; i < data.length; i++) {
      (flagged.has(i) ? outliers : inliers).push(data[i]);
    }

    const methodLabel = chartMethod === 'all'
      ? t('chartMethodAll')
      : t('m' + this._labelKey(chartMethod));

    const groups = [
      { name: t('groupInliers'),  values: inliers },
    ];
    if (outliers.length > 0) {
      groups.push({ name: `${t('groupOutliers')} — ${methodLabel}`, values: outliers });
    }

    try {
      this._chart = await this._context.chartManager.create(chartEl, 'individual-value-plot', {
        title: t('chartTitle', { col: colName, method: methodLabel }),
        xLabel: '',
        yLabel: colName,
        showLegend: outliers.length > 0,
        showXTicks: false,
        showMean: true,
        showMedian: true,
        connectMeans: false,
        showOverallMean: false,
        jitter: 0.6,
        groups,
        pointColors: outliers.length > 0
          ? ['var(--color-accent)', 'var(--color-error)']
          : ['var(--color-accent)'],
        pointSize: 6,
      });
    } catch (e) {
      this._showError(e.message || t('errChart'));
    }
  },
};
