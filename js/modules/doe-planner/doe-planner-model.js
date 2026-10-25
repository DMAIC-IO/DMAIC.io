/**
 * D.Mike — DoE Planner: Model (doe-planner-model.js)
 *
 * Holds the persistent state and pure business logic for the DoE planner.
 * Reproduces the legacy `getState()`/`_importState()` shape exactly (version: 3)
 * and carries the cascading factor/response invalidation, design-signature
 * staleness logic, and active-term filtering that used to live on the module
 * object.
 *
 * NOTHING here touches the DOM, i18n, context, or the chart/grid layer — those
 * belong to the data-Fn (view) in `doe-planner.js`. Pure logic only.
 */

import { defaultActiveTerms, parseTermId, termsFromLegacyOptions, designModelTerms } from '../../engines/doe-terms.js';
import { computeEVOPEffects, recenteredFactors } from './doe-planner-analysis.js';

const OPTIMAL_TYPES = ['dopt', 'aopt', 'gopt'];

/** Factor letter by index: 0 → A, 1 → B, … */
export const letter = (i) => String.fromCharCode(65 + i);

/** The three ways to close an EVOP phase. */
export const PHASE_DECISIONS = Object.freeze(['recenter', 'repeat', 'stop']);

/** Deep clone helper that strips any Alpine reactive Proxy down to plain data. */
function plain(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

function defaultOptions() {
  return {
    randomize: true,
    centerPoints: false,
    replicates: 1,
    alphaType: 'rotatable',
    ccdCenterPoints: 3,
    bbCenterPoints: 3,
    taguchiArray: '',
    optimalRuns: 0,
    optimalActiveTerms: null,
    forbiddenVertices: [],
  };
}

export class State {
  doeName = '';
  designType = 'full';
  /** @type {{ id:number, name:string, unit:string, kind:'continuous'|'categorical', levels:string[] }[]} */
  factors = [];
  /** @type {{ name:string, unit:string }[]} */
  responses = [];
  options = defaultOptions();
  /** @type {{ k:number, runs:number, res:string, p:number }|null} */
  selectedRes = null;
  selectedPBIdx = null;
  design = null;
  previewEdits = null;
  previewDirty = false;
  worksheetRef = null;
  sourceWorksheet = null;
  evaluation = null;
  analysisResponseIdx = 0;
  fid = 0;
  projectMode = false;
  projectName = '';
  projectPhases = [];
  activePhaseIdx = -1;

  // ─── Serialization (version: 3 — exact legacy getState() shape) ──

  toJSON() {
    return {
      version: 3,
      doeName: this.doeName,
      designType: this.designType,
      factors: plain(this.factors),
      responses: plain(this.responses),
      options: { ...plain(this.options) },
      selectedRes: this.selectedRes ? { ...plain(this.selectedRes) } : null,
      selectedPBIdx: this.selectedPBIdx,
      design: this.design ? plain(this.design) : null,
      previewEdits: this.previewEdits ? plain(this.previewEdits) : null,
      previewDirty: Boolean(this.previewDirty),
      worksheetRef: this.worksheetRef ? { ...plain(this.worksheetRef) } : null,
      sourceWorksheet: this.sourceWorksheet ? { ...plain(this.sourceWorksheet) } : null,
      evaluation: this.evaluation ? plain(this.evaluation) : null,
      analysisResponseIdx: this.analysisResponseIdx,
      fid: this.fid,
      projectMode: this.projectMode,
      projectName: this.projectName,
      projectPhases: plain(this.projectPhases),
      activePhaseIdx: this.activePhaseIdx,
    };
  }

  /**
   * Reconstruct from persisted JSON. Always returns a valid default on
   * null/undefined/malformed input. Reproduces the legacy `_importState`
   * migrations (v2→v3 wizard drop, lo/hi→levels, kind default,
   * optimalQuadratic/optimalExcludedInteractions → optimalActiveTerms).
   *
   * @param {object|null|undefined} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;

    // v2 → v3 migration: wizard fields removed.
    const saved = { ...d };
    if (saved.currentStep !== undefined) {
      delete saved.currentStep;
      delete saved.maxVisitedStep;
    }

    if (saved.doeName != null) s.doeName = String(saved.doeName);
    if (saved.designType) s.designType = saved.designType;

    if (Array.isArray(saved.factors)) {
      s.factors = plain(saved.factors).map(f => {
        if (!Array.isArray(f.levels)) {
          f.levels = [f.lo ?? '', f.hi ?? ''];
          delete f.lo;
          delete f.hi;
        }
        if (f.kind !== 'categorical') f.kind = 'continuous';
        return f;
      });
    }

    if (Array.isArray(saved.responses)) {
      s.responses = plain(saved.responses);
    }

    if (saved.options) {
      const incoming = { ...saved.options };
      // Legacy → hierarchical term migration.
      if (!Array.isArray(incoming.optimalActiveTerms)) {
        const k = Array.isArray(saved.factors) ? saved.factors.length : 0;
        if (k >= 2 && (incoming.optimalQuadratic || Array.isArray(incoming.optimalExcludedInteractions))) {
          incoming.optimalActiveTerms = termsFromLegacyOptions(
            k,
            Boolean(incoming.optimalQuadratic),
            incoming.optimalExcludedInteractions,
          );
        }
      }
      delete incoming.optimalQuadratic;
      delete incoming.optimalExcludedInteractions;
      s.options = { ...defaultOptions(), ...incoming };
    }

    s.selectedRes = saved.selectedRes ? { ...saved.selectedRes } : null;
    s.selectedPBIdx = saved.selectedPBIdx ?? null;
    s.design = saved.design ? plain(saved.design) : null;
    s.previewEdits = saved.previewEdits ? plain(saved.previewEdits) : null;
    s.previewDirty = Boolean(saved.previewDirty);
    s.worksheetRef = saved.worksheetRef ? { ...saved.worksheetRef } : null;
    s.sourceWorksheet = saved.sourceWorksheet ? { ...saved.sourceWorksheet } : null;
    s.evaluation = saved.evaluation ? plain(saved.evaluation) : null;
    s.analysisResponseIdx = saved.analysisResponseIdx ?? 0;
    if (typeof saved.fid === 'number') s.fid = saved.fid;
    if (typeof saved.projectMode === 'boolean') s.projectMode = saved.projectMode;
    if (saved.projectName != null) s.projectName = String(saved.projectName);
    if (Array.isArray(saved.projectPhases)) s.projectPhases = plain(saved.projectPhases);
    if (typeof saved.activePhaseIdx === 'number') s.activePhaseIdx = saved.activePhaseIdx;

    return s;
  }

  /** True if any factor name is set or a design exists — drives loadExample confirm. */
  hasContent() {
    return this.factors.some(f => (f.name || '').trim() !== '') || Boolean(this.design);
  }

  // ─── Factor / response CRUD ─────────────────────────────────────

  addFactor(name = '', unit = '', levels, kind = 'continuous') {
    this.fid++;
    this.factors.push({
      id: this.fid,
      name: name || '',
      unit: unit || '',
      kind: kind === 'categorical' ? 'categorical' : 'continuous',
      levels: Array.isArray(levels) && levels.length >= 2 ? [...levels] : ['', ''],
    });
  }

  /**
   * Remove a factor by id. Active-term ids reference factor indices which shift
   * on removal, so the optimal-term selection is wiped; forbidden-vertex patterns
   * are length-k vectors that no longer align once k changes, so they are dropped.
   */
  removeFactor(id) {
    this.factors = this.factors.filter(f => f.id !== id);
    this.options.optimalActiveTerms = null;
    if (Array.isArray(this.options.forbiddenVertices) && this.options.forbiddenVertices.length) {
      this.options.forbiddenVertices = [];
    }
  }

  addResponse() {
    this.responses.push({ name: '', unit: '' });
  }

  removeResponse(idx) {
    this.responses.splice(idx, 1);
  }

  insertLevel(fId, at) {
    const f = this.factors.find(fac => fac.id === fId);
    if (f) f.levels.splice(at, 0, '');
  }

  removeLevel(fId, li) {
    const f = this.factors.find(fac => fac.id === fId);
    if (f && f.levels.length > 2) f.levels.splice(li, 1);
  }

  // ─── Active terms / validation helpers ──────────────────────────

  /**
   * Active model terms for the current optimal-design configuration, filtered
   * against the current factor count so renaming/removing factors never leaks
   * dangling indices. Mirrors legacy `_getActiveTerms`.
   * @returns {string[]}
   */
  getActiveTerms() {
    const k = this.factors.length;
    if (k < 1) return [];
    let list = this.options.optimalActiveTerms;
    if (!Array.isArray(list)) list = defaultActiveTerms(k);
    const seen = new Set();
    const cleaned = [];
    for (const id of list) {
      const parsed = parseTermId(id);
      if (!parsed) continue;
      if (parsed.factors.some(f => f < 0 || f >= k)) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      cleaned.push(id);
    }
    return cleaned;
  }

  hasDuplicateFactorNames() {
    const names = this.factors
      .map(f => f.name.trim().toLowerCase())
      .filter(n => n !== '');
    return new Set(names).size !== names.length;
  }

  /** 3-level factors are incompatible with frac/pb → fall back to full. */
  autoFixDesignType() {
    const has3Plus = this.factors.some(f => f.levels.length > 2);
    if (has3Plus && (this.designType === 'frac' || this.designType === 'pb')) {
      this.designType = 'full';
      this.selectedRes = null;
      this.selectedPBIdx = null;
    }
  }

  /**
   * Drop the current design/evaluation and clear a stale resolution selection,
   * then auto-fix the design type. Caller schedules re-generation.
   */
  invalidateDesign() {
    this.design = null;
    this.evaluation = null;
    if (this.selectedRes && this.selectedRes.k !== this.factors.length) {
      this.selectedRes = null;
    }
    this.autoFixDesignType();
  }

  /**
   * Canonical model terms of the current design (see designModelTerms).
   * @returns {string[]}
   */
  modelTerms() {
    return designModelTerms(this.design.codedMatrix, {
      activeTerms: this.isOptimalType() ? this.getActiveTerms() : undefined,
      categoricalFlags: this.factors.map(f => f.kind === 'categorical'),
    });
  }

  // ─── Forbidden vertices (optimal designs) ───────────────────────

  /**
   * Adds a forbidden factor combination (coded value or null = any, per factor).
   * @param {Array<?number>} pattern length k
   * @returns {boolean} false when the same pattern is already forbidden
   */
  addForbiddenVertex(pattern) {
    const list = Array.isArray(this.options.forbiddenVertices) ? [...this.options.forbiddenVertices] : [];
    const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
    if (list.some(p => eq(p, pattern))) return false;
    list.push([...pattern]);
    this.options.forbiddenVertices = list;
    return true;
  }

  /**
   * @param {number} idx position in options.forbiddenVertices
   * @returns {boolean} false when idx is out of range
   */
  removeForbiddenVertex(idx) {
    const list = Array.isArray(this.options.forbiddenVertices) ? [...this.options.forbiddenVertices] : [];
    if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) return false;
    list.splice(idx, 1);
    this.options.forbiddenVertices = list;
    return true;
  }

  // ─── EVOP project phases (spec 2026-10-25 E8) ───────────────────

  /**
   * A new, undecided phase from the current plan.
   * @param {number} cycleNumber 1-based
   * @returns {object} phase
   */
  snapshotPhase(cycleNumber) {
    return {
      cycleNumber,
      doeName: this.doeName,
      factors: plain(this.factors),
      responses: plain(this.responses),
      designType: this.designType,
      options: { ...plain(this.options) },
      design: null, worksheetRef: null, evaluation: null,
      decision: null, completedAt: null,
    };
  }

  /**
   * Switches the EVOP project mode; the first switch-on opens phase 1.
   * @param {boolean} on
   */
  setProjectMode(on) {
    this.projectMode = on;
    if (on && this.projectPhases.length === 0) {
      this.projectPhases.push({
        ...this.snapshotPhase(1),
        doeName: this.doeName || `${this.projectName || 'Projekt'} - Phase 1`,
      });
      this.activePhaseIdx = 0;
    }
  }

  /** Copies the generated design and the plan into the active phase. */
  syncActivePhase() {
    if (!this.projectMode || this.activePhaseIdx < 0 || this.activePhaseIdx >= this.projectPhases.length) return;
    const ph = this.projectPhases[this.activePhaseIdx];
    ph.design = plain(this.design);
    ph.worksheetRef = this.worksheetRef ? { ...plain(this.worksheetRef) } : null;
    ph.evaluation = this.evaluation ? plain(this.evaluation) : null;
    ph.factors = plain(this.factors);
    ph.responses = plain(this.responses);
    ph.doeName = this.doeName;
  }

  /**
   * Closes the active phase with a decision, its design and its response values.
   * @param {'recenter'|'repeat'|'stop'} decision
   * @param {number[]} [yValues] first response column of the linked datasheet
   * @param {string} [completedAt] ISO time
   * @returns {boolean} false when there is no undecided active phase
   */
  closeActivePhase(decision, yValues, completedAt = new Date().toISOString()) {
    const ph = this.projectPhases[this.activePhaseIdx];
    if (!ph || ph.decision) return false;
    ph.decision = decision;
    ph.completedAt = completedAt;
    ph.design = this.design ? plain(this.design) : null;
    ph.worksheetRef = this.worksheetRef ? { ...plain(this.worksheetRef) } : null;
    ph.evaluation = this.evaluation ? plain(this.evaluation) : null;
    if (Array.isArray(yValues)) ph.yValues = [...yValues];
    return true;
  }

  /**
   * Phases with design and response values, as cycles for computeEVOPEffects.
   * @returns {Array<{cycleNumber: number, codedMatrix: number[][], y: number[], factorNames: string[]}>}
   */
  evopCycles() {
    return this.projectPhases
      .filter(ph => ph.yValues && ph.design)
      .map(ph => ({
        cycleNumber: ph.cycleNumber,
        codedMatrix: ph.design.codedMatrix,
        y: ph.yValues || [],
        factorNames: (ph.factors || []).map((f, i) => f.name || letter(i)),
      }))
      .filter(c => c.y.length > 0);
  }

  /**
   * Opens the next phase: re-centered on the best run of all cycles so far,
   * or with the same levels.
   * @param {{recenter?: boolean}} [opts]
   */
  startPhase({ recenter = false } = {}) {
    const prev = this.projectPhases[this.activePhaseIdx];
    const n = this.projectPhases.length + 1;
    let factors;
    if (recenter && prev && prev.yValues && this.design) {
      const evop = computeEVOPEffects(this.evopCycles());
      factors = recenteredFactors(this.factors, evop.bestPointCoded);
    } else {
      factors = plain(this.factors);
    }
    this.doeName = `${this.projectName} - Phase ${n}`;
    this.factors = factors;
    this.design = null;
    this.worksheetRef = null;
    this.evaluation = null;
    this.projectPhases.push(this.snapshotPhase(n));
    this.activePhaseIdx = this.projectPhases.length - 1;
  }

  /**
   * Restores a phase's plan, design and datasheet link.
   * @param {number} idx
   * @returns {boolean} false when idx is out of range
   */
  viewPhase(idx) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= this.projectPhases.length) return false;
    const ph = this.projectPhases[idx];
    this.activePhaseIdx = idx;
    this.doeName = ph.doeName || '';
    this.factors = plain(ph.factors || []);
    this.responses = plain(ph.responses || []);
    this.designType = ph.designType || 'full';
    this.options = { ...this.options, ...(ph.options || {}) };
    this.design = ph.design ? plain(ph.design) : null;
    this.worksheetRef = ph.worksheetRef ? { ...ph.worksheetRef } : null;
    this.evaluation = ph.evaluation ? plain(ph.evaluation) : null;
    return true;
  }

  /** @returns {boolean} a new phase may start: no phase stopped the project, and the active one is decided */
  canStartNewPhase() {
    if (this.projectPhases.some(ph => ph.decision === 'stop')) return false;
    const active = this.projectPhases[this.activePhaseIdx];
    return this.activePhaseIdx === -1 || Boolean(active && active.decision);
  }

  /**
   * Stable identity for the currently generated design. Because the engine's
   * deterministicSeed makes the coded matrix reproducible for identical input,
   * stringifying it is a sufficient signature to detect design drift.
   * @returns {string|null}
   */
  designSignature() {
    if (!this.design) return null;
    return [
      this.design.designType,
      this.design.codedMatrix.length,
      this.responses.length,
      this.responses.map(r => `${r.name}|${r.unit}`).join('||'),
      this.design.codedMatrix.map(r => r.join(',')).join(';'),
    ].join('#');
  }

  isOptimalType() {
    return OPTIMAL_TYPES.includes(this.designType);
  }
}

export { OPTIMAL_TYPES, defaultOptions };
