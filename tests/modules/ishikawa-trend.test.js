/**
 * D.Mike — Ishikawa Trend config builder (computeTrendConfig) — unit tests.
 *
 * The builder is pure: no DOM, no canvas, no Date.now(). Scoring is injected
 * via `opts.calcScore(row, experts)`. These tests pin the series/points/labels
 * geometry the framework `trend` chart type consumes.
 */

import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { computeTrendConfig } from '../../js/modules/ishikawa/ishikawa.js';

/** Mean of defined ratings across the given experts (mirrors model.calcScoreFor). */
function meanScore(row, experts) {
  if (!experts || !experts.length) return null;
  const v = experts.map((e) => row.ratings[e.id]).filter((x) => x !== undefined && x !== null && x !== '');
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

const EXPERTS = [{ id: 1 }, { id: 2 }];

/** Build a state with a given list of rows; experts default to EXPERTS. */
function state(name, date, rows, experts = EXPERTS) {
  return { name, date, data: { rows, experts } };
}

suite('Ishikawa Trend — computeTrendConfig', () => {
  test('returns isEmpty (minSnaps) for fewer than 2 states', () => {
    const cfg = computeTrendConfig([state('S1', '2020-01-01', [])], { calcScore: meanScore });
    assertTrue(cfg.isEmpty, 'isEmpty set');
    assertEqual(cfg.reason, 'minSnaps');
    assertEqual(cfg.series.length, 0);
  });

  test('returns isEmpty (noData) when no series carry any points', () => {
    // Rows exist but no ratings → score null → no points.
    const rows = [{ stableId: 'a', name: 'A', ratings: {} }];
    const cfg = computeTrendConfig(
      [state('S1', '2020-01-01', rows), state('S2', '2020-01-02', rows)],
      { calcScore: meanScore },
    );
    assertTrue(cfg.isEmpty, 'isEmpty set');
    assertEqual(cfg.reason, 'noData');
  });

  test('one series per stableId carrying points', () => {
    const s1 = state('S1', '2020-01-01', [
      { stableId: 'a', name: 'Hyp A', ratings: { 1: 4, 2: 6 } },
      { stableId: 'b', name: 'Hyp B', ratings: { 1: 2, 2: 2 } },
    ]);
    const s2 = state('S2', '2020-01-02', [
      { stableId: 'a', name: 'Hyp A', ratings: { 1: 8, 2: 8 } },
      { stableId: 'b', name: 'Hyp B', ratings: { 1: 5, 2: 7 } },
    ]);
    const cfg = computeTrendConfig([s1, s2], { calcScore: meanScore });
    assertTrue(!cfg.isEmpty, 'not empty');
    assertEqual(cfg.series.length, 2);
    assertEqual(cfg.xCount, 2);
  });

  test('points carry x=stateIndex and y=score', () => {
    const s1 = state('S1', '2020-01-01', [{ stableId: 'a', name: 'A', ratings: { 1: 4, 2: 6 } }]);
    const s2 = state('S2', '2020-01-02', [{ stableId: 'a', name: 'A', ratings: { 1: 8, 2: 8 } }]);
    const cfg = computeTrendConfig([s1, s2], { calcScore: meanScore });
    const ser = cfg.series[0];
    assertEqual(ser.points.length, 2);
    assertEqual(ser.points[0].x, 0);
    assertEqual(ser.points[0].y, 5); // (4+6)/2
    assertEqual(ser.points[1].x, 1);
    assertEqual(ser.points[1].y, 8); // (8+8)/2
  });

  test('null scores are skipped (gap in a series)', () => {
    const s1 = state('S1', '2020-01-01', [{ stableId: 'a', name: 'A', ratings: {} }]); // null
    const s2 = state('S2', '2020-01-02', [{ stableId: 'a', name: 'A', ratings: { 1: 6, 2: 6 } }]);
    const s3 = state('S3', '2020-01-03', [{ stableId: 'a', name: 'A', ratings: { 1: 9, 2: 9 } }]);
    const cfg = computeTrendConfig([s1, s2, s3], { calcScore: meanScore });
    const ser = cfg.series[0];
    assertEqual(ser.points.length, 2, 'state with null score skipped');
    assertEqual(ser.points[0].x, 1);
    assertEqual(ser.points[1].x, 2);
  });

  test('series name = latest non-empty row name', () => {
    const s1 = state('S1', '2020-01-01', [{ stableId: 'a', name: 'Old name', ratings: { 1: 5 } }]);
    const s2 = state('S2', '2020-01-02', [{ stableId: 'a', name: 'New name', ratings: { 1: 5 } }]);
    const cfg = computeTrendConfig([s1, s2], { calcScore: meanScore });
    assertEqual(cfg.series[0].name, 'New name');
  });

  test('series name falls back to latest non-empty even if newest is blank', () => {
    const s1 = state('S1', '2020-01-01', [{ stableId: 'a', name: 'Real name', ratings: { 1: 5 } }]);
    const s2 = state('S2', '2020-01-02', [{ stableId: 'a', name: '   ', ratings: { 1: 5 } }]);
    const cfg = computeTrendConfig([s1, s2], { calcScore: meanScore });
    assertEqual(cfg.series[0].name, 'Real name');
  });

  test('series colour from LINE_COLS palette in order', () => {
    const rows1 = [
      { stableId: 'a', name: 'A', ratings: { 1: 5 } },
      { stableId: 'b', name: 'B', ratings: { 1: 5 } },
    ];
    const cfg = computeTrendConfig(
      [state('S1', '2020-01-01', rows1), state('S2', '2020-01-02', rows1)],
      { calcScore: meanScore },
    );
    assertEqual(cfg.series[0].color, '#2563eb');
    assertEqual(cfg.series[1].color, '#dc2626');
  });

  test('xLabels carry locale date + truncated state name', () => {
    const s1 = state('S1 with a very long name indeed', '2020-03-09', [{ stableId: 'a', name: 'A', ratings: { 1: 5 } }]);
    const s2 = state('Short', '2020-04-15', [{ stableId: 'a', name: 'A', ratings: { 1: 5 } }]);
    const cfg = computeTrendConfig([s1, s2], { calcScore: meanScore, lang: 'de' });
    assertEqual(cfg.xLabels.length, 2);
    assertEqual(cfg.xLabels[0].date, '09.03.');
    assertTrue(cfg.xLabels[0].name.length <= 13, 'long name truncated with ellipsis');
    assertTrue(cfg.xLabels[0].name.endsWith('…'), 'ellipsis appended');
    assertEqual(cfg.xLabels[1].name, 'Short');
  });

  test('yDomain is the fixed [0,9] range', () => {
    const rows = [{ stableId: 'a', name: 'A', ratings: { 1: 5 } }];
    const cfg = computeTrendConfig(
      [state('S1', '2020-01-01', rows), state('S2', '2020-01-02', rows)],
      { calcScore: meanScore },
    );
    assertEqual(cfg.yDomain[0], 0);
    assertEqual(cfg.yDomain[1], 9);
  });
});
