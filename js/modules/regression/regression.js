/**
 * D.Mike — Regression Analysis Module (regression.js)
 * Improve phase: fits regression models and provides prediction.
 *
 * Supports:
 *   - Polynomial (degree 1–3) with all X in one combined model + interactions
 *   - Exponential, Logarithmic, Power (single-X per predictor)
 * Data comes exclusively from worksheet column pickers.
 * Uses the chart framework for all visualizations.
 */

import {
  runMultiRegression, runRegression, predictMulti, predictValue, computeVIF, lackOfFitTest,
  fitFromSpec, generatePolynomialTerms, compileModelSpec,
} from '../../engines/regression-engine.js';
import { tInv } from '../../engines/math-utils.js';
import { ColumnPicker, getColumnValues, getColumnName, discoverColumns, refToKey, keyToRef, isPickerFocused } from '../../ui/column-picker.js';
import { esc } from '../../core/html-utils.js';
import { saveModel, buildDataSnapshot, computeDataHash } from '../../core/models-store.js';
import { chartsMethods } from './regression-charts.js';

/** @param {number} v @param {number} d */
function fmt(v, d = 4) {
    if (v == null || !isFinite(v)) return '\u2013';
    const abs = Math.abs(v);
    if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) return v.toExponential(d);
    return v.toFixed(d);
}
function fmtP(p) { return p < 0.0001 ? '< 0.0001' : p.toFixed(4); }

/** Algorithm Lab IDs. */
const ALGO_ID_VIF = 'vif';
const ALGO_ID_COEF = 'regression-coefficients';
const ALGO_ID_ANOVA = 'regression-anova';
/** Small code icon SVG for Algorithm Lab links. */
const ALGO_LINK_SVG = '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';
/** Helper: build algo-link button HTML. */
function algoBtn(algoId) { return `<button class="reg__algo-link" data-algo-id="${algoId}" title="Algorithm Lab">${ALGO_LINK_SVG}</button>`; }

/**
 * Count polynomial terms for k predictors at given degree.
 * Mirrors buildPolyDesignMatrix in regression-engine.js.
 */
function polyTermCount(k, degree) {
  let p = 1 + k;
  if (degree >= 2) p += k + k * (k - 1) / 2;
  if (degree >= 3) p += k + k * (k - 1) + k * (k - 1) * (k - 2) / 6;
  return p;
}

const mod = {
  id: 'regression',
  phase: 'improve',
  allowedPhases: ['measure', 'analyze', 'improve', 'control'],
  icon: 'trending-up',
  i18nKey: 'modules.regression',
  version: '2.0.0',

  _container: null,
  _context: null,
  /** X column refs (multi-select picker). */
  _colRefs: [],
  /** Y column key (from separate dropdown, not in picker). */
  _yKey: null,
  /** @type {'polynomial'|'exponential'|'logarithmic'|'power'} */
  _regType: 'polynomial',
  /** @type {1|2|3} */
  _polyDegree: 1,
  _confLevel: null,
  _alpha: null,
  _showCI: true,
  /** Single combined result (polynomial) or per-X results (exp/log/power). */
  _result: null,
  _perXResults: null,
  _activeXKey: null,
  /** @type {string} */
  _activeTab: 'scatter',
  _excludedTerms: [],
  _coefSortByP: false,
  _charts: [],
  _picker: null,
  _eventUnsubs: [],
  /** Tracks the experiment-import preset that produced the current X/Y selection. */
  _activeImportSource: null,
  /** Set after the user clicks "save as model" — subsequent clicks update in place. */
  _savedModelId: null,
  _savedModelName: null,

  help: () => import('./regression-help.js'),

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    if (!document.getElementById('regression-css')) {
      const link = document.createElement('link');
      link.id = 'regression-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/regression/regression.css';
      document.head.appendChild(link);
    }

    const onAct = ({ instanceId }) => {
      if (instanceId === context.instanceId && this._picker) {
        this._picker.refresh();
        this._updateYDropdown();
      }
    };
    context.eventBus.on('module:activated', onAct);
    this._eventUnsubs.push(() => context.eventBus.off('module:activated', onAct));

    const onDataChange = () => {
      this._updateYDropdown();
      this._autoRun();
    };
    context.eventBus.on('state:saved', onDataChange);
    context.eventBus.on('worksheet:dataChanged', onDataChange);
    this._eventUnsubs.push(
      () => context.eventBus.off('state:saved', onDataChange),
      () => context.eventBus.off('worksheet:dataChanged', onDataChange),
    );

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) {
      this._colRefs = saved.colRefs || [];
      this._yKey = saved.yKey || null;
      this._regType = saved.regType || 'polynomial';
      this._polyDegree = saved.polyDegree ?? 1;
      this._confLevel = saved.confLevel ?? null;
      this._alpha = saved.alpha ?? null;
      this._showCI = saved.showCI ?? true;
      this._result = saved.result || null;
      this._perXResults = saved.perXResults || null;
      this._activeXKey = saved.activeXKey || null;
      this._activeTab = saved.activeTab || 'scatter';
      this._excludedTerms = saved.excludedTerms || [];
      this._coefSortByP = saved.coefSortByP ?? false;
      this._activeImportSource = saved.activeImportSource || null;
      this._savedModelId = saved.savedModelId || null;
      this._savedModelName = saved.savedModelName || null;
    }

    const globalConf = (context.stateManager.get('settings.confidenceLevel') ?? 95) / 100;
    if (this._confLevel == null) this._confLevel = globalConf;
    if (this._alpha == null) this._alpha = +(1 - globalConf).toFixed(4);

    this._render();
    if (this._result || (this._perXResults && this._activeXKey)) {
      this._renderResults();
    }
  },

  async destroy() {
    for (const unsub of this._eventUnsubs) unsub();
    this._eventUnsubs = [];
    this._destroyCharts();
    if (this._picker) { this._picker.destroy(); this._picker = null; }
    this._container.innerHTML = '';
  },

  onLanguageChange() {
    this._destroyCharts();
    this._render();
    if (this._result || (this._perXResults && this._activeXKey)) this._renderResults();
  },

  onThemeChange() {
    this._destroyCharts();
    if (this._result || (this._perXResults && this._activeXKey)) this._renderActiveChart();
  },

  getState() {
    return {
      colRefs: this._colRefs,
      yKey: this._yKey,
      regType: this._regType,
      polyDegree: this._polyDegree,
      confLevel: this._confLevel,
      alpha: this._alpha,
      showCI: this._showCI,
      result: this._result,
      perXResults: this._perXResults,
      activeXKey: this._activeXKey,
      activeTab: this._activeTab,
      excludedTerms: this._excludedTerms,
      coefSortByP: this._coefSortByP,
      activeImportSource: this._activeImportSource,
      savedModelId: this._savedModelId,
      savedModelName: this._savedModelName,
    };
  },

  setState(data) {
    if (!data) return;
    this._colRefs = data.colRefs || [];
    this._yKey = data.yKey || null;
    this._regType = data.regType || 'polynomial';
    this._polyDegree = data.polyDegree ?? 1;
    const _gc = (this._context?.stateManager.get('settings.confidenceLevel') ?? 95) / 100;
    this._confLevel = data.confLevel ?? _gc;
    this._alpha = data.alpha ?? +(1 - _gc).toFixed(4);
    this._showCI = data.showCI ?? true;
    this._result = data.result || null;
    this._perXResults = data.perXResults || null;
    this._activeXKey = data.activeXKey || null;
    this._activeTab = data.activeTab || 'scatter';
    this._excludedTerms = data.excludedTerms || [];
    this._coefSortByP = data.coefSortByP ?? false;
    this._activeImportSource = data.activeImportSource || null;
    this._savedModelId = data.savedModelId || null;
    this._savedModelName = data.savedModelName || null;
    if (this._container) {
      this._render();
      if (this._result || (this._perXResults && this._activeXKey)) this._renderResults();
    }
  },

  // ─── Save helper ───────────────────────────────────────────

  _save() {
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
  },

  // ─── Column helpers ────────────────────────────────────────

  _toNumeric(val, colType) {
    if (val == null) return null;
    if (colType === 'date') {
      if (typeof val !== 'string') return null;
      const t = Date.parse(val);
      return Number.isFinite(t) ? t : null;
    }
    if (colType === 'time') {
      if (typeof val !== 'string') return null;
      const m = val.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (!m) return null;
      return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + (m[3] ? parseInt(m[3]) : 0);
    }
    return (typeof val === 'number' && !isNaN(val)) ? val : null;
  },

  _resolveColumn(ref) {
    if (!ref) return null;
    const ws = this._context.stateManager.getModuleState(ref.instanceId);
    if (!ws?.sheets) return null;
    const sheet = ws.sheets.find(s => s.id === ref.sheetId);
    if (!sheet?.state?.columns) return null;
    return sheet.state.columns.find(c => c.id === ref.columnId) || null;
  },

  _getRawNumericValues(ref) {
    const col = this._resolveColumn(ref);
    if (!col) return [];
    // Categorical factor columns (written by the DoE planner) carry a
    // label → coded-value map on column.meta. Translate text values through
    // it so the regression sees a numeric design column.
    const coding = col.meta?.categoricalCoding;
    if (coding) {
      return (col.values || []).map(v => {
        if (v == null) return null;
        const c = coding[String(v)];
        return Number.isFinite(c) ? c : null;
      });
    }
    return (col.values || []).map(v => this._toNumeric(v, col.type));
  },

  _getColumnDisplayName(ref) {
    if (!ref) return '?';
    const col = this._resolveColumn(ref);
    return col ? (col.name || col.shortName || '?') : '?';
  },

  /**
   * Get paired numeric values for two column refs, aligned by row index.
   */
  _getPairedValues(refA, refB) {
    if (!refA || !refB) return null;
    const rawA = this._getRawNumericValues(refA);
    const rawB = this._getRawNumericValues(refB);
    const len = Math.min(rawA.length, rawB.length);
    const x = [], y = [];
    for (let i = 0; i < len; i++) {
      if (rawA[i] !== null && rawB[i] !== null) {
        x.push(rawA[i]);
        y.push(rawB[i]);
      }
    }
    return x.length > 0 ? { x, y } : null;
  },

  /** @returns {boolean} */
  _isPolynomial() { return this._regType === 'polynomial'; },

  // ─── DoE Import ────────────────────────────────────────────
  // Builds a flat list of "import this experiment as model X" presets, one per
  // (experiment × response × variant) combination. Variants are: raw response,
  // replicate-mean (if available), ln(variance) (if available).

  /** @returns {Array<{key: string, label: string, factorRefs: object[], yRef: object, polyDegree: number, experimentId: string, sourceColumn: string, transform: string}>} */
  _listExperimentImports() {
    const sm = this._context.stateManager;
    const experiments = sm.get('experiments') ?? {};
    const out = [];
    for (const [expId, exp] of Object.entries(experiments)) {
      const wsRef = exp?.runMatrix?.worksheetRef;
      const tags  = exp?.runMatrix?.columnTags;
      if (!wsRef || !tags) continue;
      const factorRefs = tags.factors.map(cid => ({ instanceId: wsRef.instanceId, sheetId: wsRef.sheetId, columnId: cid }));
      // Polynomial degree from plannedTerms: quadratic → 2, otherwise → 1
      const polyDegree = exp.plannedTerms?.quadratic ? 2 : 1;

      const expLabel = exp.name || `DoE ${expId.slice(0, 6)}`;
      (exp.responseColumns || []).forEach((resp, i) => {
        const yRefRaw = { instanceId: wsRef.instanceId, sheetId: wsRef.sheetId, columnId: resp.columnId };
        out.push({
          key: `${expId}|raw|${i}`,
          label: `${expLabel} — ${resp.name}`,
          factorRefs, yRef: yRefRaw, polyDegree,
          experimentId: expId, sourceColumn: resp.columnId, transform: 'identity',
        });
        if (resp.meanColumnId) {
          out.push({
            key: `${expId}|mean|${i}`,
            label: `${expLabel} — ${resp.name} (Mean)`,
            factorRefs,
            yRef: { instanceId: wsRef.instanceId, sheetId: wsRef.sheetId, columnId: resp.meanColumnId },
            polyDegree,
            experimentId: expId, sourceColumn: resp.meanColumnId, transform: 'mean',
          });
        }
        if (resp.lnVarColumnId) {
          out.push({
            key: `${expId}|lnvar|${i}`,
            label: `${expLabel} — ${resp.name} (lnVar)`,
            factorRefs,
            yRef: { instanceId: wsRef.instanceId, sheetId: wsRef.sheetId, columnId: resp.lnVarColumnId },
            polyDegree,
            experimentId: expId, sourceColumn: resp.lnVarColumnId, transform: 'lnvar',
          });
        }
      });
    }
    return out;
  },

  /** Apply a preset from _listExperimentImports() and re-run. */
  _applyExperimentImport(key) {
    const opt = this._listExperimentImports().find(o => o.key === key);
    if (!opt) return;
    this._colRefs = opt.factorRefs.map(r => ({ ...r }));
    this._yKey    = refToKey(opt.yRef);
    this._regType = 'polynomial';
    this._polyDegree = opt.polyDegree;
    this._excludedTerms = [];
    this._activeImportSource = {
      experimentId: opt.experimentId,
      sourceColumn: opt.sourceColumn,
      transform: opt.transform,
    };
    this._save();
    this._render();
    this._autoRun();
  },

  // ─── Render ────────────────────────────────────────────────

  _render() {
    if (this._picker) { this._picker.destroy(); this._picker = null; }

    const t = (k, v) => this._context.i18n.t(`modules.regression.${k}`, v);
    const isPoly = this._isPolynomial();
    const imports = this._listExperimentImports();

    const importHtml = imports.length === 0 ? '' : `
          <div class="field-group">
            <label>${t('importFromExperiment')}</label>
            <select class="field" data-ref="doe-import">
              <option value="">${t('importPlaceholder')}</option>
              ${imports.map(o => `<option value="${esc(o.key)}">${esc(o.label)}</option>`).join('')}
            </select>
          </div>
    `;

    this._container.innerHTML = `
      <div class="reg dmike-split">
        <div class="reg__input dmike-split__input">
          <div class="dmike-split__section-title">${t('sectionData')}</div>

          ${importHtml}

          <div class="field-group">
            <label>${t('selectColumns')}</label>
            <div data-ref="picker-cols"></div>
          </div>

          <div class="field-group">
            <label>${t('columnY')}</label>
            <select class="field" data-ref="y-select">
              <option value="">${t('selectYHint')}</option>
            </select>
          </div>

          <div class="reg__selected-info" data-ref="selected-info"></div>

          <div class="dmike-split__section-title">${t('sectionSettings')}</div>

          <div class="field-group">
            <label>${t('regType')}</label>
            <select class="field" data-ref="reg-type">
              <option value="polynomial"${this._regType === 'polynomial' ? ' selected' : ''}>${t('typePolynomial')}</option>
              <option value="exponential"${this._regType === 'exponential' ? ' selected' : ''}>${t('typeExponential')}</option>
              <option value="logarithmic"${this._regType === 'logarithmic' ? ' selected' : ''}>${t('typeLogarithmic')}</option>
              <option value="power"${this._regType === 'power' ? ' selected' : ''}>${t('typePower')}</option>
            </select>
          </div>

          <div class="field-group" data-ref="degree-field"${isPoly ? '' : ' style="display:none"'}>
            <label>${t('polyDegree')}</label>
            <select class="field" data-ref="poly-degree">
              <option value="1"${this._polyDegree === 1 ? ' selected' : ''}>${t('degree1')}</option>
              <option value="2"${this._polyDegree === 2 ? ' selected' : ''}>${t('degree2')}</option>
              <option value="3"${this._polyDegree === 3 ? ' selected' : ''}>${t('degree3')}</option>
            </select>
            <div class="reg__degree-hint" data-ref="degree-hint"></div>
          </div>

          <div class="reg__level-row">
            <div class="field-group">
              <label>${t('confLevel')} (%)</label>
              <input type="text" class="field field--num" data-ref="conf-level" inputmode="decimal"
                value="${+(this._confLevel * 100).toFixed(2)}" placeholder="95">
            </div>
            <div class="field-group">
              <label>${t('alphaRisk')} (%)</label>
              <input type="text" class="field field--num" data-ref="alpha-level" inputmode="decimal"
                value="${+(this._alpha * 100).toFixed(2)}" placeholder="5">
            </div>
          </div>

          <div class="reg__toggle-row">
            <label>${t('showCI')}</label>
            <button class="reg__toggle${this._showCI ? ' reg__toggle--active' : ''}" data-action="toggle-ci" type="button"></button>
          </div>

          <div class="reg__error" data-ref="error-box"></div>

          <div class="dmike-split__section-title reg__predict-title" data-ref="predict-title" style="display:none">${t('prediction')}</div>
          <div class="reg__predict" data-ref="predict-section" style="display:none">
            <div data-ref="predict-inputs"></div>
            <div class="reg__predict-result" data-ref="predict-result" style="display:none"></div>
          </div>
        </div>

        <div class="reg__output dmike-split__output">
          <div data-ref="results" style="display:none"></div>
        </div>
      </div>
    `;

    this._initPicker();
    this._updateYDropdown();
    this._updateSelectedInfo();
    this._updateDegreeOptions();
    this._bindEvents();
  },

  _initPicker() {
    const wrap = this._container.querySelector('[data-ref="picker-cols"]');

    this._picker = new ColumnPicker(wrap, this._context, {
      mode: 'multi',
      types: ['numeric', 'currency', 'percent', 'date', 'time'],
      minCount: 1,
      onChange: (refs) => {
        this._colRefs = refs;
        if (this._yKey && refs.some(r => refToKey(r) === this._yKey)) {
          this._yKey = null;
        }
        this._updateYDropdown(true);
        this._updateSelectedInfo();
        this._updateDegreeOptions();
        this._save();
        this._autoRun();
      },
    });
    if (this._colRefs.length > 0) this._picker.value = this._colRefs;
  },

  _updateYDropdown(force = false) {
    if (!force && isPickerFocused(this._container)) return;

    const t = (k, v) => this._context.i18n.t(`modules.regression.${k}`, v);
    const sel = this._container.querySelector('[data-ref="y-select"]');
    if (!sel) return;

    const selectedKeys = new Set(this._colRefs.map(r => refToKey(r)));
    const allCols = discoverColumns(this._context.stateManager, {
      types: ['numeric', 'currency', 'percent', 'date', 'time'],
      minCount: 1,
    });

    let html = `<option value="">${t('selectYHint')}</option>`;
    for (const col of allCols) {
      const ref = { instanceId: col.instanceId, sheetId: col.sheetId, columnId: col.columnId };
      const key = refToKey(ref);
      if (selectedKeys.has(key)) continue;
      const name = col.columnName || col.shortName || '?';
      const selected = key === this._yKey ? ' selected' : '';
      html += `<option value="${key}"${selected}>${esc(name)}</option>`;
    }
    sel.innerHTML = html;

    if (this._yKey && !sel.querySelector(`option[value="${this._yKey}"]`)) {
      this._yKey = null;
      sel.value = '';
    }
  },

  _updateSelectedInfo() {
    const t = (k, v) => this._context.i18n.t(`modules.regression.${k}`, v);
    const el = this._container.querySelector('[data-ref="selected-info"]');
    if (!el) return;

    const xCount = this._colRefs.length;

    if (xCount === 0) {
      el.innerHTML = `<span class="reg__hint">${t('selectColumns')}</span>`;
    } else if (!this._yKey) {
      el.innerHTML = `<span class="reg__hint">${t('selectYHint')}</span>`;
    } else if (xCount === 1) {
      el.innerHTML = `<span class="reg__info">${t('singleMode')}</span>`;
    } else {
      el.innerHTML = `<span class="reg__info">${t('multiMode', { n: xCount })}</span>`;
    }
  },

  /**
   * Disable polynomial degree options that would exceed available data.
   */
  _updateDegreeOptions() {
    const sel = this._container?.querySelector('[data-ref="poly-degree"]');
    if (!sel) return;

    const t = (key, v) => this._context.i18n.t(`modules.regression.${key}`, v);
    const k = this._colRefs.length;
    // Count available paired rows
    let n = 0;
    if (k > 0 && this._yKey) {
      const yRef = keyToRef(this._yKey);
      const yRaw = this._getRawNumericValues(yRef);
      const xCols = this._colRefs.map(r => this._getRawNumericValues(r));
      const maxLen = Math.min(yRaw.length, ...xCols.map(c => c.length));
      for (let i = 0; i < maxLen; i++) {
        if (yRaw[i] === null) continue;
        let ok = true;
        for (let j = 0; j < xCols.length; j++) {
          if (xCols[j][i] === null) { ok = false; break; }
        }
        if (ok) n++;
      }
    }

    const hints = [];
    for (const opt of sel.options) {
      const deg = parseInt(opt.value);
      const terms = polyTermCount(k || 1, deg);
      const disabled = n > 0 && n <= terms;
      opt.disabled = disabled;
      if (disabled) {
        const hint = t('degreeDisabledHint', { deg, terms, n });
        opt.title = hint;
        hints.push(hint);
      } else {
        opt.title = '';
      }
    }

    const hintEl = this._container.querySelector('[data-ref="degree-hint"]');
    if (hintEl) {
      hintEl.textContent = hints.length > 0 ? hints[0] : '';
      hintEl.style.display = hints.length > 0 ? '' : 'none';
    }
  },

  _bindEvents() {
    const c = this._container;

    const importSel = c.querySelector('[data-ref="doe-import"]');
    if (importSel) {
      importSel.addEventListener('change', (e) => {
        const key = e.target.value;
        if (key) this._applyExperimentImport(key);
      });
    }

    c.querySelector('[data-ref="y-select"]').addEventListener('change', (e) => {
      this._yKey = e.target.value || null;
      this._updateSelectedInfo();
      this._updateDegreeOptions();
      this._save();
      this._autoRun();
    });

    c.querySelector('[data-ref="reg-type"]').addEventListener('change', (e) => {
      this._regType = e.target.value;
      const degreeField = c.querySelector('[data-ref="degree-field"]');
      degreeField.style.display = this._isPolynomial() ? '' : 'none';
      this._save();
      this._autoRun();
    });

    c.querySelector('[data-ref="poly-degree"]').addEventListener('change', (e) => {
      this._polyDegree = parseInt(e.target.value);
      this._save();
      this._autoRun();
    });

    const confInput = c.querySelector('[data-ref="conf-level"]');
    const alphaInput = c.querySelector('[data-ref="alpha-level"]');

    confInput.addEventListener('change', () => {
      const v = parseFloat(confInput.value.replace(',', '.'));
      if (Number.isFinite(v) && v > 0 && v < 100) {
        this._confLevel = v / 100;
      }
      confInput.value = +(this._confLevel * 100).toFixed(2);
      this._save();
      this._autoRun();
    });

    alphaInput.addEventListener('change', () => {
      const v = parseFloat(alphaInput.value.replace(',', '.'));
      if (Number.isFinite(v) && v > 0 && v < 100) {
        this._alpha = v / 100;
      }
      alphaInput.value = +(this._alpha * 100).toFixed(2);
      this._save();
      this._autoRun();
    });

    c.querySelector('[data-action="toggle-ci"]').addEventListener('click', (e) => {
      this._showCI = !this._showCI;
      e.currentTarget.classList.toggle('reg__toggle--active', this._showCI);
      this._save();
      this._autoRun();
    });

  },

  // ─── Auto-run ──────────────────────────────────────────────

  /**
   * Automatically triggers analysis when all required data is available.
   * Clears results if prerequisites are no longer met.
   */
  _autoRun() {
    if (this._colRefs.length === 0 || !this._yKey) {
      // Not enough data — clear any existing results
      if (this._result || this._perXResults) {
        this._result = null;
        this._perXResults = null;
        this._activeXKey = null;
        const resultsEl = this._container.querySelector('[data-ref="results"]');
        if (resultsEl) { resultsEl.style.display = 'none'; resultsEl.innerHTML = ''; }
        const predictTitle = this._container.querySelector('[data-ref="predict-title"]');
        if (predictTitle) predictTitle.style.display = 'none';
        const predictSec = this._container.querySelector('[data-ref="predict-section"]');
        if (predictSec) predictSec.style.display = 'none';
        const errBox = this._container.querySelector('[data-ref="error-box"]');
        if (errBox) { errBox.textContent = ''; errBox.style.display = 'none'; }
        this._destroyCharts();
        this._save();
      }
      return;
    }
    this._runAnalysis();
  },

  // ─── Analysis ──────────────────────────────────────────────

  _runAnalysis() {
    const t = (k, v) => this._context.i18n.t(`modules.regression.${k}`, v);
    const errBox = this._container.querySelector('[data-ref="error-box"]');
    errBox.textContent = '';
    errBox.style.display = 'none';

    if (this._colRefs.length === 0 || !this._yKey) {
      errBox.textContent = t('errSelectBoth');
      errBox.style.display = 'block';
      return;
    }

    const yRef = keyToRef(this._yKey);

    if (this._isPolynomial()) {
      this._runPolynomial(yRef, errBox, t);
    } else {
      this._runSingleXModels(yRef, errBox, t);
    }
  },

  /**
   * Read a worksheet column and classify it for ModelSpec consumption.
   * Categorical detection: any column carrying `meta.categoricalCoding` (set
   * by the DoE planner) is treated as `kind: 'categorical'` with the level
   * order taken from the coding map. The reference level is the first key
   * (this matches what doe-planner-worksheet.js writes). For continuous
   * columns we fall back to the existing numeric reader.
   *
   * @returns {{ kind: 'continuous'|'categorical', name: string,
   *             values: Array<number|string|null>, levels?: string[],
   *             reference?: string }}
   */
  _getColumnDescriptor(ref) {
    const col = this._resolveColumn(ref);
    const name = col ? (col.name || col.shortName || '?') : '?';
    if (!col) return { kind: 'continuous', name, values: [] };
    const coding = col.meta?.categoricalCoding;
    if (coding && Object.keys(coding).length >= 2) {
      const levels = Object.keys(coding);
      return {
        kind: 'categorical',
        name,
        levels,
        reference: levels[0],
        values: (col.values || []).map(v => (v == null ? null : String(v))),
      };
    }
    return {
      kind: 'continuous',
      name,
      values: (col.values || []).map(v => this._toNumeric(v, col.type)),
    };
  },

  _runPolynomial(yRef, errBox, t) {
    const xRefs = this._colRefs;
    const yRaw  = this._getRawNumericValues(yRef);
    const yName = this._getColumnDisplayName(yRef);
    const xDescs = xRefs.map(r => this._getColumnDescriptor(r));
    const xNames = xDescs.map(d => d.name);

    // Row-filter: y must be finite, every x must be valid for its kind.
    const maxLen = Math.min(yRaw.length, ...xDescs.map(d => d.values.length));
    const yFiltered = [];
    const xFilteredRaw = xDescs.map(() => []);
    for (let i = 0; i < maxLen; i++) {
      if (yRaw[i] == null || !Number.isFinite(yRaw[i])) continue;
      let allOk = true;
      for (let j = 0; j < xDescs.length; j++) {
        const v = xDescs[j].values[i];
        if (xDescs[j].kind === 'continuous') {
          if (v == null || !Number.isFinite(v)) { allOk = false; break; }
        } else {
          if (v == null || !xDescs[j].levels.includes(v)) { allOk = false; break; }
        }
      }
      if (!allOk) continue;
      yFiltered.push(yRaw[i]);
      for (let j = 0; j < xDescs.length; j++) xFilteredRaw[j].push(xDescs[j].values[i]);
    }

    if (yFiltered.length < 3) {
      errBox.textContent = t('errMinData', { n: yFiltered.length });
      errBox.style.display = 'block';
      return;
    }

    // Build a ModelSpec: predictors carry kind, terms come from the polynomial
    // generator with user exclusions removed.
    const predictors = xDescs.map(d => d.kind === 'categorical'
      ? { id: d.name, kind: 'categorical', levels: d.levels, reference: d.reference }
      : { id: d.name, kind: 'continuous' });

    const allTerms = generatePolynomialTerms(predictors, this._polyDegree);
    const excludedSet = new Set(this._excludedTerms || []);
    const activeTerms = allTerms.filter(term => !excludedSet.has(term.id));
    const spec = { predictors, terms: activeTerms };

    const data = {
      columns: Object.fromEntries(predictors.map((p, j) => [p.id, xFilteredRaw[j]])),
      y: yFiltered,
    };

    let fit;
    try {
      fit = fitFromSpec(spec, data, { confLevel: this._confLevel });
    } catch (e) {
      const msg = String(e?.message || e);
      if (yFiltered.length <= activeTerms.length + 1) {
        errBox.textContent = t('errInsufficientDf');
      } else if (/singular|rank-deficient/i.test(msg)) {
        errBox.textContent = t('errInsufficientDf');
      } else {
        errBox.textContent = t('errGeneric');
      }
      errBox.style.display = 'block';
      return;
    }

    // Compute VIF on the continuous predictor columns only — VIF is undefined
    // for label columns, so categorical predictors are reported as null.
    const continuousIndices = xDescs
      .map((d, i) => d.kind === 'continuous' ? i : -1)
      .filter(i => i >= 0);
    let vifFull = null;
    let vif = null;
    if (continuousIndices.length >= 2) {
      const contCols = continuousIndices.map(i => xFilteredRaw[i]);
      const fullVifs = computeVIF(contCols);
      vifFull = xDescs.map(() => null);
      continuousIndices.forEach((origIdx, k) => { vifFull[origIdx] = fullVifs[k]; });

      // Reduced VIF: only continuous columns that still have an active term.
      const activeXIndices = [];
      for (let xi = 0; xi < predictors.length; xi++) {
        if (predictors[xi].kind !== 'continuous') continue;
        const name = predictors[xi].id;
        const hasActiveTerm = activeTerms.some(term =>
          term.factors.some(f => f.id === name)
        );
        if (hasActiveTerm) activeXIndices.push(xi);
      }
      if (activeXIndices.length >= 2) {
        const reducedCols = activeXIndices.map(i => xFilteredRaw[i]);
        const reducedVifs = computeVIF(reducedCols);
        vif = xDescs.map(() => null);
        activeXIndices.forEach((origIdx, k) => { vif[origIdx] = reducedVifs[k]; });
      } else {
        vif = xDescs.map((_, i) => activeXIndices.includes(i) ? 1 : null);
      }
    }

    this._result = this._adaptFitToLegacyResult(fit, {
      spec, allTerms, predictors, xDescs, xNames, yName,
      xFilteredRaw, yFiltered, vif, vifFull,
    });
    this._perXResults = null;
    this._activeXKey = null;

    this._save();
    this._renderResults();
  },

  /**
   * Adapt a `FitFromSpecResult` into the shape the existing UI rendering
   * expects from `runMultiRegression`. New structured fields (`spec`,
   * `blockMap`, `blocks`, `fit`) are also surfaced for future block-aware UI.
   */
  _adaptFitToLegacyResult(fit, ctx) {
    const { spec, allTerms, predictors, xDescs, xNames, yName,
            xFilteredRaw, yFiltered, vif, vifFull } = ctx;
    const ols = fit.ols;
    const tCrit = ols.dfError > 0 ? tInv((1 + this._confLevel) / 2, ols.dfError) : 0;

    // Coefficient details, including the intercept first.
    const coefDetails = [{
      term: 'Intercept',
      coeff: ols.beta[0],
      se: ols.seBeta[0],
      t:  ols.tValues[0],
      pval: ols.pValues[0],
      ciLow:  ols.beta[0] - tCrit * ols.seBeta[0],
      ciHigh: ols.beta[0] + tCrit * ols.seBeta[0],
    }];
    for (const cd of fit.coefDetails) {
      coefDetails.push({
        term: cd.columnName,
        coeff: cd.coeff,
        se: cd.se,
        t:  cd.t,
        pval: cd.pval,
        ciLow:  cd.ciLow,
        ciHigh: cd.ciHigh,
        blockId: cd.blockId,
      });
    }

    // Predict closure: the legacy UI hands an array of numeric x values,
    // one per X variable. For categorical predictors we cannot accept a
    // numeric input here — the user would need a level dropdown, which is
    // future UI work. Until then, predict for mixed models is disabled.
    const hasCategorical = predictors.some(p => p.kind === 'categorical');
    const predict = hasCategorical
      ? null
      : (xVals) => {
          const obj = {};
          predictors.forEach((p, i) => { obj[p.id] = xVals[i]; });
          return fit.predict(obj);
        };

    return {
      // ── New structured fields ─────────────────────────────────────
      spec,
      blockMap: fit.blockMap,
      blocks: fit.blocks,
      fit,
      hasCategorical,

      // ── Legacy KPI / diagnostic fields ────────────────────────────
      type: 'polynomial',
      degree: this._polyDegree,
      multiX: true,
      xCount: predictors.length,
      xNames,
      _xNames: [...xNames],
      _nameY: yName,
      // _termNames pairs 1-1 with _coefficients: ['Intercept', term1, term2, …].
      _termNames: ['Intercept', ...spec.terms.map(t => t.id)],
      _coefficients: ols.beta,
      confLevel: this._confLevel,

      R2:    fit.diagnostics.R2,
      adjR2: fit.diagnostics.adjR2,
      R2pred: fit.diagnostics.R2pred,
      PRESS:  fit.diagnostics.PRESS,
      Se:     fit.diagnostics.sigma,
      Fstat:  fit.diagnostics.fStat,
      fPVal:  fit.diagnostics.fPValue,
      dw:     fit.diagnostics.dw,

      SST:   ols.SST,
      SSR:   ols.SSR,
      SSE:   ols.SSE,
      dfReg: ols.dfModel,
      dfRes: ols.dfError,
      dfTot: ols.dfModel + ols.dfError,
      MSR:   ols.dfModel > 0 ? ols.SSR / ols.dfModel : 0,
      MSE:   ols.MSE,
      df:    ols.dfError,

      // Used by the LoF helper, Save-as-Model and the chart renderers.
      yHat:      ols.predicted,
      residuals: ols.residuals,
      invXtX:    ols.XtXinv,
      n:         yFiltered.length,
      p:         ols.beta.length,
      ys:        [...yFiltered],
      xMatrix:   xFilteredRaw.map(c => [...c]),

      coefDetails,
      // allTerms is the full set (including Intercept) so the coefficient
      // table can render an "Intercept" row even when the user has excluded
      // every other term. The Intercept row is always rendered as disabled.
      allTerms: ['Intercept', ...allTerms.map(t => t.id)],
      excludeTerms: [...(this._excludedTerms || [])],

      vif,
      vifFull,

      reg: {
        coeffs: [...ols.beta],
        terms:  ['Intercept', ...fit.coefDetails.map(c => c.columnName)],
        p: ols.beta.length,
        type: 'polynomial',
        predict,
      },

      equation: fit.equation,
    };
  },


  _runSingleXModels(yRef, errBox, t) {
    const xRefs = this._colRefs;
    const results = {};
    const errors = [];

    for (const xRef of xRefs) {
      const paired = this._getPairedValues(xRef, yRef);
      if (!paired || paired.x.length < 3) {
        errors.push(this._getColumnDisplayName(xRef) + ': ' + t('errMinData', { n: paired ? paired.x.length : 0 }));
        continue;
      }
      try {
        const result = runRegression(paired.x, paired.y, this._regType, this._confLevel);
        result._nameX = this._getColumnDisplayName(xRef);
        result._nameY = this._getColumnDisplayName(yRef);
        results[refToKey(xRef)] = result;
      } catch (e) {
        if (e.message === 'MIN_DATA') {
          errors.push(this._getColumnDisplayName(xRef) + ': ' + t('errMinData', { n: paired.x.length }));
        } else if (e.message === 'INSUFFICIENT_DF') {
          errors.push(this._getColumnDisplayName(xRef) + ': ' + t('errInsufficientDf'));
        } else {
          errors.push(this._getColumnDisplayName(xRef) + ': ' + t('errGeneric'));
        }
      }
    }

    if (Object.keys(results).length === 0) {
      errBox.textContent = errors.join('\n');
      errBox.style.display = 'block';
      return;
    }

    this._perXResults = results;
    this._result = null;
    const resultKeys = Object.keys(results);
    if (!this._activeXKey || !results[this._activeXKey]) {
      this._activeXKey = resultKeys[0];
    }

    if (errors.length > 0) {
      errBox.textContent = errors.join('\n');
      errBox.style.display = 'block';
    }

    this._save();
    this._renderResults();
  },

  // ─── Active result helper ─────────────────────────────────

  _getActiveResult() {
    if (this._result) return this._result;
    if (this._perXResults && this._activeXKey) return this._perXResults[this._activeXKey];
    return null;
  },

  // ─── Render Results ────────────────────────────────────────

  _renderResults() {
    const t = (k, v) => this._context.i18n.t(`modules.regression.${k}`, v);
    const r = this._getActiveResult();
    if (!r) return;

    this._destroyCharts();

    const resultsEl = this._container.querySelector('[data-ref="results"]');
    resultsEl.style.display = 'block';

    // Show predict section & build inputs
    this._container.querySelector('[data-ref="predict-title"]').style.display = '';
    const predictSec = this._container.querySelector('[data-ref="predict-section"]');
    predictSec.style.display = '';
    this._buildPredictInputs();

    // X-column selector (only for per-X single models)
    let xSelectorHTML = '';
    if (this._perXResults) {
      const resultKeys = Object.keys(this._perXResults);
      if (resultKeys.length > 1) {
        xSelectorHTML = `<div class="reg__x-selector" data-ref="x-selector">
          ${resultKeys.map(key => {
            const res = this._perXResults[key];
            const active = key === this._activeXKey ? ' reg__x-btn--active' : '';
            return `<button class="reg__x-btn${active}" data-x-key="${key}">${esc(res._nameX)}</button>`;
          }).join('')}
        </div>`;
      }
    }

    // KPI
    const r2class = r.R2 >= 0.8 ? 'dmike-kpi--good' : r.R2 >= 0.5 ? 'dmike-kpi--warn' : 'dmike-kpi--bad';
    const r2pVal = r.R2pred ?? null;
    const r2pClass = r2pVal != null ? (r2pVal >= 0.8 ? 'dmike-kpi--good' : r2pVal >= 0.5 ? 'dmike-kpi--warn' : 'dmike-kpi--bad') : '';
    const alpha = this._alpha;
    const pClass = r.fPVal < alpha ? 'dmike-kpi--good' : r.fPVal < alpha * 2 ? 'dmike-kpi--warn' : 'dmike-kpi--bad';

    // Tabs
    const isMultiX = r.multiX && r.xCount > 1;
    const tabs = [
      { id: 'scatter', label: isMultiX ? t('tabActualVsPredicted') : t('tabRegression') },
      { id: 'residuals', label: t('tabResiduals') },
      { id: 'order', label: t('tabOrder') },
      { id: 'qq', label: t('tabQQ') },
      { id: 'histogram', label: t('tabHistogram') },
      { id: 'ss-pie', label: t('tabSSPie') },
    ];
    if (isMultiX) {
      tabs.push({ id: 'main-effects', label: t('tabMainEffects') });
      tabs.push({ id: 'interaction', label: t('tabInteraction') });
    }

    resultsEl.innerHTML = `
      ${xSelectorHTML}

      <div class="dmike-kpi-strip">
        <div class="dmike-kpi ${r2class}" title="${esc(t('tipR2'))}"><div class="dmike-kpi-value">${fmt(r.R2)}</div><div class="dmike-kpi-label">R²</div></div>
        <div class="dmike-kpi ${r2class}" title="${esc(t('tipAdjR2'))}"><div class="dmike-kpi-value">${fmt(r.adjR2)}</div><div class="dmike-kpi-label">${t('adjR2')}</div></div>
        ${r2pVal != null ? `<div class="dmike-kpi ${r2pClass}" title="${esc(t('tipPredR2'))}"><div class="dmike-kpi-value">${fmt(r2pVal)}</div><div class="dmike-kpi-label">${t('predR2')}</div></div>` : ''}
        <div class="dmike-kpi" title="${esc(t('tipStdError'))}"><div class="dmike-kpi-value">${fmt(r.Se)}</div><div class="dmike-kpi-label">${t('stdError')}</div></div>
        <div class="dmike-kpi" title="${esc(t('tipFStat'))}"><div class="dmike-kpi-value">${fmt(r.Fstat, 2)}</div><div class="dmike-kpi-label">${t('fStat')}</div></div>
        <div class="dmike-kpi ${pClass}" title="${esc(t('tipPValueF'))}"><div class="dmike-kpi-value">${fmtP(r.fPVal)}</div><div class="dmike-kpi-label">${t('pValueF')}</div></div>
        <div class="dmike-kpi" title="${esc(t('tipDurbinWatson'))}"><div class="dmike-kpi-value">${fmt(r.dw, 3)}</div><div class="dmike-kpi-label">${t('durbinWatson')}</div></div>
      </div>

      <div class="reg__equation">${esc(r.equation)}</div>

      ${r.multiX && this._isPolynomial() ? `
      <div class="reg__model-actions">
        <button class="dmike-btn dmike-btn--primary" data-action="save-as-model" type="button">
          ${this._savedModelId ? t('updateModel') : t('saveAsModel')}
        </button>
        <span class="reg__model-status" data-ref="model-status">${this._savedModelId ? t('modelSaved') : ''}</span>
      </div>
      ` : ''}

      <div class="dmike-tabs" data-ref="tabs">
        ${tabs.map(tb => `<button class="dmike-tab${tb.id === this._activeTab ? ' dmike-tab--active' : ''}" data-tab="${tb.id}">${tb.label}</button>`).join('')}
      </div>

      ${tabs.map(tb => `
        <div class="dmike-tab-content${tb.id === this._activeTab ? ' dmike-tab-content--active' : ''}" data-tab-content="${tb.id}">
          <div class="reg__chart-wrap" data-ref="chart-${tb.id}"></div>
        </div>
      `).join('')}

      <div class="dmike-split__output-section">${t('anovaTable')}</div>
      <div class="reg__table-wrap">
        ${this._buildAnovaHTML(r)}
      </div>

      <div class="dmike-split__output-section">${t('coefTable')}</div>
      <div class="reg__table-wrap">
        ${this._buildCoefHTML(r)}
      </div>
    `;

    // Bind X selector events
    const xSel = resultsEl.querySelector('[data-ref="x-selector"]');
    if (xSel) {
      xSel.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-x-key]');
        if (!btn) return;
        this._activeXKey = btn.dataset.xKey;
        this._save();
        this._renderResults();
      });
    }

    // Bind tab events
    resultsEl.querySelector('[data-ref="tabs"]').addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]');
      if (!tab) return;
      this._switchTab(tab.dataset.tab);
    });

    // Bind Algorithm Lab link
    resultsEl.querySelectorAll('.reg__algo-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const algoId = link.dataset.algoId;
        if (algoId && this._context.eventBus) {
          this._context.eventBus.emit('lab:navigate', { algoId, tab: 'docs' });
        }
      });
    });

    // Bind term checkboxes (include/exclude terms for model refinement)
    resultsEl.querySelectorAll('.reg__term-cb').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const term = e.target.dataset.term;
        if (e.target.checked) {
          this._excludedTerms = this._excludedTerms.filter(t => t !== term);
        } else {
          this._excludedTerms = [...this._excludedTerms, term];
        }
        this._save();
        this._runAnalysis();
      });
    });

    // Bind sort-by-p-value toggle
    const sortBtn = resultsEl.querySelector('[data-action="sort-coef-p"]');
    if (sortBtn) {
      sortBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this._coefSortByP = !this._coefSortByP;
        this._save();
        this._renderResults();
      });
    }

    // Save-as-model
    const saveBtn = resultsEl.querySelector('[data-action="save-as-model"]');
    if (saveBtn) {
      saveBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this._saveAsModel();
      });
    }

    this._renderActiveChart();
  },

  /**
   * Persist the current polynomial fit as a `state.models[id]` entry so it can
   * be referenced from the response-optimization module. Re-uses an existing
   * id (`_savedModelId`) when present so repeated clicks update the same record
   * instead of creating duplicates.
   */
  _saveAsModel() {
    const r = this._result;
    if (!r || !r.multiX || !this._isPolynomial()) return;
    const t = (k, v) => this._context.i18n.t(`modules.regression.${k}`, v);

    // Reconstruct (X, y) — these are the values that flowed into runMultiRegression.
    // `originalToFiltered` lets us map worksheet-row indices (used by
    // `state.experiments[id].replicateGroups`) to positions in the filtered y.
    const xCols = this._colRefs.map(ref => this._getRawNumericValues(ref));
    const yRaw  = this._getRawNumericValues(keyToRef(this._yKey));
    const n = Math.min(yRaw.length, ...xCols.map(c => c.length));
    const X = [];
    const y = [];
    const originalToFiltered = new Map();
    for (let i = 0; i < n; i++) {
      if (yRaw[i] == null) continue;
      const row = xCols.map(c => c[i]);
      if (row.some(v => v == null)) continue;
      originalToFiltered.set(i, y.length);
      X.push(row);
      y.push(yRaw[i]);
    }

    const xNames = this._colRefs.map(ref => this._getColumnDisplayName(ref));
    const yName  = this._getColumnDisplayName(keyToRef(this._yKey));
    // Derive factor bounds from the observed range of each predictor — the
    // optimizer needs these to define the search box. Falls back to ±1 only
    // when the column is degenerate.
    const factorSpec = xNames.map((name, j) => {
      let lo =  Infinity, hi = -Infinity;
      for (const row of X) {
        const v = row[j];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) {
        return { name, low: -1, high: 1 };
      }
      return { name, low: lo, high: hi };
    });

    const dataSnapshot = buildDataSnapshot({
      X, y, factorSpec,
      termSet: r._termNames ? [...r._termNames] : [],
      experimentId:   this._activeImportSource?.experimentId   ?? null,
      responseColumn: this._activeImportSource?.sourceColumn   ?? this._yKey,
    });

    const lofPValue = this._computeLoFPValue(r, y, originalToFiltered);

    // Deep-clone the spec — once written to the project state it must be
    // immune to later mutations of the live module's _result.
    const specSnapshot = r.spec ? JSON.parse(JSON.stringify(r.spec)) : null;

    const record = {
      id: this._savedModelId ?? undefined,
      name: this._savedModelName || `${yName} — Modell`,
      experimentId: this._activeImportSource?.experimentId ?? null,
      responseSpec: {
        sourceColumn: this._activeImportSource?.sourceColumn ?? this._yKey,
        transform:    this._activeImportSource?.transform    ?? 'identity',
        aggregateOver: null,
      },
      termSet: r._termNames ? [...r._termNames] : [],
      coef:    r._coefficients ?? null,
      vcov:    null,
      sigma2:  r.Se != null ? r.Se * r.Se : null,
      df:      r.df ?? null,
      rSqAdj:  r.adjR2 ?? null,
      lofPValue,
      factorSpec,
      // Full ModelSpec the fit was built from. Lets the optimizer know
      // which predictors are categorical and what levels they have, and
      // lets predictFromModel evaluate label inputs directly.
      spec: specSnapshot,
      dataSnapshot,
      dataHash: computeDataHash(X, y),
      createdFromInstanceId: this._context.instanceId,
    };

    const id = saveModel(this._context.stateManager, record);
    this._savedModelId   = id;
    this._savedModelName = record.name;
    this._save();
    this._context.notify(t('modelSaved'), 'success');

    // Refresh the button label / status badge.
    const btn = this._container.querySelector('[data-action="save-as-model"]');
    const status = this._container.querySelector('[data-ref="model-status"]');
    if (btn) btn.textContent = t('updateModel');
    if (status) status.textContent = t('modelSaved');
  },

  /**
   * Compute the lack-of-fit p-value for the just-fitted polynomial model. Uses
   * `replicateGroups` from the source experiment; returns null when no
   * experiment is linked or the design has no usable replicates.
   *
   * @param {object} r - regression result (from runMultiRegression)
   * @param {number[]} y - y vector that flowed into the fit (filtered)
   * @param {Map<number, number>} originalToFiltered - map of worksheet-row
   *   indices → filtered-y indices
   * @returns {number|null}
   */
  _computeLoFPValue(r, y, originalToFiltered) {
    const expId = this._activeImportSource?.experimentId;
    if (!expId) return null;
    const exp = this._context.stateManager.get('experiments')?.[expId];
    const groups = exp?.replicateGroups;
    if (!Array.isArray(groups) || groups.length === 0) return null;
    if (!r || !Array.isArray(r.yHat) || !Number.isFinite(r.dfRes)) return null;

    const translated = [];
    for (const group of groups) {
      if (!Array.isArray(group)) continue;
      const mapped = [];
      for (const i of group) {
        const f = originalToFiltered.get(i);
        if (f != null) mapped.push(f);
      }
      if (mapped.length >= 2) translated.push(mapped);
    }
    if (translated.length === 0) return null;

    const lof = lackOfFitTest(y, r.yHat, translated, r.dfRes);
    return lof ? lof.pValue : null;
  },

  _buildPredictInputs() {
    const t = (k, v) => this._context.i18n.t(`modules.regression.${k}`, v);
    const wrap = this._container.querySelector('[data-ref="predict-inputs"]');
    if (!wrap) return;

    const r = this._result;
    if (r && r.multiX) {
      // Spec-based path: render a <select> for each categorical predictor
      // (with its level set as options), a numeric input for each continuous
      // predictor. Falls through to the legacy index-based renderer when the
      // result has no spec (older models loaded from saved state).
      const predictors = r.spec?.predictors;
      if (predictors) {
        wrap.innerHTML = predictors.map((p) => {
          if (p.kind === 'categorical') {
            const opts = (p.levels || []).map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
            return `
              <div class="field-group">
                <label>${esc(p.id)}</label>
                <select class="field" data-predict-id="${esc(p.id)}">${opts}</select>
              </div>`;
          }
          return `
            <div class="field-group">
              <label>${esc(p.id)}</label>
              <input type="number" class="field field--num" data-predict-id="${esc(p.id)}">
            </div>`;
        }).join('');
      } else {
        const xNames = r._xNames || [];
        wrap.innerHTML = xNames.map((name, i) => `
          <div class="field-group">
            <label>${esc(name)}</label>
            <input type="number" class="field field--num" data-predict-idx="${i}">
          </div>
        `).join('');
      }
    } else {
      wrap.innerHTML = `
        <div class="field-group">
          <label>${t('predictXValue')}</label>
          <input type="number" class="field field--num" data-ref="predict-x">
        </div>
      `;
    }

    // Trigger predict() on any input or select change. `change` covers select
    // dropdowns; `input` keeps live updates for numeric fields.
    wrap.querySelectorAll('input, select').forEach((el) => {
      el.addEventListener('input',  () => this._predict());
      el.addEventListener('change', () => this._predict());
    });
  },

  // ─── Tables ────────────────────────────────────────────────

  _buildAnovaHTML(r) {
    const t = (k, v) => this._context.i18n.t(`modules.regression.${k}`, v);
    const alpha = this._alpha;
    const pSig = r.fPVal < alpha ? 'reg__td--sig' : 'reg__td--not-sig';
    const regSig = r.fPVal < alpha;
    const regRowClass = regSig ? 'reg__tr--sig' : 'reg__tr--not-sig';

    // Per-block Type-III SS rows. When r.blocks is populated (new fitFromSpec
    // path) we use it directly — that already merges multi-indicator
    // categorical blocks into a single row with proper Wald-form SS. Older
    // single-X paths fall back to the per-coefficient t²·MSE form.
    let termRows = '';
    if (Array.isArray(r.blocks) && r.blocks.length > 0) {
      for (const b of r.blocks) {
        if (b.id === 'Intercept') continue;
        const sig = Number.isFinite(b.pValue) && b.pValue < alpha;
        const tpSig = sig ? 'reg__td--sig' : (Number.isFinite(b.pValue) ? 'reg__td--not-sig' : '');
        const trCls = sig ? 'reg__tr--sig' : (Number.isFinite(b.pValue) ? 'reg__tr--not-sig' : '');
        termRows += `<tr class="${trCls} reg__tr--term">
          <td class="reg__td--term-indent">${esc(b.id)}</td>
          <td>${fmt(b.ss)}</td><td>${b.df}</td><td>${fmt(b.ms)}</td>
          <td>${fmt(b.fStat)}</td><td class="${tpSig}">${Number.isFinite(b.pValue) ? fmtP(b.pValue) : '–'}</td>
        </tr>`;
      }
    } else {
      const coefs = (r.coefDetails || []).filter(c => c.term !== 'Intercept');
      for (const c of coefs) {
        if (c.t == null) continue;
        const ss = c.t ** 2 * r.MSE;
        const df = 1;
        const ms = ss;
        const f = r.MSE > 0 ? ms / r.MSE : 0;
        const sig = c.pval != null && c.pval < alpha;
        const tpSig = sig ? 'reg__td--sig' : (c.pval != null ? 'reg__td--not-sig' : '');
        const trCls = sig ? 'reg__tr--sig' : (c.pval != null ? 'reg__tr--not-sig' : '');
        termRows += `<tr class="${trCls} reg__tr--term">
          <td class="reg__td--term-indent">${esc(c.term)}</td>
          <td>${fmt(ss)}</td><td>${df}</td><td>${fmt(ms)}</td>
          <td>${fmt(f)}</td><td class="${tpSig}">${c.pval != null ? fmtP(c.pval) : '–'}</td>
        </tr>`;
      }
    }

    return `<table class="reg__table">
      <thead><tr>
        <th>${t('source')}</th><th>SS ${algoBtn(ALGO_ID_ANOVA)}</th><th>DF ${algoBtn(ALGO_ID_ANOVA)}</th><th>MS ${algoBtn(ALGO_ID_ANOVA)}</th><th>F ${algoBtn(ALGO_ID_ANOVA)}</th><th>${t('pValue')} ${algoBtn(ALGO_ID_ANOVA)}</th>
      </tr></thead>
      <tbody>
        <tr class="${regRowClass}">
          <td>${t('sourceRegression')}</td>
          <td>${fmt(r.SSR)}</td><td>${r.dfReg}</td><td>${fmt(r.MSR)}</td>
          <td>${fmt(r.Fstat)}</td><td class="${pSig}">${fmtP(r.fPVal)}</td>
        </tr>
        ${termRows}
        <tr class="reg__tr--error">
          <td>${t('sourceResiduals')}</td>
          <td>${fmt(r.SSE)}</td><td>${r.dfRes}</td><td>${fmt(r.MSE)}</td>
          <td></td><td></td>
        </tr>
        <tr class="reg__tr--total">
          <td>${t('sourceTotal')}</td>
          <td>${fmt(r.SST)}</td><td>${r.dfTot}</td><td></td><td></td><td></td>
        </tr>
      </tbody>
    </table>`;
  },

  _buildCoefHTML(r) {
    const t = (k, v) => this._context.i18n.t(`modules.regression.${k}`, v);
    const alpha = this._alpha;
    const hasDetails = r.coefDetails[0]?.se != null;
    const hasVIF = r.vif && r.vif.length > 0;
    const hasVIFFull = r.vifFull && r.vifFull.length > 0;
    const canExclude = !!r.allTerms;
    const excluded = new Set(r.excludeTerms || []);
    const hasBlocks = Array.isArray(r.blockMap) && r.blockMap.length > 0;

    // VIF lookup by predictor name (continuous main effects only).
    const vifMap = {};
    const vifFullMap = {};
    if (hasVIF && r.xNames) {
      for (let i = 0; i < r.xNames.length; i++) vifMap[r.xNames[i]] = r.vif[i];
    }
    if (hasVIFFull && r.xNames) {
      for (let i = 0; i < r.xNames.length; i++) vifFullMap[r.xNames[i]] = r.vifFull[i];
    }

    // Header
    const sortBtnHTML = hasDetails
      ? ` <button class="reg__sort-btn${this._coefSortByP ? ' reg__sort-btn--active' : ''}" data-action="sort-coef-p" title="${t('sortByPValue')}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 15l5 5 5-5M7 9l5-5 5 5"/></svg></button>`
      : '';
    let head = '';
    if (canExclude) head += `<th class="reg__th--cb"></th>`;
    head += `<th class="reg__th--term">${t('term')}</th><th>${t('coefficient')}</th>`;
    if (hasDetails) head += `<th>${t('stdErrorCoef')}</th><th>${t('tValue')} ${algoBtn(ALGO_ID_COEF)}</th><th>${t('pValue')} ${algoBtn(ALGO_ID_COEF)}${sortBtnHTML}</th>`;
    if (hasVIF) head += `<th>VIF ${algoBtn(ALGO_ID_VIF)}</th>`;

    const detailCols = hasDetails ? 3 : 0;
    const vifCols = hasVIF ? 1 : 0;

    // Renderers shared between block-aware and legacy paths.
    const renderExcludedRow = (termId) => {
      const cb = canExclude ? `<td class="reg__td--cb"><input type="checkbox" class="reg__term-cb" data-term="${esc(termId)}"></td>` : '';
      const empty = '<td></td>'.repeat(1 + detailCols + vifCols);
      return `<tr class="reg__tr--excluded">${cb}<td class="reg__td--term">${esc(termId)}</td>${empty}</tr>`;
    };
    const renderCoefRow = (label, c, opts = {}) => {
      const { isIntercept = false, blockTermId = null, indented = false } = opts;
      const isSig = c?.pval != null && c.pval < alpha;
      const isNotSig = c?.pval != null && !isSig;
      const pSig = isSig ? 'reg__td--sig' : (isNotSig ? 'reg__td--not-sig' : '');
      const trClass = isNotSig ? ' reg__tr--not-sig' : (isSig ? ' reg__tr--sig' : '');
      let cols = '';
      if (canExclude) {
        // Excluding the intercept is meaningless; sub-rows of a multi-indicator
        // block delegate exclusion to the block header (above), so they show
        // a disabled checkbox here.
        const dataTerm = blockTermId ?? label;
        const disabled = (isIntercept || indented) ? ' disabled' : '';
        const checked = ' checked';
        cols += `<td class="reg__td--cb"><input type="checkbox" class="reg__term-cb"${checked} data-term="${esc(dataTerm)}"${disabled}></td>`;
      }
      let coefCell = fmt(c?.coeff);
      if (hasDetails && c?.ciLow != null && c?.ciHigh != null) {
        coefCell += ` <span class="reg__ci-inline">[${fmt(c.ciLow)}, ${fmt(c.ciHigh)}]</span>`;
      }
      const indentClass = indented ? ' reg__td--term-indent' : '';
      cols += `<td class="reg__td--term${indentClass}">${esc(label)}</td><td>${coefCell}</td>`;
      if (hasDetails) {
        cols += `<td>${fmt(c?.se)}</td><td>${fmt(c?.t)}</td>`;
        cols += `<td class="${pSig}">${c?.pval != null ? fmtP(c.pval) : '\u2013'}</td>`;
      }
      if (hasVIF) {
        const v = vifMap[label] ?? null;
        const vf = vifFullMap[label] ?? null;
        const vCls = v != null && v > 10 ? ' reg__td--not-sig' : (v != null && v > 5 ? ' reg__td--vif-warn' : '');
        let vifCell = v != null ? fmt(v, 2) : '\u2013';
        if (vf != null && v != null && Math.abs(vf - v) > 0.005) {
          vifCell += ` <span class="reg__vif-full">(${fmt(vf, 2)})</span>`;
        }
        cols += `<td class="${vCls}">${vifCell}</td>`;
      }
      return `<tr class="${trClass}">${cols}</tr>`;
    };

    let body = '';

    if (hasBlocks) {
      // New block-aware path. Group coefDetails by blockId; the intercept lives
      // in coefDetails[0] but has no blockId \u2014 we treat it as its own block.
      const coefsByBlock = new Map();
      coefsByBlock.set('Intercept', [r.coefDetails[0]]);
      for (const cd of r.coefDetails.slice(1)) {
        if (!coefsByBlock.has(cd.blockId)) coefsByBlock.set(cd.blockId, []);
        coefsByBlock.get(cd.blockId).push(cd);
      }

      // Build groups: one per term in r.allTerms (already includes Intercept).
      // Excluded terms go to a holding bucket and are rendered last.
      const allTerms = r.allTerms || [];
      const activeGroups = [];
      const excludedGroups = [];
      const blockById = new Map(r.blockMap.map(b => [b.id, b]));
      const blockSummaryById = new Map((r.blocks || []).map(b => [b.id, b]));

      for (const termId of allTerms) {
        if (termId !== 'Intercept' && excluded.has(termId)) {
          excludedGroups.push({ kind: 'excluded', termId });
          continue;
        }
        const coefs = coefsByBlock.get(termId) || [];
        if (coefs.length === 0) continue;
        if (coefs.length === 1) {
          activeGroups.push({ kind: 'single', termId, coef: coefs[0], isIntercept: termId === 'Intercept' });
        } else {
          activeGroups.push({
            kind: 'block', termId, coefs,
            block: blockById.get(termId),
            summary: blockSummaryById.get(termId),
          });
        }
      }

      // Sort by p-value if enabled. Single-row groups sort by their coef p;
      // multi-indicator blocks sort by the block's own F-test p (worst first).
      // Intercept is pinned to the top.
      if (this._coefSortByP && hasDetails) {
        const sortKey = (g) => {
          if (g.kind === 'single' && g.isIntercept) return -Infinity;
          if (g.kind === 'block') return g.summary?.pValue ?? -1;
          return g.coef?.pval ?? -1;
        };
        activeGroups.sort((a, b) => {
          if (a.kind === 'single' && a.isIntercept) return -1;
          if (b.kind === 'single' && b.isIntercept) return 1;
          return sortKey(b) - sortKey(a);
        });
      }

      for (const g of activeGroups) {
        if (g.kind === 'single') {
          body += renderCoefRow(g.termId, g.coef, { isIntercept: g.isIntercept });
        } else {
          // Block header row \u2014 shows the block-level F and p, no individual coef.
          const s = g.summary;
          const sig = s && Number.isFinite(s.pValue) && s.pValue < alpha;
          const trClass = sig ? 'reg__tr--sig' : (s && Number.isFinite(s.pValue) ? 'reg__tr--not-sig' : '');
          const pSig = sig ? 'reg__td--sig' : (s && Number.isFinite(s.pValue) ? 'reg__td--not-sig' : '');
          let cols = '';
          if (canExclude) {
            cols += `<td class="reg__td--cb"><input type="checkbox" class="reg__term-cb" checked data-term="${esc(g.termId)}"></td>`;
          }
          cols += `<td class="reg__td--term reg__td--block-header"><strong>${esc(g.termId)}</strong> <span class="reg__block-df">df=${g.block?.df ?? g.coefs.length}</span></td>`;
          // Coefficient column left blank (block doesn't have a single coef).
          cols += `<td>\u2014</td>`;
          if (hasDetails) {
            cols += `<td></td>`;
            cols += `<td>${s ? fmt(s.fStat) : ''}</td>`;
            cols += `<td class="${pSig}">${s && Number.isFinite(s.pValue) ? fmtP(s.pValue) : '\u2013'}</td>`;
          }
          if (hasVIF) cols += `<td></td>`;
          body += `<tr class="reg__tr--block ${trClass}">${cols}</tr>`;

          // Indicator sub-rows.
          for (const cd of g.coefs) {
            body += renderCoefRow(cd.columnName ?? cd.term, cd, { blockTermId: g.termId, indented: true });
          }
        }
      }
      for (const g of excludedGroups) {
        body += renderExcludedRow(g.termId);
      }
    } else {
      // Legacy fallback path (single-X regression results don't carry blockMap).
      const coefMap = new Map(r.coefDetails.map(c => [c.term, c]));
      const allTerms = r.allTerms || r.coefDetails.map(c => c.term);
      let rows = allTerms.map(term => ({
        term,
        isExcluded: excluded.has(term),
        isIntercept: term === 'Intercept',
        coef: coefMap.get(term) || null,
      }));
      if (this._coefSortByP && hasDetails) {
        rows.sort((a, b) => {
          if (a.isIntercept) return -1;
          if (b.isIntercept) return 1;
          if (a.isExcluded !== b.isExcluded) return a.isExcluded ? 1 : -1;
          const pa = a.coef?.pval ?? -1;
          const pb = b.coef?.pval ?? -1;
          return pb - pa;
        });
      }
      for (const row of rows) {
        if (row.isExcluded) body += renderExcludedRow(row.term);
        else                body += renderCoefRow(row.term, row.coef, { isIntercept: row.isIntercept });
      }
    }

    return `<table class="reg__table" data-ref="coef-table">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;
  },

  // ─── Prediction ────────────────────────────────────────────

  _predict() {
    const r = this._getActiveResult();
    if (!r) return;

    const t = (k, v) => this._context.i18n.t(`modules.regression.${k}`, v);
    const resultEl = this._container.querySelector('[data-ref="predict-result"]');

    if (r.multiX) {
      // Spec-based path (mixed continuous + categorical). Collect each
      // predictor's value by its id from the rendered inputs; build a 1-row
      // design matrix via compileModelSpec and dot-product with the saved
      // coefficients. This survives state restoration (no closures).
      if (r.spec) {
        const columns = {};
        const labelParts = [];
        for (const p of r.spec.predictors) {
          const el = this._container.querySelector(`[data-predict-id="${CSS.escape(p.id)}"]`);
          if (!el) return;
          let v;
          if (p.kind === 'categorical') {
            v = el.value || (p.levels && p.levels[0]);
            if (!p.levels?.includes(v)) return;
          } else {
            v = parseFloat(el.value);
            if (!Number.isFinite(v)) return;
          }
          columns[p.id] = [v];
          labelParts.push(`${p.id}=${typeof v === 'number' ? fmt(v, 3) : v}`);
        }
        let row;
        try { row = compileModelSpec(r.spec, { columns }).X[0]; }
        catch { return; }
        const beta = r._coefficients ?? r.fit?.ols?.beta;
        if (!Array.isArray(beta) || beta.length !== row.length) return;
        let yHat = 0;
        for (let i = 0; i < row.length; i++) yHat += row[i] * beta[i];

        // Prediction interval — only available when the active fit closure
        // and X'X⁻¹ are present (live result, before reload). For mixed
        // models we report the point prediction only for now.
        resultEl.style.display = 'block';
        resultEl.innerHTML = `Ŷ(${labelParts.join(', ')}) = <strong>${fmt(yHat)}</strong>`;
        return;
      }

      // Legacy multi-X path (continuous-only models without a spec).
      const xVals = [];
      const inputs = this._container.querySelectorAll('[data-predict-idx]');
      for (const inp of inputs) {
        const v = parseFloat(inp.value);
        if (isNaN(v)) return;
        xVals.push(v);
      }
      if (xVals.length !== r.xCount) return;

      const pred = predictMulti(r, xVals);
      resultEl.style.display = 'block';

      const xStr = xVals.map((v, i) => `${r._xNames[i]}=${fmt(v, 3)}`).join(', ');
      let html = `Ŷ(${xStr}) = <strong>${fmt(pred.yHat)}</strong>`;
      if (pred.piLow != null && pred.piHigh != null) {
        html += `<br><span class="reg__predict-ci">${t('predictionInterval', { level: (r.confLevel * 100).toFixed(0) })}: [${fmt(pred.piLow)}, ${fmt(pred.piHigh)}]</span>`;
      }
      resultEl.innerHTML = html;
    } else {
      // Single-X
      const xInput = this._container.querySelector('[data-ref="predict-x"]');
      const xVal = parseFloat(xInput.value);
      if (isNaN(xVal)) return;

      const pred = predictValue(r, xVal);
      resultEl.style.display = 'block';

      let html = `Ŷ(${fmt(xVal, 3)}) = <strong>${fmt(pred.yHat)}</strong>`;
      if (pred.piLow != null && pred.piHigh != null) {
        html += `<br><span class="reg__predict-ci">${t('predictionInterval', { level: (r.confLevel * 100).toFixed(0) })}: [${fmt(pred.piLow)}, ${fmt(pred.piHigh)}]</span>`;
      }
      resultEl.innerHTML = html;
    }
  },
};

Object.assign(mod, chartsMethods);
export default mod;
