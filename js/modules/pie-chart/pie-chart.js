/**
 * D.Mike — Pie Chart Module (pie-chart.js)
 * Data phase: pie/donut chart from worksheet columns.
 *
 * Two input modes (driven by the column slots the user fills):
 *   - value only   → frequency count per distinct value (one slice per value)
 *   - value+label  → sum of value per label              (one slice per label)
 *
 * Renders through the shared pie chart type (`pie.js` in core/chart/types).
 *
 * Migrated to createModule + Alpine CSP. The Model (`pie-chart-model.js`) holds
 * only the persisted inputs (valueRef/labelRef, the chartConfig block, the
 * example worksheet id) plus the slice-aggregation business logic. Everything
 * transient — the DatasetPicker, the SVG chart, the imperatively rendered stats
 * table, render generation — lives in the data-fn. The DatasetPicker, the SVG
 * chart and the stats `<table>` are mounted imperatively to keep the legacy DOM
 * selectors and style-based visibility toggles byte-identical for the Page
 * Object Model.
 *
 * The chart-editor the user edits (`.dmike-chart-editor`) is built INSIDE the
 * pie chart type and owned by the chart instance — the module mounts no separate
 * editor widget, mirroring the legacy behavior (it only imports `esc`).
 */

import { createModule } from '../../core/template-module.js';
import { State } from './pie-chart-model.js';

import { formatNum } from '../../core/chart/chart-core.js';
import {
  DatasetPicker,
  getColumnValues,
} from '../../ui/dataset-picker.js';
import { provisionWorksheet, removeProvisionedWorksheet } from '../../core/examples-registry.js';
import { chartModuleLifecycle } from '../../core/chart/chart-module-base.js';

const mod = createModule({
  config: {
    id: 'pie-chart',
    engine: 'alpine',
    phase: 'data',
    icon: 'pie-chart',
    version: '1.1.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      ...chartModuleLifecycle(module, {
        mountPicker() {
          const wrap = module._container.querySelector('[data-ref="picker-wrap"]');
          if (!wrap) return;
          this._picker?.destroy();

          const ctx = module._context;
          const i18n = ctx.i18n;
          this._picker = new DatasetPicker(wrap, ctx, {
            slots: [
              { key: 'value', label: 'V', title: i18n.t('ui.datasetPicker.slotV'), minCount: 1, required: true },
              { key: 'label', label: 'G', title: i18n.t('ui.datasetPicker.slotG'), minCount: 1, group: true },
            ],
            onChange: (datasets) => {
              const ds = datasets[0] || {};
              this.model.valueRef = ds.value || null;
              this.model.labelRef = ds.label || null;
              this._plot();
            },
          });

          if (this.model.labelRef || this.model.valueRef) {
            this._picker.value = [{ label: this.model.labelRef, value: this.model.valueRef }];
          }
        },
        themeMode: 'render',
        autorun: false,
        initialRender() {
          if (this.model.valueRef) {
            requestAnimationFrame(() => this._plot());
          }
        },
      }),

      // ── Transient view state (not persisted) ──────────────────
      /** Last computed slices, for the stats re-render. */
      _slices: [],

      // ── Stats table (declarative — structured reactive data) ──
      /** @type {Array<{color:string, name:string, value:string, pct:string}>} */
      statsRows: [],
      statsTotal: '',
      statsShow: false,

      // ── Column helpers ────────────────────────────────────────

      _getColumnValues(ref) {
        return getColumnValues(module._context.stateManager, ref);
      },

      // ── Plot (controller — needs context + live worksheet data) ──

      async _plot() {
        this._slices = this.model.buildSlices((ref) => this._getColumnValues(ref));

        const chartArea = module._container?.querySelector('[data-ref="chart-area"]');
        const placeholder = module._container?.querySelector('[data-ref="placeholder"]');

        if (this._slices.length === 0) {
          if (chartArea) chartArea.style.display = 'none';
          if (placeholder) placeholder.style.display = '';
          this._destroyChart();
          this._clearStats();
          return;
        }

        if (chartArea) chartArea.style.display = '';
        if (placeholder) placeholder.style.display = 'none';

        const cfg = this.model.chartConfig;
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

        // Guard: this async plot can be scheduled (rAF/$watch) before this
        // detached/torn-down instance's container was cleared by destroy()
        // during Dev-Tools seeding — chart-wrap is then gone. Nothing to
        // render into; bail out silently.
        const chartWrap = module._container?.querySelector('[data-ref="chart-wrap"]');
        if (!chartWrap) return;
        if (this._chart) {
          module._context.chartManager.update(this._chart, pieConfig);
        } else {
          const gen = ++this._renderGen;
          chartWrap.replaceChildren();
          const chart = await module._context.chartManager.create(chartWrap, 'pie', pieConfig);
          if (gen !== this._renderGen) {
            try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
            return;
          }
          this._chart = chart;
        }

        this._renderStats();
      },

      // ── Stats table (declarative — structured reactive data) ──

      _renderStats() {
        let total = 0;
        for (const s of this._slices) total += Math.max(0, s.value);

        // Build structured rows with RAW text — x-text escapes structurally.
        // Number formatting matches the legacy string output (formatNum /
        // toFixed(1) + '%'). The color swatch is a structured 'color' field.
        this.statsRows = this._slices.map((s) => ({
          color: s.color,
          name: s.name,
          value: formatNum(s.value),
          pct: `${total > 0 ? ((s.value / total) * 100).toFixed(1) : '0.0'  }%`,
        }));
        this.statsTotal = formatNum(total);
        this.statsShow = true;
      },

      _clearStats() {
        this.statsRows = [];
        this.statsShow = false;
      },

    };
  },
});

/**
 * Custom loadExample. Pie-chart's native state uses valueRef + labelRef.
 * Catalog examples ship a full worksheet (`sourceWorksheetData`) and use the
 * literal placeholder `__source__` as the column-ref instanceId. On load we
 * provision a fresh worksheet, rewrite the placeholder across all known column
 * refs, then translate foreign state: for examples that ship only a numeric
 * `columnRef` (process-capability, outlier-test, distribution-fit) or a
 * `defectsRef` (attribute SPC), pick the most pie-chart-appropriate field as
 * valueRef and let the module derive slices from value frequencies.
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
      if (data.labelRef)   data.labelRef   = rewrite(data.labelRef);
      if (data.valueRef)   data.valueRef   = rewrite(data.valueRef);
      if (data.columnRef)  data.columnRef  = rewrite(data.columnRef);
      if (data.colRef)     data.colRef     = rewrite(data.colRef);
      if (data.defectsRef) data.defectsRef = rewrite(data.defectsRef);
      if (data.sizeRef)    data.sizeRef    = rewrite(data.sizeRef);
    }
  }

  // Foreign-state translation: pick the most pie-chart-appropriate field as
  // valueRef. Attribute-SPC examples ship defectsRef (counts); distfit/
  // outlier-test ship columnRef (numeric values that get binned by name).
  if (!data.valueRef) {
    data.valueRef = data.defectsRef || data.columnRef || data.colRef || null;
  }

  this.setState(data);
  ctx.stateManager.setModuleState(ctx.instanceId, this.getState());

  const lang = ctx.i18n.getLanguage();
  const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
  ctx.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
};

export default mod;
