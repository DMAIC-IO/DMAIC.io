/**
 * D.Mike — Dev-Tools frame concern (frame/dev-tools.js)
 * Listens for `devtools:seed-all` (emitted by the Settings → Dev-Tools button)
 * and runs the headless seeder. Lives in the frame because it needs `workspace`
 * (from `ui`), which the settings-page context does not carry.
 */

import { seedAllModules } from '../core/dev-tools-seeder.js';

/**
 * Wire the Dev-Tools seed action.
 * @param {object} kernel - bootKernel() services (eventBus, moduleRegistry,
 *   examplesRegistry, stateManager, i18n).
 * @param {object} ui - UI widgets (workspace, notify).
 */
export function initDevTools(kernel, ui) {
  const { eventBus, moduleRegistry, examplesRegistry, stateManager, i18n } = kernel;
  const { workspace, notify } = ui;

  eventBus.on('devtools:seed-all', async () => {
    const res = await seedAllModules({
      moduleRegistry, examplesRegistry, stateManager, eventBus, workspace,
    });
    notify?.(
      i18n.t('settings.devtools.seedResult')
        .replace('{added}', res.added.length)
        .replace('{examples}', res.examplesLoaded.length),
      'success',
    );
  });
}
