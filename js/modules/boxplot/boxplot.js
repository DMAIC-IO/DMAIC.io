/**
 * D.Mike — Boxplot Module (boxplot.js)
 * Data phase: horizontal boxplots of worksheet columns.
 *
 * Each dataset row selects a numeric value column and an optional grouping column.
 * Without grouping → one boxplot per column.
 * With grouping → one boxplot per unique group value.
 *
 * Uses the SVG chart framework (chartManager) for rendering.
 * Migrated to createModule + Alpine CSP.
 *
 * Imperative widgets:
 *   - DatasetPicker  (mounted in init(), disposed in destroy())
 *   - chartManager   (stale-render-guard via _renderGen)
 *   - Stats table    (renderStatsTable — POM locates [data-ref="stats-panel"] table)
 *
 * Key reference: js/modules/msa-typ1/ (DatasetPicker + chartManager pattern)
 */

import { createModule } from '../../core/template-module.js';
import { State } from './boxplot-model.js';
import {
  DatasetPicker,
  getColumnValues, getColumnName,
} from '../../ui/dataset-picker.js';
import { computeSeriesStats, renderStatsTable } from '../../core/stats-panel.js';
import { CHART_COLORS } from '../../core/chart/chart-colors.js';
import { provisionWorksheet, removeProvisionedWorksheet } from '../../core/examples-registry.js';

const mod = createModule({
  config: {
    id: 'boxplot',
    engine: 'alpine',
    phase: 'data',
    icon: 'module.boxplot',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (not persisted) ──────────────────
      /** @type {import('../../ui/dataset-picker.js').DatasetPicker|null} */
      _picker: null,
      /** @type {object|null} — active chart instance */
      _chart: null,
      /** Stale-render guard: incremented before each async chart.create */
      _renderGen: 0,
      /** @type {Array} — unsub functions for event-bus listeners */
      _unsubs: [],
      /** Groups from the last successful plot (for stats re-render) */
      _lastGroups: null,
      /** True while a plot is in progress (prevents concurrent renders) */
      _plotting: false,

      // ── Column helpers ────────────────────────────────────────

      /** @param {object} ref @returns {number[]} */
      _getColumnValues(ref) {
        return getColumnValues(module._context.stateManager, ref);
      },

      /** @param {object} ref @returns {string} */
      _getColumnName(ref) {
        return getColumnName(module._context.stateManager, ref);
      },

      // ── Business logic (needs live column data — lives in data-Fn) ───

      /**
       * Build chart groups from all dataset references.
       * @param {function} t — i18n translator
       * @returns {Array<{name:string, values:number[]}>}
       */
      _buildGroups(t) {
        if (this.model.seriesRefs.length === 0) {
          throw new Error(t('errNoSeries'));
        }
        const groups = [];
        for (let i = 0; i < this.model.seriesRefs.length; i++) {
          const ref = this.model.seriesRefs[i];
          const groupRef = this.model.groupRefs[i] || null;
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

      // ── Chart rendering ───────────────────────────────────────

      _syncFromChart() {
        if (this._chart && this._chart.config) {
          this.model.showMean = this._chart.config.showMean ?? this.model.showMean;
          this.model.showOutliers = this._chart.config.showOutliers ?? this.model.showOutliers;
        }
      },

      _destroyChart() {
        if (this._chart) {
          try { module._context.chartManager.destroy(this._chart); } catch { /* ignore */ }
          this._chart = null;
        }
      },

      _showError(msg) {
        const errBox = module._container.querySelector('[data-ref="error-box"]');
        if (errBox) {
          errBox.textContent = msg;
          errBox.style.display = 'block';
          setTimeout(() => { errBox.style.display = 'none'; }, 4000);
        }
      },

      /** Show placeholder, hide chart */
      _showPlaceholder() {
        const placeholder = module._container.querySelector('[data-ref="placeholder"]');
        const chartCard = module._container.querySelector('[data-ref="chart-card"]');
        if (placeholder) placeholder.style.display = '';
        if (chartCard) chartCard.style.display = 'none';
      },

      /** Hide placeholder, show chart card */
      _showChartCard() {
        const placeholder = module._container.querySelector('[data-ref="placeholder"]');
        const chartCard = module._container.querySelector('[data-ref="chart-card"]');
        if (placeholder) placeholder.style.display = 'none';
        if (chartCard) chartCard.style.display = '';
      },

      /** Auto-plot if enough data is selected; hide chart otherwise */
      _autoPlot() {
        const hasData = this.model.seriesRefs.length > 0;
        if (!hasData) {
          this._destroyChart();
          this._showPlaceholder();
          return;
        }
        this._syncFromChart();
        this._plot();
      },

      async _plot() {
        if (this._plotting) return;
        this._plotting = true;

        // Hide any previous error
        const errBox = module._container.querySelector('[data-ref="error-box"]');
        if (errBox) errBox.style.display = 'none';

        let groups;
        try {
          groups = this._buildGroups(_t);
        } catch (err) {
          this._showError(err.message);
          this._plotting = false;
          return;
        }

        if (!groups || groups.length === 0) {
          this._showError(_t('errNoData'));
          this._plotting = false;
          return;
        }

        this._showChartCard();

        const gen = ++this._renderGen;
        this._destroyChart();

        const plotEl = module._container.querySelector('[data-ref="plot"]');
        if (plotEl) plotEl.replaceChildren();

        try {
          const chart = await module._context.chartManager.create(plotEl, 'boxplot', {
            title: _t('chartTitle'),
            xLabel: _t('xLabel'),
            yLabel: '',
            showLegend: groups.length > 1,
            showYTicks: false,
            showMean: this.model.showMean,
            showOutliers: this.model.showOutliers,
            groups,
            boxColors: this.model.boxColors,
            refLines: this.model.refLines,
            refAreas: this.model.refAreas,
            bgColor: this.model.bgColor,
          });

          if (gen !== this._renderGen) {
            // Stale render — a newer render started while awaiting
            try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
            this._plotting = false;
            return;
          }
          this._chart = chart;
        } catch (err) {
          this._showError(err.message || _t('errGeneric'));
        }

        this._lastGroups = groups;
        this._renderStats();
        this._plotting = false;
      },

      _renderStats() {
        const panel = module._container.querySelector('[data-ref="stats-panel"]');
        if (!panel) return;

        if (!this.model.showStats || !this._lastGroups) {
          panel.style.display = 'none';
          panel.replaceChildren();
          return;
        }

        const series = this._lastGroups.map((g, i) => ({
          name: g.name,
          values: g.values,
          color: (this.model.boxColors[i] || CHART_COLORS[i % CHART_COLORS.length]),
          visible: true,
        }));
        const seriesStats = computeSeriesStats(series, this.model.confLevel / 100);
        renderStatsTable(panel, seriesStats, {
          i18n: module._context.i18n,
          confLevel: this.model.confLevel,
        });
      },

      // ── DatasetPicker (imperative widget) ─────────────────────

      _mountPicker() {
        const pickerWrap = module._container.querySelector('[data-ref="picker-wrap"]');
        if (!pickerWrap) return;

        this._picker?.destroy();
        this._picker = new DatasetPicker(pickerWrap, module._context, {
          multi: true,
          colors: CHART_COLORS,
          slots: [
            { key: 'value', label: 'V', title: module._context.i18n.t('ui.datasetPicker.slotV'), types: ['numeric'], minCount: 1, required: true },
            { key: 'group', label: 'G', title: module._context.i18n.t('ui.datasetPicker.slotG'), group: true },
          ],
          onChange: (datasets) => {
            // Only keep datasets that have a value column selected
            const valid = datasets.filter(ds => ds.value != null);
            this.model.seriesRefs = valid.map(ds => ds.value);
            this.model.groupRefs = valid.map(ds => ds.group || null);
            this._autoPlot();
          },
        });

        // Restore saved refs
        if (this.model.seriesRefs.length > 0) {
          this._picker.value = this.model.seriesRefs.map((ref, i) => ({
            value: ref,
            group: this.model.groupRefs[i] || null,
          }));
        }
      },

      // ── Alpine component lifecycle ────────────────────────────

      init() {
        // Fresh per-instance transient collections
        this._chart = null;
        this._picker = null;
        this._unsubs = [];
        this._lastGroups = null;
        this._plotting = false;
        this._renderGen = 0;

        this._mountPicker();

        const eb = module._context.eventBus;

        // Refresh picker when the user switches back to this module
        const onActivated = ({ instanceId }) => {
          if (instanceId === module._context.instanceId) this._picker?.refresh();
        };
        eb.on('module:activated', onActivated);
        this._unsubs.push(() => eb.off('module:activated', onActivated));

        // Re-render chart on theme change
        const onTheme = () => {
          if (this._lastGroups) this._plot();
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
 * Custom loadExample: Boxplot examples ship a full worksheet
 * (`sourceWorksheetFile` resolved externally → `sourceWorksheetData`) and use
 * the literal placeholder `__source__` as the seriesRef.instanceId / groupRef.instanceId.
 * On load we provision a fresh worksheet, rewrite the placeholder, then apply state.
 *
 * This replaces the generic createModule loadExample because of the worksheet
 * provisioning the generic helper cannot perform.
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

    // Clean up previously provisioned worksheet
    const prevId = currentModel && currentModel.exampleWorksheetId;
    if (prevId) removeProvisionedWorksheet(ctx, prevId);

    const ref = provisionWorksheet(ctx, wsState);
    if (ref) {
      data.exampleWorksheetId = ref.instanceId;
      // Rewrite __source__ placeholder in all series and group refs
      const rewrite = (r) => (r && r.instanceId === '__source__') ? { ...r, instanceId: ref.instanceId } : r;
      if (Array.isArray(data.seriesRefs)) data.seriesRefs = data.seriesRefs.map(rewrite);
      if (Array.isArray(data.groupRefs)) data.groupRefs = data.groupRefs.map(r => (r ? rewrite(r) : r));
    }
  }

  this.setState(data);
  ctx.stateManager.setModuleState(ctx.instanceId, this.getState());

  const lang = ctx.i18n.getLanguage();
  const title = payload.meta && payload.meta.title
    ? (payload.meta.title[lang] || payload.meta.title.en || payload.meta.id || '')
    : (payload.meta && payload.meta.id ? payload.meta.id : '');
  ctx.notify && ctx.notify(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
};

export default mod;
