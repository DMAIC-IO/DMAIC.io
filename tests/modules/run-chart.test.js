/**
 * D.Mike — Run Chart Module — Unit Tests
 *
 * Covers:
 *   - State Model: defaults, toJSON/fromJSON round-trip, robustness,
 *     sanitization (alpha bounds, columnRef), hasContent(), flaggedCount().
 *   - The runs-test math lives in tests/engines/run-chart.test.js.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import { State } from '../../js/modules/run-chart/run-chart-model.js';

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
