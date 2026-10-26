/**
 * D.Mike — ResponsesViewModel (viewmodel/responses.js)
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows } from '../test-utils.js';
import { State } from '../../js/modules/survey-builder/survey-builder-model.js';
import { ResponsesViewModel } from '../../js/modules/survey-builder/viewmodel/responses.js';
import { t, fakeContext, attach } from './survey-vm-fakes.js';

function setup() {
  const ctx = fakeContext();
  const vm = new ResponsesViewModel({ t, context: ctx, container: () => null });
  const model = new State();
  const sec = model.addSection();
  const q = model.addQuestion(sec, 'text');
  attach(vm, model);
  return { ctx, vm, model, q };
}

/** A file double as `importFiles` reads it. */
function file(name, body) { return { name, text: async () => body }; }

function answerJson(model, responseId, answers = {}, extra = {}) {
  return JSON.stringify({
    format: 'dmike-survey-response', formatVersion: 1, surveyId: model.survey.id, surveyVersion: model.survey.version,
    recipientId: null, responseId, submittedAt: '2026-10-10T09:30:00.000Z', answers, ...extra,
  });
}

suite('survey-vm responses — import', () => {
  test('an answer file of this survey is taken in and logged as ok', async () => {
    const { vm, model, q } = setup();
    await vm.importFiles([file('a.json', answerJson(model, 'r1', { [q]: 'Mehr Tempo' }))]);
    assertEqual(model.responses.length, 1);
    assertDeepEqual(vm.importLog.map((e) => [e.name, e.status]), [['a.json', 'ok']]);
    assertEqual(vm.hasImportLog(), true);
  });

  test('a foreign and a broken file are logged, not taken in', async () => {
    const { vm, model } = setup();
    await vm.importFiles([file('f.json', answerJson(model, 'r2', {}, { surveyId: 'other' })), file('x.json', 'nope')]);
    assertEqual(model.responses.length, 0);
    assertDeepEqual(vm.importLog.map((e) => e.status), ['foreign', 'invalid']);
  });

  test('responseDetails lists the answer of each visible question', async () => {
    const { vm, model, q } = setup();
    await vm.importFiles([file('a.json', answerJson(model, 'r1', { [q]: 'Mehr Tempo' }))]);
    assertDeepEqual(vm.responseDetails('r1').map((d) => d.answer), ['Mehr Tempo']);
  });
});

suite('survey-vm responses — delete', () => {
  test('deleting asks, closes the open row and knows nothing of the VoC selection', async () => {
    const { ctx, vm, model } = setup();
    await vm.importFiles([file('a.json', answerJson(model, 'r1'))]);
    vm.toggleResponse('r1');
    assertEqual(vm.isResponseOpen('r1'), true);
    await vm.confirmDeleteResponse('r1');
    assertEqual(model.responses.length, 0);
    assertEqual(vm.openResponseId, null);
    assertEqual(ctx.confirms.length, 1);
    assertEqual('vocSelected' in vm, false);
  });

  test('a declined confirmation keeps the response', async () => {
    const { ctx, vm, model } = setup();
    await vm.importFiles([file('a.json', answerJson(model, 'r1'))]);
    ctx.confirmAnswer = false;
    await vm.confirmDeleteResponse('r1');
    assertEqual(model.responses.length, 1);
  });
});

suite('survey-vm responses — agent surface', () => {
  test('importResponse returns the status and writes the log line', () => {
    const { vm, model, q } = setup();
    assertEqual(vm.importResponse(answerJson(model, 'r1', { [q]: 'Mehr Tempo' }), 'a.json'), 'ok');
    assertEqual(vm.importResponse(answerJson(model, 'r1'), 'kopie.json'), 'duplicate');
    assertEqual(vm.importResponse('{"format":', 'x.json'), 'invalid');
    assertEqual(model.responses.length, 1);
    assertDeepEqual(vm.importLog.map((e) => [e.name, e.status]), [['a.json', 'ok'], ['kopie.json', 'duplicate'], ['x.json', 'invalid']]);
    assertThrows(() => vm.importResponse({}, 'a.json'), /invalid json \{\}; allowed: any string/);
    assertThrows(() => vm.importResponse('{}'), /invalid fileName undefined; allowed: any string/);
  });

  test('deleteResponse checks the id and never asks', () => {
    const { ctx, vm, model } = setup();
    vm.importResponse(answerJson(model, 'r1'), 'a.json');
    vm.toggleResponse('r1');
    vm.deleteResponse('r1');
    assertEqual(model.responses.length, 0);
    assertEqual(vm.openResponseId, null);
    assertEqual(ctx.confirms.length, 0);
    assertThrows(() => vm.deleteResponse('r1'), /unknown responseId "r1"; available: $/);
  });
});
