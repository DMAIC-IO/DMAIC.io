/**
 * Tests for ui/dialog/dialog-state.js — the pure display state per variant.
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { buildDialogState, DIALOG_SIZES } from '../../js/ui/dialog/dialog-state.js';

const t = (k) => `t:${k}`;

suite('buildDialogState', () => {
  test('confirm: default title, yes/cancel, compact, no delete', () => {
    const s = buildDialogState('confirm', { message: 'M' }, t);
    assertEqual(s.title, 't:common.confirm');
    assertEqual(s.message, 'M');
    assertEqual(s.confirmLabel, 't:common.yes');
    assertEqual(s.cancelLabel, 't:common.cancel');
    assertEqual(s.size, 'compact');
    assertEqual(s.width, 380);
    assertTrue(s.hasConfirm && s.hasCancel && !s.hasDelete && s.hasFooter);
    assertEqual(s.confirmClass, 'btn--primary');
    assertTrue(s.dismissible);
  });

  test('confirm: danger switches the confirm button class', () => {
    assertEqual(buildDialogState('confirm', { message: 'M', danger: true }, t).confirmClass, 'btn--danger');
  });

  test('confirm: caller labels and title win over defaults', () => {
    const s = buildDialogState('confirm', { message: 'M', title: 'T', confirmLabel: 'Do', cancelLabel: 'No' }, t);
    assertEqual(s.title, 'T');
    assertEqual(s.confirmLabel, 'Do');
    assertEqual(s.cancelLabel, 'No');
  });

  test('alert: ok button only, default title common.ok', () => {
    const s = buildDialogState('alert', { message: 'M' }, t);
    assertEqual(s.title, 't:common.ok');
    assertEqual(s.confirmLabel, 't:common.ok');
    assertTrue(s.hasConfirm && !s.hasCancel && !s.hasDelete);
    assertEqual(s.size, 'compact');
  });

  test('form: save/cancel, default size, delete only with onDelete', () => {
    const s = buildDialogState('form', { title: 'F' }, t);
    assertEqual(s.confirmLabel, 't:common.save');
    assertEqual(s.cancelLabel, 't:common.cancel');
    assertEqual(s.deleteLabel, 't:common.delete');
    assertEqual(s.size, 'default');
    assertEqual(s.width, 520);
    assertTrue(s.hasConfirm && s.hasCancel && !s.hasDelete);
    assertTrue(buildDialogState('form', { title: 'F', onDelete: () => {} }, t).hasDelete);
  });

  test('form: hideConfirm drops only the confirm button', () => {
    const s = buildDialogState('form', { title: 'F', hideConfirm: true }, t);
    assertTrue(!s.hasConfirm && s.hasCancel && s.hasFooter);
  });

  test('show: no buttons, no footer, dismissible unless told otherwise', () => {
    const s = buildDialogState('show', { title: 'S' }, t);
    assertTrue(!s.hasConfirm && !s.hasCancel && !s.hasDelete && !s.hasFooter);
    assertTrue(s.dismissible);
    assertEqual(buildDialogState('show', { title: 'S', dismissible: false }, t).dismissible, false);
  });

  test('progress: never dismissible, no footer buttons', () => {
    const s = buildDialogState('progress', { title: 'P', dismissible: true }, t);
    assertEqual(s.dismissible, false);
    assertTrue(!s.hasFooter);
    assertEqual(s.progressLabel, 't:actions.modalLabel');
  });

  test('size: wide is honoured, unknown falls back to the variant default', () => {
    assertEqual(buildDialogState('show', { title: 'S', size: 'wide' }, t).width, 800);
    assertEqual(buildDialogState('form', { title: 'F', size: 'huge' }, t).size, 'default');
    assertEqual(DIALOG_SIZES.compact, 380);
  });

  test('state is plain data — no functions', () => {
    const s = buildDialogState('form', { title: 'F', onDelete: () => {}, onConfirm: () => {} }, t);
    assertTrue(Object.values(s).every(v => typeof v !== 'function'));
  });
});
