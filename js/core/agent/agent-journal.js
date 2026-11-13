/**
 * D.Mike — Journal eines Stapels (agent-journal.js)
 *
 * Ein Stapel gilt ganz oder gar nicht. Vor dem ersten Schreiben in eine
 * Instanz hält das Journal ihren gespeicherten Zustand fest, vor der ersten
 * Änderung der Projektstruktur die Phasen; angelegte und entfernte Instanzen
 * merkt es sich in ihrer Reihenfolge. Scheitert eine Aktion zur Laufzeit,
 * bringt `rollback` den Stand von vor dem Stapel zurück — rückwärts:
 * angelegte Instanzen verschwinden, entfernte kommen mit derselben Id
 * zurück, berührte Instanzen bekommen ihren alten Zustand (eingehängte auch
 * im lebenden Model), zuletzt die Phasen. Eine berührte Instanz, deren
 * Stand sich nicht geändert hat, bleibt unangetastet — so behält sie auch
 * ihren Verlauf.
 *
 * Erfasst sind nur die Ziele der Aktionen und die Projektstruktur. Was eine
 * Aktion nebenbei in andere Instanzen oder projektweite Schlüssel schreibt,
 * sieht das Journal nicht; Ansicht und Navigation bleiben, wie sie sind.
 *
 * Ein Stapel, der im laufenden Stapel wiedereintritt, schreibt in dasselbe
 * Journal: er wird mit dem äußeren zurückgenommen.
 */

/**
 * @typedef {{ instanceId: string, module: string, phase: string, state: object|null }} RemovedEntry
 */

/**
 * @param {object} deps
 * @param {{ get: (path: string) => any, set: (path: string, value: any) => void,
 *   getModuleState: (id: string) => object|null, setModuleState: (id: string, state: object) => void,
 *   removeModuleState: (id: string) => void }} deps.stateManager
 * @param {{ removeInstance: (id: string) => Promise<boolean>,
 *   restoreInstance: (entry: RemovedEntry & { record?: object, index?: number }) => Promise<void>,
 *   applyLiveState: (id: string, state: object|null) => void,
 *   isMounted: (id: string) => boolean, settle: (id: string) => Promise<void> }} deps.host
 * @returns {{
 *   touchInstance: (instanceId: string) => void,
 *   touchStructure: () => void,
 *   noteAdded: (instanceId: string) => void,
 *   noteRemoved: (entry: RemovedEntry) => void,
 *   rollback: () => Promise<void>,
 * }}
 */
export function createJournal({ stateManager, host }) {
  /** Instanz → gespeicherter Zustand beim ersten Berühren (null: keiner). */
  const touched = new Map();
  /** Die Phasen beim ersten Berühren der Struktur; undefined: unberührt. */
  let phases;
  /** Angelegte und entfernte Instanzen in ihrer Reihenfolge. */
  const changes = [];

  /**
   * Eintrag und Position einer Instanz in den festgehaltenen Phasen.
   * @param {string} instanceId
   * @param {string} phase
   * @returns {{ record?: object, index?: number }}
   */
  function savedPlace(instanceId, phase) {
    const items = phases?.[phase];
    const index = Array.isArray(items) ? items.findIndex((r) => r?.instanceId === instanceId) : -1;
    return index >= 0 ? { record: structuredClone(items[index]), index } : {};
  }

  return {
    touchInstance(instanceId) {
      if (touched.has(instanceId)) return;
      touched.set(instanceId, structuredClone(stateManager.getModuleState(instanceId) ?? null));
    },

    touchStructure() {
      if (phases !== undefined) return;
      phases = structuredClone(stateManager.get('phases') ?? {});
    },

    noteAdded(instanceId) {
      changes.push({ kind: 'added', instanceId });
    },

    noteRemoved(entry) {
      changes.push({ kind: 'removed', entry: structuredClone(entry) });
    },

    async rollback() {
      const added = new Set();
      for (const change of [...changes].reverse()) {
        if (change.kind === 'added') {
          added.add(change.instanceId);
          await host.removeInstance(change.instanceId);
        } else {
          const { entry } = change;
          await host.restoreInstance({ ...entry, ...savedPlace(entry.instanceId, entry.phase) });
        }
      }
      for (const [instanceId, saved] of touched) {
        // Eine im Stapel angelegte Instanz ist schon samt Zustand fort.
        if (added.has(instanceId)) continue;
        // Eine eingehängte Instanz legt erst ab, was ihr lebendes Model
        // schon hat: danach sagt der gespeicherte Stand, ob sich etwas
        // geändert hat.
        if (host.isMounted(instanceId)) {
          try {
            await host.settle(instanceId);
          } catch (err) {
            console.warn('[agent-journal] settle before rollback failed', err);
          }
        }
        if (JSON.stringify(stateManager.getModuleState(instanceId) ?? null) === JSON.stringify(saved)) continue;
        if (saved === null) {
          // Ohne gespeicherten Stand vorher: den inzwischen abgelegten
          // entfernen. Das lebende Model hat keinen Stand, auf den es zurück
          // könnte.
          stateManager.removeModuleState(instanceId);
          continue;
        }
        stateManager.setModuleState(instanceId, saved);
        host.applyLiveState(instanceId, saved);
      }
      if (phases !== undefined) stateManager.set('phases', structuredClone(phases));
    },
  };
}
