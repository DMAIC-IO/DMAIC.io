/**
 * D.Mike — DoE planner design (viewmodel/design.js)
 *
 * Sub-viewmodel of the design choice: the type picker and its
 * recommendation, the type's own parameters (fractional resolution,
 * Plackett-Burman row, Taguchi array) and the general options
 * (randomisation, center points, replicates, CCD alpha and center points,
 * Box-Behnken center points). What a type is lives in designs/; this class
 * only writes the model and saves.
 */
import { PB_DESIGNS, ALL_RUNS, K_RANGE, BOX_BEHNKEN } from '../doe-planner-designs.js';
import { sourceRowCount } from '../doe-planner-worksheet.js';
import { DESIGNS, DESIGN_KEYS, designOf } from '../designs/index.js';
import { hasMultiLevel } from '../designs/check.js';
import frac from '../designs/frac.js';
import bb from '../designs/bb.js';
import taguchi from '../designs/taguchi.js';
import optimal from '../designs/optimal.js';
import { requireBoolean, requireEnum, requireIndex, requireNumber } from '../../../core/agent/agent-argcheck.js';

/** Type picker entries with their formula. */
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

/** Axial distances of the CCD. */
const ALPHA_TYPES = ['rotatable', 'face-centered', 'spherical'];
const REC_KEYS = { full: 'recFull', frac: 'recFrac', pb: 'recPB', bb: 'recBB', taguchi: 'recTaguchi' };

export class DesignViewModel {
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
    /** @type {Array<{key: string, formula: string}>} type picker entries */
    this.designTypes = DESIGN_TYPES;
    /** @type {number[]} factor counts of the resolution table */
    this.kRange = K_RANGE;
    /** @type {number[]} run counts of the resolution table */
    this.allRuns = ALL_RUNS;
    /** @type {object[]} Plackett-Burman rows */
    this.pbDesigns = PB_DESIGNS;
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

  // ── Type picker ───────────────────────────────────────────

  /** @noagent view transform @param {{key: string}} dt @returns {boolean} */
  designOptDisabled(dt) {
    return Boolean(DESIGNS[dt.key] && DESIGNS[dt.key].twoLevelOnly) && hasMultiLevel(this.model);
  }

  /** @noagent view transform @param {{key: string}} dt @returns {string} */
  designOptClass(dt) {
    const active = this.model.designType === dt.key ? 'doe__design-opt--active' : '';
    const disabled = this.designOptDisabled(dt) ? 'doe__design-opt--disabled' : '';
    return (`${active} ${disabled}`).trim();
  }

  /** @noagent view transform @param {{key: string}} dt @returns {string} */
  designOptTip(dt) {
    return this.designOptDisabled(dt) ? this._t('tipTwoLevelOnly') : this._t(`tip_${dt.key}`);
  }

  /** @noagent view transform @returns {boolean} the full factorial is a product of level counts */
  fullIsProduct() { return hasMultiLevel(this.model); }

  /** @noagent view transform @returns {string} e.g. "3×2" */
  fullProductFormula() { return this.model.factors.map((f) => f.levels.length).join('×'); }

  /**
   * Choose the design type. Fractional factorial and Plackett-Burman need
   * two levels per factor; an optimal type gets a default run count.
   * @agent
   * @param {'full'|'frac'|'pb'|'ccd'|'bb'|'taguchi'|'dopt'|'aopt'|'gopt'} type
   * @returns {void}
   * @throws {Error} if the type is unknown or needs two-level factors
   */
  selectDesignType(type) {
    requireEnum('type', type, DESIGN_KEYS);
    if (this.designOptDisabled({ key: type })) throw new Error(`design type ${type} needs factors with two levels each`);
    const m = this.model;
    m.designType = type;
    m.selectedRes = null;
    m.selectedPBIdx = null;
    if (m.isOptimalType() && !m.options.optimalRuns) {
      m.options.optimalRuns = optimal.minNewRuns(m, this._env()) + 2;
    }
    this._save();
  }

  // ── Recommendation ────────────────────────────────────────

  /** @noagent view transform @returns {string} recommended type for the factors, '' if none */
  recommendation() {
    const k = this.model.factors.length;
    const has3 = this.model.factors.some((f) => f.levels.length >= 3);
    if (k <= 4 && !has3) return 'full';
    if (k <= 6 && !has3) return 'frac';
    if (k >= 7 && !has3) return 'pb';
    if (k >= 3 && k <= 7 && has3) return 'bb';
    if (has3) return 'taguchi';
    return '';
  }

  /** @noagent view transform @returns {string} */
  recommendationText() {
    return this._t(REC_KEYS[this.recommendation()] || 'recFull', { k: this.model.factors.length });
  }

  /**
   * Take the recommended design type for the current factors.
   * @agent
   * @returns {?string} the chosen type, null when there is no recommendation
   */
  applyRecommendation() {
    const rec = this.recommendation();
    if (!rec) return null;
    this.model.designType = rec;
    this.model.selectedRes = null;
    this.model.selectedPBIdx = null;
    this._save();
    return rec;
  }

  // ── Fractional factorial: resolution table ────────────────

  /** @noagent view transform @param {number} k @param {number} runs @returns {string} */
  resCellClass(k, runs) { return frac.cellClass(k, runs, this.model); }

  /** @noagent view transform @param {number} k @param {number} runs @param {'k'|'runs'|'res'|'p'} which @returns {?(number|string)} */
  resCellData(k, runs, which) { return frac.cellData(k, runs, which, this.model); }

  /** @noagent view transform @param {number} k @param {number} runs @returns {string} */
  resCellLabel(k, runs) { return frac.cellLabel(k, runs, this._t); }

  /**
   * @noagent click on a table cell; cells of another factor count do nothing
   * @param {number} k
   * @param {number} runs
   */
  resCellClick(k, runs) {
    if (!frac.def(k, runs) || k !== this.model.factors.length) return;
    this.selectResolution(k, runs);
  }

  /**
   * Choose the fractional factorial by run count; the factor count is the current one.
   * @agent
   * @param {number} k the factor count; must equal the number of factors
   * @param {number} runs the run count of the fraction
   * @returns {void}
   * @throws {Error} if the type is not frac, k differs from the factor count, or no fraction exists
   */
  selectResolution(k, runs) {
    const kk = requireNumber('k', k, { integer: true, min: 2 });
    const n = requireNumber('runs', runs, { integer: true, min: 4 });
    if (this.model.designType !== 'frac') throw new Error('a resolution belongs to the fractional factorial: select design type frac first');
    if (kk !== this.model.factors.length) throw new Error(`k must be the factor count ${this.model.factors.length}`);
    const d = frac.def(kk, n);
    if (!d) throw new Error(`no fractional factorial with ${kk} factors in ${n} runs`);
    this.model.selectedRes = { k: kk, runs: n, res: d.res, p: d.p };
    this._save();
  }

  /** @noagent view transform @returns {string} */
  resInfoText() {
    const s = this.model.selectedRes;
    if (!s) return this._t('resSelectPrompt');
    return `${s.k} ${this._t('factors')} · ${s.runs} Runs · ${this._t('resolution')} ${s.res}`;
  }

  /** @noagent view transform @returns {?object} generators, defining relation, aliases */
  resAliasDetail() { return frac.aliasDetail(this.model); }

  // ── Plackett-Burman ───────────────────────────────────────

  /** @noagent view transform @returns {string} */
  pbInfoText() {
    return this.model.selectedPBIdx !== null
      ? `${PB_DESIGNS[this.model.selectedPBIdx].label} ${this._t('factors')}`
      : this._t('pbSelectPrompt');
  }

  /**
   * Choose a Plackett-Burman row by factor range.
   * @agent
   * @param {number} index row of the table, 0 = 2–7 factors
   * @returns {void}
   * @throws {Error} if the type is not pb or the row is unknown
   */
  selectPB(index) {
    requireIndex('index', index, PB_DESIGNS.length, { existing: true });
    if (this.model.designType !== 'pb') throw new Error('a Plackett-Burman row belongs to design type pb: select it first');
    this.model.selectedPBIdx = index;
    this._save();
  }

  // ── Box-Behnken ───────────────────────────────────────────

  /** @noagent view transform @returns {boolean} */
  bbAvailable() { return bb.available(this.model); }

  /** @noagent view transform @returns {string} */
  bbDetailText() {
    const k = this.model.factors.length;
    return this._t('bbDetail', { k, pairs: BOX_BEHNKEN[k].length, runs: bb.runs(this.model) });
  }

  /** @noagent view transform @returns {string} */
  bbWarningText() {
    return this._t('bbNotAvailable', { k: this.model.factors.length, min: 3, max: 7 });
  }

  // ── Taguchi ───────────────────────────────────────────────

  /** @noagent view transform @returns {object[]} */
  taguchiCandidatesList() { return taguchi.candidates(this.model); }

  /** @noagent view transform @returns {number} */
  taguchiFirstLevels() { const lc = taguchi.levelCounts(this.model); return lc.length ? lc[0] : 0; }

  /** @noagent view transform @returns {string} */
  taguchiInfoText() { return this._t(taguchi.levelsKey(this.model)); }

  /** @noagent view transform @returns {string} */
  taguchiSelected() { return taguchi.selected(this.model); }

  /**
   * Choose the Taguchi orthogonal array; only arrays that fit the factors are offered.
   * @agent
   * @param {string} name array name such as L4, L8 or L9
   * @returns {void}
   * @throws {Error} if the type is not taguchi or the array does not fit
   */
  selectTaguchi(name) {
    const names = taguchi.candidates(this.model).map((c) => c.name);
    requireEnum('name', name, names);
    if (this.model.designType !== 'taguchi') throw new Error('an orthogonal array belongs to design type taguchi: select it first');
    this.model.options.taguchiArray = name;
    this._save();
  }

  // ── General options ───────────────────────────────────────

  /** @noagent view transform @returns {boolean} the general center-point option applies */
  showCenterPointsOption() {
    const type = designOf(this.model);
    return !type || type.centerPoints;
  }

  /**
   * Randomise the run order or keep the standard order.
   * @agent
   * @param {boolean} on true randomises
   * @returns {void}
   * @throws {Error} if on is not a boolean
   */
  setRandomize(on) {
    requireBoolean('on', on);
    this.model.options.randomize = on;
    this._save();
  }

  /**
   * Add three center points (full, fractional and Plackett-Burman designs).
   * @agent
   * @param {boolean} on
   * @returns {void}
   * @throws {Error} if on is not a boolean
   */
  setCenterPoints(on) {
    requireBoolean('on', on);
    this.model.options.centerPoints = on;
    this._save();
  }

  /**
   * Repeat every run.
   * @agent
   * @param {number} n replicates, a whole number from 1 to 10
   * @returns {void}
   * @throws {Error} if n is out of range
   */
  setReplicates(n) {
    this.model.options.replicates = requireNumber('n', n, { integer: true, min: 1, max: 10 });
    this._save();
  }

  /**
   * Choose the axial distance of the central composite design.
   * @agent
   * @param {'rotatable'|'face-centered'|'spherical'} type
   * @returns {void}
   * @throws {Error} if the type is unknown
   */
  setAlphaType(type) {
    requireEnum('type', type, ALPHA_TYPES);
    this.model.options.alphaType = type;
    this._save();
  }

  /**
   * Center points of the central composite design.
   * @agent
   * @param {number} n a whole number, at least 1
   * @returns {void}
   * @throws {Error} if n is not a whole number of at least 1
   */
  setCcdCenterPoints(n) {
    this.model.options.ccdCenterPoints = requireNumber('n', n, { integer: true, min: 1 });
    this._save();
  }

  /**
   * Center points of the Box-Behnken design.
   * @agent
   * @param {number} n a whole number, at least 1
   * @returns {void}
   * @throws {Error} if n is not a whole number of at least 1
   */
  setBbCenterPoints(n) {
    this.model.options.bbCenterPoints = requireNumber('n', n, { integer: true, min: 1 });
    this._save();
  }
}
