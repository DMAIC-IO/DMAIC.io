/**
 * D.Mike — MSA Engine Fixture Validation
 * Validates MSA Type 1 (Cg/Cgk) and Type 2 (GRR) against reference values.
 */

import { suite, test, assertAlmostEqual, assertEqual, assertTrue } from '../test-utils.js';
import { analyze as analyzeTyp1, validate as validateTyp1, limitMode } from '../../js/engines/msa-typ1-engine.js';
import { analyze as analyzeTyp2, validate as validateTyp2, grrVerdict } from '../../js/engines/msa-typ2-engine.js';

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
  test('constant column with float noise (25 × 12.305): Cg/Cgk null, overall none, noSpread flag', () => {
    const r = analyzeTyp1(melzer, Array(25).fill(12.305));
    assertEqual(r.Cg, null);
    assertEqual(r.Cgk, null);
    assertEqual(r.cgStatus, null);
    assertEqual(r.cgkStatus, null);
    assertEqual(r.tolUsage, null);
    assertEqual(r.varEv, null);
    assertEqual(r.varEvBias, null);
    assertEqual(r.overall, 'none');
    assertEqual(r.noSpread, true);
  });
  test('exact-constant column (no float noise, sg exactly 0): same degenerate result', () => {
    const r = analyzeTyp1(melzer, Array(30).fill(10));
    assertEqual(r.sg, 0);
    assertEqual(r.range, 0);
    assertEqual(r.Cg, null);
    assertEqual(r.Cgk, null);
    assertEqual(r.overall, 'none');
    assertEqual(r.noSpread, true);
  });
  test('non-constant values: noSpread is false', () => {
    const r = analyzeTyp1(melzer, melzerValues);
    assertEqual(r.noSpread, false);
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
              const actual = getNestedValue(result, key);
              assertAlmostEqual(actual, val, tol,
                `${tc.id}: ${key} = ${actual}, expected ${val}`);
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

// ─── MSA Typ 2/3 — Melzer 2019 (factor 6, verdict basis, %Process) ──────

/** 5 parts × 2 operators × 2 replicates; %StudyVar 18.65 (warn), σ_GRR 0.0059761. */
function warnData() {
  const bases = [25.00, 25.02, 24.98, 25.04, 24.96];
  const parts = [], operators = [], measurements = [];
  bases.forEach((b, i) => {
    for (const op of ['A', 'B']) {
      for (let r = 0; r < 2; r++) { parts.push(String(i + 1)); operators.push(op); measurements.push(b + r * 0.01); }
    }
  });
  return { parts, operators, measurements };
}

/** Typ 3: 3 parts × 4 replicates; %StudyVar 4.08, σ_GRR 0.0816497. */
function typ3Data() {
  return {
    parts: ['A', 'A', 'A', 'A', 'B', 'B', 'B', 'B', 'C', 'C', 'C', 'C'],
    operators: null,
    measurements: [48.00, 48.10, 47.90, 48.00, 50.00, 50.10, 49.90, 50.00, 52.00, 52.10, 51.90, 52.00],
  };
}

const tenByThree = grrData.test_cases.find(tc => tc.id === 'grr_standard_10x3x2').inputs.data;

suite('MSA Typ 2 — factor 6 vs 5.15 (Melzer Fig. 8.33)', () => {
  // Book (Minitab, 6·SD): SD(GRR) 0.82074, T 30 → %Tolerance 16.41 %;
  // with 5.15: 14.09 %. %StudyVar 14.99 % and ndc 9 do not depend on k.
  // No raw data is published, so the relation is pinned on a fixture dataset.
  const opts = { lsl: 24.9, usl: 25.1, alpha: 0.05 };
  const r6 = analyzeTyp2(tenByThree, { ...opts, studyVarMultiplier: 6 });
  const r515 = analyzeTyp2(tenByThree, { ...opts, studyVarMultiplier: 5.15 });
  test('%Tolerance = 100·k·σ_GRR/T for k = 6 and k = 5.15', () => {
    const s = r6.varComp.grr.sigma;
    assertAlmostEqual(s, 0.008184080074551429, 1e-12);
    assertAlmostEqual(r6.varComp.grr.pctTolerance, 100 * 6 * s / 0.2, 1e-9);
    assertAlmostEqual(r6.varComp.grr.pctTolerance, 24.552240223653936, 1e-6);
    assertAlmostEqual(r515.varComp.grr.pctTolerance, 100 * 5.15 * s / 0.2, 1e-9);
  });
  test('ratio of the two is 6/5.15 (book: 16.41 / 14.09)', () => {
    assertAlmostEqual(r6.varComp.grr.pctTolerance / r515.varComp.grr.pctTolerance, 6 / 5.15, 1e-12);
    assertAlmostEqual(16.41 / 14.09, 6 / 5.15, 1e-3);
  });
  test('%StudyVar and ndc do not depend on k', () => {
    assertAlmostEqual(r6.varComp.grr.pctStudyVar, r515.varComp.grr.pctStudyVar, 1e-12);
    assertAlmostEqual(r6.varComp.grr.pctStudyVar, 19.777469532369242, 1e-6);
    assertEqual(r6.ndc, r515.ndc);
  });
  test('default k is 6 when the option is omitted (typ 2 and typ 3)', () => {
    const r = analyzeTyp2(tenByThree, opts);
    assertEqual(r.params.studyVarMultiplier, 6);
    assertAlmostEqual(r.varComp.grr.pctTolerance, r6.varComp.grr.pctTolerance, 1e-12);
    assertEqual(analyzeTyp2(typ3Data(), {}).params.studyVarMultiplier, 6);
  });
});

suite('MSA Typ 2 — verdict basis', () => {
  const lim = { lsl: 24.5, usl: 25.5, studyVarMultiplier: 5.15 };
  test('omitted basis with both limits → tolerance, status from %Tolerance', () => {
    const r = analyzeTyp2(warnData(), lim);
    assertEqual(r.verdictBasis, 'tolerance');
    assertAlmostEqual(r.pctGRRVerdict, 3.0777136690365454, 1e-9);
    assertAlmostEqual(r.varComp.grr.pctStudyVar, 18.650096164810147, 1e-9);
    assertEqual(r.grrStatus, 'pass');
    assertEqual(r.params.verdictBasis, undefined);
  });
  test("'studyVar' with limits → studyVar (legacy verdict kept)", () => {
    const r = analyzeTyp2(warnData(), { ...lim, verdictBasis: 'studyVar' });
    assertEqual(r.verdictBasis, 'studyVar');
    assertAlmostEqual(r.pctGRRVerdict, 18.650096164810147, 1e-9);
    assertEqual(r.grrStatus, 'warn');
    assertEqual(r.params.verdictBasis, 'studyVar');
  });
  test('omitted basis without limits → studyVar', () => {
    const r = analyzeTyp2(warnData(), {});
    assertEqual(r.verdictBasis, 'studyVar');
    assertEqual(r.grrStatus, 'warn');
  });
  test("'tolerance' without limits → silent studyVar fallback", () => {
    const r = analyzeTyp2(warnData(), { verdictBasis: 'tolerance' });
    assertEqual(r.verdictBasis, 'studyVar');
    assertEqual(r.grrStatus, 'warn');
    assertEqual(r.params.verdictBasis, 'tolerance');
  });
  test('only LSL → no %Tolerance, studyVar basis', () => {
    const r = analyzeTyp2(warnData(), { lsl: 24.5, usl: NaN, verdictBasis: 'tolerance' });
    assertEqual(r.varComp.grr.pctTolerance, null);
    assertEqual(r.verdictBasis, 'studyVar');
  });
  test('grrVerdict thresholds follow pctGRRVerdict', () => {
    assertEqual(grrVerdict({ pctStudyVar: 50, pctTolerance: 9.99 }).grrStatus, 'pass');
    assertEqual(grrVerdict({ pctStudyVar: 5, pctTolerance: 10 }).grrStatus, 'warn');
    assertEqual(grrVerdict({ pctStudyVar: 5, pctTolerance: 30 }).grrStatus, 'fail');
    assertEqual(grrVerdict({ pctStudyVar: 29.99, pctTolerance: 50 }, 'studyVar').grrStatus, 'warn');
    assertEqual(grrVerdict({ pctStudyVar: 5, pctTolerance: null }, 'tolerance').verdictBasis, 'studyVar');
  });
});

suite('MSA Typ 2 — historical process σ (%Process)', () => {
  test('pctProcess = σ/σ_hist·100 for every component', () => {
    const r = analyzeTyp2(warnData(), { historicalSigma: 0.05 });
    for (const key of ['repeatability', 'reproducibility', 'operator', 'interact', 'grr', 'part', 'total']) {
      assertAlmostEqual(r.varComp[key].pctProcess, r.varComp[key].sigma / 0.05 * 100, 1e-9, key);
    }
    assertAlmostEqual(r.varComp.grr.pctProcess, 11.9522860933458, 1e-9);
    assertEqual(r.params.historicalSigma, 0.05);
  });
  test('value above 100 % is returned as is, finite', () => {
    const r = analyzeTyp2(warnData(), { historicalSigma: 0.004 });
    assertAlmostEqual(r.varComp.grr.pctProcess, 149.403576166823, 1e-9);
    assertTrue(Number.isFinite(r.varComp.grr.pctProcess));
  });
  test('σ_hist does not change status, ndc or %StudyVar', () => {
    const a = analyzeTyp2(warnData(), {});
    const b = analyzeTyp2(warnData(), { historicalSigma: 0.004 });
    assertEqual(b.grrStatus, a.grrStatus);
    assertEqual(b.ndc, a.ndc);
    assertAlmostEqual(b.varComp.grr.pctStudyVar, a.varComp.grr.pctStudyVar, 1e-12);
  });
  test('without σ_hist pctProcess is null', () => {
    const r = analyzeTyp2(warnData(), {});
    assertEqual(r.varComp.grr.pctProcess, null);
    assertEqual(r.params.historicalSigma, null);
  });
});

suite('MSA Typ 2/3 — validate historicalSigma', () => {
  for (const [name, data] of [['typ 2', warnData()], ['typ 3', typ3Data()]]) {
    for (const bad of [0, -1, NaN, Infinity]) {
      test(`${name}: σ_hist ${bad} → errHistSigmaInvalid`, () => {
        const v = validateTyp2(data, { historicalSigma: bad });
        assertEqual(v.valid, false);
        assertEqual(v.errorKey, 'modules.msa-typ2.errHistSigmaInvalid');
      });
    }
    test(`${name}: σ_hist 0.05 and omitted are valid`, () => {
      assertEqual(validateTyp2(data, { historicalSigma: 0.05 }).valid, true);
      assertEqual(validateTyp2(data, {}).valid, true);
    });
  }
});

suite('MSA Typ 3 — verdict basis and %Process', () => {
  const lim = { lsl: 49, usl: 51, studyVarMultiplier: 5.15 };
  test('omitted basis with limits → tolerance (warn)', () => {
    const r = analyzeTyp2(typ3Data(), lim);
    assertEqual(r.mode, 'typ3');
    assertEqual(r.verdictBasis, 'tolerance');
    assertAlmostEqual(r.pctGRRVerdict, 21.024786958889248, 1e-9);
    assertEqual(r.grrStatus, 'warn');
  });
  test("'studyVar' with limits → studyVar (pass)", () => {
    const r = analyzeTyp2(typ3Data(), { ...lim, verdictBasis: 'studyVar' });
    assertEqual(r.verdictBasis, 'studyVar');
    assertAlmostEqual(r.pctGRRVerdict, 4.079933742414089, 1e-9);
    assertEqual(r.grrStatus, 'pass');
  });
  test("'tolerance' without limits → studyVar fallback", () => {
    assertEqual(analyzeTyp2(typ3Data(), { verdictBasis: 'tolerance' }).verdictBasis, 'studyVar');
  });
  test('pctProcess on grr, 0 on the zero rows with σ_hist, null without', () => {
    const r = analyzeTyp2(typ3Data(), { historicalSigma: 0.1 });
    assertAlmostEqual(r.varComp.grr.pctProcess, 81.6496580927738, 1e-9);
    for (const key of ['reproducibility', 'operator', 'interact']) assertEqual(r.varComp[key].pctProcess, 0, key);
    const n = analyzeTyp2(typ3Data(), {});
    for (const key of ['grr', 'reproducibility', 'part']) assertEqual(n.varComp[key].pctProcess, null, key);
  });
});

suite('MSA Typ 3 — unbalanced message without operators', () => {
  test('typ 3 unbalanced design → errUnbalancedTyp3 (no operator wording)', () => {
    const d = typ3Data();
    const v = validateTyp2({ ...d, parts: d.parts.slice(0, -1), measurements: d.measurements.slice(0, -1) }, {});
    assertEqual(v.valid, false);
    assertEqual(v.errorKey, 'modules.msa-typ2.errUnbalancedTyp3');
  });
});
