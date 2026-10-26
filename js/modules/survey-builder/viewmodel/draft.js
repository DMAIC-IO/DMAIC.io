/**
 * D.Mike — Survey builder draft (viewmodel/draft.js)
 *
 * Sub-viewmodel of the "Entwurf" tab: outline, selection, properties,
 * conditions, warnings, live preview and the general export. Owns the
 * preview timer and the condition draft with their lifecycle. Knows the
 * model, survey-labels.js and the pure survey-*.js modules — never a
 * sibling or the shell.
 */

import { QUESTION_TYPES, availableSources, documentOrder } from '../survey-conditions.js';
import { runSurvey, RUNNER_CSS } from '../survey-runner.js';
import { buildSurveyHtml, surveyFileName, runnerStrings } from '../survey-export.js';
import { questionLabel, sectionPlaceholder } from '../survey-labels.js';
import { downloadBlob } from '../../../core/export-utils.js';
import { uid } from '../../../core/uid.js';
import { requireEnum, requireKnownId, requireText } from '../../../core/agent/agent-argcheck.js';

/** Debounce of the live preview after an edit, in ms. */
const PREVIEW_DELAY_MS = 300;

/**
 * Page frame of the preview's shadow root. RUNNER_CSS styles `body`, which
 * does not exist inside a shadow root, so `:host` takes its colours. Fixed
 * light colours on purpose: the preview shows the exported page, which never
 * follows the app theme (same rule as RUNNER_CSS).
 */
const PREVIEW_HOST_CSS = ':host{display:block;background:#f4f5f7;color:#1f2328;'
  + 'font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}';

const FLAG_LABELS = {
  other: 'flagOther', noAnswer: 'flagNoAnswer', importance: 'flagImportance', multiline: 'flagMultiline',
};

/** Type-specific flags of a question, in display order (bound help keys: help-anchors.mjs). */
export const FLAG_KEYS = ['other', 'noAnswer', 'importance', 'multiline'];

/**
 * Header of the questionnaire.
 * @typedef {object} SurveyHeader
 * @property {string} title  title above the questionnaire
 * @property {string} intro  introduction below the title
 * @property {string} contact  whom respondents ask
 * @property {'de'|'en'} lang  language of the exported file
 * @property {boolean} anonymous  answers carry no recipient
 */

/**
 * Texts of a section.
 * @typedef {object} SectionFields
 * @property {string} title  heading of the section
 * @property {string} hint  explanation below the heading
 */

/**
 * Fields of a question; the flags exist only for some types.
 * @typedef {object} QuestionFields
 * @property {string} text  the question
 * @property {string} hint  explanation below the question
 * @property {boolean} required  must be answered (not for info)
 * @property {boolean} other  offers a free "other" answer (single, multi)
 * @property {boolean} noAnswer  offers "no answer" per row (rating)
 * @property {boolean} importance  asks for an importance 1–9 per row (kano)
 * @property {boolean} multiline  multi-line answer field (text)
 */

/**
 * Fields of an option or row.
 * @typedef {object} ItemFields
 * @property {string} text  the text of the option or row
 * @property {string} group  display group of an option (multi only)
 */

const HEADER_KEYS = ['title', 'intro', 'contact', 'lang', 'anonymous'];
const SECTION_KEYS = ['title', 'hint'];
const QUESTION_KEYS = ['text', 'hint', 'required', 'other', 'noAnswer', 'importance', 'multiline'];
const ITEM_KEYS = ['text', 'group'];
const LANGS = ['de', 'en'];
const BOOL_VALUES = [true, false];
const DIRECTIONS = ['up', 'down'];

const HEADER_CHECKS = {
  title: (v) => requireText('value', v),
  intro: (v) => requireText('value', v),
  contact: (v) => requireText('value', v),
  lang: (v) => { requireEnum('value', v, LANGS); return v; },
  anonymous: (v) => { requireEnum('value', v, BOOL_VALUES); return v; },
};
const SECTION_CHECKS = {
  title: (v) => requireText('value', v),
  hint: (v) => requireText('value', v),
};
const QUESTION_CHECKS = {
  text: (v) => requireText('value', v),
  hint: (v) => requireText('value', v),
  required: (v) => { requireEnum('value', v, BOOL_VALUES); return v; },
  other: (v) => { requireEnum('value', v, BOOL_VALUES); return v; },
  noAnswer: (v) => { requireEnum('value', v, BOOL_VALUES); return v; },
  importance: (v) => { requireEnum('value', v, BOOL_VALUES); return v; },
  multiline: (v) => { requireEnum('value', v, BOOL_VALUES); return v; },
};
const ITEM_CHECKS = {
  text: (v) => requireText('value', v),
  group: (v) => requireText('value', v),
};

/** @param {object} q question @returns {'options'|'rows'|null} its item list */
function itemKindOf(q) {
  if (Array.isArray(q.options)) return 'options';
  if (Array.isArray(q.rows)) return 'rows';
  return null;
}

/** @param {'up'|'down'} direction @returns {-1|1} the model's direction */
const step = (direction) => (direction === 'up' ? -1 : 1);

export class DraftViewModel {
  /**
   * @param {{t: function(string, object=): string, context: object, container: function(): ?Element}} deps
   */
  constructor({ t, context, container }) {
    this._t = t;
    this._context = context;
    this._container = container;
    /** @type {?object} the component's State, set by attach() */
    this.model = null;
    this.questionTypes = QUESTION_TYPES;
    /** Runner strings of the preview, cached per questionnaire language. */
    this.runnerStr = null;
    this.runnerLang = null;
    /** UI-only selection of a section (ui.selectedQuestionId holds question ids only). */
    this.selectedSectionId = null;
    /**
     * Condition editor draft of the selected node. Kept locally because
     * State.setConditions drops conditions without options — a freshly
     * added row would vanish before the user ticks an option.
     * @type {Array<{key: string, questionId: string, optionIds: string[]}>}
     */
    this.condDraft = [];
    this._previewTimer = null;
    /** true once detach() ran — blocks preview renders that come back later. */
    this._destroyed = false;
  }

  /**
   * Binds the component's model, re-renders the preview after every edit
   * and loads the condition draft of the current selection.
   * @param {{model: object, watch: function, nextTick: function}} binding
   * @noagent lifecycle
   */
  attach({ model, watch, nextTick }) {
    this.model = model;
    // The view-model object outlives a component: a re-mount attaches it again.
    this._destroyed = false;
    watch(() => JSON.stringify(this.model.survey), () => this.schedulePreview());
    this._loadCondDraft();
    nextTick(() => this.renderPreview());
  }

  /**
   * Stops the preview: pending timer and later renders.
   * @noagent lifecycle
   */
  detach() {
    this._destroyed = true;
    clearTimeout(this._previewTimer);
    this._previewTimer = null;
  }

  /**
   * Notify about conditions a structural change removed and re-read the
   * condition draft (its node may have lost conditions).
   * @param {{removedConditions: number}|undefined} result
   * @returns {number} the number of removed conditions
   * @noagent view transform
   */
  reportRemoved(result) {
    const count = result ? result.removedConditions : 0;
    if (count > 0) this._context.notify(this._t('conditionsRemoved', { count }), 'info');
    this._loadCondDraft();
    return count;
  }

  /** @returns {string[]} ids of all sections */
  _sectionIds() { return this.model.survey.sections.map((s) => s.id); }

  /** @returns {string[]} ids of all questions, in document order */
  _questionIds() { return documentOrder(this.model.survey).map((e) => e.question.id); }

  /** @returns {string[]} ids of all sections and questions */
  _nodeIds() { return [...this._sectionIds(), ...this._questionIds()]; }

  /** @param {object} q @returns {string[]} the keys of QuestionFields this question has */
  _questionKeysOf(q) {
    return ['text', 'hint', ...(q.type === 'info' ? [] : ['required']), ...FLAG_KEYS.filter((f) => f in q)];
  }

  /**
   * @param {string} questionId
   * @param {string} itemId
   * @returns {{q: object, kind: 'options'|'rows'}} the checked question and its item list
   */
  _itemTarget(questionId, itemId) {
    const { q, kind } = this._itemQuestion(questionId);
    requireKnownId('itemId', itemId, q[kind].map((x) => x.id));
    return { q, kind };
  }

  /** @param {string} questionId @returns {{q: object, kind: 'options'|'rows'}} */
  _itemQuestion(questionId) {
    requireKnownId('questionId', questionId, this._questionIds());
    const q = this.model.question(questionId);
    const kind = itemKindOf(q);
    if (!kind) throw new Error(`invalid questionId ${JSON.stringify(questionId)}; a ${q.type} question has no options or rows`);
    return { q, kind };
  }

  // ── Header ────────────────────────────────────────────────

  /**
   * Set one header field of the questionnaire.
   * @agent
   * @param {keyof SurveyHeader} key which header field
   * @param {string|boolean} value the new value; range per key see `SurveyHeader`
   * @returns {void}
   * @throws {Error} if `key` is no header field or `value` is not allowed for it
   */
  setHeader(key, value) {
    requireEnum('key', key, HEADER_KEYS);
    this.model.setHeader(key, HEADER_CHECKS[key](value));
  }

  /**
   * @noagent template handler, see setHeader
   * @param {'title'|'intro'|'contact'|'lang'|'anonymous'} field
   * @param {Event} ev
   */
  setHeaderFromEvent(field, ev) {
    const el = ev.target;
    this.setHeader(field, el.type === 'checkbox' ? el.checked : el.value);
  }

  // ── Outline ───────────────────────────────────────────────

  /**
   * Append an empty section and select it.
   * @agent
   * @returns {string} id of the new section
   */
  addSection() {
    const id = this.model.addSection();
    this.selectSection(id);
    return id;
  }

  /**
   * Set the title or the hint of a section.
   * @agent
   * @param {string} sectionId the section
   * @param {keyof SectionFields} key which text
   * @param {string} value the new text, "" clears it
   * @returns {void}
   * @throws {Error} if the section is unknown or `key` is no section field
   */
  setSectionField(sectionId, key, value) {
    requireKnownId('sectionId', sectionId, this._sectionIds());
    requireEnum('key', key, SECTION_KEYS);
    this.model.updateSection(sectionId, key, SECTION_CHECKS[key](value));
  }

  /**
   * @noagent template handler, see setSectionField
   * @param {string} id @param {'title'|'hint'} field @param {Event} ev
   */
  updateSectionFromEvent(id, field, ev) { this.setSectionField(id, field, ev.target.value); }

  /**
   * Move a section one place up or down. Conditions that would then point
   * at a later question are removed.
   * @agent
   * @param {string} sectionId the section
   * @param {'up'|'down'} direction where to
   * @returns {number} how many conditions were removed
   * @throws {Error} if the section is unknown or `direction` is neither up nor down
   */
  moveSection(sectionId, direction) {
    requireKnownId('sectionId', sectionId, this._sectionIds());
    requireEnum('direction', direction, DIRECTIONS);
    return this.reportRemoved(this.model.moveSection(sectionId, step(direction)));
  }

  /** @noagent template handler, see moveSection @param {string} id */
  moveSectionUp(id) { this.moveSection(id, 'up'); }

  /** @noagent template handler, see moveSection @param {string} id */
  moveSectionDown(id) { this.moveSection(id, 'down'); }

  /**
   * Delete a section with its questions, without asking. Conditions on its
   * questions are removed.
   * @agent
   * @param {string} sectionId the section
   * @returns {number} how many conditions were removed
   * @throws {Error} if the section is unknown
   */
  deleteSection(sectionId) {
    requireKnownId('sectionId', sectionId, this._sectionIds());
    if (this.selectedSectionId === sectionId) this.selectedSectionId = null;
    return this.reportRemoved(this.model.deleteSection(sectionId));
  }

  /**
   * @noagent asks first; agents call deleteSection
   * @param {string} id section id
   * @returns {Promise<void>}
   */
  async confirmDeleteSection(id) {
    const sec = this.model.section(id);
    if (!sec) return;
    const count = sec.questions.length;
    if (count > 0) {
      const ok = await this._context.dialog.confirm({ message: this._t('confirmSectionDelete', { count }), danger: true });
      if (!ok) return;
    }
    this.deleteSection(id);
  }

  /**
   * Append a question of a type to a section and select it.
   * @agent
   * @param {string} sectionId the section
   * @param {'single'|'multi'|'rating'|'kano'|'text'|'info'} type the question type
   * @returns {string} id of the new question
   * @throws {Error} if the section is unknown or `type` is no question type
   */
  addQuestion(sectionId, type) {
    requireKnownId('sectionId', sectionId, this._sectionIds());
    requireEnum('type', type, QUESTION_TYPES);
    const id = this.model.addQuestion(sectionId, type);
    this.selectedSectionId = null;
    this._loadCondDraft();
    return id;
  }

  /**
   * @noagent template handler, see addQuestion; resets the picker to its prompt
   * @param {string} sectionId @param {Event} ev
   */
  addQuestionFromEvent(sectionId, ev) {
    const type = ev.target.value;
    ev.target.value = '';
    if (type) this.addQuestion(sectionId, type);
  }

  /**
   * Move a question one place up or down; at a section boundary it moves
   * into the neighbouring section. Conditions that would then point at a
   * later question are removed.
   * @agent
   * @param {string} questionId the question
   * @param {'up'|'down'} direction where to
   * @returns {number} how many conditions were removed
   * @throws {Error} if the question is unknown or `direction` is neither up nor down
   */
  moveQuestion(questionId, direction) {
    requireKnownId('questionId', questionId, this._questionIds());
    requireEnum('direction', direction, DIRECTIONS);
    return this.reportRemoved(this.model.moveQuestion(questionId, step(direction)));
  }

  /** @noagent template handler, see moveQuestion @param {string} id */
  moveQuestionUp(id) { this.moveQuestion(id, 'up'); }

  /** @noagent template handler, see moveQuestion @param {string} id */
  moveQuestionDown(id) { this.moveQuestion(id, 'down'); }

  /**
   * Delete a question, without asking — also when imported responses
   * answered it. Conditions that pointed at it are removed.
   * @agent
   * @param {string} questionId the question
   * @returns {number} how many conditions were removed
   * @throws {Error} if the question is unknown
   */
  deleteQuestion(questionId) {
    requireKnownId('questionId', questionId, this._questionIds());
    return this.reportRemoved(this.model.deleteQuestion(questionId));
  }

  /**
   * @noagent asks first; agents call deleteQuestion
   * @param {string} id question id
   * @returns {Promise<void>}
   */
  async confirmDeleteQuestion(id) {
    const count = this.model.countAffectedResponses(id);
    if (count > 0) {
      const ok = await this._context.dialog.confirm({ message: this._t('confirmDeleteAffected', { count }), danger: true });
      if (!ok) return;
    }
    this.deleteQuestion(id);
  }

  // ── Selection ─────────────────────────────────────────────

  /** @noagent UI selection @param {string} id question id */
  selectQuestion(id) {
    this.selectedSectionId = null;
    this.model.ui.selectedQuestionId = id;
    this._loadCondDraft();
  }

  /** @noagent UI selection @param {string} id section id */
  selectSection(id) {
    this.model.ui.selectedQuestionId = null;
    this.selectedSectionId = id;
    this._loadCondDraft();
  }

  /** @noagent view transform @returns {object|null} the selected question */
  selectedQuestion() { return this.model.question(this.model.ui.selectedQuestionId); }

  /** @noagent view transform @returns {object|null} the selected section */
  selectedSection() { return this.selectedSectionId ? this.model.section(this.selectedSectionId) : null; }

  /** @noagent view transform @returns {boolean} whether a question is selected */
  hasSelectedQuestion() { return Boolean(this.selectedQuestion()); }

  /** @noagent view transform @returns {boolean} whether a section is selected */
  hasSelectedSection() { return Boolean(this.selectedSection()); }

  /** @noagent view transform @returns {boolean} whether nothing is selected */
  hasNoSelection() { return !this.hasSelectedQuestion() && !this.hasSelectedSection(); }

  /** @noagent view transform @param {string} id question id @returns {object} class map */
  questionClass(id) { return { 'survey-builder__question--selected': id === this.model.ui.selectedQuestionId }; }

  /** @noagent view transform @param {string} id section id @returns {object} class map */
  sectionClass(id) { return { 'survey-builder__section--selected': id === this.selectedSectionId }; }

  // ── Properties: section / question ────────────────────────

  /** @noagent view transform @param {'title'|'hint'} field @returns {string} field of the selected section */
  sectionField(field) {
    const s = this.selectedSection();
    return s ? s[field] : '';
  }

  /**
   * @noagent template handler, see setSectionField
   * @param {'title'|'hint'} field @param {Event} ev
   */
  updateSelectedSectionFromEvent(field, ev) {
    if (this.selectedSectionId) this.setSectionField(this.selectedSectionId, field, ev.target.value);
  }

  /** @noagent view transform @param {string} field @returns {*} field of the selected question */
  questionField(field) {
    const q = this.selectedQuestion();
    return q ? q[field] : '';
  }

  /**
   * Set a text or a flag of a question. Which flags a question has depends
   * on its type, see `QuestionFields`.
   * @agent
   * @param {string} questionId the question
   * @param {keyof QuestionFields} key which field
   * @param {string|boolean} value text for text and hint, true or false for the flags
   * @returns {void}
   * @throws {Error} if the question is unknown, `key` does not exist for its type, or `value` does not fit
   */
  setQuestionField(questionId, key, value) {
    requireKnownId('questionId', questionId, this._questionIds());
    requireEnum('key', key, QUESTION_KEYS);
    const q = this.model.question(questionId);
    const allowed = this._questionKeysOf(q);
    if (!allowed.includes(key)) {
      throw new Error(`invalid key ${JSON.stringify(key)} for a ${q.type} question; allowed: ${allowed.join(', ')}`);
    }
    this.model.updateQuestion(questionId, key, QUESTION_CHECKS[key](value));
  }

  /**
   * @noagent template handler, see setQuestionField
   * @param {'text'|'hint'} field @param {Event} ev
   */
  updateQuestionFromEvent(field, ev) {
    const q = this.selectedQuestion();
    if (q) this.setQuestionField(q.id, field, ev.target.value);
  }

  /** @noagent view transform @param {string} type @returns {boolean} whether the selected question has this type */
  isSelectedType(type) {
    const q = this.selectedQuestion();
    return Boolean(q) && q.type === type;
  }

  /**
   * Change the type of a question, keeping text, hint, required and its
   * conditions; options, rows and flags start empty. Conditions on its
   * options are removed.
   * @agent
   * @param {string} questionId the question
   * @param {'single'|'multi'|'rating'|'kano'|'text'|'info'} type the new type
   * @returns {number} how many conditions were removed
   * @throws {Error} if the question is unknown or `type` is no question type
   */
  changeQuestionType(questionId, type) {
    requireKnownId('questionId', questionId, this._questionIds());
    requireEnum('type', type, QUESTION_TYPES);
    return this.reportRemoved(this.model.changeType(questionId, type));
  }

  /**
   * @noagent asks first; agents call changeQuestionType
   * @param {Event} ev
   * @returns {Promise<void>}
   */
  async changeTypeFromEvent(ev) {
    const q = this.selectedQuestion();
    if (!q) return;
    const type = ev.target.value;
    const count = this.model.countAffectedResponses(q.id);
    if (count > 0) {
      const ok = await this._context.dialog.confirm({ message: this._t('confirmChangeType', { count }), danger: true });
      if (!ok) { ev.target.value = q.type; return; }
    }
    this.changeQuestionType(q.id, type);
  }

  /** @noagent view transform @returns {boolean} whether the selected question can be marked required */
  canBeRequired() {
    const q = this.selectedQuestion();
    return Boolean(q) && q.type !== 'info';
  }

  /**
   * @noagent view transform
   * @returns {string[]} type-specific flags of the selected question
   */
  flags() {
    const q = this.selectedQuestion();
    return q ? FLAG_KEYS.filter((f) => f in q) : [];
  }

  /**
   * @noagent view transform
   * @param {string} f flag name
   * @returns {string} help key of the flag (bound family in help-anchors.mjs)
   */
  flagHelpKey(f) { return `modules.survey-builder.types.QuestionFields.${f}`; }

  /** @noagent view transform @param {string} f flag name @returns {string} translated flag label */
  flagLabel(f) { return this._t(FLAG_LABELS[f]); }

  /** @noagent view transform @param {string} f flag name @returns {boolean} whether the flag is on */
  hasFlag(f) {
    const q = this.selectedQuestion();
    return Boolean(q) && Boolean(q[f]);
  }

  /**
   * @noagent template handler, see setQuestionField
   * @param {string} f a flag or 'required' @param {Event} ev
   */
  toggleFlag(f, ev) {
    const q = this.selectedQuestion();
    if (q) this.setQuestionField(q.id, f, ev.target.checked);
  }

  /**
   * @noagent view transform
   * @returns {'options'|'rows'|null} which item list the selected question has
   */
  itemKind() {
    const q = this.selectedQuestion();
    return q ? itemKindOf(q) : null;
  }

  /** @noagent view transform @returns {boolean} whether the selected question has options or rows */
  hasItems() { return this.itemKind() !== null; }

  /** @noagent view transform @returns {object[]} options or rows of the selected question */
  items() {
    const kind = this.itemKind();
    return kind ? this.selectedQuestion()[kind] : [];
  }

  /** @noagent view transform @returns {string} heading of the item list */
  itemsTitle() { return this.itemKind() === 'rows' ? this._t('itemsRows') : this._t('itemsOptions'); }

  /** @noagent view transform @returns {boolean} true for multiple choice (display groups exist only there) */
  isMulti() {
    const q = this.selectedQuestion();
    return Boolean(q) && q.type === 'multi';
  }

  /** @noagent view transform @param {object} item @returns {string} display group of an option */
  itemGroup(item) { return item.group || ''; }

  /**
   * Append an empty option (single, multi) or row (rating, kano) to a question.
   * @agent
   * @param {string} questionId the question
   * @returns {string} id of the new option or row
   * @throws {Error} if the question is unknown or has no options or rows
   */
  addItem(questionId) {
    const { kind } = this._itemQuestion(questionId);
    return this.model.addItem(questionId, kind);
  }

  /** @noagent template handler, see addItem */
  addItemToSelected() {
    const q = this.selectedQuestion();
    if (q && itemKindOf(q)) this.addItem(q.id);
  }

  /**
   * Set the text of an option or row, or the display group of an option of
   * a multiple choice question.
   * @agent
   * @param {string} questionId the question
   * @param {string} itemId the option or row
   * @param {keyof ItemFields} key which field
   * @param {string} value the new text, "" clears it
   * @returns {void}
   * @throws {Error} if question or item are unknown, or `group` is set on a question that is not multiple choice
   */
  setItemField(questionId, itemId, key, value) {
    const { q, kind } = this._itemTarget(questionId, itemId);
    requireEnum('key', key, ITEM_KEYS);
    if (key === 'group' && q.type !== 'multi') {
      throw new Error(`invalid key "group" for a ${q.type} question; allowed: text`);
    }
    this.model.updateItem(questionId, kind, itemId, key, ITEM_CHECKS[key](value));
  }

  /**
   * @noagent template handler, see setItemField
   * @param {string} itemId @param {'text'|'group'} field @param {Event} ev
   */
  updateItemFromEvent(itemId, field, ev) {
    const q = this.selectedQuestion();
    if (q) this.setItemField(q.id, itemId, field, ev.target.value);
  }

  /**
   * Move an option or row one place up or down within its question.
   * @agent
   * @param {string} questionId the question
   * @param {string} itemId the option or row
   * @param {'up'|'down'} direction where to
   * @returns {void}
   * @throws {Error} if question or item are unknown or `direction` is neither up nor down
   */
  moveItem(questionId, itemId, direction) {
    const { kind } = this._itemTarget(questionId, itemId);
    requireEnum('direction', direction, DIRECTIONS);
    this.model.moveItem(questionId, kind, itemId, step(direction));
  }

  /** @noagent template handler, see moveItem @param {string} itemId */
  moveItemUp(itemId) {
    const q = this.selectedQuestion();
    if (q) this.moveItem(q.id, itemId, 'up');
  }

  /** @noagent template handler, see moveItem @param {string} itemId */
  moveItemDown(itemId) {
    const q = this.selectedQuestion();
    if (q) this.moveItem(q.id, itemId, 'down');
  }

  /**
   * Delete an option or row, without asking — also when imported responses
   * chose it. Conditions on a deleted option are removed.
   * @agent
   * @param {string} questionId the question
   * @param {string} itemId the option or row
   * @returns {number} how many conditions were removed
   * @throws {Error} if question or item are unknown
   */
  deleteItem(questionId, itemId) {
    const { kind } = this._itemTarget(questionId, itemId);
    return this.reportRemoved(this.model.deleteItem(questionId, kind, itemId));
  }

  /**
   * @noagent asks first; agents call deleteItem
   * @param {string} itemId
   * @returns {Promise<void>}
   */
  async confirmDeleteItem(itemId) {
    const q = this.selectedQuestion();
    if (!q || !itemKindOf(q)) return;
    const count = this.model.countAffectedResponses(q.id, itemId);
    if (count > 0) {
      const ok = await this._context.dialog.confirm({ message: this._t('confirmDeleteAffected', { count }), danger: true });
      if (!ok) return;
    }
    this.deleteItem(q.id, itemId);
  }

  // ── Conditions ────────────────────────────────────────────

  /**
   * @returns {string|null} id of the node whose conditions are edited
   * @noagent view transform
   */
  condNodeId() {
    const q = this.selectedQuestion();
    if (q) return q.id;
    const s = this.selectedSection();
    return s ? s.id : null;
  }

  /**
   * @returns {boolean} whether a node is selected whose conditions can be edited
   * @noagent view transform
   */
  hasCondNode() { return this.condNodeId() !== null; }

  /** @returns {object|null} the section or question whose conditions are edited */
  _condNode() {
    const id = this.condNodeId();
    return id ? (this.model.section(id) || this.model.question(id)) : null;
  }

  /**
   * @returns {object[]} earlier single/multi questions
   * @noagent view transform
   */
  condSources() {
    const id = this.condNodeId();
    return id ? availableSources(this.model.survey, id) : [];
  }

  /**
   * @returns {boolean} whether any earlier choice question exists
   * @noagent view transform
   */
  hasCondSources() { return this.condSources().length > 0; }

  /** Re-reads the condition draft from the selected node. */
  _loadCondDraft() {
    const node = this._condNode();
    const when = node && Array.isArray(node.when) ? node.when : [];
    this.condDraft = when.map((c) => ({ key: uid(), questionId: c.questionId, optionIds: c.optionIds.slice() }));
  }

  /** @param {string} key @returns {object|null} draft row */
  _cond(key) { return this.condDraft.find((c) => c.key === key) || null; }

  /**
   * Adds an empty condition row to the draft.
   * @noagent UI draft of the condition editor; agents use setConditions
   */
  addCondition() {
    this.condDraft.push({ key: uid(), questionId: '', optionIds: [] });
  }

  /**
   * @param {string} key draft row key @param {Event} ev
   * @noagent UI draft of the condition editor; agents use setConditions
   */
  setCondSource(key, ev) {
    const c = this._cond(key);
    if (!c) return;
    c.questionId = ev.target.value;
    c.optionIds = [];
    this._commitConditions();
  }

  /**
   * @param {string} key draft row key @returns {object[]} options of the row's source question
   * @noagent view transform
   */
  condOptions(key) {
    const c = this._cond(key);
    if (!c || !c.questionId) return [];
    const src = this.condSources().find((q) => q.id === c.questionId);
    return src ? src.options : [];
  }

  /**
   * @param {string} key @param {string} optionId @returns {boolean}
   * @noagent view transform
   */
  condOptionChecked(key, optionId) {
    const c = this._cond(key);
    return Boolean(c) && c.optionIds.includes(optionId);
  }

  /**
   * @param {string} key @param {string} optionId
   * @noagent UI draft of the condition editor; agents use setConditions
   */
  toggleCondOption(key, optionId) {
    const c = this._cond(key);
    if (!c) return;
    c.optionIds = c.optionIds.includes(optionId)
      ? c.optionIds.filter((id) => id !== optionId)
      : [...c.optionIds, optionId];
    this._commitConditions();
  }

  /**
   * @param {string} key draft row key
   * @noagent UI draft of the condition editor; agents use setConditions
   */
  removeCondition(key) {
    this.condDraft = this.condDraft.filter((c) => c.key !== key);
    this._commitConditions();
  }

  /** Writes the draft rows of the selected node (see _writeConditions). */
  _commitConditions() {
    const id = this.condNodeId();
    if (id) this._writeConditions(id, this.condDraft.map((c) => ({ questionId: c.questionId, optionIds: c.optionIds.slice() })));
  }

  /**
   * Writes conditions to the model. An edit that leaves the stored
   * conditions unchanged (e.g. picking a source before any option) must not
   * mark the structure dirty, or it would bump the version of an already
   * sent questionnaire.
   * @param {string} nodeId
   * @param {Array<{questionId: string, optionIds: string[]}>} when
   */
  _writeConditions(nodeId, when) {
    const node = this.model.section(nodeId) || this.model.question(nodeId);
    if (!node) return;
    const wasDirty = this.model.dirtyStructure;
    const before = JSON.stringify(node.when);
    this.model.setConditions(nodeId, when);
    if (JSON.stringify(node.when) === before) this.model.dirtyStructure = wasDirty;
  }

  /**
   * Replace the conditions of a section or question. It is shown when at
   * least one condition holds; a condition holds when one of its options
   * was chosen. An empty list removes all conditions.
   * @agent
   * @param {string} nodeId the section or question
   * @param {Array<{questionId: string, optionIds: string[]}>} conditions per condition an earlier single or multiple choice question and at least one of its options
   * @returns {number} how many conditions the node has now
   * @throws {Error} if the node is unknown, a question is no earlier choice question, or an option does not belong to it
   */
  setConditions(nodeId, conditions) {
    requireKnownId('nodeId', nodeId, this._nodeIds());
    if (!Array.isArray(conditions)) {
      throw new Error(`invalid conditions ${JSON.stringify(conditions)}; allowed: an array of { questionId, optionIds }`);
    }
    const sources = availableSources(this.model.survey, nodeId);
    const when = conditions.map((c, i) => {
      requireKnownId(`conditions[${i}].questionId`, c?.questionId, sources.map((q) => q.id));
      const options = sources.find((q) => q.id === c.questionId).options.map((o) => o.id);
      const optionIds = Array.isArray(c.optionIds) ? c.optionIds : [];
      if (optionIds.length === 0) {
        throw new Error(`invalid conditions[${i}].optionIds ${JSON.stringify(c.optionIds)}; allowed: at least one of ${options.join(', ')}`);
      }
      optionIds.forEach((id, j) => requireKnownId(`conditions[${i}].optionIds[${j}]`, id, options));
      return { questionId: c.questionId, optionIds: [...optionIds] };
    });
    this._writeConditions(nodeId, when);
    if (nodeId === this.condNodeId()) this._loadCondDraft();
    return when.length;
  }

  /**
   * @param {object} src source question @returns {string} its label
   * @noagent view transform
   */
  sourceLabel(src) { return questionLabel(this.model.survey, src, this._t); }

  // ── Warnings ──────────────────────────────────────────────

  /**
   * @returns {Array<{key: string, text: string}>} never blocks the export
   * @noagent view transform
   */
  warnings() {
    const out = [];
    const order = documentOrder(this.model.survey);
    if (order.length === 0) out.push({ key: 'none', text: this._t('warnNoQuestions') });
    this.model.survey.sections.forEach((sec, i) => {
      if (sec.questions.length === 0) {
        out.push({ key: `s:${sec.id}`, text: this._t('warnEmptySection', { section: sec.title || sectionPlaceholder(i, this._t) }) });
      }
    });
    for (const { question: q } of order) {
      const label = questionLabel(this.model.survey, q, this._t);
      if (!q.text.trim()) out.push({ key: `t:${q.id}`, text: this._t('warnEmptyText', { question: label }) });
      const list = q.options || q.rows;
      if (Array.isArray(list) && !list.some((x) => x.text.trim())) {
        out.push({ key: `i:${q.id}`, text: this._t('warnNoItems', { question: label }) });
      }
    }
    return out;
  }

  /**
   * @returns {boolean} whether any warning exists
   * @noagent view transform
   */
  hasWarnings() { return this.warnings().length > 0; }

  // ── Preview ───────────────────────────────────────────────

  /**
   * Debounced re-render of the preview after an edit.
   * @noagent preview rendering
   */
  schedulePreview() {
    clearTimeout(this._previewTimer);
    this._previewTimer = setTimeout(() => this.renderPreview(), PREVIEW_DELAY_MS);
  }

  /**
   * Runs the export's runner in a shadow root (Deviation 8): an iframe
   * `srcdoc` would need an inline script, which the app's CSP blocks. The
   * runner only works relative to `root`, so it needs no document of its
   * own; storage and download are switched off.
   * @returns {Promise<void>}
   * @noagent preview rendering
   */
  async renderPreview() {
    if (this._destroyed) return;
    try {
      const survey = JSON.parse(JSON.stringify(this.model.survey));
      if (!this.runnerStr || this.runnerLang !== survey.lang) {
        this.runnerStr = await runnerStrings(this._context.i18n, survey.lang);
        this.runnerLang = survey.lang;
      }
      if (this._destroyed) return;
      const root0 = this._container();
      const host = root0 && root0.querySelector('[data-ref="preview"]');
      if (!host) return;
      const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = PREVIEW_HOST_CSS + RUNNER_CSS;
      const root = document.createElement('div');
      shadow.replaceChildren(style, root);
      runSurvey(survey, this.runnerStr, {
        root, recipientId: null, storage: null, download: () => {}, confirm: () => true,
      });
    } catch (err) {
      console.error('survey-builder: preview failed', err);
      if (!this._destroyed) this._context.notify(this._t('previewFailed'), 'error');
    }
  }

  // ── Export ────────────────────────────────────────────────

  /**
   * @returns {string} current version, plus the bump the next export brings
   * @noagent view transform
   */
  versionLine() {
    const version = this.model.survey.version;
    const next = this.model.nextExportVersion();
    return next === version ? this._t('versionLine', { version }) : this._t('versionNext', { version, next });
  }

  /**
   * "Fragebogen exportieren": general HTML without recipient.
   * @returns {Promise<void>}
   * @noagent file download
   */
  async exportGeneral() {
    const survey = JSON.parse(JSON.stringify(this.model.survey));
    const strings = await runnerStrings(this._context.i18n, survey.lang);
    // The file carries the version the export settles on, but the model is
    // only marked once the file was built: a failure must not bump it.
    survey.version = this.model.nextExportVersion();
    const html = buildSurveyHtml(survey, strings, { recipientId: null });
    this.model.markExported();
    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), surveyFileName(survey, strings, null));
  }
}
