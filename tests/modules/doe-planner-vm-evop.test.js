/**
 * D.Mike — EvopViewModel (viewmodel/evop.js)
 * Spec: docs/superpowers/specs/2026-10-25-doe-planner-teil-viewmodels-design.md (E1, E6, E8)
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows } from '../test-utils.js';
import { EvopViewModel } from '../../js/modules/doe-planner/viewmodel/evop.js';
import { t, fakeContext, attach, plannedState, withDesign, linkWorksheet } from './doe-planner-vm-fakes.js';

function setup() {
  const ctx = fakeContext();
  const model = withDesign(plannedState());
  model.projectName = 'Ofen';
  const vm = new EvopViewModel({ t, context: ctx, container: () => null });
  const rec = attach(vm, model);
  return { vm, model, rec, ctx };
}

suite('doe-planner-vm evop — project', () => {
  test('setProjectMode opens phase 1; name is set', () => {
    const { vm, model, rec } = setup();
    vm.setProjectMode(true);
    assertEqual(model.projectMode, true);
    assertEqual(model.projectPhases.length, 1);
    vm.setProjectName('Linie 3');
    assertEqual(model.projectName, 'Linie 3');
    assertEqual(rec.saves, 2);
    assertThrows(() => vm.setProjectMode('on'), /^invalid on\b/);
  });
});

suite('doe-planner-vm evop — phases', () => {
  test('completePhase stores y values, opens the next phase and schedules', () => {
    const { vm, model, rec, ctx } = setup();
    vm.setProjectMode(true);
    linkWorksheet(ctx, model, [10, 12, 11, 20]);
    assertEqual(vm.completePhase('repeat'), true);
    assertDeepEqual(model.projectPhases[0].yValues, [10, 12, 11, 20]);
    assertEqual(model.projectPhases.length, 2);
    assertEqual(rec.schedules, 1);
    assertEqual(ctx.confirms.length, 0);
  });

  test('stop closes without a new phase; a decided phase is not closed again', () => {
    const { vm, model, rec } = setup();
    vm.setProjectMode(true);
    assertEqual(vm.completePhase('stop'), true);
    assertEqual(model.projectPhases.length, 1);
    assertEqual(rec.schedules, 0);
    assertEqual(vm.completePhase('repeat'), false);
    assertThrows(() => vm.completePhase('pause'), /^invalid decision\b/);
  });

  test('confirmCompletePhase asks first', async () => {
    const { vm, model, ctx } = setup();
    vm.setProjectMode(true);
    ctx.confirmAnswer = false;
    assertEqual(await vm.confirmCompletePhase('stop'), false);
    assertEqual(model.projectPhases[0].decision, null);
    assertEqual(ctx.confirms[0].message, 'decisionConfirm_stop');
    ctx.confirmAnswer = true;
    assertEqual(await vm.confirmCompletePhase('stop'), true);
    assertEqual(model.projectPhases[0].decision, 'stop');
  });

  test('newPhase needs a decided active phase', () => {
    const { vm, model } = setup();
    vm.setProjectMode(true);
    assertThrows(() => vm.newPhase(), /decided/);
    vm.completePhase('repeat');
    vm.viewPhase(0);
    assertEqual(vm.newPhase(), 2);
    assertEqual(model.activePhaseIdx, 2);
  });

  test('viewPhase restores and takes over the signatures', () => {
    const { vm, model, rec } = setup();
    vm.setProjectMode(true);
    vm.completePhase('repeat');
    vm.viewPhase(0);
    assertEqual(model.activePhaseIdx, 0);
    assertEqual(rec.adopts, 1);
    assertThrows(() => vm.viewPhase(7), /^invalid idx\b/);
  });
});

suite('doe-planner-vm evop — view', () => {
  test('timeline classes and labels', () => {
    const { vm, model } = setup();
    vm.setProjectMode(true);
    assertEqual(vm.timelineItemClass(0), 'doe__timeline-item--active');
    assertEqual(vm.phaseLabel(model.projectPhases[0]), 'Ofen - Phase 1');
    assertEqual(vm.phaseDecIcon({ decision: 'stop' }), 'status.ok');
    assertEqual(vm.evopSummary(), null);
  });

  test('the decision block shows once every response is in', () => {
    const { vm, model, ctx } = setup();
    vm.setProjectMode(true);
    linkWorksheet(ctx, model, [10, null, 11, 20]);
    assertEqual(vm.showPhaseDecision(), false);
    linkWorksheet(ctx, model, [10, 12, 11, 20]);
    assertEqual(vm.showPhaseDecision(), true);
  });
});
