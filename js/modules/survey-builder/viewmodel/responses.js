/**
 * D.Mike — Survey builder: view part "responses" (viewmodel/responses.js)
 *
 * The upper part of the results tab: reading answer files and the list of
 * responses. Files come through `x-file-drop` (picker or drop, several at
 * once); each runs the model command `importResponse`, and every file gets
 * a line in the import log of this session (UI state) — read in, older
 * version, read before, foreign or no answer file, with the notes on an
 * unknown recipient and on answers to questions that are gone. A file that
 * cannot be read counts as no answer file.
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
import { uid } from '../../../core/uid.js';

/**
 * @typedef {import('../domain/model.types.js').SurveyModelFields['responses'][number]} Response
 * @typedef {import('./state.types.js').UiState['importLog'][number]} LogEntry
 */

/** Text key per import status. */
const IMPORT_LABELS = {
  ok: 'importOk', older: 'importOlder', duplicate: 'importDuplicate', foreign: 'importForeign', invalid: 'importInvalid',
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
     * After `removeResponse` of this instance: close the row of the deleted response.
     * @param {{ instanceId?: string, command?: string, args?: any }} e
     */
    afterResponsesCommand(e) {
      if (e?.instanceId !== ctx.instanceId || e.command !== 'removeResponse') return;
      const id = e.args?.responseId;
      if (this.state.expandedResponses.includes(id)) this.state.expandedResponses = this.state.expandedResponses.filter((x) => x !== id);
    },

    // ── Import ────────────────────────────────────────────────

    /**
     * The files from the picker or a drop (`x-file-drop`), one after the other.
     * @param {Array<{ name: string, text: () => Promise<string> }>} files
     * @returns {Promise<void>}
     */
    async importFiles(files) {
      for (const file of files) {
        let json = '';
        try { json = await file.text(); } catch { /* unreadable: no answer file */ }
        await this.importOne(json, file.name);
      }
    },

    /**
     * One file: the command, then its line in the import log.
     * @param {string} json @param {string} fileName
     * @returns {Promise<void>}
     */
    async importOne(json, fileName) {
      const r = await runUiCommand(this._ui, 'importResponse', { json, fileName });
      /** @type {LogEntry} */
      const entry = { key: uid(), name: fileName, status: 'invalid', unknownRecipient: false, orphans: 0 };
      if (r.ok) {
        const res = /** @type {{ status: LogEntry['status'], orphanIds: string[], unknownRecipient: boolean }} */ (r.result);
        entry.status = res.status;
        entry.unknownRecipient = res.unknownRecipient;
        entry.orphans = res.orphanIds.length;
      } else if ('error' in r) {
        ctx.notify(this.t('commandFailed'), 'error');
      }
      this.state.importLog = [...this.state.importLog, entry];
    },

    /** @returns {boolean} a file was read in this session */
    get hasImportLog() { return this.state.importLog.length > 0; },

    /** @param {LogEntry} entry @returns {string} the translated status */
    importStatusLabel(entry) { return this.t(IMPORT_LABELS[entry.status] || 'importInvalid'); },

    /** @param {LogEntry} entry @returns {Record<string, boolean>} class map of the log line */
    importStatusClass(entry) {
      return {
        'survey-builder__import--ok': entry.status === 'ok' || entry.status === 'older',
        'survey-builder__import--rejected': entry.status === 'foreign' || entry.status === 'invalid',
      };
    },

    /** @param {LogEntry} entry @returns {string} the notes of a log line, joined */
    noteLine(entry) {
      const notes = [];
      if (entry.unknownRecipient) notes.push(this.t('importUnknownRecipient'));
      if (entry.orphans > 0) notes.push(this.t('importOrphans', { count: entry.orphans }));
      return notes.join(' · ');
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
