/**
 * Histogram Module — unit tests (model).
 * Written TDD-first for the createModule + Alpine migration.
 */
import { suite, test, assertEqual, assertAlmostEqual } from '../test-utils.js';
import { State } from '../../js/modules/histogram/histogram-model.js';

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

  test('axis titles round-trip as chartXLabelText/chartYLabelText', () => {
    const s = new State();
    s.chartConfig.xLabel = 'Diameter [mm]';
    s.chartConfig.yLabel = 'Count';
    const j = s.toJSON();
    assertEqual(j.chartXLabelText, 'Diameter [mm]');
    assertEqual(j.chartYLabelText, 'Count');
    const back = State.fromJSON(j);
    assertEqual(back.chartConfig.xLabel, 'Diameter [mm]');
    assertEqual(back.chartConfig.yLabel, 'Count');
    assertEqual(State.fromJSON({}).chartConfig.xLabel, '');
  });
});
