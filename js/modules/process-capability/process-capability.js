/**
 * D.Mike — Process Capability Module (process-capability.js)
 * Measure phase: Process Capability Analysis (Cp, Cpk, Pp, Ppk).
 * Supports two-sided (LSL + USL) and one-sided specifications.
 *
 * Data source: column from a Worksheet module (referenced by column ID), or
 * values embedded directly from a catalog example.
 *
 * Migrated to createModule + Alpine CSP. The Model (process-capability-model.js)
 * holds only the raw inputs / column reference / embedded values; the analysis
 * RESULT is derived transiently in the view from those inputs plus the live
 * worksheet data via the (unchanged) capability engine.
 *
 * Imperative widgets (mounted in init(), disposed in destroy()):
 *   - the shared ColumnPicker in 'select' mode (worksheet-column <select>);
 *     the embedded-example "remove" pill is rendered declaratively in the
 *     Alpine template (x-if model.embeddedValues)
 *   - the capability histogram (chartManager)
 */

import { createModule } from '../../core/template-module.js';
import { State } from './process-capability-model.js';
import { validate, analyze } from '../../engines/process-capability-engine.js';
import { ColumnPicker, getColumnValues, discoverColumns } from '../../ui/column-picker.js';

/** Auto-run debounce (ms) — matches the legacy behaviour. */
const AUTORUN_DELAY = 600;

/** @param {number} v @param {number} d @returns {string} */
function fmt(v, d = 4) {
  if (v == null || isNaN(v)) return '–';
  return v.toFixed(d);
}

const mod = createModule({
  config: {
    id: 'process-capability',
    engine: 'alpine',
    phase: 'measure',
    icon: 'module.process-capability',
    version: '1.1.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    return {
      // ── Transient view state (not persisted) ──────────────────
      result: null,
      _charts: [],
      _unsubs: [],
      _debTimer: null,
      _renderGen: 0,
      _picker: null,
      /** Empty-state decision for the column area: 'ok' | 'noWorksheet' | 'noNumericColumns'. */
      _colState: 'ok',

      fmt,

      /** Title for the embedded-data "remove" button (global i18n key). */
      removeTitle() { return module._context.i18n.t('common.remove'); },

      /** Drop embedded example data, re-show the column picker, re-run. */
      clearEmbedded() {
        this.model.clearEmbedded();
        this.$nextTick(() => this._mountPicker());
        this.runAnalysis();
      },

      // ── View transformations ──────────────────────────────────

      statusLabel: (s) => _t({ pass: 'statusPass', fail: 'statusFail', warn: 'statusWarn' }[s] || 'statusWarn'),
      badgeLabel: (s) => _t({ pass: 'capable', fail: 'notCapable', warn: 'condCapable' }[s] || 'condCapable'),
      kpiModClass: (s) => ({ pass: 'dmike-kpi--good', warn: 'dmike-kpi--warn', fail: 'dmike-kpi--bad' }[s] || ''),

      featureName() { return this.model.params.name || '–'; },

      ciLabel(ci) {
        const r = this.result;
        if (!ci || !r) return '';
        const ciPct = Math.round(r.confidence * 100);
        return `${_t('ci')} ${ciPct}%: [${fmt(ci[0])}; ${fmt(ci[1])}]`;
      },

      /** Main short-term KPI cells (Cp / Cpk / CPL / CPU). */
      mainKpis() {
        const r = this.result;
        if (!r) return [];
        const cells = [];
        if (r.Cp != null) {
          cells.push({
            key: 'cp',
            mod: this.kpiModClass(r.cpStatus),
            label: `Cp (${_t('potential')})`,
            value: fmt(r.Cp),
            sub: `${_t('threshold')}: ≥ 1.33 · ${this.badgeLabel(r.cpStatus)}${r.CpCI ? ` · ${this.ciLabel(r.CpCI)}` : ''}`,
          });
        }
        cells.push({
          key: 'cpk',
          mod: this.kpiModClass(r.cpkStatus),
          label: `Cpk (${_t('actual')})`,
          value: fmt(r.Cpk),
          sub: `${_t('threshold')}: ≥ 1.33 · ${this.badgeLabel(r.cpkStatus)}${r.CpkCI ? ` · ${this.ciLabel(r.CpkCI)}` : ''}`,
        });
        if (r.CPL != null) {
          cells.push({
            key: 'cpl',
            mod: '',
            label: `CPL (${_t('lower')})`,
            value: fmt(r.CPL),
            sub: '(x̄ − LSL) / 3s',
          });
        }
        if (r.CPU != null) {
          cells.push({
            key: 'cpu',
            mod: '',
            label: `CPU (${_t('upper')})`,
            value: fmt(r.CPU),
            sub: '(USL − x̄) / 3s',
          });
        }
        return cells;
      },

      /** Long-term performance KPI cells (Pp / Ppk / PPM / Sigma). */
      perfKpis() {
        const r = this.result;
        if (!r) return [];
        const cells = [];
        if (r.Pp != null) {
          cells.push({
            key: 'pp',
            label: `Pp (${_t('overallPotential')})`,
            value: fmt(r.Pp),
            sub: `${_t('longTerm')}${r.PpCI ? ` · ${this.ciLabel(r.PpCI)}` : ''}`,
          });
        }
        if (r.Ppk != null) {
          cells.push({
            key: 'ppk',
            label: `Ppk (${_t('overallActual')})`,
            value: fmt(r.Ppk),
            sub: `${_t('longTerm')}${r.PpkCI ? ` · ${this.ciLabel(r.PpkCI)}` : ''}`,
          });
        }
        cells.push({
          key: 'ppm',
          label: `PPM (${_t('defective')})`,
          value: fmt(r.ppmTotal),
          sub: _t('perMillion'),
        });
        cells.push({
          key: 'sigma',
          label: _t('sigmaLevel'),
          value: `${fmt(r.sigmaLevel)}σ`,
          sub: 'Z = 3 · Cpk',
        });
        return cells;
      },

      /** Horizontal stats table columns (label/value pairs). */
      statCols() {
        const r = this.result;
        if (!r) return [];
        const unit = this.model.params.unit || '';
        return [
          { label: _t('statN'), value: String(r.n) },
          { label: _t('statMean'), value: `${fmt(r.xbar)} ${unit}` },
          { label: _t('statStddevS'), value: `${fmt(r.s)} ${unit}` },
          { label: _t('statStddevSigma'), value: `${fmt(r.sigma)} ${unit}` },
          { label: _t('statMin'), value: `${fmt(r.xmin)} ${unit}` },
          { label: _t('statMax'), value: `${fmt(r.xmax)} ${unit}` },
          r.hasLsl ? { label: 'LSL', value: `${fmt(r.lsl)} ${unit}` } : null,
          r.hasUsl ? { label: 'USL', value: `${fmt(r.usl)} ${unit}` } : null,
          r.T != null ? { label: _t('statTol'), value: `${fmt(r.T)} ${unit}` } : null,
          r.targetVal != null ? { label: _t('statTarget'), value: `${fmt(r.targetVal)} ${unit}` } : null,
          r.ppmBelowLsl != null ? { label: 'PPM < LSL', value: fmt(r.ppmBelowLsl) } : null,
          r.ppmAboveUsl != null ? { label: 'PPM > USL', value: fmt(r.ppmAboveUsl) } : null,
        ].filter(Boolean);
      },

      // ── Analysis (controller — needs context + live worksheet data) ──

      parseNum(s) {
        if (s == null || s === '') return NaN;
        return parseFloat(String(s).replace(',', '.').trim());
      },

      /** Resolved confidence as a fraction (0 < c < 1), from the percent input. */
      confidenceFraction() {
        const raw = this.parseNum(this.model.params.confidence);
        if (!isNaN(raw) && raw > 0) {
          return Math.max(50, Math.min(99.99, raw)) / 100;
        }
        return (module._context.stateManager.get('settings.confidenceLevel') ?? 95) / 100;
      },

      /** Live measurement values — embedded example data takes precedence. */
      columnValues() {
        if (this.model.embeddedValues) {
          return this.model.embeddedValues.filter(v => typeof v === 'number' && !isNaN(v));
        }
        if (!this.model.columnRef) return [];
        return getColumnValues(module._context.stateManager, this.model.columnRef)
          .filter(v => v != null && typeof v === 'number' && !isNaN(v));
      },

      /**
       * Run analysis if all inputs are valid; otherwise silently clear results
       * (no error shown — matches the legacy auto-analysis behaviour).
       */
      runAnalysis() {
        if (!this.model.columnRef && !this.model.embeddedValues) return this.clearResults();
        const values = this.columnValues();
        if (values.length === 0) return this.clearResults();

        const p = this.model.params;
        const lsl = this.parseNum(p.lsl);
        const usl = this.parseNum(p.usl);
        const target = this.parseNum(p.target);
        const params = {
          lsl: isNaN(lsl) ? null : lsl,
          usl: isNaN(usl) ? null : usl,
          target: isNaN(target) ? null : target,
          confidence: this.confidenceFraction(),
        };

        const validation = validate(params, values);
        if (!validation.valid) return this.clearResults();

        this.result = analyze(params, values);
        const gen = ++this._renderGen;
        this.$nextTick(() => this._renderHistogram(this.result, gen));
      },

      scheduleAnalysis() {
        clearTimeout(this._debTimer);
        this._debTimer = setTimeout(() => this.runAnalysis(), AUTORUN_DELAY);
      },

      clearResults() {
        this.result = null;
        this._destroyCharts();
      },

      // ── SVG chart (imperative via chartManager) ───────────────

      async _renderHistogram(r, gen) {
        this._destroyCharts();
        const el = module._container.querySelector('[data-ref="chart-hist"]');
        if (!el) return;
        const values = this.columnValues();
        if (values.length === 0) return;

        const refLines = [];
        if (r.hasLsl) refLines.push({ dir: 'v', value: r.lsl, label: 'LSL', color: 'var(--color-error)', dash: 'dash', width: 1.5, showLabel: true });
        if (r.hasUsl) refLines.push({ dir: 'v', value: r.usl, label: 'USL', color: 'var(--color-error)', dash: 'dash', width: 1.5, showLabel: true });
        if (r.targetVal != null) refLines.push({ dir: 'v', value: r.targetVal, label: 'Target', color: 'var(--color-success)', dash: 'dash', width: 1.5, showLabel: true });

        const chart = await module._context.chartManager.create(el, 'histogram', {
          data: values,
          binMethod: 'sturges',
          showNormalCurve: true,
          barColor: 'var(--color-accent)',
          normalCurveColor: 'var(--color-info)',
          showLegend: true,
          refLines,
        });
        // Stale-render guard: a newer render started while we awaited.
        if (gen !== this._renderGen) {
          module._context.chartManager.destroy(chart);
          return;
        }
        this._charts.push(chart);
      },

      _destroyCharts() {
        for (const c of this._charts) {
          try { module._context.chartManager.destroy(c); } catch { /* ignore */ }
        }
        this._charts = [];
      },

      // ── Worksheet column picker (shared ColumnPicker, 'select' mode) ──

      /** Option label: "C1 – Name (n=30)" / "C1 (n=30)" (matches legacy). */
      _optionLabel(c) {
        return c.columnName
          ? `${c.shortName} – ${c.columnName} (n=${c.valueCount})`
          : `${c.shortName} (n=${c.valueCount})`;
      },

      /** True if at least one Worksheet module instance exists in any phase. */
      _hasWorksheet() {
        const sm = module._context.stateManager;
        for (const phase of Object.keys(sm.get('phases') || {})) {
          const instances = sm.get(`phases.${phase}`) ?? [];
          if (instances.some(i => i.moduleId === 'worksheet')) return true;
        }
        return false;
      },

      /**
       * Decide which column-area state to show (drives the declarative empty
       * states vs. the picker in the template). External worksheet state is not
       * auto-tracked by Alpine, so this is recomputed explicitly whenever the
       * worksheet/data may have changed. Mutating `_colState` triggers the
       * x-if/x-show re-render.
       */
      _computeColState() {
        if (this.model.embeddedValues) { this._colState = 'ok'; return; }
        const cols = discoverColumns(module._context.stateManager, { types: ['numeric'] });
        if (cols.length > 0) { this._colState = 'ok'; return; }
        this._colState = this._hasWorksheet() ? 'noNumericColumns' : 'noWorksheet';
      },

      /**
       * (Re)mount the shared ColumnPicker into its anchor. Skipped while
       * embedded-example data is active (the template shows the pill instead).
       * The picker owns worksheet-column discovery + its own focus-guarded
       * refresh, so the module no longer needs bespoke event wiring for that.
       */
      _mountPicker() {
        this._computeColState();
        if (this.model.embeddedValues) return;
        // No selectable numeric columns: the template shows a dedicated empty
        // state instead of the picker, so don't mount it (cleaner DOM).
        if (this._colState !== 'ok') {
          if (this._picker) { this._picker.destroy(); this._picker = null; }
          return;
        }
        const wrap = module._container.querySelector('[data-ref="col-select-wrap"]');
        if (!wrap) return;
        if (this._picker) { this._picker.destroy(); this._picker = null; }
        this._picker = new ColumnPicker(wrap, module._context, {
          mode: 'select',
          types: ['numeric'],
          optionFormat: (c) => this._optionLabel(c),
          onChange: (ref) => {
            this.model.columnRef = ref || null;
            if (ref) this.model.clearEmbedded();
            this.runAnalysis();
          },
        });
        if (this.model.columnRef) this._picker.value = this.model.columnRef;
      },

      /**
       * Worksheet structure/data may have changed externally: re-decide the
       * empty-state vs. picker, re-mount the picker when needed, and re-run.
       * Skipped while the user is interacting with the mounted picker (the
       * picker self-refreshes its options in that case).
       */
      _refreshColArea() {
        const wrap = module._container.querySelector('[data-ref="col-select-wrap"]');
        const active = document.activeElement;
        const focused = Boolean(active && wrap && wrap.contains(active));
        if (!focused) {
          const prev = this._colState;
          this._computeColState();
          // Re-mount only when the state crossed the empty/ok boundary (i.e.
          // the picker needs to appear or disappear). When it stays 'ok', the
          // mounted picker refreshes its own option list — no churn needed.
          const wasOk = prev === 'ok' && !this.model.embeddedValues;
          const nowOk = this._colState === 'ok' && !this.model.embeddedValues;
          if (wasOk !== nowOk) this.$nextTick(() => this._mountPicker());
        }
        this.runAnalysis();
      },

      // ── Lifecycle (per Alpine component) ──────────────────────

      init() {
        // Fresh per-instance collections (the data() object is shared by Alpine.data).
        this._charts = [];
        this._unsubs = [];

        this._mountPicker();

        const eb = module._context.eventBus;

        // Worksheet data/structure may change externally (Alpine cannot track
        // it): re-decide empty-state vs. picker, re-mount across the boundary,
        // and re-derive the analysis result.
        const onData = () => this._refreshColArea();
        eb.on('state:saved', onData);
        eb.on('worksheet:dataChanged', onData);
        this._unsubs.push(() => eb.off('state:saved', onData));
        this._unsubs.push(() => eb.off('worksheet:dataChanged', onData));

        const onMod = ({ moduleId }) => { if (moduleId === 'worksheet') this._refreshColArea(); };
        eb.on('module:added', onMod);
        eb.on('module:removed', onMod);
        this._unsubs.push(() => eb.off('module:added', onMod));
        this._unsubs.push(() => eb.off('module:removed', onMod));

        const onTheme = () => {
          if (this.result) this._renderHistogram(this.result, ++this._renderGen);
        };
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));

        // Recompute results from restored state.
        this.runAnalysis();
      },

      destroy() {
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
        if (this._picker) { this._picker.destroy(); this._picker = null; }
        clearTimeout(this._debTimer);
        this._destroyCharts();
      },
    };
  },
});

/**
 * Custom loadExample: process-capability examples ship a CSV-shaped payload
 * (`data.columns[0].values`) plus a `meta.spec`. We embed the values directly
 * (bypassing the worksheet), apply the spec, and re-run the analysis. This
 * replaces the generic createModule loadExample, which would feed the raw
 * example payload through Model.fromJSON (the shapes do not match).
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = async function loadExample(payload) {
  if (!payload || !payload.data) return;
  const ctx = this._context;
  const t = (key, vars) => ctx.i18n.t(key, vars);

  // Warn before overwriting existing data.
  const current = this.getState();
  const model = current ? State.fromJSON(current) : null;
  if (model?.hasContent() && ctx?.confirmPopout) {
    const ok = await ctx.confirmPopout(t('moduleHelp.confirmOverwrite'), { danger: true });
    if (!ok) return;
  }

  const col = payload.data.columns?.[0];
  if (!col || !Array.isArray(col.values)) {
    ctx.notify?.(t('moduleHelp.exampleLoadError'), 'error');
    return;
  }
  const values = col.values.filter(v => typeof v === 'number' && !isNaN(v));
  if (values.length === 0) {
    ctx.notify?.(t('moduleHelp.exampleLoadError'), 'error');
    return;
  }

  const next = State.fromJSON(current);
  next.embeddedValues = values;
  const lang = ctx.i18n.getLanguage();
  const label = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
  next.embeddedLabel = label;
  next.columnRef = null;

  // Apply spec from meta if present.
  const spec = payload.meta?.spec || {};
  if (typeof spec.lsl === 'number') next.params.lsl = String(spec.lsl);
  if (typeof spec.usl === 'number') next.params.usl = String(spec.usl);
  if (typeof spec.target === 'number') next.params.target = String(spec.target);

  // Use feature name from meta and unit from first column.
  if (payload.meta?.title) next.params.name = label;
  if (col.unit) next.params.unit = col.unit;
  else if (payload.meta?.columns?.[0]?.unit) next.params.unit = payload.meta.columns[0].unit;

  this.setState(next.toJSON());
  ctx.stateManager.setModuleState(ctx.instanceId, this.getState());

  ctx.notify?.(t('moduleHelp.exampleLoaded', { title: label }), 'success');
};

export default mod;
