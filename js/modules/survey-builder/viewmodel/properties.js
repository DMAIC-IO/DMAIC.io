/**
 * D.Mike — Survey builder: view part "properties" (viewmodel/properties.js)
 *
 * The properties of the selected section (title, hint) or question (type,
 * text, hint, required, the flags of its type, its options or rows). Texts
 * and flags bind with `x-model`; the type goes through `changeQuestionType`
 * with its confirmation, and a declined change shows the old type again.
 * The display group of an option goes through `setItemField`, which drops
 * the key when the field is emptied.
 */
import { runUiCommand } from '../../../core/command-directives.js';

/**
 * @typedef {import('../domain/model.types.js').SurveyModelFields['survey']['sections'][number]['questions'][number]} Question
 * @typedef {import('../domain/model.types.js').ChangeQuestionTypeCommand['type']} QuestionType
 */

/** @type {import('./state.types.js').SurveyBuilderViewFn} */
export const propertiesView = (ctx) => ({
  /** @param {Question} q @param {string} type @returns {boolean} the question has this type */
  isType(q, type) { return q.type === type; },

  /** @param {Question} q @returns {boolean} the question can be marked required */
  canBeRequired(q) { return q.type !== 'info'; },

  /** @param {Question} q @param {string} flag @returns {boolean} the question's type has this flag */
  hasFlag(q, flag) { return flag in q; },

  /** @param {Question} q @returns {boolean} the question has options */
  hasOptions(q) { return Array.isArray(q.options); },

  /** @param {Question} q @returns {boolean} the question has rows */
  hasRows(q) { return Array.isArray(q.rows); },

  /** @param {Question} q @returns {boolean} multiple choice (display groups exist only there) */
  isMulti(q) { return q.type === 'multi'; },

  /** @param {{ group?: string }} item @returns {string} display group of an option */
  itemGroup(item) { return item.group || ''; },

  /**
   * The type picker of the selected question: asks first when imported
   * responses answered it; a declined change shows the old type again.
   * @param {Question} q @param {Event} $event
   * @returns {Promise<void>}
   */
  async typeChanged(q, $event) {
    const el = /** @type {HTMLSelectElement} */ ($event.target);
    const before = q.type;
    const r = await runUiCommand(this._ui, 'changeQuestionType', { questionId: q.id, type: /** @type {QuestionType} */ (el.value) });
    if (r.ok) return;
    el.value = before;
    if ('error' in r) {
      console.warn('[survey-builder] changeQuestionType failed', r.error);
      ctx.notify(this.t('commandFailed'), 'error');
    }
  },

  /**
   * The display group of an option; an empty field removes it.
   * @param {Question} q @param {{ id: string }} item @param {Event} $event
   */
  groupInput(q, item, $event) {
    const value = /** @type {HTMLInputElement} */ ($event.target).value;
    try {
      this.model.setItemField({ questionId: q.id, itemId: item.id, field: 'group', value });
    } catch (err) {
      console.warn('[survey-builder] setItemField failed', err);
      ctx.notify(this.t('commandFailed'), 'error');
    }
  },
});
