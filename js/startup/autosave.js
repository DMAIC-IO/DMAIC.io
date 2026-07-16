/**
 * D.Mike — Auto-save on unload startup concern.
 * Flushes top-level state to localStorage synchronously on beforeunload.
 * Module states are handled by StateManager's own unload hooks
 * (visibilitychange / pagehide / beforeunload → IDB flush).
 */
import { createStartup } from '../core/create-startup.js';

export default createStartup({
  id: 'autosave-on-unload',

  run({ stateManager }) {
    window.addEventListener('beforeunload', () => stateManager.save());
  },
});
