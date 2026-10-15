/**
 * Tests for ui/dialog/dialog.js — the one dialog service.
 */
import { suite, test, assertEqual, assertTrue, afterEach } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { createDialogService, DIALOG_TEMPLATE } from '../../js/ui/dialog/dialog.js';
import { inlineTileTemplate } from '../modules/tile-test-utils.js';

const i18n = { t: (k) => k };
const tick = () => Alpine.nextTick();
const dialogs = () => [...document.querySelectorAll('.dialog')];
const top = () => dialogs().at(-1);
// Dispatched on the body like a real key press: an event targeted at window itself
// runs capture and bubble listeners in registration order, which a key press never does.
const escape = () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
/** A real overlay click: press and release on the overlay itself. */
const clickOverlay = (el) => {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};

async function service() {
  if (!Alpine.version) Alpine.start();
  await inlineTileTemplate(DIALOG_TEMPLATE);
  return createDialogService({ i18n });
}

suite('dialog service — confirm / alert / show', () => {
  afterEach(() => {
    // A failing test must not leave a dialog that swallows the next one's clicks.
    for (const el of dialogs()) el.remove();
  });

  test('confirm renders message, title and the variant hook', async () => {
    const d = await service();
    const p = d.confirm({ message: 'Wirklich?' });
    assertEqual(dialogs().length, 1);
    assertTrue(top().classList.contains('dialog--confirm'));
    assertEqual(top().querySelector('.dialog__title').textContent, 'common.confirm');
    assertEqual(top().querySelector('.dialog__message').textContent, 'Wirklich?');
    assertEqual(top().querySelector('.dialog__confirm').textContent, 'common.yes');
    top().querySelector('.dialog__confirm').click();
    assertEqual(await p, true);
    assertEqual(dialogs().length, 0, 'closed after confirm');
  });

  test('confirm resolves false on cancel, ✕, Escape and overlay click', async () => {
    const d = await service();
    for (const dismiss of [
      () => top().querySelector('.dialog__cancel').click(),
      () => top().querySelector('.dialog__close').click(),
      () => escape(),
      () => clickOverlay(top()),
    ]) {
      const p = d.confirm({ message: 'M' });
      dismiss();
      assertEqual(await p, false);
      assertEqual(dialogs().length, 0);
    }
  });

  test('danger confirm uses btn--danger', async () => {
    const d = await service();
    const p = d.confirm({ message: 'M', danger: true });
    assertTrue(top().querySelector('.dialog__confirm').classList.contains('btn--danger'));
    top().querySelector('.dialog__cancel').click();
    await p;
  });

  test('confirm focuses its confirm button', async () => {
    const d = await service();
    const p = d.confirm({ message: 'M' });
    await tick();
    assertEqual(document.activeElement, top().querySelector('.dialog__confirm'));
    top().querySelector('.dialog__cancel').click();
    await p;
  });

  test('alert has only an OK button and resolves on it', async () => {
    const d = await service();
    const p = d.alert({ message: 'Hinweis', title: 'Nightly' });
    assertTrue(top().classList.contains('dialog--alert'));
    assertEqual(top().querySelector('.dialog__cancel'), null);
    assertEqual(top().querySelector('.dialog__title').textContent, 'Nightly');
    top().querySelector('.dialog__confirm').click();
    assertEqual(await p, undefined);
    assertEqual(dialogs().length, 0);
  });

  test('show mounts content and closes via the handle', async () => {
    const d = await service();
    const content = document.createElement('img');
    const h = d.show({ title: 'Bild', content, size: 'wide' });
    assertTrue(top().classList.contains('dialog--show'));
    assertEqual(top().querySelector('[data-dialog-slot="body"]').firstElementChild, content);
    assertTrue(top().querySelector('.dialog__window').getAttribute('style').includes('width:800px'));
    h.close();
    h.close(); // idempotent
    assertEqual(dialogs().length, 0);
  });

  test('show({ dismissible: false }) has no ✕ and ignores Escape and overlay', async () => {
    const d = await service();
    const h = d.show({ title: 'S', content: document.createElement('div'), dismissible: false });
    assertEqual(top().querySelector('.dialog__close'), null);
    escape();
    clickOverlay(top());
    assertEqual(dialogs().length, 1, 'still open');
    h.close();
  });

  test('Escape does not reach window listeners behind the dialog', async () => {
    // Module popouts (fmea, stakeholder-analysis) close on @keydown.escape.window.
    const d = await service();
    let reached = 0;
    const behind = (e) => { if (e.key === 'Escape') reached += 1; };
    window.addEventListener('keydown', behind);
    try {
      const p = d.confirm({ message: 'M' });
      escape();
      assertEqual(await p, false);
      assertEqual(reached, 0, 'the popout behind did not see the Escape');
      escape();
      assertEqual(reached, 1, 'with no dialog open, Escape flows normally again');
    } finally {
      window.removeEventListener('keydown', behind);
    }
  });

  test('stacking: newest on top, Escape closes only the top', async () => {
    const d = await service();
    const a = d.confirm({ message: 'A' });
    const b = d.confirm({ message: 'B' });
    assertEqual(top().querySelector('.dialog__message').textContent, 'B');
    escape();
    assertEqual(await b, false);
    assertEqual(dialogs().length, 1);
    assertEqual(top().querySelector('.dialog__message').textContent, 'A');
    top().querySelector('.dialog__confirm').click();
    assertEqual(await a, true);
  });

  test('a drag that ends over the overlay does not dismiss', async () => {
    const d = await service();
    const p = d.confirm({ message: 'M' });
    const bar = top().querySelector('.dmike-chart-popout-titlebar');
    bar.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 100 }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 140, clientY: 130 }));
    window.dispatchEvent(new MouseEvent('mouseup', {}));
    // The browser fires the click on the common ancestor — the overlay.
    top().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    assertEqual(dialogs().length, 1, 'still open after the drag');
    assertTrue(/left:\d+px/.test(top().querySelector('.dialog__window').getAttribute('style')), 'window moved');
    top().querySelector('.dialog__cancel').click();
    await p;
  });

  test('the dialog is an aria-modal dialog labelled by its title', async () => {
    const d = await service();
    const p = d.confirm({ message: 'M', title: 'Löschen' });
    assertEqual(top().getAttribute('role'), 'dialog');
    assertEqual(top().getAttribute('aria-modal'), 'true');
    assertEqual(top().getAttribute('aria-label'), 'Löschen');
    top().querySelector('.dialog__cancel').click();
    await p;
  });
});
