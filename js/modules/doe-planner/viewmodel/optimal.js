/**
 * D.Mike — DoE Planner: view part "optimal" (viewmodel/optimal.js)
 *
 * The settings of an optimal design (D, A, G): run count, model terms,
 * forbidden factor combinations and the source worksheet. The terms switch
 * through `setTerm`, the term groups fold in the UI state; a new forbidden
 * combination is drafted in the UI state, one coded level per factor, and
 * the button sends it with `addForbiddenVertex`. The source picker lists the
 * sheets of the project's worksheets (`ctx.instances` + `ctx.source`), new
 * ones appear without a reload. Commands that raise the runs get the row
 * count of the source sheet.
 */
import { enumerateTerms, termDisplay } from '../../../engines/doe-terms.js';
import { setFields } from '../../../core/model.js';
import { parseNumber, formatNumber } from '../../../core/number-format.js';
import { markRejection, clearRejection } from '../../../core/param-input.js';
import optimalType from '../domain/designs/optimal.js';
import { sourceData } from '../domain/source.js';
import { readSheet, readSheets } from '../../../core/source-columns.js';
import { letter, activeTerms } from '../domain/design.js';

/** The optimal design type with its own helpers. */
const optimal = /** @type {any} */ (optimalType);

/** @typedef {{ kind: string, order: number, ids: string[] }} TermGroup */
/** @typedef {{ key: string, label: string }} SourceOption */
/** @typedef {{ value: string, label: string, coded: number }} LevelOption */

/**
 * @param {{ levels: ReadonlyArray<string> }} f @param {number} li
 * @returns {number} the coded value of level li (-1 lowest, 1 highest)
 */
const codedLevel = (f, li) => (f.levels.length === 1 ? 0 : -1 + (2 * li) / (f.levels.length - 1));

/** @param {TermGroup} g @returns {boolean} groups shown open before any toggle: all but interactions of order 3+ */
const openByDefault = (g) => !(g.kind === 'ix' && g.order >= 3);

/** @type {import('./state.types.js').DoePlannerViewFn} */
export const optimalView = (ctx) => ({
  // ── Runs ──────────────────────────────────────────────────

  /** Rows of the source sheet, 0 without one. @returns {number} */
  get sourceRows() {
    const ref = this.model.sourceWorksheet;
    return ref ? readSheet(ctx.source, ref)?.rowCount ?? 0 : 0;
  },

  /** @returns {number} new runs the active terms need on top of the source */
  get optimalMinNew() { return optimal.minNewRuns(this.model, { sourceRowCount: this.sourceRows }); },

  /** The run count in the field; the minimum while none is set (0), as before. @returns {string} */
  get optimalRunsText() {
    return formatNumber(this.model.options.optimalRuns || this.optimalMinNew, ctx.context.language, { profile: 'input' });
  },

  /**
   * Takes a typed run count: a whole number from 0; anything else is rejected and the field shows
   * the stored count again. A count below the minimum is raised to the minimum, as before.
   * @param {Event} event change of the field
   * @returns {void}
   */
  optimalRunsChanged(event) {
    const el = /** @type {HTMLInputElement} */ (event.target);
    const n = parseNumber(el.value);
    if (n === null || !Number.isInteger(n) || n < 0) {
      el.value = this.optimalRunsText;
      markRejection(el, ctx.i18n.t('common.inputRejectedPlain'));
      return;
    }
    clearRejection(el);
    setFields(this.model, { options: { ...JSON.parse(JSON.stringify(this.model.options)), optimalRuns: Math.max(this.optimalMinNew, n) } });
  },

  /** @returns {boolean} */
  get optimalRunsValid() { return (this.model.options.optimalRuns || 0) >= this.optimalMinNew; },

  /** @returns {string} */
  get optimalInfo() { return this.t(`optimalInfo_${this.model.designType}`); },

  /** @returns {string} */
  get optimalRunsLabel() { return this.sourceRows > 0 ? this.t('optimalRunsNew') : this.t('optimalRuns'); },

  /** @returns {string} */
  get optimalRunsHint() {
    const m = this.sourceRows;
    return m > 0 ? this.t('optimalMinRunsNew', { min: this.optimalMinNew, m }) : this.t('optimalMinRuns', { min: this.optimalMinNew });
  },

  /** @returns {string} */
  get optimalTooFewText() {
    const m = this.sourceRows;
    return m > 0 ? this.t('optimalTooFewRunsNew', { min: this.optimalMinNew, m }) : this.t('optimalTooFewRuns', { min: this.optimalMinNew });
  },

  // ── Model terms ───────────────────────────────────────────

  /** @returns {boolean} */
  get hasFactors() { return this.model.factors.length >= 1; },

  /** @returns {TermGroup[]} */
  get termGroups() { return enumerateTerms(this.model.factors.length); },

  /** @returns {Set<string>} */
  get activeTermSet() { return new Set(activeTerms(this.model)); },

  /** @param {string} id @returns {boolean} */
  termActive(id) { return this.activeTermSet.has(id); },

  /** @param {string} id @returns {string} */
  termLabel(id) {
    return termDisplay(id, this.model.factors.map((f, i) => (f.name && f.name.trim()) || letter(i)));
  },

  /** @param {TermGroup} g @returns {boolean} main effects stay in the model */
  isMainGroup(g) { return g.kind === 'main'; },

  /**
   * Whether a group is open: the default, flipped when the group was toggled.
   * @param {number} gi @param {TermGroup} g @returns {boolean}
   */
  isTermGroupOpen(gi, g) { return openByDefault(g) !== this.state.termGroupExpanded.includes(gi); },

  /** @param {number} gi @param {TermGroup} g @returns {string} */
  termGroupClass(gi, g) { return this.isTermGroupOpen(gi, g) ? 'doe__term-group--open' : ''; },

  /** @param {number} gi @param {TermGroup} g @returns {string} icon of the fold arrow */
  termGroupIcon(gi, g) { return this.isTermGroupOpen(gi, g) ? 'nav.expand-down' : 'nav.expand-right'; },

  /** @param {TermGroup} g @returns {string} */
  termGroupTitle(g) {
    if (g.kind === 'main') return this.t('termGroupMain');
    if (g.kind === 'quad') return this.t('termGroupQuad');
    return this.t('termGroupNFI', { n: g.order });
  },

  /** @param {TermGroup} g @returns {string} "(on/all)" */
  termGroupCount(g) {
    const set = this.activeTermSet;
    return `(${g.ids.filter((id) => set.has(id)).length}/${g.ids.length})`;
  },

  /** @param {TermGroup} g @param {string} id @returns {string} */
  termChipClass(g, id) {
    const on = this.termActive(id) ? ' doe__term-chip--on' : '';
    const locked = g.kind === 'main' ? ' doe__term-chip--locked' : '';
    return `doe__term-chip${on}${locked}`;
  },

  /** Folds or unfolds a term group (view only). @param {number} gi @returns {void} */
  toggleTermGroup(gi) {
    const list = this.state.termGroupExpanded;
    this.state.termGroupExpanded = list.includes(gi) ? list.filter((x) => x !== gi) : [...list, gi];
  },

  /**
   * Switches a term from its box: on takes the lower terms along, off the higher ones.
   * @param {string} id term id @param {Event} event change of the box
   * @returns {void}
   */
  termChanged(id, event) {
    const on = /** @type {HTMLInputElement} */ (event.target).checked;
    const rows = this.sourceRowCount;
    this.model.setTerm(rows === null ? { id, on } : { id, on, sourceRowCount: rows });
  },

  // ── Forbidden combinations ────────────────────────────────

  /** @returns {Array<Array<number|null>>} */
  get forbiddenList() { return this.model.options.forbiddenVertices; },

  /** @returns {boolean} */
  get forbiddenEmpty() { return this.forbiddenList.length === 0; },

  /** @param {Array<number|null>} pattern @returns {string} "A = 40 ∧ B = any" */
  forbiddenRuleText(pattern) {
    return this.model.factors.map((f, fi) => {
      const v = pattern ? pattern[fi] : null;
      const name = f.name || letter(fi);
      let label;
      if (v === null || v === undefined) label = this.t('forbiddenAny');
      else if (f.levels.length <= 1) label = f.levels[0] ?? '';
      else {
        const idx = Math.max(0, Math.min(f.levels.length - 1, Math.round(((v + 1) * (f.levels.length - 1)) / 2)));
        label = f.levels[idx] ?? String(v);
      }
      return `${name} = ${label}`;
    }).join(' ∧ ');
  },

  /** @param {{ name: string }} f @param {number} fi @returns {string} */
  factorDisplayName(f, fi) { return (f.name && f.name.trim()) || letter(fi); },

  /**
   * The levels of a factor for the draft, as coded values.
   * @param {number} fi factor index @returns {LevelOption[]}
   */
  forbiddenOptions(fi) {
    const f = this.model.factors[fi];
    return f ? f.levels.map((label, li) => ({ value: String(codedLevel(f, li)), label, coded: codedLevel(f, li) })) : [];
  },

  /** @param {number} fi @param {LevelOption} opt @returns {boolean} the draft holds this level */
  isDrafted(fi, opt) { return this.state.forbiddenDraft[fi] === opt.coded; },

  /** @param {number} fi @returns {boolean} the draft holds no level for this factor */
  isDraftAny(fi) { return !this.forbiddenOptions(fi).some((o) => this.isDrafted(fi, o)); },

  /**
   * Takes a level of the draft; empty is any level.
   * @param {number} fi factor index @param {Event} event change of the picker
   * @returns {void}
   */
  draftChanged(fi, event) {
    const raw = /** @type {HTMLSelectElement} */ (event.target).value;
    const opt = this.forbiddenOptions(fi).find((o) => o.value === raw);
    const k = this.model.factors.length;
    const draft = Array.from({ length: Math.max(k, fi + 1) }, (_, i) => this.state.forbiddenDraft[i] ?? null);
    draft[fi] = opt ? opt.coded : null;
    this.state.forbiddenDraft = draft;
  },

  /**
   * Forbids the drafted combination and clears the draft; a level that no
   * longer fits its factor counts as any. Without any level it says what to do.
   * @returns {void}
   */
  addForbidden() {
    const pattern = this.model.factors.map((_, fi) => {
      const opt = this.forbiddenOptions(fi).find((o) => this.isDrafted(fi, o));
      return opt ? opt.coded : null;
    });
    if (!pattern.some((v) => v !== null)) {
      ctx.notify(this.t('forbiddenHint'), 'info');
      return;
    }
    this.model.addForbiddenVertex({ pattern });
    this.state.forbiddenDraft = [];
  },

  // ── Source worksheet ──────────────────────────────────────

  /** @returns {string} "instance::sheet" of the source, '' without */
  get sourceKey() {
    const s = this.model.sourceWorksheet;
    return s ? `${s.instanceId}::${s.sheetId}` : '';
  },

  /** @returns {boolean} */
  get noSource() { return !this.model.sourceWorksheet; },

  /**
   * The sheets of the project's worksheets except the planner's own
   * datasheet; a new worksheet or sheet appears without a reload.
   * @returns {SourceOption[]}
   */
  get sourceOptions() {
    // Depends on the worksheet list even while there is no worksheet yet.
    ctx.source.list();
    const own = this.model.worksheetRef;
    const out = [];
    for (const inst of ctx.instances?.list({ modules: ['worksheet'] }) ?? []) {
      for (const sh of readSheets(ctx.source, inst.instanceId) ?? []) {
        if (own && own.instanceId === inst.instanceId && own.sheetId === sh.id) continue;
        out.push({ key: `${inst.instanceId}::${sh.id}`, label: `${sh.name || sh.id} (${sh.rowCount})` });
      }
    }
    return out;
  },

  /** @param {SourceOption} s @param {number} i @returns {string} */
  sourceOptionKey(s, i) { return `${s.key}:${i}`; },

  /** @param {SourceOption} s @returns {boolean} */
  isSource(s) { return s.key === this.sourceKey; },

  /**
   * Takes the picked source sheet, or none.
   * @param {Event} event change of the picker
   * @returns {void}
   */
  sourceChanged(event) {
    const v = /** @type {HTMLSelectElement} */ (event.target).value;
    if (!v) { this.model.setSourceWorksheet({ ref: null }); return; }
    const cut = v.indexOf('::');
    const ref = { instanceId: v.slice(0, cut), sheetId: v.slice(cut + 2) };
    this.model.setSourceWorksheet({ ref, sourceRowCount: readSheet(ctx.source, ref)?.rowCount ?? 0 });
  },

  /** What the source gives; null without a source or when it could not be read. @returns {{ ok: boolean, text: string }|null} */
  get sourceMappingStatus() {
    const st = this.sourceMapping;
    return st && !st.error ? st : null;
  },

  /** @returns {string} */
  get sourceMappingClass() { return this.sourceMappingStatus?.ok ? 'doe__source-mapping-ok' : 'doe__source-mapping-error'; },

  computed: {
    /**
     * What the source gives: rows and responses found, or why it cannot be read; null without a source.
     * @returns {{ ok: boolean, text: string }|null}
     */
    sourceMapping() {
      const ref = this.model.sourceWorksheet;
      if (!ref) return null;
      const r = sourceData(ctx.source, ref, this.model.factors, this.model.responses);
      if (r.ok) {
        let text = this.t('sourceMappingOk', { rows: r.rowCount, responses: r.mappedResponseCount });
        if (r.skippedRows) text += ` ${this.t('sourceSkipped', { n: r.skippedRows })}`;
        return { ok: true, text };
      }
      const text = r.missingFactors && r.missingFactors.length
        ? this.t('sourceMissingFactors', { names: r.missingFactors.join(', ') })
        : this.t('sourceMappingErrorGeneric');
      return { ok: false, text };
    },
  },
});
