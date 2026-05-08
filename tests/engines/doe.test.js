/**
 * D.Mike — DOE Engine Fixture Validation
 * Validates D-Efficiency and VIF calculations against reference values.
 */

import { suite, test, assertAlmostEqual } from '../test-utils.js';
import { computeDesignEfficiency } from '../../js/engines/design-efficiency-engine.js';
import { computeVIF } from '../../js/engines/vif-engine.js';

async function loadFixture(path) {
  const resp = await fetch(path);
  return resp.json();
}

function getTol(tc, tolerances) {
  const key = tc.tolerance_override;
  return key && tolerances.overrides?.[key]
    ? tolerances.overrides[key].absolute
    : tolerances.default.absolute;
}

// ─── D-Efficiency ──────────────────────────────────────────────

const dEffData = await loadFixture('../fixtures/doe/d-efficiency.fixtures.json');

suite('DOE — Design Efficiency (fixture validation)', () => {
  for (const tc of dEffData.test_cases) {
    if (tc.expected && Object.keys(tc.expected).length > 0) {
      test(`${tc.id}: ${tc.description}`, () => {
        const result = computeDesignEfficiency(tc.inputs.codedMatrix);
        const tol = getTol(tc, dEffData.tolerances);

        for (const [key, val] of Object.entries(tc.expected)) {
          if (typeof val === 'number') {
            assertAlmostEqual(result[key], val, tol,
              `${tc.id}: ${key} = ${result[key]}, expected ${val}`);
          }
        }
      });
    }
  }
});

// ─── VIF ───────────────────────────────────────────────────────

const vifData = await loadFixture('../fixtures/doe/vif.fixtures.json');

suite('DOE — VIF (fixture validation)', () => {
  for (const tc of vifData.test_cases) {
    if (tc.expected && Array.isArray(tc.expected)) {
      test(`${tc.id}: ${tc.description}`, () => {
        const result = computeVIF(tc.inputs.codedMatrix);
        const tol = getTol(tc, vifData.tolerances);

        for (let i = 0; i < tc.expected.length; i++) {
          const exp = tc.expected[i];
          const act = result[i];
          if (exp.vif !== undefined) {
            assertAlmostEqual(act.vif, exp.vif, tol,
              `${tc.id}: vif[${i}] = ${act.vif}, expected ${exp.vif}`);
          }
        }
      });
    }
  }
});
