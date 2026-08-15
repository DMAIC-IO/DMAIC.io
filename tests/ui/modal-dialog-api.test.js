/**
 * Tests for the modal options the action modal and the two-step cycle picker
 * rely on: a non-dismissible dialog, an extra overlay class, a hidden confirm
 * button, and programmatic confirm/cancel from inside the content.
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { Modal } from '../../js/ui/modal.js';

const i18n = { t: (k) => k };

suite('Modal options', () => {
  test('dismissible:false renders no close button', () => {
    const m = new Modal(i18n);
    const handle = m.show('T', document.createElement('div'), { dismissible: false });
    assertEqual(document.querySelector('.modal-overlay .modal__close'), null);
    handle.close();
  });

  test('dismissible defaults to true (close button present)', () => {
    const m = new Modal(i18n);
    const handle = m.show('T', document.createElement('div'));
    assertTrue(!!document.querySelector('.modal-overlay .modal__close'));
    handle.close();
  });

  test('overlayClass is added to the overlay', () => {
    const m = new Modal(i18n);
    const handle = m.show('T', document.createElement('div'), { overlayClass: 'modal-overlay--action' });
    assertTrue(document.querySelector('.modal-overlay').classList.contains('modal-overlay--action'));
    handle.close();
  });

  test('hideConfirm renders cancel but no confirm button', async () => {
    const m = new Modal(i18n);
    const p = m.form('T', document.createElement('div'), { hideConfirm: true });
    assertEqual(document.querySelector('.modal__confirm'), null);
    const cancel = document.querySelector('.modal__footer .btn--secondary');
    assertTrue(!!cancel, 'cancel is always available');
    cancel.click();
    assertEqual(await p, false);
  });

  test('onMount receives an api that can confirm and cancel', async () => {
    const m = new Modal(i18n);
    let api = null;
    const p = m.form('T', document.createElement('div'), {
      hideConfirm: true, onMount: (_body, a) => { api = a; },
    });
    assertTrue(!!api && typeof api.confirm === 'function' && typeof api.cancel === 'function');
    api.confirm();
    assertEqual(await p, true);

    let api2 = null;
    const p2 = m.form('T', document.createElement('div'), { onMount: (_b, a) => { api2 = a; } });
    api2.cancel();
    assertEqual(await p2, false);
  });

  test('api.confirm respects an onConfirm veto', async () => {
    const m = new Modal(i18n);
    let api = null;
    let calls = 0;
    const p = m.form('T', document.createElement('div'), {
      onMount: (_b, a) => { api = a; },
      onConfirm: () => { calls += 1; return calls === 1 ? false : undefined; },
    });
    api.confirm();
    assertTrue(!!document.querySelector('.modal-overlay'), 'veto keeps the dialog open');
    api.confirm();
    assertEqual(await p, true);
  });
});
