/**
 * D.Mike — Hypothesis Test Engine Fixture Validation
 * Validates all hypothesis tests against SciPy reference values.
 */

import { suite, test, assertAlmostEqual, assertEqual } from '../test-utils.js';
import {
  chiSquareVarianceTest, fTest, leveneTest,
  oneSampleTTest, twoSampleTTest, welchTTest,
  wilcoxonSignedRank, mannWhitneyU, hodgesLehmann,
  powerOneSampleT, powerTwoSampleT, findRequiredN,
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
    } else if (typeof val === 'boolean' || typeof val === 'string') {
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

suite('Hypothesis — Mann-Whitney U (targeted)', () => {
  test('all values tied: p = 1, z = 0, normal method', () => {
    const r = mannWhitneyU([5, 5, 5], [5, 5]);
    assertEqual(r.pValue, 1, 'p');
    assertEqual(r.z, 0, 'z');
    assertEqual(r.method, 'normal', 'method');
  });
  test('swapping the groups keeps the two-sided p', () => {
    const a = [12.4, 13.1, 11.8, 14.2, 13.7, 12.9, 15.0, 13.3];
    const b = [11.2, 12.0, 10.7, 12.6, 11.5, 13.0, 10.9];
    assertAlmostEqual(mannWhitneyU(a, b).pValue, mannWhitneyU(b, a).pValue, { relative: 1e-12, absolute: 1e-15 }, 'p');
  });
});

// ─── Hodges-Lehmann ────────────────────────────────────────────

const hlData = await loadFixture('../fixtures/hypothesis/hodges-lehmann.fixtures.json');

suite('Hypothesis — Hodges-Lehmann (fixture validation)', () => {
  for (const tc of hlData.test_cases) {
    if (tc.expected && Object.keys(tc.expected).length > 0) {
      test(`${tc.id}: ${tc.description}`, () => {
        const { data1, data2, alpha } = tc.inputs;
        const result = hodgesLehmann(data1, data2, alpha);
        assertFields(result, tc.expected, getTol(tc, hlData.tolerances), tc.id);
      });
    }
    if (tc.expected_error) {
      test(`${tc.id}: should throw — ${tc.description}`, () => {
        let msg = null;
        try { hodgesLehmann(tc.inputs.data1, tc.inputs.data2, tc.inputs.alpha); }
        catch (e) { msg = e.message; }
        if (msg == null) throw new Error(`${tc.id}: expected error`);
        if (!msg.includes(tc.expected_error.message_contains)) throw new Error(`${tc.id}: message "${msg}"`);
      });
    }
  }
});

/** Deterministic LCG in [0, 1). */
function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296; };
}

suite('Hypothesis — Hodges-Lehmann (targeted)', () => {
  test('exact, tie-free: 0 ∈ CI ⇔ p > α on 20 datasets', () => {
    for (let k = 0; k < 20; k++) {
      const rnd = lcg(1000 + k);
      const n1 = 4 + (k % 9), n2 = 5 + ((k * 7) % 11);
      const shift = (k % 5) * 0.4;
      // continuous values: ties have probability ~0
      const x = Array.from({ length: n1 }, () => rnd() * 3 + shift);
      const y = Array.from({ length: n2 }, () => rnd() * 3);
      const hl = hodgesLehmann(x, y, 0.05);
      const mw = mannWhitneyU(x, y, 'two-sided', 0.05);
      assertEqual(hl.method, 'exact', `case ${k}: method`);
      const contains0 = hl.lower <= 0 && hl.upper >= 0;
      assertEqual(contains0, mw.pValue > 0.05, `case ${k}: CI [${hl.lower}, ${hl.upper}] vs p ${mw.pValue}`);
    }
  });

  test('boundary: n = 49 exact, n = 50 normal, one tie → normal', () => {
    const seq = n => Array.from({ length: n }, (_, i) => i * 1.01 + 0.3);
    assertEqual(hodgesLehmann(seq(49), [100.5, 101.5], 0.05).method, 'exact', 'n=49');
    assertEqual(hodgesLehmann(seq(50), [100.5, 101.5], 0.05).method, 'normal', 'n=50');
    assertEqual(hodgesLehmann([1, 2, 3], [3, 4, 5], 0.05).method, 'normal', 'tie');
  });

  test('swapping the groups negates estimate and CI', () => {
    const a = [12.4, 13.1, 11.8, 14.2, 13.7, 12.9, 15.0, 13.3];
    const b = [11.2, 12.0, 10.7, 12.6, 11.5, 13.0, 10.9];
    const ab = hodgesLehmann(a, b), ba = hodgesLehmann(b, a);
    const tol = { relative: 1e-12, absolute: 1e-12 };
    assertAlmostEqual(ba.estimate, -ab.estimate, tol, 'estimate');
    assertAlmostEqual(ba.lower, -ab.upper, tol, 'lower');
    assertAlmostEqual(ba.upper, -ab.lower, tol, 'upper');
  });

  test('n1 = n2 = 500 runs in under 200 ms', () => {
    const rnd = lcg(7);
    const x = Array.from({ length: 500 }, () => rnd());
    const y = Array.from({ length: 500 }, () => rnd());
    const t0 = performance.now();
    const r = hodgesLehmann(x, y, 0.05);
    const ms = performance.now() - t0;
    assertEqual(r.method, 'normal', 'method');
    if (ms > 200) throw new Error(`took ${ms.toFixed(0)} ms`);
  });
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

// ─── Power (noncentral t) ──────────────────────────────────────
// Exact references: R power.t.test and scipy.stats.nct (computed 2026-09-24).
// Book review Melzer 2019, finding C2-008: the shifted central t understates
// power at small n.

suite('Hypothesis — t-test power (exact, noncentral t)', () => {
  const cases = [
    { fn: () => powerTwoSampleT(20, 20, 1, 1, 0.05, 'two-sided'), expected: 0.8689530, desc: '2-sample n=20, d=1 (R power.t.test)' },
    { fn: () => powerOneSampleT(3, 2, 1, 0.05, 'two-sided'),      expected: 0.4707494, desc: '1-sample n=3, d=2' },
    { fn: () => powerOneSampleT(3, 1, 1, 0.05, 'two-sided'),      expected: 0.1792554, desc: '1-sample n=3, d=1' },
    { fn: () => powerOneSampleT(5, 1, 1, 0.05, 'two-sided'),      expected: 0.4013899, desc: '1-sample n=5, d=1' },
    { fn: () => powerOneSampleT(5, 2, 1, 0.05, 'two-sided'),      expected: 0.9088849, desc: '1-sample n=5, d=2' },
    { fn: () => powerTwoSampleT(3, 3, 2, 1, 0.05, 'two-sided'),   expected: 0.4626408, desc: '2-sample n=3, d=2' },
    { fn: () => powerTwoSampleT(5, 5, 1, 1, 0.05, 'two-sided'),   expected: 0.2862955, desc: '2-sample n=5, d=1' },
    { fn: () => powerOneSampleT(10, 0.5, 1, 0.05, 'greater'),     expected: 0.4272898, desc: '1-sample n=10, d=0.5, greater' },
    { fn: () => powerOneSampleT(10, -0.5, 1, 0.05, 'less'),       expected: 0.4272898, desc: '1-sample n=10, d=−0.5, less' },
    { fn: () => powerOneSampleT(10, 0.5, 1, 0.05, 'less'),        expected: 0.0009128, desc: '1-sample n=10, d=0.5, less (wrong direction)' },
  ];
  for (const c of cases) {
    test(c.desc, () => assertAlmostEqual(c.fn(), c.expected, 1e-6));
  }
  test('required n, 1-sample d=0.5, 90 % power is 44', () => {
    assertEqual(findRequiredN(0.9, n => powerOneSampleT(n, 0.5, 1, 0.05, 'two-sided')), 44);
  });
});
