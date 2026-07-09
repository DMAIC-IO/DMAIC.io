/**
 * Unit-Tests for transformed-imr-chart Model.
 * TDD Red phase — model does not exist yet.
 */
import { suite, test, assertEqual } from '../test-utils.js';
import { State } from '../../js/modules/transformed-imr-chart/transformed-imr-chart-model.js';

// ─── Constructor defaults ────────────────────────────────────────────────────

suite('TransformedIMRChart Model — defaults', () => {
  test('constructor: columnRef is null', () => {
    const s = new State();
    assertEqual(s.columnRef, null);
  });

  test('constructor: lambdaMode is auto', () => {
    const s = new State();
    assertEqual(s.lambdaMode, 'auto');
  });

  test('constructor: lambdaManual is 0', () => {
    const s = new State();
    assertEqual(s.lambdaManual, 0);
  });

  test('constructor: exampleWorksheetId is null', () => {
    const s = new State();
    assertEqual(s.exampleWorksheetId, null);
  });
});

// ─── toJSON ─────────────────────────────────────────────────────────────────

suite('TransformedIMRChart Model — toJSON', () => {
  test('toJSON returns expected shape (legacy compat)', () => {
    const j = new State().toJSON();
    assertEqual('columnRef' in j, true);
    assertEqual('lambdaMode' in j, true);
    assertEqual('lambdaManual' in j, true);
  });

  test('toJSON: columnRef null by default', () => {
    assertEqual(new State().toJSON().columnRef, null);
  });

  test('toJSON: lambdaMode auto by default', () => {
    assertEqual(new State().toJSON().lambdaMode, 'auto');
  });

  test('toJSON: lambdaManual is 0 by default', () => {
    assertEqual(new State().toJSON().lambdaManual, 0);
  });

  test('toJSON: exampleWorksheetId null by default', () => {
    assertEqual(new State().toJSON().exampleWorksheetId, null);
  });

  test('toJSON serialises columnRef', () => {
    const s = new State();
    s.columnRef = { instanceId: 'i1', sheetId: 's1', columnId: 'c1' };
    const j = s.toJSON();
    assertEqual(j.columnRef.instanceId, 'i1');
    assertEqual(j.columnRef.sheetId, 's1');
    assertEqual(j.columnRef.columnId, 'c1');
  });

  test('toJSON serialises lambdaMode manual', () => {
    const s = new State();
    s.lambdaMode = 'manual';
    assertEqual(s.toJSON().lambdaMode, 'manual');
  });

  test('toJSON serialises lambdaManual', () => {
    const s = new State();
    s.lambdaManual = 1.5;
    assertEqual(s.toJSON().lambdaManual, 1.5);
  });

  test('toJSON serialises exampleWorksheetId', () => {
    const s = new State();
    s.exampleWorksheetId = 'ws-42';
    assertEqual(s.toJSON().exampleWorksheetId, 'ws-42');
  });
});

// ─── fromJSON ───────────────────────────────────────────────────────────────

suite('TransformedIMRChart Model — fromJSON robustness', () => {
  test('fromJSON(null) returns valid default state', () => {
    const s = State.fromJSON(null);
    assertEqual(s.columnRef, null);
    assertEqual(s.lambdaMode, 'auto');
    assertEqual(s.lambdaManual, 0);
    assertEqual(s.exampleWorksheetId, null);
  });

  test('fromJSON(undefined) returns valid default state', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.columnRef, null);
    assertEqual(s.lambdaMode, 'auto');
    assertEqual(s.lambdaManual, 0);
  });

  test('fromJSON({}) returns valid default state', () => {
    const s = State.fromJSON({});
    assertEqual(s.columnRef, null);
    assertEqual(s.lambdaMode, 'auto');
    assertEqual(s.lambdaManual, 0);
    assertEqual(s.exampleWorksheetId, null);
  });

  test('fromJSON restores columnRef', () => {
    const s = State.fromJSON({
      columnRef: { instanceId: 'i', sheetId: 's', columnId: 'c' },
    });
    assertEqual(s.columnRef.instanceId, 'i');
    assertEqual(s.columnRef.sheetId, 's');
    assertEqual(s.columnRef.columnId, 'c');
  });

  test('fromJSON restores lambdaMode manual', () => {
    const s = State.fromJSON({ lambdaMode: 'manual' });
    assertEqual(s.lambdaMode, 'manual');
  });

  test('fromJSON: invalid lambdaMode defaults to auto', () => {
    const s = State.fromJSON({ lambdaMode: 'bogus' });
    assertEqual(s.lambdaMode, 'auto');
  });

  test('fromJSON restores lambdaManual', () => {
    const s = State.fromJSON({ lambdaManual: 0.5 });
    assertEqual(s.lambdaManual, 0.5);
  });

  test('fromJSON: non-finite lambdaManual defaults to 0', () => {
    const s = State.fromJSON({ lambdaManual: 'abc' });
    assertEqual(s.lambdaManual, 0);
  });

  test('fromJSON: NaN lambdaManual defaults to 0', () => {
    const s = State.fromJSON({ lambdaManual: NaN });
    assertEqual(s.lambdaManual, 0);
  });

  test('fromJSON: invalid columnRef (non-object) becomes null', () => {
    const s = State.fromJSON({ columnRef: 'bad' });
    assertEqual(s.columnRef, null);
  });

  test('fromJSON: missing fields in columnRef becomes null', () => {
    const s = State.fromJSON({ columnRef: { instanceId: 'i' } });
    assertEqual(s.columnRef, null);
  });

  test('fromJSON restores exampleWorksheetId', () => {
    const s = State.fromJSON({ exampleWorksheetId: 'ws-99' });
    assertEqual(s.exampleWorksheetId, 'ws-99');
  });

  test('fromJSON: missing exampleWorksheetId becomes null', () => {
    const s = State.fromJSON({ columnRef: null });
    assertEqual(s.exampleWorksheetId, null);
  });

  test('fromJSON: legacy state without exampleWorksheetId becomes null', () => {
    const s = State.fromJSON({ columnRef: null, lambdaMode: 'auto', lambdaManual: 0 });
    assertEqual(s.exampleWorksheetId, null);
  });
});

// ─── Round-trip ─────────────────────────────────────────────────────────────

suite('TransformedIMRChart Model — round-trip', () => {
  test('toJSON -> fromJSON is lossless for default state', () => {
    const s = new State();
    const s2 = State.fromJSON(s.toJSON());
    assertEqual(s2.columnRef, null);
    assertEqual(s2.lambdaMode, 'auto');
    assertEqual(s2.lambdaManual, 0);
    assertEqual(s2.exampleWorksheetId, null);
  });

  test('toJSON -> fromJSON is lossless for set state', () => {
    const s = new State();
    s.columnRef = { instanceId: 'i1', sheetId: 's1', columnId: 'c1' };
    s.lambdaMode = 'manual';
    s.lambdaManual = 1.23;
    s.exampleWorksheetId = 'ws-1';
    const s2 = State.fromJSON(s.toJSON());
    assertEqual(JSON.stringify(s2.toJSON()), JSON.stringify(s.toJSON()));
  });

  test('round-trip preserves columnRef exactly', () => {
    const ref = { instanceId: 'abc', sheetId: 'sh1', columnId: 'col3' };
    const s = new State();
    s.columnRef = ref;
    const s2 = State.fromJSON(s.toJSON());
    assertEqual(s2.columnRef.instanceId, 'abc');
    assertEqual(s2.columnRef.sheetId, 'sh1');
    assertEqual(s2.columnRef.columnId, 'col3');
  });

  test('round-trip preserves lambdaManual negative value', () => {
    const s = new State();
    s.lambdaManual = -0.5;
    const s2 = State.fromJSON(s.toJSON());
    assertEqual(s2.lambdaManual, -0.5);
  });
});

// ─── hasContent ─────────────────────────────────────────────────────────────

suite('TransformedIMRChart Model — hasContent', () => {
  test('empty state has no content', () => {
    assertEqual(new State().hasContent(), false);
  });

  test('with columnRef has content', () => {
    const s = new State();
    s.columnRef = { instanceId: 'i', sheetId: 's', columnId: 'c' };
    assertEqual(s.hasContent(), true);
  });

  test('exampleWorksheetId alone does not count as content', () => {
    const s = new State();
    s.exampleWorksheetId = 'ws-1';
    assertEqual(s.hasContent(), false);
  });

  test('lambdaMode change alone does not count as content', () => {
    const s = new State();
    s.lambdaMode = 'manual';
    assertEqual(s.hasContent(), false);
  });

  test('lambdaManual change alone does not count as content', () => {
    const s = new State();
    s.lambdaManual = 1.5;
    assertEqual(s.hasContent(), false);
  });
});
