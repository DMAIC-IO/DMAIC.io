/**
 * Tests for ui/action-modal.js — the non-dismissible progress dialog shown
 * while an action verb runs.
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { Modal } from '../../js/ui/modal.js';
import { createActionModal } from '../../js/ui/action-modal.js';

const i18n = { t: (k) => k };
const make = () => createActionModal({ i18n, modal: new Modal(i18n) });

suite('createActionModal', () => {
  test('open mounts one dialog with title and subtitle', () => {
    const am = make();
    am.open({ title: 'Szenario wird geladen', subtitle: 'Pizza' });
    assertEqual(document.querySelectorAll('.modal-overlay').length, 1);
    assertEqual(document.querySelector('.modal__title').textContent, 'Szenario wird geladen');
    assertEqual(document.querySelector('.action-modal__subtitle').textContent, 'Pizza');
    am.close();
  });

  test('the dialog cannot be dismissed by the user', () => {
    const am = make();
    am.open({ title: 'T' });
    assertEqual(document.querySelector('.modal__close'), null, 'no ✕');
    assertTrue(document.querySelector('.modal-overlay').classList.contains('modal-overlay--action'));
    am.close();
  });

  test('update replaces the progress line only', () => {
    const am = make();
    am.open({ title: 'T', subtitle: 'S' });
    am.update('Modul 3 von 21');
    assertEqual(document.querySelector('.action-modal__progress').textContent, 'Modul 3 von 21');
    assertEqual(document.querySelector('.action-modal__subtitle').textContent, 'S');
    am.close();
  });

  test('update is a no-op when nothing is open', () => {
    const am = make();
    am.update('x');
    assertEqual(document.querySelector('.action-modal'), null);
  });

  test('open twice reuses one dialog', () => {
    const am = make();
    am.open({ title: 'A' });
    am.open({ title: 'B' });
    assertEqual(document.querySelectorAll('.modal-overlay').length, 1);
    assertEqual(document.querySelector('.modal__title').textContent, 'B');
    am.close();
  });

  test('hold keeps the dialog open until the button is clicked', async () => {
    const am = make();
    am.open({ title: 'T' });
    let done = false;
    const p = am.hold({ title: 'Fertig', subtitle: '21 von 21', confirmLabel: 'Jetzt starten' })
      .then(() => { done = true; });
    await Promise.resolve();
    assertTrue(!done, 'still waiting');
    const btn = document.querySelector('.action-modal__confirm');
    assertEqual(btn.textContent, 'Jetzt starten');
    btn.click();
    await p;
    assertTrue(done);
    assertEqual(document.querySelector('.action-modal'), null, 'hold closes on confirm');
  });

  test('close is safe without open and after hold', () => {
    const am = make();
    am.close();
    assertEqual(document.querySelector('.action-modal'), null);
  });

  test('the body is announced politely', () => {
    const am = make();
    am.open({ title: 'T' });
    const el = document.querySelector('.action-modal');
    assertEqual(el.getAttribute('role'), 'status');
    assertEqual(el.getAttribute('aria-live'), 'polite');
    am.close();
  });
});
