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
import { State, letter } from './doe-planner-model.js';
import { codedToActualRows, buildRunTable, captureEdits, applyEdits } from './doe-planner-runtable.js';
import { DataGrid } from '../../core/datagrid/datagrid.js';
import { PB_DESIGNS, ALL_RUNS, K_RANGE, BOX_BEHNKEN } from './doe-planner-designs.js';
import {
  generateDesign, minRunsForTerms,
  augmentOptimalDesign,
} from '../../engines/doe-planner-engine.js';
import { DESIGNS, designOf, checkConfig } from './designs/index.js';
import { hasMultiLevel } from './designs/check.js';
import frac from './designs/frac.js';
import bb from './designs/bb.js';
import taguchi from './designs/taguchi.js';
import optimal from './designs/optimal.js';
import {
  termDisplay, enumerateTerms, activateTerm, deactivateTerm, termSortKey, designModelTerms,
} from '../../engines/doe-terms.js';
import {
  createDesignWorksheet, createExperimentRecord, removeExperimentRecord,
  isWorksheetValid, appendDoERowsToWorksheet, sourceRowCount,
  listProjectWorksheets, readSourceData,
} from './doe-planner-worksheet.js';
import { readResponses, staleness, boundPct, boundComplete } from './doe-planner-responses.js';
import {
  evaluateDesign, computeEVOPEffects, recenteredFactors,
  computeDispersionAnalysis, powerDisplay,
} from './doe-planner-analysis.js';
import { provisionWorksheet } from '../../core/examples-registry.js';
import { uid } from '../../core/uid.js';

// ─── Constants ─────────────────────────────────────────────────────

const DESIGN_TYPES = [
  { key: 'full',    formula: '2ᵏ' },
  { key: 'frac',    formula: '2⁽ᵏ⁻ᵖ⁾' },
  { key: 'pb',      formula: 'PB' },
  { key: 'ccd',     formula: 'CCD' },
  { key: 'bb',      formula: 'BB' },
  { key: 'taguchi', formula: 'OA' },
  { key: 'dopt',    formula: 'D-Opt' },
  { key: 'aopt',    formula: 'A-Opt' },
  { key: 'gopt',    formula: 'G-Opt' },
];

const ALGO_ID_DEFF = 'd-efficiency';
const AUTO_GEN_DELAY = 600; // ms debounce for auto-generation
const PHASE_DECISIONS = ['recenter', 'repeat', 'stop'];

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

    return {
      // ── Static view data ──────────────────────────────────────
      designTypes: DESIGN_TYPES,
      kRange: K_RANGE,
      allRuns: ALL_RUNS,
      pbDesigns: PB_DESIGNS,

      // ── Transient UI state (never persisted) ──────────────────
      _previewGrid: null,
      _autoGenTimer: null,
      _unsubs: [],
      _termGroupExpanded: {},
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

      factorLetter: (i) => letter(i),
      responseLetter: (i) => `Y${  i + 1}`,
      isCategorical: (f) => f.kind === 'categorical',
      factorKind: (f) => (f.kind === 'categorical' ? 'categorical' : 'continuous'),
      factorDisplayName: (f, fi) => (f.name && f.name.trim()) || letter(fi),

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
            { terms: this.modelTerms() },
          );

          // Adopt pre-feature worksheetRefs that lack a designSignature.
          if (m.worksheetRef && !m.worksheetRef.designSignature) {
            m.worksheetRef.designSignature = m.designSignature();
          }

          // Sync to active project phase (EVOP).
          if (m.projectMode && m.activePhaseIdx >= 0 && m.activePhaseIdx < m.projectPhases.length) {
            const ph = m.projectPhases[m.activePhaseIdx];
            ph.design = JSON.parse(JSON.stringify(m.design));
            ph.worksheetRef = m.worksheetRef ? { ...m.worksheetRef } : null;
            ph.evaluation = m.evaluation ? JSON.parse(JSON.stringify(m.evaluation)) : null;
            ph.factors = JSON.parse(JSON.stringify(m.factors));
            ph.responses = JSON.parse(JSON.stringify(m.responses));
            ph.doeName = m.doeName;
          }

          this.save();
        } catch (err) {
          ctx().notify(err.message, 'error');
        }
      },

      invalidateAndSchedule() {
        this.model.invalidateDesign();
        this.scheduleAutoGenerate();
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
        const resLabel = optimal.resolution(m);

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

      // ── Factor handlers ───────────────────────────────────────

      factorNameClass(f) {
        const n = f.name.trim().toLowerCase();
        if (!n) return '';
        const count = this.model.factors.filter(x => x.name.trim().toLowerCase() === n).length;
        return count > 1 ? 'field--error' : '';
      },
      factorNameTitle(f) {
        return this.factorNameClass(f) ? _t('duplicateFactorError') : '';
      },
      factorUnitTitle(f) {
        return this.isCategorical(f) ? _t('factorUnitCategoricalDisabled') : '';
      },
      levelPlaceholder(f) {
        return this.isCategorical(f) ? _t('factorLevelLabelPlaceholder') : '…';
      },

      factorNameChanged(_f) {
        this.invalidateAndSchedule();
        this.save();
      },
      factorUnitChanged(_f) {
        this.invalidateAndSchedule();
        this.save();
      },
      factorKindChanged(f) {
        f.kind = f.kind === 'categorical' ? 'categorical' : 'continuous';
        if (f.kind === 'categorical') f.unit = '';
        this.invalidateAndSchedule();
        this.save();
      },
      levelChanged(_f) {
        this.invalidateAndSchedule();
        this.save();
      },
      addFactor() {
        this.model.addFactor('', '');
        if (Array.isArray(this.model.options.forbiddenVertices) && this.model.options.forbiddenVertices.length) {
          this.model.options.forbiddenVertices = [];
        }
        this.save();
      },
      removeFactor(id) {
        this.model.removeFactor(id);
        this.invalidateAndSchedule();
        this.save();
      },
      insertLevel(fId, at) {
        this.model.insertLevel(fId, at);
        this.invalidateAndSchedule();
        this.save();
      },
      removeLevel(fId, li) {
        this.model.removeLevel(fId, li);
        this.invalidateAndSchedule();
        this.save();
      },

      // ── Response handlers ─────────────────────────────────────

      responseNameChanged(_idx) { this.save(); this.scheduleAutoGenerate(); },
      responseUnitChanged(_idx) { this.invalidateAndSchedule(); this.save(); },
      addResponse() { this.model.addResponse(); this.save(); },
      removeResponse(idx) { this.model.removeResponse(idx); this.invalidateAndSchedule(); this.save(); },

      // ── Design-type selection ─────────────────────────────────

      designOptDisabled(dt) {
        return Boolean(DESIGNS[dt.key] && DESIGNS[dt.key].twoLevelOnly) && hasMultiLevel(this.model);
      },
      designOptClass(dt) {
        const active = this.model.designType === dt.key ? 'doe__design-opt--active' : '';
        const disabled = this.designOptDisabled(dt) ? 'doe__design-opt--disabled' : '';
        return (`${active  } ${  disabled}`).trim();
      },
      designOptTip(dt) {
        return this.designOptDisabled(dt) ? _t('tipTwoLevelOnly') : _t(`tip_${  dt.key}`);
      },
      fullIsProduct() {
        return hasMultiLevel(this.model);
      },
      fullProductFormula() {
        return this.model.factors.map(f => f.levels.length).join('×');
      },

      selectDesignType(type) {
        const m = this.model;
        if (this.designOptDisabled({ key: type })) return;
        m.designType = type;
        m.selectedRes = null;
        m.selectedPBIdx = null;
        if (m.isOptimalType() && !m.options.optimalRuns) {
          m.options.optimalRuns = optimal.minNewRuns(m, { sourceRowCount: this.sourceRowCount() }) + 2;
        }
        this.invalidateAndSchedule();
        this.save();
      },

      // ── Recommendation ────────────────────────────────────────

      recommendation() {
        const k = this.model.factors.length;
        const has3 = this.model.factors.some(f => f.levels.length >= 3);
        if (k <= 4 && !has3) return 'full';
        if (k <= 6 && !has3) return 'frac';
        if (k >= 7 && !has3) return 'pb';
        if (k >= 3 && k <= 7 && has3) return 'bb';
        if (has3) return 'taguchi';
        return '';
      },
      recommendationText() {
        const rec = this.recommendation();
        const map = { full: 'recFull', frac: 'recFrac', pb: 'recPB', bb: 'recBB', taguchi: 'recTaguchi' };
        return _t(map[rec] || 'recFull', { k: this.model.factors.length });
      },
      applyRecommendation() {
        const rec = this.recommendation();
        if (!rec) return;
        this.model.designType = rec;
        this.model.selectedRes = null;
        this.model.selectedPBIdx = null;
        this.invalidateAndSchedule();
        this.save();
      },

      // ── Resolution table ──────────────────────────────────────

      resCellClass(k, runs) { return frac.cellClass(k, runs, this.model); },
      resCellData(k, runs, which) { return frac.cellData(k, runs, which, this.model); },
      resCellLabel(k, runs) { return frac.cellLabel(k, runs, _t); },
      resCellClick(k, runs) {
        const d = frac.def(k, runs);
        if (!d || k !== this.model.factors.length) return;
        this.model.selectedRes = { k, runs, res: d.res, p: d.p };
        this.invalidateAndSchedule();
        this.save();
      },
      resInfoText() {
        const s = this.model.selectedRes;
        if (!s) return _t('resSelectPrompt');
        return `${s.k} ${_t('factors')} · ${s.runs} Runs · ${_t('resolution')} ${s.res}`;
      },
      resAliasDetail() { return frac.aliasDetail(this.model); },

      // ── PB ────────────────────────────────────────────────────

      pbInfoText() {
        return this.model.selectedPBIdx !== null
          ? `${PB_DESIGNS[this.model.selectedPBIdx].label} ${_t('factors')}`
          : _t('pbSelectPrompt');
      },
      selectPB(idx) {
        this.model.selectedPBIdx = idx;
        this.invalidateAndSchedule();
        this.save();
      },

      // ── Box-Behnken ───────────────────────────────────────────

      bbAvailable() { return bb.available(this.model); },
      bbDetailText() {
        const k = this.model.factors.length;
        const pairs = BOX_BEHNKEN[k];
        return _t('bbDetail', { k, pairs: pairs.length, runs: bb.runs(this.model) });
      },
      bbWarningText() {
        return _t('bbNotAvailable', { k: this.model.factors.length, min: 3, max: 7 });
      },

      // ── Taguchi ───────────────────────────────────────────────

      taguchiCandidatesList() { return taguchi.candidates(this.model); },
      taguchiFirstLevels() { const lc = taguchi.levelCounts(this.model); return lc.length ? lc[0] : 0; },
      taguchiInfoText() { return _t(taguchi.levelsKey(this.model)); },
      taguchiSelected() { return taguchi.selected(this.model); },
      selectTaguchi(name) {
        this.model.options.taguchiArray = name;
        this.invalidateAndSchedule();
        this.save();
      },

      // ── Optimal options ───────────────────────────────────────

      optimalMinRuns() { return optimal.minRuns(this.model); },
      optimalMinNew() { return optimal.minNewRuns(this.model, { sourceRowCount: this.sourceRowCount() }); },
      optimalRunsValid() { return (this.model.options.optimalRuns || 0) >= this.optimalMinNew(); },
      optimalRunsLabel() {
        return this.sourceRowCount() > 0 ? _t('optimalRunsNew') : _t('optimalRuns');
      },
      optimalRunsHint() {
        const minNew = this.optimalMinNew();
        const M = this.sourceRowCount();
        return M > 0 ? _t('optimalMinRunsNew', { min: minNew, m: M }) : _t('optimalMinRuns', { min: minNew });
      },
      optimalTooFewText() {
        const minNew = this.optimalMinNew();
        const M = this.sourceRowCount();
        return M > 0 ? _t('optimalTooFewRunsNew', { min: minNew, m: M }) : _t('optimalTooFewRuns', { min: minNew });
      },
      optimalRunsChanged(event) {
        const minNew = this.optimalMinNew();
        this.model.options.optimalRuns = Math.max(minNew, parseInt(event.target.value, 10) || minNew);
        this.invalidateAndSchedule();
        this.save();
      },

      // ── Term list ─────────────────────────────────────────────

      termGroups() { return enumerateTerms(this.model.factors.length); },
      _factorNames() {
        return this.model.factors.map((f, i) => (f && f.name && f.name.trim()) || letter(i));
      },
      _activeSet() { return new Set(this.model.getActiveTerms()); },
      termActive(id) { return this._activeSet().has(id); },
      termLabel(id) { return termDisplay(id, this._factorNames()); },
      termGroupExpanded(gi, g) {
        const isHigh = g.kind === 'ix' && g.order >= 3;
        const flag = this._termGroupExpanded[gi];
        return flag === undefined ? !isHigh : flag;
      },
      termGroupTitle(g) {
        if (g.kind === 'main') return _t('termGroupMain');
        if (g.kind === 'quad') return _t('termGroupQuad');
        return _t('termGroupNFI', { n: g.order });
      },
      termGroupCount(g) {
        const set = this._activeSet();
        const on = g.ids.filter(id => set.has(id)).length;
        return `(${on}/${g.ids.length})`;
      },
      termChipClass(g, id) {
        const on = this._activeSet().has(id) ? ' doe__term-chip--on' : '';
        const locked = g.kind === 'main' ? ' doe__term-chip--locked' : '';
        return (`doe__term-chip${  on  }${locked}`).trim();
      },
      toggleTerm(id, event) {
        if (!id) return;
        const m = this.model;
        const active = new Set(m.getActiveTerms());
        if (event.target.checked) activateTerm(active, id);
        else deactivateTerm(active, id);
        m.options.optimalActiveTerms = [...active].sort((a, b) => termSortKey(a).localeCompare(termSortKey(b)));
        optimal.raiseRunsToMinimum(m, { sourceRowCount: this.sourceRowCount() });
        this.invalidateAndSchedule();
        this.save();
      },
      toggleTermGroup(gi) {
        const groups = enumerateTerms(this.model.factors.length);
        const g = groups[gi];
        const isHigh = g && g.kind === 'ix' && g.order >= 3;
        const current = this._termGroupExpanded[gi];
        const cur = current === undefined ? !isHigh : current;
        this._termGroupExpanded[gi] = !cur;
      },

      // ── Forbidden vertices ────────────────────────────────────

      forbiddenList() {
        return Array.isArray(this.model.options.forbiddenVertices) ? this.model.options.forbiddenVertices : [];
      },
      forbiddenCoded(f, li) {
        const nLv = f.levels.length;
        return nLv === 1 ? 0 : -1 + (2 * li) / (nLv - 1);
      },
      _codedToLabel(fi, coded) {
        const f = this.model.factors[fi];
        if (!f) return String(coded);
        const nLv = f.levels.length;
        if (nLv <= 1) return f.levels[0] ?? '';
        const idx = Math.round((coded + 1) * (nLv - 1) / 2);
        const clamped = Math.max(0, Math.min(nLv - 1, idx));
        return f.levels[clamped] ?? String(coded);
      },
      forbiddenRuleText(pattern) {
        return this.model.factors.map((f, fi) => {
          const v = pattern ? pattern[fi] : null;
          const name = (f.name || letter(fi));
          const label = v == null ? _t('forbiddenAny') : this._codedToLabel(fi, v);
          return `${name} = ${label}`;
        }).join(' ∧ ');
      },
      addForbiddenVertex() {
        const root = module._container;
        if (!root) return;
        const k = this.model.factors.length;
        const pattern = new Array(k).fill(null);
        let anyBound = false;
        for (let fi = 0; fi < k; fi++) {
          const sel = root.querySelector(`.doe__forbidden-input[data-factor-idx="${fi}"]`);
          const raw = sel ? sel.value : '';
          if (raw === '') continue;
          const num = parseFloat(raw);
          if (Number.isFinite(num)) { pattern[fi] = num; anyBound = true; }
        }
        if (!anyBound) { ctx().notify && ctx().notify(_t('forbiddenHint'), 'info'); return; }
        const list = Array.isArray(this.model.options.forbiddenVertices) ? [...this.model.options.forbiddenVertices] : [];
        const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
        if (list.some(p => eq(p, pattern))) return;
        list.push(pattern);
        this.model.options.forbiddenVertices = list;
        this.invalidateAndSchedule();
        this.save();
      },
      removeForbiddenRule(idx) {
        const list = Array.isArray(this.model.options.forbiddenVertices) ? [...this.model.options.forbiddenVertices] : [];
        if (idx < 0 || idx >= list.length) return;
        list.splice(idx, 1);
        this.model.options.forbiddenVertices = list;
        this.invalidateAndSchedule();
        this.save();
      },
      forbidPreviewRow(rowIdx) {
        const coded = this.model.design && this.model.design.codedMatrix ? this.model.design.codedMatrix[rowIdx] : null;
        if (!Array.isArray(coded)) return;
        const pattern = [...coded];
        const list = Array.isArray(this.model.options.forbiddenVertices) ? [...this.model.options.forbiddenVertices] : [];
        const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
        if (list.some(p => eq(p, pattern))) return;
        list.push(pattern);
        this.model.options.forbiddenVertices = list;
        this.invalidateAndSchedule();
        this.save();
      },

      // ── Source worksheet picker ───────────────────────────────

      sourceWorksheetKey() {
        const s = this.model.sourceWorksheet;
        return s ? `${s.instanceId}::${s.sheetId}` : '';
      },
      sourceWorksheetOptions() {
        const sheets = listProjectWorksheets(ctx());
        const own = this.model.worksheetRef ? this.model.worksheetRef.instanceId : null;
        const ownSheet = this.model.worksheetRef ? this.model.worksheetRef.sheetId : null;
        return sheets
          .filter(s => !(s.instanceId === own && s.sheetId === ownSheet))
          .map(s => ({ key: `${s.instanceId}::${s.sheetId}`, label: `${s.name} (${s.rowCount})` }));
      },
      sourceMappingStatus() {
        const current = this.model.sourceWorksheet;
        if (!current) return null;
        const result = readSourceData(ctx(), current, this.model.factors, this.model.responses);
        if (result.ok) {
          let text = _t('sourceMappingOk', { rows: result.rowCount, responses: result.mappedResponseCount });
          if (result.skippedRows) text += ` ${  _t('sourceSkipped', { n: result.skippedRows })}`;
          return { ok: true, text };
        }
        const reason = result.missingFactors && result.missingFactors.length
          ? _t('sourceMissingFactors', { names: result.missingFactors.join(', ') })
          : _t('sourceMappingErrorGeneric');
        return { ok: false, text: reason };
      },
      sourceWorksheetChanged(event) {
        const v = event.target.value;
        const m = this.model;
        if (!v) m.sourceWorksheet = null;
        else {
          const [instanceId, sheetId] = v.split('::');
          m.sourceWorksheet = { instanceId, sheetId };
        }
        if (m.isOptimalType()) optimal.raiseRunsToMinimum(m, { sourceRowCount: this.sourceRowCount() });
        this.invalidateAndSchedule();
        this.save();
      },

      // ── Design parameters ─────────────────────────────────────

      showCenterPointsOption() {
        const type = designOf(this.model);
        return !type || type.centerPoints;
      },
      randomizeChanged() { this.invalidateAndSchedule(); this.save(); },
      centerPointsChanged() { this.invalidateAndSchedule(); this.save(); },
      replicatesChanged(event) {
        this.model.options.replicates = Math.max(1, Math.min(10, parseInt(event.target.value, 10) || 1));
        this.invalidateAndSchedule();
        this.save();
      },
      alphaTypeChanged() { this.invalidateAndSchedule(); this.save(); },
      ccdCpChanged(event) {
        this.model.options.ccdCenterPoints = Math.max(1, parseInt(event.target.value, 10) || 3);
        this.invalidateAndSchedule();
        this.save();
      },
      bbCpChanged(event) {
        this.model.options.bbCenterPoints = Math.max(1, parseInt(event.target.value, 10) || 3);
        this.invalidateAndSchedule();
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
        const m = this.model;
        m.projectMode = event.target.checked;
        if (m.projectMode && m.projectPhases.length === 0) {
          m.projectPhases.push({
            cycleNumber: 1,
            doeName: m.doeName || `${m.projectName || 'Projekt'} - Phase 1`,
            factors: JSON.parse(JSON.stringify(m.factors)),
            responses: JSON.parse(JSON.stringify(m.responses)),
            designType: m.designType,
            options: { ...m.options },
            design: null, worksheetRef: null, evaluation: null,
            decision: null, completedAt: null,
          });
          m.activePhaseIdx = 0;
        }
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
        const m = this.model;
        if (m.projectPhases.some(ph => ph.decision === 'stop')) return false;
        return m.activePhaseIdx === -1 || (m.projectPhases[m.activePhaseIdx] && m.projectPhases[m.activePhaseIdx].decision);
      },
      newPhase() { this.startNewPhase(false); this.save(); },
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

        ph.decision = decision;
        ph.completedAt = new Date().toISOString();
        ph.design = m.design ? JSON.parse(JSON.stringify(m.design)) : null;
        ph.worksheetRef = m.worksheetRef ? { ...m.worksheetRef } : null;
        ph.evaluation = m.evaluation ? JSON.parse(JSON.stringify(m.evaluation)) : null;
        const resp = this._resp();
        if (resp && resp.values && resp.values[0]) ph.yValues = [...resp.values[0]];

        if (decision !== 'stop') {
          this.startNewPhase(decision === 'recenter');
          this.scheduleAutoGenerate();
        }
        this.save();
        return true;
      },
      startNewPhase(recenter) {
        const m = this.model;
        const prevPhase = m.projectPhases[m.activePhaseIdx];
        const newCycleNum = m.projectPhases.length + 1;
        let newFactors;
        if (recenter && prevPhase && prevPhase.yValues && m.design) {
          const cycles = m.projectPhases
            .filter(ph => ph.yValues && ph.design)
            .map(ph => ({
              cycleNumber: ph.cycleNumber,
              codedMatrix: ph.design.codedMatrix,
              y: ph.yValues || [],
              factorNames: (ph.factors || []).map((f, i) => f.name || letter(i)),
            }))
            .filter(c => c.y.length > 0);
          const evop = computeEVOPEffects(cycles);
          newFactors = recenteredFactors(m.factors, evop.bestPointCoded);
        } else {
          newFactors = JSON.parse(JSON.stringify(m.factors));
        }
        m.doeName = `${m.projectName} - Phase ${newCycleNum}`;
        m.factors = newFactors;
        m.design = null;
        m.worksheetRef = null;
        m.evaluation = null;
        m.projectPhases.push({
          cycleNumber: newCycleNum,
          doeName: m.doeName,
          factors: JSON.parse(JSON.stringify(newFactors)),
          responses: JSON.parse(JSON.stringify(m.responses)),
          designType: m.designType,
          options: { ...m.options },
          design: null, worksheetRef: null, evaluation: null,
          decision: null, completedAt: null,
        });
        m.activePhaseIdx = m.projectPhases.length - 1;
      },
      viewPhase(idx) {
        const m = this.model;
        if (idx < 0 || idx >= m.projectPhases.length) return;
        const ph = m.projectPhases[idx];
        m.activePhaseIdx = idx;
        m.doeName = ph.doeName || '';
        m.factors = JSON.parse(JSON.stringify(ph.factors || []));
        m.responses = JSON.parse(JSON.stringify(ph.responses || []));
        m.designType = ph.designType || 'full';
        m.options = { ...m.options, ...(ph.options || {}) };
        m.design = ph.design ? JSON.parse(JSON.stringify(ph.design)) : null;
        m.worksheetRef = ph.worksheetRef ? { ...ph.worksheetRef } : null;
        m.evaluation = ph.evaluation ? JSON.parse(JSON.stringify(ph.evaluation)) : null;
        this.save();
      },
      _evopCycles() {
        return this.model.projectPhases
          .filter(ph => ph.yValues && ph.design)
          .map(ph => ({
            cycleNumber: ph.cycleNumber,
            codedMatrix: ph.design.codedMatrix,
            y: ph.yValues || [],
            factorNames: (ph.factors || []).map((f, i) => f.name || letter(i)),
          }))
          .filter(c => c.y.length > 0);
      },
      evopSummary() {
        const cycles = this._evopCycles();
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
        createExperimentRecord(ctx(), expId, m.design, m.factors, m.responses, m.doeName, ref, this.modelTerms());
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

      // ── Augment ───────────────────────────────────────────────

      clickAugment() {
        const root = module._container;
        const input = root ? root.querySelector('.doe__augment-runs-input') : null;
        const n = parseInt(input ? input.value : '', 10);
        if (!Number.isFinite(n) || n <= 0) { ctx().notify(_t('augmentInvalidCount'), 'error'); return; }
        this.augmentDesign(n);
      },
      augmentDesign(addRuns) {
        const m = this.model;
        if (!m.design || !m.worksheetRef) return;
        if (!isWorksheetValid(ctx(), m.worksheetRef)) return;
        if (!m.isOptimalType()) return;
        const n = Math.floor(addRuns);
        if (!Number.isFinite(n) || n <= 0) return;
        try {
          const factors = m.factors;
          const k = factors.length;
          const lc = factors.map(f => f.levels.length);
          const cf = factors.map(f => f.kind === 'categorical');
          const terms = m.getActiveTerms();
          const newCoded = augmentOptimalDesign(m.design.codedMatrix, k, n, m.designType, {
            terms, levelCounts: lc, categoricalFlags: cf, seed: Date.now(),
            forbiddenVertices: m.options.forbiddenVertices,
          });
          const newRows = codedToActualRows(newCoded, factors);
          const oldN = m.design.codedMatrix.length;
          const newRunOrders = Array.from({ length: n }, (_, i) => oldN + i + 1);
          const newStdOrders = Array.from({ length: n }, (_, i) => oldN + i + 1);
          m.design.codedMatrix = [...m.design.codedMatrix, ...newCoded];
          m.design.actualMatrix = [...m.design.actualMatrix, ...newRows];
          m.design.runOrder = [...(m.design.runOrder || []), ...newRunOrders];
          m.design.stdOrder = [...(m.design.stdOrder || []), ...newStdOrders];
          m.design.replicateIds = [...(m.design.replicateIds || []), ...new Array(n).fill(1)];
          m.evaluation = evaluateDesign(m.design.codedMatrix, k, m.design.p, m.design.designType, 0.05, { terms: this.modelTerms() });
          appendDoERowsToWorksheet(ctx(), m.worksheetRef, factors, newRows);
          if (m.worksheetRef.experimentId) {
            createExperimentRecord(ctx(), m.worksheetRef.experimentId, m.design, m.factors, m.responses, m.doeName, m.worksheetRef, this.modelTerms());
          }
          m.worksheetRef.designSignature = m.designSignature();
          this.save();
          ctx().notify(_t('augmentSuccess', { n }), 'success');
        } catch (err) {
          ctx().notify(err.message, 'error');
        }
      },

      // ── Transfer to Regression ────────────────────────────────

      algoNavigate(algoId, event) {
        if (event) event.stopPropagation();
        if (algoId && ctx().eventBus) ctx().eventBus.emit('lab:navigate', { algoId, tab: 'docs' });
      },
      /** Canonical model terms of the current design (see designModelTerms). */
      modelTerms() {
        const m = this.model;
        return designModelTerms(m.design.codedMatrix, {
          activeTerms: m.isOptimalType() ? m.getActiveTerms() : undefined,
          categoricalFlags: m.factors.map(f => f.kind === 'categorical'),
        });
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
          designTerms: this.modelTerms(),
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
        this._termGroupExpanded = {};
        this._renderGen = 0;

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

        // If config is valid but no design yet, kick off auto-generation.
        if (!this.model.design && this.isConfigValid()) {
          this.scheduleAutoGenerate();
        }
      },

      destroy() {
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
