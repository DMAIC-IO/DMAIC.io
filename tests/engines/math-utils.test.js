/**
 * D.Mike — Math-Utils Fixture Validation Tests
 * Validates math-utils.js functions against SciPy gold-standard reference values.
 * This test suite was created to prevent regression of the normalCDF bug
 * (A&S 7.1.26 argument scaling error) from going undetected.
 */

import { suite, test, assertAlmostEqual } from '../test-utils.js';
import {
  erf, normalCDF, normalQuantile,
  lnGamma, chi2CDF, tCDF, fCDF, digamma,
} from '../../js/engines/math-utils.js';

// ─── Load fixtures ─────────────────────────────────────────────

const fixtureResp = await fetch('../fixtures/distributions/math-utils.fixtures.json');
const fixtureData = await fixtureResp.json();
const cases = fixtureData.test_cases;
const tolerances = fixtureData.tolerances;

/** Resolve tolerance for a test case */
function getTolerance(tc) {
  const key = tc.tolerance_override;
  if (key && tolerances.overrides[key]) {
    return tolerances.overrides[key].absolute;
  }
  return tolerances.default.absolute;
}

/** Dispatch table: function name → JS function call */
const DISPATCH = {
  normalCDF:      (inp) => normalCDF(inp.x, inp.mu, inp.sigma),
  normalQuantile: (inp) => normalQuantile(inp.p),
  erf:            (inp) => erf(inp.x),
  chi2CDF:        (inp) => chi2CDF(inp.x, inp.df),
  tCDF:           (inp) => tCDF(inp.t, inp.df),
  fCDF:           (inp) => fCDF(inp.x, inp.dfn, inp.dfd),
  lnGamma:        (inp) => lnGamma(inp.x),
};

// ─── Test suites ───────────────────────────────────────────────

suite('Math-Utils — normalCDF (fixture validation)', () => {
  const normalCases = cases.filter(c => c.inputs.function === 'normalCDF');
  for (const tc of normalCases) {
    test(`${tc.id}: ${tc.description}`, () => {
      const actual = DISPATCH.normalCDF(tc.inputs);
      const tol = getTolerance(tc);
      assertAlmostEqual(actual, tc.expected.result, tol,
        `${tc.id}: normalCDF(${tc.inputs.x}) = ${actual}, expected ${tc.expected.result}`);
    });
  }
});

suite('Math-Utils — normalQuantile (fixture validation)', () => {
  const quantileCases = cases.filter(c => c.inputs.function === 'normalQuantile');
  for (const tc of quantileCases) {
    test(`${tc.id}: ${tc.description}`, () => {
      const actual = DISPATCH.normalQuantile(tc.inputs);
      const tol = getTolerance(tc);
      assertAlmostEqual(actual, tc.expected.result, tol,
        `${tc.id}: normalQuantile(${tc.inputs.p}) = ${actual}, expected ${tc.expected.result}`);
    });
  }
});

suite('Math-Utils — erf (fixture validation)', () => {
  const erfCases = cases.filter(c => c.inputs.function === 'erf');
  for (const tc of erfCases) {
    test(`${tc.id}: ${tc.description}`, () => {
      const actual = DISPATCH.erf(tc.inputs);
      const tol = getTolerance(tc);
      assertAlmostEqual(actual, tc.expected.result, tol,
        `${tc.id}: erf(${tc.inputs.x}) = ${actual}, expected ${tc.expected.result}`);
    });
  }
});

suite('Math-Utils — chi2CDF (fixture validation)', () => {
  const chi2Cases = cases.filter(c => c.inputs.function === 'chi2CDF');
  for (const tc of chi2Cases) {
    test(`${tc.id}: ${tc.description}`, () => {
      const actual = DISPATCH.chi2CDF(tc.inputs);
      const tol = getTolerance(tc);
      assertAlmostEqual(actual, tc.expected.result, tol,
        `${tc.id}: chi2CDF(${tc.inputs.x}, ${tc.inputs.df}) = ${actual}, expected ${tc.expected.result}`);
    });
  }
});

suite('Math-Utils — tCDF (fixture validation)', () => {
  const tCases = cases.filter(c => c.inputs.function === 'tCDF');
  for (const tc of tCases) {
    test(`${tc.id}: ${tc.description}`, () => {
      const actual = DISPATCH.tCDF(tc.inputs);
      const tol = getTolerance(tc);
      assertAlmostEqual(actual, tc.expected.result, tol,
        `${tc.id}: tCDF(${tc.inputs.t}, ${tc.inputs.df}) = ${actual}, expected ${tc.expected.result}`);
    });
  }
});

suite('Math-Utils — fCDF (fixture validation)', () => {
  const fCases = cases.filter(c => c.inputs.function === 'fCDF');
  for (const tc of fCases) {
    test(`${tc.id}: ${tc.description}`, () => {
      const actual = DISPATCH.fCDF(tc.inputs);
      const tol = getTolerance(tc);
      assertAlmostEqual(actual, tc.expected.result, tol,
        `${tc.id}: fCDF(${tc.inputs.x}, ${tc.inputs.dfn}, ${tc.inputs.dfd}) = ${actual}, expected ${tc.expected.result}`);
    });
  }
});

suite('Math-Utils — lnGamma (fixture validation)', () => {
  const lgCases = cases.filter(c => c.inputs.function === 'lnGamma');
  for (const tc of lgCases) {
    test(`${tc.id}: ${tc.description}`, () => {
      const actual = DISPATCH.lnGamma(tc.inputs);
      const tol = getTolerance(tc);
      assertAlmostEqual(actual, tc.expected.result, tol,
        `${tc.id}: lnGamma(${tc.inputs.x}) = ${actual}, expected ${tc.expected.result}`);
    });
  }
});

// ─── Digamma ───────────────────────────────────────────────────
// Reference values from scipy.special.digamma. The math-utils fixture file
// will pick up the digamma cases on the next regeneration; until then this
// inline suite locks the implementation to SciPy's values.

const DIGAMMA_CASES = [
  { x: 0.01,  expected: -100.56088545780984,    tol: 1e-9,  desc: 'ψ(0.01) — small x, exercises recurrence' },
  { x: 0.5,   expected:   -1.9635100260214235,  tol: 1e-11, desc: 'ψ(0.5) = −γ − 2 ln 2' },
  { x: 1.0,   expected:   -0.5772156649015329,  tol: 1e-11, desc: 'ψ(1) = −γ' },
  { x: 1.5,   expected:    0.03648997397857652, tol: 1e-11, desc: 'ψ(1.5)' },
  { x: 2.0,   expected:    0.42278433509846713, tol: 1e-11, desc: 'ψ(2) = 1 − γ' },
  { x: 3.0,   expected:    0.9227843350984671,  tol: 1e-11, desc: 'ψ(3)' },
  { x: 5.0,   expected:    1.5061176684318004,  tol: 1e-11, desc: 'ψ(5) = H_4 − γ' },
  { x: 10.0,  expected:    2.251752589066721,   tol: 1e-11, desc: 'ψ(10) = H_9 − γ' },
  { x: 100.0, expected:    4.600161852738087,   tol: 1e-12, desc: 'ψ(100) — pure asymptotic regime' },
];

suite('Math-Utils — digamma (analytical reference)', () => {
  for (const c of DIGAMMA_CASES) {
    test(`digamma(${c.x}): ${c.desc}`, () => {
      const actual = digamma(c.x);
      assertAlmostEqual(actual, c.expected, c.tol,
        `digamma(${c.x}) = ${actual}, expected ${c.expected}`);
    });
  }
});
