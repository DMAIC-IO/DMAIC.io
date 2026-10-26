/**
 * D.Mike — HandoverViewModel (viewmodel/handover.js)
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows } from '../test-utils.js';
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

/** In-memory state manager with the phases this module lives in. */
function memoryStateManager() {
  const store = { phases: { define: [{ instanceId: 'sb-1', moduleId: 'survey-builder', order: 0 }] } };
  const states = new Map();
  return {
    states,
    get: (path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), store),
    set: (path, value) => {
      const keys = path.split('.');
      const last = keys.pop();
      keys.reduce((o, k) => (o[k] ??= {}), store)[last] = value;
    },
    getModuleState: (id) => states.get(id) ?? null,
    setModuleState: (id, state) => { states.set(id, state); },
  };
}

suite('survey-vm handover — agent surface', () => {
  function withAnswers() {
    const sm = memoryStateManager();
    const s = setup({ stateManager: sm });
    const sec = s.model.addSection();
    const text = s.model.addQuestion(sec, 'text');
    const kano = s.model.addQuestion(sec, 'kano');
    s.model.addItem(kano, 'rows');
    s.model.addResponse({ id: 'r1', surveyVersion: 1, recipientId: null, submittedAt: '2026-10-10T09:00:00Z', answers: { [text]: 'Schneller liefern' } });
    return { ...s, sm, text, kano };
  }

  test('takeToVocTree checks the keys, creates the tree and marks the answers', () => {
    const { vm, model, sm, text } = withAnswers();
    assertThrows(() => vm.takeToVocTree([]), /invalid keys \[\]; allowed: at least one answer key/);
    assertThrows(() => vm.takeToVocTree(['r1:nope']), /unknown keys\[0\] "r1:nope"; available: r1:/);
    assertEqual(vm.takeToVocTree([`r1:${text}`]), 1);
    assertDeepEqual(model.transfers.vocTree.responseKeys, [`r1:${text}`]);
    const trees = Object.values(sm.get('phases')).flat().filter((r) => r.moduleId === 'voc-ctx-tree');
    assertEqual(trees.length, 1);
    assertEqual(sm.getModuleState(trees[0].instanceId) !== null, true);
  });

  test('takeSelectedToVocTree empties the selection only after a take-over', () => {
    const { vm, model, ctx, sm, text } = withAnswers();
    const key = `r1:${text}`;
    // No take-over possible: the state manager vanishes once the tree is to be created.
    let reads = 0;
    Object.defineProperty(ctx, 'stateManager', { configurable: true, get: () => (reads++ === 0 ? sm : null) });
    vm.toggleVoc(key);
    vm.takeSelectedToVocTree();
    assertDeepEqual(vm.vocSelected, [key]);
    assertDeepEqual(model.transfers.vocTree.responseKeys, []);
    Object.defineProperty(ctx, 'stateManager', { configurable: true, value: sm });
    vm.takeSelectedToVocTree();
    assertDeepEqual(vm.vocSelected, []);
    assertDeepEqual(model.transfers.vocTree.responseKeys, [key]);
  });

  test('handOverToKano returns the new instance; setKanoTarget checks question and instance', () => {
    const { vm, model, text, kano } = withAnswers();
    const id = vm.handOverToKano(kano);
    assertEqual(typeof id, 'string');
    assertEqual(model.transfers.kano[kano], id);
    vm.setKanoTarget(kano, null);
    assertEqual(model.transfers.kano[kano], null);
    vm.setKanoTarget(kano, id);
    assertEqual(model.transfers.kano[kano], id);
    assertThrows(() => vm.setKanoTarget(kano, 'nope'), /unknown instanceId "nope"; available: /);
    assertThrows(() => vm.setKanoTarget(text, null), /unknown questionId ".+"; available: /);
    assertThrows(() => vm.handOverToKano(text), /unknown questionId/);
  });
});
