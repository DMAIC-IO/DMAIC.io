/**
 * D.Mike — one-way ANOVA building blocks: studentized range distribution
 * (fixture validation against scipy.stats.studentized_range).
 */

import { suite, test, assertAlmostEqual, assertEqual } from '../test-utils.js';
import { ptukey, qtukey } from '../../js/engines/math-utils.js';
import { oneWayANOVA, welchANOVA, tukeyHSD, gamesHowell, welchTTest } from '../../js/engines/hypothesis-test-engine.js';
import { oneWayModelSummary } from '../../js/engines/anova-engine.js';

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
  test('invalid k, df or NaN inputs give NaN', () => {
    for (const fn of [ptukey, qtukey]) {
      for (const args of [[0.5, 1, 10], [0.5, 1.5, 10], [0.5, Infinity, 10], [0.5, NaN, 10],
        [0.5, 3, 0], [0.5, 3, -2], [0.5, 3, NaN], [NaN, 3, 10]]) {
        assertEqual(Number.isNaN(fn(...args)), true, `${fn.name}(${args.join(', ')}) should be NaN`);
      }
    }
  });
  test('qtukey outside [0, 1] gives NaN, the ends give 0 and Infinity', () => {
    assertEqual(Number.isNaN(qtukey(-0.1, 3, 10)), true);
    assertEqual(Number.isNaN(qtukey(1.1, 3, 10)), true);
    assertEqual(qtukey(0, 3, 10), 0);
    assertEqual(qtukey(1, 3, 10), Infinity);
  });
  test('ptukey(qtukey(0.95, 4, 12), 4, 12) round-trips to 0.95 within 1e-10', () => {
    assertAlmostEqual(ptukey(qtukey(0.95, 4, 12), 4, 12), 0.95, 1e-10);
  });
});

/** Recursively compares an engine result to the fixture's expected value (numbers with tolerance, null exact). */
function checkValue(got, exp, tol, msg) {
  if (exp === null) return assertEqual(got, null, msg);
  if (typeof exp === 'number') return assertAlmostEqual(got, exp, tol, `${msg}: ${got} vs ${exp}`);
  if (typeof exp === 'boolean' || typeof exp === 'string') return assertEqual(got, exp, msg);
  if (Array.isArray(exp)) {
    if (!Array.isArray(got) || got.length !== exp.length) throw new Error(`${msg}: length mismatch`);
    exp.forEach((v, i) => checkValue(got[i], v, tol, `${msg}[${i}]`));
    return undefined;
  }
  for (const [key, v] of Object.entries(exp)) checkValue(got[key], v, tol, `${msg}.${key}`);
  return undefined;
}

function runFixtureSuite(name, fixture, run) {
  suite(name, () => {
    for (const tc of fixture.test_cases) {
      const tol = getTol(tc, fixture.tolerances);
      if (tc.expected_error) {
        test(`${tc.id}: should throw — ${tc.description}`, () => {
          let err = null;
          try { run(tc.inputs); } catch (e) { err = e; }
          if (err == null) throw new Error(`${tc.id}: expected error`);
          assertEqual(err.constructor.name, tc.expected_error.type, `${tc.id}: error type`);
          if (!err.message.includes(tc.expected_error.message_contains)) throw new Error(`${tc.id}: message "${err.message}"`);
        });
      } else {
        test(`${tc.id}: ${tc.description}`, () => {
          checkValue(run(tc.inputs), tc.expected, tol, tc.id);
        });
      }
    }
  });
}

const welchData = await loadFixture('../fixtures/hypothesis/welch-anova.fixtures.json');
const tukeyData = await loadFixture('../fixtures/hypothesis/tukey-hsd.fixtures.json');
const ghData = await loadFixture('../fixtures/hypothesis/games-howell.fixtures.json');
const anovaData = await loadFixture('../fixtures/hypothesis/one-way-anova.fixtures.json');

runFixtureSuite('Welch ANOVA', welchData, (i) => welchANOVA(i.groups, i.alpha));
runFixtureSuite('Tukey HSD', tukeyData, (i) => tukeyHSD(i.groups, i.alpha));
runFixtureSuite('Games-Howell', ghData, (i) => gamesHowell(i.groups, i.alpha));
runFixtureSuite('One-way model summary (Fisher ANOVA fixtures)', anovaData, (i) => oneWayANOVA(i.groups, i.alpha));

suite('One-way model summary', () => {
  const groups = [[4, 5, 6, 5], [8, 9, 7, 10, 9], [3, 2, 4]];
  test('pooled and individual CIs differ, other fields agree', () => {
    const a = oneWayModelSummary(groups, 0.05, true);
    const b = oneWayModelSummary(groups, 0.05, false);
    assertEqual(a.S, b.S);
    assertEqual(a.residuals.length, 12);
    assertEqual(a.fitted.length, 12);
    assertEqual(a.groupCIs[0][0] === b.groupCIs[0][0], false);
  });
  test('R2pred is null when a group has a single observation', () => {
    assertEqual(oneWayModelSummary([[1, 2, 3], [4]], 0.05, true).R2pred, null);
  });
  test('welchANOVA on k = 2 equals the squared Welch t statistic', () => {
    const a = [5.1, 4.9, 6.2, 5.5, 5.8, 4.7];
    const b = [7.1, 6.4, 8.9, 7.7, 6.9, 8.2, 7.4];
    const w = welchANOVA([a, b]);
    assertAlmostEqual(w.statistic, welchTTest(a, b).statistic ** 2, 1e-12);
  });
  test('Welch and Games-Howell throw on a single-observation group', () => {
    for (const fn of [welchANOVA, gamesHowell]) {
      let err = null;
      try { fn([[1, 2, 3], [4]]); } catch (e) { err = e; }
      assertEqual(err !== null, true);
    }
  });
});
