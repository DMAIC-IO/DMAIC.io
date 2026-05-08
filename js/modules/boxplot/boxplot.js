/**
 * D.Mike — Boxplot Module (boxplot.js)
 * Data phase: horizontal boxplots of worksheet columns.
 *
 * Each dataset row selects a numeric value column and an optional grouping column.
 * Without grouping → one boxplot per column.
 * With grouping → one boxplot per unique group value.
 *
 * Uses the SVG chart framework (chartManager) for rendering.
 */

import { esc } from '../../core/html-utils.js';

import {
  DatasetPicker,
  getColumnValues, getColumnName,
} from '../../ui/dataset-picker.js';

import { computeSeriesStats, renderStatsTable } from '../../core/stats-panel.js';
import { CHART_COLORS } from '../../core/chart/chart-colors.js';

export default {
  id: 'boxplot',
  phase: 'data',
  icon: 'bar-chart-2',
  i18nKey: 'modules.boxplot',
  version: '1.0.0',

  _container: null,
  _context: null,
  /** Array of column refs (one per dataset row) */
  _seriesRefs: [],
  /** Parallel array: optional grouping column per dataset */
  _groupRefs: [],
  _showMean: true,
  _showOutliers: true,
  _showStats: true,
  _confLevel: 95,
  _chart: null,
  _plotting: false,
  _refLines: [],
  _refAreas: [],
  _bgColor: null,
  _boxColors: [],
  _eventUnsubs: [],
  /** @type {DatasetPicker|null} */
  _picker: null,

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    if (!document.getElementById('boxplot-css')) {
      const link = document.createElement('link');
      link.id = 'boxplot-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/boxplot/boxplot.css';
      document.head.appendChild(link);
    }

    const saved = context.stateManager.getModuleState(context.instanceId);
    if (saved) this._loadState(saved);

    this._render();
    this._bindContainerEvents();
    this._autoPlot();
  },

  async destroy() {
    for (const unsub of this._eventUnsubs) unsub();
    this._eventUnsubs = [];
    if (this._picker) { this._picker.destroy(); this._picker = null; }
    this._destroyChart();
    this._container.innerHTML = '';
  },

  onLanguageChange() {
    this._destroyChart();
    if (this._picker) { this._picker.destroy(); this._picker = null; }
    this._render();
    this._autoPlot();
  },

  onThemeChange() {},

  getState() {
    return {
      seriesRefs: this._seriesRefs,
      groupRefs: this._groupRefs,
      showMean: this._showMean,
      showOutliers: this._showOutliers,
      showStats: this._showStats,
      confLevel: this._confLevel,
      refLines: this._refLines,
      refAreas: this._refAreas,
      bgColor: this._bgColor,
      boxColors: this._boxColors,
    };
  },

  setState(data) {
    if (data) this._loadState(data);
    if (this._container) {
      if (this._picker) { this._picker.destroy(); this._picker = null; }
      this._render();
      this._autoPlot();
    }
  },

  help: () => import('./boxplot-help.js'),

  /** @private */
  _loadState(saved) {
    this._seriesRefs = saved.seriesRefs || [];
    this._groupRefs = saved.groupRefs || [];
    // Backward compat: old format had single valueRef/groupRef in grouped mode
    if (saved.mode === 'grouped' && saved.valueRef) {
      this._seriesRefs = [saved.valueRef];
      this._groupRefs = [saved.groupRef || null];
    }
    this._showMean = saved.showMean ?? true;
    this._showOutliers = saved.showOutliers ?? true;
    this._showStats = saved.showStats ?? true;
    this._confLevel = saved.confLevel ?? 95;
    this._refLines = saved.refLines || [];
    this._refAreas = saved.refAreas || [];
    this._bgColor = saved.bgColor || null;
    this._boxColors = saved.boxColors || [];
  },

  // ─── Column helpers ────────────────────────────────────────

  _getColumnValues(ref) {
    return getColumnValues(this._context?.stateManager, ref);
  },

  _getColumnName(ref) {
    return getColumnName(this._context?.stateManager, ref);
  },

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    const t = (k, v) => this._context.i18n.t(`modules.boxplot.${k}`, v);

    this._container.innerHTML = `
      <div class="boxplot dmike-split">
        <div class="boxplot__input dmike-split__input">
          <div class="dmike-split__section-title">${t('sectionData')}</div>

          <div data-ref="picker-wrap"></div>

          <div class="boxplot__error" data-ref="error-box"></div>
        </div>

        <div class="boxplot__output dmike-split__output">
          <div class="boxplot__placeholder" data-ref="placeholder"></div>
          <div class="boxplot__chart-card" data-ref="chart-card" style="display:none">
            <div class="boxplot__chart-main">
              <div class="boxplot__plot-wrap" data-ref="plot"></div>
            </div>
          </div>
          <div class="dmike-stats-panel" data-ref="stats-panel"></div>
        </div>
      </div>
    `;

    this._createPicker();
    this._bindEvents();
  },

  _createPicker() {
    const pickerWrap = this._container.querySelector('[data-ref="picker-wrap"]');
    if (!pickerWrap) return;

    if (this._picker) { this._picker.destroy(); this._picker = null; }

    this._picker = new DatasetPicker(pickerWrap, this._context, {
      multi: true,
      colors: CHART_COLORS,
      slots: [
        { key: 'value', label: 'V', title: this._context.i18n.t('ui.datasetPicker.slotV'), types: ['numeric'], minCount: 1, required: true },
        { key: 'group', label: 'G', title: this._context.i18n.t('ui.datasetPicker.slotG'), group: true },
      ],
      onChange: (datasets) => {
        // Only keep datasets that have a value column selected
        const valid = datasets.filter(ds => ds.value != null);
        this._seriesRefs = valid.map(ds => ds.value);
        this._groupRefs = valid.map(ds => ds.group || null);
        this._save();
        this._autoPlot();
      },
    });

    // Restore saved refs
    if (this._seriesRefs.length > 0) {
      this._picker.value = this._seriesRefs.map((ref, i) => ({
        value: ref,
        group: this._groupRefs?.[i] || null,
      }));
    }
  },

  // ─── Events ─────────────────────────────────────────────────

  _bindContainerEvents() {
    this._container.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      if (action === 'reset') this._reset();
    });
  },

  _bindEvents() {
  },

  _showError(msg) {
    const errBox = this._container?.querySelector('[data-ref="error-box"]');
    if (errBox) {
      errBox.textContent = msg;
      errBox.style.display = 'block';
      setTimeout(() => { errBox.style.display = 'none'; }, 4000);
    }
  },

  _save() {
    this._syncFromChart();
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
  },

  _reset() {
    this._seriesRefs = [];
    this._groupRefs = [];
    this._boxColors = [];
    this._refLines = [];
    this._refAreas = [];
    this._bgColor = null;
    this._lastGroups = null;
    this._destroyChart();
    this._save();
    if (this._picker) { this._picker.destroy(); this._picker = null; }
    this._render();
    this._bindContainerEvents();
  },

  _destroyChart() {
    if (this._chart) {
      this._context.chartManager.destroy(this._chart);
      this._chart = null;
    }
  },

  // ─── Auto-Plot ──────────────────────────────────────────────

  /** Sync showMean/showOutliers from live chart config back to module state */
  _syncFromChart() {
    if (this._chart && this._chart.config) {
      this._showMean = this._chart.config.showMean ?? this._showMean;
      this._showOutliers = this._chart.config.showOutliers ?? this._showOutliers;
    }
  },

  /** Auto-plot if enough data is selected; hide chart otherwise */
  _autoPlot() {
    const hasData = this._seriesRefs.length > 0;

    if (!hasData) {
      this._destroyChart();
      const placeholder = this._container?.querySelector('[data-ref="placeholder"]');
      const chartCard = this._container?.querySelector('[data-ref="chart-card"]');
      if (placeholder) placeholder.style.display = '';
      if (chartCard) chartCard.style.display = 'none';
      return;
    }

    this._syncFromChart();
    this._plot();
  },

  // ─── Plot ───────────────────────────────────────────────────

  async _plot() {
    if (this._plotting) return;
    this._plotting = true;

    const t = (k, v) => this._context.i18n.t(`modules.boxplot.${k}`, v);
    const errBox = this._container?.querySelector('[data-ref="error-box"]');
    if (errBox) errBox.style.display = 'none';

    let groups;

    try {
      groups = this._buildGroups(t);
    } catch (err) {
      this._showError(err.message);
      this._plotting = false;
      return;
    }

    if (!groups || groups.length === 0) {
      this._showError(t('errNoData'));
      this._plotting = false;
      return;
    }

    const placeholder = this._container.querySelector('[data-ref="placeholder"]');
    const chartCard = this._container.querySelector('[data-ref="chart-card"]');
    const plotEl = this._container.querySelector('[data-ref="plot"]');
    if (placeholder) placeholder.style.display = 'none';
    if (chartCard) chartCard.style.display = '';

    this._destroyChart();
    if (plotEl) plotEl.innerHTML = '';

    try {
      this._chart = await this._context.chartManager.create(plotEl, 'boxplot', {
        title: t('chartTitle'),
        xLabel: t('xLabel'),
        yLabel: '',
        showLegend: groups.length > 1,
        showYTicks: false,
        showMean: this._showMean,
        showOutliers: this._showOutliers,
        groups,
        boxColors: this._boxColors,
        refLines: this._refLines,
        refAreas: this._refAreas,
        bgColor: this._bgColor,
      });
    } catch (err) {
      this._showError(err.message || t('errGeneric'));
    }

    this._lastGroups = groups;
    this._renderStats();
    this._plotting = false;
  },

  _renderStats() {
    const panel = this._container?.querySelector('[data-ref="stats-panel"]');
    if (!panel) return;

    if (!this._showStats || !this._lastGroups) {
      panel.style.display = 'none';
      panel.innerHTML = '';
      return;
    }

    const series = this._lastGroups.map((g, i) => ({
      name: g.name,
      values: g.values,
      color: (this._boxColors[i] || CHART_COLORS[i % CHART_COLORS.length]),
      visible: true,
    }));
    const seriesStats = computeSeriesStats(series, this._confLevel / 100);
    renderStatsTable(panel, seriesStats, {
      i18n: this._context.i18n,
      confLevel: this._confLevel,
    });
  },

  /**
   * Build groups from all datasets.
   * Each dataset has a value column and optionally a grouping column.
   * Without grouping: one boxplot per dataset.
   * With grouping: one boxplot per unique group value within that dataset.
   */
  _buildGroups(t) {
    if (this._seriesRefs.length === 0) {
      throw new Error(t('errNoSeries'));
    }

    const groups = [];
    for (let i = 0; i < this._seriesRefs.length; i++) {
      const ref = this._seriesRefs[i];
      const groupRef = this._groupRefs[i] || null;
      const rawVals = this._getColumnValues(ref);
      const colName = this._getColumnName(ref);

      if (!groupRef) {
        // No grouping: one boxplot from this column
        const values = rawVals.filter(v => v != null && typeof v === 'number' && !isNaN(v));
        if (values.length < 2) {
          throw new Error(t('errTooFew', { col: colName }));
        }
        groups.push({ name: colName, values });
      } else {
        // Grouped: split by group column values
        const rawGroups = this._getColumnValues(groupRef);
        const len = Math.min(rawVals.length, rawGroups.length);
        const buckets = new Map();
        for (let j = 0; j < len; j++) {
          const v = rawVals[j];
          const g = rawGroups[j];
          if (v == null || typeof v !== 'number' || isNaN(v)) continue;
          if (g == null) continue;
          const key = String(g);
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key).push(v);
        }
        for (const [key, values] of buckets) {
          if (values.length < 2) continue;
          groups.push({ name: `${colName} — ${key}`, values });
        }
      }
    }

    if (groups.length === 0) throw new Error(t('errNoData'));
    return groups;
  },
};
