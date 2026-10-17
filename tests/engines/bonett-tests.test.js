/**
 * D.Mike — Bonett variance tests: unit tests (white paper) and fixture validation.
 */

import { suite, test, assertAlmostEqual, assertEqual } from '../test-utils.js';
import { trimmedMean, bonettKurtosis, bonettRatioCI } from '../../js/engines/bonett-engine.js';
import { bonettVarianceTest } from '../../js/engines/hypothesis-test-engine.js';

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
    assertAlmostEqual(r.pValue, 1.4877933929774e-9, 1e-6);
  });
  test('p is finite for a hypothesized variance far above s²', () => {
    const r = bonettVarianceTest(x, 1e6 * bonettVarianceTest(x, 1).sampleVariance);
    assertEqual(Number.isFinite(r.pValue), true);
  });
  test('n = 3 still yields a CI', () => {
    const r = bonettVarianceTest([1, 2, 4], 1);
    assertEqual(r.ci[0] > 0 && r.ci[1] > r.ci[0], true);
  });
  test('one-sided "less" leaves the lower CI end open', () => {
    const r = bonettVarianceTest(x, 4, 'less');
    assertEqual(r.ci[0], null);
    assertEqual(r.ciSigma[0], null);
  });
});
