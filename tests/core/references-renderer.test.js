import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { formatAuthorYear, formatCitation, renderReferences } from '../../js/core/references-renderer.js';

const BOOK = {
  id: 'aiag-msa-4', type: 'book',
  author: [{ family: 'AIAG' }],
  title: 'Measurement Systems Analysis (MSA)',
  edition: '4th', publisher: 'AIAG',
  issued: { 'date-parts': [[2010]] },
  ISBN: '978-1605341118',
  note: { de: 'Cg/Cgk-Grenzen', en: 'Cg/Cgk limits' },
};

const ARTICLE = {
  id: 'wheeler-1992', type: 'article-journal',
  author: [{ family: 'Wheeler', given: 'Donald J.' }, { family: 'Chambers', given: 'David S.' }],
  title: 'Understanding Statistical Process Control',
  'container-title': 'Quality Engineering',
  volume: '5', page: '1-20',
  issued: { 'date-parts': [[1992]] },
  DOI: '10.1000/xyz',
};

const THREE = {
  id: 'montgomery-2011', type: 'book',
  author: [{ family: 'Montgomery' }, { family: 'Runger' }, { family: 'Hubele' }],
  title: 'Engineering Statistics',
  issued: { 'date-parts': [[2011]] },
};

/** i18n stub. */
const t = (k) => k;

/** Render into a host div and return it. */
function host(frag) {
  const el = document.createElement('div');
  el.append(frag);
  return el;
}

suite('references-renderer: formatAuthorYear()', () => {
  test('single corporate author', () => {
    assertEqual(formatAuthorYear(BOOK), 'AIAG 2010', 'one author');
  });

  test('two authors joined with &', () => {
    assertEqual(formatAuthorYear(ARTICLE), 'Wheeler & Chambers 1992', 'two authors');
  });

  test('three or more authors collapse to "u. a."', () => {
    assertEqual(formatAuthorYear(THREE), 'Montgomery u. a. 2011', 'three authors');
  });

  test('no author falls back to the title', () => {
    assertEqual(formatAuthorYear({ title: 'ISO 22514-7', issued: { 'date-parts': [[2021]] } }),
      'ISO 22514-7 2021', 'title fallback');
  });

  test('no year omits the year', () => {
    assertEqual(formatAuthorYear({ author: [{ family: 'AIAG' }], title: 'X' }), 'AIAG', 'no year');
  });
});

suite('references-renderer: formatCitation()', () => {
  test('book: title, edition, publisher, ISBN appear', () => {
    const el = host(formatCitation(BOOK, 'de'));
    const text = el.textContent;
    assertTrue(text.includes('Measurement Systems Analysis (MSA)'), 'title');
    assertTrue(text.includes('4th'), 'edition');
    assertTrue(text.includes('AIAG'), 'publisher');
    assertTrue(text.includes('978-1605341118'), 'isbn');
  });

  test('article: container title and DOI link', () => {
    const el = host(formatCitation(ARTICLE, 'de'));
    assertTrue(el.textContent.includes('Quality Engineering'), 'container');
    const a = el.querySelector('a');
    assertTrue(a != null, 'has link');
    assertEqual(a.getAttribute('href'), 'https://doi.org/10.1000/xyz', 'doi href');
    assertEqual(a.getAttribute('rel'), 'noopener', 'rel');
    assertEqual(a.getAttribute('target'), '_blank', 'target');
  });

  test('note is localized', () => {
    assertTrue(host(formatCitation(BOOK, 'de')).textContent.includes('Cg/Cgk-Grenzen'), 'de note');
    assertTrue(host(formatCitation(BOOK, 'en')).textContent.includes('Cg/Cgk limits'), 'en note');
  });

  test('connective labels: German prefixes/suffix without an explicit t', () => {
    const text = host(formatCitation(ARTICLE, 'de')).textContent;
    assertTrue(text.includes('Bd. 5'), 'volume prefix');
    assertTrue(text.includes('S. 1-20'), 'page prefix');
    const editionText = host(formatCitation(BOOK, 'de')).textContent;
    assertTrue(editionText.includes('4th Aufl.'), 'edition suffix');
  });

  test('connective labels: English prefixes/suffix with an English t', () => {
    const tEn = (k) => ({
      'moduleHelp.referenceVolume': 'Vol.',
      'moduleHelp.referenceIssue': 'No.',
      'moduleHelp.referencePage': 'p.',
      'moduleHelp.referenceEdition': 'ed.',
    })[k] ?? k;
    const text = host(formatCitation(ARTICLE, 'en', tEn)).textContent;
    assertTrue(text.includes('Vol. 5'), 'volume prefix');
    assertTrue(text.includes('p. 1-20'), 'page prefix');
    const editionText = host(formatCitation(BOOK, 'en', tEn)).textContent;
    assertTrue(editionText.includes('4th ed.'), 'edition suffix');
  });
});

suite('references-renderer: renderReferences()', () => {
  test('sorted by author, then year; each entry carries its id', () => {
    const el = host(renderReferences([THREE, BOOK, ARTICLE], 'de', t));
    const ids = [...el.querySelectorAll('[data-reference-id]')].map(n => n.dataset.referenceId);
    assertEqual(ids.join(','), 'aiag-msa-4,montgomery-2011,wheeler-1992', 'alphabetical');
  });

  test('empty list renders the empty-state key', () => {
    const el = host(renderReferences([], 'de', t));
    assertTrue(el.textContent.includes('moduleHelp.referencesEmpty'), 'empty state');
  });
});
