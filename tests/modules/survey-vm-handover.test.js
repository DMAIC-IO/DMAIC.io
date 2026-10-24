/**
 * D.Mike — HandoverViewModel (viewmodel/handover.js)
 * Spec: docs/superpowers/specs/2026-10-24-survey-builder-teil-viewmodels-design.md (E1, E2)
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { State } from '../../js/modules/survey-builder/survey-builder-model.js';
import { HandoverViewModel } from '../../js/modules/survey-builder/viewmodel/handover.js';
import { t, fakeContext, attach } from './survey-vm-fakes.js';

function setup(ctxOverrides = {}) {
  const ctx = fakeContext(ctxOverrides);
  const vm = new HandoverViewModel({ t, context: ctx, container: () => null });
  const model = new State();
  const rec = attach(vm, model);
  return { ctx, vm, model, rec };
}

function addResponse(model, id) {
  model.addResponse({ id, surveyVersion: 1, recipientId: null, submittedAt: '2026-10-10T09:00:00Z', answers: {} });
}

suite('survey-vm handover — VoC selection', () => {
  test('toggleVoc ticks and unticks an answer', () => {
    const { vm } = setup();
    vm.toggleVoc('r1:q1');
    assertEqual(vm.isVocSelected('r1:q1'), true);
    assertEqual(vm.hasVocSelection(), true);
    vm.toggleVoc('r1:q1');
    assertEqual(vm.hasVocSelection(), false);
  });

  test('a deleted response takes its ticked answers with it (own watch)', () => {
    const { vm, model, rec } = setup();
    addResponse(model, 'r1');
    addResponse(model, 'r2');
    vm.toggleVoc('r1:q1');
    vm.toggleVoc('r2:q1:other');
    const watch = rec.watches.find((w) => w.getter() === 'r1\nr2');
    model.deleteResponse('r1');
    watch.callback();
    assertDeepEqual(vm.vocSelected, ['r2:q1:other']);
  });
});

suite('survey-vm handover — kano targets', () => {
  test('kanoTargetOptions lists the kano instances; onInstancesChanged bumps the revision it depends on', () => {
    let phases = {};
    const { vm } = setup({ stateManager: { get: () => phases, getModuleState: () => null, setModuleState: () => {} } });
    assertDeepEqual(vm.kanoTargetOptions(), []);
    phases = { define: [{ instanceId: 'k1', moduleId: 'kano' }] };
    const rev = vm._kanoRev;
    vm.onInstancesChanged();
    assertEqual(vm._kanoRev, rev + 1);
    assertDeepEqual(vm.kanoTargetOptions().map((o) => o.value), ['k1']);
  });

  test('a linked kano instance that is gone reads as "new"', () => {
    const { vm, model } = setup();
    model.setKanoTarget('q1', 'gone');
    assertEqual(vm.kanoTargetValue('q1'), '');
    assertEqual(vm.isKanoTarget('q1', ''), true);
  });

  test('_ownPhase finds the phase of this instance, define otherwise', () => {
    const { vm } = setup({
      stateManager: { get: () => ({ measure: [{ instanceId: 'sb-1', moduleId: 'survey-builder' }] }), getModuleState: () => null },
    });
    assertEqual(vm._ownPhase(), 'measure');
    assertEqual(setup().vm._ownPhase(), 'define');
  });
});
