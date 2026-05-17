/**
 * D.Mike — Control Chart Module (control-chart.js)
 * Control phase: SPC control charts (I-MR, X̄-R, X̄-S).
 *
 * Data is selected exclusively via column-picker from worksheet columns.
 * Supports baseline/monitoring phase split, Nelson Rules, and Cpk.
 * Uses the SVG chart framework (chartManager) for rendering.
 */

import {
  ColumnPicker, getColumnValues, getColumnName,
} from '../../ui/column-picker.js';

import {
  CHART_TYPES, getChartType,
  NELSON_RULES, DEFAULT_ENABLED_RULES,
  evaluateNelsonRules, computeCapability,
} from '../../engines/control-chart-engine.js';

import { esc } from '../../core/html-utils.js';
import { provisionWorksheet, removeProvisionedWorksheet, csvPayloadToWorksheetState } from '../../core/examples-registry.js';

export default {
  id: 'control-chart',
  phase: 'control',
  icon: 'activity',
  i18nKey: 'modules.control-chart',
  version: '1.0.0',

  _container: null,
  _context: null,
  _chartTypeId: 'i-mr',
  _subgroupSize: 1,
  _columnRef: null,
  _baselineCount: null,
  _stagesText: '',           // user-typed stages spec ("12, 25")
  _usl: null,
  _lsl: null,
  _enabledRules: [...DEFAULT_ENABLED_RULES],
  /** @type {Object<number, {comment: string, excluded: boolean}>} */
  _annotations: {},
  /** Frozen limits for Phase-II monitoring (null = recompute live) */
  _frozenLimits: null,
  _charts: [],
  _lastResult: null,
  _eventUnsubs: [],
  /** Worksheet provisioned by loadExample; removed and recreated on each
   *  subsequent example load so the column picker doesn't accumulate stale
   *  sheets. */
  _exampleWorksheetId: null,
  _autoRunTimer: null,
  _picker: null,

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    if (!document.getElementById('control-chart-css')) {
      const link = document.createElement('link');
      link.id = 'control-chart-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/control-chart/control-chart.css';
      document.head.appendChild(link);
    }

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) this._loadState(saved);

    this._render();
    this._initPicker();
    this._bindContainerEvents();
    this._runAnalysis();
  },

  async destroy() {
    clearTimeout(this._autoRunTimer);
    if (this._picker) { this._picker.destroy(); this._picker = null; }
    for (const unsub of this._eventUnsubs) unsub();
    this._eventUnsubs = [];
    this._destroyCharts();
    this._container.innerHTML = '';
  },

  onLanguageChange() {
    this._destroyCharts();
    if (this._picker) { this._picker.destroy(); this._picker = null; }
    this._render();
    this._initPicker();
    this._bindContainerEvents();
  },

  onThemeChange() {},

  getState() {
    return {
      chartTypeId: this._chartTypeId,
      subgroupSize: this._subgroupSize,
      columnRef: this._columnRef,
      baselineCount: this._baselineCount,
      stagesText: this._stagesText,
      usl: this._usl,
      lsl: this._lsl,
      enabledRules: this._enabledRules,
      annotations: this._annotations,
      frozenLimits: this._frozenLimits,
      exampleWorksheetId: this._exampleWorksheetId,
    };
  },

  setState(data) {
    if (data) this._loadState(data);
    if (this._container) {
      if (this._picker) { this._picker.destroy(); this._picker = null; }
      this._render();
      this._initPicker();
      this._bindContainerEvents();
      this._runAnalysis();
    }
  },

  /**
   * Load a catalog example. Example payloads ship a worksheet
   * (`sourceWorksheetData`) and columnRef with the literal placeholder
   * `__source__` as instanceId. We provision the worksheet (replacing any
   * previously example-provisioned one), rewrite the placeholder, then
   * apply the state — setState calls _runAnalysis itself.
   *
   * @param {{ meta: object, data: object }} payload
   */
  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = (k) => this._context.i18n.t(k);

    const hasContent = !!this._columnRef;
    if (hasContent && this._context?.confirmPopout) {
      const ok = await this._context.confirmPopout(t('moduleHelp.confirmOverwrite'), { danger: true });
      if (!ok) return;
    }

    let data = { ...payload.data };

    // CSV-shape payload (type: dataset) → synthesize sourceWorksheetData + columnRef
    // so it flows through the same provisioning path as project-shape payloads.
    if (!data.sourceWorksheetData && !data.columnRef && Array.isArray(data.columns)) {
      const wsState = csvPayloadToWorksheetState(data, payload.meta);
      if (wsState) {
        data = {
          sourceWorksheetData: wsState,
          columnRef: { instanceId: '__source__', sheetId: wsState.activeSheetId, columnId: 'c-0' },
        };
      }
    }

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
        if (data.columnRef?.instanceId === '__source__') {
          data.columnRef = { ...data.columnRef, instanceId: ref.instanceId };
        }
      }
    }

    this.setState(data);
    // setState's _runAnalysis renders the chart but doesn't persist — write
    // through so the loaded example survives a reload.
    this._save();

    const lang = this._context.i18n.getLanguage();
    const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
    this._context.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
  },

  help: () => import('./control-chart-help.js'),

  // ─── State ──────────────────────────────────────────────────

  /** @private */
  _loadState(saved) {
    this._chartTypeId = saved.chartTypeId || 'i-mr';
    this._subgroupSize = saved.subgroupSize || 1;
    this._columnRef = saved.columnRef || null;
    this._baselineCount = saved.baselineCount ?? null;
    this._stagesText = saved.stagesText || '';
    this._usl = saved.usl ?? null;
    this._lsl = saved.lsl ?? null;
    this._enabledRules = saved.enabledRules || [...DEFAULT_ENABLED_RULES];
    this._annotations = (saved.annotations && typeof saved.annotations === 'object') ? saved.annotations : {};
    this._frozenLimits = saved.frozenLimits ?? null;
    if (saved.exampleWorksheetId !== undefined) this._exampleWorksheetId = saved.exampleWorksheetId;
  },

  /** @private — list of indices marked excluded in annotations */
  _excludedIndices() {
    return Object.keys(this._annotations)
      .map(Number)
      .filter(k => this._annotations[k]?.excluded);
  },

  /**
   * Parse a comma- or whitespace-separated string of stage end indices into
   * a sorted, deduplicated array. Returns [] for empty/invalid input.
   * @private
   */
  _parseStages(s) {
    if (!s || typeof s !== 'string') return [];
    const out = [];
    for (const part of s.split(/[,;\s]+/)) {
      if (!part) continue;
      const v = parseInt(part, 10);
      if (Number.isFinite(v) && v > 0) out.push(v);
    }
    return [...new Set(out)].sort((a, b) => a - b);
  },

  /** @private */
  _save() {
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
  },

  // ─── Render ─────────────────────────────────────────────────

  /** @private */
  _t(key, vars) {
    return this._context.i18n.t(`modules.control-chart.${key}`, vars);
  },

  /** @private */
  _render() {
    const ct = getChartType(this._chartTypeId);
    const showSubgroup = ct && ct.minSubgroupSize !== ct.maxSubgroupSize;

    this._container.innerHTML = `
      <div class="control-chart dmike-split">
        <div class="control-chart__input dmike-split__input">

          <div class="dmike-split__section-title">${this._t('sectionChartType')}</div>
          <div class="field-group">
            <label>${this._t('chartType')}</label>
            <select class="field" data-ref="chart-type">
              ${CHART_TYPES.map(ct => `<option value="${ct.id}"${ct.id === this._chartTypeId ? ' selected' : ''}>${this._t('type_' + ct.id)}</option>`).join('')}
            </select>
          </div>

          <div class="field-group" data-ref="subgroup-row" style="${showSubgroup ? '' : 'display:none'}">
            <label>${this._t('subgroupSize')}</label>
            <input type="number" class="field field--num" data-ref="subgroup-size"
              value="${this._subgroupSize}" min="${ct?.minSubgroupSize || 2}" max="${ct?.maxSubgroupSize || 25}">
          </div>

          <div class="dmike-split__section-title">${this._t('sectionData')}</div>
          <div class="field-group">
            <label>${this._t('dataColumn')}</label>
            <div data-ref="col-picker-wrap"></div>
          </div>

          <div class="field-group">
            <label>${this._t('baselineCount')}</label>
            <input type="number" class="field field--num" data-ref="baseline-count"
              value="${this._baselineCount ?? ''}" min="2" placeholder="${this._t('baselineAll')}">
            <span class="control-chart__hint">${this._t('baselineHint')}</span>
          </div>

          <div class="dmike-split__section-title">${this._t('sectionStages')}</div>
          <div class="field-group">
            <label>${this._t('stagesLabel')}</label>
            <input type="text" class="field" data-ref="stages"
              value="${this._stagesText || ''}" placeholder="${this._t('stagesPlaceholder')}">
            <span class="control-chart__hint">${this._t('stagesHint')}</span>
          </div>

          <div class="dmike-split__section-title">${this._t('sectionPhase2')}</div>
          <div class="control-chart__phase2">
            <div class="control-chart__phase2-status">
              ${this._frozenLimits
                ? `<span class="control-chart__phase2-badge control-chart__phase2-badge--frozen">${this._t('phase2_frozen')}</span>`
                : `<span class="control-chart__phase2-badge">${this._t('phase2_live')}</span>`}
            </div>
            <button type="button" class="btn btn--small ${this._frozenLimits ? 'btn--secondary' : 'btn--primary'}"
              data-ref="phase2-toggle">
              ${this._frozenLimits ? this._t('phase2_unfreeze') : this._t('phase2_freeze')}
            </button>
            <span class="control-chart__hint">${this._t('phase2Hint')}</span>
          </div>

          <div class="dmike-split__section-title">${this._t('sectionSpec')}</div>
          <div class="control-chart__spec-row">
            <div class="field-group">
              <label>${this._t('lsl')}</label>
              <input type="number" class="field field--num" data-ref="lsl"
                value="${this._lsl ?? ''}" placeholder="—">
            </div>
            <div class="field-group">
              <label>${this._t('usl')}</label>
              <input type="number" class="field field--num" data-ref="usl"
                value="${this._usl ?? ''}" placeholder="—">
            </div>
          </div>
          <span class="control-chart__hint">${this._t('specHint')}</span>

          <div class="dmike-split__section-title control-chart__collapsible" data-ref="nelson-toggle">
            ${this._t('sectionNelson')}
            <span class="control-chart__chevron">&#9660;</span>
          </div>
          <div class="control-chart__nelson-panel" data-ref="nelson-panel">
            ${this._buildNelsonRules()}
          </div>

        </div>

        <div class="control-chart__output dmike-split__output">
          <div data-ref="stats-bar"></div>
          <div data-ref="charts-wrap"></div>
          <div data-ref="violations-wrap"></div>
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
  _buildNelsonRules() {
    const lang = this._context.language || 'de';
    const enabledSet = new Set(this._enabledRules);

    return NELSON_RULES.map(rule => `
      <label class="control-chart__nelson-rule">
        <input type="checkbox" data-rule="${rule.id}" ${enabledSet.has(rule.id) ? 'checked' : ''}>
        <span>
          <strong>${esc(rule.short[lang] || rule.short.de)}</strong><br>
          <span class="control-chart__nelson-desc">${esc(rule.desc[lang] || rule.desc.de)}</span>
        </span>
      </label>
    `).join('');
  },

  // ─── Events ─────────────────────────────────────────────────

  /** @private */
  _bindContainerEvents() {
    this._container.addEventListener('click', (e) => {
      const toggle = e.target.closest('[data-ref="nelson-toggle"]');
      if (toggle) {
        const panel = this._container.querySelector('[data-ref="nelson-panel"]');
        if (panel) panel.classList.toggle('control-chart__nelson-panel--collapsed');
        toggle.classList.toggle('control-chart__collapsible--collapsed');
      }
      const phase2Btn = e.target.closest('[data-ref="phase2-toggle"]');
      if (phase2Btn) {
        this._togglePhase2();
        return;
      }
      const violationRow = e.target.closest('[data-violation-index]');
      if (violationRow) {
        const idx = parseInt(violationRow.dataset.violationIndex, 10);
        if (Number.isFinite(idx)) this._openAnnotationDialog(idx);
        return;
      }
    });

    this._container.addEventListener('change', (e) => {
      const ref = e.target.dataset?.ref;
      if (ref === 'chart-type') {
        this._chartTypeId = e.target.value;
        const ct = getChartType(this._chartTypeId);
        const sgRow = this._container.querySelector('[data-ref="subgroup-row"]');
        const sgInput = this._container.querySelector('[data-ref="subgroup-size"]');
        if (ct.minSubgroupSize === ct.maxSubgroupSize) {
          sgRow.style.display = 'none';
          this._subgroupSize = ct.minSubgroupSize;
        } else {
          sgRow.style.display = '';
          sgInput.min = ct.minSubgroupSize;
          sgInput.max = ct.maxSubgroupSize;
          this._subgroupSize = Math.max(ct.minSubgroupSize, Math.min(ct.maxSubgroupSize, this._subgroupSize));
          sgInput.value = this._subgroupSize;
        }
        this._save();
      }
      if (ref === 'subgroup-size') {
        this._subgroupSize = parseInt(e.target.value) || 2;
        this._save();
      }
      if (ref === 'baseline-count') {
        const val = parseInt(e.target.value);
        this._baselineCount = isNaN(val) ? null : val;
        this._save();
      }
      if (ref === 'stages') {
        this._stagesText = e.target.value || '';
        this._save();
      }
      if (ref === 'usl') {
        const val = parseFloat(e.target.value);
        this._usl = isNaN(val) ? null : val;
        this._save();
      }
      if (ref === 'lsl') {
        const val = parseFloat(e.target.value);
        this._lsl = isNaN(val) ? null : val;
        this._save();
      }

      // Nelson rule checkboxes
      if (e.target.dataset?.rule) {
        const ruleId = parseInt(e.target.dataset.rule);
        if (e.target.checked) {
          if (!this._enabledRules.includes(ruleId)) this._enabledRules.push(ruleId);
        } else {
          this._enabledRules = this._enabledRules.filter(r => r !== ruleId);
        }
        this._save();
      }

      // Auto-run after every change
      this._scheduleAutoRun();
    });
  },

  /** @private — debounced auto-run */
  _scheduleAutoRun() {
    clearTimeout(this._autoRunTimer);
    this._autoRunTimer = setTimeout(() => this._runAnalysis(), 120);
  },

  /**
   * Freeze the currently computed limits for Phase-II monitoring.
   * Disabled when the chart is in multi-stage mode.
   * @private
   */
  _togglePhase2() {
    if (this._frozenLimits) {
      this._frozenLimits = null;
      this._save();
      this._destroyPickerAndRerender();
      return;
    }
    if (!this._lastResult) {
      this._context.notify?.(this._t('phase2_needsData'), 'warning');
      return;
    }
    if (this._parseStages(this._stagesText).length > 0) {
      this._context.notify?.(this._t('phase2_noStages'), 'warning');
      return;
    }
    const ct = this._lastResult.ct;
    const primary = this._lastResult.result.subcharts[ct.subcharts[0].id];
    const secondary = this._lastResult.result.subcharts[ct.subcharts[1].id];
    const grab = (sc) => ({ cl: sc.cl, ucl: sc.ucl, lcl: sc.lcl, sigma: sc.sigma });

    this._frozenLimits = {
      chartTypeId: this._chartTypeId,
      subgroupSize: this._subgroupSize,
      columnRef: this._columnRef,
      baselineEnd: this._lastResult.baselineEnd,
      primary: grab(primary),
      secondary: grab(secondary),
      excludedIndices: this._excludedIndices(),
    };
    this._save();
    this._destroyPickerAndRerender();
  },

  /**
   * Re-mount the inputs panel (so the Phase-II badge/button reflect new state)
   * and run the analysis.
   * @private
   */
  _destroyPickerAndRerender() {
    if (this._picker) { this._picker.destroy(); this._picker = null; }
    this._render();
    this._initPicker();
    this._bindContainerEvents();
    this._runAnalysis();
  },

  /**
   * Open the annotation dialog for a single point. Built directly on the
   * dmike-chart-popout shell (project convention — no modal.js for new
   * overlays). Saves the comment + excluded flag and re-runs the analysis.
   * @private
   */
  _openAnnotationDialog(idx) {
    const existing = this._annotations[idx] || { comment: '', excluded: false };

    const overlay = document.createElement('div');
    overlay.className = 'dmike-chart-popout-overlay';

    const win = document.createElement('div');
    win.className = 'dmike-chart-popout dmike-chart-popout--compact';
    win.style.width = '420px';
    win.style.height = 'auto';
    win.style.maxHeight = '80vh';
    win.style.left = 'calc(50% - 210px)';
    win.style.top = '120px';

    const titleBar = document.createElement('div');
    titleBar.className = 'dmike-chart-popout-titlebar';
    const titleText = document.createElement('span');
    titleText.textContent = this._t('annotationTitle', { idx: idx + 1 });
    const closeBtn = document.createElement('button');
    closeBtn.className = 'dmike-chart-popout-close';
    closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';
    titleBar.append(titleText, closeBtn);

    const body = document.createElement('div');
    body.className = 'dmike-chart-popout-body dmike-popout-body--column';
    body.innerHTML = `
      <div class="field-group">
        <label>${esc(this._t('annotationComment'))}</label>
        <textarea class="field" data-ref="ann-comment" rows="3" placeholder="${esc(this._t('annotationPlaceholder'))}">${esc(existing.comment || '')}</textarea>
      </div>
      <div class="field-group">
        <label class="control-chart__check">
          <input type="checkbox" data-ref="ann-excluded" ${existing.excluded ? 'checked' : ''}>
          <span>${esc(this._t('annotationExclude'))}</span>
        </label>
        <span class="control-chart__hint">${esc(this._t('annotationExcludeHint'))}</span>
      </div>
    `;

    const footer = document.createElement('div');
    footer.className = 'dmike-popout-footer';
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn--secondary';
    removeBtn.textContent = this._t('annotationRemove');
    if (!this._annotations[idx]) removeBtn.style.visibility = 'hidden';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn--secondary';
    cancelBtn.textContent = this._context.i18n.t('common.cancel');
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn--primary';
    saveBtn.textContent = this._t('annotationSave');
    footer.append(removeBtn, cancelBtn, saveBtn);

    body.appendChild(footer);
    win.append(titleBar, body);
    overlay.appendChild(win);
    document.body.appendChild(overlay);

    const close = () => {
      window.removeEventListener('keydown', onKey);
      overlay.remove();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    saveBtn.addEventListener('click', () => {
      const comment  = body.querySelector('[data-ref="ann-comment"]')?.value || '';
      const excluded = !!body.querySelector('[data-ref="ann-excluded"]')?.checked;
      if (!comment && !excluded) delete this._annotations[idx];
      else this._annotations[idx] = { comment, excluded };
      this._save();
      this._scheduleAutoRun();
      close();
    });
    removeBtn.addEventListener('click', () => {
      delete this._annotations[idx];
      this._save();
      this._scheduleAutoRun();
      close();
    });

    setTimeout(() => body.querySelector('[data-ref="ann-comment"]')?.focus(), 0);
  },

  // ─── Analysis ───────────────────────────────────────────────

  /** @private */
  async _runAnalysis() {
    const statsBar = this._container.querySelector('[data-ref="stats-bar"]');
    const chartsWrap = this._container.querySelector('[data-ref="charts-wrap"]');
    const violWrap = this._container.querySelector('[data-ref="violations-wrap"]');

    // Not enough input — clear output silently
    if (!this._columnRef) {
      this._destroyCharts();
      if (statsBar) statsBar.innerHTML = '';
      if (chartsWrap) chartsWrap.innerHTML = '';
      if (violWrap) violWrap.innerHTML = '';
      this._lastResult = null;
      return;
    }

    const rawValues = getColumnValues(this._context.stateManager, this._columnRef);
    const values = rawValues.filter(v => v != null && typeof v === 'number' && !isNaN(v));

    if (values.length < 2) {
      this._destroyCharts();
      if (statsBar) statsBar.innerHTML = '';
      if (chartsWrap) chartsWrap.innerHTML = '';
      if (violWrap) violWrap.innerHTML = '';
      this._lastResult = null;
      return;
    }

    const ct = getChartType(this._chartTypeId);
    if (!ct) return;

    const n = this._subgroupSize;
    const stagesParsed = this._parseStages(this._stagesText)
      .filter(b => b > 0 && b < values.length);
    const usingStages = stagesParsed.length > 0;
    const baselineEnd = usingStages ? values.length : (this._baselineCount || values.length);
    const excluded = this._excludedIndices();

    let result;
    if (this._frozenLimits && !usingStages
        && this._frozenLimits.chartTypeId === this._chartTypeId
        && this._frozenLimits.subgroupSize === this._subgroupSize) {
      // Phase II — recompute the plotted series, but graft the frozen limits in.
      const fresh = ct.compute(values, n, baselineEnd, undefined, excluded);
      const primaryId = ct.subcharts[0].id;
      const secondaryId = ct.subcharts[1].id;
      result = {
        subcharts: {
          [primaryId]:   { values: fresh.subcharts[primaryId].values,   ...this._frozenLimits.primary },
          [secondaryId]: { values: fresh.subcharts[secondaryId].values, ...this._frozenLimits.secondary },
        },
        labels: fresh.labels,
      };
    } else {
      result = ct.compute(values, n, baselineEnd, usingStages ? stagesParsed : undefined, excluded);
    }

    const primaryId = ct.subcharts[0].id;
    const primaryData = result.subcharts[primaryId];
    // For Nelson rules, scalar limits are needed. With stages, use the first
    // stage's values as a representative reference for the rule engine —
    // violations are still mostly driven by Rule 1 (point beyond limits) which
    // works per-point in the chart code path. Capability is also computed
    // against the first stage for the same reason.
    const refCL    = Array.isArray(primaryData.cl)    ? primaryData.cl[0]    : primaryData.cl;
    const refSigma = Array.isArray(primaryData.sigma) ? primaryData.sigma[0] : primaryData.sigma;

    const primaryViolations = evaluateNelsonRules(
      primaryData.values, refCL, refSigma, this._enabledRules
    );

    const capability = computeCapability(
      primaryData.values.filter(v => v !== null),
      refCL, refSigma, this._usl, this._lsl
    );

    this._lastResult = { result, ct, primaryViolations, capability, baselineEnd, n, stages: stagesParsed };

    this._renderStats(primaryData, primaryViolations, capability);
    await this._renderCharts(result, ct, primaryViolations, baselineEnd, n, stagesParsed);
    this._renderViolations(primaryViolations);
  },

  /** @private */
  _renderStats(data, violations, capability) {
    const statsBar = this._container.querySelector('[data-ref="stats-bar"]');
    if (!statsBar) return;

    const vCount = new Set(violations.map(v => v.index)).size;
    const total = data.values.filter(v => v !== null).length;
    const fmt = (v) => v.toFixed(4);
    // With stages, cl/ucl/lcl/sigma are arrays — show first stage's values.
    const first = (v) => Array.isArray(v) ? v[0] : v;
    const isStaged = Array.isArray(data.cl);
    const stageNote = isStaged ? ` <span class="control-chart__hint">(${this._t('stage1')})</span>` : '';

    let html = `<div class="dmike-kpi-strip">
      <div class="dmike-kpi">
        <div class="dmike-kpi-value">${fmt(first(data.cl))}</div>
        <div class="dmike-kpi-label">${this._t('statCL')}${stageNote}</div>
        <div class="dmike-kpi-sub">σ̂ = ${fmt(first(data.sigma))}</div>
      </div>
      <div class="dmike-kpi">
        <div class="dmike-kpi-value">${first(data.ucl).toFixed(3)}</div>
        <div class="dmike-kpi-label">UCL / LCL</div>
        <div class="dmike-kpi-sub">${first(data.lcl).toFixed(3)}</div>
      </div>
      <div class="dmike-kpi ${vCount === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad'}">
        <div class="dmike-kpi-value">${vCount}</div>
        <div class="dmike-kpi-label">${this._t('statViolations')}</div>
        <div class="dmike-kpi-sub">${this._t('statOf', { total })}</div>
      </div>`;

    if (capability) {
      const cls = capability.cpk >= 1.33 ? '--good' : capability.cpk >= 1.0 ? '--warn' : '--bad';
      html += `
      <div class="dmike-kpi dmike-kpi${cls}">
        <div class="dmike-kpi-value">${capability.cpk.toFixed(3)}</div>
        <div class="dmike-kpi-label">Cpk</div>
        <div class="dmike-kpi-sub">${capability.cp ? 'Cp = ' + capability.cp.toFixed(3) : ''}</div>
      </div>`;
    }

    html += '</div>';
    statsBar.innerHTML = html;
  },

  /** @private */
  async _renderCharts(result, ct, primaryViolations, baselineEnd, n, stages) {
    this._destroyCharts();
    const chartsWrap = this._container.querySelector('[data-ref="charts-wrap"]');
    if (!chartsWrap) return;
    chartsWrap.innerHTML = '';

    const blEndForChart = ct.id === 'i-mr' ? baselineEnd : Math.ceil(baselineEnd / n);
    const primaryId = ct.subcharts[0].id;
    const lang = this._context.language || 'de';
    const colName = getColumnName(this._context.stateManager, this._columnRef);
    const usingStages = Array.isArray(stages) && stages.length > 0;
    // Convert raw-space stage boundaries to per-subchart space
    const stageBoundariesFor = (subId) => {
      if (!usingStages) return null;
      if (ct.id === 'i-mr') return stages.slice();
      return stages.map(b => Math.ceil(b / n));
    };

    for (const sc of ct.subcharts) {
      const scData = result.subcharts[sc.id];
      const scViolations = sc.id === primaryId
        ? primaryViolations
        : evaluateNelsonRules(scData.values, scData.cl, scData.sigma, this._enabledRules);

      const isStable = scViolations.length === 0;
      const violationIndices = new Set(scViolations.map(v => v.index));

      const wrapper = document.createElement('div');
      wrapper.className = 'control-chart__chart-section';

      const header = document.createElement('div');
      header.className = 'control-chart__chart-header';
      const chartName = this._t('subchart_' + sc.id, { col: colName });
      header.innerHTML = `
        <span class="control-chart__chart-title">${esc(chartName)}</span>
        <span class="control-chart__badge ${isStable ? 'control-chart__badge--stable' : 'control-chart__badge--unstable'}">
          ${isStable ? this._t('stable') : this._t('unstable', { count: scViolations.length })}
        </span>
      `;
      wrapper.appendChild(header);

      const plotEl = document.createElement('div');
      plotEl.className = 'control-chart__plot-wrap';
      wrapper.appendChild(plotEl);
      chartsWrap.appendChild(wrapper);

      const yLabel = sc.yLabel[lang] || sc.yLabel.de || '';

      // Only show spec limits on the primary (value) subchart
      const specOpts = sc.id === primaryId
        ? { usl: this._usl, lsl: this._lsl }
        : { usl: null, lsl: null };

      // Convert excluded indices from raw-space to subchart-space for x-bar/s
      const excludedRaw = this._excludedIndices();
      const excludedForSub = (sc.id === 'i' || sc.id === 'mr')
        ? new Set(excludedRaw)
        : new Set(excludedRaw.map(i => Math.floor(i / n)));

      const chart = await this._context.chartManager.create(plotEl, 'control-chart', {
        title: '',
        xLabel: this._t('xLabelSample'),
        yLabel,
        showLegend: false,
        showTitle: false,
        values: scData.values,
        cl: scData.cl,
        ucl: scData.ucl,
        lcl: scData.lcl,
        sigma: scData.sigma,
        violationIndices,
        excludedIndices: excludedForSub,
        baselineEnd: !usingStages && blEndForChart < scData.values.length ? blEndForChart : null,
        stageBoundaries: stageBoundariesFor(sc.id),
        ...specOpts,
      });
      this._charts.push(chart);
    }
  },

  /** @private */
  _renderViolations(violations) {
    const wrap = this._container.querySelector('[data-ref="violations-wrap"]');
    if (!wrap) return;

    if (violations.length === 0) {
      wrap.innerHTML = `<div class="control-chart__no-violations">${this._t('noViolations')}</div>`;
      return;
    }

    const lang = this._context.language || 'de';
    const unique = [];
    const seen = new Set();
    violations.forEach(v => {
      const k = `${v.index}-${v.ruleId}`;
      if (!seen.has(k)) { seen.add(k); unique.push(v); }
    });
    unique.sort((a, b) => a.index - b.index);

    let rows = '';
    unique.forEach(v => {
      const rule = NELSON_RULES.find(r => r.id === v.ruleId);
      const ann = this._annotations[v.index];
      const annHint = ann
        ? `<span class="control-chart__v-ann"${ann.excluded ? ' data-excluded="1"' : ''}>${esc(ann.comment || '')}${ann.excluded ? ' ⊘' : ''}</span>`
        : `<span class="control-chart__v-add">${esc(this._t('annotationAdd'))}</span>`;
      rows += `<div class="control-chart__violation-row" data-violation-index="${v.index}" role="button" tabindex="0">
        <span class="control-chart__v-idx">#${v.index + 1}</span>
        <span class="control-chart__v-rule">Rule ${v.ruleId}</span>
        <span class="control-chart__v-desc">${esc(rule ? (rule.short[lang] || rule.short.de) : '')}</span>
        ${annHint}
      </div>`;
    });

    wrap.innerHTML = `
      <div class="control-chart__violations-panel">
        <div class="control-chart__violations-header">
          &#9873; ${this._t('violationsTitle', { count: unique.length })}
        </div>
        <div class="control-chart__violations-list">${rows}</div>
      </div>
    `;
  },

  // ─── Helpers ────────────────────────────────────────────────

  /** @private */
  _destroyCharts() {
    for (const c of this._charts) {
      this._context.chartManager.destroy(c);
    }
    this._charts = [];
  },
};
