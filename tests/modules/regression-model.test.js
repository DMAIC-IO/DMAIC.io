/**
 * Regression Model — unit tests (regression-model.js)
 *
 * Covers State persistence (toJSON / fromJSON defaults, roundtrip, sanitization),
 * gates (hasContent / canRun / isPolynomial / activeResult), worksheet value
 * reads (toNumeric incl. date/time + categoricalCoding), degree availability,
 * and the analysis orchestration (runPolynomial / runSingleXModels) — which
 * delegate all statistics to the engine.
 */

import { suite, test, assertEqual, assertAlmostEqual, assertDeepEqual } from '../test-utils.js';
import { State, polyTermCount, stripFunctions } from '../../js/modules/regression/regression-model.js';
import {
  runMultiRegression, confidenceBand, predictionBand, predictMulti,
} from '../../js/engines/regression-engine.js';

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

// ── Bands and predictMulti follow the reduced model (C2-006) ───────

suite('Regression Model — bands and predictMulti after a term is excluded', () => {
  const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const ys = [2.1, 3.9, 6.2, 7.8, 10.1, 12.2, 13.8, 16.1, 18.0, 19.9];

  const { sm, wsInstanceId, sheetId } = makeSM({
    columns: [
      { id: 'cx', name: 'X', type: 'numeric', values: [...xs] },
      { id: 'cy', name: 'Y', type: 'numeric', values: [...ys] },
    ],
  });

  for (const excluded of ['X²', 'X']) {
    test(`single-X quadratic without ${excluded}: CI/PI bands match the legacy engine`, () => {
      const s = new State();
      s.colRefs = [colRef(wsInstanceId, sheetId, 'cx')];
      s.yKey = `${wsInstanceId}|${sheetId}|cy`;
      s.polyDegree = 2;
      s.confLevel = 0.95;
      s.excludedTerms = [excluded];
      assertEqual(s.runAnalysis(sm).ok, true);
      const ref = runMultiRegression([xs], ys, 2, 0.95, ['X'], [excluded]);
      for (const x of [1, 5.5, 10]) {
        const ci = confidenceBand(s.result, x);
        const pi = predictionBand(s.result, x);
        const ciRef = confidenceBand(ref, x);
        const piRef = predictionBand(ref, x);
        assertAlmostEqual(ci.upper, ciRef.upper, 1e-9);
        assertAlmostEqual(ci.lower, ciRef.lower, 1e-9);
        assertAlmostEqual(pi.upper, piRef.upper, 1e-9);
        assertAlmostEqual(pi.lower, piRef.lower, 1e-9);
      }
    });
  }

  test('two-X quadratic without X1·X2: predictMulti matches the legacy engine', () => {
    const xs1 = [-1, -1, -1,  0,  0,  0,  1,  1,  1, -1,  0,  1];
    const xs2 = [-1,  0,  1, -1,  0,  1, -1,  0,  1,  0,  0,  0];
    const y2 = xs1.map((x1, i) => 50 + 4 * x1 - 2 * x1 * x1 + 3 * xs2[i] + 0.05 * ((i % 5) - 2));
    const multi = makeSM({
      columns: [
        { id: 'cx1', name: 'X1', type: 'numeric', values: [...xs1] },
        { id: 'cx2', name: 'X2', type: 'numeric', values: [...xs2] },
        { id: 'cy',  name: 'Y',  type: 'numeric', values: [...y2] },
      ],
    });
    const s = new State();
    s.colRefs = [colRef(multi.wsInstanceId, multi.sheetId, 'cx1'), colRef(multi.wsInstanceId, multi.sheetId, 'cx2')];
    s.yKey = `${multi.wsInstanceId}|${multi.sheetId}|cy`;
    s.polyDegree = 2;
    s.confLevel = 0.95;
    s.excludedTerms = ['X1·X2'];
    assertEqual(s.runAnalysis(multi.sm).ok, true);
    const ref = runMultiRegression([xs1, xs2], y2, 2, 0.95, ['X1', 'X2'], ['X1·X2']);
    for (const xVals of [[0, 0], [0.5, -0.5], [1, 1]]) {
      const p = predictMulti(s.result, xVals);
      const pRef = predictMulti(ref, xVals);
      assertAlmostEqual(p.yHat, pRef.yHat, 1e-9);
      assertAlmostEqual(p.piLow, pRef.piLow, 1e-9);
      assertAlmostEqual(p.piHigh, pRef.piHigh, 1e-9);
    }
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

// ── Design-term hand-off (DOE → Regression) ─────────────────────────

const numCol = (id, name, values) => ({ id, name, type: 'numeric', values });

/** Worksheet stub with the given numeric columns; returns a State wired to it. */
function designState(cols, yCol, designTerms) {
  const columns = [...cols, yCol].map(c => ({ id: c.id, name: c.name, type: c.type, meta: c.meta, values: c.values }));
  const env = makeSM({ columns });
  const s = new State();
  s.colRefs = cols.map(c => colRef(env.wsInstanceId, env.sheetId, c.id));
  s.yKey = `${env.wsInstanceId}|${env.sheetId}|${yCol.id}`;
  s.confLevel = 0.95;
  s.alpha = 0.05;
  s.designTerms = designTerms;
  return { s, sm: env.sm };
}

const BOOK_Y = [91.87, 90.85, 93.13, 93.09, 91.82, 92.90, 93.52, 92.37, 93.39, 92.58,
  94.99, 93.52, 95.20, 94.82, 93.97, 94.23, 94.16, 94.15, 92.80, 93.51];
const BOOK_TIME = [3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4];
const BOOK_CLEANER = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

suite('Regression Model — design terms from the DOE planner', () => {
  test('book example (Melzer 2019, 14.5): Time·Cleaner kept, p ≈ 0.030', () => {
    const { s, sm } = designState(
      [numCol('t', 'Time', BOOK_TIME), numCol('c', 'Cleaner', BOOK_CLEANER)],
      numCol('y', 'Yield', BOOK_Y),
      ['M0', 'M1', 'I0_1'],
    );
    const res = s.runAnalysis(sm);
    assertEqual(res.ok, true);
    assertEqual(s.polyDegree, 2);
    assertDeepEqual([...s.excludedTerms].sort(), ['Cleaner²', 'Time²']);
    assertEqual(s.designTerms, null);
    assertDeepEqual(s.designNotice, { aliased: [], saturated: [] });
    const row = s.result.coefDetails.find(c => c.term === 'Time·Cleaner');
    assertAlmostEqual(row.pval, 0.0304, 0.0005);
  });

  test('2-factor CCD, 13 runs: full quadratic model fits, no cubic terms', () => {
    const a = [-1, 1, -1, 1, -1.414, 1.414, 0, 0, 0, 0, 0, 0, 0];
    const b = [-1, -1, 1, 1, 0, 0, -1.414, 1.414, 0, 0, 0, 0, 0];
    const y = a.map((v, i) => 10 + v + 2 * b[i] - v * v + 0.5 * v * b[i] + 0.1 * Math.sin(i));
    const { s, sm } = designState([numCol('a', 'A', a), numCol('b', 'B', b)], numCol('y', 'Y', y),
      ['M0', 'M1', 'Q0', 'Q1', 'I0_1']);
    assertEqual(s.runAnalysis(sm).ok, true);
    assertEqual(s.polyDegree, 2);
    assertDeepEqual(s.excludedTerms, []);
  });

  test('2^(4-1) Res IV replicated: aliased 2FI excluded with notice', () => {
    const rows = [];
    for (let r = 0; r < 2; r++) for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) rows.push([a, b, c, a * b * c]);
    const cols = ['A', 'B', 'C', 'D'].map((n, j) => numCol(n.toLowerCase(), n, rows.map(r => r[j])));
    const y = rows.map((r, i) => 5 + r[0] + r[1] * r[2] + 0.01 * i);
    const { s, sm } = designState(cols, numCol('y', 'Y', y),
      ['M0', 'M1', 'M2', 'M3', 'I0_1', 'I0_2', 'I0_3', 'I1_2', 'I1_3', 'I2_3']);
    assertEqual(s.runAnalysis(sm).ok, true);
    assertDeepEqual(s.designNotice.aliased, [
      { term: 'B·C', with: ['A·D'] },
      { term: 'B·D', with: ['A·C'] },
      { term: 'C·D', with: ['A·B'] },
    ]);
    assertEqual(s.excludedTerms.includes('C·D'), true);
    assertEqual(s.excludedTerms.includes('A·B'), false);
  });

  test('unreplicated 2^2: interaction trimmed as saturated, df_error = 1', () => {
    const { s, sm } = designState(
      [numCol('a', 'A', [-1, 1, -1, 1]), numCol('b', 'B', [-1, -1, 1, 1])],
      numCol('y', 'Y', [1, 3, 2, 7]),
      ['M0', 'M1', 'I0_1'],
    );
    assertEqual(s.runAnalysis(sm).ok, true);
    assertDeepEqual(s.designNotice.saturated, ['A·B']);
    assertEqual(s.excludedTerms.includes('A·B'), true);
  });

  test('PB 12 runs / 11 factors: all 2FI out, last main effect trimmed', () => {
    const seed = [1, 1, -1, 1, 1, 1, -1, -1, -1, 1, -1];
    const rows = [];
    for (let r = 0; r < 11; r++) rows.push(seed.map((_, j) => seed[(j - r + 11) % 11]));
    rows.push(new Array(11).fill(-1));
    const names = 'ABCDEFGHJKL'.split('');
    const cols = names.map((n, j) => numCol(`x${j}`, n, rows.map(r => r[j])));
    const y = rows.map((r, i) => r[0] + 0.5 * r[1] + 0.01 * i);
    const terms = [];
    for (let i = 0; i < 11; i++) terms.push(`M${i}`);
    for (let i = 0; i < 11; i++) for (let j = i + 1; j < 11; j++) terms.push(`I${i}_${j}`);
    const { s, sm } = designState(cols, numCol('y', 'Y', y), terms);
    assertEqual(s.runAnalysis(sm).ok, true);
    assertDeepEqual(s.designNotice.saturated, ['L']);
    assertEqual(s.result.coefDetails.some(c => c.term.includes('·')), false);
  });

  test('missing Y rows: rank/df check uses the filtered rows', () => {
    const y = [1, 3, 2, 7, 1.2, 3.1, null, null];
    const { s, sm } = designState(
      [numCol('a', 'A', [-1, 1, -1, 1, -1, 1, -1, 1]), numCol('b', 'B', [-1, -1, 1, 1, -1, -1, 1, 1])],
      numCol('y', 'Y', y),
      ['M0', 'M1', 'I0_1'],
    );
    // 6 usable rows, 4 columns → df_error 2, nothing trimmed.
    assertEqual(s.runAnalysis(sm).ok, true);
    assertDeepEqual(s.designNotice.saturated, []);
  });

  test('categorical 3-level saturation counts indicator columns', () => {
    const g = ['a', 'b', 'c', 'a', 'b', 'c'];
    const x = [-1, -1, -1, 1, 1, 1];
    const gCol = { id: 'g', name: 'G', type: 'text', values: g, meta: { categoricalCoding: { a: 1, b: 2, c: 3 } } };
    const { s, sm } = designState([numCol('x', 'X', x), gCol], numCol('y', 'Y', [1, 2, 3, 4, 6, 9]),
      ['M0', 'M1', 'I0_1']);
    // Intercept 1 + X 1 + G 2 + X·G 2 = 6 columns = n → X·G trimmed.
    assertEqual(s.runAnalysis(sm).ok, true);
    assertDeepEqual(s.designNotice.saturated, ['X·G']);
  });

  test('user re-adds an aliased term → errAliasedTerms naming the alias', () => {
    const { s, sm } = designState(
      [numCol('a', 'A', [-1, 1, -1, 1, -1, 1]), numCol('b', 'B', [-1, -1, 1, 1, -1, 1])],
      numCol('y', 'Y', [1, 3, 2, 7, 1.1, 3.2]),
      ['M0', 'M1', 'Q0'],
    );
    assertEqual(s.runAnalysis(sm).ok, true);
    assertEqual(s.excludedTerms.includes('A²'), true);
    s.excludedTerms = s.excludedTerms.filter(t => t !== 'A²');
    const res = s.runAnalysis(sm);
    assertEqual(res.ok, false);
    assertEqual(res.errorKey, 'errAliasedTerms');
    assertEqual(res.errorParams.term, 'A²');
    assertEqual(res.errorParams.with, 'Intercept');
    assertDeepEqual(res.aliased, [{ term: 'A²', with: ['Intercept'] }]);
  });

  test('user re-adds a trimmed term to a saturated model → errInsufficientDf, no fit', () => {
    const { s, sm } = designState(
      [numCol('a', 'A', [-1, 1, -1, 1]), numCol('b', 'B', [-1, -1, 1, 1])],
      numCol('y', 'Y', [10, 14, 11, 21]),
      ['M0', 'M1', 'I0_1'],
    );
    assertEqual(s.runAnalysis(sm).ok, true);
    assertDeepEqual(s.designNotice.saturated, ['A·B']);
    s.excludedTerms = s.excludedTerms.filter(t => t !== 'A·B');
    // 4 rows, 4 columns → df_error 0: not fitted (saturated fits are C1-022).
    const res = s.runAnalysis(sm);
    assertEqual(res.ok, false);
    assertEqual(res.errorKey, 'errInsufficientDf');
  });

  test('clearDesignPreset drops a not-yet-applied preset and its notice', () => {
    // An import before Y is filled leaves designTerms pending; once the user
    // edits X/Y/degree/terms, the preset must not override their model later.
    const s = new State();
    s.designTerms = ['M0', 'M1', 'I0_1'];
    s.designNotice = { aliased: [], saturated: ['A·B'] };
    s.clearDesignPreset();
    assertEqual(s.designTerms, null);
    assertEqual(s.designNotice, null);
  });

  test('designTerms / designNotice persist; applied preset is not re-applied', () => {
    const s = new State();
    s.designTerms = ['M0'];
    s.designNotice = { aliased: [{ term: 'B', with: ['A'] }], saturated: ['C'] };
    const r = State.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
    assertDeepEqual(r.designTerms, ['M0']);
    assertDeepEqual(r.designNotice, s.designNotice);
    const bad = State.fromJSON({ designTerms: 'x', designNotice: 5 });
    assertEqual(bad.designTerms, null);
    assertEqual(bad.designNotice, null);
  });

  test('clearDesignNotice resets the notice only', () => {
    const s = new State();
    s.designNotice = { aliased: [], saturated: ['A·B'] };
    s.excludedTerms = ['A·B'];
    s.clearDesignNotice();
    assertEqual(s.designNotice, null);
    assertDeepEqual(s.excludedTerms, ['A·B']);
  });
});

suite('Regression Model — experiment import carries design terms', () => {
  function expSM(plannedTerms, factors) {
    const columns = [numCol('f0', 'A', [-1, 1]), numCol('f1', 'B', [-1, 1]), numCol('r', 'Y', [1, 2])];
    return makeSM({
      columns,
      experiments: {
        e1: {
          name: 'E', plannedTerms, factors,
          runMatrix: { worksheetRef: { instanceId: 'ws-1', sheetId: 'sheet-1' }, columnTags: { factors: ['f0', 'f1'] } },
          responseColumns: [{ name: 'Y', columnId: 'r' }],
        },
      },
    }).sm;
  }

  test('new record: plannedTerms.terms passed through', () => {
    const sm = expSM({ linear: true, terms: ['M0', 'M1', 'I0_1'] }, [{ kind: 'continuous' }, { kind: 'continuous' }]);
    const s = new State();
    const opt = s.listExperimentImports(sm)[0];
    assertDeepEqual(opt.designTerms, ['M0', 'M1', 'I0_1']);
    assertEqual(s.applyExperimentImport(sm, opt.key), true);
    assertDeepEqual(s.designTerms, ['M0', 'M1', 'I0_1']);
    assertEqual(s.designNotice, null);
  });

  test('old record without terms: mains + 2FI + Q for continuous factors', () => {
    const sm = expSM({ linear: true, twoFactor: false, quadratic: false }, [{ kind: 'continuous' }, { kind: 'categorical' }]);
    const opt = new State().listExperimentImports(sm)[0];
    assertDeepEqual(opt.designTerms, ['M0', 'M1', 'Q0', 'I0_1']);
  });
});

suite('Regression Model — degreeAvailability honours exclusions', () => {
  test('selected degree counts only active terms', () => {
    const { s, sm } = designState(
      [numCol('a', 'A', [-1, 1, -1, 1, 0]), numCol('b', 'B', [-1, -1, 1, 1, 0])],
      numCol('y', 'Y', [1, 2, 3, 4, 5]),
      null,
    );
    s.polyDegree = 2;
    s.excludedTerms = ['A²', 'B²'];
    const opt = s.degreeAvailability(sm).options.find(o => o.deg === 2);
    assertEqual(opt.terms, 4);
    assertEqual(opt.disabled, false);
  });
});
