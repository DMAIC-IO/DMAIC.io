/**
 * Unit-Tests for multivariate-control-chart Model.
 * TDD Red phase — model does not exist yet.
 */
import { suite, test, assertEqual } from '../test-utils.js';
import { State } from '../../js/modules/multivariate-control-chart/multivariate-control-chart-model.js';

const ALPHA_DEFAULT = 0.0027;

// ─── Constructor defaults ────────────────────────────────────────────────────

suite('MultivariateControlChart Model — defaults', () => {
  test('constructor: columnRefs is empty array', () => {
    const s = new State();
    assertEqual(Array.isArray(s.columnRefs), true);
    assertEqual(s.columnRefs.length, 0);
  });

  test('constructor: alpha is 0.0027', () => {
    const s = new State();
    assertEqual(s.alpha, ALPHA_DEFAULT);
  });

  test('constructor: baselineCount is null', () => {
    const s = new State();
    assertEqual(s.baselineCount, null);
  });

  test('constructor: exampleWorksheetId is null', () => {
    const s = new State();
    assertEqual(s.exampleWorksheetId, null);
  });
});

// ─── toJSON ─────────────────────────────────────────────────────────────────

suite('MultivariateControlChart Model — toJSON', () => {
  test('toJSON returns expected shape (legacy compat)', () => {
    const s = new State();
    const j = s.toJSON();
    assertEqual('columnRefs' in j, true);
    assertEqual('alpha' in j, true);
    assertEqual('baselineCount' in j, true);
    assertEqual('exampleWorksheetId' in j, true);
  });

  test('toJSON: empty columnRefs', () => {
    const j = new State().toJSON();
    assertEqual(Array.isArray(j.columnRefs), true);
    assertEqual(j.columnRefs.length, 0);
  });

  test('toJSON: alpha default', () => {
    assertEqual(new State().toJSON().alpha, ALPHA_DEFAULT);
  });

  test('toJSON: baselineCount null by default', () => {
    assertEqual(new State().toJSON().baselineCount, null);
  });

  test('toJSON: exampleWorksheetId null by default', () => {
    assertEqual(new State().toJSON().exampleWorksheetId, null);
  });

  test('toJSON serialises columnRefs array', () => {
    const s = new State();
    s.columnRefs = [
      { instanceId: 'i1', sheetId: 's1', columnId: 'c1' },
      { instanceId: 'i2', sheetId: 's1', columnId: 'c2' },
    ];
    const j = s.toJSON();
    assertEqual(j.columnRefs.length, 2);
    assertEqual(j.columnRefs[0].columnId, 'c1');
    assertEqual(j.columnRefs[1].columnId, 'c2');
  });

  test('toJSON serialises alpha', () => {
    const s = new State();
    s.alpha = 0.05;
    assertEqual(s.toJSON().alpha, 0.05);
  });

  test('toJSON serialises baselineCount', () => {
    const s = new State();
    s.baselineCount = 25;
    assertEqual(s.toJSON().baselineCount, 25);
  });

  test('toJSON serialises exampleWorksheetId', () => {
    const s = new State();
    s.exampleWorksheetId = 'ws-99';
    assertEqual(s.toJSON().exampleWorksheetId, 'ws-99');
  });
});

// ─── fromJSON ───────────────────────────────────────────────────────────────

suite('MultivariateControlChart Model — fromJSON robustness', () => {
  test('fromJSON(null) returns valid default state', () => {
    const s = State.fromJSON(null);
    assertEqual(s.alpha, ALPHA_DEFAULT);
    assertEqual(s.baselineCount, null);
    assertEqual(Array.isArray(s.columnRefs), true);
    assertEqual(s.columnRefs.length, 0);
  });

  test('fromJSON(undefined) returns valid default state', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.alpha, ALPHA_DEFAULT);
    assertEqual(s.columnRefs.length, 0);
  });

  test('fromJSON({}) returns valid default state', () => {
    const s = State.fromJSON({});
    assertEqual(s.alpha, ALPHA_DEFAULT);
    assertEqual(s.baselineCount, null);
  });

  test('fromJSON restores columnRefs', () => {
    const s = State.fromJSON({
      columnRefs: [{ instanceId: 'i', sheetId: 's', columnId: 'c' }],
    });
    assertEqual(s.columnRefs.length, 1);
    assertEqual(s.columnRefs[0].instanceId, 'i');
    assertEqual(s.columnRefs[0].sheetId, 's');
    assertEqual(s.columnRefs[0].columnId, 'c');
  });

  test('fromJSON: non-array columnRefs becomes empty array', () => {
    const s = State.fromJSON({ columnRefs: 'bad' });
    assertEqual(Array.isArray(s.columnRefs), true);
    assertEqual(s.columnRefs.length, 0);
  });

  test('fromJSON restores alpha', () => {
    const s = State.fromJSON({ alpha: 0.05 });
    assertEqual(s.alpha, 0.05);
  });

  test('fromJSON: invalid alpha (<=0) falls back to default', () => {
    const s = State.fromJSON({ alpha: -1 });
    assertEqual(s.alpha, ALPHA_DEFAULT);
  });

  test('fromJSON: invalid alpha (>=1) falls back to default', () => {
    const s = State.fromJSON({ alpha: 1.5 });
    assertEqual(s.alpha, ALPHA_DEFAULT);
  });

  test('fromJSON: non-finite alpha falls back to default', () => {
    const s = State.fromJSON({ alpha: NaN });
    assertEqual(s.alpha, ALPHA_DEFAULT);
  });

  test('fromJSON: alpha 0 falls back to default', () => {
    const s = State.fromJSON({ alpha: 0 });
    assertEqual(s.alpha, ALPHA_DEFAULT);
  });

  test('fromJSON restores baselineCount', () => {
    const s = State.fromJSON({ baselineCount: 20 });
    assertEqual(s.baselineCount, 20);
  });

  test('fromJSON: null baselineCount stays null', () => {
    const s = State.fromJSON({ baselineCount: null });
    assertEqual(s.baselineCount, null);
  });

  test('fromJSON: missing baselineCount becomes null', () => {
    const s = State.fromJSON({});
    assertEqual(s.baselineCount, null);
  });

  test('fromJSON: non-integer baselineCount becomes null', () => {
    const s = State.fromJSON({ baselineCount: 'bad' });
    assertEqual(s.baselineCount, null);
  });

  test('fromJSON restores exampleWorksheetId', () => {
    const s = State.fromJSON({ exampleWorksheetId: 'ws-42' });
    assertEqual(s.exampleWorksheetId, 'ws-42');
  });

  test('fromJSON: missing exampleWorksheetId becomes null', () => {
    const s = State.fromJSON({});
    assertEqual(s.exampleWorksheetId, null);
  });

  test('fromJSON: legacy state without exampleWorksheetId becomes null', () => {
    const s = State.fromJSON({ columnRefs: [], alpha: 0.0027, baselineCount: null });
    assertEqual(s.exampleWorksheetId, null);
  });
});

// ─── Round-trip ─────────────────────────────────────────────────────────────

suite('MultivariateControlChart Model — round-trip', () => {
  test('toJSON → fromJSON is lossless', () => {
    const s = new State();
    s.columnRefs = [
      { instanceId: 'i1', sheetId: 's1', columnId: 'c1' },
      { instanceId: 'i2', sheetId: 's1', columnId: 'c2' },
    ];
    s.alpha = 0.05;
    s.baselineCount = 30;
    s.exampleWorksheetId = 'ws-1';
    const s2 = State.fromJSON(s.toJSON());
    assertEqual(JSON.stringify(s2.toJSON()), JSON.stringify(s.toJSON()));
  });

  test('round-trip preserves null baselineCount', () => {
    const s = new State();
    s.alpha = 0.01;
    s.baselineCount = null;
    const s2 = State.fromJSON(s.toJSON());
    assertEqual(s2.baselineCount, null);
    assertEqual(s2.alpha, 0.01);
  });
});

// ─── hasContent ─────────────────────────────────────────────────────────────

suite('MultivariateControlChart Model — hasContent', () => {
  test('empty state has no content', () => {
    assertEqual(new State().hasContent(), false);
  });

  test('with one columnRef has content', () => {
    const s = new State();
    s.columnRefs = [{ instanceId: 'i', sheetId: 's', columnId: 'c' }];
    assertEqual(s.hasContent(), true);
  });

  test('empty columnRefs array has no content', () => {
    const s = new State();
    s.columnRefs = [];
    assertEqual(s.hasContent(), false);
  });

  test('non-default alpha alone is not considered content', () => {
    const s = new State();
    s.alpha = 0.05;
    assertEqual(s.hasContent(), false);
  });

  test('non-null baselineCount alone is not considered content', () => {
    const s = new State();
    s.baselineCount = 20;
    assertEqual(s.hasContent(), false);
  });

  test('both columnRefs and baselineCount has content', () => {
    const s = new State();
    s.columnRefs = [{ instanceId: 'i', sheetId: 's', columnId: 'c' }];
    s.baselineCount = 25;
    assertEqual(s.hasContent(), true);
  });
});
