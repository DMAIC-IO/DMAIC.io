/**
 * Regression Model — unit tests (regression-model.js)
 *
 * Covers State persistence (toJSON / fromJSON defaults, roundtrip, sanitization),
 * gates (hasContent / canRun / isPolynomial / activeResult), worksheet value
 * reads (toNumeric incl. date/time + categoricalCoding), degree availability,
 * and the analysis orchestration (runPolynomial / runSingleXModels) — which
 * delegate all statistics to the engine.
 */

import { suite, test, assertEqual, assertAlmostEqual } from '../test-utils.js';
import { State, polyTermCount, stripFunctions } from '../../js/modules/regression/regression-model.js';
import { runMultiRegression } from '../../js/engines/regression-engine.js';

// ── Stub stateManager with a synthetic worksheet ───────────────────

function makeSM({ columns, experiments = null }) {
  const wsInstanceId = 'ws-1';
  const sheetId = 'sheet-1';
  const moduleStates = new Map();
  moduleStates.set(wsInstanceId, { sheets: [{ id: sheetId, state: { columns } }] });
  const sm = {
    get(key) { return key === 'experiments' ? experiments : null; },
    getModuleState: (id) => moduleStates.get(id) ?? null,
    setModuleState() {},
  };
  return { sm, wsInstanceId, sheetId };
}
function colRef(instanceId, sheetId, columnId) { return { instanceId, sheetId, columnId }; }

// ── Persistence ────────────────────────────────────────────────────

suite('Regression Model — State persistence', () => {
  test('constructor sets defaults', () => {
    const s = new State();
    assertEqual(s.regType, 'polynomial');
    assertEqual(s.polyDegree, 1);
    assertEqual(s.showCI, true);
    assertEqual(s.showPI, false);
    assertEqual(s.activeTab, 'scatter');
    assertEqual(s.yKey, null);
    assertEqual(s.colRefs.length, 0);
  });

  test('fromJSON(null) and fromJSON(undefined) yield valid defaults', () => {
    for (const d of [null, undefined]) {
      const s = State.fromJSON(d);
      assertEqual(s instanceof State, true);
      assertEqual(s.regType, 'polynomial');
      assertEqual(s.polyDegree, 1);
      assertEqual(s.colRefs.length, 0);
    }
  });

  test('fromJSON(malformed) sanitizes to defaults', () => {
    const s = State.fromJSON({
      colRefs: 'nope', yKey: 42, regType: 'bogus', polyDegree: 9,
      confLevel: 5, alpha: -1, showCI: 'yes', activeTab: 'xxx', excludedTerms: [1, 'a'],
    });
    assertEqual(s.colRefs.length, 0);
    assertEqual(s.yKey, null);
    assertEqual(s.regType, 'polynomial');
    assertEqual(s.polyDegree, 1);
    assertEqual(s.confLevel, null);
    assertEqual(s.alpha, null);
    assertEqual(s.showCI, true);
    assertEqual(s.activeTab, 'scatter');
    assertEqual(JSON.stringify(s.excludedTerms), JSON.stringify(['a']));
  });

  test('toJSON → fromJSON roundtrip is lossless', () => {
    const s = new State();
    s.colRefs = [colRef('w', 's', 'c1'), colRef('w', 's', 'c2')];
    s.yKey = 'w|s|cy';
    s.regType = 'exponential';
    s.polyDegree = 3;
    s.confLevel = 0.99;
    s.alpha = 0.01;
    s.showCI = false;
    s.showPI = true;
    s.activeTab = 'qq';
    s.excludedTerms = ['X1·X2'];
    s.coefSortByP = true;
    s.activeImportSource = { experimentId: 'e1', sourceColumn: 'c', transform: 'mean' };
    s.savedModelId = 'm1';
    s.savedModelName = 'My Model';
    s.exampleWorksheetId = 'ews';
    const back = State.fromJSON(s.toJSON());
    assertEqual(JSON.stringify(back.toJSON()), JSON.stringify(s.toJSON()));
  });

  test('toJSON strips function-valued properties from result', () => {
    const s = new State();
    s.result = { equation: 'y=x', reg: { predict: () => 1, p: 3 }, fit: { predict: () => 2 } };
    const j = s.toJSON();
    assertEqual(typeof j.result.reg.predict, 'undefined');
    assertEqual(typeof j.result.fit.predict, 'undefined');
    assertEqual(j.result.reg.p, 3);
    assertEqual(j.result.equation, 'y=x');
  });

  test('stripFunctions handles arrays and nested objects', () => {
    const out = stripFunctions([{ a: 1, f: () => {} }, { b: [() => {}, 2] }]);
    assertEqual(out[0].a, 1);
    assertEqual('f' in out[0], false);
    assertEqual(JSON.stringify(out[1].b), JSON.stringify([null, 2]));
  });
});

// ── Gates ──────────────────────────────────────────────────────────

suite('Regression Model — gates', () => {
  test('hasContent false on empty, true once a column is selected', () => {
    const s = new State();
    assertEqual(s.hasContent(), false);
    s.colRefs = [colRef('w', 's', 'c1')];
    assertEqual(s.hasContent(), true);
  });

  test('hasContent true when a result exists with no columns', () => {
    const s = new State();
    s.result = { multiX: true };
    assertEqual(s.hasContent(), true);
  });

  test('canRun requires both X and Y', () => {
    const s = new State();
    assertEqual(s.canRun(), false);
    s.colRefs = [colRef('w', 's', 'c1')];
    assertEqual(s.canRun(), false);
    s.yKey = 'w|s|cy';
    assertEqual(s.canRun(), true);
  });

  test('isPolynomial reflects regType', () => {
    const s = new State();
    assertEqual(s.isPolynomial, true);
    s.regType = 'power';
    assertEqual(s.isPolynomial, false);
  });

  test('activeResult selects combined result then per-X', () => {
    const s = new State();
    assertEqual(s.activeResult, null);
    s.perXResults = { 'k1': { _nameX: 'A' }, 'k2': { _nameX: 'B' } };
    s.activeXKey = 'k2';
    assertEqual(s.activeResult._nameX, 'B');
    s.result = { multiX: true };
    assertEqual(s.activeResult.multiX, true); // combined wins
  });
});

// ── Worksheet value reads ──────────────────────────────────────────

suite('Regression Model — value reads', () => {
  test('toNumeric handles numbers, date, time, null', () => {
    const s = new State();
    assertEqual(s.toNumeric(3.5), 3.5);
    assertEqual(s.toNumeric('x'), null);
    assertEqual(s.toNumeric(null), null);
    assertEqual(s.toNumeric('01:00:00', 'time'), 3600);
    assertEqual(s.toNumeric('00:02', 'time'), 120);
    assertEqual(Number.isFinite(s.toNumeric('2020-01-01', 'date')), true);
  });

  test('getRawNumericValues honours categoricalCoding', () => {
    const { sm, wsInstanceId, sheetId } = makeSM({
      columns: [{ id: 'c', name: 'Tool', type: 'text', values: ['A', 'B', 'A'], meta: { categoricalCoding: { A: -1, B: 1 } } }],
    });
    const s = new State();
    const vals = s.getRawNumericValues(sm, colRef(wsInstanceId, sheetId, 'c'));
    assertEqual(JSON.stringify(vals), JSON.stringify([-1, 1, -1]));
  });

  test('getColumnDescriptor classifies categorical vs continuous', () => {
    const { sm, wsInstanceId, sheetId } = makeSM({
      columns: [
        { id: 'cx', name: 'X', type: 'numeric', values: [1, 2, 3] },
        { id: 'ct', name: 'T', type: 'text', values: ['A', 'B', 'A'], meta: { categoricalCoding: { A: -1, B: 1 } } },
      ],
    });
    const s = new State();
    assertEqual(s.getColumnDescriptor(sm, colRef(wsInstanceId, sheetId, 'cx')).kind, 'continuous');
    const d = s.getColumnDescriptor(sm, colRef(wsInstanceId, sheetId, 'ct'));
    assertEqual(d.kind, 'categorical');
    assertEqual(d.reference, 'A');
  });

  test('polyTermCount counts terms for k predictors at given degree', () => {
    assertEqual(polyTermCount(1, 1), 2);
    assertEqual(polyTermCount(2, 1), 3);
    assertEqual(polyTermCount(2, 2), 6);
  });

  test('degreeAvailability reports n and disabled flags', () => {
    const xs = [1, 2, 3, 4, 5];
    const { sm, wsInstanceId, sheetId } = makeSM({
      columns: [
        { id: 'cx', name: 'X', type: 'numeric', values: [...xs] },
        { id: 'cy', name: 'Y', type: 'numeric', values: [2, 4, 6, 8, 10] },
      ],
    });
    const s = new State();
    s.colRefs = [colRef(wsInstanceId, sheetId, 'cx')];
    s.yKey = `${wsInstanceId}|${sheetId}|cy`;
    const av = s.degreeAvailability(sm);
    assertEqual(av.n, 5);
    // degree 3 with 1 predictor needs >4 terms; n=5 → 5 <= 4? no → not disabled at deg3 (4 terms)
    assertEqual(av.options.length, 3);
  });
});

// ── Analysis: polynomial parity ────────────────────────────────────

suite('Regression Model — runPolynomial parity with runMultiRegression', () => {
  const xs1 = [-1, -1, -1,  0,  0,  0,  1,  1,  1, -1,  0,  1];
  const xs2 = [-1,  0,  1, -1,  0,  1, -1,  0,  1,  0,  0,  0];
  const ys = xs1.map((x1, i) => 50 + 4 * x1 - 2 * x1 * x1 + 3 * xs2[i] + 0.5 * x1 * xs2[i] + 0.05 * ((i % 5) - 2));

  const { sm, wsInstanceId, sheetId } = makeSM({
    columns: [
      { id: 'cx1', name: 'X1', type: 'numeric', values: [...xs1] },
      { id: 'cx2', name: 'X2', type: 'numeric', values: [...xs2] },
      { id: 'cy',  name: 'Y',  type: 'numeric', values: [...ys] },
    ],
  });
  const s = new State();
  s.colRefs = [colRef(wsInstanceId, sheetId, 'cx1'), colRef(wsInstanceId, sheetId, 'cx2')];
  s.yKey = `${wsInstanceId}|${sheetId}|cy`;
  s.polyDegree = 2;
  s.confLevel = 0.95;
  const res = s.runAnalysis(sm);
  const ref = runMultiRegression([xs1, xs2], ys, 2, 0.95, ['X1', 'X2']);

  test('runAnalysis returns ok', () => { assertEqual(res.ok, true); });

  test('R², adjR², MSE, F match runMultiRegression', () => {
    assertAlmostEqual(s.result.R2, ref.R2, 1e-9);
    assertAlmostEqual(s.result.adjR2, ref.adjR2, 1e-9);
    assertAlmostEqual(s.result.MSE, ref.MSE, 1e-9);
    assertAlmostEqual(s.result.Fstat, ref.Fstat, 1e-9);
  });

  test('legacy aliases and structured fields are present', () => {
    const r = s.result;
    assertEqual(Array.isArray(r._termNames), true);
    assertEqual(Array.isArray(r._coefficients), true);
    assertEqual(r.multiX, true);
    assertEqual(r.xCount, 2);
    assertEqual(typeof r.spec, 'object');
    assertEqual(Array.isArray(r.blocks), true);
    assertEqual(r.vif.length, 2);
  });

  test('errSelectBoth when nothing selected', () => {
    const empty = new State();
    const r = empty.runAnalysis(sm);
    assertEqual(r.ok, false);
    assertEqual(r.errorKey, 'errSelectBoth');
  });
});

// ── Analysis: single-X exponential ─────────────────────────────────

suite('Regression Model — runSingleXModels (exponential)', () => {
  const xs = [1, 2, 3, 4, 5, 6, 7, 8];
  const ys = xs.map(x => 2 * Math.exp(0.3 * x));
  const { sm, wsInstanceId, sheetId } = makeSM({
    columns: [
      { id: 'cx', name: 'X', type: 'numeric', values: [...xs] },
      { id: 'cy', name: 'Y', type: 'numeric', values: [...ys] },
    ],
  });
  const s = new State();
  s.regType = 'exponential';
  s.colRefs = [colRef(wsInstanceId, sheetId, 'cx')];
  s.yKey = `${wsInstanceId}|${sheetId}|cy`;
  s.confLevel = 0.95;
  const r = s.runAnalysis(sm);

  test('produces a per-X result and sets activeXKey', () => {
    assertEqual(r.ok, true);
    assertEqual(s.result, null);
    assertEqual(Object.keys(s.perXResults).length, 1);
    assertEqual(s.activeXKey != null, true);
  });

  test('activeResult resolves the single per-X model', () => {
    assertEqual(s.activeResult._nameX, 'X');
  });
});
