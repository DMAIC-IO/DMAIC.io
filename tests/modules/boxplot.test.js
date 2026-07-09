/**
 * D.Mike — Boxplot Model Unit Tests
 * TDD: Tests written BEFORE the model implementation.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import { State } from '../../js/modules/boxplot/boxplot-model.js';

// ── State defaults ──────────────────────────────────────────────────────────

suite('Boxplot Model — State defaults', () => {
  test('constructor sets correct default values', () => {
    const s = new State();
    assertEqual(JSON.stringify(s.seriesRefs), '[]');
    assertEqual(JSON.stringify(s.groupRefs), '[]');
    assertEqual(s.showMean, true);
    assertEqual(s.showOutliers, true);
    assertEqual(s.showStats, true);
    assertEqual(s.confLevel, 95);
    assertEqual(JSON.stringify(s.refLines), '[]');
    assertEqual(JSON.stringify(s.refAreas), '[]');
    assertEqual(s.bgColor, null);
    assertEqual(JSON.stringify(s.boxColors), '[]');
    assertEqual(s.exampleWorksheetId, null);
  });

  test('hasContent() returns false when no series refs', () => {
    const s = new State();
    assertEqual(s.hasContent(), false);
  });

  test('hasContent() returns true when seriesRefs has content', () => {
    const s = new State();
    s.seriesRefs = [{ instanceId: 'a', sheetId: 's', columnId: 'c' }];
    assertEqual(s.hasContent(), true);
  });
});

// ── toJSON ──────────────────────────────────────────────────────────────────

suite('Boxplot Model — toJSON', () => {
  test('toJSON returns expected shape with defaults', () => {
    const s = new State();
    const j = s.toJSON();
    assertEqual(Array.isArray(j.seriesRefs), true);
    assertEqual(Array.isArray(j.groupRefs), true);
    assertEqual(j.showMean, true);
    assertEqual(j.showOutliers, true);
    assertEqual(j.showStats, true);
    assertEqual(j.confLevel, 95);
    assertEqual(Array.isArray(j.refLines), true);
    assertEqual(Array.isArray(j.refAreas), true);
    assertEqual(j.bgColor, null);
    assertEqual(Array.isArray(j.boxColors), true);
    assertEqual(j.exampleWorksheetId, null);
  });

  test('toJSON preserves seriesRefs correctly', () => {
    const s = new State();
    const ref = { instanceId: 'inst-1', sheetId: 'sh-1', columnId: 'col-1' };
    s.seriesRefs = [ref];
    s.groupRefs = [null];
    const j = s.toJSON();
    assertEqual(j.seriesRefs.length, 1);
    assertEqual(j.seriesRefs[0].instanceId, 'inst-1');
    assertEqual(j.groupRefs[0], null);
  });
});

// ── fromJSON ────────────────────────────────────────────────────────────────

suite('Boxplot Model — fromJSON', () => {
  test('fromJSON(null) returns valid default State', () => {
    const s = State.fromJSON(null);
    assertEqual(s instanceof State, true);
    assertEqual(s.seriesRefs.length, 0);
    assertEqual(s.showMean, true);
    assertEqual(s.confLevel, 95);
  });

  test('fromJSON(undefined) returns valid default State', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s instanceof State, true);
    assertEqual(s.seriesRefs.length, 0);
  });

  test('fromJSON({}) returns valid default State', () => {
    const s = State.fromJSON({});
    assertEqual(s instanceof State, true);
    assertEqual(s.seriesRefs.length, 0);
    assertEqual(s.showMean, true);
    assertEqual(s.showOutliers, true);
    assertEqual(s.showStats, true);
    assertEqual(s.confLevel, 95);
  });

  test('fromJSON restores all fields correctly', () => {
    const ref1 = { instanceId: 'i1', sheetId: 's1', columnId: 'c1' };
    const ref2 = { instanceId: 'i2', sheetId: 's2', columnId: 'c2' };
    const data = {
      seriesRefs: [ref1],
      groupRefs: [ref2],
      showMean: false,
      showOutliers: false,
      showStats: false,
      confLevel: 90,
      refLines: [{ value: 10 }],
      refAreas: [{ min: 5, max: 15 }],
      bgColor: '#ffffff',
      boxColors: ['#ff0000'],
      exampleWorksheetId: 'ws-123',
    };
    const s = State.fromJSON(data);
    assertEqual(s.seriesRefs.length, 1);
    assertEqual(s.seriesRefs[0].instanceId, 'i1');
    assertEqual(s.groupRefs[0].instanceId, 'i2');
    assertEqual(s.showMean, false);
    assertEqual(s.showOutliers, false);
    assertEqual(s.showStats, false);
    assertEqual(s.confLevel, 90);
    assertEqual(s.refLines.length, 1);
    assertEqual(s.refAreas.length, 1);
    assertEqual(s.bgColor, '#ffffff');
    assertEqual(s.boxColors[0], '#ff0000');
    assertEqual(s.exampleWorksheetId, 'ws-123');
  });

  test('fromJSON defaults showMean/showOutliers/showStats to true if missing', () => {
    const s = State.fromJSON({ seriesRefs: [], groupRefs: [] });
    assertEqual(s.showMean, true);
    assertEqual(s.showOutliers, true);
    assertEqual(s.showStats, true);
  });

  test('fromJSON defaults confLevel to 95 if missing', () => {
    const s = State.fromJSON({});
    assertEqual(s.confLevel, 95);
  });
});

// ── fromJSON round-trip ─────────────────────────────────────────────────────

suite('Boxplot Model — round-trip', () => {
  test('toJSON → fromJSON round-trip preserves state faithfully', () => {
    const s = new State();
    s.seriesRefs = [{ instanceId: 'i1', sheetId: 's1', columnId: 'c1' }];
    s.groupRefs = [null];
    s.showMean = false;
    s.showOutliers = false;
    s.showStats = false;
    s.confLevel = 99;
    s.refLines = [{ dir: 'h', value: 42 }];
    s.refAreas = [{ min: 1, max: 2 }];
    s.bgColor = '#aabbcc';
    s.boxColors = ['#ff0000', '#00ff00'];
    s.exampleWorksheetId = 'ws-abc';

    const s2 = State.fromJSON(s.toJSON());
    assertEqual(s2.seriesRefs.length, 1);
    assertEqual(s2.seriesRefs[0].instanceId, 'i1');
    assertEqual(s2.groupRefs[0], null);
    assertEqual(s2.showMean, false);
    assertEqual(s2.showOutliers, false);
    assertEqual(s2.showStats, false);
    assertEqual(s2.confLevel, 99);
    assertEqual(s2.refLines.length, 1);
    assertEqual(s2.refLines[0].value, 42);
    assertEqual(s2.refAreas.length, 1);
    assertEqual(s2.bgColor, '#aabbcc');
    assertEqual(s2.boxColors.length, 2);
    assertEqual(s2.exampleWorksheetId, 'ws-abc');
  });
});

// ── Backward compatibility ──────────────────────────────────────────────────

suite('Boxplot Model — backward compatibility', () => {
  test('fromJSON handles legacy grouped mode (mode + valueRef + groupRef)', () => {
    const legacy = {
      mode: 'grouped',
      valueRef: { instanceId: 'i1', sheetId: 's1', columnId: 'c1' },
      groupRef: { instanceId: 'i1', sheetId: 's1', columnId: 'c2' },
    };
    const s = State.fromJSON(legacy);
    assertEqual(s.seriesRefs.length, 1);
    assertEqual(s.seriesRefs[0].columnId, 'c1');
    assertEqual(s.groupRefs.length, 1);
    assertEqual(s.groupRefs[0].columnId, 'c2');
  });

  test('fromJSON handles legacy grouped mode with missing groupRef', () => {
    const legacy = {
      mode: 'grouped',
      valueRef: { instanceId: 'i1', sheetId: 's1', columnId: 'c1' },
    };
    const s = State.fromJSON(legacy);
    assertEqual(s.seriesRefs.length, 1);
    assertEqual(s.groupRefs[0], null);
  });

  test('fromJSON handles invalid seriesRefs gracefully', () => {
    const s = State.fromJSON({ seriesRefs: 'not-an-array' });
    assertEqual(Array.isArray(s.seriesRefs), true);
    assertEqual(s.seriesRefs.length, 0);
  });

  test('fromJSON handles invalid confLevel gracefully', () => {
    const s = State.fromJSON({ confLevel: 'bad' });
    assertEqual(s.confLevel, 95);
  });

  test('fromJSON handles confLevel of 0 (falsy but valid)', () => {
    // 0 is unlikely but test the boundary — should be treated as invalid and defaulted
    const s = State.fromJSON({ confLevel: 0 });
    // 0 is falsy — the ?? operator will replace with 95
    assertEqual(s.confLevel, 95);
  });

  test('fromJSON handles valid confLevel like 90', () => {
    const s = State.fromJSON({ confLevel: 90 });
    assertEqual(s.confLevel, 90);
  });
});

// ── hasContent ──────────────────────────────────────────────────────────────

suite('Boxplot Model — hasContent', () => {
  test('hasContent() false for fresh state', () => {
    assertEqual(new State().hasContent(), false);
  });

  test('hasContent() true after adding a seriesRef', () => {
    const s = new State();
    s.seriesRefs = [{ instanceId: 'x', sheetId: 'y', columnId: 'z' }];
    assertEqual(s.hasContent(), true);
  });

  test('hasContent() false for empty seriesRefs array', () => {
    const s = new State();
    s.seriesRefs = [];
    assertEqual(s.hasContent(), false);
  });
});
