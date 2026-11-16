/**
 * Test-Helfer: der Arbeitsblatt-Leser der Fassade (`registerWorksheetReader`)
 * für Unit-Tests, die nur einen `stateManager` mit gespeichertem Stand haben.
 * Liest wie `readSync` auf ein geladenes Arbeitsblatt: reine Projektion des
 * gespeicherten Stands (`readWorksheetState`). Nur für Tests.
 */
import { registerWorksheetReader } from '../../js/core/worksheet-columns.js';
import { readWorksheetState } from '../../js/modules/worksheet/worksheet-read.js';

/**
 * Den Leser für `sm` registrieren: `(id, o) => readWorksheetState(sm.getModuleState(id), o)`;
 * eine Instanz ohne gespeicherten Stand gilt als unbekannt.
 * @param {{ getModuleState: (id: string) => any }} sm
 * @returns {void}
 */
export function useStoredWorksheetReader(sm) {
  registerWorksheetReader(sm, (id, options) => {
    const saved = sm.getModuleState(id);
    if (saved == null) {
      const err = new Error(`unknown_instance: ${id}`);
      err.code = 'unknown_instance';
      throw err;
    }
    return readWorksheetState(saved, options);
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
