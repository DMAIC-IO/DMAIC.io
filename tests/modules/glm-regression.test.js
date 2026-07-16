/**
 * Unit tests for the GLM Regression Model (glm-regression-model.js).
 * Written TDD-first (Red → Green → Refactor) before the model implementation.
 *
 * Covers: defaults, toJSON/fromJSON round-trip + deep-copy safety,
 * sanitization, hasContent/canRun gates, slimResult stripping, the worksheet
 * column read + row-filter (buildFitData), family resolution, and the
 * structuredClone-safety of the persisted shape.
 */
import { suite, test, assertEqual } from '../test-utils.js';
import { State } from '../../js/modules/glm-regression/glm-regression-model.js';

// ── Minimal fake stateManager exposing one worksheet ────────────────
function makeSM(columns) {
  // columns: [{ id, name, type, values }]
  const ws = { sheets: [{ id: 'sheet-1', name: 'S1', state: { columns } }] };
  return {
    getModuleState: (id) => (id === 'inst-1' ? ws : null),
  };
}
const ref = (columnId) => ({ instanceId: 'inst-1', sheetId: 'sheet-1', columnId });

suite('GLM Regression Model — defaults & persistence', () => {
  test('constructor sets defaults', () => {
    const s = new State();
    assertEqual(Array.isArray(s.colRefs), true);
    assertEqual(s.colRefs.length, 0);
    assertEqual(s.yKey, null);
    assertEqual(s.trialsKey, null);
    assertEqual(s.successClass, null);
    assertEqual(s.method, 'auto');
    assertEqual(s.confLevel, null);
    assertEqual(s.alpha, null);
    assertEqual(s.cutoff, 0.5);
    assertEqual(s.activeTab, 'model');
    assertEqual(s.exampleWorksheetId, null);
    assertEqual(s.savedModelId, null);
    assertEqual(s.savedModelName, null);
    assertEqual(s.result, null);
  });

  test('toJSON returns the legacy getState shape', () => {
    const s = new State();
    s.colRefs = [ref('c-y'), ref('c-x')];
    s.yKey = 'inst-1|sheet-1|c-y';
    s.trialsKey = 'inst-1|sheet-1|c-t';
    s.successClass = 1;
    s.method = 'binomial';
    s.confLevel = 0.95;
    s.alpha = 0.05;
    s.cutoff = 0.3;
    s.activeTab = 'roc';
    s.exampleWorksheetId = 'ex-1';
    s.savedModelId = 'mid';
    s.savedModelName = 'My Model';
    s.result = { converged: true, _slim: true };
    const j = s.toJSON();
    const keys = Object.keys(j).sort();
    assertEqual(keys.join(','),
      ['activeTab', 'alpha', 'colRefs', 'confLevel', 'cutoff', 'exampleWorksheetId',
        'method', 'result', 'savedModelId', 'savedModelName', 'successClass', 'trialsKey', 'yKey'].join(','));
    assertEqual(j.method, 'binomial');
    assertEqual(j.yKey, 'inst-1|sheet-1|c-y');
    assertEqual(j.cutoff, 0.3);
  });

  test('toJSON deep-copies colRefs and result (structuredClone-safe)', () => {
    const s = new State();
    s.colRefs = [ref('c-x')];
    s.result = { converged: true, nested: { arr: [1, 2, 3] } };
    const j = s.toJSON();
    // mutate originals — snapshot must not change
    s.colRefs[0].columnId = 'MUTATED';
    s.result.nested.arr.push(99);
    assertEqual(j.colRefs[0].columnId, 'c-x');
    assertEqual(j.result.nested.arr.length, 3);
    // structuredClone must succeed (no live proxy refs)
    const cloned = structuredClone(j);
    assertEqual(cloned.colRefs[0].columnId, 'c-x');
  });

  test('fromJSON(null) yields a valid default', () => {
    const s = State.fromJSON(null);
    assertEqual(s.colRefs.length, 0);
    assertEqual(s.method, 'auto');
    assertEqual(s.cutoff, 0.5);
    assertEqual(s.activeTab, 'model');
  });

  test('fromJSON(undefined) yields a valid default', () => {
    const s = State.fromJSON(undefined);
    assertEqual(s.method, 'auto');
    assertEqual(s.yKey, null);
  });

  test('fromJSON restores and sanitizes', () => {
    const s = State.fromJSON({
      colRefs: [ref('c-x'), null, ref('c-z')],
      yKey: 'inst-1|sheet-1|c-y',
      trialsKey: 'inst-1|sheet-1|c-t',
      successClass: 0,
      method: 'poisson',
      confLevel: 0.99,
      alpha: 0.01,
      cutoff: 0.7,
      activeTab: 'prediction',
      exampleWorksheetId: 'ex',
      savedModelId: 'sid',
      savedModelName: 'N',
      result: { converged: true },
    });
    assertEqual(s.colRefs.length, 2); // null dropped
    assertEqual(s.method, 'poisson');
    assertEqual(s.confLevel, 0.99);
    assertEqual(s.cutoff, 0.7);
    assertEqual(s.activeTab, 'prediction');
    assertEqual(s.savedModelId, 'sid');
  });

  test('fromJSON rejects invalid method / activeTab / cutoff', () => {
    const s = State.fromJSON({ method: 'gamma', activeTab: 'bogus', cutoff: 5 });
    assertEqual(s.method, 'auto');
    assertEqual(s.activeTab, 'model');
    assertEqual(s.cutoff, 0.5);
  });

  test('toJSON → fromJSON round-trip is lossless', () => {
    const s = new State();
    s.colRefs = [ref('c-y'), ref('c-x')];
    s.yKey = 'inst-1|sheet-1|c-y';
    s.method = 'negbin';
    s.confLevel = 0.9;
    s.alpha = 0.1;
    s.cutoff = 0.25;
    s.activeTab = 'diagnostics';
    s.savedModelId = 'abc';
    const back = State.fromJSON(s.toJSON());
    assertEqual(back.yKey, s.yKey);
    assertEqual(back.method, s.method);
    assertEqual(back.confLevel, s.confLevel);
    assertEqual(back.cutoff, s.cutoff);
    assertEqual(back.activeTab, s.activeTab);
    assertEqual(back.savedModelId, 'abc');
    assertEqual(back.colRefs.length, 2);
  });
});

suite('GLM Regression Model — gates', () => {
  test('hasContent true when colRefs / yKey / trialsKey set', () => {
    assertEqual(new State().hasContent(), false);
    const a = new State(); a.colRefs = [ref('x')];
    assertEqual(a.hasContent(), true);
    const b = new State(); b.yKey = 'k';
    assertEqual(b.hasContent(), true);
    const c = new State(); c.trialsKey = 'k';
    assertEqual(c.hasContent(), true);
  });

  test('canRun requires at least one predictor and a yKey', () => {
    const s = new State();
    assertEqual(s.canRun(), false);
    s.colRefs = [ref('x')];
    assertEqual(s.canRun(), false);
    s.yKey = 'inst-1|sheet-1|c-y';
    assertEqual(s.canRun(), true);
  });
});

suite('GLM Regression Model — slimResult', () => {
  test('slimResult strips heavy arrays and flags _slim', () => {
    const r = {
      converged: true, coefficients: [1, 2],
      X: [[1, 2]], y: [0, 1], invXtWX: [[1]], XtWX: [[1]], irlsWeights: [1],
      fittedValues: [0.5], linearPredictor: [0.1], devianceResiduals: [0.2],
      pearsonResiduals: [0.3], _hat: [0.1], _cooks: [0.2],
    };
    const slim = new State().slimResult(r);
    assertEqual(slim._slim, true);
    assertEqual(slim.X, undefined);
    assertEqual(slim.y, undefined);
    assertEqual(slim.invXtWX, undefined);
    assertEqual(slim.irlsWeights, undefined);
    assertEqual(slim.fittedValues, undefined);
    assertEqual(slim.devianceResiduals, undefined);
    assertEqual(slim._cooks, undefined);
    assertEqual(slim.converged, true);
    assertEqual(slim.coefficients.length, 2);
    // original untouched
    assertEqual(r.X.length, 1);
  });

  test('slimResult(null) returns null', () => {
    assertEqual(new State().slimResult(null), null);
  });
});

suite('GLM Regression Model — column reads & buildFitData', () => {
  const cols = [
    { id: 'c-y', name: 'Pass', type: 'numeric', values: [0, 1, 0, 1, 1, 0] },
    { id: 'c-x', name: 'Temp', type: 'numeric', values: [10, 20, 30, 40, 50, 60] },
    { id: 'c-cat', name: 'Line', type: 'text', values: ['A', 'B', 'A', 'B', 'A', 'B'] },
  ];

  test('toNumeric coerces and rejects', () => {
    const s = new State();
    assertEqual(s.toNumeric('3.5'), 3.5);
    assertEqual(s.toNumeric(7), 7);
    assertEqual(s.toNumeric('abc'), null);
    assertEqual(s.toNumeric(null), null);
    assertEqual(s.toNumeric(''), null);
  });

  test('isCategorical reflects text column type', () => {
    const s = new State();
    const sm = makeSM(cols);
    assertEqual(s.isCategorical(sm, ref('c-cat')), true);
    assertEqual(s.isCategorical(sm, ref('c-x')), false);
  });

  test('columnDisplayName resolves the column name', () => {
    const s = new State();
    const sm = makeSM(cols);
    assertEqual(s.columnDisplayName(sm, ref('c-x')), 'Temp');
    assertEqual(s.columnDisplayName(sm, null), '?');
  });

  test('buildFitData filters rows and returns aligned arrays', () => {
    const s = new State();
    s.colRefs = [ref('c-x')];
    s.yKey = 'inst-1|sheet-1|c-y';
    const sm = makeSM(cols);
    const fd = s.buildFitData(sm);
    assertEqual(fd.y.length, 6);
    assertEqual(fd.xNames[0], 'Temp');
    assertEqual(fd.xIsCat[0], false);
    assertEqual(fd.yName, 'Pass');
    assertEqual(fd.xCols[0].length, 6);
    assertEqual(fd.weights, null);
  });

  test('buildFitData drops rows with missing predictor / non-numeric y', () => {
    const dirty = [
      { id: 'c-y', name: 'Y', type: 'numeric', values: [0, 'x', 1, 1] },
      { id: 'c-x', name: 'X', type: 'numeric', values: [1, 2, null, 4] },
    ];
    const s = new State();
    s.colRefs = [ref('c-x')];
    s.yKey = 'inst-1|sheet-1|c-y';
    const fd = s.buildFitData(makeSM(dirty));
    // row1 (y='x') and row2 (x=null) dropped → 2 rows remain
    assertEqual(fd.y.length, 2);
    assertEqual(fd.y[0], 0);
    assertEqual(fd.y[1], 1);
    assertEqual(fd.xCols[0][0], 1);
    assertEqual(fd.xCols[0][1], 4);
  });

  test('buildFitData honours a trials column (weights), dropping w<=0', () => {
    const cw = [
      { id: 'c-y', name: 'P', type: 'numeric', values: [0.1, 0.2, 0.3, 0.4] },
      { id: 'c-x', name: 'X', type: 'numeric', values: [1, 2, 3, 4] },
      { id: 'c-t', name: 'N', type: 'numeric', values: [10, 0, 20, 5] },
    ];
    const s = new State();
    s.colRefs = [ref('c-x')];
    s.yKey = 'inst-1|sheet-1|c-y';
    s.trialsKey = 'inst-1|sheet-1|c-t';
    const fd = s.buildFitData(makeSM(cw));
    assertEqual(fd.weights.length, 3); // row with N=0 dropped
    assertEqual(fd.weights[0], 10);
    assertEqual(fd.weights[1], 20);
    assertEqual(fd.y.length, 3);
  });

  test('buildFitData keeps categorical raw values', () => {
    const s = new State();
    s.colRefs = [ref('c-cat')];
    s.yKey = 'inst-1|sheet-1|c-y';
    const fd = s.buildFitData(makeSM(cols));
    assertEqual(fd.xIsCat[0], true);
    assertEqual(fd.xCols[0][0], 'A');
    assertEqual(fd.xCols[0][1], 'B');
  });
});

suite('GLM Regression Model — resolveFamily', () => {
  test('explicit binomial → logit', () => {
    const s = new State(); s.method = 'binomial';
    const f = s.resolveFamily([0, 1, 0, 1]);
    assertEqual(f.familyName, 'binomial');
    assertEqual(f.link, 'logit');
    assertEqual(f.auto, false);
  });

  test('explicit poisson / negbin → log', () => {
    const sp = new State(); sp.method = 'poisson';
    assertEqual(sp.resolveFamily([0, 1, 2, 3]).link, 'log');
    const sn = new State(); sn.method = 'negbin';
    assertEqual(sn.resolveFamily([0, 1, 2, 3]).link, 'log');
  });

  test('auto detects binary as binomial', () => {
    const s = new State(); s.method = 'auto';
    const f = s.resolveFamily([0, 1, 1, 0, 1]);
    assertEqual(f.familyName, 'binomial');
    assertEqual(f.auto, true);
    assertEqual(typeof f.reasonKey, 'string');
  });

  test('auto detects count data as poisson', () => {
    const s = new State(); s.method = 'auto';
    const f = s.resolveFamily([1, 2, 3, 4, 5, 2, 3]);
    assertEqual(f.familyName, 'poisson');
    assertEqual(f.auto, true);
  });
});
