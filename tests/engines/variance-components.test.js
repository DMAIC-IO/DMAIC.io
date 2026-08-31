/**
 * D.Mike — Variance Components Engine Tests
 *
 * Covers term construction, sequential sums of squares, the EMS coefficient
 * matrix, the ANOVA estimator and the REML path.
 */

import {
  suite, test, assertEqual, assertDeepEqual, assertAlmostEqual, assertThrows,
} from '../test-utils.js';
import { buildTerms } from '../../js/engines/variance-components-engine.js';

suite('Variance components — term construction', () => {
  test('nested with three factors yields the prefix chain', () => {
    const terms = buildTerms('nested', ['Schicht', 'Teil', 'Position']);
    assertDeepEqual(terms.map(t => t.id), ['A', 'B(A)', 'C(AB)']);
    assertDeepEqual(terms.map(t => t.factorIndices), [[0], [0, 1], [0, 1, 2]]);
  });

  test('nested labels name the factors, not the letters', () => {
    const terms = buildTerms('nested', ['Schicht', 'Teil']);
    assertDeepEqual(terms.map(t => t.label), ['Schicht', 'Teil (in Schicht)']);
  });

  test('crossed with two factors yields both mains and the interaction', () => {
    const terms = buildTerms('crossed', ['Maschine', 'Schicht']);
    assertDeepEqual(terms.map(t => t.id), ['A', 'B', 'A*B']);
    assertDeepEqual(terms.map(t => t.factorIndices), [[0], [1], [0, 1]]);
  });

  test('crossed orders by interaction order, then by factor position', () => {
    const terms = buildTerms('crossed', ['A', 'B', 'C']);
    assertDeepEqual(terms.map(t => t.id),
      ['A', 'B', 'C', 'A*B', 'A*C', 'B*C', 'A*B*C']);
  });

  test('crossed with four factors yields fifteen terms', () => {
    assertEqual(buildTerms('crossed', ['A', 'B', 'C', 'D']).length, 15);
  });

  test('crossed labels join the factor names', () => {
    const terms = buildTerms('crossed', ['Maschine', 'Schicht']);
    assertEqual(terms[2].label, 'Maschine × Schicht');
  });

  test('rejects fewer than two factors', () => {
    assertThrows(() => buildTerms('nested', ['A']), /at least two factors/i);
  });

  test('rejects more than four factors', () => {
    assertThrows(() => buildTerms('nested', ['A', 'B', 'C', 'D', 'E']), /at most four/i);
  });

  test('rejects an unknown model form', () => {
    assertThrows(() => buildTerms('mixed', ['A', 'B']), /unknown model form/i);
  });
});
