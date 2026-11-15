/**
 * D.Mike — Survey builder: Versandstatus eines Empfängers.
 *
 * Geteilt von Model (`recipientCounts`) und Statistik (`responseRate`).
 */

/**
 * Whether a recipient counts as "sent". Answering proves receipt, so an
 * answerer counts as sent even without `sentAt`. Shared with the summary's
 * response rate.
 * @param {{sentAt: string|null}} recipient
 * @param {boolean} answered whether the recipient has answered
 * @returns {boolean}
 */
export function isRecipientSent(recipient, answered) {
  return Boolean(recipient.sentAt) || Boolean(answered);
}
