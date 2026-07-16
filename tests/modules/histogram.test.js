/**
 * Histogram Module — unit tests (model + pure binning engine).
 * Written TDD-first for the createModule + Alpine migration.
 */
import { suite, test, assertEqual, assertAlmostEqual } from '../test-utils.js';
import {
  autoBinCount, computeBins, globalRange, autoBinWidth, binAll,
  percentile, computeBoxStats,
} from '../../js/modules/histogram/histogram-binning.js';
import { State } from '../../js/modules/histogram/histogram-model.js';

// ─── Pure binning engine ────────────────────────────────────

suite('Histogram — binning engine (pure)', () => {
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

// ─── Model: State ───────────────────────────────────────────

suite('Histogram — Model State', () => {
  test('constructor sets defaults', () => {
    const s = new State();
    assertEqual(Array.isArray(s.datasets), true);
    assertEqual(s.datasets.length, 1);
    assertEqual(s.datasets[0].valueRef, null);
    assertEqual(s.datasets[0].groupRef, null);
    assertEqual(s.binMode, 'auto');
    assertEqual(s.binWidth, null);
    assertEqual(s.showPareto, true);
    assertEqual(s.showStats, true);
    assertEqual(s.showBoxplot, true);
    assertEqual(s.confLevel, 95);
    assertEqual(s.barGap, 1);
    assertEqual(s.chartConfig.showTitle, true);
    assertEqual(s.chartConfig.titleSize, 15);
    assertEqual(Array.isArray(s.refLines), true);
    assertEqual(Array.isArray(s.refAreas), true);
    assertEqual(Array.isArray(s.seriesOverrides), true);
  });

  test('hasContent false by default, true once a valueRef is set', () => {
    const s = new State();
    assertEqual(s.hasContent(), false);
    s.datasets[0].valueRef = { instanceId: 'w', sheetId: 's', columnId: 'c-0' };
    assertEqual(s.hasContent(), true);
  });

  test('toJSON returns legacy flat persistence shape', () => {
    const s = new State();
    s.datasets = [{ valueRef: { columnId: 'c-1' }, groupRef: null }];
    s.binMode = 'manual';
    s.binWidth = 5;
    s.chartConfig.title = 'My Title';
    s.chartConfig.showTitle = false;
    s.confLevel = 99;
    const j = s.toJSON();
    assertEqual(j.binMode, 'manual');
    assertEqual(j.binWidth, 5);
    assertEqual(j.chartTitleText, 'My Title');
    assertEqual(j.showTitle, false);
    assertEqual(j.confLevel, 99);
    assertEqual(j.datasets[0].valueRef.columnId, 'c-1');
    assertEqual(j.datasets[0].groupRef, null);
    // flat chartConfig fields
    assertEqual(j.titleSize, 15);
    assertEqual(j.labelSize, 12);
    assertEqual(j.tickSize, 11);
    assertEqual(j.showXLabel, true);
    assertEqual(j.barGap, 1);
  });

  test('toJSON deep-copies nested datasets/refLines/refAreas (structuredClone-safe)', () => {
    const s = new State();
    s.datasets = [{ valueRef: { columnId: 'c-0' }, groupRef: null }];
    s.refLines = [{ dir: 'v', value: 3, color: 'red', width: 1, dash: 'solid' }];
    s.refAreas = [{ dir: 'x', min: 0, max: 1, color: 'blue' }];
    const j = s.toJSON();
    // mutate originals — JSON snapshot must not change
    s.datasets[0].valueRef.columnId = 'MUT';
    s.refLines[0].value = 999;
    s.refAreas[0].min = 999;
    assertEqual(j.datasets[0].valueRef.columnId, 'c-0');
    assertEqual(j.refLines[0].value, 3);
    assertEqual(j.refAreas[0].min, 0);
    // structuredClone must succeed (createModule persist path)
    const cloned = structuredClone(j);
    assertEqual(cloned.refLines[0].value, 3);
  });

  test('fromJSON(null) → valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s instanceof State, true);
    assertEqual(s.datasets.length, 1);
    assertEqual(s.binMode, 'auto');
  });

  test('fromJSON(undefined) → valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.confLevel, 95);
  });

  test('fromJSON restores flat persisted shape', () => {
    const s = State.fromJSON({
      datasets: [{ valueRef: { columnId: 'c-2' }, groupRef: { columnId: 'g-0' } }],
      binMode: 'manual', binWidth: 2.5, confLevel: 90,
      showPareto: false, showStats: false, showBoxplot: false,
      chartTitleText: 'T', showTitle: false, titleSize: 20,
      labelSize: 14, tickSize: 9, showXLabel: false, barGap: 3,
      bgColor: '#fff', refLines: [{ dir: 'h', value: 1 }],
      refAreas: [{ dir: 'y', min: 0, max: 1 }],
      seriesOverrides: [{ name: 'S', visible: false }],
    });
    assertEqual(s.binMode, 'manual');
    assertAlmostEqual(s.binWidth, 2.5, 1e-9);
    assertEqual(s.confLevel, 90);
    assertEqual(s.showPareto, false);
    assertEqual(s.chartConfig.title, 'T');
    assertEqual(s.chartConfig.showTitle, false);
    assertEqual(s.chartConfig.titleSize, 20);
    assertEqual(s.chartConfig.bgColor, '#fff');
    assertEqual(s.barGap, 3);
    assertEqual(s.datasets[0].groupRef.columnId, 'g-0');
    assertEqual(s.refLines[0].value, 1);
    assertEqual(s.seriesOverrides[0].name, 'S');
  });

  test('fromJSON v1 backward-compat: seriesRefs → datasets', () => {
    const s = State.fromJSON({ seriesRefs: [{ columnId: 'c-0' }, { columnId: 'c-1' }] });
    assertEqual(s.datasets.length, 2);
    assertEqual(s.datasets[0].valueRef.columnId, 'c-0');
    assertEqual(s.datasets[0].groupRef, null);
    assertEqual(s.datasets[1].valueRef.columnId, 'c-1');
  });

  test('round-trip toJSON → fromJSON is lossless', () => {
    const s = new State();
    s.datasets = [{ valueRef: { columnId: 'c-0' }, groupRef: null }];
    s.binMode = 'manual'; s.binWidth = 4; s.confLevel = 80;
    s.showPareto = false; s.barGap = 2;
    s.chartConfig.title = 'Hi'; s.chartConfig.tickSize = 8;
    s.refLines = [{ dir: 'v', value: 7 }];
    const back = State.fromJSON(s.toJSON());
    assertEqual(back.binMode, 'manual');
    assertEqual(back.binWidth, 4);
    assertEqual(back.confLevel, 80);
    assertEqual(back.showPareto, false);
    assertEqual(back.barGap, 2);
    assertEqual(back.chartConfig.title, 'Hi');
    assertEqual(back.chartConfig.tickSize, 8);
    assertEqual(back.refLines[0].value, 7);
  });

  test('fromJSON sanitizes malformed binMode/confLevel', () => {
    const s = State.fromJSON({ binMode: 'bogus', confLevel: 'NaN', datasets: 'nope' });
    assertEqual(s.binMode, 'auto');
    assertEqual(s.confLevel, 95);
    assertEqual(s.datasets.length, 1);
    assertEqual(s.datasets[0].valueRef, null);
  });
});
