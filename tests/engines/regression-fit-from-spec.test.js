/**
 * D.Mike — fitFromSpec & generatePolynomialTerms Tests
 *
 * These two engine helpers are the bridge between the structured ModelSpec
 * world and downstream consumers (regression module, response-optimization).
 *
 *   • generatePolynomialTerms produces the canonical Term[] for a polynomial
 *     of given degree, honouring kind: continuous gets squared/cubed terms,
 *     categorical gets only its main effect (the n-1 indicators are
 *     materialised inside compileModelSpec).
 *
 *   • fitFromSpec is the single-source-of-truth orchestrator. It must
 *     reproduce the diagnostics that the existing UI consumes (β, SE, t, p,
 *     CIs, R², R²adj, R²pred, PRESS, F, dw) and supply per-block ANOVA rows.
 */

import { suite, test, assertAlmostEqual, assertEqual } from '../test-utils.js';
import {
  generatePolynomialTerms, fitFromSpec, compileModelSpec, olsRegression,
  runMultiRegression,
} from '../../js/engines/regression-engine.js';

// ─── generatePolynomialTerms ───────────────────────────────────────

suite('generatePolynomialTerms — continuous-only matches buildPolyDesignMatrix', () => {
  test('degree 1: just linear main effects', () => {
    const terms = generatePolynomialTerms(
      [{ id: 'X1', kind: 'continuous' }, { id: 'X2', kind: 'continuous' }],
      1,
    );
    assertEqual(terms.length, 2);
    assertEqual(terms[0].id, 'X1');
    assertEqual(terms[1].id, 'X2');
  });

  test('degree 2: linear + squared + 2-way interaction', () => {
    const terms = generatePolynomialTerms(
      [{ id: 'X1', kind: 'continuous' }, { id: 'X2', kind: 'continuous' }],
      2,
    );
    const ids = terms.map(t => t.id);
    assertEqual(ids.length, 5);
    // Order matches buildPolyDesignMatrix: linear, squared, interactions.
    assertEqual(ids[0], 'X1');
    assertEqual(ids[1], 'X2');
    assertEqual(ids[2], 'X1²');
    assertEqual(ids[3], 'X2²');
    assertEqual(ids[4], 'X1·X2');
  });

  test('degree 3: cubic + mixed-power interactions for continuous pairs', () => {
    const terms = generatePolynomialTerms(
      [{ id: 'X1', kind: 'continuous' }, { id: 'X2', kind: 'continuous' }],
      3,
    );
    const ids = terms.map(t => t.id);
    // X1, X2, X1², X2², X1·X2, X1³, X2³, X1²·X2, X1·X2²
    assertEqual(ids.length, 9);
    assertEqual(ids.includes('X1³'), true);
    assertEqual(ids.includes('X2³'), true);
    assertEqual(ids.includes('X1²·X2'), true);
    assertEqual(ids.includes('X1·X2²'), true);
  });
});

suite('generatePolynomialTerms — mixed kinds skip nonsensical terms', () => {
  test('categorical predictors get no squared term at degree 2', () => {
    const terms = generatePolynomialTerms(
      [
        { id: 'X', kind: 'continuous' },
        { id: 'Tool', kind: 'categorical', levels: ['A', 'B', 'C'], reference: 'A' },
      ],
      2,
    );
    const ids = terms.map(t => t.id);
    assertEqual(ids.includes('X²'),     true,  'X² present (continuous)');
    assertEqual(ids.includes('Tool²'),  false, 'Tool² absent (categorical)');
    assertEqual(ids.includes('X·Tool'), true,  'continuous × categorical interaction present');
  });

  test('categorical × categorical interaction included at degree 2', () => {
    const terms = generatePolynomialTerms(
      [
        { id: 'A', kind: 'categorical', levels: ['x', 'y'], reference: 'x' },
        { id: 'B', kind: 'categorical', levels: ['p', 'q', 'r'], reference: 'p' },
      ],
      2,
    );
    const ids = terms.map(t => t.id);
    assertEqual(ids.includes('A·B'), true);
  });

  test('mixed-power interactions skipped when either factor is categorical', () => {
    const terms = generatePolynomialTerms(
      [
        { id: 'X', kind: 'continuous' },
        { id: 'Tool', kind: 'categorical', levels: ['A', 'B'], reference: 'A' },
      ],
      3,
    );
    const ids = terms.map(t => t.id);
    assertEqual(ids.includes('X²·Tool'), false);
    assertEqual(ids.includes('X·Tool²'), false);
  });
});

// ─── fitFromSpec — pure-continuous parity with runMultiRegression ──

suite('fitFromSpec — continuous-only parity', () => {
  // Synthetic 2-factor quadratic data with a small noise term.
  const xs1 = [-1, -1, -1,  0,  0,  0,  1,  1,  1, -1,  0,  1];
  const xs2 = [-1,  0,  1, -1,  0,  1, -1,  0,  1,  0,  0,  0];
  const y   = xs1.map((x1, i) => 50 + 4*x1 - 2*x1*x1 + 3*xs2[i] + 0.5*x1*xs2[i] + 0.05*((i % 5) - 2));

  const spec = {
    predictors: [
      { id: 'X1', kind: 'continuous' },
      { id: 'X2', kind: 'continuous' },
    ],
    terms: generatePolynomialTerms(
      [{ id: 'X1', kind: 'continuous' }, { id: 'X2', kind: 'continuous' }],
      2,
    ),
  };
  const fit = fitFromSpec(spec, { columns: { X1: xs1, X2: xs2 }, y }, { confLevel: 0.95 });
  const ref = runMultiRegression([xs1, xs2], y, 2, 0.95, ['X1', 'X2']);

  test('R² matches runMultiRegression to 9 digits', () => {
    assertAlmostEqual(fit.diagnostics.R2,    ref.R2,    1e-9);
    assertAlmostEqual(fit.diagnostics.adjR2, ref.adjR2, 1e-9);
  });

  test('PRESS and R²pred match runMultiRegression', () => {
    assertAlmostEqual(fit.diagnostics.PRESS,  ref.PRESS,  1e-6);
    assertAlmostEqual(fit.diagnostics.R2pred, ref.R2pred, 1e-9);
  });

  test('Durbin-Watson matches', () => {
    assertAlmostEqual(fit.diagnostics.dw, ref.dw, 1e-9);
  });

  test('block ANOVA rows have the expected term ids', () => {
    const ids = fit.blocks.map(b => b.id);
    assertEqual(ids.includes('X1'),    true);
    assertEqual(ids.includes('X2'),    true);
    assertEqual(ids.includes('X1²'),   true);
    assertEqual(ids.includes('X2²'),   true);
    assertEqual(ids.includes('X1·X2'), true);
    // Each is a single-column block → df = 1.
    for (const b of fit.blocks) assertEqual(b.df, 1);
  });

  test('predict closure recovers a fitted value', () => {
    const yHat0 = fit.predict({ X1: xs1[0], X2: xs2[0] });
    const expected = ref.coefDetails.reduce((acc, cd, j) => {
      // Build the row exactly the way runMultiRegression would.
      return acc;   // we only care about the closure being self-consistent vs. ols.predicted
    }, 0);
    assertAlmostEqual(yHat0, fit.ols.predicted[0], 1e-9);
  });
});

// ─── fitFromSpec — mixed continuous + categorical ──────────────────

suite('fitFromSpec — mixed RSM with categorical block', () => {
  // y = 50 + 4·X − 2·X² + 3·B − 1·C  (effect coding, A is reference, A_dev = -2)
  const Xs   = [-1, -1, -1,  0,  0,  0,  1,  1,  1, -1,  0,  1];
  const Tool = ['A','B','C','A','B','C','A','B','C','B','C','A'];
  const y = Xs.map((x, i) => {
    const base = 50 + 4 * x - 2 * x * x;
    if (Tool[i] === 'A') return base - 2;
    if (Tool[i] === 'B') return base + 3;
    return base - 1;
  });

  const predictors = [
    { id: 'X',    kind: 'continuous' },
    { id: 'Tool', kind: 'categorical', levels: ['A', 'B', 'C'], reference: 'A' },
  ];
  const spec = {
    predictors,
    terms: generatePolynomialTerms(predictors, 2),
  };
  const fit = fitFromSpec(spec, { columns: { X: Xs, Tool }, y }, { confLevel: 0.95 });

  test('R² is essentially 1 (noise-free synthetic data)', () => {
    if (fit.diagnostics.R2 < 0.999) {
      throw new Error(`expected R² ≈ 1, got ${fit.diagnostics.R2}`);
    }
  });

  test('Tool block surfaces with df = 2 and significant p', () => {
    const tool = fit.blocks.find(b => b.id === 'Tool');
    assertEqual(tool.df, 2);
    if (!(tool.pValue < 1e-6)) {
      throw new Error(`expected near-zero p for Tool, got ${tool.pValue}`);
    }
  });

  test('coefDetails carries one entry per indicator with named column', () => {
    const toolCoefs = fit.coefDetails.filter(c => c.blockId === 'Tool');
    assertEqual(toolCoefs.length, 2);
    const names = toolCoefs.map(c => c.columnName);
    assertEqual(names.includes('Tool=B'), true);
    assertEqual(names.includes('Tool=C'), true);
  });

  test('predict closure handles categorical input as label', () => {
    const yHat = fit.predict({ X: 1, Tool: 'B' });
    // True y at (X=1, B): 50 + 4 - 2 + 3 = 55
    assertAlmostEqual(yHat, 55, 1e-9);
  });

  test('predict closure picks up Tool=A via effect coding (A = -B - C deviation)', () => {
    const yHat = fit.predict({ X: 0, Tool: 'A' });
    // Base 50 + 0 - 0 = 50, Tool=A indicator row [-1, -1] gives -β_B - β_C = -3 - (-1) = -2.
    assertAlmostEqual(yHat, 48, 1e-9);
  });
});
