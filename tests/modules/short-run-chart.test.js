/**
 * Unit-Tests for short-run-chart Model.
 * TDD Red phase — model does not exist yet.
 */
import { suite, test, assertEqual } from '../test-utils.js';
import { State } from '../../js/modules/short-run-chart/short-run-chart-model.js';

// ─── Constructor defaults ────────────────────────────────────────────────────

suite('ShortRunChart Model — defaults', () => {
  test('constructor: valuesRef is null', () => {
    const s = new State();
    assertEqual(s.valuesRef, null);
  });

  test('constructor: groupsRef is null', () => {
    const s = new State();
    assertEqual(s.groupsRef, null);
  });

  test('constructor: exampleWorksheetId is null', () => {
    const s = new State();
    assertEqual(s.exampleWorksheetId, null);
  });
});

// ─── toJSON ─────────────────────────────────────────────────────────────────

suite('ShortRunChart Model — toJSON', () => {
  test('toJSON returns expected shape (legacy compat)', () => {
    const j = new State().toJSON();
    assertEqual('valuesRef' in j, true);
    assertEqual('groupsRef' in j, true);
  });

  test('toJSON: valuesRef null by default', () => {
    assertEqual(new State().toJSON().valuesRef, null);
  });

  test('toJSON: groupsRef null by default', () => {
    assertEqual(new State().toJSON().groupsRef, null);
  });

  test('toJSON: exampleWorksheetId null by default', () => {
    assertEqual(new State().toJSON().exampleWorksheetId, null);
  });

  test('toJSON serialises valuesRef', () => {
    const s = new State();
    s.valuesRef = { instanceId: 'i1', sheetId: 's1', columnId: 'c1' };
    const j = s.toJSON();
    assertEqual(j.valuesRef.instanceId, 'i1');
    assertEqual(j.valuesRef.sheetId, 's1');
    assertEqual(j.valuesRef.columnId, 'c1');
  });

  test('toJSON serialises groupsRef', () => {
    const s = new State();
    s.groupsRef = { instanceId: 'i2', sheetId: 's1', columnId: 'c2' };
    const j = s.toJSON();
    assertEqual(j.groupsRef.instanceId, 'i2');
    assertEqual(j.groupsRef.columnId, 'c2');
  });

  test('toJSON serialises exampleWorksheetId', () => {
    const s = new State();
    s.exampleWorksheetId = 'ws-42';
    assertEqual(s.toJSON().exampleWorksheetId, 'ws-42');
  });
});

// ─── fromJSON ───────────────────────────────────────────────────────────────

suite('ShortRunChart Model — fromJSON robustness', () => {
  test('fromJSON(null) returns valid default state', () => {
    const s = State.fromJSON(null);
    assertEqual(s.valuesRef, null);
    assertEqual(s.groupsRef, null);
    assertEqual(s.exampleWorksheetId, null);
  });

  test('fromJSON(undefined) returns valid default state', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.valuesRef, null);
    assertEqual(s.groupsRef, null);
  });

  test('fromJSON({}) returns valid default state', () => {
    const s = State.fromJSON({});
    assertEqual(s.valuesRef, null);
    assertEqual(s.groupsRef, null);
    assertEqual(s.exampleWorksheetId, null);
  });

  test('fromJSON restores valuesRef', () => {
    const s = State.fromJSON({
      valuesRef: { instanceId: 'i', sheetId: 's', columnId: 'c' },
    });
    assertEqual(s.valuesRef.instanceId, 'i');
    assertEqual(s.valuesRef.sheetId, 's');
    assertEqual(s.valuesRef.columnId, 'c');
  });

  test('fromJSON restores groupsRef', () => {
    const s = State.fromJSON({
      groupsRef: { instanceId: 'ig', sheetId: 'sg', columnId: 'cg' },
    });
    assertEqual(s.groupsRef.instanceId, 'ig');
    assertEqual(s.groupsRef.sheetId, 'sg');
    assertEqual(s.groupsRef.columnId, 'cg');
  });

  test('fromJSON: invalid valuesRef (non-object) becomes null', () => {
    const s = State.fromJSON({ valuesRef: 'bad' });
    assertEqual(s.valuesRef, null);
  });

  test('fromJSON: invalid groupsRef (non-object) becomes null', () => {
    const s = State.fromJSON({ groupsRef: 42 });
    assertEqual(s.groupsRef, null);
  });

  test('fromJSON: missing fields in valuesRef object becomes null', () => {
    const s = State.fromJSON({ valuesRef: { instanceId: 'i' } });
    assertEqual(s.valuesRef, null);
  });

  test('fromJSON restores exampleWorksheetId', () => {
    const s = State.fromJSON({ exampleWorksheetId: 'ws-99' });
    assertEqual(s.exampleWorksheetId, 'ws-99');
  });

  test('fromJSON: missing exampleWorksheetId becomes null', () => {
    const s = State.fromJSON({ valuesRef: null, groupsRef: null });
    assertEqual(s.exampleWorksheetId, null);
  });

  test('fromJSON: legacy state without exampleWorksheetId becomes null', () => {
    const s = State.fromJSON({ valuesRef: null, groupsRef: null });
    assertEqual(s.exampleWorksheetId, null);
  });
});

// ─── Round-trip ─────────────────────────────────────────────────────────────

suite('ShortRunChart Model — round-trip', () => {
  test('toJSON -> fromJSON is lossless for null refs', () => {
    const s = new State();
    const s2 = State.fromJSON(s.toJSON());
    assertEqual(s2.valuesRef, null);
    assertEqual(s2.groupsRef, null);
    assertEqual(s2.exampleWorksheetId, null);
  });

  test('toJSON -> fromJSON is lossless for set refs', () => {
    const s = new State();
    s.valuesRef = { instanceId: 'i1', sheetId: 's1', columnId: 'c1' };
    s.groupsRef = { instanceId: 'i2', sheetId: 's1', columnId: 'c2' };
    s.exampleWorksheetId = 'ws-1';
    const s2 = State.fromJSON(s.toJSON());
    assertEqual(JSON.stringify(s2.toJSON()), JSON.stringify(s.toJSON()));
  });

  test('round-trip preserves valuesRef exactly', () => {
    const ref = { instanceId: 'abc', sheetId: 'sh1', columnId: 'col3' };
    const s = new State();
    s.valuesRef = ref;
    const s2 = State.fromJSON(s.toJSON());
    assertEqual(s2.valuesRef.instanceId, 'abc');
    assertEqual(s2.valuesRef.sheetId, 'sh1');
    assertEqual(s2.valuesRef.columnId, 'col3');
  });
});

// ─── hasContent ─────────────────────────────────────────────────────────────

suite('ShortRunChart Model — hasContent', () => {
  test('empty state has no content', () => {
    assertEqual(new State().hasContent(), false);
  });

  test('with valuesRef only has content', () => {
    const s = new State();
    s.valuesRef = { instanceId: 'i', sheetId: 's', columnId: 'c' };
    assertEqual(s.hasContent(), true);
  });

  test('with groupsRef only has content', () => {
    const s = new State();
    s.groupsRef = { instanceId: 'i', sheetId: 's', columnId: 'c' };
    assertEqual(s.hasContent(), true);
  });

  test('with both refs has content', () => {
    const s = new State();
    s.valuesRef = { instanceId: 'i1', sheetId: 's1', columnId: 'c1' };
    s.groupsRef = { instanceId: 'i2', sheetId: 's1', columnId: 'c2' };
    assertEqual(s.hasContent(), true);
  });

  test('exampleWorksheetId alone does not count as content', () => {
    const s = new State();
    s.exampleWorksheetId = 'ws-1';
    assertEqual(s.hasContent(), false);
  });
});
