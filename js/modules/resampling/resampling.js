/**
 * D.Mike — Resampling Module (resampling.js)
 * Analyze phase: bootstrap confidence intervals and permutation tests for one,
 * two, paired and k samples.
 *
 * createModule + Alpine CSP. The Model (resampling-model.js) holds settings and
 * the condensed result summary; all statistics live in the engines, input
 * handling in resampling-analysis.js, display mapping in resampling-presenter.js.
 * Computation runs only on the explicit "Compute" button through the runner
 * from `mod.runnerFactory` (inline runner today, a worker runner later).
 *
 * Native objects (AbortController, charts, pickers) stay in closure locals of
 * `data()`: on reactive Alpine data they would be proxied and their methods
 * would throw "Illegal invocation".
 */

import { createModule } from '../../core/template-module.js';
import { State } from './resampling-model.js';
import {
  readInputs, validateInputs, errorKeyForCode, buildJobs, computeInputsHash, summarize,
} from './resampling-analysis.js';
import { resultView, bootChartConfig, permChartConfig, statisticKey } from './resampling-presenter.js';
import { statementParts, renderStatement } from './resampling-statement.js';
import { createInlineRunner } from '../../engines/resampling-runner.js';
import { ColumnPicker, getColumnValues, getColumnName } from '../../ui/column-picker.js';
import { loadExampleViaWorksheet } from '../../core/examples-registry.js';

const mod = createModule({
  config: {
    id: 'resampling',
    engine: 'alpine',
    phase: 'analyze',
    icon: 'module.resampling',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  data(module, _t) {
    let abortCtl = null;
    let renderGen = 0;
    let charts = [];
    let pickers = [];
    let unsubs = [];

    const chartManager = () => module._context.chartManager;
    const destroyCharts = () => {
      for (const chart of charts) {
        try { chartManager().destroy(chart); } catch { /* ignore */ }
      }
      charts = [];
    };
    const disposePickers = () => {
      for (const p of pickers) p.destroy();
      pickers = [];
    };
    const valuesOf = (ref) => (ref ? getColumnValues(module._context.stateManager, ref) : null);

    return {
      // ── Transient view state (not persisted) ────────────────────
      running: false,
      progress: 0,
      errorKey: null,
      validationKey: null,
      currentHash: null,
      stale: false,
      view: null,
      /** Sentence parts of the plain-language key statement (resampling-statement.js). */
      statement: [],
      /** Completed runs in this view instance (not persisted; lets E2E detect a finished recompute). */
      runCount: 0,

      statisticKey,

      isMode(mode) { return this.model.mode === mode; },
      isAllowed(id) { return this.model.allowedStatistics().includes(id); },
      showTarget() { return this.model.mode === 'one'; },
      showDirection() { return this.model.mode === 'two' || this.model.mode === 'paired'; },
      showValidation() { return Boolean(this.validationKey) && this.model.hasContent(); },
      canCompute() { return !this.running && !this.validationKey; },
      sampleLabelKey(which) {
        if (this.model.mode === 'paired') return which === 1 ? 'pairedXColumn' : 'pairedYColumn';
        if (this.model.mode === 'two') return which === 1 ? 'group1Column' : 'group2Column';
        return 'sampleColumn';
      },

      setMode(mode) {
        this.model.setMode(mode);
        this.$nextTick(() => { this._remountPickers(); this.refresh(); });
      },

      rollSeed() { this.model.rollSeed(); },

      /** Recompute validation, hash, staleness and the result view. */
      refresh() {
        const inputs = readInputs(this.model, valuesOf);
        this.validationKey = validateInputs(this.model, inputs);
        this.currentHash = computeInputsHash(this.model, inputs);
        this.stale = this.model.isStale(this.currentHash);
        const opts = { ciMethod: this.model.ciMethod, target: this.model.target };
        this.view = resultView(this.model.result, opts);
        this.statement = statementParts(this.model.result, opts);
      },

      /** Key statement as one translated paragraph. */
      statementText() { return renderStatement(this.statement, _t); },

      _labels() {
        const sm = module._context.stateManager;
        const refs = this.model.mode === 'k' ? this.model.colRefsK
          : this.model.mode === 'one' ? [this.model.colRef1]
            : [this.model.colRef1, this.model.colRef2];
        return refs.map((r) => getColumnName(sm, r));
      },

      /** Run all jobs of the current settings; keeps the old result on cancel. */
      async compute() {
        if (this.running) return;
        this.refresh();
        if (this.validationKey) return;
        // Snapshot: the inputs stay editable during the run, so everything the run
        // computes and summarizes must come from the settings at its start.
        const snap = State.fromJSON(this.model.toJSON());
        const labels = this._labels();
        const inputs = readInputs(snap, valuesOf);
        const hash = computeInputsHash(snap, inputs);
        const jobs = buildJobs(snap, inputs);
        const runner = mod.runnerFactory();
        abortCtl = new AbortController();
        const { signal } = abortCtl;
        this.running = true;
        this.progress = 0;
        this.errorKey = null;
        const outcomes = [];
        try {
          for (let i = 0; i < jobs.length; i++) {
            const result = await runner.run(jobs[i].job, {
              signal,
              onProgress: (done, total) => { this.progress = (i + (total ? done / total : 0)) / jobs.length; },
            });
            outcomes.push({ role: jobs[i].role, result });
          }
          this.model.result = summarize(snap, inputs, outcomes, hash, labels);
          this.runCount++;
        } catch (err) {
          if (!(err && err.name === 'AbortError')) {
            this.errorKey = err && err.code ? errorKeyForCode(err.code, snap.statisticId) : 'errUnexpected';
          }
        } finally {
          this.running = false;
          this.progress = 0;
          abortCtl = null;
          this.refresh();
        }
      },

      cancel() {
        if (abortCtl) abortCtl.abort();
      },

      async renderCharts() {
        const gen = ++renderGen;
        destroyCharts();
        const summary = this.model.result;
        if (!summary) return;
        const specs = [
          ['[data-ref="chart-boot"]', bootChartConfig(summary, this.model.ciMethod, _t)],
          ['[data-ref="chart-perm"]', permChartConfig(summary, _t)],
        ];
        for (const [selector, cfg] of specs) {
          const el = module._container.querySelector(selector);
          if (!el || !cfg) continue;
          const chart = await chartManager().create(el, 'histogram', cfg);
          if (gen !== renderGen) {
            if (chart) { try { chartManager().destroy(chart); } catch { /* ignore */ } }
            return;
          }
          if (chart) charts.push(chart);
        }
      },

      // ── ColumnPickers (imperative widgets) ─────────────────────

      _remountPickers() {
        disposePickers();
        const ctx = module._context;
        const c = module._container;
        const single = (selector, key) => {
          const wrap = c.querySelector(selector);
          if (!wrap) return;
          const picker = new ColumnPicker(wrap, ctx, {
            mode: 'single', types: ['numeric'], minCount: 2,
            onChange: (ref) => { this.model[key] = ref; this.refresh(); },
          });
          if (this.model[key]) picker.value = this.model[key];
          pickers.push(picker);
        };
        single('[data-ref="picker1-wrap"]', 'colRef1');
        single('[data-ref="picker2-wrap"]', 'colRef2');
        const wrapK = c.querySelector('[data-ref="picker-k-wrap"]');
        if (wrapK) {
          const picker = new ColumnPicker(wrapK, ctx, {
            mode: 'multi', types: ['numeric'], minCount: 2,
            onChange: (refs) => { this.model.colRefsK = refs; this.refresh(); },
          });
          if (this.model.colRefsK.length) picker.value = this.model.colRefsK;
          pickers.push(picker);
        }
      },

      // ── Lifecycle ──────────────────────────────────────────────

      init() {
        unsubs = [];
        this.refresh();
        this.$watch(() => JSON.stringify(this.model.toJSON()), () => this.refresh());
        this.$watch(() => this.model.result, () => this.$nextTick(() => this.renderCharts()));
        this.$watch(() => this.model.ciMethod, () => this.$nextTick(() => this.renderCharts()));
        this.$nextTick(() => { this._remountPickers(); this.renderCharts(); });

        const eb = module._context.eventBus;
        const own = `module:${module._context.instanceId}`;
        const onData = (payload) => {
          if (typeof payload === 'string' && payload.startsWith(own)) return;
          this.refresh();
        };
        const onActivated = ({ instanceId }) => {
          if (instanceId !== module._context.instanceId) return;
          for (const p of pickers) p.refresh();
          this.refresh();
        };
        eb.on('data:changed', onData);
        eb.on('module:activated', onActivated);
        unsubs.push(() => eb.off('data:changed', onData));
        unsubs.push(() => eb.off('module:activated', onActivated));
      },

      destroy() {
        if (abortCtl) abortCtl.abort();
        abortCtl = null;
        renderGen++;
        destroyCharts();
        disposePickers();
        for (const unsub of unsubs) unsub();
        unsubs = [];
      },
    };
  },
});

/** Runner used by `compute()`; tests and a future worker runner replace it. */
mod.runnerFactory = () => createInlineRunner();

/**
 * Custom loadExample: resampling catalog examples ship a full worksheet and use
 * the placeholder `__source__` as the `instanceId` of every column ref.
 *
 * @param {{ meta: object, data: object }} payload
 */
mod.loadExample = function loadExample(payload) {
  return loadExampleViaWorksheet(this, payload, {
    State,
    rewriteRefs(data, instanceId) {
      const rewrite = (r) => (r && r.instanceId === '__source__') ? { ...r, instanceId } : r;
      const out = { ...data };
      if (out.colRef1) out.colRef1 = rewrite(out.colRef1);
      if (out.colRef2) out.colRef2 = rewrite(out.colRef2);
      if (Array.isArray(out.colRefsK)) out.colRefsK = out.colRefsK.map(rewrite);
      return out;
    },
  });
};

export default mod;
