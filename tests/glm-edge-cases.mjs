/**
 * GLM engine edge-case behaviour. Headless via:
 *   ~/.local/node/bin/node tests/glm-edge-cases.mjs
 *
 * Each block exercises a corner case that's easy to break during refactors:
 *   - constant y (no information)
 *   - perfect collinearity in X
 *   - n right at the parameter boundary (n = p, n = p+1)
 *   - very large counts (Poisson with y up to 1e6)
 *   - all-zero Poisson response
 *   - quasi-complete separation (binomial)
 *   - categorical predictor with reference level only
 *   - single-class binary y
 *   - grouped binomial with weights[i] = 1 (should equal Bernoulli)
 */

import { fitGLM, buildGLMDesignMatrix, hosmerLemeshow, computeROC } from '../js/engines/glm-engine.js';

let passed = 0, failed = 0;

function expect(cond, label) {
  if (cond) { passed++; console.log(`  OK:   ${label}`); }
  else      { failed++; console.error(`  FAIL: ${label}`); }
}

function design(xCols) {
  return buildGLMDesignMatrix(xCols.map((c, i) => ({
    values: c.values,
    name: c.name || `X${i + 1}`,
    categorical: !!c.categorical,
  })));
}

// ─── 1. Constant y (binomial) ─────────────────────────────────────
console.log('\n1. Binomial with constant y → degenerate, should converge via plateau bypass');
{
  const y = [0,0,0,0,0,0,0,0];
  const x = [1,2,3,4,5,6,7,8];
  const { X, terms } = design([{ values: x }]);
  const r = fitGLM(X, y, { familyName: 'binomial', terms });
  expect(r.converged, 'converged via plateau bypass');
  expect(r.coefficients.every(b => isFinite(b)), 'β values finite');
}

// ─── 2. Perfect collinearity → singular X'WX ──────────────────────
console.log('\n2. Perfect collinearity in X → fit reports error: singular');
{
  const y = [1, 2, 3, 4, 5, 6];
  const x1 = [1, 2, 3, 4, 5, 6];
  const x2 = [2, 4, 6, 8, 10, 12]; // = 2 · x1
  const { X, terms } = design([{ values: x1 }, { values: x2 }]);
  const r = fitGLM(X, y, { familyName: 'poisson', terms });
  expect(!r.converged && r.error === 'singular', `singular detected: ${r.error}`);
}

// ─── 3. n = p (under-identified) ──────────────────────────────────
console.log('\n3. n = p (under-identified) → singular, no β');
{
  const y = [1, 2, 3]; // n = 3
  const { X, terms } = design([{ values: [1, 2, 3] }, { values: [4, 5, 6] }]); // p = 3 (incl. intercept)
  const r = fitGLM(X, y, { familyName: 'poisson', terms });
  expect(!r.converged || r.error === 'singular' || r.iterations >= 50,
         `flagged as problematic: converged=${r.converged}, error=${r.error}`);
}

// ─── 4. n = p + 1 (just identifiable) ─────────────────────────────
console.log('\n4. n = p + 1 → fits but with df=0 for residuals');
{
  const y = [1, 3, 2, 5];
  const { X, terms } = design([{ values: [1, 2, 3, 4] }, { values: [2, 1, 4, 3] }]);
  const r = fitGLM(X, y, { familyName: 'poisson', terms });
  expect(r.converged, 'converged');
  expect(r.n - r.p === 1, `df = n − p = 1: ${r.n - r.p}`);
}

// ─── 5. Very large Poisson counts (y up to 1e6) ───────────────────
console.log('\n5. Poisson with large counts (y up to 1e6) → no overflow');
{
  const y = [100, 1000, 10_000, 100_000, 1_000_000];
  const x = [1, 2, 3, 4, 5];
  const { X, terms } = design([{ values: x }]);
  const r = fitGLM(X, y, { familyName: 'poisson', terms });
  expect(r.converged, 'converged');
  expect(r.coefficients.every(b => isFinite(b)), 'β finite for large counts');
  expect(isFinite(r.logLikelihood), `logLik finite: ${r.logLikelihood}`);
  // Deviance can drop slightly below zero through float roundoff for huge counts;
  // require it to be at most a few ulps negative.
  expect(isFinite(r.deviance) && r.deviance > -1e-6, `deviance ≳ 0: ${r.deviance}`);
}

// ─── 6. All-zero Poisson response ─────────────────────────────────
console.log('\n6. All-zero Poisson y → β at boundary, plateau bypass');
{
  const y = [0, 0, 0, 0, 0, 0];
  const x = [1, 2, 3, 4, 5, 6];
  const { X, terms } = design([{ values: x }]);
  const r = fitGLM(X, y, { familyName: 'poisson', terms });
  expect(r.converged, 'converged via plateau bypass');
  // μ ≈ 0 and deviance ≈ 0 for the saturated model
  expect(Math.abs(r.deviance) < 1e-6, `deviance ≈ 0: ${r.deviance}`);
}

// ─── 7. Quasi-complete separation (binomial) ──────────────────────
console.log('\n7. Quasi-complete separation → separationStrong flag');
{
  const y = [0, 0, 0, 0, 1, 1, 1, 1];
  const x = [1, 2, 3, 4, 6, 7, 8, 9]; // gap between 4 and 6 → separator
  const { X, terms } = design([{ values: x }]);
  const r = fitGLM(X, y, { familyName: 'binomial', terms });
  expect(r.separationDetected || r.separationStrong, 'separation flagged');
}

// ─── 8. Categorical with all observations in reference level ──────
console.log('\n8. Categorical predictor with only one observed level');
{
  const y = [1, 2, 3, 4];
  const cat = ['A', 'A', 'A', 'A'];
  const { X, terms } = design([{ values: cat, categorical: true }]);
  expect(terms.length === 1, `only intercept survives (no dummies): terms=${JSON.stringify(terms)}`);
  expect(X[0].length === 1, 'X has only intercept column');
  const r = fitGLM(X, y, { familyName: 'poisson', terms });
  expect(r.converged, 'intercept-only converges');
}

// ─── 9. Single-class binary y ─────────────────────────────────────
console.log('\n9. Single-class binary y → caller must reject (engine fits to bound)');
{
  const y = [1, 1, 1, 1, 1, 1];
  const x = [1, 2, 3, 4, 5, 6];
  const { X, terms } = design([{ values: x }]);
  const r = fitGLM(X, y, { familyName: 'binomial', terms });
  // Engine itself converges via plateau (μ → 1); module wraps with errorNotBinary.
  expect(r.converged, 'engine converges (module is responsible for the user-facing reject)');
}

// ─── 10. Grouped binomial with weights[i] = 1 ≡ Bernoulli ─────────
console.log('\n10. Grouped binomial with all weights = 1 should equal plain binary fit');
{
  const y = [0, 1, 0, 1, 1, 0, 1, 0];
  const x = [1, 2, 3, 4, 5, 6, 7, 8];
  const { X, terms } = design([{ values: x }]);
  const rBinary  = fitGLM(X, y, { familyName: 'binomial', terms });
  const rWeighted = fitGLM(X, y, { familyName: 'binomial', terms, weights: y.map(_ => 1) });
  const dBeta = rBinary.coefficients.map((b, j) => Math.abs(b - rWeighted.coefficients[j]));
  expect(Math.max(...dBeta) < 1e-9, `β identical: max|Δβ|=${Math.max(...dBeta).toExponential(2)}`);
}

// ─── 11. HL test below threshold → skipped flag ───────────────────
console.log('\n11. HL with n < 5·g_eff → skipped, not erroring');
{
  const probs = [0.1, 0.3, 0.5, 0.7];
  const yT = [0, 1, 0, 1];
  const r = hosmerLemeshow(yT, probs, 10);
  expect(r.skipped === true, `skipped: ${r.skipped}`);
  expect(r.groups === 0 && r.statistic === 0, `groups=0, statistic=0`);
}

// ─── 12. ROC with all-equal probabilities → AUC = 0.5 ─────────────
console.log('\n12. ROC with all-equal probabilities → AUC = 0.5');
{
  const yT = [0, 0, 1, 1, 0, 1];
  const probs = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
  const r = computeROC(yT, probs);
  expect(Math.abs(r.auc - 0.5) < 1e-9, `AUC=${r.auc}`);
  expect(r.fpr.length === 2, `single tie-collapsed step + origin: fpr length ${r.fpr.length}`);
}

// ─── Summary ──────────────────────────────────────────────────────
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
