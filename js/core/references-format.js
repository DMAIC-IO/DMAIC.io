/**
 * references-format.js — DOM-free formatting of module references
 * (CSL-JSON subset). Shared by the in-app references tab
 * (references-renderer.js) and the static handbook generator, so both
 * format citations identically.
 *
 * @see docs/superpowers/specs/2026-10-07-handbook-references-design.md
 */

/** Fallback i18n lookup when no `t` is passed. Mirrors the German defaults
 *  from `i18n/de.json`'s `moduleHelp` block. */
export function fallbackT(key) {
  const de = {
    'moduleHelp.referenceVolume': 'Bd.',
    'moduleHelp.referenceIssue': 'Nr.',
    'moduleHelp.referencePage': 'S.',
    'moduleHelp.referenceEdition': 'Aufl.',
    'moduleHelp.referenceEtAl': 'u. a.',
  };
  return de[key] ?? key;
}

/** @param {object} entry @returns {number|null} the publication year. */
export function yearOf(entry) {
  const parts = entry?.issued?.['date-parts'];
  const year = Array.isArray(parts) && Array.isArray(parts[0]) ? parts[0][0] : null;
  return Number.isFinite(year) ? year : null;
}

/** Authors that carry a family name. */
function namedAuthors(entry) {
  return Array.isArray(entry?.author) ? entry.author.filter(a => a && a.family) : [];
}

/**
 * @param {object} entry
 * @param {(key: string) => string} [t] - i18n lookup for the "et al." label
 * @returns {string} surnames joined per citation style.
 */
export function authorsOf(entry, t = fallbackT) {
  const list = namedAuthors(entry);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0].family;
  if (list.length === 2) return `${list[0].family} & ${list[1].family}`;
  return `${list[0].family} ${t('moduleHelp.referenceEtAl')}`;
}

/**
 * Short author-year form for inline citations: "Nelson 1984". Falls back to
 * the title (then the id) without author, omits the year when unknown.
 * @param {object} entry
 * @param {(key: string) => string} [t]
 * @returns {string}
 */
export function formatAuthorYear(entry, t = fallbackT) {
  const who = authorsOf(entry, t) || entry?.title || entry?.id || '';
  const year = yearOf(entry);
  return year == null ? who : `${who} ${year}`.trim();
}

/** @returns {boolean} true for a usable entry (a non-null object). */
export function isEntry(entry) {
  return entry !== null && typeof entry === 'object';
}

/**
 * Edition label in the citation language. Stored editions vary ('4th',
 * '2.', 3); the leading number is taken and rendered as "4." (de) or
 * "4th" (en). A non-numeric edition ("Revised") is kept as is.
 * @param {string|number} edition
 * @param {string} lang
 * @returns {string}
 */
function editionLabel(edition, lang) {
  const match = /^\s*(\d+)/.exec(String(edition));
  if (!match) return String(edition);
  const n = Number(match[1]);
  if (lang !== 'en') return `${n}.`;
  const lastTwo = n % 100;
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? 'th'
    : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th';
  return `${n}${suffix}`;
}

/**
 * Sort by first author (locale-aware, German collation), then by year.
 * @param {object[]} entries
 * @param {(key: string) => string} [t]
 * @returns {object[]} a new array
 */
export function sortReferences(entries, t = fallbackT) {
  const list = Array.isArray(entries) ? entries.filter(isEntry) : [];
  return list.sort((a, b) => {
    const byAuthor = (authorsOf(a, t) || a.title || '').localeCompare(authorsOf(b, t) || b.title || '', 'de');
    if (byAuthor !== 0) return byAuthor;
    return (yearOf(a) ?? 0) - (yearOf(b) ?? 0);
  });
}

/**
 * Break one entry into the plain-text pieces of a full citation.
 * @param {object} entry
 * @param {string} lang - 'de' | 'en'; only `note` is localized
 * @param {(key: string) => string} [t] - lookup for volume/issue/page/edition
 * @returns {{head: string, title: string, tail: string,
 *            link: {href: string, text: string}|null, note: string}}
 */
export function citationParts(entry, lang, t = fallbackT) {
  const authors = namedAuthors(entry)
    .map(a => (a.given ? `${a.family}, ${a.given}` : a.family))
    .join('; ');
  const year = yearOf(entry);
  const head = [authors, year == null ? null : `(${year})`].filter(Boolean).join(' ');

  const tail = [
    entry['container-title'],
    entry.volume ? `${t('moduleHelp.referenceVolume')} ${entry.volume}` : null,
    entry.issue ? `${t('moduleHelp.referenceIssue')} ${entry.issue}` : null,
    entry.page ? `${t('moduleHelp.referencePage')} ${entry.page}` : null,
    entry.edition ? `${editionLabel(entry.edition, lang)} ${t('moduleHelp.referenceEdition')}` : null,
    entry.publisher,
    entry['publisher-place'],
    entry.ISBN ? `ISBN ${entry.ISBN}` : null,
  ].filter(Boolean).join(', ');

  let link = null;
  if (entry.DOI) link = { href: `https://doi.org/${entry.DOI}`, text: `doi:${entry.DOI}` };
  else if (entry.URL) link = { href: entry.URL, text: entry.URL };

  const note = entry.note?.[lang] || entry.note?.en || entry.note?.de || '';

  return { head, title: entry.title || '', tail, link, note };
}
