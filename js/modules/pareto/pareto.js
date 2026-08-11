/**
 * D.Mike — Pareto Chart Module (pareto.js)
 *
 * Data phase: Pareto chart from worksheet columns — a descending-sorted bar
 * chart with a cumulative-percentage line and an 80 % reference line.
 *
 * Four input modes (driven by the column slots the user fills):
 *   - X only      → frequency count per category               (items[])
 *   - X + Y       → sum (or mean) of Y per X-level             (items[])
 *   - X + G       → cross-tab count → stacked Pareto           (groups[])
 *   - X + Y + G   → sum/mean of Y per (X, G) → stacked Pareto  (groups[])
 *
 * Bars are sorted by descending total inside the chart type itself.
 *
 * Migrated to createModule + Alpine CSP. The Model (`pareto-model.js`) holds
 * only the persisted inputs (xRef/yRef/gRef, the chartConfig block, the
 * example-worksheet id) plus the Pareto aggregation + stats-row business logic.
 * Everything transient — the DatasetPicker, the SVG chart, the imperatively
 * rendered aggregation select and stats table, render generation — lives in the
 * data-fn. The DatasetPicker, the SVG chart, the aggregation `<select>` and the
 * stats `<table>` are mounted imperatively to keep the legacy DOM selectors and
 * style-based visibility toggles byte-identical for the Page Object Model.
 */

import { createModule } from '../../core/template-module.js';
import { State } from './pareto-model.js';

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
    id: 'pareto',
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
              { key: 'x', label: 'X', title: i18n.t('modules.pareto.slotX'), minCount: 1, required: true },
              { key: 'y', label: 'Y', title: i18n.t('modules.pareto.slotY'), types: ['numeric', 'currency', 'percent'], minCount: 1 },
              { key: 'g', label: 'G', title: i18n.t('modules.pareto.slotG'), group: true },
            ],
            onChange: (datasets) => {
              const ds = datasets[0] || {};
              this.model.xRef = ds.x || null;
              this.model.yRef = ds.y || null;
              this.model.gRef = ds.g || null;
              this._syncOptions();
              this._plot();
            },
          });

          if (this.model.xRef || this.model.yRef || this.model.gRef) {
            this._picker.value = [{ x: this.model.xRef, y: this.model.yRef, g: this.model.gRef }];
          }

          // Preserve the original init() ordering: _mountPicker() was followed
          // immediately by _syncOptions() to seed the aggregation-options x-if.
          this._syncOptions();
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
      _items: [],
      _categories: [],
      _groups: [],

      // ── Stats table (declarative — structured reactive data) ──
      /** @type {Array<{name:string, color:string, value:string, cumPct:string}>} */
      statsRows: [],
      statsValueHeader: '',
      statsTotal: '',
      statsShow: false,

      // ── Aggregation options (declarative — shown when a Y column is picked) ──
      /** Reactive mirror of `!!model.yRef` for the options `x-if`. */
      hasYRef: false,
      _syncOptions() { this.hasYRef = Boolean(this.model.yRef); },
      onAggregationChange() {
        // model.chartConfig.aggregation already updated by x-model @change
        this._plot();
      },

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

      // ── Plot (controller — needs context + live worksheet data) ──

      async _plot() {
        const data = this.model.buildChartData(
          (ref) => this._getColumnValues(ref),
          this.model.chartConfig.aggregation,
        );
        this._items = data.items;
        this._categories = data.categories;
        this._groups = data.groups;

        const chartArea = module._container?.querySelector('[data-ref="chart-area"]');
        const placeholder = module._container?.querySelector('[data-ref="placeholder"]');

        const hasData = (data.items.length > 0) || (data.categories.length > 0 && data.groups.length > 0);

        if (!hasData) {
          if (chartArea) chartArea.style.display = 'none';
          if (placeholder) placeholder.style.display = '';
          this._destroyChart();
          this._clearStats();
          return;
        }

        if (chartArea) chartArea.style.display = '';
        if (placeholder) placeholder.style.display = 'none';

        const cfg = this.model.chartConfig;
        const xLabel = this._xColumnName() || '';
        let yLabel;
        if (this.model.yRef) {
          yLabel = `${cfg.aggregation === 'mean' ? _t('axisMeanOf') : _t('axisSumOf')  } ${  this._yColumnName() || ''}`;
        } else {
          yLabel = _t('axisCount');
        }

        const paretoConfig = {
          title: cfg.title || '',
          showTitle: cfg.showTitle && Boolean(cfg.title),
          xLabel,
          yLabel,
          maxItems: cfg.maxItems,
          otherBucket: cfg.otherBucket,
          otherLabel: _t('otherLabel'),
          otherCountTemplate: _t('otherCountTemplate'),
          refLineValue: cfg.refLineValue,
          barOpacity: cfg.barOpacity,
          bgColor: cfg.bgColor,
          showLegend: Boolean(this.model.gRef),
          legendTitle: this.model.gRef ? (this._gColumnName() || '') : '',
        };

        if (data.items.length > 0) {
          paretoConfig.items = data.items;
        } else {
          paretoConfig.categories = data.categories;
          paretoConfig.groups = data.groups;
        }

        // Guard: this async plot can be scheduled (rAF/$watch) before this
        // detached/torn-down instance's container was cleared by destroy()
        // during Dev-Tools seeding — chart-wrap is then gone. Nothing to
        // render into; bail out silently.
        const chartWrap = module._container?.querySelector('[data-ref="chart-wrap"]');
        if (!chartWrap) return;
        if (this._chart) {
          module._context.chartManager.update(this._chart, paretoConfig);
        } else {
          const gen = ++this._renderGen;
          chartWrap.replaceChildren();
          const chart = await module._context.chartManager.create(chartWrap, 'pareto', paretoConfig);
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
          : (this.model.chartConfig.aggregation === 'mean' ? _t('statMean') : _t('statSum'));

        const { rows, grandTotal } = State.computeStatsRows({
          items: this._items,
          categories: this._categories,
          groups: this._groups,
        });

        // Build structured rows with RAW text — x-text escapes structurally.
        // Number formatting is applied here so the rendered text is identical
        // to the legacy string output (formatNum / toFixed(1) + '%').
        this.statsRows = rows.map((r) => ({
          name: r.name,
          color: r.color,
          value: formatNum(r.value),
          cumPct: `${r.cumPct.toFixed(1)  }%`,
        }));
        this.statsTotal = formatNum(grandTotal);
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
 * Custom loadExample: pareto catalog examples ship a full worksheet
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
