/**
 * D.Mike — Short-Run (Z-MR) Control Chart Module (short-run-chart.js)
 *
 * Standardised I-MR for short production runs: each value is rescaled within
 * its part (group) to z = (x − x̄_part) / σ̂_part, then plotted on a single
 * I-MR-style chart. Allows mixing parts with different targets/spreads.
 */

import {
  ColumnPicker, getColumnValues, getColumnName,
} from '../../ui/column-picker.js';

import { computeZMR } from '../../engines/short-run-chart-engine.js';
import { esc } from '../../core/html-utils.js';
import { provisionWorksheet, removeProvisionedWorksheet } from '../../core/examples-registry.js';

export default {
  id: 'short-run-chart',
  phase: 'control',
  icon: 'activity',
  i18nKey: 'modules.short-run-chart',
  version: '1.0.0',

  _container: null,
  _context: null,
  _valuesRef: null,
  _groupsRef: null,
  _pickerVal: null,
  _pickerGrp: null,
  _charts: [],
  _autoRunTimer: null,
  /** Worksheet provisioned by loadExample; replaced on each subsequent load. */
  _exampleWorksheetId: null,

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    if (!document.getElementById('short-run-chart-css')) {
      const link = document.createElement('link');
      link.id = 'short-run-chart-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/short-run-chart/short-run-chart.css';
      document.head.appendChild(link);
    }

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) this._loadState(saved);

    this._render();
    this._initPickers();
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
    this._runAnalysis();
  },

  onThemeChange() {},

  getState() {
    return { valuesRef: this._valuesRef, groupsRef: this._groupsRef };
  },

  setState(data) {
    if (data) this._loadState(data);
    if (this._container) {
      this._destroyPickers();
      this._render();
      this._initPickers();
      this._runAnalysis();
    }
  },

  help: () => import('./short-run-chart-help.js'),

  /**
   * Load a catalog example. Provision the inlined worksheet and rewrite
   * both `__source__` placeholders (valuesRef + groupsRef) to point at it.
   *
   * @param {{ meta: object, data: object }} payload
   */
  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = (k) => this._context.i18n.t(k);

    const hasContent = !!(this._valuesRef || this._groupsRef);
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
        if (data.valuesRef?.instanceId === '__source__') {
          data.valuesRef = { ...data.valuesRef, instanceId: ref.instanceId };
        }
        if (data.groupsRef?.instanceId === '__source__') {
          data.groupsRef = { ...data.groupsRef, instanceId: ref.instanceId };
        }
      }
    }

    this.setState(data);
    this._save();

    const lang = this._context.i18n.getLanguage();
    const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
    this._context.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
  },

  _loadState(s) {
    this._valuesRef = s.valuesRef || null;
    this._groupsRef = s.groupsRef || null;
  },

  _save() {
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
  },

  _t(key, vars) { return this._context.i18n.t(`modules.short-run-chart.${key}`, vars); },

  _render() {
    this._container.innerHTML = `
      <div class="src dmike-split">
        <div class="src__input dmike-split__input">

          <div class="dmike-split__section-title">${this._t('sectionData')}</div>
          <div class="field-group">
            <label>${this._t('valuesColumn')}</label>
            <div data-ref="val-picker"></div>
          </div>
          <div class="field-group">
            <label>${this._t('groupsColumn')}</label>
            <div data-ref="grp-picker"></div>
            <span class="src__hint">${this._t('groupsHint')}</span>
          </div>

        </div>

        <div class="src__output dmike-split__output">
          <div data-ref="warning-area"></div>
          <div data-ref="stats-bar"></div>
          <div data-ref="charts-wrap"></div>
          <div data-ref="groups-wrap"></div>
        </div>
      </div>
    `;
  },

  _initPickers() {
    const valWrap = this._container.querySelector('[data-ref="val-picker"]');
    const grpWrap = this._container.querySelector('[data-ref="grp-picker"]');
    if (valWrap) {
      this._pickerVal = new ColumnPicker(valWrap, this._context, {
        mode: 'single', types: ['numeric'], minCount: 4,
        onChange: (ref) => { this._valuesRef = ref; this._save(); this._scheduleAutoRun(); },
      });
      if (this._valuesRef) this._pickerVal.value = this._valuesRef;
    }
    if (grpWrap) {
      // Groups can be numeric or text — accept both.
      this._pickerGrp = new ColumnPicker(grpWrap, this._context, {
        mode: 'single', types: ['numeric', 'text'], minCount: 4,
        onChange: (ref) => { this._groupsRef = ref; this._save(); this._scheduleAutoRun(); },
      });
      if (this._groupsRef) this._pickerGrp.value = this._groupsRef;
    }
  },

  _destroyPickers() {
    if (this._pickerVal) { this._pickerVal.destroy(); this._pickerVal = null; }
    if (this._pickerGrp) { this._pickerGrp.destroy(); this._pickerGrp = null; }
  },

  _scheduleAutoRun() {
    clearTimeout(this._autoRunTimer);
    this._autoRunTimer = setTimeout(() => this._runAnalysis(), 120);
  },

  async _runAnalysis() {
    const warningArea = this._container.querySelector('[data-ref="warning-area"]');
    const statsBar    = this._container.querySelector('[data-ref="stats-bar"]');
    const chartsWrap  = this._container.querySelector('[data-ref="charts-wrap"]');
    const groupsWrap  = this._container.querySelector('[data-ref="groups-wrap"]');

    const clear = () => {
      this._destroyCharts();
      if (warningArea) warningArea.innerHTML = '';
      if (statsBar) statsBar.innerHTML = '';
      if (chartsWrap) chartsWrap.innerHTML = '';
      if (groupsWrap) groupsWrap.innerHTML = '';
    };

    if (!this._valuesRef || !this._groupsRef) { clear(); return; }

    const rawValues = getColumnValues(this._context.stateManager, this._valuesRef);
    const rawGroups = getColumnValues(this._context.stateManager, this._groupsRef);
    const len = Math.min(rawValues.length, rawGroups.length);

    const values = [];
    const groups = [];
    for (let i = 0; i < len; i++) {
      const v = rawValues[i];
      const g = rawGroups[i];
      if (typeof v === 'number' && !isNaN(v) && g != null && g !== '') {
        values.push(v);
        groups.push(g);
      }
    }
    if (values.length < 4) { clear(); return; }

    const r = computeZMR(values, groups);

    if (warningArea) {
      if (r.skipped > 0) {
        warningArea.innerHTML = `<div class="src__warning">${esc(this._t('warningSkipped', { count: r.skipped }))}</div>`;
      } else {
        warningArea.innerHTML = '';
      }
    }

    this._renderStats(r, values.length);
    await this._renderCharts(r);
    this._renderGroupsTable(r);
  },

  _renderStats(r, total) {
    const statsBar = this._container.querySelector('[data-ref="stats-bar"]');
    if (!statsBar) return;
    const sigCount = r.signalsZ.length + r.signalsMR.length;
    const cls = sigCount === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad';
    const fmt = (v) => Number.isFinite(v) ? v.toFixed(3) : '–';
    statsBar.innerHTML = `<div class="dmike-kpi-strip">
      <div class="dmike-kpi">
        <div class="dmike-kpi-value">${r.groups.length}</div>
        <div class="dmike-kpi-label">${this._t('statGroups')}</div>
        <div class="dmike-kpi-sub">${this._t('statTotal', { total })}</div>
      </div>
      <div class="dmike-kpi">
        <div class="dmike-kpi-value">${fmt(r.mrBarZ)}</div>
        <div class="dmike-kpi-label">MR̄ (z)</div>
        <div class="dmike-kpi-sub">UCL_MR ${fmt(r.uclMR)}</div>
      </div>
      <div class="dmike-kpi ${cls}">
        <div class="dmike-kpi-value">${sigCount}</div>
        <div class="dmike-kpi-label">${this._t('statSignals')}</div>
        <div class="dmike-kpi-sub">${this._t('statOf', { total })}</div>
      </div>
    </div>`;
  },

  async _renderCharts(r) {
    this._destroyCharts();
    const chartsWrap = this._container.querySelector('[data-ref="charts-wrap"]');
    if (!chartsWrap) return;
    chartsWrap.innerHTML = '';

    // Stage boundaries from group transitions (visual divider where the part changes).
    const stageBoundaries = [];
    let cumulative = 0;
    for (let i = 0; i < r.groups.length - 1; i++) {
      cumulative += r.groups[i].count;
      stageBoundaries.push(cumulative);
    }

    const colName = getColumnName(this._context.stateManager, this._valuesRef);
    const subcharts = [
      { id: 'z',  values: r.z,  cl: r.clZ,    ucl: r.uclZ, lcl: r.lclZ, sigma: 1,        violations: r.signalsZ,  yLabel: 'z' },
      { id: 'mr', values: r.mr, cl: r.mrBarZ, ucl: r.uclMR, lcl: r.lclMR, sigma: (r.uclMR - r.mrBarZ) / 3, violations: r.signalsMR, yLabel: 'MR (z)' },
    ];

    for (const sc of subcharts) {
      const wrapper = document.createElement('div');
      wrapper.className = 'src__chart-section';
      const header = document.createElement('div');
      header.className = 'src__chart-header';
      const isStable = sc.violations.length === 0;
      header.innerHTML = `
        <span class="src__chart-title">${esc(this._t('chartTitle_' + sc.id, { col: colName }))}</span>
        <span class="src__badge ${isStable ? 'src__badge--stable' : 'src__badge--unstable'}">
          ${isStable ? this._t('stable') : this._t('unstable', { count: sc.violations.length })}
        </span>
      `;
      wrapper.appendChild(header);
      const plotEl = document.createElement('div');
      plotEl.className = 'src__plot-wrap';
      wrapper.appendChild(plotEl);
      chartsWrap.appendChild(wrapper);

      const chart = await this._context.chartManager.create(plotEl, 'control-chart', {
        title: '',
        xLabel: this._t('xLabelSample'),
        yLabel: sc.yLabel,
        showLegend: false,
        showTitle: false,
        values: sc.values,
        cl: sc.cl, ucl: sc.ucl, lcl: sc.lcl, sigma: sc.sigma,
        violationIndices: new Set(sc.violations),
        usl: null, lsl: null,
        showZones: sc.id === 'z',
        stageBoundaries,
      });
      this._charts.push(chart);
    }
  },

  _renderGroupsTable(r) {
    const wrap = this._container.querySelector('[data-ref="groups-wrap"]');
    if (!wrap) return;
    if (!r.groups.length) { wrap.innerHTML = ''; return; }
    const fmt = (v) => Number.isFinite(v) ? v.toFixed(3) : '–';
    let rows = '';
    for (const g of r.groups) {
      rows += `<tr>
        <td>${esc(String(g.group))}</td>
        <td>${g.count}</td>
        <td>${fmt(g.mean)}</td>
        <td>${fmt(g.sigma)}</td>
        <td>${fmt(g.mrBar)}</td>
      </tr>`;
    }
    wrap.innerHTML = `
      <table class="src__groups-table">
        <thead><tr>
          <th>${this._t('thGroup')}</th>
          <th>${this._t('thCount')}</th>
          <th>${this._t('thMean')}</th>
          <th>σ̂</th>
          <th>MR̄</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  },

  _destroyCharts() {
    for (const c of this._charts) this._context.chartManager.destroy(c);
    this._charts = [];
  },
};
