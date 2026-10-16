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
 *
 * @agent  Steuerbar über das Viewmodel: die Datenreihen, je Reihe Werte-
 *   und optionale Gruppenspalte (setDatasets). Gelesen wird über read() mit
 *   erklärter Lesefläche (AgentRead), samt den Kennzahlen je Reihe (stats).
 */

import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { datasetSlotColumns, requireDatasetRows } from '../../core/agent/agent-datasets.js';
import Alpine from '@alpinejs/csp';
import { State } from './probability-plot-model.js';
import {
  DatasetPicker,
  getColumnValues, getColumnName,
} from '../../ui/dataset-picker.js';
import { computeSeriesStats, renderStatsTable } from '../../core/stats-panel.js';
import { CHART_COLORS } from '../../core/chart/chart-colors.js';
import { provisionWorksheet, removeProvisionedWorksheet } from '../../core/examples-registry.js';

/** Die Slots des Pickers, ohne Beschriftung — eine Quelle für Picker und Lesefläche. */
const DATASET_SLOTS = [
  { key: 'value', types: ['numeric'], minCount: 2, required: true },
  { key: 'group', group: true },
];

/** Die Slot-Schlüssel in der Reihenfolge der Oberfläche. */
const COLUMN_SLOTS = ['value', 'group'];

/**
 * Die Agenten-Lesefläche des Wahrscheinlichkeitsnetzes.
 *
 * Die Datenreihen sind der Zustand, im Model als `datasets` mit
 * `{ valueRef, groupRef }` je Reihe; unvollständige Reihen bleiben stehen
 * (wie bei der Oberfläche). Nicht darin: Darstellung (`seriesOverrides`,
 * Referenzlinien, Hintergrund), `showStats`/`confLevel` (ohne Bedienelement),
 * Anpassungstest und Diagrammbild, `exampleWorksheetId`. Die Kennzahlen
 * stehen in `stats` (E8).
 *
 * @typedef {object} AgentRead
 * @property {object[]} datasets  per data row `{ valueRef, groupRef }` — value column (slot `value`) and optional group column (slot `group`), each a column reference or null
 * @property {string[]} activeColumnSlots  the slot keys a row of `setDatasets` may carry
 * @property {object} pickableColumns  per slot the columns `setDatasets` accepts, each `{ key, name }`
 * @property {object[]|null} stats  per plotted series `{ name, stats, ci }` — stats `{ n, mean, stddev, variance, seMean, median, min, max, range, q1, q3, skewness, kurtosis }`, ci `{ mean, variance, stddev }` as `[low, high]` at the confidence level — or null while nothing can be computed
 */

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

      // ── Agent surface ─────────────────────────────────────────

      /**
       * Den vollständigen Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[], rows?: { from: number, to: number } }`
       * @returns {AgentRead} Spaltenbezüge, wählbare Mengen und Kennzahlen
       */
      read(options) {
        return readAgentState('probability-plot', {
          datasets: this.model.datasets,
          activeColumnSlots: this.activeColumnSlots(),
          pickableColumns: this.pickableColumns(),
          stats: this._agentStats(),
        }, options);
      },

      /** @noagent derived set; der Agent liest sie über read().activeColumnSlots */
      activeColumnSlots() { return [...COLUMN_SLOTS]; },

      /** @noagent derived set; der Agent liest sie über read().pickableColumns */
      pickableColumns() { return datasetSlotColumns(module._context.stateManager, DATASET_SLOTS); },

      /**
       * Die ganze Liste der Datenreihen setzen.
       * @agent
       * @param {object[]} rows je Reihe `{ <slot>: ref|null }`; Slots siehe
       *   read().activeColumnSlots, Spalten siehe read().pickableColumns; [] leert
       * @returns {void}
       * @throws {Error} wenn `rows` keine Liste ist, ein Slot unbekannt oder eine Spalte nicht wählbar
       */
      setDatasets(rows) {
        const clean = requireDatasetRows(rows, this.pickableColumns());
        this._applyDatasets(clean);
        if (this._picker) this._picker.value = clean;
      },

      /** Der Körper des Picker-`onChange`: Zeilen ins Model, Serienanpassungen verwerfen, neu zeichnen. */
      _applyDatasets(rows) {
        this.model.datasets = rows.map(ds => ({
          valueRef: ds.value || null,
          groupRef: ds.group || null,
        }));
        this.model.seriesOverrides = [];
        this._autoPlot();
      },

      /** Die aktuellen Zeilen in Picker-Form, aus dem Model. */
      _datasetRows() {
        return this.model.datasets.map(ds => ({ value: ds.valueRef, group: ds.groupRef }));
      },

      /** Die Kennzahlen für read() — dieselben Reihen und dieselbe Rechnung wie die Tabelle (E8). */
      _agentStats() {
        let series;
        try { series = this._buildSeries(); } catch { return null; }
        if (!series.length) return null;
        const result = computeSeriesStats(this._statsInput(series), this.model.confLevel / 100)
          .map(({ name, stats, ci }) => ({ name, stats, ci }));
        return result.length ? result : null;
      },

      /** Die Abbildung Reihe → Statistikeingabe — Quelle für Tabelle und read(). */
      _statsInput(series) {
        return series.map((s, i) => ({
          name: s.name || `Series ${i + 1}`,
          values: s.values,
          color: s.color || 'var(--color-chart-1)',
          visible: s.visible !== false,
        }));
      },

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

        const SLOT_LABELS = {
          value: { label: 'V', title: module._context.i18n.t('ui.datasetPicker.slotV') },
          group: { label: 'G', title: module._context.i18n.t('ui.datasetPicker.slotG') },
        };
        this._picker = new DatasetPicker(pickerWrap, module._context, {
          multi: true,
          colors: CHART_COLORS,
          slots: DATASET_SLOTS.map(s => ({ ...s, ...SLOT_LABELS[s.key] })),
          onChange: (rows) => this._applyDatasets(rows),
        });

        // Restore saved selections if any dataset has a valueRef
        if (this.model.datasets.some(ds => ds.valueRef || ds.groupRef)) {
          this._picker.value = this._datasetRows();
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

      /**
       * Die Reihen aus den Datensätzen bilden (Gruppen, Mindestanzahl, Anpassungen aus seriesOverrides).
       * @returns {object[]} die Reihen, wie `_plot` sie zeichnet
       * @throws {Error} mit der übersetzten Meldung, die `_plot` über `_showError` zeigt
       */
      _buildSeries() {
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
              throw new Error(_t('errNoGroupLevels', { n: i + 1 }));
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
              throw new Error(_t('errTooFew', { col: name }));
            }
          } else {
            const values = rawVals.filter(v => v != null && typeof v === 'number' && !isNaN(v));
            if (values.length < 2) {
              throw new Error(_t('errTooFew', { col: name }));
            }
            pushSeries(name, values);
          }
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

        return seriesData;
      },

      async _plot() {
        if (this._plotting) return;
        this._plotting = true;

        const errBox = module._container.querySelector('[data-ref="error-box"]');
        if (errBox) errBox.style.display = 'none';

        let seriesData;
        try {
          seriesData = this._buildSeries();
        } catch (err) {
          this._showError(err.message);
          this._plotting = false;
          return;
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

        const series = this._statsInput(this._lastSeriesData);
        const seriesStats = computeSeriesStats(series, this.model.confLevel / 100);
        renderStatsTable(panel, seriesStats, {
          i18n: module._context.i18n,
          confLevel: this.model.confLevel,
        });
      },

      // ── Alpine component lifecycle ────────────────────────────

      /** @noagent lifecycle */
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

      /** @noagent lifecycle */
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
  if (currentModel && currentModel.hasContent() && ctx.dialog) {
    const ok = await ctx.dialog.confirm({ message: t('moduleHelp.confirmOverwrite'), danger: true });
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
// Nicht an `mod` gebunden: die Registry legt je Instanz eine Kopie an (`{ ...moduleExport }`),
// der Aufruf muss auf der Instanz laufen, sonst liefert er den Zustand der Vorlage (null).
const _origGetState = mod.getState;
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
  return _origGetState.call(this);
};

export default mod;
