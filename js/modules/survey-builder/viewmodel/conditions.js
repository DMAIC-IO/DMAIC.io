/**
 * D.Mike — Survey builder: view part "conditions" (viewmodel/conditions.js)
 *
 * The condition editor of the selected section or question. Its rows live
 * in the UI state (`conditionDraft`): a new row has neither a source nor an
 * option yet, and the model keeps only complete conditions. Every edit of a
 * row hands the complete rows to `setConditions` — only when they differ
 * from the stored ones, so that picking a source alone does not mark the
 * structure changed (that would raise the version of a questionnaire that
 * is already out).
 *
 * The draft is read again from the model when the selection changes, after
 * a structural command (it may have removed conditions) and when the
 * conditions of the node were set from elsewhere (an agent).
 */
import { uid } from '../../../core/uid.js';
import { availableSources, findQuestion } from '../domain/conditions.js';
import { questionLabel } from '../domain/labels.js';

/** Commands after which the draft is read again from the model. */
const RELOAD_AFTER = new Set([
  'addSection', 'moveSection', 'removeSection', 'addQuestion', 'moveQuestion', 'removeQuestion',
  'changeQuestionType', 'removeItem', 'setConditions',
]);

/**
 * @typedef {{ key: string, questionId: string, optionIds: string[] }} DraftRow
 * @typedef {{ questionId: string, optionIds: string[] }} Condition
 */

/** @param {DraftRow[]} rows @returns {Condition[]} the complete rows as conditions */
const complete = (rows) => rows
  .filter((c) => c.questionId && c.optionIds.length > 0)
  .map((c) => ({ questionId: c.questionId, optionIds: [...c.optionIds] }));

/** @type {import('./state.types.js').SurveyBuilderViewFn} */
export const conditionsView = (ctx) => {
  /** @type {((e: { instanceId?: string, command?: string, args?: any }) => void)|null} */
  let onCommand = null;
  /** true while the draft itself writes, so its own write does not reload it */
  let committing = false;
  return {
    init() {
      this.loadConditionDraft();
      this.$watch(() => this.condNodeId, () => this.loadConditionDraft());
      onCommand = (e) => {
        if (e?.instanceId !== ctx.instanceId || committing || !RELOAD_AFTER.has(e.command ?? '')) return;
        this.loadConditionDraft();
      };
      ctx.eventBus?.on?.('command:executed', onCommand);
    },
    destroy() {
      if (onCommand) ctx.eventBus?.off?.('command:executed', onCommand);
      onCommand = null;
    },

    /** id of the node whose conditions are edited, or null. @returns {string|null} */
    get condNodeId() {
      const q = this.selectedQuestion;
      if (q) return q.id;
      const s = this.selectedSection;
      return s ? s.id : null;
    },

    /** @returns {boolean} a node is selected */
    get hasCondNode() { return this.condNodeId !== null; },

    /** Earlier single and multiple choice questions of the node. @returns {any[]} */
    get condSources() {
      const id = this.condNodeId;
      return id ? availableSources(this.model.survey, id) : [];
    },

    /** @returns {boolean} an earlier choice question exists */
    get hasCondSources() { return this.condSources.length > 0; },

    /** Reads the draft from the conditions of the selected node. */
    loadConditionDraft() {
      const id = this.condNodeId;
      const node = id ? this.nodeOf(id) : null;
      const when = node && Array.isArray(node.when) ? node.when : [];
      this.state.conditionDraft = when.map((c) => ({ key: uid(), questionId: c.questionId, optionIds: [...c.optionIds] }));
    },

    /** @param {string} id @returns {any} the section or question with this id, or null */
    nodeOf(id) { return this.model.survey.sections.find((s) => s.id === id) ?? findQuestion(this.model.survey, id); },

    /** @param {string} key @returns {DraftRow|null} */
    condRow(key) { return this.state.conditionDraft.find((c) => c.key === key) ?? null; },

    /** @param {any} src a source question @returns {string} its label */
    sourceLabel(src) { return questionLabel(this.model.survey, src, this.t); },

    /** @param {DraftRow} c @param {{ id: string }} src @returns {boolean} */
    isCondSource(c, src) { return c.questionId === src.id; },

    /** @param {DraftRow} c @returns {boolean} the row has no source yet */
    hasNoCondSource(c) { return !c.questionId; },

    /** Options of the row's source question. @param {string} key @returns {any[]} */
    condOptions(key) {
      const c = this.condRow(key);
      if (!c || !c.questionId) return [];
      return this.condSources.find((q) => q.id === c.questionId)?.options ?? [];
    },

    /** @param {string} key @param {string} optionId @returns {boolean} */
    condOptionChecked(key, optionId) { return Boolean(this.condRow(key)?.optionIds.includes(optionId)); },

    /** An empty row. */
    addCondition() {
      this.state.conditionDraft = [...this.state.conditionDraft, { key: uid(), questionId: '', optionIds: [] }];
    },

    /** The source of a row; its options start empty. @param {string} key @param {Event} $event */
    setCondSource(key, $event) {
      const questionId = /** @type {HTMLSelectElement} */ ($event.target).value;
      this.state.conditionDraft = this.state.conditionDraft
        .map((c) => (c.key === key ? { ...c, questionId, optionIds: [] } : c));
      this.commitConditions();
    },

    /** Ticks or unticks an option of a row. @param {string} key @param {string} optionId */
    toggleCondOption(key, optionId) {
      this.state.conditionDraft = this.state.conditionDraft.map((c) => {
        if (c.key !== key) return c;
        const optionIds = c.optionIds.includes(optionId) ? c.optionIds.filter((id) => id !== optionId) : [...c.optionIds, optionId];
        return { ...c, optionIds };
      });
      this.commitConditions();
    },

    /** Removes a row. @param {string} key */
    removeCondition(key) {
      this.state.conditionDraft = this.state.conditionDraft.filter((c) => c.key !== key);
      this.commitConditions();
    },

    /** Hands the complete rows to the model, when they differ from the stored conditions. */
    commitConditions() {
      const nodeId = this.condNodeId;
      if (!nodeId) return;
      const node = this.nodeOf(nodeId);
      const conditions = complete(this.state.conditionDraft);
      if (JSON.stringify(conditions) === JSON.stringify(node.when ?? [])) return;
      committing = true;
      try {
        this.model.setConditions({ nodeId, conditions });
      } catch (err) {
        console.warn('[survey-builder] setConditions failed', err);
        ctx.notify(this.t('commandFailed'), 'error');
      } finally {
        committing = false;
      }
    },
  };
};
