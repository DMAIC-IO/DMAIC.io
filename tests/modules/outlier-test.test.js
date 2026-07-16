/**
 * D.Mike — Outlier Test Model Unit Tests
 * TDD spec for outlier-test-model.js
 */

import { suite, test, assertEqual, assertAlmostEqual } from '../test-utils.js';
import { State, ALL_METHODS } from '../../js/modules/outlier-test/outlier-test-model.js';

// ─── ALL_METHODS export ─────────────────────────────────────────────────────

suite('Outlier Test — ALL_METHODS', () => {
  test('exports 7 method ids', () => {
    assertEqual(ALL_METHODS.length, 7);
  });

  test('contains expected method ids', () => {
    const expected = ['grubbs', 'dixon-q', 'generalized-esd', 'tukey-iqr', 'hampel', 'z-score', 'modified-z'];
    for (const id of expected) {
      assertEqual(ALL_METHODS.includes(id), true, `missing method: ${id}`);
    }
  });
});

// ─── State constructor defaults ──────────────────────────────────────────────

suite('Outlier Test — State constructor', () => {
  test('colRef defaults to null', () => {
    const s = new State();
    assertEqual(s.colRef, null);
  });

  test('alpha defaults to null (requires init-time resolution)', () => {
    const s = new State();
    assertEqual(s.alpha, null);
  });

  test('side defaults to two-sided', () => {
    const s = new State();
    assertEqual(s.side, 'two-sided');
  });

  test('tukeyFactor defaults to 1.5', () => {
    const s = new State();
    assertAlmostEqual(s.tukeyFactor, 1.5, 0.001);
  });

  test('hampelK defaults to 3', () => {
    const s = new State();
    assertAlmostEqual(s.hampelK, 3, 0.001);
  });

  test('zThreshold defaults to 3', () => {
    const s = new State();
    assertAlmostEqual(s.zThreshold, 3, 0.001);
  });

  test('modZThreshold defaults to 3.5', () => {
    const s = new State();
    assertAlmostEqual(s.modZThreshold, 3.5, 0.001);
  });

  test('esdMaxOutliers defaults to null', () => {
    const s = new State();
    assertEqual(s.esdMaxOutliers, null);
  });

  test('enabled defaults to all 7 methods as Array', () => {
    const s = new State();
    assertEqual(Array.isArray(s.enabled), true);
    assertEqual(s.enabled.length, 7);
    for (const id of ALL_METHODS) {
      assertEqual(s.enabled.includes(id), true, `missing: ${id}`);
    }
  });

  test('chartMethod defaults to all', () => {
    const s = new State();
    assertEqual(s.chartMethod, 'all');
  });

  test('exampleWorksheetId defaults to null', () => {
    const s = new State();
    assertEqual(s.exampleWorksheetId, null);
  });
});

// ─── State.toJSON ───────────────────────────────────────────────────────────

suite('Outlier Test — State.toJSON', () => {
  test('toJSON returns expected shape', () => {
    const s = new State();
    s.alpha = 0.05;
    const json = s.toJSON();
    assertEqual(typeof json, 'object');
    assertEqual(json.colRef, null);
    assertAlmostEqual(json.alpha, 0.05, 0.0001);
    assertEqual(json.side, 'two-sided');
    assertAlmostEqual(json.tukeyFactor, 1.5, 0.001);
    assertAlmostEqual(json.hampelK, 3, 0.001);
    assertAlmostEqual(json.zThreshold, 3, 0.001);
    assertAlmostEqual(json.modZThreshold, 3.5, 0.001);
    assertEqual(json.esdMaxOutliers, null);
    assertEqual(Array.isArray(json.enabled), true);
    assertEqual(json.chartMethod, 'all');
    assertEqual(json.exampleWorksheetId, null);
  });

  test('toJSON uses "colRef" (not columnRef) — legacy shape', () => {
    const s = new State();
    s.alpha = 0.05;
    const json = s.toJSON();
    assertEqual('colRef' in json, true);
    assertEqual('columnRef' in json, false);
  });

  test('toJSON serializes enabled as Array', () => {
    const s = new State();
    s.alpha = 0.05;
    const json = s.toJSON();
    assertEqual(Array.isArray(json.enabled), true);
  });

  test('toJSON preserves colRef object', () => {
    const s = new State();
    s.alpha = 0.05;
    s.colRef = { instanceId: 'inst1', sheetId: 'sheet1', columnId: 'col1' };
    const json = s.toJSON();
    assertEqual(json.colRef.instanceId, 'inst1');
    assertEqual(json.colRef.sheetId, 'sheet1');
    assertEqual(json.colRef.columnId, 'col1');
  });

  test('toJSON serializes partial enabled set correctly', () => {
    const s = new State();
    s.alpha = 0.05;
    s.enabled = ['grubbs', 'tukey-iqr'];
    const json = s.toJSON();
    assertEqual(json.enabled.length, 2);
    assertEqual(json.enabled.includes('grubbs'), true);
    assertEqual(json.enabled.includes('tukey-iqr'), true);
  });
});

// ─── State.fromJSON ─────────────────────────────────────────────────────────

suite('Outlier Test — State.fromJSON', () => {
  test('fromJSON(null) returns valid default State', () => {
    const s = State.fromJSON(null);
    assertEqual(s instanceof State, true);
    assertEqual(s.colRef, null);
    assertEqual(s.side, 'two-sided');
    assertEqual(s.enabled.length, 7);
  });

  test('fromJSON(undefined) returns valid default State', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s instanceof State, true);
    assertEqual(s.colRef, null);
  });

  test('fromJSON({}) returns valid default State with all defaults', () => {
    const s = State.fromJSON({});
    assertEqual(s instanceof State, true);
    assertAlmostEqual(s.tukeyFactor, 1.5, 0.001);
    assertEqual(s.side, 'two-sided');
  });

  test('fromJSON restores alpha correctly', () => {
    const s = State.fromJSON({ alpha: 0.01 });
    assertAlmostEqual(s.alpha, 0.01, 0.0001);
  });

  test('fromJSON restores side correctly', () => {
    const s = State.fromJSON({ side: 'upper' });
    assertEqual(s.side, 'upper');
  });

  test('fromJSON restores tukeyFactor', () => {
    const s = State.fromJSON({ tukeyFactor: 3.0 });
    assertAlmostEqual(s.tukeyFactor, 3.0, 0.001);
  });

  test('fromJSON restores hampelK', () => {
    const s = State.fromJSON({ hampelK: 2.5 });
    assertAlmostEqual(s.hampelK, 2.5, 0.001);
  });

  test('fromJSON restores zThreshold', () => {
    const s = State.fromJSON({ zThreshold: 2.5 });
    assertAlmostEqual(s.zThreshold, 2.5, 0.001);
  });

  test('fromJSON restores modZThreshold', () => {
    const s = State.fromJSON({ modZThreshold: 4.0 });
    assertAlmostEqual(s.modZThreshold, 4.0, 0.001);
  });

  test('fromJSON restores esdMaxOutliers', () => {
    const s = State.fromJSON({ esdMaxOutliers: 5 });
    assertEqual(s.esdMaxOutliers, 5);
  });

  test('fromJSON restores esdMaxOutliers null', () => {
    const s = State.fromJSON({ esdMaxOutliers: null });
    assertEqual(s.esdMaxOutliers, null);
  });

  test('fromJSON restores enabled as Array from Array', () => {
    const s = State.fromJSON({ enabled: ['grubbs', 'tukey-iqr'] });
    assertEqual(Array.isArray(s.enabled), true);
    assertEqual(s.enabled.length, 2);
    assertEqual(s.enabled.includes('grubbs'), true);
    assertEqual(s.enabled.includes('tukey-iqr'), true);
  });

  test('fromJSON defaults enabled to all 7 when missing', () => {
    const s = State.fromJSON({});
    assertEqual(s.enabled.length, 7);
  });

  test('fromJSON restores chartMethod', () => {
    const s = State.fromJSON({ chartMethod: 'grubbs' });
    assertEqual(s.chartMethod, 'grubbs');
  });

  test('fromJSON restores exampleWorksheetId', () => {
    const s = State.fromJSON({ exampleWorksheetId: 'ws-123' });
    assertEqual(s.exampleWorksheetId, 'ws-123');
  });

  test('fromJSON restores colRef object', () => {
    const s = State.fromJSON({
      colRef: { instanceId: 'inst1', sheetId: 'sheet1', columnId: 'col1' }
    });
    assertEqual(s.colRef.instanceId, 'inst1');
    assertEqual(s.colRef.sheetId, 'sheet1');
    assertEqual(s.colRef.columnId, 'col1');
  });

  test('fromJSON rejects invalid colRef (missing fields)', () => {
    const s = State.fromJSON({ colRef: { instanceId: 'x' } });
    assertEqual(s.colRef, null);
  });

  test('fromJSON rejects non-object colRef', () => {
    const s = State.fromJSON({ colRef: 'invalid' });
    assertEqual(s.colRef, null);
  });

  test('fromJSON defaults side on invalid value', () => {
    const s = State.fromJSON({ side: 'invalid-side' });
    assertEqual(s.side, 'two-sided');
  });

  test('fromJSON defaults alpha to null when missing (requires init-time fill)', () => {
    const s = State.fromJSON({});
    assertEqual(s.alpha, null);
  });
});

// ─── toJSON → fromJSON round-trip ───────────────────────────────────────────

suite('Outlier Test — toJSON/fromJSON round-trip', () => {
  test('full round-trip preserves all fields', () => {
    const s = new State();
    s.alpha = 0.01;
    s.side = 'upper';
    s.tukeyFactor = 2.0;
    s.hampelK = 4;
    s.zThreshold = 2.5;
    s.modZThreshold = 4.0;
    s.esdMaxOutliers = 3;
    s.enabled = ['grubbs', 'tukey-iqr', 'hampel'];
    s.chartMethod = 'grubbs';
    s.exampleWorksheetId = 'ws-abc';
    s.colRef = { instanceId: 'i1', sheetId: 's1', columnId: 'c1' };

    const s2 = State.fromJSON(s.toJSON());
    assertAlmostEqual(s2.alpha, 0.01, 0.0001);
    assertEqual(s2.side, 'upper');
    assertAlmostEqual(s2.tukeyFactor, 2.0, 0.001);
    assertAlmostEqual(s2.hampelK, 4, 0.001);
    assertAlmostEqual(s2.zThreshold, 2.5, 0.001);
    assertAlmostEqual(s2.modZThreshold, 4.0, 0.001);
    assertEqual(s2.esdMaxOutliers, 3);
    assertEqual(s2.enabled.length, 3);
    assertEqual(s2.enabled.includes('grubbs'), true);
    assertEqual(s2.chartMethod, 'grubbs');
    assertEqual(s2.exampleWorksheetId, 'ws-abc');
    assertEqual(s2.colRef.instanceId, 'i1');
  });

  test('round-trip with null colRef', () => {
    const s = new State();
    s.alpha = 0.05;
    const s2 = State.fromJSON(s.toJSON());
    assertEqual(s2.colRef, null);
  });
});

// ─── State.hasContent ───────────────────────────────────────────────────────

suite('Outlier Test — State.hasContent', () => {
  test('hasContent returns false when no colRef', () => {
    const s = new State();
    s.alpha = 0.05;
    assertEqual(s.hasContent(), false);
  });

  test('hasContent returns true when colRef is set', () => {
    const s = new State();
    s.alpha = 0.05;
    s.colRef = { instanceId: 'i1', sheetId: 's1', columnId: 'c1' };
    assertEqual(s.hasContent(), true);
  });
});
