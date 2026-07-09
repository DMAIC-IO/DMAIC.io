/**
 * D.Mike — Heatmap Chart Module — Unit Tests
 *
 * Covers:
 *   - State Model: defaults, toJSON/fromJSON round-trip, robustness,
 *     sanitization (refs, chartConfig, aggregation enum), hasContent().
 *   - Heatmap computation (the testable core, moved out of the legacy
 *     `_buildChartData`):
 *       · row/col category extraction (first-seen order, both non-blank)
 *       · cell aggregation: count (no V) vs mean vs sum (with V)
 *       · empty-cell handling (NaN in V mode, 0 in count mode)
 *     asserted against hand-computed reference values.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import { State } from '../../js/modules/heatmap/heatmap-model.js';

const REF_X = { instanceId: 'i1', sheetId: 's1', columnId: 'cx' };
const REF_G = { instanceId: 'i1', sheetId: 's1', columnId: 'cg' };
const REF_V = { instanceId: 'i1', sheetId: 's1', columnId: 'cv' };

/** Build a getValues(ref) accessor over the fixture columns. */
function makeGetValues(map) {
  return (ref) => {
    if (!ref) return null;
    if (ref.columnId === 'cx') return map.x;
    if (ref.columnId === 'cg') return map.g;
    if (ref.columnId === 'cv') return map.v;
    return null;
  };
}

// ─────────────────────────────────────────────────────────────
// Model — defaults
// ─────────────────────────────────────────────────────────────

suite('Heatmap Model — defaults', () => {
  test('constructor sets default values', () => {
    const s = new State();
    assertEqual(s.xRef, null);
    assertEqual(s.gRef, null);
    assertEqual(s.vRef, null);
    assertEqual(s.exampleWorksheetId, null);
    assertEqual(s.chartConfig.aggregation, 'mean');
    assertEqual(s.chartConfig.title, '');
    assertEqual(s.chartConfig.showTitle, true);
    assertEqual(s.chartConfig.showCellLabels, true);
    assertEqual(s.chartConfig.cellGap, 1);
    assertEqual(s.chartConfig.valueDecimals, 1);
    assertEqual(s.chartConfig.colorScheme, 'viridis');
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

suite('Heatmap Model — serialization', () => {
  test('toJSON returns expected shape', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.gRef = { ...REF_G };
    s.vRef = { ...REF_V };
    s.chartConfig.aggregation = 'sum';
    s.exampleWorksheetId = 'ws-9';
    const j = s.toJSON();
    assertEqual(JSON.stringify(j.xRef), JSON.stringify(REF_X));
    assertEqual(JSON.stringify(j.gRef), JSON.stringify(REF_G));
    assertEqual(JSON.stringify(j.vRef), JSON.stringify(REF_V));
    assertEqual(j.chartConfig.aggregation, 'sum');
    assertEqual(j.exampleWorksheetId, 'ws-9');
  });

  test('fromJSON(null) returns valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s.xRef, null);
    assertEqual(s.gRef, null);
    assertEqual(s.vRef, null);
    assertEqual(s.chartConfig.aggregation, 'mean');
    assertEqual(s.exampleWorksheetId, null);
  });

  test('fromJSON(undefined) returns valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.xRef, null);
    assertEqual(s.chartConfig.valueDecimals, 1);
  });

  test('fromJSON restores data (legacy shape)', () => {
    const s = State.fromJSON({
      xRef: { ...REF_X },
      gRef: { ...REF_G },
      vRef: { ...REF_V },
      chartConfig: { aggregation: 'sum', title: 'T', valueDecimals: 2, colorScheme: 'magma' },
    });
    assertEqual(s.xRef.columnId, 'cx');
    assertEqual(s.gRef.columnId, 'cg');
    assertEqual(s.vRef.columnId, 'cv');
    assertEqual(s.chartConfig.aggregation, 'sum');
    assertEqual(s.chartConfig.title, 'T');
    assertEqual(s.chartConfig.valueDecimals, 2);
    assertEqual(s.chartConfig.colorScheme, 'magma');
    // unspecified chartConfig fields fall back to defaults
    assertEqual(s.chartConfig.showCellLabels, true);
    assertEqual(s.chartConfig.cellGap, 1);
  });

  test('toJSON → fromJSON round-trip is lossless', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.gRef = { ...REF_G };
    s.vRef = { ...REF_V };
    s.chartConfig.aggregation = 'sum';
    s.chartConfig.title = 'Hello';
    s.chartConfig.valueDecimals = 3;
    s.exampleWorksheetId = 'ws-7';
    const r = State.fromJSON(s.toJSON());
    assertEqual(JSON.stringify(r.toJSON()), JSON.stringify(s.toJSON()));
  });

  test('fromJSON ignores malformed refs', () => {
    assertEqual(State.fromJSON({ xRef: 'nope' }).xRef, null);
    assertEqual(State.fromJSON({ gRef: 5 }).gRef, null);
    assertEqual(JSON.stringify(State.fromJSON({ xRef: {} }).xRef), JSON.stringify({}));
  });

  test('fromJSON sanitizes invalid aggregation to mean', () => {
    assertEqual(State.fromJSON({ chartConfig: { aggregation: 'median' } }).chartConfig.aggregation, 'mean');
    assertEqual(State.fromJSON({ chartConfig: { aggregation: 42 } }).chartConfig.aggregation, 'mean');
  });

  test('fromJSON keeps a valid sum aggregation', () => {
    assertEqual(State.fromJSON({ chartConfig: { aggregation: 'sum' } }).chartConfig.aggregation, 'sum');
  });

  test('fromJSON ignores non-string exampleWorksheetId', () => {
    assertEqual(State.fromJSON({ exampleWorksheetId: 5 }).exampleWorksheetId, null);
  });
});

// ─────────────────────────────────────────────────────────────
// Computation — frequency (no V)
// ─────────────────────────────────────────────────────────────

suite('Heatmap Model — buildChartData: frequency (no V)', () => {
  // X drives columns, G drives rows.
  const DATA_X = ['A', 'A', 'B', 'B', 'C', 'C', 'B', 'A', 'A', 'B'];
  const DATA_G = ['X', 'Y', 'X', 'Y', 'X', 'Y', 'X', 'Y', 'X', 'Z'];

  test('column / row categories in first-seen order', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.gRef = { ...REF_G };
    const d = s.buildChartData(makeGetValues({ x: DATA_X, g: DATA_G }), 'mean');
    assertEqual(d.xCategories.join(','), 'A,B,C');
    assertEqual(d.yCategories.join(','), 'X,Y,Z');
  });

  test('cell counts match hand-computed cross-tab', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.gRef = { ...REF_G };
    const d = s.buildChartData(makeGetValues({ x: DATA_X, g: DATA_G }), 'mean');
    // rows = G (X,Y,Z), cols = X-cat (A,B,C)
    // (A,X): idx 8 → 1 ; wait count carefully:
    // pairs (x,g): A/X(0), A/Y(1), B/X(2), B/Y(3), C/X(4), C/Y(5), B/X(6), A/Y(7), A/X(8), B/Z(9)
    // Row X: A=2 (0,8), B=2 (2,6), C=1 (4)
    // Row Y: A=2 (1,7), B=1 (3),  C=1 (5)
    // Row Z: A=0,       B=1 (9),  C=0
    assertEqual(JSON.stringify(d.cells[0]), JSON.stringify([2, 2, 1])); // X row
    assertEqual(JSON.stringify(d.cells[1]), JSON.stringify([2, 1, 1])); // Y row
    assertEqual(JSON.stringify(d.cells[2]), JSON.stringify([0, 1, 0])); // Z row
  });

  test('count-mode empty cells are 0 (not NaN)', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.gRef = { ...REF_G };
    const d = s.buildChartData(makeGetValues({ x: DATA_X, g: DATA_G }), 'mean');
    assertEqual(d.cells[2][0], 0); // (Z, A) never occurs
  });

  test('blank x or g cells are dropped from both axes and counts', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.gRef = { ...REF_G };
    const d = s.buildChartData(
      makeGetValues({ x: ['A', '', 'A', 'B', null], g: ['X', 'Y', 'X', 'Y', 'X'] }),
      'mean',
    );
    assertEqual(d.xCategories.join(','), 'A,B');
    assertEqual(d.yCategories.join(','), 'X,Y');
    // (A,X) appears at rows 0 and 2 → 2 ; (B,Y) at row 3 → 1
    assertEqual(d.cells[0][0], 2); // row X, col A
    assertEqual(d.cells[1][1], 1); // row Y, col B
    assertEqual(d.cells[0][1], 0); // row X, col B
  });

  test('returns empty when no valid pairs', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.gRef = { ...REF_G };
    const d = s.buildChartData(makeGetValues({ x: ['', '', ''], g: ['X', 'Y', 'Z'] }), 'mean');
    assertEqual(d.xCategories.length, 0);
    assertEqual(d.yCategories.length, 0);
    assertEqual(d.cells.length, 0);
  });

  test('returns empty when x or g ref missing', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    const d = s.buildChartData(makeGetValues({ x: DATA_X, g: DATA_G }), 'mean');
    assertEqual(d.xCategories.length, 0);
    assertEqual(d.cells.length, 0);
  });
});

// ─────────────────────────────────────────────────────────────
// Computation — value aggregation (with V): mean / sum
// ─────────────────────────────────────────────────────────────

suite('Heatmap Model — buildChartData: value aggregation (V)', () => {
  // 2x2 grid: cols A,B  rows X,Y
  // (A,X): 10, 30 ; (A,Y): 20 ; (B,X): 40 ; (B,Y): — (no rows)
  const X = ['A', 'A', 'A', 'B'];
  const G = ['X', 'X', 'Y', 'X'];
  const V = [10, 30, 20, 40];

  test('mean aggregation per cell', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.gRef = { ...REF_G };
    s.vRef = { ...REF_V };
    const d = s.buildChartData(makeGetValues({ x: X, g: G, v: V }), 'mean');
    assertEqual(d.xCategories.join(','), 'A,B');
    assertEqual(d.yCategories.join(','), 'X,Y');
    // row X: A=mean(10,30)=20, B=mean(40)=40
    // row Y: A=mean(20)=20,    B=empty=NaN
    assertEqual(d.cells[0][0], 20);
    assertEqual(d.cells[0][1], 40);
    assertEqual(d.cells[1][0], 20);
    assertEqual(Number.isNaN(d.cells[1][1]), true);
  });

  test('sum aggregation per cell', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.gRef = { ...REF_G };
    s.vRef = { ...REF_V };
    const d = s.buildChartData(makeGetValues({ x: X, g: G, v: V }), 'sum');
    assertEqual(d.cells[0][0], 40); // 10+30
    assertEqual(d.cells[0][1], 40); // 40
    assertEqual(d.cells[1][0], 20); // 20
    assertEqual(Number.isNaN(d.cells[1][1]), true); // no data
  });

  test('value-mode empty cells are NaN (not 0)', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.gRef = { ...REF_G };
    s.vRef = { ...REF_V };
    const d = s.buildChartData(makeGetValues({ x: X, g: G, v: V }), 'mean');
    assertEqual(Number.isNaN(d.cells[1][1]), true);
  });

  test('non-numeric V rows are skipped', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.gRef = { ...REF_G };
    s.vRef = { ...REF_V };
    const d = s.buildChartData(
      makeGetValues({ x: ['A', 'A', 'A'], g: ['X', 'X', 'X'], v: [10, 'oops', 30] }),
      'mean',
    );
    // (A,X) gets 10 and 30 only → mean 20
    assertEqual(d.cells[0][0], 20);
  });

  test('length clamped to shortest of x/g/v', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.gRef = { ...REF_G };
    s.vRef = { ...REF_V };
    const d = s.buildChartData(
      makeGetValues({ x: ['A', 'B', 'C'], g: ['X', 'Y', 'Z'], v: [5, 7] }),
      'sum',
    );
    // only first 2 rows count → cats A,B / X,Y
    assertEqual(d.xCategories.join(','), 'A,B');
    assertEqual(d.yCategories.join(','), 'X,Y');
    assertEqual(d.cells[0][0], 5); // (X,A)
    assertEqual(d.cells[1][1], 7); // (Y,B)
  });
});

