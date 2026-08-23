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
 *
 * Migrated to createModule + Alpine CSP.
 * Architecture:
 *   - Static structure (input panel, placeholder, chart card) lives in
 *     the Alpine template (probability-plot.html).
 *   - DatasetPicker, chart, and stats table are rendered imperatively.
 *   - DatasetPicker is an imperative widget mounted in init(), disposed in
 *     destroy().
 *   - chartManager uses _renderGen stale-guard.
 *   - _unsubs collects event-bus subscriptions for cleanup.
 */

import { createModule } from '../../core/template-module.js';
import Alpine from '@alpinejs/csp';
import { State } from './probability-plot-model.js';
import {
  DatasetPicker,
  getColumnValues, getColumnName,
} from '../../ui/dataset-picker.js';
import { computeSeriesStats, renderStatsTable } from '../../core/stats-panel.js';
import { CHART_COLORS } from '../../core/chart/chart-colors.js';
import { provisionWorksheet, removeProvisionedWorksheet } from '../../core/examples-registry.js';

const mod = createModule({
  config: {
    id: 'probability-plot',
    engine: 'alpine',
    phase: 'data',
    icon: 'module.probability-plot',
    version: '1.1.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (not persisted) ──────────────────
      /** @type {object|null} — active chart instance */
      _chart: null,
      /** Guard against concurrent plot runs */
      _plotting: false,
      /** @type {import('../../ui/dataset-picker.js').DatasetPicker|null} */
      _picker: null,
      /** Last series data (for _renderStats). */
      _lastSeriesData: null,
      /** Stale-render guard counter */
      _renderGen: 0,
      /** @type {Array} — unsub functions for event-bus listeners */
      _unsubs: [],

      // ── Column helpers ────────────────────────────────────────

      /**
       * Get numeric column values for a column reference.
       * @param {object|null} ref
       * @returns {number[]}
       */
      _getColumnValues(ref) {
        return getColumnValues(module._context.stateManager, ref);
      },

      /**
       * Get column display name for a column reference.
       * @param {object|null} ref
       * @returns {string}
       */
      _getColumnName(ref) {
        return getColumnName(module._context.stateManager, ref);
      },

      // ── DatasetPicker (imperative widget) ─────────────────────

      _mountPicker() {
        const pickerWrap = module._container.querySelector('[data-ref="picker-wrap"]');
        if (!pickerWrap) return;
        this._picker?.destroy();
        this._picker = null;

        this._picker = new DatasetPicker(pickerWrap, module._context, {
          multi: true,
          colors: CHART_COLORS,
          slots: [
            {
              key: 'value',
              label: 'V',
              title: module._context.i18n.t('ui.datasetPicker.slotV'),
              types: ['numeric'],
              minCount: 2,
              required: true,
            },
            {
              key: 'group',
              label: 'G',
              title: module._context.i18n.t('ui.datasetPicker.slotG'),
              group: true,
            },
          ],
          onChange: (datasets) => {
            this.model.datasets = datasets.map(ds => ({
              valueRef: ds.value || null,
              groupRef: ds.group || null,
            }));
            this.model.seriesOverrides = [];
            this._autoPlot();
          },
        });

        // Restore saved selections if any dataset has a valueRef
        if (this.model.datasets.some(ds => ds.valueRef || ds.groupRef)) {
          this._picker.value = this.model.datasets.map(ds => ({
            value: ds.valueRef,
            group: ds.groupRef,
          }));
        }
      },

      _refreshPicker() {
        if (!this._picker) return;
        this._picker.refresh?.();
      },

      // ── Error display ─────────────────────────────────────────

      _showError(msg) {
        const errBox = module._container.querySelector('[data-ref="error-box"]');
        if (errBox) {
          errBox.textContent = msg;
          errBox.style.display = 'block';
          setTimeout(() => { errBox.style.display = 'none'; }, 4000);
        }
      },

      // ── Chart ─────────────────────────────────────────────────

      _destroyChart() {
        if (this._chart) {
          module._context.chartManager.destroy(this._chart);
          this._chart = null;
        }
      },

      /**
       * Sync chart editor changes back to model state.
       * Called before serializing state so that user edits are persisted.
       */
      _syncFromChart() {
        if (this._chart && this._chart.config) {
          this.model.refLines = this._chart.config.refLines || this.model.refLines;
          this.model.refAreas = this._chart.config.refAreas || this.model.refAreas;
          this.model.bgColor = this._chart.config.bgColor ?? this.model.bgColor;
          if (Array.isArray(this._chart.config.series)) {
            this.model.seriesOverrides = this._chart.config.series.map(s => ({
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

      // ── Auto-Plot ─────────────────────────────────────────────

      _autoPlot() {
        const hasAny = this.model.datasets.some(ds => ds.valueRef);
        if (!hasAny) {
          this._destroyChart();
          const placeholder = module._container.querySelector('[data-ref="placeholder"]');
          const chartCard = module._container.querySelector('[data-ref="chart-card"]');
          const statsPanel = module._container.querySelector('[data-ref="stats-panel"]');
          if (placeholder) placeholder.style.display = '';
          if (chartCard) chartCard.style.display = 'none';
          if (statsPanel) { statsPanel.style.display = 'none'; statsPanel.replaceChildren(); }
          return;
        }
        this._syncFromChart();
        this._plot();
      },

      // ── Plot ──────────────────────────────────────────────────

      async _plot() {
        if (this._plotting) return;
        this._plotting = true;

        const errBox = module._container.querySelector('[data-ref="error-box"]');
        if (errBox) errBox.style.display = 'none';

        // Expand datasets into seriesData. Each dataset without grouping
        // produces one series; grouped datasets produce one sub-series per
        // unique level. Levels with fewer than 2 values are skipped.
        const seriesData = [];
        const pushSeries = (name, values) => {
          seriesData.push({ name, values, visible: true });
        };

        for (let i = 0; i < this.model.datasets.length; i++) {
          const ds = this.model.datasets[i];
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
              this._showError(_t('errNoGroupLevels', { n: i + 1 }));
              this._plotting = false;
              return;
            }

            let added = 0;
            for (const b of buckets.values()) {
              if (b.values.length < 2) continue;
              pushSeries(
                _t('groupSeriesName', { col: name, level: String(b.level) }),
                b.values,
              );
              added++;
            }
            if (added === 0) {
              this._showError(_t('errTooFew', { col: name }));
              this._plotting = false;
              return;
            }
          } else {
            const values = rawVals.filter(v => v != null && typeof v === 'number' && !isNaN(v));
            if (values.length < 2) {
              this._showError(_t('errTooFew', { col: name }));
              this._plotting = false;
              return;
            }
            pushSeries(name, values);
          }
        }

        if (seriesData.length === 0) {
          this._destroyChart();
          const placeholder = module._container.querySelector('[data-ref="placeholder"]');
          const chartCard = module._container.querySelector('[data-ref="chart-card"]');
          if (placeholder) placeholder.style.display = '';
          if (chartCard) chartCard.style.display = 'none';
          this._lastSeriesData = null;
          this._plotting = false;
          return;
        }

        // Apply saved overrides (parallel to seriesData; extras ignored).
        for (let i = 0; i < seriesData.length && i < this.model.seriesOverrides.length; i++) {
          const ov = this.model.seriesOverrides[i] || {};
          if (ov.name) seriesData[i].name = ov.name;
          if (ov.color) seriesData[i].color = ov.color;
          if (ov.lineColor) seriesData[i].lineColor = ov.lineColor;
          if (ov.markerSymbol) seriesData[i].markerSymbol = ov.markerSymbol;
          if (ov.markerSize != null) seriesData[i].markerSize = ov.markerSize;
          if (ov.markerStroke) seriesData[i].markerStroke = ov.markerStroke;
          if (ov.markerStrokeWidth != null) seriesData[i].markerStrokeWidth = ov.markerStrokeWidth;
          if (ov.visible != null) seriesData[i].visible = ov.visible;
        }

        const placeholder = module._container.querySelector('[data-ref="placeholder"]');
        const chartCard = module._container.querySelector('[data-ref="chart-card"]');
        const plotEl = module._container.querySelector('[data-ref="plot"]');
        if (placeholder) placeholder.style.display = 'none';
        if (chartCard) chartCard.style.display = '';

        this._destroyChart();
        if (plotEl) plotEl.replaceChildren();

        const titleCol = seriesData.length === 1
          ? seriesData[0].name
          : seriesData.map(s => s.name).join(', ');

        const gen = ++this._renderGen;

        try {
          const chartCfg = {
            title: _t('chartTitle', { col: titleCol }),
            xLabel: _t('xLabel'),
            yLabel: _t('yLabel'),
            showLegend: true,
            series: seriesData,
            refLines: this.model.refLines,
            refAreas: this.model.refAreas,
            bgColor: this.model.bgColor,
          };
          const chart = await module._context.chartManager.create(plotEl, 'probability-plot', chartCfg);

          if (gen !== this._renderGen) {
            // Stale render — newer one started while awaiting
            try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
            this._plotting = false;
            return;
          }

          this._chart = chart;
        } catch (err) {
          this._showError(err.message || _t('errGeneric'));
        }

        this._lastSeriesData = seriesData;
        this._renderStats();
        this._plotting = false;
      },

      // ── Stats panel ───────────────────────────────────────────

      _renderStats() {
        const panel = module._container.querySelector('[data-ref="stats-panel"]');
        if (!panel) return;

        if (!this.model.showStats || !this._lastSeriesData || this._lastSeriesData.length === 0) {
          panel.style.display = 'none';
          panel.replaceChildren();
          return;
        }
        panel.style.display = '';

        const series = this._lastSeriesData.map((s, i) => ({
          name: s.name || `Series ${i + 1}`,
          values: s.values,
          color: s.color || 'var(--color-chart-1)',
          visible: s.visible !== false,
        }));
        const seriesStats = computeSeriesStats(series, this.model.confLevel / 100);
        renderStatsTable(panel, seriesStats, {
          i18n: module._context.i18n,
          confLevel: this.model.confLevel,
        });
      },

      // ── Alpine component lifecycle ────────────────────────────

      init() {
        // Fresh per-instance transient collections
        this._chart = null;
        this._plotting = false;
        this._lastSeriesData = null;
        this._renderGen = 0;
        this._unsubs = [];

        this._mountPicker();

        const eb = module._context.eventBus;

        // Refresh picker (column list) when worksheet data changes
        const onRefresh = () => this._refreshPicker();
        eb.on('state:saved', onRefresh);
        eb.on('worksheet:dataChanged', onRefresh);
        this._unsubs.push(
          () => eb.off('state:saved', onRefresh),
          () => eb.off('worksheet:dataChanged', onRefresh),
        );

        // Refresh picker when a worksheet module is added / removed
        const onAdd = ({ moduleId }) => { if (moduleId === 'worksheet') this._refreshPicker(); };
        eb.on('module:added', onAdd);
        this._unsubs.push(() => eb.off('module:added', onAdd));

        const onRem = ({ moduleId }) => { if (moduleId === 'worksheet') this._refreshPicker(); };
        eb.on('module:removed', onRem);
        this._unsubs.push(() => eb.off('module:removed', onRem));

        // Refresh picker when this module gets activated (user switches to it)
        const onActivated = ({ instanceId }) => {
          if (instanceId === module._context.instanceId) this._picker?.refresh();
        };
        eb.on('module:activated', onActivated);
        this._unsubs.push(() => eb.off('module:activated', onActivated));

        // Re-render chart on theme change
        const onTheme = () => {
          if (this._lastSeriesData) {
            this._destroyChart();
            this._plot();
          }
        };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));

        // Trigger initial plot from restored state
        this._autoPlot();
      },

      destroy() {
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        this._picker?.destroy();
        this._picker = null;
        this._destroyChart();
      },
    };
  },
});

/**
 * Custom loadExample: probability-plot examples ship a full worksheet
 * (`sourceWorksheetData`) and use the literal placeholder `__source__` as
 * dataset/columnRef instanceIds. On load we provision a fresh worksheet,
 * rewrite the placeholders, then apply state (which re-runs the plot on
 * the new data).
 *
 * This replaces the generic createModule loadExample because of the
 * worksheet provisioning the generic helper cannot perform.
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = async function loadExample(payload) {
  if (!payload || !payload.data) return;
  const ctx = this._context;
  const t = (key) => ctx.i18n.t(key);

  const current = this.getState();
  const currentModel = current ? State.fromJSON(current) : null;
  if (currentModel && currentModel.hasContent() && ctx.confirmPopout) {
    const ok = await ctx.confirmPopout(t('moduleHelp.confirmOverwrite'), { danger: true });
    if (!ok) return;
  }

  const data = { ...payload.data };

  if (data.sourceWorksheetData) {
    const wsState = data.sourceWorksheetData;
    delete data.sourceWorksheetData;

    const prevId = currentModel && currentModel.exampleWorksheetId;
    if (prevId) removeProvisionedWorksheet(ctx, prevId);

    const ref = provisionWorksheet(ctx, wsState);
    if (ref) {
      data.exampleWorksheetId = ref.instanceId;
      const rewrite = (r) =>
        r && r.instanceId === '__source__' ? { ...r, instanceId: ref.instanceId } : r;

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

  // Backward-compat: legacy single columnRef → one dataset
  if (!Array.isArray(data.datasets) && data.columnRef) {
    data.datasets = [{ valueRef: data.columnRef, groupRef: null }];
  }

  this.setState(data);
  ctx.stateManager.setModuleState(ctx.instanceId, this.getState());

  const lang = ctx.i18n.getLanguage();
  const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
  ctx.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
};

/**
 * Override getState to sync chart editor changes before serializing.
 * This ensures that any chart editor modifications (refLines, refAreas,
 * bgColor, series overrides) are captured when state is persisted.
 */
const _origGetState = mod.getState.bind(mod);
mod.getState = function getState() {
  // Sync chart editor config back to model properties before serializing.
  // Alpine.$data(root) gives access to the live Alpine component proxy,
  // which has the _syncFromChart method and mutates this.model.* directly.
  if (this._container) {
    const root = this._container.querySelector('[x-data]');
    if (root) {
      try {
        const alpineData = Alpine.$data(root);
        if (typeof alpineData._syncFromChart === 'function') {
          alpineData._syncFromChart();
        }
      } catch { /* ignore — component may not be mounted yet */ }
    }
  }
  return _origGetState();
};

export default mod;
