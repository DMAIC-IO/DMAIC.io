/**
 * D.Mike — Hypothesis Test Engine Fixture Validation
 * Validates all hypothesis tests against SciPy reference values.
 */

import { suite, test, assertAlmostEqual, assertEqual } from '../test-utils.js';
import {
  chiSquareVarianceTest, fTest, leveneTest,
  oneSampleTTest, twoSampleTTest, welchTTest,
  wilcoxonSignedRank, mannWhitneyU,
} from '../../js/engines/hypothesis-test-engine.js';

// ─── Generic helpers ───────────────────────────────────────────

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

function assertFields(result, expected, tol, id) {
  for (const [key, val] of Object.entries(expected)) {
    if (typeof val === 'number') {
      assertAlmostEqual(result[key], val, tol, `${id}: ${key} = ${result[key]}, expected ${val}`);
    } else if (typeof val === 'boolean') {
      assertEqual(result[key], val, `${id}: ${key} = ${result[key]}, expected ${val}`);
    }
  }
}

// ─── Chi-Square Variance ───────────────────────────────────────

const chi2Data = await loadFixture('../fixtures/hypothesis/chi-square-variance.fixtures.json');

suite('Hypothesis — Chi-Square Variance Test (fixture validation)', () => {
  for (const tc of chi2Data.test_cases) {
    if (tc.expected && Object.keys(tc.expected).length > 0) {
      test(`${tc.id}: ${tc.description}`, () => {
        const { data, sigma0Sq, direction, alpha } = tc.inputs;
        const result = chiSquareVarianceTest(data, sigma0Sq, direction, alpha);
        assertFields(result, tc.expected, getTol(tc, chi2Data.tolerances), tc.id);
      });
    }
    if (tc.expected_error) {
      test(`${tc.id}: should throw — ${tc.description}`, () => {
        let threw = false;
        try { chiSquareVarianceTest(tc.inputs.data, tc.inputs.sigma0Sq, tc.inputs.direction, tc.inputs.alpha); }
        catch { threw = true; }
        if (!threw) throw new Error(`${tc.id}: expected error`);
      });
    }
  }
});

// ─── F-Test ────────────────────────────────────────────────────

const fData = await loadFixture('../fixtures/hypothesis/f-test.fixtures.json');

suite('Hypothesis — F-Test (fixture validation)', () => {
  for (const tc of fData.test_cases) {
    if (tc.expected && Object.keys(tc.expected).length > 0) {
      test(`${tc.id}: ${tc.description}`, () => {
        const { data1, data2, direction, alpha } = tc.inputs;
        const result = fTest(data1, data2, direction, alpha);
        assertFields(result, tc.expected, getTol(tc, fData.tolerances), tc.id);
      });
    }
  }
});

// ─── Levene Test ───────────────────────────────────────────────

const levData = await loadFixture('../fixtures/hypothesis/levene-test.fixtures.json');

suite('Hypothesis — Levene Test (fixture validation)', () => {
  for (const tc of levData.test_cases) {
    if (tc.expected && Object.keys(tc.expected).length > 0) {
      test(`${tc.id}: ${tc.description}`, () => {
        const { data1, data2, alpha } = tc.inputs;
        const result = leveneTest(data1, data2, alpha);
        assertFields(result, tc.expected, getTol(tc, levData.tolerances), tc.id);
      });
    }
  }
});

// ─── One-Sample t-Test ─────────────────────────────────────────

const os1Data = await loadFixture('../fixtures/hypothesis/one-sample-t-test.fixtures.json');

suite('Hypothesis — One-Sample t-Test (fixture validation)', () => {
  for (const tc of os1Data.test_cases) {
    if (tc.expected && Object.keys(tc.expected).length > 0) {
      test(`${tc.id}: ${tc.description}`, () => {
        const { data, mu0, direction, alpha } = tc.inputs;
        const result = oneSampleTTest(data, mu0, direction, alpha);
        assertFields(result, tc.expected, getTol(tc, os1Data.tolerances), tc.id);
      });
    }
  }
});

// ─── Two-Sample t-Test ─────────────────────────────────────────

const ts2Data = await loadFixture('../fixtures/hypothesis/two-sample-t-test.fixtures.json');

suite('Hypothesis — Two-Sample t-Test (fixture validation)', () => {
  for (const tc of ts2Data.test_cases) {
    if (tc.expected && Object.keys(tc.expected).length > 0) {
      test(`${tc.id}: ${tc.description}`, () => {
        const { data1, data2, direction, alpha } = tc.inputs;
        const result = twoSampleTTest(data1, data2, direction, alpha);
        assertFields(result, tc.expected, getTol(tc, ts2Data.tolerances), tc.id);
      });
    }
  }
});

// ─── Welch t-Test ──────────────────────────────────────────────

const welchFixtures = await loadFixture('../fixtures/hypothesis/welch-t-test.fixtures.json');

suite('Hypothesis — Welch t-Test (fixture validation)', () => {
  for (const tc of welchFixtures.test_cases) {
    if (tc.expected && Object.keys(tc.expected).length > 0) {
      test(`${tc.id}: ${tc.description}`, () => {
        const { data1, data2, direction, alpha } = tc.inputs;
        const result = welchTTest(data1, data2, direction, alpha);
        assertFields(result, tc.expected, getTol(tc, welchFixtures.tolerances), tc.id);
      });
    }
  }
});

// ─── Mann-Whitney U ────────────────────────────────────────────

const mwData = await loadFixture('../fixtures/hypothesis/mann-whitney-u.fixtures.json');

suite('Hypothesis — Mann-Whitney U (fixture validation)', () => {
  for (const tc of mwData.test_cases) {
    if (tc.expected && Object.keys(tc.expected).length > 0) {
      test(`${tc.id}: ${tc.description}`, () => {
        const { data1, data2, direction, alpha } = tc.inputs;
        const result = mannWhitneyU(data1, data2, direction, alpha);
        assertFields(result, tc.expected, getTol(tc, mwData.tolerances), tc.id);
      });
    }
  }
});

// ─── Wilcoxon Signed-Rank ──────────────────────────────────────

const wilcData = await loadFixture('../fixtures/hypothesis/wilcoxon-signed-rank.fixtures.json');

suite('Hypothesis — Wilcoxon Signed-Rank (fixture validation)', () => {
  for (const tc of wilcData.test_cases) {
    if (tc.expected && Object.keys(tc.expected).length > 0) {
      test(`${tc.id}: ${tc.description}`, () => {
        const { data, mu0, direction, alpha } = tc.inputs;
        const result = wilcoxonSignedRank(data, mu0, direction, alpha);
        assertFields(result, tc.expected, getTol(tc, wilcData.tolerances), tc.id);
      });
    }
  }
});
