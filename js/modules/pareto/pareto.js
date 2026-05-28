/**
 * D.Mike — Pareto Chart Module (pareto.js)
 * Data phase: Pareto chart from worksheet columns.
 *
 * Four input modes (driven by the column slots the user fills):
 *   - X only            → frequency count per category               (items[])
 *   - X + Y             → sum (or mean) of Y per X-level             (items[])
 *   - X + G             → cross-tab count → stacked Pareto           (groups[])
 *   - X + Y + G         → sum/mean of Y per (X, G) → stacked Pareto  (groups[])
 *
 * Bars are sorted by descending total inside the chart type itself.
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
  id: 'pareto',
  phase: 'data',
  icon: 'bar-chart',
  i18nKey: 'modules.pareto',
  version: '1.0.0',

  _container: null,
  _context: null,
  _picker: null,
  _chart: null,
  _eventUnsubs: [],
  _exampleWorksheetId: null,

  _xRef: null,
  _yRef: null,
  _gRef: null,

  _items: [],
  _categories: [],
  _groups: [],

  _chartConfig: {
    title: '',
    showTitle: true,
    aggregation: 'sum',   // 'sum' | 'mean' (only used when yRef present)
    maxItems: 20,
    otherBucket: true,
    refLineValue: 80,
    barOpacity: 0.75,
    bgColor: null,
  },

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    if (!document.getElementById('pareto-module-css')) {
      const link = document.createElement('link');
      link.id = 'pareto-module-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/pareto/pareto.css';
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

  help: () => import('./pareto-help.js'),

  _loadState(data) {
    if (data.xRef !== undefined) this._xRef = data.xRef;
    if (data.yRef !== undefined) this._yRef = data.yRef;
    if (data.gRef !== undefined) this._gRef = data.gRef;
    if (data.chartConfig) Object.assign(this._chartConfig, data.chartConfig);
  },

  // ─── Build Chart Data ───────────────────────────────────────

  _buildChartData() {
    if (!this._xRef) return { items: [], categories: [], groups: [] };
    const sm = this._context.stateManager;
    const xVals = getColumnValues(sm, this._xRef);
    if (!xVals || xVals.length === 0) return { items: [], categories: [], groups: [] };

    const yVals = this._yRef ? getColumnValues(sm, this._yRef) : null;
    const gVals = this._gRef ? getColumnValues(sm, this._gRef) : null;

    const cleanCat = (v) => v == null || v === '' ? '' : String(v);
    const toNum = (v) => {
      if (v == null || v === '') return NaN;
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : NaN;
    };

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
    if (xLevels.length === 0) return { items: [], categories: [], groups: [] };

    const groupNames = gVals ? gLevels : ['__single__'];
    const matrix = {};
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

    const useMean = !!yVals && this._chartConfig.aggregation === 'mean';
    const useSum  = !!yVals && this._chartConfig.aggregation === 'sum';
    const cellValue = (cell) => {
      if (useMean) return cell.count > 0 ? cell.sum / cell.count : 0;
      if (useSum)  return cell.sum;
      return cell.count;
    };

    // Stacked mode → categories + groups (Pareto chart sorts internally).
    if (gVals) {
      const groups = groupNames.map((gName, gi) => ({
        name: gName,
        values: xLevels.map((xLvl) => cellValue(matrix[xLvl][gName])),
        color: PALETTE[gi % PALETTE.length],
      }));
      return { items: [], categories: xLevels, groups };
    }

    // Single-series mode → items[].
    const items = xLevels.map((xLvl, i) => ({
      name: xLvl,
      value: cellValue(matrix[xLvl]['__single__']),
      color: PALETTE[i % PALETTE.length],
    }));
    return { items, categories: [], groups: [] };
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
    const t = (k, v) => this._context.i18n.t(`modules.pareto.${k}`, v);

    this._container.innerHTML = `
      <div class="pareto-module dmike-split">
        <div class="pareto-module__input dmike-split__input">
          <div class="dmike-split__section-title">${t('sectionData')}</div>
          <div data-ref="picker-wrap"></div>

          <div class="pareto-module__options" data-ref="options-wrap"></div>

          <div class="pareto-module__error" data-ref="error-box"></div>
        </div>

        <div class="pareto-module__output dmike-split__output">
          <div data-ref="placeholder" class="pareto-module__placeholder">${esc(t('placeholderPickX'))}</div>
          <div class="pareto-module__chart-area" data-ref="chart-area" style="display:none">
            <div class="pareto-module__chart-wrap" data-ref="chart-wrap"></div>
            <div class="pareto-module__stats-panel" data-ref="stats-panel"></div>
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
        { key: 'x', label: 'X', title: i18n.t('modules.pareto.slotX'), minCount: 1, required: true },
        { key: 'y', label: 'Y', title: i18n.t('modules.pareto.slotY'), types: ['numeric', 'currency', 'percent'], minCount: 1 },
        { key: 'g', label: 'G', title: i18n.t('modules.pareto.slotG'), group: true },
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
    const t = (k, v) => this._context.i18n.t(`modules.pareto.${k}`, v);

    const hasY = !!this._yRef;
    const cfg = this._chartConfig;

    // Only data-shape switches live in the input panel — threshold / max bars /
    // other-bucket are styling and live in the chart editor on the right.
    let html = '';

    if (hasY) {
      html += `
        <label class="pareto-module__opt-row">
          <span>${esc(t('aggregation'))}</span>
          <select data-action="set-agg">
            <option value="sum"  ${cfg.aggregation === 'sum'  ? 'selected' : ''}>${esc(t('aggSum'))}</option>
            <option value="mean" ${cfg.aggregation === 'mean' ? 'selected' : ''}>${esc(t('aggMean'))}</option>
          </select>
        </label>`;
    }

    wrap.innerHTML = html;
    wrap.style.display = html ? '' : 'none';

    wrap.querySelector('[data-action="set-agg"]')?.addEventListener('change', (e) => {
      this._chartConfig.aggregation = e.target.value === 'mean' ? 'mean' : 'sum';
      this._plot();
    });
  },

  async _plot() {
    const data = this._buildChartData();
    this._items = data.items;
    this._categories = data.categories;
    this._groups = data.groups;

    const chartArea = this._container?.querySelector('[data-ref="chart-area"]');
    const placeholder = this._container?.querySelector('[data-ref="placeholder"]');

    const hasData = (data.items.length > 0) || (data.categories.length > 0 && data.groups.length > 0);

    if (!hasData) {
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
    const t = (k) => this._context.i18n.t(`modules.pareto.${k}`);
    const xLabel = this._xColumnName() || '';
    let yLabel;
    if (this._yRef) {
      yLabel = (cfg.aggregation === 'mean' ? t('axisMeanOf') : t('axisSumOf')) + ' ' + (this._yColumnName() || '');
    } else {
      yLabel = t('axisCount');
    }

    const paretoConfig = {
      title: cfg.title || '',
      showTitle: cfg.showTitle && !!cfg.title,
      xLabel,
      yLabel,
      maxItems: cfg.maxItems,
      otherBucket: cfg.otherBucket,
      otherLabel: t('otherLabel'),
      otherCountTemplate: t('otherCountTemplate'),
      refLineValue: cfg.refLineValue,
      barOpacity: cfg.barOpacity,
      bgColor: cfg.bgColor,
      showLegend: !!this._gRef,
      legendTitle: this._gRef ? (this._gColumnName() || '') : '',
    };

    if (data.items.length > 0) {
      paretoConfig.items = data.items;
    } else {
      paretoConfig.categories = data.categories;
      paretoConfig.groups = data.groups;
    }

    const chartWrap = this._container.querySelector('[data-ref="chart-wrap"]');
    if (this._chart) {
      this._context.chartManager.update(this._chart, paretoConfig);
    } else {
      chartWrap.innerHTML = '';
      this._chart = await this._context.chartManager.create(chartWrap, 'pareto', paretoConfig);
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
    const t = (k, v) => this._context.i18n.t(`modules.pareto.${k}`, v);

    const isFreq = !this._yRef;
    const valueHeader = isFreq
      ? t('statCount')
      : (this._chartConfig.aggregation === 'mean' ? t('statMean') : t('statSum'));

    // Build a sorted (descending by total) list of {name, value, cumPct}.
    let rows = [];
    if (this._items.length > 0) {
      rows = this._items.map(it => ({ name: it.name, value: it.value, color: it.color }));
    } else {
      rows = this._categories.map((c, ci) => {
        const total = this._groups.reduce((s, g) => s + (g.values[ci] || 0), 0);
        return { name: c, value: total, color: PALETTE[ci % PALETTE.length] };
      });
    }
    rows.sort((a, b) => b.value - a.value);

    const grandTotal = rows.reduce((s, r) => s + Math.max(0, r.value), 0);
    let cum = 0;

    let html = '';
    for (const r of rows) {
      cum += Math.max(0, r.value);
      const pct = grandTotal > 0 ? (cum / grandTotal) * 100 : 0;
      html += `<tr>
        <td><span class="pareto-module__stats-color" style="background:${r.color}"></span> ${esc(r.name)}</td>
        <td>${formatNum(r.value)}</td>
        <td>${pct.toFixed(1)}%</td>
      </tr>`;
    }
    html += `<tr style="font-weight:600;border-top:2px solid var(--color-border-primary)">
      <td>${esc(t('statTotal'))}</td>
      <td>${formatNum(grandTotal)}</td>
      <td>100.0%</td>
    </tr>`;

    panel.innerHTML = `
      <div class="dmike-split__output-section">${esc(t('statsTitle'))}</div>
      <table class="dmike-table pareto-module__stats-table">
        <thead><tr>
          <th>${esc(t('statCategory'))}</th>
          <th>${esc(valueHeader)}</th>
          <th>${esc(t('statCumPct'))}</th>
        </tr></thead>
        <tbody>${html}</tbody>
      </table>`;
  },
};
