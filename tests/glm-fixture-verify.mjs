/**
 * Verify all GLM algorithm fixtures against the engine.
 * Run: ~/.local/node/bin/node tests/glm-fixture-verify.mjs
 */

import { readFileSync } from 'fs';
import {
  runLogisticRegression, runPoissonRegression, runNegBinRegression,
  computeROC, hosmerLemeshow, overdispersionCheck,
  fitGLM,
} from '../js/engines/glm-engine.js';

let passed = 0, failed = 0;

function compare(actual, expected, tol) {
  if (typeof expected === 'boolean') return actual === expected;
  if (typeof expected === 'string') {
    if (expected === 'Infinity') return actual === Infinity;
    if (expected === '-Infinity') return actual === -Infinity;
    if (expected === 'NaN') return Number.isNaN(actual);
    return String(actual) === expected;
  }
  if (typeof expected !== 'number') return false;
  if (!isFinite(expected)) return actual === expected;
  const absDiff = Math.abs(actual - expected);
  const relDiff = expected !== 0 ? absDiff / Math.abs(expected) : absDiff;
  return absDiff <= tol.absolute || relDiff <= tol.relative;
}

function getByPath(obj, path) {
  const parts = path.split('.');
  let val = obj;
  for (const p of parts) {
    if (val == null) return undefined;
    val = val[p];
  }
  return val;
}

function runFixtures(filePath, runFn) {
  const data = JSON.parse(readFileSync(filePath, 'utf8'));
  const defaultTol = data.tolerances.default;

  console.log(`\n=== ${data.algorithm_id} (${data.test_cases.length} cases) ===`);

  for (const tc of data.test_cases) {
    const tol = tc.tolerance_override
      ? data.tolerances.overrides[tc.tolerance_override] || defaultTol
      : defaultTol;

    let result;
    try {
      result = runFn(tc.inputs);
    } catch (e) {
      if (tc.expected_error) {
        const ok = e.constructor.name === tc.expected_error.type;
        if (ok) { passed++; console.log(`  OK:   ${tc.id} (expected error: ${e.constructor.name})`); }
        else { failed++; console.error(`  FAIL: ${tc.id} expected ${tc.expected_error.type}, got ${e.constructor.name}`); }
        continue;
      }
      failed++;
      console.error(`  FAIL: ${tc.id} threw: ${e.message}`);
      continue;
    }

    let tcPassed = true;
    const failures = [];

    for (const [key, expectedVal] of Object.entries(tc.expected)) {
      const actualVal = getByPath(result, key);

      if (Array.isArray(expectedVal)) {
        if (!Array.isArray(actualVal)) {
          failures.push(`${key}: expected array, got ${typeof actualVal}`);
          tcPassed = false;
          continue;
        }
        if (actualVal.length !== expectedVal.length) {
          failures.push(`${key}: length ${actualVal.length} ≠ ${expectedVal.length}`);
          tcPassed = false;
          continue;
        }
        for (let i = 0; i < expectedVal.length; i++) {
          if (typeof expectedVal[i] === 'object' && expectedVal[i] !== null) {
            for (const [sk, sv] of Object.entries(expectedVal[i])) {
              if (sv === null) continue;
              if (!compare(actualVal[i][sk], sv, tol)) {
                failures.push(`${key}[${i}].${sk}: ${actualVal[i]?.[sk]} ≠ ${sv}`);
                tcPassed = false;
              }
            }
          } else {
            if (!compare(actualVal[i], expectedVal[i], tol)) {
              failures.push(`${key}[${i}]: ${actualVal[i]} ≠ ${expectedVal[i]}`);
              tcPassed = false;
            }
          }
        }
      } else {
        if (!compare(actualVal, expectedVal, tol)) {
          failures.push(`${key}: ${actualVal} ≠ ${expectedVal}`);
          tcPassed = false;
        }
      }
    }

    if (tcPassed) {
      passed++;
      console.log(`  OK:   ${tc.id}`);
    } else {
      failed++;
      console.error(`  FAIL: ${tc.id}`);
      for (const f of failures) console.error(`        ${f}`);
    }
  }
}

// ── Logistic Regression ──
runFixtures('tests/fixtures/regression/logistic-regression.fixtures.json', (inputs) => {
  if (!inputs.xColumns || inputs.xColumns.length === 0) {
    const n = inputs.y.length;
    const X = Array.from({ length: n }, () => [1]);
    return fitGLM(X, inputs.y, { familyName: 'binomial', terms: ['Intercept'], confLevel: inputs.confLevel || 0.95 });
  }
  return runLogisticRegression(inputs.xColumns, inputs.y, inputs.confLevel || 0.95);
});

// ── Poisson Regression ──
runFixtures('tests/fixtures/regression/poisson-regression.fixtures.json', (inputs) => {
  if (!inputs.xColumns || inputs.xColumns.length === 0) {
    const n = inputs.y.length;
    const X = Array.from({ length: n }, () => [1]);
    return fitGLM(X, inputs.y, { familyName: 'poisson', terms: ['Intercept'], confLevel: inputs.confLevel || 0.95 });
  }
  return runPoissonRegression(inputs.xColumns, inputs.y, inputs.confLevel || 0.95);
});

// ── Negative Binomial ──
runFixtures('tests/fixtures/regression/negbin-regression.fixtures.json', (inputs) => {
  return runNegBinRegression(inputs.xColumns, inputs.y, inputs.confLevel || 0.95);
});

// ── ROC / AUC ──
runFixtures('tests/fixtures/regression/roc-auc.fixtures.json', (inputs) => {
  return computeROC(inputs.yTrue, inputs.probs);
});

// ── Hosmer-Lemeshow ──
runFixtures('tests/fixtures/regression/hosmer-lemeshow.fixtures.json', (inputs) => {
  return hosmerLemeshow(inputs.yTrue, inputs.probs, inputs.g || 10);
});

// ── Overdispersion Check ──
runFixtures('tests/fixtures/regression/overdispersion-check.fixtures.json', (inputs) => {
  return overdispersionCheck(inputs.pearsonResid, inputs.n, inputs.p);
});

console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
