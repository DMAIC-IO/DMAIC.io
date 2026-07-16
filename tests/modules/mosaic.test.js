/**
 * D.Mike — Mosaic Chart Module — Unit Tests
 *
 * Covers:
 *   - State Model: defaults (incl. chartConfig defaults), toJSON/fromJSON
 *     round-trip (incl. chartConfig), null/undefined robustness, ref + config
 *     sanitization, hasContent() (requires BOTH X and G).
 *   - Mosaic cross-tab computation (`buildChartData`, moved out of the legacy
 *     `_buildChartData`):
 *       · X-level / G-level extraction (first-seen order, both non-blank)
 *       · per-cell counts (groups[gi].values[xi]) vs hand-computed cross-tab
 *       · blank X or G rows dropped from both axes and counts
 *       · PALETTE color assignment per group
 *     asserted against hand-computed reference values.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import { State, PALETTE } from '../../js/modules/mosaic/mosaic-model.js';

const REF_X = { instanceId: 'i1', sheetId: 's1', columnId: 'cx' };
const REF_G = { instanceId: 'i1', sheetId: 's1', columnId: 'cg' };

/** Build a getValues(ref) accessor over the fixture columns. */
function makeGetValues(map) {
  return (ref) => {
    if (!ref) return null;
    if (ref.columnId === 'cx') return map.x;
    if (ref.columnId === 'cg') return map.g;
    return null;
  };
}

// ─────────────────────────────────────────────────────────────
// Model — defaults
// ─────────────────────────────────────────────────────────────

suite('Mosaic Model — defaults', () => {
  test('constructor sets default values', () => {
    const s = new State();
    assertEqual(s.xRef, null);
    assertEqual(s.gRef, null);
    assertEqual(s.exampleWorksheetId, null);
    assertEqual(s.chartConfig.title, '');
    assertEqual(s.chartConfig.showTitle, true);
    assertEqual(s.chartConfig.showLegend, true);
    assertEqual(s.chartConfig.showCellLabels, true);
    assertEqual(s.chartConfig.columnGap, 2);
    assertEqual(s.chartConfig.segmentGap, 1);
    assertEqual(s.chartConfig.bgColor, null);
  });

  test('hasContent is false by default', () => {
    assertEqual(new State().hasContent(), false);
  });

  test('hasContent requires BOTH x and g', () => {
    const sx = new State();
    sx.xRef = { ...REF_X };
    assertEqual(sx.hasContent(), false);

    const sg = new State();
    sg.gRef = { ...REF_G };
    assertEqual(sg.hasContent(), false);

    const both = new State();
    both.xRef = { ...REF_X };
    both.gRef = { ...REF_G };
    assertEqual(both.hasContent(), true);
  });
});

// ─────────────────────────────────────────────────────────────
// Model — serialization
// ─────────────────────────────────────────────────────────────

suite('Mosaic Model — serialization', () => {
  test('toJSON returns expected shape', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.gRef = { ...REF_G };
    s.chartConfig.showLegend = false;
    s.chartConfig.columnGap = 5;
    s.exampleWorksheetId = 'ws-9';
    const j = s.toJSON();
    assertEqual(JSON.stringify(j.xRef), JSON.stringify(REF_X));
    assertEqual(JSON.stringify(j.gRef), JSON.stringify(REF_G));
    assertEqual(j.chartConfig.showLegend, false);
    assertEqual(j.chartConfig.columnGap, 5);
    assertEqual(j.exampleWorksheetId, 'ws-9');
  });

  test('fromJSON(null) returns valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s.xRef, null);
    assertEqual(s.gRef, null);
    assertEqual(s.chartConfig.showLegend, true);
    assertEqual(s.chartConfig.columnGap, 2);
    assertEqual(s.exampleWorksheetId, null);
  });

  test('fromJSON(undefined) returns valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.xRef, null);
    assertEqual(s.chartConfig.segmentGap, 1);
  });

  test('fromJSON restores data (legacy shape)', () => {
    const s = State.fromJSON({
      xRef: { ...REF_X },
      gRef: { ...REF_G },
      chartConfig: { title: 'T', showLegend: false, showCellLabels: false, columnGap: 8, segmentGap: 3, bgColor: '#fff' },
    });
    assertEqual(s.xRef.columnId, 'cx');
    assertEqual(s.gRef.columnId, 'cg');
    assertEqual(s.chartConfig.title, 'T');
    assertEqual(s.chartConfig.showLegend, false);
    assertEqual(s.chartConfig.showCellLabels, false);
    assertEqual(s.chartConfig.columnGap, 8);
    assertEqual(s.chartConfig.segmentGap, 3);
    assertEqual(s.chartConfig.bgColor, '#fff');
    // unspecified chartConfig fields fall back to defaults
    assertEqual(s.chartConfig.showTitle, true);
  });

  test('toJSON → fromJSON round-trip is lossless', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.gRef = { ...REF_G };
    s.chartConfig.title = 'Hello';
    s.chartConfig.showLegend = false;
    s.chartConfig.columnGap = 6;
    s.chartConfig.segmentGap = 2;
    s.exampleWorksheetId = 'ws-7';
    const r = State.fromJSON(s.toJSON());
    assertEqual(JSON.stringify(r.toJSON()), JSON.stringify(s.toJSON()));
  });

  test('fromJSON ignores malformed refs', () => {
    assertEqual(State.fromJSON({ xRef: 'nope' }).xRef, null);
    assertEqual(State.fromJSON({ gRef: 5 }).gRef, null);
    assertEqual(JSON.stringify(State.fromJSON({ xRef: {} }).xRef), JSON.stringify({}));
  });

  test('fromJSON ignores malformed chartConfig', () => {
    const s = State.fromJSON({ chartConfig: 'nope' });
    assertEqual(s.chartConfig.showLegend, true);
    assertEqual(s.chartConfig.columnGap, 2);
  });

  test('fromJSON ignores non-string exampleWorksheetId', () => {
    assertEqual(State.fromJSON({ exampleWorksheetId: 5 }).exampleWorksheetId, null);
  });
});

// ─────────────────────────────────────────────────────────────
// Computation — cross-tab counts
// ─────────────────────────────────────────────────────────────

suite('Mosaic Model — buildChartData', () => {
  // categories = X-levels, groups = G-levels (values[] indexed by X-level)
  const DATA_X = ['A', 'A', 'B', 'B', 'C', 'C', 'B', 'A', 'A', 'B'];
  const DATA_G = ['X', 'Y', 'X', 'Y', 'X', 'Y', 'X', 'Y', 'X', 'Z'];

  test('X-levels (categories) and G-levels (groups) in first-seen order', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.gRef = { ...REF_G };
    const d = s.buildChartData(makeGetValues({ x: DATA_X, g: DATA_G }));
    assertEqual(d.categories.join(','), 'A,B,C');
    assertEqual(d.groups.map((g) => g.name).join(','), 'X,Y,Z');
  });

  test('group values match hand-computed cross-tab', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.gRef = { ...REF_G };
    const d = s.buildChartData(makeGetValues({ x: DATA_X, g: DATA_G }));
    // pairs (x,g): A/X(0), A/Y(1), B/X(2), B/Y(3), C/X(4), C/Y(5), B/X(6), A/Y(7), A/X(8), B/Z(9)
    // groups indexed by X-cat (A,B,C):
    // X: A=2 (0,8), B=2 (2,6), C=1 (4)
    // Y: A=2 (1,7), B=1 (3),  C=1 (5)
    // Z: A=0,       B=1 (9),  C=0
    const gX = d.groups.find((g) => g.name === 'X');
    const gY = d.groups.find((g) => g.name === 'Y');
    const gZ = d.groups.find((g) => g.name === 'Z');
    assertEqual(JSON.stringify(gX.values), JSON.stringify([2, 2, 1]));
    assertEqual(JSON.stringify(gY.values), JSON.stringify([2, 1, 1]));
    assertEqual(JSON.stringify(gZ.values), JSON.stringify([0, 1, 0]));
  });

  test('groups get PALETTE colors in order', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.gRef = { ...REF_G };
    const d = s.buildChartData(makeGetValues({ x: DATA_X, g: DATA_G }));
    assertEqual(d.groups[0].color, PALETTE[0]);
    assertEqual(d.groups[1].color, PALETTE[1]);
    assertEqual(d.groups[2].color, PALETTE[2]);
  });

  test('blank x or g cells are dropped from both axes and counts', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.gRef = { ...REF_G };
    const d = s.buildChartData(
      makeGetValues({ x: ['A', '', 'A', 'B', null], g: ['X', 'Y', 'X', 'Y', 'X'] }),
    );
    assertEqual(d.categories.join(','), 'A,B');
    assertEqual(d.groups.map((g) => g.name).join(','), 'X,Y');
    const gX = d.groups.find((g) => g.name === 'X');
    const gY = d.groups.find((g) => g.name === 'Y');
    // (A,X) at rows 0,2 → 2 ; (B,Y) at row 3 → 1
    assertEqual(gX.values[0], 2); // X, col A
    assertEqual(gX.values[1], 0); // X, col B
    assertEqual(gY.values[1], 1); // Y, col B
  });

  test('returns empty when no valid pairs', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.gRef = { ...REF_G };
    const d = s.buildChartData(makeGetValues({ x: ['', '', ''], g: ['X', 'Y', 'Z'] }));
    assertEqual(d.categories.length, 0);
    assertEqual(d.groups.length, 0);
  });

  test('returns empty when x or g ref missing', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    const d = s.buildChartData(makeGetValues({ x: DATA_X, g: DATA_G }));
    assertEqual(d.categories.length, 0);
    assertEqual(d.groups.length, 0);
  });

  test('returns empty when column values are empty/null', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.gRef = { ...REF_G };
    assertEqual(s.buildChartData(makeGetValues({ x: [], g: [] })).categories.length, 0);
    assertEqual(s.buildChartData(() => null).categories.length, 0);
  });

  test('length clamped to shortest of x/g', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.gRef = { ...REF_G };
    const d = s.buildChartData(makeGetValues({ x: ['A', 'B', 'C'], g: ['X', 'Y'] }));
    assertEqual(d.categories.join(','), 'A,B');
    assertEqual(d.groups.map((g) => g.name).join(','), 'X,Y');
  });
});
