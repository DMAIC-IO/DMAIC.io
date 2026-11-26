/**
 * Tests for core/interaction/announce.js — eine aria-live-Region je
 * Dokument und der Bedienhinweis.
 */
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import { announce, instructionsId } from '../../../js/core/interaction/announce.js';

const regions = () => document.querySelectorAll('#dmike-live-region');

suite('interaction/announce', () => {
  test('eine Region je Dokument, polite', () => {
    announce(document, 'eins');
    announce(document, 'zwei');
    assertEqual(regions().length, 1);
    const r = regions()[0];
    assertEqual(r.getAttribute('aria-live'), 'polite');
    assertEqual(r.textContent, 'zwei');
    assertTrue(r.classList.contains('dmike-sr-only'));
  });

  test('Bedienhinweis: ein Element, Text aktualisiert', () => {
    const id = instructionsId(document, 'Hinweis A');
    assertEqual(id, 'dmike-gesture-instructions');
    instructionsId(document, 'Hinweis B');
    const els = document.querySelectorAll('#dmike-gesture-instructions');
    assertEqual(els.length, 1);
    assertEqual(els[0].textContent, 'Hinweis B');
    assertTrue(els[0].classList.contains('dmike-sr-only'));
  });
});
