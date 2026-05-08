/**
 * D.Mike — ModelSpec Compiler Tests (V0.4 Phase 3)
 *
 * Validates `compileModelSpec` across every term-shape combination that the
 * regression module needs:
 *
 *   • Continuous main effect (any degree)
 *   • Categorical main effect (binary + multi-level)
 *   • Continuous × continuous interaction
 *   • Continuous × categorical interaction
 *   • Categorical × categorical interaction
 *   • Mixed model (RSM-style continuous quadratic + categorical block)
 *
 * The compiled X is checked against hand-computed expansions; downstream we
 * verify that olsRegression + blockTypeIIISS reproduce known coefficients and
 * ANOVA rows.
 */

import { suite, test, assertAlmostEqual, assertEqual } from '../test-utils.js';
import {
  compileModelSpec,
  olsRegression,
  blockTypeIIISS,
} from '../../js/engines/regression-engine.js';

// ─── Basic shape checks ────────────────────────────────────────────

suite('compileModelSpec — main effects', () => {
  test('continuous degree 1: intercept + X column', () => {
    const spec = {
      predictors: [{ id: 'X', kind: 'continuous' }],
      terms: [{ id: 'X', factors: [{ id: 'X' }] }],
    };
    const { X, blockMap, termNames } = compileModelSpec(spec, {
      columns: { X: [1, 2, 3, 4] },
    });
    assertEqual(X.length, 4);
    assertEqual(X[0].length, 2);                   // intercept + X
    assertEqual(X[2][1], 3);
    assertEqual(blockMap.length, 2);               // Intercept + X term
    assertEqual(blockMap[0].id, 'Intercept');
    assertEqual(blockMap[1].id, 'X');
    assertEqual(termNames[1], 'X');
  });

  test('continuous degree 2: appends X² column with the right values', () => {
    const spec = {
      predictors: [{ id: 'X', kind: 'continuous' }],
      terms: [
        { id: 'X',   factors: [{ id: 'X', degree: 1 }] },
        { id: 'X^2', factors: [{ id: 'X', degree: 2 }] },
      ],
    };
    const { X, blockMap, termNames } = compileModelSpec(spec, {
      columns: { X: [1, 2, 3] },
    });
    // Columns are [Intercept, X, X²]
    assertEqual(X[0][2], 1);
    assertEqual(X[1][2], 4);
    assertEqual(X[2][2], 9);
    assertEqual(termNames[2], 'X^2');
    assertEqual(blockMap[2].df, 1);
  });

  test('binary categorical: one effect-coded indicator', () => {
    const spec = {
      predictors: [{ id: 'Tool', kind: 'categorical', levels: ['Steel', 'HSS'], reference: 'Steel' }],
      terms: [{ id: 'Tool', factors: [{ id: 'Tool' }] }],
    };
    const { X, blockMap } = compileModelSpec(spec, {
      columns: { Tool: ['Steel', 'HSS', 'Steel', 'HSS'] },
    });
    // Indicator: Steel → -1, HSS → +1   (effect coding)
    assertEqual(X[0][1], -1);
    assertEqual(X[1][1],  1);
    assertEqual(blockMap[1].df, 1);
    assertEqual(blockMap[1].columnNames[0], 'Tool=HSS');
  });

  test('three-level categorical: two effect-coded indicators', () => {
    const spec = {
      predictors: [
        { id: 'Tool', kind: 'categorical', levels: ['A', 'B', 'C'], reference: 'A' },
      ],
      terms: [{ id: 'Tool', factors: [{ id: 'Tool' }] }],
    };
    const { X, blockMap } = compileModelSpec(spec, {
      columns: { Tool: ['A', 'B', 'C'] },
    });
    // X columns: [Intercept, Tool=B, Tool=C]
    assertEqual(X[0][1], -1); assertEqual(X[0][2], -1);   // A → [-1, -1]
    assertEqual(X[1][1],  1); assertEqual(X[1][2],  0);   // B → [+1,  0]
    assertEqual(X[2][1],  0); assertEqual(X[2][2],  1);   // C → [ 0, +1]
    assertEqual(blockMap[1].df, 2);
    assertEqual(blockMap[1].columnNames[0], 'Tool=B');
    assertEqual(blockMap[1].columnNames[1], 'Tool=C');
  });
});

// ─── Interactions ──────────────────────────────────────────────────

suite('compileModelSpec — interactions', () => {
  test('continuous × continuous: single product column', () => {
    const spec = {
      predictors: [
        { id: 'X1', kind: 'continuous' },
        { id: 'X2', kind: 'continuous' },
      ],
      terms: [
        { id: 'X1',    factors: [{ id: 'X1' }] },
        { id: 'X2',    factors: [{ id: 'X2' }] },
        { id: 'X1:X2', factors: [{ id: 'X1' }, { id: 'X2' }] },
      ],
    };
    const { X, blockMap } = compileModelSpec(spec, {
      columns: { X1: [1, 2, 3], X2: [4, 5, 6] },
    });
    // [Intercept, X1, X2, X1·X2]
    assertEqual(X[0][3], 1 * 4);
    assertEqual(X[1][3], 2 * 5);
    assertEqual(X[2][3], 3 * 6);
    assertEqual(blockMap[3].df, 1);
  });

  test('continuous × categorical (k=3): two interaction columns', () => {
    const spec = {
      predictors: [
        { id: 'X',    kind: 'continuous' },
        { id: 'Tool', kind: 'categorical', levels: ['A', 'B', 'C'], reference: 'A' },
      ],
      terms: [
        { id: 'X',      factors: [{ id: 'X' }] },
        { id: 'Tool',   factors: [{ id: 'Tool' }] },
        { id: 'X:Tool', factors: [{ id: 'X' }, { id: 'Tool' }] },
      ],
    };
    const { X, blockMap } = compileModelSpec(spec, {
      columns: { X: [10, 10, 10], Tool: ['A', 'B', 'C'] },
    });
    // Tool indicators per row: A→[-1,-1], B→[1,0], C→[0,1]
    // X·Tool block (X = 10 for every row): A→[-10,-10], B→[10,0], C→[0,10]
    const ix = blockMap.find(b => b.id === 'X:Tool').columnIndices;
    assertEqual(X[0][ix[0]], -10); assertEqual(X[0][ix[1]], -10);
    assertEqual(X[1][ix[0]],  10); assertEqual(X[1][ix[1]],   0);
    assertEqual(X[2][ix[0]],   0); assertEqual(X[2][ix[1]],  10);
    assertEqual(blockMap.find(b => b.id === 'X:Tool').df, 2);
  });

  test('categorical × categorical (k1=3, k2=2): (k1−1)(k2−1) = 2 columns', () => {
    const spec = {
      predictors: [
        { id: 'Tool',   kind: 'categorical', levels: ['A', 'B', 'C'], reference: 'A' },
        { id: 'Method', kind: 'categorical', levels: ['M1', 'M2'],     reference: 'M1' },
      ],
      terms: [
        { id: 'Tool',          factors: [{ id: 'Tool' }] },
        { id: 'Method',        factors: [{ id: 'Method' }] },
        { id: 'Tool:Method',   factors: [{ id: 'Tool' }, { id: 'Method' }] },
      ],
    };
    const { X, blockMap } = compileModelSpec(spec, {
      columns: {
        Tool:   ['A', 'A', 'B', 'B', 'C', 'C'],
        Method: ['M1','M2','M1','M2','M1','M2'],
      },
    });
    const interactionBlock = blockMap.find(b => b.id === 'Tool:Method');
    assertEqual(interactionBlock.df, 2);
    // Row 0 (A, M1): Tool ind = [-1,-1], Method ind = [-1] → [(-1)(-1), (-1)(-1)] = [1, 1]
    // Row 5 (C, M2): Tool ind = [0,1],   Method ind = [+1] → [0, 1]
    const ix = interactionBlock.columnIndices;
    assertEqual(X[0][ix[0]],  1); assertEqual(X[0][ix[1]],  1);
    assertEqual(X[5][ix[0]],  0); assertEqual(X[5][ix[1]],  1);
  });
});

// ─── End-to-end: mixed model recovers known structure ──────────────

suite('compileModelSpec — end-to-end mixed RSM with categorical block', () => {
  // Synthetic data drawn from
  //   y = 50 + 4·X − 2·X² + 3·effect_B + (-1)·effect_C
  // where (effect_B, effect_C) is the effect-coded representation of a
  // 3-level Tool factor. Twelve runs: every (X ∈ {-1, 0, +1}) × (Tool ∈ {A,B,C})
  // observed, plus one repeat.
  const Xs   = [-1, -1, -1,  0,  0,  0,  1,  1,  1, -1,  0,  1];
  const Tool = ['A','B','C','A','B','C','A','B','C','B','C','A'];

  // Effect coding for Tool (reference = A):
  //   A → [-1, -1],  B → [+1, 0],  C → [0, +1]
  // True coefficients: β_A_dev = -(β_B_dev + β_C_dev). Set β_B_dev = 3, β_C_dev = -1
  // so the implied A deviation = -(3 - 1) = -2 (consistent with sum-to-zero).
  function trueY(x, tool) {
    const base = 50 + 4 * x - 2 * x * x;
    if (tool === 'A') return base - 2;
    if (tool === 'B') return base + 3;
    return base - 1;                  // C
  }
  const ys = Xs.map((x, i) => trueY(x, Tool[i]));

  const spec = {
    predictors: [
      { id: 'X',    kind: 'continuous' },
      { id: 'Tool', kind: 'categorical', levels: ['A', 'B', 'C'], reference: 'A' },
    ],
    terms: [
      { id: 'X',    factors: [{ id: 'X', degree: 1 }] },
      { id: 'X^2',  factors: [{ id: 'X', degree: 2 }] },
      { id: 'Tool', factors: [{ id: 'Tool' }] },
    ],
  };
  const { X, blockMap } = compileModelSpec(spec, {
    columns: { X: Xs, Tool },
  });

  test('OLS recovers continuous coefficients', () => {
    const ols = olsRegression(X, ys);
    // Layout: [Intercept, X, X², Tool=B, Tool=C]
    assertAlmostEqual(ols.beta[0], 50, 1e-9, 'intercept = grand mean');
    assertAlmostEqual(ols.beta[1],  4, 1e-9, 'linear');
    assertAlmostEqual(ols.beta[2], -2, 1e-9, 'quadratic');
  });

  test('OLS recovers effect-coded categorical coefficients', () => {
    const ols = olsRegression(X, ys);
    assertAlmostEqual(ols.beta[3],  3, 1e-9, 'Tool=B effect');
    assertAlmostEqual(ols.beta[4], -1, 1e-9, 'Tool=C effect');
  });

  test('block Type-III SS for the Tool block is highly significant', () => {
    const ols = olsRegression(X, ys);
    const toolBlock = blockMap.find(b => b.id === 'Tool');
    const ss = blockTypeIIISS(ols, toolBlock.columnIndices);
    assertEqual(ss.df, 2);
    if (!(ss.pValue < 1e-6)) {
      throw new Error(`expected near-zero p for Tool block, got ${ss.pValue}`);
    }
  });
});

// ─── Validation ────────────────────────────────────────────────────

suite('compileModelSpec — validation', () => {
  test('rejects unknown predictor id in a term', () => {
    let threw = false;
    try {
      compileModelSpec(
        { predictors: [{ id: 'X', kind: 'continuous' }], terms: [{ id: 'Y', factors: [{ id: 'Y' }] }] },
        { columns: { X: [1, 2] } }
      );
    } catch { threw = true; }
    assertEqual(threw, true);
  });

  test('rejects mismatched column lengths', () => {
    let threw = false;
    try {
      compileModelSpec(
        { predictors: [
            { id: 'X', kind: 'continuous' },
            { id: 'Y', kind: 'continuous' },
          ], terms: [
            { id: 'X', factors: [{ id: 'X' }] },
            { id: 'Y', factors: [{ id: 'Y' }] },
          ] },
        { columns: { X: [1, 2, 3], Y: [4, 5] } }
      );
    } catch { threw = true; }
    assertEqual(threw, true);
  });

  test('rejects unknown categorical level in data', () => {
    let threw = false;
    try {
      compileModelSpec(
        { predictors: [{ id: 'T', kind: 'categorical', levels: ['A', 'B'], reference: 'A' }],
          terms: [{ id: 'T', factors: [{ id: 'T' }] }] },
        { columns: { T: ['A', 'C'] } }      // 'C' not in levels
      );
    } catch { threw = true; }
    assertEqual(threw, true);
  });

  test('rejects non-finite continuous values', () => {
    let threw = false;
    try {
      compileModelSpec(
        { predictors: [{ id: 'X', kind: 'continuous' }],
          terms: [{ id: 'X', factors: [{ id: 'X' }] }] },
        { columns: { X: [1, NaN, 3] } }
      );
    } catch { threw = true; }
    assertEqual(threw, true);
  });

  test('intercept can be omitted', () => {
    const { X, blockMap } = compileModelSpec(
      { predictors: [{ id: 'X', kind: 'continuous' }],
        terms: [{ id: 'X', factors: [{ id: 'X' }] }],
        includeIntercept: false },
      { columns: { X: [1, 2, 3] } }
    );
    assertEqual(X[0].length, 1);                      // only the X column
    assertEqual(blockMap[0].id, 'X');                 // no Intercept block
  });
});
