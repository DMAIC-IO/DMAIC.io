/**
 * D.Mike — XY-Plot Module (xy-plot.js)
 * Data phase: scatter/line plot of worksheet columns.
 * Each dataset has its own X and Y column — datasets need not share X data.
 * Optional Size slot turns the dataset into a bubble plot (third numeric column
 * sqrt-mapped to 6–28 px marker diameter so area stays proportional to value).
 * Uses the SVG chart framework (chartManager) for rendering.
 * Includes editor panel for series customization (connect line), reference
 * lines/areas (chart-type owned).
 *
 * Migrated to createModule + Alpine CSP.
 * Architecture:
 *   - Static structure (input panel, placeholder, plot wrap, stats) lives in
 *     the Alpine template (xy-plot.html).
 *   - DatasetPicker, chart, and stats table are rendered imperatively.
 *   - DatasetPicker mounted in init(), disposed in destroy().
 *   - chartManager uses a _renderGen stale-guard.
 *   - _unsubs collects event-bus subscriptions for cleanup.
 *   - getState() syncs chart-editor changes back to the model before
 *     serialising (refLines/refAreas/bgColor/seriesOverrides).
 */

import { createModule } from '../../core/template-module.js';
import Alpine from '@alpinejs/csp';
import { State } from './xy-plot-model.js';
import {
  edCheckboxRow, edSelectRow,
  edColorPair, edExpandBtn,
  openColorPicker,
} from '../../core/chart/chart-editor.js';
import {
  DatasetPicker,
  getColumnValues, getColumnName,
} from '../../ui/dataset-picker.js';
import { computeSeriesStats, renderStatsTable } from '../../core/stats-panel.js';
import { CHART_COLORS } from '../../core/chart/chart-colors.js';
import { provisionWorksheet, removeProvisionedWorksheet } from '../../core/examples-registry.js';

const mod = createModule({
  config: {
    id: 'xy-plot',
    engine: 'alpine',
    phase: 'data',
    icon: 'module.xy-plot',
    version: '1.4.0',
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
      /** Last series array passed to the chart (for _renderStats). */
      _lastSeries: null,
      /** Stale-render guard counter */
      _renderGen: 0,
      /** @type {object|null} — active color picker popup */
      _activeColorPicker: null,
      /** @type {Array} — unsub functions for event-bus listeners */
      _unsubs: [],

      // ── Column helpers ────────────────────────────────────────

      _getColumnValues(ref) {
        return getColumnValues(module._context.stateManager, ref);
      },

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
            { key: 'x', label: 'X', title: module._context.i18n.t('ui.datasetPicker.slotX'), types: ['numeric'], minCount: 1, required: true },
            { key: 'y', label: 'Y', title: module._context.i18n.t('ui.datasetPicker.slotY'), types: ['numeric'], minCount: 1, required: true },
            { key: 'group', label: 'G', title: module._context.i18n.t('ui.datasetPicker.slotG'), group: true },
            { key: 'size', label: 'S', title: module._context.i18n.t('ui.datasetPicker.slotS'), types: ['numeric'], minCount: 1 },
          ],
          onChange: (datasets) => {
            this.model.datasets = datasets.map(ds => ({
              xRef: ds.x || null,
              yRef: ds.y || null,
              groupRef: ds.group || null,
              sizeRef: ds.size || null,
            }));
            // Series count may change — drop stale overrides when structure changes.
            this.model.seriesOverrides = [];
            this._plot();
          },
        });

        // Restore saved refs
        if (this.model.datasets.some(ds => ds.xRef || ds.yRef || ds.groupRef || ds.sizeRef)) {
          this._picker.value = this.model.datasets.map(ds => ({
            x: ds.xRef,
            y: ds.yRef,
            group: ds.groupRef,
            size: ds.sizeRef,
          }));
        }
      },

      _refreshPicker() {
        this._picker?.refresh?.();
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

      // ── Placeholder ───────────────────────────────────────────

      _showPlaceholder() {
        const placeholder = module._container.querySelector('[data-ref="placeholder"]');
        const plotEl = module._container.querySelector('[data-ref="plot"]');
        if (placeholder) placeholder.style.display = '';
        if (plotEl) {
          plotEl.style.display = 'none';
          plotEl.replaceChildren();
        }
        this._destroyChart();
      },

      // ── Chart cleanup ─────────────────────────────────────────

      _destroyChart() {
        this._closeCp();
        if (this._chart) {
          module._context.chartManager.destroy(this._chart);
          this._chart = null;
        }
      },

      _closeCp() {
        if (this._activeColorPicker) {
          this._activeColorPicker.close();
          this._activeColorPicker = null;
        }
      },

      /**
       * Sync chart-editor changes (refLines/refAreas/bgColor + series visual
       * overrides) back to the model before serialising.
       */
      _syncFromChart() {
        if (this._chart && this._chart.config) {
          this.model.refLines = this._chart.config.refLines || this.model.refLines;
          this.model.refAreas = this._chart.config.refAreas || this.model.refAreas;
          if (this._chart.config.bgColor != null) {
            this.model.bgColor = this._chart.config.bgColor;
          }
        }
      },

      // ── Bubble helper (delegates to model) ────────────────────

      _buildBubble(rawSizes, label) {
        return State.buildBubble(rawSizes, label);
      },

      // ── Plot ──────────────────────────────────────────────────

      async _plot() {
        if (this._plotting) return;
        this._plotting = true;

        const errBox = module._container.querySelector('[data-ref="error-box"]');
        if (errBox) errBox.style.display = 'none';

        const series = [];
        const pushSeries = (x, y, name, bubble) => {
          const seriesIdx = series.length;
          const defaultColor = CHART_COLORS[seriesIdx % CHART_COLORS.length];
          const ovr = this.model.seriesOverrides[seriesIdx] || {};
          const s = {
            name: ovr.name || name,
            color: ovr.color || defaultColor,
            stroke: ovr.stroke || 'rgba(255,255,255,1)',
            strokeWidth: ovr.strokeWidth ?? 1.5,
            symbol: ovr.symbol || 'circle',
            visible: ovr.visible !== false,
            x,
            y,
            markerSize: this.model.showMarkers ? 7 : 0,
            connectLine: ovr.connectLine || {
              show: this.model.showLines,
              color: ovr.color || defaultColor,
              dash: 'solid',
              width: 2,
            },
          };
          if (bubble && this.model.showMarkers) {
            s.sizes = bubble.sizes;
            s.sizeValues = bubble.rawSizes;
            s.sizeLabel = bubble.label;
          }
          series.push(s);
        };

        let firstReadyXRef = null;
        for (let i = 0; i < this.model.datasets.length; i++) {
          const ds = this.model.datasets[i];
          // Skip incomplete datasets silently — the chart updates as the user selects columns.
          if (!ds.xRef || !ds.yRef) continue;
          if (!firstReadyXRef) firstReadyXRef = ds.xRef;

          const xVals = this._getColumnValues(ds.xRef);
          const yVals = this._getColumnValues(ds.yRef);
          const yName = this._getColumnName(ds.yRef);
          const groupVals = ds.groupRef ? this._getColumnValues(ds.groupRef) : null;
          const sizeVals = ds.sizeRef ? this._getColumnValues(ds.sizeRef) : null;
          const sizeName = ds.sizeRef ? this._getColumnName(ds.sizeRef) : '';

          if (groupVals) {
            // Split into one sub-series per unique group level (insertion order).
            const buckets = new Map();
            const len = Math.min(
              xVals.length, yVals.length, groupVals.length,
              sizeVals ? sizeVals.length : Infinity,
            );
            for (let r = 0; r < len; r++) {
              const vx = xVals[r], vy = yVals[r], vg = groupVals[r];
              if (vx == null || typeof vx !== 'number' || isNaN(vx)) continue;
              if (vy == null || typeof vy !== 'number' || isNaN(vy)) continue;
              if (vg == null || vg === '') continue;
              if (sizeVals) {
                const vs = sizeVals[r];
                if (typeof vs !== 'number' || isNaN(vs) || vs < 0) continue;
              }
              const key = String(vg);
              let b = buckets.get(key);
              if (!b) {
                b = { level: vg, x: [], y: [], rawSizes: sizeVals ? [] : null };
                buckets.set(key, b);
              }
              b.x.push(vx);
              b.y.push(vy);
              if (sizeVals) b.rawSizes.push(sizeVals[r]);
            }

            if (buckets.size === 0) {
              this._showError(_t('errNoGroupLevels', { n: i + 1 }));
              this._plotting = false;
              return;
            }

            let hasAny = false;
            for (const b of buckets.values()) {
              if (b.x.length < 2) continue;
              const bubble = b.rawSizes ? this._buildBubble(b.rawSizes, sizeName) : null;
              pushSeries(b.x, b.y, _t('groupSeriesName', { y: yName, level: String(b.level) }), bubble);
              hasAny = true;
            }
            if (!hasAny) {
              this._showError(_t('errTooFew', { col: yName }));
              this._plotting = false;
              return;
            }
          } else {
            const x = [], y = [], rawSizes = sizeVals ? [] : null;
            const len = Math.min(
              xVals.length, yVals.length,
              sizeVals ? sizeVals.length : Infinity,
            );
            for (let r = 0; r < len; r++) {
              const vx = xVals[r], vy = yVals[r];
              if (vx == null || typeof vx !== 'number' || isNaN(vx)) continue;
              if (vy == null || typeof vy !== 'number' || isNaN(vy)) continue;
              if (sizeVals) {
                const vs = sizeVals[r];
                if (typeof vs !== 'number' || isNaN(vs) || vs < 0) continue;
                rawSizes.push(vs);
              }
              x.push(vx);
              y.push(vy);
            }

            if (x.length < 2) {
              this._showError(_t('errTooFew', { col: yName }));
              this._plotting = false;
              return;
            }

            const bubble = rawSizes ? this._buildBubble(rawSizes, sizeName) : null;
            pushSeries(x, y, yName, bubble);
          }
        }

        if (series.length === 0) {
          // Nothing ready to plot yet — fall back to placeholder.
          this._showPlaceholder();
          this._lastSeries = null;
          this._renderStats();
          this._plotting = false;
          return;
        }

        const placeholder = module._container.querySelector('[data-ref="placeholder"]');
        const plotEl = module._container.querySelector('[data-ref="plot"]');
        if (placeholder) placeholder.style.display = 'none';
        if (plotEl) plotEl.style.display = '';

        this._destroyChart();
        if (plotEl) plotEl.replaceChildren();

        // Use the first ready dataset's X column name as default x label
        const xLabel = this._getColumnName(firstReadyXRef);

        const gen = ++this._renderGen;

        try {
          const chart = await module._context.chartManager.create(plotEl, 'scatter', {
            title: '',
            xLabel,
            yLabel: '',
            showLegend: module._context.stateManager.get('settings.chartShowLegend') !== false,
            series,
            refLines: this.model.refLines,
            refAreas: this.model.refAreas,
            ...(this.model.bgColor ? { bgColor: this.model.bgColor } : {}),
            onSeriesChange: (idx, key, value) => {
              this._syncSeriesOverride(idx, key, value);
            },
            onEditorBuild: (editorInner, t, onUpdate, seriesItemEls) => {
              this._appendSeriesDetails(editorInner, seriesItemEls);
            },
          });

          if (gen !== this._renderGen) {
            // Stale render — a newer one started while awaiting.
            try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
            this._plotting = false;
            return;
          }

          this._chart = chart;
        } finally {
          this._plotting = false;
        }

        this._lastSeries = series;
        this._renderStats();
      },

      // ── Stats panel ───────────────────────────────────────────

      _renderStats() {
        const panel = module._container.querySelector('[data-ref="stats-panel"]');
        if (!panel) return;

        if (!this.model.showStats || !this._lastSeries || this._lastSeries.length === 0) {
          panel.style.display = 'none';
          panel.replaceChildren();
          return;
        }

        const mapped = this._lastSeries
          .filter(s => s.visible !== false)
          .map(s => ({
            name: s.name,
            values: s.y,
            color: s.color,
            visible: true,
          }));
        const seriesStats = computeSeriesStats(mapped, this.model.confLevel / 100);
        renderStatsTable(panel, seriesStats, {
          i18n: module._context.i18n,
          confLevel: this.model.confLevel,
        });
      },

      // ── Series Detail Panels (appended to base-provided series items) ──

      _appendSeriesDetails(inner, seriesItemEls) {
        if (!seriesItemEls || !seriesItemEls.length) return;
        const t = _t;
        const chartSeries = this._chart?.config?.series || [];

        for (let idx = 0; idx < seriesItemEls.length && idx < chartSeries.length; idx++) {
          const item = seriesItemEls[idx];
          const ser = chartSeries[idx];

          const detail = document.createElement('div');
          detail.className = 'dmike-chart-ed-series-detail';

          // Marker styling (symbol, size, fill, border) is provided by scatter._buildTypeEditor.

          const cl = ser.connectLine || { show: false, color: ser.color, dash: 'solid', width: 2 };
          const clTitle = document.createElement('div');
          clTitle.className = 'dmike-chart-ed-subsection-title';
          clTitle.textContent = t('edConnectLine');
          detail.appendChild(clTitle);

          detail.appendChild(edCheckboxRow(t('edShow'), Boolean(cl.show), (v) => {
            cl.show = v;
            this._syncSeriesOverride(idx, 'connectLine', { ...cl });
            if (this._chart) this._chart.render();
          }));

          const { el: clColorRow, swatch: clSw } = edColorPair(t('edColor'), cl.color || ser.color, (e) => {
            this._closeCp();
            const p = openColorPicker(e, cl.color || ser.color, (c) => {
              cl.color = c;
              clSw.style.background = c;
              this._syncSeriesOverride(idx, 'connectLine', { ...cl });
              if (this._chart) this._chart.render();
            });
            this._activeColorPicker = p;
          });
          detail.appendChild(clColorRow);

          detail.appendChild(edSelectRow(t('edLineStyle'), [
            { value: 'solid', label: 'Solid' }, { value: 'dash', label: 'Dash' },
            { value: 'dot', label: 'Dot' }, { value: 'dashdot', label: 'Dash-Dot' },
            { value: 'longdash', label: 'Long dash' },
          ], cl.dash || 'solid', (v) => {
            cl.dash = v;
            this._syncSeriesOverride(idx, 'connectLine', { ...cl });
            if (this._chart) this._chart.render();
          }));

          item.appendChild(detail);
          item.appendChild(edExpandBtn(t('edDetails'), detail));
        }
      },

      _syncSeriesOverride(idx, key, value) {
        while (this.model.seriesOverrides.length <= idx) this.model.seriesOverrides.push({});
        this.model.seriesOverrides[idx][key] = value;
      },

      // ── Alpine component lifecycle ────────────────────────────

      init() {
        // Fresh per-instance transient collections
        this._chart = null;
        this._plotting = false;
        this._lastSeries = null;
        this._renderGen = 0;
        this._activeColorPicker = null;
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
          if (this._lastSeries) {
            this._destroyChart();
            this._plot();
          }
        };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));

        // Trigger initial plot from restored state
        this._plot();
      },

      destroy() {
        this._closeCp();
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
 * Custom loadExample: xy-plot examples ship a full worksheet
 * (`sourceWorksheetData`, resolved from `sourceWorksheetFile` by the
 * examples-registry) and use the literal placeholder `__source__` as
 * dataset/columnRef instanceIds. On load we provision a fresh worksheet,
 * rewrite the placeholders, then apply state (which re-runs the plot on the
 * new data).
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
          xRef: rewrite(d.xRef),
          yRef: rewrite(d.yRef),
          groupRef: rewrite(d.groupRef),
          sizeRef: rewrite(d.sizeRef),
        }));
      }
    }
  }

  this.setState(data);
  ctx.stateManager.setModuleState(ctx.instanceId, this.getState());

  const lang = ctx.i18n.getLanguage();
  const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
  ctx.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
};

/**
 * Override getState to sync chart-editor changes before serialising, so any
 * editor modifications (refLines, refAreas, bgColor) are captured when state
 * is persisted. Series overrides are kept in sync live via onSeriesChange.
 */
const _origGetState = mod.getState.bind(mod);
mod.getState = function getState() {
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
