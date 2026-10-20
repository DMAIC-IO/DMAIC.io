import { suite, test, assertTrue } from '../test-utils.js';
import {
  clopperPearsonCI,
  oneProportionTest,
  twoProportionTest,
  fisherExact2x2,
  chiSquareAssociation,
  onePoissonRateTest,
  poissonRateCI,
  twoPoissonRateTest,
  mcNemarTest,
  equivalenceOneProportion,
  equivalenceTwoProportions,
} from '../../js/engines/attribute-test-engine.js';

async function loadFixture(path) {
  const resp = await fetch(new URL(path, import.meta.url));
  return resp.json();
}

function getTol(tc, tolerances) {
  const key = tc.tolerance_override;
  return key && tolerances.overrides?.[key] ? tolerances.overrides[key] : tolerances.default;
}

/** Recursive compare: numbers within tolerance, everything else strictly. */
function assertMatches(actual, expected, tol, path) {
  if (typeof expected === 'number') {
    const ok = typeof actual === 'number'
      && Math.abs(actual - expected) <= tol.absolute + tol.relative * Math.abs(expected);
    assertTrue(ok, `${path}: expected ${expected}, got ${actual}`);
  } else if (Array.isArray(expected)) {
    assertTrue(Array.isArray(actual) && actual.length === expected.length,
      `${path}: expected array of ${expected.length}, got ${JSON.stringify(actual)}`);
    expected.forEach((v, i) => assertMatches(actual[i], v, tol, `${path}[${i}]`));
  } else {
    assertTrue(actual === expected, `${path}: expected ${expected}, got ${actual}`);
  }
}

const CASES = [
  ['clopper-pearson', (i) => clopperPearsonCI(i.x, i.n, i.confidence, i.direction)],
  ['one-proportion', (i) => oneProportionTest(i.x, i.n, i.p0, i.direction, i.alpha)],
  ['two-proportion', (i) => twoProportionTest(i.x1, i.n1, i.x2, i.n2, i.direction, i.alpha, i.pooled)],
  ['fisher-exact', (i) => fisherExact2x2(i.table, i.direction)],
  ['chi-square-association', (i) => chiSquareAssociation(i.table, i.alpha)],
  ['poisson-rate-one', (i) => onePoissonRateTest(i.x, i.t, i.lambda0, i.direction, i.alpha)],
  ['poisson-rate-two', (i) => twoPoissonRateTest(i.x1, i.t1, i.x2, i.t2, { direction: i.direction, alpha: i.alpha, pooled: i.pooled, diff0: i.diff0 })],
  ['mcnemar', (i) => mcNemarTest(i.table, i.direction, i.alpha)],
  ['equivalence-proportion-one', (i) => equivalenceOneProportion(i.x, i.n, i.p0, i.lower, i.upper, i.alpha)],
  ['equivalence-proportion-two', (i) => equivalenceTwoProportions(i.x1, i.n1, i.x2, i.n2, i.lower, i.upper, i.alpha)],
];

const FIXTURES = await Promise.all(
  CASES.map(([id]) => loadFixture(`../fixtures/attribute/${id}.fixtures.json`)),
);

suite('attribute-test-engine: large support guard', () => {
  test('fisherExact2x2 handles a support above 150000 entries without throwing', () => {
    const r = fisherExact2x2([[100000, 100000], [100000, 100000]]);
    for (const v of [r.pValue, r.pLess, r.pGreater]) {
      assertTrue(Number.isFinite(v) && v >= 0 && v <= 1, `p-value out of range: ${v}`);
    }
  });
  test('twoProportionTest handles very large samples', () => {
    const r = twoProportionTest(100000, 200000, 100000, 200000);
    assertTrue(Number.isFinite(r.pFisher) && r.pFisher >= 0 && r.pFisher <= 1, `pFisher: ${r.pFisher}`);
  });
});

suite('attribute-test-engine: open Poisson bounds', () => {
  test('one-sided bounds are open on the other side', () => {
    assertTrue(poissonRateCI(18, 40, 0.95, 'greater').upper === Infinity, 'greater: upper must be Infinity');
    assertTrue(poissonRateCI(4, 25.5, 0.95, 'less').lower === 0, 'less: lower must be 0');
    assertTrue(twoPoissonRateTest(25, 50, 14, 52, { direction: 'greater' }).ciUpper === Infinity,
      'two rates, greater: ciUpper must be Infinity');
  });
});

CASES.forEach(([id, run], k) => {
  const fx = FIXTURES[k];
  suite(`attribute-test-engine: ${id}`, () => {
    for (const tc of fx.test_cases) {
      test(`${tc.id} (${tc.tier})`, () => {
        const result = run(tc.inputs);
        const tol = getTol(tc, fx.tolerances);
        for (const [field, value] of Object.entries(tc.expected)) {
          assertMatches(result[field], value, tol, `${tc.id}.${field}`);
        }
      });
    }
  });
});
