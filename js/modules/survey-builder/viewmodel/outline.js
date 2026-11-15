/**
 * D.Mike — Survey builder: view part "outline" (viewmodel/outline.js)
 *
 * The tabs, the header of the questionnaire and the outline of sections
 * and questions with their selection. Texts bind with `x-model`, buttons run
 * the model commands through `x-command`; a question is added through the
 * type picker of its section, which then shows its prompt again. A question
 * is selected in the view field `selectedQuestionId` through the choice
 * group of the outline (`x-set`), a section in the UI state; the edit button
 * of a section clears the question in the same group. A selected section
 * comes first.
 *
 * After every command of this instance — from the interface or from an
 * agent — the part tells how many conditions a structural change removed,
 * selects a new section and leaves the section selection when a question
 * was added (the command selects it).
 *
 * The labels shared by all tabs (type, question, section placeholder,
 * option text) live here as well.
 */
import { runUiCommand } from '../../../core/command-directives.js';
import { findQuestion } from '../domain/conditions.js';
import { typeLabel, questionLabel, sectionPlaceholder, optionText } from '../domain/labels.js';

/**
 * @typedef {import('../domain/model.types.js').SurveyModelFields['survey']['sections'][number]} Section
 * @typedef {Section['questions'][number]} Question
 * @typedef {import('../domain/model.types.js').AddQuestionCommand['type']} QuestionType
 */

/** @type {import('./state.types.js').SurveyBuilderViewFn} */
export const outlineView = (ctx) => {
  /** @type {((e: { instanceId?: string, command?: string, args?: any, result?: any }) => void)|null} */
  let onCommand = null;
  return {
    init() {
      onCommand = (e) => this.afterOutlineCommand(e);
      ctx.eventBus?.on?.('command:executed', onCommand);
    },
    destroy() {
      if (onCommand) ctx.eventBus?.off?.('command:executed', onCommand);
      onCommand = null;
    },

    /**
     * After a command of this instance: report removed conditions, select a
     * new section, leave the section selection for a new question.
     * @param {{ instanceId?: string, command?: string, args?: any, result?: any }} e
     */
    afterOutlineCommand(e) {
      if (e?.instanceId !== ctx.instanceId) return;
      const removed = e.result && typeof e.result === 'object' ? e.result.removedConditions : 0;
      if (removed > 0) ctx.notify(this.t('conditionsRemoved', { count: removed }), 'info');
      if (e.command === 'addSection' && typeof e.result === 'string') this.selectSection(e.result);
      else if (e.command === 'addQuestion') this.state.selectedSectionId = null;
    },

    // ── Tabs ──────────────────────────────────────────────────

    /** @param {string} tab @returns {boolean} */
    isTab(tab) { return this.model.tab === tab; },

    /** @param {string} tab @returns {Record<string, boolean>} */
    tabClass(tab) { return { 'dmike-tab--active': this.isTab(tab) }; },

    // ── Labels shared by all tabs ─────────────────────────────

    /** @param {string} type @returns {string} */
    typeLabel(type) { return typeLabel(type, this.t); },

    /** @param {Question} q @returns {string} „Frage n“ or its text */
    questionLabel(q) { return questionLabel(this.model.survey, q, this.t); },

    /** @param {number} index @returns {string} */
    sectionPlaceholder(index) { return sectionPlaceholder(index, this.t); },

    /** @param {{ text: string }} opt @returns {string} */
    optionText(opt) { return optionText(opt, this.t); },

    /** @param {{ when: unknown }} node @returns {boolean} the node has conditions */
    hasCondition(node) { return Array.isArray(node.when) && node.when.length > 0; },

    // ── Selection ─────────────────────────────────────────────

    /** The selected section, if it still exists. @returns {Section|null} */
    get selectedSection() {
      const id = this.state.selectedSectionId;
      return id === null ? null : (this.model.survey.sections.find((s) => s.id === id) ?? null);
    },

    /** The selected question, if it still exists and no section is selected. @returns {Question|null} */
    get selectedQuestion() {
      const id = this.model.selectedQuestionId;
      return id === null || this.selectedSection ? null : findQuestion(this.model.survey, id);
    },

    /** @returns {boolean} neither a section nor a question is selected */
    get hasNoSelection() { return !this.selectedSection && !this.selectedQuestion; },

    /** @param {Section} sec @returns {boolean} */
    isSelectedSection(sec) { return this.selectedSection?.id === sec.id; },

    /** @param {Question} q @returns {boolean} */
    isSelectedQuestion(q) { return this.selectedQuestion?.id === q.id; },

    /** @param {Section} sec @returns {Record<string, boolean>} */
    sectionClass(sec) { return { 'survey-builder__section--selected': this.isSelectedSection(sec) }; },

    /** @param {Question} q @returns {Record<string, boolean>} */
    questionClass(q) { return { 'survey-builder__question--selected': this.isSelectedQuestion(q) }; },

    /** Select a section for its properties and conditions (its button clears the question). @param {string} id */
    selectSection(id) { this.state.selectedSectionId = id; },

    /** A click on a question: it is selected through the choice group, the section selection ends. */
    questionClick() { this.state.selectedSectionId = null; },

    /**
     * The type picker of a section: adds a question of the chosen type and
     * shows the prompt again.
     * @param {string} sectionId @param {Event} $event
     * @returns {Promise<void>}
     */
    async addQuestionChosen(sectionId, $event) {
      const el = /** @type {HTMLSelectElement} */ ($event.target);
      const type = /** @type {QuestionType} */ (el.value);
      el.value = '';
      if (!type) return;
      const r = await runUiCommand(this._ui, 'addQuestion', { sectionId, type });
      if (!r.ok && 'error' in r) {
        console.warn('[survey-builder] addQuestion failed', r.error);
        ctx.notify(this.t('commandFailed'), 'error');
      }
    },
  };
};
