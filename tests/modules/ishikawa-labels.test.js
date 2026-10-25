/**
 * D.Mike — Ishikawa labels (ishikawa-labels.test.js)
 * Spec: docs/superpowers/specs/2026-10-25-ishikawa-agent-release-design.md (E2)
 */
import { suite, test, assertEqual } from '../test-utils.js';
import { State } from '../../js/modules/ishikawa/ishikawa-model.js';
import { CATS } from '../../js/modules/ishikawa/ishikawa-constants.js';
import { catLabel, catColor } from '../../js/modules/ishikawa/ishikawa-labels.js';

const t = (key) => `T:${key}`;

suite('ishikawa-labels', () => {
  test('catLabel prefers the trimmed custom label', () => {
    const model = new State();
    model.catLabels = { man: '  Personal ' };
    assertEqual(catLabel(model, 'man', t), 'Personal');
  });

  test('catLabel falls back to the translation for a missing or blank label', () => {
    const model = new State();
    model.catLabels = { machine: '   ' };
    assertEqual(catLabel(model, 'machine', t), 'T:cat.machine');
    assertEqual(catLabel(model, 'method', t), 'T:cat.method');
  });

  test('catColor returns the 6M colour, a neutral border for none or unknown', () => {
    assertEqual(catColor('man'), CATS[0].color);
    assertEqual(catColor(''), 'var(--color-border-secondary)');
    assertEqual(catColor('bogus'), 'var(--color-border-secondary)');
  });
});
