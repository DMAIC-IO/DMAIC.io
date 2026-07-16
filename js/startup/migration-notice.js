/**
 * D.Mike — Migration notice startup concern.
 * After a cross-version-migrating import, the success toast is wiped by the
 * page reload. We stash a flag in sessionStorage during import and surface it
 * here on the next boot.
 */
import { createStartup } from '../core/create-startup.js';

const FLAG_KEY = 'dmike_import_migrated';

export default createStartup({
  id: 'migration-notice',

  shouldRun() {
    return sessionStorage.getItem(FLAG_KEY) !== null;
  },

  run({ notify, i18n }) {
    const raw = sessionStorage.getItem(FLAG_KEY);
    sessionStorage.removeItem(FLAG_KEY);
    try {
      const { from, to } = JSON.parse(raw);
      notify(i18n.t('app.importMigrated', { from, to }), 'info');
    } catch { /* ignore malformed flag */ }
  },
});
