import { suite, test, assertEqual } from '../test-utils.js';
import { State } from '../../js/modules/msa-typ1/msa-typ1-model.js';

suite('MSA Typ 1 Model — State defaults', () => {
  test('constructor sets default params', () => {
    const s = new State();
    assertEqual(s.params.name, '');
    assertEqual(s.params.ref, '');
    assertEqual(s.params.unit, 'mm');
    assertEqual(s.params.lsl, '');
    assertEqual(s.params.usl, '');
    assertEqual(s.params.k1, '0.2');
    assertEqual(s.params.k2, '4');
  });

  test('constructor sets columnRef and exampleWorksheetId to null', () => {
    const s = new State();
    assertEqual(s.columnRef, null);
    assertEqual(s.exampleWorksheetId, null);
  });
});

suite('MSA Typ 1 Model — toJSON', () => {
  test('toJSON returns params, columnRef, exampleWorksheetId', () => {
    const s = new State();
    s.params.name = 'Shaft A';
    s.params.ref = '50';
    s.params.lsl = '49.95';
    s.params.usl = '50.05';
    s.columnRef = { instanceId: 'i1', sheetId: 's1', columnId: 'c1' };
    s.exampleWorksheetId = 'ws-1';
    const j = s.toJSON();
    assertEqual(j.params.name, 'Shaft A');
    assertEqual(j.params.ref, '50');
    assertEqual(j.params.lsl, '49.95');
    assertEqual(j.params.usl, '50.05');
    assertEqual(j.params.unit, 'mm');
    assertEqual(j.params.k1, '0.2');
    assertEqual(j.params.k2, '4');
    assertEqual(j.columnRef.instanceId, 'i1');
    assertEqual(j.columnRef.columnId, 'c1');
    assertEqual(j.exampleWorksheetId, 'ws-1');
  });

  test('toJSON columnRef is null when unset', () => {
    const j = new State().toJSON();
    assertEqual(j.columnRef, null);
    assertEqual(j.exampleWorksheetId, null);
  });
});

suite('MSA Typ 1 Model — fromJSON robustness', () => {
  test('fromJSON(null) returns valid default state', () => {
    const s = State.fromJSON(null);
    assertEqual(s.params.unit, 'mm');
    assertEqual(s.params.k1, '0.2');
    assertEqual(s.params.k2, '4');
    assertEqual(s.columnRef, null);
  });

  test('fromJSON(undefined) returns valid default state', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.params.ref, '');
    assertEqual(s.columnRef, null);
  });

  test('fromJSON coerces numeric ref/lsl/usl to strings (legacy persistence)', () => {
    const s = State.fromJSON({ params: { ref: 10, lsl: 9.9, usl: 10.1, k1: 0.2, k2: 4, unit: 'mm', name: 'X' } });
    assertEqual(s.params.ref, '10');
    assertEqual(s.params.lsl, '9.9');
    assertEqual(s.params.usl, '10.1');
    assertEqual(s.params.k1, '0.2');
    assertEqual(s.params.k2, '4');
    assertEqual(s.params.name, 'X');
  });

  test('fromJSON coerces NaN ref to empty string', () => {
    const s = State.fromJSON({ params: { ref: NaN, lsl: NaN, usl: NaN } });
    assertEqual(s.params.ref, '');
    assertEqual(s.params.lsl, '');
    assertEqual(s.params.usl, '');
  });

  test('fromJSON sanitises invalid k1/k2 to defaults', () => {
    const s = State.fromJSON({ params: { k1: '0.99', k2: '7' } });
    assertEqual(s.params.k1, '0.2');
    assertEqual(s.params.k2, '4');
  });

  test('fromJSON keeps valid alternate k1/k2 options', () => {
    const s = State.fromJSON({ params: { k1: '0.1', k2: '6' } });
    assertEqual(s.params.k1, '0.1');
    assertEqual(s.params.k2, '6');
  });

  test('fromJSON missing unit falls back to mm', () => {
    const s = State.fromJSON({ params: {} });
    assertEqual(s.params.unit, 'mm');
  });

  test('fromJSON restores columnRef and exampleWorksheetId', () => {
    const s = State.fromJSON({
      columnRef: { instanceId: 'i', sheetId: 's', columnId: 'c' },
      exampleWorksheetId: 'ws',
    });
    assertEqual(s.columnRef.instanceId, 'i');
    assertEqual(s.columnRef.sheetId, 's');
    assertEqual(s.columnRef.columnId, 'c');
    assertEqual(s.exampleWorksheetId, 'ws');
  });

  test('fromJSON malformed columnRef becomes null', () => {
    const s = State.fromJSON({ columnRef: 'not-an-object' });
    assertEqual(s.columnRef, null);
  });

  test('fromJSON ignores legacy lastResult field (not persisted)', () => {
    const s = State.fromJSON({ lastResult: { Cg: 1.5 }, params: { ref: '5' } });
    assertEqual(s.params.ref, '5');
    assertEqual(s.result, undefined);
  });
});

suite('MSA Typ 1 Model — round-trip', () => {
  test('toJSON → fromJSON is lossless', () => {
    const s = new State();
    s.params.name = 'Bolt';
    s.params.ref = '10';
    s.params.unit = 'cm';
    s.params.lsl = '9.9';
    s.params.usl = '10.1';
    s.params.k1 = '0.15';
    s.params.k2 = '3';
    s.columnRef = { instanceId: 'a', sheetId: 'b', columnId: 'c' };
    s.exampleWorksheetId = 'ws-9';
    const s2 = State.fromJSON(s.toJSON());
    assertEqual(JSON.stringify(s2.toJSON()), JSON.stringify(s.toJSON()));
  });
});

suite('MSA Typ 1 Model — hasContent', () => {
  test('empty state has no content', () => {
    assertEqual(new State().hasContent(), false);
  });

  test('columnRef set means content', () => {
    const s = new State();
    s.columnRef = { instanceId: 'i', sheetId: 's', columnId: 'c' };
    assertEqual(s.hasContent(), true);
  });

  test('feature name set means content', () => {
    const s = new State();
    s.params.name = 'Feature';
    assertEqual(s.hasContent(), true);
  });

  test('ref value set means content', () => {
    const s = new State();
    s.params.ref = '50';
    assertEqual(s.hasContent(), true);
  });

  test('lsl/usl set means content', () => {
    const s = new State();
    s.params.usl = '50.05';
    assertEqual(s.hasContent(), true);
  });
});
