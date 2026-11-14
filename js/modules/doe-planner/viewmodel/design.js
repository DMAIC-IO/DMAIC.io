/**
 * D.Mike — DoE Planner: view part "design" (viewmodel/design.js)
 *
 * The design type picker with its recommendation, the type's own choice
 * (resolution table of the fractional factorial, Plackett-Burman row,
 * Box-Behnken note, Taguchi array) and the general options (randomise,
 * new seed, center points, replicates, CCD alpha and center points,
 * Box-Behnken center points). Choices go through the Model commands; a
 * command that raises the optimal runs gets the row count of the source
 * sheet. The tables are `computed` from the factors.
 */
import { DESIGNS, designOf } from '../domain/designs/index.js';
import { hasMultiLevel } from '../domain/designs/check.js';
import { PB_DESIGNS, ALL_RUNS, K_RANGE, BOX_BEHNKEN } from '../domain/tables.js';
import fracType from '../domain/designs/frac.js';
import bbType from '../domain/designs/bb.js';
import taguchiType from '../domain/designs/taguchi.js';
import { isOptimal } from '../domain/design.js';

/** The design-type modules with their own helpers (the registry type knows only the common ones). */
const frac = /** @type {any} */ (fracType);
const bb = /** @type {any} */ (bbType);
const taguchi = /** @type {any} */ (taguchiType);

/** Entries of the type picker with their formula, in picker order. */
const DESIGN_TYPES = Object.freeze([
  { key: 'full', formula: '2ᵏ' },
  { key: 'frac', formula: '2⁽ᵏ⁻ᵖ⁾' },
  { key: 'pb', formula: 'PB' },
  { key: 'ccd', formula: 'CCD' },
  { key: 'bb', formula: 'BB' },
  { key: 'taguchi', formula: 'OA' },
  { key: 'dopt', formula: 'D-Opt' },
  { key: 'aopt', formula: 'A-Opt' },
  { key: 'gopt', formula: 'G-Opt' },
]);

/** Text of a recommendation per type. */
const REC_KEYS = Object.freeze({ full: 'recFull', frac: 'recFrac', pb: 'recPB', bb: 'recBB', taguchi: 'recTaguchi' });

/**
 * One cell of the resolution table.
 * @typedef {object} ResCell
 * @property {number} k factor count of the column
 * @property {number} runs run count of the row
 * @property {string} cls CSS classes
 * @property {string} label resolution or empty
 * @property {boolean} selectable a fraction for the current factor count
 * @property {string|null} res resolution of a selectable cell
 * @property {number|null} p generators of a selectable cell
 */

/** @typedef {{ key: string, formula: string }} DesignTypeEntry */

/** @type {import('./state.types.js').DoePlannerViewFn} */
export const designView = (ctx) => ({
  // ── Source rows ───────────────────────────────────────────

  /**
   * Rows of the source sheet for the commands that raise the optimal runs;
   * null without a source (the argument is left out then).
   * @returns {number|null}
   */
  get sourceRowCount() {
    const ref = this.model.sourceWorksheet;
    return ref ? ctx.data.sheet(ref)?.rowCount ?? 0 : null;
  },

  // ── Type picker ───────────────────────────────────────────

  /** @returns {ReadonlyArray<DesignTypeEntry>} */
  get designTypes() { return DESIGN_TYPES; },

  /** @param {DesignTypeEntry} dt @returns {boolean} the type needs two levels and a factor has more */
  designOptDisabled(dt) { return Boolean(DESIGNS[dt.key]?.twoLevelOnly) && hasMultiLevel(this.model); },

  /** @param {DesignTypeEntry} dt @returns {boolean} */
  isDesignType(dt) { return this.model.designType === dt.key; },

  /** @param {DesignTypeEntry} dt @returns {string} */
  designOptClass(dt) {
    const active = this.isDesignType(dt) ? 'doe__design-opt--active' : '';
    const disabled = this.designOptDisabled(dt) ? 'doe__design-opt--disabled' : '';
    return `${active} ${disabled}`.trim();
  },

  /** @param {DesignTypeEntry} dt @returns {string} */
  designOptTip(dt) { return this.designOptDisabled(dt) ? this.t('tipTwoLevelOnly') : this.t(`tip_${dt.key}`); },

  /** @param {DesignTypeEntry} dt @returns {string} */
  designLabel(dt) { return this.t(`design_${dt.key}`); },

  /** @param {DesignTypeEntry} dt @returns {boolean} full factorial of two-level factors: 2^k */
  showPowerFormula(dt) { return dt.key === 'full' && !hasMultiLevel(this.model); },

  /** @param {DesignTypeEntry} dt @returns {boolean} full factorial with more levels: a product */
  showProductFormula(dt) { return dt.key === 'full' && hasMultiLevel(this.model); },

  /** @param {DesignTypeEntry} dt @returns {boolean} */
  showFracFormula(dt) { return dt.key === 'frac'; },

  /** @param {DesignTypeEntry} dt @returns {boolean} */
  showPlainFormula(dt) { return dt.key !== 'full' && dt.key !== 'frac'; },

  /** @returns {string} e.g. "3×2" */
  get fullProductFormula() { return this.model.factors.map((f) => f.levels.length).join('×'); },

  // ── Recommendation ────────────────────────────────────────

  /** @returns {string} */
  get recommendationText() {
    return this.t(REC_KEYS[this.recommendation] || 'recFull', { k: this.model.factors.length });
  },

  /** @returns {string} */
  get recommendationLabel() { return this.recommendation ? this.t(`design_${this.recommendation}`) : ''; },

  // ── The type's own choice ─────────────────────────────────

  /** @param {string} type @returns {boolean} */
  isType(type) { return this.model.designType === type; },

  /** @returns {boolean} the design type is optimal (D, A, G) */
  get isOptimal() { return isOptimal(this.model); },

  /** @returns {readonly number[]} factor counts of the resolution table */
  get kRange() { return K_RANGE; },

  /** @param {number} k @returns {string} */
  resColClass(k) { return k === this.model.factors.length ? 'doe__res-col--active' : 'doe__res-col--inactive'; },

  /** @returns {string} */
  get resInfoText() {
    const s = this.model.selectedRes;
    if (!s) return this.t('resSelectPrompt');
    return `${s.k} ${this.t('factors')} · ${s.runs} ${this.t('runs')} · ${this.t('resolution')} ${s.res}`;
  },

  /** @returns {string} */
  get definingLabel() { return `${this.t('definingRelation')}:`; },

  /** @returns {string} */
  get pbInfoText() {
    const i = this.model.selectedPBIdx;
    return i !== null && PB_DESIGNS[i] ? `${PB_DESIGNS[i].label} ${this.t('factors')}` : this.t('pbSelectPrompt');
  },

  /** @returns {typeof PB_DESIGNS} */
  get pbDesigns() { return PB_DESIGNS; },

  /** @param {number} di @returns {string} */
  pbRowClass(di) { return this.model.selectedPBIdx === di ? 'doe__pb-row--selected' : ''; },

  /** @returns {boolean} */
  get bbAvailable() { return bb.available(this.model); },

  /** @returns {string} */
  get bbDetailText() {
    const k = this.model.factors.length;
    return BOX_BEHNKEN[k] ? this.t('bbDetail', { k, pairs: BOX_BEHNKEN[k].length, runs: bb.runs(this.model) }) : '';
  },

  /** @returns {string} */
  get bbWarningText() { return this.t('bbNotAvailable', { k: this.model.factors.length, min: 3, max: 7 }); },

  /** @returns {string} */
  get taguchiInfoText() { return this.t(taguchi.levelsKey(this.model)); },

  /** The fitting arrays; none when the computation failed. @returns {Array<{ name: string, runs: number, maxFactors: number }>} */
  get taguchiList() { return Array.isArray(this.taguchiCandidates) ? this.taguchiCandidates : []; },

  /** @returns {boolean} */
  get hasTaguchiCandidates() { return this.taguchiList.length > 0; },

  /** @param {{ name: string }} oa @returns {string} */
  taguchiRowClass(oa) { return taguchi.selected(this.model) === oa.name ? 'doe__taguchi-row--selected' : ''; },

  /** @param {{ name: string }} oa @param {number} i @returns {string} */
  taguchiKey(oa, i) { return `${oa.name}:${i}`; },

  /** @returns {string} */
  get taguchiWarningText() {
    const lc = taguchi.levelCounts(this.model);
    return this.t('taguchiNotAvailable', { k: this.model.factors.length, levels: lc.length ? lc[0] : 0 });
  },

  /**
   * Generators, defining relation and aliases of the chosen fraction; null without one or when the
   * computation failed.
   * @returns {{ generators: string[], defining: string[], aliases: Array<{ term: string, aliasedWith: string }> }|null}
   */
  get aliasDetail() { const d = this.resAlias; return d && !d.error ? d : null; },

  /** @returns {Array<{ runs: number, cells: ResCell[] }>} the table rows; none when the computation failed */
  get resTable() { return Array.isArray(this.resRows) ? this.resRows : []; },

  // ── General options ───────────────────────────────────────

  /** @returns {boolean} the general center-point option applies to the type */
  get showCenterPointsOption() {
    const type = designOf(this.model);
    return !type || type.centerPoints;
  },

  computed: {
    /**
     * Rows of the resolution table: run counts by factor counts.
     * @returns {Array<{ runs: number, cells: ResCell[] }>}
     */
    resRows() {
      const k0 = this.model.factors.length;
      const sel = this.model.selectedRes;
      return ALL_RUNS.map((runs) => ({
        runs,
        cells: K_RANGE.map((k) => {
          const d = frac.def(k, runs);
          const selectable = Boolean(d) && k === k0;
          return {
            k,
            runs,
            cls: frac.cellClass(k, runs, { factors: this.model.factors, selectedRes: sel }),
            label: frac.cellLabel(k, runs, this.t),
            selectable,
            res: selectable ? d.res : null,
            p: selectable ? d.p : null,
          };
        }),
      }));
    },
    /**
     * Generators, defining relation and aliases of the chosen fraction; null without.
     * @returns {{ generators: string[], defining: string[], aliases: Array<{ term: string, aliasedWith: string }> }|null}
     */
    resAlias() { return frac.aliasDetail(this.model); },
    /**
     * The Taguchi arrays that fit the factors.
     * @returns {Array<{ name: string, runs: number, maxFactors: number }>}
     */
    taguchiCandidates() { return taguchi.candidates(this.model); },
  },
});
