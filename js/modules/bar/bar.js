/**
 * D.Mike — Bar Chart Module (bar.js)
 * Data phase: bar chart from worksheet columns.
 *
 * Three input modes (driven by the column slots the user fills):
 *   - X only            → frequency count per category (single series)
 *   - X + Y             → mean of Y per X-level     (single series)
 *   - X + G             → cross-tab count           (one series per G-level)
 *   - X + Y + G         → mean of Y per (X, G)      (one series per G-level)
 *
 * Renders through the shared bar chart type (`bar.js` in core/chart/types).
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
  id: 'bar',
  phase: 'data',
  icon: 'bar-chart',
  i18nKey: 'modules.bar',
  version: '1.0.0',

  _container: null,
  _context: null,
  _picker: null,
  _chart: null,
  _eventUnsubs: [],
  _exampleWorksheetId: null,

  // Column references (selected slots)
  _xRef: null,   // category column (required)
  _yRef: null,   // numeric value column (optional)
  _gRef: null,   // group-by column (optional)

  // Computed chart data
  _categories: [],
  _groups: [],

  _chartConfig: {
    showTitle: true,
    title: '',
    titleSize: 15,
    showLegend: true,
    stacked: false,
    aggregation: 'mean',  // 'mean' | 'sum' (only used when yRef present)
    barGap: 4,
    categoryGap: 0.3,
    bgColor: null,
    xLabel: '',
    yLabel: '',
  },

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    if (!document.getElementById('bar-module-css')) {
      const link = document.createElement('link');
      link.id = 'bar-module-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/bar/bar.css';
      document.head.appendChild(link);
    }

    this._picker = null;
    this._chart = null;

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) this._loadState(saved);

    this._render();
    if (this._xRef) {
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
    if (this._xRef) this._plot();
  },

  onThemeChange() {
    if (this._chart) this._chart.render();
  },

  getState() {
    return {
      xRef: this._xRef,
      yRef: this._yRef,
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

  /**
   * Load a catalog example. Bar's native state shape is xRef/yRef/gRef.
   *
   * @param {{ meta: object, data: object }} payload
   */
  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = (k) => this._context.i18n.t(k);

    const hasContent = !!(this._xRef);
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
        if (data.yRef) data.yRef = rewrite(data.yRef);
        if (data.gRef) data.gRef = rewrite(data.gRef);
      }
    }

    this.setState(data);
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());

    const lang = this._context.i18n.getLanguage();
    const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
    this._context.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
  },

  help: () => import('./bar-help.js'),

  _loadState(data) {
    if (data.xRef !== undefined) this._xRef = data.xRef;
    if (data.yRef !== undefined) this._yRef = data.yRef;
    if (data.gRef !== undefined) this._gRef = data.gRef;
    if (data.chartConfig) Object.assign(this._chartConfig, data.chartConfig);
  },

  // ─── Build Categories + Groups From Worksheet ───────────────

  _buildChartData() {
    if (!this._xRef) return { categories: [], groups: [] };
    const sm = this._context.stateManager;
    const xVals = getColumnValues(sm, this._xRef);
    if (!xVals || xVals.length === 0) return { categories: [], groups: [] };

    const yVals = this._yRef ? getColumnValues(sm, this._yRef) : null;
    const gVals = this._gRef ? getColumnValues(sm, this._gRef) : null;

    const cleanCat = (v) => v == null || v === '' ? '' : String(v);
    const toNum = (v) => {
      if (v == null || v === '') return NaN;
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : NaN;
    };

    // ── Pass 1: discover ordered category levels (X) and group levels (G).
    const xLevels = [];
    const xSeen = new Set();
    const gLevels = [];
    const gSeen = new Set();
    const n = Math.min(xVals.length, yVals ? yVals.length : Infinity, gVals ? gVals.length : Infinity);

    for (let i = 0; i < n; i++) {
      const xc = cleanCat(xVals[i]);
      if (xc === '') continue;
      if (!xSeen.has(xc)) { xSeen.add(xc); xLevels.push(xc); }
      if (gVals) {
        const gc = cleanCat(gVals[i]);
        if (gc === '' || gSeen.has(gc)) continue;
        gSeen.add(gc); gLevels.push(gc);
      }
    }
    if (xLevels.length === 0) return { categories: [], groups: [] };

    // ── Pass 2: aggregate values.
    //   bucket[x][g] = { sum, count } when yRef present (mean/sum agg)
    //                = { count }       when yRef absent  (frequency)
    const groupNames = gVals ? gLevels : ['__single__'];
    const matrix = {};  // matrix[xLevel] = { gName: {sum, count} }
    for (const x of xLevels) {
      matrix[x] = {};
      for (const g of groupNames) matrix[x][g] = { sum: 0, count: 0 };
    }

    for (let i = 0; i < n; i++) {
      const x = cleanCat(xVals[i]);
      if (x === '' || !matrix[x]) continue;
      const g = gVals ? cleanCat(gVals[i]) : '__single__';
      if (g === '' || !matrix[x][g]) continue;
      if (yVals) {
        const y = toNum(yVals[i]);
        if (!Number.isFinite(y)) continue;
        matrix[x][g].sum += y;
        matrix[x][g].count += 1;
      } else {
        matrix[x][g].count += 1;
      }
    }

    // ── Pass 3: project to {categories, groups[]}
    const useMean = !!yVals && this._chartConfig.aggregation === 'mean';
    const useSum  = !!yVals && this._chartConfig.aggregation === 'sum';

    const groups = groupNames.map((gName, gi) => {
      const values = xLevels.map((xLvl) => {
        const cell = matrix[xLvl][gName];
        if (useMean) return cell.count > 0 ? cell.sum / cell.count : 0;
        if (useSum)  return cell.sum;
        return cell.count;
      });
      const seriesName = gVals
        ? gName
        : (yVals ? (this._yColumnName() || '') : (this._xColumnName() || ''));
      return {
        name: seriesName,
        values,
        color: PALETTE[gi % PALETTE.length],
      };
    });

    return { categories: xLevels, groups };
  },

  _xColumnName() {
    return this._xRef ? getColumnName(this._context.stateManager, this._xRef) : '';
  },

  _yColumnName() {
    return this._yRef ? getColumnName(this._context.stateManager, this._yRef) : '';
  },

  _gColumnName() {
    return this._gRef ? getColumnName(this._context.stateManager, this._gRef) : '';
  },

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    const t = (k, v) => this._context.i18n.t(`modules.bar.${k}`, v);

    this._container.innerHTML = `
      <div class="bar-module dmike-split">
        <div class="bar-module__input dmike-split__input">
          <div class="dmike-split__section-title">${t('sectionData')}</div>
          <div data-ref="picker-wrap"></div>

          <div class="bar-module__options" data-ref="options-wrap"></div>

          <div class="bar-module__error" data-ref="error-box"></div>
        </div>

        <div class="bar-module__output dmike-split__output">
          <div data-ref="placeholder" class="bar-module__placeholder">${esc(t('placeholderPickX'))}</div>
          <div class="bar-module__chart-area" data-ref="chart-area" style="display:none">
            <div class="bar-module__chart-wrap" data-ref="chart-wrap"></div>
            <div class="bar-module__stats-panel" data-ref="stats-panel"></div>
          </div>
        </div>
      </div>
    `;

    this._createPicker();
    this._renderOptions();
  },

  _createPicker() {
    const pickerWrap = this._container.querySelector('[data-ref="picker-wrap"]');
    if (!pickerWrap) return;

    if (this._picker) { this._picker.destroy(); this._picker = null; }

    const i18n = this._context.i18n;
    this._picker = new DatasetPicker(pickerWrap, this._context, {
      slots: [
        { key: 'x', label: 'X', title: i18n.t('modules.bar.slotX'), minCount: 1, required: true },
        { key: 'y', label: 'Y', title: i18n.t('modules.bar.slotY'), types: ['numeric', 'currency', 'percent'], minCount: 1 },
        { key: 'g', label: 'G', title: i18n.t('modules.bar.slotG'), group: true },
      ],
      onChange: (datasets) => {
        const ds = datasets[0] || {};
        this._xRef = ds.x || null;
        this._yRef = ds.y || null;
        this._gRef = ds.g || null;
        this._renderOptions();
        this._plot();
      },
    });

    if (this._xRef || this._yRef || this._gRef) {
      this._picker.value = [{ x: this._xRef, y: this._yRef, g: this._gRef }];
    }
  },

  _renderOptions() {
    const wrap = this._container.querySelector('[data-ref="options-wrap"]');
    if (!wrap) return;
    const t = (k, v) => this._context.i18n.t(`modules.bar.${k}`, v);

    const hasY = !!this._yRef;
    const hasG = !!this._gRef;
    const cfg = this._chartConfig;

    // Only data-shape switches live in the left input panel — styling
    // (title, legend, axis labels, colors, ...) is handled by the chart's
    // built-in editor on the right side of the chart card.
    let html = '';

    if (hasY) {
      html += `
        <label class="bar-module__opt-row">
          <span>${esc(t('aggregation'))}</span>
          <select data-action="set-agg">
            <option value="mean" ${cfg.aggregation === 'mean' ? 'selected' : ''}>${esc(t('aggMean'))}</option>
            <option value="sum"  ${cfg.aggregation === 'sum'  ? 'selected' : ''}>${esc(t('aggSum'))}</option>
          </select>
        </label>`;
    }

    if (hasG) {
      html += `
        <label class="bar-module__opt-row">
          <input type="checkbox" data-action="set-stacked" ${cfg.stacked ? 'checked' : ''}>
          <span>${esc(t('stacked'))}</span>
        </label>`;
    }

    wrap.innerHTML = html;
    wrap.style.display = html ? '' : 'none';

    wrap.querySelector('[data-action="set-agg"]')?.addEventListener('change', (e) => {
      this._chartConfig.aggregation = e.target.value === 'sum' ? 'sum' : 'mean';
      this._plot();
    });
    wrap.querySelector('[data-action="set-stacked"]')?.addEventListener('change', (e) => {
      this._chartConfig.stacked = !!e.target.checked;
      this._plot();
    });
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
    const xLabel = cfg.xLabel || this._xColumnName() || '';
    let yLabel = cfg.yLabel;
    if (!yLabel) {
      const t = (k) => this._context.i18n.t(`modules.bar.${k}`);
      if (this._yRef) {
        yLabel = (cfg.aggregation === 'sum' ? t('axisSumOf') : t('axisMeanOf')) + ' ' + (this._yColumnName() || '');
      } else {
        yLabel = t('axisCount');
      }
    }

    const showLegend = cfg.showLegend && !!this._gRef;
    const legendTitle = this._gRef ? this._gColumnName() : '';

    const barConfig = {
      title: cfg.title || '',
      showTitle: cfg.showTitle && !!cfg.title,
      titleSize: cfg.titleSize,
      xLabel,
      yLabel,
      categories,
      groups,
      stacked: cfg.stacked,
      barGap: cfg.barGap,
      categoryGap: cfg.categoryGap,
      showLegend,
      legendTitle,
      bgColor: cfg.bgColor,
    };

    const chartWrap = this._container.querySelector('[data-ref="chart-wrap"]');
    if (this._chart) {
      this._context.chartManager.update(this._chart, barConfig);
    } else {
      chartWrap.innerHTML = '';
      this._chart = await this._context.chartManager.create(chartWrap, 'bar', barConfig);
    }

    this._renderStats();
    this._saveState();
  },

  _saveState() {
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
  },

  // ─── Stats Table ────────────────────────────────────────────

  _renderStats() {
    const panel = this._container?.querySelector('[data-ref="stats-panel"]');
    if (!panel) return;
    const t = (k, v) => this._context.i18n.t(`modules.bar.${k}`, v);

    const isFreq = !this._yRef;
    const valueHeader = isFreq
      ? t('statCount')
      : (this._chartConfig.aggregation === 'sum' ? t('statSum') : t('statMean'));

    const showGroupCol = !!this._gRef;
    const groupHeaderHTML = showGroupCol ? `<th>${esc(t('statGroup'))}</th>` : '';

    let rows = '';
    let total = 0;
    for (const g of this._groups) {
      for (let ci = 0; ci < this._categories.length; ci++) {
        const v = g.values[ci] || 0;
        if (isFreq) total += v;
        rows += `<tr>
          <td><span class="bar-module__stats-color" style="background:${g.color}"></span> ${esc(this._categories[ci])}</td>
          ${showGroupCol ? `<td>${esc(g.name)}</td>` : ''}
          <td>${formatNum(v)}</td>
        </tr>`;
      }
    }
    if (isFreq) {
      rows += `<tr style="font-weight:600;border-top:2px solid var(--color-border-primary)">
        <td>${esc(t('statTotal'))}</td>
        ${showGroupCol ? '<td></td>' : ''}
        <td>${formatNum(total)}</td>
      </tr>`;
    }

    panel.innerHTML = `
      <div class="dmike-split__output-section">${esc(t('statsTitle'))}</div>
      <table class="dmike-table bar-module__stats-table">
        <thead><tr>
          <th>${esc(t('statCategory'))}</th>
          ${groupHeaderHTML}
          <th>${esc(valueHeader)}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  },
};
