/**
 * D.Mike — Übergabe an eine Instanz eines anderen Moduls (instance-handoff.js)
 *
 * Ein Werkzeug legt in der eigenen Phase eine Instanz eines anderen Moduls
 * an, schreibt deren Anfangszustand und meldet `module:added`.
 *
 * Rein: kein DOM, kein `window`.
 */
import { uid } from './uid.js';

/**
 * Die Phase, in der eine Instanz registriert ist.
 * @param {object} stateManager der StateManager aus `module._context`
 * @param {string} instanceId die eigene Instanz-id
 * @returns {string} die Phasen-id, `'data'`, wenn die Instanz nirgends steht
 */
export function findOwnPhase(stateManager, instanceId) {
  for (const p of Object.keys(stateManager.get('phases') || {})) {
    const items = stateManager.get(`phases.${p}`) ?? [];
    if (items.some(i => i.instanceId === instanceId)) return p;
  }
  return 'data';
}

/**
 * Eine Instanz eines anderen Moduls in der Phase der aufrufenden Instanz
 * anlegen, ihren Zustand setzen und `module:added` melden.
 * @param {{ stateManager: object, eventBus: object, instanceId: string }} services
 *   `module._context` der aufrufenden Instanz
 * @param {{ moduleId: string, state: object }} target Zielmodul und dessen Anfangszustand
 * @returns {{ instanceId: string, moduleId: string }} die neue Instanz
 */
export function openInstance(services, { moduleId, state }) {
  const sm = services.stateManager;
  const phase = findOwnPhase(sm, services.instanceId);
  const updated = (sm.get(`phases.${phase}`) || []).slice();
  const instanceId = uid();
  updated.push({ instanceId, moduleId, order: updated.length, state: {} });
  sm.set(`phases.${phase}`, updated);
  sm.setModuleState(instanceId, state);
  services.eventBus.emit('module:added', { moduleId, phase, instanceId });
  return { instanceId, moduleId };
}
