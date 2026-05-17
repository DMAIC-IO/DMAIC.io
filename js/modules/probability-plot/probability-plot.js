/**
 * D.Mike — Probability Plot Module (probability-plot.js)
 * Data phase: normal probability plot (Wahrscheinlichkeitsnetz)
 * for one or more numeric worksheet columns.
 *
 * Each dataset row selects a numeric value column and an optional
 * grouping column. Without grouping → one series per value column.
 * With grouping → one series per unique group level. All series are
 * rendered in the same plot, each with its own Q1/Q3 fit line.
 *
 * Uses the SVG chart framework (chartManager) for rendering.
 */

import {
  DatasetPicker,
  getColumnValues, getColumnName,
} from '../../ui/dataset-picker.js';

import { computeSeriesStats, renderStatsTable } from '../../core/stats-panel.js';
import { CHART_COLORS } from '../../core/chart/chart-colors.js';
import { provisionWorksheet, removeProvisionedWorksheet } from '../../core/examples-registry.js';

export default {
  id: 'probability-plot',
  phase: 'data',
  icon: 'trending-up',
  i18nKey: 'modules.probability-plot',
  version: '1.1.0',

  _container: null,
  _context: null,
  /** @type {{ valueRef: object|null, groupRef: object|null }[]} */
  _datasets: [],
  /** Per-rendered-series overrides (parallel to last produced seriesData). */
  _seriesOverrides: [],
  _chart: null,
  _plotting: false,
  _refLines: [],
  _refAreas: [],
  _bgColor: null,
  _showStats: true,
  _confLevel: 95,
  _eventUnsubs: [],
  /** @type {DatasetPicker|null} */
  _picker: null,
  /** Worksheet provisioned by loadExample (cleaned up on next load). */
  _exampleWorksheetId: null,
  _lastSeriesData: null,

  // ─── Lifecycle ──────────────────────────────────────────────

  async init(container, context) {
    this._container = container;
    this._context = context;

    // Reset per-instance state — the registry uses a shallow spread of the
    // module export, so arrays/objects from the definition are shared
    // across instances until reassigned.
    this._datasets = [{ valueRef: null, groupRef: null }];
    this._seriesOverrides = [];
    this._refLines = [];
    this._refAreas = [];
    this._eventUnsubs = [];
    this._picker = null;
    this._lastSeriesData = null;

    if (!document.getElementById('probability-plot-css')) {
      const link = document.createElement('link');
      link.id = 'probability-plot-css';
      link.rel = 'stylesheet';
      link.href = './js/modules/probability-plot/probability-plot.css';
      document.head.appendChild(link);
    }

    const onRefresh = () => this._refreshPicker();
    context.eventBus.on('state:saved', onRefresh);
    context.eventBus.on('worksheet:dataChanged', onRefresh);
    this._eventUnsubs.push(
      () => context.eventBus.off('state:saved', onRefresh),
      () => context.eventBus.off('worksheet:dataChanged', onRefresh),
    );
    const onAdd = ({ moduleId }) => { if (moduleId === 'worksheet') onRefresh(); };
    context.eventBus.on('module:added', onAdd);
    this._eventUnsubs.push(() => context.eventBus.off('module:added', onAdd));
    const onRem = ({ moduleId }) => { if (moduleId === 'worksheet') onRefresh(); };
    context.eventBus.on('module:removed', onRem);
    this._eventUnsubs.push(() => context.eventBus.off('module:removed', onRem));

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
    if (this._picker) { this._picker.destroy(); this._picker = null; }
    this._destroyChart();
    this._render();
    this._bindContainerEvents();
    this._autoPlot();
  },

  onThemeChange() {},

  getState() {
    this._syncFromChart();
    return {
      datasets: this._datasets.map(d => ({
        valueRef: d.valueRef || null,
        groupRef: d.groupRef || null,
      })),
      seriesOverrides: this._seriesOverrides || [],
      refLines: this._refLines,
      refAreas: this._refAreas,
      bgColor: this._bgColor,
      showStats: this._showStats,
      confLevel: this._confLevel,
      exampleWorksheetId: this._exampleWorksheetId,
    };
  },

  setState(data) {
    if (data) this._loadState(data);
    if (this._container) {
      if (this._picker) { this._picker.destroy(); this._picker = null; }
      this._render();
      this._bindContainerEvents();
      this._autoPlot();
    }
  },

  help: () => import('./probability-plot-help.js'),

  /** @private */
  _loadState(saved) {
    this._datasets = this._loadDatasets(saved);
    this._seriesOverrides = Array.isArray(saved.seriesOverrides) ? saved.seriesOverrides : [];
    this._refLines = saved.refLines || [];
    this._refAreas = saved.refAreas || [];
    this._bgColor = saved.bgColor || null;
    this._showStats = saved.showStats ?? true;
    this._confLevel = saved.confLevel ?? 95;
    if (saved.exampleWorksheetId !== undefined) this._exampleWorksheetId = saved.exampleWorksheetId;
  },

  /**
   * Load datasets[], with backward compatibility for the pre-1.1.0 single-
   * `columnRef` shape.
   * @private
   */
  _loadDatasets(saved) {
    if (Array.isArray(saved.datasets)) {
      return saved.datasets.map(d => ({
        valueRef: d.valueRef || null,
        groupRef: d.groupRef || null,
      }));
    }
    if (saved.columnRef) {
      return [{ valueRef: saved.columnRef, groupRef: null }];
    }
    return [{ valueRef: null, groupRef: null }];
  },

  /**
   * Load a catalog example. Provisions the included worksheet and rewrites
   * the `__source__` placeholder in dataset / columnRef entries.
   * @param {{ meta: object, data: object }} payload
   */
  async loadExample(payload) {
    if (!payload || !payload.data) return;
    const t = (k) => this._context.i18n.t(k);

    const hasContent = Array.isArray(this._datasets)
      && this._datasets.some(d => d.valueRef);
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
        data.exampleWorksheetId = ref.instanceId;
        const rewrite = (r) => (r && r.instanceId === '__source__') ? { ...r, instanceId: ref.instanceId } : r;
        if (Array.isArray(data.datasets)) {
          data.datasets = data.datasets.map(d => ({
            ...d,
            valueRef: rewrite(d.valueRef),
            groupRef: rewrite(d.groupRef),
          }));
        }
        if (data.columnRef) data.columnRef = rewrite(data.columnRef);
      }
    }

    // Foreign-state translation: legacy single columnRef → one dataset.
    if (!Array.isArray(data.datasets) && data.columnRef) {
      data.datasets = [{ valueRef: data.columnRef, groupRef: null }];
    }

    this.setState(data);
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());

    const lang = this._context.i18n.getLanguage();
    const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
    this._context.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
  },

  // ─── Column Helpers ─────────────────────────────────────────

  _getColumnValues(ref) {
    return getColumnValues(this._context?.stateManager, ref);
  },

  _getColumnName(ref) {
    return getColumnName(this._context?.stateManager, ref);
  },

  // ─── Render ─────────────────────────────────────────────────

  _render() {
    const t = (k, v) => this._context.i18n.t(`modules.probability-plot.${k}`, v);

    this._container.innerHTML = `
      <div class="probplot dmike-split">
        <div class="probplot__input dmike-split__input">
          <div class="dmike-split__section-title">${t('sectionData')}</div>

          <div data-ref="picker-wrap"></div>

          <div class="probplot__error" data-ref="error-box"></div>

        </div>

        <div class="probplot__output dmike-split__output">
          <div class="probplot__placeholder" data-ref="placeholder">
            <p>${t('placeholderText')}</p>
          </div>
          <div class="probplot__chart-card" data-ref="chart-card" style="display:none">
            <div class="probplot__chart-main">
              <div class="probplot__plot-wrap" data-ref="plot"></div>
            </div>
          </div>
          <div class="dmike-stats-panel" data-ref="stats-panel"></div>
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
      multi: true,
      colors: CHART_COLORS,
      slots: [
        { key: 'value', label: 'V', title: this._context.i18n.t('ui.datasetPicker.slotV'), types: ['numeric'], minCount: 2, required: true },
        { key: 'group', label: 'G', title: this._context.i18n.t('ui.datasetPicker.slotG'), group: true },
      ],
      onChange: (datasets) => {
        this._datasets = datasets.map(ds => ({
          valueRef: ds.value || null,
          groupRef: ds.group || null,
        }));
        this._seriesOverrides = [];
        this._save();
        this._autoPlot();
      },
    });

    if (this._datasets.some(ds => ds.valueRef || ds.groupRef)) {
      this._picker.value = this._datasets.map(ds => ({
        value: ds.valueRef,
        group: ds.groupRef,
      }));
    }
  },

  _refreshPicker() {
    if (!this._picker) return;
    this._picker.refresh?.();
  },

  // ─── Events ─────────────────────────────────────────────────

  _bindContainerEvents() {
    this._container.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      if (action === 'reset') this._reset();
    });
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
    this._context.stateManager.setModuleState(this._context.instanceId, this.getState());
  },

  _reset() {
    this._datasets = [{ valueRef: null, groupRef: null }];
    this._seriesOverrides = [];
    this._refLines = [];
    this._refAreas = [];
    this._bgColor = null;
    this._destroyChart();
    this._save();
    this._render();
    this._bindContainerEvents();
  },

  _destroyChart() {
    if (this._chart) {
      this._context.chartManager.destroy(this._chart);
      this._chart = null;
    }
  },

  /** Sync editor-changed config back to module state */
  _syncFromChart() {
    if (this._chart && this._chart.config) {
      this._refLines = this._chart.config.refLines || this._refLines;
      this._refAreas = this._chart.config.refAreas || this._refAreas;
      this._bgColor = this._chart.config.bgColor ?? this._bgColor;
      if (Array.isArray(this._chart.config.series)) {
        this._seriesOverrides = this._chart.config.series.map(s => ({
          name: s.name,
          color: s.color,
          lineColor: s.lineColor,
          markerSymbol: s.markerSymbol,
          markerSize: s.markerSize,
          markerStroke: s.markerStroke,
          markerStrokeWidth: s.markerStrokeWidth,
          visible: s.visible !== false,
        }));
      }
    }
  },

  // ─── Auto-Plot ──────────────────────────────────────────────

  _autoPlot() {
    const hasAny = this._datasets.some(ds => ds.valueRef);
    if (!hasAny) {
      this._destroyChart();
      const placeholder = this._container?.querySelector('[data-ref="placeholder"]');
      const chartCard = this._container?.querySelector('[data-ref="chart-card"]');
      const statsPanel = this._container?.querySelector('[data-ref="stats-panel"]');
      if (placeholder) placeholder.style.display = '';
      if (chartCard) chartCard.style.display = 'none';
      if (statsPanel) { statsPanel.style.display = 'none'; statsPanel.innerHTML = ''; }
      return;
    }
    this._syncFromChart();
    this._plot();
  },

  // ─── Plot ───────────────────────────────────────────────────

  async _plot() {
    if (this._plotting) return;
    this._plotting = true;

    const t = (k, v) => this._context.i18n.t(`modules.probability-plot.${k}`, v);
    const errBox = this._container?.querySelector('[data-ref="error-box"]');
    if (errBox) errBox.style.display = 'none';

    // Expand datasets into seriesData. Each dataset with no grouping produces
    // exactly one series; grouped datasets produce one sub-series per unique
    // level (insertion order). Levels with fewer than 2 values are skipped
    // silently — the chart still renders the rest.
    const seriesData = [];
    const pushSeries = (name, values) => {
      seriesData.push({ name, values, visible: true });
    };

    for (let i = 0; i < this._datasets.length; i++) {
      const ds = this._datasets[i];
      if (!ds.valueRef) continue;

      const rawVals = this._getColumnValues(ds.valueRef);
      const name = this._getColumnName(ds.valueRef);

      if (ds.groupRef) {
        const groupVals = this._getColumnValues(ds.groupRef);
        const buckets = new Map();
        const len = Math.min(rawVals.length, groupVals.length);
        for (let r = 0; r < len; r++) {
          const v = rawVals[r];
          const g = groupVals[r];
          if (v == null || typeof v !== 'number' || isNaN(v)) continue;
          if (g == null || g === '') continue;
          const key = String(g);
          let b = buckets.get(key);
          if (!b) {
            b = { level: g, values: [] };
            buckets.set(key, b);
          }
          b.values.push(v);
        }

        if (buckets.size === 0) {
          this._showError(t('errNoGroupLevels', { n: i + 1 }));
          this._plotting = false;
          return;
        }

        let added = 0;
        for (const b of buckets.values()) {
          if (b.values.length < 2) continue;
          pushSeries(t('groupSeriesName', { col: name, level: String(b.level) }), b.values);
          added++;
        }
        if (added === 0) {
          this._showError(t('errTooFew', { col: name }));
          this._plotting = false;
          return;
        }
      } else {
        const values = rawVals.filter(v => v != null && typeof v === 'number' && !isNaN(v));
        if (values.length < 2) {
          this._showError(t('errTooFew', { col: name }));
          this._plotting = false;
          return;
        }
        pushSeries(name, values);
      }
    }

    if (seriesData.length === 0) {
      this._destroyChart();
      const placeholder = this._container?.querySelector('[data-ref="placeholder"]');
      const chartCard = this._container?.querySelector('[data-ref="chart-card"]');
      if (placeholder) placeholder.style.display = '';
      if (chartCard) chartCard.style.display = 'none';
      this._lastSeriesData = null;
      this._plotting = false;
      return;
    }

    // Apply saved overrides (parallel to seriesData; extras ignored).
    for (let i = 0; i < seriesData.length && i < this._seriesOverrides.length; i++) {
      const ov = this._seriesOverrides[i] || {};
      if (ov.name) seriesData[i].name = ov.name;
      if (ov.color) seriesData[i].color = ov.color;
      if (ov.lineColor) seriesData[i].lineColor = ov.lineColor;
      if (ov.markerSymbol) seriesData[i].markerSymbol = ov.markerSymbol;
      if (ov.markerSize != null) seriesData[i].markerSize = ov.markerSize;
      if (ov.markerStroke) seriesData[i].markerStroke = ov.markerStroke;
      if (ov.markerStrokeWidth != null) seriesData[i].markerStrokeWidth = ov.markerStrokeWidth;
      if (ov.visible != null) seriesData[i].visible = ov.visible;
    }

    const placeholder = this._container.querySelector('[data-ref="placeholder"]');
    const chartCard = this._container.querySelector('[data-ref="chart-card"]');
    const plotEl = this._container.querySelector('[data-ref="plot"]');
    if (placeholder) placeholder.style.display = 'none';
    if (chartCard) chartCard.style.display = '';

    this._destroyChart();
    if (plotEl) plotEl.innerHTML = '';

    const titleCol = seriesData.length === 1
      ? seriesData[0].name
      : seriesData.map(s => s.name).join(', ');

    try {
      const chartCfg = {
        title: t('chartTitle', { col: titleCol }),
        xLabel: t('xLabel'),
        yLabel: t('yLabel'),
        showLegend: true,
        series: seriesData,
        refLines: this._refLines,
        refAreas: this._refAreas,
        bgColor: this._bgColor,
      };
      this._chart = await this._context.chartManager.create(plotEl, 'probability-plot', chartCfg);
    } catch (err) {
      this._showError(err.message || t('errGeneric'));
    }

    this._lastSeriesData = seriesData;
    this._renderStats();
    this._plotting = false;
  },

  _renderStats() {
    const panel = this._container?.querySelector('[data-ref="stats-panel"]');
    if (!panel) return;

    if (!this._showStats || !this._lastSeriesData || this._lastSeriesData.length === 0) {
      panel.style.display = 'none';
      panel.innerHTML = '';
      return;
    }
    panel.style.display = '';

    const series = this._lastSeriesData.map((s, i) => ({
      name: s.name || `Series ${i + 1}`,
      values: s.values,
      color: s.color || 'var(--color-chart-1)',
      visible: s.visible !== false,
    }));
    const seriesStats = computeSeriesStats(series, this._confLevel / 100);
    renderStatsTable(panel, seriesStats, {
      i18n: this._context.i18n,
      confLevel: this._confLevel,
    });
  },
};
