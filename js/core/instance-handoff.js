/**
 * D.Mike — Übergabe an eine Instanz eines anderen Moduls (instance-handoff.js)
 *
 * Ein Werkzeug legt in der eigenen Phase eine Instanz eines anderen Moduls
 * an, schreibt deren Anfangszustand und meldet `module:added`
 * (`openInstance`) — oder übergibt einer dort schon vorhandenen Instanz den
 * Zustand und aktiviert sie (`openOrActivateInstance`). `revealInstance`
 * holt eine bestehende Instanz nach vorn, etwa das Arbeitsblatt, an das der
 * Nutzer eben gesendet hat.
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

/**
 * Einer Instanz von `moduleId` in der Phase der aufrufenden Instanz einen
 * Zustand übergeben: gibt es dort schon eine, bekommt sie den Zustand
 * (`setModuleState`), das Ladeereignis und wird aktiviert
 * (`module:activated`); sonst legt `openInstance` eine neue an, danach folgt
 * das Ladeereignis. Das Ladeereignis trägt `{ instanceId, ...detail }`.
 * @param {{ stateManager: object, eventBus: object, instanceId: string }} services
 *   `module._context` der aufrufenden Instanz
 * @param {{ moduleId: string, state: object, loadEvent?: { name: string, detail?: object } }} target
 * @returns {string} die Instanz, die den Zustand bekommen hat
 */
export function openOrActivateInstance(services, { moduleId, state, loadEvent }) {
  const { stateManager, eventBus } = services;
  const load = (instanceId) => {
    if (loadEvent) eventBus.emit(loadEvent.name, { instanceId, ...(loadEvent.detail ?? {}) });
  };
  const phase = findOwnPhase(stateManager, services.instanceId);
  const items = stateManager.get(`phases.${phase}`) || [];
  const existing = items.find((/** @type {{ moduleId: string }} */ i) => i.moduleId === moduleId)?.instanceId;
  if (existing) {
    stateManager.setModuleState(existing, state);
    load(existing);
    eventBus.emit('module:activated', { instanceId: existing });
    return existing;
  }
  const { instanceId } = openInstance(services, { moduleId, state });
  load(instanceId);
  return instanceId;
}

/**
 * Eine bestehende Instanz nach vorn holen (`module:activated`): die
 * Workspace wechselt in ihre Phase und auf ihren Reiter. Nur für Wege, die
 * der Nutzer auslöst (ein Senden-Knopf); ein Stapel der Agentenfläche
 * wechselt die Ansicht nicht.
 * @param {{ stateManager: object, eventBus: object }} services `module._context` der aufrufenden Instanz
 * @param {string|null|undefined} instanceId die Instanz, die nach vorn kommt
 * @returns {boolean} ob die Instanz in einer Phase steht und gemeldet wurde
 */
export function revealInstance(services, instanceId) {
  if (!instanceId) return false;
  const sm = /** @type {any} */ (services.stateManager);
  const known = Object.keys(sm.get('phases') || {})
    .some((p) => (sm.get(`phases.${p}`) ?? []).some((/** @type {{ instanceId: string }} */ i) => i.instanceId === instanceId));
  if (!known) return false;
  /** @type {any} */ (services.eventBus).emit('module:activated', { instanceId });
  return true;
}
