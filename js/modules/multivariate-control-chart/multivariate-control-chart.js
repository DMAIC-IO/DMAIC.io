/**
 * D.Mike — Multivariate Control Chart Module (multivariate-control-chart.js)
 *
 * Hotelling T² for individuals: monitors several correlated variables
 * simultaneously. Detects shifts in any one variable AND deviations from the
 * normal correlation structure (which Shewhart-on-each-variable misses).
 *
 * Migrated to createModule + Alpine CSP.
 *
 * Architecture:
 *   - Static structure (input panel, ColumnPicker anchor, output placeholders)
 *     lives in the Alpine template (multivariate-control-chart.html).
 *   - Dynamic output (chart section with header + badge) is rendered
 *     imperatively into [data-ref="chart-wrap"] because the POM relies on the
 *     exact CSS selectors (.mvcc__chart-section, .mvcc__badge--stable/--unstable)
 *     which are POM-Byte-Parität.
 *   - The KPI strip ([data-ref="stats-bar"]) and the .mvcc__error message
 *     ([data-ref="error-area"]) are declarative (x-if/x-for/x-text).
 *   - ColumnPicker is an imperative widget mounted in init(), disposed in destroy().
 *   - chartManager control-chart uses _renderGen stale-guard.
 *   - _unsubs collects event-bus subscriptions for cleanup.
 */

import { createModule } from '../../core/template-module.js';
import { State, ALPHA_DEFAULT } from './multivariate-control-chart-model.js';
import {
  ColumnPicker, getColumnValues, getColumnName,
} from '../../ui/column-picker.js';
import { computeHotellingT2 } from '../../engines/multivariate-chart-engine.js';
import { loadWorksheetExample, rewriteRefArray } from '../../core/examples-registry.js';
import { chartModuleLifecycle } from '../../core/chart/chart-module-base.js';

const mod = createModule({
  config: {
    id: 'multivariate-control-chart',
    engine: 'alpine',
    phase: 'control',
    icon: 'module.multivariate-control-chart',
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
          this._picker = new ColumnPicker(wrap, module._context, {
            mode: 'multi',
            types: ['numeric'],
            minCount: 3,
            onChange: (refs) => {
              this.model.columnRefs = Array.isArray(refs) ? refs : [];
              this._scheduleAutoRun();
            },
          });
          if (this.model.columnRefs.length) this._picker.value = this.model.columnRefs;
        },
        themeMode: 'rerun',
        autorun: true,
      }),

      // ── Transient view state (not persisted) ──────────────────
      /** KPI strip (declarative — structured cells, see _renderStats) */
      kpiCells: [],
      /** Error message (declarative — rendered via x-if/x-text in error-area) */
      errorMsg: '',
      /** Chart sections (declarative — header markup; chart mounted imperatively
       * into the templated host via _whenAnchor). See _renderChart. */
      /** @type {Array<{id:string, title:string, badgeText:string, badgeClass:string}>} */
      chartViews: [],

      // ── View helpers ──────────────────────────────────────────

      /**
       * Return the value for the baseline-count input (empty string for null).
       * Avoids Alpine CSP optional-chaining in template.
       */
      baselineCountValue() {
        return this.model.baselineCount != null ? this.model.baselineCount : '';
      },

      // ── Event handlers ────────────────────────────────────────

      baselineCountChanged(event) {
        const v = parseInt(event.target.value);
        this.model.baselineCount = isNaN(v) ? null : v;
        this._scheduleAutoRun();
      },

      alphaChanged(event) {
        const v = parseFloat(event.target.value);
        this.model.alpha = (Number.isFinite(v) && v > 0 && v < 1) ? v : ALPHA_DEFAULT;
        this._scheduleAutoRun();
      },

      // ── Analysis ─────────────────────────────────────────────

      async _runAnalysis() {
        const refs = this.model.columnRefs;
        if (!Array.isArray(refs) || refs.length < 2) {
          this._clear();
          return;
        }

        // Build data matrix; skip rows with any non-numeric entry.
        const sm = module._context.stateManager;
        const cols = refs.map(ref => getColumnValues(sm, ref));
        const len = Math.min(...cols.map(c => c.length));
        const rows = [];
        for (let i = 0; i < len; i++) {
          const r = cols.map(c => c[i]);
          if (r.every(v => typeof v === 'number' && !isNaN(v))) rows.push(r);
        }
        const p = refs.length;
        if (rows.length <= p) {
          this._showError(_t('errTooFewRows', { p }));
          return;
        }

        let result;
        try {
          result = computeHotellingT2(rows, {
            alpha: this.model.alpha,
            baselineEnd: this.model.baselineCount && this.model.baselineCount > p
              ? this.model.baselineCount
              : undefined,
          });
        } catch (e) {
          this._showError(_t('errCompute', { msg: e.message || String(e) }));
          return;
        }

        this._renderStats(result, rows.length);
        await this._renderChart(result);
      },

      // ── KPI strip (declarative — structured cells, RAW text; x-text escapes) ──

      _renderStats(r, total) {
        const fmt = (v) => Number.isFinite(v) ? v.toFixed(3) : '–';
        const cls = r.signals.length === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad';
        this.kpiCells = [
          { value: fmt(r.ucl), label: 'UCL (T²)', labelHint: '', sub: `α = ${this.model.alpha}`, mod: '' },
          { value: r.p, label: _t('statVariables'), labelHint: '', sub: _t('statBaseline', { m: r.m }), mod: '' },
          { value: r.signals.length, label: _t('statSignals'), labelHint: '', sub: _t('statOf', { total }), mod: cls },
        ];
      },

      // ── Chart rendering (header declarative; chart mounts into templated host) ──

      async _renderChart(r) {
        this._destroyChart();

        const sm = module._context.stateManager;
        const colNames = this.model.columnRefs
          .map(ref => getColumnName(sm, ref))
          .join(', ');
        const isStable = r.signals.length === 0;

        this.errorMsg = '';

        const gen = ++this._renderGen;

        // Declarative header markup (RAW text — x-text escapes).
        this.chartViews = [{
          id: 't2',
          title: _t('chartTitle', { vars: colNames }),
          badgeText: isStable ? _t('stable') : _t('unstable', { count: r.signals.length }),
          badgeClass: isStable ? 'mvcc__badge--stable' : 'mvcc__badge--unstable',
        }];

        const host = await this.whenAnchor('[data-chart-host="t2"]', gen);
        if (!host) return;

        const chart = await module._context.chartManager.create(host, 'control-chart', {
          title: '',
          xLabel: _t('xLabelSample'),
          yLabel: 'T²',
          showLegend: false,
          showTitle: false,
          values: r.t2,
          cl: r.cl,
          ucl: r.ucl,
          lcl: 0,
          sigma: 0,
          violationIndices: new Set(r.signals),
          usl: null, lsl: null,
          showZones: false,
        });

        if (gen !== this._renderGen) {
          // Stale render — newer one started while awaiting
          try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
          return;
        }

        this._chart = chart;
      },

      // ── Error / clear helpers ─────────────────────────────────

      _showError(msg) {
        this._renderGen++;
        this.kpiCells = [];
        this.errorMsg = msg;
        this.chartViews = [];
        this._destroyChart();
      },

      _clear() {
        this._renderGen++;
        this.kpiCells = [];
        this.errorMsg = '';
        this.chartViews = [];
        this._destroyChart();
      },

    };
  },
});

/**
 * Custom loadExample: multivariate-control-chart examples ship a full worksheet
 * (`sourceWorksheetData`) and use the literal placeholder `__source__` as the
 * `columnRefs[n].instanceId`. On load we provision a fresh worksheet, rewrite each
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
    rewriteRefs: rewriteRefArray('columnRefs'),
  });
};

export default mod;
