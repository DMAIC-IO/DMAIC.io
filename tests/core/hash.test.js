/**
 * Tests for js/core/hash.js — cyrb53, der Inhaltshash der Revisionen
 * (Agentenfläche contract 2, Lesen vor Schreiben).
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { cyrb53 } from '../../js/core/hash.js';

suite('cyrb53', () => {
  test('feste Referenzwerte', () => {
    assertEqual(cyrb53(''), 3338908027751811);
    assertEqual(cyrb53('a'), 7929297801672961);
    assertEqual(cyrb53('revision'), 5125886013627601);
    assertEqual(cyrb53('revision', 1), 6223586805714048);
  });

  test('deterministisch: gleiche Eingabe, gleicher Wert', () => {
    assertEqual(cyrb53('{"x":1}'), cyrb53('{"x":1}'));
  });

  test('verschiedene Eingaben ergeben verschiedene Werte', () => {
    assertTrue(cyrb53('{"x":1}') !== cyrb53('{"x":2}'));
  });

  test('ein ganzzahliger, nicht negativer Wert unterhalb von 2^53', () => {
    const h = cyrb53('beliebiger Inhalt');
    assertTrue(Number.isSafeInteger(h) && h >= 0, String(h));
  });
});
