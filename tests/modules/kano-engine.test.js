/**
 * D.Mike — Kano Engine Tests (kano-engine.test.js)
 * Unit-Tests für classify, aggregate und evaluate.
 * Spec: docs/superpowers/specs/2026-07-25-kano-modul-design.md
 */

import { suite, test, assertEqual, assertAlmostEqual, assertDeepEqual } from '../test-utils.js';
import { classify, aggregate, evaluate } from '../../js/engines/kano-engine.js';
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

const ITEMS = [
  { id: 'i1', label: 'Schnelle Lieferung', path: 'VoC 1', missing: false },
  { id: 'i2', label: 'Transparente Preise', path: 'VoC 1', missing: false },
  { id: 'i3', label: 'Persönlicher Kontakt', path: 'VoC 1', missing: false },
];
const RESP = [{ id: 'r1', name: 'Kunde A' }, { id: 'r2', name: 'Kunde B' }];

suite('kano-engine — evaluate', () => {
  test('eine Zeile je Item, Labels durchgereicht', () => {
    const res = evaluate(ITEMS, RESP, {}, OPTS);
    assertEqual(res.rows.length, 3);
    assertEqual(res.rows.every(r => r.category === null), true);
  });

  test('Sortierung: Kategorierang, dann Wichtigkeit, dann CS', () => {
    const answers = {
      r1: {
        i1: { f: 3, d: 3, w: 5 },   // I
        i2: { f: 2, d: 5, w: 5 },   // M
        i3: { f: 1, d: 3, w: 5 },   // A
      },
      r2: {
        i1: { f: 3, d: 3, w: 5 },
        i2: { f: 2, d: 5, w: 5 },
        i3: { f: 1, d: 3, w: 5 },
      },
    };
    const res = evaluate(ITEMS, RESP, answers, OPTS);
    assertDeepEqual(res.rows.map(r => r.itemId), ['i2', 'i3', 'i1']); // M, A, I
  });

  test('bei gleicher Kategorie entscheidet die höhere Wichtigkeit', () => {
    const items = [
      { id: 'a', label: 'A', path: '', missing: false },
      { id: 'b', label: 'B', path: '', missing: false },
    ];
    const answers = { r1: { a: { f: 2, d: 5, w: 3 }, b: { f: 2, d: 5, w: 8 } } };
    const res = evaluate(items, [RESP[0]], answers, OPTS);
    assertDeepEqual(res.rows.map(r => r.itemId), ['b', 'a']);
  });

  test('totals: Vollständigkeit und Q-Anteil', () => {
    const answers = {
      r1: { i1: { f: 1, d: 5, w: null }, i2: { f: 1, d: 1, w: null } },  // O, Q
      r2: { i1: { f: 1, d: 5, w: null } },                                // O
    };
    const res = evaluate(ITEMS, RESP, answers, OPTS);
    assertEqual(res.totals.items, 3);
    assertEqual(res.totals.respondents, 2);
    assertAlmostEqual(res.totals.completeness, 3 / 6, 1e-12);
    assertAlmostEqual(res.totals.qShare, 1 / 3, 1e-12);
  });

  test('ohne Befragte: completeness 0 statt NaN', () => {
    const res = evaluate(ITEMS, [], {}, OPTS);
    assertEqual(res.totals.completeness, 0);
    assertEqual(res.totals.qShare, 0);
  });

  test('fehlende Antwortobjekte werden wie unbeantwortet behandelt', () => {
    const res = evaluate(ITEMS, RESP, { r1: null }, OPTS);
    assertEqual(res.rows[0].n, 0);
  });
});
