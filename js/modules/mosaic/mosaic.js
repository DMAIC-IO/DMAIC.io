/**
 * D.Mike — Mosaic Chart Module (mosaic.js)
 * Data phase: mosaic plot of two categorical variables.
 *
 * The plot is divided into one column per X-level. Column WIDTH is
 * proportional to the marginal count of that X-level; within a column,
 * the height of each G-segment is proportional to P(G | X).
 *
 * Both slots are required — without two categorical columns, a mosaic
 * is undefined.
 */

import { formatNum } from '../../core/chart/chart-core.js';
import { esc } from '../../core/chart/chart-editor.js';
import {
  DatasetPicker,
  getColumnValues,
  getColumnName,
} from '../../ui/dataset-picker.js';
import { provisionWorksheet, removeProvisionedWorksheet } from '../../core/examples-registry.js';

const PALETTE = [
  'rgba(44,95,138,1)', 'rgba(39,174,96,1)', 'rgba(231,76,60,1)',
  'rgba(243,156,18,1)', 'rgba(142,68,173,1)', 'rgba(52,152,219,1)',
  'rgba(230,126,34,1)', 'rgba(26,188,156,1)', 'rgba(241,196,15,1)',
  'rgba(192,57,43,1)', 'rgba(44,62,80,1)', 'rgba(127,140,141,1)',
];

export default {
  id: 'mosaic',
  phase: 'data',
  icon: 'bar-chart',
  i18nKey: 'modules.mosaic',
  version: '1.0.0',

  _container: null,
  _context: null,
  _picker: null,
  _chart: null,
  _eventUnsubs: [],
  _exampleWorksheetId: null,

  _xRef: null,
  _gRef: null,

  _categories: [],
  _groups: [],

  _chartConfig: {
    title: '',
    showTitle: true,
    showLegend: true,
    showCellLabels: true,
    columnGap: 2,
    segmentGap: 1,
    bgColor: null,
  },

  async init(container, context) {
    this._container = container;
    this._context = context;

    if (!document.getElementById('mosaic-module-css')) {
      const link = document.createElement('link');
      link.id = 'mosaic-module-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/mosaic/mosaic.css';
      document.head.appendChild(link);
    }

    this._picker = null;
    this._chart = null;

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) this._loadState(saved);

    this._render();
    if (this._xRef && this._gRef) {
      requestAnimationFrame(() => this._plot());
    }
  },

  async destroy() {
    for (const unsub of this._eventUnsubs) unsub();
    this._eventUnsubs = [];
    if (this._picker) { this._picker.destroy(); this._picker = null; }
    if (this._chart) {
      this._context.chartManager.destroy(this._chart);
      this._chart = null;
    }
    this._container.innerHTML = '';
  },

  onLanguageChange() {
    if (this._picker) { this._picker.destroy(); this._picker = null; }
    this._chart = null;
    this._render();
    if (this._xRef && this._gRef) this._plot();
  },

  onThemeChange() {
    if (this._chart) this._chart.render();
  },

  getState() {
    return {
      xRef: this._xRef,
      gRef: this._gRef,
      chartConfig: { ...this._chartConfig },
    };
  },

  setState(data) {
    if (data) this._loadState(data);
    if (this._container) {
      if (this._picker) { this._picker.destroy(); this._picker = null; }
      this._chart = null;
      this._render();
      this._plot();
    }
  },

  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = (k) => this._context.i18n.t(k);

    const hasContent = !!(this._xRef && this._gRef);
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
        const rewrite = (r) => (r && r.instanceId === '__source__') ? { ...r, instanceId: ref.instanceId } : r;
        if (data.xRef) data.xRef = rewrite(data.xRef);
        if (data.gRef) data.gRef = rewrite(data.gRef);
      }
    }

    this.setState(data);
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());

    const lang = this._context.i18n.getLanguage();
    const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
    this._context.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
  },

  help: () => import('./mosaic-help.js'),

  _loadState(data) {
    if (data.xRef !== undefined) this._xRef = data.xRef;
    if (data.gRef !== undefined) this._gRef = data.gRef;
    if (data.chartConfig) Object.assign(this._chartConfig, data.chartConfig);
  },

  _buildChartData() {
    if (!this._xRef || !this._gRef) return { categories: [], groups: [] };
    const sm = this._context.stateManager;
    const xVals = getColumnValues(sm, this._xRef);
    const gVals = getColumnValues(sm, this._gRef);
    if (!xVals || !gVals || xVals.length === 0 || gVals.length === 0) {
      return { categories: [], groups: [] };
    }

    const cleanCat = (v) => v == null || v === '' ? '' : String(v);
    const xLevels = [];
    const xSeen = new Set();
    const gLevels = [];
    const gSeen = new Set();
    const n = Math.min(xVals.length, gVals.length);

    for (let i = 0; i < n; i++) {
      const xc = cleanCat(xVals[i]);
      const gc = cleanCat(gVals[i]);
      if (xc === '' || gc === '') continue;
      if (!xSeen.has(xc)) { xSeen.add(xc); xLevels.push(xc); }
      if (!gSeen.has(gc)) { gSeen.add(gc); gLevels.push(gc); }
    }
    if (xLevels.length === 0 || gLevels.length === 0) return { categories: [], groups: [] };

    const matrix = {};
    for (const x of xLevels) {
      matrix[x] = {};
      for (const g of gLevels) matrix[x][g] = 0;
    }
    for (let i = 0; i < n; i++) {
      const x = cleanCat(xVals[i]);
      const g = cleanCat(gVals[i]);
      if (matrix[x] && matrix[x][g] !== undefined) matrix[x][g] += 1;
    }

    const groups = gLevels.map((gName, gi) => ({
      name: gName,
      values: xLevels.map((xLvl) => matrix[xLvl][gName]),
      color: PALETTE[gi % PALETTE.length],
    }));

    return { categories: xLevels, groups };
  },

  _xColumnName() {
    return this._xRef ? getColumnName(this._context.stateManager, this._xRef) : '';
  },

  _gColumnName() {
    return this._gRef ? getColumnName(this._context.stateManager, this._gRef) : '';
  },

  _render() {
    const t = (k, v) => this._context.i18n.t(`modules.mosaic.${k}`, v);

    this._container.innerHTML = `
      <div class="mosaic-module dmike-split">
        <div class="mosaic-module__input dmike-split__input">
          <div class="dmike-split__section-title">${t('sectionData')}</div>
          <div data-ref="picker-wrap"></div>

          <div class="mosaic-module__error" data-ref="error-box"></div>
        </div>

        <div class="mosaic-module__output dmike-split__output">
          <div data-ref="placeholder" class="mosaic-module__placeholder">${esc(t('placeholderPickBoth'))}</div>
          <div class="mosaic-module__chart-area" data-ref="chart-area" style="display:none">
            <div class="mosaic-module__chart-wrap" data-ref="chart-wrap"></div>
            <div class="mosaic-module__stats-panel" data-ref="stats-panel"></div>
          </div>
        </div>
      </div>
    `;

    this._createPicker();
  },

  _createPicker() {
    const pickerWrap = this._container.querySelector('[data-ref="picker-wrap"]');
    if (!pickerWrap) return;

    if (this._picker) { this._picker.destroy(); this._picker = null; }

    const i18n = this._context.i18n;
    this._picker = new DatasetPicker(pickerWrap, this._context, {
      slots: [
        { key: 'x', label: 'X', title: i18n.t('modules.mosaic.slotX'), minCount: 1, required: true },
        { key: 'g', label: 'G', title: i18n.t('modules.mosaic.slotG'), minCount: 1, required: true },
      ],
      onChange: (datasets) => {
        const ds = datasets[0] || {};
        this._xRef = ds.x || null;
        this._gRef = ds.g || null;
        this._plot();
      },
    });

    if (this._xRef || this._gRef) {
      this._picker.value = [{ x: this._xRef, g: this._gRef }];
    }
  },

  async _plot() {
    const { categories, groups } = this._buildChartData();
    this._categories = categories;
    this._groups = groups;

    const chartArea = this._container?.querySelector('[data-ref="chart-area"]');
    const placeholder = this._container?.querySelector('[data-ref="placeholder"]');

    if (categories.length === 0 || groups.length === 0) {
      if (chartArea) chartArea.style.display = 'none';
      if (placeholder) placeholder.style.display = '';
      if (this._chart) {
        this._context.chartManager.destroy(this._chart);
        this._chart = null;
      }
      return;
    }

    if (chartArea) chartArea.style.display = '';
    if (placeholder) placeholder.style.display = 'none';

    const cfg = this._chartConfig;
    const mosaicConfig = {
      title: cfg.title || '',
      showTitle: cfg.showTitle && !!cfg.title,
      xLabel: this._xColumnName() || '',
      yLabel: '',
      categories,
      groups,
      showLegend: cfg.showLegend,
      legendTitle: this._gColumnName() || '',
      showCellLabels: cfg.showCellLabels,
      columnGap: cfg.columnGap,
      segmentGap: cfg.segmentGap,
      bgColor: cfg.bgColor,
    };

    const chartWrap = this._container.querySelector('[data-ref="chart-wrap"]');
    if (this._chart) {
      this._context.chartManager.update(this._chart, mosaicConfig);
    } else {
      chartWrap.innerHTML = '';
      this._chart = await this._context.chartManager.create(chartWrap, 'mosaic', mosaicConfig);
    }

    this._renderStats();
    this._saveState();
  },

  _saveState() {
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
  },

  _renderStats() {
    const panel = this._container?.querySelector('[data-ref="stats-panel"]');
    if (!panel) return;
    const t = (k, v) => this._context.i18n.t(`modules.mosaic.${k}`, v);

    // Cross-tab table with row totals (per X-level) and grand total.
    let headerHTML = `<tr><th>${esc(this._xColumnName() || t('statX'))} \\ ${esc(this._gColumnName() || t('statG'))}</th>`;
    for (const g of this._groups) {
      headerHTML += `<th><span class="mosaic-module__stats-color" style="background:${g.color}"></span> ${esc(g.name)}</th>`;
    }
    headerHTML += `<th>${esc(t('statTotal'))}</th></tr>`;

    let bodyHTML = '';
    const colTotals = this._groups.map(() => 0);
    let grandTotal = 0;
    for (let ci = 0; ci < this._categories.length; ci++) {
      let rowTotal = 0;
      let row = `<tr><td>${esc(this._categories[ci])}</td>`;
      for (let gi = 0; gi < this._groups.length; gi++) {
        const v = this._groups[gi].values[ci] || 0;
        row += `<td>${formatNum(v)}</td>`;
        rowTotal += v;
        colTotals[gi] += v;
      }
      grandTotal += rowTotal;
      row += `<td>${formatNum(rowTotal)}</td></tr>`;
      bodyHTML += row;
    }

    let totalRow = `<tr style="font-weight:600;border-top:2px solid var(--color-border-primary)"><td>${esc(t('statTotal'))}</td>`;
    for (const tv of colTotals) totalRow += `<td>${formatNum(tv)}</td>`;
    totalRow += `<td>${formatNum(grandTotal)}</td></tr>`;

    panel.innerHTML = `
      <div class="dmike-split__output-section">${esc(t('statsTitle'))}</div>
      <table class="dmike-table mosaic-module__stats-table">
        <thead>${headerHTML}</thead>
        <tbody>${bodyHTML}${totalRow}</tbody>
      </table>`;
  },
};
