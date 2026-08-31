/**
 * D.Mike — Variance Components Engine Tests
 *
 * Covers term construction, sequential sums of squares, the EMS coefficient
 * matrix, the ANOVA estimator and the REML path.
 */

import {
  suite, test, assertEqual, assertDeepEqual, assertAlmostEqual, assertThrows,
} from '../test-utils.js';
import {
  buildTerms, termCells, KEY_SEP, appendBlock, projectSquares,
} from '../../js/engines/variance-components-engine.js';

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

suite('Variance components — cells and indicator columns', () => {
  const A = ['1', '1', '1', '1', '2', '2', '2', '2'];
  const B = ['1', '1', '2', '2', '1', '1', '2', '2'];

  test('a single-factor term keys rows by that factor', () => {
    const r = termCells([0], [A, B]);
    assertDeepEqual(r.cells, ['1', '2']);
    assertDeepEqual(r.keys, ['1', '1', '1', '1', '2', '2', '2', '2']);
  });

  test('a two-factor term keys rows by the level pair', () => {
    const r = termCells([0, 1], [A, B]);
    assertEqual(r.cells.length, 4);
    assertEqual(r.keys[0], `1${KEY_SEP}1`);
    assertEqual(r.keys[6], `2${KEY_SEP}2`);
  });

  test('produces one 0/1 indicator column per cell', () => {
    const r = termCells([0], [A, B]);
    assertEqual(r.columns.length, 2);
    assertDeepEqual([...r.columns[0]], [1, 1, 1, 1, 0, 0, 0, 0]);
    assertDeepEqual([...r.columns[1]], [0, 0, 0, 0, 1, 1, 1, 1]);
  });

  test('a level label cannot forge a key boundary', () => {
    // 'ab' as one level must not collide with the pair ('a','b').
    const r = termCells([0, 1], [['ab'], ['c']]);
    assertEqual(r.cells[0], `ab${KEY_SEP}c`);
  });
});

suite('Variance components — orthonormal basis', () => {
  test('independent columns each raise the rank by one', () => {
    const basis = [];
    const added = appendBlock(basis, [
      Float64Array.from([1, 1, 1, 1]),
      Float64Array.from([1, 1, 0, 0]),
    ]);
    assertEqual(added, 2);
    assertEqual(basis.length, 2);
  });

  test('a dependent column raises the rank by nothing', () => {
    const basis = [];
    appendBlock(basis, [Float64Array.from([1, 1, 0, 0])]);
    const added = appendBlock(basis, [Float64Array.from([2, 2, 0, 0])]);
    assertEqual(added, 0);
    assertEqual(basis.length, 1);
  });

  test('an indicator block adds only what the intercept does not already span', () => {
    const basis = [];
    appendBlock(basis, [Float64Array.from([1, 1, 1, 1])]);   // intercept
    const { columns } = termCells([0], [['1', '1', '2', '2']]);
    // Two cells, but their sum is the intercept → rank rises by 1, not 2.
    assertEqual(appendBlock(basis, columns), 1);
  });

  test('basis vectors are orthonormal', () => {
    const basis = [];
    appendBlock(basis, [
      Float64Array.from([1, 1, 1, 1]),
      Float64Array.from([1, 1, 0, 0]),
      Float64Array.from([1, 0, 0, 0]),
    ]);
    for (let i = 0; i < basis.length; i++) {
      for (let j = 0; j < basis.length; j++) {
        let dot = 0;
        for (let r = 0; r < 4; r++) dot += basis[i][r] * basis[j][r];
        assertAlmostEqual(dot, i === j ? 1 : 0, 1e-12);
      }
    }
  });

  test('projectSquares over the whole basis equals the squared norm of a spanned vector', () => {
    const basis = [];
    appendBlock(basis, [
      Float64Array.from([1, 1, 1, 1]),
      Float64Array.from([1, 1, 0, 0]),
    ]);
    const v = Float64Array.from([3, 3, 5, 5]);   // lies in the span
    let sq = 0;
    for (const x of v) sq += x * x;
    assertAlmostEqual(projectSquares(basis, 0, basis.length, v), sq, 1e-10);
  });

  test('projectSquares over a slice sees only those basis vectors', () => {
    const basis = [];
    appendBlock(basis, [Float64Array.from([1, 1, 1, 1])]);
    const v = Float64Array.from([1, 1, 1, 1]);
    assertAlmostEqual(projectSquares(basis, 0, 1, v), 4, 1e-12);
    assertAlmostEqual(projectSquares(basis, 1, 1, v), 0, 1e-12);
  });
});
