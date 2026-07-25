/**
 * D.Mike — Kano Engine Tests (kano-engine.test.js)
 * Unit-Tests für classify/aggregate/evaluate.
 * Spec: docs/superpowers/specs/2026-07-25-kano-modul-design.md
 */

import { suite, test, assertEqual } from '../test-utils.js';
import { classify } from '../../js/engines/kano-engine.js';
import fixtures from '../fixtures/kano/classification.json' with { type: 'json' };

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

  test('Wert ausserhalb der Skala → null', () => {
    assertEqual(classify(0, 3), null);
    assertEqual(classify(3, 6), null);
  });
});
