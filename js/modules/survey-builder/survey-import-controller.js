/**
 * D.Mike — Survey builder answer import (survey-import-controller.js)
 *
 * Results tab: importing answer files and the list of responses.
 * Spread into the data function of survey-builder.js, which owns config,
 * lifecycle, tabs, labels and formatting; `this` is the whole component.
 *
 * Spec: docs/superpowers/specs/2026-10-10-survey-builder-design.md
 */

import { documentOrder, isVisible } from './survey-conditions.js';
import { parseResponse } from './survey-import.js';
import { formatAnswer } from './survey-stats.js';
import { plainCopy } from './survey-builder-model.js';
import { uid } from '../../core/uid.js';
import { catLabels } from './survey-labels.js';

const IMPORT_LABELS = {
  ok: 'importOk', older: 'importOlder', duplicate: 'importDuplicate', foreign: 'importForeign', invalid: 'importInvalid',
};

/**
 * @param {object} module the module instance (`_context`, `_container`)
 * @param {function(string, object=): string} _t translation function of the module
 * @returns {object} members of the Alpine component
 */
export function importController(module, _t) {
  return {
    /**
     * Result of every imported file in this session (not persisted).
     * @type {Array<{key: string, name: string, status: string, notes: string[]}>}
     */
    importLog: [],
    /** Response whose answers are unfolded in the list. */
    openResponseId: null,

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
        const result = parseResponse(text, plainCopy(this.model.survey), this.model.responseIds());
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
      return { other: _t('answerOther'), noAnswer: _t('answerNoAnswer'), cat: catLabels(module._context.i18n) };
    },

    /**
     * Deletes a response after confirmation.
     * @param {string} id response id
     */
    async deleteResponse(id) {
      const ok = await module._context.dialog.confirm({ message: _t('confirmResponseDelete'), danger: true });
      if (!ok) return;
      if (this.openResponseId === id) this.openResponseId = null;
      this.vocSelected = this.vocSelected.filter((k) => !k.startsWith(`${id}:`));
      this.model.deleteResponse(id);
    },
  };
}
