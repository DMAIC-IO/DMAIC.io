/**
 * D.Mike — AnalysisViewModel (viewmodel/analysis.js)
 */
import { suite, test, assertEqual, assertTrue, assertThrows } from '../test-utils.js';
import { AnalysisViewModel } from '../../js/modules/doe-planner/viewmodel/analysis.js';
import { t, fakeContext, attach, plannedState, withDesign, linkWorksheet } from './doe-planner-vm-fakes.js';

function setup() {
  const ctx = fakeContext();
  const model = withDesign(plannedState());
  const vm = new AnalysisViewModel({ t, context: ctx, container: () => null });
  const rec = attach(vm, model);
  return { vm, model, rec, ctx };
}

suite('doe-planner-vm analysis — response choice', () => {
  test('setAnalysisResponse checks the index and saves', () => {
    const { vm, model, rec } = setup();
    model.addResponse();
    vm.setAnalysisResponse(1);
    assertEqual(model.analysisResponseIdx, 1);
    assertEqual(rec.saves, 1);
    assertThrows(() => vm.setAnalysisResponse(2), /^invalid index\b/);
  });
});

suite('doe-planner-vm analysis — dispersion', () => {
  test('nothing without a bound, complete datasheet', () => {
    const { vm, model, ctx } = setup();
    assertEqual(vm.dispersion(), null);
    linkWorksheet(ctx, model, [10, null, 11, 20]);
    assertEqual(vm.dispersion(), null);
  });

  test('without replicates and with one replicate requested: null', () => {
    const { vm, model, ctx } = setup();
    linkWorksheet(ctx, model, [10, 12, 11, 20]);
    assertEqual(vm.dispersion(), null);
  });

  test('taguchi never gets a dispersion analysis', () => {
    const { vm, model, ctx } = setup();
    // 2² twice: every design point has two replicates
    model.options.replicates = 2;
    model.design = {
      designType: 'full',
      codedMatrix: [[-1, -1], [1, -1], [-1, 1], [1, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]],
      actualMatrix: [[20, 1], [40, 1], [20, 5], [40, 5], [20, 1], [40, 1], [20, 5], [40, 5]],
      runOrder: [1, 2, 3, 4, 5, 6, 7, 8], stdOrder: [1, 2, 3, 4, 1, 2, 3, 4], replicateIds: [1, 1, 1, 1, 2, 2, 2, 2],
      p: 0,
    };
    linkWorksheet(ctx, model, [10, 12, 11, 20, 11, 15, 10, 26]);
    const full = vm.dispersion();
    assertTrue(full !== null && !full.noReplicates, 'full design with replicates gets a dispersion analysis');
    model.designType = 'taguchi';
    model.worksheetRef.designSignature = model.designSignature();
    assertEqual(vm.dispersion(), null);
  });
});

suite('doe-planner-vm analysis — regression handover', () => {
  test('refused without a linked datasheet', () => {
    const { vm } = setup();
    assertThrows(() => vm.transferToRegression(), /linked datasheet/);
  });

  test('creates a regression instance in the planner phase', () => {
    const { vm, model, ctx } = setup();
    linkWorksheet(ctx, model, [10, 12, 11, 20]);
    ctx.store.phases = { improve: [{ instanceId: 'doe-1', moduleId: 'doe-planner' }] };
    ctx.store['phases.improve'] = [{ instanceId: 'doe-1', moduleId: 'doe-planner' }];
    const id = vm.transferToRegression();
    assertTrue(typeof id === 'string' && id.length > 0);
    assertEqual(ctx.modules[id].regType, 'polynomial');
    assertEqual(ctx.emitted.at(-1).name, 'module:added');
    assertEqual(ctx.notes.at(-1).message, 'transferSuccess');
  });
});
