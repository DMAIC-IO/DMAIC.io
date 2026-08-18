/**
 * D.Mike — Time-Weighted Control Chart Module (time-weighted-chart.js)
 *
 * EWMA and CUSUM charts. Both detect small persistent shifts much earlier
 * than Shewhart charts (I-MR, X̄-R) by integrating information across points.
 *
 * Migrated to createModule + Alpine CSP.
 *
 * Architecture:
 *   - Static structure (input panel, ColumnPicker anchor, parameter inputs,
 *     output placeholders) lives in the Alpine template (time-weighted-chart.html).
 *     The chart-type and sigma-method <select>s are closed enums with STATIC
 *     <option>s (alpine.md §3). The EWMA (λ/L) and CUSUM (k/h) parameter blocks
 *     use <template x-if> so the inactive block's inputs are removed from the DOM
 *     — the POM's isParamVisible() checks element count.
 *   - Dynamic output (stats KPI strip, chart sections with header + badge) is
 *     rendered imperatively into the data-ref anchors because the POM relies on
 *     the exact CSS selectors — POM-Byte-Parität.
 *   - One ColumnPicker is an imperative widget mounted in init(), disposed in destroy().
 *   - chartManager control-charts use a _renderGen stale-guard.
 *   - _unsubs collects event-bus subscriptions for cleanup.
 *   - EWMA / CUSUM math stays in the engine (time-weighted-chart-engine.js).
 */

import { createModule } from '../../core/template-module.js';
import { State, DEFAULTS } from './time-weighted-chart-model.js';
import {
  ColumnPicker, getColumnValues, getColumnName,
} from '../../ui/column-picker.js';
import {
  computeEWMA, computeCUSUM, estimateSigma,
} from '../../engines/time-weighted-chart-engine.js';
import { loadWorksheetExample, rewriteRefFields } from '../../core/examples-registry.js';
import { chartModuleLifecycle } from '../../core/chart/chart-module-base.js';

/** parseFloat → finite number or null. */
function numOrNull(v) {
  const f = parseFloat(v);
  return Number.isFinite(f) ? f : null;
}
/** parseInt → finite int or null. */
function intOrNull(v) {
  const i = parseInt(v, 10);
  return Number.isFinite(i) ? i : null;
}

const mod = createModule({
  config: {
    id: 'time-weighted-chart',
    engine: 'alpine',
    phase: 'control',
    icon: 'module.time-weighted-chart',
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
            mode: 'single',
            types: ['numeric'],
            minCount: 3,
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
      /** KPI strip (declarative — structured cells, see _renderStats*) */
      kpiCells: [],
      /** Chart sections (declarative — header markup; chart mounted imperatively
       * into the templated host via _whenAnchor). One mode renders at a time
       * (EWMA → 1 entry; CUSUM → 2 entries). See _renderChart*. */
      /** @type {Array<{id:string, title:string, badgeText:string, badgeClass:string}>} */
      chartViews: [],

      // ── View transforms (i18n) ────────────────────────────────

      typeHint() {
        return _t(`typeHint_${  this.model.chartTypeId}`);
      },
      sectionParamsLabel() {
        return _t(`sectionParams_${  this.model.chartTypeId}`);
      },

      // ── Nullable input display values ─────────────────────────
      // Legacy stored null for empty; the input shows '' for null.

      baselineCountValue() {
        return this.model.baselineCount == null ? '' : String(this.model.baselineCount);
      },
      targetOverrideValue() {
        return this.model.targetOverride == null ? '' : String(this.model.targetOverride);
      },
      sigmaOverrideValue() {
        return this.model.sigmaOverride == null ? '' : String(this.model.sigmaOverride);
      },

      // ── Change handlers ───────────────────────────────────────

      onChartTypeChange() {
        // model.chartTypeId already updated by x-model. The <template x-if>
        // swaps the param block automatically; just re-run the analysis
        // (EWMA → 1 chart, CUSUM → 2 charts).
        this._scheduleAutoRun();
      },
      onSigmaMethodChange() {
        // model.sigmaMethod already updated by x-model
        this._scheduleAutoRun();
      },
      onBaselineCountChange(ev) {
        this.model.baselineCount = intOrNull(ev.target.value);
        this._scheduleAutoRun();
      },
      onTargetOverrideChange(ev) {
        this.model.targetOverride = numOrNull(ev.target.value);
        this._scheduleAutoRun();
      },
      onSigmaOverrideChange(ev) {
        const v = numOrNull(ev.target.value);
        this.model.sigmaOverride = (v != null && v >= 0) ? v : null;
        this._scheduleAutoRun();
      },
      onLambdaChange(ev) {
        const v = numOrNull(ev.target.value);
        this.model.lambda = (v != null && v > 0 && v <= 1) ? v : DEFAULTS.lambda;
        this._scheduleAutoRun();
      },
      onLChange(ev) {
        const v = numOrNull(ev.target.value);
        this.model.L = (v != null && v > 0) ? v : DEFAULTS.L;
        this._scheduleAutoRun();
      },
      onKSigmaChange(ev) {
        const v = numOrNull(ev.target.value);
        this.model.kSigma = (v != null && v > 0) ? v : DEFAULTS.kSigma;
        this._scheduleAutoRun();
      },
      onHSigmaChange(ev) {
        const v = numOrNull(ev.target.value);
        this.model.hSigma = (v != null && v > 0) ? v : DEFAULTS.hSigma;
        this._scheduleAutoRun();
      },

      // ── Analysis ─────────────────────────────────────────────

      async _runAnalysis() {
        const clear = () => {
          this._renderGen++;
          this._destroyCharts();
          this.chartViews = [];
          this.kpiCells = [];
        };

        if (!this.model.columnRef) { clear(); return; }

        const sm = module._context.stateManager;
        const raw = getColumnValues(sm, this.model.columnRef);
        const values = raw.filter(v => typeof v === 'number' && !isNaN(v));
        if (values.length < 3) { clear(); return; }

        const blEnd = (this.model.baselineCount && this.model.baselineCount > 0)
          ? Math.min(this.model.baselineCount, values.length)
          : values.length;
        const baseline = values.slice(0, blEnd);

        // Resolve target & sigma
        const targetAuto = baseline.reduce((s, x) => s + x, 0) / baseline.length;
        const target = this.model.targetOverride != null ? this.model.targetOverride : targetAuto;

        const sigmaAuto = estimateSigma(baseline, this.model.sigmaMethod);
        const sigma = (this.model.sigmaOverride != null && this.model.sigmaOverride > 0)
          ? this.model.sigmaOverride
          : sigmaAuto;

        if (!(sigma > 0)) { clear(); return; }

        if (this.model.chartTypeId === 'ewma') {
          const r = computeEWMA(values, target, sigma, this.model.lambda, this.model.L);
          this._renderStatsEWMA(r, target, sigma, values.length);
          await this._renderChartEWMA(r);
        } else {
          const r = computeCUSUM(values, target, sigma, this.model.kSigma, this.model.hSigma);
          this._renderStatsCUSUM(r, target, sigma, values.length);
          await this._renderChartCUSUM(r, values.length);
        }
      },

      // ── KPI strip (declarative — structured cells, RAW text; x-text escapes) ──

      _renderStatsEWMA(r, target, sigma, total) {
        const fmt = (v) => Number.isFinite(v) ? v.toFixed(4) : '–';
        const sigCount = r.signals.length;
        const cls = sigCount === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad';

        this.kpiCells = [
          { value: fmt(target), label: _t('statTarget'), labelHint: '', sub: `σ̂ = ${fmt(sigma)}`, mod: '' },
          { value: fmt(r.sigmaSteady), label: _t('statSigmaSteady'), labelHint: '', sub: `λ = ${this.model.lambda}`, mod: '' },
          { value: sigCount, label: _t('statSignals'), labelHint: '', sub: _t('statOf', { total }), mod: cls },
        ];
      },

      _renderStatsCUSUM(r, target, sigma, total) {
        const fmt = (v) => Number.isFinite(v) ? v.toFixed(4) : '–';
        const sigCount = r.signalsHi.length + r.signalsLo.length;
        const cls = sigCount === 0 ? 'dmike-kpi--good' : 'dmike-kpi--bad';

        this.kpiCells = [
          { value: fmt(target), label: _t('statTarget'), labelHint: '', sub: `σ̂ = ${fmt(sigma)}`, mod: '' },
          { value: fmt(r.h), label: _t('statHLimit'), labelHint: '', sub: `k = ${fmt(r.k)}`, mod: '' },
          { value: sigCount, label: _t('statSignals'), labelHint: '', sub: _t('statOf', { total }), mod: cls },
        ];
      },

      // ── Chart rendering (headers declarative; charts mount into templated hosts) ──

      async _renderChartEWMA(r) {
        this._destroyCharts();

        const sm = module._context.stateManager;
        const colName = getColumnName(sm, this.model.columnRef);
        const sigCount = r.signals.length;
        const isStable = sigCount === 0;

        const gen = ++this._renderGen;

        // Declarative header markup (RAW text — x-text escapes).
        this.chartViews = [{
          id: 'ewma',
          title: _t('chartTitle_ewma', { col: colName }),
          badgeText: isStable ? _t('stable') : _t('unstable', { count: sigCount }),
          badgeClass: isStable ? 'twc__badge--stable' : 'twc__badge--unstable',
        }];

        const host = await this.whenAnchor('[data-chart-host="ewma"]', gen);
        if (!host) return;

        const chart = await module._context.chartManager.create(host, 'control-chart', {
          title: '',
          xLabel: _t('xLabelSample'),
          yLabel: _t('yLabel_ewma'),
          showLegend: false,
          showTitle: false,
          values: r.values,
          cl: r.cl,
          ucl: r.ucl,      // array → stepped limits
          lcl: r.lcl,      // array → stepped limits
          sigma: r.sigma,  // array → no zones (correct: σ_zi varies by point)
          violationIndices: new Set(r.signals),
          usl: null, lsl: null,
          showZones: false,
        });

        if (gen !== this._renderGen) {
          try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
          return;
        }
        this._charts.push(chart);
      },

      async _renderChartCUSUM(r, _n) {
        this._destroyCharts();

        const sm = module._context.stateManager;
        const colName = getColumnName(sm, this.model.columnRef);

        const gen = ++this._renderGen;

        const subcharts = [
          {
            id: 'cusum_plus', titleKey: 'chartTitle_cusum_plus', yLabel: 'C⁺',
            values: r.cPlus, violations: r.signalsHi,
          },
          {
            id: 'cusum_minus', titleKey: 'chartTitle_cusum_minus', yLabel: 'C⁻',
            values: r.cMinus, violations: r.signalsLo,
          },
        ];

        // Declarative header markup (RAW text — x-text escapes).
        this.chartViews = subcharts.map(sc => {
          const sigCount = sc.violations.length;
          const isStable = sigCount === 0;
          return {
            id: sc.id,
            title: _t(sc.titleKey, { col: colName }),
            badgeText: isStable ? _t('stable') : _t('unstable', { count: sigCount }),
            badgeClass: isStable ? 'twc__badge--stable' : 'twc__badge--unstable',
          };
        });

        for (const sc of subcharts) {
          const host = await this.whenAnchor(`[data-chart-host="${  sc.id  }"]`, gen);
          if (!host) return;

          const chart = await module._context.chartManager.create(host, 'control-chart', {
            title: '',
            xLabel: _t('xLabelSample'),
            yLabel: sc.yLabel,
            showLegend: false,
            showTitle: false,
            values: sc.values,
            cl: 0,
            ucl: r.h,
            lcl: 0,
            sigma: 0,            // suppress σ zones
            violationIndices: new Set(sc.violations),
            usl: null, lsl: null,
            showZones: false,
          });

          if (gen !== this._renderGen) {
            try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
            return;
          }
          this._charts.push(chart);
        }
      },

    };
  },
});

/**
 * Custom loadExample: time-weighted-chart examples ship a full worksheet
 * (`sourceWorksheetData`) and use the literal placeholder `__source__` as the
 * `columnRef.instanceId`. Delegates to the shared worksheet-backed loader,
 * rewriting the single `columnRef` placeholder.
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
