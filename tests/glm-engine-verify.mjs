/**
 * Numerical verification of GLM engine via structural invariants
 * and analytically solvable test cases.
 * Run: ~/.local/node/bin/node tests/glm-engine-verify.mjs
 */

import { fitGLM, buildGLMDesignMatrix, autoDetect, computeROC, classificationTable, hosmerLemeshow, overdispersionCheck, hatValues, cookDistance, predictGLM } from '../js/engines/glm-engine.js';

let passed = 0;
let failed = 0;

function assertClose(actual, expected, tol, label) {
  const diff = Math.abs(actual - expected);
  if (diff > tol) {
    console.error(`  FAIL: ${label} = ${actual}, expected ${expected} (diff=${diff.toExponential(2)}, tol=${tol})`);
    failed++;
  } else {
    console.log(`  OK:   ${label} = ${typeof actual === 'number' ? actual.toFixed(6) : actual}`);
    passed++;
  }
}

function assertTrue(cond, label) {
  if (!cond) { console.error(`  FAIL: ${label}`); failed++; }
  else { console.log(`  OK:   ${label}`); passed++; }
}

// ═════════════════════════════════════════════════════════════════
// Test 1: Logistic regression — analytically solvable 2×2 table
// x = [0,0,0,0,1,1,1,1], y = [0,1,0,0,1,1,0,1]
// p(x=0) = 1/4 = 0.25 → logit(0.25) = log(1/3) = -1.09861
// p(x=1) = 3/4 = 0.75 → logit(0.75) = log(3) = 1.09861
// β₀ = -1.09861, β₁ = 2.19722
// ═════════════════════════════════════════════════════════════════
console.log('Test 1: Logistic regression — closed-form 2×2 table');

const x1 = [0,0,0,0,1,1,1,1];
const y1 = [0,1,0,0,1,1,0,1];
const { X: X1, terms: t1 } = buildGLMDesignMatrix([{ values: x1, name: 'X' }]);
const r1 = fitGLM(X1, y1, { familyName: 'binomial', terms: t1 });

assertTrue(r1.converged, 'converges');
assertClose(r1.coefficients[0], -1.09861, 0.01, 'β₀ = logit(0.25)');
assertClose(r1.coefficients[1], 2.19722, 0.02, 'β₁ = logit(0.75) - logit(0.25)');
assertClose(r1.fittedValues[0], 0.25, 0.001, 'μ(x=0) = 0.25');
assertClose(r1.fittedValues[4], 0.75, 0.001, 'μ(x=1) = 0.75');
assertTrue(r1.deviance < r1.nullDeviance, 'deviance < null deviance');
assertClose(r1.aic, -2 * r1.logLikelihood + 2 * r1.p, 0.001, 'AIC = -2LL + 2p');
assertTrue(r1.oddsRatios !== null, 'odds ratios computed');
assertClose(r1.oddsRatios[1].or, 9.0, 0.5, 'OR(X) = (0.75/0.25)/(0.25/0.75) = 9');

// ═════════════════════════════════════════════════════════════════
// Test 2: Poisson regression — intercept-only should give log(ȳ)
// y = [2,3,4,5,6], intercept-only → β₀ = log(mean(y)) = log(4)
// ═════════════════════════════════════════════════════════════════
console.log('\nTest 2: Poisson regression — intercept-only');

const y2 = [2,3,4,5,6];
const X2 = y2.map(() => [1]);
const r2 = fitGLM(X2, y2, { familyName: 'poisson', terms: ['Intercept'] });

assertTrue(r2.converged, 'converges');
assertClose(r2.coefficients[0], Math.log(4), 0.001, 'β₀ = log(ȳ)');
assertClose(r2.fittedValues[0], 4.0, 0.001, 'μ = ȳ = 4');
assertClose(r2.nullDeviance, r2.deviance, 0.001, 'null deviance = residual deviance (intercept-only)');

// ═════════════════════════════════════════════════════════════════
// Test 3: Poisson with predictor — structural checks
// ═════════════════════════════════════════════════════════════════
console.log('\nTest 3: Poisson regression — with predictor');

const x3 = [1,2,3,4,5,6,7,8,9,10];
const y3 = [1,1,2,3,5,2,3,6,4,8];
const { X: X3, terms: t3 } = buildGLMDesignMatrix([{ values: x3, name: 'Speed' }]);
const r3 = fitGLM(X3, y3, { familyName: 'poisson', terms: t3 });

assertTrue(r3.converged, 'converges');
assertTrue(r3.coefficients[1] > 0, 'positive slope (counts increase with speed)');
assertTrue(r3.deviance < r3.nullDeviance, 'model improves over null');
assertClose(r3.aic, -2 * r3.logLikelihood + 2 * r3.p, 0.001, 'AIC = -2LL + 2p');
assertTrue(r3.rateRatios !== null, 'rate ratios computed');
assertTrue(r3.rateRatios[1].rr > 1, 'RR > 1 (increasing rate)');

// Check fitted values are exp(Xβ)
for (let i = 0; i < y3.length; i++) {
  const expected = Math.exp(r3.coefficients[0] + r3.coefficients[1] * x3[i]);
  assertClose(r3.fittedValues[i], expected, 0.001, `μ[${i}] = exp(β₀+β₁x)`);
}

// ═════════════════════════════════════════════════════════════════
// Test 4: Deviance residual invariants
// Σ d_i (unit deviance) = total deviance
// ═════════════════════════════════════════════════════════════════
console.log('\nTest 4: Deviance residual consistency');

let sumDevSq = 0;
for (const dr of r3.devianceResiduals) sumDevSq += dr * dr;
assertClose(sumDevSq, r3.deviance, 0.001, 'Σ(devResid²) = deviance');

let sumDevSq1 = 0;
for (const dr of r1.devianceResiduals) sumDevSq1 += dr * dr;
assertClose(sumDevSq1, r1.deviance, 0.001, 'Σ(devResid²) = deviance (binomial)');

// ═════════════════════════════════════════════════════════════════
// Test 5: Pearson residuals — check sign matches y - μ
// ═════════════════════════════════════════════════════════════════
console.log('\nTest 5: Pearson residual signs');

let signOk = true;
for (let i = 0; i < r1.y.length; i++) {
  const expected = Math.sign(r1.y[i] - r1.fittedValues[i]);
  const actual = Math.sign(r1.pearsonResiduals[i]);
  if (expected !== 0 && expected !== actual) { signOk = false; break; }
}
assertTrue(signOk, 'Pearson residual signs match (y - μ)');

// ═════════════════════════════════════════════════════════════════
// Test 6: ROC curve — perfect separation case
// ═════════════════════════════════════════════════════════════════
console.log('\nTest 6: ROC curve — perfect separation');

const yRocPerf = [1,1,1,0,0,0];
const pRocPerf = [0.9,0.8,0.7,0.3,0.2,0.1];
const rocPerf = computeROC(yRocPerf, pRocPerf);
assertClose(rocPerf.auc, 1.0, 0.001, 'AUC = 1.0 (perfect separation)');

// Imperfect case
const yRocImp = [1,0,1,0,1,0];
const pRocImp = [0.6,0.7,0.8,0.3,0.2,0.4];
const rocImp = computeROC(yRocImp, pRocImp);
assertTrue(rocImp.auc >= 0 && rocImp.auc <= 1, `AUC in [0,1]: ${rocImp.auc.toFixed(4)}`);

// Tied probabilities — AUC depends on sort order, should be in [0,1]
const yRocRand = [1,0,1,0,1,0,1,0];
const pRocRand = [0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5];
const rocRand = computeROC(yRocRand, pRocRand);
assertTrue(rocRand.auc >= 0 && rocRand.auc <= 1, `AUC in [0,1] for tied probs: ${rocRand.auc.toFixed(4)}`);

// ═════════════════════════════════════════════════════════════════
// Test 7: Classification table
// ═════════════════════════════════════════════════════════════════
console.log('\nTest 7: Classification table');

const ct = classificationTable([1,1,0,0,1,0], [0.8,0.6,0.3,0.2,0.4,0.7], 0.5);
assertClose(ct.tp, 2, 0, 'TP = 2');
assertClose(ct.fn, 1, 0, 'FN = 1');
assertClose(ct.fp, 1, 0, 'FP = 1');
assertClose(ct.tn, 2, 0, 'TN = 2');
assertClose(ct.sensitivity, 2/3, 0.001, 'sens = 2/3');
assertClose(ct.specificity, 2/3, 0.001, 'spec = 2/3');
assertClose(ct.accuracy, 4/6, 0.001, 'acc = 4/6');

// ═════════════════════════════════════════════════════════════════
// Test 8: Hosmer-Lemeshow — structural checks
// ═════════════════════════════════════════════════════════════════
console.log('\nTest 8: Hosmer-Lemeshow');

// y1 has only 8 observations — too small for a meaningful HL test, so the
// engine should mark it skipped (n < 5·g even with g_eff reduced).
const hl = hosmerLemeshow(y1, r1.fittedValues, 4);
assertTrue(hl.skipped === true, `n=8 with g=4 → HL skipped: ${hl.skipped}`);
assertTrue(hl.groups === 0, `skipped → groups=0: ${hl.groups}`);

// And on a larger dataset (re-use Poisson r3 fitted values rounded to {0,1})
// to exercise the non-skip path. n=20 + g=4 → 5 obs/group, just enough.
const yLarge = Array.from({ length: 20 }, (_, i) => i % 2);
const probsLarge = Array.from({ length: 20 }, (_, i) => 0.05 + 0.04 * i);
const hlBig = hosmerLemeshow(yLarge, probsLarge, 4);
assertTrue(hlBig.statistic >= 0, `χ² ≥ 0: ${hlBig.statistic.toFixed(4)}`);
assertTrue(hlBig.df >= 1, `df ≥ 1: ${hlBig.df}`);
assertTrue(hlBig.pValue >= 0 && hlBig.pValue <= 1, `p ∈ [0,1]: ${hlBig.pValue.toFixed(4)}`);

// ═════════════════════════════════════════════════════════════════
// Test 9: Auto-detect
// ═════════════════════════════════════════════════════════════════
console.log('\nTest 9: Auto-detect');

assertClose(autoDetect([0,0,1,0,1,1]).familyName === 'binomial' ? 1 : 0, 1, 0, 'binary 0/1 → binomial');
assertClose(autoDetect([3,7,3,7,3]).familyName === 'binomial' ? 1 : 0, 1, 0, 'binary non-0/1 → binomial');
assertClose(autoDetect([2,5,3,1,4,2]).familyName === 'poisson' ? 1 : 0, 1, 0, 'low-var counts → poisson');
assertClose(autoDetect([2,50,3,80,7,120]).familyName === 'negbin' ? 1 : 0, 1, 0, 'high-var counts → negbin');

// ═════════════════════════════════════════════════════════════════
// Test 10: Negative binomial — θ estimation & convergence
// ═════════════════════════════════════════════════════════════════
console.log('\nTest 10: Negative binomial regression');

const x10 = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20];
const y10 = [2,5,1,18,7,3,25,6,15,4,22,3,1,30,10,6,20,4,11,8];
const { X: X10, terms: t10 } = buildGLMDesignMatrix([{ values: x10, name: 'X' }]);
const r10 = fitGLM(X10, y10, { familyName: 'negbin', terms: t10 });

assertTrue(r10.converged, 'converges');
assertTrue(r10.family.theta > 0, `θ > 0: ${r10.family.theta?.toFixed(3)}`);
assertTrue(r10.deviance < r10.nullDeviance || Math.abs(r10.deviance - r10.nullDeviance) < 5,
           'deviance reasonable');
// θ was estimated → AIC counts it as a free parameter (p+1).
const r10kParams = r10.p + (r10.thetaEstimated ? 1 : 0);
assertClose(r10.aic, -2 * r10.logLikelihood + 2 * r10kParams, 0.001,
            `AIC = -2LL + 2(p+${r10.thetaEstimated ? 1 : 0})`);

// ═════════════════════════════════════════════════════════════════
// Test 11: Hat values & Cook's distance
// ═════════════════════════════════════════════════════════════════
console.log('\nTest 11: Hat values & Cook\'s distance');

const hat1 = hatValues(X1, r1.invXtWX, r1.irlsWeights);
assertTrue(hat1.every(h => h >= 0 && h < 1), 'all hat values in [0,1)');
const sumH = hat1.reduce((s, h) => s + h, 0);
assertClose(sumH, r1.p, 0.5, `Σ h_ii ≈ p = ${r1.p}`);

const cook1 = cookDistance(r1.pearsonResiduals, hat1, r1.p);
assertTrue(cook1.every(c => c >= 0), 'all Cook\'s D ≥ 0');
assertTrue(cook1.every(c => isFinite(c)), 'all Cook\'s D finite');

// ═════════════════════════════════════════════════════════════════
// Test 12: Prediction — roundtrip on training data
// ═════════════════════════════════════════════════════════════════
console.log('\nTest 12: Prediction roundtrip');

const pred1 = predictGLM(r1, X1);
for (let i = 0; i < y1.length; i++) {
  assertClose(pred1.response[i], r1.fittedValues[i], 0.001, `pred[${i}] matches fitted`);
}
assertTrue(pred1.ciLower.every((ci, i) => ci <= pred1.response[i]), 'CI lower ≤ response');
assertTrue(pred1.ciUpper.every((ci, i) => ci >= pred1.response[i]), 'CI upper ≥ response');

// ═════════════════════════════════════════════════════════════════
// Test 13: Overdispersion check
// ═════════════════════════════════════════════════════════════════
console.log('\nTest 13: Overdispersion check');

const od = overdispersionCheck(r3.pearsonResiduals, r3.n, r3.p);
assertTrue(od.pearsonChi2 >= 0, `Pearson χ² ≥ 0: ${od.pearsonChi2.toFixed(4)}`);
assertTrue(od.df === r3.n - r3.p, `df = n - p: ${od.df}`);
assertTrue(od.ratio >= 0, `ratio ≥ 0: ${od.ratio.toFixed(4)}`);

// ═════════════════════════════════════════════════════════════════
// Test 14: Pseudo-R² ranges
// ═════════════════════════════════════════════════════════════════
console.log('\nTest 14: Pseudo-R² ranges');

assertTrue(r1.pseudoR2.mcfadden >= 0, `McFadden ≥ 0: ${r1.pseudoR2.mcfadden.toFixed(4)}`);
assertTrue(r1.pseudoR2.coxSnell >= 0, `Cox-Snell ≥ 0: ${r1.pseudoR2.coxSnell.toFixed(4)}`);
assertTrue(r1.pseudoR2.nagelkerke >= 0, `Nagelkerke ≥ 0: ${r1.pseudoR2.nagelkerke.toFixed(4)}`);
assertTrue(r1.pseudoR2.nagelkerke >= r1.pseudoR2.coxSnell - 0.001,
           'Nagelkerke ≥ Cox-Snell');
assertTrue(r1.pseudoR2.nagelkerke <= 1.001, 'Nagelkerke ≤ 1');

// ═════════════════════════════════════════════════════════════════
// Test 15: Standard errors are positive
// ═════════════════════════════════════════════════════════════════
console.log('\nTest 15: Standard errors');

assertTrue(r1.stdErrors.every(se => se > 0), 'all SE > 0 (binomial)');
assertTrue(r3.stdErrors.every(se => se > 0), 'all SE > 0 (poisson)');
assertTrue(r10.stdErrors.every(se => se > 0), 'all SE > 0 (negbin)');

// p-values in [0,1]
assertTrue(r1.pValues.every(p => p >= 0 && p <= 1), 'all p ∈ [0,1] (binomial)');
assertTrue(r3.pValues.every(p => p >= 0 && p <= 1), 'all p ∈ [0,1] (poisson)');

// ═════════════════════════════════════════════════════════════════
// Summary
// ═════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
