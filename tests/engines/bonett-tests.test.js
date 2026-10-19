/**
 * D.Mike — Bonett variance tests: unit tests (white paper) and fixture validation.
 */

import { suite, test, assertAlmostEqual, assertEqual } from '../test-utils.js';
import { trimmedMean, bonettKurtosis, bonettRatioCI } from '../../js/engines/bonett-engine.js';
import { bonettVarianceTest, bonettRatioTest } from '../../js/engines/hypothesis-test-engine.js';

const Z975 = 1.959963984540054;

suite('Bonett — helpers', () => {
  test('trimmedMean trims floor(n·p) values per tail', () => {
    assertAlmostEqual(trimmedMean([1, 2, 3, 4, 5, 6, 7, 8, 9, 100], 1 / (2 * Math.sqrt(6))), 5.5, 1e-12);
  });
  test('bonettKurtosis uses the plain mean for n <= 5', () => {
    const x = [1, 2, 4, 7, 11], m = 5;
    const num = 5 * x.reduce((s, v) => s + (v - m) ** 4, 0);
    const den = x.reduce((s, v) => s + (v - m) ** 2, 0) ** 2;
    assertAlmostEqual(bonettKurtosis(x), num / den, 1e-12);
  });
});

suite('Bonett — ratio CI from summary statistics (Banga & Fox 2013)', () => {
  test('example 1: two roots, CI [0.253, 8.634]', () => {
    const r = bonettRatioCI({ n1: 10, n2: 12, var1: 1.150 ** 2, var2: 1.043 ** 2, kurt1: 2.704, kurt2: 3.671 }, Z975);
    assertEqual(r.roots.length, 2);
    assertAlmostEqual(r.roots[0], 0.200, { absolute: 0.0005 });
    assertAlmostEqual(r.roots[1], 6.824, { absolute: 0.002 });
    assertAlmostEqual(r.lower, 0.253, { absolute: 0.0005 });
    assertAlmostEqual(r.upper, 8.634, { absolute: 0.005 });
  });
  test('example 2: four roots, hull [0.001, 124.07]', () => {
    const r = bonettRatioCI({ n1: 169, n2: 7, var1: 301.855 ** 2, var2: 4606.170 ** 2, kurt1: 1.877, kurt2: 6.761 }, Z975);
    assertEqual(r.roots.length, 4);
    // Middle roots are ill-conditioned w.r.t. the paper's 3-decimal inputs (relative tolerance, ledgered ruling).
    assertAlmostEqual(r.roots[1], 3.282, { relative: 1e-2 });
    assertAlmostEqual(r.roots[2], 10.194, { relative: 1e-2 });
    assertAlmostEqual(r.roots[3], 39685.0, { relative: 1e-3 });
    assertAlmostEqual(r.upper, 124.072, { absolute: 0.05 });
  });
});

async function loadFixture(path) {
  const resp = await fetch(new URL(path, import.meta.url));
  return resp.json();
}

function getTol(tc, tolerances) {
  const key = tc.tolerance_override;
  return key && tolerances.overrides?.[key] ? tolerances.overrides[key] : tolerances.default;
}

/** Like assertFields in hypothesis-tests.test.js, plus arrays with null ends (one-sided CIs). */
function assertBonettFields(result, expected, tol, id) {
  for (const [key, val] of Object.entries(expected)) {
    if (Array.isArray(val)) {
      val.forEach((v, i) => {
        if (v === null) assertEqual(result[key][i], null, `${id}: ${key}[${i}] should be null`);
        else assertAlmostEqual(result[key][i], v, tol, `${id}: ${key}[${i}] = ${result[key][i]}, expected ${v}`);
      });
    } else if (val === null) {
      assertEqual(result[key], null, `${id}: ${key} should be null`);
    } else if (typeof val === 'number') {
      assertAlmostEqual(result[key], val, tol, `${id}: ${key} = ${result[key]}, expected ${val}`);
    } else {
      assertEqual(result[key], val, `${id}: ${key} = ${result[key]}, expected ${val}`);
    }
  }
}

function runFixtureSuite(name, fixture, run) {
  suite(name, () => {
    for (const tc of fixture.test_cases) {
      if (tc.expected) {
        test(`${tc.id}: ${tc.description}`, () => {
          assertBonettFields(run(tc.inputs), tc.expected, getTol(tc, fixture.tolerances), tc.id);
        });
      }
      if (tc.expected_error) {
        test(`${tc.id}: should throw — ${tc.description}`, () => {
          let msg = null;
          try { run(tc.inputs); } catch (e) { msg = e.message; }
          if (msg === null) throw new Error(`${tc.id}: expected error`);
          if (!msg.includes(tc.expected_error.message_contains)) throw new Error(`${tc.id}: wrong error "${msg}"`);
        });
      }
    }
  });
}

const bvData = await loadFixture('../fixtures/hypothesis/bonett-variance.fixtures.json');
runFixtureSuite('Bonett — 1 variance (fixture validation)', bvData,
  ({ data, sigma0Sq, direction, alpha }) => bonettVarianceTest(data, sigma0Sq, direction, alpha));

suite('Bonett — 1 variance edge cases', () => {
  const x = [2.1, 3.4, 1.9, 8.7, 2.5, 3.0, 2.2, 4.1, 2.8, 15.3];
  test('p is finite and tiny for a hypothesized variance far below s²', () => {
    const r = bonettVarianceTest(x, 1e-6 * bonettVarianceTest(x, 1).sampleVariance);
    assertEqual(Number.isFinite(r.pValue), true);
    // Python reference: 2 * 7.4389669648871e-10 (never exactly 0 for this sample)
    assertAlmostEqual(r.pValue, 1.4877933929774e-9, { relative: 1e-6 });
  });
  test('p is finite for a hypothesized variance far above s²', () => {
    const r = bonettVarianceTest(x, 1e6 * bonettVarianceTest(x, 1).sampleVariance);
    assertEqual(Number.isFinite(r.pValue), true);
  });
  test('n = 3 still yields a CI', () => {
    const r = bonettVarianceTest([1, 2, 4], 1);
    assertEqual(r.ci[0] > 0 && r.ci[1] > r.ci[0], true);
  });
  test('sigma0Sq within 1e-12 of s² gives p close to 1, not 0', () => {
    const s2 = bonettVarianceTest(x, 1).sampleVariance;
    for (const f of [1 - 1e-12, 1 + 1e-12]) {
      const r = bonettVarianceTest(x, s2 * f);
      assertEqual(r.pValue > 0.99, true);
      assertEqual(r.reject, false);
    }
  });
  test('sigma0Sq = 1.04 against s² = 1.0400000000000005 gives p close to 1', () => {
    const r = bonettVarianceTest([5.1, 5.3, 5.5, 5.7, 5.9, 7.9], 1.04);
    assertEqual(r.pValue > 0.99, true);
    assertEqual(r.reject, false);
  });
  test('n = 3 sample with sigma0Sq = 0.04 gives a sane p', () => {
    const r = bonettVarianceTest([1.1, 1.3, 1.5], 0.04);
    assertEqual(r.pValue > 0, true);
  });
  test('one-sided "less" leaves the lower CI end open', () => {
    const r = bonettVarianceTest(x, 4, 'less');
    assertEqual(r.ci[0], null);
    assertEqual(r.ciSigma[0], null);
  });
});

const brData = await loadFixture('../fixtures/hypothesis/bonett-ratio.fixtures.json');
runFixtureSuite('Bonett — 2 variances (fixture validation)', brData,
  ({ data1, data2, direction, alpha }) => bonettRatioTest(data1, data2, direction, alpha));

suite('Bonett — 2 variances edge cases', () => {
  const a = [1.2, 3.4, 2.2, 9.8, 2.9, 3.1, 2.4, 4.7];
  const b = [2.0, 2.4, 2.1, 2.9, 2.2, 2.6, 2.3, 2.5];
  test('balanced: statistic T₂ and two-sided p = 2·min(one-sided)', () => {
    const r2 = bonettRatioTest(a, b, 'two-sided');
    const rg = bonettRatioTest(a, b, 'greater');
    const rl = bonettRatioTest(a, b, 'less');
    assertEqual(r2.statistic > 0, true);
    assertAlmostEqual(r2.pValue, 2 * Math.min(rg.pValue, rl.pValue), { relative: 1e-12 });
  });
  test('unbalanced: no statistic, finite p', () => {
    const r = bonettRatioTest(a, b.slice(0, 6));
    assertEqual(r.statistic, null);
    assertEqual(Number.isFinite(r.pValue), true);
  });
  test('"greater" leaves the upper CI end open', () => {
    assertEqual(bonettRatioTest(a, b, 'greater').ci[1], null);
  });
  test('unbalanced ratio just below and just above 1 gives p close to 1', () => {
    const b6 = b.slice(0, 6);
    const v1 = bonettRatioTest(a, b6).variance1, v2 = bonettRatioTest(a, b6).variance2;
    const scale = (f) => { const k = Math.sqrt(v2 / v1 * f); return a.map(t => t * k); };
    for (const f of [1 - 2e-9, 1 + 2e-9]) {
      const r = bonettRatioTest(scale(f), b6);
      assertEqual(r.pValue > 0.99, true);
      assertEqual(r.reject, false);
    }
  });
  test('throws when a sample size does not exceed z', () => {
    let msg = '';
    try { bonettRatioTest([1, 2, 5, 9, 3, 4, 4, 6], [1, 3, 2.5], 'two-sided', 0.001); } catch (e) { msg = e.message; }
    assertEqual(msg.includes('n > z'), true);
  });
});
