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

  /**
   * Legt den lebenden Zustand einer eingehängten Instanz ab, wenn er vom
   * gespeicherten abweicht — oder noch keiner gespeichert ist. Gleicher
   * Inhalt wird nicht neu geschrieben: die Revision hängt am Inhalt, und ein
   * überflüssiges `setModuleState` meldete nur `data:changed`.
   * @param {string} instanceId
   * @param {object|null} instance  das eingehängte Modul
   */
  function persistLive(instanceId, instance) {
    const state = instance?.getState?.();
    if (!state) return;
    const stored = stateManager.getModuleState(instanceId);
    if (stored && JSON.stringify(stored) === JSON.stringify(state)) return;
    stateManager.setModuleState(instanceId, state);
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
      persistLive(instanceId, await workspace.whenInstanceReady(instanceId));
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
     * Mit `instanceId` sorgt es zusätzlich dafür, dass der gespeicherte
     * Zustand der Instanz ihrem lebenden gleicht, bevor die Laufzeit die
     * Revision vermerkt. Sonst schriebe ihn ein Späterer — der nächste
     * Ansichtswechsel (`_persistAllModuleStates`) einen nie gespeicherten
     * oder beim `init()` normalisierten Zustand, ein Entpreller im Modul
     * seine aufgeschobene Arbeit —, die Revision drehte sich ohne fremde
     * Änderung, und der nächste Schreibzugriff des Agenten scheiterte mit
     * `stale_revision`.
     *
     * Aufgeschobene Arbeit zieht das Modul selbst vor: bietet sein Viewmodel
     * `flushPendingWork()`, ruft settle es synchron auf und wartet danach
     * einen weiteren Tick ab. In Kauf genommen: eine noch nicht gespeicherte
     * Nutzereingabe, die zum Settle-Zeitpunkt im Modul steht, gilt damit als
     * gesehen.
     * @param {string} [instanceId]  die Instanz, deren Revision gleich vermerkt wird
     * @returns {Promise<void>}
     */
    async settle(instanceId) {
      const tick = () => new Promise((resolve) => nextTick(resolve));
      await tick();
      if (instanceId === undefined) return;
      const instance = await workspace.whenInstanceReady(instanceId);
      const viewmodel = instance?.getActionData?.();
      if (typeof viewmodel?.flushPendingWork === 'function') {
        viewmodel.flushPendingWork();
        await tick();
      }
      persistLive(instanceId, instance);
    },
  };
}
