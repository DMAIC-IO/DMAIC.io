/**
 * D.Mike — DraftViewModel (viewmodel/draft.js)
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertThrows } from '../test-utils.js';
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

suite('survey-vm draft — agent surface', () => {
  /** A section with one question of `type`. */
  function withQuestion(type) {
    const s = setup();
    const sectionId = s.vm.addSection();
    const questionId = s.vm.addQuestion(sectionId, type);
    return { ...s, sectionId, questionId };
  }

  test('setHeader checks key and value per key', () => {
    const { vm, model } = setup();
    vm.setHeader('title', 'Kundenbefragung');
    vm.setHeader('lang', 'en');
    vm.setHeader('anonymous', true);
    assertEqual(model.survey.title, 'Kundenbefragung');
    assertEqual(model.survey.lang, 'en');
    assertEqual(model.survey.anonymous, true);
    assertThrows(() => vm.setHeader('version', 2), /invalid key "version"; allowed: title, intro, contact, lang, anonymous/);
    assertThrows(() => vm.setHeader('lang', 'fr'), /invalid value "fr"; allowed: de, en/);
    assertThrows(() => vm.setHeader('anonymous', 'yes'), /invalid value "yes"; allowed: true, false/);
  });

  test('sections: add returns the id, fields and moves are checked, delete never asks', async () => {
    const { vm, model, ctx } = setup();
    const a = vm.addSection();
    const b = vm.addSection();
    vm.setSectionField(a, 'title', 'Allgemein');
    assertEqual(model.section(a).title, 'Allgemein');
    assertThrows(() => vm.setSectionField('nope', 'title', 'x'), /unknown sectionId "nope"; available: /);
    assertThrows(() => vm.setSectionField(a, 'when', 'x'), /invalid key "when"; allowed: title, hint/);
    assertEqual(vm.moveSection(b, 'up'), 0);
    assertDeepEqual(model.survey.sections.map((s) => s.id), [b, a]);
    assertThrows(() => vm.moveSection(b, 'left'), /invalid direction "left"; allowed: up, down/);
    vm.addQuestion(a, 'text');
    assertEqual(vm.deleteSection(a), 0);
    assertEqual(ctx.confirms.length, 0);
    assertEqual(model.survey.sections.length, 1);
  });

  test('confirmDeleteSection asks for a section with questions and keeps it on no', async () => {
    const { vm, model, ctx, sectionId } = withQuestion('text');
    ctx.confirmAnswer = false;
    await vm.confirmDeleteSection(sectionId);
    assertEqual(ctx.confirms.length, 1);
    assertTrue(model.section(sectionId) !== null);
  });

  test('questions: type and keys per type are checked', () => {
    const { vm, model, sectionId, questionId } = withQuestion('single');
    assertThrows(() => vm.addQuestion(sectionId, 'slider'), /invalid type "slider"; allowed: single, multi, rating, kano, text, info/);
    vm.setQuestionField(questionId, 'text', 'Kundengruppe');
    vm.setQuestionField(questionId, 'other', true);
    assertEqual(model.question(questionId).text, 'Kundengruppe');
    assertEqual(model.question(questionId).other, true);
    assertThrows(() => vm.setQuestionField(questionId, 'multiline', true),
      /invalid key "multiline" for a single question; allowed: text, hint, required, other/);
    assertThrows(() => vm.setQuestionField(questionId, 'required', 1), /invalid value 1; allowed: true, false/);
    const info = vm.addQuestion(sectionId, 'info');
    assertThrows(() => vm.setQuestionField(info, 'required', true), /for a info question; allowed: text, hint$/);
    assertEqual(vm.changeQuestionType(questionId, 'multi'), 0);
    assertEqual(model.question(questionId).type, 'multi');
    assertEqual(vm.moveQuestion(info, 'up'), 0);
    assertEqual(vm.deleteQuestion(info), 0);
    assertEqual(model.question(info), null);
  });

  test('items: only on questions with options or rows; group only on multiple choice', () => {
    const { vm, model, sectionId, questionId } = withQuestion('single');
    const a = vm.addItem(questionId);
    const b = vm.addItem(questionId);
    vm.setItemField(questionId, a, 'text', 'Handel');
    assertEqual(model.question(questionId).options[0].text, 'Handel');
    assertThrows(() => vm.setItemField(questionId, a, 'group', 'G'), /invalid key "group" for a single question; allowed: text/);
    assertThrows(() => vm.setItemField(questionId, 'x', 'text', 'G'), /unknown itemId "x"; available: /);
    vm.moveItem(questionId, b, 'up');
    assertDeepEqual(model.question(questionId).options.map((o) => o.id), [b, a]);
    assertEqual(vm.deleteItem(questionId, b), 0);
    const text = vm.addQuestion(sectionId, 'text');
    assertThrows(() => vm.addItem(text), /a text question has no options or rows/);
    const multi = vm.addQuestion(sectionId, 'multi');
    const m = vm.addItem(multi);
    vm.setItemField(multi, m, 'group', 'Gruppe A');
    assertEqual(model.question(multi).options[0].group, 'Gruppe A');
  });

  test('setConditions checks source and options, stores them and clears with []', () => {
    const { vm, model, sectionId, questionId } = withQuestion('single');
    const opt = vm.addItem(questionId);
    const later = vm.addQuestion(sectionId, 'text');
    assertThrows(() => vm.setConditions(later, [{ questionId: later, optionIds: [opt] }]),
      /unknown conditions\[0\]\.questionId ".+"; available: /);
    assertThrows(() => vm.setConditions(later, [{ questionId, optionIds: [] }]),
      /invalid conditions\[0\]\.optionIds \[\]; allowed: at least one of /);
    assertThrows(() => vm.setConditions(later, [{ questionId, optionIds: ['x'] }]),
      /unknown conditions\[0\]\.optionIds\[0\] "x"/);
    assertThrows(() => vm.setConditions(later, 'all'), /invalid conditions "all"; allowed: an array/);
    assertEqual(vm.setConditions(later, [{ questionId, optionIds: [opt] }]), 1);
    assertDeepEqual(model.question(later).when, [{ questionId, optionIds: [opt] }]);
    assertEqual(vm.setConditions(later, []), 0);
    assertEqual(model.question(later).when, null);
  });

  test('flagHelpKey names the typedef key of a flag', () => {
    const { vm } = setup();
    assertEqual(vm.flagHelpKey('noAnswer'), 'modules.survey-builder.types.QuestionFields.noAnswer');
  });
});
