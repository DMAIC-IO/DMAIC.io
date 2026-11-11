/**
 * D.Mike — Host-Port der Agentenfläche (agent-host.js)
 *
 * Die Werkzeugschicht in `core/agent/` kennt weder `window` noch das DOM.
 * Alles, was sie an der laufenden UI braucht, kommt durch dieses Objekt:
 * Anzeigen, Öffnen, Anlegen, Entfernen, der Griff auf das lebende
 * Viewmodel, und die Fragen, ob eine Instanz eingehängt oder angezeigt ist.
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

// Zeitgrenze für laufende Abläufe, wie `MOUNT_TIMEOUT_MS` in `workspace.js`.
const SETTLE_TASKS_TIMEOUT_MS = 20000;

/**
 * @param {object} deps
 * @param {object} deps.stateManager
 * @param {object} deps.moduleRegistry
 * @param {object} deps.eventBus
 * @param {object} deps.router
 * @param {object} deps.workspace
 * @param {(message: string, type?: string, icon?: string|null, options?: object) => void} deps.notify
 * @param {{ t: (key: string, params?: object) => string }} deps.i18n
 * @param {(callback: () => void) => void} deps.nextTick  `Alpine.nextTick` — von
 *   außen, weil der Host in der Node-Spur getestet wird und Alpine dort nicht
 *   geladen werden kann
 * @returns {{
 *   isCompleted: () => boolean,
 *   getCurrentView: () => ({ instanceId: string, module: string, phase: string }|null),
 *   openInstance: (instanceId: string) => Promise<{ instanceId: string, module: string, phase: string }|null>,
 *   getViewmodel: (instanceId: string) => Promise<object|null>,
 *   isMounted: (instanceId: string) => boolean,
 *   isDisplayed: (instanceId: string) => boolean,
 *   notifyBackgroundChange: (instanceIds: string[]) => void,
 *   addInstance: (moduleId: string, phase?: string) => Promise<{ instanceId: string, module: string, phase: string }|null>,
 *   removeInstance: (instanceId: string) => Promise<boolean>,
 *   settle: (instanceId?: string) => Promise<void>,
 * }}
 */
export function createAgentHost({ stateManager, moduleRegistry, eventBus, router, workspace, nextTick, notify, i18n }) {
  /** Der Datensatz einer Instanz samt Phase, oder null. */
  function locate(instanceId) {
    const phase = findInstancePhase(stateManager, instanceId);
    if (!phase) return null;
    const items = stateManager.get(`phases.${phase}`) ?? [];
    const record = items.find(i => i.instanceId === instanceId);
    if (!record) return null;
    return { instanceId, module: record.moduleId, phase, record };
  }

  /** `locate` ohne den Datensatz — die Form, die der Host nach außen gibt. */
  function locatePublic(instanceId) {
    const found = locate(instanceId);
    return found ? { instanceId: found.instanceId, module: found.module, phase: found.phase } : null;
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
      return locatePublic(info.instanceId);
    },

    async openInstance(instanceId) {
      const found = locatePublic(instanceId);
      if (!found) return null;
      await router.navigate({
        kind: 'module',
        projectId: stateManager.getActiveProjectId(),
        instanceId,
      });
      return found;
    },

    /**
     * Ob die Instanz ein lebendes Viewmodel hat oder gerade eingehängt wird.
     * Eine Instanz einer anderen Phase ist es nicht (workspace.getLiveViewmodel).
     * @param {string} instanceId
     * @returns {boolean}
     */
    isMounted(instanceId) {
      return workspace.getLiveViewmodel(instanceId) !== null || workspace.isPending(instanceId);
    },

    /**
     * Ob die Instanz das aktive Modul des sichtbaren Reiters ist.
     * @param {string} instanceId
     * @returns {boolean}
     */
    isDisplayed(instanceId) {
      // Sichtbar ist der Workspace, solange keine Seite darüber liegt. Die Route
      // kann nicht entscheiden, welches Modul aktiv ist: Hinzufügen und
      // Phasenwechsel schalten den Workspace um, ohne sie zu setzen.
      return router.getCurrentRoute()?.kind !== 'page' && workspace.getActiveInstanceId() === instanceId;
    },

    /**
     * Ein Toast für Instanzen, die der Agent im Hintergrund geändert hat.
     * Der Knopf öffnet die erste.
     * @param {string[]} instanceIds
     */
    notifyBackgroundChange(instanceIds) {
      if (!instanceIds?.length) return;
      // Entfernte Instanzen gibt es nicht mehr: nichts zu melden, nichts zu öffnen.
      const present = instanceIds.map(id => locate(id)).filter(Boolean);
      if (present.length === 0) return;
      const first = present[0].instanceId;
      let message;
      const found = present.length === 1 ? present[0] : null;
      if (found) {
        const module = i18n.t(`modules.${found.module}.name`);
        message = found.record.customName
          ? i18n.t('agent.backgroundChange.one', { module, name: found.record.customName })
          : i18n.t('agent.backgroundChange.oneUnnamed', { module });
      } else {
        message = i18n.t('agent.backgroundChange.many', { n: present.length });
      }
      notify(message, 'info', null, {
        action: { label: i18n.t('agent.backgroundChange.show'), onClick: () => this.openInstance(first)
          .catch((err) => console.warn('[agent-host] opening the changed instance failed', err)) },
      });
    },

    async getViewmodel(instanceId) {
      // Der Weg mit Ansichtswechsel: für Viewmodel-Kommandos, Abläufe und
      // Aktionen von Altmodulen, die das lebende Viewmodel brauchen. Lesen und
      // Model-Kommandos gehen ohne ihn über den Dienst `instances`.
      // Eingehängt wird eine Instanz erst, wenn ihre Phase angezeigt wird
      // (workspace._instantiateModule), und nur solange ihre Phase angezeigt
      // wird, lebt ihr Viewmodel. Eine nie geöffnete Instanz hat keins. Öffnen ist daher Teil des Zugriffs, nicht eine
      // Vorbedingung, die der Agent selbst erfüllen müsste.
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
      const found = locatePublic(instanceId);
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
      // Laufende auto-Abläufe (core/async-task.js) gehören zum Stand der Instanz.
      if (typeof viewmodel?._asyncTaskHost?.settle === 'function') {
        await viewmodel._asyncTaskHost.settle(SETTLE_TASKS_TIMEOUT_MS);
      }
      persistLive(instanceId, instance);
    },
  };
}
