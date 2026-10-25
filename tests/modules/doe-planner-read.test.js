/**
 * D.Mike — doe-planner read surface (doe-planner-read.js)
 * Spec: docs/superpowers/specs/2026-10-25-doe-planner-teil-viewmodels-design.md (E7)
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { agentSnapshot } from '../../js/modules/doe-planner/doe-planner-read.js';
import { withEdit } from '../../js/modules/doe-planner/doe-planner-runtable.js';
import { fakeContext, plannedState, withDesign, linkWorksheet } from './doe-planner-vm-fakes.js';

suite('doe-planner read — plan', () => {
  test('a valid plan without a design', () => {
    const r = agentSnapshot(plannedState(), fakeContext());
    assertEqual(r.valid, true);
    assertEqual(r.invalidReason, null);
    assertDeepEqual(r.summary, { runs: 4, resolution: 'Full', generatedRuns: 0 });
    assertDeepEqual(r.typeParams, { selectedRes: null, selectedPBIdx: null });
    assertDeepEqual(r.runs, []);
    assertEqual(r.worksheet, null);
    assertEqual(r.evaluation, null);
    assertEqual(r.evop, null);
    assertEqual(r.factors[1].name, 'Druck');
    assertEqual(r.options.replicates, 1);
  });

  test('an invalid plan names its reason', () => {
    const s = plannedState();
    s.responses[0].name = '';
    let r = agentSnapshot(s, fakeContext());
    assertEqual(r.valid, false);
    assertEqual(r.invalidReason, 'unnamedResponse');
    s.responses[0].name = 'Yield';
    s.designType = 'frac';
    r = agentSnapshot(s, fakeContext());
    assertEqual(r.invalidReason, 'noResolution');
    assertEqual(r.summary.runs, null);
  });

  test('the copies are detached from the model', () => {
    const s = plannedState();
    const r = agentSnapshot(s, fakeContext());
    r.factors[0].name = 'x';
    r.options.replicates = 9;
    assertEqual(s.factors[0].name, 'Temp');
    assertEqual(s.options.replicates, 1);
  });
});

suite('doe-planner read — runs and datasheet', () => {
  test('the preview with its edits', () => {
    const s = withDesign(plannedState());
    s.previewEdits = withEdit(s, 1, { kind: 'response', index: 0 }, 12.5).edits;
    const r = agentSnapshot(s, fakeContext());
    assertEqual(r.summary.generatedRuns, 4);
    assertEqual(r.runs.length, 4);
    assertEqual(r.runs[1].run, 2);
    assertDeepEqual(r.runs[1].factors, { Temp: 40, Druck: 1 });
    assertDeepEqual(r.runs[1].responses, { Yield: 12.5 });
  });

  test('a bound datasheet supplies values and fill state', () => {
    const ctx = fakeContext();
    const s = withDesign(plannedState());
    linkWorksheet(ctx, s, [10, null, 11, 20]);
    const r = agentSnapshot(s, ctx);
    assertDeepEqual(r.worksheet, { instanceId: 'ws-1', sheetId: 's-1', stale: false, filled: 3, total: 4 });
    assertEqual(r.runs[0].responses.Yield, 10);
    assertEqual(r.runs[1].responses.Yield, null);
  });

  test('an outdated datasheet is stale; the runs come from the preview', () => {
    const ctx = fakeContext();
    const s = withDesign(plannedState());
    linkWorksheet(ctx, s, [10, 12, 11, 20]);
    s.responses[0].unit = '%';
    const r = agentSnapshot(s, ctx);
    assertEqual(r.worksheet.stale, true);
    assertEqual(r.runs[0].responses.Yield, null);
  });

  test('a deleted datasheet reads as none', () => {
    const s = withDesign(plannedState());
    s.worksheetRef = { instanceId: 'gone', sheetId: 's-1', factorColumnIds: [], responseColumnIds: [] };
    assertEqual(agentSnapshot(s, fakeContext()).worksheet, null);
  });
});

suite('doe-planner read — evaluation and EVOP', () => {
  test('the evaluation in its read form', () => {
    const s = withDesign(plannedState());
    s.evaluation = {
      efficiency: { dEfficiency: 100, aEfficiency: 100, gEfficiency: 100, conditionNumber: 1, maxLeverage: 0.75 },
      vif: [{ term: 'A', vif: 1 }],
      aliasStructure: { generatorStrings: ['C = AB'], aliases: [{ term: 'A', aliasedWith: ['BC'] }] },
      power: [{ effectSize: 1, power: 0.5, dfError: 1 }],
      aliasedTerms: [],
    };
    const r = agentSnapshot(s, fakeContext());
    assertDeepEqual(r.evaluation.alias, { generators: ['C = AB'], aliases: [{ term: 'A', aliasedWith: ['BC'] }] });
    assertEqual(r.evaluation.efficiency.dEfficiency, 100);
    assertEqual(r.evaluation.vif.length, 1);
    assertEqual(r.evaluation.power[0].power, 0.5);
  });

  test('the EVOP project only in project mode', () => {
    const s = withDesign(plannedState());
    s.projectName = 'Ofen';
    s.setProjectMode(true);
    const r = agentSnapshot(s, fakeContext());
    assertEqual(r.evop.projectMode, true);
    assertEqual(r.evop.projectName, 'Ofen');
    assertEqual(r.evop.activePhaseIdx, 0);
    assertDeepEqual(Object.keys(r.evop.phases[0]).sort(), ['completedAt', 'cycleNumber', 'decision', 'doeName', 'yValues']);
    assertEqual(r.evop.summary, null);
  });
});
