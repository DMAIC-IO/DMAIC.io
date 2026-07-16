/**
 * D.Mike — Distribution Fit Model Tests (distribution-fit.test.js)
 *
 * TDD spec for the distribution-fit-model.js State class.
 * Tests cover constructor defaults, toJSON/fromJSON roundtrip,
 * hasContent(), and deserialization of legacy/malformed input.
 */

import { suite, test, assertEqual } from '../test-utils.js';
import { State } from '../../js/modules/distribution-fit/distribution-fit-model.js';

// ─── State: Defaults ─────────────────────────────────────────────────────────

suite('Distribution Fit Model — State defaults', () => {
  test('constructor sets default columnRef to null', () => {
    const s = new State();
    assertEqual(s.columnRef, null);
  });

  test('constructor sets default dataType to auto', () => {
    const s = new State();
    assertEqual(s.dataType, 'auto');
  });

  test('constructor sets default exampleWorksheetId to null', () => {
    const s = new State();
    assertEqual(s.exampleWorksheetId, null);
  });

  test('hasContent() returns false for fresh state', () => {
    const s = new State();
    assertEqual(s.hasContent(), false);
  });

  test('hasContent() returns true when columnRef is set', () => {
    const s = new State();
    s.columnRef = { instanceId: 'abc', sheetId: 's1', columnId: 'c0' };
    assertEqual(s.hasContent(), true);
  });
});

// ─── State: toJSON ────────────────────────────────────────────────────────────

suite('Distribution Fit Model — toJSON', () => {
  test('toJSON returns expected shape with defaults', () => {
    const s = new State();
    const j = s.toJSON();
    assertEqual(j.columnRef, null);
    assertEqual(j.dataType, 'auto');
    assertEqual(j.exampleWorksheetId, null);
  });

  test('toJSON includes columnRef when set', () => {
    const s = new State();
    s.columnRef = { instanceId: 'i1', sheetId: 's1', columnId: 'c0' };
    const j = s.toJSON();
    assertEqual(j.columnRef.instanceId, 'i1');
    assertEqual(j.columnRef.sheetId, 's1');
    assertEqual(j.columnRef.columnId, 'c0');
  });

  test('toJSON clones columnRef (no shared reference)', () => {
    const s = new State();
    const ref = { instanceId: 'i1', sheetId: 's1', columnId: 'c0' };
    s.columnRef = ref;
    const j = s.toJSON();
    // Mutate original
    ref.instanceId = 'changed';
    assertEqual(j.columnRef.instanceId, 'i1');
  });

  test('toJSON preserves dataType', () => {
    const s = new State();
    s.dataType = 'continuous';
    assertEqual(s.toJSON().dataType, 'continuous');
  });

  test('toJSON preserves exampleWorksheetId', () => {
    const s = new State();
    s.exampleWorksheetId = 'ws-123';
    assertEqual(s.toJSON().exampleWorksheetId, 'ws-123');
  });
});

// ─── State: fromJSON ─────────────────────────────────────────────────────────

suite('Distribution Fit Model — fromJSON', () => {
  test('fromJSON(null) returns valid default State', () => {
    const s = State.fromJSON(null);
    assertEqual(s.columnRef, null);
    assertEqual(s.dataType, 'auto');
    assertEqual(s.exampleWorksheetId, null);
  });

  test('fromJSON(undefined) returns valid default State', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.columnRef, null);
    assertEqual(s.dataType, 'auto');
  });

  test('fromJSON({}) returns valid default State', () => {
    const s = State.fromJSON({});
    assertEqual(s.columnRef, null);
    assertEqual(s.dataType, 'auto');
  });

  test('fromJSON restores columnRef', () => {
    const s = State.fromJSON({
      columnRef: { instanceId: 'i1', sheetId: 's1', columnId: 'c0' },
      dataType: 'auto',
      exampleWorksheetId: null,
    });
    assertEqual(s.columnRef.instanceId, 'i1');
    assertEqual(s.columnRef.sheetId, 's1');
    assertEqual(s.columnRef.columnId, 'c0');
  });

  test('fromJSON restores dataType', () => {
    const s = State.fromJSON({ dataType: 'continuous' });
    assertEqual(s.dataType, 'continuous');
  });

  test('fromJSON restores discrete dataType', () => {
    const s = State.fromJSON({ dataType: 'discrete' });
    assertEqual(s.dataType, 'discrete');
  });

  test('fromJSON defaults invalid dataType to auto', () => {
    const s = State.fromJSON({ dataType: 'bogus' });
    assertEqual(s.dataType, 'auto');
  });

  test('fromJSON restores exampleWorksheetId', () => {
    const s = State.fromJSON({ exampleWorksheetId: 'ws-abc' });
    assertEqual(s.exampleWorksheetId, 'ws-abc');
  });

  test('fromJSON handles invalid columnRef (missing fields)', () => {
    const s = State.fromJSON({ columnRef: { instanceId: 'i1' } });
    // Missing sheetId and columnId — should be null
    assertEqual(s.columnRef, null);
  });

  test('fromJSON handles non-object columnRef', () => {
    const s = State.fromJSON({ columnRef: 'bad-value' });
    assertEqual(s.columnRef, null);
  });

  test('fromJSON handles null exampleWorksheetId', () => {
    const s = State.fromJSON({ exampleWorksheetId: null });
    assertEqual(s.exampleWorksheetId, null);
  });

  test('fromJSON handles non-string exampleWorksheetId', () => {
    const s = State.fromJSON({ exampleWorksheetId: 42 });
    assertEqual(s.exampleWorksheetId, null);
  });
});

// ─── State: Round-trip ────────────────────────────────────────────────────────

suite('Distribution Fit Model — toJSON/fromJSON roundtrip', () => {
  test('roundtrip with null columnRef', () => {
    const s = new State();
    const s2 = State.fromJSON(s.toJSON());
    assertEqual(s2.columnRef, null);
    assertEqual(s2.dataType, 'auto');
    assertEqual(s2.exampleWorksheetId, null);
  });

  test('roundtrip with columnRef set', () => {
    const s = new State();
    s.columnRef = { instanceId: 'i1', sheetId: 's1', columnId: 'c2' };
    s.dataType = 'continuous';
    s.exampleWorksheetId = 'ws-test';
    const s2 = State.fromJSON(s.toJSON());
    assertEqual(s2.columnRef.instanceId, 'i1');
    assertEqual(s2.columnRef.sheetId, 's1');
    assertEqual(s2.columnRef.columnId, 'c2');
    assertEqual(s2.dataType, 'continuous');
    assertEqual(s2.exampleWorksheetId, 'ws-test');
  });

  test('roundtrip with discrete dataType', () => {
    const s = new State();
    s.dataType = 'discrete';
    const s2 = State.fromJSON(s.toJSON());
    assertEqual(s2.dataType, 'discrete');
  });
});

// ─── hasContent ──────────────────────────────────────────────────────────────

suite('Distribution Fit Model — hasContent', () => {
  test('returns false with no columnRef', () => {
    const s = new State();
    assertEqual(s.hasContent(), false);
  });

  test('returns true when columnRef is set', () => {
    const s = State.fromJSON({
      columnRef: { instanceId: 'i1', sheetId: 's1', columnId: 'c0' },
    });
    assertEqual(s.hasContent(), true);
  });

  test('returns false after fromJSON with no columnRef', () => {
    const s = State.fromJSON({ dataType: 'continuous' });
    assertEqual(s.hasContent(), false);
  });
});
