/**
 * D.Mike — Data Transformation Module (data-transformation.js)
 * Data phase: transforms data using Box-Cox, Yeo-Johnson, Johnson SU/SB,
 * logarithm, sqrt, inverse, and square transformations.
 * Displays before/after histograms, probability plots, descriptive stats,
 * and Anderson-Darling normality tests.
 */

import { ColumnPicker, getColumnValues, getColumnName, refToKey, uniqueSheetName, buildInitialWorksheetState } from '../../ui/column-picker.js';
import { mean, std, median, skewness, kurtosis } from '../../engines/distribution-fit-engine.js';
import { andersonDarling } from '../../engines/normality-test-engine.js';
import { provisionWorksheet, removeProvisionedWorksheet } from '../../core/examples-registry.js';

// ═══════════════════════════════════════════════════════════════
// Transform definitions
// ═══════════════════════════════════════════════════════════════

const TRANSFORMS = [
  {
    id: 'boxcox', nameKey: 'tfBoxCox', descKey: 'tfBoxCoxDesc',
    params: [{ key: 'lambda', labelKey: 'paramLambda', val: 0, min: -5, max: 5, step: 0.1 }],
  },
  {
    id: 'yeojohnson', nameKey: 'tfYeoJohnson', descKey: 'tfYeoJohnsonDesc',
    params: [{ key: 'lambda', labelKey: 'paramLambda', val: 1, min: -5, max: 5, step: 0.1 }],
  },
  {
    id: 'johnson_su', nameKey: 'tfJohnsonSU', descKey: 'tfJohnsonSUDesc',
    params: [
      { key: 'gamma', labelKey: 'paramGamma', val: 0, min: -5, max: 5, step: 0.1 },
      { key: 'delta', labelKey: 'paramDelta', val: 1, min: 0.1, max: 10, step: 0.1 },
      { key: 'xi', labelKey: 'paramXi', val: 0, min: -100, max: 100, step: 0.5 },
      { key: 'lambdaJ', labelKey: 'paramLambdaJ', val: 1, min: 0.1, max: 100, step: 0.5 },
    ],
  },
  {
    id: 'johnson_sb', nameKey: 'tfJohnsonSB', descKey: 'tfJohnsonSBDesc',
    params: [
      { key: 'gamma', labelKey: 'paramGamma', val: 0, min: -5, max: 5, step: 0.1 },
      { key: 'delta', labelKey: 'paramDelta', val: 1, min: 0.1, max: 10, step: 0.1 },
      { key: 'xi', labelKey: 'paramXi', val: 0, min: -100, max: 100, step: 0.5 },
      { key: 'lambdaJ', labelKey: 'paramLambdaJ', val: 1, min: 0.1, max: 100, step: 0.5 },
    ],
  },
  { id: 'log', nameKey: 'tfLog', descKey: 'tfLogDesc', params: [] },
  { id: 'log10', nameKey: 'tfLog10', descKey: 'tfLog10Desc', params: [] },
  { id: 'sqrt', nameKey: 'tfSqrt', descKey: 'tfSqrtDesc', params: [] },
  { id: 'inverse', nameKey: 'tfInverse', descKey: 'tfInverseDesc', params: [] },
  { id: 'square', nameKey: 'tfSquare', descKey: 'tfSquareDesc', params: [] },
];

// ═══════════════════════════════════════════════════════════════
// Transform functions
// ═══════════════════════════════════════════════════════════════

function getParam(container, key) {
  const el = container.querySelector(`[data-param-key="${key}"]`);
  return el ? parseFloat(el.value) : 0;
}

/**
 * @param {number[]} data
 * @param {string} tfId
 * @param {function} paramFn — (key) => number
 * @returns {number[]}
 */
function applyTransform(data, tfId, paramFn) {
  const lam = paramFn('lambda');
  switch (tfId) {
    case 'boxcox':
      if (data.some(x => x <= 0)) throw new Error('errBoxCoxPositive');
      return data.map(x => Math.abs(lam) < 1e-8 ? Math.log(x) : (Math.pow(x, lam) - 1) / lam);
    case 'yeojohnson':
      return data.map(x => {
        if (x >= 0) return Math.abs(lam) < 1e-8 ? Math.log(x + 1) : (Math.pow(x + 1, lam) - 1) / lam;
        return Math.abs(lam - 2) < 1e-8 ? -Math.log(-x + 1) : -(Math.pow(-x + 1, 2 - lam) - 1) / (2 - lam);
      });
    case 'johnson_su': {
      const g = paramFn('gamma'), d = paramFn('delta'), xi = paramFn('xi'), la = paramFn('lambdaJ');
      return data.map(x => g + d * Math.asinh((x - xi) / la));
    }
    case 'johnson_sb': {
      const g = paramFn('gamma'), d = paramFn('delta'), xi = paramFn('xi'), la = paramFn('lambdaJ');
      return data.map(x => {
        const z = (x - xi) / la;
        if (z <= 0 || z >= 1) throw new Error('errJohnsonSBRange');
        return g + d * Math.log(z / (1 - z));
      });
    }
    case 'log':
      if (data.some(x => x <= 0)) throw new Error('errLogPositive');
      return data.map(x => Math.log(x));
    case 'log10':
      if (data.some(x => x <= 0)) throw new Error('errLog10Positive');
      return data.map(x => Math.log10(x));
    case 'sqrt':
      if (data.some(x => x < 0)) throw new Error('errSqrtNonNeg');
      return data.map(x => Math.sqrt(x));
    case 'inverse':
      if (data.some(x => x === 0)) throw new Error('errInverseZero');
      return data.map(x => 1 / x);
    case 'square':
      return data.map(x => x * x);
    default:
      throw new Error('Unknown transform');
  }
}

/** Optimize Box-Cox λ via grid search on Anderson-Darling statistic */
function optimizeBoxCox(data) {
  if (data.some(x => x <= 0)) return 1;
  let bestLam = 1, bestAD = Infinity;
  for (let l = -3; l <= 3; l += 0.05) {
    const t = data.map(x => Math.abs(l) < 1e-8 ? Math.log(x) : (Math.pow(x, l) - 1) / l);
    try {
      const ad = andersonDarling(t);
      if (ad.statisticAdj < bestAD) { bestAD = ad.statisticAdj; bestLam = l; }
    } catch { /* skip invalid */ }
  }
  return Math.round(bestLam * 100) / 100;
}

/** Optimize Yeo-Johnson λ via grid search on Anderson-Darling statistic */
function optimizeYeoJohnson(data) {
  let bestLam = 1, bestAD = Infinity;
  for (let l = -3; l <= 3; l += 0.05) {
    const t = data.map(x => {
      if (x >= 0) return Math.abs(l) < 1e-8 ? Math.log(x + 1) : (Math.pow(x + 1, l) - 1) / l;
      return Math.abs(l - 2) < 1e-8 ? -Math.log(-x + 1) : -(Math.pow(-x + 1, 2 - l) - 1) / (2 - l);
    });
    try {
      const ad = andersonDarling(t);
      if (ad.statisticAdj < bestAD) { bestAD = ad.statisticAdj; bestLam = l; }
    } catch { /* skip invalid */ }
  }
  return Math.round(bestLam * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════
// Module definition
// ═══════════════════════════════════════════════════════════════

export default {
  id: 'data-transformation',
  phase: 'data',
  icon: 'refresh-cw',
  i18nKey: 'modules.data-transformation',
  version: '1.0.0',

  // Internal state
  _container: null,
  _context: null,
  _currentTF: 'boxcox',
  _rawData: [],
  _transData: [],
  _charts: {},
  _columnPicker: null,
  _targetPicker: null,
  _autoRunTimer: 0,
  _lastColumnKey: null,
  /** Worksheet provisioned by loadExample (cleaned up on next load). */
  _exampleWorksheetId: null,

  async init(container, context) {
    this._container = container;
    this._context = context;

    if (!document.getElementById('data-transformation-css')) {
      const link = document.createElement('link');
      link.id = 'data-transformation-css';
      link.rel = 'stylesheet';
      link.href = 'js/modules/data-transformation/data-transformation.css';
      document.head.appendChild(link);
    }

    this._render();
  },

  async destroy() {
    clearTimeout(this._autoRunTimer);
    this._destroyCharts();
    this._columnPicker?.destroy();
    this._columnPicker = null;
    this._targetPicker?.destroy();
    this._targetPicker = null;
    this._container = null;
    this._context = null;
    this._rawData = [];
    this._transData = [];
  },

  onLanguageChange() { this._render(); },
  onThemeChange() { /* chartManager handles themes */ },

  getState() {
    return {
      currentTF: this._currentTF,
      columnRef: this._columnPicker?.value || null,
    };
  },

  setState(data) {
    if (data) {
      this._currentTF = data.currentTF || 'boxcox';
    }
  },

  /**
   * Load a catalog example. data-transformation's persisted state only carries
   * `currentTF`; the column ref lives in the picker. We provision the worksheet,
   * apply currentTF, re-render to create a fresh picker, then assign the
   * rewritten columnRef directly to the picker and trigger the transform.
   *
   * @param {{ meta: object, data: object }} payload
   */
  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = (k) => this._context.i18n.t(k);

    const hasContent = !!(this._columnPicker?.value || this._rawData.length);
    if (hasContent && this._context?.confirmPopout) {
      const ok = await this._context.confirmPopout(t('moduleHelp.confirmOverwrite'), { danger: true });
      if (!ok) return;
    }

    const data = { ...payload.data };

    let rewrittenRef = data.columnRef || null;
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
        if (rewrittenRef?.instanceId === '__source__') {
          rewrittenRef = { ...rewrittenRef, instanceId: ref.instanceId };
        }
      }
    }

    this._currentTF = data.currentTF || 'boxcox';
    this._render();
    if (rewrittenRef && this._columnPicker) {
      this._columnPicker.value = rewrittenRef;
      this._autoRun();
    }

    const lang = this._context.i18n.getLanguage();
    const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
    this._context.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
  },

  help: () => import('./data-transformation-help.js'),

  // ─── Helpers ──────────────────────────────────────────────────

  _t(key) { return this._context.i18n.t(`modules.data-transformation.${key}`); },

  _clearOutput() {
    this._destroyCharts();
    this._rawData = [];
    this._transData = [];
    const output = this._container?.querySelector('#dt-output');
    if (output) output.innerHTML = '';
  },

  _destroyCharts() {
    Object.values(this._charts).forEach(c => {
      try { c.destroy(); } catch { /* ignore */ }
    });
    this._charts = {};
  },

  // ─── Rendering ──────────────────────────────────────────────

  _render() {
    this._destroyCharts();
    this._columnPicker?.destroy();
    this._columnPicker = null;
    this._targetPicker?.destroy();
    this._targetPicker = null;

    this._container.innerHTML = `<div class="module-data-transformation dmike-split">
      <div class="dmike-split__input">
        <div class="dmike-split__section-title">${this._t('selectColumn')}</div>
        <div id="dt-col-picker"></div>

        <div class="dmike-split__section-title">${this._t('selectTransform')}</div>
        <div class="dt-tf-grid" id="dt-tf-grid"></div>

        <div id="dt-param-panel" style="display:none">
          <div class="dmike-split__section-title">${this._t('parameters')}</div>
          <div class="dt-param-group" id="dt-param-group"></div>
        </div>

      </div>
      <div class="dmike-split__output" id="dt-output"></div>
    </div>`;

    // Column picker
    const pickerWrap = this._container.querySelector('#dt-col-picker');
    this._columnPicker = new ColumnPicker(pickerWrap, this._context, {
      mode: 'single',
      types: ['numeric'],
      minCount: 3,
      onChange: () => this._autoRun(),
    });

    // Build transform grid
    this._buildTFGrid();
  },

  _buildTFGrid() {
    const grid = this._container.querySelector('#dt-tf-grid');
    for (const tf of TRANSFORMS) {
      const el = document.createElement('div');
      el.className = 'dt-tf-opt' + (tf.id === this._currentTF ? ' dt-tf-opt--active' : '');
      el.dataset.id = tf.id;
      el.innerHTML = `<span class="dt-tf-opt__dot"></span>
        <div>
          <div class="dt-tf-opt__name">${this._t(tf.nameKey)}</div>
          <div class="dt-tf-opt__desc">${this._t(tf.descKey)}</div>
        </div>`;
      el.addEventListener('click', () => this._selectTF(tf.id));
      grid.appendChild(el);
    }
    this._showParams();
  },

  _selectTF(id) {
    this._currentTF = id;
    this._container.querySelectorAll('.dt-tf-opt').forEach(el =>
      el.classList.toggle('dt-tf-opt--active', el.dataset.id === id));
    this._showParams();
    // Re-optimize λ when switching transform type
    if (this._rawData.length >= 3 && (id === 'boxcox' || id === 'yeojohnson')) {
      this._optimizeLambda();
    }
    this._autoRun();
  },

  _showParams() {
    const tf = TRANSFORMS.find(t => t.id === this._currentTF);
    const panel = this._container.querySelector('#dt-param-panel');
    const group = this._container.querySelector('#dt-param-group');
    if (!tf.params.length) { panel.style.display = 'none'; return; }
    panel.style.display = '';
    group.innerHTML = tf.params.map(p => `
      <div class="dt-param">
        <label class="dt-param__label">${this._t(p.labelKey)}</label>
        <input class="field field--num field--inline dt-param__number" type="number" data-param-key="${p.key}"
               value="${p.val}" min="${p.min}" max="${p.max}">
        <input class="dt-param__range" type="range"
               min="${p.min}" max="${p.max}" step="${p.step}" value="${p.val}"
               data-range-for="${p.key}">
      </div>`).join('');

    // Sync slider ↔ number input, trigger live update
    group.querySelectorAll('.dt-param__number').forEach(inp => {
      const slider = group.querySelector(`[data-range-for="${inp.dataset.paramKey}"]`);
      if (!slider) return;
      inp.addEventListener('input', () => { slider.value = inp.value; this._autoRun(); });
      slider.addEventListener('input', () => { inp.value = slider.value; this._autoRun(); });
    });
  },

  // ─── Transform execution ──────────────────────────────────

  /** Debounced live computation — called on every input change */
  _autoRun() {
    clearTimeout(this._autoRunTimer);
    this._autoRunTimer = setTimeout(() => this._runTransform(), 80);
  },

  _runTransform() {
    const ref = this._columnPicker?.value;
    if (!ref) { this._clearOutput(); return; }

    const colKey = refToKey(ref);
    const columnChanged = colKey !== this._lastColumnKey;
    this._lastColumnKey = colKey;

    const values = getColumnValues(this._context.stateManager, ref);
    this._rawData = values
      .map(v => (typeof v === 'number') ? v : parseFloat(v))
      .filter(v => isFinite(v));

    if (this._rawData.length < 3) { this._clearOutput(); return; }

    // Auto-fallback: switch Box-Cox → Yeo-Johnson if data has non-positive values
    if (this._currentTF === 'boxcox' && this._rawData.some(x => x <= 0)) {
      this._selectTFSilent('yeojohnson');
      this._context.notify?.(this._t('warnBoxCoxFallback'), 'warning');
      // Force re-optimize since we just switched transform
      this._optimizeLambda();
    } else if (columnChanged && (this._currentTF === 'boxcox' || this._currentTF === 'yeojohnson')) {
      // Auto-optimize λ only when the column changes (not on manual slider adjustments)
      this._optimizeLambda();
    }

    const paramFn = (key) => getParam(this._container, key);

    try {
      this._transData = applyTransform(this._rawData, this._currentTF, paramFn);
    } catch (err) {
      this._showError(err.message || 'error');
      return;
    }

    this._renderResults();
  },

  /** Auto-optimize λ for the current transform and set it in the UI. */
  _optimizeLambda() {
    const optLam = this._currentTF === 'boxcox'
      ? optimizeBoxCox(this._rawData)
      : optimizeYeoJohnson(this._rawData);
    const el = this._container.querySelector('[data-param-key="lambda"]');
    if (el) {
      el.value = optLam;
      const slider = this._container.querySelector('[data-range-for="lambda"]');
      if (slider) slider.value = optLam;
    }
  },

  /** Switch transform type without triggering another _autoRun cycle. */
  _selectTFSilent(id) {
    this._currentTF = id;
    this._container.querySelectorAll('.dt-tf-opt').forEach(el =>
      el.classList.toggle('dt-tf-opt--active', el.dataset.id === id));
    this._showParams();
  },

  _showError(msgKey) {
    this._destroyCharts();
    this._rawData = [];
    this._transData = [];
    const output = this._container?.querySelector('#dt-output');
    if (!output) return;
    // Try to translate the error key; fall back to raw message
    const msg = this._context.i18n.t(`modules.data-transformation.${msgKey}`);
    const displayMsg = (msg !== `modules.data-transformation.${msgKey}`) ? msg : msgKey;
    output.innerHTML = `<div class="dt-error-msg">${displayMsg}</div>`;
  },

  // ─── Results rendering ────────────────────────────────────

  _renderResults() {
    this._destroyCharts();
    const output = this._container.querySelector('#dt-output');
    const t = (k) => this._t(k);
    const tfName = this._t(TRANSFORMS.find(tf => tf.id === this._currentTF).nameKey);

    output.innerHTML = `
      <div class="dmike-split__output-section">${t('charts')}</div>
      <div class="dt-results-grid">
        <div class="dt-chart-card">
          <div class="dt-chart-card__title">${t('histOriginal')}</div>
          <div id="dt-hist-orig" style="height:200px"></div>
        </div>
        <div class="dt-chart-card">
          <div class="dt-chart-card__title">${t('histTransformed')}</div>
          <div id="dt-hist-trans" style="height:200px"></div>
        </div>
        <div class="dt-chart-card">
          <div class="dt-chart-card__title">${t('ppOriginal')}</div>
          <div id="dt-pp-orig" style="height:200px"></div>
        </div>
        <div class="dt-chart-card">
          <div class="dt-chart-card__title">${t('ppTransformed')}</div>
          <div id="dt-pp-trans" style="height:200px"></div>
        </div>
      </div>

      <div class="dmike-split__output-section">${t('descriptiveStats')}</div>
      <table class="dmike-table dt-stats-table">
        <thead><tr><th>${t('statistic')}</th><th>${t('original')}</th><th>${t('transformed')}</th></tr></thead>
        <tbody id="dt-stats-body"></tbody>
      </table>

      <div class="dmike-split__output-section">${t('normalityTest')}</div>
      <div class="dt-normality" id="dt-normality"></div>

      <div class="dmike-split__output-section">${t('exportData')}</div>
      <div class="dt-export-box" id="dt-export-box"></div>
      <div class="dt-export-actions">
        <button class="btn btn--secondary btn--sm" data-action="copy">${t('copy')}</button>
        <button class="btn btn--secondary btn--sm" data-action="csv">${t('downloadCSV')}</button>
        <span id="dt-target-wrap"></span>
        <button class="btn btn--secondary btn--sm" data-action="to-worksheet">${t('toWorksheet')}</button>
      </div>`;

    // Bind export actions
    output.querySelector('[data-action="copy"]').addEventListener('click', () => this._copyExport());
    output.querySelector('[data-action="csv"]').addEventListener('click', () => this._downloadCSV());
    output.querySelector('[data-action="to-worksheet"]').addEventListener('click', () => this._toWorksheet());

    // Target column picker (with new worksheet / new column options)
    this._targetPicker?.destroy();
    this._targetPicker = new ColumnPicker(output.querySelector('#dt-target-wrap'), this._context, {
      mode: 'single',
      allowCreateWorksheet: true,
      onChange: () => {},
    });

    this._drawCharts();
    this._renderStats();
    this._renderNormality();
    this._renderExport();
  },

  async _drawCharts() {
    const cm = this._context.chartManager;
    if (!cm) return;

    try {
      // Histograms
      this._charts.histOrig = await cm.create(this._container.querySelector('#dt-hist-orig'), 'histogram', {
        data: this._rawData,
      });

      this._charts.histTrans = await cm.create(this._container.querySelector('#dt-hist-trans'), 'histogram', {
        data: this._transData,
      });

      // Probability plots
      this._charts.ppOrig = await cm.create(this._container.querySelector('#dt-pp-orig'), 'probability-plot', {
        data: this._rawData,
      });

      this._charts.ppTrans = await cm.create(this._container.querySelector('#dt-pp-trans'), 'probability-plot', {
        data: this._transData,
      });
    } catch (err) {
      console.warn('[DataTransformation] Chart creation failed:', err);
    }
  },

  _renderStats() {
    const fmt = v => isFinite(v) ? v.toFixed(4) : '—';
    const raw = this._rawData;
    const trans = this._transData;
    const t = (k) => this._t(k);

    const rows = [
      ['n', raw.length, trans.length],
      [t('statMean'), fmt(mean(raw)), fmt(mean(trans))],
      [t('statStd'), fmt(std(raw)), fmt(std(trans))],
      [t('statMedian'), fmt(median(raw)), fmt(median(trans))],
      [t('statSkewness'), fmt(skewness(raw)), fmt(skewness(trans))],
      [t('statKurtosis'), fmt(kurtosis(raw)), fmt(kurtosis(trans))],
      ['Min', fmt(Math.min(...raw)), fmt(Math.min(...trans))],
      ['Max', fmt(Math.max(...raw)), fmt(Math.max(...trans))],
    ];

    this._container.querySelector('#dt-stats-body').innerHTML = rows.map(r =>
      `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('');
  },

  _renderNormality() {
    const alpha = 0.05;

    let adOrig, adTrans;
    try { adOrig = andersonDarling(this._rawData); } catch { adOrig = null; }
    try { adTrans = andersonDarling(this._transData); } catch { adTrans = null; }

    const el = this._container.querySelector('#dt-normality');
    const t = (k) => this._t(k);

    const renderRow = (label, ad, colorClass) => {
      if (!ad) return `<div class="dt-normality__row"><strong class="${colorClass}">${label}:</strong> —</div>`;
      const pass = ad.pValue >= alpha;
      return `<div class="dt-normality__row">
        <strong class="${colorClass}">${label}:</strong>
        A² = ${ad.statisticAdj.toFixed(4)}, p \u2248 ${ad.pValue.toFixed(4)}
        <span class="dt-badge ${pass ? 'dt-badge--pass' : 'dt-badge--fail'}">
          ${pass ? '\u2713 ' + t('normal') : '\u2717 ' + t('notNormal')}
        </span>
      </div>`;
    };

    el.innerHTML = `
      ${renderRow(t('original'), adOrig, '')}
      ${renderRow(t('transformed'), adTrans, '')}
      <div class="dt-normality__alpha">\u03b1 = ${alpha} | H\u2080: ${t('h0Normal')}</div>
    `;
  },

  _renderExport() {
    const box = this._container.querySelector('#dt-export-box');
    box.textContent = this._transData.map(v => v.toFixed(6)).join('\n');
  },

  _copyExport() {
    const text = this._container.querySelector('#dt-export-box').textContent;
    navigator.clipboard.writeText(text).then(() => {
      this._context.notify?.(this._t('copied'), 'success');
    });
  },

  _downloadCSV() {
    if (!this._transData.length) return;
    const t = (k) => this._t(k);
    let csv = `${t('original')};${t('transformed')}\n`;
    for (let i = 0; i < this._rawData.length; i++) {
      csv += `${this._rawData[i]};${this._transData[i]}\n`;
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'transformation.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  },

  _colName() {
    const ref = this._columnPicker?.value;
    const srcName = ref ? getColumnName(this._context.stateManager, ref) : '';
    const tfDef = TRANSFORMS.find(tf => tf.id === this._currentTF);
    const tfName = this._t(tfDef.nameKey);
    return srcName ? `${srcName} (${tfName})` : tfName;
  },

  _toWorksheet() {
    if (!this._transData.length) return;
    const pickerValue = this._targetPicker?.value;
    if (!pickerValue) {
      this._context.notify?.(this._t('selectTarget'), 'warning');
      return;
    }

    const name = this._colName();
    const values = [...this._transData];

    if (pickerValue === ColumnPicker.NEW_WORKSHEET) {
      this._createWorksheetAndSend(name, values);
      return;
    }

    this._context.eventBus.emit('worksheet:appendColumn', {
      instanceId: pickerValue.instanceId,
      sheetId: pickerValue.sheetId,
      colId: pickerValue.columnId,
      name, values,
    });
    this._context.notify?.(this._t('sentToWorksheet'), 'success');
  },

  _createWorksheetAndSend(name, values) {
    const sm = this._context.stateManager;
    const eb = this._context.eventBus;
    const phase = this._findOwnPhase();
    const wsId = `worksheet_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const existing = sm.get(`phases.${phase}`) ?? [];
    sm.set(`phases.${phase}`, [
      ...existing,
      { instanceId: wsId, moduleId: 'worksheet', order: existing.length, state: {} },
    ]);

    // Pre-populate with a unique sheet name so it doesn't collide with existing worksheets
    const baseName = this._context.i18n.t('modules.worksheet.defaultSheetName');
    const sheetName = uniqueSheetName(sm, baseName);
    sm.setModuleState(wsId, buildInitialWorksheetState(sheetName));

    const onActivated = ({ instanceId }) => {
      if (instanceId !== wsId) return;
      eb.off('module:activated', onActivated);

      // Write into the first default column (C1) via __first__ sentinel
      eb.emit('worksheet:appendColumn', {
        instanceId: wsId,
        sheetId: 'sheet_1',
        colId: '__first__',
        name, values,
      });
      this._context.notify?.(this._t('sentToWorksheet'), 'success');
    };
    eb.on('module:activated', onActivated);
    eb.emit('module:added', { moduleId: 'worksheet', phase, instanceId: wsId });
  },

  _findOwnPhase() {
    const sm = this._context.stateManager;
    const id = this._context.instanceId;
    for (const p of Object.keys(sm.get('phases') || {})) {
      const items = sm.get(`phases.${p}`) ?? [];
      if (items.some(i => i.instanceId === id)) return p;
    }
    return 'data';
  },
};
