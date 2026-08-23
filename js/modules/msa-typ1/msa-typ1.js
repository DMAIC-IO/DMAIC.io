/**
 * D.Mike — MSA Typ 1 Module (msa-typ1.js)
 * Measure phase: Measurement System Analysis Type 1.
 * Evaluates gage repeatability (Cg) and bias (Cgk).
 *
 * Data source: column from a Worksheet module (referenced by column ID).
 *
 * Migrated to createModule + Alpine CSP. The Model (msa-typ1-model.js) holds
 * only the raw inputs; the analysis result is derived transiently in the view
 * from those inputs plus the live worksheet column values. ColumnPicker and the
 * SVG charts are mounted imperatively (they are not pure-template concerns).
 *
 * Spec: docs/modules/MSA-TYP1.md
 */

import { createModule } from '../../core/template-module.js';
import { State } from './msa-typ1-model.js';
import { validate, analyze } from '../../engines/msa-typ1-engine.js';
import { ColumnPicker, getColumnValues } from '../../ui/column-picker.js';
import { loadExampleViaWorksheet } from '../../core/examples-registry.js';

/** @param {number} v @param {number} d @returns {string} */
function fmt(v, d = 4) { return v.toFixed(d); }

const mod = createModule({
  config: {
    id: 'msa-typ1',
    engine: 'alpine',
    phase: 'measure',
    icon: 'module.msa-typ1',
    version: '1.1.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (not persisted) ──────────────────
      result: null,
      errorMsg: '',
      _picker: null,
      _charts: [],
      _unsubs: [],
      _debTimer: null,
      _renderGen: 0,

      // ── View transformations ──────────────────────────────────

      fmt,
      abs: (v) => Math.abs(v),

      statusLabel: (s) => _t({ pass: 'statusPass', fail: 'statusFail', warn: 'statusWarn' }[s] || 'statusWarn'),
      badgeLabel: (s) => _t({ pass: 'capable', fail: 'notCapable', warn: 'condCapable' }[s] || 'condCapable'),
      kpiModClass: (s) => ({ pass: 'dmike-kpi--good', warn: 'dmike-kpi--warn', fail: 'dmike-kpi--bad' }[s] || ''),

      featureName() { return this.model.params.name || '–'; },

      /** Horizontal stats table columns (label/value pairs). */
      statCols() {
        const r = this.result;
        if (!r) return [];
        const u = this.model.params.unit || '';
        return [
          { label: _t('statN'), value: String(r.n) },
          { label: _t('statMean'), value: `${fmt(r.xbar)} ${u}` },
          { label: _t('statStddev'), value: `${fmt(r.sg)} ${u}` },
          { label: _t('statMin'), value: `${fmt(r.xmin)} ${u}` },
          { label: _t('statMax'), value: `${fmt(r.xmax)} ${u}` },
          { label: _t('statRange'), value: `${fmt(r.range)} ${u}` },
          { label: _t('statRef'), value: `${fmt(r.params.ref)} ${u}` },
          { label: _t('statTol'), value: `${fmt(r.T)} ${u}` },
          { label: _t('statResolution'), value: r.resolution > 0 ? `${fmt(r.resolution)} ${u} (${fmt(r.resPercent)} % T)` : '–' },
          { label: 'k₁ / k₂', value: `${r.params.k1} / ${r.params.k2}` },
        ];
      },

      // ── Analysis (controller — needs context + live worksheet data) ──

      parseNum(s) {
        if (s == null || s === '') return NaN;
        return parseFloat(String(s).replace(',', '.').trim());
      },

      getColumnValues() {
        if (!this.model.columnRef) return [];
        return getColumnValues(module._context.stateManager, this.model.columnRef)
          .filter(v => v != null && typeof v === 'number' && !isNaN(v));
      },

      /**
       * Run analysis if all inputs are valid; otherwise silently clear results
       * (no error shown — matches the legacy auto-analysis behaviour).
       */
      runAnalysis() {
        if (!this.model.columnRef) return this.clearResults();
        const values = this.getColumnValues();
        if (values.length === 0) return this.clearResults();

        const p = this.model.params;
        const ref = this.parseNum(p.ref);
        const lsl = this.parseNum(p.lsl);
        const usl = this.parseNum(p.usl);

        const validation = validate({ ref, lsl, usl }, values);
        if (!validation.valid) return this.clearResults();

        const k1 = parseFloat(p.k1);
        const k2 = parseFloat(p.k2);
        const r = analyze({ ref, lsl, usl, k1, k2 }, values);
        this.result = r;
        const gen = ++this._renderGen;
        this.$nextTick(() => this._renderCharts(r, gen));
      },

      scheduleAnalysis() {
        clearTimeout(this._debTimer);
        this._debTimer = setTimeout(() => this.runAnalysis(), 600);
      },

      clearResults() {
        this.result = null;
        this._destroyCharts();
      },

      // ── SVG charts (imperative via chartManager) ──────────────

      async _renderCharts(r, gen) {
        this._destroyCharts();
        const runEl = module._container.querySelector('[data-ref="chart-run"]');
        const histEl = module._container.querySelector('[data-ref="chart-hist"]');
        if (!runEl || !histEl) return;
        const values = r.details.map(d => d.value);
        await this._renderRunChart(runEl, r, values, gen);
        if (gen !== this._renderGen) return;
        await this._renderHistogram(histEl, r, values, gen);
      },

      async _renderRunChart(el, r, values, gen) {
        el.replaceChildren();
        const indices = values.map((_, i) => i + 1);
        const outIdx = [], outVal = [];
        r.details.forEach(d => { if (d.isOutlier) { outIdx.push(d.index); outVal.push(d.value); } });

        const chart = await module._context.chartManager.create(el, 'scatter', {
          xLabel: _t('chartIndex'),
          showLegend: true,
          markerSize: 5,
          series: [
            { name: _t('chartValues'), color: 'var(--color-accent)',
              x: indices, y: values,
              connectLine: { show: true, color: 'var(--color-text-secondary)', width: 1.5, dash: 'solid' } },
            ...(outIdx.length > 0 ? [{
              name: _t('chartOutliers'), color: 'var(--color-error)',
              stroke: 'var(--color-error)', strokeWidth: 2,
              x: outIdx, y: outVal, symbol: 'circle',
            }] : []),
          ],
          refLines: [
            { dir: 'h', value: r.params.ref, label: 'Ref', dash: 'dash', width: 1.5, color: 'var(--color-success)' },
            { dir: 'h', value: r.xbar, label: 'x̄', dash: 'dot', width: 1, color: 'var(--color-info)' },
            { dir: 'h', value: r.params.usl, label: 'USL', dash: 'dash', width: 1, color: 'var(--color-error)' },
            { dir: 'h', value: r.params.lsl, label: 'LSL', dash: 'dash', width: 1, color: 'var(--color-error)' },
          ],
          refAreas: [
            { dir: 'y', min: r.zoneLo, max: r.zoneHi, label: 'k₁·T', color: 'rgba(52,199,89,0.06)' },
          ],
        });
        if (gen !== this._renderGen) { module._context.chartManager.destroy(chart); return; }
        this._charts.push(chart);
      },

      async _renderHistogram(el, r, values, gen) {
        el.replaceChildren();
        const refLines = [];
        if (r.params.lsl != null) refLines.push({ dir: 'v', value: r.params.lsl, label: 'LSL', color: 'var(--color-error)', dash: 'dash', width: 1.5, showLabel: true });
        if (r.params.usl != null) refLines.push({ dir: 'v', value: r.params.usl, label: 'USL', color: 'var(--color-error)', dash: 'dash', width: 1.5, showLabel: true });
        if (r.params.ref != null) refLines.push({ dir: 'v', value: r.params.ref, label: 'Target', color: 'var(--color-success)', dash: 'dash', width: 1.5, showLabel: true });

        const chart = await module._context.chartManager.create(el, 'histogram', {
          data: values,
          binMethod: 'sturges',
          showNormalCurve: true,
          barColor: 'var(--color-accent)',
          normalCurveColor: 'var(--color-info)',
          showLegend: true,
          refLines,
        });
        if (gen !== this._renderGen) { module._context.chartManager.destroy(chart); return; }
        this._charts.push(chart);
      },

      _destroyCharts() {
        for (const c of this._charts) {
          try { module._context.chartManager.destroy(c); } catch { /* ignore */ }
        }
        this._charts = [];
      },

      // ── Algorithm Lab link ────────────────────────────────────

      algoNavigate(algoId, event) {
        event?.stopPropagation();
        if (algoId && module._context.eventBus) {
          module._context.eventBus.emit('lab:navigate', { algoId, tab: 'docs' });
        }
      },

      // ── ColumnPicker (imperative widget) ──────────────────────

      _mountPicker() {
        const wrap = module._container.querySelector('[data-ref="col-picker-wrap"]');
        if (!wrap) return;
        this._picker?.destroy();
        this._picker = new ColumnPicker(wrap, module._context, {
          mode: 'single',
          types: ['numeric'],
          onChange: (ref) => {
            this.model.columnRef = ref;
            this.runAnalysis();
          },
        });
        if (this.model.columnRef) this._picker.value = this.model.columnRef;
      },

      // ── Lifecycle (per Alpine component) ──────────────────────

      init() {
        // Fresh per-instance collections (the data() object is shared by Alpine.data).
        this._charts = [];
        this._unsubs = [];

        this._mountPicker();

        const eb = module._context.eventBus;
        const onActivated = ({ instanceId }) => {
          if (instanceId === module._context.instanceId) this._picker?.refresh();
        };
        eb.on('module:activated', onActivated);
        this._unsubs.push(() => eb.off('module:activated', onActivated));

        const onTheme = () => {
          if (this.result) this._renderCharts(this.result, ++this._renderGen);
        };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));

        // Recompute results from restored state.
        this.runAnalysis();
      },

      destroy() {
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        clearTimeout(this._debTimer);
        this._picker?.destroy();
        this._picker = null;
        this._destroyCharts();
      },
    };
  },
});

/**
 * Custom loadExample: MSA-Typ1 examples ship a full worksheet
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
  return loadExampleViaWorksheet(this, payload, {
    State,
    rewriteRefs(data, instanceId) {
      if (data.columnRef && data.columnRef.instanceId === '__source__') {
        return { ...data, columnRef: { ...data.columnRef, instanceId } };
      }
      return data;
    },
  });
};

export default mod;
