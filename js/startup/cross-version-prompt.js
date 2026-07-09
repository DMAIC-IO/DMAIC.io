/**
 * D.Mike — Cross-version import prompt startup concern.
 * Offers to take over data from an older D.Mike version on the same domain,
 * but only on a fresh install and only if the prompt was not already dismissed.
 */
import { createStartup } from '../core/create-startup.js';
import { findOtherVersions, importFromVersion } from '../core/cross-version-import.js';
import { buildCrossVersionImportDialog } from '../dialogs/cross-version-import/cross-version-import.js';
import { VERSION } from '../core/version.js';

export const CROSS_VERSION_DISMISSED_KEY =
  `dmike_v${VERSION.split('.').slice(0, 2).join('.')}_crossVersionPromptDismissed`;

export default createStartup({
  id: 'cross-version-prompt',

  shouldRun({ stateManager }) {
    if (findOtherVersions().length === 0) return false;
    if (localStorage.getItem(CROSS_VERSION_DISMISSED_KEY) === '1') return false;
    return _isFreshInstall(stateManager);
  },

  run({ stateManager, modal, notify, i18n, eventBus }) {
    const others = findOtherVersions();

    const dialog = buildCrossVersionImportDialog({ i18n, eventBus });

    dialog.open(modal, { versions: others }, {
      confirmLabel: i18n.t('crossVersion.takeover'),
      cancelLabel: i18n.t('crossVersion.dismiss'),
      onConfirm: async (body, model) => {
        const picked = model.result();
        if (!picked) return false;
        try {
          // _isFreshInstall guard above guarantees this is the auto-created
          // empty placeholder project. Capture its id so we can replace it
          // with the migrated projects instead of leaving both behind.
          const placeholderId = stateManager.getActiveProjectId();

          await importFromVersion(picked, stateManager);

          const imported = stateManager.getProjects().filter(p => p.id !== placeholderId);
          if (imported.length > 0) {
            await stateManager.deleteProject(placeholderId);
            // Re-read prefix because GLOBAL_PREFIX is private; on reload
            // _ensureActiveProject picks the first project when activeId
            // is invalid, but we set it explicitly for clarity.
            const mm = VERSION.split('.').slice(0, 2).join('.');
            localStorage.setItem(`dmike_v${mm}_activeProject`, imported[0].id);
          }

          localStorage.setItem(CROSS_VERSION_DISMISSED_KEY, '1');
          notify(i18n.t('crossVersion.success'), 'success');
          setTimeout(() => location.reload(), 800);
        } catch (err) {
          notify(`${i18n.t('common.error')  }: ${  err.message}`, 'error');
          return false;
        }
      },
    }).then(result => {
      if (result === null) localStorage.setItem(CROSS_VERSION_DISMISSED_KEY, '1');
    });
  },
});

function _isFreshInstall(stateManager) {
  const projects = stateManager.getProjects();
  if (projects.length !== 1) return false;
  const phases = stateManager.get('phases') || {};
  return Object.values(phases).every(arr => !arr || arr.length === 0);
}
