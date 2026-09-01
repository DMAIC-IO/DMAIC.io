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
  buildTerms, termCells, KEY_SEP, appendBlock, projectSquares, anovaTable,
  emsMatrix, anovaComponents, remlWorkspace, remlP, emStep,
  remlComponents, REML_MAX_ITER, REML_MAX_ROWS, computeVarianceComponents,
  expectedCellCount,
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

/**
 * Balanced nested design, hand-computed:
 *   A=1,B=1: 10,12 -> cell mean 11    A=1,B=2: 14,16 -> 15
 *   A=2,B=1: 20,22 -> 21              A=2,B=2: 24,26 -> 25
 *   A means 13 / 23, grand mean 18
 *   SS_A    = 4(13-18)^2 + 4(23-18)^2 = 200,  df 1
 *   SS_B(A) = 2(11-13)^2 + 2(15-13)^2 + 2(21-23)^2 + 2(25-23)^2 = 32,  df 2
 *   SS_e    = 8 x 1 = 8,  df 4
 *   Corrected total = 240 = 200 + 32 + 8
 */
const NESTED_BALANCED = {
  response: [10, 12, 14, 16, 20, 22, 24, 26],
  factorValues: [
    ['1', '1', '1', '1', '2', '2', '2', '2'],
    ['1', '1', '2', '2', '1', '1', '2', '2'],
  ],
};

/**
 * Balanced crossed design, hand-computed:
 *   cell means 10 / 30 / 50 / 90, replicates +/-1
 *   SS_A = 5000 (df 1), SS_B = 1800 (df 1), SS_AB = 200 (df 1), SS_e = 8 (df 4)
 */
const CROSSED_BALANCED = {
  response: [9, 11, 29, 31, 49, 51, 89, 91],
  factorValues: [
    ['1', '1', '1', '1', '2', '2', '2', '2'],
    ['1', '1', '2', '2', '1', '1', '2', '2'],
  ],
};

/**
 * Nested design whose B means coincide inside every A level, so MS_B(A) = 0
 * while MS_e = 26 — the estimator must produce a NEGATIVE component here.
 */
const NESTED_NEGATIVE = {
  response: [10, 20, 14, 16, 30, 40, 34, 36],
  factorValues: [
    ['1', '1', '1', '1', '2', '2', '2', '2'],
    ['1', '1', '2', '2', '1', '1', '2', '2'],
  ],
};

suite('Variance components — ANOVA table', () => {
  test('reproduces the hand-computed nested sums of squares', () => {
    const terms = buildTerms('nested', ['A', 'B']);
    const t = anovaTable({ ...NESTED_BALANCED, terms });
    assertAlmostEqual(t.rows[0].ss, 200, 1e-9);
    assertEqual(t.rows[0].df, 1);
    assertAlmostEqual(t.rows[1].ss, 32, 1e-9);
    assertEqual(t.rows[1].df, 2);
    assertAlmostEqual(t.error.ss, 8, 1e-9);
    assertEqual(t.error.df, 4);
  });

  test('mean squares are ss / df', () => {
    const terms = buildTerms('nested', ['A', 'B']);
    const t = anovaTable({ ...NESTED_BALANCED, terms });
    assertAlmostEqual(t.rows[0].ms, 200, 1e-9);
    assertAlmostEqual(t.rows[1].ms, 16, 1e-9);
    assertAlmostEqual(t.error.ms, 2, 1e-9);
  });

  test('sequential sums of squares add up to the corrected total', () => {
    const terms = buildTerms('nested', ['A', 'B']);
    const t = anovaTable({ ...NESTED_BALANCED, terms });
    const sum = t.rows.reduce((a, r) => a + r.ss, 0) + t.error.ss;
    assertAlmostEqual(sum, 240, 1e-9);
  });

  test('crossed design splits main effects and interaction', () => {
    const terms = buildTerms('crossed', ['A', 'B']);
    const t = anovaTable({ ...CROSSED_BALANCED, terms });
    assertAlmostEqual(t.rows[0].ss, 5000, 1e-9);
    assertAlmostEqual(t.rows[1].ss, 1800, 1e-9);
    assertAlmostEqual(t.rows[2].ss, 200, 1e-9);
    assertAlmostEqual(t.error.ss, 8, 1e-9);
  });

  test('a design without replicates leaves the error with zero df', () => {
    const terms = buildTerms('crossed', ['A', 'B']);
    const t = anovaTable({
      response: [1, 2, 3, 5],
      factorValues: [['1', '1', '2', '2'], ['1', '2', '1', '2']],
      terms,
    });
    assertEqual(t.error.df, 0);
  });
});

suite('Variance components — EMS matrix and ANOVA estimator', () => {
  test('balanced nested EMS coefficients match the textbook values', () => {
    // For a levels of A, b levels of B within A, n replicates:
    //   E[MS_A]    = var_e + n*var_B + b*n*var_A  -> coefficients (4, 2, 1)
    //   E[MS_B(A)] = var_e + n*var_B              -> coefficients (0, 2, 1)
    //   E[MS_e]    = var_e                        -> coefficients (0, 0, 1)
    const terms = buildTerms('nested', ['A', 'B']);
    const C = emsMatrix(anovaTable({ ...NESTED_BALANCED, terms }));
    assertAlmostEqual(C[0][0], 4, 1e-9);
    assertAlmostEqual(C[0][1], 2, 1e-9);
    assertAlmostEqual(C[0][2], 1, 1e-9);
    assertAlmostEqual(C[1][0], 0, 1e-9);
    assertAlmostEqual(C[1][1], 2, 1e-9);
    assertAlmostEqual(C[1][2], 1, 1e-9);
    assertAlmostEqual(C[2][0], 0, 1e-9);
    assertAlmostEqual(C[2][1], 0, 1e-9);
    assertAlmostEqual(C[2][2], 1, 1e-9);
  });

  test('balanced nested components match the hand computation', () => {
    // var_e = MS_e = 2;  var_B = (16-2)/2 = 7;  var_A = (200-16)/4 = 46
    const terms = buildTerms('nested', ['A', 'B']);
    const { variances, clamped } = anovaComponents(anovaTable({ ...NESTED_BALANCED, terms }));
    assertAlmostEqual(variances[0], 46, 1e-8);
    assertAlmostEqual(variances[1], 7, 1e-8);
    assertAlmostEqual(variances[2], 2, 1e-8);
    assertDeepEqual(clamped, [false, false, false]);
  });

  test('balanced crossed components match the hand computation', () => {
    // MS_A 5000, MS_B 1800, MS_AB 200, MS_e 2  (a=b=2, n=2)
    //   var_e = 2;  var_AB = (200-2)/2 = 99
    //   var_A = (5000-200)/4 = 1200;  var_B = (1800-200)/4 = 400
    const terms = buildTerms('crossed', ['A', 'B']);
    const { variances } = anovaComponents(anovaTable({ ...CROSSED_BALANCED, terms }));
    assertAlmostEqual(variances[0], 1200, 1e-7);
    assertAlmostEqual(variances[1], 400, 1e-7);
    assertAlmostEqual(variances[2], 99, 1e-7);
    assertAlmostEqual(variances[3], 2, 1e-8);
  });

  test('a negative component is clamped to zero and flagged', () => {
    // MS_B(A) = 0 < MS_e = 26 -> var_B = (0-26)/2 = -13 -> clamped
    // var_A stays (800-0)/4 = 200, computed from the RAW mean squares
    const terms = buildTerms('nested', ['A', 'B']);
    const { variances, clamped } = anovaComponents(anovaTable({ ...NESTED_NEGATIVE, terms }));
    assertAlmostEqual(variances[0], 200, 1e-7);
    assertEqual(variances[1], 0);
    assertAlmostEqual(variances[2], 26, 1e-8);
    assertDeepEqual(clamped, [false, true, false]);
  });
});

suite('Variance components — REML building blocks', () => {
  test('workspace exposes one indicator block per term plus the response', () => {
    const terms = buildTerms('nested', ['A', 'B']);
    const ws = remlWorkspace({ ...NESTED_BALANCED, terms });
    assertEqual(ws.n, 8);
    assertEqual(ws.Z.length, 2);
    assertDeepEqual(ws.q, [2, 4]);
  });

  test('P annihilates the intercept', () => {
    const terms = buildTerms('nested', ['A', 'B']);
    const ws = remlWorkspace({ ...NESTED_BALANCED, terms });
    const { P } = remlP(ws, [1, 1, 1]);
    // P times the all-ones vector is zero: the fixed part is projected out.
    for (let i = 0; i < ws.n; i++) {
      let s = 0;
      for (let j = 0; j < ws.n; j++) s += P[i][j];
      assertAlmostEqual(s, 0, 1e-9);
    }
  });

  test('an EM step keeps every component non-negative', () => {
    const terms = buildTerms('nested', ['A', 'B']);
    const ws = remlWorkspace({ ...NESTED_BALANCED, terms });
    const next = emStep(ws, [46, 7, 2]);
    assertEqual(next.length, 3);
    for (const v of next) assertEqual(v >= 0, true);
  });

  test('an EM step started at the ANOVA solution stays in its neighbourhood', () => {
    // The balanced nested design has a solution both methods share, so EM must
    // not run away from it.
    const terms = buildTerms('nested', ['A', 'B']);
    const ws = remlWorkspace({ ...NESTED_BALANCED, terms });
    const next = emStep(ws, [46, 7, 2]);
    assertAlmostEqual(next[2], 2, 0.5);
  });
});

suite('Variance components — REML estimator', () => {
  test('balanced designs give the same answer as ANOVA', () => {
    // With balance the two methods coincide — the sharpest available check that
    // the REML loop converges to the right place.
    const terms = buildTerms('nested', ['A', 'B']);
    const anova = anovaComponents(anovaTable({ ...NESTED_BALANCED, terms }));
    const reml = remlComponents({ ...NESTED_BALANCED, terms });
    assertEqual(reml.converged, true);
    assertAlmostEqual(reml.variances[0], anova.variances[0], 1e-4);
    assertAlmostEqual(reml.variances[1], anova.variances[1], 1e-4);
    assertAlmostEqual(reml.variances[2], anova.variances[2], 1e-4);
  });

  test('converges well inside the iteration budget', () => {
    const terms = buildTerms('nested', ['A', 'B']);
    const reml = remlComponents({ ...NESTED_BALANCED, terms });
    assertEqual(reml.iterations < REML_MAX_ITER, true);
  });

  test('never returns a negative component', () => {
    const terms = buildTerms('nested', ['A', 'B']);
    const reml = remlComponents({ ...NESTED_NEGATIVE, terms });
    for (const v of reml.variances) assertEqual(v >= 0, true);
  });

  test('is deterministic — two runs agree exactly', () => {
    const terms = buildTerms('nested', ['A', 'B']);
    const a = remlComponents({ ...NESTED_BALANCED, terms });
    const b = remlComponents({ ...NESTED_BALANCED, terms });
    assertDeepEqual(a.variances, b.variances);
    assertEqual(a.iterations, b.iterations);
  });

  test('refuses to run beyond the row cap', () => {
    const n = REML_MAX_ROWS + 1;
    const terms = buildTerms('nested', ['A', 'B']);
    assertThrows(() => remlComponents({
      response: new Array(n).fill(0).map((_, i) => i % 7),
      factorValues: [
        new Array(n).fill(0).map((_, i) => String(i % 3)),
        new Array(n).fill(0).map((_, i) => String(i % 5)),
      ],
      terms,
    }), /row cap/i);
  });
});

suite('Variance components — public API', () => {
  test('returns one row per term plus the error row', () => {
    const r = computeVarianceComponents({
      ...NESTED_BALANCED, factorNames: ['Schicht', 'Teil'],
      modelForm: 'nested', estimator: 'anova',
    });
    assertDeepEqual(r.terms.map(t => t.id), ['A', 'B(A)', 'Error']);
  });

  test('percentages are normalised over the clamped variances and sum to 100', () => {
    const r = computeVarianceComponents({
      ...NESTED_BALANCED, factorNames: ['A', 'B'],
      modelForm: 'nested', estimator: 'anova',
    });
    // variances 46 / 7 / 2, total 55
    assertAlmostEqual(r.totalVariance, 55, 1e-8);
    assertAlmostEqual(r.terms[0].percent, 46 / 55 * 100, 1e-6);
    assertAlmostEqual(r.terms.reduce((a, t) => a + t.percent, 0), 100, 1e-6);
  });

  test('standard deviation is the square root of the variance', () => {
    const r = computeVarianceComponents({
      ...NESTED_BALANCED, factorNames: ['A', 'B'],
      modelForm: 'nested', estimator: 'anova',
    });
    assertAlmostEqual(r.terms[2].sd, Math.SQRT2, 1e-9);
  });

  test('flags an unbalanced design', () => {
    const r = computeVarianceComponents({
      response: [1, 2, 3, 4, 5],
      factorValues: [['1', '1', '1', '2', '2'], ['1', '1', '2', '1', '2']],
      factorNames: ['A', 'B'], modelForm: 'nested', estimator: 'anova',
    });
    assertEqual(r.balanced, false);
    assertEqual(r.warnings.includes('unbalanced'), true);
  });

  test('reports a clamped component through a warning', () => {
    const r = computeVarianceComponents({
      ...NESTED_NEGATIVE, factorNames: ['A', 'B'],
      modelForm: 'nested', estimator: 'anova',
    });
    assertEqual(r.warnings.includes('negativeComponent'), true);
    assertEqual(r.terms[1].clamped, true);
  });

  test('without replicates the finest term becomes the error', () => {
    const r = computeVarianceComponents({
      response: [1, 2, 3, 5],
      factorValues: [['1', '1', '2', '2'], ['1', '2', '1', '2']],
      factorNames: ['A', 'B'], modelForm: 'crossed', estimator: 'anova',
    });
    assertEqual(r.warnings.includes('noReplicates'), true);
    assertEqual(r.terms.some(t => t.id === 'A*B'), false);
    assertEqual(r.terms[r.terms.length - 1].id, 'Error');
  });

  test('REML leaves the ANOVA-only columns empty', () => {
    const r = computeVarianceComponents({
      ...NESTED_BALANCED, factorNames: ['A', 'B'],
      modelForm: 'nested', estimator: 'reml',
    });
    assertEqual(r.terms[0].ss, null);
    assertEqual(r.terms[0].ms, null);
    assertEqual(r.terms[0].df, null);
    assertEqual(r.converged, true);
  });

  test('falls back to ANOVA above the REML row cap and says so', () => {
    const n = REML_MAX_ROWS + 1;
    const r = computeVarianceComponents({
      response: new Array(n).fill(0).map((_, i) => (i % 7) + (i % 3) * 0.5),
      factorValues: [
        new Array(n).fill(0).map((_, i) => String(i % 3)),
        new Array(n).fill(0).map((_, i) => String(i % 5)),
      ],
      factorNames: ['A', 'B'], modelForm: 'nested', estimator: 'reml',
    });
    assertEqual(r.estimator, 'anova');
    assertEqual(r.warnings.includes('rowCapExceeded'), true);
  });
});

// ── Gold-standard fixtures ────────────────────────────────────────────────
//
// Reference values from `tools/fixture-generator` in the site repo:
// sequential SS/df from cumulative statsmodels OLS fits, REML components from
// statsmodels MixedLM. Regenerate with
// `python3 generate_fixtures.py --algorithm variance-components`.

// Loaded at module level: the runner registers suites synchronously, so a
// fixture awaited inside the suite callback would arrive after the run.
const fixtureResp = await fetch(new URL(
  '../fixtures/variance/variance-components.fixtures.json', import.meta.url));
const fx = await fixtureResp.json();

suite('Variance components — gold-standard fixtures (ANOVA)', () => {
  const tol = fx.tolerances.default;
  for (const tc of fx.test_cases.filter(c => c.inputs.estimator !== 'reml')) {
    test(`${tc.id} — ${tc.description}`, () => {
      const terms = buildTerms(tc.inputs.modelForm, tc.inputs.factorNames);
      const table = anovaTable({
        response: tc.inputs.response,
        factorValues: tc.inputs.factorValues,
        terms,
      });
      const { variances } = anovaComponents(table);
      tc.expected.terms.forEach((exp, i) => {
        assertEqual(table.rows[i].df, exp.df);
        assertAlmostEqual(table.rows[i].ss, exp.ss,
          tol.absolute + Math.abs(exp.ss) * tol.relative);
        assertAlmostEqual(variances[i], exp.variance,
          tol.absolute + Math.abs(exp.variance) * tol.relative);
      });
      assertEqual(table.error.df, tc.expected.error.df);
      assertAlmostEqual(table.error.ss, tc.expected.error.ss,
        tol.absolute + Math.abs(tc.expected.error.ss) * tol.relative);
      assertAlmostEqual(variances[variances.length - 1], tc.expected.error.variance,
        tol.absolute + Math.abs(tc.expected.error.variance) * tol.relative);
    });
  }
});

suite('Variance components — gold-standard fixtures (REML)', () => {
  const tol = fx.tolerances.overrides.reml;
  for (const tc of fx.test_cases.filter(c => c.inputs.estimator === 'reml')) {
    test(`${tc.id} — ${tc.description}`, () => {
      const terms = buildTerms(tc.inputs.modelForm, tc.inputs.factorNames);
      const r = remlComponents({
        response: tc.inputs.response,
        factorValues: tc.inputs.factorValues,
        terms,
      });
      assertEqual(r.converged, true);
      [...tc.expected.terms.map(t => t.variance), tc.expected.error.variance]
        .forEach((expected, i) => {
          assertAlmostEqual(r.variances[i], expected,
            tol.absolute + Math.abs(expected) * tol.relative);
        });
    });
  }
});

// The two suites above drive `anovaTable`/`anovaComponents` and
// `remlComponents` directly — the internals. The suite below runs the same
// gold references through `computeVarianceComponents()`, the entry point the
// module and the Algorithm Lab actually call, so the assembly around the
// estimators (term ordering, the Error row, df/ss/ms passthrough, the
// percent column, the clamping and warning rules, the balance verdict) is
// pinned by reference values too and not only by hand-written expectations.
suite('Variance components — gold-standard fixtures through the public entry', () => {
  for (const tc of fx.test_cases) {
    const isReml = tc.inputs.estimator === 'reml';
    const tol = isReml ? fx.tolerances.overrides.reml : fx.tolerances.default;

    test(`${tc.id} — computeVarianceComponents()`, () => {
      const r = computeVarianceComponents({
        response: tc.inputs.response,
        factorValues: tc.inputs.factorValues,
        factorNames: tc.inputs.factorNames,
        modelForm: tc.inputs.modelForm,
        estimator: tc.inputs.estimator,
      });

      assertEqual(r.estimator, tc.inputs.estimator);
      assertEqual(r.n, tc.inputs.response.length);
      assertEqual(r.balanced, tc.id.includes('-balanced-'),
        `balance verdict for ${tc.id}`);
      if (isReml) assertEqual(r.converged, true, 'REML must converge');

      // The Error row is the last row; every fixture term must appear before
      // it, in the fixture's own order.
      assertDeepEqual(r.terms.map(t => t.id),
        [...tc.expected.terms.map(t => t.id), 'Error']);

      const expected = [...tc.expected.terms, tc.expected.error];
      expected.forEach((exp, i) => {
        const row = r.terms[i];
        assertAlmostEqual(row.variance, exp.variance,
          tol.absolute + Math.abs(exp.variance) * tol.relative,
          `${tc.id}: variance of ${row.id}`);
        // Only the ANOVA path carries an ANOVA table; REML reports null.
        if (isReml) {
          assertEqual(row.df, null, `${tc.id}: ${row.id} df must be null under REML`);
          assertEqual(row.ss, null, `${tc.id}: ${row.id} ss must be null under REML`);
        } else {
          assertEqual(row.df, exp.df, `${tc.id}: df of ${row.id}`);
          assertAlmostEqual(row.ss, exp.ss,
            tol.absolute + Math.abs(exp.ss) * tol.relative, `${tc.id}: ss of ${row.id}`);
        }
      });

      // The derived columns must agree with the variance column they come from.
      const total = r.terms.reduce((a, t) => a + t.variance, 0);
      assertAlmostEqual(r.totalVariance, total, 1e-12, 'totalVariance');
      const percentSum = r.terms.reduce((a, t) => a + t.percent, 0);
      assertAlmostEqual(percentSum, 100, 1e-9, 'percent column must sum to 100');
      r.terms.forEach((t) => {
        assertAlmostEqual(t.sd, Math.sqrt(t.variance), 1e-12, `sd of ${t.id}`);
      });
    });
  }

  test('the balanced crossed design gives the same answer either way', () => {
    const anovaCase = fx.test_cases.find(c => c.id === 'crossed-balanced-anova');
    const remlCase = fx.test_cases.find(c => c.id === 'crossed-balanced-reml');
    assertEqual(Boolean(anovaCase && remlCase), true, 'both balanced crossed fixtures present');
    assertDeepEqual(anovaCase.inputs.response, remlCase.inputs.response,
      'the two cases must run on identical data');

    const run = (tc) => computeVarianceComponents({
      response: tc.inputs.response,
      factorValues: tc.inputs.factorValues,
      factorNames: tc.inputs.factorNames,
      modelForm: tc.inputs.modelForm,
      estimator: tc.inputs.estimator,
    });
    const a = run(anovaCase);
    const b = run(remlCase);
    // Henderson I and REML coincide on a balanced design — that is the textbook
    // claim the estimator choice rests on, so it is asserted, not assumed.
    a.terms.forEach((t, i) => {
      assertAlmostEqual(b.terms[i].variance, t.variance, 1e-4,
        `balanced design: ${t.id} must agree between the estimators`);
    });
  });
});

suite('Variance components — degenerate input and failure reporting', () => {
  test('a singular EMS matrix is reported as an error, not as a TypeError', () => {
    // Hand-built table whose two terms project onto orthogonal but
    // indistinguishable directions: both EMS rows come out identical, so C is
    // exactly singular. `matInverse` signals that by returning null; without
    // the guard in anovaComponents() the null would be dereferenced and the UI
    // would show "cannot read properties of null".
    const z = [0, 1, 1, 0];
    const table = {
      rows: [{ id: 'A', df: 1, ss: 2, ms: 2 }, { id: 'B', df: 1, ss: 3, ms: 3 }],
      error: { df: 1, ss: 1, ms: 1 },
      basis: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]],
      ranks: [2, 3],
      termColumns: [[z], [z]],
      n: 4,
    };
    const C = emsMatrix(table);
    assertDeepEqual(C, [[1, 1, 1], [1, 1, 1], [0, 0, 1]], 'the fixture must be singular');
    assertThrows(() => anovaComponents(table), /singular EMS matrix/);
  });

  test('emStep reports a failed solve as null instead of standing still', () => {
    // All-zero variances make V the zero matrix, so remlP() cannot invert it.
    // A silent `theta` handed back unchanged would look exactly like
    // convergence to the caller — the one confusion the null return prevents.
    const response = [1, 2, 3, 4, 5, 6];
    const factorValues = [
      ['a', 'a', 'a', 'b', 'b', 'b'],
      ['1', '1', '2', '1', '2', '2'],
    ];
    const terms = buildTerms('nested', ['A', 'B']);
    const ws = remlWorkspace({ response, factorValues, terms });
    assertEqual(emStep(ws, [0, 0, 0]), null);
    // With a usable theta the same call returns a vector, so the null above is
    // about the singular V and not about a broken workspace.
    const ok = emStep(ws, [1, 1, 1]);
    assertEqual(Array.isArray(ok), true);
    assertEqual(ok.length, 3);
  });

  test('a constant response yields all-zero components rather than an invented one', () => {
    // Every measurement identical: there is no variance to attribute, and the
    // only honest answer is zero everywhere. Left to the iteration, REML picks
    // up floating-point dust and reports a component of ~1e-30 as if it were a
    // finding.
    const response = new Array(12).fill(7.5);
    const factorValues = [
      ['a', 'a', 'a', 'a', 'b', 'b', 'b', 'b', 'c', 'c', 'c', 'c'],
      ['1', '1', '2', '2', '1', '1', '2', '2', '1', '1', '2', '2'],
    ];
    const r = computeVarianceComponents({
      response, factorValues, factorNames: ['A', 'B'],
      modelForm: 'nested', estimator: 'reml',
    });
    assertEqual(r.converged, true, 'the constant case is decided, not iterated');
    assertEqual(r.warnings.includes('notConverged'), false);
    r.terms.forEach(t => assertEqual(t.variance, 0, `${t.id} must be exactly zero`));
    assertEqual(r.totalVariance, 0);

    // Unit-free: the same data in micrometres must get the same verdict.
    const scaled = computeVarianceComponents({
      response: response.map(v => v * 1e6), factorValues, factorNames: ['A', 'B'],
      modelForm: 'nested', estimator: 'reml',
    });
    scaled.terms.forEach(t => assertEqual(t.variance, 0, `${t.id} must be zero at any scale`));
  });

  test('REML converges on the design that used to exhaust the iteration budget', () => {
    // The catalog's Abfüllanlage plan: crossed, unbalanced, one cell missing —
    // which makes A*B*C fully aliased (df 0) and the average-information matrix
    // exactly singular. Dropping the non-estimable term and constraining the AI
    // step to the non-negative orthant is what turns 100 fruitless iterations
    // into a converged fit.
    const factorValues = [
      ['M1', 'M1', 'M1', 'M1', 'M1', 'M1', 'M1', 'M1', 'M2', 'M2', 'M2', 'M2', 'M2', 'M2'],
      ['Früh', 'Früh', 'Früh', 'Spät', 'Spät', 'Spät', 'Spät', 'Früh',
        'Früh', 'Früh', 'Spät', 'Spät', 'Früh', 'Früh'],
      ['C1', 'C1', 'C2', 'C1', 'C1', 'C2', 'C2', 'C2',
        'C1', 'C2', 'C1', 'C1', 'C1', 'C2'],
    ];
    const response = [
      500.2, 500.4, 501.1, 499.8, 500.1, 501.4, 501.2, 500.9,
      497.6, 498.3, 497.1, 497.4, 497.9, 498.1,
    ];
    const r = computeVarianceComponents({
      response, factorValues, factorNames: ['Maschine', 'Schicht', 'Charge'],
      modelForm: 'crossed', estimator: 'reml',
    });
    assertEqual(r.converged, true, 'the fit must converge');
    assertEqual(r.iterations < REML_MAX_ITER, true,
      `expected fewer than ${REML_MAX_ITER} iterations, got ${r.iterations}`);
    assertEqual(r.warnings.includes('notConverged'), false);
    // The aliased three-way term is reported as the zero it is, not omitted.
    const abc = r.terms.find(t => t.id === 'A*B*C');
    assertEqual(Boolean(abc), true, 'A*B*C must still appear in the table');
    assertEqual(abc.variance, 0, 'an aliased term has no estimable component');
    r.terms.forEach(t => assertEqual(t.variance >= 0, true, `${t.id} must be non-negative`));
  });
});

suite('Variance components — balance under the model form', () => {
  // A nested plan whose inner labels are globally unique (P1…P6 rather than
  // P1/P2 repeated under each parent) has six "levels" in the raw count but
  // only two per parent. Measuring it against the raw level product declares a
  // perfectly balanced design incomplete.
  const factorValues = [
    ['M1', 'M1', 'M1', 'M1', 'M2', 'M2', 'M2', 'M2', 'M3', 'M3', 'M3', 'M3'],
    ['P1', 'P1', 'P2', 'P2', 'P3', 'P3', 'P4', 'P4', 'P5', 'P5', 'P6', 'P6'],
  ];
  const response = [
    10.1, 10.3, 10.9, 11.0, 12.2, 12.4, 12.8, 13.1, 9.4, 9.6, 8.8, 9.0,
  ];

  test('expectedCellCount counts what the model form can reach', () => {
    // Crossed: the raw product, 3 x 6 = 18 — most of which cannot occur.
    assertEqual(expectedCellCount(factorValues, [0, 1], 'crossed'), 18);
    // Nested: three parents, two children each = 6, which is exactly what the
    // data occupies.
    assertEqual(expectedCellCount(factorValues, [0, 1], 'nested'), 6);
  });

  test('a balanced nested plan with globally unique inner labels is balanced', () => {
    const r = computeVarianceComponents({
      response, factorValues, factorNames: ['Maschine', 'Teil'],
      modelForm: 'nested', estimator: 'anova',
    });
    assertEqual(r.balanced, true, 'the nested plan is balanced');
    assertEqual(r.warnings.includes('unbalanced'), false,
      `unexpected warnings: ${JSON.stringify(r.warnings)}`);
  });

  test('the same data read as a crossed plan is genuinely incomplete', () => {
    const r = computeVarianceComponents({
      response, factorValues, factorNames: ['Maschine', 'Teil'],
      modelForm: 'crossed', estimator: 'anova',
    });
    assertEqual(r.balanced, false, 'as a crossed plan 12 of 18 cells are empty');
    assertEqual(r.warnings.includes('unbalanced'), true);
  });
});
