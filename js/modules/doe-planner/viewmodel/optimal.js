/**
 * D.Mike — DoE planner optimal designs (viewmodel/optimal.js)
 *
 * Sub-viewmodel of the optimal-design workspace (D-, A-, G-optimal): the
 * run count, the model terms, forbidden factor combinations, the source
 * worksheet and the augmentation of a linked datasheet. Writes the model
 * and saves; the shell's signature watcher regenerates.
 */
import {
  enumerateTerms, termDisplay, activateTerm, deactivateTerm, termSortKey,
} from '../../../engines/doe-terms.js';
import { augmentOptimalDesign } from '../../../engines/doe-planner-engine.js';
import { evaluateDesign } from '../doe-planner-analysis.js';
import {
  listProjectWorksheets, readSourceData, isWorksheetValid, appendDoERowsToWorksheet,
  createExperimentRecord, sourceRowCount,
} from '../doe-planner-worksheet.js';
import { codedToActualRows } from '../doe-planner-runtable.js';
import { letter } from '../doe-planner-model.js';
import optimal from '../designs/optimal.js';
import { requireBoolean, requireEnum, requireIndex, requireNumber } from '../../../core/agent/agent-argcheck.js';

export class OptimalViewModel {
  /**
   * Gets only what exists before the mount; the model comes with attach().
   * @param {{t: function(string, object=): string, context: object, container: function(): ?Element}} deps
   */
  constructor({ t, context, container }) {
    this._t = t;
    this._context = context;
    this._container = container;
    /** @type {?object} the component's State, set by attach() */
    this.model = null;
    this._save = () => {};
    /** @type {Object<number, boolean>} folded term groups (view only) */
    this._termGroupExpanded = {};
  }

  /**
   * Binds the component's model and its save.
   * @noagent lifecycle
   * @param {{model: object, save: function(): void}} binding
   */
  attach({ model, save }) {
    this.model = model;
    this._save = save;
  }

  /**
   * Nothing to release.
   * @noagent lifecycle
   */
  detach() { this._save = () => {}; }

  /** @returns {{sourceRowCount: number}} */
  _env() { return { sourceRowCount: sourceRowCount(this._context, this.model.sourceWorksheet) }; }

  // ── Runs ──────────────────────────────────────────────────

  /** @noagent view transform @returns {number} */
  optimalMinRuns() { return optimal.minRuns(this.model); }

  /** @noagent view transform @returns {number} */
  optimalMinNew() { return optimal.minNewRuns(this.model, this._env()); }

  /** @noagent view transform @returns {boolean} */
  optimalRunsValid() { return (this.model.options.optimalRuns || 0) >= this.optimalMinNew(); }

  /** @noagent view transform @returns {string} */
  optimalRunsLabel() {
    return this._env().sourceRowCount > 0 ? this._t('optimalRunsNew') : this._t('optimalRuns');
  }

  /** @noagent view transform @returns {string} */
  optimalRunsHint() {
    const minNew = this.optimalMinNew();
    const m = this._env().sourceRowCount;
    return m > 0 ? this._t('optimalMinRunsNew', { min: minNew, m }) : this._t('optimalMinRuns', { min: minNew });
  }

  /** @noagent view transform @returns {string} */
  optimalTooFewText() {
    const minNew = this.optimalMinNew();
    const m = this._env().sourceRowCount;
    return m > 0 ? this._t('optimalTooFewRunsNew', { min: minNew, m }) : this._t('optimalTooFewRuns', { min: minNew });
  }

  /**
   * Set the number of new runs of the optimal design.
   * @agent
   * @param {number} n a whole number, at least what the active model terms need
   * @returns {void}
   * @throws {Error} if n is below the minimum
   */
  setOptimalRuns(n) {
    this.model.options.optimalRuns = requireNumber('n', n, { integer: true, min: this.optimalMinNew() });
    this._save();
  }

  /** @noagent UI input — clamps to the minimum like before @param {Event} event */
  optimalRunsChanged(event) {
    const minNew = this.optimalMinNew();
    this.setOptimalRuns(Math.max(minNew, parseInt(event.target.value, 10) || minNew));
  }

  // ── Model terms ───────────────────────────────────────────

  /** @noagent view transform @returns {Array<{kind: string, order: number, ids: string[]}>} */
  termGroups() { return enumerateTerms(this.model.factors.length); }

  /** @returns {string[]} trimmed factor names, letters for empty ones */
  _factorNames() { return this.model.factors.map((f, i) => (f && f.name && f.name.trim()) || letter(i)); }

  /** @returns {Set<string>} */
  _activeSet() { return new Set(this.model.getActiveTerms()); }

  /** @noagent view transform @param {string} id @returns {boolean} */
  termActive(id) { return this._activeSet().has(id); }

  /** @noagent view transform @param {string} id @returns {string} */
  termLabel(id) { return termDisplay(id, this._factorNames()); }

  /** @noagent view transform @param {number} gi @param {{kind: string, order: number}} g @returns {boolean} */
  termGroupExpanded(gi, g) {
    const isHigh = g.kind === 'ix' && g.order >= 3;
    const flag = this._termGroupExpanded[gi];
    return flag === undefined ? !isHigh : flag;
  }

  /** @noagent view transform @param {{kind: string, order: number}} g @returns {string} */
  termGroupTitle(g) {
    if (g.kind === 'main') return this._t('termGroupMain');
    if (g.kind === 'quad') return this._t('termGroupQuad');
    return this._t('termGroupNFI', { n: g.order });
  }

  /** @noagent view transform @param {{ids: string[]}} g @returns {string} "(on/all)" */
  termGroupCount(g) {
    const set = this._activeSet();
    return `(${g.ids.filter((id) => set.has(id)).length}/${g.ids.length})`;
  }

  /** @noagent view transform @param {{kind: string}} g @param {string} id @returns {string} */
  termChipClass(g, id) {
    const on = this._activeSet().has(id) ? ' doe__term-chip--on' : '';
    const locked = g.kind === 'main' ? ' doe__term-chip--locked' : '';
    return (`doe__term-chip${on}${locked}`).trim();
  }

  /** Stores the active terms sorted and raises the runs to the new minimum. */
  _applyActiveTerms(active) {
    const m = this.model;
    m.options.optimalActiveTerms = [...active].sort((a, b) => termSortKey(a).localeCompare(termSortKey(b)));
    optimal.raiseRunsToMinimum(m, this._env());
    this._save();
  }

  /**
   * Switch one model term. On takes its lower terms along, off its higher
   * ones; main effects stay. Raises the runs to the new minimum.
   * @agent
   * @param {string} termId M0 (main effect of factor A), Q0 (its square), I0_1 (interaction A·B), …
   * @param {boolean} on
   * @returns {void}
   * @throws {Error} if the term is unknown or a main effect would be switched off
   */
  setTerm(termId, on) {
    const groups = enumerateTerms(this.model.factors.length);
    const ids = groups.flatMap((g) => g.ids);
    requireEnum('termId', termId, ids);
    requireBoolean('on', on);
    if (!on && groups[0].ids.includes(termId)) throw new Error(`${termId} is a main effect; main effects stay in the model`);
    const active = this._activeSet();
    if (on) activateTerm(active, termId);
    else deactivateTerm(active, termId);
    this._applyActiveTerms(active);
  }

  /** @noagent UI checkbox @param {string} id @param {Event} event */
  toggleTerm(id, event) {
    if (!id) return;
    this.setTerm(id, event.target.checked);
  }

  /**
   * Switch every term of a group: 1 = squares, 2 = two-factor interactions, … The main effects stay.
   * @agent
   * @param {number} groupIdx the group; 0 holds the main effects
   * @param {boolean} on
   * @returns {void}
   * @throws {Error} if the group is unknown or the main effects
   */
  setTermGroup(groupIdx, on) {
    const groups = enumerateTerms(this.model.factors.length);
    requireIndex('groupIdx', groupIdx, groups.length, { existing: true });
    requireBoolean('on', on);
    const g = groups[groupIdx];
    if (g.kind === 'main') throw new Error('group 0 holds the main effects; they stay in the model');
    const active = this._activeSet();
    for (const id of g.ids) {
      if (on) activateTerm(active, id);
      else deactivateTerm(active, id);
    }
    this._applyActiveTerms(active);
  }

  /** @noagent view only — folds a group @param {number} gi */
  toggleTermGroup(gi) {
    const g = this.termGroups()[gi];
    const isHigh = g && g.kind === 'ix' && g.order >= 3;
    const current = this._termGroupExpanded[gi];
    const cur = current === undefined ? !isHigh : current;
    this._termGroupExpanded[gi] = !cur;
  }

  // ── Forbidden vertices ────────────────────────────────────

  /** @noagent view transform @returns {Array<Array<?number>>} */
  forbiddenList() {
    return Array.isArray(this.model.options.forbiddenVertices) ? this.model.options.forbiddenVertices : [];
  }

  /** @noagent view transform @param {{levels: string[]}} f @param {number} li @returns {number} coded value of level li */
  forbiddenCoded(f, li) {
    const nLv = f.levels.length;
    return nLv === 1 ? 0 : -1 + (2 * li) / (nLv - 1);
  }

  /** @returns {string} the level label for a coded value */
  _codedToLabel(fi, coded) {
    const f = this.model.factors[fi];
    if (!f) return String(coded);
    const nLv = f.levels.length;
    if (nLv <= 1) return f.levels[0] ?? '';
    const idx = Math.round((coded + 1) * (nLv - 1) / 2);
    const clamped = Math.max(0, Math.min(nLv - 1, idx));
    return f.levels[clamped] ?? String(coded);
  }

  /** @noagent view transform @param {Array<?number>} pattern @returns {string} "A = 40 ∧ B = any" */
  forbiddenRuleText(pattern) {
    return this.model.factors.map((f, fi) => {
      const v = pattern ? pattern[fi] : null;
      const name = (f.name || letter(fi));
      const label = v == null ? this._t('forbiddenAny') : this._codedToLabel(fi, v);
      return `${name} = ${label}`;
    }).join(' ∧ ');
  }

  /** @noagent view transform @param {{name: string}} f @param {number} fi @returns {string} */
  factorDisplayName(f, fi) { return (f.name && f.name.trim()) || letter(fi); }

  /**
   * Forbid a combination of factor levels in the optimal design.
   * @agent
   * @param {Array<?number>} pattern one coded level per factor (-1 = lowest,
   *   1 = highest, in between for more levels), null for any level
   * @returns {boolean} false when the same combination is already forbidden
   * @throws {Error} if the pattern has the wrong length, an unknown level, or no level at all
   */
  addForbiddenVertex(pattern) {
    const factors = this.model.factors;
    if (!Array.isArray(pattern) || pattern.length !== factors.length) {
      throw new Error(`pattern must list one value per factor (${factors.length}), null for any level`);
    }
    pattern.forEach((v, fi) => {
      if (v === null) return;
      const allowed = factors[fi].levels.map((_, li) => this.forbiddenCoded(factors[fi], li));
      if (!allowed.includes(v)) {
        throw new Error(`pattern[${fi}] ${JSON.stringify(v)} is no coded level of factor ${letter(fi)}; allowed: ${allowed.join(', ')}, null`);
      }
    });
    if (pattern.every((v) => v === null)) throw new Error('pattern needs at least one coded level; null everywhere would forbid every run');
    const added = this.model.addForbiddenVertex(pattern);
    if (added) this._save();
    return added;
  }

  /** @noagent UI form — reads the level pickers of the forbidden block */
  addForbiddenFromInputs() {
    const root = this._container();
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
    if (!anyBound) { if (this._context.notify) this._context.notify(this._t('forbiddenHint'), 'info'); return; }
    this.addForbiddenVertex(pattern);
  }

  /**
   * Allow a forbidden combination again.
   * @agent
   * @param {number} index position in the list of forbidden combinations
   * @returns {void}
   * @throws {Error} if the index is unknown
   */
  removeForbiddenVertex(index) {
    requireIndex('index', index, this.forbiddenList().length, { existing: true });
    this.model.removeForbiddenVertex(index);
    this._save();
  }

  // ── Source worksheet ──────────────────────────────────────

  /** @noagent view transform @returns {string} "instance::sheet" or "" */
  sourceWorksheetKey() {
    const s = this.model.sourceWorksheet;
    return s ? `${s.instanceId}::${s.sheetId}` : '';
  }

  /** @returns {object[]} project worksheets except the planner's own datasheet */
  _sourceSheets() {
    const own = this.model.worksheetRef;
    return listProjectWorksheets(this._context)
      .filter((s) => !(own && s.instanceId === own.instanceId && s.sheetId === own.sheetId));
  }

  /** @noagent view transform @returns {Array<{key: string, label: string}>} */
  sourceWorksheetOptions() {
    return this._sourceSheets().map((s) => ({ key: `${s.instanceId}::${s.sheetId}`, label: `${s.name} (${s.rowCount})` }));
  }

  /** @noagent view transform @returns {?{ok: boolean, text: string}} */
  sourceMappingStatus() {
    const current = this.model.sourceWorksheet;
    if (!current) return null;
    const result = readSourceData(this._context, current, this.model.factors, this.model.responses);
    if (result.ok) {
      let text = this._t('sourceMappingOk', { rows: result.rowCount, responses: result.mappedResponseCount });
      if (result.skippedRows) text += ` ${this._t('sourceSkipped', { n: result.skippedRows })}`;
      return { ok: true, text };
    }
    const reason = result.missingFactors && result.missingFactors.length
      ? this._t('sourceMissingFactors', { names: result.missingFactors.join(', ') })
      : this._t('sourceMappingErrorGeneric');
    return { ok: false, text: reason };
  }

  /**
   * Build the optimal design on top of measured data from a project worksheet;
   * columns are matched to factors and responses by name.
   * @agent
   * @param {?string} instanceId the worksheet; null removes the source
   * @param {?string} [sheetId] the sheet of that worksheet
   * @returns {void}
   * @throws {Error} if the worksheet or sheet is not in the project, or is the planner's own datasheet
   */
  setSourceWorksheet(instanceId, sheetId) {
    const m = this.model;
    if (instanceId === null) {
      m.sourceWorksheet = null;
    } else {
      const known = this._sourceSheets().some((s) => s.instanceId === instanceId && s.sheetId === sheetId);
      if (!known) throw new Error(`unknown worksheet ${JSON.stringify(instanceId)} / sheet ${JSON.stringify(sheetId)}; the planner's own datasheet is no source`);
      m.sourceWorksheet = { instanceId, sheetId };
    }
    if (m.isOptimalType()) optimal.raiseRunsToMinimum(m, this._env());
    this._save();
  }

  /** @noagent UI picker @param {Event} event */
  sourceWorksheetChanged(event) {
    const v = event.target.value;
    if (!v) { this.setSourceWorksheet(null); return; }
    const [instanceId, sheetId] = v.split('::');
    this.setSourceWorksheet(instanceId, sheetId);
  }

  // ── Augment ───────────────────────────────────────────────

  /**
   * Add optimal runs to the linked datasheet; the existing runs and their
   * values stay, the new rows are appended.
   * @agent
   * @param {number} n new runs, a whole number of at least 1
   * @returns {number} the run count afterwards
   * @throws {Error} if the type is not optimal, no datasheet is linked, or the computation fails
   */
  augment(n) {
    const count = requireNumber('n', n, { integer: true, min: 1 });
    const m = this.model;
    const ctx = this._context;
    if (!m.isOptimalType()) throw new Error('augmenting needs an optimal design (dopt, aopt or gopt)');
    if (!m.design || !m.worksheetRef || !isWorksheetValid(ctx, m.worksheetRef)) {
      throw new Error('augmenting needs a linked datasheet: create it first (runs.createDatasheet)');
    }
    const factors = m.factors;
    const k = factors.length;
    const newCoded = augmentOptimalDesign(m.design.codedMatrix, k, count, m.designType, {
      terms: m.getActiveTerms(),
      levelCounts: factors.map((f) => f.levels.length),
      categoricalFlags: factors.map((f) => f.kind === 'categorical'),
      seed: Date.now(),
      forbiddenVertices: m.options.forbiddenVertices,
    });
    const newRows = codedToActualRows(newCoded, factors);
    const oldN = m.design.codedMatrix.length;
    const next = Array.from({ length: count }, (_, i) => oldN + i + 1);
    m.design.codedMatrix = [...m.design.codedMatrix, ...newCoded];
    m.design.actualMatrix = [...m.design.actualMatrix, ...newRows];
    m.design.runOrder = [...(m.design.runOrder || []), ...next];
    m.design.stdOrder = [...(m.design.stdOrder || []), ...next];
    m.design.replicateIds = [...(m.design.replicateIds || []), ...new Array(count).fill(1)];
    m.evaluation = evaluateDesign(m.design.codedMatrix, k, m.design.p, m.design.designType, 0.05, { terms: m.modelTerms() });
    appendDoERowsToWorksheet(ctx, m.worksheetRef, factors, newRows);
    if (m.worksheetRef.experimentId) {
      createExperimentRecord(ctx, m.worksheetRef.experimentId, m.design, m.factors, m.responses, m.doeName, m.worksheetRef, m.modelTerms());
    }
    m.worksheetRef.designSignature = m.designSignature();
    this._save();
    ctx.notify(this._t('augmentSuccess', { n: count }), 'success');
    return m.design.codedMatrix.length;
  }

  /** @noagent UI button — reads the run input, reports errors as a note */
  clickAugment() {
    const root = this._container();
    const input = root ? root.querySelector('.doe__augment-runs-input') : null;
    const n = parseInt(input ? input.value : '', 10);
    if (!Number.isFinite(n) || n <= 0) { this._context.notify(this._t('augmentInvalidCount'), 'error'); return; }
    try {
      this.augment(n);
    } catch (err) {
      this._context.notify(err.message, 'error');
    }
  }
}
