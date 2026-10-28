/**
 * D.Mike — Host-Port der Agentenfläche (agent-host.js)
 *
 * Die Werkzeugschicht in `core/agent/` kennt weder `window` noch das DOM.
 * Alles, was sie an der laufenden UI braucht, kommt durch dieses Objekt:
 * Anzeigen, Öffnen, Anlegen, Entfernen, und der Griff auf das lebende
 * Viewmodel.
 *
 * Derselbe Weg wie die UI. `addInstance` ruft dieselbe
 * `createInstance`-Funktion wie der Router, `removeInstance` denselben
 * Workspace-Pfad wie das Tab-Menü (nur ohne Rückfrage), und `getViewmodel`
 * liefert `getActionData()` — genau das Objekt, auf dem die Aktionsleiste
 * ihre Knöpfe auslöst.
 *
 * Stufe 2 (App als eigener Harness) tauscht diesen Adapter NICHT aus: er
 * bleibt derselbe, nur der Aufrufer wird ein HTTP-Client statt `window`.
 */
import { createInstance, findInstancePhase } from '../core/router/instance-ops.js';

/**
 * @param {object} deps
 * @param {object} deps.stateManager
 * @param {object} deps.moduleRegistry
 * @param {object} deps.eventBus
 * @param {object} deps.router
 * @param {object} deps.workspace
 * @param {(callback: () => void) => void} deps.nextTick  `Alpine.nextTick` — von
 *   außen, weil der Host in der Node-Spur getestet wird und Alpine dort nicht
 *   geladen werden kann
 * @returns {{
 *   isCompleted: () => boolean,
 *   getCurrentView: () => ({ instanceId: string, module: string, phase: string }|null),
 *   openInstance: (instanceId: string) => Promise<{ instanceId: string, module: string, phase: string }|null>,
 *   getViewmodel: (instanceId: string) => Promise<object|null>,
 *   addInstance: (moduleId: string, phase?: string) => Promise<{ instanceId: string, module: string, phase: string }|null>,
 *   removeInstance: (instanceId: string) => Promise<boolean>,
 *   settle: (instanceId?: string) => Promise<void>,
 * }}
 */
export function createAgentHost({ stateManager, moduleRegistry, eventBus, router, workspace, nextTick }) {
  /** Der Datensatz einer Instanz samt Phase, oder null. */
  function locate(instanceId) {
    const phase = findInstancePhase(stateManager, instanceId);
    if (!phase) return null;
    const items = stateManager.get(`phases.${phase}`) ?? [];
    const record = items.find(i => i.instanceId === instanceId);
    if (!record) return null;
    return { instanceId, module: record.moduleId, phase };
  }

  return {
    // Der schreibgeschützte Projektzustand. Die Kernschicht darf
    // `stateManager` nicht selbst nach UI-Vorbedingungen fragen — sie kennt
    // ihn nur als `deps`; der Zustand gehört zur laufenden App und damit
    // hierher (Review-Befund I2).
    isCompleted() {
      return stateManager.isCompleted() === true;
    },

    getCurrentView() {
      const info = workspace.getActiveModuleInfo();
      if (!info) return null;
      return locate(info.instanceId);
    },

    async openInstance(instanceId) {
      const found = locate(instanceId);
      if (!found) return null;
      await router.navigate({
        kind: 'module',
        projectId: stateManager.getActiveProjectId(),
        instanceId,
      });
      return found;
    },

    async getViewmodel(instanceId) {
      // Nur Instanzen der aktiven Phase sind gemountet (siehe
      // workspace._instantiateModule). Öffnen ist daher Teil des Zugriffs,
      // nicht eine Vorbedingung, die der Agent selbst erfüllen müsste.
      const opened = await this.openInstance(instanceId);
      if (!opened) return null;
      // Und auf das Ende des Einhängens warten. `router.navigate()` kommt
      // zurück, sobald der Router seine Schicht abgearbeitet hat — das
      // Einhängen selbst hängt an fire-and-forget-Events, läuft also
      // möglicherweise noch. Ohne dieses Warten meldete ein `instance.call`
      // direkt nach `module.add` reproduzierbar `unknown_instance`
      // („Ansicht nicht geöffnet"), obwohl die Ansicht längst im DOM stand.
      const instance = await workspace.whenInstanceReady(instanceId);
      return instance?.getActionData?.() ?? null;
    },

    async addInstance(moduleId, phase) {
      // Der schreibgeschützte Zustand verwirft den Schreibzugriff still;
      // dann gibt es nichts zu melden außer: es ist nichts passiert.
      if (this.isCompleted()) return null;
      const def = moduleRegistry.get(moduleId);
      const instanceId = createInstance(stateManager, moduleRegistry, eventBus, moduleId, def, { phase });
      // KEIN Rückfall auf ein zusammengesetztes Ergebnis: findet `locate()`
      // die Instanz nicht, existiert sie nicht, und eine erfundene Id wäre
      // die schlechteste mögliche Antwort (Review-Befund I2).
      const found = locate(instanceId);
      if (!found) return null;
      // Den Ausgangszustand einmal ablegen — nach dem Einhängen, denn erst
      // `init()` des Moduls bringt sein Model in Form. Ohne ihn hätte die
      // Instanz bis zum ersten Ansichtswechsel keinen gespeicherten Zustand;
      // das spätere Neuschreiben durch `_persistAllModuleStates` wäre eine
      // Revisionsänderung, und der erste Schreibzugriff des Agenten nach
      // `module.add` scheiterte mit `stale_revision`.
      const instance = await workspace.whenInstanceReady(instanceId);
      const state = instance?.getState?.();
      if (state) stateManager.setModuleState(instanceId, state);
      return found;
    },

    removeInstance(instanceId) {
      if (this.isCompleted()) return Promise.resolve(false);
      return workspace.removeInstance(instanceId);
    },

    /**
     * Wartet, bis Alpine die Effekte der letzten Änderung abgearbeitet hat —
     * darin läuft der persist-`$watch` (`core/template-module.js`). Erst
     * danach steht eine eigene Änderung des Agenten im `stateManager`.
     *
     * Mit `instanceId` sorgt es zusätzlich dafür, dass die Instanz einen
     * gespeicherten Zustand HAT, bevor die Laufzeit ihre Revision vermerkt:
     * eine frisch angezeigte Instanz kann ohne Zustand im Cache sein (der
     * persist-`$watch` feuert nicht beim Einhängen, und `_activateTab`
     * persistiert VOR dem Einhängen). Der nächste Ansichtswechsel schriebe
     * sie dann zum ersten Mal — eine Revisionsänderung ohne Änderung, und
     * der nächste Schreibzugriff des Agenten scheiterte mit `stale_revision`.
     * @param {string} [instanceId]  die Instanz, deren Revision gleich vermerkt wird
     * @returns {Promise<void>}
     */
    async settle(instanceId) {
      await new Promise((resolve) => nextTick(resolve));
      if (instanceId === undefined || stateManager.getModuleRevision(instanceId) !== undefined) return;
      const instance = await workspace.whenInstanceReady(instanceId);
      const state = instance?.getState?.();
      if (state) stateManager.setModuleState(instanceId, state);
    },
  };
}
