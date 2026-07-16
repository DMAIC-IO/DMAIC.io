import { suite, test, assertEqual } from '../test-utils.js';
import { State } from '../../js/modules/msa-typ2/msa-typ2-model.js';

suite('MSA Typ 2 Model — State defaults', () => {
  test('constructor sets default params', () => {
    const s = new State();
    assertEqual(s.params.lsl, '');
    assertEqual(s.params.usl, '');
    assertEqual(s.params.alpha, '');
    assertEqual(s.params.k, '5.15');
  });

  test('constructor sets columnRefs to nulls', () => {
    const s = new State();
    assertEqual(s.columnRefs.part, null);
    assertEqual(s.columnRefs.operator, null);
    assertEqual(s.columnRefs.measurement, null);
  });

  test('constructor sets exampleWorksheetId to null', () => {
    assertEqual(new State().exampleWorksheetId, null);
  });
});

suite('MSA Typ 2 Model — toJSON', () => {
  test('toJSON returns params, columnRefs, exampleWorksheetId', () => {
    const s = new State();
    s.params.lsl = '24.9';
    s.params.usl = '25.1';
    s.params.alpha = '0.05';
    s.params.k = '6';
    s.columnRefs.part = { instanceId: 'i1', sheetId: 's1', columnId: 'c1' };
    s.columnRefs.operator = { instanceId: 'i1', sheetId: 's1', columnId: 'c2' };
    s.columnRefs.measurement = { instanceId: 'i1', sheetId: 's1', columnId: 'c3' };
    s.exampleWorksheetId = 'ws-1';
    const j = s.toJSON();
    assertEqual(j.params.lsl, '24.9');
    assertEqual(j.params.usl, '25.1');
    assertEqual(j.params.alpha, '0.05');
    assertEqual(j.params.k, '6');
    assertEqual(j.columnRefs.part.columnId, 'c1');
    assertEqual(j.columnRefs.operator.columnId, 'c2');
    assertEqual(j.columnRefs.measurement.columnId, 'c3');
    assertEqual(j.exampleWorksheetId, 'ws-1');
  });

  test('toJSON columnRefs are null when unset', () => {
    const j = new State().toJSON();
    assertEqual(j.columnRefs.part, null);
    assertEqual(j.columnRefs.operator, null);
    assertEqual(j.columnRefs.measurement, null);
    assertEqual(j.exampleWorksheetId, null);
  });

  test('toJSON does not persist a result/lastResult field', () => {
    const j = new State().toJSON();
    assertEqual('lastResult' in j, false);
    assertEqual('result' in j, false);
  });
});

suite('MSA Typ 2 Model — fromJSON robustness', () => {
  test('fromJSON(null) returns valid default state', () => {
    const s = State.fromJSON(null);
    assertEqual(s.params.k, '5.15');
    assertEqual(s.params.lsl, '');
    assertEqual(s.columnRefs.part, null);
  });

  test('fromJSON(undefined) returns valid default state', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.params.k, '5.15');
    assertEqual(s.columnRefs.measurement, null);
  });

  test('fromJSON("string") returns valid default state', () => {
    const s = State.fromJSON('not-an-object');
    assertEqual(s.params.k, '5.15');
    assertEqual(s.columnRefs.part, null);
  });

  test('fromJSON coerces legacy numeric lsl/usl/alpha to strings', () => {
    const s = State.fromJSON({ params: { lsl: 24.9, usl: 25.1, alpha: 0.05, studyVarMultiplier: 6 } });
    assertEqual(s.params.lsl, '24.9');
    assertEqual(s.params.usl, '25.1');
    assertEqual(s.params.alpha, '0.05');
    assertEqual(s.params.k, '6');
  });

  test('fromJSON coerces NaN lsl/usl to empty string', () => {
    const s = State.fromJSON({ params: { lsl: NaN, usl: NaN } });
    assertEqual(s.params.lsl, '');
    assertEqual(s.params.usl, '');
  });

  test('fromJSON reads k from params.k when present', () => {
    const s = State.fromJSON({ params: { k: '6' } });
    assertEqual(s.params.k, '6');
  });

  test('fromJSON sanitises invalid k to default 5.15', () => {
    const s = State.fromJSON({ params: { k: '7' } });
    assertEqual(s.params.k, '5.15');
  });

  test('fromJSON keeps alternate valid k option', () => {
    const s = State.fromJSON({ params: { studyVarMultiplier: 6 } });
    assertEqual(s.params.k, '6');
  });

  test('fromJSON restores columnRefs', () => {
    const s = State.fromJSON({
      columnRefs: {
        part: { instanceId: 'i', sheetId: 's', columnId: 'cp' },
        operator: { instanceId: 'i', sheetId: 's', columnId: 'co' },
        measurement: { instanceId: 'i', sheetId: 's', columnId: 'cm' },
      },
    });
    assertEqual(s.columnRefs.part.columnId, 'cp');
    assertEqual(s.columnRefs.operator.columnId, 'co');
    assertEqual(s.columnRefs.measurement.columnId, 'cm');
  });

  test('fromJSON malformed columnRef becomes null', () => {
    const s = State.fromJSON({ columnRefs: { part: 'x', operator: { instanceId: 'i' }, measurement: null } });
    assertEqual(s.columnRefs.part, null);
    assertEqual(s.columnRefs.operator, null);
    assertEqual(s.columnRefs.measurement, null);
  });

  test('fromJSON restores exampleWorksheetId', () => {
    const s = State.fromJSON({ exampleWorksheetId: 'ws-9' });
    assertEqual(s.exampleWorksheetId, 'ws-9');
  });

  test('fromJSON ignores legacy lastResult field', () => {
    const s = State.fromJSON({ lastResult: { grrStatus: 'pass' }, params: { lsl: '5' } });
    assertEqual(s.params.lsl, '5');
    assertEqual(s.result, undefined);
    assertEqual(s.lastResult, undefined);
  });
});

suite('MSA Typ 2 Model — round-trip', () => {
  test('toJSON → fromJSON is lossless', () => {
    const s = new State();
    s.params.lsl = '5';
    s.params.usl = '35';
    s.params.alpha = '0.01';
    s.params.k = '6';
    s.columnRefs.part = { instanceId: 'a', sheetId: 'b', columnId: 'c' };
    s.columnRefs.operator = { instanceId: 'a', sheetId: 'b', columnId: 'd' };
    s.columnRefs.measurement = { instanceId: 'a', sheetId: 'b', columnId: 'e' };
    s.exampleWorksheetId = 'ws-9';
    const s2 = State.fromJSON(s.toJSON());
    assertEqual(JSON.stringify(s2.toJSON()), JSON.stringify(s.toJSON()));
  });
});

suite('MSA Typ 2 Model — hasContent', () => {
  test('empty state has no content', () => {
    assertEqual(new State().hasContent(), false);
  });

  test('part columnRef set means content', () => {
    const s = new State();
    s.columnRefs.part = { instanceId: 'i', sheetId: 's', columnId: 'c' };
    assertEqual(s.hasContent(), true);
  });

  test('operator columnRef set means content', () => {
    const s = new State();
    s.columnRefs.operator = { instanceId: 'i', sheetId: 's', columnId: 'c' };
    assertEqual(s.hasContent(), true);
  });

  test('measurement columnRef set means content', () => {
    const s = new State();
    s.columnRefs.measurement = { instanceId: 'i', sheetId: 's', columnId: 'c' };
    assertEqual(s.hasContent(), true);
  });

  test('lsl set means content', () => {
    const s = new State();
    s.params.lsl = '24.9';
    assertEqual(s.hasContent(), true);
  });

  test('usl set means content', () => {
    const s = new State();
    s.params.usl = '25.1';
    assertEqual(s.hasContent(), true);
  });
});
