import { suite, test, assertEqual } from '../test-utils.js';
import { State } from '../../js/modules/control-chart/control-chart-model.js';
import { DEFAULT_ENABLED_RULES } from '../../js/engines/control-chart-engine.js';

// ── Defaults ──────────────────────────────────────────────────

suite('Control Chart Model — defaults', () => {
  test('constructor sets default field values', () => {
    const s = new State();
    assertEqual(s.chartTypeId, 'i-mr');
    assertEqual(s.subgroupSize, 1);
    assertEqual(s.columnRef, null);
    assertEqual(s.baselineCount, null);
    assertEqual(s.stagesText, '');
    assertEqual(s.usl, null);
    assertEqual(s.lsl, null);
    assertEqual(s.frozenLimits, null);
    assertEqual(s.exampleWorksheetId, null);
  });

  test('constructor sets default enabled rules (1..6)', () => {
    const s = new State();
    assertEqual(JSON.stringify(s.enabledRules), JSON.stringify(DEFAULT_ENABLED_RULES));
    // copy, not shared reference
    s.enabledRules.push(99);
    assertEqual(JSON.stringify(DEFAULT_ENABLED_RULES), JSON.stringify([1, 2, 3, 4, 5, 6]));
  });

  test('constructor sets annotations to empty object', () => {
    const s = new State();
    assertEqual(JSON.stringify(s.annotations), '{}');
  });
});

// ── toJSON / fromJSON ────────────────────────────────────────

suite('Control Chart Model — toJSON', () => {
  test('toJSON returns exactly the legacy getState key set', () => {
    const s = new State();
    const j = s.toJSON();
    const keys = Object.keys(j).sort();
    assertEqual(JSON.stringify(keys), JSON.stringify([
      'annotations', 'baselineCount', 'chartTypeId', 'columnRef',
      'enabledRules', 'exampleWorksheetId', 'frozenLimits', 'lsl',
      'stagesText', 'subgroupSize', 'usl',
    ].sort()));
  });

  test('toJSON reflects mutated values', () => {
    const s = new State();
    s.chartTypeId = 'xbar-r';
    s.subgroupSize = 5;
    s.columnRef = { instanceId: 'i1', sheetId: 's1', columnId: 'c1' };
    s.baselineCount = 10;
    s.stagesText = '12, 25';
    s.usl = 20;
    s.lsl = 0;
    s.enabledRules = [1, 2];
    s.annotations = { 3: { comment: 'x', excluded: true } };
    s.frozenLimits = { chartTypeId: 'xbar-r' };
    s.exampleWorksheetId = 'ws-1';
    const j = s.toJSON();
    assertEqual(j.chartTypeId, 'xbar-r');
    assertEqual(j.subgroupSize, 5);
    assertEqual(j.columnRef.columnId, 'c1');
    assertEqual(j.baselineCount, 10);
    assertEqual(j.stagesText, '12, 25');
    assertEqual(j.usl, 20);
    assertEqual(j.lsl, 0);
    assertEqual(JSON.stringify(j.enabledRules), '[1,2]');
    assertEqual(j.annotations['3'].excluded, true);
    assertEqual(j.frozenLimits.chartTypeId, 'xbar-r');
    assertEqual(j.exampleWorksheetId, 'ws-1');
  });

  test('toJSON returns fully-plain data (structuredClone-safe, no proxy refs)', () => {
    // Regression guard: toJSON() must JSON-detach all nested fields so the
    // persist path's structuredClone() cannot throw DataCloneError on Alpine
    // reactive proxies. We can't reproduce a real proxy here, but we assert the
    // output is a plain deep copy (nested objects/arrays are NOT the same refs
    // as the source model fields, and structuredClone succeeds on it).
    const s = new State();
    s.columnRef = { instanceId: 'i1', sheetId: 's1', columnId: 'c1' };
    s.enabledRules = [1, 2, 3];
    s.annotations = { 3: { comment: 'x', excluded: true } };
    s.frozenLimits = { chartTypeId: 'xbar-r', primary: { cl: 1, ucl: 2, lcl: 0, sigma: 0.3 } };
    const j = s.toJSON();
    // Deep copy: nested values are detached, not shared references.
    assertEqual(j.columnRef === s.columnRef, false);
    assertEqual(j.enabledRules === s.enabledRules, false);
    assertEqual(j.annotations === s.annotations, false);
    assertEqual(j.annotations['3'] === s.annotations['3'], false);
    assertEqual(j.frozenLimits === s.frozenLimits, false);
    assertEqual(j.frozenLimits.primary === s.frozenLimits.primary, false);
    // structuredClone must not throw on the plain output.
    let threw = false;
    try { structuredClone(j); } catch { threw = true; }
    assertEqual(threw, false);
    // Shape/values unchanged after detach.
    assertEqual(JSON.stringify(j.columnRef), JSON.stringify(s.columnRef));
    assertEqual(JSON.stringify(j.annotations), JSON.stringify(s.annotations));
    assertEqual(JSON.stringify(j.frozenLimits), JSON.stringify(s.frozenLimits));
  });
});

suite('Control Chart Model — fromJSON', () => {
  test('fromJSON(null) yields valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s.chartTypeId, 'i-mr');
    assertEqual(s.subgroupSize, 1);
    assertEqual(s.columnRef, null);
    assertEqual(JSON.stringify(s.enabledRules), JSON.stringify(DEFAULT_ENABLED_RULES));
  });

  test('fromJSON(undefined) yields valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.chartTypeId, 'i-mr');
    assertEqual(JSON.stringify(s.annotations), '{}');
  });

  test('fromJSON(malformed) falls back to defaults per field', () => {
    const s = State.fromJSON({
      chartTypeId: 42, subgroupSize: 'x', enabledRules: 'nope',
      annotations: 'bad', stagesText: 99,
    });
    assertEqual(s.chartTypeId, 'i-mr');
    assertEqual(s.subgroupSize, 1);
    assertEqual(JSON.stringify(s.enabledRules), JSON.stringify(DEFAULT_ENABLED_RULES));
    assertEqual(JSON.stringify(s.annotations), '{}');
    assertEqual(s.stagesText, '');
  });

  test('fromJSON restores all fields', () => {
    const data = {
      chartTypeId: 'xbar-s', subgroupSize: 4,
      columnRef: { instanceId: 'i', sheetId: 's', columnId: 'c' },
      baselineCount: 8, stagesText: '5, 10', usl: 3.3, lsl: -1.1,
      enabledRules: [1, 7], annotations: { 2: { comment: 'c', excluded: false } },
      frozenLimits: { chartTypeId: 'xbar-s', subgroupSize: 4 },
      exampleWorksheetId: 'wid',
    };
    const s = State.fromJSON(data);
    assertEqual(s.chartTypeId, 'xbar-s');
    assertEqual(s.subgroupSize, 4);
    assertEqual(s.columnRef.columnId, 'c');
    assertEqual(s.baselineCount, 8);
    assertEqual(s.stagesText, '5, 10');
    assertEqual(s.usl, 3.3);
    assertEqual(s.lsl, -1.1);
    assertEqual(JSON.stringify(s.enabledRules), '[1,7]');
    assertEqual(s.annotations['2'].comment, 'c');
    assertEqual(s.frozenLimits.subgroupSize, 4);
    assertEqual(s.exampleWorksheetId, 'wid');
  });

  test('toJSON -> fromJSON round-trip is lossless', () => {
    const s = new State();
    s.chartTypeId = 'xbar-r';
    s.subgroupSize = 6;
    s.columnRef = { instanceId: 'i', sheetId: 's', columnId: 'c2' };
    s.baselineCount = 12;
    s.stagesText = '7';
    s.usl = 10;
    s.lsl = 1;
    s.enabledRules = [1, 3, 5];
    s.annotations = { 4: { comment: 'note', excluded: true } };
    s.frozenLimits = { chartTypeId: 'xbar-r', subgroupSize: 6, primary: { cl: 1, ucl: 2, lcl: 0, sigma: 0.3 } };
    s.exampleWorksheetId = 'w9';
    const round = State.fromJSON(s.toJSON());
    assertEqual(JSON.stringify(round.toJSON()), JSON.stringify(s.toJSON()));
  });
});

// ── hasContent ───────────────────────────────────────────────

suite('Control Chart Model — hasContent', () => {
  test('false on fresh default', () => {
    assertEqual(new State().hasContent(), false);
  });

  test('true once a column is selected', () => {
    const s = new State();
    s.columnRef = { instanceId: 'i', sheetId: 's', columnId: 'c' };
    assertEqual(s.hasContent(), true);
  });
});

// ── parseStages ──────────────────────────────────────────────

suite('Control Chart Model — parseStages', () => {
  test('empty / non-string → []', () => {
    assertEqual(JSON.stringify(State.parseStages('')), '[]');
    assertEqual(JSON.stringify(State.parseStages(null)), '[]');
    assertEqual(JSON.stringify(State.parseStages(undefined)), '[]');
    assertEqual(JSON.stringify(State.parseStages(123)), '[]');
  });

  test('parses comma/space/semicolon separated positive ints', () => {
    assertEqual(JSON.stringify(State.parseStages('12, 25')), '[12,25]');
    assertEqual(JSON.stringify(State.parseStages('12 25')), '[12,25]');
    assertEqual(JSON.stringify(State.parseStages('12;25')), '[12,25]');
  });

  test('drops zero, negatives, and non-numeric', () => {
    assertEqual(JSON.stringify(State.parseStages('0, abc, , 5')), '[5]');
    assertEqual(JSON.stringify(State.parseStages('-3, 4')), '[4]');
  });

  test('sorts and dedups', () => {
    assertEqual(JSON.stringify(State.parseStages('25, 12, 12, 3')), '[3,12,25]');
  });
});

// ── excludedIndices ──────────────────────────────────────────

suite('Control Chart Model — excludedIndices', () => {
  test('empty when no annotations', () => {
    assertEqual(JSON.stringify(new State().excludedIndices()), '[]');
  });

  test('returns only indices flagged excluded (numeric)', () => {
    const s = new State();
    s.annotations = {
      2: { comment: 'a', excluded: true },
      5: { comment: 'b', excluded: false },
      9: { comment: '', excluded: true },
    };
    assertEqual(JSON.stringify(s.excludedIndices().sort((a, b) => a - b)), '[2,9]');
  });
});

// ── setChartType (subgroup-size clamping) ────────────────────

suite('Control Chart Model — setChartType clamp', () => {
  test('switching to i-mr forces subgroupSize to 1', () => {
    const s = new State();
    s.subgroupSize = 8;
    s.setChartType('i-mr');
    assertEqual(s.chartTypeId, 'i-mr');
    assertEqual(s.subgroupSize, 1);
  });

  test('switching to xbar-r clamps n into [2,10]', () => {
    const s = new State();
    s.subgroupSize = 1;
    s.setChartType('xbar-r');
    assertEqual(s.subgroupSize, 2); // clamped up to min

    s.subgroupSize = 99;
    s.setChartType('xbar-r');
    assertEqual(s.subgroupSize, 10); // clamped down to max
  });

  test('xbar-r -> xbar-s preserves in-range n=8', () => {
    const s = new State();
    s.setChartType('xbar-r');
    s.subgroupSize = 8;
    s.setChartType('xbar-s');
    assertEqual(s.subgroupSize, 8);
  });

  test('unknown chart type is ignored (no clamp)', () => {
    const s = new State();
    s.subgroupSize = 3;
    s.chartTypeId = 'xbar-r';
    s.setChartType('bogus');
    assertEqual(s.chartTypeId, 'xbar-r');
    assertEqual(s.subgroupSize, 3);
  });
});

// ── buildFrozenLimits ────────────────────────────────────────

suite('Control Chart Model — buildFrozenLimits', () => {
  const lastResult = {
    ct: { id: 'i-mr', subcharts: [{ id: 'i' }, { id: 'mr' }] },
    result: {
      subcharts: {
        i: { cl: 10, ucl: 13, lcl: 7, sigma: 1 },
        mr: { cl: 1.1, ucl: 3.6, lcl: 0, sigma: 0.4 },
      },
    },
    baselineEnd: 15,
  };

  test('extracts primary + secondary limits and metadata', () => {
    const s = new State();
    s.chartTypeId = 'i-mr';
    s.subgroupSize = 1;
    s.columnRef = { instanceId: 'i', sheetId: 's', columnId: 'c' };
    s.annotations = { 4: { comment: '', excluded: true } };
    const fl = s.buildFrozenLimits(lastResult);
    assertEqual(fl.chartTypeId, 'i-mr');
    assertEqual(fl.subgroupSize, 1);
    assertEqual(fl.columnRef.columnId, 'c');
    assertEqual(fl.baselineEnd, 15);
    assertEqual(fl.primary.cl, 10);
    assertEqual(fl.primary.ucl, 13);
    assertEqual(fl.primary.lcl, 7);
    assertEqual(fl.primary.sigma, 1);
    assertEqual(fl.secondary.cl, 1.1);
    assertEqual(JSON.stringify(fl.excludedIndices), '[4]');
  });
});
