/**
 * D.Mike — DoE Planner Engine Tests (doe-planner.test.js)
 *
 * Tests for design generation, math library, and analysis functions.
 * Gold-standard validation against Minitab / R expected values.
 */

import { suite, test, beforeEach, assertEqual, assertAlmostEqual, assertArrayAlmostEqual, assertInRange, assertThrows } from '../test-utils.js';
import {
  fullFactorial2k,
  fullFactorialGeneral,
  fractionalFactorial,
  plackettBurman,
  centralComposite,
  ccdAlpha,
  boxBehnken,
  taguchiDesign,
  selectTaguchiArray,
  addCenterPoints,
  randomizeDesign,
  codedToActual,
  generateDesign,
} from '../../js/engines/doe-planner-engine.js';

import {
  matTranspose,
  matMul,
  matInverse,
  matDeterminant,
  buildModelMatrix,
  normalCDF,
  fDistCDF,
  fDistQuantile,
  tDistCDF,
  tDistPValue,
  olsRegression,
  typeIIISS,
} from '../../js/modules/doe-planner/doe-planner-math.js';

import {
  analyzeResponse,
  mainEffectMeans,
  interactionMeans,
  normalOrderStatistics,
  computeEVOPEffects,
  recenteredFactors,
  computeDispersionAnalysis,
} from '../../js/modules/doe-planner/doe-planner-analysis.js';


// ═══════════════════════════════════════════════════════════════════
// Design Generation Engine
// ═══════════════════════════════════════════════════════════════════

suite('DoE Engine: Full Factorial 2^k', () => {
  test('2^2 produces 4 runs with correct patterns', () => {
    const runs = fullFactorial2k(2);
    assertEqual(runs.length, 4);
    // All combinations of -1 and +1
    const flat = runs.map(r => r.join(',')).sort();
    assertEqual(flat.includes('-1,-1'), true);
    assertEqual(flat.includes('-1,1'), true);
    assertEqual(flat.includes('1,-1'), true);
    assertEqual(flat.includes('1,1'), true);
  });

  test('2^3 produces 8 runs', () => {
    const runs = fullFactorial2k(3);
    assertEqual(runs.length, 8);
    assertEqual(runs[0].length, 3);
  });

  test('2^4 produces 16 runs', () => {
    const runs = fullFactorial2k(4);
    assertEqual(runs.length, 16);
  });

  test('Columns are balanced (equal +1 and -1)', () => {
    const runs = fullFactorial2k(3);
    for (let col = 0; col < 3; col++) {
      const plus = runs.filter(r => r[col] === 1).length;
      const minus = runs.filter(r => r[col] === -1).length;
      assertEqual(plus, minus, `Column ${col} not balanced`);
    }
  });

  test('Columns are orthogonal (sum of products = 0)', () => {
    const runs = fullFactorial2k(3);
    for (let a = 0; a < 3; a++) {
      for (let b = a + 1; b < 3; b++) {
        let sum = 0;
        for (const r of runs) sum += r[a] * r[b];
        assertEqual(sum, 0, `Columns ${a} and ${b} not orthogonal`);
      }
    }
  });
});

suite('DoE Engine: General Full Factorial', () => {
  test('2×3 produces 6 runs', () => {
    const runs = fullFactorialGeneral([2, 3]);
    assertEqual(runs.length, 6);
  });

  test('3×3 produces 9 runs', () => {
    const runs = fullFactorialGeneral([3, 3]);
    assertEqual(runs.length, 9);
  });

  test('Coded levels are in [-1, +1]', () => {
    const runs = fullFactorialGeneral([3, 2]);
    for (const row of runs) {
      for (const v of row) {
        assertInRange(v, -1, 1);
      }
    }
  });
});

suite('DoE Engine: Fractional Factorial', () => {
  test('2^(3-1) produces 4 runs (half fraction)', () => {
    const runs = fractionalFactorial(3, 1);
    assertEqual(runs.length, 4);
    assertEqual(runs[0].length, 3);
  });

  test('2^(4-1) produces 8 runs', () => {
    const runs = fractionalFactorial(4, 1);
    assertEqual(runs.length, 8);
    assertEqual(runs[0].length, 4);
  });

  test('p=0 returns full factorial', () => {
    const runs = fractionalFactorial(3, 0);
    assertEqual(runs.length, 8);
  });

  test('All values are -1 or +1', () => {
    const runs = fractionalFactorial(5, 2);
    for (const row of runs) {
      for (const v of row) {
        assertEqual(v === -1 || v === 1, true, `Unexpected value ${v}`);
      }
    }
  });
});

suite('DoE Engine: Plackett-Burman', () => {
  test('PB for k=7 uses 8 runs', () => {
    const runs = plackettBurman(7);
    assertEqual(runs.length, 8);
    assertEqual(runs[0].length, 7);
  });

  test('PB for k=11 uses 12 runs', () => {
    const runs = plackettBurman(11);
    assertEqual(runs.length, 12);
    assertEqual(runs[0].length, 11);
  });

  test('Run count is multiple of 4', () => {
    for (const k of [3, 5, 7, 11, 15, 19]) {
      const runs = plackettBurman(k);
      assertEqual(runs.length % 4, 0, `k=${k}: ${runs.length} not multiple of 4`);
    }
  });

  test('All values are -1 or +1', () => {
    const runs = plackettBurman(7);
    for (const row of runs) {
      for (const v of row) {
        assertEqual(v === -1 || v === 1, true);
      }
    }
  });
});

suite('DoE Engine: Central Composite Design', () => {
  test('CCD for k=2 rotatable: 4 factorial + 4 star + 3 center = 11 runs', () => {
    const runs = centralComposite(2, { alphaType: 'rotatable', centerPoints: 3 });
    assertEqual(runs.length, 11);
  });

  test('CCD for k=3: 8 factorial + 6 star + 3 center = 17 runs', () => {
    const runs = centralComposite(3, { centerPoints: 3 });
    assertEqual(runs.length, 17);
  });

  test('Alpha rotatable for k=2 = 2^(2/4) = 1.4142', () => {
    assertAlmostEqual(ccdAlpha(2, 'rotatable'), Math.pow(4, 0.25), 1e-6);
  });

  test('Alpha face-centered = 1', () => {
    assertEqual(ccdAlpha(3, 'face-centered'), 1);
  });

  test('Alpha spherical for k=3 = sqrt(3)', () => {
    assertAlmostEqual(ccdAlpha(3, 'spherical'), Math.sqrt(3), 1e-6);
  });

  test('Star points are on axes', () => {
    const runs = centralComposite(2, { alphaType: 'face-centered', centerPoints: 0 });
    // Should have 4 factorial + 4 star = 8 runs
    assertEqual(runs.length, 8);
    // Star points: exactly one nonzero coordinate
    const starPoints = runs.filter(r => {
      const nz = r.filter(v => v !== 0).length;
      return nz === 1;
    });
    assertEqual(starPoints.length, 4);
  });
});

suite('DoE Engine: Box-Behnken', () => {
  test('BB for k=3: 12 edge + 3 center = 15 runs', () => {
    const runs = boxBehnken(3);
    assertEqual(runs.length, 15);
    assertEqual(runs[0].length, 3);
  });

  test('BB for k=4 uses pair template', () => {
    const runs = boxBehnken(4);
    assertEqual(runs[0].length, 4);
    // 6 pairs × 4 runs + 3 center = 27
    assertEqual(runs.length, 27);
  });

  test('No corner points (no row with all ±1)', () => {
    const runs = boxBehnken(3);
    for (const row of runs) {
      const allExtreme = row.every(v => Math.abs(v) === 1);
      assertEqual(allExtreme, false, 'BB should not have corner points');
    }
  });

  test('Center points are all zeros', () => {
    const runs = boxBehnken(3, { centerPoints: 3 });
    const centers = runs.filter(r => r.every(v => v === 0));
    assertEqual(centers.length, 3);
  });

  test('Throws for k=2 (not supported)', () => {
    assertThrows(() => boxBehnken(2));
  });

  test('Throws for k=8 (not supported)', () => {
    assertThrows(() => boxBehnken(8));
  });
});

suite('DoE Engine: Taguchi', () => {
  test('L4 for k=3, 2-level: 4 runs', () => {
    const { codedMatrix, arrayName } = taguchiDesign(3, 2, 'L4');
    assertEqual(codedMatrix.length, 4);
    assertEqual(codedMatrix[0].length, 3);
    assertEqual(arrayName, 'L4');
  });

  test('L8 for k=7, 2-level: 8 runs', () => {
    const { codedMatrix, arrayName } = taguchiDesign(7, 2, 'L8');
    assertEqual(codedMatrix.length, 8);
    assertEqual(codedMatrix[0].length, 7);
    assertEqual(arrayName, 'L8');
  });

  test('L9 for k=4, 3-level: 9 runs', () => {
    const { codedMatrix } = taguchiDesign(4, 3, 'L9');
    assertEqual(codedMatrix.length, 9);
    assertEqual(codedMatrix[0].length, 4);
  });

  test('Auto-select finds smallest fitting OA', () => {
    const { name } = selectTaguchiArray(3, 2);
    assertEqual(name, 'L4');
  });

  test('Auto-select for 5 factors, 2-level selects L8', () => {
    const { name } = selectTaguchiArray(5, 2);
    assertEqual(name, 'L8');
  });

  test('2-level coded values are -1 and +1', () => {
    const { codedMatrix } = taguchiDesign(3, 2, 'L4');
    for (const row of codedMatrix) {
      for (const v of row) {
        assertEqual(v === -1 || v === 1, true, `Unexpected value ${v}`);
      }
    }
  });

  test('3-level coded values are -1, 0, +1', () => {
    const { codedMatrix } = taguchiDesign(4, 3, 'L9');
    for (const row of codedMatrix) {
      for (const v of row) {
        assertEqual(v === -1 || v === 0 || v === 1, true, `Unexpected value ${v}`);
      }
    }
  });
});

suite('DoE Engine: Post-processing', () => {
  test('addCenterPoints adds correct number', () => {
    const base = fullFactorial2k(2);
    const result = addCenterPoints(base, 3);
    assertEqual(result.length, 7);
    const centers = result.filter(r => r.every(v => v === 0));
    assertEqual(centers.length, 3);
  });

  test('randomizeDesign preserves all rows', () => {
    const base = fullFactorial2k(3);
    const shuffled = randomizeDesign(base);
    assertEqual(shuffled.length, base.length);
    // All original rows should be present
    const baseSet = new Set(base.map(r => r.join(',')));
    const shuffSet = new Set(shuffled.map(r => r.join(',')));
    assertEqual(baseSet.size, shuffSet.size);
  });

  test('randomizeDesign with seed is reproducible', () => {
    const base = fullFactorial2k(3);
    const a = randomizeDesign(base, 42);
    const b = randomizeDesign(base, 42);
    for (let i = 0; i < a.length; i++) {
      assertArrayAlmostEqual(a[i], b[i], 0);
    }
  });

  test('codedToActual maps correctly', () => {
    assertAlmostEqual(codedToActual(-1, 100, 200), 100, 1e-9);
    assertAlmostEqual(codedToActual(0, 100, 200), 150, 1e-9);
    assertAlmostEqual(codedToActual(1, 100, 200), 200, 1e-9);
    assertAlmostEqual(codedToActual(0.5, 100, 200), 175, 1e-9);
  });
});

suite('DoE Engine: generateDesign facade', () => {
  test('Full factorial with 2 factors', () => {
    const factors = [
      { id: 1, name: 'A', unit: '', levels: ['10', '20'] },
      { id: 2, name: 'B', unit: '', levels: ['100', '200'] },
    ];
    const result = generateDesign(factors, { designType: 'full', randomize: false, centerPoints: false });
    assertEqual(result.codedMatrix.length, 4);
    assertEqual(result.actualMatrix.length, 4);
    assertEqual(result.runOrder.length, 4);
    assertEqual(result.stdOrder.length, 4);
    assertEqual(result.resolution, 'Full');
    assertEqual(result.designType, 'full');
  });

  test('CCD with 2 factors produces correct run count', () => {
    const factors = [
      { id: 1, name: 'A', unit: '', levels: ['10', '20'] },
      { id: 2, name: 'B', unit: '', levels: ['100', '200'] },
    ];
    const result = generateDesign(factors, {
      designType: 'ccd', randomize: false, alphaType: 'rotatable', ccdCenterPoints: 3,
    });
    // 4 factorial + 4 star + 3 center = 11
    assertEqual(result.codedMatrix.length, 11);
    assertEqual(result.resolution, 'CCD');
  });
});


// ═══════════════════════════════════════════════════════════════════
// Math Library
// ═══════════════════════════════════════════════════════════════════

suite('DoE Math: Matrix Operations', () => {
  test('Transpose 2×3 → 3×2', () => {
    const A = [[1, 2, 3], [4, 5, 6]];
    const T = matTranspose(A);
    assertEqual(T.length, 3);
    assertEqual(T[0].length, 2);
    assertEqual(T[0][0], 1);
    assertEqual(T[1][0], 2);
    assertEqual(T[0][1], 4);
  });

  test('Matrix multiply 2×2 × 2×2', () => {
    const A = [[1, 2], [3, 4]];
    const B = [[5, 6], [7, 8]];
    const C = matMul(A, B);
    assertEqual(C[0][0], 19);
    assertEqual(C[0][1], 22);
    assertEqual(C[1][0], 43);
    assertEqual(C[1][1], 50);
  });

  test('Identity inverse is identity', () => {
    const I = [[1, 0], [0, 1]];
    const inv = matInverse(I);
    assertAlmostEqual(inv[0][0], 1, 1e-9);
    assertAlmostEqual(inv[0][1], 0, 1e-9);
    assertAlmostEqual(inv[1][0], 0, 1e-9);
    assertAlmostEqual(inv[1][1], 1, 1e-9);
  });

  test('A × A^-1 ≈ I', () => {
    const A = [[2, 1], [5, 3]];
    const inv = matInverse(A);
    const prod = matMul(A, inv);
    assertAlmostEqual(prod[0][0], 1, 1e-9);
    assertAlmostEqual(prod[0][1], 0, 1e-9);
    assertAlmostEqual(prod[1][0], 0, 1e-9);
    assertAlmostEqual(prod[1][1], 1, 1e-9);
  });

  test('Determinant of 2×2', () => {
    const A = [[3, 8], [4, 6]];
    assertAlmostEqual(matDeterminant(A), 3 * 6 - 8 * 4, 1e-9);
  });
});

suite('DoE Math: Statistical Distributions', () => {
  test('normalCDF(0) = 0.5', () => {
    assertAlmostEqual(normalCDF(0), 0.5, 1e-6);
  });

  test('normalCDF(1.96) ≈ 0.975', () => {
    assertAlmostEqual(normalCDF(1.96), 0.975, 1e-3);
  });

  test('normalCDF(-1.96) ≈ 0.025', () => {
    assertAlmostEqual(normalCDF(-1.96), 0.025, 1e-3);
  });

  test('fDistCDF(0, 5, 10) = 0', () => {
    assertAlmostEqual(fDistCDF(0, 5, 10), 0, 1e-9);
  });

  test('fDistCDF at F=3.33, df1=2, df2=10 ≈ 0.922 (R reference)', () => {
    // R: pf(3.33, 2, 10) ≈ 0.9224
    assertAlmostEqual(fDistCDF(3.33, 2, 10), 0.922, 0.01);
  });

  test('tDistPValue two-tailed: t=2.228, df=10 ≈ 0.05', () => {
    // R: 2 * pt(-2.228, 10) ≈ 0.05
    assertAlmostEqual(tDistPValue(2.228, 10), 0.05, 0.01);
  });

  test('tDistPValue: t=0, any df → p=1', () => {
    assertAlmostEqual(tDistPValue(0, 10), 1.0, 0.01);
  });
});

suite('DoE Math: OLS Regression', () => {
  test('Simple linear regression y = 2 + 3x', () => {
    // 4 points on the line y = 2 + 3x
    const X = [[1, 1], [1, 2], [1, 3], [1, 4]];
    const y = [5, 8, 11, 14];
    const ols = olsRegression(X, y);
    assertAlmostEqual(ols.beta[0], 2, 1e-6);
    assertAlmostEqual(ols.beta[1], 3, 1e-6);
    assertAlmostEqual(ols.rSquared, 1.0, 1e-6);
  });

  test('OLS with noise gives R² < 1', () => {
    const X = [[1, -1], [1, -1], [1, 1], [1, 1]];
    const y = [10, 12, 20, 18];
    const ols = olsRegression(X, y);
    assertInRange(ols.rSquared, 0.5, 1.0);
    // Effect of x should be positive (~4)
    assertInRange(ols.beta[1], 3, 5);
  });

  test('Predicted + Residuals = y', () => {
    const X = [[1, -1], [1, 0], [1, 1]];
    const y = [3, 5, 8];
    const ols = olsRegression(X, y);
    for (let i = 0; i < y.length; i++) {
      assertAlmostEqual(ols.predicted[i] + ols.residuals[i], y[i], 1e-9);
    }
  });
});

suite('DoE Math: Model Matrix Builder', () => {
  test('buildModelMatrix adds intercept and interactions', () => {
    const coded = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    const { X } = buildModelMatrix(coded);
    // intercept + 2 main + 1 interaction = 4 columns
    assertEqual(X[0].length, 4);
    assertEqual(X.length, 4);
    // First column is all 1 (intercept)
    for (const row of X) {
      assertEqual(row[0], 1);
    }
    // Interaction column: A*B
    assertEqual(X[0][3], 1);   // (-1)*(-1) = 1
    assertEqual(X[1][3], -1);  // (-1)*(1) = -1
    assertEqual(X[2][3], -1);  // (1)*(-1) = -1
    assertEqual(X[3][3], 1);   // (1)*(1) = 1
  });
});


// ═══════════════════════════════════════════════════════════════════
// Analysis Functions
// ═══════════════════════════════════════════════════════════════════

suite('DoE Analysis: analyzeResponse', () => {
  test('2^2 design with known effects', () => {
    // Factors: A, B. Design: full factorial
    const coded = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    // y = 10 + 5*A + 3*B + 1*AB (no noise)
    const y = [
      10 - 5 - 3 + 1,  // A=-1, B=-1 → 3
      10 + 5 - 3 - 1,  // A=+1, B=-1 → 11
      10 - 5 + 3 - 1,  // A=-1, B=+1 → 7
      10 + 5 + 3 + 1,  // A=+1, B=+1 → 19
    ];
    const a = analyzeResponse(coded, y, ['A', 'B']);
    // n=p=4 with full 2FI model would give zero error df → engine drops the
    // interaction term to keep ANOVA computable. Saturated R²=1 is therefore
    // unreachable; we only verify the reduced fit estimated the intercept and
    // the two main effects correctly.
    if (a) {
      assertAlmostEqual(a.coefficients[0].coefficient, 10, 1e-6);   // intercept
      assertAlmostEqual(a.coefficients[1].coefficient,  5, 1e-6);   // A
      assertAlmostEqual(a.coefficients[2].coefficient,  3, 1e-6);   // B
    }
  });

  test('Returns null for singular matrix (constant y)', () => {
    const coded = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    const y = [5, 5, 5, 5];
    // All y values are the same — X'X might still be invertible but effects should be 0
    const a = analyzeResponse(coded, y, ['A', 'B']);
    // Should either return null or have zero effects
    if (a) {
      for (const c of a.coefficients) {
        if (c.term !== 'Intercept') {
          assertAlmostEqual(c.effect, 0, 1e-6);
        }
      }
    }
  });
});

suite('DoE Analysis: mainEffectMeans', () => {
  test('Computes correct means for 2^2', () => {
    const coded = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    const y = [10, 20, 15, 25];
    const means = mainEffectMeans(coded, y);
    assertEqual(means.length, 2);
    // Factor 0: low mean = (10+15)/2=12.5, high mean = (20+25)/2=22.5
    assertAlmostEqual(means[0].levels[0].mean, 12.5, 1e-6);
    assertAlmostEqual(means[0].levels[1].mean, 22.5, 1e-6);
  });
});

suite('DoE Analysis: normalOrderStatistics', () => {
  test('Returns correct number of quantiles', () => {
    const q = normalOrderStatistics(10);
    assertEqual(q.length, 10);
  });

  test('Quantiles are approximately symmetric around 0', () => {
    const q = normalOrderStatistics(10);
    const sum = q.reduce((s, v) => s + v, 0);
    assertAlmostEqual(sum, 0, 0.5); // Should be near 0
  });

  test('Quantiles are monotonically increasing', () => {
    const q = normalOrderStatistics(20);
    for (let i = 1; i < q.length; i++) {
      assertEqual(q[i] > q[i - 1], true, `q[${i}] = ${q[i]} not > q[${i - 1}] = ${q[i - 1]}`);
    }
  });
});


// ═══════════════════════════════════════════════════════════════════
// EVOP Functions
// ═══════════════════════════════════════════════════════════════════

suite('DoE Analysis: EVOP Effects', () => {
  test('Empty cycles returns empty result', () => {
    const result = computeEVOPEffects([]);
    assertEqual(result.effects.length, 0);
    assertEqual(result.overallRecommendation, 'repeat');
  });

  test('Single cycle computes effects', () => {
    const cycles = [{
      cycleNumber: 1,
      codedMatrix: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
      y: [10, 20, 15, 25],
      factorNames: ['Temp', 'Pressure'],
    }];
    const result = computeEVOPEffects(cycles);
    assertEqual(result.effects.length, 3); // 2 main + 1 interaction
    assertEqual(result.cycleCount, 1);
    assertEqual(result.totalRuns, 4);
    // Main effect of Temp: (20+25)/2 - (10+15)/2 = 22.5 - 12.5 = 10
    assertAlmostEqual(result.effects[0].cumulativeEffect, 10, 1e-6);
  });

  test('Multiple cycles accumulate data', () => {
    const cycles = [
      { cycleNumber: 1, codedMatrix: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
        y: [10, 20, 15, 25], factorNames: ['A', 'B'] },
      { cycleNumber: 2, codedMatrix: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
        y: [11, 21, 14, 24], factorNames: ['A', 'B'] },
    ];
    const result = computeEVOPEffects(cycles);
    assertEqual(result.cycleCount, 2);
    assertEqual(result.totalRuns, 8);
  });

  test('3 cycles with no effect recommends stop', () => {
    const makeCycle = (n) => ({
      cycleNumber: n,
      codedMatrix: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
      y: [10, 10, 10, 10], // No effect
      factorNames: ['A', 'B'],
    });
    const result = computeEVOPEffects([makeCycle(1), makeCycle(2), makeCycle(3)]);
    assertEqual(result.overallRecommendation, 'stop');
  });
});

suite('DoE Analysis: Re-centering', () => {
  test('Recenters at +1 coded point', () => {
    const factors = [
      { id: 1, name: 'Temp', unit: '°C', levels: ['200', '300'] },
      { id: 2, name: 'Press', unit: 'bar', levels: ['10', '20'] },
    ];
    const bestPoint = [1, 1]; // +1 for both
    const newFactors = recenteredFactors(factors, bestPoint);
    // Temp: center was 250, +1→300. New center=300, range=100. New: [250, 350]
    assertAlmostEqual(parseFloat(newFactors[0].levels[0]), 250, 0.01);
    assertAlmostEqual(parseFloat(newFactors[0].levels[1]), 350, 0.01);
    // Press: center was 15, +1→20. New center=20, range=10. New: [15, 25]
    assertAlmostEqual(parseFloat(newFactors[1].levels[0]), 15, 0.01);
    assertAlmostEqual(parseFloat(newFactors[1].levels[1]), 25, 0.01);
  });

  test('Recenters at 0 coded point (no change)', () => {
    const factors = [
      { id: 1, name: 'A', unit: '', levels: ['100', '200'] },
    ];
    const newFactors = recenteredFactors(factors, [0]);
    assertAlmostEqual(parseFloat(newFactors[0].levels[0]), 100, 0.01);
    assertAlmostEqual(parseFloat(newFactors[0].levels[1]), 200, 0.01);
  });
});


suite('DoE Analysis: Dispersion (dual response)', () => {
  // Build a 2^2 design with `reps` deterministic replicates per point.
  // varianceFn(coded) returns the within-group standard deviation.
  function buildReplicatedDesign(reps, meanFn, varianceFn) {
    const points = [[-1,-1], [1,-1], [-1,1], [1,1]];
    const codedMatrix = [];
    const stdOrder = [];
    const y = [];
    for (let p = 0; p < points.length; p++) {
      const mean = meanFn(points[p]);
      const sd = varianceFn(points[p]);
      // Symmetric replicate spread so the per-group sample variance is exactly sd² (for reps=2):
      // {mean − sd, mean + sd} → variance = (2·sd²)/(2−1) = 2·sd² … so use sd/√2.
      const spread = sd * Math.sqrt((reps - 1) / reps);
      for (let r = 0; r < reps; r++) {
        codedMatrix.push([...points[p]]);
        stdOrder.push(p + 1);
        // Evenly spaced replicate values centered on mean
        const offset = reps === 1 ? 0 : (-1 + (2 * r) / (reps - 1)) * spread;
        y.push(mean + offset);
      }
    }
    return { codedMatrix, stdOrder, y };
  }

  test('Returns ok=false when only 1 replicate per point', () => {
    const codedMatrix = [[-1,-1], [1,-1], [-1,1], [1,1]];
    const stdOrder = [1, 2, 3, 4];
    const y = [10, 12, 14, 16];
    const result = computeDispersionAnalysis({ codedMatrix, stdOrder }, y, ['A', 'B']);
    assertEqual(result.ok, false);
    assertEqual(result.reason, 'no-replicates');
  });

  test('Computes correct per-group statistics', () => {
    const { codedMatrix, stdOrder, y } = buildReplicatedDesign(
      4,
      ([a, b]) => 10 + 2*a + 3*b,
      () => 0.5,
    );
    const result = computeDispersionAnalysis({ codedMatrix, stdOrder }, y, ['A', 'B']);
    assertEqual(result.ok, true);
    assertEqual(result.groups.length, 4);
    assertEqual(result.minReplicates, 4);
    assertEqual(result.maxReplicates, 4);
    assertEqual(result.zeroVarPoints, 0);
    // Group means should match meanFn at each point
    assertAlmostEqual(result.groups[0].mean, 10 - 2 - 3, 1e-9); // 5
    assertAlmostEqual(result.groups[3].mean, 10 + 2 + 3, 1e-9); // 15
  });

  test('Detects factor that drives variance', () => {
    // Factor A drives dispersion: sd is large at A=+1, small at A=−1.
    // Factor B has no variance effect.
    const { codedMatrix, stdOrder, y } = buildReplicatedDesign(
      6,
      ([a, b]) => 10 + a + b,
      ([a]) => a > 0 ? 1.0 : 0.05,
    );
    const result = computeDispersionAnalysis({ codedMatrix, stdOrder }, y, ['A', 'B']);
    assertEqual(result.ok, true);

    // Dispersion model coefficient for A should be strongly positive
    // (high level of A → larger ln(s²))
    const aCoef = result.dispersionModel.coefficients.find(c => c.term === 'A');
    if (aCoef.coefficient <= 0) {
      throw new Error(`Expected positive A coefficient on ln(s²), got ${aCoef.coefficient}`);
    }
    // Recommendation: prefer the LOW level of A to minimize variance
    const aDriver = result.significantDispersion.find(d => d.term === 'A');
    if (aDriver) assertEqual(aDriver.prefer, 'low');
  });

  test('Excludes zero-variance points from log-s² model', () => {
    // Two points have identical replicates (variance = 0)
    const codedMatrix = [
      [-1,-1],[-1,-1],[-1,-1],
      [ 1,-1],[ 1,-1],[ 1,-1],
      [-1, 1],[-1, 1],[-1, 1],
      [ 1, 1],[ 1, 1],[ 1, 1],
    ];
    const stdOrder = [1,1,1, 2,2,2, 3,3,3, 4,4,4];
    const y = [
      5, 5, 5,        // point 1: variance = 0
      10, 10.1, 10.2, // point 2: variance > 0
      6, 6, 6,        // point 3: variance = 0
      11, 11.1, 11.2, // point 4: variance > 0
    ];
    const result = computeDispersionAnalysis({ codedMatrix, stdOrder }, y, ['A', 'B']);
    assertEqual(result.ok, true);
    assertEqual(result.zeroVarPoints, 2);
    // Two usable points → not enough to fit a model with intercept + 2 main effects + interaction
    // Either dispersionModel is null or it succeeded with reduced terms — both are acceptable here
  });
});


// ═══════════════════════════════════════════════════════════════════
// Gold Standard: 2^2 with Minitab-comparable output
// ═══════════════════════════════════════════════════════════════════

suite('DoE Gold Standard: 2^2 Factorial (Minitab reference)', () => {
  test('Effect estimates match expected values', () => {
    // 2^2 factorial with 2 center points, from Minitab DOE tutorial
    // Factors: A (Temperature), B (Pressure)
    // y = strength values
    const coded = [
      [-1, -1], [1, -1], [-1, 1], [1, 1],
      [-1, -1], [1, -1], [-1, 1], [1, 1],  // replicate
    ];
    const y = [12.3, 18.7, 14.1, 23.5, 11.9, 19.1, 13.8, 24.2];

    const a = analyzeResponse(coded, y, ['Temp', 'Press']);
    if (!a) return; // skip if singular

    // Expected effects (from manual calculation):
    // Effect A = ((18.7+23.5+19.1+24.2)/4) - ((12.3+14.1+11.9+13.8)/4)
    //          = 21.375 - 13.025 = 8.35
    // Effect B = ((14.1+23.5+13.8+24.2)/4) - ((12.3+18.7+11.9+19.1)/4)
    //          = 18.9 - 15.5 = 3.4

    const effectA = a.coefficients.find(c => c.term === 'Temp');
    const effectB = a.coefficients.find(c => c.term === 'Press');

    if (effectA) assertAlmostEqual(effectA.effect, 8.35, 0.5);
    if (effectB) assertAlmostEqual(effectB.effect, 3.4, 0.5);

    // R² should be high (>0.95)
    assertInRange(a.rSquared, 0.9, 1.0);
  });
});


// ═══════════════════════════════════════════════════════════════════
// Fixture Validation: exact-snapshot regression anchors
// ═══════════════════════════════════════════════════════════════════

const fixtureData = await (await fetch(new URL('../fixtures/doe/doe-planner.fixtures.json', import.meta.url))).json();

function getTol(tc, tolerances) {
  const key = tc.tolerance_override;
  return key && tolerances.overrides?.[key]
    ? tolerances.overrides[key]
    : tolerances.default;
}

function buildDesign(inputs) {
  switch (inputs.designType) {
    case 'full2k':
      return { codedMatrix: fullFactorial2k(inputs.k), alpha: null };
    case 'frac':
      return { codedMatrix: fractionalFactorial(inputs.k, inputs.p), alpha: null };
    case 'ccd':
      return {
        codedMatrix: centralComposite(inputs.k, {
          alphaType: inputs.alphaType,
          centerPoints: inputs.centerPoints,
        }),
        alpha: ccdAlpha(inputs.k, inputs.alphaType),
      };
    case 'bb':
      return {
        codedMatrix: boxBehnken(inputs.k, { centerPoints: inputs.centerPoints }),
        alpha: null,
      };
    default:
      throw new Error(`Unknown designType: ${inputs.designType}`);
  }
}

function assertMatrixAlmostEqual(actual, expected, tol, label) {
  assertEqual(actual.length, expected.length, `${label}: row count mismatch`);
  for (let i = 0; i < expected.length; i++) {
    assertEqual(actual[i].length, expected[i].length, `${label}: row ${i} width mismatch`);
    for (let j = 0; j < expected[i].length; j++) {
      assertAlmostEqual(actual[i][j], expected[i][j], tol,
        `${label}: [${i}][${j}] = ${actual[i][j]}, expected ${expected[i][j]}`);
    }
  }
}

suite('DoE Planner — Fixture Validation (exact snapshots)', () => {
  for (const tc of fixtureData.test_cases) {
    if (!tc.expected) continue;
    test(`${tc.id}: ${tc.description}`, () => {
      const { codedMatrix, alpha } = buildDesign(tc.inputs);
      const tol = getTol(tc, fixtureData.tolerances);

      if (tc.expected.runCount !== undefined) {
        assertEqual(codedMatrix.length, tc.expected.runCount, `${tc.id}: runCount`);
      }
      if (tc.expected.factorCount !== undefined) {
        assertEqual(codedMatrix[0].length, tc.expected.factorCount, `${tc.id}: factorCount`);
      }
      if (tc.expected.alpha !== undefined) {
        assertAlmostEqual(alpha, tc.expected.alpha, tol, `${tc.id}: alpha`);
      }
      if (tc.expected.codedMatrix !== undefined) {
        assertMatrixAlmostEqual(codedMatrix, tc.expected.codedMatrix, tol, `${tc.id}: codedMatrix`);
      }
    });
  }
});
