/**
 * Tests for ui/dialog/dialog.js — the one dialog service.
 */
import { suite, test, assertEqual, assertTrue, afterEach } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { createDialogService, DIALOG_TEMPLATE } from '../../js/ui/dialog/dialog.js';
import { inlineTileTemplate } from '../modules/tile-test-utils.js';
import { openColorPicker } from '../../js/core/color-picker.js';

const i18n = { t: (k) => k };
const tick = () => Alpine.nextTick();
const dialogs = () => [...document.querySelectorAll('.dialog')];
const top = () => dialogs().at(-1);
// Dispatched on the body, which mirrors a real key press and lets the capture
// listener on window run before bubble listeners.
const escape = () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
// Fired on window itself (no capture/bubble path through the document) —
// the listener sits on window, so it must react at the target phase too.
const escapeOnWindow = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
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
      () => escapeOnWindow(),
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

  test('show onClose fires once for ✕, Escape, overlay and close()', async () => {
    const d = await service();
    const ways = {
      x: () => top().querySelector('.dialog__close').click(),
      escape: () => escape(),
      overlay: () => clickOverlay(top()),
      handle: (h) => h.close(),
    };
    for (const [name, closeIt] of Object.entries(ways)) {
      let calls = 0;
      const h = d.show({ title: name, content: document.createElement('div'), onClose: () => { calls += 1; } });
      await tick();
      closeIt(h);
      h.close();                      // a second close is a no-op
      assertEqual(dialogs().length, 0, `${name}: closed`);
      assertEqual(calls, 1, `${name}: onClose once`);
    }
  });

  test('show onClose runs after the borrowed node is home again', async () => {
    const d = await service();
    const home = document.createElement('div');
    const content = document.createElement('p');
    home.append(content);
    document.body.append(home);
    let parentAtClose = null;
    const h = d.show({ title: 'B', content, onClose: () => { parentAtClose = content.parentNode; } });
    assertEqual(content.parentNode.getAttribute('data-dialog-slot'), 'body');
    h.close();
    assertEqual(parentAtClose, home);
    home.remove();
  });

  test('Escape is left to the content while it marks data-dialog-owns-escape', async () => {
    // e.g. the Settings shortcut capture: Escape stops capturing, not the dialog.
    const d = await service();
    const content = document.createElement('div');
    const widget = document.createElement('button');
    widget.setAttribute('data-dialog-owns-escape', '');
    content.append(widget);
    let reached = 0;
    const own = (e) => { if (e.key === 'Escape') reached += 1; };
    document.addEventListener('keydown', own, true);
    try {
      const h = d.show({ title: 'K', content });
      escape();
      assertEqual(dialogs().length, 1, 'still open');
      assertEqual(reached, 1, 'the content saw the Escape');
      widget.removeAttribute('data-dialog-owns-escape');
      escape();
      assertEqual(dialogs().length, 0, 'closes once the mark is gone');
      h.close();
    } finally {
      document.removeEventListener('keydown', own, true);
    }
  });

  test('a colour picker opened over a dialog takes the first Escape, the dialog the second', async () => {
    const d = await service();
    const swatch = document.createElement('button');
    const h = d.show({ title: 'F', content: swatch });
    const picker = () => document.querySelector('.dmike-chart-ed-cp-overlay');
    openColorPicker({ target: swatch }, 'rgba(0,0,0,1)', () => {});
    try {
      assertTrue(!!picker(), 'picker open');
      escape();
      assertTrue(!picker(), 'Escape closed the picker');
      assertEqual(dialogs().length, 1, 'the dialog stays open');
      escape();
      assertEqual(dialogs().length, 0, 'the next Escape closes the dialog');
    } finally {
      document.querySelectorAll('.dmike-chart-ed-cp-overlay, .dmike-chart-ed-cp-popup').forEach((el) => el.remove());
      h.close();
    }
  });

  test('a colour picker without a dialog closes on Escape', async () => {
    const swatch = document.createElement('button');
    document.body.append(swatch);
    openColorPicker({ target: swatch }, 'rgba(0,0,0,1)', () => {});
    try {
      escapeOnWindow();
      assertTrue(!document.querySelector('.dmike-chart-ed-cp-overlay'), 'picker closed');
      assertTrue(!document.querySelector('.dmike-chart-ed-cp-popup'), 'popup removed');
    } finally {
      document.querySelectorAll('.dmike-chart-ed-cp-overlay, .dmike-chart-ed-cp-popup').forEach((el) => el.remove());
      swatch.remove();
    }
  });

  test('show setTitle updates the title and is a no-op after close', async () => {
    const d = await service();
    const h = d.show({ title: 'Alt', content: document.createElement('div') });
    h.setTitle('Neu');
    await tick();
    assertEqual(top().querySelector('.dialog__title').textContent, 'Neu');
    h.close();
    h.setTitle('Danach');             // must not throw
    assertEqual(dialogs().length, 0);
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

suite('dialog service — form', () => {
  afterEach(() => { for (const el of dialogs()) el.remove(); });

  test('form shows content and resolves true on confirm', async () => {
    const d = await service();
    const content = document.createElement('div');
    content.className = 'my-form';
    const p = d.form({ title: 'F', content });
    assertTrue(top().classList.contains('dialog--form'));
    assertEqual(top().querySelector('.dialog__body > .my-form'), content);
    assertEqual(top().querySelector('.dialog__confirm').textContent, 'common.save');
    top().querySelector('.dialog__confirm').click();
    assertEqual(await p, true);
  });

  test('cancel, ✕, Escape and overlay click resolve false', async () => {
    const d = await service();
    for (const dismiss of [
      () => top().querySelector('.dialog__cancel').click(),
      () => top().querySelector('.dialog__close').click(),
      () => escape(),
      () => clickOverlay(top()),
    ]) {
      const p = d.form({ title: 'F', content: document.createElement('div') });
      dismiss();
      assertEqual(await p, false);
    }
  });

  test('hideConfirm renders cancel but no confirm button', async () => {
    const d = await service();
    const p = d.form({ title: 'F', content: document.createElement('div'), hideConfirm: true });
    assertEqual(top().querySelector('.dialog__confirm'), null);
    top().querySelector('.dialog__cancel').click();
    assertEqual(await p, false);
  });

  test('onMount receives the body and an api that confirms and cancels', async () => {
    const d = await service();
    let api = null;
    let body = null;
    const p = d.form({ title: 'F', content: document.createElement('div'), hideConfirm: true,
      onMount: (b, a) => { body = b; api = a; } });
    assertTrue(body.classList.contains('dialog__body'));
    api.confirm();
    assertEqual(await p, true);

    let api2 = null;
    const p2 = d.form({ title: 'F', content: document.createElement('div'), onMount: (_b, a) => { api2 = a; } });
    api2.cancel();
    assertEqual(await p2, false);
  });

  test('api.confirm respects an onConfirm veto', async () => {
    const d = await service();
    let api = null;
    let calls = 0;
    const p = d.form({ title: 'F', content: document.createElement('div'),
      onMount: (_b, a) => { api = a; },
      onConfirm: () => { calls += 1; return calls === 1 ? false : undefined; } });
    api.confirm();
    assertEqual(dialogs().length, 1, 'veto keeps the dialog open');
    api.confirm();
    assertEqual(await p, true);
  });

  test('confirm()/cancel() after the dialog resolved are no-ops', async () => {
    const d = await service();
    let api = null;
    let calls = 0;
    const p = d.form({ title: 'F', content: document.createElement('div'),
      onMount: (_b, a) => { api = a; }, onConfirm: () => { calls += 1; } });
    api.confirm();
    assertEqual(await p, true);
    api.confirm();
    api.cancel();
    assertEqual(calls, 1, 'a late confirm()/cancel() does not re-run onConfirm');
  });

  test('onDelete renders a delete button; false vetoes, else resolves deleted', async () => {
    const d = await service();
    let allow = false;
    const p = d.form({ title: 'F', content: document.createElement('div'), deleteLabel: 'Weg',
      onDelete: () => (allow ? undefined : false) });
    const del = top().querySelector('.dialog__delete');
    assertEqual(del.textContent, 'Weg');
    del.click();
    assertEqual(dialogs().length, 1, 'vetoed');
    allow = true;
    del.click();
    assertEqual(await p, 'deleted');
  });

  test('footerStart sits in the footer-start slot, buttons still present', async () => {
    const d = await service();
    const extra = document.createElement('button');
    const p = d.form({ title: 'F', content: document.createElement('div'), footerStart: extra });
    assertEqual(top().querySelector('.dialog__footer-start').firstElementChild, extra);
    assertTrue(!!top().querySelector('.dialog__confirm'));
    top().querySelector('.dialog__confirm').click();
    assertEqual(await p, true);
  });

  test('a borrowed node returns to its home and keeps its position', async () => {
    const d = await service();
    const home = document.createElement('div');
    const before = document.createElement('i');
    const node = document.createElement('form');
    const after = document.createElement('b');
    home.append(before, node, after);
    document.body.append(home);
    const p = d.form({ title: 'F', content: node });
    assertEqual(node.parentNode.dataset.dialogSlot, 'body');
    top().querySelector('.dialog__cancel').click();
    await p;
    assertEqual([...home.children].map(c => c.tagName).join(','), 'I,FORM,B');
    home.remove();
  });

  test('restore tolerates a removed next sibling', async () => {
    const d = await service();
    const home = document.createElement('div');
    const node = document.createElement('form');
    const after = document.createElement('b');
    home.append(node, after);
    const p = d.form({ title: 'F', content: node });
    after.remove(); // Alpine re-rendered the module while the dialog was open
    top().querySelector('.dialog__cancel').click();
    await p;
    assertEqual(home.lastElementChild, node, 'appended at the end');
  });

  test('nested: Escape closes only the top dialog', async () => {
    const d = await service();
    const outer = d.form({ title: 'F', content: document.createElement('div') });
    const inner = d.confirm({ message: 'Löschen?' });
    escape();
    assertEqual(await inner, false);
    assertEqual(dialogs().length, 1, 'the form is still open');
    assertTrue(top().classList.contains('dialog--form'));
    top().querySelector('.dialog__cancel').click();
    assertEqual(await outer, false);
  });

  test('a throwing onMount removes the dialog and rejects', async () => {
    const d = await service();
    let reached = 0;
    const behind = (e) => { if (e.key === 'Escape') reached += 1; };
    window.addEventListener('keydown', behind);
    try {
      let error = null;
      try {
        await d.form({ title: 'F', content: document.createElement('div'),
          onMount: () => { throw new Error('boom'); } });
      } catch (e) { error = e; }
      assertEqual(error && error.message, 'boom');
      assertEqual(dialogs().length, 0, 'no stuck overlay');
      escape();
      assertEqual(reached, 1, 'no leaked capture listener');
    } finally {
      window.removeEventListener('keydown', behind);
    }
  });
});

suite('dialog service — dismiss robustness', () => {
  afterEach(() => { for (const el of dialogs()) el.remove(); });

  test('a stale overlay press does not dismiss after a press inside the window', async () => {
    const d = await service();
    const p = d.confirm({ message: 'M' });
    top().dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); // release happened outside the browser
    top().querySelector('.dialog__window').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    top().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assertEqual(dialogs().length, 1, 'still open');
    top().querySelector('.dialog__cancel').click();
    await p;
  });

  test('Escape during IME composition is ignored', async () => {
    const d = await service();
    const p = d.confirm({ message: 'M' });
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, isComposing: true }));
    assertEqual(dialogs().length, 1, 'still open');
    escape();
    assertEqual(await p, false);
  });
});
