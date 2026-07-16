/**
 * D.Mike — Bar Chart Module (bar.js)
 * Data phase: bar chart from worksheet columns.
 *
 * Three input modes (driven by the column slots the user fills):
 *   - X only            → frequency count per category (single series)
 *   - X + Y             → mean/sum of Y per X-level     (single series)
 *   - X + G             → cross-tab count               (one series per G-level)
 *   - X + Y + G         → mean/sum of Y per (X, G)      (one series per G-level)
 *
 * Renders through the shared bar chart type (`bar.js` in core/chart/types).
 *
 * Migrated to createModule + Alpine CSP. The Model (`bar-model.js`) holds only
 * the persisted inputs (xRef/yRef/gRef, the chartConfig block incl. the
 * aggregation mode and stacked flag, the example worksheet id) plus the
 * aggregation/grouping cross-tab business logic. Everything transient — the
 * DatasetPicker, the SVG chart, the imperatively rendered stats table, render
 * generation — lives in the data-fn. The DatasetPicker, the SVG chart and the
 * stats `<table>` are mounted imperatively to keep the legacy DOM selectors and
 * style-based visibility toggles byte-identical for the Page Object Model.
 *
 * The chart-editor the user edits (`.dmike-chart-editor`) is built INSIDE the
 * bar chart type and owned by the chart instance — the module mounts no separate
 * editor widget, mirroring the legacy behavior (it only imports `esc`).
 */

import { createModule } from '../../core/template-module.js';
import { State } from './bar-model.js';

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
    id: 'bar',
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
              { key: 'x', label: 'X', title: i18n.t('modules.bar.slotX'), minCount: 1, required: true },
              { key: 'y', label: 'Y', title: i18n.t('modules.bar.slotY'), types: ['numeric', 'currency', 'percent'], minCount: 1 },
              { key: 'g', label: 'G', title: i18n.t('modules.bar.slotG'), group: true },
            ],
            onChange: (datasets) => {
              const ds = datasets[0] || {};
              this.model.xRef = ds.x || null;
              this.model.yRef = ds.y || null;
              this.model.gRef = ds.g || null;
              this._plot();
            },
          });

          if (this.model.xRef || this.model.yRef || this.model.gRef) {
            this._picker.value = [{ x: this.model.xRef, y: this.model.yRef, g: this.model.gRef }];
          }
        },
        themeMode: 'render',
        autorun: false,
        initialRender() {
          if (this.model.xRef) {
            requestAnimationFrame(() => this._plot());
          }
        },
      }),

      // ── Transient view state (not persisted) ──────────────────
      /** Last computed chart data, for the stats re-render. */
      _categories: [],
      _groups: [],

      // ── Stats table (declarative — structured reactive data) ──
      statsValueHeader: '',
      statsGroupHeader: '',
      statsShowGroupCol: false,
      /** @type {Array<{color:string, name:string, group:string, value:string}>} */
      statsRows: [],
      statsTotalLabel: '',
      statsTotal: '',
      statsShowTotal: false,
      statsShow: false,

      // ── Column helpers ────────────────────────────────────────

      _getColumnValues(ref) {
        return getColumnValues(module._context.stateManager, ref);
      },

      _xColumnName() {
        return this.model.xRef ? getColumnName(module._context.stateManager, this.model.xRef) : '';
      },

      _yColumnName() {
        return this.model.yRef ? getColumnName(module._context.stateManager, this.model.yRef) : '';
      },

      _gColumnName() {
        return this.model.gRef ? getColumnName(module._context.stateManager, this.model.gRef) : '';
      },

      // ── Option handlers (data-shape switches) ─────────────────

      aggregationChanged() {
        // x-model already wrote model.chartConfig.aggregation; normalize + replot.
        this.model.chartConfig.aggregation =
          this.model.chartConfig.aggregation === 'sum' ? 'sum' : 'mean';
        this._plot();
      },

      stackedChanged() {
        this.model.chartConfig.stacked = Boolean(this.model.chartConfig.stacked);
        this._plot();
      },

      // ── Plot (controller — needs context + live worksheet data) ──

      async _plot() {
        const cfg = this.model.chartConfig;
        const { categories, groups } = this.model.buildChartData(
          (ref) => this._getColumnValues(ref),
          {
            aggregation: cfg.aggregation,
            xColumnName: this._xColumnName() || '',
            yColumnName: this._yColumnName() || '',
          },
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

        const xLabel = cfg.xLabel || this._xColumnName() || '';
        let yLabel = cfg.yLabel;
        if (!yLabel) {
          if (this.model.yRef) {
            yLabel = `${cfg.aggregation === 'sum' ? _t('axisSumOf') : _t('axisMeanOf')  } ${  this._yColumnName() || ''}`;
          } else {
            yLabel = _t('axisCount');
          }
        }

        const showLegend = cfg.showLegend && Boolean(this.model.gRef);
        const legendTitle = this.model.gRef ? this._gColumnName() : '';

        const barConfig = {
          title: cfg.title || '',
          showTitle: cfg.showTitle && Boolean(cfg.title),
          titleSize: cfg.titleSize,
          xLabel,
          yLabel,
          categories,
          groups,
          stacked: cfg.stacked,
          barGap: cfg.barGap,
          categoryGap: cfg.categoryGap,
          showLegend,
          legendTitle,
          bgColor: cfg.bgColor,
        };

        const chartWrap = module._container.querySelector('[data-ref="chart-wrap"]');
        if (this._chart) {
          module._context.chartManager.update(this._chart, barConfig);
        } else {
          const gen = ++this._renderGen;
          chartWrap.replaceChildren();
          const chart = await module._context.chartManager.create(chartWrap, 'bar', barConfig);
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
        const isFreq = !this.model.yRef;
        this.statsValueHeader = isFreq
          ? _t('statCount')
          : (this.model.chartConfig.aggregation === 'sum' ? _t('statSum') : _t('statMean'));

        const showGroupCol = Boolean(this.model.gRef);
        this.statsShowGroupCol = showGroupCol;
        this.statsGroupHeader = _t('statGroup');

        // Build structured rows with RAW text — x-text escapes structurally.
        // Number formatting matches the legacy string output (formatNum). The
        // per-row color swatch is decomposed into a structured 'color' field.
        const rows = [];
        let total = 0;
        for (const g of this._groups) {
          for (let ci = 0; ci < this._categories.length; ci++) {
            const v = g.values[ci] || 0;
            if (isFreq) total += v;
            rows.push({
              color: g.color,
              name: this._categories[ci],
              group: g.name,
              value: formatNum(v),
            });
          }
        }
        this.statsRows = rows;
        this.statsTotalLabel = _t('statTotal');
        this.statsTotal = formatNum(total);
        this.statsShowTotal = isFreq;
        this.statsShow = true;
      },

      _clearStats() {
        this.statsRows = [];
        this.statsShowTotal = false;
        this.statsShow = false;
      },

    };
  },
});

/**
 * Custom loadExample: bar catalog examples ship a full worksheet
 * (`sourceWorksheetData`) and use the literal placeholder `__source__` as the
 * column-ref instanceId. On load we provision a fresh worksheet, rewrite the
 * placeholder across xRef / yRef / gRef, then apply state.
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadWorksheetExample(this, payload, {
    Model: State,
    rewriteRefs: rewriteRefFields(['xRef', 'yRef', 'gRef']),
  });
};

export default mod;
