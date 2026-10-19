/**
 * D.Mike — Multivariate Control Chart Engine Fixture Validation
 * Validates Hotelling T² UCL and signal counts.
 */

import { suite, test, assertAlmostEqual, assertEqual } from '../test-utils.js';
import { analyze, computeHotellingT2 } from '../../js/engines/multivariate-chart-engine.js';

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

const data = await loadFixture('../fixtures/control-charts/multivariate-control-chart.fixtures.json');

suite('Multivariate Control Charts — Hotelling T² (fixture validation)', () => {
  for (const tc of data.test_cases) {
    if (!tc.expected || Object.keys(tc.expected).length === 0) continue;

    test(`${tc.id}: ${tc.description}`, () => {
      const got = analyze(tc.inputs);
      const tol = getTol(tc, data.tolerances);

      for (const [key, val] of Object.entries(tc.expected)) {
        const actual = got[key];
        if (typeof val === 'number') {
          assertAlmostEqual(actual, val, tol,
            `${tc.id}: ${key} = ${actual}, expected ${val}`);
        } else {
          assertEqual(actual, val,
            `${tc.id}: ${key} = ${actual}, expected ${val}`);
        }
      }
    });
  }
});

suite('Multivariate Control Charts — Fehlercodes', () => {
  const codeOf = (fn) => { try { fn(); return null; } catch (e) { return e.code; } };
  test('konstante Spalte -> singular', () => {
    const rows = [[1, 5], [2, 5], [3, 5], [4, 5], [5, 5]];
    assertEqual(codeOf(() => computeHotellingT2(rows)), 'singular');
  });
  test('Basisphase zu klein -> baselineTooSmall', () => {
    const rows = [[1, 2], [2, 1]];
    assertEqual(codeOf(() => computeHotellingT2(rows)), 'baselineTooSmall');
  });
  test('Fehlermeldung bleibt englisch', () => {
    try { computeHotellingT2([[1, 5], [2, 5], [3, 5], [4, 5]]); } catch (e) {
      assertEqual(e.message, 'invertMatrix: singular matrix');
    }
  });
});
