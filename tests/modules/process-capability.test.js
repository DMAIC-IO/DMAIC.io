import { suite, test, assertEqual } from '../test-utils.js';
import { State } from '../../js/modules/process-capability/process-capability-model.js';

suite('Process Capability Model — State defaults', () => {
  test('constructor sets default params (strings, mm, 95)', () => {
    const s = new State();
    assertEqual(s.params.name, '');
    assertEqual(s.params.lsl, '');
    assertEqual(s.params.usl, '');
    assertEqual(s.params.target, '');
    assertEqual(s.params.unit, 'mm');
    assertEqual(s.params.confidence, '95');
  });

  test('constructor sets columnRef and embedded fields to defaults', () => {
    const s = new State();
    assertEqual(s.columnRef, null);
    assertEqual(s.embeddedValues, null);
    assertEqual(s.embeddedLabel, '');
  });
});

suite('Process Capability Model — toJSON', () => {
  test('toJSON returns params, columnRef, embedded fields', () => {
    const s = new State();
    s.params.name = 'Shaft A';
    s.params.lsl = '49.8';
    s.params.usl = '50.2';
    s.params.target = '50';
    s.params.unit = 'cm';
    s.params.confidence = '90';
    s.columnRef = { instanceId: 'i1', sheetId: 's1', columnId: 'c1' };
    const j = s.toJSON();
    assertEqual(j.params.name, 'Shaft A');
    assertEqual(j.params.lsl, '49.8');
    assertEqual(j.params.usl, '50.2');
    assertEqual(j.params.target, '50');
    assertEqual(j.params.unit, 'cm');
    assertEqual(j.params.confidence, '90');
    assertEqual(j.columnRef.instanceId, 'i1');
    assertEqual(j.columnRef.columnId, 'c1');
    assertEqual(j.embeddedValues, null);
    assertEqual(j.embeddedLabel, '');
  });

  test('toJSON columnRef null when unset, embeddedValues copy', () => {
    const s = new State();
    s.embeddedValues = [1, 2, 3];
    s.embeddedLabel = 'Demo';
    const j = s.toJSON();
    assertEqual(j.columnRef, null);
    assertEqual(JSON.stringify(j.embeddedValues), '[1,2,3]');
    assertEqual(j.embeddedLabel, 'Demo');
    // copy, not reference
    j.embeddedValues.push(4);
    assertEqual(s.embeddedValues.length, 3);
  });

  test('toJSON does NOT include derived lastResult', () => {
    const s = new State();
    const j = s.toJSON();
    assertEqual('lastResult' in j, false);
  });
});

suite('Process Capability Model — fromJSON robustness', () => {
  test('fromJSON(null) returns valid default state', () => {
    const s = State.fromJSON(null);
    assertEqual(s.params.unit, 'mm');
    assertEqual(s.params.confidence, '95');
    assertEqual(s.columnRef, null);
    assertEqual(s.embeddedValues, null);
  });

  test('fromJSON(undefined) returns valid default state', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.params.lsl, '');
    assertEqual(s.columnRef, null);
  });

  test('fromJSON coerces legacy numeric lsl/usl/target to strings', () => {
    const s = State.fromJSON({ params: { lsl: 49.8, usl: 50.2, target: 50, name: 'X', unit: 'mm' } });
    assertEqual(s.params.lsl, '49.8');
    assertEqual(s.params.usl, '50.2');
    assertEqual(s.params.target, '50');
    assertEqual(s.params.name, 'X');
  });

  test('fromJSON coerces NaN spec numbers to empty string', () => {
    const s = State.fromJSON({ params: { lsl: NaN, usl: NaN, target: NaN } });
    assertEqual(s.params.lsl, '');
    assertEqual(s.params.usl, '');
    assertEqual(s.params.target, '');
  });

  test('fromJSON coerces legacy fractional confidence to percent string', () => {
    const s = State.fromJSON({ params: { confidence: 0.95 } });
    assertEqual(s.params.confidence, '95');
  });

  test('fromJSON keeps percent confidence as string', () => {
    const s = State.fromJSON({ params: { confidence: 90 } });
    assertEqual(s.params.confidence, '90');
  });

  test('fromJSON missing unit falls back to mm', () => {
    const s = State.fromJSON({ params: {} });
    assertEqual(s.params.unit, 'mm');
  });

  test('fromJSON restores columnRef', () => {
    const s = State.fromJSON({ columnRef: { instanceId: 'i', sheetId: 's', columnId: 'c' } });
    assertEqual(s.columnRef.instanceId, 'i');
    assertEqual(s.columnRef.sheetId, 's');
    assertEqual(s.columnRef.columnId, 'c');
  });

  test('fromJSON malformed columnRef becomes null', () => {
    assertEqual(State.fromJSON({ columnRef: 'nope' }).columnRef, null);
    assertEqual(State.fromJSON({ columnRef: { instanceId: 'i' } }).columnRef, null);
  });

  test('fromJSON restores embedded values (numbers only) and label', () => {
    const s = State.fromJSON({ embeddedValues: [1, 'x', 2, NaN, 3], embeddedLabel: 'Ex' });
    assertEqual(JSON.stringify(s.embeddedValues), '[1,2,3]');
    assertEqual(s.embeddedLabel, 'Ex');
  });

  test('fromJSON non-array embeddedValues becomes null', () => {
    assertEqual(State.fromJSON({ embeddedValues: 'nope' }).embeddedValues, null);
  });

  test('fromJSON ignores legacy lastResult field', () => {
    const s = State.fromJSON({ lastResult: { Cpk: 1.5 }, params: { lsl: '49' } });
    assertEqual(s.params.lsl, '49');
    assertEqual(s.lastResult, undefined);
  });
});

suite('Process Capability Model — round-trip', () => {
  test('toJSON → fromJSON is lossless', () => {
    const s = new State();
    s.params.name = 'Bolt';
    s.params.lsl = '9.8';
    s.params.usl = '10.2';
    s.params.target = '10';
    s.params.unit = 'cm';
    s.params.confidence = '99';
    s.columnRef = { instanceId: 'a', sheetId: 'b', columnId: 'c' };
    s.embeddedValues = [1.1, 2.2];
    s.embeddedLabel = 'Roundtrip';
    const s2 = State.fromJSON(s.toJSON());
    assertEqual(JSON.stringify(s2.toJSON()), JSON.stringify(s.toJSON()));
  });
});

suite('Process Capability Model — hasContent', () => {
  test('empty state has no content', () => {
    assertEqual(new State().hasContent(), false);
  });

  test('columnRef set means content', () => {
    const s = new State();
    s.columnRef = { instanceId: 'i', sheetId: 's', columnId: 'c' };
    assertEqual(s.hasContent(), true);
  });

  test('embedded values set means content', () => {
    const s = new State();
    s.embeddedValues = [1, 2];
    assertEqual(s.hasContent(), true);
  });

  test('feature name set means content', () => {
    const s = new State();
    s.params.name = 'Feature';
    assertEqual(s.hasContent(), true);
  });

  test('lsl set means content', () => {
    const s = new State();
    s.params.lsl = '49.8';
    assertEqual(s.hasContent(), true);
  });

  test('usl set means content', () => {
    const s = new State();
    s.params.usl = '50.2';
    assertEqual(s.hasContent(), true);
  });
});

suite('Process Capability Model — clearEmbedded', () => {
  test('clearEmbedded resets embedded fields', () => {
    const s = new State();
    s.embeddedValues = [1, 2, 3];
    s.embeddedLabel = 'X';
    s.clearEmbedded();
    assertEqual(s.embeddedValues, null);
    assertEqual(s.embeddedLabel, '');
  });
});
