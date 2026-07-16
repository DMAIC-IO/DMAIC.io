/**
 * D.Mike — Rare-Event Control Chart Module — Unit Tests
 *
 * Covers:
 *   - State Model: defaults, toJSON/fromJSON round-trip, robustness,
 *     sanitization, hasContent(), countSignals().
 *   - SPC math (engine, reused by the module): g-chart (Benneyan) and
 *     t-chart (Nelson power transform) control limits, plus violation
 *     detection, asserted against hand-computed reference values.
 */

import { suite, test, assertEqual, assertAlmostEqual } from '../test-utils.js';
import { State } from '../../js/modules/rare-event-chart/rare-event-chart-model.js';
import { computeGChart, computeTChart } from '../../js/engines/rare-event-chart-engine.js';

// ─────────────────────────────────────────────────────────────
// Model — defaults
// ─────────────────────────────────────────────────────────────

suite('Rare-Event Chart Model — defaults', () => {
  test('constructor sets default values', () => {
    const s = new State();
    assertEqual(s.chartTypeId, 'g');
    assertEqual(s.columnRef, null);
    assertEqual(s.exampleWorksheetId, null);
  });

  test('hasContent is false by default', () => {
    assertEqual(new State().hasContent(), false);
  });

  test('hasContent is true once a column is selected', () => {
    const s = new State();
    s.columnRef = { instanceId: 'i1', sheetId: 's1', columnId: 'c1' };
    assertEqual(s.hasContent(), true);
  });
});

// ─────────────────────────────────────────────────────────────
// Model — toJSON / fromJSON
// ─────────────────────────────────────────────────────────────

suite('Rare-Event Chart Model — serialization', () => {
  test('toJSON returns expected shape', () => {
    const s = new State();
    s.chartTypeId = 't';
    s.columnRef = { instanceId: 'i1', sheetId: 's1', columnId: 'c1' };
    s.exampleWorksheetId = 'ws-9';
    const j = s.toJSON();
    assertEqual(j.chartTypeId, 't');
    assertEqual(JSON.stringify(j.columnRef), JSON.stringify({ instanceId: 'i1', sheetId: 's1', columnId: 'c1' }));
    assertEqual(j.exampleWorksheetId, 'ws-9');
  });

  test('fromJSON(null) returns valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s.chartTypeId, 'g');
    assertEqual(s.columnRef, null);
    assertEqual(s.exampleWorksheetId, null);
  });

  test('fromJSON(undefined) returns valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.chartTypeId, 'g');
    assertEqual(s.columnRef, null);
  });

  test('fromJSON restores data', () => {
    const s = State.fromJSON({
      chartTypeId: 't',
      columnRef: { instanceId: 'i2', sheetId: 's2', columnId: 'c2' },
      exampleWorksheetId: 'ws-1',
    });
    assertEqual(s.chartTypeId, 't');
    assertEqual(s.columnRef.instanceId, 'i2');
    assertEqual(s.columnRef.sheetId, 's2');
    assertEqual(s.columnRef.columnId, 'c2');
    assertEqual(s.exampleWorksheetId, 'ws-1');
  });

  test('toJSON → fromJSON round-trip is lossless', () => {
    const s = new State();
    s.chartTypeId = 't';
    s.columnRef = { instanceId: 'i3', sheetId: 's3', columnId: 'c3' };
    s.exampleWorksheetId = 'ws-7';
    const r = State.fromJSON(s.toJSON());
    assertEqual(JSON.stringify(r.toJSON()), JSON.stringify(s.toJSON()));
  });

  test('fromJSON sanitizes invalid chartTypeId to default', () => {
    assertEqual(State.fromJSON({ chartTypeId: 'x' }).chartTypeId, 'g');
    assertEqual(State.fromJSON({ chartTypeId: 42 }).chartTypeId, 'g');
  });

  test('fromJSON ignores malformed columnRef', () => {
    assertEqual(State.fromJSON({ columnRef: {} }).columnRef, null);
    assertEqual(State.fromJSON({ columnRef: 'nope' }).columnRef, null);
    assertEqual(State.fromJSON({ columnRef: { instanceId: 'i' } }).columnRef, null);
  });

  test('fromJSON ignores non-string exampleWorksheetId', () => {
    assertEqual(State.fromJSON({ exampleWorksheetId: 5 }).exampleWorksheetId, null);
  });
});

// ─────────────────────────────────────────────────────────────
// Model — countSignals (violation detection)
// ─────────────────────────────────────────────────────────────

suite('Rare-Event Chart Model — countSignals', () => {
  test('counts points above UCL and below LCL, skipping nulls', () => {
    const s = new State();
    // UCL = 10, LCL = 2
    const vals = [5, 11, 1, 8, null, 10, 2];
    // 11 > 10 (signal), 1 < 2 (signal), null skipped, 10 and 2 are on the limit (not strictly outside)
    assertEqual(s.countSignals(vals, 10, 2), 2);
  });

  test('returns 0 when all in-control', () => {
    const s = new State();
    assertEqual(s.countSignals([3, 4, 5, 6], 10, 0), 0);
  });
});

// ─────────────────────────────────────────────────────────────
// SPC math — g-chart (Benneyan)
// ─────────────────────────────────────────────────────────────

suite('Rare-Event Chart — g-chart limits', () => {
  test('CL/UCL/LCL match Benneyan formula', () => {
    // counts: mean = 86/10 = 8.6
    const counts = [5, 12, 3, 8, 15, 7, 10, 9, 6, 11];
    const r = computeGChart(counts);
    const gBar = 8.6;
    const sigma = Math.sqrt(gBar * (gBar + 1)); // √(8.6·9.6) = √82.56 ≈ 9.0862
    assertAlmostEqual(r.cl, gBar, 1e-9, 'cl');
    assertAlmostEqual(r.sigma, sigma, 1e-9, 'sigma');
    assertAlmostEqual(r.ucl, gBar + 3 * sigma, 1e-9, 'ucl'); // ≈ 35.859
    assertAlmostEqual(r.lcl, 0, 1e-9, 'lcl'); // max(0, 8.6 - 27.26) = 0
  });

  test('empty input is degenerate (all zeros)', () => {
    const r = computeGChart([]);
    assertEqual(r.cl, 0);
    assertEqual(r.ucl, 0);
    assertEqual(r.lcl, 0);
  });
});

// ─────────────────────────────────────────────────────────────
// SPC math — t-chart (Nelson power transform)
// ─────────────────────────────────────────────────────────────

suite('Rare-Event Chart — t-chart limits', () => {
  test('transform y = t^(1/3.6) and I-MR limits', () => {
    const times = [10, 20, 5, 30, 15, 25];
    const r = computeTChart(times);
    const p = 1 / 3.6;
    const y = times.map(t => Math.pow(t, p));
    const yBar = y.reduce((a, b) => a + b, 0) / y.length;
    // moving range mean
    let mrSum = 0;
    for (let i = 1; i < y.length; i++) mrSum += Math.abs(y[i] - y[i - 1]);
    const mrBar = mrSum / (y.length - 1);
    const sigma = mrBar / 1.128;
    assertAlmostEqual(r.cl, yBar, 1e-9, 'cl (transformed)');
    assertAlmostEqual(r.sigma, sigma, 1e-9, 'sigma');
    assertAlmostEqual(r.ucl, yBar + 3 * sigma, 1e-9, 'ucl (transformed)');
    assertAlmostEqual(r.lcl, Math.max(0, yBar - 3 * sigma), 1e-9, 'lcl (transformed)');
    // back-transformed original-scale CL
    assertAlmostEqual(r.clOriginal, Math.pow(yBar, 3.6), 1e-6, 'clOriginal');
    // transformed array matches
    assertAlmostEqual(r.transformed[0], y[0], 1e-9, 'transformed[0]');
  });

  test('fewer than 2 positive values is degenerate', () => {
    const r = computeTChart([5]);
    assertEqual(r.cl, 0);
    assertEqual(r.ucl, 0);
  });
});
