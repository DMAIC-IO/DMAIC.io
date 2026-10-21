/**
 * D.Mike — Survey builder recipients tab (survey-recipients-controller.js)
 *
 * Recipient list, send status and the per-recipient export.
 * Spread into the data function of survey-builder.js, which owns config,
 * lifecycle, tabs, labels and formatting; `this` is the whole component.
 *
 * Spec: docs/superpowers/specs/2026-10-10-survey-builder-design.md
 */

import { buildSurveyHtml, surveyFileName, runnerStrings } from './survey-export.js';
import { downloadBlob } from '../../core/export-utils.js';

const STATUS_LABELS = {
  'not-sent': 'statusNotSent', sent: 'statusSent', answered: 'statusAnswered',
};

/**
 * @param {object} module the module instance (`_context`, `_container`)
 * @param {function(string, object=): string} _t translation function of the module
 * @returns {object} members of the Alpine component
 */
export function recipientsController(module, _t) {
  return {
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
        const ok = await module._context.dialog.confirm({ message: _t('confirmRecipientDelete', { name }), danger: true });
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
  };
}
