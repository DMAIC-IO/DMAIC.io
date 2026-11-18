/**
 * Test-Helfer: ein `Source` (core/source.js) über gespeicherte Stände der
 * Altform (wie `useStoredWorksheetReader`), ohne `stateManager`. Nur für Tests.
 */
import { readWorksheetState } from './legacy-worksheet-read.js';

/**
 * @param {Record<string, object|null>} states  Instanz-Id → gespeicherter Stand
 * @returns {import('../../js/core/source-reader.js').Source}
 */
export function storedSource(states) {
  return Object.freeze({
    read(instanceId, options) {
      if (!Object.prototype.hasOwnProperty.call(states, instanceId)) {
        const err = new Error(`unknown_instance: ${instanceId}`);
        err.code = 'unknown_instance';
        throw err;
      }
      return readWorksheetState(states[instanceId] ?? null, options);
    },
    list() {
      return Object.keys(states).map((instanceId) => ({ instanceId, moduleId: 'worksheet' }));
    },
  });
}
