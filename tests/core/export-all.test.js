/**
 * Kern: Projekt-Export als Baustein (`core/export-all.js`). Ein gescheiterter
 * Export (etwa ein Haken `redact`, der nicht geladen ist) lädt nichts herunter
 * und meldet einen Fehler-Toast statt still zu scheitern.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { exportAllProjects, notifyExportFailed } from '../../js/core/export-all.js';

const i18n = { t: (key) => (key === 'common.error' ? 'Fehler' : key) };

/** console.error während `fn` stummschalten. */
async function quiet(fn) {
  const orig = console.error;
  console.error = () => {};
  try { return await fn(); } finally { console.error = orig; }
}

suite('core/export-all', () => {
  test('exportAllProjects: Export wirft → Fehler-Toast, kein project:exported, Rückgabe false', async () => {
    const toasts = [];
    const emitted = [];
    const stateManager = { exportAllJSON: async () => { throw new Error('[ModuleRegistry] rest-api: redact nicht geladen'); } };
    const eventBus = { emit: (name) => emitted.push(name) };
    const ok = await quiet(() => exportAllProjects({ stateManager, eventBus, i18n, notify: (...a) => toasts.push(a) }));
    assertEqual(ok, false);
    assertDeepEqual(toasts, [['Fehler: [ModuleRegistry] rest-api: redact nicht geladen', 'error']]);
    assertDeepEqual(emitted, []);
  });

  test('notifyExportFailed: auch ohne Error-Objekt eine Meldung', async () => {
    const toasts = [];
    await quiet(() => notifyExportFailed({ i18n, notify: (...a) => toasts.push(a) }, 'kaputt'));
    assertDeepEqual(toasts, [['Fehler: kaputt', 'error']]);
  });
});
