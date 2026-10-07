/**
 * references-renderer.js — module references (CSL-JSON subset) → DOM nodes.
 *
 * No HTML strings: everything is built with `h()`, so literal text is escaped
 * natively via text nodes. The text pieces come from references-format.js,
 * which the static handbook generator shares.
 *
 * @see docs/superpowers/specs/2026-09-27-module-references-tab-design.md
 * @see docs/superpowers/specs/2026-10-07-handbook-references-design.md
 */

import { h } from './dom.js';
import { citationParts, sortReferences, fallbackT } from './references-format.js';

export { formatAuthorYear } from './references-format.js';

/**
 * Render one reference entry as a citation fragment.
 * @param {object} entry - CSL-JSON subset entry
 * @param {string} lang - active language code ('de' | 'en')
 * @param {(key: string) => string} [t] - i18n lookup for the connective
 *   labels; falls back to the German defaults when omitted.
 * @returns {DocumentFragment}
 */
export function formatCitation(entry, lang, t = fallbackT) {
  const frag = document.createDocumentFragment();
  const p = citationParts(entry, lang, t);

  if (p.head) frag.append(h('span', { class: 'help-panel__reference-head' }, p.head));
  if (p.title) frag.append(h('span', { class: 'help-panel__reference-title' }, p.title));
  if (p.tail) frag.append(h('span', { class: 'help-panel__reference-tail' }, p.tail));
  if (p.link) {
    frag.append(h('a', {
      class: 'help-panel__reference-link',
      href: p.link.href, target: '_blank', rel: 'noopener',
    }, p.link.text));
  }
  if (p.note) frag.append(h('span', { class: 'help-panel__reference-note' }, p.note));

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
  const list = sortReferences(entries, t);

  if (list.length === 0) {
    frag.append(h('p', { class: 'help-panel__references-empty' }, t('moduleHelp.referencesEmpty')));
    return frag;
  }

  frag.append(h('div', { class: 'help-panel__references-list' },
    ...list.map(entry => h('div', {
      class: 'help-panel__reference',
      'data-reference-id': entry.id || '',
    }, formatCitation(entry, lang, t))),
  ));
  return frag;
}
