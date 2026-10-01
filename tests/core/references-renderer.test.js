/**
 * Tests for formatAuthorYear() in js/core/references-renderer.js. DOM-free —
 * runs in the node lane; the DOM-building functions are tested in
 * references-renderer-dom.test.js.
 */
import { suite, test, assertEqual } from '../test-utils.js';
import { formatAuthorYear } from '../../js/core/references-renderer.js';
import { BOOK, ARTICLE, THREE } from './references-fixtures.js';

suite('references-renderer: formatAuthorYear()', () => {
  test('single corporate author', () => {
    assertEqual(formatAuthorYear(BOOK), 'AIAG 2010', 'one author');
  });

  test('two authors joined with &', () => {
    assertEqual(formatAuthorYear(ARTICLE), 'Wheeler & Chambers 1992', 'two authors');
  });

  test('three or more authors collapse to "u. a." without an explicit t', () => {
    assertEqual(formatAuthorYear(THREE), 'Montgomery u. a. 2011', 'three authors');
  });

  test('three or more authors collapse to the localized "et al." with an English t', () => {
    const tEn = (k) => ({ 'moduleHelp.referenceEtAl': 'et al.' })[k] ?? k;
    assertEqual(formatAuthorYear(THREE, tEn), 'Montgomery et al. 2011', 'three authors, English');
  });

  test('no author falls back to the title', () => {
    assertEqual(formatAuthorYear({ title: 'ISO 22514-7', issued: { 'date-parts': [[2021]] } }),
      'ISO 22514-7 2021', 'title fallback');
  });

  test('no year omits the year', () => {
    assertEqual(formatAuthorYear({ author: [{ family: 'AIAG' }], title: 'X' }), 'AIAG', 'no year');
  });
});
