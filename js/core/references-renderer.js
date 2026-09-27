/**
 * references-renderer.js — module references (CSL-JSON subset) → DOM nodes.
 *
 * No HTML strings: everything is built with `h()`, so literal text is escaped
 * natively via text nodes. Only the `note` field is localized.
 *
 * @see docs/superpowers/specs/2026-09-27-module-references-tab-design.md
 */

import { h } from './dom.js';

/** @param {object} entry @returns {number|null} the publication year. */
function yearOf(entry) {
  const parts = entry?.issued?.['date-parts'];
  const year = Array.isArray(parts) && Array.isArray(parts[0]) ? parts[0][0] : null;
  return Number.isFinite(year) ? year : null;
}

/**
 * @param {object} entry
 * @param {(key: string) => string} [t] - i18n lookup for the "et al." label.
 *   Optional; falls back to the German default when omitted.
 * @returns {string} surnames joined per citation style.
 */
function authorsOf(entry, t = fallbackT) {
  const list = Array.isArray(entry?.author) ? entry.author.filter(a => a && a.family) : [];
  if (list.length === 0) return '';
  if (list.length === 1) return list[0].family;
  if (list.length === 2) return `${list[0].family} & ${list[1].family}`;
  return `${list[0].family} ${t('moduleHelp.referenceEtAl')}`;
}

/**
 * Short author-year form used for inline citations and the list heading.
 * Falls back to the title when no author is given, and omits the year when
 * none is known.
 * @param {object} entry
 * @param {(key: string) => string} [t] - i18n lookup for the "et al." label.
 *   Optional; falls back to the German default when omitted so existing
 *   callers keep working.
 * @returns {string}
 */
export function formatAuthorYear(entry, t = fallbackT) {
  const who = authorsOf(entry, t) || entry?.title || entry?.id || '';
  const year = yearOf(entry);
  return year == null ? who : `${who} ${year}`.trim();
}

/** Full name of one author: "Wheeler, Donald J." or just the family name. */
function fullName(a) {
  return a.given ? `${a.family}, ${a.given}` : a.family;
}

/** External link node for DOI / URL, or null when the entry has neither. */
function linkNode(entry) {
  const href = entry.DOI ? `https://doi.org/${entry.DOI}` : (entry.URL || null);
  if (!href) return null;
  const label = entry.DOI ? `doi:${entry.DOI}` : entry.URL;
  return h('a', {
    class: 'help-panel__reference-link',
    href, target: '_blank', rel: 'noopener',
  }, label);
}

/** Fallback i18n lookup used when `formatCitation` is called without a `t`
 *  function (kept for backwards compatibility with existing callers). Mirrors
 *  the German defaults from `i18n/de.json`'s `moduleHelp` block. */
function fallbackT(key) {
  const de = {
    'moduleHelp.referenceVolume': 'Bd.',
    'moduleHelp.referenceIssue': 'Nr.',
    'moduleHelp.referencePage': 'S.',
    'moduleHelp.referenceEdition': 'Aufl.',
    'moduleHelp.referenceEtAl': 'u. a.',
  };
  return de[key] ?? key;
}

/**
 * Render one reference entry as a citation fragment.
 * @param {object} entry - CSL-JSON subset entry
 * @param {string} lang - active language code ('de' | 'en')
 * @param {(key: string) => string} [t] - i18n lookup for the connective
 *   labels (volume/issue/page/edition). Optional; falls back to the German
 *   defaults when omitted so existing callers keep working.
 * @returns {DocumentFragment}
 */
export function formatCitation(entry, lang, t = fallbackT) {
  const frag = document.createDocumentFragment();

  const authors = (Array.isArray(entry.author) ? entry.author.filter(a => a && a.family) : [])
    .map(fullName).join('; ');
  const year = yearOf(entry);

  const head = [authors, year == null ? null : `(${year})`].filter(Boolean).join(' ');
  if (head) frag.append(h('span', { class: 'help-panel__reference-head' }, head));

  if (entry.title) frag.append(h('span', { class: 'help-panel__reference-title' }, entry.title));

  const tailParts = [
    entry['container-title'],
    entry.volume ? `${t('moduleHelp.referenceVolume')} ${entry.volume}` : null,
    entry.issue ? `${t('moduleHelp.referenceIssue')} ${entry.issue}` : null,
    entry.page ? `${t('moduleHelp.referencePage')} ${entry.page}` : null,
    entry.edition ? `${entry.edition} ${t('moduleHelp.referenceEdition')}` : null,
    entry.publisher,
    entry['publisher-place'],
    entry.ISBN ? `ISBN ${entry.ISBN}` : null,
  ].filter(Boolean);
  if (tailParts.length) {
    frag.append(h('span', { class: 'help-panel__reference-tail' }, tailParts.join(', ')));
  }

  const link = linkNode(entry);
  if (link) frag.append(link);

  const note = entry.note?.[lang] || entry.note?.en || entry.note?.de || '';
  if (note) frag.append(h('span', { class: 'help-panel__reference-note' }, note));

  return frag;
}

/**
 * Render the full reference list for a module.
 * Sorted by first author (locale-aware), then by year.
 * @param {object[]} entries
 * @param {string} lang
 * @param {(key: string) => string} t - i18n lookup
 * @returns {DocumentFragment}
 */
export function renderReferences(entries, lang, t) {
  const frag = document.createDocumentFragment();
  const list = Array.isArray(entries) ? [...entries] : [];

  if (list.length === 0) {
    frag.append(h('p', { class: 'help-panel__references-empty' }, t('moduleHelp.referencesEmpty')));
    return frag;
  }

  list.sort((a, b) => {
    const byAuthor = (authorsOf(a, t) || a.title || '').localeCompare(authorsOf(b, t) || b.title || '', 'de');
    if (byAuthor !== 0) return byAuthor;
    return (yearOf(a) ?? 0) - (yearOf(b) ?? 0);
  });

  frag.append(h('div', { class: 'help-panel__references-list' },
    ...list.map(entry => h('div', {
      class: 'help-panel__reference',
      'data-reference-id': entry.id || '',
    }, formatCitation(entry, lang, t))),
  ));
  return frag;
}
