/**
 * Tests for the commands of js/modules/doe-planner/domain/model.js —
 * factors, levels and responses, the design choice, the optimal design
 * (terms, forbidden combinations, source), the generation with its seed,
 * the preview edits and the EVOP project.
 */
import { suite, test, assert, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/doe-planner/domain/model.js';
import { setFields, confirmOf } from '../../../js/core/model.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { configSignature, designSignature } from '../../../js/modules/doe-planner/domain/signatures.js';
import { snapshotOf } from '../../../js/modules/doe-planner/domain/experiment.js';
import optimal from '../../../js/modules/doe-planner/domain/designs/optimal.js';
import { loadCases } from './cases.js';

const V1 = { version: '1.0' };

/** @param {() => any} fn @returns {any} the thrown error */
function errorOf(fn) {
  try { fn(); } catch (err) { return err; }
  throw new Error('Expected function to throw');
}

/** A valid 2² plan without a design. @param {object} [over] @returns {any} */
function planned(over = {}) {
  const base = new State().toJSON();
  return State.fromJSON({
    ...base,
    _schema: V1,
    factors: [
      { id: 1, name: 'Temp', unit: 'C', kind: 'continuous', levels: ['20', '40'] },
      { id: 2, name: 'Druck', unit: 'bar', kind: 'continuous', levels: ['1', '5'] },
    ],
    responses: [{ name: 'Yield', unit: '' }],
    ...over,
  });
}

/** A valid plan with three factors for an optimal design. @param {object} [over] @returns {any} */
function optimalPlan(over = {}) {
  return planned({
    designType: 'dopt',
    factors: [
      { id: 1, name: 'A', unit: '', kind: 'continuous', levels: ['0', '10'] },
      { id: 2, name: 'B', unit: '', kind: 'continuous', levels: ['0', '10'] },
      { id: 3, name: 'C', unit: '', kind: 'continuous', levels: ['0', '10'] },
    ],
    options: { ...new State().options, optimalRuns: 8 },
    ...over,
  });
}

const read = (m, data = null) => evaluateDerived(m, data);

suite('doe-planner commands — factors and levels', () => {
  test('addFactor returns max + 1 and clears forbidden combinations', () => {
    const s = planned({ factors: [
      { id: 4, name: 'A', unit: '', kind: 'continuous', levels: ['0', '1'] },
      { id: 9, name: 'B', unit: '', kind: 'continuous', levels: ['0', '1'] },
    ] });
    s.options = { ...s.options, forbiddenVertices: [[1, 1]] };
    assertEqual(s.addFactor(), 10);
    assertDeepEqual(s.factors[2], { id: 10, name: '', unit: '', kind: 'continuous', levels: ['', ''] });
    assertDeepEqual(s.options.forbiddenVertices, []);
  });

  test('addFactor clears a fractional cell for the old factor count', () => {
    const s = planned({ designType: 'frac' });
    s.selectResolution({ k: 2, runs: 4 });
    s.addFactor();
    assertEqual(s.selectedRes, null);
  });

  test('removeFactor checks the id and resets terms and forbidden combinations', () => {
    const s = optimalPlan();
    s.options = { ...s.options, optimalActiveTerms: ['M0', 'M1', 'M2', 'Q0'], forbiddenVertices: [[1, 1, 1]] };
    assertEqual(errorOf(() => s.removeFactor({ id: 7 })).param, 'id');
    s.removeFactor({ id: 2 });
    assertDeepEqual(s.factors.map((f) => f.id), [1, 3]);
    assertEqual(s.options.optimalActiveTerms, null);
    assertDeepEqual(s.options.forbiddenVertices, []);
  });

  test('insertLevel: unknown id → param id, position checked, frac falls back to full', () => {
    const s = planned({ designType: 'frac' });
    s.selectResolution({ k: 2, runs: 4 });
    assertEqual(errorOf(() => s.insertLevel({ id: 5, at: 0 })).param, 'id');
    assertEqual(errorOf(() => s.insertLevel({ id: 1, at: 3 })).param, 'at');
    s.insertLevel({ id: 1, at: 1 });
    assertDeepEqual(s.factors[0].levels, ['20', '', '40']);
    assertEqual(s.designType, 'full');
    assertEqual(s.selectedRes, null);
  });

  test('removeLevel keeps two levels: rejection with param index', () => {
    const s = planned();
    assertEqual(errorOf(() => s.removeLevel({ id: 1, index: 0 })).param, 'index');
    assertDeepEqual(s.factors[0].levels, ['20', '40']);
    s.insertLevel({ id: 1, at: 1 });
    assertEqual(errorOf(() => s.removeLevel({ id: 1, index: 3 })).param, 'index');
    assertEqual(errorOf(() => s.removeLevel({ id: 3, index: 0 })).param, 'id');
    s.removeLevel({ id: 1, index: 1 });
    assertDeepEqual(s.factors[0].levels, ['20', '40']);
  });
});

suite('doe-planner commands — responses', () => {
  test('addResponse returns the index', () => {
    const s = planned();
    assertEqual(s.addResponse(), 1);
    assertDeepEqual(s.responses[1], { name: '', unit: '' });
  });

  test('the last response stays (minResponses)', () => {
    const s = planned();
    const err = errorOf(() => s.removeResponse({ index: 0 }));
    assertEqual(err.invariant, 'minResponses');
    assertEqual(s.responses.length, 1);
    assertEqual(errorOf(() => s.removeResponse({ index: 4 })).param, 'index');
  });

  test('removing the analysed last response clamps analysisResponseIdx', () => {
    const s = planned({ responses: [{ name: 'Y1', unit: '' }, { name: 'Y2', unit: '' }] });
    s.setAnalysisResponse({ index: 1 });
    assertEqual(s.analysisResponseIdx, 1);
    s.removeResponse({ index: 1 });
    assertEqual(s.analysisResponseIdx, 0);
    assertEqual(errorOf(() => s.setAnalysisResponse({ index: 1 })).param, 'index');
  });
});

suite('doe-planner commands — design choice', () => {
  test('selectDesignType resets the selection; two-level-only types are refused for more levels', () => {
    const s = planned({ designType: 'pb', selectedPBIdx: 0 });
    s.selectDesignType({ type: 'ccd' });
    assertEqual(s.designType, 'ccd');
    assertEqual(s.selectedPBIdx, null);
    s.insertLevel({ id: 1, at: 1 });
    assertEqual(errorOf(() => s.selectDesignType({ type: 'frac' })).param, 'type');
    assertEqual(errorOf(() => s.selectDesignType({ type: 'xx' })).param, 'type');
  });

  test('an optimal type gets a default run count', () => {
    const s = planned();
    s.selectDesignType({ type: 'dopt' });
    assertEqual(s.options.optimalRuns, optimal.minNewRuns(s, { sourceRowCount: 0 }) + 2);
  });

  test('applyRecommendation takes the recommended type', () => {
    const s = planned({ designType: 'ccd' });
    assertEqual(s.applyRecommendation(), 'full');
    assertEqual(s.designType, 'full');
  });

  test('selectResolution needs frac, k = factor count and a table entry', () => {
    const s = planned();
    assertEqual(errorOf(() => s.selectResolution({ k: 2, runs: 4 })).param, 'k');
    s.selectDesignType({ type: 'frac' });
    assertEqual(errorOf(() => s.selectResolution({ k: 3, runs: 4 })).param, 'k');
    assertEqual(errorOf(() => s.selectResolution({ k: 2, runs: 64 })).param, 'runs');
    s.selectResolution({ k: 2, runs: 4 });
    assertEqual(s.selectedRes.k, 2);
    assertEqual(s.selectedRes.runs, 4);
  });

  test('selectPB and selectTaguchi check the type and the choice', () => {
    const s = planned();
    assertEqual(errorOf(() => s.selectPB({ index: 0 })).param, 'index');
    s.selectDesignType({ type: 'pb' });
    assertEqual(errorOf(() => s.selectPB({ index: 99 })).param, 'index');
    s.selectPB({ index: 0 });
    assertEqual(s.selectedPBIdx, 0);
    assertEqual(errorOf(() => s.selectTaguchi({ name: 'L4' })).param, 'name');
    s.selectDesignType({ type: 'taguchi' });
    assertEqual(errorOf(() => s.selectTaguchi({ name: 'L999' })).param, 'name');
    s.selectTaguchi({ name: 'L4' });
    assertEqual(s.options.taguchiArray, 'L4');
  });
});

suite('doe-planner commands — optimal design', () => {
  test('setTerm adds a term and raises the runs to the minimum', () => {
    const s = optimalPlan();
    s.options = { ...s.options, optimalRuns: 4 };
    s.setTerm({ id: 'Q0', on: true });
    assert(s.getActiveTerms().includes('Q0'), 'Q0 active');
    assertEqual(s.options.optimalRuns, optimal.minOptimalRuns(s, { sourceRowCount: 0 }));
    s.options = { ...s.options, optimalRuns: 20 };
    s.setTerm({ id: 'Q1', on: true });
    assertEqual(s.options.optimalRuns, 20);
  });

  test('main effects stay; unknown terms are refused', () => {
    const s = optimalPlan();
    assertEqual(errorOf(() => s.setTerm({ id: 'M0', on: false })).param, 'id');
    assertEqual(errorOf(() => s.setTerm({ id: 'Q7', on: true })).param, 'id');
  });

  test('setTermGroup switches every term of a group; the main effects stay', () => {
    const s = optimalPlan();
    s.setTermGroup({ group: 1, on: true });
    assert(s.getActiveTerms().includes('Q0') && s.getActiveTerms().includes('Q2'), 'squares on');
    s.setTermGroup({ group: 1, on: false });
    assert(!s.getActiveTerms().includes('Q0'), 'squares off');
    assertEqual(errorOf(() => s.setTermGroup({ group: 0, on: false })).param, 'group');
    assertEqual(errorOf(() => s.setTermGroup({ group: 99, on: true })).param, 'group');
  });

  test('addForbiddenVertex: one coded level or null per factor', () => {
    const s = optimalPlan();
    assertEqual(errorOf(() => s.addForbiddenVertex({ pattern: [1, 1] })).param, 'pattern');
    assertEqual(errorOf(() => s.addForbiddenVertex({ pattern: [0.5, 1, null] })).param, 'pattern');
    assertEqual(errorOf(() => s.addForbiddenVertex({ pattern: [null, null, null] })).param, 'pattern');
    assertEqual(s.addForbiddenVertex({ pattern: [1, null, -1] }), true);
    assertEqual(s.addForbiddenVertex({ pattern: [1, null, -1] }), false);
    assertDeepEqual(s.options.forbiddenVertices, [[1, null, -1]]);
    assertEqual(errorOf(() => s.removeForbiddenVertex({ index: 1 })).param, 'index');
    s.removeForbiddenVertex({ index: 0 });
    assertDeepEqual(s.options.forbiddenVertices, []);
  });

  test('choosing dopt on a 2-row source gives the old default run count', () => {
    const s = optimalPlan({ designType: 'full', options: { ...new State().options, optimalRuns: 0 } });
    s.setSourceWorksheet({ ref: { instanceId: 'ws-src', sheetId: 's-src' }, sourceRowCount: 2 });
    s.selectDesignType({ type: 'dopt', sourceRowCount: 2 });
    assertEqual(s.options.optimalRuns, optimal.minNewRuns(s, { sourceRowCount: 2 }) + 2);
    const t = optimalPlan({ designType: 'full', options: { ...new State().options, optimalRuns: 0 },
      sourceWorksheet: { instanceId: 'ws-src', sheetId: 's-src' } });
    t.selectDesignType({ type: 'dopt' });
    assertEqual(t.options.optimalRuns, optimal.minNewRuns(t, { sourceRowCount: 0 }) + 2, 'without rows: none');
  });

  test('adding squares on a 2-row source raises the runs like before', () => {
    const s = optimalPlan({ sourceWorksheet: { instanceId: 'ws-src', sheetId: 's-src' } });
    s.options = { ...s.options, optimalRuns: 1 };
    s.setTermGroup({ group: 1, on: true, sourceRowCount: 2 });
    assertEqual(s.options.optimalRuns, Math.max(1, optimal.minRuns(s) - 2));
    assert(s.options.optimalRuns > 1, 'raised');
  });

  test('without sourceRowCount the rows of a design built on the same source count', () => {
    const s = optimalPlan({ sourceWorksheet: { instanceId: 'ws-src', sheetId: 's-src' } });
    s.regenerate({ source: {
      codedMatrix: [[-1, -1, -1], [1, 1, 1], [1, -1, 1]], actualRows: [['0', '0', '0'], ['10', '10', '10'], ['10', '0', '10']],
      responseValues: [[1, 2, 3]], rowCount: 3, sheetRowCount: 3,
    } });
    s.options = { ...s.options, optimalRuns: 1 };
    s.setTermGroup({ group: 1, on: true });
    assertEqual(s.options.optimalRuns, Math.max(1, optimal.minRuns(s) - 3));
    s.setSourceWorksheet({ ref: { instanceId: 'ws-other', sheetId: 's-1' } });
    assertEqual(s.options.optimalRuns, optimal.minRuns(s), 'another source: its rows are unknown');
  });

  test('a source sheet that is gone: invalidReason source-not-found, no design', () => {
    const s = optimalPlan();
    s.setSourceWorksheet({ ref: { instanceId: 'ws-gone', sheetId: 's-1' } });
    const data = { sheet: () => null, sheets: () => null, values: () => null };
    assertEqual(read(s, data).valid, false);
    assertEqual(read(s, data).invalidReason, 'source-not-found');
    assertEqual(read(s, data).pending, false);
  });

  test('setSourceWorksheet sets and clears; the own datasheet is no source', () => {
    const s = optimalPlan();
    s.setSourceWorksheet({ ref: { instanceId: 'ws-src', sheetId: 's-src' } });
    assertDeepEqual(s.sourceWorksheet, { instanceId: 'ws-src', sheetId: 's-src' });
    s.setSourceWorksheet({ ref: null });
    assertEqual(s.sourceWorksheet, null);
  });
});

suite('doe-planner commands — regenerate and reshuffle', () => {
  test('regenerate makes the design for the configuration; twice gives the same plan', () => {
    const s = planned();
    assertEqual(read(s).pending, true);
    s.regenerate({ source: null });
    assertEqual(s.design.codedMatrix.length, 4);
    assertEqual(s.design.configSignature, configSignature(s));
    assertEqual(read(s).pending, false);
    const first = JSON.stringify(s.design);
    s.regenerate();
    assertEqual(JSON.stringify(s.design), first);
  });

  test('seed 0 gives the plans the planner made before for the examples', async () => {
    // The augment example builds on a source worksheet; the case has none.
    const cases = (await loadCases()).filter((x) => x.name !== 'seeded' && x.name !== 'doe-optimal-augment-3f');
    assertEqual(cases.length, 4);
    for (const c of cases) {
      const s = planned({ ...c.model, factors: c.model.factors.map((f, i) => ({ id: i + 1, ...f })) });
      s.regenerate();
      assertDeepEqual(s.design.codedMatrix, c.design.codedMatrix, c.name);
      assertDeepEqual(s.design.stdOrder, c.design.stdOrder, c.name);
      assertDeepEqual(s.design.actualMatrix, c.design.actualMatrix.map((r) => r.map(String)), c.name);
    }
  });

  test('reshuffle draws a new seed; the next design has another run order', () => {
    const s = planned({ factors: [
      { id: 1, name: 'A', unit: '', kind: 'continuous', levels: ['0', '1'] },
      { id: 2, name: 'B', unit: '', kind: 'continuous', levels: ['0', '1'] },
      { id: 3, name: 'C', unit: '', kind: 'continuous', levels: ['0', '1'] },
      { id: 4, name: 'D', unit: '', kind: 'continuous', levels: ['0', '1'] },
    ] });
    s.regenerate();
    const before = [...s.design.stdOrder];
    const random = Math.random;
    const draws = [0, 0, 0.5];
    Math.random = () => draws.shift();
    try {
      s.reshuffle();
      assertEqual(s.seed, 1);
      // The same seed again is drawn anew.
      s.reshuffle();
      assertEqual(s.seed, 1 + Math.floor(0.5 * 2147483647));
    } finally {
      Math.random = random;
    }
    assertEqual(read(s).pending, true);
    s.regenerate();
    assertEqual(read(s).pending, false);
    assert(JSON.stringify(s.design.stdOrder) !== JSON.stringify(before), 'another run order');
  });

  test('an invalid configuration leaves no design', () => {
    const s = planned();
    s.regenerate();
    s.factors = [{ ...s.factors[0], name: '' }, s.factors[1]];
    s.regenerate();
    assertEqual(s.design, null);
  });

  test('optimal design on a source worksheet: source null is refused, a source builds on it', () => {
    const s = optimalPlan({ sourceWorksheet: { instanceId: 'ws-src', sheetId: 's-src' } });
    setFields(s, { factors: s.factors.map((f) => (f.id === 3 ? { ...f, levels: ['0', '20'] } : f)) });
    assertEqual(read(s).pending, true);
    assertEqual(read(s).evaluation, null);
    assertEqual(read(s).experiment, null);
    assertEqual(errorOf(() => s.regenerate()).param, 'source');
    assertEqual(errorOf(() => s.regenerate({ source: null })).param, 'source');
    const source = {
      codedMatrix: [[-1, -1, -1], [1, 1, 1]],
      actualRows: [['0', '0', '0'], ['10', '10', '20']],
      responseValues: [[3, 5]],
      rowCount: 2,
      sheetRowCount: 2,
    };
    s.regenerate({ source });
    assertEqual(s.design.sourceRowCount, 2);
    assertDeepEqual(s.design.sourceResponseSeeds, [[3, 5]]);
    assertDeepEqual(s.design.actualMatrix.slice(0, 2), source.actualRows);
    assertEqual(s.design.codedMatrix.length, 2 + 8);
    assertEqual(read(s).pending, false);
    const first = JSON.stringify(s.design);
    s.regenerate({ source });
    assertEqual(JSON.stringify(s.design), first);
  });

  test('a source with invalid rows still builds; validity counts every sheet row', () => {
    const s = optimalPlan({ sourceWorksheet: { instanceId: 'ws-src', sheetId: 's-src' } });
    s.options = { ...s.options, optimalRuns: 1 };
    // Five sheet rows, two of them valid.
    s.regenerate({ source: {
      codedMatrix: [[-1, -1, -1], [1, 1, 1]], actualRows: [['0', '0', '0'], ['10', '10', '10']],
      responseValues: [[3, 5]], rowCount: 2, sheetRowCount: 5,
    } });
    assert(s.design !== null, 'design built');
    assertEqual(s.options.optimalRuns, optimal.minOptimalRuns(s, { sourceRowCount: 5 }));
    assertEqual(s.design.sourceRowCount, 2);
    assertEqual(s.design.codedMatrix.length, 2 + Math.max(s.options.optimalRuns, optimal.minRuns(s) - 2));
  });

  test('a source without a source worksheet is refused', () => {
    const s = optimalPlan();
    const source = { codedMatrix: [], actualRows: [], responseValues: [], rowCount: 0, sheetRowCount: 0 };
    assertEqual(errorOf(() => s.regenerate({ source })).param, 'source');
  });

  test('a failing evaluation keeps the design and throws', () => {
    const s = planned();
    s.regenerate();
    const kept = JSON.stringify(s.design);
    s.options = { ...s.options, randomize: false };
    const proto = /** @type {any} */ (State).prototype;
    const original = proto.evaluateFor;
    proto.evaluateFor = () => { throw new Error('singular'); };
    try {
      assert(/singular/.test(errorOf(() => s.regenerate()).message), 'throws');
    } finally {
      proto.evaluateFor = original;
    }
    assertEqual(JSON.stringify(s.design), kept);
  });

  test('a failing generation keeps the design and throws', () => {
    const s = planned({ designType: 'ccd' });
    s.regenerate();
    const kept = JSON.stringify(s.design);
    // CCD with a categorical factor needs two continuous ones.
    s.factors = [{ ...s.factors[0], kind: 'categorical', levels: ['a', 'b'] }, s.factors[1]];
    errorOf(() => s.regenerate());
    assertEqual(JSON.stringify(s.design), kept);
  });
});

suite('doe-planner commands — preview', () => {
  test('locked columns refuse; a continuous factor cell is an edit; discard clears', () => {
    const s = planned();
    s.regenerate();
    assertEqual(errorOf(() => s.setPreviewCell({ row: 0, column: 'run', value: 3 })).param, 'column');
    assertEqual(errorOf(() => s.setPreviewCell({ row: 0, column: 'f:9', value: 3 })).param, 'column');
    assertEqual(errorOf(() => s.setPreviewCell({ row: 9, column: 'f:1', value: 3 })).param, 'row');
    s.setPreviewCell({ row: 1, column: 'f:1', value: 33 });
    assertEqual(s.previewEdits.factors[0][1], 33);
    s.setPreviewCell({ row: 2, column: 'r:0', value: 7.5 });
    assertEqual(s.previewEdits.responses[0][2], 7.5);
    s.discardPreviewEdits();
    assertEqual(s.previewEdits, null);
  });

  test('reverting every cell leaves no edits', () => {
    const s = planned();
    s.regenerate();
    s.setPreviewCell({ row: 1, column: 'f:1', value: 33 });
    s.setPreviewCell({ row: 1, column: 'f:1', value: null });
    assertEqual(s.previewEdits, null);
  });

  test('a categorical factor column refuses a single edit', () => {
    const s = planned();
    s.factors = [{ ...s.factors[0], kind: 'categorical', levels: ['a', 'b'] }, s.factors[1]];
    s.regenerate();
    assertEqual(errorOf(() => s.setPreviewCell({ row: 0, column: 'f:1', value: 1 })).param, 'column');
  });

  test('setPreviewCells: row-major from a cell to the right, beyond the design ignored', () => {
    const s = planned();
    s.factors = [{ ...s.factors[0], kind: 'categorical', levels: ['a', 'b'] }, s.factors[1]];
    s.regenerate();
    // Columns: run std block rep f:1 f:2 r:0 — f:1 is categorical and ignored.
    s.setPreviewCells({ row: 2, column: 'rep', values: [[9, 1, 2, 3, 4], [9, 1, 5, 6, 7], [9, 1, 8, 9, 9]] });
    assertDeepEqual(s.previewEdits.factors[0], [null, null, null, null]);
    assertDeepEqual(s.previewEdits.factors[1], [null, null, 2, 5]);
    assertDeepEqual(s.previewEdits.responses[0], [null, null, 3, 6]);
    assertEqual(errorOf(() => s.setPreviewCells({ row: 0, column: 'x', values: [[1]] })).param, 'column');
  });

  test('forbidRun forbids the coded combination of a row of an optimal design', () => {
    const s = optimalPlan();
    s.regenerate();
    const coded = [...s.design.codedMatrix[0]];
    assertEqual(s.forbidRun({ row: 0 }), true);
    assertDeepEqual(s.options.forbiddenVertices, [coded]);
    assertEqual(s.forbidRun({ row: 0 }), false);
    assertEqual(errorOf(() => s.forbidRun({ row: 99 })).param, 'row');
    const p = planned();
    p.regenerate();
    assertEqual(errorOf(() => p.forbidRun({ row: 0 })).param, 'row');
  });

  test('regenerate drops the preview edits', () => {
    const s = planned();
    s.regenerate();
    s.setPreviewCell({ row: 0, column: 'r:0', value: 1 });
    s.options = { ...s.options, randomize: false };
    s.regenerate();
    assertEqual(s.previewEdits, null);
  });
});

suite('doe-planner commands — EVOP', () => {
  test('setProjectMode opens phase 1', () => {
    const s = planned();
    s.setProjectMode({ on: true });
    assertEqual(s.projectMode, true);
    assertEqual(s.projectPhases.length, 1);
    assertEqual(s.activePhaseIdx, 0);
    s.setProjectMode({ on: false });
    s.setProjectMode({ on: true });
    assertEqual(s.projectPhases.length, 1);
  });

  test('completePhase asks first and stores every response and the selection', () => {
    const s = planned({ designType: 'frac', responses: [{ name: 'Y1', unit: '' }, { name: 'Y2', unit: '' }] });
    s.selectResolution({ k: 2, runs: 4 });
    s.setSourceWorksheet({ ref: { instanceId: 'ws-src', sheetId: 's-src' } });
    s.setProjectMode({ on: true });
    s.regenerate();
    assertDeepEqual(confirmOf(s, 'completePhase', { decision: 'repeat' }),
      { key: 'confirm.completePhase', params: { decision: 'repeat' } });
    const y = [[1, 2, 3, 4], [5, 6, null, 8]];
    s.completePhase({ decision: 'repeat', yValues: y });
    const ph = s.projectPhases[0];
    assertEqual(ph.decision, 'repeat');
    assertDeepEqual(ph.yValues, y);
    assertEqual(ph.selectedRes.k, 2);
    assertEqual(ph.selectedPBIdx, null);
    assertDeepEqual(ph.sourceWorksheet, { instanceId: 'ws-src', sheetId: 's-src' });
    assert(ph.design !== null, 'design stored');
    assertEqual(s.projectPhases.length, 2);
    assertEqual(s.activePhaseIdx, 1);
    assertEqual(errorOf(() => s.completePhase({ decision: 'pause' })).param, 'decision');
  });

  test('completePhase without yValues stores null; stop opens no phase; a decided phase is not closed again', () => {
    const s = planned();
    s.setProjectMode({ on: true });
    s.completePhase({ decision: 'stop' });
    assertEqual(s.projectPhases[0].yValues, null);
    assertEqual(s.projectPhases.length, 1);
    assertEqual(errorOf(() => s.completePhase({ decision: 'repeat' })).param, 'decision');
    assertEqual(confirmOf(s, 'completePhase', { decision: 'repeat' }), null);
    assertEqual(errorOf(() => s.newPhase()).param, 'activePhaseIdx');
  });

  test('newPhase needs a decided active phase and drops the preview edits', () => {
    const s = planned();
    s.setProjectMode({ on: true });
    assertEqual(errorOf(() => s.newPhase()).param, 'activePhaseIdx');
    s.regenerate();
    s.completePhase({ decision: 'repeat', yValues: [[1, 2, 3, 4]] });
    s.regenerate();
    s.setPreviewCell({ row: 0, column: 'r:0', value: 1 });
    s.completePhase({ decision: 'repeat', yValues: [[1, 2, 3, 4]] });
    assertEqual(s.previewEdits, null);
    s.regenerate();
    s.setPreviewCell({ row: 0, column: 'r:0', value: 1 });
    s.projectPhases[2].decision = 'repeat';
    assertEqual(s.newPhase(), 3);
    assertEqual(s.previewEdits, null);
    assertEqual(s.design, null);
  });

  test('viewPhase restores plan, design and selection', () => {
    const s = planned({ designType: 'frac' });
    s.selectResolution({ k: 2, runs: 4 });
    s.setSourceWorksheet({ ref: { instanceId: 'ws-src', sheetId: 's-src' } });
    s.setProjectMode({ on: true });
    s.regenerate();
    const design = JSON.stringify(s.design);
    s.completePhase({ decision: 'repeat', yValues: [[1, 2, 3, 4]] });
    s.selectDesignType({ type: 'full' });
    s.setSourceWorksheet({ ref: null });
    s.reshuffle();
    s.regenerate();
    assertEqual(errorOf(() => s.viewPhase({ index: 5 })).param, 'index');
    s.viewPhase({ index: 0 });
    assertEqual(s.activePhaseIdx, 0);
    assertEqual(s.designType, 'frac');
    assertEqual(s.selectedRes.runs, 4);
    assertDeepEqual(s.sourceWorksheet, { instanceId: 'ws-src', sheetId: 's-src' });
    assertEqual(JSON.stringify(s.design), design);
    assertEqual(read(s).pending, false);
  });

  test('recenter without values keeps the levels', () => {
    const s = planned();
    s.setProjectMode({ on: true });
    s.regenerate();
    s.completePhase({ decision: 'recenter' });
    assertDeepEqual(s.factors[0].levels, ['20', '40']);
    assertEqual(s.projectPhases.length, 2);
  });

  test('a recentered phase moves the levels to the best run', () => {
    const s = planned();
    s.options = { ...s.options, randomize: false };
    s.setProjectMode({ on: true });
    s.regenerate();
    // Best run: Temp high, Druck high (std order 4).
    s.completePhase({ decision: 'recenter', yValues: [[1, 2, 3, 10]] });
    assertEqual(s.projectPhases.length, 2);
    assert(JSON.stringify(s.factors[0].levels) !== JSON.stringify(['20', '40']), 'levels moved');
  });
});

suite('doe-planner commands — appendRuns', () => {
  /** An optimal plan with a design and a datasheet bound to it. @returns {any} */
  function boundOptimal() {
    const s = optimalPlan();
    s.regenerate();
    s.worksheetRef = {
      instanceId: 'ws-1', sheetId: 'sheet_1', factorColumnIds: ['a', 'b', 'c'], responseColumnIds: ['y'],
      meanColumnIds: [], lnVarColumnIds: [], runOrderColumnId: 'run', stdOrderColumnId: 'std',
      designSignature: designSignature(s),
      snapshot: snapshotOf(s, s.design),
    };
    return s;
  }

  test('appends coded rows with actual values, run and std order, keeps the plan current and bound', () => {
    const s = boundOptimal();
    const n = s.design.codedMatrix.length;
    const groups = s.worksheetRef.snapshot.replicateGroups.length;
    const total = s.appendRuns({ rows: [[1, 1, 1], [1, 1, 1]] });
    assertEqual(total, n + 2);
    assertEqual(s.design.codedMatrix.length, n + 2);
    assertDeepEqual(s.design.actualMatrix.slice(-2), [['10', '10', '10'], ['10', '10', '10']]);
    assertDeepEqual(s.design.runOrder.slice(-2), [n + 1, n + 2]);
    assertDeepEqual(s.design.stdOrder.slice(-2), [n + 1, n + 2]);
    assertDeepEqual(s.design.replicateIds.slice(-2), [1, 1]);
    assertEqual(s.worksheetRef.designSignature, designSignature(s));
    assertDeepEqual(s.worksheetRef.snapshot.replicateGroups, snapshotOf(s, s.design).replicateGroups);
    assert(s.worksheetRef.snapshot.replicateGroups.length >= groups, 'replicate groups kept or grown');
    assertEqual(read(s).pending, false);
  });

  test('rejects rows of the wrong width, an unbound or stale plan, and leaves everything unchanged', () => {
    const s = boundOptimal();
    const before = JSON.stringify(s.toJSON());
    assertEqual(errorOf(() => s.appendRuns({ rows: [[1, 1]] })).param, 'rows');
    assertEqual(errorOf(() => s.appendRuns({ rows: [] })).param, 'rows');
    assertEqual(JSON.stringify(s.toJSON()), before);
    const stale = boundOptimal();
    stale.worksheetRef = { ...stale.worksheetRef, designSignature: 'other' };
    assertEqual(errorOf(() => stale.appendRuns({ rows: [[1, 1, 1]] })).param, 'rows');
    const unbound = optimalPlan();
    unbound.regenerate();
    assertEqual(errorOf(() => unbound.appendRuns({ rows: [[1, 1, 1]] })).param, 'rows');
  });

  test('in a project the active phase takes the appended runs', () => {
    const s = boundOptimal();
    s.setProjectMode({ on: true });
    s.appendRuns({ rows: [[-1, -1, -1]] });
    const ph = s.projectPhases[s.activePhaseIdx];
    assertEqual(ph.design.codedMatrix.length, s.design.codedMatrix.length);
    assertEqual(ph.worksheetRef.designSignature, s.worksheetRef.designSignature);
  });
});
