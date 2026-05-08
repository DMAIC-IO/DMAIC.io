/**
 * Verify all three demo datasets converge and produce sensible results.
 * Run: ~/.local/node/bin/node tests/glm-demo-verify.mjs
 */

import { fitGLM, buildGLMDesignMatrix, DEMO_DATASETS, computeROC, overdispersionCheck } from '../js/engines/glm-engine.js';

let passed = 0, failed = 0;
function assertTrue(c, l) { if (!c) { console.error(`  FAIL: ${l}`); failed++; } else { console.log(`  OK:   ${l}`); passed++; } }

for (const [key, demo] of Object.entries(DEMO_DATASETS)) {
  console.log(`\nDemo: ${key} (family: ${demo.family})`);

  const xNames = Object.keys(demo.x);
  const columns = xNames.map(name => ({
    values: [...demo.x[name]],
    name: demo.xNames[name] || name,
    categorical: false,
  }));

  const { X, terms } = buildGLMDesignMatrix(columns);
  const result = fitGLM(X, demo.y, { familyName: demo.family, terms, confLevel: 0.95 });

  assertTrue(result.converged, `converges in ${result.iterations} iterations`);
  assertTrue(result.deviance < result.nullDeviance, 'deviance < null deviance');
  assertTrue(result.stdErrors.every(se => se > 0 && isFinite(se)), 'all SE > 0 and finite');
  assertTrue(result.pValues.every(p => p >= 0 && p <= 1), 'all p ∈ [0,1]');
  assertTrue(result.pseudoR2.mcfadden >= 0, `McFadden R² ≥ 0: ${result.pseudoR2.mcfadden.toFixed(4)}`);
  const kParams = result.p + (result.thetaEstimated ? 1 : 0);
  assertTrue(Math.abs(result.aic - (-2 * result.logLikelihood + 2 * kParams)) < 0.01,
             `AIC = -2LL + 2(p+${result.thetaEstimated ? 1 : 0})`);

  // Deviance residual sum-of-squares = deviance
  const drs = result.devianceResiduals.reduce((s, d) => s + d*d, 0);
  assertTrue(Math.abs(drs - result.deviance) < 0.01, `Σ(devResid²) = deviance (${drs.toFixed(2)} ≈ ${result.deviance.toFixed(2)})`);

  // Family-specific checks
  if (demo.family === 'binomial') {
    assertTrue(result.oddsRatios !== null, 'odds ratios present');
    const roc = computeROC(demo.y, result.fittedValues);
    assertTrue(roc.auc >= 0.5, `AUC ≥ 0.5: ${roc.auc.toFixed(4)}`);
    console.log(`  Coefficients: ${result.coefficients.map(c => c.toFixed(4)).join(', ')}`);
    console.log(`  OR: ${result.oddsRatios.slice(1).map(o => o.or.toFixed(4)).join(', ')}`);
  }

  if (demo.family === 'poisson') {
    assertTrue(result.rateRatios !== null, 'rate ratios present');
    const od = overdispersionCheck(result.pearsonResiduals, result.n, result.p);
    console.log(`  χ²/df = ${od.ratio.toFixed(3)} (overdispersed: ${od.overdispersed})`);
    console.log(`  Coefficients: ${result.coefficients.map(c => c.toFixed(4)).join(', ')}`);
    console.log(`  RR: ${result.rateRatios.slice(1).map(o => o.rr.toFixed(4)).join(', ')}`);
  }

  if (demo.family === 'negbin') {
    assertTrue(result.family.theta > 0, `θ estimated > 0: ${result.family.theta?.toFixed(3)}`);
    assertTrue(result.rateRatios !== null, 'rate ratios present');
    console.log(`  θ = ${result.family.theta?.toFixed(3)}`);
    console.log(`  Coefficients: ${result.coefficients.map(c => c.toFixed(4)).join(', ')}`);
    console.log(`  RR: ${result.rateRatios.slice(1).map(o => o.rr.toFixed(4)).join(', ')}`);
  }
}

console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
