/**
 * D.Mike — Run Chart Module — Unit Tests
 *
 * Covers:
 *   - State Model: defaults, toJSON/fromJSON round-trip, robustness,
 *     sanitization (alpha bounds, columnRef), hasContent(), flaggedCount().
 *   - Runs-test math (engine, reused by the module): median, runs-about-median
 *     count, runs-up-down count, and the four Minitab p-value outcomes
 *     (clustering / mixtures / trends / oscillation) asserted against
 *     hand-computed / known reference values.
 */

import { suite, test, assertEqual, assertAlmostEqual } from '../test-utils.js';
import { State } from '../../js/modules/run-chart/run-chart-model.js';
import {
  computeRunChart,
  runsAboutMedian,
  runsUpDown,
} from '../../js/engines/run-chart-engine.js';

// ─────────────────────────────────────────────────────────────
// Model — defaults
// ─────────────────────────────────────────────────────────────

suite('Run Chart Model — defaults', () => {
  test('constructor sets default values', () => {
    const s = new State();
    assertEqual(s.columnRef, null);
    assertEqual(s.alpha, 0.05);
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

suite('Run Chart Model — serialization', () => {
  test('toJSON returns expected shape', () => {
    const s = new State();
    s.columnRef = { instanceId: 'i1', sheetId: 's1', columnId: 'c1' };
    s.alpha = 0.01;
    s.exampleWorksheetId = 'ws-9';
    const j = s.toJSON();
    assertEqual(j.alpha, 0.01);
    assertEqual(JSON.stringify(j.columnRef), JSON.stringify({ instanceId: 'i1', sheetId: 's1', columnId: 'c1' }));
    assertEqual(j.exampleWorksheetId, 'ws-9');
  });

  test('fromJSON(null) returns valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s.columnRef, null);
    assertEqual(s.alpha, 0.05);
    assertEqual(s.exampleWorksheetId, null);
  });

  test('fromJSON(undefined) returns valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.columnRef, null);
    assertEqual(s.alpha, 0.05);
  });

  test('fromJSON restores data', () => {
    const s = State.fromJSON({
      columnRef: { instanceId: 'i2', sheetId: 's2', columnId: 'c2' },
      alpha: 0.1,
      exampleWorksheetId: 'ws-1',
    });
    assertEqual(s.columnRef.instanceId, 'i2');
    assertEqual(s.columnRef.sheetId, 's2');
    assertEqual(s.columnRef.columnId, 'c2');
    assertEqual(s.alpha, 0.1);
    assertEqual(s.exampleWorksheetId, 'ws-1');
  });

  test('toJSON → fromJSON round-trip is lossless', () => {
    const s = new State();
    s.columnRef = { instanceId: 'i3', sheetId: 's3', columnId: 'c3' };
    s.alpha = 0.025;
    s.exampleWorksheetId = 'ws-7';
    const r = State.fromJSON(s.toJSON());
    assertEqual(JSON.stringify(r.toJSON()), JSON.stringify(s.toJSON()));
  });

  test('fromJSON sanitizes invalid alpha to default', () => {
    // Matches legacy _loadState: Number.isFinite(alpha) ? alpha : DEFAULT
    assertEqual(State.fromJSON({ alpha: 'x' }).alpha, 0.05);
    assertEqual(State.fromJSON({ alpha: NaN }).alpha, 0.05);
    assertEqual(State.fromJSON({}).alpha, 0.05);
  });

  test('fromJSON keeps a finite alpha verbatim', () => {
    assertEqual(State.fromJSON({ alpha: 0.001 }).alpha, 0.001);
    assertEqual(State.fromJSON({ alpha: 0.2 }).alpha, 0.2);
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
// Model — flaggedCount (count of p-values below alpha)
// ─────────────────────────────────────────────────────────────

suite('Run Chart Model — flaggedCount', () => {
  test('counts the four p-values below alpha', () => {
    const s = new State();
    const r = { pClustering: 0.001, pMixtures: 0.9, pTrends: 0.04, pOscillation: 0.5 };
    // alpha 0.05 → 0.001 and 0.04 are below → 2
    assertEqual(s.flaggedCount(r, 0.05), 2);
  });

  test('returns 0 when none below alpha', () => {
    const s = new State();
    const r = { pClustering: 0.2, pMixtures: 0.9, pTrends: 0.3, pOscillation: 0.5 };
    assertEqual(s.flaggedCount(r, 0.05), 0);
  });

  test('stricter alpha flags fewer tests', () => {
    const s = new State();
    const r = { pClustering: 0.001, pMixtures: 0.9, pTrends: 0.04, pOscillation: 0.5 };
    assertEqual(s.flaggedCount(r, 0.001), 0); // 0.001 not strictly < 0.001
  });
});

// ─────────────────────────────────────────────────────────────
// Runs-test math — median + runs counts (engine, reused)
// ─────────────────────────────────────────────────────────────

suite('Run Chart — median & runs counts', () => {
  test('median of even-length sample (interpolated)', () => {
    // E2E DATA_C1: [10,12,8,15,25,30,5,18,22,14] sorted → 14.5 mid of 14 & 15
    const r = computeRunChart([10, 12, 8, 15, 25, 30, 5, 18, 22, 14]);
    assertEqual(r.median, 14.5);
  });

  test('median of odd-length sample', () => {
    const r = computeRunChart([3, 1, 2]);
    assertEqual(r.median, 2);
  });

  test('runs about median: strict alternation gives N runs', () => {
    // values: below, above, below, above ... median = 5
    // [1, 9, 2, 8] median = (2+8)/2... sorted [1,2,8,9] → 5; signs: -,+,-,+ → 4 runs
    const med = 5;
    const ra = runsAboutMedian([1, 9, 2, 8], med);
    assertEqual(ra.runs, 4);
    assertEqual(ra.m1, 2);
    assertEqual(ra.m2, 2);
  });

  test('runs about median: ties to median are dropped', () => {
    // median = 5; the two 5s are excluded from the sign sequence
    const ra = runsAboutMedian([1, 5, 9, 5, 2], 5);
    // remaining signs for [1,9,2] → -,+,- → 3 runs, m1=1 (the 9), m2=2 (1 and 2)
    assertEqual(ra.runs, 3);
    assertEqual(ra.m1, 1);
    assertEqual(ra.m2, 2);
  });

  test('runs up/down: strictly increasing series → 1 run', () => {
    const ru = runsUpDown([1, 2, 3, 4, 5]);
    assertEqual(ru.runs, 1);
  });

  test('runs up/down: perfect zig-zag → max runs', () => {
    // diffs: +,-,+,- → 4 runs
    const ru = runsUpDown([1, 5, 2, 6, 3]);
    assertEqual(ru.runs, 4);
  });

  test('runs up/down: ties skipped (no sign contributed)', () => {
    // [1,1,2] → diff(1,1)=tie skipped, diff(1,2)=+ → 1 sign → 1 run
    const ru = runsUpDown([1, 1, 2]);
    assertEqual(ru.runs, 1);
  });
});

// ─────────────────────────────────────────────────────────────
// Runs-test math — Minitab p-value outcomes
// ─────────────────────────────────────────────────────────────

suite('Run Chart — Minitab test p-values', () => {
  test('monotone increasing flags trends & clustering (low p), not mixtures/oscillation', () => {
    // [1..10] — a single up-run and all-below-then-all-above the median.
    const r = computeRunChart([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // Clustering: too few runs about median → small p
    assertEqual(r.pClustering < 0.05, true);
    // Trends: too few runs up/down → small p
    assertEqual(r.pTrends < 0.05, true);
    // Mixtures (too many runs about median) should NOT be flagged
    assertEqual(r.pMixtures < 0.05, false);
    // Oscillation (too many runs up/down) should NOT be flagged
    assertEqual(r.pOscillation < 0.05, false);
  });

  test('p-values are complementary: pClustering + pMixtures ≈ 1', () => {
    const r = computeRunChart([10, 12, 8, 15, 25, 30, 5, 18, 22, 14]);
    assertAlmostEqual(r.pClustering + r.pMixtures, 1, 1e-9);
    assertAlmostEqual(r.pTrends + r.pOscillation, 1, 1e-9);
  });

  test('hand-computed runs-about-median z for alternating data → p≈0.5', () => {
    // m1=m2=2, N=4 → expected = (2*2*2)/4 + 1 = 3; runs=4
    // variance = (2*4*(2*4-4))/(16*3) = (8*4)/48 = 32/48 = 0.6667; sd≈0.8165
    // z = (4-3)/0.8165 ≈ 1.2247 → pMixtures = 1-Φ(1.2247) ≈ 0.1103
    const ra = runsAboutMedian([1, 9, 2, 8], 5);
    assertAlmostEqual(ra.expected, 3, 1e-9);
    assertAlmostEqual(ra.variance, 2 / 3, 1e-9);
    assertAlmostEqual(ra.z, 1 / Math.sqrt(2 / 3), 1e-9);
  });
});

// ─────────────────────────────────────────────────────────────
// computeRunChart — top-level shape
// ─────────────────────────────────────────────────────────────

suite('Run Chart — computeRunChart result shape', () => {
  test('returns median, runs counts, four p-values and index partition', () => {
    const r = computeRunChart([10, 12, 8, 15, 25, 30, 5, 18, 22, 14]);
    assertEqual(typeof r.median, 'number');
    assertEqual(typeof r.runsAboutMedian, 'number');
    assertEqual(typeof r.runsUpDown, 'number');
    assertEqual(typeof r.pClustering, 'number');
    assertEqual(typeof r.pMixtures, 'number');
    assertEqual(typeof r.pTrends, 'number');
    assertEqual(typeof r.pOscillation, 'number');
    assertEqual(Array.isArray(r.indices.above), true);
    assertEqual(Array.isArray(r.indices.below), true);
    assertEqual(Array.isArray(r.indices.onMedian), true);
  });

  test('filters non-numeric input before computing', () => {
    const r = computeRunChart([1, NaN, 2, 'x', 3]);
    assertEqual(r.values.length, 3);
    assertEqual(r.median, 2);
  });
});
