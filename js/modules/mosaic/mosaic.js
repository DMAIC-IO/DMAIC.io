/**
 * D.Mike — Mosaic Chart Module (mosaic.js)
 * Data phase: mosaic plot of two categorical variables.
 *
 * The plot is divided into one column per X-level. Column WIDTH is
 * proportional to the marginal count of that X-level; within a column,
 * the height of each G-segment is proportional to P(G | X).
 *
 * Both slots are required — without two categorical columns, a mosaic
 * is undefined.
 *
 * Migrated to createModule + Alpine CSP. The Model (`mosaic-model.js`) holds
 * only the persisted inputs (xRef/gRef, the chartConfig block, the example
 * worksheet id) plus the X×G cross-tab business logic. Everything transient —
 * the DatasetPicker, the SVG chart, the declarative stats table data,
 * render generation — lives in the data-fn. The DatasetPicker and the SVG chart
 * are mounted imperatively; the stats `<table>` is rendered declaratively from
 * structured reactive data (statsRows/statsHeaders/…) in mosaic.html.
 *
 * The chart-editor the user edits (`.dmike-chart-editor`) is built INSIDE the
 * mosaic chart type and owned by the chart instance — the module mounts no
 * separate editor widget, mirroring the legacy behavior.
 */

import { createModule } from '../../core/template-module.js';
import { State } from './mosaic-model.js';

import { formatNum } from '../../core/chart/chart-core.js';
import {
  DatasetPicker,
  getColumnValues,
  getColumnName,
} from '../../ui/dataset-picker.js';
import { loadWorksheetExample, rewriteRefFields } from '../../core/examples-registry.js';
import { chartModuleLifecycle } from '../../core/chart/chart-module-base.js';

const mod = createModule({
  config: {
    id: 'mosaic',
    engine: 'alpine',
    phase: 'data',
    icon: 'bar-chart',
    version: '1.0.0',
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
              { key: 'x', label: 'X', title: i18n.t('modules.mosaic.slotX'), minCount: 1, required: true },
              { key: 'g', label: 'G', title: i18n.t('modules.mosaic.slotG'), minCount: 1, required: true },
            ],
            onChange: (datasets) => {
              const ds = datasets[0] || {};
              this.model.xRef = ds.x || null;
              this.model.gRef = ds.g || null;
              this._plot();
            },
          });

          if (this.model.xRef || this.model.gRef) {
            this._picker.value = [{ x: this.model.xRef, g: this.model.gRef }];
          }
        },
        themeMode: 'render',
        autorun: false,
        initialRender() {
          if (this.model.xRef && this.model.gRef) {
            requestAnimationFrame(() => this._plot());
          }
        },
      }),

      // ── Transient view state (not persisted) ──────────────────
      /** Last computed chart data, for the stats re-render. */
      _categories: [],
      _groups: [],

      // ── Stats table (declarative — structured reactive data) ──
      statsCorner: '',
      /** @type {Array<{name:string, color:string}>} group column headers */
      statsHeaders: [],
      statsTotalHeader: '',
      /** @type {Array<{label:string, cells:string[], total:string}>} */
      statsRows: [],
      /** @type {string[]} per-column totals */
      statsColTotals: [],
      statsGrandTotal: '',
      statsTotalLabel: '',
      statsShow: false,

      // ── Column helpers ────────────────────────────────────────

      _getColumnValues(ref) {
        return getColumnValues(module._context.stateManager, ref);
      },

      _xColumnName() {
        return this.model.xRef ? getColumnName(module._context.stateManager, this.model.xRef) : '';
      },

      _gColumnName() {
        return this.model.gRef ? getColumnName(module._context.stateManager, this.model.gRef) : '';
      },

      // ── Plot (controller — needs context + live worksheet data) ──

      async _plot() {
        const { categories, groups } = this.model.buildChartData(
          (ref) => this._getColumnValues(ref),
        );
        this._categories = categories;
        this._groups = groups;

        const chartArea = module._container?.querySelector('[data-ref="chart-area"]');
        const placeholder = module._container?.querySelector('[data-ref="placeholder"]');

        if (categories.length === 0 || groups.length === 0) {
          if (chartArea) chartArea.style.display = 'none';
          if (placeholder) placeholder.style.display = '';
          this._destroyChart();
          this._clearStats();
          return;
        }

        if (chartArea) chartArea.style.display = '';
        if (placeholder) placeholder.style.display = 'none';

        const cfg = this.model.chartConfig;
        const mosaicConfig = {
          title: cfg.title || '',
          showTitle: cfg.showTitle && Boolean(cfg.title),
          xLabel: this._xColumnName() || '',
          yLabel: '',
          categories,
          groups,
          showLegend: cfg.showLegend,
          legendTitle: this._gColumnName() || '',
          showCellLabels: cfg.showCellLabels,
          columnGap: cfg.columnGap,
          segmentGap: cfg.segmentGap,
          bgColor: cfg.bgColor,
        };

        const chartWrap = module._container.querySelector('[data-ref="chart-wrap"]');
        if (this._chart) {
          module._context.chartManager.update(this._chart, mosaicConfig);
        } else {
          const gen = ++this._renderGen;
          chartWrap.replaceChildren();
          const chart = await module._context.chartManager.create(chartWrap, 'mosaic', mosaicConfig);
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
        // Cross-tab table with row totals (per X-level) and grand total.
        // Build structured data with RAW text — x-text escapes structurally;
        // number formatting matches the legacy string output (formatNum). The
        // group-color swatch is decomposed into a structured {name, color}.
        this.statsCorner = `${this._xColumnName() || _t('statX')} \\ ${this._gColumnName() || _t('statG')}`;
        this.statsHeaders = this._groups.map((g) => ({ name: g.name, color: g.color }));
        this.statsTotalHeader = _t('statTotal');
        this.statsTotalLabel = _t('statTotal');

        const colTotals = this._groups.map(() => 0);
        let grandTotal = 0;
        const rows = [];
        for (let ci = 0; ci < this._categories.length; ci++) {
          let rowTotal = 0;
          const cellTexts = [];
          for (let gi = 0; gi < this._groups.length; gi++) {
            const v = this._groups[gi].values[ci] || 0;
            cellTexts.push(formatNum(v));
            rowTotal += v;
            colTotals[gi] += v;
          }
          grandTotal += rowTotal;
          rows.push({
            label: this._categories[ci],
            cells: cellTexts,
            total: formatNum(rowTotal),
          });
        }
        this.statsRows = rows;
        this.statsColTotals = colTotals.map((tv) => formatNum(tv));
        this.statsGrandTotal = formatNum(grandTotal);
        this.statsShow = true;
      },

      _clearStats() {
        this.statsRows = [];
        this.statsHeaders = [];
        this.statsColTotals = [];
        this.statsShow = false;
      },

    };
  },
});

/**
 * Custom loadExample: mosaic catalog examples ship a full worksheet
 * (`sourceWorksheetData`) and use the literal placeholder `__source__` as the
 * column-ref instanceId. On load we provision a fresh worksheet, rewrite the
 * placeholder across xRef / gRef, then apply state.
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadWorksheetExample(this, payload, {
    Model: State,
    rewriteRefs: rewriteRefFields(['xRef', 'gRef']),
  });
};

export default mod;
