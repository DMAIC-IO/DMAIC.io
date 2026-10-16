/**
 * D.Mike — pure series binning shared by the histogram chart type
 * (several series on one set of bins, box statistics, Pareto cumulation).
 */
import { suite, test, assertEqual, assertAlmostEqual, assertDeepEqual } from '../../test-utils.js';
import {
  autoBinCount, computeBins, globalRange, autoBinWidth, binAll,
  percentile, computeBoxStats, seriesMoments, cumulativePercent,
} from '../../../js/core/chart/histogram-series.js';

suite('histogram-series — binning (pure)', () => {
  test('autoBinCount uses Sturges with floor of 3', () => {
    assertEqual(autoBinCount(1), 3);          // log2(1)+1=1 → floored to 3
    assertEqual(autoBinCount(8), 4);          // log2(8)+1=4
    assertEqual(autoBinCount(100), 8);        // ceil(log2(100)+1)=ceil(7.64)=8
  });

  test('computeBins counts values into [edge, upper) with closed last bin', () => {
    const vals = [0, 1, 2, 3, 4];
    const bins = computeBins(vals, 0, 4, 2);
    // bins: [0,2) → {0,1}=2 ; [2,4] (last, closed) → {2,3,4}=3
    assertEqual(bins.length, 2);
    assertEqual(bins[0].xMin, 0); assertEqual(bins[0].xMax, 2); assertEqual(bins[0].count, 2);
    assertEqual(bins[1].xMin, 2); assertEqual(bins[1].xMax, 4); assertEqual(bins[1].count, 3);
  });

  test('computeBins total count equals number of in-range values', () => {
    const vals = [1, 1, 2, 2, 2, 3, 5, 8, 8];
    const bins = computeBins(vals, 0, 10, 2.5);
    const total = bins.reduce((s, b) => s + b.count, 0);
    assertEqual(total, vals.length);
  });

  test('globalRange ignores hidden series', () => {
    const r = globalRange([
      { values: [1, 2, 3], visible: true },
      { values: [100], visible: false },
    ]);
    assertEqual(r.min, 1); assertEqual(r.max, 3); assertEqual(r.count, 3);
  });

  test('globalRange empty → default {0,1,0}', () => {
    const r = globalRange([{ values: [], visible: true }]);
    assertEqual(r.min, 0); assertEqual(r.max, 1); assertEqual(r.count, 0);
  });

  test('autoBinWidth returns a positive nice number', () => {
    const bw = autoBinWidth([{ values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], visible: true }]);
    assertEqual(bw > 0, true);
  });

  test('binAll aligns global edges to bin width multiples', () => {
    const series = [{ values: [2, 4, 6, 8], visible: true }];
    const res = binAll(series, 2);
    assertEqual(res.binWidth, 2);
    // floor(2/2)*2=2 ; ceil(8/2)*2=8
    assertEqual(res.globalMin, 2);
    assertEqual(res.globalMax, 8);
    assertEqual(res.bins.length, 1);
    const total = res.bins[0].reduce((s, b) => s + b.count, 0);
    assertEqual(total, 4);
  });

  test('binAll pushes empty bins for hidden series', () => {
    const res = binAll([
      { values: [1, 2, 3, 4], visible: true },
      { values: [1, 2, 3, 4], visible: false },
    ], 2);
    assertEqual(res.bins.length, 2);
    assertEqual(res.bins[1].length, 0);
  });

  test('binAll with empty data → safe defaults', () => {
    const res = binAll([{ values: [], visible: true }], null);
    assertEqual(res.bins.length, 0);
    assertEqual(res.binWidth, 1);
  });

  test('percentile linear interpolation', () => {
    const s = [1, 2, 3, 4]; // sorted
    assertAlmostEqual(percentile(s, 50), 2.5, 1e-9);
    assertAlmostEqual(percentile(s, 25), 1.75, 1e-9);
    assertAlmostEqual(percentile(s, 0), 1, 1e-9);
    assertAlmostEqual(percentile(s, 100), 4, 1e-9);
  });

  test('computeBoxStats returns quartiles, whiskers, mean, outliers', () => {
    const vals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100];
    const st = computeBoxStats(vals);
    assertEqual(st.min, 1);
    assertEqual(st.max, 100);
    assertAlmostEqual(st.median, 5.5, 1e-9);
    assertEqual(st.outliers.includes(100), true);
    assertAlmostEqual(st.mean, vals.reduce((a, b) => a + b, 0) / vals.length, 1e-9);
  });

  test('computeBoxStats null on empty', () => {
    assertEqual(computeBoxStats([]), null);
    assertEqual(computeBoxStats(null), null);
  });
});

suite('histogram-series — moments, box n, cumulation', () => {
  test('seriesMoments uses the sample standard deviation', () => {
    const m = seriesMoments([2, 4, 4, 4, 5, 5, 7, 9]);
    assertEqual(m.n, 8);
    assertAlmostEqual(m.mean, 5, 1e-12);
    assertAlmostEqual(m.sd, Math.sqrt(32 / 7), 1e-12);
  });
  test('seriesMoments: constant and single-value series have sd 0', () => {
    assertEqual(seriesMoments([3, 3, 3]).sd, 0);
    assertEqual(seriesMoments([3]).sd, 0);
    assertEqual(seriesMoments([]).n, 0);
  });
  test('computeBoxStats reports n', () => {
    assertEqual(computeBoxStats([1, 2, 3, 4]).n, 4);
  });
  test('computeBoxStats on a single value collapses to that value', () => {
    const b = computeBoxStats([7]);
    assertEqual(`${b.min},${b.q1},${b.median},${b.q3},${b.max}`, '7,7,7,7,7');
    assertEqual(b.outliers.length, 0);
  });
  test('cumulativePercent ends at 100 and is monotone', () => {
    const c = cumulativePercent([{ count: 1 }, { count: 3 }, { count: 0 }, { count: 4 }]);
    assertDeepEqual(c, [12.5, 50, 50, 100]);
  });
  test('cumulativePercent with zero total is all 0', () => {
    assertDeepEqual(cumulativePercent([{ count: 0 }, { count: 0 }]), [0, 0]);
  });
});
