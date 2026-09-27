/**
 * DoE design model terms — designModelTerms (doe-terms.js) and
 * estimableTerms (regression-engine.js).
 */

import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { designModelTerms } from '../../js/engines/doe-terms.js';
import { estimableTerms } from '../../js/engines/regression-engine.js';

const FULL_2x2 = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
const CCD_2 = [
  [-1, -1], [1, -1], [-1, 1], [1, 1],
  [-1.414, 0], [1.414, 0], [0, -1.414], [0, 1.414],
  [0, 0], [0, 0], [0, 0], [0, 0], [0, 0],
];

suite('designModelTerms', () => {
  test('2-level full factorial: mains + 2FI, no quadratics', () => {
    assertDeepEqual(designModelTerms(FULL_2x2), ['M0', 'M1', 'I0_1']);
  });

  test('CCD: quadratics for continuous factors with ≥3 levels', () => {
    assertDeepEqual(designModelTerms(CCD_2), ['M0', 'M1', 'Q0', 'Q1', 'I0_1']);
  });

  test('categorical factor gets no quadratic', () => {
    const m = [[-1, -1], [0, -1], [1, -1], [-1, 1], [0, 1], [1, 1]];
    assertDeepEqual(designModelTerms(m, { categoricalFlags: [false, true] }), ['M0', 'M1', 'Q0', 'I0_1']);
    assertDeepEqual(designModelTerms(m, { categoricalFlags: [true, false] }), ['M0', 'M1', 'I0_1']);
  });

  test('3 factors: all pairs, sorted', () => {
    const m = [[-1, -1, -1], [1, 1, 1]];
    assertDeepEqual(designModelTerms(m), ['M0', 'M1', 'M2', 'I0_1', 'I0_2', 'I1_2']);
  });

  test('optimal: activeTerms passed through, sorted', () => {
    assertDeepEqual(
      designModelTerms(FULL_2x2, { activeTerms: ['I0_1', 'Q1', 'M1', 'M0'] }),
      ['M0', 'M1', 'Q1', 'I0_1'],
    );
  });

  test('level tolerance 1e-9 merges near-identical values', () => {
    const m = [[-1], [1], [1 + 1e-12], [-1 - 1e-12]];
    assertDeepEqual(designModelTerms(m), ['M0']);
  });
});

const col = (m, f) => m.map(f);
const ones = (m) => m.map(() => 1);

suite('estimableTerms', () => {
  test('independent columns are all kept', () => {
    const blocks = [
      { id: 'Intercept', columns: [ones(FULL_2x2)] },
      { id: 'M0', columns: [col(FULL_2x2, r => r[0])] },
      { id: 'M1', columns: [col(FULL_2x2, r => r[1])] },
      { id: 'I0_1', columns: [col(FULL_2x2, r => r[0] * r[1])] },
    ];
    const res = estimableTerms(blocks, 4);
    assertDeepEqual(res.kept, ['Intercept', 'M0', 'M1', 'I0_1']);
    assertDeepEqual(res.aliased, []);
  });

  test('x² at two coded levels is aliased with the intercept', () => {
    const blocks = [
      { id: 'Intercept', columns: [ones(FULL_2x2)] },
      { id: 'M0', columns: [col(FULL_2x2, r => r[0])] },
      { id: 'Q0', columns: [col(FULL_2x2, r => r[0] * r[0])] },
    ];
    const res = estimableTerms(blocks, 4);
    assertDeepEqual(res.kept, ['Intercept', 'M0']);
    assertDeepEqual(res.aliased, [{ id: 'Q0', with: ['Intercept'] }]);
  });

  test('uncoded x² at two levels is aliased with intercept and x', () => {
    const x = [3, 3, 4, 4];
    const res = estimableTerms([
      { id: 'Intercept', columns: [[1, 1, 1, 1]] },
      { id: 'x', columns: [x] },
      { id: 'x²', columns: [x.map(v => v * v)] },
    ], 4);
    assertDeepEqual(res.aliased, [{ id: 'x²', with: ['Intercept', 'x'] }]);
  });

  test('2^(4-1) Res IV: second 2FI of each alias pair is rejected', () => {
    // D = ABC
    const m = [];
    for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) m.push([a, b, c, a * b * c]);
    const ix = (i, j) => ({ id: `I${i}_${j}`, columns: [m.map(r => r[i] * r[j])] });
    const blocks = [
      { id: 'Intercept', columns: [ones(m)] },
      ...[0, 1, 2, 3].map(i => ({ id: `M${i}`, columns: [m.map(r => r[i])] })),
      ix(0, 1), ix(0, 2), ix(0, 3), ix(1, 2), ix(1, 3), ix(2, 3),
    ];
    const res = estimableTerms(blocks, 8);
    assertDeepEqual(res.kept, ['Intercept', 'M0', 'M1', 'M2', 'M3', 'I0_1', 'I0_2', 'I0_3']);
    assertDeepEqual(res.aliased, [
      { id: 'I1_2', with: ['I0_3'] },
      { id: 'I1_3', with: ['I0_2'] },
      { id: 'I2_3', with: ['I0_1'] },
    ]);
  });

  test('2^2 with center points: second quadratic aliased with the first', () => {
    const m = [...FULL_2x2, [0, 0], [0, 0], [0, 0]];
    const res = estimableTerms([
      { id: 'Intercept', columns: [ones(m)] },
      { id: 'M0', columns: [m.map(r => r[0])] },
      { id: 'M1', columns: [m.map(r => r[1])] },
      { id: 'Q0', columns: [m.map(r => r[0] * r[0])] },
      { id: 'Q1', columns: [m.map(r => r[1] * r[1])] },
    ], 7);
    assertDeepEqual(res.kept, ['Intercept', 'M0', 'M1', 'Q0']);
    assertEqual(res.aliased[0].id, 'Q1');
    assertEqual(res.aliased[0].with.includes('Q0'), true);
  });

  test('multi-column block is kept or rejected as a whole', () => {
    // 3-level categorical, effect coded: two indicator columns.
    const lv = ['a', 'b', 'c', 'a', 'b', 'c'];
    const i1 = lv.map(v => v === 'b' ? 1 : v === 'a' ? -1 : 0);
    const i2 = lv.map(v => v === 'c' ? 1 : v === 'a' ? -1 : 0);
    const res = estimableTerms([
      { id: 'Intercept', columns: [ones(lv)] },
      { id: 'G', columns: [i1, i2] },
      { id: 'Gdup', columns: [i1, [1, 2, 3, 4, 5, 6]] },
    ], 6);
    assertDeepEqual(res.kept, ['Intercept', 'G']);
    assertDeepEqual(res.aliased, [{ id: 'Gdup', with: ['G'] }]);
  });

  test('more blocks than rows: surplus rejected', () => {
    const res = estimableTerms([
      { id: 'Intercept', columns: [[1, 1]] },
      { id: 'a', columns: [[0, 1]] },
      { id: 'b', columns: [[1, 5]] },
    ], 2);
    assertDeepEqual(res.kept, ['Intercept', 'a']);
    assertDeepEqual(res.aliased, [{ id: 'b', with: ['Intercept', 'a'] }]);
  });

  test('all-zero column is aliased with nothing', () => {
    const res = estimableTerms([
      { id: 'Intercept', columns: [[1, 1, 1]] },
      { id: 'z', columns: [[0, 0, 0]] },
    ], 3);
    assertDeepEqual(res.aliased, [{ id: 'z', with: [] }]);
  });
});
