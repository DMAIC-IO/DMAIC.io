/**
 * D.Mike — MSA Typ 4 Module (msa-typ4.js)
 * Measure phase: Linearity + bias analysis over the measurement range.
 * Spec: docs/modules/MSA-TYP4.md
 */

import { analyze } from '../../engines/msa-typ4-engine.js';
import { ColumnPicker, getColumnValues } from '../../ui/column-picker.js';

export default {
  id: 'msa-typ4',
  phase: 'measure',
  icon: 'trending-up',
  i18nKey: 'modules.msa-typ4',
  version: '1.0.0',

  _container: null,
  _context: null,
  _t: null,
  _result: null,
  _params: {
    name: '', unit: 'mm', norm: 'AIAG', pvMode: 'tolerance',
    tolerance: { LSL: NaN, USL: NaN }, sigmaP: NaN, alpha: 0.05,
  },
  _refColumn: null,
  _measColumn: null,
  _pickerRef: null,
  _pickerMeas: null,
  _exampleWorksheetId: null,
  _charts: [],
  _eventUnsubs: [],

  help: () => import('./msa-typ4-help.js'),

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;
    this._t = (key, vars) => context.i18n.t(key, vars);

    if (!document.getElementById('msa-typ4-css')) {
      const link = document.createElement('link');
      link.id = 'msa-typ4-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/msa-typ4/msa-typ4.css';
      document.head.appendChild(link);
    }

    const onModuleActivated = ({ instanceId }) => {
      if (instanceId === context.instanceId) {
        this._pickerRef?.refresh();
        this._pickerMeas?.refresh();
      }
    };
    context.eventBus.on('module:activated', onModuleActivated);
    this._eventUnsubs.push(() => context.eventBus.off('module:activated', onModuleActivated));

    // Re-run analysis whenever underlying worksheet data changes (cell
    // edits don't change the column selection, so the ColumnPicker's own
    // refresh() wouldn't catch them — see regression.js for the same
    // pattern).
    const onDataChange = () => this._tryAutoAnalysis();
    context.eventBus.on('state:saved', onDataChange);
    context.eventBus.on('worksheet:dataChanged', onDataChange);
    this._eventUnsubs.push(
      () => context.eventBus.off('state:saved', onDataChange),
      () => context.eventBus.off('worksheet:dataChanged', onDataChange),
    );

    container.innerHTML = '';
    this._render();
  },

  async destroy() {
    for (const u of this._eventUnsubs) u();
    this._eventUnsubs = [];
    this._pickerRef?.destroy();
    this._pickerMeas?.destroy();
    this._pickerRef = null;
    this._pickerMeas = null;
    this._destroyCharts();
    if (this._container) this._container.innerHTML = '';
  },

  onLanguageChange() { if (this._container) this._render(); },
  onThemeChange()    { if (this._container) this._render(); },

  // ─── Data hooks ─────────────────────────────────────────────

  getState() {
    this._readInputs();
    return {
      version: this.version,
      params: { ...this._params, tolerance: { ...this._params.tolerance } },
      refColumn: this._refColumn ? { ...this._refColumn } : null,
      measColumn: this._measColumn ? { ...this._measColumn } : null,
      exampleWorksheetId: this._exampleWorksheetId,
    };
  },

  setState(data) {
    if (!data || typeof data !== 'object') return;
    if (data.params) {
      this._params = {
        ...this._params,
        ...data.params,
        tolerance: { ...this._params.tolerance, ...(data.params.tolerance || {}) },
      };
    }
    this._refColumn = data.refColumn ?? null;
    this._measColumn = data.measColumn ?? null;
    this._exampleWorksheetId = data.exampleWorksheetId ?? null;
    if (this._container) this._render();
  },

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    this._pickerRef?.destroy();
    this._pickerMeas?.destroy();
    this._pickerRef = null;
    this._pickerMeas = null;
    this._destroyCharts();

    const t = this._t;
    const p = this._params;
    const isTolerance = p.pvMode === 'tolerance';

    this._container.innerHTML = `
      <div class="module-msa-typ4 dmike-split">
        <div class="dmike-split__input">
          <div class="dmike-split__section-title">${t('modules.msa-typ4.sections.feature')}</div>

          <div class="field-row">
            <div class="field-group field-group--major">
              <label>${t('modules.msa-typ4.labels.name')}</label>
              <input type="text" class="field" data-ref="inp-name" value="${this._esc(p.name)}">
            </div>
            <div class="field-group field-group--minor">
              <label>${t('modules.msa-typ4.labels.unit')}</label>
              <input type="text" class="field" data-ref="inp-unit" value="${this._esc(p.unit)}" placeholder="mm">
            </div>
          </div>

          <div class="dmike-split__section-title">${t('modules.msa-typ4.sections.dataSource')}</div>

          <div class="field-group">
            <label>${t('modules.msa-typ4.labels.referenceColumn')}</label>
            <div data-ref="picker-ref"></div>
          </div>
          <div class="field-group">
            <label>${t('modules.msa-typ4.labels.measuredColumn')}</label>
            <div data-ref="picker-meas"></div>
          </div>

          <div class="dmike-split__section-title">${t('modules.msa-typ4.sections.evaluation')}</div>

          <fieldset class="msa-typ4__radios">
            <legend>${t('modules.msa-typ4.labels.norm')}</legend>
            <label><input type="radio" name="msa4-norm" value="AIAG" ${p.norm === 'AIAG' ? 'checked' : ''}/> ${t('modules.msa-typ4.labels.normAiag')}</label>
            <label><input type="radio" name="msa4-norm" value="VDA5" ${p.norm === 'VDA5' ? 'checked' : ''}/> ${t('modules.msa-typ4.labels.normVda')}</label>
          </fieldset>

          <fieldset class="msa-typ4__radios">
            <legend>${t('modules.msa-typ4.labels.pvMode')}</legend>
            <label><input type="radio" name="msa4-pv" value="tolerance" ${isTolerance ? 'checked' : ''}/> ${t('modules.msa-typ4.labels.pvModeTolerance')}</label>
            <label><input type="radio" name="msa4-pv" value="sixSigma" ${!isTolerance ? 'checked' : ''}/> ${t('modules.msa-typ4.labels.pvModeSixSigma')}</label>
          </fieldset>

          <div class="field-row">
            <div class="field-group">
              <label>${t('modules.msa-typ4.labels.lsl')}</label>
              <input type="text" class="field field--num" data-ref="inp-lsl" inputmode="decimal" placeholder="0.000" value="${isNaN(p.tolerance.LSL) ? '' : p.tolerance.LSL}">
            </div>
            <div class="field-group">
              <label>${t('modules.msa-typ4.labels.usl')}</label>
              <input type="text" class="field field--num" data-ref="inp-usl" inputmode="decimal" placeholder="0.000" value="${isNaN(p.tolerance.USL) ? '' : p.tolerance.USL}">
            </div>
          </div>

          <div class="field-group${isTolerance ? ' msa-typ4__field--hidden' : ''}" data-ref="group-sigma">
            <label>${t('modules.msa-typ4.labels.sigmaP')}</label>
            <input type="text" class="field field--num" data-ref="inp-sigma" inputmode="decimal" value="${isNaN(p.sigmaP) ? '' : p.sigmaP}">
          </div>

          <div class="field-group">
            <label>${t('modules.msa-typ4.labels.alpha')}</label>
            <select class="field" data-ref="sel-alpha">
              <option value="0.01" ${p.alpha === 0.01 ? 'selected' : ''}>0.01</option>
              <option value="0.05" ${p.alpha === 0.05 ? 'selected' : ''}>0.05</option>
              <option value="0.10" ${p.alpha === 0.10 ? 'selected' : ''}>0.10</option>
            </select>
          </div>

          <div class="msa-typ4__error" data-ref="error-box"></div>
        </div>

        <div class="dmike-split__output">
          <div data-ref="results"></div>
        </div>
      </div>
    `;

    const refWrap = this._container.querySelector('[data-ref="picker-ref"]');
    this._pickerRef = new ColumnPicker(refWrap, this._context, {
      mode: 'single',
      types: ['numeric'],
      onChange: (ref) => { this._refColumn = ref; this._save(); this._tryAutoAnalysis(); },
    });
    if (this._refColumn) this._pickerRef.value = this._refColumn;

    const measWrap = this._container.querySelector('[data-ref="picker-meas"]');
    this._pickerMeas = new ColumnPicker(measWrap, this._context, {
      mode: 'single',
      types: ['numeric'],
      onChange: (ref) => { this._measColumn = ref; this._save(); this._tryAutoAnalysis(); },
    });
    if (this._measColumn) this._pickerMeas.value = this._measColumn;

    this._bindEvents();
    this._tryAutoAnalysis();
  },

  _bindEvents() {
    const c = this._container;
    const autoRun = this._debounce(() => { this._save(); this._tryAutoAnalysis(); }, 600);
    c.querySelectorAll('[data-ref^="inp-"], [data-ref^="sel-"]').forEach(el => {
      el.addEventListener('input', autoRun);
      el.addEventListener('change', autoRun);
    });
    c.querySelectorAll('input[name="msa4-norm"]').forEach(el => el.addEventListener('change', (e) => {
      this._params.norm = e.target.value;
      this._save();
      this._tryAutoAnalysis();
    }));
    c.querySelectorAll('input[name="msa4-pv"]').forEach(el => el.addEventListener('change', (e) => {
      this._params.pvMode = e.target.value;
      this._save();
      this._render(); // structural change: shows/hides σₚ field
      this._tryAutoAnalysis();
    }));
  },

  // ─── Actions ────────────────────────────────────────────────

  /**
   * Automatically run analysis if both columns are selected. Silently
   * clears results when data is incomplete (mirrors msa-typ1/msa-typ2).
   */
  _tryAutoAnalysis() {
    this._readInputs();
    const out = this._container?.querySelector('[data-ref="results"]');
    if (!out) return;
    this._result = null;
    this._destroyCharts();

    if (!this._refColumn || !this._measColumn) {
      out.innerHTML = `<div class="module-msa-typ4__empty">${this._t('modules.msa-typ4.emptyState')}</div>`;
      return;
    }

    const data = this._buildDataArrays();
    if (!data) {
      out.innerHTML = `<div class="module-msa-typ4__empty">${this._t('modules.msa-typ4.emptyState')}</div>`;
      return;
    }

    const p = this._params;
    const flatParams = {
      pvMode: p.pvMode, LSL: p.tolerance.LSL, USL: p.tolerance.USL,
      sigmaP: p.sigmaP, alpha: p.alpha, norm: p.norm,
    };
    const res = analyze(data.reference, data.measured, flatParams);
    if (!res.ok) {
      this._hideError();
      out.innerHTML = `<div class="module-msa-typ4__empty">${this._t(res.errorKey, res.errorVars)}</div>`;
      return;
    }

    this._hideError();
    this._result = res;
    this._renderResults(res);
  },

  /**
   * Build aligned {reference, measured} arrays from the two selected
   * worksheet columns, dropping rows where either value is missing/non-numeric.
   * @returns {{reference: number[], measured: number[]}|null}
   */
  _buildDataArrays() {
    const sm = this._context.stateManager;
    const rawRef = getColumnValues(sm, this._refColumn);
    const rawMeas = getColumnValues(sm, this._measColumn);

    const reference = [], measured = [];
    const len = Math.min(rawRef.length, rawMeas.length);
    for (let i = 0; i < len; i++) {
      const r = typeof rawRef[i] === 'number' ? rawRef[i] : parseFloat(String(rawRef[i] ?? '').replace(',', '.'));
      const m = typeof rawMeas[i] === 'number' ? rawMeas[i] : parseFloat(String(rawMeas[i] ?? '').replace(',', '.'));
      if (!Number.isFinite(r) || !Number.isFinite(m)) continue;
      reference.push(r);
      measured.push(m);
    }
    if (reference.length === 0) return null;
    return { reference, measured };
  },

  /**
   * Render the analysis result into the output panel: norm-dependent KPI
   * strip, interpretation, per-reference table, and the (empty, for now)
   * chart containers that Task 12+13 populate.
   * @param {object} res  Output of engines/msa-typ4-engine.js analyze().
   */
  _renderResults(res) {
    const out = this._container.querySelector('[data-ref="results"]');
    if (!out) return;

    const t = this._t;
    const norm = this._params.norm === 'VDA5' ? 'VDA5' : 'AIAG';
    const kpi = norm === 'VDA5' ? res.kpi.vda5 : res.kpi.aiag;
    const kpiMod = { green: 'dmike-kpi--good', yellow: 'dmike-kpi--warn', red: 'dmike-kpi--bad' };

    let kpiHtml;
    if (norm === 'VDA5') {
      kpiHtml = `
        <div class="dmike-kpi ${kpiMod[kpi.verdict.color] || ''}">
          <div class="dmike-kpi-label">${t('modules.msa-typ4.kpi.uBi')}</div>
          <div class="dmike-kpi-value">${this._fmt(kpi.u_BI, 4)}</div>
        </div>
        <div class="dmike-kpi ${kpiMod[kpi.verdict.color] || ''}">
          <div class="dmike-kpi-label">${t('modules.msa-typ4.kpi.u')}</div>
          <div class="dmike-kpi-value">${this._fmt(kpi.U, 4)}</div>
        </div>
        <div class="dmike-kpi ${kpiMod[kpi.verdict.color] || ''}">
          <div class="dmike-kpi-label">${t('modules.msa-typ4.kpi.qMsBi')}</div>
          <div class="dmike-kpi-value">${this._fmt(kpi.Q_MS_BI, 2)} %</div>
          <div class="dmike-kpi-sub">${t(kpi.verdict.key)}</div>
        </div>
        <div class="dmike-kpi">
          <div class="dmike-kpi-label">${t('modules.msa-typ4.kpi.maxPercentBias')}</div>
          <div class="dmike-kpi-value">${this._fmt(res.kpi.aiag.maxPercentBias, 2)} %</div>
        </div>
      `;
    } else {
      kpiHtml = `
        <div class="dmike-kpi ${kpiMod[kpi.verdict.color] || ''}">
          <div class="dmike-kpi-label">${t('modules.msa-typ4.kpi.percentLinearity')}</div>
          <div class="dmike-kpi-value">${this._fmt(kpi.percentLinearity, 2)} %</div>
          <div class="dmike-kpi-sub">${t(kpi.verdict.key)}</div>
        </div>
        <div class="dmike-kpi ${kpi.slopeSignificant ? 'dmike-kpi--bad' : 'dmike-kpi--good'}">
          <div class="dmike-kpi-label">${t('modules.msa-typ4.kpi.slope')}</div>
          <div class="dmike-kpi-value">${this._fmt(res.regression.slope, 4)}</div>
          <div class="dmike-kpi-sub">p = ${this._fmtP(res.regression.pSlope)}</div>
        </div>
        <div class="dmike-kpi ${kpi.interceptSignificant ? 'dmike-kpi--bad' : 'dmike-kpi--good'}">
          <div class="dmike-kpi-label">${t('modules.msa-typ4.kpi.intercept')}</div>
          <div class="dmike-kpi-value">${this._fmt(res.regression.intercept, 4)}</div>
          <div class="dmike-kpi-sub">p = ${this._fmtP(res.regression.pIntercept)}</div>
        </div>
        <div class="dmike-kpi">
          <div class="dmike-kpi-label">${t('modules.msa-typ4.kpi.maxPercentBias')}</div>
          <div class="dmike-kpi-value">${this._fmt(kpi.maxPercentBias, 2)} %</div>
        </div>
      `;
    }

    const rows = res.perReference.map(p => `
      <tr class="msa-typ4__row--${p.verdict}">
        <td>${this._fmt(p.xRef, 3)}</td>
        <td>${p.n}</td>
        <td>${this._fmt(p.mean, 4)}</td>
        <td>${this._fmt(p.bias, 4)}</td>
        <td>${this._fmt(p.percentBias, 2)} %</td>
        <td>${this._fmt(p.tStat, 2)}</td>
        <td>${this._fmtP(p.pValue)}</td>
      </tr>`).join('');

    out.innerHTML = `
      <div class="dmike-kpi-strip">${kpiHtml}</div>

      <div class="msa-typ4__interp msa-typ4__interp--${kpi.verdict.color}">
        ${t(res.interpretation.textKey, res.interpretation.params)}
      </div>

      <div class="dmike-split__output-section">${t('modules.msa-typ4.charts.linearity')}</div>
      <div class="msa-typ4__chart" data-ref="chart-linearity"></div>

      <div class="dmike-split__output-section">${t('modules.msa-typ4.charts.percentBias')}</div>
      <div class="msa-typ4__chart" data-ref="chart-pctbias"></div>

      <div class="dmike-split__output-section">${t('modules.msa-typ4.charts.perReference')}</div>
      <div class="msa-typ4__chart" data-ref="chart-per-ref"></div>

      <details class="msa-typ4__residuals" data-ref="residuals-details">
        <summary>${t('modules.msa-typ4.charts.residuals')}</summary>
        <div class="msa-typ4__chart" data-ref="chart-residuals"></div>
      </details>

      <div class="dmike-split__output-section">${t('modules.msa-typ4.sections.results')}</div>
      <table class="dmike-table msa-typ4__table">
        <thead>
          <tr>
            <th>${t('modules.msa-typ4.table.reference')}</th>
            <th>${t('modules.msa-typ4.table.n')}</th>
            <th>${t('modules.msa-typ4.table.mean')}</th>
            <th>${t('modules.msa-typ4.table.bias')}</th>
            <th>${t('modules.msa-typ4.table.percentBias')}</th>
            <th>${t('modules.msa-typ4.table.tStat')}</th>
            <th>${t('modules.msa-typ4.table.pValue')}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    // Task 12+13 populate the chart-* containers created above.
  },

  // ─── Charts ─────────────────────────────────────────────────

  _destroyCharts() {
    const cm = this._context?.chartManager;
    for (const c of this._charts) {
      try { if (cm) cm.destroy(c); } catch (_) { /* ignore */ }
    }
    this._charts = [];
  },

  // ─── Helpers ────────────────────────────────────────────────

  _readInputs() {
    const c = this._container;
    if (!c) return;
    const v = (ref) => c.querySelector(`[data-ref="${ref}"]`)?.value ?? '';
    this._params.name = v('inp-name');
    this._params.unit = v('inp-unit') || 'mm';
    this._params.tolerance.LSL = this._parseNum(v('inp-lsl'));
    this._params.tolerance.USL = this._parseNum(v('inp-usl'));
    const sigma = v('inp-sigma');
    if (sigma !== '') this._params.sigmaP = this._parseNum(sigma);
    const alpha = v('sel-alpha');
    if (alpha !== '') this._params.alpha = this._parseNum(alpha);
  },

  _parseNum(s) {
    if (s == null || s === '') return NaN;
    return parseFloat(String(s).replace(',', '.').trim());
  },

  _fmt(v, d = 3) {
    return Number.isFinite(v) ? v.toFixed(d) : '–';
  },

  _fmtP(p) {
    if (p == null || !Number.isFinite(p)) return '–';
    if (p < 0.001) return '< 0.001';
    return p.toFixed(3);
  },

  _showError(msg) {
    const el = this._container?.querySelector('[data-ref="error-box"]');
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
