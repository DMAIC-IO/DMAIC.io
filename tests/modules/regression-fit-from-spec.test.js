/**
 * Regression module — runPolynomial integration test.
 *
 * Exercises the fitFromSpec-based path through the Regression State model
 * (regression-model.js). After the Alpine migration the analysis orchestration
 * lives on the Model (`State.runPolynomial(sm, yRef)`); statistics still come
 * exclusively from `engines/regression-engine.js`. Verifies:
 *
 *   1. Pure-continuous models numerically match runMultiRegression on the
 *      same data (R², adjR², R²pred, MSE, dw, F, fPVal).
 *   2. The legacy result fields the existing UI consumes are all populated
 *      (_xNames, _termNames, _coefficients, coefDetails, allTerms, vif, …).
 *   3. New structured fields (`spec`, `blockMap`, `blocks`, `fit`) are
 *      surfaced for the block-aware UI.
 *   4. A binary-categorical column (with column.meta.categoricalCoding) is
 *      detected and modeled as kind='categorical' inside the spec.
 */

import { suite, test, assertAlmostEqual, assertEqual } from '../test-utils.js';
import { State } from '../../js/modules/regression/regression-model.js';
import { runMultiRegression } from '../../js/engines/regression-engine.js';

// ─── Stub harness ──────────────────────────────────────────────────

/** Build a synthetic stateManager + a State configured for the given columns. */
function makeStub({ columns, polyDegree = 2, excludedTerms = [], confLevel = 0.95 }) {
  const wsInstanceId = 'ws-1';
  const sheetId = 'sheet-1';
  const moduleStates = new Map();
  moduleStates.set(wsInstanceId, { sheets: [{ id: sheetId, state: { columns } }] });
  const sm = {
    get() { return null; },
    getModuleState: (id) => moduleStates.get(id) ?? null,
    setModuleState() {},
  };
  const state = new State();
  state.polyDegree = polyDegree;
  state.confLevel = confLevel;
  state.excludedTerms = [...excludedTerms];
  return { state, sm, wsInstanceId, sheetId };
}

function colRef(instanceId, sheetId, columnId) {
  return { instanceId, sheetId, columnId };
}

// ─── Pure-continuous parity ────────────────────────────────────────

suite('Regression model — pure-continuous parity with runMultiRegression', () => {
  // 12-row 2-factor quadratic dataset.
  const xs1 = [-1, -1, -1,  0,  0,  0,  1,  1,  1, -1,  0,  1];
  const xs2 = [-1,  0,  1, -1,  0,  1, -1,  0,  1,  0,  0,  0];
  const ys  = xs1.map((x1, i) => 50 + 4*x1 - 2*x1*x1 + 3*xs2[i] + 0.5*x1*xs2[i] + 0.05*((i % 5) - 2));

  const cols = [
    { id: 'cx1', name: 'X1', type: 'numeric', values: [...xs1] },
    { id: 'cx2', name: 'X2', type: 'numeric', values: [...xs2] },
    { id: 'cy',  name: 'Y',  type: 'numeric', values: [...ys] },
  ];
  const { state, sm, wsInstanceId, sheetId } = makeStub({ columns: cols });
  state.colRefs = [colRef(wsInstanceId, sheetId, 'cx1'), colRef(wsInstanceId, sheetId, 'cx2')];
  state.yKey = `${wsInstanceId}|${sheetId}|cy`;
  const res = state.runPolynomial(sm, { instanceId: wsInstanceId, sheetId, columnId: 'cy' });

  const ref = runMultiRegression([xs1, xs2], ys, 2, 0.95, ['X1', 'X2']);

  test('runPolynomial returns ok (no error path)', () => {
    assertEqual(res.ok, true);
  });

  test('R², adjR², R²pred match runMultiRegression', () => {
    assertAlmostEqual(state.result.R2,    ref.R2,    1e-9);
    assertAlmostEqual(state.result.adjR2, ref.adjR2, 1e-9);
    assertAlmostEqual(state.result.R2pred, ref.R2pred, 1e-9);
  });

  test('MSE / dw / F / fPVal match runMultiRegression', () => {
    assertAlmostEqual(state.result.MSE,   ref.MSE,   1e-9);
    assertAlmostEqual(state.result.dw,    ref.dw,    1e-9);
    assertAlmostEqual(state.result.Fstat, ref.Fstat, 1e-9);
    assertAlmostEqual(state.result.fPVal, ref.fPVal, 1e-9);
  });

  test('coefDetails carry every legacy field', () => {
    const cd = state.result.coefDetails;
    assertEqual(cd[0].term, 'Intercept');
    for (const c of cd) {
      for (const key of ['term', 'coeff', 'se', 't', 'pval', 'ciLow', 'ciHigh']) {
        if (!(key in c)) throw new Error(`coefDetails entry missing key "${key}"`);
      }
    }
  });

  test('legacy aliases (_xNames, _termNames, _coefficients, allTerms) are present', () => {
    const r = state.result;
    assertEqual(Array.isArray(r._xNames),       true);
    assertEqual(Array.isArray(r._termNames),    true);
    assertEqual(Array.isArray(r._coefficients), true);
    assertEqual(Array.isArray(r.allTerms),      true);
    assertEqual(r._xNames[0], 'X1');
    assertEqual(r.multiX, true);
    assertEqual(r.xCount, 2);
  });

  test('new structured fields (spec, blockMap, blocks, fit) are surfaced', () => {
    const r = state.result;
    assertEqual(typeof r.spec, 'object');
    assertEqual(Array.isArray(r.blockMap), true);
    assertEqual(Array.isArray(r.blocks),   true);
    assertEqual(typeof r.fit, 'object');
    const expectedTerms = new Set(r.spec.terms.map(t => t.id));
    const blockTerms = new Set(r.blocks.map(b => b.id));
    for (const t of expectedTerms) {
      if (!blockTerms.has(t)) throw new Error(`block missing for term ${t}`);
    }
  });

  test('VIF is computed for both continuous predictors', () => {
    const r = state.result;
    assertEqual(r.vifFull.length, 2);
    assertEqual(r.vif.length,     2);
    if (!Number.isFinite(r.vifFull[0]) || !Number.isFinite(r.vifFull[1])) {
      throw new Error(`expected finite VIF, got ${JSON.stringify(r.vifFull)}`);
    }
  });
});

// ─── Mixed: continuous + binary categorical via column meta ────────

suite('Regression model — binary categorical predictor via column meta', () => {
  const xs   = [-1, -1, -1, -1,  1,  1,  1,  1];
  const tool = ['Steel', 'Steel', 'HSS', 'HSS', 'Steel', 'Steel', 'HSS', 'HSS'];
  const noise = [0.02, -0.03, 0.01, 0.04, -0.02, 0.03, -0.04, 0.01];
  const ys = xs.map((x, i) => 50 + 5 * x + (-3) * (tool[i] === 'Steel' ? -1 : 1) + noise[i]);

  const cols = [
    { id: 'cx',   name: 'X',    type: 'numeric', values: [...xs] },
    { id: 'ctool', name: 'Tool', type: 'text',
      values: [...tool],
      meta: {
        lock: 'hard',
        managedBy: 'doe-planner',
        managedRef: 'experiment:test',
        reason: 'design-factor',
        categoricalCoding: { Steel: -1, HSS: 1 },
      },
    },
    { id: 'cy',   name: 'Y',    type: 'numeric', values: [...ys] },
  ];
  const { state, sm, wsInstanceId, sheetId } = makeStub({ columns: cols, polyDegree: 1 });
  state.colRefs = [colRef(wsInstanceId, sheetId, 'cx'), colRef(wsInstanceId, sheetId, 'ctool')];
  state.yKey = `${wsInstanceId}|${sheetId}|cy`;
  const res = state.runPolynomial(sm, { instanceId: wsInstanceId, sheetId, columnId: 'cy' });

  test('runs without error', () => {
    assertEqual(res.ok, true);
    assertEqual(state.result != null, true);
  });

  test('Tool predictor is detected as categorical in the spec', () => {
    const tool = state.result.spec.predictors.find(p => p.id === 'Tool');
    assertEqual(tool.kind, 'categorical');
    assertEqual(tool.levels.includes('Steel'), true);
    assertEqual(tool.levels.includes('HSS'),   true);
  });

  test('Tool block is present and the indicator coefficient ≈ -3', () => {
    const r = state.result;
    const toolBlock = r.blocks.find(b => b.id === 'Tool');
    assertEqual(toolBlock.df, 1);
    const toolCoef = r.coefDetails.find(c => c.blockId === 'Tool');
    assertAlmostEqual(toolCoef.coeff, -3, 0.05);
  });

  test('hasCategorical flag is set, predict closure is null (UI cannot prompt for label yet)', () => {
    assertEqual(state.result.hasCategorical, true);
    assertEqual(state.result.reg.predict, null);
  });

  test('VIF is skipped entirely when only one continuous predictor remains', () => {
    assertEqual(state.result.vif,     null);
    assertEqual(state.result.vifFull, null);
  });
});
