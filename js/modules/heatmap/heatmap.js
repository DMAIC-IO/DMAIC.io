/**
 * D.Mike — Heatmap Chart Module (heatmap.js)
 * Data phase: heatmap / pivot grid for two categorical variables.
 *
 * Two input modes:
 *   - X + G       → frequency cross-tab (count per cell)
 *   - X + G + V   → aggregated value (mean / sum) of V per (X, G) cell
 *
 * X-slot drives the column axis, G-slot drives the row axis, V-slot is the
 * numeric value column whose aggregate fills the cells.
 */

import { formatNum } from '../../core/chart/chart-core.js';
import { esc } from '../../core/chart/chart-editor.js';
import {
  DatasetPicker,
  getColumnValues,
  getColumnName,
} from '../../ui/dataset-picker.js';
import { provisionWorksheet, removeProvisionedWorksheet } from '../../core/examples-registry.js';

export default {
  id: 'heatmap',
  phase: 'data',
  icon: 'bar-chart',
  i18nKey: 'modules.heatmap',
  version: '1.0.0',

  _container: null,
  _context: null,
  _picker: null,
  _chart: null,
  _eventUnsubs: [],
  _exampleWorksheetId: null,

  _xRef: null,
  _gRef: null,
  _vRef: null,

  _xCategories: [],
  _yCategories: [],
  _cells: [],

  _chartConfig: {
    title: '',
    showTitle: true,
    aggregation: 'mean',   // 'mean' | 'sum' (only used when vRef present)
    showCellLabels: true,
    cellGap: 1,
    valueDecimals: 1,
    colorScheme: 'viridis',
    bgColor: null,
  },

  async init(container, context) {
    this._container = container;
    this._context = context;

    if (!document.getElementById('heatmap-module-css')) {
      const link = document.createElement('link');
      link.id = 'heatmap-module-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/heatmap/heatmap.css';
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
      vRef: this._vRef,
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
        if (data.vRef) data.vRef = rewrite(data.vRef);
      }
    }

    this.setState(data);
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());

    const lang = this._context.i18n.getLanguage();
    const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
    this._context.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
  },

  help: () => import('./heatmap-help.js'),

  _loadState(data) {
    if (data.xRef !== undefined) this._xRef = data.xRef;
    if (data.gRef !== undefined) this._gRef = data.gRef;
    if (data.vRef !== undefined) this._vRef = data.vRef;
    if (data.chartConfig) Object.assign(this._chartConfig, data.chartConfig);
  },

  _buildChartData() {
    if (!this._xRef || !this._gRef) return { xCategories: [], yCategories: [], cells: [] };
    const sm = this._context.stateManager;
    const xVals = getColumnValues(sm, this._xRef);
    const gVals = getColumnValues(sm, this._gRef);
    if (!xVals || !gVals) return { xCategories: [], yCategories: [], cells: [] };

    const vVals = this._vRef ? getColumnValues(sm, this._vRef) : null;
    const cleanCat = (v) => v == null || v === '' ? '' : String(v);
    const toNum = (v) => {
      if (v == null || v === '') return NaN;
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : NaN;
    };

    const n = Math.min(xVals.length, gVals.length, vVals ? vVals.length : Infinity);

    const xLevels = [];
    const xSeen = new Set();
    const yLevels = [];
    const ySeen = new Set();
    for (let i = 0; i < n; i++) {
      const xc = cleanCat(xVals[i]);
      const gc = cleanCat(gVals[i]);
      if (xc === '' || gc === '') continue;
      if (!xSeen.has(xc)) { xSeen.add(xc); xLevels.push(xc); }
      if (!ySeen.has(gc)) { ySeen.add(gc); yLevels.push(gc); }
    }
    if (xLevels.length === 0 || yLevels.length === 0) return { xCategories: [], yCategories: [], cells: [] };

    // accum[yi][xi] = { sum, count } when vVals; otherwise count only.
    const accum = yLevels.map(() => xLevels.map(() => ({ sum: 0, count: 0 })));
    const xIdx = new Map(xLevels.map((v, i) => [v, i]));
    const yIdx = new Map(yLevels.map((v, i) => [v, i]));

    for (let i = 0; i < n; i++) {
      const xi = xIdx.get(cleanCat(xVals[i]));
      const yi = yIdx.get(cleanCat(gVals[i]));
      if (xi === undefined || yi === undefined) continue;
      if (vVals) {
        const v = toNum(vVals[i]);
        if (!Number.isFinite(v)) continue;
        accum[yi][xi].sum += v;
        accum[yi][xi].count += 1;
      } else {
        accum[yi][xi].count += 1;
      }
    }

    const useMean = !!vVals && this._chartConfig.aggregation === 'mean';
    const useSum  = !!vVals && this._chartConfig.aggregation === 'sum';
    const cells = accum.map(row => row.map(cell => {
      if (useMean) return cell.count > 0 ? cell.sum / cell.count : NaN;
      if (useSum)  return cell.count > 0 ? cell.sum : NaN;
      return cell.count;
    }));

    return { xCategories: xLevels, yCategories: yLevels, cells };
  },

  _xColumnName() {
    return this._xRef ? getColumnName(this._context.stateManager, this._xRef) : '';
  },

  _gColumnName() {
    return this._gRef ? getColumnName(this._context.stateManager, this._gRef) : '';
  },

  _vColumnName() {
    return this._vRef ? getColumnName(this._context.stateManager, this._vRef) : '';
  },

  _render() {
    const t = (k, v) => this._context.i18n.t(`modules.heatmap.${k}`, v);

    this._container.innerHTML = `
      <div class="heatmap-module dmike-split">
        <div class="heatmap-module__input dmike-split__input">
          <div class="dmike-split__section-title">${t('sectionData')}</div>
          <div data-ref="picker-wrap"></div>

          <div class="heatmap-module__options" data-ref="options-wrap"></div>

          <div class="heatmap-module__error" data-ref="error-box"></div>
        </div>

        <div class="heatmap-module__output dmike-split__output">
          <div data-ref="placeholder" class="heatmap-module__placeholder">${esc(t('placeholderPickBoth'))}</div>
          <div class="heatmap-module__chart-area" data-ref="chart-area" style="display:none">
            <div class="heatmap-module__chart-wrap" data-ref="chart-wrap"></div>
            <div class="heatmap-module__stats-panel" data-ref="stats-panel"></div>
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
        { key: 'x', label: 'X', title: i18n.t('modules.heatmap.slotX'), minCount: 1, required: true },
        { key: 'g', label: 'G', title: i18n.t('modules.heatmap.slotG'), minCount: 1, required: true },
        { key: 'v', label: 'V', title: i18n.t('modules.heatmap.slotV'), types: ['numeric', 'currency', 'percent'], minCount: 1 },
      ],
      onChange: (datasets) => {
        const ds = datasets[0] || {};
        this._xRef = ds.x || null;
        this._gRef = ds.g || null;
        this._vRef = ds.v || null;
        this._renderOptions();
        this._plot();
      },
    });

    if (this._xRef || this._gRef || this._vRef) {
      this._picker.value = [{ x: this._xRef, g: this._gRef, v: this._vRef }];
    }
  },

  _renderOptions() {
    const wrap = this._container.querySelector('[data-ref="options-wrap"]');
    if (!wrap) return;
    const t = (k, v) => this._context.i18n.t(`modules.heatmap.${k}`, v);

    const hasV = !!this._vRef;
    const cfg = this._chartConfig;

    // Only data-shape switches in the input panel — styling (decimals, cell
    // gap, cell labels) lives in the chart editor on the right.
    let html = '';
    if (hasV) {
      html += `
        <label class="heatmap-module__opt-row">
          <span>${esc(t('aggregation'))}</span>
          <select data-action="set-agg">
            <option value="mean" ${cfg.aggregation === 'mean' ? 'selected' : ''}>${esc(t('aggMean'))}</option>
            <option value="sum"  ${cfg.aggregation === 'sum'  ? 'selected' : ''}>${esc(t('aggSum'))}</option>
          </select>
        </label>`;
    }
    wrap.innerHTML = html;
    wrap.style.display = html ? '' : 'none';

    wrap.querySelector('[data-action="set-agg"]')?.addEventListener('change', (e) => {
      this._chartConfig.aggregation = e.target.value === 'sum' ? 'sum' : 'mean';
      // sum gets integer-ish defaults; mean keeps decimals. Don't override
      // user preference here — only the rendering changes.
      this._plot();
    });
  },

  async _plot() {
    const { xCategories, yCategories, cells } = this._buildChartData();
    this._xCategories = xCategories;
    this._yCategories = yCategories;
    this._cells = cells;

    const chartArea = this._container?.querySelector('[data-ref="chart-area"]');
    const placeholder = this._container?.querySelector('[data-ref="placeholder"]');

    if (xCategories.length === 0 || yCategories.length === 0) {
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
    const t = (k) => this._context.i18n.t(`modules.heatmap.${k}`);

    // Count mode → integer cells; mean/sum → user-controlled decimals.
    const isFreq = !this._vRef;
    const valueDecimals = isFreq ? 0 : cfg.valueDecimals;
    const valueLabel = isFreq
      ? t('axisCount')
      : (cfg.aggregation === 'sum' ? `${t('axisSumOf')} ${this._vColumnName() || ''}`.trim()
                                    : `${t('axisMeanOf')} ${this._vColumnName() || ''}`.trim());

    const heatConfig = {
      title: cfg.title || '',
      showTitle: cfg.showTitle && !!cfg.title,
      xLabel: this._xColumnName() || '',
      yLabel: this._gColumnName() || '',
      xCategories,
      yCategories,
      cells,
      cellGap: cfg.cellGap,
      valueDecimals,
      valueLabel,
      showCellLabels: cfg.showCellLabels,
      colorScheme: cfg.colorScheme || 'viridis',
      bgColor: cfg.bgColor,
    };

    const chartWrap = this._container.querySelector('[data-ref="chart-wrap"]');
    if (this._chart) {
      this._context.chartManager.update(this._chart, heatConfig);
    } else {
      chartWrap.innerHTML = '';
      this._chart = await this._context.chartManager.create(chartWrap, 'heatmap', heatConfig);
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
    const t = (k, v) => this._context.i18n.t(`modules.heatmap.${k}`, v);
    const isFreq = !this._vRef;
    const cfg = this._chartConfig;
    const decimals = isFreq ? 0 : cfg.valueDecimals;
    // Totals only make sense for additive aggregations. Mean-of-means without
    // per-cell sample weights is misleading, so the Gesamt column is omitted
    // in mean mode.
    const showTotals = isFreq || cfg.aggregation === 'sum';
    const totalDecimals = isFreq ? 0 : cfg.valueDecimals;

    let headerHTML = `<tr><th>${esc(this._gColumnName() || t('statG'))} \\ ${esc(this._xColumnName() || t('statX'))}</th>`;
    for (const x of this._xCategories) headerHTML += `<th>${esc(x)}</th>`;
    if (showTotals) headerHTML += `<th>${esc(t('statTotal'))}</th>`;
    headerHTML += `</tr>`;

    let bodyHTML = '';
    const colTotals = this._xCategories.map(() => 0);
    let grandTotal = 0;
    for (let yi = 0; yi < this._yCategories.length; yi++) {
      let row = `<tr><td>${esc(this._yCategories[yi])}</td>`;
      let rowTotal = 0;
      for (let xi = 0; xi < this._xCategories.length; xi++) {
        const v = this._cells[yi][xi];
        if (Number.isFinite(v)) {
          row += `<td>${formatNum(v, decimals)}</td>`;
          if (showTotals) {
            rowTotal += v;
            colTotals[xi] += v;
          }
        } else {
          row += `<td>—</td>`;
        }
      }
      if (showTotals) {
        row += `<td>${formatNum(rowTotal, totalDecimals)}</td>`;
        grandTotal += rowTotal;
      }
      row += `</tr>`;
      bodyHTML += row;
    }

    let totalRow = '';
    if (showTotals) {
      totalRow = `<tr style="font-weight:600;border-top:2px solid var(--color-border-primary)"><td>${esc(t('statTotal'))}</td>`;
      for (const c of colTotals) totalRow += `<td>${formatNum(c, totalDecimals)}</td>`;
      totalRow += `<td>${formatNum(grandTotal, totalDecimals)}</td></tr>`;
    }

    panel.innerHTML = `
      <div class="dmike-split__output-section">${esc(t('statsTitle'))}</div>
      <table class="dmike-table heatmap-module__stats-table">
        <thead>${headerHTML}</thead>
        <tbody>${bodyHTML}${totalRow}</tbody>
      </table>`;
  },
};
