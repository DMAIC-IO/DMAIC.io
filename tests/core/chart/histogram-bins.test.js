/**
 * D.Mike — Histogram type: precomputed bins (resampling module stores only
 * bin summaries of its replicate and permutation distributions).
 */

import { suite, test, assertEqual, assertAlmostEqual, assertTrue } from '../../test-utils.js';
import HistogramChart from '../../../js/core/chart/types/histogram.js';

const BINS = [
  { x0: 0, x1: 2, count: 1 },
  { x0: 2, x1: 4, count: 3 },
  { x0: 4, x1: 6, count: 4 },
  { x0: 6, x1: 8, count: 2 },
];

function mount(cfg, context = { language: 'de' }) {
  const host = document.createElement('div');
  host.style.width = '900px';
  host.style.height = '400px';
  document.body.appendChild(host);
  const chart = new HistogramChart(host, cfg, context);
  chart.render();
  return { host, chart };
}

function unmount({ host, chart }) {
  chart.destroy();
  host.remove();
}

suite('Histogram type — precomputed bins', () => {
  test('draws the given bins with density = count / (N · width)', () => {
    const m = mount({ bins: BINS });
    assertEqual(m.chart._bins.length, 4);
    assertEqual(m.chart._binWidth, 2);
    assertAlmostEqual(m.chart._bins[2].density, 4 / (10 * 2), 1e-15);
    assertEqual(m.chart._bins[1].count, 3);
    unmount(m);
  });
  test('extent spans the bins and the highest density', () => {
    const m = mount({ bins: BINS });
    const e = m.chart._getDataExtent();
    assertEqual(e.xMin, 0);
    assertEqual(e.xMax, 8);
    assertEqual(e.yMin, 0);
    assertAlmostEqual(e.yMax, 0.2, 1e-15);
    unmount(m);
  });
  test('bins win over data', () => {
    const m = mount({ bins: BINS, data: [100, 200, 300] });
    assertEqual(m.chart._getDataExtent().xMax, 8);
    assertEqual(m.chart._bins.length, 4);
    unmount(m);
  });
  test('without bins the raw data are binned as before', () => {
    const data = Array.from({ length: 50 }, (_, i) => i / 10);
    const m = mount({ data, binMethod: 'manual', binCount: 5 });
    assertEqual(m.chart._bins.length, 5);
    assertEqual(m.chart._bins.reduce((s, b) => s + b.count, 0), 50);
    unmount(m);
  });
  test('empty bins and empty data → default extent, no crash', () => {
    const m = mount({ bins: [], data: [] });
    const e = m.chart._getDataExtent();
    assertEqual(`${e.xMin},${e.xMax},${e.yMin},${e.yMax}`, '0,1,0,1');
    assertTrue(m.chart._bins === undefined);
    unmount(m);
  });
  test('a single bin of zero total count → density 0, no NaN', () => {
    const m = mount({ bins: [{ x0: 1, x1: 2, count: 0 }] });
    assertEqual(m.chart._bins[0].density, 0);
    unmount(m);
  });
});
