/**
 * Ablehnungsmarken an Eingabefeldern und der Bereichstext eines Zahlenfelds.
 *
 * `x-field`, `x-widget`, die Kommando-Direktiven und Knopfgruppen markieren
 * eine abgewiesene Eingabe mit `markRejection` (Markierung, `aria-invalid`,
 * Hinweis im Titel) und heben sie mit `clearRejection` wieder auf;
 * `describeRange` beschreibt die Grenzen eines Zahlenfelds als kurzen Text.
 */
import { formatNumber } from './number-format.js';

/**
 * @typedef {object} ParamSpec
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [exclusiveMin]
 * @property {number} [exclusiveMax]
 * @property {boolean} [integer]
 */

/**
 * Der zulässige Bereich als kurzer Text (für den Hinweis an der Oberfläche).
 * @param {ParamSpec} spec
 * @param {string} lang  steuert nur die Zahlenformatierung
 * @param {(key: string, vars?: object) => string} t
 * @returns {string}
 */
export function describeRange(spec, lang, t) {
  const nf = { format: (v) => formatNumber(v, lang) };
  const parts = [];
  if (spec.exclusiveMin !== undefined) parts.push(`> ${nf.format(spec.exclusiveMin)}`);
  else if (spec.min !== undefined) parts.push(`≥ ${nf.format(spec.min)}`);
  if (spec.exclusiveMax !== undefined) parts.push(`< ${nf.format(spec.exclusiveMax)}`);
  else if (spec.max !== undefined) parts.push(`≤ ${nf.format(spec.max)}`);
  let text = parts.join(` ${t('common.rangeAnd')} `);
  if (spec.integer) text = text ? `${text}, ${t('common.rangeInteger')}` : t('common.rangeInteger');
  return text;
}

/**
 * Die Ablehnungsmarken eines Feldes entfernen und seinen Vorlagen-Hinweis wiederherstellen.
 * @param {HTMLElement} el
 */
export function clearRejection(el) {
  el.classList.remove('field--error');
  el.removeAttribute('aria-invalid');
  if (el.dataset && el.dataset.paramTitle !== undefined) {
    el.title = el.dataset.paramTitle;
    delete el.dataset.paramTitle;
  }
}

/**
 * Ein Feld als abgewiesen markieren: Markierung, aria-invalid und ein Hinweis
 * im Titel (der Vorlagen-Titel kommt mit `clearRejection` zurück).
 * @param {HTMLElement} el
 * @param {string} title  Hinweistext
 */
export function markRejection(el, title) {
  el.classList.add('field--error');
  el.setAttribute('aria-invalid', 'true');
  if (el.dataset && el.dataset.paramTitle === undefined) el.dataset.paramTitle = el.title ?? '';
  el.title = title;
}
