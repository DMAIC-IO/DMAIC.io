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
import { State, letter, PHASE_DECISIONS } from './doe-planner-model.js';
import { FactorsViewModel } from './viewmodel/factors.js';
import { DesignViewModel } from './viewmodel/design.js';
import { OptimalViewModel } from './viewmodel/optimal.js';
import { codedToActualRows, buildRunTable, captureEdits, applyEdits } from './doe-planner-runtable.js';
import { DataGrid } from '../../core/datagrid/datagrid.js';
import {
  generateDesign, minRunsForTerms,
  augmentOptimalDesign,
} from '../../engines/doe-planner-engine.js';
import { designOf, checkConfig } from './designs/index.js';
import optimalType from './designs/optimal.js';
import {
  createDesignWorksheet, createExperimentRecord, removeExperimentRecord,
  isWorksheetValid, sourceRowCount, readSourceData,
} from './doe-planner-worksheet.js';
import { readResponses, staleness, boundPct, boundComplete } from './doe-planner-responses.js';
import {
  evaluateDesign, computeEVOPEffects,
  computeDispersionAnalysis, powerDisplay,
} from './doe-planner-analysis.js';
import { provisionWorksheet } from '../../core/examples-registry.js';
import { uid } from '../../core/uid.js';

// ─── Constants ─────────────────────────────────────────────────────

const ALGO_ID_DEFF = 'd-efficiency';
const AUTO_GEN_DELAY = 600; // ms debounce for auto-generation

/** Data keys of the sub-viewmodels, in attach order. */
const SUB_VIEWMODELS = ['factors', 'design', 'optimal'];

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

      // ── Summary card ──────────────────────────────────────────

      summaryRuns() {
        const type = designOf(this.model);
        let runs = type ? type.runs(this.model) : '?';
        const reps = this.model.options.replicates || 1;
        if (typeof runs === 'number' && reps > 1) runs = runs * reps;
        return runs;
      },
      summaryRes() {
        const type = designOf(this.model);
        return type ? type.resolution(this.model) : '';
      },
      summaryGeneratedRuns() {
        return this.model.design && this.model.design.runOrder ? this.model.design.runOrder.length : 0;
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

      // ── Evaluation view-models ────────────────────────────────

      _eff() { return this.model.evaluation ? this.model.evaluation.efficiency : null; },
      effCards() {
        const eff = this._eff();
        if (!eff) return [];
        const mk = (label, val, tipKey) => {
          const cls = val >= 80 ? 'dmike-kpi--good' : val >= 50 ? 'dmike-kpi--warn' : 'dmike-kpi--bad';
          const helpKey = `modules.doe-planner.${tipKey}`;
          return { label, value: `${Math.round(val)  }%`, helpKey, algoId: ALGO_ID_DEFF, cls, barWidth: Math.min(100, val) };
        };
        return [
          mk(_t('dEff'), eff.dEfficiency, 'tipDEff'),
          mk(_t('aEff'), eff.aEfficiency, 'tipAEff'),
          mk(_t('gEff'), eff.gEfficiency, 'tipGEff'),
        ];
      },
      condNumValue() { const e = this._eff(); return e ? e.conditionNumber.toFixed(1) : ''; },
      maxLeverageValue() { const e = this._eff(); return e ? e.maxLeverage.toFixed(3) : ''; },

      _vifArr() {
        const ev = this.model.evaluation;
        return ev && Array.isArray(ev.vif) ? ev.vif : [];
      },
      vifMain() { return this._vifArr().filter(v => !v.term.includes('*')); },
      vifInter() { return this._vifArr().filter(v => v.term.includes('*')); },
      hasVif() { return this.vifMain().length > 0 || this.vifInter().length > 0; },
      vifRating(v) {
        return v <= 1.01 ? 'doe__vif-perfect' : v <= 5 ? 'doe__vif-ok' : v <= 10 ? 'doe__vif-warn' : 'doe__vif-bad';
      },

      _alias() {
        const ev = this.model.evaluation;
        return ev && ev.aliasStructure ? ev.aliasStructure : null;
      },
      hasAlias() {
        const al = this._alias();
        return Boolean(al && (al.aliases.length > 0 || (al.generatorStrings && al.generatorStrings.length > 0)));
      },
      aliasGenerators() { const al = this._alias(); return al && al.generatorStrings ? al.generatorStrings : []; },
      aliasRows() {
        const al = this._alias();
        if (!al || !al.aliases) return [];
        return al.aliases.map(a => ({ term: a.term, aliasedWith: a.aliasedWith.join(', ') }));
      },

      _power() {
        const ev = this.model.evaluation;
        return ev && Array.isArray(ev.power) ? ev.power : [];
      },
      hasPower() { return this._power().length > 0; },
      powerRows() { return this._power(); },
      powerRating(p) { return powerDisplay(p).rating; },
      powerPct(p) { return powerDisplay(p).text; },
      powerBarWidth(p) { return powerDisplay(p).width; },
      powerSaturated() { const p = this._power(); return p.length > 0 && p[0].power === null; },
      powerDescText() {
        const p = this._power();
        return _t('powerDesc', {
          n: (this.model.design && this.model.design.runOrder ? this.model.design.runOrder.length : '?'),
          dfError: (p[0] && p[0].dfError != null) ? p[0].dfError : '?',
          alpha: '0.05',
        });
      },

      // ── Dispersion analysis ───────────────────────────────────

      dispersion() {
        const m = this.model;
        if (this.staleness() !== 'bound') return null;
        const resp = this._resp();
        if (!resp || !resp.complete) return null;
        const type = designOf(m);
        if (type && !type.dispersion) return null;
        if (!m.design || !resp.values || !resp.values.length) return null;

        const idx = Math.min(m.analysisResponseIdx, resp.values.length - 1);
        const yRaw = resp.values[idx] || [];
        const y = yRaw.map(v => (typeof v === 'number' && isFinite(v)) ? v : NaN);
        const factorNames = m.factors.map((f, i) => f.name || letter(i));
        const isOptimal = m.isOptimalType();
        const result = computeDispersionAnalysis(m.design, y, factorNames, 0.05, {
          terms: isOptimal ? m.getActiveTerms() : undefined,
        });

        if (!result.ok) {
          if (result.reason === 'no-replicates' || result.reason === 'insufficient-data') {
            if ((m.options.replicates || 1) < 2) return null;
            return { noReplicates: true };
          }
          return null;
        }
        result._respName = m.responses[idx] && m.responses[idx].name ? m.responses[idx].name : `Y${  idx + 1}`;
        return result;
      },
      dispersionLeadText() {
        const r = this.dispersion();
        if (!r || r.noReplicates) return '';
        return _t('dispersionLead', {
          response: r._respName,
          min: r.minReplicates,
          max: r.maxReplicates,
          points: r.groups.length,
        });
      },
      dispersionModels() {
        const r = this.dispersion();
        if (!r || r.noReplicates) return [];
        const mk = (model, titleKey) => {
          if (!model || !model.coefficients) return { title: _t(titleKey), fitted: false };
          const rows = model.coefficients
            .filter(c => c.term !== 'Intercept')
            .map(c => ({ term: c.term, coefficient: c.coefficient, effect: c.effect, p: c.p, significant: c.significant }));
          const r2Text = `R² = ${(model.rSquared * 100).toFixed(1)}%, R²adj = ${(model.rSquaredAdj * 100).toFixed(1)}%`;
          return { title: _t(titleKey), fitted: true, rows, r2Text };
        };
        return [mk(r.meanModel, 'dispersionMeanModel'), mk(r.dispersionModel, 'dispersionLogVarModel')];
      },
      dispersionConclusion() {
        const r = this.dispersion();
        if (!r || r.noReplicates) return null;
        if (!r.dispersionModel) return null;
        if (r.significantDispersion.length === 0) return { none: true, cls: 'doe__dispersion-conclusion--none' };
        const items = r.significantDispersion.map(d => {
          if (d.prefer === 'low' || d.prefer === 'high') {
            return `${d.term}: ${_t(`dispersionPrefer_${  d.prefer}`)} (β = ${d.coefficient.toFixed(3)}, p = ${d.p.toFixed(4)})`;
          }
          return `${d.term}: ${_t('dispersionPreferInteraction')} (β = ${d.coefficient.toFixed(3)}, p = ${d.p.toFixed(4)})`;
        });
        return { none: false, items, cls: '' };
      },

      // ── EVOP / project mode ───────────────────────────────────

      projectModeChanged(event) {
        this.model.setProjectMode(event.target.checked);
        this.save();
      },
      timelineItemClass(idx) {
        const m = this.model;
        const ph = m.projectPhases[idx];
        const isCurrent = idx === m.activePhaseIdx ? 'doe__timeline-item--active' : '';
        const isDone = ph && ph.decision ? 'doe__timeline-item--done' : '';
        return (`${isCurrent  } ${  isDone}`).trim();
      },
      phaseLabel(ph) { return ph.doeName || `Phase ${ph.cycleNumber}`; },
      phaseDecIcon(ph) {
        return ph.decision === 'recenter' ? 'action.loop'
          : ph.decision === 'repeat' ? 'action.reset'
          : ph.decision === 'stop' ? 'status.ok' : '';
      },
      canStartNewPhase() {
        return this.model.canStartNewPhase();
      },
      newPhase() { this.model.startPhase({ recenter: false }); this.save(); },
      /**
       * The "next step" block shows once the active, undecided phase has all responses.
       * @noagent
       */
      showPhaseDecision() {
        const m = this.model;
        const ph = m.projectPhases[m.activePhaseIdx];
        return Boolean(m.projectMode && ph && !ph.decision && this.staleness() === 'bound' && this.boundComplete());
      },
      /**
       * Close the active EVOP phase after a confirm dialog: store its design and
       * response values, then re-center or repeat in a new phase, or stop.
       * @agent
       * @param {'recenter'|'repeat'|'stop'} decision
       * @returns {Promise<boolean>} true when the phase was closed, false when cancelled
       */
      async completePhase(decision) {
        if (!PHASE_DECISIONS.includes(decision)) throw new Error(`unknown decision: ${decision}`);
        const m = this.model;
        const ph = m.projectPhases[m.activePhaseIdx];
        if (!ph || ph.decision) return false;
        const ok = await ctx().dialog.confirm({ message: _t(`decisionConfirm_${decision}`) });
        if (!ok) return false;

        const resp = this._resp();
        this.model.closeActivePhase(decision, resp && resp.values && resp.values[0] ? resp.values[0] : undefined);
        if (decision !== 'stop') {
          this.model.startPhase({ recenter: decision === 'recenter' });
          this.scheduleAutoGenerate();
        }
        this.save();
        return true;
      },
      viewPhase(idx) {
        if (!this.model.viewPhase(idx)) return;
        this.adoptSignatures();
        this.save();
      },
      evopSummary() {
        const cycles = this.model.evopCycles();
        if (cycles.length === 0) return null;
        const evop = computeEVOPEffects(cycles);
        if (evop.effects.length === 0) return null;
        return evop;
      },
      evopMeanLabel() {
        const e = this.evopSummary();
        return e ? `${_t('evopMean')}: ${e.cycleMean.toFixed(4)}` : '';
      },
      evopErrorLimit(e) {
        return `±${  e.errorLimit === Infinity ? '∞' : e.errorLimit.toFixed(4)}`;
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

      // ── Transfer to Regression ────────────────────────────────

      algoNavigate(algoId, event) {
        if (event) event.stopPropagation();
        if (algoId && ctx().eventBus) ctx().eventBus.emit('lab:navigate', { algoId, tab: 'docs' });
      },
      transferToRegression() {
        const m = this.model;
        const ref = m.worksheetRef;
        if (!ref || !isWorksheetValid(ctx(), ref)) return;
        const sm = ctx().stateManager;
        const eventBus = ctx().eventBus;
        const colRefs = ref.factorColumnIds.map(colId => ({ instanceId: ref.instanceId, sheetId: ref.sheetId, columnId: colId }));
        const respColId = ref.responseColumnIds[m.analysisResponseIdx] || ref.responseColumnIds[0];
        const yKey = `${ref.instanceId}|${ref.sheetId}|${respColId}`;
        let phase = 'improve';
        for (const p of Object.keys(sm.get('phases') || {})) {
          const items = sm.get(`phases.${p}`) ?? [];
          if (items.some(i => i.instanceId === ctx().instanceId)) { phase = p; break; }
        }
        const regInstanceId = uid();
        const existing = sm.get(`phases.${phase}`) ?? [];
        sm.set(`phases.${phase}`, [...existing, { instanceId: regInstanceId, moduleId: 'regression', order: existing.length, state: {} }]);
        sm.setModuleState(regInstanceId, {
          colRefs, yKey, regType: 'polynomial', polyDegree: 1,
          designTerms: this.model.modelTerms(),
          confLevel: (sm.get('settings.confidenceLevel') ?? 95) / 100,
          alpha: Number(((100 - (sm.get('settings.confidenceLevel') ?? 95)) / 100).toFixed(4)),
          showCI: true, result: null, perXResults: null, activeXKey: null,
          activeTab: 'scatter', excludedTerms: [], coefSortByP: false,
        });
        eventBus.emit('module:added', { moduleId: 'regression', phase, instanceId: regInstanceId });
        ctx().notify(_t('transferSuccess'));
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
