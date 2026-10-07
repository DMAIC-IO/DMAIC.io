/**
 * Module references for the static handbook: the per-page references
 * section and the `{{ref:…}}` link resolver. Text pieces come from the
 * app's DOM-free js/core/references-format.js, so handbook and app format
 * citations identically.
 *
 * @see docs/superpowers/specs/2026-10-07-handbook-references-design.md
 */
import { escapeHtml, escapeAttr } from './escape.mjs';
import {
  citationParts, sortReferences, formatAuthorYear, isEntry,
} from '../../../js/core/references-format.js';

/**
 * Dotted-key lookup into the loaded app i18n for one language.
 * @param {object} i18n - `{ de, en }` as loaded by load-sources.mjs
 * @param {string} lang
 * @returns {(key: string) => string} returns the key itself when missing
 */
export function i18nT(i18n, lang) {
  return (key) => {
    const value = key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), i18n?.[lang]);
    return typeof value === 'string' ? value : key;
  };
}

/** One `<li>` for a reference entry. */
function renderEntry(entry, lang, t) {
  const p = citationParts(entry, lang, t);
  const span = (cls, text) => (text ? `<span class="handbook-reference__${cls}">${escapeHtml(text)}</span>` : '');
  const link = p.link
    ? `<a class="handbook-reference__link" href="${escapeAttr(p.link.href)}" target="_blank" rel="noopener">${escapeHtml(p.link.text)}</a>`
    : '';
  return `<li class="handbook-reference" id="ref-${escapeAttr(entry.id || '')}">`
    + span('head', p.head) + span('title', p.title) + span('tail', p.tail)
    + link + span('note', p.note)
    + '</li>';
}

/**
 * The references section of a module page.
 * @param {object[]} entries
 * @param {string} lang
 * @param {(key: string) => string} t
 * @param {string} heading
 * @returns {string} HTML, or '' when there are no entries
 */
export function renderReferencesSection(entries, lang, t, heading) {
  const list = sortReferences(entries, t);
  if (list.length === 0) return '';
  return `<section class="handbook-section handbook-references" id="module-references">`
    + `<h2>${escapeHtml(heading)}</h2>`
    + `<ol class="handbook-references__list">${list.map(e => renderEntry(e, lang, t)).join('')}</ol>`
    + `</section>`;
}

/**
 * Resolver for inline `{{ref:id|label}}` markers on a module page.
 * @param {object[]} entries - the module's references
 * @param {(key: string) => string} t
 * @returns {(id: string, escapedLabel?: string) => string|null} anchor HTML,
 *   or null for an unknown id (the caller then keeps plain text).
 *   `escapedLabel` is already HTML-escaped by the inline renderer and is
 *   inserted as is.
 */
export function makeRefLink(entries, t) {
  const byId = new Map((Array.isArray(entries) ? entries.filter(isEntry) : []).map(e => [e.id, e]));
  return (id, escapedLabel) => {
    const entry = byId.get(id);
    if (!entry) return null;
    const text = escapedLabel || `(${escapeHtml(formatAuthorYear(entry, t))})`;
    return `<a class="handbook-ref" href="#ref-${escapeAttr(id)}">${text}</a>`;
  };
}
