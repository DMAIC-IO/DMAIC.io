/**
 * D.Mike — Survey builder recipients (viewmodel/recipients.js)
 *
 * Sub-viewmodel of the recipients tab: recipient list, send status and the
 * per-recipient export. Knows the model, survey-labels.js and the pure
 * survey-*.js modules — never a sibling or the shell (spec E2).
 *
 * Spec: docs/superpowers/specs/2026-10-24-survey-builder-teil-viewmodels-design.md
 */

import { buildSurveyHtml, surveyFileName, runnerStrings } from '../survey-export.js';
import { formatDateTime, fmtPct, localeOf, recipientName } from '../survey-labels.js';
import { downloadBlob } from '../../../core/export-utils.js';

const STATUS_LABELS = {
  'not-sent': 'statusNotSent', sent: 'statusSent', answered: 'statusAnswered',
};

export class RecipientsViewModel {
  /**
   * Gets only what exists before the mount; the model comes with attach().
   * @param {{t: function(string, object=): string, context: object, container: function(): ?Element}} deps
   */
  constructor({ t, context, container }) {
    this._t = t;
    this._context = context;
    this._container = container;
    /** @type {?object} the component's State, set by attach() */
    this.model = null;
  }

  /**
   * Binds the component's model (spec E2: two-stage binding).
   * @param {{model: object, watch: function, nextTick: function}} binding
   */
  attach({ model }) { this.model = model; }

  /** Nothing to release: no timers, subscriptions or charts. */
  detach() {}

  /** @returns {boolean} whether at least one recipient exists */
  hasRecipients() { return this.model.recipients.length > 0; }

  /** Adds an empty recipient row. */
  addRecipient() { this.model.addRecipient(); }

  /**
   * @param {string} id recipient id
   * @param {string} field recipient field
   * @param {Event} ev input event
   */
  updateRecipientFromEvent(id, field, ev) {
    this.model.updateRecipient(id, field, ev.target.value);
  }

  /**
   * Deletes a recipient. Asks first only when they already answered —
   * their response stays, without a recipient (State.deleteRecipient).
   * @param {string} id recipient id
   * @returns {Promise<void>}
   */
  async deleteRecipient(id) {
    if (this.model.recipientStatus(id) === 'answered') {
      const name = recipientName(this.model.recipients, id) || this._t('recipientUnnamed');
      const ok = await this._context.dialog.confirm({ message: this._t('confirmRecipientDelete', { name }), danger: true });
      if (!ok) return;
    }
    this.model.deleteRecipient(id);
  }

  /**
   * @param {string} id recipient id
   * @returns {string} translated status
   */
  recipientStatusLabel(id) { return this._t(STATUS_LABELS[this.model.recipientStatus(id)]); }

  /**
   * @param {string} id recipient id
   * @returns {boolean} whether the sent file predates the current structure
   */
  isOutdated(id) { return this.model.isOutdated(id); }

  /**
   * @param {{sentVersion: number|null}} r recipient
   * @returns {string} outdated hint
   */
  outdatedHint(r) { return this._t('outdatedHint', { version: r.sentVersion }); }

  /**
   * @param {{sentAt: string|null, sentVersion: number|null}} r recipient
   * @returns {string} "date · version n", '–' when never sent
   */
  sentLabel(r) {
    if (!r.sentAt) return '–';
    return this._t('sentLabel', { date: formatDateTime(r.sentAt, localeOf(this._context.i18n)), version: r.sentVersion });
  }

  /** @returns {string} "1 verschickt · 0 beantwortet (0 %)" */
  countsLine() {
    const c = this.model.recipientCounts();
    return this._t('report.rateLine', { sent: c.sent, answered: c.answered, rate: fmtPct(c.rate) });
  }

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
    const strings = await runnerStrings(this._context.i18n, survey.lang);
    // The file carries the version the export settles on, but the model is
    // only marked once the file was built: a failure must change nothing.
    survey.version = this.model.nextExportVersion();
    const html = buildSurveyHtml(survey, strings, { recipientId: id });
    this.model.markExported();
    this.model.markSent(id, new Date().toISOString());
    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), surveyFileName(survey, strings, r));
  }
}
