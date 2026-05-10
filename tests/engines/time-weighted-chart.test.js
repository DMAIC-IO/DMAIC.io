/**
 * D.Mike — Time-Weighted Control Chart Engine Fixture Validation
 * Validates EWMA and tabular CUSUM mechanics + signal counts.
 */

import { suite, test, assertAlmostEqual, assertEqual } from '../test-utils.js';
import { analyze } from '../../js/engines/time-weighted-chart-engine.js';

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

const data = await loadFixture('../fixtures/control-charts/time-weighted-chart.fixtures.json');

suite('Time-Weighted Charts — EWMA / CUSUM (fixture validation)', () => {
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
