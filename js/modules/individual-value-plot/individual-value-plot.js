/**
 * D.Mike — Individual Value Plot Module (individual-value-plot.js)
 * Data phase: vertical individual-value plots of worksheet columns.
 *
 * Each data series selects a numeric value column and up to three optional
 * grouping columns. Without grouping → one column of points per value column.
 * With grouping → one column of points per unique group tuple.
 *
 * Migrated to createModule + Alpine CSP. The Model holds only the persisted
 * inputs (the column refs, option toggles, point styling, the example-worksheet
 * id) plus the grouping algorithm; everything transient (the DatasetPicker, the
 * SVG chart, the imperatively-rendered stats table, render generation, the
 * placeholder/chart-card visibility) lives in the data-fn. Descriptive stats are
 * computed by the shared `core/stats-panel.js` engine and reused unchanged. The
 * DatasetPicker, the SVG plot, and the stats table are mounted imperatively
 * (they are not pure-template concerns).
 */

import { createModule } from '../../core/template-module.js';
import { State } from './individual-value-plot-model.js';

import {
  DatasetPicker,
  getColumnValues, getColumnName,
} from '../../ui/dataset-picker.js';
import { computeSeriesStats, renderStatsTable } from '../../core/stats-panel.js';
import { CHART_COLORS } from '../../core/chart/chart-colors.js';
import { provisionWorksheet, removeProvisionedWorksheet } from '../../core/examples-registry.js';

/** Default confidence level when not resolved from settings. */
const DEFAULT_CONF_LEVEL = 95;

const mod = createModule({
  config: {
    id: 'individual-value-plot',
    engine: 'alpine',
    phase: 'data',
    icon: 'module.individual-value-plot',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (not persisted) ──────────────────
      _picker: null,
      _chart: null,
      _unsubs: [],
      _plotting: false,
      _renderGen: 0,
      /** Last computed groups, for stats re-render. */
      _lastGroups: null,

      // ── View transforms ───────────────────────────────────────

      /** Value shown in the confidence-level input (resolved from settings). */
      confLevelDisplay() {
        return this._resolveConfLevel();
      },

      _resolveConfLevel() {
        if (this.model.confLevel == null) {
          this.model.confLevel =
            module._context?.stateManager.get('settings.confidenceLevel') ?? DEFAULT_CONF_LEVEL;
        }
        return this.model.confLevel;
      },

      _errMsgs() {
        return {
          errNoSeries: _t('errNoSeries'),
          errNoData: _t('errNoData'),
          errTooFew: (col) => _t('errTooFew', { col }),
        };
      },

      // ── Event handlers ─────────────────────────────────────────

      confChanged(event) {
        const input = event.target;
        const v = parseFloat(input.value.replace(',', '.'));
        if (Number.isFinite(v) && v > 0 && v < 100) {
          this.model.confLevel = v;
        }
        input.value = this.model.confLevel;
        this._renderStats();
      },

      // ── Column helpers ────────────────────────────────────────

      _getColumnValues(ref) {
        return getColumnValues(module._context?.stateManager, ref);
      },

      _getColumnName(ref) {
        return getColumnName(module._context?.stateManager, ref);
      },

      // ── DatasetPicker (imperative widget) ─────────────────────

      _mountPicker() {
        const wrap = module._container.querySelector('[data-ref="picker-wrap"]');
        if (!wrap) return;
        this._picker?.destroy();

        const ctx = module._context;
        this._picker = new DatasetPicker(wrap, ctx, {
          multi: true,
          colors: CHART_COLORS,
          slots: [
            { key: 'value',  label: 'V',  title: ctx.i18n.t('ui.datasetPicker.slotV'),  types: ['numeric'], minCount: 1, required: true },
            { key: 'group',  label: 'G1', title: ctx.i18n.t('ui.datasetPicker.slotG1'), group: true },
            { key: 'group2', label: 'G2', title: ctx.i18n.t('ui.datasetPicker.slotG2'), group: true },
            { key: 'group3', label: 'G3', title: ctx.i18n.t('ui.datasetPicker.slotG3'), group: true },
          ],
          onChange: (datasets) => {
            const valid = datasets.filter((ds) => ds.value != null);
            this.model.seriesRefs = valid.map((ds) => ds.value);
            this.model.groupRefs = valid.map((ds) => [ds.group || null, ds.group2 || null, ds.group3 || null]);
            this._autoPlot();
          },
        });

        if (this.model.seriesRefs.length > 0) {
          this._picker.value = this.model.seriesRefs.map((ref, i) => {
            const arr = this.model.groupRefsAt(i);
            return {
              value: ref,
              group:  arr[0] || null,
              group2: arr[1] || null,
              group3: arr[2] || null,
            };
          });
        }
      },

      _destroyPicker() {
        if (this._picker) { this._picker.destroy(); this._picker = null; }
      },

      // ── Error box ─────────────────────────────────────────────

      _showError(msg) {
        const errBox = module._container?.querySelector('[data-ref="error-box"]');
        if (errBox) {
          errBox.textContent = msg;
          errBox.style.display = 'block';
          setTimeout(() => { errBox.style.display = 'none'; }, 4000);
        }
      },

      // ── Auto-plot / plot ──────────────────────────────────────

      /** Sync option toggles from the live chart back to model state. */
      _syncFromChart() {
        if (this._chart && this._chart.config) {
          const c = this._chart.config;
          this.model.showMean = c.showMean ?? this.model.showMean;
          this.model.showMedian = c.showMedian ?? this.model.showMedian;
          this.model.connectMeans = c.connectMeans ?? this.model.connectMeans;
          this.model.showOverallMean = c.showOverallMean ?? this.model.showOverallMean;
          this.model.jitter = c.jitter ?? this.model.jitter;
          this.model.pointSymbol = c.pointSymbol ?? this.model.pointSymbol;
          this.model.pointSize = c.pointSize ?? this.model.pointSize;
        }
      },

      _autoPlot() {
        const hasData = this.model.seriesRefs.length > 0;

        if (!hasData) {
          this._destroyChart();
          const placeholder = module._container?.querySelector('[data-ref="placeholder"]');
          const chartCard = module._container?.querySelector('[data-ref="chart-card"]');
          if (placeholder) placeholder.style.display = '';
          if (chartCard) chartCard.style.display = 'none';
          return;
        }

        this._syncFromChart();
        this._plot();
      },

      async _plot() {
        if (this._plotting) return;
        this._plotting = true;

        const errBox = module._container?.querySelector('[data-ref="error-box"]');
        if (errBox) errBox.style.display = 'none';

        let groups;
        try {
          groups = this.model.buildGroups(
            (ref) => this._getColumnValues(ref),
            (ref) => this._getColumnName(ref),
            this._errMsgs()
          );
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

        const placeholder = module._container.querySelector('[data-ref="placeholder"]');
        const chartCard = module._container.querySelector('[data-ref="chart-card"]');
        const plotEl = module._container.querySelector('[data-ref="plot"]');
        if (placeholder) placeholder.style.display = 'none';
        if (chartCard) chartCard.style.display = '';

        this._destroyChart();
        if (plotEl) plotEl.replaceChildren();

        const gen = ++this._renderGen;
        try {
          const chart = await module._context.chartManager.create(plotEl, 'individual-value-plot', {
            title: _t('chartTitle'),
            xLabel: '',
            yLabel: _t('yLabel'),
            showLegend: groups.length > 1,
            showXTicks: false,
            showMean: this.model.showMean,
            showMedian: this.model.showMedian,
            connectMeans: this.model.connectMeans,
            showOverallMean: this.model.showOverallMean,
            jitter: this.model.jitter,
            groups,
            pointColors: this.model.pointColors,
            pointSymbol: this.model.pointSymbol,
            pointSize: this.model.pointSize,
            refLines: this.model.refLines,
            refAreas: this.model.refAreas,
            bgColor: this.model.bgColor,
          });
          if (gen !== this._renderGen) {
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
        const panel = module._container?.querySelector('[data-ref="stats-panel"]');
        if (!panel) return;

        if (!this.model.showStats || !this._lastGroups) {
          panel.style.display = 'none';
          panel.replaceChildren();
          return;
        }

        const series = this._lastGroups.map((g, i) => ({
          name: g.name,
          values: g.values,
          color: (this.model.pointColors[i] || CHART_COLORS[i % CHART_COLORS.length]),
          visible: true,
        }));
        const confLevel = this._resolveConfLevel();
        const seriesStats = computeSeriesStats(series, confLevel / 100);
        renderStatsTable(panel, seriesStats, {
          i18n: module._context.i18n,
          confLevel,
        });
      },

      _destroyChart() {
        if (this._chart) {
          try { module._context.chartManager.destroy(this._chart); } catch { /* ignore */ }
          this._chart = null;
        }
      },

      // ── Lifecycle (per Alpine component) ──────────────────────

      init() {
        this._unsubs = [];
        this._resolveConfLevel();

        this._mountPicker();

        const eb = module._context.eventBus;
        const onActivated = ({ instanceId }) => {
          if (instanceId === module._context.instanceId) {
            this._picker?.refresh();
          }
        };
        eb.on('module:activated', onActivated);
        this._unsubs.push(() => eb.off('module:activated', onActivated));

        const onTheme = () => {
          if (this.model.seriesRefs.length > 0) {
            this._autoPlot();
          }
        };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));

        // Render from restored state.
        this._autoPlot();
      },

      destroy() {
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        this._destroyPicker();
        this._destroyChart();
      },
    };
  },
});

/**
 * Custom loadExample: individual-value-plot catalog examples ship a full
 * worksheet (`sourceWorksheetData`) and use the literal placeholder `__source__`
 * as the column-ref instanceId. On load we provision a fresh worksheet, rewrite
 * the placeholder across seriesRefs and every grouping leg, then apply state.
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = async function loadExample(payload) {
  if (!payload || !payload.data) return;
  const ctx = this._context;
  const t = (key) => ctx.i18n.t(key);

  const current = this.getState();
  const currentModel = current ? State.fromJSON(current) : null;
  if (currentModel?.hasContent() && ctx?.confirmPopout) {
    const ok = await ctx.confirmPopout(t('moduleHelp.confirmOverwrite'), { danger: true });
    if (!ok) return;
  }

  const data = { ...payload.data };

  if (data.sourceWorksheetData) {
    const wsState = data.sourceWorksheetData;
    delete data.sourceWorksheetData;

    const prevId = currentModel?.exampleWorksheetId;
    if (prevId) removeProvisionedWorksheet(ctx, prevId);

    const ref = provisionWorksheet(ctx, wsState);
    if (ref) {
      data.exampleWorksheetId = ref.instanceId;
      const rewrite = (r) => (r && r.instanceId === '__source__') ? { ...r, instanceId: ref.instanceId } : r;
      if (Array.isArray(data.seriesRefs)) data.seriesRefs = data.seriesRefs.map(rewrite);
      if (Array.isArray(data.groupRefs)) {
        data.groupRefs = data.groupRefs.map((g) => Array.isArray(g) ? g.map(rewrite) : rewrite(g));
      }
    }
  }

  this.setState(data);
  ctx.stateManager.setModuleState(ctx.instanceId, this.getState());

  const lang = ctx.i18n.getLanguage();
  const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
  ctx.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
};

export default mod;
