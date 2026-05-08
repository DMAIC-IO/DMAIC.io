/**
 * D.Mike — Pie Chart Module (pie-chart.js)
 * Data phase: pie/donut chart from worksheet columns.
 * Uses the global pie chart type via chartManager.
 */

import { formatNum } from '../../core/chart/chart-core.js';
import { esc } from '../../core/chart/chart-editor.js';
import {
  DatasetPicker,
  getColumnValues,
} from '../../ui/dataset-picker.js';

const PALETTE = [
  'rgba(44,95,138,1)', 'rgba(39,174,96,1)', 'rgba(231,76,60,1)',
  'rgba(243,156,18,1)', 'rgba(142,68,173,1)', 'rgba(52,152,219,1)',
  'rgba(230,126,34,1)', 'rgba(26,188,156,1)', 'rgba(241,196,15,1)',
  'rgba(192,57,43,1)', 'rgba(44,62,80,1)', 'rgba(127,140,141,1)',
];

export default {
  id: 'pie-chart',
  phase: 'data',
  icon: 'pie-chart',
  i18nKey: 'modules.pie-chart',
  version: '1.1.0',

  _container: null,
  _context: null,
  _labelRef: null,
  _valueRef: null,
  _eventUnsubs: [],
  /** @type {DatasetPicker|null} */
  _picker: null,
  /** @type {import('../../core/chart/chart-base.js').default|null} */
  _chart: null,

  _slices: [],

  _chartConfig: {
    showTitle: true,
    title: '',
    titleSize: 15,
    showLegend: true,
    showLabels: true,
    labelMode: 'both',
    labelSize: 11,
    innerRadius: 0,
    padAngle: 0.8,
    startAngle: -90,
    explodeDistance: 12,
    strokeColor: 'rgba(255,255,255,1)',
    strokeWidth: 2,
    sortSlices: 'none',
    centerLabel: '',
    centerSub: '',
    bgColor: null,
  },

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    if (!document.getElementById('pie-chart-css')) {
      const link = document.createElement('link');
      link.id = 'pie-chart-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/pie-chart/pie-chart.css';
      document.head.appendChild(link);
    }

    this._picker = null;
    this._chart = null;

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) this._loadState(saved);

    this._render();
    if (this._slices.length > 0) {
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
  },

  onThemeChange() {
    if (this._chart) this._chart.render();
  },

  getState() {
    return {
      labelRef: this._labelRef,
      valueRef: this._valueRef,
      slices: this._slices,
      chartConfig: { ...this._chartConfig },
    };
  },

  setState(data) {
    if (data) this._loadState(data);
    if (this._container) {
      if (this._picker) { this._picker.destroy(); this._picker = null; }
      this._chart = null;
      this._render();
    }
  },

  help: () => import('./pie-chart-help.js'),

  _loadState(data) {
    if (data.labelRef) this._labelRef = data.labelRef;
    if (data.valueRef) this._valueRef = data.valueRef;
    if (data.slices) this._slices = data.slices;
    if (data.chartConfig) Object.assign(this._chartConfig, data.chartConfig);
  },

  // ─── Build Slices From Worksheet ──────────────────────────

  _buildSlicesFromWorksheet() {
    if (!this._valueRef) return [];
    const sm = this._context.stateManager;
    const values = getColumnValues(sm, this._valueRef);
    if (!values || values.length === 0) return [];

    if (this._labelRef) {
      const labels = getColumnValues(sm, this._labelRef);
      const sums = new Map();
      for (let i = 0; i < values.length; i++) {
        const v = parseFloat(values[i]);
        if (isNaN(v) || v < 0) continue;
        const name = labels && labels[i] != null ? String(labels[i]) : `${i + 1}`;
        sums.set(name, (sums.get(name) || 0) + v);
      }
      const slices = [];
      for (const [name, total] of sums) {
        slices.push({ name, value: total, color: PALETTE[slices.length % PALETTE.length] });
      }
      return slices;
    }

    const counts = new Map();
    for (const raw of values) {
      if (raw == null || raw === '') continue;
      const key = String(raw);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const slices = [];
    for (const [name, count] of counts) {
      slices.push({ name, value: count, color: PALETTE[slices.length % PALETTE.length] });
    }
    return slices;
  },

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    const t = (k, v) => this._context.i18n.t(`modules.pie-chart.${k}`, v);

    this._container.innerHTML = `
      <div class="pie-chart dmike-split">
        <div class="pie-chart__input dmike-split__input">
          <div class="dmike-split__section-title">${t('sectionData')}</div>
          <div data-ref="picker-wrap"></div>

          <div class="pie-chart__error" data-ref="error-box"></div>
        </div>

        <div class="pie-chart__output dmike-split__output">
          <div data-ref="placeholder"></div>
          <div class="pie-chart__chart-area" data-ref="chart-area" style="display:none">
            <div class="pie-chart__chart-wrap" data-ref="chart-wrap"></div>
            <div class="pie-chart__stats-panel" data-ref="stats-panel"></div>
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

    this._picker = new DatasetPicker(pickerWrap, this._context, {
      slots: [
        { key: 'value', label: 'V', title: this._context.i18n.t('ui.datasetPicker.slotV'), minCount: 1, required: true },
        { key: 'label', label: 'G', title: this._context.i18n.t('ui.datasetPicker.slotG'), minCount: 1, group: true },
      ],
      onChange: (datasets) => {
        const ds = datasets[0] || {};
        this._valueRef = ds.value || null;
        this._labelRef = ds.label || null;
        this._plot();
      },
    });

    if (this._labelRef || this._valueRef) {
      this._picker.value = [{ label: this._labelRef, value: this._valueRef }];
    }
  },

  async _plot() {
    this._slices = this._buildSlicesFromWorksheet();

    const chartArea = this._container?.querySelector('[data-ref="chart-area"]');
    const placeholder = this._container?.querySelector('[data-ref="placeholder"]');

    if (this._slices.length === 0) {
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
    const pieConfig = {
      slices: this._slices,
      title: cfg.title,
      showTitle: cfg.showTitle,
      titleSize: cfg.titleSize,
      showLegend: cfg.showLegend,
      showLabels: cfg.showLabels,
      labelMode: cfg.labelMode,
      labelSize: cfg.labelSize,
      innerRadius: cfg.innerRadius,
      padAngle: cfg.padAngle,
      startAngle: cfg.startAngle,
      explodeDistance: cfg.explodeDistance,
      strokeColor: cfg.strokeColor,
      strokeWidth: cfg.strokeWidth,
      sortSlices: cfg.sortSlices,
      centerLabel: cfg.centerLabel,
      centerSub: cfg.centerSub,
      bgColor: cfg.bgColor,
    };

    const chartWrap = this._container.querySelector('[data-ref="chart-wrap"]');
    if (this._chart) {
      this._context.chartManager.update(this._chart, pieConfig);
    } else {
      chartWrap.innerHTML = '';
      this._chart = await this._context.chartManager.create(chartWrap, 'pie', pieConfig);
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

    const t = (k, v) => this._context.i18n.t(`modules.pie-chart.${k}`, v);
    let total = 0;
    for (const s of this._slices) total += Math.max(0, s.value);

    let rows = '';
    for (const s of this._slices) {
      const pct = total > 0 ? ((s.value / total) * 100).toFixed(1) : '0.0';
      rows += `<tr>
        <td><span class="pie-chart__stats-color" style="background:${s.color}"></span> ${esc(s.name)}</td>
        <td>${formatNum(s.value)}</td>
        <td>${pct}%</td>
      </tr>`;
    }
    rows += `<tr style="font-weight:600;border-top:2px solid var(--color-border-primary)">
      <td>${t('statTotal')}</td>
      <td>${formatNum(total)}</td>
      <td>100.0%</td>
    </tr>`;

    panel.innerHTML = `
      <div class="dmike-split__output-section">${t('statsTitle')}</div>
      <table class="dmike-table pie-chart__stats-table">
        <thead><tr>
          <th>${t('statName')}</th>
          <th>${t('statValue')}</th>
          <th>${t('statPercent')}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  },
};
