/**
 * D.Mike — Survey builder draft tab (survey-draft-controller.js)
 *
 * Outline, selection, properties, conditions, warnings, live preview
 * and the general export of the "Entwurf" tab.
 * Spread into the data function of survey-builder.js, which owns config,
 * lifecycle, tabs, labels and formatting; `this` is the whole component.
 *
 * Spec: docs/superpowers/specs/2026-10-10-survey-builder-design.md
 */

import { QUESTION_TYPES, availableSources, documentOrder } from './survey-conditions.js';
import { runSurvey, RUNNER_CSS } from './survey-runner.js';
import { buildSurveyHtml, surveyFileName, runnerStrings } from './survey-export.js';
import { downloadBlob } from '../../core/export-utils.js';
import { uid } from '../../core/uid.js';

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

/**
 * @param {object} module the module instance (`_context`, `_container`)
 * @param {function(string, object=): string} _t translation function of the module
 * @returns {object} members of the Alpine component
 */
export function draftController(module, _t) {
  return {
    questionTypes: QUESTION_TYPES,
    /** Runner strings of the preview, cached per questionnaire language. */
    runnerStr: null,
    runnerLang: null,
    /** UI-only selection of a section (ui.selectedQuestionId holds question ids only). */
    selectedSectionId: null,
    /**
     * Condition editor draft of the selected node. Kept locally because
     * State.setConditions drops conditions without options — a freshly
     * added row would vanish before the user ticks an option.
     * @type {Array<{key: string, questionId: string, optionIds: string[]}>}
     */
    condDraft: [],
    _previewTimer: null,

    // ── Header ────────────────────────────────────────────────

    /**
     * @param {'title'|'intro'|'contact'|'lang'|'anonymous'} field
     * @param {Event} ev
     */
    setHeaderFromEvent(field, ev) {
      const el = ev.target;
      this.model.setHeader(field, el.type === 'checkbox' ? el.checked : el.value);
    },

    // ── Outline ───────────────────────────────────────────────

    /** Appends a section and selects it. */
    addSection() {
      this.selectSection(this.model.addSection());
    },

    /** @param {string} id @param {'title'|'hint'} field @param {Event} ev */
    updateSectionFromEvent(id, field, ev) {
      this.model.updateSection(id, field, ev.target.value);
    },

    /** @param {string} id section id */
    moveSectionUp(id) { this.reportRemoved(this.model.moveSection(id, -1)); },

    /** @param {string} id section id */
    moveSectionDown(id) { this.reportRemoved(this.model.moveSection(id, 1)); },

    /**
     * Deletes a section; asks first when it still holds questions.
     * @param {string} id section id
     * @returns {Promise<void>}
     */
    async deleteSection(id) {
      const sec = this.model.section(id);
      if (!sec) return;
      const count = sec.questions.length;
      if (count > 0) {
        const ok = await module._context.dialog.confirm({ message: _t('confirmSectionDelete', { count }), danger: true });
        if (!ok) return;
      }
      if (this.selectedSectionId === id) this.selectedSectionId = null;
      this.reportRemoved(this.model.deleteSection(id));
    },

    /**
     * Type picker of a section (`@change`); resets itself to the prompt.
     * @param {string} sectionId
     * @param {Event} ev
     */
    addQuestionFromEvent(sectionId, ev) {
      const type = ev.target.value;
      ev.target.value = '';
      if (!type) return;
      this.model.addQuestion(sectionId, type);
      this.selectedSectionId = null;
      this._loadCondDraft();
    },

    /** @param {string} id question id */
    moveQuestionUp(id) { this.reportRemoved(this.model.moveQuestion(id, -1)); },

    /** @param {string} id question id */
    moveQuestionDown(id) { this.reportRemoved(this.model.moveQuestion(id, 1)); },

    /**
     * Deletes a question; asks first when imported responses answered it.
     * @param {string} id question id
     * @returns {Promise<void>}
     */
    async deleteQuestion(id) {
      const count = this.model.countAffectedResponses(id);
      if (count > 0) {
        const ok = await module._context.dialog.confirm({ message: _t('confirmDeleteAffected', { count }), danger: true });
        if (!ok) return;
      }
      this.reportRemoved(this.model.deleteQuestion(id));
    },

    // ── Selection ─────────────────────────────────────────────

    /** @param {string} id question id */
    selectQuestion(id) {
      this.selectedSectionId = null;
      this.model.ui.selectedQuestionId = id;
      this._loadCondDraft();
    },

    /** @param {string} id section id */
    selectSection(id) {
      this.model.ui.selectedQuestionId = null;
      this.selectedSectionId = id;
      this._loadCondDraft();
    },

    /** @returns {object|null} the selected question */
    selectedQuestion() { return this.model.question(this.model.ui.selectedQuestionId); },

    /** @returns {object|null} the selected section */
    selectedSection() { return this.selectedSectionId ? this.model.section(this.selectedSectionId) : null; },

    /** @returns {boolean} whether a question is selected */
    hasSelectedQuestion() { return Boolean(this.selectedQuestion()); },

    /** @returns {boolean} whether a section is selected */
    hasSelectedSection() { return Boolean(this.selectedSection()); },

    /** @returns {boolean} whether nothing is selected */
    hasNoSelection() { return !this.hasSelectedQuestion() && !this.hasSelectedSection(); },

    /** @param {string} id question id @returns {object} class map */
    questionClass(id) { return { 'survey-builder__question--selected': id === this.model.ui.selectedQuestionId }; },

    /** @param {string} id section id @returns {object} class map */
    sectionClass(id) { return { 'survey-builder__section--selected': id === this.selectedSectionId }; },

    // ── Properties: section ───────────────────────────────────

    /** @param {'title'|'hint'} field @returns {string} field of the selected section */
    sectionField(field) {
      const s = this.selectedSection();
      return s ? s[field] : '';
    },

    /** @param {'title'|'hint'} field @param {Event} ev */
    updateSelectedSectionFromEvent(field, ev) {
      if (this.selectedSectionId) this.model.updateSection(this.selectedSectionId, field, ev.target.value);
    },

    // ── Properties: question ──────────────────────────────────

    /** @param {string} field @returns {*} field of the selected question */
    questionField(field) {
      const q = this.selectedQuestion();
      return q ? q[field] : '';
    },

    /** @param {'text'|'hint'} field @param {Event} ev */
    updateQuestionFromEvent(field, ev) {
      const q = this.selectedQuestion();
      if (q) this.model.updateQuestion(q.id, field, ev.target.value);
    },

    /** @param {string} type @returns {boolean} whether the selected question has this type */
    isSelectedType(type) {
      const q = this.selectedQuestion();
      return Boolean(q) && q.type === type;
    },

    /**
     * Type select (`@change`); asks first when imported responses answered the question.
     * @param {Event} ev
     * @returns {Promise<void>}
     */
    async changeTypeFromEvent(ev) {
      const q = this.selectedQuestion();
      if (!q) return;
      const type = ev.target.value;
      const count = this.model.countAffectedResponses(q.id);
      if (count > 0) {
        const ok = await module._context.dialog.confirm({ message: _t('confirmChangeType', { count }), danger: true });
        if (!ok) { ev.target.value = q.type; return; }
      }
      this.reportRemoved(this.model.changeType(q.id, type));
    },

    /** @returns {boolean} whether the selected question can be marked required */
    canBeRequired() {
      const q = this.selectedQuestion();
      return Boolean(q) && q.type !== 'info';
    },

    /** @returns {string[]} type-specific flags of the selected question */
    flags() {
      const q = this.selectedQuestion();
      if (!q) return [];
      return Object.keys(FLAG_LABELS).filter((f) => f in q);
    },

    /** @param {string} f flag name @returns {string} translated flag label */
    flagLabel(f) { return _t(FLAG_LABELS[f]); },

    /** @param {string} f flag name @returns {boolean} whether the flag is on */
    hasFlag(f) {
      const q = this.selectedQuestion();
      return Boolean(q) && Boolean(q[f]);
    },

    /** @param {string} f a flag or 'required' @param {Event} ev */
    toggleFlag(f, ev) {
      const q = this.selectedQuestion();
      if (q) this.model.updateQuestion(q.id, f, ev.target.checked);
    },

    // ── Properties: options / rows ────────────────────────────

    /** @returns {'options'|'rows'|null} which item list the selected question has */
    itemKind() {
      const q = this.selectedQuestion();
      if (!q) return null;
      if (Array.isArray(q.options)) return 'options';
      if (Array.isArray(q.rows)) return 'rows';
      return null;
    },

    /** @returns {boolean} whether the selected question has options or rows */
    hasItems() { return this.itemKind() !== null; },

    /** @returns {object[]} options or rows of the selected question */
    items() {
      const kind = this.itemKind();
      return kind ? this.selectedQuestion()[kind] : [];
    },

    /** @returns {string} heading of the item list */
    itemsTitle() { return this.itemKind() === 'rows' ? _t('itemsRows') : _t('itemsOptions'); },

    /** @returns {boolean} true for multiple choice (display groups exist only there) */
    isMulti() {
      const q = this.selectedQuestion();
      return Boolean(q) && q.type === 'multi';
    },

    /** @param {object} item @returns {string} display group of an option */
    itemGroup(item) { return item.group || ''; },

    /** Adds an option/row to the selected question. */
    addItem() {
      const q = this.selectedQuestion();
      const kind = this.itemKind();
      if (q && kind) this.model.addItem(q.id, kind);
    },

    /** @param {string} itemId @param {'text'|'group'} field @param {Event} ev */
    updateItemFromEvent(itemId, field, ev) {
      const q = this.selectedQuestion();
      const kind = this.itemKind();
      if (q && kind) this.model.updateItem(q.id, kind, itemId, field, ev.target.value);
    },

    /** @param {string} itemId */
    moveItemUp(itemId) { this._moveItem(itemId, -1); },

    /** @param {string} itemId */
    moveItemDown(itemId) { this._moveItem(itemId, 1); },

    /** @param {string} itemId @param {number} dir -1 or 1 */
    _moveItem(itemId, dir) {
      const q = this.selectedQuestion();
      const kind = this.itemKind();
      if (q && kind) this.model.moveItem(q.id, kind, itemId, dir);
    },

    /**
     * Deletes an option/row; asks first when imported responses chose it.
     * @param {string} itemId
     * @returns {Promise<void>}
     */
    async deleteItem(itemId) {
      const q = this.selectedQuestion();
      const kind = this.itemKind();
      if (!q || !kind) return;
      const count = this.model.countAffectedResponses(q.id, itemId);
      if (count > 0) {
        const ok = await module._context.dialog.confirm({ message: _t('confirmDeleteAffected', { count }), danger: true });
        if (!ok) return;
      }
      this.reportRemoved(this.model.deleteItem(q.id, kind, itemId));
    },

    // ── Conditions ────────────────────────────────────────────

    /** @returns {string|null} id of the node whose conditions are edited */
    condNodeId() {
      const q = this.selectedQuestion();
      if (q) return q.id;
      const s = this.selectedSection();
      return s ? s.id : null;
    },

    /** @returns {boolean} whether a node is selected whose conditions can be edited */
    hasCondNode() { return this.condNodeId() !== null; },

    /** @returns {object|null} the section or question whose conditions are edited */
    _condNode() {
      const id = this.condNodeId();
      return id ? (this.model.section(id) || this.model.question(id)) : null;
    },

    /** @returns {object[]} earlier single/multi questions */
    condSources() {
      const id = this.condNodeId();
      return id ? availableSources(this.model.survey, id) : [];
    },

    /** @returns {boolean} whether any earlier choice question exists */
    hasCondSources() { return this.condSources().length > 0; },

    /** Re-reads the condition draft from the selected node. */
    _loadCondDraft() {
      const node = this._condNode();
      const when = node && Array.isArray(node.when) ? node.when : [];
      this.condDraft = when.map((c) => ({ key: uid(), questionId: c.questionId, optionIds: c.optionIds.slice() }));
    },

    /** @param {string} key @returns {object|null} draft row */
    _cond(key) { return this.condDraft.find((c) => c.key === key) || null; },

    /** Adds an empty condition row to the draft. */
    addCondition() {
      this.condDraft.push({ key: uid(), questionId: '', optionIds: [] });
    },

    /** @param {string} key draft row key @param {Event} ev */
    setCondSource(key, ev) {
      const c = this._cond(key);
      if (!c) return;
      c.questionId = ev.target.value;
      c.optionIds = [];
      this._commitConditions();
    },

    /** @param {string} key draft row key @returns {object[]} options of the row's source question */
    condOptions(key) {
      const c = this._cond(key);
      if (!c || !c.questionId) return [];
      const src = this.condSources().find((q) => q.id === c.questionId);
      return src ? src.options : [];
    },

    /** @param {string} key @param {string} optionId @returns {boolean} */
    condOptionChecked(key, optionId) {
      const c = this._cond(key);
      return Boolean(c) && c.optionIds.includes(optionId);
    },

    /** @param {string} key @param {string} optionId */
    toggleCondOption(key, optionId) {
      const c = this._cond(key);
      if (!c) return;
      c.optionIds = c.optionIds.includes(optionId)
        ? c.optionIds.filter((id) => id !== optionId)
        : [...c.optionIds, optionId];
      this._commitConditions();
    },

    /** @param {string} key draft row key */
    removeCondition(key) {
      this.condDraft = this.condDraft.filter((c) => c.key !== key);
      this._commitConditions();
    },

    /**
     * Writes the complete draft rows to the model. An edit that leaves the
     * stored conditions unchanged (e.g. picking a source before any option)
     * must not mark the structure dirty, or it would bump the version of
     * an already sent questionnaire.
     */
    _commitConditions() {
      const node = this._condNode();
      if (!node) return;
      const wasDirty = this.model.dirtyStructure;
      const before = JSON.stringify(node.when);
      this.model.setConditions(node.id, this.condDraft.map((c) => ({
        questionId: c.questionId, optionIds: c.optionIds.slice(),
      })));
      if (JSON.stringify(node.when) === before) this.model.dirtyStructure = wasDirty;
    },

    /** @param {object} src source question @returns {string} its label */
    sourceLabel(src) { return this.questionLabel(src); },

    // ── Warnings ──────────────────────────────────────────────

    /** @returns {Array<{key: string, text: string}>} never blocks the export */
    warnings() {
      const out = [];
      const order = documentOrder(this.model.survey);
      if (order.length === 0) out.push({ key: 'none', text: _t('warnNoQuestions') });
      this.model.survey.sections.forEach((sec, i) => {
        if (sec.questions.length === 0) {
          out.push({ key: `s:${sec.id}`, text: _t('warnEmptySection', { section: sec.title || this.sectionPlaceholder(i) }) });
        }
      });
      for (const { question: q } of order) {
        const label = this.questionLabel(q);
        if (!q.text.trim()) out.push({ key: `t:${q.id}`, text: _t('warnEmptyText', { question: label }) });
        const list = q.options || q.rows;
        if (Array.isArray(list) && !list.some((x) => x.text.trim())) {
          out.push({ key: `i:${q.id}`, text: _t('warnNoItems', { question: label }) });
        }
      }
      return out;
    },

    /** @returns {boolean} whether any warning exists */
    hasWarnings() { return this.warnings().length > 0; },

    // ── Preview ───────────────────────────────────────────────

    /** Debounced re-render of the preview after an edit. */
    schedulePreview() {
      clearTimeout(this._previewTimer);
      this._previewTimer = setTimeout(() => this.renderPreview(), PREVIEW_DELAY_MS);
    },

    /**
     * Runs the export's runner in a shadow root (Deviation 8): an iframe
     * `srcdoc` would need an inline script, which the app's CSP blocks. The
     * runner only works relative to `root`, so it needs no document of its
     * own; storage and download are switched off.
     * @returns {Promise<void>}
     */
    async renderPreview() {
      if (this._destroyed) return;
      try {
        const survey = JSON.parse(JSON.stringify(this.model.survey));
        if (!this.runnerStr || this.runnerLang !== survey.lang) {
          this.runnerStr = await runnerStrings(module._context.i18n, survey.lang);
          this.runnerLang = survey.lang;
        }
        if (this._destroyed) return;
        const host = module._container.querySelector('[data-ref="preview"]');
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
        if (!this._destroyed) module._context.notify(_t('previewFailed'), 'error');
      }
    },

    // ── Export ────────────────────────────────────────────────

    /** @returns {string} current version, plus the bump the next export brings */
    versionLine() {
      const version = this.model.survey.version;
      const next = this.model.nextExportVersion();
      return next === version ? _t('versionLine', { version }) : _t('versionNext', { version, next });
    },

    /**
     * "Fragebogen exportieren": general HTML without recipient.
     * @returns {Promise<void>}
     */
    async exportGeneral() {
      const survey = JSON.parse(JSON.stringify(this.model.survey));
      const strings = await runnerStrings(module._context.i18n, survey.lang);
      // The file carries the version the export settles on, but the model is
      // only marked once the file was built: a failure must not bump it.
      survey.version = this.model.nextExportVersion();
      const html = buildSurveyHtml(survey, strings, { recipientId: null });
      this.model.markExported();
      downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), surveyFileName(survey, strings, null));
    },
  };
}
