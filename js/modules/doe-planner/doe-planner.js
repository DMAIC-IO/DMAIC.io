/**
 * D.Mike — DoE Planner Module (doe-planner.js)
 * Design of Experiments — split-panel layout with live auto-generation.
 * DMAIC phase: Improve.
 *
 * The model (doe-planner-model.js) owns the persisted state and the pure
 * logic: factor/response CRUD, EVOP phases, forbidden vertices, the
 * design signature for worksheet staleness and the config/schedule
 * signatures that drive the auto-generation. One pure module per design
 * type lives under designs/; the run table (doe-planner-runtable.js) and
 * the response state (doe-planner-responses.js) are pure too. The UI lives
 * in seven encapsulated sub-viewmodels under viewmodel/ — factors, design,
 * optimal, evaluation, analysis, evop, runs — that know neither each other
 * nor this shell; the template addresses them by namespace
 * (`factors.addFactor()`). They couple only through the model: this shell
 * watches configSignature() (invalidate and regenerate) and
 * scheduleSignature() (regenerate) and keeps lifecycle, bus subscriptions,
 * the external revision counter, the auto-generation and read().
 *
 * @agent  Vollständig über die Teil-Viewmodels steuerbar: Faktoren und
 *   Zielgrößen, Plantyp mit typeigener Auswahl und Optionen, Termliste,
 *   verbotene Ecken, Quell-Worksheet und Augment des optimalen Plans, Werte
 *   der Vorschau, Datenblatt, Übergabe an die Regression und das
 *   EVOP-Projekt. Der Oberfläche bleiben das Vorschau-Grid selbst, die
 *   Rückfrage vor dem Phasenabschluss und die Navigation (Algorithm Lab,
 *   Datenblatt öffnen). Werte in einem verknüpften Datenblatt schreibt der
 *   Agent mit worksheet.setCells.
 */

import { createModule } from '../../core/template-module.js';
import { readAgentState } from '../../core/agent/agent-read-mixin.js';
import { agentSnapshot } from './doe-planner-read.js';
import { State } from './doe-planner-model.js';
import { FactorsViewModel } from './viewmodel/factors.js';
import { DesignViewModel } from './viewmodel/design.js';
import { OptimalViewModel } from './viewmodel/optimal.js';
import { EvaluationViewModel } from './viewmodel/evaluation.js';
import { AnalysisViewModel } from './viewmodel/analysis.js';
import { EvopViewModel } from './viewmodel/evop.js';
import { RunsViewModel } from './viewmodel/runs.js';
import { codedToActualRows } from './doe-planner-runtable.js';
import {
  generateDesign, minRunsForTerms,
  augmentOptimalDesign,
} from '../../engines/doe-planner-engine.js';
import { checkConfig } from './designs/index.js';
import optimalType from './designs/optimal.js';
import { sourceRowCount, readSourceData } from './doe-planner-worksheet.js';
import {
  evaluateDesign,
} from './doe-planner-analysis.js';
import { provisionWorksheet } from '../../core/examples-registry.js';
import { requireText } from '../../core/agent/agent-argcheck.js';

// ─── Constants ─────────────────────────────────────────────────────

const AUTO_GEN_DELAY = 600; // ms debounce for auto-generation

/** Data keys of the sub-viewmodels, in attach order. */
const SUB_VIEWMODELS = ['factors', 'design', 'optimal', 'evaluation', 'analysis', 'evop', 'runs'];

/**
 * @typedef {object} DoeFactor
 * @property {number} id  stable id, the factorId of the factors.* actions
 * @property {string} name  the name, also the column name of the run table
 * @property {string} unit  the unit, '' without
 * @property {'continuous'|'categorical'} kind  numeric or named levels
 * @property {string[]} levels  the levels as typed, lowest first
 */

/**
 * @typedef {object} DoeResponse
 * @property {string} name  the name, also the column name of the run table
 * @property {string} unit  the unit, '' without
 */

/**
 * @typedef {object} DoeTypeParams
 * @property {object|null} selectedRes  the fractional factorial cell `{ k, runs, res, p }`, null without
 * @property {number|null} selectedPBIdx  the Plackett-Burman design, index into the table, null without
 */

/**
 * @typedef {object} DoeSummary
 * @property {number|null} runs  planned runs including replicates, null while unknown
 * @property {string} resolution  'III', 'IV', 'V', 'Full', 'CCD', … or ''
 * @property {number} generatedRuns  runs of the generated design, 0 without
 */

/**
 * @typedef {object} DoeRun
 * @property {number} run  run number in run order, the run of setRunValue
 * @property {number} std  standard order
 * @property {number} block  block
 * @property {number} replicate  replicate
 * @property {object} factors  setting per factor name
 * @property {object} responses  value per response name, null while empty
 */

/**
 * @typedef {object} DoeWorksheet
 * @property {string} instanceId  the worksheet instance; write its values with worksheet.setCells
 * @property {string} sheetId  the sheet
 * @property {boolean} stale  the plan changed since the datasheet was created
 * @property {number} filled  filled response cells
 * @property {number} total  response cells
 */

/**
 * @typedef {object} DoeEvaluation
 * @property {object|null} efficiency  `{ dEfficiency, aEfficiency, gEfficiency, conditionNumber, maxLeverage }`, efficiencies in percent
 * @property {object[]} vif  `{ term, vif }` per model term
 * @property {object|null} alias  `{ generators, aliases: [{ term, aliasedWith }] }`, null without aliasing
 * @property {object[]} power  `{ effectSize, power, dfError }` per effect size, power null without error degrees of freedom
 */

/**
 * @typedef {object} DoePhase
 * @property {number} cycleNumber  phase number, from 1
 * @property {string} doeName  the phase name
 * @property {string|null} decision  'recenter', 'repeat', 'stop' or null while open
 * @property {string|null} completedAt  ISO time of the decision, null while open
 * @property {Array<number|null>|null} yValues  first response per run at closing, null without
 */

/**
 * @typedef {object} DoeEvop
 * @property {boolean} projectMode  always true; evop is null outside project mode
 * @property {string} projectName  the project name
 * @property {number} activePhaseIdx  the phase shown, 0 = phase 1
 * @property {DoePhase[]} phases  all phases in order
 * @property {object|null} summary  cumulative EVOP effects, null before the first closed phase with values; the errorLimit of an effect is Infinity (not null) without a variance estimate
 */

/**
 * @typedef {object} AgentRead
 * @property {string} doeName  name of the plan, in project mode of the active phase
 * @property {''|'full'|'frac'|'pb'|'ccd'|'bb'|'taguchi'|'dopt'|'aopt'|'gopt'} designType  the design type
 * @property {DoeFactor[]} factors  the factors in order
 * @property {DoeResponse[]} responses  the responses in order, index = position
 * @property {object} options  randomize, centerPoints, replicates, alphaType, ccdCenterPoints, bbCenterPoints, taguchiArray, optimalRuns, optimalActiveTerms, forbiddenVertices
 * @property {DoeTypeParams} typeParams  the type's own selection
 * @property {boolean} valid  the configuration yields a design
 * @property {string|null} invalidReason  reason code while invalid ('tooFewFactors', 'duplicateFactorNames', 'incompleteFactor', 'noResponse', 'unnamedResponse', 'noDesignType', 'twoLevelOnly', 'noResolution', 'noPBDesign', 'bbUnavailable', 'noTaguchiArray', 'tooFewOptimalRuns'), null when valid
 * @property {DoeSummary} summary  planned and generated runs, resolution
 * @property {number} analysisResponseIdx  response of the dispersion analysis and the regression handover
 * @property {object|null} sourceWorksheet  `{ instanceId, sheetId }` of the source worksheet of an optimal design, or null
 * @property {DoeRun[]} runs  [bulk] the run table in run order; only with read({ fields: ['runs'] }); preview values come from runs.setRunValue
 * @property {DoeWorksheet|null} worksheet  the linked datasheet, null without
 * @property {DoeEvaluation|null} evaluation  evaluation of the generated design, null without
 * @property {DoeEvop|null} evop  the EVOP project, null outside project mode
 */

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

    // Signatures the auto-generation last acted on. A
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
      runs: new RunsViewModel(deps),

      // ── Transient UI state (never persisted) ──────────────────
      _autoGenTimer: null,
      _unsubs: [],
      // Reactive revision counter: bumped whenever EXTERNAL worksheet state
      // changes (the linked Datensammlung lives in another module's state, which
      // Alpine cannot track). Output readers touch it so the right panel
      // recomputes progress/dispersion on edit.
      _extRev: 0,

      // ── Formatting helpers ────────────────────────────────────
      /** @noagent view formatter */
      fmt2: (v) => Number(v).toFixed(2),
      /** @noagent view formatter */
      fmt4: (v) => Number(v).toFixed(4),
      /** @noagent view formatter */
      fmt6: (v) => Number(v).toFixed(6),

      /**
       * Den Lesezustand dieser Instanz liefern.
       * @agent
       * @param {object} [options] `{ fields?: string[] }`; runs kommt nur mit fields: ['runs']
       * @returns {AgentRead} Plan, Gültigkeit, Läufe, Datenblatt, Auswertung und EVOP-Projekt
       */
      read(options) {
        return readAgentState('doe-planner', agentSnapshot(this.model, ctx()), options);
      },

      /** @noagent persistence */
      save() { module._persist(this.model); },

      /**
       * Name the plan (in project mode: the active phase).
       * @agent
       * @param {string} name the name; "" clears it
       * @returns {void}
       * @throws {Error} if name is not a string
       */
      setDoeName(name) {
        this.model.doeName = requireText('name', name);
        this.save();
      },

      // ── Context-dependent helpers (need stateManager) ─────────

      /**
       * Type-independent rules, then the design type's own (designs/).
       * @noagent view transform
       */
      isConfigValid() {
        return checkConfig(this.model, { sourceRowCount: sourceRowCount(ctx(), this.model.sourceWorksheet) }).ok;
      },

      // ── Auto-generation pipeline ──────────────────────────────

      /** @noagent auto-generation */
      scheduleAutoGenerate() {
        if (this._autoGenTimer) clearTimeout(this._autoGenTimer);
        this._autoGenTimer = setTimeout(() => {
          this._autoGenTimer = null;
          this.tryAutoGenerate();
        }, AUTO_GEN_DELAY);
      },

      /** @noagent auto-generation */
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

      /** @noagent auto-generation */
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

      // ── Lifecycle (per Alpine component) ──────────────────────

      /** @noagent lifecycle */
      init() {
        this._autoGenTimer = null;
        this._unsubs = [];

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
            this.$nextTick(() => this.runs.mountPreviewGrid());
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

        // Auto-generation follows the model: a change of
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

      /** @noagent lifecycle */
      destroy() {
        for (const vm of this._subViewModels()) vm.detach();
        if (this._autoGenTimer) clearTimeout(this._autoGenTimer);
        this._autoGenTimer = null;
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
