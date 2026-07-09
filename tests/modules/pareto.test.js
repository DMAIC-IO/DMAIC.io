/**
 * D.Mike — Pareto Chart Module — Unit Tests
 *
 * Covers:
 *   - State Model: defaults, toJSON/fromJSON round-trip, robustness,
 *     sanitization (refs, chartConfig), hasContent().
 *   - Pareto computation (the testable core, moved out of the legacy
 *     `_buildChartData` / `_renderStats`):
 *       · category aggregation in all four modes (X / X+Y / X+G / X+Y+G)
 *       · count vs sum vs mean
 *       · first-seen level ordering, empty-category dropping
 *       · descending sort + cumulative-percentage rows (computeStatsRows)
 *     asserted against hand-computed reference values matching the E2E spec.
 */

import { suite, test, assertEqual, assertAlmostEqual } from '../test-utils.js';
import { State, PALETTE } from '../../js/modules/pareto/pareto-model.js';

const REF_X = { instanceId: 'i1', sheetId: 's1', columnId: 'cx' };
const REF_Y = { instanceId: 'i1', sheetId: 's1', columnId: 'cy' };
const REF_G = { instanceId: 'i1', sheetId: 's1', columnId: 'cg' };

// Mirrors the E2E spec fixtures.
const DATA_X = ['DefectA', 'DefectB', 'DefectC', 'DefectA', 'DefectB'];
const DATA_Y = [10, 20, 30, 40, 50];
const DATA_G = ['G1', 'G2', 'G1', 'G2', 'G1'];

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

// ─────────────────────────────────────────────────────────────
// Model — defaults
// ─────────────────────────────────────────────────────────────

suite('Pareto Model — defaults', () => {
  test('constructor sets default values', () => {
    const s = new State();
    assertEqual(s.xRef, null);
    assertEqual(s.yRef, null);
    assertEqual(s.gRef, null);
    assertEqual(s.exampleWorksheetId, null);
    assertEqual(s.chartConfig.aggregation, 'sum');
    assertEqual(s.chartConfig.maxItems, 20);
    assertEqual(s.chartConfig.otherBucket, true);
    assertEqual(s.chartConfig.refLineValue, 80);
    assertEqual(s.chartConfig.showTitle, true);
    assertEqual(s.chartConfig.title, '');
    assertEqual(s.chartConfig.barOpacity, 0.75);
    assertEqual(s.chartConfig.bgColor, null);
  });

  test('hasContent is false by default', () => {
    assertEqual(new State().hasContent(), false);
  });

  test('hasContent is true once X is selected', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    assertEqual(s.hasContent(), true);
  });

  test('hasContent stays false with only Y or only G', () => {
    const s1 = new State();
    s1.yRef = { ...REF_Y };
    assertEqual(s1.hasContent(), false);
    const s2 = new State();
    s2.gRef = { ...REF_G };
    assertEqual(s2.hasContent(), false);
  });
});

// ─────────────────────────────────────────────────────────────
// Model — serialization
// ─────────────────────────────────────────────────────────────

suite('Pareto Model — serialization', () => {
  test('toJSON returns expected shape', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.yRef = { ...REF_Y };
    s.gRef = { ...REF_G };
    s.chartConfig.aggregation = 'mean';
    s.exampleWorksheetId = 'ws-9';
    const j = s.toJSON();
    assertEqual(JSON.stringify(j.xRef), JSON.stringify(REF_X));
    assertEqual(JSON.stringify(j.yRef), JSON.stringify(REF_Y));
    assertEqual(JSON.stringify(j.gRef), JSON.stringify(REF_G));
    assertEqual(j.chartConfig.aggregation, 'mean');
    assertEqual(j.exampleWorksheetId, 'ws-9');
  });

  test('fromJSON(null) returns valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s.xRef, null);
    assertEqual(s.chartConfig.aggregation, 'sum');
    assertEqual(s.exampleWorksheetId, null);
  });

  test('fromJSON(undefined) returns valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.xRef, null);
    assertEqual(s.chartConfig.maxItems, 20);
  });

  test('fromJSON restores data (legacy shape)', () => {
    const s = State.fromJSON({
      xRef: { ...REF_X },
      yRef: { ...REF_Y },
      gRef: null,
      chartConfig: { aggregation: 'mean', title: 'T', refLineValue: 90 },
    });
    assertEqual(s.xRef.columnId, 'cx');
    assertEqual(s.yRef.columnId, 'cy');
    assertEqual(s.gRef, null);
    assertEqual(s.chartConfig.aggregation, 'mean');
    assertEqual(s.chartConfig.title, 'T');
    assertEqual(s.chartConfig.refLineValue, 90);
    // unspecified chartConfig fields fall back to defaults
    assertEqual(s.chartConfig.maxItems, 20);
    assertEqual(s.chartConfig.otherBucket, true);
  });

  test('toJSON → fromJSON round-trip is lossless', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.yRef = { ...REF_Y };
    s.gRef = { ...REF_G };
    s.chartConfig.aggregation = 'mean';
    s.chartConfig.title = 'Hello';
    s.exampleWorksheetId = 'ws-7';
    const r = State.fromJSON(s.toJSON());
    assertEqual(JSON.stringify(r.toJSON()), JSON.stringify(s.toJSON()));
  });

  test('fromJSON ignores malformed refs', () => {
    assertEqual(State.fromJSON({ xRef: 'nope' }).xRef, null);
    assertEqual(State.fromJSON({ xRef: 5 }).xRef, null);
    assertEqual(JSON.stringify(State.fromJSON({ xRef: {} }).xRef), JSON.stringify({}));
  });

  test('fromJSON sanitizes invalid aggregation to sum', () => {
    assertEqual(State.fromJSON({ chartConfig: { aggregation: 'median' } }).chartConfig.aggregation, 'sum');
    assertEqual(State.fromJSON({ chartConfig: { aggregation: 42 } }).chartConfig.aggregation, 'sum');
  });

  test('fromJSON keeps a valid mean aggregation', () => {
    assertEqual(State.fromJSON({ chartConfig: { aggregation: 'mean' } }).chartConfig.aggregation, 'mean');
  });

  test('fromJSON ignores non-string exampleWorksheetId', () => {
    assertEqual(State.fromJSON({ exampleWorksheetId: 5 }).exampleWorksheetId, null);
  });
});

// ─────────────────────────────────────────────────────────────
// Computation — X only (frequency)
// ─────────────────────────────────────────────────────────────

suite('Pareto Model — buildChartData: X-only (frequency)', () => {
  test('counts per category (items mode)', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    const data = s.buildChartData(makeGetValues({ x: DATA_X }), 'sum');
    assertEqual(data.categories.length, 0);
    assertEqual(data.groups.length, 0);
    // first-seen order: DefectA, DefectB, DefectC
    assertEqual(data.items.map(i => i.name).join(','), 'DefectA,DefectB,DefectC');
    assertEqual(data.items.find(i => i.name === 'DefectA').value, 2);
    assertEqual(data.items.find(i => i.name === 'DefectB').value, 2);
    assertEqual(data.items.find(i => i.name === 'DefectC').value, 1);
  });

  test('returns empty when X has no values', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    const data = s.buildChartData(makeGetValues({ x: [] }), 'sum');
    assertEqual(data.items.length, 0);
    assertEqual(data.categories.length, 0);
    assertEqual(data.groups.length, 0);
  });

  test('returns empty when no xRef', () => {
    const s = new State();
    const data = s.buildChartData(makeGetValues({ x: DATA_X }), 'sum');
    assertEqual(data.items.length, 0);
  });

  test('drops empty/blank category cells', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    const data = s.buildChartData(makeGetValues({ x: ['A', '', 'A', null, 'B'] }), 'sum');
    assertEqual(data.items.find(i => i.name === 'A').value, 2);
    assertEqual(data.items.find(i => i.name === 'B').value, 1);
    assertEqual(data.items.length, 2);
  });
});

// ─────────────────────────────────────────────────────────────
// Computation — X + Y (sum / mean)
// ─────────────────────────────────────────────────────────────

suite('Pareto Model — buildChartData: X + Y', () => {
  test('sum aggregation', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.yRef = { ...REF_Y };
    const data = s.buildChartData(makeGetValues({ x: DATA_X, y: DATA_Y }), 'sum');
    assertEqual(data.items.find(i => i.name === 'DefectA').value, 50); // 10+40
    assertEqual(data.items.find(i => i.name === 'DefectB').value, 70); // 20+50
    assertEqual(data.items.find(i => i.name === 'DefectC').value, 30); // 30
  });

  test('mean aggregation', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.yRef = { ...REF_Y };
    const data = s.buildChartData(makeGetValues({ x: DATA_X, y: DATA_Y }), 'mean');
    assertEqual(data.items.find(i => i.name === 'DefectA').value, 25); // (10+40)/2
    assertEqual(data.items.find(i => i.name === 'DefectB').value, 35); // (20+50)/2
    assertEqual(data.items.find(i => i.name === 'DefectC').value, 30); // 30/1
  });

  test('non-numeric Y rows are skipped', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.yRef = { ...REF_Y };
    const data = s.buildChartData(makeGetValues({ x: ['A', 'A', 'B'], y: [10, 'x', 5] }), 'sum');
    assertEqual(data.items.find(i => i.name === 'A').value, 10);
    assertEqual(data.items.find(i => i.name === 'B').value, 5);
  });
});

// ─────────────────────────────────────────────────────────────
// Computation — X + G (stacked) and X + Y + G
// ─────────────────────────────────────────────────────────────

suite('Pareto Model — buildChartData: stacked (G)', () => {
  test('X + G produces categories + groups with per-group counts', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.gRef = { ...REF_G };
    const data = s.buildChartData(makeGetValues({ x: DATA_X, g: DATA_G }), 'sum');
    assertEqual(data.items.length, 0);
    assertEqual(data.categories.join(','), 'DefectA,DefectB,DefectC');
    // groups in first-seen order: G1, G2
    assertEqual(data.groups.map(g => g.name).join(','), 'G1,G2');

    // per-category total across groups matches the X-only counts
    const total = (ci) => data.groups.reduce((s2, g) => s2 + (g.values[ci] || 0), 0);
    assertEqual(total(0), 2); // DefectA
    assertEqual(total(1), 2); // DefectB
    assertEqual(total(2), 1); // DefectC
  });

  test('X + Y + G sums Y per (X,G)', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.yRef = { ...REF_Y };
    s.gRef = { ...REF_G };
    const data = s.buildChartData(makeGetValues({ x: DATA_X, y: DATA_Y, g: DATA_G }), 'sum');
    const total = (ci) => data.groups.reduce((s2, g) => s2 + (g.values[ci] || 0), 0);
    assertEqual(total(0), 50); // DefectA: 10+40
    assertEqual(total(1), 70); // DefectB: 20+50
    assertEqual(total(2), 30); // DefectC: 30
  });
});

// ─────────────────────────────────────────────────────────────
// computeStatsRows — descending sort + cumulative %
// ─────────────────────────────────────────────────────────────

suite('Pareto Model — computeStatsRows', () => {
  test('sorts descending and computes cumulative %', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.yRef = { ...REF_Y };
    const data = s.buildChartData(makeGetValues({ x: DATA_X, y: DATA_Y }), 'sum');
    const { rows, grandTotal } = State.computeStatsRows(data);
    assertEqual(grandTotal, 150);
    // descending by value: B(70), A(50), C(30)
    assertEqual(rows.map(r => r.name).join(','), 'DefectB,DefectA,DefectC');
    assertAlmostEqual(rows[0].cumPct, 70 / 150 * 100, 1e-9);
    assertAlmostEqual(rows[1].cumPct, 120 / 150 * 100, 1e-9);
    assertAlmostEqual(rows[2].cumPct, 100, 1e-9);
  });

  test('frequency-mode rows from items', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    const data = s.buildChartData(makeGetValues({ x: DATA_X }), 'sum');
    const { rows, grandTotal } = State.computeStatsRows(data);
    assertEqual(grandTotal, 5);
    // A(2), B(2), C(1) — A and B tie; stable order keeps A before B
    assertEqual(rows[rows.length - 1].name, 'DefectC');
    assertAlmostEqual(rows[rows.length - 1].cumPct, 100, 1e-9);
  });

  test('stacked-mode rows aggregate group totals per category', () => {
    const s = new State();
    s.xRef = { ...REF_X };
    s.yRef = { ...REF_Y };
    s.gRef = { ...REF_G };
    const data = s.buildChartData(makeGetValues({ x: DATA_X, y: DATA_Y, g: DATA_G }), 'sum');
    const { rows, grandTotal } = State.computeStatsRows(data);
    assertEqual(grandTotal, 150);
    assertEqual(rows.find(r => r.name === 'DefectA').value, 50);
    assertEqual(rows.find(r => r.name === 'DefectB').value, 70);
    assertEqual(rows.find(r => r.name === 'DefectC').value, 30);
  });

  test('grandTotal of empty data is 0', () => {
    const { rows, grandTotal } = State.computeStatsRows({ items: [], categories: [], groups: [] });
    assertEqual(grandTotal, 0);
    assertEqual(rows.length, 0);
  });

  test('negative values are clamped to 0 in grandTotal and cumulative', () => {
    // items: A=10, B=-5, C=5 — sorted descending: A(10), C(5), B(-5)
    // grandTotal = max(0,10) + max(0,5) + max(0,-5) = 15
    // cumulative: A → 10/15*100; C → 15/15*100 = 100; B → clamp(0) adds nothing → 100
    const { rows, grandTotal } = State.computeStatsRows({
      items: [
        { name: 'A', value: 10, color: PALETTE[0] },
        { name: 'B', value: -5, color: PALETTE[1] },
        { name: 'C', value:  5, color: PALETTE[2] },
      ],
      categories: [],
      groups: [],
    });
    assertEqual(grandTotal, 15);
    // descending sort: A(10), C(5), B(-5)
    assertEqual(rows.map(r => r.name).join(','), 'A,C,B');
    assertAlmostEqual(rows[0].cumPct, 10 / 15 * 100, 1e-9); // ≈ 66.667
    assertAlmostEqual(rows[1].cumPct, 100, 1e-9);            // 15/15
    assertAlmostEqual(rows[2].cumPct, 100, 1e-9);            // clamp: adds 0
  });
});

// ─────────────────────────────────────────────────────────────
// PALETTE
// ─────────────────────────────────────────────────────────────

suite('Pareto Model — PALETTE', () => {
  test('palette has 12 colors and cycles by index', () => {
    assertEqual(PALETTE.length, 12);
    const s = new State();
    s.xRef = { ...REF_X };
    // 13 distinct categories → 13th reuses PALETTE[0]
    const x = Array.from({ length: 13 }, (_, i) => 'C' + i);
    const data = s.buildChartData(makeGetValues({ x }), 'sum');
    assertEqual(data.items[0].color, PALETTE[0]);
    assertEqual(data.items[12].color, PALETTE[0]);
  });
});
