/**
 * D.Mike — Bar Chart Module — Unit Tests
 *
 * Covers:
 *   - State Model: defaults (incl. chartConfig defaults), toJSON/fromJSON
 *     round-trip (incl. chartConfig + aggregation/stacked mode),
 *     null/undefined robustness, ref + config sanitization, hasContent()
 *     (requires X).
 *   - Bar aggregation/grouping computation (`buildChartData`, moved out of the
 *     legacy `_buildChartData`):
 *       · X only            → frequency count per category (single series)
 *       · X + Y (mean/sum)  → mean/sum of Y per X-level (single series)
 *       · X + G             → cross-tab count (one series per G-level)
 *       · X + Y + G (mean)  → mean of Y per (X, G) (one series per G-level)
 *       · blank X rows dropped; blank G rows dropped; non-numeric Y skipped
 *       · PALETTE color assignment per group
 *     asserted against hand-computed reference values.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import { State, PALETTE } from '../../js/modules/bar/bar-model.js';

const REF_X = { instanceId: 'i1', sheetId: 's1', columnId: 'cx' };
const REF_Y = { instanceId: 'i1', sheetId: 's1', columnId: 'cy' };
const REF_G = { instanceId: 'i1', sheetId: 's1', columnId: 'cg' };

/** Build a getValues(ref) accessor over the fixture columns. */
function makeGetValues(map) {
  return (ref) => {
    if (!ref) return null;
    if (ref.columnId === 'cx') return map.x;
    if (ref.columnId === 'cy') return map.y;
    if (ref.columnId === 'cg') return map.g;
    return null;
  };
}

/** Default opts (mirrors the data-fn call: aggregation + column-name fns). */
function opts(extra = {}) {
  return {
    aggregation: 'mean',
    xColumnName: 'C1',
    yColumnName: 'C2',
    ...extra,
  };
}

// ─────────────────────────────────────────────────────────────
// Model — defaults
// ─────────────────────────────────────────────────────────────

suite('Bar Model — defaults', () => {
  test('constructor sets default values', () => {
    const s = new State();
    assertEqual(s.xRef, null);
    assertEqual(s.yRef, null);
    assertEqual(s.gRef, null);
    assertEqual(s.exampleWorksheetId, null);
    assertEqual(s.chartConfig.showTitle, true);
    assertEqual(s.chartConfig.title, '');
    assertEqual(s.chartConfig.titleSize, 15);
    assertEqual(s.chartConfig.showLegend, true);
    assertEqual(s.chartConfig.stacked, false);
    assertEqual(s.chartConfig.aggregation, 'mean');
    assertEqual(s.chartConfig.barGap, 4);
    assertEqual(s.chartConfig.categoryGap, 0.3);
    assertEqual(s.chartConfig.bgColor, null);
    assertEqual(s.chartConfig.xLabel, '');
    assertEqual(s.chartConfig.yLabel, '');
  });

  test('hasContent is false by default', () => {
    assertEqual(new State().hasContent(), false);
  });

  test('hasContent requires X only', () => {
    const sx = new State();
    sx.xRef = { ...REF_X };
    assertEqual(sx.hasContent(), true);

    const sy = new State();
    sy.yRef = { ...REF_Y };
    assertEqual(sy.hasContent(), false);

    const sg = new State();
    sg.gRef = { ...REF_G };
    assertEqual(sg.hasContent(), false);
  });
});

// ─────────────────────────────────────────────────────────────
// Model — serialization
// ─────────────────────────────────────────────────────────────

suite('Bar Model — serialization', () => {
  test('toJSON returns expected shape', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.yRef = { ...REF_Y };
    s.gRef = { ...REF_G };
    s.chartConfig.stacked = true;
    s.chartConfig.aggregation = 'sum';
    s.exampleWorksheetId = 'ws-9';
    const j = s.toJSON();
    assertEqual(JSON.stringify(j.xRef), JSON.stringify(REF_X));
    assertEqual(JSON.stringify(j.yRef), JSON.stringify(REF_Y));
    assertEqual(JSON.stringify(j.gRef), JSON.stringify(REF_G));
    assertEqual(j.chartConfig.stacked, true);
    assertEqual(j.chartConfig.aggregation, 'sum');
    assertEqual(j.exampleWorksheetId, 'ws-9');
  });

  test('fromJSON(null) returns valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s.xRef, null);
    assertEqual(s.yRef, null);
    assertEqual(s.gRef, null);
    assertEqual(s.chartConfig.aggregation, 'mean');
    assertEqual(s.chartConfig.stacked, false);
    assertEqual(s.exampleWorksheetId, null);
  });

  test('fromJSON(undefined) returns valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.xRef, null);
    assertEqual(s.chartConfig.barGap, 4);
  });

  test('fromJSON restores data (legacy shape)', () => {
    const s = State.fromJSON({
      xRef: { ...REF_X },
      yRef: { ...REF_Y },
      gRef: { ...REF_G },
      chartConfig: { title: 'T', stacked: true, aggregation: 'sum', showLegend: false, bgColor: '#fff' },
    });
    assertEqual(s.xRef.columnId, 'cx');
    assertEqual(s.yRef.columnId, 'cy');
    assertEqual(s.gRef.columnId, 'cg');
    assertEqual(s.chartConfig.title, 'T');
    assertEqual(s.chartConfig.stacked, true);
    assertEqual(s.chartConfig.aggregation, 'sum');
    assertEqual(s.chartConfig.showLegend, false);
    assertEqual(s.chartConfig.bgColor, '#fff');
    // unspecified chartConfig fields fall back to defaults
    assertEqual(s.chartConfig.showTitle, true);
    assertEqual(s.chartConfig.barGap, 4);
  });

  test('toJSON → fromJSON round-trip is lossless', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.yRef = { ...REF_Y };
    s.gRef = { ...REF_G };
    s.chartConfig.title = 'Hello';
    s.chartConfig.stacked = true;
    s.chartConfig.aggregation = 'sum';
    s.chartConfig.categoryGap = 0.5;
    s.exampleWorksheetId = 'ws-7';
    const r = State.fromJSON(s.toJSON());
    assertEqual(JSON.stringify(r.toJSON()), JSON.stringify(s.toJSON()));
  });

  test('fromJSON ignores malformed refs', () => {
    assertEqual(State.fromJSON({ xRef: 'nope' }).xRef, null);
    assertEqual(State.fromJSON({ yRef: 5 }).yRef, null);
    assertEqual(JSON.stringify(State.fromJSON({ gRef: {} }).gRef), JSON.stringify({}));
  });

  test('fromJSON ignores malformed chartConfig', () => {
    const s = State.fromJSON({ chartConfig: 'nope' });
    assertEqual(s.chartConfig.aggregation, 'mean');
    assertEqual(s.chartConfig.stacked, false);
  });

  test('fromJSON ignores non-string exampleWorksheetId', () => {
    assertEqual(State.fromJSON({ exampleWorksheetId: 5 }).exampleWorksheetId, null);
  });
});

// ─────────────────────────────────────────────────────────────
// Computation — frequency (X only)
// ─────────────────────────────────────────────────────────────

suite('Bar Model — buildChartData (X only / frequency)', () => {
  const DATA_X = ['A', 'B', 'A', 'C', 'B'];

  test('single series with frequency counts, first-seen order', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    const d = s.buildChartData(makeGetValues({ x: DATA_X }), opts());
    assertEqual(d.categories.join(','), 'A,B,C');
    assertEqual(d.groups.length, 1);
    // A=2, B=2, C=1
    assertEqual(JSON.stringify(d.groups[0].values), JSON.stringify([2, 2, 1]));
    assertEqual(d.groups[0].name, 'C1'); // xColumnName for freq series
    assertEqual(d.groups[0].color, PALETTE[0]);
  });

  test('blank x rows dropped', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    const d = s.buildChartData(makeGetValues({ x: ['A', '', null, 'B', 'A'] }), opts());
    assertEqual(d.categories.join(','), 'A,B');
    assertEqual(JSON.stringify(d.groups[0].values), JSON.stringify([2, 1]));
  });

  test('returns empty when no x ref', () => {
    const s = new State();
    const d = s.buildChartData(makeGetValues({ x: DATA_X }), opts());
    assertEqual(d.categories.length, 0);
    assertEqual(d.groups.length, 0);
  });

  test('returns empty when x values empty', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    assertEqual(s.buildChartData(makeGetValues({ x: [] }), opts()).categories.length, 0);
    assertEqual(s.buildChartData(() => null, opts()).categories.length, 0);
  });
});

// ─────────────────────────────────────────────────────────────
// Computation — X + Y (mean / sum)
// ─────────────────────────────────────────────────────────────

suite('Bar Model — buildChartData (X + Y)', () => {
  const DATA_X = ['A', 'B', 'A', 'C', 'B'];
  const DATA_Y = [10, 20, 30, 40, 50];

  test('mean of Y per X-level', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.yRef = { ...REF_Y };
    const d = s.buildChartData(makeGetValues({ x: DATA_X, y: DATA_Y }), opts({ aggregation: 'mean' }));
    assertEqual(d.categories.join(','), 'A,B,C');
    // A: (10+30)/2=20, B: (20+50)/2=35, C: 40/1=40
    assertEqual(JSON.stringify(d.groups[0].values), JSON.stringify([20, 35, 40]));
    assertEqual(d.groups[0].name, 'C2'); // yColumnName for Y series
  });

  test('sum of Y per X-level', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.yRef = { ...REF_Y };
    const d = s.buildChartData(makeGetValues({ x: DATA_X, y: DATA_Y }), opts({ aggregation: 'sum' }));
    // A: 40, B: 70, C: 40
    assertEqual(JSON.stringify(d.groups[0].values), JSON.stringify([40, 70, 40]));
  });

  test('non-numeric Y values are skipped', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.yRef = { ...REF_Y };
    const d = s.buildChartData(
      makeGetValues({ x: ['A', 'A', 'B'], y: ['10', 'x', '20'] }),
      opts({ aggregation: 'mean' }),
    );
    // A: only 10 valid → 10 ; B: 20
    assertEqual(JSON.stringify(d.groups[0].values), JSON.stringify([10, 20]));
  });
});

// ─────────────────────────────────────────────────────────────
// Computation — X + G (cross-tab count)
// ─────────────────────────────────────────────────────────────

suite('Bar Model — buildChartData (X + G)', () => {
  const DATA_X = ['A', 'B', 'A', 'C', 'B'];
  const DATA_G = ['X', 'Y', 'X', 'Y', 'X'];

  test('one series per G-level with cross-tab counts', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.gRef = { ...REF_G };
    const d = s.buildChartData(makeGetValues({ x: DATA_X, g: DATA_G }), opts());
    assertEqual(d.categories.join(','), 'A,B,C');
    assertEqual(d.groups.map((g) => g.name).join(','), 'X,Y');
    // pairs: A/X, B/Y, A/X, C/Y, B/X
    // X: A=2, B=1, C=0 ; Y: A=0, B=0... wait recompute below
    const gX = d.groups.find((g) => g.name === 'X');
    const gY = d.groups.find((g) => g.name === 'Y');
    // X: A=2(rows0,2), B=1(row4), C=0
    assertEqual(JSON.stringify(gX.values), JSON.stringify([2, 1, 0]));
    // Y: A=0, B=1(row1)? row1 is B/Y → yes, C=1(row3)
    assertEqual(JSON.stringify(gY.values), JSON.stringify([0, 1, 1]));
  });

  test('groups get PALETTE colors in order', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.gRef = { ...REF_G };
    const d = s.buildChartData(makeGetValues({ x: DATA_X, g: DATA_G }), opts());
    assertEqual(d.groups[0].color, PALETTE[0]);
    assertEqual(d.groups[1].color, PALETTE[1]);
  });

  test('blank g cells skipped', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.gRef = { ...REF_G };
    const d = s.buildChartData(
      makeGetValues({ x: ['A', 'A', 'B'], g: ['X', '', 'X'] }),
      opts(),
    );
    assertEqual(d.groups.map((g) => g.name).join(','), 'X');
    const gX = d.groups[0];
    // A/X row0 = 1 ; A/(blank) row1 dropped ; B/X row2 = 1
    assertEqual(JSON.stringify(gX.values), JSON.stringify([1, 1]));
  });
});

// ─────────────────────────────────────────────────────────────
// Computation — X + Y + G (mean per cell)
// ─────────────────────────────────────────────────────────────

suite('Bar Model — buildChartData (X + Y + G)', () => {
  const DATA_X = ['A', 'A', 'B', 'B'];
  const DATA_Y = [10, 30, 20, 40];
  const DATA_G = ['X', 'Y', 'X', 'Y'];

  test('mean of Y per (X, G) cell', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.yRef = { ...REF_Y };
    s.gRef = { ...REF_G };
    const d = s.buildChartData(makeGetValues({ x: DATA_X, y: DATA_Y, g: DATA_G }), opts({ aggregation: 'mean' }));
    assertEqual(d.categories.join(','), 'A,B');
    assertEqual(d.groups.map((g) => g.name).join(','), 'X,Y');
    const gX = d.groups.find((g) => g.name === 'X');
    const gY = d.groups.find((g) => g.name === 'Y');
    // X: A=10, B=20 ; Y: A=30, B=40
    assertEqual(JSON.stringify(gX.values), JSON.stringify([10, 20]));
    assertEqual(JSON.stringify(gY.values), JSON.stringify([30, 40]));
  });

  test('sum of Y per (X, G) cell', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.yRef = { ...REF_Y };
    s.gRef = { ...REF_G };
    const d = s.buildChartData(
      makeGetValues({ x: ['A', 'A', 'B'], y: [10, 5, 20], g: ['X', 'X', 'X'] }),
      opts({ aggregation: 'sum' }),
    );
    const gX = d.groups[0];
    // X: A=15, B=20
    assertEqual(JSON.stringify(gX.values), JSON.stringify([15, 20]));
  });
});
