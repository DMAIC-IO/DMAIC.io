/**
 * D.Mike — Normality Test Engine Fixture Validation
 * Validates all normality tests (AD, SW, JB, DP) against SciPy reference values.
 * This catches bugs like the normalCDF scaling error that produced A²=5.04 on normal data.
 */

import { suite, test, assertAlmostEqual } from '../test-utils.js';
import {
  andersonDarling, shapiroWilk, jarqueBera, dagostinoPearson,
} from '../../js/engines/normality-test-engine.js';

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

function assertExpected(result, expected, tol, id) {
  for (const [key, val] of Object.entries(expected)) {
    if (typeof val === 'number') {
      assertAlmostEqual(result[key], val, tol,
        `${id}: ${key} = ${result[key]}, expected ${val}`);
    }
  }
}

function testErrorCase(tc, fn) {
  test(`${tc.id}: should throw — ${tc.description}`, () => {
    let threw = false;
    try { fn(tc.inputs.data); }
    catch { threw = true; }
    if (!threw) throw new Error(`${tc.id}: expected error but none thrown`);
  });
}

// ─── Anderson-Darling ──────────────────────────────────────────

const adData = await loadFixture('../fixtures/hypothesis/anderson-darling.fixtures.json');

suite('Normality — Anderson-Darling (fixture validation)', () => {
  for (const tc of adData.test_cases) {
    if (tc.expected && Object.keys(tc.expected).length > 0) {
      test(`${tc.id}: ${tc.description}`, () => {
        const result = andersonDarling(tc.inputs.data);
        assertExpected(result, tc.expected, getTol(tc, adData.tolerances), tc.id);
      });
    }
    if (tc.expected_error) testErrorCase(tc, andersonDarling);
  }
});

// ─── Shapiro-Wilk ──────────────────────────────────────────────

const swData = await loadFixture('../fixtures/hypothesis/shapiro-wilk.fixtures.json');

suite('Normality — Shapiro-Wilk (fixture validation)', () => {
  for (const tc of swData.test_cases) {
    if (tc.expected && Object.keys(tc.expected).length > 0) {
      test(`${tc.id}: ${tc.description}`, () => {
        const result = shapiroWilk(tc.inputs.data);
        assertExpected(result, tc.expected, getTol(tc, swData.tolerances), tc.id);
      });
    }
    if (tc.expected_error) testErrorCase(tc, shapiroWilk);
  }
});

// ─── Jarque-Bera ───────────────────────────────────────────────

const jbData = await loadFixture('../fixtures/hypothesis/jarque-bera.fixtures.json');

suite('Normality — Jarque-Bera (fixture validation)', () => {
  for (const tc of jbData.test_cases) {
    if (tc.expected && Object.keys(tc.expected).length > 0) {
      test(`${tc.id}: ${tc.description}`, () => {
        const result = jarqueBera(tc.inputs.data);
        assertExpected(result, tc.expected, getTol(tc, jbData.tolerances), tc.id);
      });
    }
    if (tc.expected_error) testErrorCase(tc, jarqueBera);
  }
});

// ─── D'Agostino-Pearson ────────────────────────────────────────

const dpData = await loadFixture('../fixtures/hypothesis/dagostino-pearson.fixtures.json');

suite('Normality — D\'Agostino-Pearson (fixture validation)', () => {
  for (const tc of dpData.test_cases) {
    if (tc.expected && Object.keys(tc.expected).length > 0) {
      test(`${tc.id}: ${tc.description}`, () => {
        const result = dagostinoPearson(tc.inputs.data);
        assertExpected(result, tc.expected, getTol(tc, dpData.tolerances), tc.id);
      });
    }
    if (tc.expected_error) testErrorCase(tc, dagostinoPearson);
  }
});
