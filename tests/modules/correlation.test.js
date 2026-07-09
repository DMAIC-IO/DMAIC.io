/**
 * Unit tests — Correlation Model (correlation-model.js)
 *
 * Covers persistence (toJSON / fromJSON / roundtrip / legacy migration /
 * structuredClone-safety), selection logic, conf parse/format, type-aware
 * numeric coercion, column discovery and compute orchestration against a
 * mock stateManager. The correlation MATH lives in correlation-engine and is
 * tested separately — here we only verify the model wires the engine up
 * correctly and assembles the matrix.
 */

import {
  suite, test, assertEqual, assertAlmostEqual, assertArrayAlmostEqual,
} from '../test-utils.js';
import {
  State, parseConfPercent, formatConfPercent,
} from '../../js/modules/correlation/correlation-model.js';

// ── Mock stateManager backed by a single worksheet ──────────────────────────

function makeStateManager(columns) {
  // columns: [{ id, name, shortName, type, values }]
  const wsState = {
    sheets: [{ id: 'sheet-1', name: 'Tabelle', state: { columns } }],
  };
  const phases = { measure: [{ moduleId: 'worksheet', instanceId: 'ws-1' }] };
  return {
    get(path) {
      if (path === 'phases') return phases;
      if (path.startsWith('phases.')) return phases[path.slice('phases.'.length)] ?? [];
      if (path === 'settings.confidenceLevel') return 95;
      return undefined;
    },
    getModuleState(id) {
      return id === 'ws-1' ? wsState : null;
    },
  };
}

const REF = (columnId) => ({ instanceId: 'ws-1', sheetId: 'sheet-1', columnId });

// Strongly correlated test data (10 rows)
const NUM_X = [10, 12, 8, 15, 25, 20, 18, 22, 30, 28];
const NUM_Y = [20, 22, 18, 30, 45, 38, 35, 40, 55, 50];
const NUM_Z = [5, 6, 4, 7, 12, 10, 9, 11, 15, 14];

function numericSM() {
  return makeStateManager([
    { id: 'c-x', name: 'X', shortName: 'X', type: 'numeric', values: NUM_X },
    { id: 'c-y', name: 'Y', shortName: 'Y', type: 'numeric', values: NUM_Y },
    { id: 'c-z', name: 'Z', shortName: 'Z', type: 'numeric', values: NUM_Z },
  ]);
}

// ── Constructor & defaults ───────────────────────────────────────────────────

suite('Correlation Model — defaults', () => {
  test('constructor sets default values', () => {
    const s = new State();
    assertEqual(Array.isArray(s.colRefs), true);
    assertEqual(s.colRefs.length, 0);
    // Fresh model defaults to null; init() resolves the app-settings default
    // (settings.confidenceLevel) — matches legacy behaviour.
    assertEqual(s.confidenceLevel, null);
    assertEqual(s.matrixMethod, 'pearson');
    assertEqual(s.filterMinR, null);
    assertEqual(s.filterMaxP, null);
    assertEqual(s.exampleWorksheetId, null);
  });

  test('hasContent false when empty, true with a selection', () => {
    const s = new State();
    assertEqual(s.hasContent(), false);
    s.colRefs.push(REF('c-x'));
    assertEqual(s.hasContent(), true);
  });
});

// ── Persistence ──────────────────────────────────────────────────────────────

suite('Correlation Model — persistence', () => {
  test('toJSON returns expected shape (inputs only, no derived result)', () => {
    const s = new State();
    s.colRefs = [REF('c-x'), REF('c-y')];
    s.confidenceLevel = 0.99;
    s.matrixMethod = 'spearman';
    s.filterMinR = 0.5;
    s.filterMaxP = 0.05;
    s.exampleWorksheetId = 'ws-9';
    const j = s.toJSON();
    assertEqual(j.confidenceLevel, 0.99);
    assertEqual(j.matrixMethod, 'spearman');
    assertEqual(j.filterMinR, 0.5);
    assertEqual(j.filterMaxP, 0.05);
    assertEqual(j.exampleWorksheetId, 'ws-9');
    assertEqual(j.colRefs.length, 2);
    assertEqual(j.colRefs[0].columnId, 'c-x');
    // No derived blobs in persisted shape
    assertEqual('result' in j, false);
    assertEqual('matrixResult' in j, false);
  });

  test('toJSON is structuredClone-safe (deep-copies colRefs)', () => {
    const s = new State();
    s.colRefs = [REF('c-x'), REF('c-y')];
    const j = s.toJSON();
    // Mutating original must not affect the serialized snapshot
    s.colRefs[0].columnId = 'MUTATED';
    assertEqual(j.colRefs[0].columnId, 'c-x');
    // structuredClone must not throw (no shared proxy refs)
    const cloned = structuredClone(j);
    assertEqual(cloned.colRefs[1].columnId, 'c-y');
  });

  test('fromJSON(null) yields valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s.colRefs.length, 0);
    // No persisted value → stays null (init() resolves from app settings).
    assertEqual(s.confidenceLevel, null);
    assertEqual(s.matrixMethod, 'pearson');
  });

  test('fromJSON(undefined) yields valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.colRefs.length, 0);
    assertEqual(s.matrixMethod, 'pearson');
  });

  test('fromJSON restores data', () => {
    const s = State.fromJSON({
      colRefs: [REF('c-x'), REF('c-y')],
      confidenceLevel: 0.9,
      matrixMethod: 'kendall',
      filterMinR: 0.3,
      filterMaxP: 0.1,
      exampleWorksheetId: 'ws-7',
    });
    assertEqual(s.colRefs.length, 2);
    assertEqual(s.confidenceLevel, 0.9);
    assertEqual(s.matrixMethod, 'kendall');
    assertEqual(s.filterMinR, 0.3);
    assertEqual(s.filterMaxP, 0.1);
    assertEqual(s.exampleWorksheetId, 'ws-7');
  });

  test('fromJSON migrates legacy colRefX / colRefY', () => {
    const s = State.fromJSON({ colRefX: REF('c-x'), colRefY: REF('c-y') });
    assertEqual(s.colRefs.length, 2);
    assertEqual(s.colRefs[0].columnId, 'c-x');
    assertEqual(s.colRefs[1].columnId, 'c-y');
  });

  test('fromJSON drops legacy derived result/matrixResult', () => {
    const s = State.fromJSON({
      colRefs: [REF('c-x'), REF('c-y')],
      result: { pearson: { r: 0.9 } },
      matrixResult: { names: ['X', 'Y'] },
    });
    assertEqual(s.toJSON().result, undefined);
    assertEqual(s.toJSON().matrixResult, undefined);
  });

  test('fromJSON sanitizes invalid matrixMethod to pearson', () => {
    const s = State.fromJSON({ matrixMethod: 'bogus' });
    assertEqual(s.matrixMethod, 'pearson');
  });

  test('fromJSON sanitizes non-array colRefs to empty', () => {
    const s = State.fromJSON({ colRefs: 'nope' });
    assertEqual(s.colRefs.length, 0);
  });

  test('roundtrip is lossless', () => {
    const a = State.fromJSON({
      colRefs: [REF('c-x'), REF('c-z')],
      confidenceLevel: 0.975,
      matrixMethod: 'spearman',
      filterMinR: 0.4,
      filterMaxP: null,
      exampleWorksheetId: 'ws-3',
    });
    const b = State.fromJSON(a.toJSON());
    assertEqual(JSON.stringify(b.toJSON()), JSON.stringify(a.toJSON()));
  });
});

// ── Selection logic ──────────────────────────────────────────────────────────

suite('Correlation Model — selection', () => {
  test('toggleColumn adds and removes', () => {
    const s = new State();
    s.toggleColumn(REF('c-x'));
    assertEqual(s.colRefs.length, 1);
    assertEqual(s.isSelected(REF('c-x')), true);
    assertEqual(s.isSelected(REF('c-y')), false);
    s.toggleColumn(REF('c-y'));
    assertEqual(s.colRefs.length, 2);
    s.toggleColumn(REF('c-x'));
    assertEqual(s.colRefs.length, 1);
    assertEqual(s.isSelected(REF('c-x')), false);
    assertEqual(s.isSelected(REF('c-y')), true);
  });
});

// ── Conf parse/format ────────────────────────────────────────────────────────

suite('Correlation Model — conf parse/format', () => {
  test('parseConfPercent accepts percents and decimals', () => {
    assertAlmostEqual(parseConfPercent('95'), 0.95, 1e-9);
    assertAlmostEqual(parseConfPercent('95 %'), 0.95, 1e-9);
    assertAlmostEqual(parseConfPercent('95%'), 0.95, 1e-9);
    assertAlmostEqual(parseConfPercent('0.95'), 0.95, 1e-9);
    assertAlmostEqual(parseConfPercent('0,95'), 0.95, 1e-9);
    assertAlmostEqual(parseConfPercent('97,5 %'), 0.975, 1e-9);
  });

  test('parseConfPercent rejects out-of-range and garbage', () => {
    assertEqual(parseConfPercent('200'), null);
    assertEqual(parseConfPercent('0'), null);
    assertEqual(parseConfPercent('100'), null);
    assertEqual(parseConfPercent(''), null);
    assertEqual(parseConfPercent('abc'), null);
    assertEqual(parseConfPercent(null), null);
  });

  test('formatConfPercent strips trailing zeros', () => {
    assertEqual(formatConfPercent(0.95), '95');
    assertEqual(formatConfPercent(0.975), '97.5');
  });
});

// ── Type-aware numeric coercion ──────────────────────────────────────────────

suite('Correlation Model — numeric coercion', () => {
  test('toNumeric handles numeric / date / time', () => {
    const s = new State();
    assertEqual(s.toNumeric(42, 'numeric'), 42);
    assertEqual(s.toNumeric('x', 'numeric'), null);
    assertEqual(s.toNumeric(null, 'numeric'), null);
    assertEqual(s.toNumeric('2020-01-02', 'date'), Date.parse('2020-01-02'));
    assertEqual(s.toNumeric('not-a-date', 'date'), null);
    assertEqual(s.toNumeric('01:30', 'time'), 5400);
    assertEqual(s.toNumeric('01:30:30', 'time'), 5430);
    assertEqual(s.toNumeric('nope', 'time'), null);
  });
});

// ── Column discovery + compute orchestration ────────────────────────────────

suite('Correlation Model — discovery & compute', () => {
  test('discoverColumns finds numeric columns with >=5 values, grouped', () => {
    const sm = numericSM();
    const cols = new State().discoverColumns(sm);
    assertEqual(cols.length, 3);
    assertEqual(cols[0].columnId, 'c-x');
    assertEqual(cols[0].sheetName, 'Tabelle');
    assertEqual(cols[0].valueCount, 10);
  });

  test('discoverColumns excludes columns with < 5 numeric values', () => {
    const sm = makeStateManager([
      { id: 'c-a', name: 'A', shortName: 'A', type: 'numeric', values: [1, 2, 3] },
      { id: 'c-b', name: 'B', shortName: 'B', type: 'text', values: ['a', 'b', 'c', 'd', 'e', 'f'] },
    ]);
    const cols = new State().discoverColumns(sm);
    assertEqual(cols.length, 0);
  });

  test('hasWorksheet reflects worksheet presence', () => {
    assertEqual(new State().hasWorksheet(numericSM()), true);
    const empty = { get: (p) => (p === 'phases' ? {} : []), getModuleState: () => null };
    assertEqual(new State().hasWorksheet(empty), false);
  });

  test('getPairedValues aligns rows and drops nulls', () => {
    const sm = makeStateManager([
      { id: 'c-a', name: 'A', shortName: 'A', type: 'numeric', values: [1, 2, null, 4, 5] },
      { id: 'c-b', name: 'B', shortName: 'B', type: 'numeric', values: [10, null, 30, 40, 50] },
    ]);
    const paired = new State().getPairedValues(sm, REF('c-a'), REF('c-b'));
    assertArrayAlmostEqual(paired.x, [1, 4, 5], 1e-9);
    assertArrayAlmostEqual(paired.y, [10, 40, 50], 1e-9);
  });

  test('computePairwise delegates to engine and attaches names + raw arrays', () => {
    const s = new State();
    s.colRefs = [REF('c-x'), REF('c-y')];
    const res = s.computePairwise(numericSM());
    assertEqual(res.n, 10);
    // strongly positive
    assertEqual(res.pearson.r > 0.9, true);
    assertEqual(res._nameX, 'X');
    assertEqual(res._nameY, 'Y');
    assertArrayAlmostEqual(res._x, NUM_X, 1e-9);
  });

  test('computeMatrix builds symmetric k×k matrices with diagonal 1', () => {
    const s = new State();
    s.colRefs = [REF('c-x'), REF('c-y'), REF('c-z')];
    const m = s.computeMatrix(numericSM());
    assertEqual(m.names.length, 3);
    assertEqual(m.matrix.pearson.length, 3);
    assertEqual(m.matrix.pearson[0][0], 1);
    // symmetry
    assertAlmostEqual(m.matrix.pearson[0][1], m.matrix.pearson[1][0], 1e-12);
    // upper-triangle pairs collected for scatter
    assertEqual(m.pairs.length, 3);
    // CI/p only on off-diagonal upper cells
    assertEqual(m.ciMatrix.pearson[0][0], null);
    assertEqual(Array.isArray(m.ciMatrix.pearson[0][1]), true);
  });

  test('inputFingerprint changes when selection or conf changes', () => {
    const s = new State();
    s.colRefs = [REF('c-x'), REF('c-y')];
    const sm = numericSM();
    const fp1 = s.inputFingerprint(sm);
    s.confidenceLevel = 0.9;
    const fp2 = s.inputFingerprint(sm);
    assertEqual(fp1 === fp2, false);
  });
});
