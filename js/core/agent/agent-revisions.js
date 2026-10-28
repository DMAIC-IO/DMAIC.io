/**
 * D.Mike — Was der Agent gesehen hat (agent-revisions.js)
 *
 * Lesen vor Schreiben: ein Agent darf nur in eine Instanz schreiben, deren
 * aktuellen Inhalt er gesehen hat — so wie `Edit` im Harness erst nach `Read`
 * gelingt. Der Merker lebt nur im Speicher der Laufzeit, der Agent bekommt
 * nie ein Token zu sehen. Nach einem Neuladen ist er leer: nie gelesen heißt
 * veraltet.
 *
 * Die Revisionen selbst rechnet der `stateManager` aus dem Inhalt
 * (`getModuleRevision`, `getStructureRevision`) — gleicher Inhalt, gleiche
 * Revision.
 */

/**
 * Legt den Merker an.
 * @param {{ getModuleRevision: (id: string) => (number|undefined),
 *           getStructureRevision: () => number }} stateManager
 * @returns {{
 *   markInstance: (instanceId: string) => void,
 *   markStructure: () => void,
 *   forgetInstance: (instanceId: string) => void,
 *   isInstanceCurrent: (instanceId: string) => boolean,
 *   isStructureCurrent: () => boolean,
 * }}
 */
export function createRevisionTracker(stateManager) {
  /**
   * Instanz → zuletzt gesehene Revision. `undefined` ist ein gültiger Wert:
   * die Instanz hatte beim Lesen noch keinen gespeicherten Zustand.
   * @type {Map<string, number|undefined>}
   */
  const seen = new Map();
  /** @type {number|null} */
  let seenStructure = null;

  return {
    markInstance(instanceId) {
      seen.set(instanceId, stateManager.getModuleRevision(instanceId));
    },
    markStructure() {
      seenStructure = stateManager.getStructureRevision();
    },
    forgetInstance(instanceId) {
      seen.delete(instanceId);
    },
    isInstanceCurrent(instanceId) {
      return seen.has(instanceId)
        && seen.get(instanceId) === stateManager.getModuleRevision(instanceId);
    },
    isStructureCurrent() {
      return seenStructure !== null && seenStructure === stateManager.getStructureRevision();
    },
  };
}
