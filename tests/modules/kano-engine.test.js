/**
 * D.Mike — Kano Engine Tests (kano-engine.test.js)
 * Unit-Tests für classify.
 * Spec: docs/superpowers/specs/2026-07-25-kano-modul-design.md
 */

import { suite, test, assertEqual, assertAlmostEqual, assertDeepEqual } from '../test-utils.js';
import { classify, aggregate } from '../../js/engines/kano-engine.js';
import fixtures from '../fixtures/kano/classification.json' with { type: 'json' };
import aggFixtures from '../fixtures/kano/aggregation.json' with { type: 'json' };

suite('kano-engine — classify', () => {
  for (const c of fixtures.test_cases) {
    test(`${c.id} → ${c.expected}`, () => {
      assertEqual(classify(c.inputs.f, c.inputs.d), c.expected);
    });
  }

  test('fehlende funktionale Antwort → null', () => {
    assertEqual(classify(null, 5), null);
  });

  test('fehlende dysfunktionale Antwort → null', () => {
    assertEqual(classify(1, null), null);
  });

  test('Wert außerhalb der Skala → null', () => {
    assertEqual(classify(0, 3), null);
    assertEqual(classify(3, 6), null);
  });
});

const OPTS = { importance: true };

suite('kano-engine — aggregate', () => {
  for (const c of aggFixtures.test_cases) {
    test(c.id, () => {
      const r = aggregate(c.inputs.answers, OPTS);
      assertEqual(r.category, c.expected.category, `category (${c.description})`);
      assertEqual(r.tie, c.expected.tie, 'tie');
      assertEqual(r.n, c.expected.n, 'n');
      if (c.expected.unanswered !== undefined) {
        assertEqual(r.unanswered, c.expected.unanswered, 'unanswered');
      }
      if (c.expected.cs === null) assertEqual(r.cs, null, 'cs');
      else assertAlmostEqual(r.cs, c.expected.cs, 1e-12, 'cs');
      if (c.expected.ds === null) assertEqual(r.ds, null, 'ds');
      else assertAlmostEqual(r.ds, c.expected.ds, 1e-12, 'ds');
    });
  }

  test('Häufigkeiten zählen alle sechs Kategorien', () => {
    const r = aggregate([
      { f: 2, d: 5, w: null }, // M
      { f: 1, d: 5, w: null }, // O
      { f: 1, d: 3, w: null }, // A
      { f: 3, d: 3, w: null }, // I
      { f: 5, d: 1, w: null }, // R
      { f: 1, d: 1, w: null }, // Q
    ], OPTS);
    assertDeepEqual(r.counts, { M: 1, O: 1, A: 1, I: 1, R: 1, Q: 1 });
  });

  test('Wichtigkeit: Mittelwert über vorhandene Werte, Lücken zählen nicht', () => {
    const r = aggregate([
      { f: 1, d: 5, w: 9 }, { f: 1, d: 5, w: 5 }, { f: 1, d: 5, w: null },
    ], OPTS);
    assertAlmostEqual(r.importanceMean, 7, 1e-12);
    assertEqual(r.importanceN, 2);
  });

  test('Wichtigkeit zählt auch ohne vollständiges Antwortpaar', () => {
    const r = aggregate([{ f: null, d: null, w: 4 }], OPTS);
    assertEqual(r.n, 0);
    assertAlmostEqual(r.importanceMean, 4, 1e-12);
  });

  test('deaktivierte dritte Frage ignoriert w vollständig', () => {
    const r = aggregate([{ f: 1, d: 5, w: 9 }], { importance: false });
    assertEqual(r.importanceMean, null);
    assertEqual(r.importanceN, 0);
  });

  test('ohne Wichtigkeitsangaben ist importanceMean null, nicht NaN', () => {
    const r = aggregate([{ f: 1, d: 5, w: null }], OPTS);
    assertEqual(r.importanceMean, null);
  });
});
