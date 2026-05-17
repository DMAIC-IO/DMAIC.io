/**
 * D.Mike — GLM Regression Module (glm-regression.js)
 * Improve phase: Generalized Linear Models for attributive/count data.
 *
 * Supports:
 *   - Binary logistic regression (binomial / logit)
 *   - Poisson regression (log)
 *   - Negative binomial regression (log)
 *   - Auto-detect based on response variable
 *
 * Data comes from worksheet column pickers.
 * Uses the chart framework for all visualizations.
 */

import {
  fitGLM, autoDetect, buildGLMDesignMatrix, predictGLM,
  computeROC, classificationTable, hosmerLemeshow,
  overdispersionCheck, hatValues, cookDistance, computeGLMVIF,
  normalOrderStats,
} from '../../engines/glm-engine.js';
import { ColumnPicker, getColumnValues, getColumnName, discoverColumns, refToKey, keyToRef, isPickerFocused } from '../../ui/column-picker.js';
import { esc } from '../../core/html-utils.js';
import { chartsMethods } from './glm-regression-charts.js';
import { provisionWorksheet, removeProvisionedWorksheet } from '../../core/examples-registry.js';
import { saveModel, buildDataSnapshot, computeDataHash } from '../../core/models-store.js';

/** @param {number} v @param {number} d */
function fmt(v, d = 4) {
  if (v == null || !isFinite(v)) return '–';
  const abs = Math.abs(v);
  if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) return v.toExponential(d);
  return v.toFixed(d);
}
function fmtP(p) { return p < 0.0001 ? '< 0.0001' : p.toFixed(4); }
function sigClass(p) {
  if (p < 0.001) return 'glm__sig--high';
  if (p < 0.01) return 'glm__sig--med';
  if (p < 0.05) return 'glm__sig--low';
  return 'glm__sig--none';
}
function sigStars(p) {
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return '';
}

const mod = {
  id: 'glm-regression',
  phase: 'improve',
  allowedPhases: ['analyze', 'improve'],
  icon: 'git-branch',
  i18nKey: 'modules.glm-regression',
  version: '1.0.0',

  _container: null,
  _context: null,
  _colRefs: [],
  _yKey: null,
  /** Optional trials column for grouped binomial — y is then read as proportion. */
  _trialsKey: null,
  /** Which y level maps to the success class (1) for binary binomial fits.
   * `null` → keep default (higher of the two observed levels). User-chosen
   * value is stored as a number matching one of the observed y levels. */
  _successClass: null,
  /** @type {'auto'|'binomial'|'poisson'|'negbin'} */
  _method: 'auto',
  _confLevel: null,
  _alpha: null,
  _cutoff: 0.5,
  _result: null,
  _activeTab: 'model',
  _charts: [],
  _picker: null,
  _eventUnsubs: [],
  /** Worksheet provisioned by loadExample; removed and recreated on each
   *  subsequent example load so the column picker doesn't accumulate stale
   *  sheets. */
  _exampleWorksheetId: null,
  /** Id of the project-wide model record this instance has written to
   *  `state.models` — re-used on subsequent saves so the same record updates
   *  instead of accumulating duplicates. */
  _savedModelId: null,
  _savedModelName: null,

  help: () => import('./glm-regression-help.js'),

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    if (!document.getElementById('glm-regression-css')) {
      const link = document.createElement('link');
      link.id = 'glm-regression-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/glm-regression/glm-regression.css';
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

    // Only react to data changes that actually touch our predictors / response /
    // trials column. Without this filter every other module's settings save
    // would re-fit the GLM, which is wasteful and slows large datasets.
    const isOurColumn = (payload) => {
      if (!payload) return true; // legacy events without payload — refit to be safe
      const refs = [...this._colRefs];
      if (this._yKey) refs.push(keyToRef(this._yKey));
      if (this._trialsKey) refs.push(keyToRef(this._trialsKey));
      return refs.some(r =>
        r && r.instanceId === payload.instanceId &&
        (!payload.sheetId || r.sheetId === payload.sheetId) &&
        (!payload.columnId || r.columnId === payload.columnId)
      );
    };
    const onDataChange = (payload) => {
      this._updateYDropdown();
      if (isOurColumn(payload)) this._autoRun();
    };
    context.eventBus.on('state:saved', onDataChange);
    context.eventBus.on('worksheet:dataChanged', onDataChange);
    this._eventUnsubs.push(
      () => context.eventBus.off('state:saved', onDataChange),
      () => context.eventBus.off('worksheet:dataChanged', onDataChange),
    );

    // Delegated click handler bound once on the persistent container. Inner
    // controls are rebound per render in _bindEvents() because their elements
    // are replaced when innerHTML is rewritten, but this listener sits on the
    // container itself and would accumulate (double-/triple-firing tab clicks)
    // if it were rebound there.
    const onContainerClick = (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn || !this._container.contains(btn)) return;
      const action = btn.dataset.action;
      if (action === 'predict') this._runPrediction();
      else if (action === 'tab') this._switchTab(btn.dataset.tab);
      else if (action === 'swap-success') this._swapSuccessClass();
      else if (action === 'save-as-model') this._saveAsModel();
    };
    container.addEventListener('click', onContainerClick);
    this._eventUnsubs.push(() => container.removeEventListener('click', onContainerClick));

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) {
      this._colRefs = saved.colRefs || [];
      this._yKey = saved.yKey || null;
      this._trialsKey = saved.trialsKey || null;
      this._successClass = saved.successClass ?? null;
      this._method = saved.method || 'auto';
      this._confLevel = saved.confLevel ?? null;
      this._alpha = saved.alpha ?? null;
      this._cutoff = saved.cutoff ?? 0.5;
      this._result = saved.result || null;
      this._activeTab = saved.activeTab || 'model';
      this._savedModelId = saved.savedModelId ?? null;
      this._savedModelName = saved.savedModelName ?? null;
    }

    const globalConf = (context.stateManager.get('settings.confidenceLevel') ?? 95) / 100;
    if (this._confLevel == null) this._confLevel = globalConf;
    if (this._alpha == null) this._alpha = +(1 - globalConf).toFixed(4);

    this._render();
    if (this._result) {
      this._renderResults();
      // Slim result loaded from persistence — refit to repopulate residuals,
      // hat values, etc. so the diagnostic charts have data when the user
      // opens the tab. Skipped if the worksheet data has been removed.
      if (this._result._slim && this._yKey && this._colRefs.length > 0) {
        try { this._runAnalysis(); } catch { /* fall back to slim view */ }
      }
    } else {
      // No saved result yet but inputs already valid (e.g. restored session) —
      // fit immediately so users don't see an empty output panel.
      this._autoRun();
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
    if (this._result) this._renderResults();
  },

  onThemeChange() {
    this._destroyCharts();
    if (this._result) this._renderActiveChart();
  },

  getState() {
    return {
      colRefs: this._colRefs,
      yKey: this._yKey,
      trialsKey: this._trialsKey,
      successClass: this._successClass,
      method: this._method,
      confLevel: this._confLevel,
      alpha: this._alpha,
      cutoff: this._cutoff,
      result: this._slimResult(this._result),
      activeTab: this._activeTab,
      exampleWorksheetId: this._exampleWorksheetId,
      savedModelId: this._savedModelId,
      savedModelName: this._savedModelName,
    };
  },

  /**
   * Strip the heavy fields from a fit result before persisting. Removing the
   * raw design matrix, IRLS weights, residual / hat / cook arrays, and
   * (X'WX)⁻¹ saves ~80 % of the localStorage / IDB footprint for typical
   * datasets. Diagnostic charts need these arrays — `_runAnalysis()` is
   * called on init when slim state is detected, refitting in milliseconds
   * to repopulate them.
   */
  _slimResult(r) {
    if (!r) return null;
    const slim = { ...r, _slim: true };
    delete slim.X;
    delete slim.y;
    delete slim.invXtWX;
    delete slim.XtWX;
    delete slim.irlsWeights;
    delete slim.fittedValues;
    delete slim.linearPredictor;
    delete slim.devianceResiduals;
    delete slim.pearsonResiduals;
    delete slim._hat;
    delete slim._cooks;
    return slim;
  },

  /**
   * Load a catalog example. Project payloads ship a worksheet
   * (`sourceWorksheetData`) and colRefs/yKey/trialsKey with the literal
   * placeholder `__source__` as instanceId. We provision the worksheet,
   * rewrite the placeholder, apply the state, then run the GLM fit.
   *
   * @param {{ meta: object, data: object }} payload
   */
  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = (k) => this._context.i18n.t(k);

    const hasContent = (this._colRefs?.length > 0) || this._yKey || this._trialsKey;
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
        data.colRefs = (data.colRefs || []).map(r =>
          r?.instanceId === '__source__' ? { ...r, instanceId: ref.instanceId } : r,
        );
        if (typeof data.yKey === 'string' && data.yKey.startsWith('__source__|')) {
          data.yKey = data.yKey.replace('__source__', ref.instanceId);
        }
        if (typeof data.trialsKey === 'string' && data.trialsKey.startsWith('__source__|')) {
          data.trialsKey = data.trialsKey.replace('__source__', ref.instanceId);
        }
      }
    }

    // Drop any persisted result — the new worksheet will produce a fresh fit.
    delete data.result;

    this.setState(data);

    // setState doesn't auto-fit on its own (the guard `_autoRun` checks for
    // an existing _result). Trigger the analysis explicitly.
    try {
      this._runAnalysis();
    } catch (err) {
      console.error('[GLM-Regression] loadExample fit failed:', err);
    }
    this._save();

    const lang = this._context.i18n.getLanguage();
    const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
    this._context.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
  },

  setState(data) {
    if (!data) return;
    this._colRefs = data.colRefs || [];
    this._yKey = data.yKey || null;
    this._trialsKey = data.trialsKey || null;
    this._successClass = data.successClass ?? null;
    this._method = data.method || 'auto';
    const gc = (this._context?.stateManager.get('settings.confidenceLevel') ?? 95) / 100;
    this._confLevel = data.confLevel ?? gc;
    this._alpha = data.alpha ?? +(1 - gc).toFixed(4);
    this._cutoff = data.cutoff ?? 0.5;
    this._result = data.result || null;
    this._activeTab = data.activeTab || 'model';
    if (data.exampleWorksheetId !== undefined) this._exampleWorksheetId = data.exampleWorksheetId;
    this._savedModelId = data.savedModelId ?? null;
    this._savedModelName = data.savedModelName ?? null;
    if (this._container) {
      this._render();
      if (this._result) {
        this._renderResults();
        if (this._result._slim && this._yKey && this._colRefs.length > 0) {
          try { this._runAnalysis(); } catch { /* fall back to slim view */ }
        }
      }
    }
  },

  _save() {
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
  },

  // ─── Column helpers ────────────────────────────────────────

  _resolveColumn(ref) {
    if (!ref) return null;
    const ws = this._context.stateManager.getModuleState(ref.instanceId);
    if (!ws?.sheets) return null;
    const sheet = ws.sheets.find(s => s.id === ref.sheetId);
    if (!sheet?.state?.columns) return null;
    return sheet.state.columns.find(c => c.id === ref.columnId) || null;
  },

  _getRawValues(ref) {
    const col = this._resolveColumn(ref);
    if (!col) return [];
    return col.values || [];
  },

  _toNumeric(val) {
    if (val == null) return null;
    if (typeof val === 'number' && !isNaN(val)) return val;
    const n = Number(val);
    return isFinite(n) ? n : null;
  },

  _getNumericValues(ref) {
    return this._getRawValues(ref).map(v => this._toNumeric(v));
  },

  _getColumnDisplayName(ref) {
    if (!ref) return '?';
    const col = this._resolveColumn(ref);
    return col ? (col.name || col.shortName || '?') : '?';
  },

  _isCategorical(ref) {
    const col = this._resolveColumn(ref);
    return col?.type === 'text';
  },

  // ─── Render ────────────────────────────────────────────────

  _render() {
    if (this._picker) { this._picker.destroy(); this._picker = null; }
    const t = (k, v) => this._context.i18n.t(`modules.glm-regression.${k}`, v);

    const methodOpts = [
      { value: 'auto', label: t('methodAuto') },
      { value: 'binomial', label: t('methodBinomial') },
      { value: 'poisson', label: t('methodPoisson') },
      { value: 'negbin', label: t('methodNegbin') },
    ].map(m => `
      <label class="glm__method-option">
        <input type="radio" name="glm-method-${this._context.instanceId}" value="${m.value}"
          ${this._method === m.value ? 'checked' : ''}>
        ${esc(m.label)}
      </label>
    `).join('');

    this._container.innerHTML = `
      <div class="glm dmike-split">
        <div class="glm__input dmike-split__input">
          <div class="dmike-split__section-title">${t('sectionData')}</div>

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

          <div class="field-group">
            <label>${t('columnTrials')} <span class="dmike-hint">${t('columnTrialsHint')}</span></label>
            <select class="field" data-ref="trials-select">
              <option value="">${t('trialsNone')}</option>
            </select>
          </div>

          <div class="dmike-split__section-title">${t('sectionMethod')}</div>

          <div class="glm__method-group" data-ref="method-group">
            ${methodOpts}
          </div>

          <div class="glm__detect-info" data-ref="detect-info"></div>

          <div class="dmike-split__section-title">${t('sectionSettings')}</div>

          <div class="field-row">
            <div class="field-group field-group--grow">
              <label>${t('confLevel')} (%)</label>
              <input type="text" class="field field--num" data-ref="conf-level" inputmode="decimal"
                value="${+(this._confLevel * 100).toFixed(2)}" placeholder="95">
            </div>
            <div class="field-group field-group--grow">
              <label>${t('alphaRisk')} (%)</label>
              <input type="text" class="field field--num" data-ref="alpha-level" inputmode="decimal"
                value="${+(this._alpha * 100).toFixed(2)}" placeholder="5">
            </div>
          </div>

          <div class="glm__error" data-ref="error-box"></div>
        </div>

        <div class="glm__output dmike-split__output">
          <div data-ref="results" style="display:none"></div>
        </div>
      </div>
    `;

    this._initPicker();
    this._updateYDropdown();
    this._bindEvents();
  },

  _initPicker() {
    const wrap = this._container.querySelector('[data-ref="picker-cols"]');
    this._picker = new ColumnPicker(wrap, this._context, {
      mode: 'multi',
      // 'text' columns are treated as categorical predictors — buildGLMDesignMatrix
      // dummy-codes them with the first sorted level as reference.
      types: ['numeric', 'currency', 'percent', 'text'],
      minCount: 1,
      onChange: (refs) => {
        this._colRefs = refs;
        if (this._yKey && refs.some(r => refToKey(r) === this._yKey)) {
          this._yKey = null;
        }
        this._updateYDropdown(true);
        this._save();
        this._autoRun();
      },
    });
    if (this._colRefs.length > 0) this._picker.value = this._colRefs;
  },

  _updateYDropdown(force = false) {
    if (!force && isPickerFocused(this._container)) return;
    const t = (k) => this._context.i18n.t(`modules.glm-regression.${k}`);
    const sel = this._container.querySelector('[data-ref="y-select"]');
    const trialsSel = this._container.querySelector('[data-ref="trials-select"]');
    if (!sel) return;

    const selectedKeys = new Set(this._colRefs.map(r => refToKey(r)));
    const allCols = discoverColumns(this._context.stateManager, { minCount: 1 });

    let html = `<option value="">${t('selectYHint')}</option>`;
    let trialsHtml = `<option value="">${t('trialsNone')}</option>`;
    for (const col of allCols) {
      const ref = { instanceId: col.instanceId, sheetId: col.sheetId, columnId: col.columnId };
      const key = refToKey(ref);
      if (selectedKeys.has(key)) continue;
      const name = col.columnName || col.shortName || '?';
      const yOpt = key === this._yKey ? ' selected' : '';
      html += `<option value="${key}"${yOpt}>${esc(name)}</option>`;
      // Trials dropdown excludes the Y column too — same column can't be both.
      if (key === this._yKey) continue;
      const tOpt = key === this._trialsKey ? ' selected' : '';
      trialsHtml += `<option value="${key}"${tOpt}>${esc(name)}</option>`;
    }
    sel.innerHTML = html;
    if (trialsSel) trialsSel.innerHTML = trialsHtml;

    if (this._yKey && !sel.querySelector(`option[value="${this._yKey}"]`)) {
      this._yKey = null;
      sel.value = '';
    }
    if (this._trialsKey && trialsSel && !trialsSel.querySelector(`option[value="${this._trialsKey}"]`)) {
      this._trialsKey = null;
      if (trialsSel) trialsSel.value = '';
    }
  },

  _bindEvents() {
    const c = this._container;

    c.querySelector('[data-ref="y-select"]')?.addEventListener('change', (e) => {
      this._yKey = e.target.value || null;
      // Y change can collide with trials selection — refresh and clear if same.
      if (this._yKey && this._trialsKey === this._yKey) this._trialsKey = null;
      this._updateYDropdown(true);
      this._save();
      this._autoRun();
    });

    c.querySelector('[data-ref="trials-select"]')?.addEventListener('change', (e) => {
      this._trialsKey = e.target.value || null;
      this._save();
      this._autoRun();
    });

    c.querySelector('[data-ref="method-group"]')?.addEventListener('change', (e) => {
      if (e.target.name?.startsWith('glm-method')) {
        this._method = e.target.value;
        this._save();
        this._autoRun();
      }
    });

    // _confLevel is the single source of truth. The α field is purely a
    // mirror — it is computed from confLevel for display, and writing to it
    // simply updates confLevel without re-deriving α from itself. This avoids
    // the float-rounding drift that accumulates when both fields round-trip.
    c.querySelector('[data-ref="conf-level"]')?.addEventListener('change', (e) => {
      const v = parseFloat(e.target.value);
      if (v > 0 && v < 100) {
        this._confLevel = v / 100;
        this._alpha = 1 - this._confLevel;
        const alphaEl = c.querySelector('[data-ref="alpha-level"]');
        if (alphaEl) alphaEl.value = +(this._alpha * 100).toFixed(2);
        this._save();
        this._autoRun();
      }
    });

    c.querySelector('[data-ref="alpha-level"]')?.addEventListener('change', (e) => {
      const v = parseFloat(e.target.value);
      if (v > 0 && v < 100) {
        this._confLevel = 1 - v / 100;
        this._alpha = v / 100;
        const confEl = c.querySelector('[data-ref="conf-level"]');
        if (confEl) confEl.value = +(this._confLevel * 100).toFixed(2);
        this._save();
        this._autoRun();
      }
    });

    // Container-level click delegation is bound once in init() so it doesn't
    // accumulate across re-renders.
  },

  /** Toggle which y level represents success and re-run the binomial fit. */
  _swapSuccessClass() {
    const info = this._result?._successClassInfo;
    if (!info) return;
    this._successClass = info.failure;
    this._save();
    this._runAnalysis();
  },

  _autoRun() {
    if (this._colRefs.length > 0 && this._yKey) {
      this._runAnalysis();
    }
  },

  // ─── Analysis ──────────────────────────────────────────────

  _runAnalysis() {
    const t = (k) => this._context.i18n.t(`modules.glm-regression.${k}`);
    const errBox = this._container.querySelector('[data-ref="error-box"]');
    const show = (msg) => { if (errBox) { errBox.textContent = msg; errBox.style.display = 'block'; } };
    const hide = () => { if (errBox) errBox.style.display = 'none'; };
    hide();

    if (this._colRefs.length === 0) { show(t('errorNoX')); return; }
    if (!this._yKey) { show(t('errorNoY')); return; }

    const yRef = keyToRef(this._yKey);
    const yRaw = this._getRawValues(yRef);
    const yName = this._getColumnDisplayName(yRef);

    const xNames = [];
    const xRawCols = [];
    const xIsCat = [];
    for (const ref of this._colRefs) {
      xNames.push(this._getColumnDisplayName(ref));
      xIsCat.push(this._isCategorical(ref));
      // Categorical columns keep their raw string values; numeric columns are
      // coerced via _toNumeric (null for non-parseable cells, which the row
      // filter below will then drop).
      xRawCols.push(this._isCategorical(ref) ? this._getRawValues(ref) : this._getNumericValues(ref));
    }

    // Optional trials column (grouped binomial). Numeric, > 0.
    const trialsRef = this._trialsKey ? keyToRef(this._trialsKey) : null;
    const trialsRaw = trialsRef ? this._getNumericValues(trialsRef) : null;

    const maxLen = Math.min(
      yRaw.length,
      ...xRawCols.map(c => c.length),
      ...(trialsRaw ? [trialsRaw.length] : []),
    );
    const y = [];
    const xCols = xRawCols.map(() => []);
    const weights = trialsRaw ? [] : null;

    for (let i = 0; i < maxLen; i++) {
      const yv = this._toNumeric(yRaw[i]);
      if (yv === null) continue;
      let allOk = true;
      for (let j = 0; j < xRawCols.length; j++) {
        const v = xRawCols[j][i];
        // Categorical: empty string / null / undefined → missing.
        // Numeric:    _toNumeric already returned null for unparseable cells.
        if (xIsCat[j] ? (v == null || v === '') : v === null) { allOk = false; break; }
      }
      if (!allOk) continue;
      if (trialsRaw) {
        const w = trialsRaw[i];
        if (w === null || w <= 0) continue;
        weights.push(w);
      }
      y.push(yv);
      for (let j = 0; j < xRawCols.length; j++) xCols[j].push(xRawCols[j][i]);
    }

    if (y.length < 3) { show(t('errorTooFew')); return; }

    const columns = xCols.map((vals, j) => ({
      values: vals,
      name: xNames[j],
      categorical: xIsCat[j],
    }));

    const { X, terms } = buildGLMDesignMatrix(columns);
    this._fitAndDisplay(X, y, terms, yName, xNames, weights);
  },

  _fitAndDisplay(X, y, terms, yName, xNames, weights = null) {
    const t = (k) => this._context.i18n.t(`modules.glm-regression.${k}`);
    const errBox = this._container.querySelector('[data-ref="error-box"]');
    const show = (msg) => { if (errBox) { errBox.textContent = msg; errBox.style.display = 'block'; } };
    const hide = () => { if (errBox) errBox.style.display = 'none'; };
    hide();

    let familyName, link;
    if (this._method === 'auto') {
      const detected = autoDetect(y);
      familyName = detected.familyName;
      link = detected.link;

      const infoEl = this._container.querySelector('[data-ref="detect-info"]');
      if (infoEl) {
        infoEl.textContent = t(detected.reasonKey);
        infoEl.classList.add('glm__detect-info--visible');
      }
    } else {
      familyName = this._method;
      link = this._method === 'binomial' ? 'logit' : 'log';
      const infoEl = this._container.querySelector('[data-ref="detect-info"]');
      if (infoEl) infoEl.classList.remove('glm__detect-info--visible');
    }

    if (familyName === 'binomial') {
      if (weights) {
        // Grouped binomial: y = proportion in [0, 1], weights = trial counts.
        // Validate the proportion range and consistency with the trials column.
        for (let i = 0; i < y.length; i++) {
          if (y[i] < 0 || y[i] > 1) { show(t('errorProportionRange')); return; }
          if (weights[i] < 1 || !Number.isFinite(weights[i])) { show(t('errorTrialsInvalid')); return; }
        }
      } else {
        const unique = new Set(y);
        if (unique.size > 2) {
          show(t('errorNotBinary'));
          return;
        }
        if (unique.size === 1) {
          show(t('errorNotBinary'));
          return;
        }
        // unique.size === 2 — pick which level represents success.
        const levels = [...unique].sort((a, b) => a - b);
        // If the user has chosen a successClass that matches one of the levels,
        // honour it; otherwise default to the higher level (legacy behaviour).
        const success = (this._successClass !== null && unique.has(this._successClass))
          ? this._successClass
          : levels[1];
        const failure = success === levels[0] ? levels[1] : levels[0];
        // Remap unless the data is already coded {0=failure, 1=success}.
        if (!(success === 1 && failure === 0)) {
          for (let i = 0; i < y.length; i++) {
            y[i] = y[i] === success ? 1 : 0;
          }
        }
        this._successInfo = { success, failure };
      }
    } else {
      this._successInfo = null;
    }

    const n = y.length;
    const p = X[0].length;
    if (n <= p) { show(t('errorTooFewForP')); return; }

    // Two-pass fit for Poisson: first IRLS run detects overdispersion, then we
    // refit as quasi-Poisson (estimateDispersion=true) so SE / z / p / CI are
    // φ-scaled. Binomial keeps φ = 1; NegBin absorbs dispersion via θ.
    let result;
    let quasiActivated = false;
    try {
      result = fitGLM(X, y, {
        familyName,
        link,
        terms,
        confLevel: this._confLevel,
        weights: weights ?? undefined,
      });
      if (result.converged && familyName === 'poisson') {
        const od = overdispersionCheck(result.pearsonResiduals, result.n, result.p);
        if (od.overdispersed) {
          result = fitGLM(X, y, {
            familyName,
            link,
            terms,
            confLevel: this._confLevel,
            estimateDispersion: true,
            weights: weights ?? undefined,
          });
          quasiActivated = true;
        }
      }
    } catch (err) {
      show(`${t('errorFit')}: ${err.message}`);
      return;
    }

    if (!result.converged) {
      show(t('errorNoConverge'));
      return;
    }

    result._yName = yName;
    result._xNames = xNames;
    result._quasiActivated = quasiActivated;
    if (this._successInfo) result._successClassInfo = this._successInfo;

    const hat = hatValues(X, result.invXtWX, result.irlsWeights);
    result._hat = hat;
    result._cooks = cookDistance(result.pearsonResiduals, hat, p, result.dispersion);

    if (X[0].length > 2) {
      result._vifs = computeGLMVIF(X, result.irlsWeights);
    }

    if (familyName === 'binomial') {
      result._roc = computeROC(y, result.fittedValues);
      result._classTable = classificationTable(y, result.fittedValues, this._cutoff);
      result._hl = hosmerLemeshow(y, result.fittedValues);
    }

    if (familyName === 'poisson') {
      result._overdispersion = overdispersionCheck(result.pearsonResiduals, n, p);
    }

    this._result = result;
    this._save();
    this._renderResults();
  },

  // ─── Results rendering ─────────────────────────────────────

  _renderResults() {
    const r = this._result;
    if (!r || !r.converged) return;

    const t = (k, v) => this._context.i18n.t(`modules.glm-regression.${k}`, v);
    const resultsEl = this._container.querySelector('[data-ref="results"]');
    if (!resultsEl) return;
    resultsEl.style.display = '';

    const isBinomial = r.family.name === 'binomial';
    const isPoisson = r.family.name === 'poisson';
    const isNegbin = r.family.name === 'negbin';

    const tabs = [
      { id: 'model', label: t('tabModel') },
      { id: 'diagnostics', label: t('tabDiagnostics') },
    ];
    if (isBinomial) tabs.push({ id: 'roc', label: t('tabROC') });
    tabs.push({ id: 'prediction', label: t('tabPrediction') });

    const tabsHtml = tabs.map(tb =>
      `<button class="dmike-tab${tb.id === this._activeTab ? ' dmike-tab--active' : ''}" data-action="tab" data-tab="${tb.id}">${esc(tb.label)}</button>`
    ).join('');

    let html = `<div class="glm__tabs dmike-tabs">${tabsHtml}</div>`;

    // Tab: Model
    html += `<div class="dmike-tab-content${this._activeTab === 'model' ? ' dmike-tab-content--active' : ''}" data-tab-content="model">`;
    html += this._renderModelTab(r, t);
    html += `</div>`;

    // Tab: Diagnostics
    html += `<div class="dmike-tab-content${this._activeTab === 'diagnostics' ? ' dmike-tab-content--active' : ''}" data-tab-content="diagnostics">`;
    html += this._renderDiagnosticsTab(r, t);
    html += `</div>`;

    // Tab: ROC (binomial only)
    if (isBinomial) {
      html += `<div class="dmike-tab-content${this._activeTab === 'roc' ? ' dmike-tab-content--active' : ''}" data-tab-content="roc">`;
      html += this._renderROCTab(r, t);
      html += `</div>`;
    }

    // Tab: Prediction
    html += `<div class="dmike-tab-content${this._activeTab === 'prediction' ? ' dmike-tab-content--active' : ''}" data-tab-content="prediction">`;
    html += this._renderPredictionTab(r, t);
    html += `</div>`;

    resultsEl.innerHTML = html;

    this._bindCutoffSlider(r);
    this._renderActiveChart();
  },

  // ─── Model Tab ─────────────────────────────────────────────

  _renderModelTab(r, t) {
    let html = '';
    const isBinomial = r.family.name === 'binomial';
    const isCount = r.family.name === 'poisson' || r.family.name === 'negbin';

    // Warnings
    const warnings = [];
    if (r.separationStrong) warnings.push(t('warnSeparationStrong'));
    else if (r.separationDetected) warnings.push(t('warnSeparation'));
    if (r.n / r.p < 10) warnings.push(t('warnSmallN'));
    if (r.iterations >= 40) warnings.push(t('warnSlowConverge'));
    if (r._overdispersion?.overdispersed) warnings.push(t('warnOverdispersion'));
    if (r._quasiActivated) warnings.push(t('warnQuasiActivated', { phi: r.dispersion.toFixed(2) }));
    if (r.thetaEstimated && r.thetaConverged === false) {
      warnings.push(t('warnThetaUnstable', { theta: r.family?.theta?.toFixed?.(2) ?? '–' }));
    }

    if (warnings.length > 0) {
      html += warnings.map(w => `<div class="glm__warning">${esc(w)}</div>`).join('');
    }

    // Save-as-Model action — exposes this fit to the Response Optimizer
    // (modules/response-optimization) via state.models[].
    html += `
      <div class="glm__model-actions">
        <button class="btn btn--primary" data-action="save-as-model" type="button"
                title="${esc(t('saveAsModelHint'))}">
          ${this._savedModelId ? t('updateModel') : t('saveAsModel')}
        </button>
        <span class="glm__model-status" data-ref="model-status">${this._savedModelId ? t('modelSaved') : ''}</span>
      </div>
    `;

    // Family info
    html += `<div class="dmike-split__output-section">${t('modelSummary')}</div>`;
    html += `<div class="glm__quality-grid">`;
    html += `<div class="glm__quality-item"><span class="glm__quality-label">${t('family')}</span><span class="glm__quality-value">${esc(t('family_' + r.family.name))}</span></div>`;
    html += `<div class="glm__quality-item"><span class="glm__quality-label">${t('linkFunction')}</span><span class="glm__quality-value">${esc(r.family.link)}</span></div>`;
    html += `<div class="glm__quality-item"><span class="glm__quality-label">n</span><span class="glm__quality-value">${r.n}</span></div>`;
    html += `<div class="glm__quality-item"><span class="glm__quality-label">${t('iterations')}</span><span class="glm__quality-value">${r.iterations}</span></div>`;
    if (r.family.theta != null) {
      html += `<div class="glm__quality-item"><span class="glm__quality-label">θ (dispersion)</span><span class="glm__quality-value">${fmt(r.family.theta, 3)}</span></div>`;
    }
    if (r._successClassInfo) {
      const info = r._successClassInfo;
      html += `<div class="glm__quality-item">
        <span class="glm__quality-label">${t('successClass')}</span>
        <span class="glm__quality-value">
          ${esc(String(info.success))}
          <button class="btn btn--xs" data-action="swap-success" type="button"
                  title="${esc(t('swapSuccessTitle'))}">
            ↔ ${esc(String(info.failure))}
          </button>
        </span>
      </div>`;
    }
    html += `</div>`;

    // KPI strip
    html += `<div class="dmike-kpi-strip">`;
    const mcfR2 = r.pseudoR2.mcfadden;
    const nagR2 = r.pseudoR2.nagelkerke;
    const mcfClass = mcfR2 >= 0.4 ? 'dmike-kpi--good' : mcfR2 >= 0.2 ? 'dmike-kpi--warn' : 'dmike-kpi--bad';
    const nagClass = nagR2 >= 0.8 ? 'dmike-kpi--good' : nagR2 >= 0.5 ? 'dmike-kpi--warn' : 'dmike-kpi--bad';
    html += `<div class="dmike-kpi ${mcfClass}"><div class="dmike-kpi-value">${fmt(mcfR2, 4)}</div><div class="dmike-kpi-label">McFadden R²</div></div>`;
    html += `<div class="dmike-kpi ${nagClass}"><div class="dmike-kpi-value">${fmt(nagR2, 4)}</div><div class="dmike-kpi-label">Nagelkerke R²</div></div>`;
    html += `<div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(r.aic, 2)}</div><div class="dmike-kpi-label">AIC</div></div>`;
    html += `<div class="dmike-kpi"><div class="dmike-kpi-value">${fmt(r.bic, 2)}</div><div class="dmike-kpi-label">BIC</div></div>`;
    if (isBinomial && r._roc) {
      const aucClass = r._roc.auc >= 0.8 ? 'dmike-kpi--good' : r._roc.auc >= 0.6 ? 'dmike-kpi--warn' : 'dmike-kpi--bad';
      html += `<div class="dmike-kpi ${aucClass}"><div class="dmike-kpi-value">${fmt(r._roc.auc, 4)}</div><div class="dmike-kpi-label">AUC</div></div>`;
    }
    html += `</div>`;

    // Model quality details
    html += `<div class="dmike-split__output-section">${t('modelQuality')}</div>`;
    html += `<div class="glm__quality-grid">`;
    html += `<div class="glm__quality-item"><span class="glm__quality-label">${t('deviance')}</span><span class="glm__quality-value">${fmt(r.deviance, 4)}</span></div>`;
    html += `<div class="glm__quality-item"><span class="glm__quality-label">${t('nullDeviance')}</span><span class="glm__quality-value">${fmt(r.nullDeviance, 4)}</span></div>`;
    html += `<div class="glm__quality-item"><span class="glm__quality-label">${t('logLikelihood')}</span><span class="glm__quality-value">${fmt(r.logLikelihood, 4)}</span></div>`;
    html += `<div class="glm__quality-item"><span class="glm__quality-label">Cox-Snell R²</span><span class="glm__quality-value">${fmt(r.pseudoR2.coxSnell, 4)}</span></div>`;

    if (isBinomial && r._hl) {
      html += `<div class="glm__quality-item"><span class="glm__quality-label">${t('hosmerLemeshow')}</span><span class="glm__quality-value">χ² = ${fmt(r._hl.statistic, 3)}, p = ${fmtP(r._hl.pValue)}</span></div>`;
    }
    if (r._overdispersion) {
      html += `<div class="glm__quality-item"><span class="glm__quality-label">${t('overdispersionRatio')}</span><span class="glm__quality-value">${fmt(r._overdispersion.ratio, 3)}</span></div>`;
    }
    html += `</div>`;

    // Model equation
    html += `<div class="dmike-split__output-section">${t('equation')}</div>`;
    html += `<div class="glm__equation">${this._buildEquation(r)}</div>`;

    // Coefficient table
    html += `<div class="dmike-split__output-section">${t('coefTable')}</div>`;
    html += this._buildCoefTable(r, t);

    return html;
  },

  _buildEquation(r) {
    const isBinomial = r.family.name === 'binomial';
    const isCount = r.family.name === 'poisson' || r.family.name === 'negbin';

    let lhs = isBinomial ? 'logit(p)' : 'log(μ)';
    let eq = `${lhs} = ${fmt(r.coefficients[0], 4)}`;

    for (let j = 1; j < r.terms.length; j++) {
      const c = r.coefficients[j];
      // Wrap interaction terms (those containing the · separator) in parens
      // so "+ 0.12·(X1·X2)" can't be misread as a triple product.
      const term = r.terms[j];
      const rendered = term.includes('·') ? `(${esc(term)})` : esc(term);
      eq += ` ${c >= 0 ? '+' : '−'} ${fmt(Math.abs(c), 4)}·${rendered}`;
    }
    return eq;
  },

  _buildCoefTable(r, t) {
    const isBinomial = r.family.name === 'binomial';
    const isCount = r.family.name === 'poisson' || r.family.name === 'negbin';

    let ratioHeader = '';
    if (isBinomial) {
      ratioHeader = `<th>OR</th>`;
    } else if (isCount) {
      ratioHeader = `<th>RR</th>`;
    }

    let html = `<table class="glm__coef-table">
      <thead><tr>
        <th>${t('term')}</th>
        <th>${t('coefficient')}</th>
        <th>SE</th>
        <th>z</th>
        <th>${t('pValue')}</th>
        ${ratioHeader}
        <th></th>
      </tr></thead><tbody>`;

    for (let j = 0; j < r.terms.length; j++) {
      const sc = sigClass(r.pValues[j]);
      const stars = sigStars(r.pValues[j]);

      let ratioCell = '';
      if (isBinomial && r.oddsRatios) {
        ratioCell = `<td>${j === 0 ? '–' : `${fmt(r.oddsRatios[j].or, 4)} [${fmt(r.oddsRatios[j].lower, 4)}, ${fmt(r.oddsRatios[j].upper, 4)}]`}</td>`;
      } else if (isCount && r.rateRatios) {
        ratioCell = `<td>${j === 0 ? '–' : `${fmt(r.rateRatios[j].rr, 4)} [${fmt(r.rateRatios[j].lower, 4)}, ${fmt(r.rateRatios[j].upper, 4)}]`}</td>`;
      }

      html += `<tr>
        <td>${esc(r.terms[j])}</td>
        <td>${fmt(r.coefficients[j])} [${fmt(r.ciLower[j])}, ${fmt(r.ciUpper[j])}]</td>
        <td>${fmt(r.stdErrors[j])}</td>
        <td>${fmt(r.zValues[j])}</td>
        <td class="${sc}">${fmtP(r.pValues[j])}</td>
        ${ratioCell}
        <td class="${sc}">${stars}</td>
      </tr>`;
    }

    html += `</tbody></table>`;
    return html;
  },

  // ─── Diagnostics Tab ───────────────────────────────────────

  _renderDiagnosticsTab(r, t) {
    let html = '';

    html += `<div class="dmike-split__output-section">${t('residualsVsFitted')}</div>`;
    html += `<div data-ref="chart-residuals" style="height:280px"></div>`;

    html += `<div class="dmike-split__output-section">${t('qqTitle')}</div>`;
    html += `<div data-ref="chart-qq" style="height:280px"></div>`;

    html += `<div class="dmike-split__output-section">${t('cooksTitle')}</div>`;
    html += `<div data-ref="chart-cooks" style="height:250px"></div>`;

    // VIF table
    if (r._vifs && r._vifs.length > 0) {
      html += `<div class="dmike-split__output-section">VIF</div>`;
      html += `<table class="glm__coef-table"><thead><tr><th>${t('term')}</th><th>VIF</th><th></th></tr></thead><tbody>`;
      for (let j = 0; j < r._vifs.length; j++) {
        const vif = r._vifs[j];
        const warn = vif > 10 ? 'glm__sig--high' : vif > 5 ? 'glm__sig--low' : '';
        html += `<tr><td>${esc(r.terms[j + 1])}</td><td>${fmt(vif, 2)}</td><td class="${warn}">${vif > 10 ? '⚠' : vif > 5 ? '!' : ''}</td></tr>`;
      }
      html += `</tbody></table>`;
    }

    // Overdispersion
    if (r._overdispersion) {
      const od = r._overdispersion;
      html += `<div class="dmike-split__output-section">${t('overdispersionTitle')}</div>`;
      html += `<div class="glm__quality-grid">`;
      html += `<div class="glm__quality-item"><span class="glm__quality-label">Pearson χ²</span><span class="glm__quality-value">${fmt(od.pearsonChi2, 3)}</span></div>`;
      html += `<div class="glm__quality-item"><span class="glm__quality-label">df</span><span class="glm__quality-value">${od.df}</span></div>`;
      html += `<div class="glm__quality-item"><span class="glm__quality-label">χ²/df</span><span class="glm__quality-value">${fmt(od.ratio, 3)}</span></div>`;
      html += `</div>`;
      if (od.overdispersed) {
        html += `<div class="glm__warning">${t('overdispersionHint')}</div>`;
      }
    }

    return html;
  },

  // ─── ROC Tab ───────────────────────────────────────────────

  _renderROCTab(r, t) {
    let html = '';

    html += `<div class="dmike-split__output-section">${t('rocCurve')}</div>`;
    html += `<div data-ref="chart-roc" style="height:320px"></div>`;

    // Classification table
    html += `<div class="dmike-split__output-section">${t('classificationTitle')}</div>`;

    html += `<div class="glm__cutoff-row">
      <label>${t('cutoff')}</label>
      <input type="range" min="0" max="1" step="0.01" value="${this._cutoff}" data-ref="cutoff-slider">
      <span class="glm__cutoff-value" data-ref="cutoff-display">${this._cutoff.toFixed(2)}</span>
    </div>`;

    const ct = r._classTable || classificationTable(r.y, r.fittedValues, this._cutoff);
    html += this._buildClassTable(ct, t);

    html += `<div class="glm__quality-grid" data-ref="class-metrics">`;
    html += `<div class="glm__quality-item"><span class="glm__quality-label">${t('sensitivity')}</span><span class="glm__quality-value">${fmt(ct.sensitivity, 4)}</span></div>`;
    html += `<div class="glm__quality-item"><span class="glm__quality-label">${t('specificity')}</span><span class="glm__quality-value">${fmt(ct.specificity, 4)}</span></div>`;
    html += `<div class="glm__quality-item"><span class="glm__quality-label">${t('accuracy')}</span><span class="glm__quality-value">${fmt(ct.accuracy, 4)}</span></div>`;
    html += `<div class="glm__quality-item"><span class="glm__quality-label">${t('precision')}</span><span class="glm__quality-value">${fmt(ct.precision, 4)}</span></div>`;
    html += `</div>`;

    if (r._roc) {
      html += `<div class="glm__quality-grid">`;
      html += `<div class="glm__quality-item"><span class="glm__quality-label">AUC</span><span class="glm__quality-value">${fmt(r._roc.auc, 4)}</span></div>`;
      html += `</div>`;
    }

    return html;
  },

  _buildClassTable(ct, t) {
    return `<table class="glm__class-table">
      <thead>
        <tr><th></th><th>${t('predicted')} 1</th><th>${t('predicted')} 0</th></tr>
      </thead>
      <tbody>
        <tr><th>${t('actual')} 1</th><td class="glm__tp">${ct.tp}</td><td class="glm__fn">${ct.fn}</td></tr>
        <tr><th>${t('actual')} 0</th><td class="glm__fp">${ct.fp}</td><td class="glm__tn">${ct.tn}</td></tr>
      </tbody>
    </table>`;
  },

  _bindCutoffSlider(r) {
    const slider = this._container.querySelector('[data-ref="cutoff-slider"]');
    if (!slider) return;

    slider.addEventListener('input', (e) => {
      this._cutoff = parseFloat(e.target.value);
      const display = this._container.querySelector('[data-ref="cutoff-display"]');
      if (display) display.textContent = this._cutoff.toFixed(2);

      const ct = classificationTable(r.y, r.fittedValues, this._cutoff);
      r._classTable = ct;

      const t = (k) => this._context.i18n.t(`modules.glm-regression.${k}`);

      const tableEl = this._container.querySelector('.glm__class-table');
      if (tableEl) tableEl.outerHTML = this._buildClassTable(ct, t);

      const metricsEl = this._container.querySelector('[data-ref="class-metrics"]');
      if (metricsEl) {
        metricsEl.innerHTML = `
          <div class="glm__quality-item"><span class="glm__quality-label">${t('sensitivity')}</span><span class="glm__quality-value">${fmt(ct.sensitivity, 4)}</span></div>
          <div class="glm__quality-item"><span class="glm__quality-label">${t('specificity')}</span><span class="glm__quality-value">${fmt(ct.specificity, 4)}</span></div>
          <div class="glm__quality-item"><span class="glm__quality-label">${t('accuracy')}</span><span class="glm__quality-value">${fmt(ct.accuracy, 4)}</span></div>
          <div class="glm__quality-item"><span class="glm__quality-label">${t('precision')}</span><span class="glm__quality-value">${fmt(ct.precision, 4)}</span></div>`;
      }
      this._save();
    });
  },

  // ─── Prediction Tab ────────────────────────────────────────

  _renderPredictionTab(r, t) {
    let html = `<div class="dmike-split__output-section">${t('predictionTitle')}</div>`;

    html += `<div class="glm__predict-inputs">`;
    for (let j = 1; j < r.terms.length; j++) {
      html += `<div class="glm__predict-row">
        <label>${esc(r.terms[j])}</label>
        <input type="text" class="field field--num" data-ref="pred-x-${j}" inputmode="decimal" placeholder="0">
      </div>`;
    }
    html += `</div>`;

    html += `<button class="btn btn--xs" data-action="predict" type="button">${t('predictCalc')}</button>`;
    html += `<div class="glm__predict-result" data-ref="predict-result" style="display:none"></div>`;

    return html;
  },

  /**
   * Persist the current GLM fit as a `state.models[id]` entry so it can be
   * referenced from the response-optimization module. Re-uses an existing id
   * (`_savedModelId`) when present so repeated clicks update the same record
   * instead of creating duplicates.
   *
   * The record carries `family` ({name, link, theta?}) which makes
   * `predictFromModel` apply the inverse link (logit→probability, log→rate)
   * so the optimiser works on the response scale, not on η = Xβ.
   */
  _saveAsModel() {
    const r = this._result;
    if (!r || !r.converged) return;
    const t = (k, v) => this._context.i18n.t(`modules.glm-regression.${k}`, v);

    // Re-read raw factor columns from the worksheet so we get the natural-scale
    // values needed for factorSpec bounds and the data snapshot. Mirrors the
    // row-filtering logic in _runAnalysis so that (X, y) here matches the fit.
    const yRef = keyToRef(this._yKey);
    const yRaw = this._getRawValues(yRef);
    const yName = this._getColumnDisplayName(yRef);

    const xNames = [];
    const xRawCols = [];
    const xIsCat = [];
    for (const ref of this._colRefs) {
      xNames.push(this._getColumnDisplayName(ref));
      xIsCat.push(this._isCategorical(ref));
      xRawCols.push(this._isCategorical(ref) ? this._getRawValues(ref) : this._getNumericValues(ref));
    }

    const trialsRef = this._trialsKey ? keyToRef(this._trialsKey) : null;
    const trialsRaw = trialsRef ? this._getNumericValues(trialsRef) : null;

    const maxLen = Math.min(
      yRaw.length,
      ...xRawCols.map(c => c.length),
      ...(trialsRaw ? [trialsRaw.length] : []),
    );
    const y = [];
    const xCols = xRawCols.map(() => []);
    for (let i = 0; i < maxLen; i++) {
      const yv = this._toNumeric(yRaw[i]);
      if (yv === null) continue;
      let allOk = true;
      for (let j = 0; j < xRawCols.length; j++) {
        const v = xRawCols[j][i];
        if (xIsCat[j] ? (v == null || v === '') : v === null) { allOk = false; break; }
      }
      if (!allOk) continue;
      if (trialsRaw) {
        const w = trialsRaw[i];
        if (w === null || w <= 0) continue;
      }
      y.push(yv);
      for (let j = 0; j < xRawCols.length; j++) xCols[j].push(xRawCols[j][i]);
    }

    if (y.length === 0) {
      this._context.notify(t('errorTooFew'), 'error');
      return;
    }

    // factorSpec: continuous → numeric bounds (used by optimiser as box).
    //             categorical → levels list + reference (used by hybrid path).
    const factorSpec = xNames.map((name, j) => {
      if (xIsCat[j]) {
        const levels = [...new Set(xCols[j])].sort();
        return { name, kind: 'categorical', levels, reference: levels[0] };
      }
      let lo =  Infinity, hi = -Infinity;
      for (const v of xCols[j]) { if (v < lo) lo = v; if (v > hi) hi = v; }
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) {
        return { name, kind: 'continuous', low: -1, high: 1 };
      }
      return { name, kind: 'continuous', low: lo, high: hi };
    });

    // spec.predictors drives the optimiser's hybrid-path detection (any
    // predictor with kind: 'categorical' triggers Cartesian enumeration of
    // levels). `spec.terms` is intentionally empty — for GLM, predictFromModel
    // evaluates `model.terms` (dummy-coded) and not spec.terms.
    const specPredictors = factorSpec.map(f => f.kind === 'categorical'
      ? { id: f.name, kind: 'categorical', levels: f.levels, reference: f.reference }
      : { id: f.name, kind: 'continuous' });

    // X for the dataSnapshot/hash — the dummy-coded design matrix produced by
    // buildGLMDesignMatrix matches r.X, but live `r.X` may have been slim-stripped
    // after a reload; rebuild here so the call is reliable.
    const columns = xCols.map((vals, j) => ({
      values: vals,
      name: xNames[j],
      categorical: xIsCat[j],
    }));
    const { X } = buildGLMDesignMatrix(columns);

    const dataSnapshot = buildDataSnapshot({
      X, y, factorSpec,
      termSet: [...r.terms],
      experimentId: null,
      responseColumn: this._yKey,
    });

    const family = {
      name: r.family.name,
      link: r.family.link,
      ...(r.family.theta != null ? { theta: r.family.theta } : {}),
    };

    const record = {
      id: this._savedModelId ?? undefined,
      name: this._savedModelName || `${yName} — ${t('family_' + r.family.name)}`,
      experimentId: null,
      responseSpec: {
        sourceColumn: this._yKey,
        transform: 'identity',
        aggregateOver: null,
      },
      family,
      terms: [...r.terms],
      // Mirror into termSet for the legacy/diagnostic code paths that read it.
      termSet: [...r.terms],
      coef: [...r.coefficients],
      vcov: null,
      sigma2: null,
      df: r.n - r.p,
      // Nagelkerke pseudo-R² is on a comparable [0, 1] scale to OLS R² and is
      // the most defensible substitute for the optimiser's MIN_R2_ADJ gate.
      rSqAdj: r.pseudoR2?.nagelkerke ?? 0,
      lofPValue: null,
      factorSpec,
      spec: { predictors: specPredictors, terms: [] },
      dataSnapshot,
      dataHash: computeDataHash(X, y),
      createdFromInstanceId: this._context.instanceId,
    };

    const id = saveModel(this._context.stateManager, record);
    this._savedModelId = id;
    this._savedModelName = record.name;
    this._save();
    this._context.notify(t('modelSaved'), 'success');

    const btn = this._container.querySelector('[data-action="save-as-model"]');
    const status = this._container.querySelector('[data-ref="model-status"]');
    if (btn) btn.textContent = t('updateModel');
    if (status) status.textContent = t('modelSaved');
  },

  _runPrediction() {
    const r = this._result;
    if (!r) return;
    const t = (k) => this._context.i18n.t(`modules.glm-regression.${k}`);

    const row = [1];
    for (let j = 1; j < r.terms.length; j++) {
      const input = this._container.querySelector(`[data-ref="pred-x-${j}"]`);
      const v = parseFloat(input?.value);
      if (!isFinite(v)) {
        const resEl = this._container.querySelector('[data-ref="predict-result"]');
        if (resEl) { resEl.textContent = t('errorInvalidInput'); resEl.style.display = 'block'; }
        return;
      }
      row.push(v);
    }

    const pred = predictGLM(r, [row]);
    const resEl = this._container.querySelector('[data-ref="predict-result"]');
    if (!resEl) return;
    resEl.style.display = 'block';

    const isBinomial = r.family.name === 'binomial';
    const responseLabel = isBinomial ? t('probability') : t('expectedCount');
    const ciLine = pred.ciValid
      ? `<div><strong>CI ${(r.confLevel * 100).toFixed(0)}%:</strong> [${fmt(pred.ciLower[0], 6)}, ${fmt(pred.ciUpper[0], 6)}]</div>`
      : `<div><strong>CI ${(r.confLevel * 100).toFixed(0)}%:</strong> — <span class="dmike-hint">${t('predictCiUnavailable')}</span></div>`;

    resEl.innerHTML = `
      <div><strong>${t('linearPredictor')}:</strong> ${fmt(pred.linear[0], 6)}</div>
      <div><strong>${responseLabel}:</strong> ${fmt(pred.response[0], 6)}</div>
      ${ciLine}
    `;
  },

  ...chartsMethods,
};

export default mod;
