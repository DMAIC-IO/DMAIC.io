/**
 * D.Mike — Survey builder responses (viewmodel/responses.js)
 *
 * Sub-viewmodel of the results tab's upper part: importing answer files and
 * the list of responses. Knows the model, survey-labels.js and the pure
 * survey-*.js modules — never a sibling or the shell (spec E2). Deleting a
 * response leaves the VoC selection alone; the hand-over cleans it itself.
 *
 * Spec: docs/superpowers/specs/2026-10-24-survey-builder-teil-viewmodels-design.md
 */

import { documentOrder, isVisible } from '../survey-conditions.js';
import { parseResponse } from '../survey-import.js';
import { formatAnswer } from '../survey-stats.js';
import { plainCopy } from '../survey-builder-model.js';
import { catLabels, formatDateTime, localeOf, questionLabel, recipientName } from '../survey-labels.js';
import { uid } from '../../../core/uid.js';
import { requireKnownId, requireText } from '../../../core/agent/agent-argcheck.js';

const IMPORT_LABELS = {
  ok: 'importOk', older: 'importOlder', duplicate: 'importDuplicate', foreign: 'importForeign', invalid: 'importInvalid',
};

export class ResponsesViewModel {
  /**
   * @param {{t: function(string, object=): string, context: object, container: function(): ?Element}} deps
   */
  constructor({ t, context, container }) {
    this._t = t;
    this._context = context;
    this._container = container;
    /** @type {?object} the component's State, set by attach() */
    this.model = null;
    /**
     * Result of every imported file in this session (not persisted).
     * @type {Array<{key: string, name: string, status: string, notes: string[]}>}
     */
    this.importLog = [];
    /** Response whose answers are unfolded in the list. */
    this.openResponseId = null;
  }

  /**
   * Binds the component's model (spec E2).
   * @noagent lifecycle
   * @param {{model: object, watch: function, nextTick: function}} binding
   */
  attach({ model }) { this.model = model; }

  /**
   * Nothing to release.
   * @noagent lifecycle
   */
  detach() {}

  /**
   * Opens the file picker of the answer import.
   * @noagent file picker
   */
  openImport() {
    const root = this._container();
    const input = root && root.querySelector('[data-ref="importInput"]');
    if (input) input.click();
  }

  /**
   * `@change` of the hidden file input; resets it so the same file can be picked again.
   * @noagent template handler, see importResponse
   * @param {Event} ev
   * @returns {Promise<void>}
   */
  async importFromEvent(ev) {
    const files = Array.from(ev.target.files || []);
    ev.target.value = '';
    await this.importFiles(files);
  }

  /**
   * `@dragover.prevent` only has to exist so the drop is allowed.
   * @noagent template handler, see importResponse
   */
  onDragOver() {}

  /**
   * Imports the dropped files.
   * @noagent template handler, see importResponse
   * @param {DragEvent} ev
   */
  async onDrop(ev) {
    await this.importFiles(Array.from((ev.dataTransfer && ev.dataTransfer.files) || []));
  }

  /**
   * @noagent template handler, see importResponse
   * @param {File[]} files
   * @returns {Promise<void>}
   */
  async importFiles(files) {
    for (const file of files) {
      let text = '';
      try { text = await file.text(); } catch { /* unreadable → invalid */ }
      this.importResponse(text, file.name);
    }
  }

  /**
   * Read one answer file as the questionnaire saved it. Files of this
   * questionnaire are taken in, also those of an older version; a file read
   * before, one of another questionnaire, or a broken one is only logged.
   * @agent
   * @param {string} json the content of the answer file
   * @param {string} fileName the name shown in the import log
   * @returns {'ok'|'older'|'duplicate'|'foreign'|'invalid'} how the file was handled
   * @throws {Error} if `json` or `fileName` is no string
   */
  importResponse(json, fileName) {
    requireText('json', json);
    requireText('fileName', fileName);
    const result = parseResponse(json, plainCopy(this.model.survey), this.model.responseIds());
    const entry = { key: uid(), name: fileName, status: result.status, notes: [] };
    if (result.status === 'ok' || result.status === 'older') {
      const { unknownRecipient } = this.model.addResponse(result.response);
      if (unknownRecipient) entry.notes.push(this._t('importUnknownRecipient'));
      const orphans = (result.orphanIds || []).length;
      if (orphans > 0) entry.notes.push(this._t('importOrphans', { count: orphans }));
    }
    this.importLog.push(entry);
    return result.status;
  }

  /**
   * @noagent view transform
   * @returns {boolean} whether any file was imported this session
   */
  hasImportLog() { return this.importLog.length > 0; }

  /**
   * @noagent view transform
   * @param {string} status parse status
   * @returns {string} translated status
   */
  importStatusLabel(status) { return this._t(IMPORT_LABELS[status] || 'importInvalid'); }

  /**
   * @noagent view transform
   * @param {string} status parse status
   * @returns {object} class map of the log line
   */
  importStatusClass(status) {
    return {
      'survey-builder__import--ok': status === 'ok' || status === 'older',
      'survey-builder__import--rejected': status === 'foreign' || status === 'invalid',
    };
  }

  /**
   * @noagent view transform
   * @param {{notes: string[]}} entry
   * @returns {string} notes of a log line, joined
   */
  noteLine(entry) { return entry.notes.join(' · '); }

  /**
   * @noagent view transform
   * @returns {boolean}
   */
  hasResponses() { return this.model.responses.length > 0; }

  /**
   * @returns {Array<{id: string, date: string, who: string}>} in import order
   * @noagent view transform
   */
  responseRows() {
    return this.model.responses.map((r) => ({
      id: r.id, date: formatDateTime(r.submittedAt, localeOf(this._context.i18n)), who: this._respondent(r),
    }));
  }

  /**
   * "anonym", the recipient's name, or "ohne Empfänger".
   * @param {object} r response
   * @returns {string}
   */
  _respondent(r) {
    if (this.model.survey.anonymous) return this._t('respAnonymous');
    if (!r.recipientId) return this._t('respWithoutRecipient');
    return recipientName(this.model.recipients, r.recipientId) || this._t('recipientUnnamed');
  }

  /**
   * Unfolds or folds the answers of a response.
   * @noagent session-only view state
   * @param {string} id response id
   */
  toggleResponse(id) { this.openResponseId = this.openResponseId === id ? null : id; }

  /**
   * @noagent view transform
   * @param {string} id response id
   * @returns {boolean}
   */
  isResponseOpen(id) { return this.openResponseId === id; }

  /**
   * Answers of one response to the questions it saw, in document order.
   * @noagent view transform
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
      out.push({ key: q.id, question: questionLabel(this.model.survey, q, this._t), answer: formatAnswer(q, resp.answers[q.id], strings) || '–' });
    }
    return out;
  }

  /**
   * @returns {{other: string, noAnswer: string, cat: object}} strings for formatAnswer
   */
  _answerStrings() {
    return { other: this._t('answerOther'), noAnswer: this._t('answerNoAnswer'), cat: catLabels(this._context.i18n) };
  }

  /**
   * Delete an imported response, without asking.
   * @agent
   * @param {string} responseId the response
   * @returns {void}
   * @throws {Error} if the response is unknown
   */
  deleteResponse(responseId) {
    requireKnownId('responseId', responseId, this.model.responses.map((r) => r.id));
    if (this.openResponseId === responseId) this.openResponseId = null;
    this.model.deleteResponse(responseId);
  }

  /**
   * @noagent asks first; agents call deleteResponse
   * @param {string} id response id
   * @returns {Promise<void>}
   */
  async confirmDeleteResponse(id) {
    const ok = await this._context.dialog.confirm({ message: this._t('confirmResponseDelete'), danger: true });
    if (ok) this.deleteResponse(id);
  }
}
