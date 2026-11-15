/**
 * D.Mike — Survey builder: view part "recipients" (viewmodel/recipients.js)
 *
 * The recipients tab: the list with its fields (`x-model`), the send
 * status, the counts line and the file of one recipient. Adding and
 * deleting run the model commands through `x-command`; deleting a
 * recipient who has answered asks first (the command's `confirm`).
 *
 * „HTML erzeugen“ starts the run `buildRecipientFile` and downloads its
 * file; the run marks the recipient as sent with the version it settles on.
 */
import { downloadBlob } from '../../../core/export-utils.js';
import { formatDateTime, fmtPct, localeOf } from '../domain/labels.js';

/**
 * @typedef {import('../domain/model.types.js').SurveyModelFields['recipients'][number]} Recipient
 */

/**
 * The model with the reading methods of its class (status, counts), which
 * the generated model type does not list.
 * @param {any} model @returns {any}
 */
const withReaders = (model) => model;

/** Text key per send status. */
const STATUS_LABELS = { 'not-sent': 'statusNotSent', sent: 'statusSent', answered: 'statusAnswered' };

/** @type {import('./state.types.js').SurveyBuilderViewFn} */
export const recipientsView = (ctx) => ({
  /** @returns {boolean} at least one recipient exists */
  get hasRecipients() { return this.model.recipients.length > 0; },

  /** „1 verschickt · 0 beantwortet (0 %)“ @returns {string} */
  get countsLine() {
    const c = withReaders(this.model).recipientCounts();
    return this.t('report.rateLine', { sent: c.sent, answered: c.answered, rate: fmtPct(c.rate) });
  },

  /** @param {string} id @returns {string} the translated send status */
  recipientStatusLabel(id) { return this.t(STATUS_LABELS[withReaders(this.model).recipientStatus(id)]); },

  /** @param {string} id @returns {boolean} the sent file predates the current version */
  isOutdated(id) { return withReaders(this.model).isOutdated(id); },

  /** @param {Recipient} r @returns {string} */
  outdatedHint(r) { return this.t('outdatedHint', { version: r.sentVersion }); },

  /** @param {Recipient} r @returns {string} „date · Version n“, '–' when never sent */
  sentLabel(r) {
    if (!r.sentAt) return '–';
    return this.t('sentLabel', { date: formatDateTime(r.sentAt, localeOf(ctx.i18n)), version: r.sentVersion });
  },

  /**
   * „HTML erzeugen“: the recipient's own file, downloaded.
   * @param {string} id recipient id
   * @returns {Promise<void>}
   */
  async exportForRecipient(id) {
    if (!this.model.recipients.some((x) => x.id === id)) return;
    const out = await this._asyncTaskHost.start('buildRecipientFile', { recipientId: id });
    if (out.status === 'rejected') ctx.notify(ctx.i18n.t('common.asyncTask.rejected', { reason: out.reason }), 'error');
    if (out.status !== 'done') return;
    downloadBlob(new Blob([out.value.content], { type: 'text/html;charset=utf-8' }), out.value.fileName);
  },
});
