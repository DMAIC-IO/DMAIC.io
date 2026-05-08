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
  _usl: null,
  _lsl: null,
  _enabledRules: [...DEFAULT_ENABLED_RULES],
  _charts: [],
  _lastResult: null,
  _eventUnsubs: [],
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
      usl: this._usl,
      lsl: this._lsl,
      enabledRules: this._enabledRules,
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

  help: () => import('./control-chart-help.js'),

  // ─── State ──────────────────────────────────────────────────

  /** @private */
  _loadState(saved) {
    this._chartTypeId = saved.chartTypeId || 'i-mr';
    this._subgroupSize = saved.subgroupSize || 1;
    this._columnRef = saved.columnRef || null;
    this._baselineCount = saved.baselineCount ?? null;
    this._usl = saved.usl ?? null;
    this._lsl = saved.lsl ?? null;
    this._enabledRules = saved.enabledRules || [...DEFAULT_ENABLED_RULES];
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
    const baselineEnd = this._baselineCount || values.length;

    const result = ct.compute(values, n, baselineEnd);

    const primaryId = ct.subcharts[0].id;
    const primaryData = result.subcharts[primaryId];
    const primaryViolations = evaluateNelsonRules(
      primaryData.values, primaryData.cl, primaryData.sigma, this._enabledRules
    );

    const capability = computeCapability(
      primaryData.values.filter(v => v !== null),
      primaryData.cl, primaryData.sigma, this._usl, this._lsl
    );

    this._lastResult = { result, ct, primaryViolations, capability, baselineEnd, n };

    this._renderStats(primaryData, primaryViolations, capability);
    await this._renderCharts(result, ct, primaryViolations, baselineEnd, n);
    this._renderViolations(primaryViolations);
  },

  /** @private */
  _renderStats(data, violations, capability) {
    const statsBar = this._container.querySelector('[data-ref="stats-bar"]');
    if (!statsBar) return;

    const vCount = new Set(violations.map(v => v.index)).size;
    const total = data.values.filter(v => v !== null).length;
    const fmt = (v) => v.toFixed(4);

    let html = `<div class="dmike-kpi-strip">
      <div class="dmike-kpi">
        <div class="dmike-kpi-value">${fmt(data.cl)}</div>
        <div class="dmike-kpi-label">${this._t('statCL')}</div>
        <div class="dmike-kpi-sub">σ̂ = ${fmt(data.sigma)}</div>
      </div>
      <div class="dmike-kpi">
        <div class="dmike-kpi-value">${data.ucl.toFixed(3)}</div>
        <div class="dmike-kpi-label">UCL / LCL</div>
        <div class="dmike-kpi-sub">${data.lcl.toFixed(3)}</div>
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
  async _renderCharts(result, ct, primaryViolations, baselineEnd, n) {
    this._destroyCharts();
    const chartsWrap = this._container.querySelector('[data-ref="charts-wrap"]');
    if (!chartsWrap) return;
    chartsWrap.innerHTML = '';

    const blEndForChart = ct.id === 'i-mr' ? baselineEnd : Math.ceil(baselineEnd / n);
    const primaryId = ct.subcharts[0].id;
    const lang = this._context.language || 'de';
    const colName = getColumnName(this._context.stateManager, this._columnRef);

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
        baselineEnd: blEndForChart < scData.values.length ? blEndForChart : null,
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
      rows += `<div class="control-chart__violation-row">
        <span class="control-chart__v-idx">#${v.index + 1}</span>
        <span class="control-chart__v-rule">Rule ${v.ruleId}</span>
        <span class="control-chart__v-desc">${esc(rule ? (rule.short[lang] || rule.short.de) : '')}</span>
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
