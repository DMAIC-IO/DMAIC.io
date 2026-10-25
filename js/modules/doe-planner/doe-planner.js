/**
 * D.Mike — DoE Planner Module (doe-planner.js)
 * Design of Experiments — split-panel layout with live auto-generation.
 * DMAIC phase: Improve. Migrated to createModule + Alpine CSP.
 *
 * The Model (doe-planner-model.js) holds the persistent state (version:3) and
 * pure logic (factor/response CRUD, cascading invalidation, designSignature,
 * active-term filtering). All design/analysis MATH stays in the engines
 * (doe-planner-engine.js, doe-terms.js) and the in-folder pure helpers
 * (doe-planner-analysis.js, doe-planner-worksheet.js, doe-planner-designs.js) —
 * nothing is reimplemented here. View transforms (i18n, CSS, formatting,
 * table view-models) live in the data-Fn; the markup is declarative in
 * doe-planner.html.
 *
 * The ONLY imperative widget is the preview DataGrid (mounted into the
 * [data-ref="preview-grid"] anchor, remounted on a cheap design signal,
 * disposed in destroy()). There are no chartManager charts in this module
 * (the evaluation is pure-HTML KPI cards/tables); onThemeChange is a CSS no-op.
 *
 * Engine sub-files are intentionally left in this folder (not relocated to
 * engines/): they are pure and imported as-is by the existing unit tests and
 * engines/doe-planner-engine.js — relocating would only churn imports.
 */

import { createModule } from '../../core/template-module.js';
import { State } from './doe-planner-model.js';
import { FactorsViewModel } from './viewmodel/factors.js';
import { DesignViewModel } from './viewmodel/design.js';
import { OptimalViewModel } from './viewmodel/optimal.js';
import { EvaluationViewModel } from './viewmodel/evaluation.js';
import { AnalysisViewModel } from './viewmodel/analysis.js';
import { EvopViewModel } from './viewmodel/evop.js';
import { codedToActualRows, buildRunTable, captureEdits, applyEdits } from './doe-planner-runtable.js';
import { DataGrid } from '../../core/datagrid/datagrid.js';
import {
  generateDesign, minRunsForTerms,
  augmentOptimalDesign,
} from '../../engines/doe-planner-engine.js';
import { checkConfig } from './designs/index.js';
import optimalType from './designs/optimal.js';
import {
  createDesignWorksheet, createExperimentRecord, removeExperimentRecord,
  sourceRowCount, readSourceData,
} from './doe-planner-worksheet.js';
import { readResponses, staleness, boundPct, boundComplete } from './doe-planner-responses.js';
import {
  evaluateDesign,
} from './doe-planner-analysis.js';
import { provisionWorksheet } from '../../core/examples-registry.js';
import { uid } from '../../core/uid.js';

// ─── Constants ─────────────────────────────────────────────────────

const AUTO_GEN_DELAY = 600; // ms debounce for auto-generation

/** Data keys of the sub-viewmodels, in attach order. */
const SUB_VIEWMODELS = ['factors', 'design', 'optimal', 'evaluation', 'analysis', 'evop'];

const mod = createModule({
  config: {
    id: 'doe-planner',
    engine: 'alpine',
    phase: 'improve',
    allowedPhases: ['measure', 'analyze', 'improve', 'control'],
    icon: 'module.doe-planner',
    version: '3.0.0',
    meta: import.meta,
  },
  Model: State,

  /**
   * Provision a source worksheet for augment examples and (after setState
   * re-mounts) the design is regenerated in init() via auto-generate. This hook
   * only transforms the payload — the worksheet provisioning that needs context
   * happens in loadExample below, so here we just pass the data through.
   */

  data(module, _t) {
    const ctx = () => module._context;

    // Signatures the auto-generation last acted on (spec 2026-10-25 E3). A
    // closure, not a data field: Alpine never wraps it, and the watchers'
    // callbacks compare against it synchronously.
    const signatures = { config: '', schedule: '' };
    const deps = { t: _t, context: module._context, container: () => module._container };

    return {
      // `name: new X(deps)` literals: the agent generator reads the
      // sub-viewmodels from exactly this shape. init() replaces them.
      factors: new FactorsViewModel(deps),
      design: new DesignViewModel(deps),
      optimal: new OptimalViewModel(deps),
      evaluation: new EvaluationViewModel(deps),
      analysis: new AnalysisViewModel(deps),
      evop: new EvopViewModel(deps),

      // ── Transient UI state (never persisted) ──────────────────
      _previewGrid: null,
      _autoGenTimer: null,
      _unsubs: [],
      _renderGen: 0,
      // Reactive revision counter: bumped whenever EXTERNAL worksheet state
      // changes (the linked Datensammlung lives in another module's state, which
      // Alpine cannot track). Output readers touch it so the right panel
      // recomputes progress/dispersion on edit.
      _extRev: 0,

      // ── Formatting helpers ────────────────────────────────────
      fmt2: (v) => Number(v).toFixed(2),
      fmt4: (v) => Number(v).toFixed(4),
      fmt6: (v) => Number(v).toFixed(6),

      save() { module._persist(this.model); },

      // ── Context-dependent helpers (need stateManager) ─────────

      sourceRowCount() { return sourceRowCount(ctx(), this.model.sourceWorksheet); },

      /** Type-independent rules, then the design type's own (designs/). */
      isConfigValid() {
        return checkConfig(this.model, { sourceRowCount: this.sourceRowCount() }).ok;
      },

      worksheetStaleness() {
        // Touch the external-revision counter so Alpine re-evaluates the output
        // regions when the linked worksheet (foreign state) changes.
        void this._extRev;
        return staleness(ctx(), this.model);
      },
      staleness() { return this.worksheetStaleness(); },

      // ── Auto-generation pipeline ──────────────────────────────

      scheduleAutoGenerate() {
        if (this._autoGenTimer) clearTimeout(this._autoGenTimer);
        this._autoGenTimer = setTimeout(() => {
          this._autoGenTimer = null;
          this.tryAutoGenerate();
        }, AUTO_GEN_DELAY);
      },

      tryAutoGenerate() {
        const m = this.model;
        if (!this.isConfigValid()) {
          if (m.design) { m.design = null; m.evaluation = null; }
          this.save();
          return;
        }
        const isOptimal = m.isOptimalType();
        try {
          if (isOptimal && m.sourceWorksheet) {
            const source = readSourceData(ctx(), m.sourceWorksheet, m.factors, m.responses);
            if (!source.ok) { m.design = null; m.evaluation = null; this.save(); return; }
            m.design = this.buildDesignFromSource(source);
          } else {
            m.design = generateDesign(m.factors, {
              designType: m.designType,
              selectedRes: m.selectedRes,
              randomize: m.options.randomize,
              centerPoints: m.options.centerPoints,
              replicates: m.options.replicates || 1,
              alphaType: m.options.alphaType,
              ccdCenterPoints: m.options.ccdCenterPoints,
              bbCenterPoints: m.options.bbCenterPoints,
              taguchiArray: m.options.taguchiArray || undefined,
              optimalRuns: m.options.optimalRuns || undefined,
              optimalActiveTerms: isOptimal ? m.getActiveTerms() : undefined,
              forbiddenVertices: m.options.forbiddenVertices,
            });
          }

          m.previewEdits = null;
          m.previewDirty = false;

          m.evaluation = evaluateDesign(
            m.design.codedMatrix, m.factors.length, m.design.p, m.design.designType, 0.05,
            { terms: m.modelTerms() },
          );

          // Adopt pre-feature worksheetRefs that lack a designSignature.
          if (m.worksheetRef && !m.worksheetRef.designSignature) {
            m.worksheetRef.designSignature = m.designSignature();
          }

          m.syncActivePhase();

          this.save();
        } catch (err) {
          ctx().notify(err.message, 'error');
        }
      },

      /**
       * Takes over the signatures of the current state, so the watchers do not
       * treat a restored state (load, example, viewed phase) as an edit.
       * @noagent lifecycle
       */
      adoptSignatures() {
        signatures.config = this.model.configSignature();
        signatures.schedule = this.model.scheduleSignature();
      },

      /** @returns {object[]} the sub-viewmodels, in attach order */
      _subViewModels() { return SUB_VIEWMODELS.map((key) => this[key]); },

      /** @returns {object} what every sub-viewmodel gets in attach() */
      _binding() {
        return {
          model: this.model,
          save: () => this.save(),
          watch: (getter, callback) => this.$watch(getter, callback),
          nextTick: (callback) => this.$nextTick(callback),
          rev: () => this._extRev,
          schedule: () => this.scheduleAutoGenerate(),
          adoptSignatures: () => this.adoptSignatures(),
        };
      },

      buildDesignFromSource(source) {
        const m = this.model;
        const factors = m.factors;
        const k = factors.length;
        const terms = m.getActiveTerms();
        const minR = minRunsForTerms(terms);
        const M = source.rowCount;
        const requested = m.options.optimalRuns || 0;
        const minNew = Math.max(0, minR - M);
        const addRuns = Math.max(requested, minNew);

        let newCoded = [];
        let newRows = [];
        if (addRuns > 0) {
          newCoded = augmentOptimalDesign(source.codedMatrix, k, addRuns, m.designType, {
            terms,
            levelCounts: factors.map(f => f.levels.length),
            categoricalFlags: factors.map(f => f.kind === 'categorical'),
            seed: Date.now(),
            forbiddenVertices: m.options.forbiddenVertices,
          });
          newRows = codedToActualRows(newCoded, factors);
        }

        const total = M + addRuns;
        const resLabel = optimalType.resolution(m);

        return {
          codedMatrix: [...source.codedMatrix, ...newCoded],
          actualMatrix: [...source.actualRows, ...newRows],
          runOrder: Array.from({ length: total }, (_, i) => i + 1),
          stdOrder: Array.from({ length: total }, (_, i) => i + 1),
          replicateIds: new Array(total).fill(1),
          resolution: resLabel,
          p: minR,
          designType: m.designType,
          sourceResponseSeeds: source.responseValues,
          sourceRowCount: M,
        };
      },

      forbidPreviewRow(rowIdx) {
        const coded = this.model.design && this.model.design.codedMatrix ? this.model.design.codedMatrix[rowIdx] : null;
        if (!Array.isArray(coded)) return;
        if (!this.model.addForbiddenVertex([...coded])) return;
        this.save();
      },

      // ── Output: bound state ───────────────────────────────────

      _resp() { void this._extRev; return readResponses(ctx(), this.model); },
      boundPct() { void this._extRev; return boundPct(ctx(), this.model); },
      boundProgressText() {
        const resp = this._resp();
        if (!resp) return '';
        return `${resp.filledCount} / ${resp.totalCount} ${_t('valuesFilled')} (${this.boundPct()}%)`;
      },
      boundComplete() { void this._extRev; return boundComplete(ctx(), this.model); },
      showPreview() {
        return this.staleness() !== 'bound' && Boolean(this.model.design && this.model.design.actualMatrix && this.model.design.actualMatrix.length);
      },

      // ── Datasheet create / recreate ───────────────────────────

      removeOldWorksheet(ref) {
        if (!ref) return;
        if (ref.experimentId) removeExperimentRecord(ctx(), ref.experimentId);
        const sm = ctx().stateManager;
        const phases = sm.get('phases') || {};
        for (const phaseId of Object.keys(phases)) {
          const arr = sm.get(`phases.${phaseId}`) || [];
          const next = arr.filter(i => i.instanceId !== ref.instanceId);
          if (next.length !== arr.length) sm.set(`phases.${phaseId}`, next);
        }
        sm.removeModuleState(ref.instanceId);
        ctx().eventBus.emit('module:removed', { moduleId: 'worksheet', instanceId: ref.instanceId });
      },
      createOrRecreateDatasheet() {
        const m = this.model;
        if (!m.design) return;
        if (this._previewGrid) this.capturePreviewEdits();
        applyEdits(this.model);
        if (m.worksheetRef) { this.removeOldWorksheet(m.worksheetRef); m.worksheetRef = null; }

        const expId = uid();
        const ref = createDesignWorksheet(ctx(), m.design, m.factors, m.responses, m.doeName, 'improve', expId);
        createExperimentRecord(ctx(), expId, m.design, m.factors, m.responses, m.doeName, ref, this.model.modelTerms());
        ref.designSignature = m.designSignature();
        m.worksheetRef = ref;
        m.previewEdits = null;
        m.previewDirty = false;
        this.save();
        ctx().eventBus.emit('module:activated', { instanceId: ref.instanceId });
      },
      openLinkedWorksheet() {
        const ref = this.model.worksheetRef;
        if (ref && ref.instanceId) ctx().eventBus.emit('module:activated', { instanceId: ref.instanceId });
      },

      // ── Preview DataGrid (imperative widget) ──────────────────

      mountPreviewGrid() {
        this.destroyPreviewGrid();
        const root = module._container;
        if (!root) return;
        const slot = root.querySelector('[data-ref="preview-grid"]');
        if (!slot) return;
        const m = this.model;
        if (!m.design || !m.design.actualMatrix || !m.design.actualMatrix.length) return;
        const cols = buildRunTable(this.model, _t);
        if (!cols.length) return;
        const isOptimal = m.isOptimalType();
        const self = this;
        this._previewGrid = new DataGrid(slot, {
          toast: ctx().notify || (() => {}),
          t: (key) => ctx().i18n.t(key),
          dialog: ctx().dialog,
          extraRowMenuItems: isOptimal
            ? (cell) => [{ label: _t('forbiddenContextAction'), action: () => self.forbidPreviewRow(cell.rowIdx) }]
            : undefined,
        });
        this._previewGrid.setData(cols);
        this._previewGrid.on('cell:changed', () => this.capturePreviewEdits());
        this._previewGrid.on('data:pasted', () => this.capturePreviewEdits());
      },
      destroyPreviewGrid() {
        if (this._previewGrid) { this._previewGrid.destroy && this._previewGrid.destroy(); this._previewGrid = null; }
      },
      capturePreviewEdits() {
        if (!this._previewGrid) return;
        const captured = captureEdits(this.model, this._previewGrid.getData());
        if (!captured) return;
        this.model.previewEdits = captured.edits;
        this.model.previewDirty = captured.dirty;
        this.save();
      },

      // ── Preview-grid remount signal ───────────────────────────
      // Cheap string identity for whether/which preview grid should be shown.
      // Watching this avoids re-running on every keystroke (deep toJSON).
      _previewSignal() {
        const m = this.model;
        if (!this.showPreview()) return '';
        const d = m.design;
        const sig = d && d.actualMatrix ? `${d.designType}:${d.actualMatrix.length}:${m.factors.length}:${m.responses.length}` : '';
        return sig;
      },

      // ── Lifecycle (per Alpine component) ──────────────────────

      init() {
        this._previewGrid = null;
        this._autoGenTimer = null;
        this._unsubs = [];
        this._renderGen = 0;

        // createModule spreads this data object into every Alpine build of the
        // component, and setState (example load) or a language change rebuilds
        // it. Fresh sub-viewmodels per build, assigned through the reactive
        // proxy so the template binds to the new objects.
        for (const key of SUB_VIEWMODELS) this[key] = new this[key].constructor(deps);
        const binding = this._binding();
        for (const vm of this._subViewModels()) vm.attach(binding);

        // Defaults — ensure ≥2 factors and ≥1 response on a fresh module.
        if (this.model.factors.length === 0) {
          this.model.addFactor('', '');
          this.model.addFactor('', '');
        }
        if (this.model.responses.length === 0) {
          this.model.addResponse();
        }

        const eb = ctx().eventBus;
        const onStateSaved = () => { /* output is reactive — no-op, kept for parity */ };
        eb.on('state:saved', onStateSaved);
        this._unsubs.push(() => eb.off('state:saved', onStateSaved));

        const onWorksheetChanged = ({ instanceId }) => {
          if (this.model.worksheetRef && instanceId === this.model.worksheetRef.instanceId) {
            // Foreign worksheet state changed → force the reactive output to
            // recompute progress/dispersion (Alpine can't track foreign state).
            this._extRev++;
            this.$nextTick(() => this.mountPreviewGrid());
          }
        };
        eb.on('worksheet:dataChanged', onWorksheetChanged);
        this._unsubs.push(() => eb.off('worksheet:dataChanged', onWorksheetChanged));

        // The standalone worksheet writes cell edits silently via setModuleState
        // (no worksheet:dataChanged on every cell). Re-read foreign state when the
        // planner tile is re-activated so the bound progress/dispersion refresh.
        const onActivated = ({ instanceId }) => {
          if (instanceId === ctx().instanceId) this._extRev++;
        };
        eb.on('module:activated', onActivated);
        this._unsubs.push(() => eb.off('module:activated', onActivated));

        // Remount the preview grid whenever the preview region's identity changes.
        this.$watch(() => this._previewSignal(), () => {
          this.$nextTick(() => this.mountPreviewGrid());
        });

        // Mount the preview grid for the restored state (if visible).
        this.$nextTick(() => this.mountPreviewGrid());

        // Auto-generation follows the model (spec 2026-10-25 E3): a change of
        // the config signature invalidates the design and schedules a new one,
        // a change of the responses only schedules. The restored state counts
        // as seen.
        this.adoptSignatures();
        this.$watch(() => this.model.configSignature(), (sig) => {
          // A remote apply (other tab) assigns in place and never re-runs
          // init(): the received design stays, only the signatures move on.
          if (module._applyingRemote) { this.adoptSignatures(); return; }
          if (sig === signatures.config) return;
          this.model.invalidateDesign();
          signatures.config = this.model.configSignature();
          this.scheduleAutoGenerate();
          this.save();
        });
        this.$watch(() => this.model.scheduleSignature(), (sig) => {
          if (module._applyingRemote) { this.adoptSignatures(); return; }
          if (sig === signatures.schedule) return;
          signatures.schedule = sig;
          this.scheduleAutoGenerate();
        });

        // If config is valid but no design yet, kick off auto-generation.
        if (!this.model.design && this.isConfigValid()) {
          this.scheduleAutoGenerate();
        }
      },

      destroy() {
        for (const vm of this._subViewModels()) vm.detach();
        if (this._autoGenTimer) clearTimeout(this._autoGenTimer);
        this._autoGenTimer = null;
        this.destroyPreviewGrid();
        for (const unsub of this._unsubs) unsub();
        this._unsubs = [];
      },
    };
  },
});

/**
 * Custom loadExample override. The generic createModule loadExample only does
 * setState; the DoE planner additionally provisions a source Worksheet for
 * augment examples (`sourceWorksheetData`) and wires the planner's
 * `sourceWorksheet` reference to it. Design (re-)generation happens
 * automatically: setState re-mounts the Alpine tree → the data-Fn `init()`
 * schedules auto-generation when the config is valid and no design is present.
 */
mod.loadExample = async function (payload) {
  if (!payload || !payload.data) return;
  const ctx = this._context;
  const t = (k) => ctx.i18n.t(k);

  // Confirm before overwriting a configured design.
  const current = this.getState();
  const model = current ? State.fromJSON(current) : null;
  if (model && typeof model.hasContent === 'function' && model.hasContent() && ctx?.dialog) {
    const ok = await ctx.dialog.confirm({ message: t('moduleHelp.confirmOverwrite'), danger: true });
    if (!ok) return;
  }

  // Work on a shallow copy so we don't mutate the caller's payload.
  const data = { ...payload.data };

  // Augment variant — provision a fresh Worksheet with the supplied data and
  // rewrite `sourceWorksheet` to reference it.
  if (data.sourceWorksheetData) {
    const wsData = data.sourceWorksheetData;
    delete data.sourceWorksheetData;
    const ref = provisionWorksheet(ctx, wsData);
    if (ref) data.sourceWorksheet = ref;
  }

  this.setState(data);
  ctx.stateManager.setModuleState(ctx.instanceId, this.getState());

  const lang = ctx.i18n.getLanguage();
  const title = payload.meta?.title?.[lang] || payload.meta?.title?.en || payload.meta?.id || '';
  ctx.notify?.(t('moduleHelp.exampleLoaded').replace('{title}', title), 'success');
};

export default mod;
