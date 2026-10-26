/**
 * D.Mike — Survey builder labels (survey-labels.js)
 *
 * Pure label and formatting helpers shared by the shell and the
 * sub-viewmodels of survey-builder. No state: everything a function needs
 * (a slice of the model, the translation function, the locale) comes in as
 * an argument.
 */

import { documentOrder } from './survey-conditions.js';

const TYPE_LABELS = {
  single: 'typeSingle', multi: 'typeMulti', rating: 'typeRating',
  kano: 'typeKano', text: 'typeText', info: 'typeInfo',
};

/** Kano category codes, in the order of the kano module. */
export const KANO_CATEGORIES = ['M', 'O', 'A', 'I', 'R', 'Q'];

/**
 * @param {{getLanguage: function(): string}} i18n
 * @returns {'de-DE'|'en-US'} locale of the app language
 */
export function localeOf(i18n) { return i18n.getLanguage() === 'en' ? 'en-US' : 'de-DE'; }

/**
 * @param {string} type question type
 * @param {function(string, object=): string} t translation function of the module
 * @returns {string} translated question type
 */
export function typeLabel(type, t) { return t(TYPE_LABELS[type] || 'typeText'); }

/**
 * Question text, or "Frage <n>" (position in document order) when empty.
 * @param {object} survey the questionnaire (State.survey)
 * @param {object} q question
 * @param {function(string, object=): string} t
 * @returns {string}
 */
export function questionLabel(survey, q, t) {
  if (q.text && q.text.trim()) return q.text.trim();
  const n = documentOrder(survey).findIndex((e) => e.question.id === q.id) + 1;
  return t('questionNumber', { n });
}

/**
 * @param {number} index 0-based
 * @param {function(string, object=): string} t
 * @returns {string} placeholder of an untitled section
 */
export function sectionPlaceholder(index, t) { return t('sectionUntitled', { n: index + 1 }); }

/**
 * @param {{text: string}} opt option
 * @param {function(string, object=): string} t
 * @returns {string} its text or a placeholder
 */
export function optionText(opt, t) { return opt.text || t('optionUntitled'); }

/**
 * @param {{t: function(string): string}} i18n app i18n
 * @returns {Object<string, string>} Kano category labels of the kano module
 */
export function catLabels(i18n) {
  const out = {};
  for (const c of KANO_CATEGORIES) out[c] = i18n.t(`modules.kano.cat${c}`);
  return out;
}

/**
 * @param {string|null} code Kano category code
 * @param {{t: function(string): string}} i18n
 * @returns {string} its label, '—' without code
 */
export function catLabel(code, i18n) { return code ? catLabels(i18n)[code] : '—'; }

/**
 * @param {Array<{id: string, name: string}>} recipients
 * @param {string|null} id recipient id
 * @returns {string|null} trimmed name, null when unknown or unnamed
 */
export function recipientName(recipients, id) {
  const r = id ? recipients.find((x) => x.id === id) : null;
  return r && r.name.trim() ? r.name.trim() : null;
}

/**
 * @param {string|null} iso
 * @param {string} locale
 * @returns {string} local date and time, '–' when empty
 */
export function formatDateTime(iso, locale) {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  return d.toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * @param {number|null} share 0..1
 * @returns {string} "42 %", '—' without a base
 */
export function fmtPct(share) {
  return share === null || share === undefined ? '—' : `${Math.round(share * 100)} %`;
}

/**
 * @param {number|null} value
 * @param {number} decimals
 * @param {string} locale
 * @returns {string} localised number, '—' when empty
 */
export function fmtNum(value, decimals, locale) {
  if (value === null || value === undefined) return '—';
  return Number(value).toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
