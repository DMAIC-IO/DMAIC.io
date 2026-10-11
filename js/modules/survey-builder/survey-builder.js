/**
 * D.Mike — Survey builder module (survey-builder.js)
 *
 * Author a VoC questionnaire, send it as a self-contained HTML file per
 * recipient, import the answer files and evaluate them. Phase: Define.
 *
 * The model (survey-builder-model.js) owns the persisted state; the pure
 * modules next to it own conditions, export, import, statistics, report and
 * the hand-over to kano / voc-ctx-tree. This data function only wires the UI.
 *
 * Spec: docs/superpowers/specs/2026-10-10-survey-builder-design.md
 */

import { createModule } from '../../core/template-module.js';
import { State } from './survey-builder-model.js';
import { QUESTION_TYPES, availableSources, documentOrder, findQuestion, isVisible } from './survey-conditions.js';
import { runSurvey, RUNNER_CSS } from './survey-runner.js';
import { buildSurveyHtml, surveyFileName, runnerStrings, sanitizeFileNamePart } from './survey-export.js';
import { parseResponse } from './survey-import.js';
import {
  filterResponses, questionStats, formatAnswer, worksheetColumns,
  responseRate, ratingRanking, kanoOverview, freeTextSummary, groupComparison, otherKey,
} from './survey-stats.js';
import { reportStrings, buildReportHtml } from './survey-report.js';
import {
  buildWorksheetState, listInstances, treePhaseForCycle, kanoStateFromSurvey, vocsFromAnswers, appendVocs,
} from './survey-link.js';
import { provisionInstance } from '../../core/examples-registry.js';
import { uniqueSheetName } from '../../ui/column-picker.js';
import { DEFAULT_CYCLE } from '../../core/cycles/cycles.js';
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

const TYPE_LABELS = {
  single: 'typeSingle', multi: 'typeMulti', rating: 'typeRating',
  kano: 'typeKano', text: 'typeText', info: 'typeInfo',
};

const FLAG_LABELS = {
  other: 'flagOther', noAnswer: 'flagNoAnswer', importance: 'flagImportance', multiline: 'flagMultiline',
};

const STATUS_LABELS = {
  'not-sent': 'statusNotSent', sent: 'statusSent', answered: 'statusAnswered',
};

const IMPORT_LABELS = {
  ok: 'importOk', older: 'importOlder', duplicate: 'importDuplicate', foreign: 'importForeign', invalid: 'importInvalid',
};

/** Keys of `modules.survey-builder.ws.*`, the worksheet column labels. */
const WS_KEYS = ['responseId', 'submittedAt', 'recipient', 'other', 'functional', 'dysfunctional', 'importance', 'category', 'question'];

const KANO_CATEGORIES = ['M', 'O', 'A', 'I', 'R', 'Q'];

/** Plain deep copy — strips Alpine proxies before handing state to pure code. */
const _plain = (value) => JSON.parse(JSON.stringify(value));

/** "Top-Prioritäten" shows this many rows until expanded (spec §7.1). */
const RANKING_TOP = 10;

export default createModule({
  config: {
    id: 'survey-builder',
    engine: 'alpine',
    phase: 'define',
    icon: 'module.survey-builder',
    version: '1.0.0',
    meta: import.meta,
  },
  Model: State,

  /**
   * Alpine data function of the module.
   * @param {object} module the module instance (`_context`, `_container`)
   * @param {function(string, object=): string} _t translation function of the module
   * @returns {object} Alpine component state and methods
   */
  data(module, _t) {
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
      _t,
      _previewTimer: null,
      _unsubs: [],
      /** @type {object[]} mounted chart instances (results tab) */
      _charts: [],
      /** Render generation — drops mounts from outdated runs. */
      _renderGen: 0,
      /** true once destroy() ran — blocks mounts that come back later. */
      _destroyed: false,
      /**
       * Result of every imported file in this session (not persisted).
       * @type {Array<{key: string, name: string, status: string, notes: string[]}>}
       */
      importLog: [],
      /** Response whose answers are unfolded in the list. */
      openResponseId: null,
      /** Free-text answers ticked for the VoC tree, keys `<responseId>:<questionId>`. */
      vocSelected: [],
      /** "Top-Prioritäten" expanded beyond RANKING_TOP rows (session only). */
      showAllRanking: false,
      /** Bumped whenever kano instances may have changed — the state manager is not reactive. */
      kanoRev: 0,

      /** Alpine lifecycle hook. */
      init() {
        this._unsubs = [];
        this.$watch(() => JSON.stringify(this.model.survey), () => this.schedulePreview());
        this.$watch(() => this._resultsSignature(), () => this.scheduleCharts());
        this._loadCondDraft();
        this.$nextTick(() => this.renderPreview());
        const eb = module._context.eventBus;
        const onTheme = () => this.scheduleCharts();
        eb.on('theme:changed', onTheme);
        this._unsubs.push(() => eb.off('theme:changed', onTheme));
        const onInstances = () => { this.kanoRev++; };
        for (const evt of ['module:added', 'module:removed']) {
          eb.on(evt, onInstances);
          this._unsubs.push(() => eb.off(evt, onInstances));
        }
        if (this.isTab('results')) this.scheduleCharts();
      },

      /** Alpine lifecycle hook: timers, subscriptions, charts. */
      destroy() {
        this._destroyed = true;
        clearTimeout(this._previewTimer);
        (this._unsubs || []).forEach((off) => off());
        this._unsubs = [];
        this.destroyCharts();
      },

      /** Unmounts every chart of the results tab. */
      destroyCharts() {
        for (const c of this._charts) {
          try { module._context.chartManager.destroy(c); } catch { /* ignore */ }
        }
        this._charts = [];
      },

      // ── Tabs ──────────────────────────────────────────────────

      /**
       * @param {'draft'|'recipients'|'results'} tab
       * @returns {boolean} whether the tab is the active one
       */
      isTab(tab) { return this.model.ui.tab === tab; },

      /**
       * @param {'draft'|'recipients'|'results'} tab
       * @returns {object} class map for the tab button
       */
      tabClass(tab) { return { 'dmike-tab--active': this.isTab(tab) }; },

      /**
       * Charts only live on the results tab: entering it mounts them,
       * leaving it drops them (a hidden host has no size to draw into).
       * @param {'draft'|'recipients'|'results'} tab
       */
      setTab(tab) {
        this.model.ui.tab = tab;
        if (tab === 'results') {
          this.scheduleCharts();
          return;
        }
        this._renderGen++;
        this.destroyCharts();
      },

      // ── Labels ────────────────────────────────────────────────

      /** @param {string} type @returns {string} translated question type */
      typeLabel(type) { return _t(TYPE_LABELS[type] || 'typeText'); },

      /**
       * Question text, or "Frage <n>" (position in document order) when empty.
       * @param {object} q
       * @returns {string}
       */
      questionLabel(q) {
        if (q.text && q.text.trim()) return q.text.trim();
        const n = documentOrder(this.model.survey).findIndex((e) => e.question.id === q.id) + 1;
        return _t('questionNumber', { n });
      },

      /** @param {number} index 0-based @returns {string} placeholder of an untitled section */
      sectionPlaceholder(index) { return _t('sectionUntitled', { n: index + 1 }); },

      /** @param {{when: Array|null}} node @returns {boolean} whether the node has conditions */
      hasCondition(node) { return Array.isArray(node.when) && node.when.length > 0; },

      /**
       * Notify about conditions a structural change removed and re-read the
       * condition draft (its node may have lost conditions).
       * @param {{removedConditions: number}|undefined} result
       */
      reportRemoved(result) {
        const count = result ? result.removedConditions : 0;
        if (count > 0) module._context.notify(_t('conditionsRemoved', { count }), 'info');
        this._loadCondDraft();
      },

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
          const ok = await module._context.confirmPopout(_t('confirmSectionDelete', { count }), { danger: true });
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
          const ok = await module._context.confirmPopout(_t('confirmDeleteAffected', { count }), { danger: true });
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
          const ok = await module._context.confirmPopout(_t('confirmChangeType', { count }), { danger: true });
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
          const ok = await module._context.confirmPopout(_t('confirmDeleteAffected', { count }), { danger: true });
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

      /** @param {object} opt option @returns {string} its text or a placeholder */
      optionText(opt) { return opt.text || _t('optionUntitled'); },

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

      // ── Formatting ────────────────────────────────────────────

      /** @returns {'de-DE'|'en-US'} locale of the app language */
      _locale() { return module._context.i18n.getLanguage() === 'en' ? 'en-US' : 'de-DE'; },

      /**
       * @param {string|null} iso
       * @returns {string} local date and time, '–' when empty
       */
      formatDateTime(iso) {
        if (!iso) return '–';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '–';
        return d.toLocaleString(this._locale(), { dateStyle: 'short', timeStyle: 'short' });
      },

      /**
       * @param {number|null} share 0..1
       * @returns {string} "42 %", '—' without a base
       */
      fmtPct(share) {
        return share === null || share === undefined ? '—' : `${Math.round(share * 100)} %`;
      },

      /**
       * @param {number|null} value
       * @param {number} decimals
       * @returns {string} localised number, '—' when empty
       */
      fmtNum(value, decimals) {
        if (value === null || value === undefined) return '—';
        return Number(value).toLocaleString(this._locale(), {
          minimumFractionDigits: decimals, maximumFractionDigits: decimals,
        });
      },

      /**
       * Phase this instance lives in — new kano / worksheet instances are
       * created next to it (spec §6.2, §8.1).
       * @returns {string}
       */
      _ownPhase() {
        const phases = module._context.stateManager.get('phases') || {};
        for (const phase of Object.keys(phases)) {
          const list = phases[phase];
          if (Array.isArray(list) && list.some((i) => i.instanceId === module._context.instanceId)) return phase;
        }
        return 'define';
      },

      // ── Recipients ────────────────────────────────────────────

      /** @returns {boolean} whether at least one recipient exists */
      hasRecipients() { return this.model.recipients.length > 0; },

      /** Adds an empty recipient row. */
      addRecipient() { this.model.addRecipient(); },

      /**
       * @param {string} id recipient id
       * @param {string} field recipient field
       * @param {Event} ev input event
       */
      updateRecipientFromEvent(id, field, ev) {
        this.model.updateRecipient(id, field, ev.target.value);
      },

      /**
       * @param {string|null} id recipient id
       * @returns {string|null} trimmed name, null when unknown or unnamed
       */
      recipientName(id) {
        const r = id ? this.model.recipients.find((x) => x.id === id) : null;
        return r && r.name.trim() ? r.name.trim() : null;
      },

      /**
       * Deletes a recipient. Asks first only when they already answered —
       * their response stays, without a recipient (State.deleteRecipient).
       * @param {string} id recipient id
       * @returns {Promise<void>}
       */
      async deleteRecipient(id) {
        if (this.model.recipientStatus(id) === 'answered') {
          const name = this.recipientName(id) || _t('recipientUnnamed');
          const ok = await module._context.confirmPopout(_t('confirmRecipientDelete', { name }), { danger: true });
          if (!ok) return;
        }
        this.model.deleteRecipient(id);
      },

      /**
       * @param {string} id recipient id
       * @returns {string} translated status
       */
      recipientStatusLabel(id) { return _t(STATUS_LABELS[this.model.recipientStatus(id)]); },

      /**
       * @param {string} id recipient id
       * @returns {boolean} whether the sent file predates the current structure
       */
      isOutdated(id) { return this.model.isOutdated(id); },

      /**
       * @param {{sentVersion: number|null}} r recipient
       * @returns {string} outdated hint
       */
      outdatedHint(r) { return _t('outdatedHint', { version: r.sentVersion }); },

      /**
       * @param {{sentAt: string|null, sentVersion: number|null}} r recipient
       * @returns {string} "date · version n", '–' when never sent
       */
      sentLabel(r) {
        if (!r.sentAt) return '–';
        return _t('sentLabel', { date: this.formatDateTime(r.sentAt), version: r.sentVersion });
      },

      /** @returns {string} "1 verschickt · 0 beantwortet (0 %)" */
      countsLine() {
        const c = this.model.recipientCounts();
        return _t('report.rateLine', { sent: c.sent, answered: c.answered, rate: this.fmtPct(c.rate) });
      },

      /**
       * "HTML erzeugen": the recipient's own file. Exporting first settles the
       * version (a pending structural change bumps it now), then the recipient
       * is stamped with that version, so the outdated hint clears.
       * @param {string} id recipient id
       * @returns {Promise<void>}
       */
      async exportForRecipient(id) {
        const r = this.model.recipients.find((x) => x.id === id);
        if (!r) return;
        const survey = JSON.parse(JSON.stringify(this.model.survey));
        const strings = await runnerStrings(module._context.i18n, survey.lang);
        // The file carries the version the export settles on, but the model is
        // only marked once the file was built: a failure must change nothing.
        survey.version = this.model.nextExportVersion();
        const html = buildSurveyHtml(survey, strings, { recipientId: id });
        this.model.markExported();
        this.model.markSent(id, new Date().toISOString());
        downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), surveyFileName(survey, strings, r));
      },

      // ── Results ───────────────────────────────────────────────

      // Import

      /** Opens the file picker of the answer import. */
      openImport() {
        const input = module._container.querySelector('[data-ref="importInput"]');
        if (input) input.click();
      },

      /**
       * `@change` of the hidden file input; resets it so the same file can be picked again.
       * @param {Event} ev
       * @returns {Promise<void>}
       */
      async importFromEvent(ev) {
        const files = Array.from(ev.target.files || []);
        ev.target.value = '';
        await this.importFiles(files);
      },

      /** `@dragover.prevent` only has to exist so the drop is allowed. */
      onDragOver() {},

      /**
       * Imports the dropped files.
       * @param {DragEvent} ev
       */
      async onDrop(ev) {
        await this.importFiles(Array.from((ev.dataTransfer && ev.dataTransfer.files) || []));
      },

      /**
       * Reads answer files one by one (spec §6.1). Only `ok` and `older`
       * are taken in; every file gets a log line with its status.
       * @param {File[]} files
       */
      async importFiles(files) {
        for (const file of files) {
          let text = '';
          try { text = await file.text(); } catch { /* unreadable → invalid */ }
          const result = parseResponse(text, _plain(this.model.survey), this.model.responseIds());
          const entry = { key: uid(), name: file.name, status: result.status, notes: [] };
          if (result.status === 'ok' || result.status === 'older') {
            const { unknownRecipient } = this.model.addResponse(result.response);
            if (unknownRecipient) entry.notes.push(_t('importUnknownRecipient'));
            const orphans = (result.orphanIds || []).length;
            if (orphans > 0) entry.notes.push(_t('importOrphans', { count: orphans }));
          }
          this.importLog.push(entry);
        }
      },

      /**
       * @returns {boolean} whether any file was imported this session
       */
      hasImportLog() { return this.importLog.length > 0; },

      /**
       * @param {string} status parse status
       * @returns {string} translated status
       */
      importStatusLabel(status) { return _t(IMPORT_LABELS[status] || 'importInvalid'); },

      /**
       * @param {string} status parse status
       * @returns {object} class map of the log line
       */
      importStatusClass(status) {
        return {
          'survey-builder__import--ok': status === 'ok' || status === 'older',
          'survey-builder__import--rejected': status === 'foreign' || status === 'invalid',
        };
      },

      /**
       * @param {{notes: string[]}} entry
       * @returns {string} notes of a log line, joined
       */
      noteLine(entry) { return entry.notes.join(' · '); },

      // Responses

      /**
       * @returns {boolean}
       */
      hasResponses() { return this.model.responses.length > 0; },

      /** @returns {Array<{id: string, date: string, who: string}>} in import order */
      responseRows() {
        return this.model.responses.map((r) => ({
          id: r.id, date: this.formatDateTime(r.submittedAt), who: this._respondent(r),
        }));
      },

      /**
       * "anonym", the recipient's name, or "ohne Empfänger".
       * @param {object} r response
       * @returns {string}
       */
      _respondent(r) {
        if (this.model.survey.anonymous) return _t('respAnonymous');
        if (!r.recipientId) return _t('respWithoutRecipient');
        return this.recipientName(r.recipientId) || _t('recipientUnnamed');
      },

      /**
       * Unfolds or folds the answers of a response.
       * @param {string} id response id
       */
      toggleResponse(id) { this.openResponseId = this.openResponseId === id ? null : id; },

      /**
       * @param {string} id response id
       * @returns {boolean}
       */
      isResponseOpen(id) { return this.openResponseId === id; },

      /**
       * Answers of one response to the questions it saw, in document order.
       * @param {string} id response id
       * @returns {Array<{key: string, question: string, answer: string}>}
       */
      responseDetails(id) {
        const resp = this.model.responses.find((r) => r.id === id);
        if (!resp) return [];
        const strings = this._answerStrings();
        const out = [];
        for (const { question: q } of documentOrder(this.model.survey)) {
          if (q.type === 'info' || !isVisible(q, resp.answers, this.model.survey)) continue;
          out.push({ key: q.id, question: this.questionLabel(q), answer: formatAnswer(q, resp.answers[q.id], strings) || '–' });
        }
        return out;
      },

      /**
       * @returns {{other: string, noAnswer: string, cat: object}} strings for formatAnswer
       */
      _answerStrings() {
        return { other: _t('answerOther'), noAnswer: _t('answerNoAnswer'), cat: this._catLabels() };
      },

      /** @returns {Object<string, string>} Kano category labels of the kano module */
      _catLabels() {
        const out = {};
        for (const c of KANO_CATEGORIES) out[c] = module._context.i18n.t(`modules.kano.cat${c}`);
        return out;
      },

      /** @param {string|null} code @returns {string} */
      catLabel(code) { return code ? this._catLabels()[code] : '—'; },

      /**
       * Deletes a response after confirmation.
       * @param {string} id response id
       */
      async deleteResponse(id) {
        const ok = await module._context.confirmPopout(_t('confirmResponseDelete'), { danger: true });
        if (!ok) return;
        if (this.openResponseId === id) this.openResponseId = null;
        this.vocSelected = this.vocSelected.filter((k) => !k.startsWith(`${id}:`));
        this.model.deleteResponse(id);
      },

      // Filter

      /** @returns {Array<{value: string, label: string}>} one entry per single/multi option */
      filterOptions() {
        const out = [];
        for (const { question: q } of documentOrder(this.model.survey)) {
          if (q.type !== 'single' && q.type !== 'multi') continue;
          for (const o of q.options) {
            out.push({
              value: `${q.id}|${o.id}`,
              label: _t('filterOption', { question: this.questionLabel(q), option: this.optionText(o) }),
            });
          }
        }
        return out;
      },

      /** Filter of the model, or null when it points at a deleted question or option. */
      _activeFilter() {
        const f = this.model.ui.filter;
        if (!f) return null;
        const q = findQuestion(this.model.survey, f.questionId);
        return q && Array.isArray(q.options) && q.options.some((o) => o.id === f.optionId) ? f : null;
      },

      /**
       * @returns {string} select value of the active filter, '' = none
       */
      filterValue() {
        const f = this._activeFilter();
        return f ? `${f.questionId}|${f.optionId}` : '';
      },

      /**
       * @param {string} value
       * @returns {boolean} whether it is the active filter value
       */
      isFilterValue(value) { return this.filterValue() === value; },

      /**
       * `@change` of the filter select.
       * @param {Event} ev
       */
      setFilterFromEvent(ev) {
        const [questionId, optionId] = ev.target.value.split('|');
        this.model.ui.filter = optionId ? { questionId, optionId } : null;
      },

      /**
       * @returns {object[]} responses under the active filter
       */
      filtered() {
        return filterResponses(this.model.survey, this.model.responses, this._activeFilter());
      },

      /**
       * @returns {string} "n = …" for the filtered responses
       */
      nLine() { return _t('report.nResponses', { n: this.filtered().length }); },

      // Question blocks

      /** @returns {Array<{key: string, question: object, title: string, stats: object}>} info excluded */
      blocks() {
        const responses = this.filtered();
        const out = [];
        for (const { question } of documentOrder(this.model.survey)) {
          const stats = questionStats(this.model.survey, question, responses);
          if (stats) out.push({ key: question.id, question, title: this.questionLabel(question), stats });
        }
        return out;
      },

      /**
       * @param {object} b block
       * @param {string} type
       * @returns {boolean}
       */
      isType(b, type) { return b.stats.type === type; },

      /**
       * @param {object} b block
       * @returns {boolean} single or multi
       */
      isChoice(b) { return b.stats.type === 'single' || b.stats.type === 'multi'; },

      /**
       * @param {string} prefix
       * @param {string} id
       * @returns {string} value of a chart host's `data-chart`
       */
      chartKey(prefix, id) { return `${prefix}:${id}`; },

      /**
       * @param {object} b block
       * @returns {string} "n = …" of the block
       */
      blockN(b) { return _t('report.nResponses', { n: b.stats.n }); },

      /**
       * @param {object} b block
       * @returns {boolean} whether the Kano question asks for importance
       */
      hasImportance(b) { return Boolean(b.question.importance); },

      /**
       * @param {object} b block
       * @returns {boolean} whether the question offers "other"
       */
      hasOther(b) { return b.question.other === true; },

      /**
       * @param {object} b block
       * @returns {string} share of "other" answers
       */
      otherShare(b) { return this.fmtPct(b.stats.n ? b.stats.otherCount / b.stats.n : null); },

      /**
       * @param {object} b block
       * @returns {boolean}
       */
      hasOtherTexts(b) { return b.stats.otherTexts.length > 0; },

      /**
       * @param {{dist: number[]}} row
       * @returns {string} "0 · 1 · 2 · 0 · 0" (answers per scale point 1–5)
       */
      distLabel(row) { return row.dist.join(' · '); },

      // Free texts → VoC tree (spec §8.2)

      /**
       * @param {object} b block
       * @returns {Array<{key: string, text: string, name: string}>} non-empty answers of a text block
       */
      textAnswers(b) {
        return b.stats.answers
          .filter((a) => a.text.trim())
          .map((a) => ({ key: otherKey(a.responseId, b.question.id), text: a.text.trim(), name: this.recipientName(a.recipientId) || '' }));
      },

      /**
       * @param {object} b choice block
       * @returns {Array<{key: string, text: string, name: string}>} "Sonstige" texts, transferable like free texts
       */
      otherAnswers(b) {
        return b.stats.otherTexts
          .filter((o) => o.text.trim())
          .map((o) => ({ key: otherKey(o.responseId, b.question.id, true), text: o.text.trim(), name: this.recipientName(o.recipientId) || '' }));
      },

      /**
       * @param {object} b block
       * @returns {boolean}
       */
      hasTextAnswers(b) { return this.textAnswers(b).length > 0; },

      /**
       * @param {{name: string}} a answer
       * @returns {boolean} whether the respondent may be named
       */
      hasName(a) { return !this.model.survey.anonymous && Boolean(a.name); },

      /**
       * @param {string} key `<responseId>:<questionId>`
       * @returns {boolean}
       */
      isVocSelected(key) { return this.vocSelected.includes(key); },

      /**
       * @param {string} key `<responseId>:<questionId>`
       * @returns {boolean} whether already taken to the VoC tree
       */
      isVocTaken(key) { return this.model.transfers.vocTree.responseKeys.includes(key); },

      /**
       * @param {string} key `<responseId>:<questionId>`
       */
      toggleVoc(key) {
        this.vocSelected = this.isVocSelected(key)
          ? this.vocSelected.filter((k) => k !== key)
          : [...this.vocSelected, key];
      },

      /**
       * @returns {boolean} whether any answer is ticked
       */
      hasVocSelection() { return this.vocSelected.length > 0; },

      /** Every non-empty free-text and "Sonstige" answer of all responses (ignores the filter). */
      _openTexts() {
        const map = new Map();
        for (const resp of this.model.responses) {
          for (const { question: q } of documentOrder(this.model.survey)) {
            if (!isVisible(q, resp.answers, this.model.survey)) continue;
            const a = resp.answers[q.id];
            const name = this.recipientName(resp.recipientId) || '';
            if (q.type === 'text') {
              const text = typeof a === 'string' ? a.trim() : '';
              if (text) map.set(otherKey(resp.id, q.id), { text, name });
            } else if ((q.type === 'single' || q.type === 'multi') && a && typeof a === 'object') {
              const text = typeof a.other === 'string' ? a.other.trim() : '';
              if (text) map.set(otherKey(resp.id, q.id, true), { text, name });
            }
          }
        }
        return map;
      },

      /**
       * Adds the ticked answers as VoCs to the project's VoC tree, creating
       * one in the cycle's tree phase when there is none. Answers already
       * taken over stay selectable (spec 8.2), so re-selecting one adds it again.
       */
      takeToVocTree() {
        const ctx = module._context;
        const sm = ctx.stateManager;
        const texts = this._openTexts();
        const keys = this.vocSelected.filter((k) => texts.has(k));
        if (keys.length === 0) return;
        const title = this.model.survey.title.trim() || _t('report.untitled');
        const vocs = vocsFromAnswers(keys.map((k) => texts.get(k)), _t('vocSource', { title }), this.model.survey.anonymous);
        const tree = listInstances(sm, 'voc-ctx-tree')[0];
        if (tree) {
          sm.setModuleState(tree.instanceId, appendVocs(tree.state ? _plain(tree.state) : null, vocs));
          ctx.eventBus.emit('state:remote-changed', { instanceIds: [tree.instanceId], metaChanged: false });
        } else {
          const phase = treePhaseForCycle(sm.get('projectMeta.cycle') || DEFAULT_CYCLE);
          if (!provisionInstance(ctx, { moduleId: 'voc-ctx-tree', phase, state: appendVocs(null, vocs) })) return;
        }
        this.model.markVocTaken(keys);
        this.vocSelected = [];
        ctx.notify(_t('vocTaken', { count: keys.length }), 'success');
      },

      // Kano hand-over (spec §8.1)

      /** @returns {Array<{value: string, label: string}>} kano instances of the project */
      kanoTargetOptions() {
        void this.kanoRev; // reactive dependency, see kanoRev
        return listInstances(module._context.stateManager, 'kano')
          .map((inst, i) => ({ value: inst.instanceId, label: _t('kanoExisting', { n: i + 1 }) }));
      },

      /**
       * Linked kano instance of a question, '' (= new) when none or deleted since.
       * @param {string} questionId
       * @returns {string} instance id or ''
       */
      kanoTargetValue(questionId) {
        const id = this.model.transfers.kano[questionId];
        return id && this.kanoTargetOptions().some((o) => o.value === id) ? id : '';
      },

      /**
       * @param {string} questionId
       * @param {string} value
       * @returns {boolean}
       */
      isKanoTarget(questionId, value) { return this.kanoTargetValue(questionId) === value; },

      /**
       * `@change` of the Kano target select.
       * @param {string} questionId
       * @param {Event} ev
       */
      setKanoTargetFromEvent(questionId, ev) {
        this.model.setKanoTarget(questionId, ev.target.value || null);
      },

      /**
       * Hands a Kano question (all responses, ignoring the filter) to the
       * chosen kano instance, or to a new one next to this module. A repeat
       * hand-over replaces only what came from this question.
       * @param {string} questionId
       * @returns {void}
       */
      handOverToKano(questionId) {
        const ctx = module._context;
        const sm = ctx.stateManager;
        const question = findQuestion(this.model.survey, questionId);
        if (!question) return;
        const targetId = this.kanoTargetValue(questionId);
        const target = targetId ? sm.getModuleState(targetId) : null;
        const state = kanoStateFromSurvey(target ? _plain(target) : null, {
          surveyInstanceId: ctx.instanceId,
          question: _plain(question),
          responses: _plain(this.model.responses),
          recipients: _plain(this.model.recipients),
          anonymous: this.model.survey.anonymous,
          respondentLabel: (n) => _t('respondentLabel', { n }),
        });
        let instanceId = targetId;
        if (targetId) {
          sm.setModuleState(targetId, state);
          ctx.eventBus.emit('state:remote-changed', { instanceIds: [targetId], metaChanged: false });
        } else {
          instanceId = provisionInstance(ctx, { moduleId: 'kano', phase: this._ownPhase(), state });
          if (!instanceId) return;
        }
        this.kanoRev++;
        this.model.setKanoTarget(questionId, instanceId);
        ctx.notify(_t('kanoHandedOver'), 'success');
      },

      // Worksheet (spec §6.2)

      /** All responses as a new worksheet in this module's phase. */
      toWorksheet() {
        const ctx = module._context;
        const sm = ctx.stateManager;
        const strings = {};
        for (const k of WS_KEYS) strings[k] = _t(`ws.${k}`);
        const columns = worksheetColumns(
          _plain(this.model.survey), _plain(this.model.responses), _plain(this.model.recipients), strings,
        );
        const name = uniqueSheetName(sm, this.model.survey.title.trim() || _t('report.untitled'));
        const id = provisionInstance(ctx, {
          moduleId: 'worksheet', phase: this._ownPhase(), state: buildWorksheetState(columns, name),
        });
        if (id) ctx.notify(_t('worksheetCreated', { name }), 'success');
      },

      // Summary (spec §7.1)

      /**
       * Response rate over all recipients and responses; the filter does not apply.
       * @returns {object} result of responseRate()
       */
      _rate() {
        return responseRate({
          recipients: this.model.recipients,
          responses: this.model.responses,
          answeredRecipientIds: this.model.answeredRecipientIds,
        });
      },

      /** @returns {string} "3 verschickt · 2 beantwortet (67 %)" */
      rateLine() {
        const r = this._rate();
        return _t('report.rateLine', { sent: r.sent, answered: r.answered, rate: this.fmtPct(r.rate) });
      },

      /** @returns {boolean} true when responses exist that no recipient owns */
      hasWithoutRecipient() { return this._rate().withoutRecipient > 0; },

      /** @returns {string} "2 Antworten ohne Empfänger" */
      withoutRecipientLine() { return _t('report.withoutRecipient', { count: this._rate().withoutRecipient }); },

      /** The group table only pays off with more than one group. @returns {boolean} */
      hasRateGroups() { return this._rate().groups.length > 1; },

      /** @returns {Array<{key: string, group: string, sent: number, answered: number, rate: string}>} */
      rateGroups() {
        return this._rate().groups.map((g) => ({
          key: g.group || '__none',
          group: g.group || _t('report.groupNone'),
          sent: g.sent,
          answered: g.answered,
          rate: this.fmtPct(g.rate),
        }));
      },

      /** @returns {Array<object>} rating rows over the filtered responses, best first */
      _ranking() { return ratingRanking(this.model.survey, this.filtered()); },

      /** @returns {boolean} true when there is at least one ranked rating row */
      hasRanking() { return this._ranking().length > 0; },

      /** @returns {Array<{key: string, text: string, n: number, mean: string, top: string}>} */
      rankingRows() {
        const all = this._ranking();
        const shown = this.showAllRanking ? all : all.slice(0, RANKING_TOP);
        return shown.map((r) => ({
          key: `${r.questionId}:${r.rowId}`, text: r.text, n: r.n,
          mean: this.fmtNum(r.mean, 2), top: this.fmtPct(r.topShare),
        }));
      },

      /** @returns {boolean} true when the ranking has more rows than RANKING_TOP */
      hasMoreRanking() { return this._ranking().length > RANKING_TOP; },

      /** Expands or collapses the ranking. */
      toggleRanking() { this.showAllRanking = !this.showAllRanking; },

      /** @returns {string} label of the expand/collapse button */
      rankingToggleLabel() {
        return this.showAllRanking
          ? _t('rankingTop', { count: RANKING_TOP })
          : _t('rankingAll', { count: this._ranking().length });
      },

      /** @returns {Array<object>} Kano rows over the filtered responses */
      _kanoOverview() { return kanoOverview(this.model.survey, this.filtered()); },

      /** @returns {boolean} true when any Kano row exists */
      hasKanoOverview() { return this._kanoOverview().length > 0; },

      /** @returns {Array<{key: string, text: string, category: string, cs: string, ds: string}>} */
      kanoOverviewRows() {
        return this._kanoOverview().map((k) => ({
          key: `${k.questionId}:${k.rowId}`, text: k.text, category: this.catLabel(k.category),
          cs: this.fmtNum(k.cs, 2), ds: this.fmtNum(k.ds, 2),
        }));
      },

      /**
       * "5 offene Antworten, 2 in den VoC-Baum übernommen" over the filtered responses.
       * @returns {string}
       */
      freeTextLine() {
        const keys = this.model.transfers.vocTree.responseKeys;
        return _t('report.freeText', freeTextSummary(this.model.survey, this.filtered(), keys));
      },

      // Group comparison (spec §7.2)

      /** @returns {Array<{value: string, label: string}>} the `single` questions */
      groupByOptions() {
        return documentOrder(this.model.survey)
          .filter(({ question: q }) => q.type === 'single')
          .map(({ question: q }) => ({ value: q.id, label: this.questionLabel(q) }));
      },

      /**
       * Grouping question of the model, null when it is gone or no longer `single`.
       * @returns {string|null}
       */
      _activeGroupBy() {
        const id = this.model.ui.groupBy;
        if (!id) return null;
        const q = findQuestion(this.model.survey, id);
        return q && q.type === 'single' ? id : null;
      },

      /**
       * @param {string} value question id, '' for "none"
       * @returns {boolean} true when it is the selected grouping
       */
      isGroupBy(value) { return (this._activeGroupBy() || '') === value; },

      /**
       * @param {Event} ev change event of the grouping select
       */
      setGroupByFromEvent(ev) { this.model.ui.groupBy = ev.target.value || null; },

      /**
       * Filter first, then group (spec §7.2).
       * @returns {object|null} result of groupComparison(), null without grouping
       */
      _comparison() {
        const id = this._activeGroupBy();
        return id ? groupComparison(this.model.survey, this.filtered(), id) : null;
      },

      /** @returns {boolean} true when a comparison is shown */
      hasComparison() { return this._comparison() !== null; },

      /** @returns {string} heading of the comparison, '' without grouping */
      groupsTitle() {
        const id = this._activeGroupBy();
        if (!id) return '';
        return _t('report.groupsTitle', { question: this.questionLabel(findQuestion(this.model.survey, id)) });
      },

      /** @returns {Array<{id: string, label: string}>} "Handel (n = 3, wenig Antworten)" */
      groupHeads() {
        const cmp = this._comparison();
        if (!cmp) return [];
        return cmp.groups.map((g) => ({
          id: g.id,
          label: _t(g.few ? 'groupHeadFew' : 'groupHead', { group: g.text, n: g.n }),
        }));
      },

      /**
       * The comparison of every question in one shape for the template:
       * rows with a label, a note and one cell per group.
       * @returns {Array<{key: string, questionId: string, title: string, chart: boolean,
       *   rows: Array<{key: string, label: string, note: string, differs: boolean,
       *     cells: Array<{key: string, text: string, deviates: boolean}>}>}>}
       */
      comparisonParts() {
        const cmp = this._comparison();
        if (!cmp) return [];
        const groupId = (i) => cmp.groups[i].id;
        return cmp.questions.map((part) => {
          let rows;
          if (part.type === 'rating') {
            rows = part.rows.map((row) => ({
              key: row.id, label: row.text, differs: false,
              note: _t('overallMean', { mean: this.fmtNum(row.overall, 2) }),
              cells: row.cells.map((c, i) => ({ key: groupId(i), text: this.fmtNum(c.mean, 2), deviates: c.deviates })),
            }));
          } else if (part.type === 'kano') {
            rows = part.rows.map((row) => ({
              key: row.id, label: row.text, differs: row.differs,
              note: row.differs ? _t('report.differs') : '',
              cells: row.categories.map((c, i) => ({ key: groupId(i), text: this.catLabel(c), deviates: false })),
            }));
          } else {
            rows = part.options.map((o) => ({
              key: o.id, label: o.text, differs: false, note: '',
              cells: o.shares.map((s, i) => ({ key: groupId(i), text: this.fmtPct(s), deviates: false })),
            }));
          }
          return {
            key: part.questionId,
            questionId: part.questionId,
            title: this.questionLabel(findQuestion(this.model.survey, part.questionId)),
            chart: part.type === 'single' || part.type === 'multi',
            rows,
          };
        });
      },

      /**
       * @param {{deviates: boolean}} c comparison cell
       * @returns {object} class map for :class
       */
      cellClass(c) { return { 'survey-builder__cell--deviates': c.deviates }; },

      /**
       * @param {{differs: boolean}} row comparison row
       * @returns {object} class map for :class
       */
      rowClass(row) { return { 'survey-builder__row--differs': row.differs }; },

      // Report (spec §7.3)

      /** Names in the report only exist when the survey is not anonymous. @returns {boolean} */
      canShowNames() { return !this.model.survey.anonymous; },

      /** @returns {boolean} state of the "Freitexte mit Namen" switch */
      isReportWithNames() { return this.model.ui.reportWithNames; },

      /**
       * @param {Event} ev change event of the checkbox
       */
      setReportWithNamesFromEvent(ev) { this.model.ui.reportWithNames = ev.target.checked; },

      /**
       * "Bericht exportieren": self-contained HTML with filter and grouping as shown.
       * @returns {Promise<void>}
       */
      async exportReport() {
        const data = {
          survey: _plain(this.model.survey),
          recipients: _plain(this.model.recipients),
          responses: _plain(this.model.responses),
          answeredRecipientIds: _plain(this.model.answeredRecipientIds),
        };
        const filter = this._activeFilter();
        const strings = await reportStrings(module._context.i18n);
        const html = buildReportHtml(data, strings, {
          locale: this._locale(),
          withNames: !data.survey.anonymous && this.model.ui.reportWithNames,
          filter: filter ? _plain(filter) : null,
          groupBy: this._activeGroupBy(),
          vocKeys: _plain(this.model.transfers.vocTree.responseKeys),
          generatedAt: new Date().toISOString(),
        });
        const title = data.survey.title.trim() || _t('report.untitled');
        downloadBlob(
          new Blob([html], { type: 'text/html;charset=utf-8' }),
          `${sanitizeFileNamePart(_t('fileReport'))}_${sanitizeFileNamePart(title)}.html`,
        );
      },

      // Charts

      /**
       * Everything the charts depend on — a change re-mounts them.
       * @returns {string}
       */
      _resultsSignature() {
        return JSON.stringify([this.model.survey, this.model.responseIds(), this.model.ui.filter, this.model.ui.groupBy]);
      },

      /** Mounts the charts after the next render when the results tab is active. */
      scheduleCharts() {
        if (!this.isTab('results')) return;
        this.$nextTick(() => this.mountCharts());
      },

      /** Per-question charts: choice shares, rating means, Kano better/worse. */
      questionChartJobs() {
        const jobs = [];
        for (const b of this.blocks()) {
          const key = this.chartKey('q', b.question.id);
          const s = b.stats;
          if (this.isChoice(b) && s.n > 0) {
            jobs.push({ key, type: 'bar', config: {
              categories: s.options.map((o) => o.text),
              groups: [{ name: _t('chartShare'), values: s.options.map((o) => Math.round((o.share || 0) * 1000) / 10), color: 'var(--color-chart-1)' }],
              yLabel: '%', yMin: 0, showLegend: false,
            } });
          }
          if (s.type === 'rating') {
            const rows = s.rows.filter((r) => r.mean !== null).sort((a, c) => c.mean - a.mean);
            if (rows.length > 0) {
              jobs.push({ key, type: 'bar', config: {
                categories: rows.map((r) => r.text),
                groups: [{ name: _t('chartMean'), values: rows.map((r) => r.mean), color: 'var(--color-chart-1)' }],
                yLabel: _t('report.colMean'), yMin: 0, showLegend: false,
              } });
            }
          }
          if (s.type === 'kano') {
            const config = this._kanoScatter(s.rows.map((r) => ({ label: r.text, cs: r.cs, ds: r.ds })));
            if (config) jobs.push({ key, type: 'scatter', config });
          }
        }
        return jobs;
      },

      /**
       * Summary scatter, group bars, then the per-question charts.
       * @returns {Array<{key: string, type: string, config: object}>}
       */
      chartJobs() {
        return [...this.summaryChartJobs(), ...this.groupChartJobs(), ...this.questionChartJobs()];
      },

      /**
       * One Better/Worse scatter over all Kano rows of all Kano questions (spec §7.1).
       * @returns {Array<{key: string, type: string, config: object}>}
       */
      summaryChartJobs() {
        const config = this._kanoScatter(this._kanoOverview().map((k) => ({ label: k.text, cs: k.cs, ds: k.ds })));
        return config ? [{ key: 'kano-overview', type: 'scatter', config }] : [];
      },

      /**
       * Grouped bars, share in % per group, for every choice question of the comparison.
       * @returns {Array<{key: string, type: string, config: object}>}
       */
      groupChartJobs() {
        const cmp = this._comparison();
        if (!cmp) return [];
        return cmp.questions
          .filter((part) => part.type === 'single' || part.type === 'multi')
          .map((part) => ({
            key: this.chartKey('g', part.questionId),
            type: 'bar',
            config: {
              categories: part.options.map((o) => o.text),
              groups: cmp.groups.map((g, i) => ({
                name: g.text,
                values: part.options.map((o) => Math.round((o.shares[i] || 0) * 1000) / 10),
                color: `var(--color-chart-${(i % 10) + 1})`,
              })),
              yLabel: '%', yMin: 0, showLegend: true,
            },
          }));
      },

      /**
       * Better/worse scatter, same look as the kano module (kano.js mountChart):
       * one series per item so the tooltip names it, no legend.
       * @param {Array<{label: string, cs: number|null, ds: number|null}>} rows
       * @returns {object|null} chart config, null without a plottable row
       */
      _kanoScatter(rows) {
        const points = rows.filter((r) => r.cs !== null && r.ds !== null);
        if (points.length === 0) return null;
        const i18n = module._context.i18n;
        return {
          xLabel: i18n.t('modules.kano.chartX'),
          yLabel: i18n.t('modules.kano.chartY'),
          showLegend: false,
          series: points.map((r) => ({
            name: r.label, color: 'var(--color-chart-1)', symbol: 'circle', markerSize: 8, strokeWidth: 1,
            x: [Math.abs(r.ds)], y: [r.cs],
          })),
          refLines: [
            { dir: 'h', value: 0.5, dash: 'dash', width: 1, color: 'var(--color-text-tertiary)' },
            { dir: 'v', value: 0.5, dash: 'dash', width: 1, color: 'var(--color-text-tertiary)' },
          ],
        };
      },

      /**
       * Waits across animation frames (bounded) until an anchor exists, as the
       * hosts sit inside x-for/x-if templates that Alpine materialises late.
       * @param {string} selector
       * @param {number} gen render generation of the caller
       * @param {number} [maxFrames=30]
       * @returns {Promise<Element|null>} null when outdated or never rendered
       */
      _whenAnchor(selector, gen, maxFrames = 30) {
        return new Promise((resolve) => {
          const tick = (left) => {
            if (gen !== this._renderGen) { resolve(null); return; }
            const el = module._container && module._container.querySelector(selector);
            if (el) { resolve(el); return; }
            if (left <= 0) { resolve(null); return; }
            requestAnimationFrame(() => tick(left - 1));
          };
          tick(maxFrames);
        });
      },

      /** Mounts every chart job into its `[data-chart]` host (gen guard as in kano.js). */
      async mountCharts() {
        if (this._destroyed || !this.isTab('results')) return;
        this._renderGen++;
        const gen = this._renderGen;
        this.destroyCharts();
        for (const job of this.chartJobs()) {
          const host = await this._whenAnchor(`[data-chart="${job.key}"]`, gen);
          if (this._destroyed || gen !== this._renderGen) return;
          if (!host) continue;
          const chart = await module._context.chartManager.create(host, job.type, job.config);
          if (this._destroyed || gen !== this._renderGen) {
            try { module._context.chartManager.destroy(chart); } catch { /* ignore */ }
            return;
          }
          this._charts.push(chart);
        }
      },
    };
  },
});
