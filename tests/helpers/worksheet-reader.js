/**
 * Test-Helfer: der Arbeitsblatt-Leser der Fassade (`registerWorksheetReader`)
 * für Unit-Tests, die nur einen `stateManager` mit gespeichertem Stand haben.
 * Liest wie `readSync` auf ein geladenes Arbeitsblatt: reine Projektion des
 * gespeicherten Stands (`readWorksheetState`). Nur für Tests.
 */
import { registerWorksheetReader } from '../../js/core/worksheet-columns.js';
import { readWorksheetState } from '../../js/modules/worksheet/worksheet-read.js';

/**
 * Steht die Instanz in einer Phase des Projekts? Wie `locate` in
 * `core/instances.js`.
 * @param {{ get: (path: string) => any }} sm
 * @param {string} id
 * @returns {boolean}
 */
function inProject(sm, id) {
  const phases = sm.get('phases') || {};
  return Object.keys(phases).some((p) => Array.isArray(phases[p]) && phases[p].some((r) => r?.instanceId === id));
}

/**
 * Den Leser für `sm` registrieren: `(id, o) => readWorksheetState(sm.getModuleState(id), o)`.
 * Wie `readSync`: unbekannt (`unknown_instance`) ist nur eine Id, die in
 * keiner Phase steht; eine Instanz ohne gespeicherten Stand liest wie
 * `readStored(null)`, also ohne Blätter.
 * @param {{ get: (path: string) => any, getModuleState: (id: string) => any }} sm
 * @returns {void}
 */
export function useStoredWorksheetReader(sm) {
  registerWorksheetReader(sm, (id, options) => {
    if (!inProject(sm, id)) {
      const err = new Error(`unknown_instance: ${id}`);
      err.code = 'unknown_instance';
      throw err;
    }
    return readWorksheetState(sm.getModuleState(id) ?? null, options);
  });
}

/**
 * Wie `useStoredWorksheetReader`, liefert aber `sm` zurück — für
 * stateManager-Attrappen, die als Literal im Kontext stehen.
 * @template T
 * @param {T} sm
 * @returns {T}
 */
export function withStoredWorksheetReader(sm) {
  useStoredWorksheetReader(sm);
  return sm;
}
