/**
 * D.Mike — Regression Engine Fixture Validation
 * Validates ANOVA and coefficient calculations against reference values.
 */

import { suite, test, assertAlmostEqual } from '../test-utils.js';
import { runMultiRegression } from '../../js/engines/regression-engine.js';

async function loadFixture(path) {
  const resp = await fetch(new URL(path, import.meta.url));
  return resp.json();
}

function getTol(tc, tolerances) {
  const key = tc.tolerance_override;
  return key && tolerances.overrides?.[key]
    ? tolerances.overrides[key]
    : tolerances.default;
}

// ─── Regression ANOVA ──────────────────────────────────────────

const anovaData = await loadFixture('../fixtures/regression/regression-anova.fixtures.json');

suite('Regression — ANOVA (fixture validation)', () => {
  for (const tc of anovaData.test_cases) {
    if (tc.expected && Object.keys(tc.expected).length > 0) {
      test(`${tc.id}: ${tc.description}`, () => {
        const { xColumns, yValues, degree, xNames } = tc.inputs;
        const confLevel = tc.inputs.confLevel || 0.95;
        const result = runMultiRegression(xColumns, yValues, degree, confLevel, xNames);
        const tol = getTol(tc, anovaData.tolerances);

        for (const [key, val] of Object.entries(tc.expected)) {
          if (typeof val === 'number') {
            assertAlmostEqual(result[key], val, tol,
              `${tc.id}: ${key} = ${result[key]}, expected ${val}`);
          }
        }
      });
    }

    if (tc.expected_error) {
      test(`${tc.id}: should throw — ${tc.description}`, () => {
        let threw = false;
        try {
          const { xColumns, yValues, degree, xNames } = tc.inputs;
          runMultiRegression(xColumns, yValues, degree, tc.inputs.confLevel || 0.95, xNames);
        } catch { threw = true; }
        if (!threw) throw new Error(`${tc.id}: expected error`);
      });
    }
  }
});

// ─── Regression Coefficients ───────────────────────────────────

const coeffData = await loadFixture('../fixtures/regression/regression-coefficients.fixtures.json');

suite('Regression — Coefficients (fixture validation)', () => {
  for (const tc of coeffData.test_cases) {
    if (tc.expected && Object.keys(tc.expected).length > 0) {
      test(`${tc.id}: ${tc.description}`, () => {
        const { xColumns, yValues, degree, confLevel, xNames } = tc.inputs;
        const result = runMultiRegression(xColumns, yValues, degree, confLevel || 0.95, xNames);
        const tol = getTol(tc, coeffData.tolerances);

        // coefDetails is an array of coefficient detail objects
        if (tc.expected.coefDetails && result.coefDetails) {
          for (let i = 0; i < tc.expected.coefDetails.length; i++) {
            const exp = tc.expected.coefDetails[i];
            const act = result.coefDetails[i];
            for (const [key, val] of Object.entries(exp)) {
              if (typeof val === 'number') {
                assertAlmostEqual(act[key], val, tol,
                  `${tc.id}: coef[${i}].${key} = ${act[key]}, expected ${val}`);
              }
            }
          }
        }
      });
    }

    if (tc.expected_error) {
      test(`${tc.id}: should throw — ${tc.description}`, () => {
        let threw = false;
        try {
          const { xColumns, yValues, degree, confLevel, xNames } = tc.inputs;
          runMultiRegression(xColumns, yValues, degree, confLevel || 0.95, xNames);
        } catch { threw = true; }
        if (!threw) throw new Error(`${tc.id}: expected error`);
      });
    }
  }
});
