import { suite, test, assertEqual } from '../test-utils.js';
import { State } from '../../js/modules/hypothesis-test/hypothesis-test-model.js';

suite('Hypothesis Test Model — State defaults', () => {
  test('constructor sets default values', () => {
    const s = new State();
    assertEqual(s.category, 'variance');
    assertEqual(s.testType, 'one');
    assertEqual(s.direction, 'two-sided');
    assertEqual(s.targetValue, '');
    assertEqual(s.targetType, 'variance');
    assertEqual(s.colRef1, null);
    assertEqual(s.colRef2, null);
    assertEqual(Array.isArray(s.colRefsK), true);
    assertEqual(s.colRefsK.length, 0);
    assertEqual(s.exampleWorksheetId, null);
    // alpha / powerGoal default to null until seeded from global settings
    assertEqual(s.alpha, null);
    assertEqual(s.powerGoal, null);
  });
});

suite('Hypothesis Test Model — toJSON / fromJSON', () => {
  test('toJSON returns the legacy getState shape', () => {
    const s = new State();
    s.category = 'mean';
    s.testType = 'two';
    s.direction = 'greater';
    s.alpha = 0.05;
    s.powerGoal = 0.8;
    s.targetValue = '5';
    s.targetType = 'stddev';
    s.colRef1 = { instanceId: 'w1', sheetId: 's1', columnId: 'c1' };
    s.colRef2 = { instanceId: 'w1', sheetId: 's1', columnId: 'c2' };
    s.colRefsK = [];
    s.exampleWorksheetId = 'w1';
    const j = s.toJSON();
    assertEqual(j.category, 'mean');
    assertEqual(j.testType, 'two');
    assertEqual(j.direction, 'greater');
    assertEqual(j.alpha, 0.05);
    assertEqual(j.powerGoal, 0.8);
    assertEqual(j.targetValue, '5');
    assertEqual(j.targetType, 'stddev');
    assertEqual(j.colRef1.columnId, 'c1');
    assertEqual(j.colRef2.columnId, 'c2');
    assertEqual(Array.isArray(j.colRefsK), true);
    assertEqual(j.exampleWorksheetId, 'w1');
    // exact key set (legacy getState parity)
    assertEqual(
      Object.keys(j).sort().join(','),
      ['alpha', 'category', 'colRef1', 'colRef2', 'colRefsK', 'direction', 'exampleWorksheetId', 'powerGoal', 'targetType', 'targetValue', 'testType'].sort().join(',')
    );
  });

  test('fromJSON(null) yields a valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s.category, 'variance');
    assertEqual(s.testType, 'one');
    assertEqual(s.colRefsK.length, 0);
    assertEqual(s.exampleWorksheetId, null);
  });

  test('fromJSON(undefined) yields a valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.category, 'variance');
    assertEqual(s.direction, 'two-sided');
  });

  test('fromJSON({}) yields a valid default', () => {
    const s = State.fromJSON({});
    assertEqual(s.category, 'variance');
    assertEqual(s.testType, 'one');
    assertEqual(s.targetType, 'variance');
  });

  test('fromJSON restores all fields', () => {
    const data = {
      category: 'mean', testType: 'k', direction: 'less',
      alpha: 0.01, powerGoal: 0.9, targetValue: '12', targetType: 'stddev',
      colRef1: { instanceId: 'a', sheetId: 'b', columnId: 'c' },
      colRef2: null,
      colRefsK: [{ instanceId: 'a', sheetId: 'b', columnId: 'd' }],
      exampleWorksheetId: 'a',
    };
    const s = State.fromJSON(data);
    assertEqual(s.category, 'mean');
    assertEqual(s.testType, 'k');
    assertEqual(s.direction, 'less');
    assertEqual(s.alpha, 0.01);
    assertEqual(s.powerGoal, 0.9);
    assertEqual(s.targetValue, '12');
    assertEqual(s.targetType, 'stddev');
    assertEqual(s.colRef1.columnId, 'c');
    assertEqual(s.colRef2, null);
    assertEqual(s.colRefsK.length, 1);
    assertEqual(s.colRefsK[0].columnId, 'd');
    assertEqual(s.exampleWorksheetId, 'a');
  });

  test('toJSON → fromJSON round-trip is lossless', () => {
    const a = new State();
    a.category = 'mean';
    a.testType = 'two';
    a.direction = 'greater';
    a.alpha = 0.02;
    a.powerGoal = 0.85;
    a.targetValue = '7';
    a.targetType = 'variance';
    a.colRef1 = { instanceId: 'w', sheetId: 's', columnId: 'c1' };
    a.colRef2 = { instanceId: 'w', sheetId: 's', columnId: 'c2' };
    a.colRefsK = [{ instanceId: 'w', sheetId: 's', columnId: 'c3' }];
    a.exampleWorksheetId = 'w';
    const b = State.fromJSON(a.toJSON());
    assertEqual(JSON.stringify(b.toJSON()), JSON.stringify(a.toJSON()));
  });

  test('fromJSON sanitizes a non-array colRefsK to []', () => {
    const s = State.fromJSON({ colRefsK: 'oops' });
    assertEqual(Array.isArray(s.colRefsK), true);
    assertEqual(s.colRefsK.length, 0);
  });

  test('fromJSON keeps colRef1/colRef2 null when absent', () => {
    const s = State.fromJSON({ category: 'mean' });
    assertEqual(s.colRef1, null);
    assertEqual(s.colRef2, null);
  });
});

suite('Hypothesis Test Model — hasContent', () => {
  test('false by default', () => {
    assertEqual(new State().hasContent(), false);
  });
  test('true when colRef1 set', () => {
    const s = new State();
    s.colRef1 = { instanceId: 'a', columnId: 'c' };
    assertEqual(s.hasContent(), true);
  });
  test('true when colRef2 set', () => {
    const s = new State();
    s.colRef2 = { instanceId: 'a', columnId: 'c' };
    assertEqual(s.hasContent(), true);
  });
  test('true when colRefsK non-empty', () => {
    const s = new State();
    s.colRefsK = [{ instanceId: 'a', columnId: 'c' }];
    assertEqual(s.hasContent(), true);
  });
  test('false when colRefsK empty array', () => {
    const s = new State();
    s.colRefsK = [];
    assertEqual(s.hasContent(), false);
  });
});

suite('Hypothesis Test Model — resolveTarget', () => {
  test('variance target type returns value unchanged when valid', () => {
    const s = new State();
    s.category = 'variance';
    s.targetType = 'variance';
    s.targetValue = '0.05';
    assertEqual(s.resolveTarget(), 0.05);
  });

  test('stddev target type squares the value for variance', () => {
    const s = new State();
    s.category = 'variance';
    s.targetType = 'stddev';
    s.targetValue = '0.2';
    // 0.2^2 = 0.04
    assertEqual(Math.abs(s.resolveTarget() - 0.04) < 1e-12, true);
  });

  test('variance target <= 0 is invalid (null)', () => {
    const s = new State();
    s.category = 'variance';
    s.targetValue = '0';
    assertEqual(s.resolveTarget(), null);
  });

  test('variance target NaN is invalid (null)', () => {
    const s = new State();
    s.category = 'variance';
    s.targetValue = '';
    assertEqual(s.resolveTarget(), null);
  });

  test('mean target accepts any finite number incl. negative', () => {
    const s = new State();
    s.category = 'mean';
    s.targetValue = '-3.5';
    assertEqual(s.resolveTarget(), -3.5);
  });

  test('mean target zero is valid', () => {
    const s = new State();
    s.category = 'mean';
    s.targetValue = '0';
    assertEqual(s.resolveTarget(), 0);
  });

  test('mean target NaN is invalid (null)', () => {
    const s = new State();
    s.category = 'mean';
    s.targetValue = 'abc';
    assertEqual(s.resolveTarget(), null);
  });
});

suite('Hypothesis Test Model — setPowerGoal clamp', () => {
  test('clamps below 0.5 to 0.5', () => {
    const s = new State();
    s.setPowerGoal(0.1);
    assertEqual(s.powerGoal, 0.5);
  });
  test('clamps above 0.99 to 0.99', () => {
    const s = new State();
    s.setPowerGoal(1.5);
    assertEqual(s.powerGoal, 0.99);
  });
  test('keeps a valid value', () => {
    const s = new State();
    s.setPowerGoal(0.8);
    assertEqual(s.powerGoal, 0.8);
  });
  test('ignores non-numeric, keeps previous', () => {
    const s = new State();
    s.powerGoal = 0.8;
    s.setPowerGoal(NaN);
    assertEqual(s.powerGoal, 0.8);
  });
});
