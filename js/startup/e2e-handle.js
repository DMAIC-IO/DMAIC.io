/**
 * D.Mike — E2E test handle startup concern.
 * Opt-in via ?e2e=1 so the production bundle stays clean. Lets headless tests
 * force a synchronous flush instead of sleeping past the 2 s localStorage /
 * 500 ms IDB debounces, and reach into live module instances via the workspace.
 */
import { createStartup } from '../core/create-startup.js';

export default createStartup({
  id: 'e2e-handle',

  shouldRun() {
    return new URLSearchParams(location.search).get('e2e') === '1';
  },

  run({ stateManager, eventBus, moduleRegistry, i18n, themeManager, workspace, chartManager, exportReminder, examplesRegistry, glossaryRegistry, shortcutRegistry }) {
    window.__dmike = { stateManager, eventBus, moduleRegistry, i18n, themeManager, workspace, chartManager, exportReminder, examplesRegistry, glossaryRegistry, shortcutRegistry };
  },
});
