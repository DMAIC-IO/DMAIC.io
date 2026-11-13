/**
 * D.Mike — Modulinstanzen ohne Mount lesen und schreiben (instances.js)
 *
 * Eine Instanz hat zu jedem Zeitpunkt genau einen Besitzer ihres Zustands:
 *
 * - gemountet (die Workspace hält ein lebendes Viewmodel, die Hülle hängt im
 *   Dokument): das lebende Model. Lesen und Schreiben gehen dorthin;
 *   der persist-`$watch` des Moduls speichert.
 * - im Mount: erst `whenInstanceReady`, dann wie gemountet.
 * - nicht gemountet (nie geöffnet oder in einer anderen Phase): der
 *   gespeicherte Zustand. Schreiben heißt laden →
 *   anwenden → `setModuleState`, ohne `await` dazwischen, damit kein Mount
 *   dazwischenkommt und den Wert mit seinem ersten Speichern überschreibt.
 *
 * Der Dienst sendet nie `state:remote-changed`: das bleibt der echten
 * Fernsynchronisation vorbehalten. Zuhörer bekommen `data:changed` mit
 * `module:<id>` (aus `setModuleState`) und bei Model-Kommandos
 * `command:executed`.
 *
 * Module bekommen `list`, `read` und `interact` (`ctx.instances`); `write`
 * bleibt dem Kern vorbehalten. `interact` schickt einen Stapel der
 * Agentenfläche an andere Instanzen; die Workspace bindet den Aufrufer.
 */
import { readAgentState, MIXIN_READ_MODULES } from './agent/agent-read-mixin.js';
import { AGENT_REGISTRY } from './agent/agent-registry.generated.js';
import { stripPaths } from './view-fields.js';

/**
 * @typedef {{ instanceId: string, moduleId: string, phase: string, title: string }} InstanceInfo
 */
/**
 * @typedef {{
 *   list: (opts?: { modules?: string[] }) => InstanceInfo[],
 *   read: (instanceId: string, options?: object) => Promise<object>,
 *   write: (instanceId: string, fn: (model: any) => any) => Promise<{ mounted: boolean, result: any }>,
 * }} InstancesService
 */
/**
 * Was Module davon bekommen: Lesen und Stapel an andere Instanzen.
 * @typedef {Pick<InstancesService, 'list' | 'read'> & {
 *   interact: (stack: import('./agent/agent-types.generated.js').ModuleStack) => Promise<object>,
 * }} ModuleInstances
 */
/** Alias der früheren, nur lesenden Form. @typedef {ModuleInstances} InstancesReader */

/**
 * Ein Fehler mit Code (`err.code`), den die Agentenfläche übersetzt.
 * @param {string} code
 * @returns {Error & { code: string }}
 */
function codeError(code) {
  return Object.assign(new Error(code), { code });
}

/**
 * Zielform: ein `createModule`-Objekt mit Schema-Model, das ohne Mount laden
 * und lesen kann.
 * @param {any} m geladenes Modulobjekt
 * @returns {boolean}
 */
function isTargetForm(m) {
  return Boolean(m?.Model?.schema) && typeof m.loadDetached === 'function' && typeof m.readDetached === 'function';
}

/**
 * Die Ansichtsfelder eines Moduls: Zielform aus dem Schema, Altform aus der
 * generierten Registry.
 * @param {string} moduleId @param {any} m
 * @returns {string[]}
 */
function viewFieldsOf(moduleId, m) {
  if (isTargetForm(m)) return Object.keys(m.Model.schema.view ?? {});
  return AGENT_REGISTRY[moduleId]?.viewFields ?? [];
}

/**
 * Den Dienst einmal je App anlegen.
 * @param {{
 *   stateManager: any,
 *   moduleRegistry: { loadModule: (id: string) => Promise<any> },
 *   workspace: { getLiveViewmodel: (id: string) => any, isPending: (id: string) => boolean,
 *     whenInstanceReady: (id: string) => Promise<any> },
 *   eventBus: any,
 *   createData: () => any,
 * }} deps `createData` liefert die Arbeitsblattsicht für `derived`
 * @returns {InstancesService}
 */
export function createInstances({ stateManager, moduleRegistry, workspace, eventBus, createData }) {
  /**
   * Instanzen in Projektreihenfolge: Phasen in der Reihenfolge des Projekts,
   * darin nach `order`.
   * @returns {Array<{ record: any, phase: string }>}
   */
  function allRecords() {
    const phases = stateManager.get('phases') || {};
    return Object.keys(phases).flatMap((phase) => {
      const items = Array.isArray(phases[phase]) ? phases[phase] : [];
      return items
        .map((record, i) => ({ record, phase, rank: Number.isFinite(record?.order) ? record.order : i }))
        .sort((a, b) => a.rank - b.rank)
        .map(({ record, phase: p }) => ({ record, phase: p }));
    });
  }

  /**
   * @param {string} instanceId
   * @returns {{ record: any, phase: string }}
   * @throws {Error} `unknown_instance`
   */
  function locate(instanceId) {
    const found = allRecords().find(({ record }) => record?.instanceId === instanceId);
    if (!found) throw codeError('unknown_instance');
    return found;
  }

  /**
   * Läuft ein Mount, auf sein Ende warten. Danach kein `await` mehr, bevor der
   * Aufrufer den Besitzer bestimmt.
   * @param {string} instanceId
   * @returns {Promise<void>}
   * @throws {Error} `unknown_instance`, wenn das Einhängen die Frist reißt
   */
  async function settle(instanceId) {
    while (workspace.isPending(instanceId)) {
      const ready = await workspace.whenInstanceReady(instanceId);
      if (!ready && workspace.isPending(instanceId)) throw codeError('unknown_instance');
    }
  }

  /**
   * Instanzen in Projektreihenfolge, wahlweise nur bestimmter Module.
   * Liest die Projektstruktur, keine Modulzustände.
   * @param {{ modules?: string[] }} [opts]
   * @returns {InstanceInfo[]}
   */
  function list({ modules } = {}) {
    return allRecords()
      .filter(({ record }) => !Array.isArray(modules) || modules.includes(record.moduleId))
      .map(({ record, phase }) => ({
        instanceId: record.instanceId,
        moduleId: record.moduleId,
        phase,
        title: record.customName ?? '',
      }));
  }

  /**
   * Der Lesezustand einer Instanz in der Form ihres `read()`, ohne
   * Ansichtsfelder. Eine nicht gemountete Instanz in Zielform, deren
   * normalisierte Form (Migration, Reparatur) vom gespeicherten Stand
   * abweicht, wird dabei zurückgeschrieben — sonst änderte erst das spätere
   * Einhängen die Revision. Das gilt auch ohne gespeicherten Stand: dann wird
   * die Vorgabe abgelegt, so wie das erste Verlassen einer geöffneten Instanz
   * sie ablegt. Im abgeschlossenen Projekt unterbleibt das.
   * @param {string} instanceId
   * @param {object} [options] `{ fields?, rows? }`
   * @returns {Promise<object>}
   * @throws {Error} `unknown_instance`; `needs_mount` für ein Altmodul mit eigenem `read()`
   */
  async function read(instanceId, options) {
    const { record } = locate(instanceId);
    const moduleId = record.moduleId;
    const m = await moduleRegistry.loadModule(moduleId);
    await settle(instanceId);
    const viewFields = viewFieldsOf(moduleId, m);
    const vm = workspace.getLiveViewmodel(instanceId);
    if (vm) return stripPaths(await vm.read(options), viewFields);
    const saved = stateManager.getModuleState(instanceId);
    if (isTargetForm(m)) {
      const model = m.loadDetached(saved, { instanceId, eventBus, stateManager });
      const json = model.toJSON();
      if (!stateManager.isCompleted() && JSON.stringify(json) !== JSON.stringify(saved)) {
        stateManager.setModuleState(instanceId, json);
      }
      return stripPaths(m.readDetached(model, createData(), options), viewFields);
    }
    if (MIXIN_READ_MODULES.includes(moduleId)) {
      return stripPaths(readAgentState(moduleId, saved ?? {}, options), viewFields);
    }
    throw codeError('needs_mount');
  }

  /**
   * `fn(model)` nach der Besitzer-Regel anwenden. `fn` ist synchron und ruft
   * `setFields` oder ein Model-Kommando; wirft es, bleibt der gespeicherte
   * Stand unberührt. Gemountet speichert der persist-`$watch` des Moduls,
   * sonst der Dienst. Im abgeschlossenen Projekt wird nichts angewandt.
   * @param {string} instanceId
   * @param {(model: any) => any} fn
   * @returns {Promise<{ mounted: boolean, result: any }>}
   * @throws {Error} `project_completed`; `unknown_instance`; `needs_mount` für ein Altmodul
   */
  async function write(instanceId, fn) {
    if (stateManager.isCompleted()) throw codeError('project_completed');
    const { record } = locate(instanceId);
    const m = await moduleRegistry.loadModule(record.moduleId);
    if (!isTargetForm(m)) throw codeError('needs_mount');
    await settle(instanceId);
    const vm = workspace.getLiveViewmodel(instanceId);
    if (vm) return { mounted: true, result: fn(vm.model) };
    // Ab hier kein `await`: Laden, Anwenden und Speichern in einem Zug.
    const model = m.loadDetached(stateManager.getModuleState(instanceId), { instanceId, eventBus, stateManager });
    const result = fn(model);
    stateManager.setModuleState(instanceId, model.toJSON());
    return { mounted: false, result };
  }

  return { list, read, write };
}
