/**
 * D.Mike — XY-Plot Model Tests (xy-plot.test.js)
 *
 * TDD spec for the xy-plot-model.js State class.
 * Covers constructor defaults, toJSON/fromJSON roundtrip, hasContent(),
 * the v1 (colRefX + seriesRefs) backward-compat path, the bubble-size
 * mapping (buildBubble), and edge cases.
 */

import { suite, test, assertEqual, assertAlmostEqual } from '../test-utils.js';
import { State } from '../../js/modules/xy-plot/xy-plot-model.js';

const REF = (c) => ({ instanceId: 'i1', sheetId: 's1', columnId: c });

// ─── State: Defaults ─────────────────────────────────────────────────────────

suite('XY-Plot Model — State defaults', () => {
  test('constructor initializes datasets with one empty entry', () => {
    const s = new State();
    assertEqual(Array.isArray(s.datasets), true);
    assertEqual(s.datasets.length, 1);
    assertEqual(s.datasets[0].xRef, null);
    assertEqual(s.datasets[0].yRef, null);
    assertEqual(s.datasets[0].groupRef, null);
    assertEqual(s.datasets[0].sizeRef, null);
  });

  test('constructor sets seriesOverrides / refLines / refAreas to empty arrays', () => {
    const s = new State();
    assertEqual(s.seriesOverrides.length, 0);
    assertEqual(s.refLines.length, 0);
    assertEqual(s.refAreas.length, 0);
  });

  test('constructor sets showLines=false, showMarkers=true', () => {
    const s = new State();
    assertEqual(s.showLines, false);
    assertEqual(s.showMarkers, true);
  });

  test('constructor sets bgColor=null, showStats=true, confLevel=95', () => {
    const s = new State();
    assertEqual(s.bgColor, null);
    assertEqual(s.showStats, true);
    assertEqual(s.confLevel, 95);
  });

  test('constructor sets exampleWorksheetId=null', () => {
    const s = new State();
    assertEqual(s.exampleWorksheetId, null);
  });
});

// ─── hasContent ──────────────────────────────────────────────────────────────

suite('XY-Plot Model — hasContent', () => {
  test('returns false for fresh state', () => {
    assertEqual(new State().hasContent(), false);
  });

  test('returns true when a dataset has an xRef', () => {
    const s = new State();
    s.datasets[0].xRef = REF('c0');
    assertEqual(s.hasContent(), true);
  });

  test('returns true when a dataset has a yRef (no xRef)', () => {
    const s = new State();
    s.datasets[0].yRef = REF('c1');
    assertEqual(s.hasContent(), true);
  });

  test('returns false when all datasets have null x/y refs', () => {
    const s = new State();
    s.datasets = [
      { xRef: null, yRef: null, groupRef: null, sizeRef: null },
      { xRef: null, yRef: null, groupRef: null, sizeRef: null },
    ];
    assertEqual(s.hasContent(), false);
  });
});

// ─── toJSON ──────────────────────────────────────────────────────────────────

suite('XY-Plot Model — toJSON', () => {
  test('default toJSON has the legacy getState() shape', () => {
    const j = new State().toJSON();
    assertEqual(Array.isArray(j.datasets), true);
    assertEqual(j.datasets.length, 1);
    assertEqual(j.datasets[0].xRef, null);
    assertEqual(j.datasets[0].yRef, null);
    assertEqual(j.datasets[0].groupRef, null);
    assertEqual(j.datasets[0].sizeRef, null);
    assertEqual(j.showLines, false);
    assertEqual(j.showMarkers, true);
    assertEqual(Array.isArray(j.seriesOverrides), true);
    assertEqual(Array.isArray(j.refLines), true);
    assertEqual(Array.isArray(j.refAreas), true);
    assertEqual(j.bgColor, null);
    assertEqual(j.showStats, true);
    assertEqual(j.confLevel, 95);
    assertEqual(j.exampleWorksheetId, null);
  });

  test('toJSON serializes a complete dataset', () => {
    const s = new State();
    s.datasets[0] = { xRef: REF('cx'), yRef: REF('cy'), groupRef: REF('cg'), sizeRef: REF('cs') };
    const j = s.toJSON();
    assertEqual(j.datasets[0].xRef.columnId, 'cx');
    assertEqual(j.datasets[0].yRef.columnId, 'cy');
    assertEqual(j.datasets[0].groupRef.columnId, 'cg');
    assertEqual(j.datasets[0].sizeRef.columnId, 'cs');
  });

  test('toJSON preserves flags', () => {
    const s = new State();
    s.showLines = true;
    s.showMarkers = false;
    s.showStats = false;
    s.confLevel = 99;
    s.bgColor = '#ff0000';
    s.exampleWorksheetId = 'ws-1';
    const j = s.toJSON();
    assertEqual(j.showLines, true);
    assertEqual(j.showMarkers, false);
    assertEqual(j.showStats, false);
    assertEqual(j.confLevel, 99);
    assertEqual(j.bgColor, '#ff0000');
    assertEqual(j.exampleWorksheetId, 'ws-1');
  });
});

// ─── fromJSON ────────────────────────────────────────────────────────────────

suite('XY-Plot Model — fromJSON', () => {
  test('fromJSON(null) returns valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s.datasets.length, 1);
    assertEqual(s.datasets[0].xRef, null);
    assertEqual(s.showMarkers, true);
    assertEqual(s.confLevel, 95);
  });

  test('fromJSON(undefined) returns valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.datasets.length, 1);
    assertEqual(s.showLines, false);
  });

  test('fromJSON({}) returns valid default', () => {
    const s = State.fromJSON({});
    assertEqual(s.datasets.length, 1);
    assertEqual(s.confLevel, 95);
  });

  test('fromJSON restores datasets (all 4 slots)', () => {
    const s = State.fromJSON({
      datasets: [{ xRef: REF('cx'), yRef: REF('cy'), groupRef: REF('cg'), sizeRef: REF('cs') }],
    });
    assertEqual(s.datasets.length, 1);
    assertEqual(s.datasets[0].xRef.columnId, 'cx');
    assertEqual(s.datasets[0].sizeRef.columnId, 'cs');
  });

  test('fromJSON nulls missing slots', () => {
    const s = State.fromJSON({ datasets: [{ xRef: REF('cx'), yRef: REF('cy') }] });
    assertEqual(s.datasets[0].groupRef, null);
    assertEqual(s.datasets[0].sizeRef, null);
  });

  test('fromJSON empty datasets array → default single entry', () => {
    const s = State.fromJSON({ datasets: [] });
    assertEqual(s.datasets.length, 1);
    assertEqual(s.datasets[0].xRef, null);
  });

  test('fromJSON invalid datasets (non-array) → default', () => {
    const s = State.fromJSON({ datasets: 'bad' });
    assertEqual(s.datasets.length, 1);
    assertEqual(s.datasets[0].xRef, null);
  });

  test('fromJSON v1 backward-compat: colRefX + seriesRefs → per-dataset', () => {
    const s = State.fromJSON({
      colRefX: REF('cx'),
      seriesRefs: [REF('cy1'), REF('cy2')],
    });
    assertEqual(s.datasets.length, 2);
    assertEqual(s.datasets[0].xRef.columnId, 'cx');
    assertEqual(s.datasets[0].yRef.columnId, 'cy1');
    assertEqual(s.datasets[1].xRef.columnId, 'cx');
    assertEqual(s.datasets[1].yRef.columnId, 'cy2');
    assertEqual(s.datasets[0].groupRef, null);
    assertEqual(s.datasets[0].sizeRef, null);
  });

  test('fromJSON datasets takes precedence over v1 colRefX', () => {
    const s = State.fromJSON({
      datasets: [{ xRef: REF('cx'), yRef: REF('cy') }],
      colRefX: REF('other'),
      seriesRefs: [REF('z')],
    });
    assertEqual(s.datasets.length, 1);
    assertEqual(s.datasets[0].xRef.columnId, 'cx');
  });

  test('fromJSON restores flags', () => {
    const s = State.fromJSON({ showLines: true, showMarkers: false, showStats: false, confLevel: 90 });
    assertEqual(s.showLines, true);
    assertEqual(s.showMarkers, false);
    assertEqual(s.showStats, false);
    assertEqual(s.confLevel, 90);
  });

  test('fromJSON defaults invalid confLevel to 95', () => {
    assertEqual(State.fromJSON({ confLevel: 'bad' }).confLevel, 95);
  });

  test('fromJSON restores bgColor / null', () => {
    assertEqual(State.fromJSON({ bgColor: '#abc' }).bgColor, '#abc');
    assertEqual(State.fromJSON({ bgColor: null }).bgColor, null);
    assertEqual(State.fromJSON({ bgColor: 42 }).bgColor, null);
  });

  test('fromJSON restores seriesOverrides / refLines / refAreas', () => {
    const s = State.fromJSON({
      seriesOverrides: [{ name: 'S1', color: '#f00' }],
      refLines: [{ dir: 'h', value: 10 }],
      refAreas: [{ from: 1, to: 2 }],
    });
    assertEqual(s.seriesOverrides[0].name, 'S1');
    assertEqual(s.refLines[0].value, 10);
    assertEqual(s.refAreas[0].to, 2);
  });

  test('fromJSON invalid seriesOverrides (non-array) → empty', () => {
    assertEqual(State.fromJSON({ seriesOverrides: 'bad' }).seriesOverrides.length, 0);
  });

  test('fromJSON restores exampleWorksheetId, defaults non-string to null', () => {
    assertEqual(State.fromJSON({ exampleWorksheetId: 'ws-x' }).exampleWorksheetId, 'ws-x');
    assertEqual(State.fromJSON({ exampleWorksheetId: 42 }).exampleWorksheetId, null);
  });
});

// ─── Round-trip ──────────────────────────────────────────────────────────────

suite('XY-Plot Model — toJSON/fromJSON roundtrip', () => {
  test('roundtrip with defaults', () => {
    const s2 = State.fromJSON(new State().toJSON());
    assertEqual(s2.datasets.length, 1);
    assertEqual(s2.datasets[0].xRef, null);
    assertEqual(s2.showLines, false);
    assertEqual(s2.showMarkers, true);
    assertEqual(s2.confLevel, 95);
  });

  test('roundtrip preserves full dataset + flags + overrides', () => {
    const s = new State();
    s.datasets = [{ xRef: REF('cx'), yRef: REF('cy'), groupRef: REF('cg'), sizeRef: REF('cs') }];
    s.showLines = true;
    s.showMarkers = false;
    s.showStats = false;
    s.confLevel = 80;
    s.bgColor = '#123456';
    s.seriesOverrides = [{ name: 'A', color: '#0f0', visible: true }];
    s.refLines = [{ dir: 'v', value: 5 }];
    s.exampleWorksheetId = 'ws-r';
    const s2 = State.fromJSON(s.toJSON());
    assertEqual(s2.datasets[0].sizeRef.columnId, 'cs');
    assertEqual(s2.showLines, true);
    assertEqual(s2.showMarkers, false);
    assertEqual(s2.showStats, false);
    assertEqual(s2.confLevel, 80);
    assertEqual(s2.bgColor, '#123456');
    assertEqual(s2.seriesOverrides[0].name, 'A');
    assertEqual(s2.refLines[0].value, 5);
    assertEqual(s2.exampleWorksheetId, 'ws-r');
  });
});

// ─── buildBubble ─────────────────────────────────────────────────────────────

suite('XY-Plot Model — buildBubble', () => {
  test('maps sizes into the 6–28 px diameter range', () => {
    const { sizes, rawSizes, label } = State.buildBubble([1, 4, 9, 16], 'Risk');
    assertEqual(rawSizes.length, 4);
    assertEqual(label, 'Risk');
    // min sqrt → 6, max sqrt → 28
    assertAlmostEqual(sizes[0], 6, 1e-9);
    assertAlmostEqual(sizes[3], 28, 1e-9);
    // sqrt-normalized: sqrt(4)=2 maps to 6 + (2-1)/(4-1)*22 = 6 + 22/3
    assertAlmostEqual(sizes[1], 6 + (2 - 1) / (4 - 1) * 22, 1e-9);
  });

  test('uniform sizes map all to the midpoint (D_MIN + 0.5*span)', () => {
    const { sizes } = State.buildBubble([5, 5, 5], 'L');
    assertAlmostEqual(sizes[0], 6 + 0.5 * 22, 1e-9);
    assertAlmostEqual(sizes[2], 17, 1e-9);
  });

  test('keeps rawSizes untouched', () => {
    const { rawSizes } = State.buildBubble([3, 6, 9], 'L');
    assertEqual(rawSizes[0], 3);
    assertEqual(rawSizes[2], 9);
  });
});
