/**
 * Tests for formatCitation() and renderReferences() in
 * js/core/references-renderer.js. They build DOM fragments, so they run in the
 * browser runner only.
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { formatCitation, renderReferences } from '../../js/core/references-renderer.js';
import { BOOK, ARTICLE, THREE } from './references-fixtures.js';

/** i18n stub. */
const t = (k) => k;

/** Render into a host div and return it. */
function host(frag) {
  const el = document.createElement('div');
  el.append(frag);
  return el;
}

suite('references-renderer: formatCitation()', () => {
  test('book: title, edition, publisher, ISBN appear', () => {
    const el = host(formatCitation(BOOK, 'de'));
    const text = el.textContent;
    assertTrue(text.includes('Measurement Systems Analysis (MSA)'), 'title');
    assertTrue(text.includes('4. Aufl.'), 'edition');
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
    assertTrue(editionText.includes('4. Aufl.'), 'edition suffix');
  });

  test('connective labels: English prefixes/suffix with an English t', () => {
    const tEn = (k) => ({
      'moduleHelp.referenceVolume': 'Vol.',
      'moduleHelp.referenceIssue': 'No.',
      'moduleHelp.referencePage': 'p.',
      'moduleHelp.referenceEdition': 'ed.',
      'moduleHelp.referenceEtAl': 'et al.',
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
