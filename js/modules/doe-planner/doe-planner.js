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
import { DataGrid } from '../../core/datagrid/datagrid.js';
import { FRAC, PB_DESIGNS, ALL_RUNS, K_RANGE, BOX_BEHNKEN, TAGUCHI } from './doe-planner-designs.js';
import {
  generateDesign, taguchiCandidates, minRunsForTerms,
  augmentOptimalDesign, formatValue, codedToActual,
} from '../../engines/doe-planner-engine.js';
import {
  termDisplay, enumerateTerms, activateTerm, deactivateTerm, termSortKey,
} from '../../engines/doe-terms.js';
import {
  createDesignWorksheet, createExperimentRecord, removeExperimentRecord,
  readResponsesFromWorksheet, isWorksheetValid, appendDoERowsToWorksheet,
  listProjectWorksheets, readSourceData,
} from './doe-planner-worksheet.js';
import {
  evaluateDesign, computeEVOPEffects, recenteredFactors,
  computeAliasStructure, computeDispersionAnalysis,
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
const OPTIMAL = ['dopt', 'aopt', 'gopt'];
const AUTO_GEN_DELAY = 600; // ms debounce for auto-generation

/** Polynomial term count for k factors at a given degree (intercept incl.). */
function polyTermCount(k, degree) {
  let p = 1 + k;
  if (degree >= 2) { p += k; p += k * (k - 1) / 2; }
  if (degree >= 3) { p += k; p += k * (k - 1); p += k * (k - 1) * (k - 2) / 6; }
  return p;
}

function maxFeasiblePolyDegree(n, k) {
  for (let d = 3; d >= 2; d--) { if (n > polyTermCount(k, d)) return d; }
  return 1;
}

const letter = (i) => String.fromCharCode(65 + i);

const mod = createModule({
  config: {
    id: 'doe-planner',
    engine: 'alpine',
    phase: 'improve',
    allowedPhases: ['measure', 'analyze', 'improve', 'control'],
    icon: 'grid',
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

      sourceRowCount() {
        const ref = this.model.sourceWorksheet;
        if (!ref || !ref.instanceId) return 0;
        const ws = ctx().stateManager.getModuleState(ref.instanceId);
        const sheet = ws && ws.sheets ? ws.sheets.find(s => s.id === ref.sheetId) : null;
        return (sheet && sheet.state && sheet.state.rowCount) || 0;
      },

      isConfigValid() {
        const m = this.model;
        if (m.factors.length < 2) return false;
        if (m.hasDuplicateFactorNames()) return false;
        if (!m.factors.every(f =>
          f.name.trim() !== '' &&
          f.levels.length >= 2 && f.levels[0] !== '' && f.levels[f.levels.length - 1] !== ''
        )) return false;
        if (m.responses.length < 1) return false;
        if (!m.responses.every(r => r.name.trim() !== '')) return false;
        if (!m.designType) return false;
        const has3Plus = m.factors.some(f => f.levels.length > 2);
        if (has3Plus && (m.designType === 'frac' || m.designType === 'pb')) return false;
        if (m.designType === 'frac' && !m.selectedRes) return false;
        if (m.designType === 'pb' && m.selectedPBIdx === null) return false;
        if (m.designType === 'bb' && !BOX_BEHNKEN[m.factors.length]) return false;
        if (m.designType === 'taguchi' && !m.options.taguchiArray) return false;
        if (OPTIMAL.includes(m.designType)) {
          const minRuns = minRunsForTerms(m.getActiveTerms());
          const M = this.sourceRowCount();
          const minNew = M > 0 ? Math.max(1, minRuns - M) : minRuns;
          const nNew = m.options.optimalRuns || 0;
          if (nNew < minNew) return false;
        }
        return true;
      },

      worksheetStaleness() {
        // Touch the external-revision counter so Alpine re-evaluates the output
        // regions when the linked worksheet (foreign state) changes.
        void this._extRev;
        const m = this.model;
        if (!m.worksheetRef || !isWorksheetValid(ctx(), m.worksheetRef)) return 'unbound';
        const cur = m.designSignature();
        const saved = m.worksheetRef.designSignature || null;
        if (cur && saved && cur === saved) return 'bound';
        return 'stale';
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
            { terms: isOptimal ? m.getActiveTerms() : undefined },
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
          newRows = this.codedToWorksheetRows(newCoded, factors);
        }

        const total = M + addRuns;
        const resLabel = m.designType === 'dopt' ? 'D-Opt' : m.designType === 'aopt' ? 'A-Opt' : 'G-Opt';

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

      codedToWorksheetRows(codedRows, factors) {
        return codedRows.map(row => row.map((c, fi) => {
          const f = factors[fi];
          const nLv = f.levels.length;
          if (f.kind === 'categorical') {
            const idx = Math.round((c + 1) * (nLv - 1) / 2);
            const clamped = Math.max(0, Math.min(nLv - 1, idx));
            return f.levels[clamped] ?? '';
          }
          if (nLv <= 2) {
            const lo = parseFloat(f.levels[0]) || -1;
            const hi = parseFloat(f.levels[nLv - 1]) || 1;
            return formatValue(codedToActual(c, lo, hi));
          }
          const idx = Math.round((c + 1) * (nLv - 1) / 2);
          const clamped = Math.max(0, Math.min(nLv - 1, idx));
          const val = parseFloat(f.levels[clamped]);
          return isFinite(val)
            ? formatValue(val)
            : formatValue(codedToActual(c, parseFloat(f.levels[0]) || -1, parseFloat(f.levels[nLv - 1]) || 1));
        }));
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
        const has3Plus = this.model.factors.some(f => f.levels.length > 2);
        return has3Plus && (dt.key === 'frac' || dt.key === 'pb');
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
        return this.model.factors.some(f => f.levels.length > 2);
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
        if (OPTIMAL.includes(type) && !m.options.optimalRuns) {
          const minR = minRunsForTerms(m.getActiveTerms());
          const M = this.sourceRowCount();
          const minNew = M > 0 ? Math.max(1, minR - M) : minR;
          m.options.optimalRuns = minNew + 2;
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

      _fracDef(k, runs) { return FRAC.find(x => x.k === k && x.runs === runs) || null; },
      _resCellClass(res) {
        const map = { Full: 'doe__res-full', VIII: 'doe__res-viii', VII: 'doe__res-vii',
          VI: 'doe__res-vi', V: 'doe__res-v', IV: 'doe__res-iv', III: 'doe__res-iii' };
        return map[res] || '';
      },
      resCellClass(k, runs) {
        const d = this._fracDef(k, runs);
        if (!d) return 'doe__res-cell--empty';
        const isActiveCol = k === this.model.factors.length;
        const sel = this.model.selectedRes && this.model.selectedRes.k === k && this.model.selectedRes.runs === runs;
        const disabledCls = isActiveCol ? '' : 'doe__res-cell--disabled';
        return [this._resCellClass(d.res), disabledCls, sel ? 'doe__res-cell--selected' : ''].filter(Boolean).join(' ');
      },
      resCellData(k, runs, which) {
        const d = this._fracDef(k, runs);
        if (!d || k !== this.model.factors.length) return null;
        if (which === 'k') return k;
        if (which === 'runs') return runs;
        if (which === 'res') return d.res;
        if (which === 'p') return d.p;
        return null;
      },
      resCellLabel(k, runs) {
        const d = this._fracDef(k, runs);
        if (!d) return '';
        return d.res === 'Full' ? _t('resFull') : d.res;
      },
      resCellClick(k, runs) {
        const d = this._fracDef(k, runs);
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
      resAliasDetail() {
        const s = this.model.selectedRes;
        if (!s || s.res === 'Full') return null;
        const { k, p } = s;
        const alias = computeAliasStructure(k, p, 'frac');
        if (!alias || (alias.generatorStrings.length === 0 && alias.aliases.length === 0)) return null;
        const nameMap = {};
        for (let i = 0; i < k; i++) {
          const name = this.model.factors[i] && this.model.factors[i].name ? this.model.factors[i].name.trim() : '';
          nameMap[letter(i)] = name || letter(i);
        }
        const replaceLetters = (code) => code.split('').map(ch => nameMap[ch] || ch).join(' · ');
        const formatGen = (gen) => {
          const [left, right] = gen.split(' = ');
          return `${nameMap[left] || left} = ${replaceLetters(right)}`;
        };
        return {
          generators: alias.generatorStrings.map(formatGen),
          defining: alias.definingRelation.map(w => `I = ${replaceLetters(w)}`),
          aliases: alias.aliases.map(a => ({
            term: replaceLetters(a.term),
            aliasedWith: a.aliasedWith.map(w => replaceLetters(w)).join(', '),
          })),
        };
      },

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

      bbAvailable() { return Boolean(BOX_BEHNKEN[this.model.factors.length]); },
      bbDetailText() {
        const k = this.model.factors.length;
        const available = BOX_BEHNKEN[k];
        const nCenter = this.model.options.bbCenterPoints || 3;
        const runs = available ? (available.length * 4 + nCenter) : '?';
        return _t('bbDetail', { k, pairs: available.length, runs });
      },
      bbWarningText() {
        return _t('bbNotAvailable', { k: this.model.factors.length, min: 3, max: 7 });
      },

      // ── Taguchi ───────────────────────────────────────────────

      _levelCounts() { return this.model.factors.map(f => f.levels.length); },
      taguchiCandidatesList() { return taguchiCandidates(this._levelCounts()); },
      taguchiFirstLevels() { const lc = this._levelCounts(); return lc.length ? lc[0] : 0; },
      taguchiInfoText() {
        const lc = this._levelCounts();
        const sameLevels = lc.length > 0 && lc.every(n => n === lc[0]);
        const labelKey = !sameLevels ? 'taguchiLevelsMixed' : (lc[0] === 3 ? 'taguchiLevels3' : 'taguchiLevels2');
        return _t(labelKey);
      },
      taguchiSelected() {
        const cands = this.taguchiCandidatesList();
        return this.model.options.taguchiArray || (cands.length > 0 ? cands[0].name : '');
      },
      selectTaguchi(name) {
        this.model.options.taguchiArray = name;
        this.invalidateAndSchedule();
        this.save();
      },

      // ── Optimal options ───────────────────────────────────────

      optimalMinRuns() { return minRunsForTerms(this.model.getActiveTerms()); },
      optimalMinNew() {
        const minRuns = this.optimalMinRuns();
        const M = this.sourceRowCount();
        return M > 0 ? Math.max(1, minRuns - M) : minRuns;
      },
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
        const minR = minRunsForTerms(m.options.optimalActiveTerms);
        const M = this.sourceRowCount();
        const minNew = M > 0 ? Math.max(1, minR - M) : minR;
        if ((m.options.optimalRuns || 0) < minNew) m.options.optimalRuns = minNew;
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
        if (OPTIMAL.includes(m.designType)) {
          const minR = minRunsForTerms(m.getActiveTerms());
          const M = this.sourceRowCount();
          const minNew = M > 0 ? Math.max(1, minR - M) : minR;
          if ((m.options.optimalRuns || 0) < minNew) m.options.optimalRuns = minNew;
        }
        this.invalidateAndSchedule();
        this.save();
      },

      // ── Design parameters ─────────────────────────────────────

      showCenterPointsOption() {
        return !['ccd', 'bb', 'taguchi', 'dopt', 'aopt', 'gopt'].includes(this.model.designType);
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
        const m = this.model;
        const k = m.factors.length;
        let runs = '?';
        switch (m.designType) {
          case 'full': {
            const allTwo = m.factors.every(f => f.levels.length === 2);
            runs = (allTwo ? Math.pow(2, k) : m.factors.reduce((p, f) => p * f.levels.length, 1))
              + (m.options.centerPoints ? 3 : 0);
            break;
          }
          case 'frac':
            if (m.selectedRes) runs = m.selectedRes.runs + (m.options.centerPoints ? 3 : 0);
            break;
          case 'pb': {
            let n = Math.ceil((k + 1) / 4) * 4;
            if (n <= k) n += 4;
            runs = n + (m.options.centerPoints ? 3 : 0);
            break;
          }
          case 'ccd':
            runs = Math.pow(2, k) + 2 * k + (m.options.ccdCenterPoints || 3);
            break;
          case 'bb': {
            const pairs = BOX_BEHNKEN[k];
            if (pairs) runs = pairs.length * 4 + (m.options.bbCenterPoints || 3);
            break;
          }
          case 'taguchi': {
            const sel = m.options.taguchiArray;
            const oa = sel ? Object.values(TAGUCHI).find(t => t.name === sel) : null;
            if (oa) runs = oa.runs;
            break;
          }
          case 'dopt': case 'aopt': case 'gopt':
            runs = m.options.optimalRuns || minRunsForTerms(m.getActiveTerms());
            break;
        }
        const reps = m.options.replicates || 1;
        if (typeof runs === 'number' && reps > 1) runs = runs * reps;
        return runs;
      },
      summaryRes() {
        const m = this.model;
        switch (m.designType) {
          case 'full': return 'Full';
          case 'frac': return m.selectedRes ? m.selectedRes.res : '';
          case 'pb': return 'III';
          case 'ccd': return 'CCD';
          case 'bb': return 'BB';
          case 'taguchi': return m.options.taguchiArray || 'OA';
          case 'dopt': return 'D-Opt';
          case 'aopt': return 'A-Opt';
          case 'gopt': return 'G-Opt';
          default: return '';
        }
      },
      summaryGeneratedRuns() {
        return this.model.design && this.model.design.runOrder ? this.model.design.runOrder.length : 0;
      },

      // ── Output: bound state ───────────────────────────────────

      _resp() { void this._extRev; return readResponsesFromWorksheet(ctx(), this.model.worksheetRef); },
      boundPct() {
        const resp = this._resp();
        return resp && resp.totalCount > 0 ? Math.round(resp.filledCount / resp.totalCount * 100) : 0;
      },
      boundProgressText() {
        const resp = this._resp();
        if (!resp) return '';
        return `${resp.filledCount} / ${resp.totalCount} ${_t('valuesFilled')} (${this.boundPct()}%)`;
      },
      boundComplete() {
        const resp = this._resp();
        return Boolean(resp && resp.complete);
      },
      showPreview() {
        return this.staleness() !== 'bound' && Boolean(this.model.design && this.model.design.actualMatrix && this.model.design.actualMatrix.length);
      },

      // ── Evaluation view-models ────────────────────────────────

      _eff() { return this.model.evaluation ? this.model.evaluation.efficiency : null; },
      effCards() {
        const eff = this._eff();
        if (!eff) return [];
        const mk = (label, val, tip) => {
          const cls = val >= 80 ? 'dmike-kpi--good' : val >= 50 ? 'dmike-kpi--warn' : 'dmike-kpi--bad';
          return { label, value: `${Math.round(val)  }%`, tip, algoId: ALGO_ID_DEFF, cls, barWidth: Math.min(100, val) };
        };
        return [
          mk(_t('dEff'), eff.dEfficiency, _t('tipDEff')),
          mk(_t('aEff'), eff.aEfficiency, _t('tipAEff')),
          mk(_t('gEff'), eff.gEfficiency, _t('tipGEff')),
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
      powerRating(p) { return p >= 0.8 ? 'doe__power-good' : p >= 0.5 ? 'doe__power-ok' : 'doe__power-low'; },
      powerPct(p) { return `${(p * 100).toFixed(0)  }%`; },
      powerBarWidth(p) { return (p * 100).toFixed(0); },
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
        if (m.designType === 'taguchi' || m.designType === 'evop') return null;
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
        return ph.decision === 'recenter' ? '↻' : ph.decision === 'repeat' ? '↺' : ph.decision === 'stop' ? '✓' : '';
      },
      canStartNewPhase() {
        const m = this.model;
        return m.activePhaseIdx === -1 || (m.projectPhases[m.activePhaseIdx] && m.projectPhases[m.activePhaseIdx].decision);
      },
      newPhase() { this.startNewPhase(false); this.save(); },
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
      applyPreviewEditsToDesign() {
        const m = this.model;
        const edits = m.previewEdits;
        if (!edits || !m.design || !m.design.actualMatrix || !m.design.actualMatrix.length) return;
        const nRuns = m.design.actualMatrix.length;
        if (Array.isArray(edits.factors)) {
          m.factors.forEach((f, fi) => {
            if (f.kind === 'categorical') return;
            const colEdits = edits.factors[fi];
            if (!Array.isArray(colEdits)) return;
            for (let i = 0; i < nRuns; i++) {
              const v = colEdits[i];
              if (v != null && Number.isFinite(v)) m.design.actualMatrix[i][fi] = v;
            }
          });
        }
        if (Array.isArray(edits.responses)) {
          const seeds = Array.isArray(m.design.sourceResponseSeeds)
            ? m.design.sourceResponseSeeds.map(col => Array.isArray(col) ? [...col] : new Array(nRuns).fill(null))
            : m.responses.map(() => new Array(nRuns).fill(null));
          let touched = false;
          m.responses.forEach((_, ri) => {
            while (seeds[ri].length < nRuns) seeds[ri].push(null);
            const colEdits = edits.responses[ri];
            if (!Array.isArray(colEdits)) return;
            for (let i = 0; i < nRuns; i++) {
              const v = colEdits[i];
              if (v != null && Number.isFinite(v)) { seeds[ri][i] = v; touched = true; }
            }
          });
          if (touched) { m.design.sourceResponseSeeds = seeds; m.design.sourceRowCount = nRuns; }
        }
      },
      createOrRecreateDatasheet() {
        const m = this.model;
        if (!m.design) return;
        if (this._previewGrid) this.capturePreviewEdits();
        this.applyPreviewEditsToDesign();
        if (m.worksheetRef) { this.removeOldWorksheet(m.worksheetRef); m.worksheetRef = null; }

        const expId = uid();
        const ref = createDesignWorksheet(ctx(), m.design, m.factors, m.responses, m.doeName, 'improve', expId);
        createExperimentRecord(ctx(), expId, m.design, m.factors, m.responses, m.doeName, ref);
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
          const newRows = this.codedToWorksheetRows(newCoded, factors);
          const oldN = m.design.codedMatrix.length;
          const newRunOrders = Array.from({ length: n }, (_, i) => oldN + i + 1);
          const newStdOrders = Array.from({ length: n }, (_, i) => oldN + i + 1);
          m.design.codedMatrix = [...m.design.codedMatrix, ...newCoded];
          m.design.actualMatrix = [...m.design.actualMatrix, ...newRows];
          m.design.runOrder = [...(m.design.runOrder || []), ...newRunOrders];
          m.design.stdOrder = [...(m.design.stdOrder || []), ...newStdOrders];
          m.design.replicateIds = [...(m.design.replicateIds || []), ...new Array(n).fill(1)];
          m.evaluation = evaluateDesign(m.design.codedMatrix, k, m.design.p, m.design.designType, 0.05, { terms });
          appendDoERowsToWorksheet(ctx(), m.worksheetRef, factors, newRows);
          if (m.worksheetRef.experimentId) {
            createExperimentRecord(ctx(), m.worksheetRef.experimentId, m.design, m.factors, m.responses, m.doeName, m.worksheetRef);
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
      transferToRegression() {
        const m = this.model;
        const ref = m.worksheetRef;
        if (!ref || !isWorksheetValid(ctx(), ref)) return;
        const sm = ctx().stateManager;
        const eventBus = ctx().eventBus;
        const colRefs = ref.factorColumnIds.map(colId => ({ instanceId: ref.instanceId, sheetId: ref.sheetId, columnId: colId }));
        const respColId = ref.responseColumnIds[m.analysisResponseIdx] || ref.responseColumnIds[0];
        const yKey = `${ref.instanceId}|${ref.sheetId}|${respColId}`;
        const resp = readResponsesFromWorksheet(ctx(), ref);
        const nRuns = resp.totalCount / Math.max(ref.responseColumnIds.length, 1);
        const k = ref.factorColumnIds.length;
        const polyDegree = maxFeasiblePolyDegree(nRuns, k);
        let phase = 'improve';
        for (const p of Object.keys(sm.get('phases') || {})) {
          const items = sm.get(`phases.${p}`) ?? [];
          if (items.some(i => i.instanceId === ctx().instanceId)) { phase = p; break; }
        }
        const regInstanceId = uid();
        const existing = sm.get(`phases.${phase}`) ?? [];
        sm.set(`phases.${phase}`, [...existing, { instanceId: regInstanceId, moduleId: 'regression', order: existing.length, state: {} }]);
        sm.setModuleState(regInstanceId, {
          colRefs, yKey, regType: 'polynomial', polyDegree,
          confLevel: (sm.get('settings.confidenceLevel') ?? 95) / 100,
          alpha: Number(((100 - (sm.get('settings.confidenceLevel') ?? 95)) / 100).toFixed(4)),
          showCI: true, result: null, perXResults: null, activeXKey: null,
          activeTab: 'scatter', excludedTerms: [], coefSortByP: false,
        });
        eventBus.emit('module:added', { moduleId: 'regression', phase, instanceId: regInstanceId });
        ctx().notify(_t('transferSuccess'));
      },

      // ── Preview DataGrid (imperative widget) ──────────────────

      _buildPreviewColumns() {
        const m = this.model;
        const design = m.design;
        if (!design || !design.actualMatrix || !design.actualMatrix.length) return [];
        const nRuns = design.actualMatrix.length;
        const order = design.runOrder || design.actualMatrix.map((_, i) => i + 1);
        const stdOrder = design.stdOrder || design.actualMatrix.map((_, i) => i + 1);
        const replicateIds = design.replicateIds || new Array(nRuns).fill(1);
        const lockMeta = (reason) => ({ lock: 'hard', managedBy: 'doe-planner', reason });
        const cols = [
          { id: '__run', name: _t('colRunOrder'), type: 'numeric', values: [...order], format: { decimals: 0 }, meta: lockMeta('run-order') },
          { id: '__std', name: _t('colStdOrder'), type: 'numeric', values: [...stdOrder], format: { decimals: 0 }, meta: lockMeta('group-id') },
          { id: '__blk', name: _t('colBlock'), type: 'numeric', values: new Array(nRuns).fill(1), format: { decimals: 0 }, meta: lockMeta('block-column') },
          { id: '__rep', name: _t('colReplicate'), type: 'numeric', values: [...replicateIds], format: { decimals: 0 }, meta: lockMeta('replicate-id') },
        ];
        const edits = m.previewEdits;
        const factorEdits = edits && edits.factors ? edits.factors : null;
        const responseEdits = edits && edits.responses ? edits.responses : null;
        m.factors.forEach((f, fi) => {
          const isCategorical = f.kind === 'categorical';
          const baseValues = design.actualMatrix.map(row => row[fi]);
          const values = baseValues.map((v, i) => {
            if (!isCategorical && factorEdits && factorEdits[fi] && factorEdits[fi][i] != null) return factorEdits[fi][i];
            return v;
          });
          cols.push({
            id: `__f${fi}`,
            name: f.name || `${_t('factor')} ${letter(fi)}`,
            type: isCategorical ? 'text' : 'numeric',
            unit: isCategorical ? '' : (f.unit || ''),
            values,
            format: isCategorical ? null : { decimals: 2 },
            meta: isCategorical ? lockMeta('design-factor') : null,
          });
        });
        const sourceSeeds = Array.isArray(design.sourceResponseSeeds) ? design.sourceResponseSeeds : null;
        const seedRows = Number.isFinite(design.sourceRowCount) ? design.sourceRowCount : 0;
        m.responses.forEach((r, ri) => {
          const values = new Array(nRuns).fill(null);
          if (sourceSeeds && sourceSeeds[ri] && seedRows > 0) {
            const limit = Math.min(seedRows, sourceSeeds[ri].length, nRuns);
            for (let i = 0; i < limit; i++) {
              const v = sourceSeeds[ri][i];
              if (v != null && Number.isFinite(v)) values[i] = v;
            }
          }
          if (responseEdits && responseEdits[ri]) {
            for (let i = 0; i < nRuns; i++) {
              const v = responseEdits[ri][i];
              if (v != null && Number.isFinite(v)) values[i] = v;
            }
          }
          cols.push({
            id: `__r${ri}`,
            name: r.name || `Y${ri + 1}`,
            type: 'numeric',
            unit: r.unit || '',
            values,
            format: { decimals: 4 },
            meta: null,
          });
        });
        return cols;
      },
      mountPreviewGrid() {
        this.destroyPreviewGrid();
        const root = module._container;
        if (!root) return;
        const slot = root.querySelector('[data-ref="preview-grid"]');
        if (!slot) return;
        const m = this.model;
        if (!m.design || !m.design.actualMatrix || !m.design.actualMatrix.length) return;
        const cols = this._buildPreviewColumns();
        if (!cols.length) return;
        const isOptimal = m.isOptimalType();
        const self = this;
        this._previewGrid = new DataGrid(slot, {
          toast: ctx().notify || (() => {}),
          t: (key) => ctx().i18n.t(key),
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
        const m = this.model;
        if (!this._previewGrid || !m.design) return;
        const data = this._previewGrid.getData();
        const nFactors = m.factors.length;
        const nResp = m.responses.length;
        const nRuns = m.design.actualMatrix.length;
        const factorEdits = Array.from({ length: nFactors }, () => new Array(nRuns).fill(null));
        const responseEdits = Array.from({ length: nResp }, () => new Array(nRuns).fill(null));
        let dirty = false;
        const FACTOR_OFFSET = 4;
        for (let fi = 0; fi < nFactors; fi++) {
          const col = data[FACTOR_OFFSET + fi];
          if (!col) continue;
          if (m.factors[fi].kind === 'categorical') continue;
          for (let i = 0; i < nRuns; i++) {
            const v = col.values[i];
            const orig = m.design.actualMatrix[i][fi];
            if (v != null && Number.isFinite(v)) {
              factorEdits[fi][i] = v;
              if (Math.abs(v - orig) > 1e-9) dirty = true;
            }
          }
        }
        for (let ri = 0; ri < nResp; ri++) {
          const col = data[FACTOR_OFFSET + nFactors + ri];
          if (!col) continue;
          for (let i = 0; i < nRuns; i++) {
            const v = col.values[i];
            if (v != null && Number.isFinite(v)) responseEdits[ri][i] = v;
          }
        }
        m.previewEdits = { factors: factorEdits, responses: responseEdits };
        m.previewDirty = dirty;
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
  if (model && typeof model.hasContent === 'function' && model.hasContent() && ctx?.confirmPopout) {
    const ok = await ctx.confirmPopout(t('moduleHelp.confirmOverwrite'), { danger: true });
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
