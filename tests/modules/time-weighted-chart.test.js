/**
 * Unit-Tests for time-weighted-chart Model.
 * TDD Red phase — model does not exist yet.
 *
 * The Model holds the EWMA/CUSUM configuration: chart type, column reference,
 * sigma method, baseline count, target/sigma overrides, and the EWMA (λ/L) and
 * CUSUM (k/h) parameters. Pure state + sanitisation; EWMA/CUSUM math lives in
 * the engine.
 */
import { suite, test, assertEqual } from '../test-utils.js';
import { State } from '../../js/modules/time-weighted-chart/time-weighted-chart-model.js';

// ─── Constructor defaults ────────────────────────────────────────────────────

suite('TimeWeightedChart Model — defaults', () => {
  test('constructor: chartTypeId is ewma', () => {
    assertEqual(new State().chartTypeId, 'ewma');
  });
  test('constructor: columnRef is null', () => {
    assertEqual(new State().columnRef, null);
  });
  test('constructor: sigmaMethod is mr', () => {
    assertEqual(new State().sigmaMethod, 'mr');
  });
  test('constructor: baselineCount is null', () => {
    assertEqual(new State().baselineCount, null);
  });
  test('constructor: targetOverride is null', () => {
    assertEqual(new State().targetOverride, null);
  });
  test('constructor: sigmaOverride is null', () => {
    assertEqual(new State().sigmaOverride, null);
  });
  test('constructor: lambda is 0.2', () => {
    assertEqual(new State().lambda, 0.2);
  });
  test('constructor: L is 3', () => {
    assertEqual(new State().L, 3);
  });
  test('constructor: kSigma is 0.5', () => {
    assertEqual(new State().kSigma, 0.5);
  });
  test('constructor: hSigma is 4', () => {
    assertEqual(new State().hSigma, 4);
  });
  test('constructor: exampleWorksheetId is null', () => {
    assertEqual(new State().exampleWorksheetId, null);
  });
});

// ─── toJSON shape (legacy getState() parity) ─────────────────────────────────

suite('TimeWeightedChart Model — toJSON shape', () => {
  test('toJSON contains all legacy fields', () => {
    const j = new State().toJSON();
    for (const k of ['chartTypeId', 'columnRef', 'sigmaMethod', 'baselineCount',
      'targetOverride', 'sigmaOverride', 'lambda', 'L', 'kSigma', 'hSigma']) {
      assertEqual(k in j, true);
    }
  });

  test('toJSON defaults match legacy getState defaults', () => {
    const j = new State().toJSON();
    assertEqual(j.chartTypeId, 'ewma');
    assertEqual(j.columnRef, null);
    assertEqual(j.sigmaMethod, 'mr');
    assertEqual(j.baselineCount, null);
    assertEqual(j.targetOverride, null);
    assertEqual(j.sigmaOverride, null);
    assertEqual(j.lambda, 0.2);
    assertEqual(j.L, 3);
    assertEqual(j.kSigma, 0.5);
    assertEqual(j.hSigma, 4);
  });

  test('toJSON: exampleWorksheetId is additive and null by default', () => {
    assertEqual(new State().toJSON().exampleWorksheetId, null);
  });

  test('toJSON serialises columnRef as a copy', () => {
    const s = new State();
    s.columnRef = { instanceId: 'i1', sheetId: 's1', columnId: 'c1' };
    const j = s.toJSON();
    assertEqual(j.columnRef.instanceId, 'i1');
    assertEqual(j.columnRef.sheetId, 's1');
    assertEqual(j.columnRef.columnId, 'c1');
  });

  test('toJSON serialises all set values', () => {
    const s = new State();
    s.chartTypeId = 'cusum';
    s.sigmaMethod = 'sd';
    s.baselineCount = 12;
    s.targetOverride = 5;
    s.sigmaOverride = 1.5;
    s.lambda = 0.1;
    s.L = 2.7;
    s.kSigma = 0.3;
    s.hSigma = 5;
    const j = s.toJSON();
    assertEqual(j.chartTypeId, 'cusum');
    assertEqual(j.sigmaMethod, 'sd');
    assertEqual(j.baselineCount, 12);
    assertEqual(j.targetOverride, 5);
    assertEqual(j.sigmaOverride, 1.5);
    assertEqual(j.lambda, 0.1);
    assertEqual(j.L, 2.7);
    assertEqual(j.kSigma, 0.3);
    assertEqual(j.hSigma, 5);
  });
});

// ─── fromJSON robustness ─────────────────────────────────────────────────────

suite('TimeWeightedChart Model — fromJSON robustness', () => {
  test('fromJSON(null) returns valid default state', () => {
    const s = State.fromJSON(null);
    assertEqual(s.chartTypeId, 'ewma');
    assertEqual(s.columnRef, null);
    assertEqual(s.sigmaMethod, 'mr');
    assertEqual(s.lambda, 0.2);
    assertEqual(s.L, 3);
    assertEqual(s.kSigma, 0.5);
    assertEqual(s.hSigma, 4);
  });

  test('fromJSON(undefined) returns valid default state', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.chartTypeId, 'ewma');
    assertEqual(s.columnRef, null);
  });

  test('fromJSON({}) returns valid default state', () => {
    const s = State.fromJSON({});
    assertEqual(s.chartTypeId, 'ewma');
    assertEqual(s.sigmaMethod, 'mr');
    assertEqual(s.baselineCount, null);
    assertEqual(s.exampleWorksheetId, null);
  });

  test('fromJSON: invalid chartTypeId defaults to ewma', () => {
    assertEqual(State.fromJSON({ chartTypeId: 'bogus' }).chartTypeId, 'ewma');
  });

  test('fromJSON: cusum chartTypeId preserved', () => {
    assertEqual(State.fromJSON({ chartTypeId: 'cusum' }).chartTypeId, 'cusum');
  });

  test('fromJSON: invalid sigmaMethod defaults to mr', () => {
    assertEqual(State.fromJSON({ sigmaMethod: 'xyz' }).sigmaMethod, 'mr');
  });

  test('fromJSON: sd sigmaMethod preserved', () => {
    assertEqual(State.fromJSON({ sigmaMethod: 'sd' }).sigmaMethod, 'sd');
  });

  test('fromJSON restores columnRef', () => {
    const s = State.fromJSON({ columnRef: { instanceId: 'i', sheetId: 's', columnId: 'c' } });
    assertEqual(s.columnRef.instanceId, 'i');
    assertEqual(s.columnRef.sheetId, 's');
    assertEqual(s.columnRef.columnId, 'c');
  });

  test('fromJSON: invalid columnRef (non-object) becomes null', () => {
    assertEqual(State.fromJSON({ columnRef: 'bad' }).columnRef, null);
  });

  test('fromJSON: incomplete columnRef becomes null', () => {
    assertEqual(State.fromJSON({ columnRef: { instanceId: 'i' } }).columnRef, null);
  });

  // baselineCount: positive int or null
  test('fromJSON restores baselineCount', () => {
    assertEqual(State.fromJSON({ baselineCount: 10 }).baselineCount, 10);
  });
  test('fromJSON: null baselineCount stays null', () => {
    assertEqual(State.fromJSON({ baselineCount: null }).baselineCount, null);
  });
  test('fromJSON: non-finite baselineCount becomes null', () => {
    assertEqual(State.fromJSON({ baselineCount: 'abc' }).baselineCount, null);
  });

  // targetOverride: finite or null
  test('fromJSON restores targetOverride', () => {
    assertEqual(State.fromJSON({ targetOverride: 5 }).targetOverride, 5);
  });
  test('fromJSON: targetOverride zero preserved', () => {
    assertEqual(State.fromJSON({ targetOverride: 0 }).targetOverride, 0);
  });
  test('fromJSON: non-finite targetOverride becomes null', () => {
    assertEqual(State.fromJSON({ targetOverride: NaN }).targetOverride, null);
  });

  // sigmaOverride: finite ≥0 or null
  test('fromJSON restores sigmaOverride', () => {
    assertEqual(State.fromJSON({ sigmaOverride: 1.5 }).sigmaOverride, 1.5);
  });
  test('fromJSON: negative sigmaOverride becomes null', () => {
    assertEqual(State.fromJSON({ sigmaOverride: -2 }).sigmaOverride, null);
  });
  test('fromJSON: non-finite sigmaOverride becomes null', () => {
    assertEqual(State.fromJSON({ sigmaOverride: 'x' }).sigmaOverride, null);
  });

  // lambda: >0 and ≤1, else default 0.2
  test('fromJSON restores valid lambda', () => {
    assertEqual(State.fromJSON({ lambda: 0.1 }).lambda, 0.1);
  });
  test('fromJSON: lambda > 1 defaults to 0.2', () => {
    assertEqual(State.fromJSON({ lambda: 1.5 }).lambda, 0.2);
  });
  test('fromJSON: lambda <= 0 defaults to 0.2', () => {
    assertEqual(State.fromJSON({ lambda: 0 }).lambda, 0.2);
  });
  test('fromJSON: non-finite lambda defaults to 0.2', () => {
    assertEqual(State.fromJSON({ lambda: 'x' }).lambda, 0.2);
  });

  // L: >0 else default 3
  test('fromJSON restores valid L', () => {
    assertEqual(State.fromJSON({ L: 2.7 }).L, 2.7);
  });
  test('fromJSON: L <= 0 defaults to 3', () => {
    assertEqual(State.fromJSON({ L: -1 }).L, 3);
  });
  test('fromJSON: non-finite L defaults to 3', () => {
    assertEqual(State.fromJSON({ L: NaN }).L, 3);
  });

  // kSigma: >0 else default 0.5
  test('fromJSON restores valid kSigma', () => {
    assertEqual(State.fromJSON({ kSigma: 0.3 }).kSigma, 0.3);
  });
  test('fromJSON: kSigma <= 0 defaults to 0.5', () => {
    assertEqual(State.fromJSON({ kSigma: 0 }).kSigma, 0.5);
  });
  test('fromJSON: non-finite kSigma defaults to 0.5', () => {
    assertEqual(State.fromJSON({ kSigma: 'x' }).kSigma, 0.5);
  });

  // hSigma: >0 else default 4
  test('fromJSON restores valid hSigma', () => {
    assertEqual(State.fromJSON({ hSigma: 5 }).hSigma, 5);
  });
  test('fromJSON: hSigma <= 0 defaults to 4', () => {
    assertEqual(State.fromJSON({ hSigma: -3 }).hSigma, 4);
  });
  test('fromJSON: non-finite hSigma defaults to 4', () => {
    assertEqual(State.fromJSON({ hSigma: NaN }).hSigma, 4);
  });

  test('fromJSON restores exampleWorksheetId', () => {
    assertEqual(State.fromJSON({ exampleWorksheetId: 'ws-99' }).exampleWorksheetId, 'ws-99');
  });
  test('fromJSON: legacy state without exampleWorksheetId becomes null', () => {
    const s = State.fromJSON({ chartTypeId: 'ewma', columnRef: null, lambda: 0.2 });
    assertEqual(s.exampleWorksheetId, null);
  });
});

// ─── Round-trip ──────────────────────────────────────────────────────────────

suite('TimeWeightedChart Model — round-trip', () => {
  test('toJSON -> fromJSON lossless for default state', () => {
    const s = new State();
    const s2 = State.fromJSON(s.toJSON());
    assertEqual(JSON.stringify(s2.toJSON()), JSON.stringify(s.toJSON()));
  });

  test('toJSON -> fromJSON lossless for fully-set state', () => {
    const s = new State();
    s.chartTypeId = 'cusum';
    s.columnRef = { instanceId: 'i1', sheetId: 's1', columnId: 'c1' };
    s.sigmaMethod = 'sd';
    s.baselineCount = 12;
    s.targetOverride = 5;
    s.sigmaOverride = 1.5;
    s.lambda = 0.1;
    s.L = 2.7;
    s.kSigma = 0.3;
    s.hSigma = 5;
    s.exampleWorksheetId = 'ws-1';
    const s2 = State.fromJSON(s.toJSON());
    assertEqual(JSON.stringify(s2.toJSON()), JSON.stringify(s.toJSON()));
  });

  test('round-trip preserves columnRef exactly', () => {
    const s = new State();
    s.columnRef = { instanceId: 'abc', sheetId: 'sh1', columnId: 'col3' };
    const s2 = State.fromJSON(s.toJSON());
    assertEqual(s2.columnRef.instanceId, 'abc');
    assertEqual(s2.columnRef.sheetId, 'sh1');
    assertEqual(s2.columnRef.columnId, 'col3');
  });
});

// ─── hasContent ──────────────────────────────────────────────────────────────

suite('TimeWeightedChart Model — hasContent', () => {
  test('empty state has no content', () => {
    assertEqual(new State().hasContent(), false);
  });
  test('with columnRef has content', () => {
    const s = new State();
    s.columnRef = { instanceId: 'i', sheetId: 's', columnId: 'c' };
    assertEqual(s.hasContent(), true);
  });
  test('chartType change alone does not count as content', () => {
    const s = new State();
    s.chartTypeId = 'cusum';
    assertEqual(s.hasContent(), false);
  });
  test('lambda change alone does not count as content', () => {
    const s = new State();
    s.lambda = 0.1;
    assertEqual(s.hasContent(), false);
  });
  test('exampleWorksheetId alone does not count as content', () => {
    const s = new State();
    s.exampleWorksheetId = 'ws-1';
    assertEqual(s.hasContent(), false);
  });
});
