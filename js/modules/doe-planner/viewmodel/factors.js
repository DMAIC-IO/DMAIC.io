/**
 * D.Mike — DoE Planner: view part "factors" (viewmodel/factors.js)
 *
 * The plan name, the factor list (name, unit, kind, levels) and the
 * response list. Names and units bind with `x-model`; adding and removing
 * go through the Model commands. A level is typed as text: a categorical
 * factor takes any label, a continuous one a number (decimal comma or
 * point) or nothing; the text is stored as typed, like before. A kind
 * change to categorical clears the unit.
 */
import { setFields } from '../../../core/model.js';
import { parseNumber } from '../../../core/number-format.js';
import { markRejection, clearRejection } from '../../../core/param-input.js';
import { letter } from '../domain/design.js';
import { MIN_LEVELS, MIN_RESPONSES } from '../domain/model.js';

/**
 * @typedef {import('../domain/model.types.js').StateFields['factors'][number]} Factor
 */

/** @param {any} v @returns {any} a plain deep copy */
const plain = (v) => JSON.parse(JSON.stringify(v));

/** @type {import('./state.types.js').DoePlannerViewFn} */
export const factorsView = (ctx) => ({
  // ── Name ──────────────────────────────────────────────────

  /** Label of the name field: the phase name in project mode. @returns {string} */
  get nameLabel() { return this.model.projectMode ? this.t('phaseName') : this.t('doeName'); },

  // ── Factors ───────────────────────────────────────────────

  /** @returns {string} */
  get addFactorLabel() { return `+ ${this.t('addFactor')}`; },

  /** @param {number} i @returns {string} A, B, … */
  factorLetter(i) { return letter(i); },

  /** @param {Factor} f @returns {boolean} */
  isCategorical(f) { return f.kind === 'categorical'; },

  /** @param {Factor} f @returns {'continuous'|'categorical'} */
  factorKind(f) { return f.kind === 'categorical' ? 'categorical' : 'continuous'; },

  /** @param {Factor} f @param {string} kind @returns {boolean} the option of this kind is the factor's */
  isKind(f, kind) { return this.factorKind(f) === kind; },

  /** Error class of a name another factor also has (case and blanks aside). @param {Factor} f @returns {string} */
  factorNameClass(f) {
    const n = f.name.trim().toLowerCase();
    if (!n) return '';
    const count = this.model.factors.filter((x) => x.name.trim().toLowerCase() === n).length;
    return count > 1 ? 'field--error' : '';
  },

  /** @param {Factor} f @returns {string} */
  factorNameTitle(f) { return this.factorNameClass(f) ? this.t('duplicateFactorError') : ''; },

  /** @param {Factor} f @returns {string} */
  factorUnitTitle(f) { return this.isCategorical(f) ? this.t('factorUnitCategoricalDisabled') : ''; },

  /** @param {Factor} f @returns {string} */
  levelPlaceholder(f) { return this.isCategorical(f) ? this.t('factorLevelLabelPlaceholder') : '…'; },

  /** @param {number} li @returns {number} the position after level li */
  afterLevel(li) { return li + 1; },

  /** @param {number} li @returns {number} 1-based number of level li */
  levelNumber(li) { return li + 1; },

  /** @param {Factor} f @returns {boolean} a level may go: more than the fewest remain */
  canRemoveLevel(f) { return f.levels.length > MIN_LEVELS; },

  /**
   * Takes a factor's new kind; categorical factors carry no unit.
   * @param {Factor} f @param {Event} event change of the kind picker
   * @returns {void}
   */
  kindChanged(f, event) {
    const kind = /** @type {HTMLSelectElement} */ (event.target).value === 'categorical' ? 'categorical' : 'continuous';
    const factors = plain(this.model.factors).map((/** @type {Factor} */ x) => (x.id === f.id
      ? { ...x, kind, unit: kind === 'categorical' ? '' : x.unit }
      : x));
    setFields(this.model, { factors });
  },

  /**
   * Takes a typed level. A categorical factor takes any text; a continuous
   * one a number (decimal comma or point) or nothing. The text is stored as
   * typed. Anything else is rejected and the field shows the stored level again.
   * @param {Factor} f @param {number} li level index @param {Event} event change of the level field
   * @returns {void}
   */
  levelChanged(f, li, event) {
    const el = /** @type {HTMLInputElement} */ (event.target);
    const value = el.value;
    if (!this.isCategorical(f)) {
      const n = parseNumber(value);
      if (n !== null && !Number.isFinite(n)) {
        el.value = f.levels[li] ?? '';
        markRejection(el, ctx.i18n.t('common.inputRejectedPlain'));
        return;
      }
    }
    clearRejection(el);
    const factors = plain(this.model.factors).map((/** @type {Factor} */ x) => (x.id === f.id
      ? { ...x, levels: x.levels.map((lv, i) => (i === li ? value : lv)) }
      : x));
    setFields(this.model, { factors });
  },

  // ── Responses ─────────────────────────────────────────────

  /** @returns {string} */
  get addResponseLabel() { return `+ ${this.t('addResponse')}`; },

  /** @param {number} i @returns {string} Y1, Y2, … */
  responseLetter(i) { return `Y${i + 1}`; },

  /** A response may go: more than the fewest remain. @returns {boolean} */
  get canRemoveResponse() { return this.model.responses.length > MIN_RESPONSES; },
});
