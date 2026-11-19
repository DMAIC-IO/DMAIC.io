/**
 * D.Mike — Survey builder: view part "responses" (viewmodel/responses.js)
 *
 * The upper part of the results tab: reading answer files and the list of
 * responses. „Antworten einlesen“ in the action bar shows the results tab
 * and opens the file picker (`x-file-drop` on a hidden element, several
 * files at once); each file runs the model command `importResponse`.
 * Feedback goes out as toasts only, the files taken in show up in the list:
 * after every import of this instance — from the interface or from an agent
 * — a file read before, a foreign or no answer file gets a toast, and so
 * does a file taken in with a caveat (older version, unknown recipient,
 * answers to questions that are gone). A pick from the interface ends with
 * one toast that counts the files taken in. A file whose command did not
 * run counts as no answer file.
 *
 * One response at a time folds open (`state.expandedResponses`); deleting
 * one asks first (the command's `confirm`). After every `removeResponse` of
 * this instance — from the interface or from an agent — the part closes the
 * row of the deleted response.
 */
import { runUiCommand } from '../../../core/command-directives.js';
import { documentOrder, isVisible } from '../domain/conditions.js';
import { legacyAnswers } from '../domain/answers.js';
import { formatAnswer } from '../domain/stats.js';
import { formatDateTime, localeOf, questionLabel, recipientName, KANO_CATEGORIES } from '../domain/labels.js';

/**
 * @typedef {import('../domain/model.types.js').SurveyModelFields['responses'][number]} Response
 * @typedef {'ok'|'older'|'duplicate'|'foreign'|'invalid'} ImportStatus
 */

/** Text key per import status that needs a toast. @type {Record<string, string>} */
const IMPORT_LABELS = {
  older: 'importOlder', duplicate: 'importDuplicate', foreign: 'importForeign', invalid: 'importInvalid',
};

/** @type {import('./state.types.js').SurveyBuilderViewFn} */
export const responsesView = (ctx) => {
  /** @type {((e: { instanceId?: string, command?: string, args?: any }) => void)|null} */
  let onCommand = null;
  return {
    init() {
      onCommand = (e) => this.afterResponsesCommand(e);
      ctx.eventBus?.on?.('command:executed', onCommand);
    },
    destroy() {
      if (onCommand) ctx.eventBus?.off?.('command:executed', onCommand);
      onCommand = null;
    },

    /**
     * After `importResponse` of this instance: the toast of the file, if it
     * needs one. After `removeResponse`: close the row of the deleted response.
     * @param {{ instanceId?: string, command?: string, args?: any, result?: any }} e
     */
    afterResponsesCommand(e) {
      if (e?.instanceId !== ctx.instanceId) return;
      if (e.command === 'importResponse') {
        const res = e.result ?? {};
        this.notifyImport(String(e.args?.fileName ?? ''), {
          status: res.status ?? 'invalid', unknownRecipient: Boolean(res.unknownRecipient), orphans: (res.orphanIds ?? []).length,
        });
        return;
      }
      if (e.command !== 'removeResponse') return;
      const id = e.args?.responseId;
      if (this.state.expandedResponses.includes(id)) this.state.expandedResponses = this.state.expandedResponses.filter((x) => x !== id);
    },

    // ── Import ────────────────────────────────────────────────

    /**
     * Action bar „Antworten einlesen“: shows the results tab, where the
     * answers read in appear, and opens the file picker.
     */
    importAnswers() {
      // Through the tab bar (`x-set="model.tab"`), as a click on the tab.
      /** @type {HTMLElement|null} */ (this.$root.querySelector('[data-ref="tabs"] [data-tab="results"]'))?.click();
      /** @type {HTMLInputElement|null|undefined} */ (this.$refs.importDrop?.querySelector('input[type="file"]'))?.click();
    },

    /**
     * The files from the picker (`x-file-drop`), one after the other; one
     * toast at the end counts the files taken in.
     * @param {Array<{ name: string, text: () => Promise<string> }>} files
     * @returns {Promise<void>}
     */
    async importFiles(files) {
      if (files.length === 0) return;
      let taken = 0;
      for (const file of files) {
        let json = '';
        try { json = await file.text(); } catch { /* unreadable: no answer file */ }
        const status = await this.importOne(json, file.name);
        if (status === 'ok' || status === 'older') taken += 1;
      }
      if (taken > 0) ctx.notify(this.t('importDone', { count: taken }), 'success');
    },

    /**
     * One file: the command. Its toast comes from `afterResponsesCommand`; a
     * file whose command did not run gets the toast of no answer file here.
     * @param {string} json @param {string} fileName
     * @returns {Promise<ImportStatus>}
     */
    async importOne(json, fileName) {
      const r = await runUiCommand(this._ui, 'importResponse', { json, fileName });
      if (r.ok) return r.result?.status ?? 'invalid';
      if ('error' in r) {
        console.warn('[survey-builder] importResponse failed', r.error);
        ctx.notify(this.t('commandFailed'), 'error');
      }
      this.notifyImport(fileName, { status: 'invalid', unknownRecipient: false, orphans: 0 });
      return 'invalid';
    },

    /**
     * The toast of one answer file: a rejected file as warning (read before)
     * or error, a file taken in with a caveat as info, a plain one none.
     * @param {string} fileName
     * @param {{ status: ImportStatus, unknownRecipient: boolean, orphans: number }} entry
     */
    notifyImport(fileName, { status, unknownRecipient, orphans }) {
      if (status === 'ok' || status === 'older') {
        const notes = [];
        if (status === 'older') notes.push(this.t(IMPORT_LABELS.older));
        if (unknownRecipient) notes.push(this.t('importUnknownRecipient'));
        if (orphans > 0) notes.push(this.t('importOrphans', { count: orphans }));
        if (notes.length > 0) ctx.notify(this.t('importFileNote', { file: fileName, reason: notes.join(' · ') }), 'info');
        return;
      }
      const reason = this.t(IMPORT_LABELS[status] || IMPORT_LABELS.invalid);
      ctx.notify(this.t('importFileNote', { file: fileName, reason }), status === 'duplicate' ? 'warning' : 'error');
    },

    // ── List ──────────────────────────────────────────────────

    /** @returns {boolean} */
    get hasResponses() { return this.model.responses.length > 0; },

    /** @returns {Array<{ id: string, date: string, who: string }>} in import order */
    get responseRows() {
      const locale = localeOf(ctx.i18n);
      return this.model.responses.map((r) => ({ id: r.id, date: formatDateTime(r.submittedAt, locale), who: this.respondent(r) }));
    },

    /** „anonym“, the recipient's name or „ohne Empfänger“. @param {Response} r @returns {string} */
    respondent(r) {
      if (this.model.survey.anonymous) return this.t('respAnonymous');
      if (!r.recipientId) return this.t('respWithoutRecipient');
      return recipientName(this.model.recipients, r.recipientId) || this.t('recipientUnnamed');
    },

    /** Fold the answers of a response open or shut; one at a time. @param {string} id */
    toggleResponse(id) { this.state.expandedResponses = this.isResponseOpen(id) ? [] : [id]; },

    /** @param {string} id @returns {boolean} */
    isResponseOpen(id) { return this.state.expandedResponses.includes(id); },

    /**
     * The answers of one response to the questions it saw, in document order.
     * @param {string} id response id
     * @returns {Array<{ key: string, question: string, answer: string }>}
     */
    responseDetails(id) {
      const resp = this.model.responses.find((r) => r.id === id);
      if (!resp) return [];
      const survey = this.model.survey;
      const answers = legacyAnswers(survey, resp.answers);
      /** @type {Record<string, string>} */
      const cat = {};
      for (const c of KANO_CATEGORIES) cat[c] = this.t(`kano.cat${c}`);
      const strings = { other: this.t('answerOther'), noAnswer: this.t('answerNoAnswer'), cat };
      const out = [];
      for (const { question: q } of documentOrder(survey)) {
        if (q.type === 'info' || !isVisible(q, answers, survey)) continue;
        out.push({ key: q.id, question: questionLabel(survey, q, this.t), answer: formatAnswer(q, answers[q.id], strings) || '–' });
      }
      return out;
    },
  };
};
