/**
 * Tests for dialog.progress() — the non-dismissible progress dialog shown
 * while an action verb runs — and scenarioDoneState().
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual, afterEach } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { createDialogService, DIALOG_TEMPLATE } from '../../js/ui/dialog/dialog.js';
import { scenarioDoneState } from '../../js/ui/dialog/progress.js';
import { inlineTileTemplate } from '../modules/tile-test-utils.js';

const i18n = { t: (k) => k };
const tick = () => Alpine.nextTick();
const q = (sel) => document.querySelector(sel);

async function make() {
  if (!Alpine.version) Alpine.start();
  await inlineTileTemplate(DIALOG_TEMPLATE);
  return createDialogService({ i18n }).progress();
}

suite('dialog.progress', () => {
  afterEach(() => { for (const el of document.querySelectorAll('.dialog')) el.remove(); });

  test('open mounts one dialog with title and subtitle', async () => {
    const am = await make();
    am.open({ title: 'Szenario wird geladen', subtitle: 'Pizza' });
    assertEqual(document.querySelectorAll('.dialog--progress').length, 1);
    assertEqual(q('.dialog__title').textContent, 'Szenario wird geladen');
    assertEqual(q('.action-modal__subtitle').textContent, 'Pizza');
    am.close();
  });

  test('the dialog cannot be dismissed by the user', async () => {
    const am = await make();
    am.open({ title: 'T' });
    assertEqual(q('.dialog__close'), null, 'no ✕');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    const overlay = q('.dialog--progress');
    overlay.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assertTrue(am.isOpen(), 'Escape and overlay click do nothing');
    assertTrue(!!q('.dialog--progress'));
    am.close();
  });

  test('update replaces the progress line only', async () => {
    const am = await make();
    am.open({ title: 'T', subtitle: 'S' });
    am.update('Modul 3 von 21');
    await tick();
    assertEqual(q('.action-modal__progress').textContent, 'Modul 3 von 21');
    assertEqual(q('.action-modal__subtitle').textContent, 'S');
    am.close();
  });

  test('update is a no-op when nothing is open', async () => {
    const am = await make();
    am.update('x');
    assertEqual(q('.action-modal'), null);
  });

  test('open twice reuses one dialog', async () => {
    const am = await make();
    am.open({ title: 'A' });
    am.open({ title: 'B' });
    await tick();
    assertEqual(document.querySelectorAll('.dialog').length, 1);
    assertEqual(q('.dialog__title').textContent, 'B');
    am.close();
  });

  test('hold keeps the dialog open until the button is clicked', async () => {
    const am = await make();
    am.open({ title: 'T' });
    let done = false;
    const p = am.hold({ title: 'Fertig', subtitle: '21 von 21', confirmLabel: 'Jetzt starten' })
      .then(() => { done = true; });
    await tick();
    assertTrue(!done, 'still waiting');
    const btn = q('.action-modal__confirm');
    assertEqual(btn.textContent, 'Jetzt starten');
    assertTrue(btn.classList.contains('dialog__confirm'), 'shared confirm hook');
    assertTrue(!!btn.closest('.action-modal'), 'stays inside .action-modal');
    btn.click();
    await p;
    assertTrue(done);
    assertEqual(q('.action-modal'), null, 'hold closes on confirm');
  });

  test('hold focuses its button and hides the spinner', async () => {
    const am = await make();
    am.open({ title: 'T' });
    const p = am.hold({ title: 'Fertig' });
    await tick();
    await tick();
    assertEqual(document.activeElement, q('.action-modal__confirm'));
    assertEqual(q('.app-loading__spinner').style.display, 'none');
    am.close();
    await p;
  });

  test('hold renders a note as the failure paragraph', async () => {
    const am = await make();
    am.open({ title: 'T' });
    const p = am.hold({ title: 'Teilweise', note: 'ex-b fehlgeschlagen' });
    await tick();
    try {
      assertEqual(q('.action-modal__body .action-modal__failed').textContent, 'ex-b fehlgeschlagen');
    } finally {
      am.close();
      await p;
    }
  });

  test('confirm resolves true, a forced close resolves false', async () => {
    const am = await make();
    am.open({ title: 'T' });
    const confirmed = am.hold({ title: 'Fertig' });
    await tick();
    q('.action-modal__confirm').click();
    assertEqual(await confirmed, true);

    am.open({ title: 'T2' });
    const forced = am.hold({ title: 'Fertig' });
    await tick();
    am.close();
    assertEqual(await forced, false);
  });

  test('open during a hold settles it as a forced close and keeps the new dialog', async () => {
    const am = await make();
    am.open({ title: 'T' });
    const pending = am.hold({ title: 'Fertig' });
    await tick();
    am.open({ title: 'Neu' });
    const outcome = await Promise.race([pending, new Promise((r) => setTimeout(() => r('stranded'), 100))]);
    await tick();
    const title = q('.dialog__title').textContent;
    const stillOpen = !!q('.action-modal');
    const holdGone = !q('.action-modal__confirm');
    am.close();
    assertEqual(outcome, false);
    assertEqual(title, 'Neu');
    assertTrue(stillOpen, 'the new dialog is still open');
    assertTrue(holdGone, 'the old hold button is gone');
  });

  test('close settles a pending hold instead of stranding its caller', async () => {
    const am = await make();
    am.open({ title: 'T' });
    const p = am.hold({ title: 'Fertig' }).then(() => 'settled');
    await tick();
    am.close();
    const outcome = await Promise.race([p, new Promise((r) => setTimeout(() => r('stranded'), 100))]);
    assertEqual(outcome, 'settled');
    assertEqual(q('.action-modal'), null);
  });

  test('hold without an open dialog resolves false', async () => {
    const am = await make();
    assertEqual(await am.hold({ title: 'X' }), false);
  });

  test('close is safe without open', async () => {
    const am = await make();
    am.close();
    assertEqual(q('.action-modal'), null);
  });

  test('isOpen reflects whether a dialog is mounted', async () => {
    const am = await make();
    assertEqual(am.isOpen(), false);
    am.open({ title: 'T' });
    assertEqual(am.isOpen(), true);
    am.close();
    assertEqual(am.isOpen(), false);
  });

  test('the body is announced politely', async () => {
    const am = await make();
    am.open({ title: 'T' });
    const el = q('.action-modal');
    assertEqual(el.getAttribute('role'), 'status');
    assertEqual(el.getAttribute('aria-live'), 'polite');
    assertEqual(el.getAttribute('aria-label'), 'actions.modalLabel');
    am.close();
  });
});

suite('dialog.progress — loaded-items list', () => {
  afterEach(() => { for (const el of document.querySelectorAll('.dialog')) el.remove(); });
  const rows = () => [...document.querySelectorAll('.action-modal__item')];
  const labels = () => rows().map(r => r.querySelector('.action-modal__item-label').textContent);

  test('addItem prepends rows, newest on top', async () => {
    const am = await make();
    am.open({ title: 'T' });
    am.addItem({ id: 1, label: 'SIPOC' });
    am.addItem({ id: 2, label: 'Regression' });
    am.addItem({ id: 3, label: 'Histogramm' });
    await tick();
    assertDeepEqual(labels(), ['Histogramm', 'Regression', 'SIPOC']);
    am.close();
  });

  test('a fresh row is pending until it reports back', async () => {
    const am = await make();
    am.open({ title: 'T' });
    am.addItem({ id: 1, label: 'SIPOC' });
    await tick();
    assertTrue(rows()[0].classList.contains('action-modal__item--pending'));
    assertEqual(rows()[0].querySelector('.action-modal__item-status').getAttribute('aria-label'), 'actions.itemPending');
    am.close();
  });

  test('markItem retroactively marks an earlier row as failed', async () => {
    const am = await make();
    am.open({ title: 'T' });
    am.addItem({ id: 1, label: 'SIPOC' });
    am.addItem({ id: 2, label: 'Regression' });
    am.markItem(1, false);
    am.markItem(2, true);
    await tick();
    const [newest, older] = rows();
    assertTrue(newest.classList.contains('action-modal__item--ok'));
    assertTrue(older.classList.contains('action-modal__item--failed'));
    assertEqual(newest.querySelector('[data-icon]').getAttribute('data-icon'), 'status.ok');
    assertEqual(older.querySelector('[data-icon]').getAttribute('data-icon'), 'status.error');
    assertEqual(older.querySelector('.action-modal__item-status').getAttribute('aria-label'), 'actions.itemFailed');
    assertEqual(rows().length, 2);
    am.close();
  });

  test('markItem for an unknown id is a no-op', async () => {
    const am = await make();
    am.open({ title: 'T' });
    am.addItem({ id: 1, label: 'SIPOC' });
    am.markItem(99, false);
    await tick();
    assertEqual(rows().length, 1);
    assertTrue(rows()[0].classList.contains('action-modal__item--pending'));
    am.close();
  });

  test('addItem/markItem are no-ops when nothing is open', async () => {
    const am = await make();
    am.addItem({ id: 1, label: 'X' });
    am.markItem(1, true);
    assertEqual(q('.action-modal__item'), null);
  });

  test('re-opening clears the list of the previous run', async () => {
    const am = await make();
    am.open({ title: 'A' });
    am.addItem({ id: 1, label: 'SIPOC' });
    am.open({ title: 'B' });
    await tick();
    assertEqual(rows().length, 0);
    am.close();
  });

  test('the list survives hold — that is when the user reads it', async () => {
    const am = await make();
    am.open({ title: 'T' });
    am.addItem({ id: 1, label: 'SIPOC' });
    am.markItem(1, true);
    const p = am.hold({ title: 'Fertig' });
    await tick();
    assertDeepEqual(labels(), ['SIPOC']);
    am.close();
    await p;
  });

  test('the list is not announced row by row', async () => {
    const am = await make();
    am.open({ title: 'T' });
    am.addItem({ id: 1, label: 'SIPOC' });
    assertEqual(q('.action-modal__list').getAttribute('aria-live'), 'off');
    am.close();
  });

  test('a long list stays one list with one row per item', async () => {
    const am = await make();
    am.open({ title: 'T' });
    for (let i = 1; i <= 30; i++) am.addItem({ id: i, label: `Modul ${i}` });
    await tick();
    assertEqual(document.querySelectorAll('.action-modal__list').length, 1);
    assertEqual(rows().length, 30);
    assertEqual(labels()[0], 'Modul 30');
    am.close();
  });
});

suite('scenarioDoneState', () => {
  const i18n2 = { t: (k, p) => (p ? `${k}:${JSON.stringify(p)}` : k) };

  test('a clean run reads as ready', () => {
    const s = scenarioDoneState({ i18n: i18n2, result: { loaded: ['a', 'b'], failed: [] }, total: 2 });
    assertEqual(s.title, 'actions.scenarioReady');
    assertTrue(s.subtitle.startsWith('actions.scenarioLoaded'));
    assertEqual(s.note, null);
    assertEqual(s.confirmLabel, 'actions.startNow');
  });

  test('a partial run reads as partial and names the failed ids', () => {
    const s = scenarioDoneState({
      i18n: i18n2,
      result: { loaded: ['a'], failed: [{ exampleId: 'ex-b', error: 'module failed to mount' }] },
      total: 2,
    });
    assertEqual(s.title, 'actions.scenarioPartial');
    assertTrue(s.note.includes('ex-b'));
    assertTrue(!s.note.includes('module failed to mount'));
  });

  test('the confirm label can be overridden for callers that start nothing', () => {
    const s = scenarioDoneState({ i18n: i18n2, result: { loaded: [], failed: [] }, total: 0, confirmLabel: 'common.close' });
    assertEqual(s.confirmLabel, 'common.close');
  });
});
