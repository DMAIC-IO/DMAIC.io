/**
 * Gemeinsames Gerüst der Tests des Kerndienstes instances: Model `Doc`,
 * Attrappen für Bus, stateManager, Workspace und Modulregister.
 */
import { createInstances } from '../../js/core/instances.js';
import { defineModel, number, command, setCommandObserver } from '../../js/core/model.js';
import { initialModel } from '../../js/core/initial-model.js';
import { StateManager } from '../../js/core/state-manager.js';

/**
 * Ein Modul der Altform (kein `createModule`, kein `readStored`) — synthetisch,
 * damit die Tests nicht an einem Modul hängen, das bald umgestellt wird.
 */
export const LEGACY_MODULE_ID = 'legacy-module';

export const Doc = defineModel({
  version: '1.0',
  migrations: { '0→1.0': (j) => ({ n: j.old ?? 0 }) },
  fields: { n: number({ default: 1 }) },
  view: { zoom: number({ default: 1 }) },
  commands: {
    setN: command({ params: { n: number() }, run({ n }) { this.n = n; } }),
  },
});

export function makeBus() {
  const emitted = [];
  return { emitted, emit: (name, payload) => emitted.push([name, payload]), on: () => {}, off: () => {} };
}

/** Ein `stateManager` über einer Map; die Revision rechnet der echte StateManager. */
export function makeState({ phases, states = {}, completed = false, bus }) {
  const cache = new Map(Object.entries(states));
  const writes = [];
  const sm = {
    _moduleCache: cache,
    writes,
    get: (path) => {
      if (path === 'phases') return phases;
      if (path.startsWith('phases.')) return phases[path.slice('phases.'.length)];
      return undefined;
    },
    getProjectCycle: () => 'dmaic',
    getModuleState: (id) => cache.get(id) ?? null,
    setModuleState(id, state) {
      // Jeder Versuch zählt, auch im abgeschlossenen Projekt: so prüfen die
      // Tests den Riegel des Dienstes, nicht den des StateManagers.
      writes.push([id, state]);
      if (completed) return;
      cache.set(id, structuredClone(state));
      bus.emit('data:changed', `module:${id}`);
    },
    isCompleted: () => completed,
    getModuleRevision: StateManager.prototype.getModuleRevision,
  };
  return sm;
}

/** Ein Modul in Zielform, wie `createModule` es liefert (ohne Template). */
export function targetModule({ createDefault, onLoad } = {}) {
  const reads = [];
  return {
    reads,
    Model: Doc,
    loadDetached(json, { instanceId, eventBus, stateManager }) {
      const model = initialModel(Doc, json, createDefault, { instanceId, eventBus, stateManager });
      setCommandObserver(model, (cmd, args, result) => eventBus.emit('command:executed', { instanceId, command: cmd, args, result }));
      onLoad?.();
      return model;
    },
    readDetached(model, data, options) {
      reads.push({ data, options });
      return { ...model.toJSON(), double: model.n * 2, asyncTasks: { calc: { running: false, progress: null, error: null } } };
    },
  };
}

/** Workspace-Attrappe: Einhängen ist verboten, lebende Viewmodels aus einer Map. */
export function makeWorkspace(live = new Map()) {
  return {
    live,
    getLiveViewmodel: (id) => live.get(id) ?? null,
    isPending: () => false,
    whenInstanceReady: async () => { throw new Error('whenInstanceReady unerwartet'); },
    instantiate: () => { throw new Error('Mount unerwartet'); },
    _ensureInstantiated: () => { throw new Error('Mount unerwartet'); },
  };
}

export const PHASES = () => ({
  data: [],
  define: [
    { instanceId: 'd2', moduleId: 'sipoc', order: 1 },
    { instanceId: 'd1', moduleId: 'sipoc', order: 0, customName: 'Erster' },
    { instanceId: 'dx', moduleId: LEGACY_MODULE_ID, order: 2 },
  ],
  measure: [
    { instanceId: 'm1', moduleId: 'sipoc', order: 0 },
    { instanceId: 'k1', moduleId: 'kano', order: 1 },
  ],
});

export function setup({ states = {}, completed = false, modules = {}, live, workspace, i18n, redactors = {} } = {}) {
  const bus = makeBus();
  const sm = makeState({ phases: PHASES(), states, completed, bus });
  const mods = { sipoc: targetModule(), [LEGACY_MODULE_ID]: { id: LEGACY_MODULE_ID }, kano: { id: 'kano' }, ...modules };
  const loaded = new Set(Object.keys(mods));
  const moduleRegistry = {
    loadModule: async (id) => mods[id], getLoaded: (id) => (loaded.has(id) ? mods[id] : null),
    loadRedactor: async (id) => redactors[id] ?? null, redactorOf: (id) => redactors[id] ?? null,
  };
  const ws = workspace ?? makeWorkspace(live);
  const source = Object.freeze({ read: () => ({}), list: () => [] });
  const svc = createInstances({ stateManager: sm, moduleRegistry, workspace: ws, eventBus: bus, createSource: () => source, i18n });
  return { svc, sm, bus, ws, mods, source, loaded };
}
