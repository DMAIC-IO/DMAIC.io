/**
 * D.Mike — Correlation Analysis Module (correlation.js)
 * Analyze phase: computes Pearson, Spearman, and Kendall correlations.
 *
 * - 2 columns selected → detailed pairwise analysis (cards, scatter, diagnostics)
 * - 3+ columns selected → correlation matrix (heatmap table)
 *
 * Data source: numeric columns from Worksheet modules.
 */

import { runCorrelationAnalysis, pearsonR, spearmanR, kendallTau, fisherCI, kendallCI, pFromT, kendallPValue } from '../../engines/correlation-engine.js';
import { isPickerFocused } from '../../ui/column-picker.js';
import { esc } from '../../core/html-utils.js';
import { renderMethods } from './correlation-render.js';

// Phase iteration is now cycle-agnostic via `Object.keys(state.phases)` — see
// js/core/cycles/cycles.js for the cycle/phase model.


/** Build a ref key string from a column reference */
function refKey(ref) {
  return `${ref.instanceId}|${ref.sheetId}|${ref.columnId}`;
}

/**
 * Parse a free-text confidence-level entry into a decimal in (0, 1).
 * Accepts "95", "95 %", "95%", "0.95", "0,95", "97,5 %", …
 * Returns null for invalid or out-of-range input.
 * @param {string} raw
 * @returns {number | null}
 */
function _parseConfPercent(raw) {
  if (raw == null) return null;
  const cleaned = String(raw).replace('%', '').replace(',', '.').trim();
  if (cleaned === '') return null;
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  const dec = n > 1 ? n / 100 : n;
  if (dec <= 0 || dec >= 1) return null;
  return dec;
}

/**
 * Format a decimal confidence level as a percent string for display,
 * stripping trailing zeros. 0.95 → "95 %", 0.975 → "97.5 %".
 * @param {number} dec
 * @returns {string}
 */
function _formatConfPercent(dec) {
  return `${+(dec * 100).toFixed(2)}`;
}

const mod = {
  id: 'correlation',
  phase: 'analyze',
  icon: 'trending-up',
  i18nKey: 'modules.correlation',
  version: '1.1.0',

  _container: null,
  _context: null,
  /** @type {Array<{ instanceId: string, sheetId: string, columnId: string }>} */
  _colRefs: [],
  _confidenceLevel: null,
  /** @type {'pearson'|'spearman'|'kendall'} */
  _matrixMethod: 'pearson',
  _result: null,
  _matrixResult: null,
  /** @type {number|null} Filter: minimum |r| threshold (null = disabled) */
  _filterMinR: null,
  /** @type {number|null} Filter: maximum p-value threshold (null = disabled) */
  _filterMaxP: null,
  _selectedPair: null,
  _renderGen: 0,
  _eventUnsubs: [],
  /** @type {string|null} Fingerprint of last successful analysis input (selection + data) */
  _lastFingerprint: null,

  help: () => import('./correlation-help.js'),

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    if (!document.getElementById('correlation-css')) {
      const link = document.createElement('link');
      link.id = 'correlation-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/correlation/correlation.css';
      document.head.appendChild(link);
    }

    const onRefresh = () => {
      this._refreshColumnList();
      this._autoRun();
    };
    context.eventBus.on('state:saved', onRefresh);
    context.eventBus.on('worksheet:dataChanged', onRefresh);
    this._eventUnsubs.push(
      () => context.eventBus.off('state:saved', onRefresh),
      () => context.eventBus.off('worksheet:dataChanged', onRefresh),
    );
    const onAdd = ({ moduleId }) => { if (moduleId === 'worksheet') onRefresh(); };
    context.eventBus.on('module:added', onAdd);
    this._eventUnsubs.push(() => context.eventBus.off('module:added', onAdd));
    const onRem = ({ moduleId }) => { if (moduleId === 'worksheet') onRefresh(); };
    context.eventBus.on('module:removed', onRem);
    this._eventUnsubs.push(() => context.eventBus.off('module:removed', onRem));
    const onAct = ({ instanceId }) => { if (instanceId === context.instanceId) onRefresh(); };
    context.eventBus.on('module:activated', onAct);
    this._eventUnsubs.push(() => context.eventBus.off('module:activated', onAct));

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) {
      // Migration: old format had colRefX / colRefY
      if (saved.colRefs) {
        this._colRefs = saved.colRefs;
      } else if (saved.colRefX || saved.colRefY) {
        this._colRefs = [saved.colRefX, saved.colRefY].filter(Boolean);
      }
      this._confidenceLevel = saved.confidenceLevel ?? null;
      this._matrixMethod = saved.matrixMethod || 'pearson';
      this._result = saved.result || null;
      this._matrixResult = saved.matrixResult || null;
      this._filterMinR = saved.filterMinR ?? null;
      this._filterMaxP = saved.filterMaxP ?? null;
    }

    if (this._confidenceLevel == null) {
      this._confidenceLevel = (context.stateManager.get('settings.confidenceLevel') ?? 95) / 100;
    }

    this._render();
    this._autoRun();
  },

  async destroy() {
    for (const unsub of this._eventUnsubs) unsub();
    this._eventUnsubs = [];
    this._destroyCharts();
    this._container.innerHTML = '';
  },

  onLanguageChange() {
    this._destroyCharts();
    this._render();
    if (this._colRefs.length === 2 && this._result) {
      this._renderPairwiseResults(this._result);
    } else if (this._colRefs.length > 2 && this._matrixResult) {
      this._renderMatrixResults(this._matrixResult);
    } else {
      this._autoRun();
    }
  },

  onThemeChange() {
    this._destroyCharts();
    if (this._colRefs.length === 2 && this._result?._x) {
      this._renderScatterPlot(this._result);
    } else if (this._colRefs.length > 2 && this._matrixResult?.pairs) {
      this._renderMatrixScatterPlots(this._matrixResult);
    }
  },

  getState() {
    return {
      colRefs: this._colRefs,
      confidenceLevel: this._confidenceLevel,
      matrixMethod: this._matrixMethod,
      result: this._result || null,
      matrixResult: this._matrixResult || null,
      filterMinR: this._filterMinR,
      filterMaxP: this._filterMaxP,
    };
  },

  setState(data) {
    if (data?.colRefs) this._colRefs = data.colRefs;
    if (data?.confidenceLevel) this._confidenceLevel = data.confidenceLevel;
    if (data?.matrixMethod) this._matrixMethod = data.matrixMethod;
    if (data?.result) this._result = data.result;
    if (data?.matrixResult) this._matrixResult = data.matrixResult;
    this._filterMinR = data?.filterMinR ?? null;
    this._filterMaxP = data?.filterMaxP ?? null;
    this._lastFingerprint = null;
    if (this._container) {
      this._render();
      this._autoRun();
    }
  },

  // ─── Worksheet Column Discovery ─────────────────────────────

  /** Accepted column types for correlation (everything except plain text). */
  _CORR_TYPES: new Set(['numeric', 'currency', 'percent', 'date', 'time']),

  /**
   * Convert a date string ("YYYY-MM-DD") to epoch ms.
   * @param {string} s
   * @returns {number|null}
   */
  _dateToNum(s) {
    if (typeof s !== 'string') return null;
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : null;
  },

  /**
   * Convert a time string ("HH:MM" or "HH:MM:SS") to seconds since midnight.
   * @param {string} s
   * @returns {number|null}
   */
  _timeToNum(s) {
    if (typeof s !== 'string') return null;
    const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + (m[3] ? parseInt(m[3]) : 0);
  },

  /**
   * Convert a single cell value to a number, respecting column type.
   * @param {*} val
   * @param {string} colType
   * @returns {number|null}
   */
  _toNumeric(val, colType) {
    if (val == null) return null;
    if (colType === 'date') return this._dateToNum(val);
    if (colType === 'time') return this._timeToNum(val);
    // numeric / currency / percent — already numbers
    return (typeof val === 'number' && !isNaN(val)) ? val : null;
  },

  _getWorksheetColumns() {
    const sm = this._context?.stateManager;
    if (!sm) return [];
    const columns = [];
    for (const phase of Object.keys(sm.get('phases') || {})) {
      const instances = sm.get(`phases.${phase}`) ?? [];
      for (const inst of instances) {
        if (inst.moduleId !== 'worksheet') continue;
        const ws = sm.getModuleState(inst.instanceId);
        if (!ws?.sheets) continue;
        for (const sheet of ws.sheets) {
          if (!sheet.state?.columns) continue;
          for (const col of sheet.state.columns) {
            if (!this._CORR_TYPES.has(col.type)) continue;
            const numericCount = (col.values || []).filter(v => this._toNumeric(v, col.type) !== null).length;
            if (numericCount < 5) continue;
            columns.push({
              instanceId: inst.instanceId,
              sheetId: sheet.id,
              sheetName: sheet.name,
              columnId: col.id,
              columnName: col.name || '',
              shortName: col.shortName || '?',
              valueCount: numericCount,
              colType: col.type,
            });
          }
        }
      }
    }
    return columns;
  },

  /**
   * Resolve column metadata (including type) for a ref.
   * @private
   */
  _resolveColumn(ref) {
    if (!ref) return null;
    const sm = this._context?.stateManager;
    if (!sm) return null;
    const ws = sm.getModuleState(ref.instanceId);
    if (!ws?.sheets) return null;
    const sheet = ws.sheets.find(s => s.id === ref.sheetId);
    if (!sheet?.state?.columns) return null;
    return sheet.state.columns.find(c => c.id === ref.columnId) || null;
  },

  _getColumnValues(ref) {
    const col = this._resolveColumn(ref);
    if (!col) return [];
    return (col.values || [])
      .map(v => this._toNumeric(v, col.type))
      .filter(v => v !== null);
  },

  /**
   * Get raw column values converted to numbers (including nulls) for row-aligned pairing.
   */
  _getRawColumnValues(ref) {
    const col = this._resolveColumn(ref);
    if (!col) return [];
    return (col.values || []).map(v => this._toNumeric(v, col.type));
  },

  _getColumnName(ref) {
    if (!ref) return '?';
    const sm = this._context?.stateManager;
    if (!sm) return '?';
    const ws = sm.getModuleState(ref.instanceId);
    if (!ws?.sheets) return '?';
    const sheet = ws.sheets.find(s => s.id === ref.sheetId);
    if (!sheet?.state?.columns) return '?';
    const col = sheet.state.columns.find(c => c.id === ref.columnId);
    return col ? (col.name || col.shortName) : '?';
  },

  _hasWorksheet() {
    const sm = this._context?.stateManager;
    if (!sm) return false;
    for (const phase of Object.keys(sm.get('phases') || {})) {
      const instances = sm.get(`phases.${phase}`) ?? [];
      if (instances.some(i => i.moduleId === 'worksheet')) return true;
    }
    return false;
  },

  // ─── Paired values (align two columns by row index) ────────

  _getPairedValues(refA, refB) {
    if (!refA || !refB) return null;
    const valsA = this._getRawColumnValues(refA);
    const valsB = this._getRawColumnValues(refB);
    const len = Math.min(valsA.length, valsB.length);
    const a = [], b = [];
    for (let i = 0; i < len; i++) {
      const va = valsA[i], vb = valsB[i];
      if (va !== null && vb !== null) {
        a.push(va);
        b.push(vb);
      }
    }
    return { x: a, y: b };
  },

  // ─── Column ref helpers ─────────────────────────────────────

  _isSelected(col) {
    const key = `${col.instanceId}|${col.sheetId}|${col.columnId}`;
    return this._colRefs.some(r => refKey(r) === key);
  },

  _toggleColumn(col) {
    const key = `${col.instanceId}|${col.sheetId}|${col.columnId}`;
    const idx = this._colRefs.findIndex(r => refKey(r) === key);
    if (idx >= 0) {
      this._colRefs.splice(idx, 1);
    } else {
      this._colRefs.push({ instanceId: col.instanceId, sheetId: col.sheetId, columnId: col.columnId });
    }
    this._result = null;
    this._matrixResult = null;
    this._save();
    this._refreshColumnList();
    this._autoRun();
  },

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    const t = (k, v) => this._context.i18n.t(`modules.correlation.${k}`, v);

    this._container.innerHTML = `
      <div class="corr dmike-split">
        <div class="corr__input dmike-split__input">
          <div class="dmike-split__section-title">${t('sectionData')}</div>

          <div class="field-group">
            <label>${t('selectColumns')}</label>
            <div class="corr__col-list-wrap" data-ref="col-list">
              ${this._buildColumnListHTML()}
            </div>
          </div>

          <div class="corr__selected-info" data-ref="selected-info">
            ${this._buildSelectedInfoHTML()}
          </div>

          <div class="field-group">
            <label>${t('confidenceLevel')} (%)</label>
            <input type="text" class="field field--num" data-ref="conf-input" inputmode="decimal"
              value="${_formatConfPercent(this._confidenceLevel)}" placeholder="95">
          </div>

          <div class="corr__error" data-ref="error-box"></div>
        </div>

        <div class="corr__output dmike-split__output">
          <div data-ref="results"></div>
        </div>
      </div>
    `;

    this._bindEvents();
  },

  _buildColumnListHTML() {
    const t = (k, v) => this._context.i18n.t(`modules.correlation.${k}`, v);
    if (!this._hasWorksheet()) {
      return `<div class="corr__hint">${t('noWorksheet')}</div>`;
    }
    const columns = this._getWorksheetColumns();
    if (columns.length === 0) {
      return `<div class="corr__hint">${t('noNumericColumns')}</div>`;
    }

    let html = '';
    let currentGroup = '';
    for (const col of columns) {
      if (col.sheetName !== currentGroup) {
        if (currentGroup) html += '</div>';
        html += `<div class="corr__col-group"><div class="corr__col-group-label">${esc(col.sheetName)}</div>`;
        currentGroup = col.sheetName;
      }
      const key = `${col.instanceId}|${col.sheetId}|${col.columnId}`;
      const checked = this._isSelected(col) ? ' checked' : '';
      const displayName = col.columnName
        ? `${col.shortName} \u2013 ${col.columnName}`
        : col.shortName;
      html += `
        <label class="corr__col-item">
          <input type="checkbox" data-col-key="${key}"${checked}>
          <span class="corr__col-name">${esc(displayName)}</span>
          <span class="corr__col-count">n=${col.valueCount}</span>
        </label>`;
    }
    if (currentGroup) html += '</div>';
    return html;
  },

  _buildSelectedInfoHTML() {
    const t = (k, v) => this._context.i18n.t(`modules.correlation.${k}`, v);
    const n = this._colRefs.length;
    if (n === 0) return `<span class="corr__hint">${t('selectMinTwo')}</span>`;
    if (n === 1) return `<span class="corr__hint">${t('selectOneMore')}</span>`;
    if (n === 2) return `<span class="corr__col-info">${t('pairwiseMode')}</span>`;
    return `<span class="corr__col-info">${t('matrixMode', { n })}</span>`;
  },

  _refreshColumnList() {
    if (isPickerFocused(this._container)) return;

    const wrap = this._container?.querySelector('[data-ref="col-list"]');
    if (wrap) {
      wrap.innerHTML = this._buildColumnListHTML();
      this._bindColumnCheckboxes();
    }
    const info = this._container?.querySelector('[data-ref="selected-info"]');
    if (info) info.innerHTML = this._buildSelectedInfoHTML();
  },

  _bindEvents() {
    const c = this._container;

    const confInput = c.querySelector('[data-ref="conf-input"]');
    const commitConf = () => {
      const parsed = _parseConfPercent(confInput.value);
      if (parsed == null) {
        // Invalid → revert to last good value
        confInput.value = _formatConfPercent(this._confidenceLevel);
        return;
      }
      if (parsed === this._confidenceLevel) {
        confInput.value = _formatConfPercent(parsed);
        return;
      }
      this._confidenceLevel = parsed;
      confInput.value = _formatConfPercent(parsed);
      this._save();
      this._autoRun();
    };
    confInput.addEventListener('change', commitConf);
    confInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); confInput.blur(); }
    });

    this._bindColumnCheckboxes();
  },

  _bindColumnCheckboxes() {
    const checkboxes = this._container.querySelectorAll('[data-col-key]');
    checkboxes.forEach(cb => {
      cb.addEventListener('change', () => {
        const [instanceId, sheetId, columnId] = cb.dataset.colKey.split('|');
        this._toggleColumn({ instanceId, sheetId, columnId });
      });
    });
  },

  // ─── Actions ────────────────────────────────────────────────

  _runAnalysis() {
    const errBox = this._container.querySelector('[data-ref="error-box"]');
    errBox.textContent = '';
    errBox.style.display = 'none';

    if (this._colRefs.length < 2) return;

    if (this._colRefs.length === 2) {
      this._runPairwiseAnalysis(errBox);
    } else {
      this._runMatrixAnalysis(errBox);
    }
  },

  _runPairwiseAnalysis(errBox) {
    const t = (k, v) => this._context.i18n.t(`modules.correlation.${k}`, v);
    const paired = this._getPairedValues(this._colRefs[0], this._colRefs[1]);
    if (!paired) return;
    const { x, y } = paired;
    if (x.length < 4) {
      errBox.textContent = t('errMin4', { n: x.length });
      errBox.style.display = 'block';
      return;
    }
    try {
      const result = runCorrelationAnalysis(x, y, this._confidenceLevel);
      if (isNaN(result.pearson.r)) {
        errBox.textContent = t('errZeroVariance');
        errBox.style.display = 'block';
        return;
      }
      result._x = x;
      result._y = y;
      result._nameX = this._getColumnName(this._colRefs[0]);
      result._nameY = this._getColumnName(this._colRefs[1]);
      this._result = result;
      this._matrixResult = null;
      this._save();
      this._renderPairwiseResults(result);
    } catch (e) {
      errBox.textContent = t('errGeneric');
      errBox.style.display = 'block';
    }
  },

  _runMatrixAnalysis(errBox) {
    const t = (k, v) => this._context.i18n.t(`modules.correlation.${k}`, v);
    const refs = this._colRefs;
    const k = refs.length;
    const names = refs.map(r => this._getColumnName(r));

    // Compute correlation for each pair
    const alpha = 1 - this._confidenceLevel;
    const matrix = { pearson: [], spearman: [], kendall: [] };
    const ciMatrix = { pearson: [], spearman: [], kendall: [] };
    const pMatrix = { pearson: [], spearman: [], kendall: [] };
    const nMatrix = [];
    const pairs = []; // upper triangle paired data for scatter plots

    for (let i = 0; i < k; i++) {
      matrix.pearson[i] = [];
      matrix.spearman[i] = [];
      matrix.kendall[i] = [];
      ciMatrix.pearson[i] = [];
      ciMatrix.spearman[i] = [];
      ciMatrix.kendall[i] = [];
      pMatrix.pearson[i] = [];
      pMatrix.spearman[i] = [];
      pMatrix.kendall[i] = [];
      nMatrix[i] = [];
      for (let j = 0; j < k; j++) {
        if (i === j) {
          matrix.pearson[i][j] = 1;
          matrix.spearman[i][j] = 1;
          matrix.kendall[i][j] = 1;
          ciMatrix.pearson[i][j] = null;
          ciMatrix.spearman[i][j] = null;
          ciMatrix.kendall[i][j] = null;
          pMatrix.pearson[i][j] = null;
          pMatrix.spearman[i][j] = null;
          pMatrix.kendall[i][j] = null;
          nMatrix[i][j] = this._getColumnValues(refs[i]).length;
        } else {
          const paired = this._getPairedValues(refs[i], refs[j]);
          if (!paired || paired.x.length < 4) {
            matrix.pearson[i][j] = NaN;
            matrix.spearman[i][j] = NaN;
            matrix.kendall[i][j] = NaN;
            ciMatrix.pearson[i][j] = null;
            ciMatrix.spearman[i][j] = null;
            ciMatrix.kendall[i][j] = null;
            pMatrix.pearson[i][j] = null;
            pMatrix.spearman[i][j] = null;
            pMatrix.kendall[i][j] = null;
            nMatrix[i][j] = paired ? paired.x.length : 0;
          } else if (i < j) {
            const n = paired.x.length;
            const df = n - 2;
            const pR = Math.max(-1, Math.min(1, pearsonR(paired.x, paired.y)));
            const sR = Math.max(-1, Math.min(1, spearmanR(paired.x, paired.y)));
            const kRes = kendallTau(paired.x, paired.y);
            matrix.pearson[i][j] = pR;
            matrix.spearman[i][j] = sR;
            matrix.kendall[i][j] = kRes.tau;
            const pPerfect = Math.abs(pR) >= 1;
            const sPerfect = Math.abs(sR) >= 1;
            ciMatrix.pearson[i][j] = pPerfect ? [pR, pR] : fisherCI(pR, n, alpha);
            ciMatrix.spearman[i][j] = sPerfect ? [sR, sR] : fisherCI(sR, n, alpha);
            ciMatrix.kendall[i][j] = kendallCI(kRes.tau, n, alpha);
            // p-values (perfect correlation → p = 0; otherwise from t)
            const pT = pPerfect ? Infinity : pR * Math.sqrt(df) / Math.sqrt(1 - pR * pR);
            const sT = sPerfect ? Infinity : sR * Math.sqrt(df) / Math.sqrt(1 - sR * sR);
            pMatrix.pearson[i][j] = pPerfect ? 0 : pFromT(pT, df);
            pMatrix.spearman[i][j] = sPerfect ? 0 : pFromT(sT, df);
            pMatrix.kendall[i][j] = kendallPValue(kRes.tau, n).p;
            nMatrix[i][j] = n;
            pairs.push({ i, j, x: paired.x, y: paired.y });
          } else {
            // Lower triangle: mirror from upper
            matrix.pearson[i][j] = matrix.pearson[j][i];
            matrix.spearman[i][j] = matrix.spearman[j][i];
            matrix.kendall[i][j] = matrix.kendall[j][i];
            ciMatrix.pearson[i][j] = ciMatrix.pearson[j][i];
            ciMatrix.spearman[i][j] = ciMatrix.spearman[j][i];
            ciMatrix.kendall[i][j] = ciMatrix.kendall[j][i];
            pMatrix.pearson[i][j] = pMatrix.pearson[j][i];
            pMatrix.spearman[i][j] = pMatrix.spearman[j][i];
            pMatrix.kendall[i][j] = pMatrix.kendall[j][i];
            nMatrix[i][j] = nMatrix[j][i];
          }
        }
      }
    }

    const matrixResult = { names, matrix, ciMatrix, pMatrix, nMatrix, pairs };
    this._matrixResult = matrixResult;
    this._result = null;
    this._save();
    this._renderMatrixResults(matrixResult);
  },

  // ─── Auto-Run ───────────────────────────────────────────────

  /**
   * Lightweight fingerprint over the inputs that should trigger a re-run
   * (selected columns, their values, confidence level). Used to skip
   * redundant work when state:saved fires but nothing relevant changed.
   */
  _inputFingerprint() {
    const parts = [`c=${this._confidenceLevel}`];
    for (const ref of this._colRefs) {
      const vals = this._getRawColumnValues(ref);
      let sum = 0, n = 0;
      for (const v of vals) {
        if (v != null) { sum += v; n++; }
      }
      parts.push(`${ref.instanceId}|${ref.columnId}|len=${vals.length}|n=${n}|s=${sum}`);
    }
    return parts.join('::');
  },

  _autoRun() {
    if (!this._container) return;
    if (this._colRefs.length < 2) {
      this._clearResults();
      return;
    }
    const fp = this._inputFingerprint();
    if (fp === this._lastFingerprint && (this._result || this._matrixResult)) return;
    this._lastFingerprint = fp;
    this._runAnalysis();
  },

  // ─── Persistence ────────────────────────────────────────────

  _save() {
    this._context.stateManager.setModuleState(
      this._context.instanceId,
      this.getState()
    );
  },
};

Object.assign(mod, renderMethods);
export default mod;
