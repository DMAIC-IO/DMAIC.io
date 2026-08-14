/**
 * Tests for ui/action-splash.js
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { createActionSplash } from '../../js/ui/action-splash.js';

const i18n = { t: (k) => k };

suite('createActionSplash', () => {
  test('show mounts an overlay with title and subtitle', () => {
    const splash = createActionSplash({ i18n });
    splash.show({ title: 'Szenario wird geladen', subtitle: 'Pizza' });
    const el = document.querySelector('.action-splash');
    assertTrue(!!el, 'overlay mounted');
    assertEqual(el.querySelector('.action-splash__title').textContent, 'Szenario wird geladen');
    assertEqual(el.querySelector('.action-splash__subtitle').textContent, 'Pizza');
    splash.hide();
  });

  test('update replaces the progress line only', () => {
    const splash = createActionSplash({ i18n });
    splash.show({ title: 'T', subtitle: 'S' });
    splash.update('Modul 3 von 21');
    const el = document.querySelector('.action-splash');
    assertEqual(el.querySelector('.action-splash__progress').textContent, 'Modul 3 von 21');
    assertEqual(el.querySelector('.action-splash__title').textContent, 'T');
    splash.hide();
  });

  test('hide removes the overlay', () => {
    const splash = createActionSplash({ i18n });
    splash.show({ title: 'T' });
    splash.hide();
    assertEqual(document.querySelector('.action-splash'), null);
  });

  test('hide is safe without a prior show', () => {
    const splash = createActionSplash({ i18n });
    splash.hide();
    assertEqual(document.querySelector('.action-splash'), null);
  });

  test('show twice reuses one overlay node', () => {
    const splash = createActionSplash({ i18n });
    splash.show({ title: 'A' });
    splash.show({ title: 'B' });
    assertEqual(document.querySelectorAll('.action-splash').length, 1);
    splash.hide();
  });

  test('overlay is announced politely', () => {
    const splash = createActionSplash({ i18n });
    splash.show({ title: 'T' });
    const el = document.querySelector('.action-splash');
    assertEqual(el.getAttribute('role'), 'status');
    assertEqual(el.getAttribute('aria-live'), 'polite');
    splash.hide();
  });
});
