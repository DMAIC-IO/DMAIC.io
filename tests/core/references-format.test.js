/**
 * Tests for js/core/references-format.js — the DOM-free citation formatting
 * shared by the in-app references tab and the static handbook generator.
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import {
  formatAuthorYear, citationParts, sortReferences,
} from '../../js/core/references-format.js';
import { BOOK, ARTICLE, THREE } from './references-fixtures.js';

const tEn = (k) => ({
  'moduleHelp.referenceVolume': 'Vol.',
  'moduleHelp.referenceIssue': 'No.',
  'moduleHelp.referencePage': 'p.',
  'moduleHelp.referenceEdition': 'ed.',
  'moduleHelp.referenceEtAl': 'et al.',
})[k] ?? k;

suite('references-format: formatAuthorYear()', () => {
  test('zero authors fall back to the title', () => {
    assertEqual(formatAuthorYear({ title: 'ISO 22514-7', issued: { 'date-parts': [[2021]] } }),
      'ISO 22514-7 2021', 'title fallback');
  });
  test('zero authors and no title fall back to the id', () => {
    assertEqual(formatAuthorYear({ id: 'x-1' }), 'x-1', 'id fallback');
  });
  test('one, two and three authors', () => {
    assertEqual(formatAuthorYear(BOOK), 'AIAG 2010', 'one');
    assertEqual(formatAuthorYear(ARTICLE), 'Wheeler & Chambers 1992', 'two');
    assertEqual(formatAuthorYear(THREE, tEn), 'Montgomery et al. 2011', 'three');
  });
  test('missing year is omitted', () => {
    assertEqual(formatAuthorYear({ author: [{ family: 'AIAG' }] }), 'AIAG', 'no year');
  });
});

suite('references-format: citationParts()', () => {
  test('book: head, title, tail with edition/publisher/ISBN, no link, localized note', () => {
    const p = citationParts(BOOK, 'en', tEn);
    assertEqual(p.head, 'AIAG (2010)', 'head');
    assertEqual(p.title, 'Measurement Systems Analysis (MSA)', 'title');
    assertEqual(p.tail, '4th ed., AIAG, ISBN 978-1605341118', 'tail');
    assertEqual(p.link, null, 'no link');
    assertEqual(p.note, 'Cg/Cgk limits', 'note en');
  });
  test('journal article: full names, container/volume/page, DOI link', () => {
    const p = citationParts(ARTICLE, 'de');
    assertEqual(p.head, 'Wheeler, Donald J.; Chambers, David S. (1992)', 'head');
    assertEqual(p.tail, 'Quality Engineering, Bd. 5, S. 1-20', 'tail');
    assertEqual(p.link.href, 'https://doi.org/10.1000/xyz', 'href');
    assertEqual(p.link.text, 'doi:10.1000/xyz', 'text');
    assertEqual(p.note, '', 'no note');
  });
  test('standard without author or year: empty head, title only', () => {
    const p = citationParts({ id: 'iso', type: 'standard', title: 'ISO 22514-7' }, 'de');
    assertEqual(p.head, '', 'head');
    assertEqual(p.title, 'ISO 22514-7', 'title');
    assertEqual(p.tail, '', 'tail');
  });
  test('webpage: URL link when no DOI', () => {
    const p = citationParts({ id: 'w', type: 'webpage', title: 'NIST', URL: 'https://www.itl.nist.gov/' }, 'de');
    assertEqual(p.link.href, 'https://www.itl.nist.gov/', 'href');
    assertEqual(p.link.text, 'https://www.itl.nist.gov/', 'text');
  });
  test('DOI wins over URL', () => {
    const p = citationParts({ id: 'b', DOI: '10.1/a', URL: 'https://x.test/' }, 'de');
    assertEqual(p.link.href, 'https://doi.org/10.1/a', 'doi first');
  });
  test('note falls back lang → en → de', () => {
    assertEqual(citationParts({ note: { en: 'E', de: 'D' } }, 'fr').note, 'E', 'en fallback');
    assertEqual(citationParts({ note: { de: 'D' } }, 'en').note, 'D', 'de fallback');
  });
});

suite('references-format: sortReferences()', () => {
  test('sorts by first author, then year, without mutating the input', () => {
    const input = [THREE, ARTICLE, BOOK, { id: 'a2', author: [{ family: 'AIAG' }], issued: { 'date-parts': [[2002]] } }];
    const out = sortReferences(input);
    assertEqual(out.map(e => e.id).join(','), 'a2,aiag-msa-4,montgomery-2011,wheeler-1992', 'order');
    assertEqual(input[0], THREE, 'input untouched');
  });
  test('non-array input yields an empty array', () => {
    assertTrue(Array.isArray(sortReferences(null)) && sortReferences(null).length === 0, 'empty');
  });
});

suite('references-format: edition', () => {
  const tail = (edition, lang, t) => citationParts({ id: 'e', title: 'T', edition }, lang, t).tail;
  test('German: numeric part as "N. Aufl.", whatever the stored form', () => {
    assertEqual(tail('4th', 'de'), '4. Aufl.', '4th');
    assertEqual(tail('2.', 'de'), '2. Aufl.', '2.');
    assertEqual(tail(3, 'de'), '3. Aufl.', 'number');
  });
  test('English: ordinal suffix, including 11th-13th', () => {
    assertEqual(tail('2.', 'en', tEn), '2nd ed.', '2nd');
    assertEqual(tail('3rd', 'en', tEn), '3rd ed.', '3rd');
    assertEqual(tail('1', 'en', tEn), '1st ed.', '1st');
    assertEqual(tail('11', 'en', tEn), '11th ed.', '11th');
    assertEqual(tail('12th', 'en', tEn), '12th ed.', '12th');
    assertEqual(tail('22', 'en', tEn), '22nd ed.', '22nd');
  });
  test('non-numeric edition is kept as is', () => {
    assertEqual(tail('Revised', 'en', tEn), 'Revised ed.', 'text');
  });
});

suite('references-format: malformed entries', () => {
  test('sortReferences drops null and non-object entries', () => {
    const list = sortReferences([null, BOOK, undefined, 42, 'x', ARTICLE]);
    assertEqual(list.map(e => e.id).join(','), [BOOK.id, ARTICLE.id].join(','), 'only objects remain');
  });
});
