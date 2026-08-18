/**
 * D.Mike — Rare-Event Control Chart Module (rare-event-chart.js)
 *
 * g-Chart  (count of opportunities between events)
 * t-Chart  (time between events — Nelson power transform)
 *
 * Both detect drifts in the rate of rare events (failures, accidents,
 * incidents) where Shewhart-style charts on counts/intervals fail because
 * the underlying distribution is geometric / exponential, not normal.
 *
 * Migrated to createModule + Alpine CSP. The Model holds only the persisted
 * inputs (chart type, the referenced column, the example-worksheet id); the
 * analysis result (limits, signals) is derived transiently in the view from
 * those inputs plus the live worksheet column values. The SPC math lives in
 * `js/engines/rare-event-chart-engine.js`. The ColumnPicker and the SVG
 * control chart are mounted imperatively (they are not pure-template concerns).
 */

import { createModule } from '../../core/template-module.js';
import { State } from './rare-event-chart-model.js';

import { ColumnPicker, getColumnValues, getColumnName } from '../../ui/column-picker.js';
import { computeGChart, computeTChart } from '../../engines/rare-event-chart-engine.js';
import { loadWorksheetExample, rewriteRefFields } from '../../core/examples-registry.js';
import { chartModuleLifecycle } from '../../core/chart/chart-module-base.js';

const mod = createModule({
  config: {
    id: 'rare-event-chart',
    engine: 'alpine',
    phase: 'control',
    icon: 'module.rare-event-chart',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      ...chartModuleLifecycle(module, {
        mountPicker() { this._mountPicker(); },
        themeMode: 'rerun',
        autorun: true,
        onTheme() {
          if (this.result) {
            this.$nextTick(() => this._renderChart(this.result, ++this._renderGen));
          }
        },
      }),

      // ── Transient view state (not persisted) ──────────────────
      /**
       * Derived analysis result for the template, or null. Shape:
       *   { cl, ucl, lcl, sigma, n, signals, transformedNote,
       *     chartValues, chartCl, chartUcl, chartLcl, chartSigma, yLabel }
       * KPI fields (cl/ucl/lcl) use the ORIGINAL scale for t-charts;
       * the chart* fields use the (possibly transformed) plotting scale.
       */
      result: null,

      // ── View transformations ──────────────────────────────────

      fmt(v) {
        return Number.isFinite(v) ? v.toFixed(3) : '–';
      },

      signalsClass() {
        const r = this.result;
        return r && r.signals === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad';
      },

      chartTitle() {
        const colName = getColumnName(module._context.stateManager, this.model.columnRef);
        return _t(`chartTitle_${  this.model.chartTypeId}`, { col: colName });
      },

      isStable() {
        return Boolean(this.result) && this.result.signals === 0;
      },

      badgeClass() {
        return this.isStable() ? 'rec__badge--stable' : 'rec__badge--unstable';
      },

      badgeText() {
        const r = this.result;
        if (!r) return '';
        return r.signals === 0 ? _t('stable') : _t('unstable', { count: r.signals });
      },

      // ── Event handlers ─────────────────────────────────────────

      chartTypeChanged() {
        // The column picker is type-agnostic; rebuild it so a fresh selection
        // is required (matches legacy re-render-on-type-change behaviour).
        this._mountPicker();
        this._scheduleAutoRun();
      },

      // ── Analysis (controller — needs context + live worksheet data) ──

      _runAnalysis() {
        const clear = () => {
          this._destroyChart();
          this.result = null;
        };

        if (!this.model.columnRef) return clear();

        const raw = getColumnValues(module._context.stateManager, this.model.columnRef);
        const valid = raw.filter(v => typeof v === 'number' && !isNaN(v));
        const minPositive = (this.model.chartTypeId === 't')
          ? valid.filter(v => v > 0).length
          : valid.length;
        if (minPositive < 2) return clear();

        let result;
        if (this.model.chartTypeId === 'g') {
          const r = computeGChart(valid);
          const signals = this.model.countSignals(r.values, r.ucl, r.lcl);
          result = {
            cl: r.cl, ucl: r.ucl, lcl: r.lcl, sigma: r.sigma,
            n: valid.length, signals, transformedNote: false,
            chartValues: r.values, chartCl: r.cl, chartUcl: r.ucl,
            chartLcl: r.lcl, chartSigma: r.sigma,
            yLabel: _t('yLabel_g'),
          };
        } else {
          const r = computeTChart(valid);
          const transformedVals = r.transformed.filter(v => v !== null);
          const signals = this.model.countSignals(r.transformed, r.ucl, r.lcl);
          result = {
            cl: r.clOriginal, ucl: r.uclOriginal, lcl: r.lclOriginal, sigma: r.sigma,
            n: transformedVals.length, signals, transformedNote: true,
            chartValues: r.transformed, chartCl: r.cl, chartUcl: r.ucl,
            chartLcl: r.lcl, chartSigma: r.sigma,
            yLabel: _t('yLabel_t'),
          };
        }

        this.result = result;

        const gen = ++this._renderGen;
        this.$nextTick(() => this._renderChart(result, gen));
      },

      // ── SVG control chart (imperative via chartManager) ───────

      async _renderChart(result, gen) {
        this._destroyChart();
        const plotEl = module._container.querySelector('[data-ref="plot"]');
        if (!plotEl) return;
        plotEl.replaceChildren();

        // Out-of-limit points get the standard red marker.
        const violationIndices = new Set();
        const values = result.chartValues;
        for (let i = 0; i < values.length; i++) {
          const v = values[i];
          if (v == null) continue;
          if (v > result.chartUcl || v < result.chartLcl) violationIndices.add(i);
        }

        const chart = await module._context.chartManager.create(plotEl, 'control-chart', {
          title: '',
          xLabel: _t('xLabelSample'),
          yLabel: result.yLabel,
          showLegend: false,
          showTitle: false,
          values,
          cl: result.chartCl,
          ucl: result.chartUcl,
          lcl: result.chartLcl,
          sigma: result.chartSigma,
          violationIndices,
          usl: null, lsl: null,
          // Zone bands assume normal — disable for rare-event charts (they make
          // the geometric/exponential case look misleadingly Gaussian).
          showZones: false,
        });
        if (gen !== this._renderGen) {
          try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
          return;
        }
        this._chart = chart;
      },

      // ── ColumnPicker (imperative widget) ──────────────────────

      _mountPicker() {
        const wrap = module._container.querySelector('[data-ref="col-picker-wrap"]');
        if (!wrap) return;
        this._picker?.destroy();
        this._picker = new ColumnPicker(wrap, module._context, {
          mode: 'single',
          types: ['numeric'],
          minCount: 2,
          onChange: (ref) => {
            this.model.columnRef = ref;
            this._scheduleAutoRun();
          },
        });
        if (this.model.columnRef) this._picker.value = this.model.columnRef;
      },
    };
  },
});

/**
 * Custom loadExample: rare-event-chart examples ship a full worksheet
 * (`sourceWorksheetData`) and use the literal placeholder `__source__` as the
 * `columnRef` instanceId. On load we provision a fresh worksheet, rewrite the
 * placeholder, then apply state (which re-runs the analysis on the new data).
 * This replaces the generic createModule loadExample because of the worksheet
 * provisioning the generic helper cannot perform.
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadWorksheetExample(this, payload, {
    Model: State,
    rewriteRefs: rewriteRefFields(['columnRef']),
  });
};

export default mod;
