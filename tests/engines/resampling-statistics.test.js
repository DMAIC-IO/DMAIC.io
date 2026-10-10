/**
 * D.Mike — Resampling statistic catalogue vs. R (statistics.json from
 * tests/fixtures/resampling/generate-statistics.R).
 */

import { suite, test, assertAlmostEqual, assertEqual, assertTrue } from '../test-utils.js';
import {
  STATISTICS, STATISTIC_IDS, makeStatistic, ResamplingError,
} from '../../js/engines/resampling-statistics.js';

async function loadFixture(path) {
  const resp = await fetch(new URL(path, import.meta.url));
  return resp.json();
}

const fixture = await loadFixture('../fixtures/resampling/statistics.json');
const TOL = { absolute: 1e-12, relative: 1e-12 };

function assertCode(fn, code) {
  try { fn(); } catch (err) {
    assertTrue(err instanceof ResamplingError, `expected ResamplingError, got ${err && err.name}`);
    assertEqual(err.code, code);
    return;
  }
  throw new Error(`expected ResamplingError "${code}", nothing thrown`);
}

suite('resampling-statistics — catalogue vs. R', () => {
  for (const c of fixture.cases) {
    test(`${c.dataset} ${c.id} ${JSON.stringify(c.params)}`, () => {
      const values = Float64Array.from(fixture.datasets[c.dataset]);
      assertAlmostEqual(STATISTICS[c.id](values, c.params), c.value, TOL);
    });
  }
  test('catalogue has exactly the eight statistics, no Cpk', () => {
    assertEqual(STATISTIC_IDS.join(','), 'mean,median,stddev,variance,trimmedMean,quantile,cv,ppk');
    assertEqual(Object.keys(STATISTICS).sort().join(','), [...STATISTIC_IDS].sort().join(','));
  });
  test('statistics never mutate their input', () => {
    const values = Float64Array.from([3, 1, 2, 5, 4]);
    for (const id of STATISTIC_IDS) {
      STATISTICS[id](values, { trim: 0.2, p: 0.5, lsl: 0, usl: 6 });
      assertEqual(Array.from(values).join(','), '3,1,2,5,4', id);
    }
  });
});

suite('resampling-statistics — makeStatistic validation', () => {
  test('binds params', () => {
    const q = makeStatistic('quantile', { p: 0.5 });
    assertAlmostEqual(q(Float64Array.from([1, 2, 3, 4])), 2.5, 1e-15);
    const ppk = makeStatistic('ppk', { lsl: null, usl: 10 });
    assertTrue(Number.isFinite(ppk(Float64Array.from([7, 8, 9]))));
  });
  test('unknown id → invalid-options', () => assertCode(() => makeStatistic('cpk'), 'invalid-options'));
  test('trim outside [0, 0.5) → invalid-options', () => {
    assertCode(() => makeStatistic('trimmedMean', { trim: 0.5 }), 'invalid-options');
    assertCode(() => makeStatistic('trimmedMean', { trim: -0.1 }), 'invalid-options');
    assertCode(() => makeStatistic('trimmedMean', {}), 'invalid-options');
  });
  test('p outside (0, 1) → invalid-options', () => {
    assertCode(() => makeStatistic('quantile', { p: 0 }), 'invalid-options');
    assertCode(() => makeStatistic('quantile', { p: 1 }), 'invalid-options');
    assertCode(() => makeStatistic('quantile', { p: '0.5' }), 'invalid-options');
  });
  test('Ppk limits → invalid-limits', () => {
    assertCode(() => makeStatistic('ppk', {}), 'invalid-limits');
    assertCode(() => makeStatistic('ppk', { lsl: 5, usl: 5 }), 'invalid-limits');
    assertCode(() => makeStatistic('ppk', { lsl: 6, usl: 5 }), 'invalid-limits');
    assertCode(() => makeStatistic('ppk', { lsl: NaN }), 'invalid-limits');
  });
  test('degenerate inputs give non-finite values, never throw', () => {
    const constant = Float64Array.from([5, 5, 5, 5]);
    assertEqual(STATISTICS.ppk(constant, { lsl: 4, usl: 6 }), Infinity);
    assertTrue(Number.isNaN(STATISTICS.stddev(Float64Array.from([1]))));
    assertTrue(!Number.isFinite(STATISTICS.cv(Float64Array.from([-1, 1]))));
  });
});
