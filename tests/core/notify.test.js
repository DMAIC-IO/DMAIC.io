import { suite, test, assert, assertEqual, beforeEach, afterEach } from '../test-utils.js';
import { notify } from '../../js/core/notify.js';

suite('notify — toast action', () => {
  let container;
  let created = false;

  beforeEach(() => {
    container = document.getElementById('toast-container');
    created = !container;
    if (created) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.append(container);
    }
    container.replaceChildren();
  });

  afterEach(() => {
    container.replaceChildren();
    if (created) container.remove();
  });

  test('without action there is no button', () => {
    notify('Gespeichert', 'success');
    const toast = container.lastElementChild;
    assertEqual(toast.textContent, 'Gespeichert');
    assertEqual(toast.querySelector('button'), null);
  });

  test('an action renders a button with its label', () => {
    notify('Fehler', 'error', null, { action: { label: 'Neu laden', onClick: () => {} } });
    const btn = container.lastElementChild.querySelector('button.toast__action');
    assert(btn, 'action button rendered');
    assertEqual(btn.type, 'button');
    assertEqual(btn.textContent, 'Neu laden');
  });

  test('clicking the button calls onClick and removes the toast', () => {
    let clicks = 0;
    notify('Fehler', 'error', null, { action: { label: 'Neu laden', onClick: () => { clicks++; } } });
    const toast = container.lastElementChild;
    toast.querySelector('button.toast__action').click();
    assertEqual(clicks, 1);
    assertEqual(toast.isConnected, false);
  });
});
