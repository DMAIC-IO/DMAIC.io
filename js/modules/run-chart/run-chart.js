/**
 * D.Mike — Run Chart Module (run-chart.js)
 *
 * Plots a numeric series over sample number with a median reference line and
 * runs four standard pattern tests (clustering, mixtures, trends, oscillation).
 *
 * Use case: quick first look at process behavior before building control
 * limits — answers "is there obvious non-randomness?"
 *
 * Migrated to createModule + Alpine CSP. The Model holds only the persisted
 * inputs (the referenced column, alpha, the example-worksheet id); the analysis
 * result (median, runs counts, the four p-values) is derived transiently in the
 * view from those inputs plus the live worksheet column values. The runs-test
 * math lives in `js/engines/run-chart-engine.js` and is reused unchanged. The
 * ColumnPicker and the SVG run chart are mounted imperatively (they are not
 * pure-template concerns).
 */

import { createModule } from '../../core/template-module.js';
import { State } from './run-chart-model.js';

import { ColumnPicker, getColumnValues, getColumnName } from '../../ui/column-picker.js';
import { computeRunChart } from '../../engines/run-chart-engine.js';
import { loadWorksheetExample, rewriteRefFields } from '../../core/examples-registry.js';
import { chartModuleLifecycle } from '../../core/chart/chart-module-base.js';

/** Default significance level (mirrors the legacy module). */
const DEFAULT_ALPHA = 0.05;

const mod = createModule({
  config: {
    id: 'run-chart',
    engine: 'alpine',
    phase: 'data',
    group: 'visualize',
    icon: 'module.run-chart',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      ...chartModuleLifecycle(module, {
        mountPicker() {
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
        themeMode: 'rerun',
        autorun: true,
        onTheme() {
          if (this.result) {
            const r = this.result;
            this.$nextTick(() => this._renderChart(
              { values: r.values, median: r.median },
              ++this._renderGen,
            ));
          }
        },
      }),

      // ── Transient view state (not persisted) ──────────────────
      /**
       * Derived analysis result for the template, or null. Shape:
       *   { median, n, runsAboutMedian, runsUpDown, flagged,
       *     values, tests: [{ id, p, obs }] }
       */
      result: null,

      // ── View transformations ──────────────────────────────────

      fmt(v) {
        return Number.isFinite(v) ? v.toFixed(4) : '–';
      },

      fmtP(p) {
        return p < 0.0001 ? '< 0.0001' : p.toFixed(4);
      },

      flaggedKpiClass() {
        const r = this.result;
        return r && r.flagged === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad';
      },

      testName(id) {
        return _t(`test_${  id}`);
      },

      testDesc(id) {
        return _t(`testDesc_${  id}`);
      },

      testStatusClass(p) {
        return p < this.model.alpha
          ? 'run-chart__test-status--bad'
          : 'run-chart__test-status--ok';
      },

      testStatusText(p) {
        return p < this.model.alpha ? _t('flagFail') : _t('flagPass');
      },

      /** @returns {boolean} true once a test is flagged — the state in which the status carries the warning icon. */
      isTestFlagged(p) {
        return p < this.model.alpha;
      },

      chartTitle() {
        const colName = getColumnName(module._context.stateManager, this.model.columnRef);
        return _t('chartTitle', { col: colName });
      },

      // ── Event handlers ─────────────────────────────────────────

      alphaChanged(event) {
        const v = parseFloat(event.target.value);
        this.model.alpha = (Number.isFinite(v) && v > 0 && v < 1) ? v : DEFAULT_ALPHA;
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
        const values = raw.filter(v => typeof v === 'number' && !isNaN(v));
        if (values.length < 3) return clear();

        const r = computeRunChart(values);
        const flagged = this.model.flaggedCount(r, this.model.alpha);

        this.result = {
          median: r.median,
          n: r.values.length,
          runsAboutMedian: r.runsAboutMedian,
          runsUpDown: r.runsUpDown,
          flagged,
          values: r.values,
          tests: [
            { id: 'clustering',  p: r.pClustering,  obs: r.runsAboutMedian },
            { id: 'mixtures',    p: r.pMixtures,    obs: r.runsAboutMedian },
            { id: 'trends',      p: r.pTrends,      obs: r.runsUpDown },
            { id: 'oscillation', p: r.pOscillation, obs: r.runsUpDown },
          ],
        };

        const gen = ++this._renderGen;
        this.$nextTick(() => this._renderChart(r, gen));
      },

      // ── SVG run chart (imperative via chartManager) ───────────

      async _renderChart(r, gen) {
        this._destroyChart();
        const plotEl = module._container.querySelector('[data-ref="plot"]');
        if (!plotEl) return;
        plotEl.replaceChildren();

        const colName = getColumnName(module._context.stateManager, this.model.columnRef);

        const chart = await module._context.chartManager.create(plotEl, 'run-chart', {
          title: '',
          xLabel: _t('xLabelSample'),
          yLabel: colName,
          showLegend: false,
          showTitle: false,
          values: r.values,
          median: r.median,
          colorBySide: true,
        });
        if (gen !== this._renderGen) {
          try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
          return;
        }
        this._chart = chart;
      },
    };
  },
});

/**
 * Custom loadExample: run-chart catalog examples ship a full worksheet
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
