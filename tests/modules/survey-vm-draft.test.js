/**
 * D.Mike — DraftViewModel (viewmodel/draft.js)
 * Spec: docs/superpowers/specs/2026-10-24-survey-builder-teil-viewmodels-design.md (E1, E2)
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { State } from '../../js/modules/survey-builder/survey-builder-model.js';
import { DraftViewModel } from '../../js/modules/survey-builder/viewmodel/draft.js';
import { t, fakeContext, attach } from './survey-vm-fakes.js';

function setup() {
  const ctx = fakeContext();
  const vm = new DraftViewModel({ t, context: ctx, container: () => null });
  const model = new State();
  const rec = attach(vm, model);
  return { ctx, vm, model, rec };
}

/** The `@change` event of a select, as the template passes it. */
const change = (value) => ({ target: { value } });

suite('survey-vm draft — lifecycle', () => {
  test('attach watches the questionnaire and renders the preview on the next tick', () => {
    const { vm, model, rec } = setup();
    assertEqual(rec.watches.length, 1);
    assertEqual(rec.watches[0].getter(), JSON.stringify(model.survey));
    assertEqual(rec.ticks.length, 1);
    assertDeepEqual(vm.condDraft, []);
  });

  test('detach blocks later preview renders and clears the timer', async () => {
    const { vm } = setup();
    let renders = 0;
    vm.renderPreview = async () => { renders++; };
    vm.schedulePreview();
    assertTrue(vm._previewTimer !== null);
    vm.detach();
    assertEqual(vm._destroyed, true);
    assertEqual(vm._previewTimer, null);
    await new Promise((resolve) => setTimeout(resolve, 400)); // longer than the preview delay
    assertEqual(renders, 0);
    await DraftViewModel.prototype.renderPreview.call(vm); // returns at once: destroyed
  });
});

suite('survey-vm draft — re-mount', () => {
  test('attach after detach re-enables the preview', () => {
    const { vm, model } = setup();
    vm.detach();
    attach(vm, model);
    assertEqual(vm._destroyed, false);
  });
});

suite('survey-vm draft — outline and selection', () => {
  test('addSection selects the new section; addQuestionFromEvent resets the picker', () => {
    const { vm, model } = setup();
    vm.addSection();
    const sec = model.survey.sections[0].id;
    assertEqual(vm.selectedSectionId, sec);
    const ev = change('single');
    vm.addQuestionFromEvent(sec, ev);
    assertEqual(ev.target.value, '');
    assertEqual(model.survey.sections[0].questions.length, 1);
    assertEqual(vm.selectedSectionId, null);
    assertTrue(vm.hasSelectedQuestion());
  });

  test('reportRemoved notifies only when conditions went and returns their number', () => {
    const { ctx, vm } = setup();
    assertEqual(vm.reportRemoved({ removedConditions: 0 }), 0);
    assertEqual(vm.reportRemoved({ removedConditions: 2 }), 2);
    assertDeepEqual(ctx.notes, [{ message: 'conditionsRemoved|{"count":2}', type: 'info' }]);
  });
});

suite('survey-vm draft — conditions and warnings', () => {
  test('a condition row picks a source and an option and lands in the model', () => {
    const { vm, model } = setup();
    vm.addSection();
    const sec = model.survey.sections[0].id;
    const src = model.addQuestion(sec, 'single');
    const opt = model.addItem(src, 'options');
    const later = model.addQuestion(sec, 'text');
    vm.selectQuestion(later);
    vm.addCondition();
    const key = vm.condDraft[0].key;
    vm.setCondSource(key, change(src));
    vm.toggleCondOption(key, opt);
    assertDeepEqual(model.question(later).when, [{ questionId: src, optionIds: [opt] }]);
  });

  test('an empty questionnaire warns that there are no questions', () => {
    const { vm } = setup();
    assertDeepEqual(vm.warnings().map((w) => w.key), ['none']);
    assertEqual(vm.hasWarnings(), true);
  });
});
