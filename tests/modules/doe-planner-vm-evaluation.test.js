/**
 * D.Mike — EvaluationViewModel (viewmodel/evaluation.js)
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { EvaluationViewModel } from '../../js/modules/doe-planner/viewmodel/evaluation.js';
import { t, fakeContext, attach, plannedState, withDesign } from './doe-planner-vm-fakes.js';

function setup(model = plannedState()) {
  const ctx = fakeContext();
  const vm = new EvaluationViewModel({ t, context: ctx, container: () => null });
  attach(vm, model);
  return { vm, model, ctx };
}

suite('doe-planner-vm evaluation — summary', () => {
  test('runs from the design type, times replicates', () => {
    const { vm, model } = setup();
    assertEqual(vm.summaryRuns(), 4);
    model.options.replicates = 3;
    assertEqual(vm.summaryRuns(), 12);
    assertEqual(vm.summaryRes(), 'Full');
    model.designType = 'frac';
    assertEqual(vm.summaryRuns(), '?');
  });

  test('generated runs and validity', () => {
    const { vm, model } = setup();
    assertEqual(vm.summaryGeneratedRuns(), 0);
    withDesign(model);
    assertEqual(vm.summaryGeneratedRuns(), 4);
    assertEqual(vm.configValid(), true);
    model.responses[0].name = '';
    assertEqual(vm.configValid(), false);
  });
});

suite('doe-planner-vm evaluation — tables', () => {
  test('efficiency cards, VIF split, alias rows, power', () => {
    const { vm, model } = setup();
    assertDeepEqual(vm.effCards(), []);
    model.evaluation = {
      efficiency: { dEfficiency: 90, aEfficiency: 60, gEfficiency: 40, conditionNumber: 1.234, maxLeverage: 0.5 },
      vif: [{ term: 'A', vif: 1 }, { term: 'A*B', vif: 6 }],
      aliasStructure: { generatorStrings: ['C = AB'], aliases: [{ term: 'A', aliasedWith: ['BC'] }] },
      power: [{ effectSize: 1, power: null, dfError: 0 }],
    };
    assertDeepEqual(vm.effCards().map((c) => c.cls), ['dmike-kpi--good', 'dmike-kpi--warn', 'dmike-kpi--bad']);
    assertEqual(vm.condNumValue(), '1.2');
    assertEqual(vm.vifMain().length, 1);
    assertEqual(vm.vifInter().length, 1);
    assertEqual(vm.vifRating(6), 'doe__vif-warn');
    assertEqual(vm.hasAlias(), true);
    assertDeepEqual(vm.aliasRows(), [{ term: 'A', aliasedWith: 'BC' }]);
    assertEqual(vm.powerSaturated(), true);
  });

  test('algoNavigate sends the lab to the algorithm', () => {
    const { vm, ctx } = setup();
    let stopped = false;
    vm.algoNavigate('vif', { stopPropagation() { stopped = true; } });
    assertEqual(stopped, true);
    assertDeepEqual(ctx.emitted[0], { name: 'lab:navigate', payload: { algoId: 'vif', tab: 'docs' } });
  });
});
