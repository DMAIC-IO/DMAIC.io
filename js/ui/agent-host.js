/**
 * D.Mike — Host-Port der Agentenfläche (agent-host.js)
 *
 * Die Werkzeugschicht in `core/agent/` kennt weder `window` noch das DOM.
 * Alles, was sie an der laufenden UI braucht, kommt durch dieses Objekt:
 * Anzeigen, Öffnen, Anlegen, Entfernen, und der Griff auf das lebende
 * Viewmodel.
 *
 * Spec §2: derselbe Weg wie die UI. `addInstance` ruft dieselbe
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
 * @returns {{
 *   isCompleted: () => boolean,
 *   getCurrentView: () => ({ instanceId: string, module: string, phase: string }|null),
 *   openInstance: (instanceId: string) => Promise<{ instanceId: string, module: string, phase: string }|null>,
 *   getViewmodel: (instanceId: string) => Promise<object|null>,
 *   addInstance: (moduleId: string, phase?: string) => Promise<{ instanceId: string, module: string, phase: string }|null>,
 *   removeInstance: (instanceId: string) => Promise<boolean>,
 * }}
 */
export function createAgentHost({ stateManager, moduleRegistry, eventBus, router, workspace }) {
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
      const instance = workspace.getInstance(instanceId);
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
      return locate(instanceId);
    },

    removeInstance(instanceId) {
      if (this.isCompleted()) return Promise.resolve(false);
      return workspace.removeInstance(instanceId);
    },
  };
}
