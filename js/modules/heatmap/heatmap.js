/**
 * D.Mike — Heatmap Chart Module (heatmap.js)
 *
 * Data phase: heatmap / pivot grid for two categorical variables.
 *
 * Two input modes:
 *   - X + G       → frequency cross-tab (count per cell)
 *   - X + G + V   → aggregated value (mean / sum) of V per (X, G) cell
 *
 * X-slot drives the column axis, G-slot drives the row axis, V-slot is the
 * numeric value column whose aggregate fills the cells.
 *
 * Migrated to createModule + Alpine CSP. The Model (`heatmap-model.js`) holds
 * only the persisted inputs (xRef/gRef/vRef, the chartConfig block, the
 * example-worksheet id) plus the cross-tab / aggregation business logic.
 * Everything transient — the DatasetPicker, the SVG chart, the imperatively
 * rendered aggregation select and stats table, render generation — lives in the
 * data-fn. The DatasetPicker, the SVG chart, the aggregation `<select>` and the
 * stats `<table>` are mounted imperatively to keep the legacy DOM selectors and
 * style-based visibility toggles byte-identical for the Page Object Model. The
 * color-domain / normalization that drives the cell coloring lives in the
 * `heatmap` chart type, fed the raw aggregated `cells` matrix from the model.
 */

import { createModule } from '../../core/template-module.js';
import { State } from './heatmap-model.js';

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
    id: 'heatmap',
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
              { key: 'x', label: 'X', title: i18n.t('modules.heatmap.slotX'), minCount: 1, required: true },
              { key: 'g', label: 'G', title: i18n.t('modules.heatmap.slotG'), minCount: 1, required: true },
              { key: 'v', label: 'V', title: i18n.t('modules.heatmap.slotV'), types: ['numeric', 'currency', 'percent'], minCount: 1 },
            ],
            onChange: (datasets) => {
              const ds = datasets[0] || {};
              this.model.xRef = ds.x || null;
              this.model.gRef = ds.g || null;
              this.model.vRef = ds.v || null;
              this._syncOptions();
              this._plot();
            },
          });

          if (this.model.xRef || this.model.gRef || this.model.vRef) {
            this._picker.value = [{ x: this.model.xRef, g: this.model.gRef, v: this.model.vRef }];
          }

          // Preserve the original init() ordering: _mountPicker() was followed
          // immediately by _syncOptions() to seed the aggregation-options x-if.
          this._syncOptions();
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
      _xCategories: [],
      _yCategories: [],
      _cells: [],

      // ── Stats table (declarative — structured reactive data) ──
      statsCorner: '',
      /** @type {string[]} x-category column headers */
      statsHeaders: [],
      statsTotalHeader: '',
      /** @type {Array<{label:string, cells:string[], total:string}>} */
      statsRows: [],
      /** @type {string[]} per-column totals */
      statsColTotals: [],
      statsGrandTotal: '',
      statsTotalLabel: '',
      statsShowTotals: false,
      statsShow: false,

      // ── Aggregation options (declarative — shown when a V column is picked) ──
      /** Reactive mirror of `!!model.vRef` for the options `x-if`. */
      hasVRef: false,
      _syncOptions() { this.hasVRef = Boolean(this.model.vRef); },
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

      _gColumnName() {
        return this.model.gRef ? getColumnName(module._context.stateManager, this.model.gRef) : '';
      },

      _vColumnName() {
        return this.model.vRef ? getColumnName(module._context.stateManager, this.model.vRef) : '';
      },

      // ── Plot (controller — needs context + live worksheet data) ──

      async _plot() {
        const { xCategories, yCategories, cells } = this.model.buildChartData(
          (ref) => this._getColumnValues(ref),
          this.model.chartConfig.aggregation,
        );
        this._xCategories = xCategories;
        this._yCategories = yCategories;
        this._cells = cells;

        const chartArea = module._container?.querySelector('[data-ref="chart-area"]');
        const placeholder = module._container?.querySelector('[data-ref="placeholder"]');

        if (xCategories.length === 0 || yCategories.length === 0) {
          if (chartArea) chartArea.style.display = 'none';
          if (placeholder) placeholder.style.display = '';
          this._destroyChart();
          this._clearStats();
          return;
        }

        if (chartArea) chartArea.style.display = '';
        if (placeholder) placeholder.style.display = 'none';

        const cfg = this.model.chartConfig;

        // Count mode → integer cells; mean/sum → user-controlled decimals.
        const isFreq = !this.model.vRef;
        const valueDecimals = isFreq ? 0 : cfg.valueDecimals;
        const valueLabel = isFreq
          ? _t('axisCount')
          : (cfg.aggregation === 'sum' ? `${_t('axisSumOf')} ${this._vColumnName() || ''}`.trim()
                                        : `${_t('axisMeanOf')} ${this._vColumnName() || ''}`.trim());

        const heatConfig = {
          title: cfg.title || '',
          showTitle: cfg.showTitle && Boolean(cfg.title),
          xLabel: this._xColumnName() || '',
          yLabel: this._gColumnName() || '',
          xCategories,
          yCategories,
          cells,
          cellGap: cfg.cellGap,
          valueDecimals,
          valueLabel,
          showCellLabels: cfg.showCellLabels,
          colorScheme: cfg.colorScheme || 'viridis',
          bgColor: cfg.bgColor,
        };

        const chartWrap = module._container.querySelector('[data-ref="chart-wrap"]');
        if (this._chart) {
          module._context.chartManager.update(this._chart, heatConfig);
        } else {
          const gen = ++this._renderGen;
          chartWrap.replaceChildren();
          const chart = await module._context.chartManager.create(chartWrap, 'heatmap', heatConfig);
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
        const isFreq = !this.model.vRef;
        const cfg = this.model.chartConfig;
        const decimals = isFreq ? 0 : cfg.valueDecimals;
        // Totals only make sense for additive aggregations. Mean-of-means without
        // per-cell sample weights is misleading, so the Gesamt column is omitted
        // in mean mode.
        const showTotals = isFreq || cfg.aggregation === 'sum';
        const totalDecimals = isFreq ? 0 : cfg.valueDecimals;

        // Build structured data with RAW text — x-text escapes structurally.
        // Number formatting matches the legacy string output (formatNum).
        this.statsCorner = `${this._gColumnName() || _t('statG')} \\ ${this._xColumnName() || _t('statX')}`;
        this.statsHeaders = this._xCategories.slice();
        this.statsTotalHeader = _t('statTotal');
        this.statsTotalLabel = _t('statTotal');
        this.statsShowTotals = showTotals;

        const colTotals = this._xCategories.map(() => 0);
        let grandTotal = 0;
        const rows = [];
        for (let yi = 0; yi < this._yCategories.length; yi++) {
          const cellTexts = [];
          let rowTotal = 0;
          for (let xi = 0; xi < this._xCategories.length; xi++) {
            const v = this._cells[yi][xi];
            if (Number.isFinite(v)) {
              cellTexts.push(formatNum(v, decimals));
              if (showTotals) {
                rowTotal += v;
                colTotals[xi] += v;
              }
            } else {
              cellTexts.push('—');
            }
          }
          if (showTotals) grandTotal += rowTotal;
          rows.push({
            label: this._yCategories[yi],
            cells: cellTexts,
            total: showTotals ? formatNum(rowTotal, totalDecimals) : '',
          });
        }
        this.statsRows = rows;
        this.statsColTotals = showTotals ? colTotals.map((c) => formatNum(c, totalDecimals)) : [];
        this.statsGrandTotal = showTotals ? formatNum(grandTotal, totalDecimals) : '';
        this.statsShow = true;
      },

      _clearStats() {
        this.statsRows = [];
        this.statsHeaders = [];
        this.statsColTotals = [];
        this.statsShowTotals = false;
        this.statsShow = false;
      },

    };
  },
});

/**
 * Custom loadExample: heatmap catalog examples ship a full worksheet
 * (`sourceWorksheetData`) and use the literal placeholder `__source__` as the
 * column-ref instanceId. On load we provision a fresh worksheet, rewrite the
 * placeholder across xRef / gRef / vRef, then apply state.
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadWorksheetExample(this, payload, {
    Model: State,
    rewriteRefs: rewriteRefFields(['xRef', 'gRef', 'vRef']),
  });
};

export default mod;
