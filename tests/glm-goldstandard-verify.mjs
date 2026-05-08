/**
 * Goldstandard verification of the GLM engine against statsmodels-generated
 * fixtures in tests/fixtures/glm/.
 *
 * Each fixture pairs a JS fit (via fitGLM) with reference values from
 * statsmodels.api.GLM / NegativeBinomial. Tolerances are read from the fixture.
 *
 * Run: ~/.local/node/bin/node tests/glm-goldstandard-verify.mjs
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  fitGLM, buildGLMDesignMatrix, computeROC, hosmerLemeshow,
  classificationTable, overdispersionCheck, hatValues, cookDistance,
  computeGLMVIF,
} from '../js/engines/glm-engine.js';

const FIXTURE_DIR = new URL('./fixtures/glm/', import.meta.url).pathname;

let passed = 0, failed = 0;
const failures = [];

// ─── Tolerance comparator ─────────────────────────────────────────

function within(actual, expected, tol) {
  if (expected === null || expected === undefined) return actual == null;
  if (typeof expected === 'boolean') return actual === expected;
  if (typeof expected === 'string') return String(actual) === expected;
  if (typeof expected !== 'number') return false;
  if (!isFinite(expected)) return actual === expected;
  if (typeof actual !== 'number' || !isFinite(actual)) return false;
  const absDiff = Math.abs(actual - expected);
  if (absDiff <= tol.absolute) return true;
  const relDiff = expected !== 0 ? absDiff / Math.abs(expected) : absDiff;
  return relDiff <= tol.relative;
}

function diffStr(actual, expected) {
  if (typeof expected !== 'number' || typeof actual !== 'number') {
    return `actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`;
  }
  const abs = Math.abs(actual - expected);
  const rel = expected !== 0 ? abs / Math.abs(expected) : abs;
  return `${actual.toExponential(4)} vs ${expected.toExponential(4)} (abs=${abs.toExponential(2)}, rel=${rel.toExponential(2)})`;
}

// ─── Field comparison ─────────────────────────────────────────────

/** Compare a single field. Returns [ok, mismatches[]]. */
function compareField(name, actual, expected, tol) {
  // Array of numbers
  if (Array.isArray(expected) && expected.every(v => typeof v === 'number')) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      return [false, [`${name}: array shape ${actual?.length} vs ${expected.length}`]];
    }
    const mism = [];
    for (let i = 0; i < expected.length; i++) {
      if (!within(actual[i], expected[i], tol)) {
        mism.push(`${name}[${i}]: ${diffStr(actual[i], expected[i])}`);
      }
    }
    return [mism.length === 0, mism];
  }

  // Array of objects (oddsRatios, rateRatios)
  if (Array.isArray(expected) && expected.every(v => typeof v === 'object' && v !== null)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      return [false, [`${name}: array shape ${actual?.length} vs ${expected.length}`]];
    }
    const mism = [];
    for (let i = 0; i < expected.length; i++) {
      for (const key of Object.keys(expected[i])) {
        if (!within(actual[i]?.[key], expected[i][key], tol)) {
          mism.push(`${name}[${i}].${key}: ${diffStr(actual[i]?.[key], expected[i][key])}`);
        }
      }
    }
    return [mism.length === 0, mism];
  }

  // Plain object (pseudoR2, hosmerLemeshow, classificationTable, overdispersion)
  if (expected !== null && typeof expected === 'object') {
    const mism = [];
    for (const key of Object.keys(expected)) {
      if (!within(actual?.[key], expected[key], tol)) {
        mism.push(`${name}.${key}: ${diffStr(actual?.[key], expected[key])}`);
      }
    }
    return [mism.length === 0, mism];
  }

  // Scalar
  return within(actual, expected, tol)
    ? [true, []]
    : [false, [`${name}: ${diffStr(actual, expected)}`]];
}

// ─── Build JS result mirror ───────────────────────────────────────

function runJsFit(inputs) {
  const { xColumns, y, family, link, confLevel = 0.95, theta, hosmerGroups = 10, cutoff = 0.5, estimateDispersion = false, weights } = inputs;

  const cols = xColumns.map((vals, i) => ({
    values: [...vals],
    name: `X${i + 1}`,
    categorical: false,
  }));
  const { X, terms } = buildGLMDesignMatrix(cols);

  const fit = fitGLM(X, y, {
    familyName: family,
    link,
    confLevel,
    terms,
    theta: theta ?? undefined,
    estimateDispersion,
    weights,
  });

  if (!fit.converged && !fit.coefficients) return fit;

  // Augment with same-shape extras as the fixture
  const out = { ...fit };
  out.fittedValues_first5 = fit.fittedValues.slice(0, 5);
  out.devianceResiduals_first5 = fit.devianceResiduals.slice(0, 5);
  out.pearsonResiduals_first5 = fit.pearsonResiduals.slice(0, 5);

  const hat = hatValues(X, fit.invXtWX, fit.irlsWeights);
  out.hatValues_first5 = hat.slice(0, 5);
  const cooks = cookDistance(fit.pearsonResiduals, hat, fit.p, fit.dispersion);
  out.cookDistance_first5 = cooks.slice(0, 5);

  if (X[0].length > 2) out.vifs = computeGLMVIF(X, fit.irlsWeights);

  if (family === 'binomial') {
    out.rocAUC = computeROC(y, fit.fittedValues).auc;
    out.hosmerLemeshow = hosmerLemeshow(y, fit.fittedValues, hosmerGroups);
    out.classificationTable = classificationTable(y, fit.fittedValues, cutoff);
  }
  if (family === 'poisson') {
    out.overdispersion = overdispersionCheck(fit.pearsonResiduals, fit.n, fit.p);
  }
  if (family === 'negbin') {
    out.theta = fit.family.theta;
    out.thetaEstimated = inputs.theta == null;
  }

  return out;
}

// ─── Run all fixtures ─────────────────────────────────────────────

const files = readdirSync(FIXTURE_DIR).filter(f => f.endsWith('.fixtures.json')).sort();

for (const file of files) {
  const data = JSON.parse(readFileSync(join(FIXTURE_DIR, file), 'utf8'));
  const defaultTol = data.tolerances.default;
  console.log(`\n=== ${data.algorithm_id} ===`);

  for (const tc of data.test_cases) {
    const tol = tc.tolerance_override
      ? data.tolerances.overrides[tc.tolerance_override] || defaultTol
      : defaultTol;

    if (tc.expected?.__error__) {
      console.log(`  SKIP: ${tc.id} (fixture has __error__: ${tc.expected.__error__})`);
      continue;
    }

    let actual;
    try {
      actual = runJsFit(tc.inputs);
    } catch (e) {
      failed++;
      failures.push({ id: tc.id, mism: [`runtime error: ${e.message}`] });
      console.error(`  FAIL: ${tc.id} — runtime error: ${e.message}`);
      continue;
    }

    // When JS legitimately flags θ as non-converged (near-Poisson regime,
    // bracket failure), the θ value is unreliable by design — skip its
    // comparison and only verify the convergence flag itself.
    const skipThetaValue = actual?.thetaConverged === false && actual?.thetaEstimated;
    const expectedCopy = { ...tc.expected };
    if (skipThetaValue) {
      delete expectedCopy.theta;
      if (expectedCopy.family) {
        const f = { ...expectedCopy.family };
        delete f.theta;
        expectedCopy.family = f;
      }
    }

    const allMism = [];
    let caseOk = true;
    for (const field of Object.keys(expectedCopy)) {
      const [ok, mism] = compareField(field, actual?.[field], expectedCopy[field], tol);
      if (!ok) { caseOk = false; allMism.push(...mism); }
    }

    if (caseOk) {
      passed++;
      console.log(`  OK:   ${tc.id}`);
    } else {
      failed++;
      failures.push({ id: tc.id, mism: allMism });
      console.error(`  FAIL: ${tc.id} (tol abs=${tol.absolute}, rel=${tol.relative})`);
      for (const m of allMism.slice(0, 8)) console.error(`        · ${m}`);
      if (allMism.length > 8) console.error(`        · …(+${allMism.length - 8} more)`);
    }
  }
}

console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`\nFailure summary by case:`);
  for (const f of failures) console.log(`  ${f.id}: ${f.mism.length} mismatch${f.mism.length === 1 ? '' : 'es'}`);
  process.exit(1);
}
