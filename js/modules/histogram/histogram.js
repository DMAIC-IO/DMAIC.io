/**
 * D.Mike — Histogram Module (histogram.js)
 *
 * Migrated to createModule + Alpine CSP. The Alpine template (histogram.html)
 * provides the declarative SHELL: split layout, binning/options inputs (x-model),
 * the DatasetPicker anchor and the output area with every [data-ref] anchor.
 *
 * Draws through context.chartManager (chart type `histogram`, series path);
 * model <-> chart config mapping lives in histogram-chart-config.js. The module
 * keeps the DatasetPicker, the statistics table and the shell inputs. The
 * framework destroys+remounts the Alpine tree on setState/onLanguageChange,
 * re-running init() so the widgets rebuild.
 *
 * Persistence state lives in histogram-model.js.
 */

import { createModule } from '../../core/template-module.js';
import { State } from './histogram-model.js';

import { edCheckboxRow } from '../../core/chart/chart-editor.js';
import { buildChartConfig, copyBack } from './histogram-chart-config.js';

import { DatasetPicker, getColumnValues, getColumnName } from '../../ui/dataset-picker.js';
import { computeSeriesStats, renderStatsTable } from '../../core/stats-panel.js';
import { CHART_COLORS_RGBA, BORDER_COLORS } from '../../core/chart/chart-colors.js';
import {
  provisionWorksheet, removeProvisionedWorksheet, csvPayloadToWorksheetState,
} from '../../core/examples-registry.js';

/**
 * Alpine data function of the histogram module (exported for unit tests).
 * @param {object} module - the createModule instance
 * @param {function} _t - template i18n function
 * @returns {object}
 */
export function histogramData(module, _t) {
  /** Module-scoped i18n for `modules.histogram.<key>` (with params). */
  const t = (k, v) => module._context.i18n.t(`modules.histogram.${k}`, v);

  /** Live chart of this instance (kept out of Alpine's reactive proxy). */
  let chart = null;
  /** Automatic labels of the last config (copyBack compares against them). */
  let auto = { title: '', xLabel: '', yLabel: '' };

  return {
    // ── Input mirror values (kept in sync with model in init) ──
    binWidthInput: '',
    confLevelInput: '95',

    // ── Transient render state (never persisted) ──────────────
    _picker: null,
    _seriesData: null,
    _unsubs: [],
    _plotting: false,
    _errorTimer: null,
    _exampleWorksheetId: null,
    _renderGen: 0,
    // Per Alpine instance (the closure is shared across remounts): set by destroy(),
    // checked by every async path so a destroyed instance never draws.
    _destroyed: false,
    _rafId: 0,

    ctx() { return module._container; },

    // ── Column helpers ────────────────────────────────────────
    _getColumnValues(ref) { return getColumnValues(module._context?.stateManager, ref); },
    _getColumnName(ref) { return getColumnName(module._context?.stateManager, ref); },

    // ── Input handlers (bin mode / width / conf level) ────────
    binModeChanged() {
      if (this.model.binMode === 'auto') {
        this.model.binWidth = null;
        this.binWidthInput = '';
      }
      this._autoPlot();
    },
    binWidthChanged(event) {
      const v = parseFloat(event.target.value);
      this.model.binWidth = (v > 0) ? v : null;
      this.binWidthInput = this.model.binWidth != null ? String(this.model.binWidth) : '';
      this._autoPlot();
    },
    confLevelChanged(event) {
      const v = parseFloat(event.target.value);
      if (v > 0 && v < 100) this.model.confLevel = v;
      this.confLevelInput = String(this.model.confLevel);
      this._renderStats();
    },

    // ── Picker ────────────────────────────────────────────────
    _createPicker() {
      const pickerWrap = module._container?.querySelector('[data-ref="picker-wrap"]');
      if (!pickerWrap) return;
      if (this._picker) { this._picker.destroy(); this._picker = null; }

      this._picker = new DatasetPicker(pickerWrap, module._context, {
        multi: true,
        colors: CHART_COLORS_RGBA,
        slots: [
          { key: 'value', label: 'V', title: module._context.i18n.t('ui.datasetPicker.slotV'), types: ['numeric'], minCount: 1, required: true },
          { key: 'group', label: 'G', title: module._context.i18n.t('ui.datasetPicker.slotG'), group: true },
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

      // Restore saved refs
      if (this.model.datasets.some(ds => ds.valueRef || ds.groupRef)) {
        this._picker.value = this.model.datasets.map(ds => ({
          value: ds.valueRef,
          group: ds.groupRef,
        }));
      }
    },

    // ── Auto-plot ─────────────────────────────────────────────
    _autoPlot() {
      if (this._destroyed) return;
      const hasData = this.model.datasets.some(d => d.valueRef);
      if (hasData) {
        this._plot();
      } else {
        this._showEmpty();
      }
    },

    /** Drop the series and chart, show the placeholder (no data / error). */
    _showEmpty() {
      this._seriesData = null;
      this._destroyChart();
      this._renderStats();
      const placeholder = module._container?.querySelector('[data-ref="placeholder"]');
      const chartArea = module._container?.querySelector('[data-ref="chart-area"]');
      if (placeholder) placeholder.style.display = '';
      if (chartArea) chartArea.style.display = 'none';
    },

    _showError(msg) {
      this._showEmpty();
      const errBox = module._container?.querySelector('[data-ref="error-box"]');
      if (errBox) {
        errBox.textContent = msg;
        errBox.style.display = 'block';
        clearTimeout(this._errorTimer);
        this._errorTimer = setTimeout(() => { errBox.style.display = 'none'; }, 4000);
      }
    },

    // ── Plot (expand datasets → seriesData) ───────────────────
    _plot() {
      if (this._destroyed || this._plotting) return;
      this._plotting = true;
      try {
        const errBox = module._container?.querySelector('[data-ref="error-box"]');
        if (errBox) errBox.style.display = 'none';

        if (this.model.datasets.length === 0) {
          this._showError(t('errNoSeries'));
          return;
        }

        const seriesData = [];
        const pushSeries = (name, values) => {
          const i = seriesData.length;
          seriesData.push({
            name, visible: true,
            fillColor: CHART_COLORS_RGBA[i % CHART_COLORS_RGBA.length],
            borderColor: BORDER_COLORS[i % BORDER_COLORS.length],
            borderWidth: 1, borderStyle: 'solid',
            pattern: '', patternColor: '', patternSolidity: 0.4,
            showNormalCurve: true, values,
          });
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
              if (!b) { b = { level: g, values: [] }; buckets.set(key, b); }
              b.values.push(v);
            }
            if (buckets.size === 0) { this._showError(t('errNoGroupLevels', { n: i + 1 })); return; }
            let hasAny = false;
            for (const b of buckets.values()) {
              if (b.values.length < 2) continue;
              pushSeries(t('groupSeriesName', { col: name, level: String(b.level) }), b.values);
              hasAny = true;
            }
            if (!hasAny) { this._showError(t('errTooFew', { col: name })); return; }
          } else {
            const values = rawVals.filter(v => v != null && typeof v === 'number' && !isNaN(v));
            if (values.length < 2) { this._showError(t('errTooFew', { col: name })); return; }
            pushSeries(name, values);
          }
        }

        if (seriesData.length === 0) {
          this._showEmpty();
          return;
        }

        const placeholder = module._container.querySelector('[data-ref="placeholder"]');
        const chartArea = module._container.querySelector('[data-ref="chart-area"]');
        if (placeholder) placeholder.style.display = 'none';
        if (chartArea) chartArea.style.display = '';

        // Apply saved series overrides
        const ovs = this.model.seriesOverrides;
        if (ovs) {
          for (let i = 0; i < seriesData.length && i < ovs.length; i++) {
            const ov = ovs[i];
            if (ov.fillColor) seriesData[i].fillColor = ov.fillColor;
            if (ov.borderColor) seriesData[i].borderColor = ov.borderColor;
            if (ov.borderWidth != null) seriesData[i].borderWidth = ov.borderWidth;
            if (ov.borderStyle) seriesData[i].borderStyle = ov.borderStyle;
            if (ov.pattern != null) seriesData[i].pattern = ov.pattern;
            if (ov.patternColor) seriesData[i].patternColor = ov.patternColor;
            if (ov.patternSolidity != null) seriesData[i].patternSolidity = ov.patternSolidity;
            if (ov.visible != null) seriesData[i].visible = ov.visible;
            if (ov.showNormalCurve != null) seriesData[i].showNormalCurve = ov.showNormalCurve;
          }
        }

        this._seriesData = seriesData;

        this._renderChart();
        this._renderStats();
      } finally {
        this._plotting = false;
      }
    },

    /** Automatic title and axis titles for the visible series. */
    _autoLabels() {
      const names = (this._seriesData || []).filter(s => s.visible !== false).map(s => s.name).join(', ');
      return { title: `${t('chartTitle')}: ${names}`, xLabel: t('xLabel'), yLabel: t('yLabel') };
    },

    /** Create the chart on first plot, update it afterwards. Stale creates are dropped. */
    async _renderChart() {
      const host = module._container?.querySelector('[data-ref="chart"]');
      if (this._destroyed || !host || !this._seriesData) return;
      auto = this._autoLabels();
      const cfg = buildChartConfig(this.model, this._seriesData, auto);
      const cm = module._context.chartManager;
      if (chart) { cm.update(chart, cfg); return; }
      const gen = ++this._renderGen;
      const created = await cm.create(host, 'histogram', {
        ...cfg,
        onEditorChange: (c) => this._onEditorChange(c),
        onEditorBuild: (inner) => this._addStatsToggle(inner),
      });
      if (this._destroyed || gen !== this._renderGen || !module._container) { if (created) cm.destroy(created); return; }
      chart = created;
      // Data or inputs changed while create was pending: draw the latest state.
      if (chart && this._seriesData) cm.update(chart, buildChartConfig(this.model, this._seriesData, (auto = this._autoLabels())));
    },

    /** Destroy the chart (error, empty data, teardown). */
    _destroyChart() {
      this._renderGen++;
      if (chart) { module._context.chartManager.destroy(chart); chart = null; }
    },

    /** Editor edit -> model (persisted by createModule), then follow-ups. */
    _onEditorChange(c) {
      copyBack(this.model, c.config, auto);
      this._seriesData = this._seriesData.map((s, i) => ({ ...s, ...c.config.series[i], values: s.values }));
      const next = this._autoLabels();
      if (next.title !== auto.title && !this.model.chartConfig.title) {
        auto = next;
        module._context.chartManager.update(c, { title: next.title });
      }
      this._renderStats();
    },

    /** Statistics-table toggle in the chart type's Display section. */
    _addStatsToggle(inner) {
      const target = inner.querySelector('[data-ed-section="display"]') || inner;
      target.appendChild(edCheckboxRow(t('showStats'), this.model.showStats, (v) => {
        this.model.showStats = v;
        this._renderStats();
      }));
    },

    // ── Statistics table ──────────────────────────────────────
    _renderStats() {
      const panel = module._container?.querySelector('[data-ref="stats-panel"]');
      if (!panel) return;
      if (!this.model.showStats || !this._seriesData) {
        panel.style.display = 'none';
        panel.replaceChildren();
        return;
      }
      const series = this._seriesData.map(s => ({ name: s.name, values: s.values, color: s.fillColor, visible: s.visible }));
      const seriesStats = computeSeriesStats(series, this.model.confLevel / 100);
      renderStatsTable(panel, seriesStats, {
        i18n: module._context.i18n, confLevel: this.model.confLevel, cssPrefix: 'dmike',
      });
    },

    // ── Lifecycle ─────────────────────────────────────────────
    init() {
      // Sync the input mirrors from the (possibly restored) model.
      this.binWidthInput = this.model.binWidth != null ? String(this.model.binWidth) : '';
      this.confLevelInput = String(this.model.confLevel);

      this._createPicker();

      const eb = module._context.eventBus;

      // Re-plot from current column refs when the worksheet data changes.
      // The DatasetPicker only refreshes its own option list and never
      // re-fires onChange, so the module must re-read values itself.
      const onData = () => this._autoPlot();
      eb.on('worksheet:dataChanged', onData);
      this._unsubs.push(() => eb.off('worksheet:dataChanged', onData));

      // Auto-plot saved datasets.
      if (this.model.datasets.some(d => d.valueRef)) {
        this._rafId = requestAnimationFrame(() => { this._rafId = 0; this._autoPlot(); });
      }
    },

    /** Chart first: a pending create sees the bumped generation and destroys its result. */
    destroy() {
      this._destroyed = true;
      if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = 0; }
      this._destroyChart();
      for (const unsub of this._unsubs) unsub();
      this._unsubs = [];
      if (this._picker) { this._picker.destroy(); this._picker = null; }
      clearTimeout(this._errorTimer);
      this._errorTimer = null;
    },
  };
}

const mod = createModule({
  config: {
    id: 'histogram',
    engine: 'alpine',
    phase: 'data',
    icon: 'module.histogram',
    version: '1.1.0',
    meta: import.meta,
  },
  Model: State,

  data: histogramData,
});

/**
 * Custom loadExample. Histogram is often a secondary module on examples that
 * store a single `columnRef`/`colRef`/`seriesRefs` (process-capability, outlier-
 * test, distribution-fit, msa) or a CSV-shape dataset. Translate those into the
 * native datasets[] shape and provision a worksheet when needed, then route
 * through setState (which rebuilds the Alpine tree + re-runs init → auto-plot).
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = async function loadExample(payload) {
  if (!payload || !payload.data) return;
  const ctx = this._context;
  const ti = (k) => ctx.i18n.t(k);

  // confirm overwrite if the live model already has content
  const current = this.getState();
  const hasContent = current && Array.isArray(current.datasets) && current.datasets.some(d => d && d.valueRef);
  if (hasContent && ctx?.dialog) {
    const ok = await ctx.dialog.confirm({ message: ti('moduleHelp.confirmOverwrite'), danger: true });
    if (!ok) return;
  }

  let data = { ...payload.data };

  // CSV-shape payload → synthesize sourceWorksheetData + columnRef.
  if (!data.sourceWorksheetData && !data.datasets && !data.columnRef && Array.isArray(data.columns)) {
    const wsState = csvPayloadToWorksheetState(data, payload.meta);
    if (wsState) {
      data = {
        sourceWorksheetData: wsState,
        columnRef: { instanceId: '__source__', sheetId: wsState.activeSheetId, columnId: 'c-0' },
      };
    }
  }

  if (data.sourceWorksheetData) {
    const wsState = data.sourceWorksheetData;
    delete data.sourceWorksheetData;
    if (this._exampleWorksheetId) {
      removeProvisionedWorksheet(ctx, this._exampleWorksheetId);
      this._exampleWorksheetId = null;
    }
    const ref = provisionWorksheet(ctx, wsState);
    if (ref) {
      this._exampleWorksheetId = ref.instanceId;
      const rewrite = (r) => (r && r.instanceId === '__source__') ? { ...r, instanceId: ref.instanceId } : r;
      if (Array.isArray(data.datasets)) {
        data.datasets = data.datasets.map(d => ({ ...d, valueRef: rewrite(d.valueRef), groupRef: rewrite(d.groupRef) }));
      }
      if (data.columnRef) data.columnRef = rewrite(data.columnRef);
      if (data.colRef) data.colRef = rewrite(data.colRef);
      if (Array.isArray(data.seriesRefs)) data.seriesRefs = data.seriesRefs.map(rewrite);
    }
  }

  // Foreign-state translation: single columnRef/colRef/first seriesRef → one dataset.
  if (!Array.isArray(data.datasets)) {
    const singleRef = data.columnRef || data.colRef
      || (Array.isArray(data.seriesRefs) ? data.seriesRefs[0] : null)
      || (Array.isArray(data.colRefsK) ? data.colRefsK[0] : null);
    if (singleRef) data.datasets = [{ valueRef: singleRef, groupRef: null }];
  }

  this.setState(data);
  ctx.stateManager.setModuleState(ctx.instanceId, this.getState());

  const lang = ctx.i18n.getLanguage();
  const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
  ctx.notify?.(ti('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
};

export default mod;
