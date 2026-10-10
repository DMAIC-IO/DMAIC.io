/**
 * D.Mike — Bootstrap intervals vs. R boot (intervals.json from
 * tests/fixtures/resampling/generate-intervals.R). Fed R's own replicates and
 * influence values, our intervals must match boot.ci to 1e-10.
 */

import { suite, test, assertAlmostEqual, assertEqual, assertTrue } from '../test-utils.js';
import {
  normInter, percentileCI, bcaCI, jackknifeInfluence,
} from '../../js/engines/resampling-intervals.js';
import { makeStatistic } from '../../js/engines/resampling-statistics.js';

async function loadFixture(path) {
  const resp = await fetch(new URL(path, import.meta.url));
  return resp.json();
}

const fixture = await loadFixture('../fixtures/resampling/intervals.json');
const TOL = { absolute: 1e-10, relative: 1e-10 };

function statisticFor(c) {
  const fn = makeStatistic(c.statistic.id, c.statistic.params);
  if (c.kind === 'one') return { groups: [Float64Array.from(c.data)], combine: (g) => fn(g[0]) };
  return {
    groups: [Float64Array.from(c.x), Float64Array.from(c.y)],
    combine: (g) => fn(g[0]) - fn(g[1]),
  };
}

suite('resampling-intervals — vs. R boot.ci', () => {
  for (const c of fixture.cases) {
    test(`${c.id}: percentile`, () => {
      const ci = percentileCI(Float64Array.from(c.t), c.confidence);
      assertAlmostEqual(ci[0], c.percentile[0], TOL);
      assertAlmostEqual(ci[1], c.percentile[1], TOL);
    });
    test(`${c.id}: BCa with R's influence values`, () => {
      const ci = bcaCI(Float64Array.from(c.t), c.t0, Float64Array.from(c.L), c.confidence);
      assertAlmostEqual(ci[0], c.bca[0], TOL);
      assertAlmostEqual(ci[1], c.bca[1], TOL);
    });
    test(`${c.id}: jackknife influence = empinf(type = "jack")`, () => {
      const { groups, combine } = statisticFor(c);
      assertAlmostEqual(combine(groups), c.t0, TOL);
      const L = jackknifeInfluence(groups, combine);
      assertEqual(L.length, c.L.length);
      for (let i = 0; i < L.length; i++) assertAlmostEqual(L[i], c.L[i], TOL, `L[${i}]`);
    });
  }
});

suite('resampling-intervals — norm.inter and degenerate input', () => {
  test('integer order statistic is used directly', () => {
    // R = 19, alpha = 0.05 → rk = 1 → t[1]
    const t = Float64Array.from({ length: 19 }, (_, i) => i + 1);
    assertEqual(normInter(t, 0.05), 1);
    assertEqual(normInter(t, 0.5), 10);
  });
  test('extreme alpha → min / max', () => {
    const t = Float64Array.from([1, 2, 3, 4]);
    assertEqual(normInter(t, 0.01), 1);
    assertEqual(normInter(t, 0.99), 4);
  });
  test('percentile: constant or too few replicates → null', () => {
    assertEqual(percentileCI(Float64Array.from([2, 2, 2]), 0.95), null);
    assertEqual(percentileCI(Float64Array.from([1, NaN, Infinity]), 0.95), null);
  });
  test('percentile ignores non-finite replicates', () => {
    const ci = percentileCI(Float64Array.from([1, 2, 3, 4, Infinity, NaN]), 0.5);
    assertTrue(ci[0] >= 1 && ci[1] <= 4);
  });
  test('BCa: no replicate below the estimate (z0 = −∞) → null', () => {
    assertEqual(bcaCI(Float64Array.from([3, 4, 5]), 3, Float64Array.from([1, -1]), 0.95), null);
  });
  test('BCa: all-zero influence values → null', () => {
    assertEqual(bcaCI(Float64Array.from([1, 2, 3, 4]), 2.5, Float64Array.from([0, 0, 0]), 0.95), null);
  });
});
