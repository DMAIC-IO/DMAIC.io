/**
 * D.Mike — Attribute Control Chart Module (attribute-control-chart.js)
 * Control phase: SPC charts for attribute (count/proportion) data.
 *
 *   p   — proportion defective, variable subgroup size
 *   np  — number defective,     constant subgroup size
 *   c   — defects per unit,     constant area of opportunity
 *   u   — defects per unit,     variable area of opportunity
 *
 * Data is selected via column-picker. Required columns depend on chart type:
 *   p, u  → defect-count column + sample-size column (variable n allowed)
 *   np    → defect-count column + single n input (constant)
 *   c     → defect-count column only
 */

import {
  ColumnPicker, getColumnValues, getColumnName,
} from '../../ui/column-picker.js';

import {
  ATTRIBUTE_CHART_TYPES, getAttributeChartType,
  ATTRIBUTE_NELSON_RULES, ATTR_DEFAULT_ENABLED_RULES,
  evaluateAttributeRules,
} from '../../engines/attribute-control-chart-engine.js';

import { esc } from '../../core/html-utils.js';
import { provisionWorksheet, removeProvisionedWorksheet } from '../../core/examples-registry.js';

export default {
  id: 'attribute-control-chart',
  phase: 'control',
  icon: 'activity',
  i18nKey: 'modules.attribute-control-chart',
  version: '1.0.0',

  _container: null,
  _context: null,
  _chartTypeId: 'p',
  _defectsRef: null,
  _sizeRef: null,
  _constantN: 50,
  _baselineCount: null,
  _enabledRules: [...ATTR_DEFAULT_ENABLED_RULES],
  _charts: [],
  _lastResult: null,
  _autoRunTimer: null,
  _pickerDefects: null,
  _pickerSize: null,
  /** Worksheet provisioned by loadExample; replaced on each subsequent load. */
  _exampleWorksheetId: null,

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    if (!document.getElementById('attribute-control-chart-css')) {
      const link = document.createElement('link');
      link.id = 'attribute-control-chart-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/attribute-control-chart/attribute-control-chart.css';
      document.head.appendChild(link);
    }

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) this._loadState(saved);

    this._render();
    this._initPickers();
    this._bindContainerEvents();
    this._runAnalysis();
  },

  async destroy() {
    clearTimeout(this._autoRunTimer);
    this._destroyPickers();
    this._destroyCharts();
    this._container.innerHTML = '';
  },

  onLanguageChange() {
    this._destroyCharts();
    this._destroyPickers();
    this._render();
    this._initPickers();
    this._bindContainerEvents();
    this._runAnalysis();
  },

  onThemeChange() {},

  getState() {
    return {
      chartTypeId: this._chartTypeId,
      defectsRef: this._defectsRef,
      sizeRef: this._sizeRef,
      constantN: this._constantN,
      baselineCount: this._baselineCount,
      enabledRules: this._enabledRules,
    };
  },

  setState(data) {
    if (data) this._loadState(data);
    if (this._container) {
      this._destroyPickers();
      this._render();
      this._initPickers();
      this._bindContainerEvents();
      this._runAnalysis();
    }
  },

  help: () => import('./attribute-control-chart-help.js'),

  /**
   * Load a catalog example. The payload carries the project state plus an
   * inlined `sourceWorksheetData` (resolved from `sourceWorksheetFile` by
   * the registry). We provision a fresh worksheet, rewrite the `__source__`
   * placeholder in defectsRef/sizeRef, then apply the state.
   *
   * @param {{ meta: object, data: object }} payload
   */
  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = (k) => this._context.i18n.t(k);

    const hasContent = !!(this._defectsRef || this._sizeRef);
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
        if (data.defectsRef?.instanceId === '__source__') {
          data.defectsRef = { ...data.defectsRef, instanceId: ref.instanceId };
        }
        if (data.sizeRef?.instanceId === '__source__') {
          data.sizeRef = { ...data.sizeRef, instanceId: ref.instanceId };
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

  /** @private */
  _loadState(saved) {
    this._chartTypeId = saved.chartTypeId || 'p';
    this._defectsRef = saved.defectsRef || null;
    this._sizeRef = saved.sizeRef || null;
    this._constantN = saved.constantN ?? 50;
    this._baselineCount = saved.baselineCount ?? null;
    this._enabledRules = saved.enabledRules || [...ATTR_DEFAULT_ENABLED_RULES];
  },

  /** @private */
  _save() {
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
  },

  // ─── Render ─────────────────────────────────────────────────

  /** @private */
  _t(key, vars) {
    return this._context.i18n.t(`modules.attribute-control-chart.${key}`, vars);
  },

  /** @private */
  _render() {
    const ct = getAttributeChartType(this._chartTypeId);
    const showSizeCol = !!ct?.requiresSampleSize;
    const showConstN = !!ct?.requiresConstantN;

    this._container.innerHTML = `
      <div class="attr-cc dmike-split">
        <div class="attr-cc__input dmike-split__input">

          <div class="dmike-split__section-title">${this._t('sectionChartType')}</div>
          <div class="field-group">
            <label>${this._t('chartType')}</label>
            <select class="field" data-ref="chart-type">
              ${ATTRIBUTE_CHART_TYPES.map(t => `<option value="${t.id}"${t.id === this._chartTypeId ? ' selected' : ''}>${this._t('type_' + t.id)}</option>`).join('')}
            </select>
            <span class="attr-cc__hint">${this._t('typeHint_' + this._chartTypeId)}</span>
          </div>

          <div class="dmike-split__section-title">${this._t('sectionData')}</div>

          <div class="field-group">
            <label>${this._t('defectsColumn')}</label>
            <div data-ref="defects-picker"></div>
          </div>

          <div class="field-group" data-ref="size-row" style="${showSizeCol ? '' : 'display:none'}">
            <label>${this._t('sizeColumn')}</label>
            <div data-ref="size-picker"></div>
            <span class="attr-cc__hint">${this._t('sizeHint')}</span>
          </div>

          <div class="field-group" data-ref="constn-row" style="${showConstN ? '' : 'display:none'}">
            <label>${this._t('constantN')}</label>
            <input type="number" class="field field--num" data-ref="constant-n"
              value="${this._constantN}" min="1" step="1">
            <span class="attr-cc__hint">${this._t('constantNHint')}</span>
          </div>

          <div class="field-group">
            <label>${this._t('baselineCount')}</label>
            <input type="number" class="field field--num" data-ref="baseline-count"
              value="${this._baselineCount ?? ''}" min="2" placeholder="${this._t('baselineAll')}">
            <span class="attr-cc__hint">${this._t('baselineHint')}</span>
          </div>

          <div class="dmike-split__section-title attr-cc__collapsible" data-ref="nelson-toggle">
            ${this._t('sectionNelson')}
            <span class="attr-cc__chevron">&#9660;</span>
          </div>
          <div class="attr-cc__nelson-panel" data-ref="nelson-panel">
            ${this._buildNelsonRules()}
          </div>

        </div>

        <div class="attr-cc__output dmike-split__output">
          <div data-ref="stats-bar"></div>
          <div data-ref="charts-wrap"></div>
          <div data-ref="violations-wrap"></div>
        </div>
      </div>
    `;
  },

  /** @private */
  _initPickers() {
    const defWrap = this._container.querySelector('[data-ref="defects-picker"]');
    if (defWrap) {
      this._pickerDefects = new ColumnPicker(defWrap, this._context, {
        mode: 'single',
        types: ['numeric'],
        minCount: 2,
        onChange: (ref) => {
          this._defectsRef = ref;
          this._save();
          this._scheduleAutoRun();
        },
      });
      if (this._defectsRef) this._pickerDefects.value = this._defectsRef;
    }

    const sizeWrap = this._container.querySelector('[data-ref="size-picker"]');
    if (sizeWrap) {
      this._pickerSize = new ColumnPicker(sizeWrap, this._context, {
        mode: 'single',
        types: ['numeric'],
        minCount: 2,
        onChange: (ref) => {
          this._sizeRef = ref;
          this._save();
          this._scheduleAutoRun();
        },
      });
      if (this._sizeRef) this._pickerSize.value = this._sizeRef;
    }
  },

  /** @private */
  _destroyPickers() {
    if (this._pickerDefects) { this._pickerDefects.destroy(); this._pickerDefects = null; }
    if (this._pickerSize) { this._pickerSize.destroy(); this._pickerSize = null; }
  },

  /** @private */
  _buildNelsonRules() {
    const lang = this._context.language || 'de';
    const enabledSet = new Set(this._enabledRules);

    return ATTRIBUTE_NELSON_RULES.map(rule => `
      <label class="attr-cc__nelson-rule">
        <input type="checkbox" data-rule="${rule.id}" ${enabledSet.has(rule.id) ? 'checked' : ''}>
        <span>
          <strong>${esc(rule.short[lang] || rule.short.de)}</strong><br>
          <span class="attr-cc__nelson-desc">${esc(rule.desc[lang] || rule.desc.de)}</span>
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
        if (panel) panel.classList.toggle('attr-cc__nelson-panel--collapsed');
        toggle.classList.toggle('attr-cc__collapsible--collapsed');
      }
    });

    this._container.addEventListener('change', (e) => {
      const ref = e.target.dataset?.ref;
      if (ref === 'chart-type') {
        this._chartTypeId = e.target.value;
        this._save();
        // Re-render to show/hide size column / constant-n input
        this._destroyPickers();
        this._render();
        this._initPickers();
      }
      if (ref === 'constant-n') {
        const v = parseInt(e.target.value);
        this._constantN = (Number.isFinite(v) && v > 0) ? v : 50;
        this._save();
      }
      if (ref === 'baseline-count') {
        const val = parseInt(e.target.value);
        this._baselineCount = isNaN(val) ? null : val;
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

      this._scheduleAutoRun();
    });
  },

  /** @private — debounced auto-run */
  _scheduleAutoRun() {
    clearTimeout(this._autoRunTimer);
    this._autoRunTimer = setTimeout(() => this._runAnalysis(), 120);
  },

  // ─── Analysis ───────────────────────────────────────────────

  /** @private */
  _readNumericColumn(ref) {
    const raw = getColumnValues(this._context.stateManager, ref);
    return raw.map(v => (typeof v === 'number' && !isNaN(v)) ? v : null);
  },

  /** @private */
  async _runAnalysis() {
    const statsBar = this._container.querySelector('[data-ref="stats-bar"]');
    const chartsWrap = this._container.querySelector('[data-ref="charts-wrap"]');
    const violWrap = this._container.querySelector('[data-ref="violations-wrap"]');

    const clear = () => {
      this._destroyCharts();
      if (statsBar) statsBar.innerHTML = '';
      if (chartsWrap) chartsWrap.innerHTML = '';
      if (violWrap) violWrap.innerHTML = '';
      this._lastResult = null;
    };

    if (!this._defectsRef) { clear(); return; }

    const ct = getAttributeChartType(this._chartTypeId);
    if (!ct) { clear(); return; }

    const defectsRaw = this._readNumericColumn(this._defectsRef);

    let result, n, valid;
    try {
      if (this._chartTypeId === 'p' || this._chartTypeId === 'u') {
        if (!this._sizeRef) { clear(); return; }
        const sizesRaw = this._readNumericColumn(this._sizeRef);
        // Pair-wise filter rows where either is null
        const pairs = [];
        const len = Math.min(defectsRaw.length, sizesRaw.length);
        for (let i = 0; i < len; i++) {
          if (defectsRaw[i] != null && sizesRaw[i] != null && sizesRaw[i] > 0) {
            pairs.push([defectsRaw[i], sizesRaw[i]]);
          }
        }
        if (pairs.length < 2) { clear(); return; }
        const defects = pairs.map(p => p[0]);
        const sizes = pairs.map(p => p[1]);
        result = ct.compute({ defects, n: sizes, baselineEnd: this._baselineCount });
        n = sizes;
        valid = pairs.length;
      } else if (this._chartTypeId === 'np') {
        const defects = defectsRaw.filter(v => v != null);
        if (defects.length < 2) { clear(); return; }
        result = ct.compute({ defects, n: this._constantN, baselineEnd: this._baselineCount });
        n = result.n;
        valid = defects.length;
      } else { // c
        const defects = defectsRaw.filter(v => v != null);
        if (defects.length < 2) { clear(); return; }
        result = ct.compute({ defects, baselineEnd: this._baselineCount });
        n = null;
        valid = defects.length;
      }
    } catch (err) {
      console.error('attribute-control-chart compute error', err);
      clear();
      return;
    }

    const violations = evaluateAttributeRules(
      result.values, result.cl, result.ucl, result.lcl, result.sigma, this._enabledRules,
    );

    this._lastResult = { result, ct, violations, n, valid };

    this._renderStats(result, violations, valid);
    await this._renderChart(result, violations);
    this._renderViolations(violations);
  },

  /** @private */
  _renderStats(result, violations, total) {
    const statsBar = this._container.querySelector('[data-ref="stats-bar"]');
    if (!statsBar) return;

    const vCount = new Set(violations.map(v => v.index)).size;

    const fmt = (v) => Number.isFinite(v) ? v.toFixed(4) : '–';
    const meanArr = (a) => Array.isArray(a) ? a.reduce((s, x) => s + x, 0) / Math.max(1, a.length) : a;
    const uclMean = meanArr(result.ucl);
    const lclMean = meanArr(result.lcl);
    const variableTag = result.variableLimits
      ? `<span class="attr-cc__var-warning">${this._t('variableLimits')}</span>`
      : '';

    statsBar.innerHTML = `<div class="dmike-kpi-strip">
      <div class="dmike-kpi">
        <div class="dmike-kpi-value">${fmt(result.cl)}</div>
        <div class="dmike-kpi-label">${this._t('statCL')}</div>
        <div class="dmike-kpi-sub">${this._t('statCenterFor_' + this._chartTypeId)}</div>
      </div>
      <div class="dmike-kpi">
        <div class="dmike-kpi-value">${uclMean.toFixed(3)}</div>
        <div class="dmike-kpi-label">${result.variableLimits ? 'UCL̄ / LCL̄' : 'UCL / LCL'}</div>
        <div class="dmike-kpi-sub">${lclMean.toFixed(3)} ${variableTag}</div>
      </div>
      <div class="dmike-kpi ${vCount === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad'}">
        <div class="dmike-kpi-value">${vCount}</div>
        <div class="dmike-kpi-label">${this._t('statViolations')}</div>
        <div class="dmike-kpi-sub">${this._t('statOf', { total })}</div>
      </div>
    </div>`;
  },

  /** @private */
  async _renderChart(result, violations) {
    this._destroyCharts();
    const chartsWrap = this._container.querySelector('[data-ref="charts-wrap"]');
    if (!chartsWrap) return;
    chartsWrap.innerHTML = '';

    const lang = this._context.language || 'de';
    const colName = getColumnName(this._context.stateManager, this._defectsRef);
    const isStable = violations.length === 0;
    const violationIndices = new Set(violations.map(v => v.index));

    const wrapper = document.createElement('div');
    wrapper.className = 'attr-cc__chart-section';

    const header = document.createElement('div');
    header.className = 'attr-cc__chart-header';
    const chartName = this._t('subchart_' + this._chartTypeId, { col: colName });
    header.innerHTML = `
      <span class="attr-cc__chart-title">${esc(chartName)}</span>
      <span class="attr-cc__badge ${isStable ? 'attr-cc__badge--stable' : 'attr-cc__badge--unstable'}">
        ${isStable ? this._t('stable') : this._t('unstable', { count: violations.length })}
      </span>
    `;
    wrapper.appendChild(header);

    const plotEl = document.createElement('div');
    plotEl.className = 'attr-cc__plot-wrap';
    wrapper.appendChild(plotEl);
    chartsWrap.appendChild(wrapper);

    const yLabel = this._t('yLabel_' + this._chartTypeId);
    const baselineEnd = this._baselineCount && this._baselineCount < result.values.length
      ? this._baselineCount : null;

    const chart = await this._context.chartManager.create(plotEl, 'control-chart', {
      title: '',
      xLabel: this._t('xLabelSample'),
      yLabel,
      showLegend: false,
      showTitle: false,
      values: result.values,
      cl: result.cl,
      ucl: result.ucl,
      lcl: result.lcl,
      sigma: result.sigma,
      violationIndices,
      baselineEnd,
      // Attribute charts don't use spec limits
      usl: null, lsl: null,
      // Hide zone bands when limits are variable (zones not meaningful)
      showZones: !result.variableLimits,
    });
    this._charts.push(chart);
  },

  /** @private */
  _renderViolations(violations) {
    const wrap = this._container.querySelector('[data-ref="violations-wrap"]');
    if (!wrap) return;

    if (violations.length === 0) {
      wrap.innerHTML = `<div class="attr-cc__no-violations">${this._t('noViolations')}</div>`;
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
      const rule = ATTRIBUTE_NELSON_RULES.find(r => r.id === v.ruleId);
      rows += `<div class="attr-cc__violation-row">
        <span class="attr-cc__v-idx">#${v.index + 1}</span>
        <span class="attr-cc__v-rule">Rule ${v.ruleId}</span>
        <span class="attr-cc__v-desc">${esc(rule ? (rule.short[lang] || rule.short.de) : '')}</span>
      </div>`;
    });

    wrap.innerHTML = `
      <div class="attr-cc__violations-panel">
        <div class="attr-cc__violations-header">
          &#9873; ${this._t('violationsTitle', { count: unique.length })}
        </div>
        <div class="attr-cc__violations-list">${rows}</div>
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
