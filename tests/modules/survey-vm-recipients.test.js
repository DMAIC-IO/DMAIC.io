/**
 * D.Mike — RecipientsViewModel (viewmodel/recipients.js)
 * Spec: docs/superpowers/specs/2026-10-24-survey-builder-teil-viewmodels-design.md (E1, E2)
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { State } from '../../js/modules/survey-builder/survey-builder-model.js';
import { RecipientsViewModel } from '../../js/modules/survey-builder/viewmodel/recipients.js';
import { t, fakeContext, attach } from './survey-vm-fakes.js';

function setup() {
  const ctx = fakeContext();
  const vm = new RecipientsViewModel({ t, context: ctx, container: () => null });
  const model = new State();
  attach(vm, model);
  return { ctx, vm, model };
}

/** Marks a recipient as answered through an imported response. */
function answer(model, recipientId) {
  model.addResponse({ id: `r-${recipientId}`, surveyVersion: 1, recipientId, submittedAt: '2026-10-10T09:00:00Z', answers: {} });
}

suite('survey-vm recipients — binding', () => {
  test('the model comes with attach(), not with the constructor', () => {
    const vm = new RecipientsViewModel({ t, context: fakeContext(), container: () => null });
    assertEqual(vm.model, null);
    const model = new State();
    attach(vm, model);
    assertTrue(vm.model === model);
  });
});

suite('survey-vm recipients — list and status', () => {
  test('addRecipient adds a row, hasRecipients sees it', () => {
    const { vm, model } = setup();
    assertEqual(vm.hasRecipients(), false);
    vm.addRecipient();
    assertEqual(model.recipients.length, 1);
    assertEqual(vm.hasRecipients(), true);
  });

  test('updateRecipientFromEvent writes the field', () => {
    const { vm, model } = setup();
    vm.addRecipient();
    const id = model.recipients[0].id;
    vm.updateRecipientFromEvent(id, 'name', { target: { value: 'Firma A' } });
    assertEqual(model.recipients[0].name, 'Firma A');
  });

  test('sentLabel is a dash before sending; countsLine reports the rate', () => {
    const { vm, model } = setup();
    vm.addRecipient();
    assertEqual(vm.sentLabel(model.recipients[0]), '–');
    assertEqual(vm.countsLine(), 'report.rateLine|{"sent":0,"answered":0,"rate":"—"}');
  });

  test('recipientStatusLabel follows the model status', () => {
    const { vm, model } = setup();
    vm.addRecipient();
    const id = model.recipients[0].id;
    assertEqual(vm.recipientStatusLabel(id), 'statusNotSent');
    answer(model, id);
    assertEqual(vm.recipientStatusLabel(id), 'statusAnswered');
  });
});

suite('survey-vm recipients — delete', () => {
  test('a recipient without an answer goes without asking', async () => {
    const { ctx, vm, model } = setup();
    vm.addRecipient();
    await vm.deleteRecipient(model.recipients[0].id);
    assertEqual(model.recipients.length, 0);
    assertDeepEqual(ctx.confirms, []);
  });

  test('a recipient who answered is deleted only after confirming', async () => {
    const { ctx, vm, model } = setup();
    vm.addRecipient();
    const id = model.recipients[0].id;
    answer(model, id);
    ctx.confirmAnswer = false;
    await vm.deleteRecipient(id);
    assertEqual(model.recipients.length, 1);
    ctx.confirmAnswer = true;
    await vm.deleteRecipient(id);
    assertEqual(model.recipients.length, 0);
    assertEqual(ctx.confirms.length, 2);
  });
});
