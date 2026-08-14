/**
 * D.Mike — Project rehydrate (frame/project-rehydrate.js)
 * Rebuilds the UI for the now-active project after stateManager.switchProject()
 * or switchCycle(). Replaces the former location.reload() workaround in the
 * header project switcher.
 */

import { getPhaseIds } from '../core/cycles/cycles.js';

/**
 * Rebuild the workspace, tiles and chrome for the active project and navigate
 * to its first phase. The caller must have completed the state-side switch
 * (switchProject / switchCycle) before calling this.
 *
 * @param {object} deps
 * @param {object} deps.stateManager
 * @param {object} deps.eventBus
 * @param {object} deps.moduleRegistry
 * @param {object} deps.dmaicTiles
 * @param {object} deps.workspace
 * @param {object} deps.router
 * @param {object} [options]
 * @param {boolean} [options.navigate=true] - When false, skip the final
 *   router.navigate() call (reset/rebuild/emit still happen). Used by callers
 *   whose own router already performs navigation for this switch — e.g. an
 *   action-URL verb handler — where a second navigate() would run reentrantly
 *   while the router's `_applying` guard is still set.
 * @returns {Promise<void>}
 */
export async function rehydrateProject({
  stateManager, eventBus, moduleRegistry, dmaicTiles, workspace, router,
}, { navigate = true } = {}) {
  const projectId = stateManager.getActiveProjectId();
  const cycleId = stateManager.getProjectCycle();

  await workspace.reset();
  moduleRegistry?.setActiveCycle?.(cycleId);
  dmaicTiles.rebuild();

  eventBus.emit('project:rehydrated', { projectId });

  if (!navigate) return;

  const phaseId = getPhaseIds(cycleId)[0];
  await router.navigate({ kind: 'phase', projectId, phaseId }, { replace: true });
}
