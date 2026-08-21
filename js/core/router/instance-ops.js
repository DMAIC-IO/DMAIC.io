/**
 * D.Mike — Shared module-instance helpers used by the router and
 * example-deeplink startup concern. Pure: no DOM; only touches
 * stateManager, moduleRegistry, and eventBus.
 */

import { uid } from '../uid.js';

/**
 * Find the phase id whose instance array contains the given instanceId.
 * @param {object} stateManager
 * @param {string} instanceId
 * @returns {string|null}
 */
export function findInstancePhase(stateManager, instanceId) {
  for (const phaseId of Object.keys(stateManager.get('phases') || {})) {
    const insts = stateManager.get(`phases.${phaseId}`) ?? [];
    if (insts.some(i => i.instanceId === instanceId)) return phaseId;
  }
  return null;
}

/**
 * Find the first existing instance of moduleId across all phases.
 * @param {object} stateManager
 * @param {string} moduleId
 * @returns {{ instanceId: string, phaseId: string }|null}
 */
export function findExistingInstance(stateManager, moduleId) {
  for (const phaseId of Object.keys(stateManager.get('phases') || {})) {
    const insts = stateManager.get(`phases.${phaseId}`) ?? [];
    const found = insts.find(i => i.moduleId === moduleId);
    if (found) return { instanceId: found.instanceId, phaseId };
  }
  return null;
}

/**
 * Create a new instance of moduleId in the derived phase for the active
 * cycle, persist it, and emit `module:added`. Returns the new instanceId.
 * @param {object} stateManager
 * @param {object} moduleRegistry
 * @param {object} eventBus
 * @param {string} moduleId
 * @param {object} def  Module definition (has .phase and .cycles)
 * @param {object} [options]
 * @param {boolean} [options.silent=false]  When true, emit `module:added` with
 *   `silent: true` so the workspace refreshes tabs WITHOUT eagerly mounting or
 *   activating a live instance (used by headless Dev-Tools seeding, so the
 *   persisted example is only read when the user later opens the tab).
 * @returns {string}
 */
export function createInstance(stateManager, moduleRegistry, eventBus, moduleId, def, { silent = false } = {}) {
  const activeCycle = moduleRegistry.getActiveCycle();
  const targetPhase = def.phase === 'data'
    ? 'data'
    : (def.cycles?.[activeCycle]?.phase || def.phase || 'extras');

  const instanceId = uid();
  const phases = stateManager.get(`phases.${targetPhase}`) ?? [];
  phases.push({ instanceId, moduleId, order: phases.length, state: {} });
  stateManager.set(`phases.${targetPhase}`, phases);
  eventBus.emit('module:added', { moduleId, phase: targetPhase, instanceId, silent });
  return instanceId;
}
