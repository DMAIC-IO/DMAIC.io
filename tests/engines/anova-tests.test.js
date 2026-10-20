/**
 * D.Mike — one-way ANOVA building blocks: studentized range distribution
 * (fixture validation against scipy.stats.studentized_range).
 */

import { suite, test, assertAlmostEqual, assertEqual } from '../test-utils.js';
import { ptukey, qtukey } from '../../js/engines/math-utils.js';

async function loadFixture(path) {
  const resp = await fetch(new URL(path, import.meta.url));
  return resp.json();
}

function getTol(tc, tolerances) {
  const key = tc.tolerance_override;
  return key && tolerances.overrides?.[key] ? tolerances.overrides[key] : tolerances.default;
}

/** JSON has no Infinity literal — the fixture stores df = ∞ as the string "Infinity". */
const toDf = (df) => (df === 'Infinity' ? Infinity : df);

const srData = await loadFixture('../fixtures/hypothesis/studentized-range.fixtures.json');

suite('Studentized range', () => {
  for (const tc of srData.test_cases) {
    const tol = getTol(tc, srData.tolerances);
    const { k } = tc.inputs;
    const df = toDf(tc.inputs.df);
    if ('quantile' in tc.expected) {
      test(`${tc.id}: ${tc.description}`, () => {
        const q = qtukey(tc.inputs.p, k, df);
        assertAlmostEqual(q, tc.expected.quantile, tol, `${tc.id}: quantile = ${q}, expected ${tc.expected.quantile}`);
      });
    }
    if ('cdf' in tc.expected) {
      test(`${tc.id}: ${tc.description}`, () => {
        const p = ptukey(tc.inputs.q, k, df);
        assertAlmostEqual(p, tc.expected.cdf, tol, `${tc.id}: cdf = ${p}, expected ${tc.expected.cdf}`);
      });
    }
  }

  test('ptukey(200, 3, 10) is exactly 1', () => {
    assertEqual(ptukey(200, 3, 10), 1);
  });
  test('ptukey(0, 3, 10) is exactly 0', () => {
    assertEqual(ptukey(0, 3, 10), 0);
  });
  test('qtukey(0.999, 20, 2) is finite', () => {
    assertEqual(Number.isFinite(qtukey(0.999, 20, 2)), true);
  });
  test('ptukey(qtukey(0.95, 4, 12), 4, 12) round-trips to 0.95 within 1e-10', () => {
    assertAlmostEqual(ptukey(qtukey(0.95, 4, 12), 4, 12), 0.95, 1e-10);
  });
});
