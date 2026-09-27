/**
 * D.Mike — MSA Engine Fixture Validation
 * Validates MSA Type 1 (Cg/Cgk) and Type 2 (GRR) against reference values.
 */

import { suite, test, assertAlmostEqual, assertEqual, assertTrue } from '../test-utils.js';
import { analyze as analyzeTyp1, validate as validateTyp1, limitMode } from '../../js/engines/msa-typ1-engine.js';
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

// ─── MSA Typ 1 — Melzer 2019 Fig. 13.7 (book / Minitab reference) ──────

/** 50 values rescaled to an exact mean and sample SD (deterministic). */
function rescaled(mean, sd, n = 50) {
  const base = Array.from({ length: n }, (_, i) => Math.sin(1.7 * (i + 1)) + 0.5 * Math.cos(0.9 * (i + 1)));
  const m = base.reduce((a, b) => a + b, 0) / n;
  const s = Math.sqrt(base.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1));
  return base.map(b => mean + sd * (b - m) / s);
}

const melzer = { ref: 12.305, lsl: 12.28, usl: 12.33, k1: 0.2, k2: 3 };
const melzerValues = rescaled(12.30269, 0.003631);

suite('MSA Typ 1 — Melzer Fig. 13.7 (6·s, Minitab)', () => {
  const r = analyzeTyp1(melzer, melzerValues);
  test('Cg 0.459 / Cgk 0.247 as in the book', () => {
    assertAlmostEqual(r.Cg, 0.45901037363442554, 1e-9);
    assertAlmostEqual(r.Cgk, 0.2469475810153586, 1e-9);
  });
  test('%Var(EV) 43.57 and %Var(EV+bias) 80.99', () => {
    assertAlmostEqual(r.varEv, 43.572, 1e-6);
    assertAlmostEqual(r.varEvBias, 80.98884758363405, 1e-6);
  });
  test('bias t-test t = −4.4985, df 49, p = 4.213e-5 (scipy)', () => {
    assertAlmostEqual(r.biasTest.t, -4.498531160948963, 1e-9);
    assertEqual(r.biasTest.df, 49);
    assertAlmostEqual(r.biasTest.p, 4.21308686730126e-05, 1e-9);
  });
  test('two-sided mode and verdict unchanged by the bias test', () => {
    assertEqual(r.mode, 'two-sided');
    assertEqual(r.overall, 'fail');
  });
});

suite('MSA Typ 1 — one-sided tolerance', () => {
  for (const [name, lsl, usl] of [['USL only', NaN, 12.33], ['LSL only', 12.28, NaN]]) {
    test(`${name}: no Cg/Cgk/%Var, no verdict, bias test present`, () => {
      const r = analyzeTyp1({ ...melzer, lsl, usl }, melzerValues);
      assertEqual(r.mode, 'one-sided');
      for (const k of ['T', 'Cg', 'Cgk', 'cgStatus', 'cgkStatus', 'tolUsage', 'varEv', 'varEvBias', 'biasPercent', 'resPercent', 'zoneHi', 'zoneLo']) {
        assertEqual(r[k], null, `${k} should be null`);
      }
      assertEqual(r.overall, 'none');
      assertAlmostEqual(r.biasTest.t, -4.498531160948963, 1e-9);
      assertAlmostEqual(r.xbar, 12.30269, 1e-12);
    });
  }
  test('limitMode', () => {
    assertEqual(limitMode(NaN, 1), 'one-sided');
    assertEqual(limitMode(0, NaN), 'one-sided');
    assertEqual(limitMode(0, 1), 'two-sided');
    assertEqual(limitMode(undefined, undefined), 'two-sided');
  });
});

suite('MSA Typ 1 — validate limits', () => {
  const vals = melzerValues;
  test('one limit is enough', () => {
    const v = validateTyp1({ ref: 12.305, lsl: NaN, usl: 12.33 }, vals);
    assertEqual(v.valid, true);
    assertEqual(v.mode, 'one-sided');
  });
  test('both limits → two-sided', () => {
    assertEqual(validateTyp1({ ref: 12.305, lsl: 12.28, usl: 12.33 }, vals).mode, 'two-sided');
  });
  test('no limit → errLimitsMissing', () => {
    assertEqual(validateTyp1({ ref: 12.305, lsl: NaN, usl: NaN }, vals).errorKey, 'modules.msa-typ1.errLimitsMissing');
  });
  test('usl <= lsl → errUslLeqLsl', () => {
    assertEqual(validateTyp1({ ref: 12.305, lsl: 12.33, usl: 12.28 }, vals).errorKey, 'modules.msa-typ1.errUslLeqLsl');
  });
});

suite('MSA Typ 1 — degenerate inputs', () => {
  test('constant values: bias test t/p null', () => {
    const r = analyzeTyp1(melzer, Array(25).fill(12.305));
    assertEqual(r.biasTest.t, null);
    assertEqual(r.biasTest.p, null);
    assertEqual(r.biasTest.df, 24);
  });
  test('Cgk <= 0: varEvBias null, varEv finite', () => {
    const r = analyzeTyp1({ ...melzer, ref: 12.33 }, melzerValues);
    assertTrue(r.Cgk <= 0);
    assertEqual(r.varEvBias, null);
    assertTrue(Number.isFinite(r.varEv));
  });
});

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
