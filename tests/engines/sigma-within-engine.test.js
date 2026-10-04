/**
 * D.Mike — σ within estimators (sigma-within-engine.js)
 * Reference: gold-standards/capability, block "estimators" (numpy/scipy).
 */
import { suite, test, assert, assertEqual, assertAlmostEqual } from '../test-utils.js';
import {
  splitSubgroups, alignValuesAndIds, idKey, estimateSigmaWithin,
  isIndividuals, defaultMethod, validMethods, c4Prime, fN,
  SigmaWithinError, SUBGROUP_METHODS, INDIVIDUALS_METHODS,
} from '../../js/engines/sigma-within-engine.js';

async function loadJson(path) {
  const resp = await fetch(new URL(path, import.meta.url));
  return resp.json();
}

const piston = await loadJson('../gold-standards/capability/dataset-pistonrings.json');
const expected = await loadJson('../gold-standards/capability/expected-pistonrings.json');

function groupsFor(dataset) {
  if (dataset === 'subgroups') return splitSubgroups(piston.values, { size: 5 });
  if (dataset === 'individuals') return splitSubgroups(piston.values, { size: 1 });
  const { values, ids } = expected.estimators.unequal;
  return splitSubgroups(values, { ids });
}

function throwsCode(fn, code) {
  try { fn(); } catch (e) {
    assert(e instanceof SigmaWithinError, `expected SigmaWithinError, got ${e}`);
    assertEqual(e.code, code);
    return;
  }
  throw new Error(`expected SigmaWithinError ${code}`);
}

suite('σ within — splitSubgroups', () => {
  test('fixed size keeps a trailing partial subgroup', () => {
    assertEqual(JSON.stringify(splitSubgroups([1, 2, 3, 4, 5, 6, 7], { size: 3 })),
      JSON.stringify([[1, 2, 3], [4, 5, 6], [7]]));
  });

  test('size 1 gives one group per value', () => {
    assertEqual(splitSubgroups([4, 5, 6], { size: 1 }).length, 3);
  });

  test('a new subgroup starts whenever the ID changes (A, A, B, A → 3)', () => {
    assertEqual(JSON.stringify(splitSubgroups([1, 2, 3, 4], { ids: ['A', 'A', 'B', 'A'] })),
      JSON.stringify([[1, 2], [3], [4]]));
  });

  test('numeric and text IDs compare as trimmed strings', () => {
    assertEqual(splitSubgroups([1, 2, 3], { ids: [1, '1', ' 1 '] }).length, 1);
    assertEqual(splitSubgroups([1, 2], { ids: [1, 1.5] }).length, 2);
    assertEqual(splitSubgroups([1, 2], { ids: ['1', '1.0'] }).length, 2);
  });

  test('ids of a different length are rejected', () => {
    let threw = false;
    try { splitSubgroups([1, 2, 3], { ids: ['A', 'A'] }); } catch { threw = true; }
    assertEqual(threw, true);
  });

  test('an invalid size is rejected', () => {
    for (const size of [0, -1, 2.5, NaN, undefined]) {
      let threw = false;
      try { splitSubgroups([1, 2, 3], { size }); } catch { threw = true; }
      assertEqual(threw, true, `size ${size}`);
    }
  });
});

suite('σ within — aligning value and ID columns', () => {
  test('rows without a numeric value or without an ID are dropped together', () => {
    const r = alignValuesAndIds([1, null, 3, 'x', 5, 6], ['A', 'A', '', 'B', 'B', null]);
    assertEqual(JSON.stringify(r.values), JSON.stringify([1, 5]));
    assertEqual(JSON.stringify(r.ids), JSON.stringify(['A', 'B']));
  });

  test('columns of different length: the shorter one ends the pairs', () => {
    const r = alignValuesAndIds([1, 2, 3, 4], ['A', 'A']);
    assertEqual(JSON.stringify(r.values), JSON.stringify([1, 2]));
    const s = alignValuesAndIds([1, 2], ['A', 'A', 'B', 'B']);
    assertEqual(JSON.stringify(s.values), JSON.stringify([1, 2]));
  });

  test('idKey: null and blank are empty, numbers are stringified', () => {
    assertEqual(idKey(null), '');
    assertEqual(idKey(undefined), '');
    assertEqual(idKey('  '), '');
    assertEqual(idKey(12), '12');
    assertEqual(idKey(' L1 '), 'L1');
  });
});

suite('σ within — method choice', () => {
  test('individuals: no subgroup with two or more values', () => {
    const g = splitSubgroups([1, 2, 3], { size: 1 });
    assertEqual(isIndividuals(g), true);
    assertEqual(defaultMethod(g), 'averageMR');
    assertEqual(JSON.stringify(validMethods(g)), JSON.stringify(INDIVIDUALS_METHODS));
  });

  test('every row with its own ID degenerates to individuals', () => {
    const g = splitSubgroups([1, 2, 3, 4], { ids: ['a', 'b', 'c', 'd'] });
    assertEqual(isIndividuals(g), true);
    assertEqual(defaultMethod(g), 'averageMR');
  });

  test('subgroups: pooled by default', () => {
    const g = splitSubgroups([1, 2, 3, 4], { size: 2 });
    assertEqual(defaultMethod(g), 'pooled');
    assertEqual(JSON.stringify(validMethods(g)), JSON.stringify(SUBGROUP_METHODS));
  });

  test('a method that does not fit the data throws methodInvalid', () => {
    throwsCode(() => estimateSigmaWithin(splitSubgroups([1, 2, 3], { size: 1 }), { method: 'rbar' }), 'methodInvalid');
    throwsCode(() => estimateSigmaWithin(splitSubgroups([1, 2, 3, 4], { size: 2 }), { method: 'averageMR' }), 'methodInvalid');
  });

  test('without a method the default is used', () => {
    const r = estimateSigmaWithin(splitSubgroups([1, 2, 4, 7], { size: 2 }));
    assertEqual(r.method, 'pooled');
  });
});

suite('σ within — gold standard (piston rings)', () => {
  for (const c of expected.estimators.cases) {
    test(`${c.id}: σ, ν${c.expected.k != null ? ', k, n̄' : ''}`, () => {
      const r = estimateSigmaWithin(groupsFor(c.data), {
        method: c.method, unbiased: c.unbiased, mrSpan: c.mrSpan,
      });
      assertEqual(r.method, c.method);
      assertAlmostEqual(r.sigma, c.expected.sigma, { relative: 1e-9 }, 'sigma');
      assertAlmostEqual(r.df, c.expected.df, { relative: 1e-12 }, 'df');
      if (c.expected.k != null && c.method !== 'pooled') {
        assertEqual(r.k, c.expected.k, 'k');
        assertAlmostEqual(r.nBar, c.expected.nBar, { relative: 1e-12 }, 'nBar');
      }
    });
  }

  test('equal sizes: weighted R̄ reduces to R̄/d2(n)', () => {
    const g = groupsFor('subgroups');
    const rbar = g.reduce((s, x) => s + Math.max(...x) - Math.min(...x), 0) / g.length;
    const r = estimateSigmaWithin(g, { method: 'rbar' });
    assertAlmostEqual(r.sigma, rbar / 2.326, { relative: 1e-12 });
  });

  test('R̄ and S̄ ignore single-value subgroups (also in k)', () => {
    const r = estimateSigmaWithin(groupsFor('unequal'), { method: 'rbar' });
    assertEqual(r.k, 24);
  });
});

suite('σ within — limits and constants', () => {
  test('R̄ with a subgroup above 100 values throws subgroupTooLarge', () => {
    const big = Array.from({ length: 101 }, (_, i) => i % 7);
    throwsCode(() => estimateSigmaWithin([big, [1, 2]], { method: 'rbar' }), 'subgroupTooLarge');
  });

  test('pooled and S̄ have no table limit', () => {
    const big = Array.from({ length: 150 }, (_, i) => i % 7);
    assert(estimateSigmaWithin([big], { method: 'pooled' }).sigma > 0);
    assert(estimateSigmaWithin([big], { method: 'sbar' }).sigma > 0);
  });

  test('MR span above N or above 100 throws spanTooLarge', () => {
    const g = splitSubgroups([1, 3, 2, 5, 4, 6], { size: 1 });
    throwsCode(() => estimateSigmaWithin(g, { method: 'averageMR', mrSpan: 7 }), 'spanTooLarge');
    throwsCode(() => estimateSigmaWithin(g, { method: 'medianMR', mrSpan: 7 }), 'spanTooLarge');
    const long = splitSubgroups(Array.from({ length: 200 }, (_, i) => i % 9), { size: 1 });
    throwsCode(() => estimateSigmaWithin(long, { method: 'averageMR', mrSpan: 101 }), 'spanTooLarge');
  });

  test('MR span w = N is allowed (one range)', () => {
    const r = estimateSigmaWithin(splitSubgroups([1, 3, 2], { size: 1 }), { method: 'averageMR', mrSpan: 3 });
    assertAlmostEqual(r.sigma, 2 / 1.693, 1e-12);
    assertEqual(r.df, 1);
  });

  test('average MR with w = 2 is exactly the historic MR̄/1.128', () => {
    const x = piston.values;
    let sum = 0;
    for (let i = 1; i < x.length; i++) sum += Math.abs(x[i] - x[i - 1]);
    const r = estimateSigmaWithin(splitSubgroups(x, { size: 1 }), { method: 'averageMR' });
    assertEqual(r.sigma, sum / (x.length - 1) / 1.128);
  });

  test("c4′ beyond the table: 1 − (1 − c4′(500))·499/(N − 1)", () => {
    assertEqual(c4Prime(500), 0.999124);
    assertAlmostEqual(c4Prime(1000), 1 - (1 - 0.999124) * 499 / 999, 1e-15);
  });

  test('f_n uses n̄ rounded to the nearest integer', () => {
    assertEqual(fN(2), 0.88);
    assertEqual(fN(4.4), 0.94);
    assertEqual(fN(4.6), 0.95);
    assertEqual(fN(7), 0.96);
    assertEqual(fN(17), 0.98);
    assertEqual(fN(64), 0.99);
    assertEqual(fN(65), 1);
  });
});
