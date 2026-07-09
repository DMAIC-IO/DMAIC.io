/**
 * D.Mike — Transformed I-MR Control Chart Module (transformed-imr-chart.js)
 *
 * Box-Cox-transformed I-MR for right-skewed or otherwise non-normal data.
 * Either auto-fits λ via Anderson-Darling or accepts a user-supplied value.
 * The chart is plotted on the transformed scale (where SPC limits are valid);
 * a side table shows the back-transformed limits on the original scale for
 * interpretation.
 *
 * Migrated to createModule + Alpine CSP.
 *
 * Architecture:
 *   - Static structure (input panel, ColumnPicker anchor, lambda controls,
 *     output placeholders) lives in the Alpine template (transformed-imr-chart.html).
 *   - Dynamic output (error, stats KPI strip, chart section with header + badge,
 *     limits table) is rendered imperatively into the data-ref anchors
 *     because the POM relies on exact CSS selectors — POM-Byte-Parität.
 *   - One ColumnPicker is an imperative widget mounted in init(), disposed in destroy().
 *   - chartManager control-chart uses _renderGen stale-guard.
 *   - _unsubs collects event-bus subscriptions for cleanup.
 */

import { createModule } from '../../core/template-module.js';
import { State } from './transformed-imr-chart-model.js';
import {
  ColumnPicker, getColumnValues, getColumnName,
} from '../../ui/column-picker.js';
import { computeTransformedIMR } from '../../engines/transformed-chart-engine.js';
import { loadWorksheetExample, rewriteRefFields } from '../../core/examples-registry.js';
import { chartModuleLifecycle } from '../../core/chart/chart-module-base.js';

const mod = createModule({
  config: {
    id: 'transformed-imr-chart',
    engine: 'alpine',
    phase: 'control',
    icon: 'activity',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      ...chartModuleLifecycle(module, {
        mountPicker() {
          const wrap = module._container.querySelector('[data-ref="col-picker"]');
          if (!wrap) return;
          this._picker = new ColumnPicker(wrap, module._context, {
            mode: 'single', types: ['numeric'], minCount: 5,
            onChange: (ref) => {
              this.model.columnRef = ref;
              this._scheduleAutoRun();
            },
          });
          if (this.model.columnRef) this._picker.value = this.model.columnRef;
        },
        themeMode: 'rerun',
        autorun: true,
      }),

      // ── Transient view state (not persisted) ──────────────────
      /** KPI strip (declarative — structured cells, see _renderStats) */
      kpiCells: [],
      /** Error message (declarative — rendered via x-if/x-text in error-area) */
      errorMsg: '',
      /** Limits table rows (declarative — structured cells, see _renderLimitsTable) */
      limitRows: [],
      /** Chart sections (declarative — header markup; chart mounted imperatively
       * into the templated host via _whenAnchor). See _renderCharts. */
      /** @type {Array<{id:string, title:string, badgeText:string, badgeClass:string}>} */
      chartViews: [],

      // ── Lambda mode/manual change handlers ───────────────────

      onLambdaModeChange() {
        // model.lambdaMode already updated by x-model @change
        this._scheduleAutoRun();
      },

      onLambdaManualChange() {
        // model.lambdaManual already updated by x-model.number @change
        if (this.model.lambdaMode === 'manual') {
          this._scheduleAutoRun();
        }
      },

      // ── Analysis ─────────────────────────────────────────────

      async _runAnalysis() {
        const clear = () => {
          this._renderGen++;
          this._destroyCharts();
          this.chartViews = [];
          this.errorMsg = '';
          this.kpiCells = [];
          this.limitRows = [];
        };

        if (!this.model.columnRef) { clear(); return; }

        const sm = module._context.stateManager;
        const raw = getColumnValues(sm, this.model.columnRef);
        const values = raw.filter(v => typeof v === 'number' && !isNaN(v));

        if (values.length < 5) { clear(); return; }

        if (values.some(v => v <= 0)) {
          clear();
          this.errorMsg = _t('errPositiveOnly');
          return;
        }

        let result;
        try {
          result = computeTransformedIMR(values, {
            lambda: this.model.lambdaMode === 'manual' ? this.model.lambdaManual : undefined,
          });
        } catch (e) {
          clear();
          const key = e.message === 'errPositiveOnly' ? 'errPositiveOnly' : 'errCompute';
          this.errorMsg = _t(key, { msg: e.message });
          return;
        }

        // Sync the lambda input in auto mode so the user sees the computed value
        if (this.model.lambdaMode === 'auto') {
          this.model.lambdaManual = result.lambda;
        }

        // Clear any previous error
        this.errorMsg = '';

        this._renderStats(result, values.length);
        await this._renderCharts(result);
        this._renderLimitsTable(result);
      },

      // ── KPI strip (declarative — structured cells, RAW text; x-text escapes) ──
      //
      // The λ label is a composite plain-text string ("λ (auto)" / "λ (manual)")
      // — the tag i18n strings already include the parentheses and the original
      // markup rendered them inline within the same label text node (no separate
      // span), so we keep one label string rather than splitting into labelHint.

      _renderStats(r, total) {
        const fmt = (v) => Number.isFinite(v) ? v.toFixed(3) : '–';
        const cls = r.signalsI.length === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad';
        this.kpiCells = [
          { value: fmt(r.lambda), label: `λ ${r.lambdaAuto ? _t('lambdaAutoTag') : _t('lambdaManualTag')}`, labelHint: '', sub: _t('boxCoxLabel'), mod: '' },
          { value: fmt(r.iLimits.cl), label: 'CL (y)', labelHint: '', sub: `σ̂ = ${fmt(r.iLimits.sigma)}`, mod: '' },
          { value: r.signalsI.length, label: _t('statSignals'), labelHint: '', sub: _t('statOf', { total }), mod: cls },
        ];
      },

      // ── Chart rendering (header declarative; chart mounts into templated host) ──

      async _renderCharts(r) {
        this._destroyCharts();

        const sm = module._context.stateManager;
        const colName = getColumnName(sm, this.model.columnRef);
        const isStable = r.signalsI.length === 0;

        const gen = ++this._renderGen;

        // Declarative header markup (RAW text — x-text escapes).
        this.chartViews = [{
          id: 'i',
          title: _t('chartTitle', { col: colName, lambda: r.lambda }),
          badgeText: isStable ? _t('stable') : _t('unstable', { count: r.signalsI.length }),
          badgeClass: isStable ? 'timr__badge--stable' : 'timr__badge--unstable',
        }];

        const host = await this.whenAnchor('[data-chart-host="i"]', gen);
        if (!host) return;

        const chart = await module._context.chartManager.create(host, 'control-chart', {
          title: '',
          xLabel: _t('xLabelSample'),
          yLabel: _t('yLabel'),
          showLegend: false,
          showTitle: false,
          values: r.transformed,
          cl: r.iLimits.cl, ucl: r.iLimits.ucl, lcl: r.iLimits.lcl, sigma: r.iLimits.sigma,
          violationIndices: new Set(r.signalsI),
          usl: null, lsl: null,
          showZones: true,
        });

        if (gen !== this._renderGen) {
          // Stale render — a newer one started while awaiting
          try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
          return;
        }

        this._charts.push(chart);
      },

      // ── Limits table (declarative — structured rows, RAW text; x-text escapes) ──

      _renderLimitsTable(r) {
        const fmt = (v) => Number.isFinite(v) ? v.toFixed(3) : '–';
        this.limitRows = [
          { label: 'UCL', transformed: fmt(r.iLimits.ucl), original: fmt(r.iLimitsOriginal.ucl) },
          { label: 'CL',  transformed: fmt(r.iLimits.cl),  original: fmt(r.iLimitsOriginal.cl) },
          { label: 'LCL', transformed: fmt(r.iLimits.lcl), original: fmt(r.iLimitsOriginal.lcl) },
        ];
      },

    };
  },
});

/**
 * Custom loadExample: transformed-imr-chart examples ship a full worksheet
 * (`sourceWorksheetData`) and use the literal placeholder `__source__` as the
 * `columnRef.instanceId`. On load we provision a fresh worksheet, rewrite the
 * placeholder, then apply state (which re-runs the analysis on the new data).
 *
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
