/**
 * D.Mike — MSA Engine Fixture Validation
 * Validates MSA Type 1 (Cg/Cgk) and Type 2 (GRR) against reference values.
 */

import { suite, test, assertAlmostEqual, assertEqual } from '../test-utils.js';
import { analyze as analyzeTyp1 } from '../../js/engines/msa-typ1-engine.js';
import { analyze as analyzeTyp2 } from '../../js/engines/msa-typ2-engine.js';

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

/** Resolve dot-path on object, e.g. 'varComp.grr.pctStudyVar' */
function getNestedValue(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

// ─── MSA Typ 1 (msa-typ1, cg, cgk fixtures) ──────────────────

for (const fixtureName of ['cg', 'cgk']) {
  const data = await loadFixture(`../fixtures/msa/${fixtureName}.fixtures.json`);

  suite(`MSA Typ 1 — ${fixtureName} (fixture validation)`, () => {
    for (const tc of data.test_cases) {
      if (tc.expected && Object.keys(tc.expected).length > 0) {
        test(`${tc.id}: ${tc.description}`, () => {
          const result = analyzeTyp1(tc.inputs.params, tc.inputs.values);
          const tol = getTol(tc, data.tolerances);

          for (const [key, val] of Object.entries(tc.expected)) {
            if (typeof val === 'number') {
              assertAlmostEqual(result[key], val, tol,
                `${tc.id}: ${key} = ${result[key]}, expected ${val}`);
            }
          }
        });
      }

      if (tc.expected_error) {
        test(`${tc.id}: should throw — ${tc.description}`, () => {
          let threw = false;
          try { analyzeTyp1(tc.inputs.params, tc.inputs.values); }
          catch { threw = true; }
          if (!threw) throw new Error(`${tc.id}: expected error`);
        });
      }
    }
  });
}

// ─── MSA Typ 2 (GRR) ──────────────────────────────────────────

const grrData = await loadFixture('../fixtures/msa/grr.fixtures.json');

suite('MSA Typ 2 — GRR (fixture validation)', () => {
  for (const tc of grrData.test_cases) {
    if (tc.expected && Object.keys(tc.expected).length > 0) {
      test(`${tc.id}: ${tc.description}`, () => {
        const result = analyzeTyp2(tc.inputs.data, tc.inputs.options);
        const tol = getTol(tc, grrData.tolerances);

        for (const [key, val] of Object.entries(tc.expected)) {
          const actual = getNestedValue(result, key);
          if (typeof val === 'number') {
            assertAlmostEqual(actual, val, tol,
              `${tc.id}: ${key} = ${actual}, expected ${val}`);
          } else if (typeof val === 'boolean') {
            assertEqual(actual, val, `${tc.id}: ${key} = ${actual}, expected ${val}`);
          } else if (typeof val === 'string') {
            assertEqual(actual, val, `${tc.id}: ${key} = ${actual}, expected ${val}`);
          }
        }
      });
    }
  }
});

// ─── MSA Typ 3 (GRR without operator) ─────────────────────────

const grrTyp3Data = await loadFixture('../fixtures/msa/grr-typ3.fixtures.json');

suite('MSA Typ 3 — GRR without operator (fixture validation)', () => {
  for (const tc of grrTyp3Data.test_cases) {
    if (tc.expected && Object.keys(tc.expected).length > 0) {
      test(`${tc.id}: ${tc.description}`, () => {
        const result = analyzeTyp2(tc.inputs.data, tc.inputs.options);
        const tol = getTol(tc, grrTyp3Data.tolerances);

        for (const [key, val] of Object.entries(tc.expected)) {
          const actual = getNestedValue(result, key);
          if (typeof val === 'number') {
            assertAlmostEqual(actual, val, tol,
              `${tc.id}: ${key} = ${actual}, expected ${val}`);
          } else if (typeof val === 'boolean') {
            assertEqual(actual, val, `${tc.id}: ${key} = ${actual}, expected ${val}`);
          } else if (typeof val === 'string') {
            assertEqual(actual, val, `${tc.id}: ${key} = ${actual}, expected ${val}`);
          }
        }
      });
    }
  }
});
