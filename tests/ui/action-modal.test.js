/**
 * Tests for ui/action-modal.js — the non-dismissible progress dialog shown
 * while an action verb runs.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import { Modal } from '../../js/ui/modal.js';
import { createActionModal, scenarioDoneState } from '../../js/ui/action-modal.js';

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

  test('confirm resolves true, a forced close resolves false', async () => {
    // The caller must be able to tell "the user pressed the button" from
    // "something else closed the dialog" — only the first means "go ahead".
    const am = make();
    am.open({ title: 'T' });
    const confirmed = am.hold({ title: 'Fertig' });
    await Promise.resolve();
    document.querySelector('.action-modal__confirm').click();
    assertEqual(await confirmed, true, 'confirm click resolves true');

    am.open({ title: 'T2' });
    const forced = am.hold({ title: 'Fertig' });
    await Promise.resolve();
    am.close();
    assertEqual(await forced, false, 'forced close resolves false');
  });

  test('open during a hold settles it as a forced close and keeps the new dialog', async () => {
    const am = make();
    am.open({ title: 'T' });
    const pending = am.hold({ title: 'Fertig' });
    await Promise.resolve();
    am.open({ title: 'Neu' });
    // Raced against a timer so a stranded promise fails instead of hanging.
    const outcome = await Promise.race([
      pending, new Promise((r) => setTimeout(() => r('stranded'), 100)),
    ]);
    const title = document.querySelector('.modal__title')?.textContent;
    const stillOpen = !!document.querySelector('.action-modal');
    am.close();   // before the assertions: a failing one must not leak a dialog
    assertEqual(outcome, false, 'the outstanding hold was not confirmed');
    assertEqual(title, 'Neu');
    assertTrue(stillOpen, 'the new dialog is still open');
  });

  test('close settles a pending hold instead of stranding its caller', async () => {
    // The router closes the dialog in a `finally`. If close() tore the confirm
    // button out without settling hold()'s promise, the awaiting router would
    // hang forever and never navigate.
    const am = make();
    am.open({ title: 'T' });
    const p = am.hold({ title: 'Fertig' }).then(() => 'settled');
    await Promise.resolve();
    am.close();
    // Race against a timer so a stranded promise fails the test instead of
    // hanging the whole run.
    const outcome = await Promise.race([
      p, new Promise((r) => setTimeout(() => r('stranded'), 100)),
    ]);
    assertEqual(outcome, 'settled', 'hold() resolved when closed from outside');
    assertEqual(document.querySelector('.action-modal'), null);
  });

  test('close is safe without open and after hold', () => {
    const am = make();
    am.close();
    assertEqual(document.querySelector('.action-modal'), null);
  });

  test('isOpen reflects whether a dialog is mounted', () => {
    const am = make();
    assertEqual(am.isOpen(), false, 'closed before open()');
    am.open({ title: 'T' });
    assertEqual(am.isOpen(), true, 'open after open()');
    am.close();
    assertEqual(am.isOpen(), false, 'closed again after close()');
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

suite('createActionModal — loaded-items list', () => {
  const rows = () => [...document.querySelectorAll('.action-modal__item')];
  const labels = () => rows().map(r => r.querySelector('.action-modal__item-label').textContent);

  test('addItem prepends rows, newest on top', () => {
    const am = make();
    am.open({ title: 'T' });
    am.addItem({ id: 1, label: 'SIPOC' });
    am.addItem({ id: 2, label: 'Regression' });
    am.addItem({ id: 3, label: 'Histogramm' });
    assertDeepEqual(labels(), ['Histogramm', 'Regression', 'SIPOC']);
    am.close();
  });

  test('a fresh row is pending until it reports back', () => {
    const am = make();
    am.open({ title: 'T' });
    am.addItem({ id: 1, label: 'SIPOC' });
    assertTrue(rows()[0].classList.contains('action-modal__item--pending'));
    am.close();
  });

  test('markItem retroactively marks an earlier row as failed', () => {
    const am = make();
    am.open({ title: 'T' });
    am.addItem({ id: 1, label: 'SIPOC' });
    am.addItem({ id: 2, label: 'Regression' });
    am.markItem(1, false);
    am.markItem(2, true);
    const [newest, older] = rows();
    assertTrue(newest.classList.contains('action-modal__item--ok'), 'newest ok');
    assertTrue(older.classList.contains('action-modal__item--failed'), 'older failed');
    assertEqual(rows().length, 2, 'marking never adds or removes rows');
    am.close();
  });

  test('markItem for an unknown id is a no-op', () => {
    const am = make();
    am.open({ title: 'T' });
    am.addItem({ id: 1, label: 'SIPOC' });
    am.markItem(99, false);
    assertEqual(rows().length, 1);
    assertTrue(rows()[0].classList.contains('action-modal__item--pending'));
    am.close();
  });

  test('addItem/markItem are no-ops when nothing is open', () => {
    const am = make();
    am.addItem({ id: 1, label: 'X' });
    am.markItem(1, true);
    assertEqual(document.querySelector('.action-modal__item'), null);
  });

  test('re-opening clears the list of the previous run', () => {
    const am = make();
    am.open({ title: 'A' });
    am.addItem({ id: 1, label: 'SIPOC' });
    am.open({ title: 'B' });
    assertEqual(rows().length, 0);
    am.close();
  });

  test('the list survives hold — that is when the user reads it', async () => {
    const am = make();
    am.open({ title: 'T' });
    am.addItem({ id: 1, label: 'SIPOC' });
    am.markItem(1, true);
    const p = am.hold({ title: 'Fertig' });
    await Promise.resolve();
    assertDeepEqual(labels(), ['SIPOC']);
    am.close();
    await p;
  });

  test('the list is not announced row by row', () => {
    // The dialog is a polite live region for its title/subtitle. Prepending
    // 21 rows and then mutating each one would queue ~42 announcements, so
    // the list opts out and the running commentary stays out of the way.
    const am = make();
    am.open({ title: 'T' });
    am.addItem({ id: 1, label: 'SIPOC' });
    assertEqual(document.querySelector('.action-modal__list').getAttribute('aria-live'), 'off');
    am.close();
  });

  test('a long list never lets the dialog grow past its fixed box', () => {
    // The layout guarantee itself (internal scrolling) lives in CSS and is
    // pinned by the e2e test in tests/global/scenario-load.spec.js — the unit
    // runner loads no stylesheet. What IS testable here: the list stays ONE
    // element with one row per item, so nothing else in the dialog moves.
    const am = make();
    am.open({ title: 'T' });
    for (let i = 1; i <= 30; i++) am.addItem({ id: i, label: `Modul ${i}` });
    assertEqual(document.querySelectorAll('.action-modal__list').length, 1);
    assertEqual(rows().length, 30);
    assertEqual(labels()[0], 'Modul 30', 'newest still on top after many rows');
    am.close();
  });
});

suite('scenarioDoneState', () => {
  const i18n2 = { t: (k, p) => (p ? `${k}:${JSON.stringify(p)}` : k) };

  test('a clean run reads as ready', () => {
    const s = scenarioDoneState({ i18n: i18n2, result: { loaded: ['a', 'b'], failed: [] }, total: 2 });
    assertEqual(s.title, 'actions.scenarioReady');
    assertTrue(s.subtitle.startsWith('actions.scenarioLoaded'));
    assertEqual(s.body, null, 'nothing extra to say');
    assertEqual(s.confirmLabel, 'actions.startNow', 'default label');
  });

  test('a partial run reads as partial and names the failed ids', () => {
    const s = scenarioDoneState({
      i18n: i18n2,
      result: { loaded: ['a'], failed: [{ exampleId: 'ex-b', error: 'module failed to mount' }] },
      total: 2,
    });
    assertEqual(s.title, 'actions.scenarioPartial');
    assertTrue(s.body instanceof Node, 'a body node names the failures');
    assertTrue(s.body.textContent.includes('ex-b'), 'the failing id is named');
    assertTrue(
      !s.body.textContent.includes('module failed to mount'),
      'never the raw developer error',
    );
  });

  test('the confirm label can be overridden for callers that start nothing', () => {
    const s = scenarioDoneState({
      i18n: i18n2, result: { loaded: [], failed: [] }, total: 0, confirmLabel: 'common.close',
    });
    assertEqual(s.confirmLabel, 'common.close');
  });
});
