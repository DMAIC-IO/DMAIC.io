/**
 * Kerndienst instances: Modulinstanzen lesen und schreiben, ohne sie
 * einzuhängen. Ein Besitzer je Zustand: das lebende Model, solange die Instanz
 * gemountet ist, sonst der gespeicherte Zustand.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertRejects } from '../test-utils.js';
import { createInstances } from '../../js/core/instances.js';
import { defineModel, number, command, setCommandObserver } from '../../js/core/model.js';
import { initialModel, loadModel } from '../../js/core/initial-model.js';
import { readAgentState } from '../../js/core/agent/agent-read-mixin.js';
import { StateManager } from '../../js/core/state-manager.js';
import { Workspace } from '../../js/ui/workspace.js';

const Doc = defineModel({
  version: '1.0',
  migrations: { '0→1.0': (j) => ({ n: j.old ?? 0 }) },
  fields: { n: number({ default: 1 }) },
  view: { zoom: number({ default: 1 }) },
  commands: {
    setN: command({ params: { n: number() }, run({ n }) { this.n = n; } }),
  },
});

function makeBus() {
  const emitted = [];
  return { emitted, emit: (name, payload) => emitted.push([name, payload]), on: () => {}, off: () => {} };
}

/** Ein `stateManager` über einer Map; die Revision rechnet der echte StateManager. */
function makeState({ phases, states = {}, completed = false, bus }) {
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
      if (completed) return;
      writes.push([id, state]);
      cache.set(id, structuredClone(state));
      bus.emit('data:changed', `module:${id}`);
    },
    isCompleted: () => completed,
    getModuleRevision: StateManager.prototype.getModuleRevision,
  };
  return sm;
}

/** Ein Modul in Zielform, wie `createModule` es liefert (ohne Template). */
function targetModule({ createDefault, onLoad } = {}) {
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
function makeWorkspace(live = new Map()) {
  return {
    live,
    getLiveViewmodel: (id) => live.get(id) ?? null,
    isPending: () => false,
    whenInstanceReady: async () => { throw new Error('whenInstanceReady unerwartet'); },
    instantiate: () => { throw new Error('Mount unerwartet'); },
    _ensureInstantiated: () => { throw new Error('Mount unerwartet'); },
  };
}

const PHASES = () => ({
  data: [],
  define: [
    { instanceId: 'd2', moduleId: 'sipoc', order: 1 },
    { instanceId: 'd1', moduleId: 'sipoc', order: 0, customName: 'Erster' },
    { instanceId: 'dx', moduleId: 'five-why', order: 2 },
  ],
  measure: [
    { instanceId: 'm1', moduleId: 'sipoc', order: 0 },
    { instanceId: 'k1', moduleId: 'kano', order: 1 },
  ],
});

function setup({ states = {}, completed = false, modules = {}, live, workspace } = {}) {
  const bus = makeBus();
  const sm = makeState({ phases: PHASES(), states, completed, bus });
  const mods = { sipoc: targetModule(), 'five-why': { id: 'five-why' }, kano: { id: 'kano' }, ...modules };
  const moduleRegistry = { loadModule: async (id) => mods[id] };
  const ws = workspace ?? makeWorkspace(live);
  const data = { worksheet: true };
  const svc = createInstances({ stateManager: sm, moduleRegistry, workspace: ws, eventBus: bus, createData: () => data });
  return { svc, sm, bus, ws, mods, data };
}

const noRemote = (bus) => assertEqual(bus.emitted.filter(([n]) => n === 'state:remote-changed').length, 0,
  'state:remote-changed darf instances nie senden');

suite('instances.list', () => {
  test('Phasenreihenfolge, darin order; title ist customName oder leer', () => {
    const { svc } = setup();
    assertDeepEqual(svc.list({ modules: ['sipoc'] }), [
      { instanceId: 'd1', moduleId: 'sipoc', phase: 'define', title: 'Erster' },
      { instanceId: 'd2', moduleId: 'sipoc', phase: 'define', title: '' },
      { instanceId: 'm1', moduleId: 'sipoc', phase: 'measure', title: '' },
    ]);
  });
});

suite('instances.read', () => {
  test('gemountete Zielform: read() des lebenden Viewmodels ohne Ansichtsfelder', async () => {
    const vm = { model: Doc.fromJSON({ n: 4 }), read: (opts) => ({ n: 4, zoom: 3, double: 8, opts }) };
    const { svc, bus } = setup({ live: new Map([['d1', vm]]) });
    const out = await svc.read('d1', { fields: ['x'] });
    assertDeepEqual(out, { n: 4, double: 8, opts: { fields: ['x'] } });
    noRemote(bus);
  });

  test('nicht gemountete Zielform: kein Mount, Felder, derived und asyncTasks im Ruhezustand', async () => {
    const saved = { _schema: { version: '1.0' }, n: 5, zoom: 2 };
    const { svc, mods, data, sm } = setup({ states: { d1: saved } });
    const out = await svc.read('d1', { fields: [] });
    assertEqual(out.n, 5);
    assertEqual(out.double, 10);
    assertEqual('zoom' in out, false, 'Ansichtsfeld gestrichen');
    assertDeepEqual(out.asyncTasks, { calc: { running: false, progress: null, error: null } });
    assertEqual(mods.sipoc.reads[0].data, data, 'Arbeitsblattsicht aus createData');
    assertDeepEqual(mods.sipoc.reads[0].options, { fields: [] });
    assertEqual(sm.writes.length, 0, 'normalisierter Stand gleich: nichts zurückgeschrieben');
  });

  test('Stand vor der Migration: normalisierte Form wird gespeichert, Revision wie nach einem Mount', async () => {
    const { svc, sm, bus } = setup({ states: { d1: { old: 7 } } });
    await svc.read('d1');
    assertEqual(sm.writes.length, 1, 'normalisierte Form gespeichert');
    assertEqual(sm.getModuleState('d1').n, 7);
    const afterRead = sm.getModuleRevision('d1');
    // Ein Mount lädt den gespeicherten Stand und speichert dessen toJSON().
    const mounted = loadModel(Doc, sm.getModuleState('d1')).toJSON();
    sm.setModuleState('d1', mounted);
    assertEqual(sm.getModuleRevision('d1'), afterRead, 'der Mount ändert die Revision nicht');
    noRemote(bus);
  });

  test('abgeschlossenes Projekt: Lesen normalisiert nicht', async () => {
    const { svc, sm } = setup({ states: { d1: { old: 7 } }, completed: true });
    const out = await svc.read('d1');
    assertEqual(out.n, 7);
    assertEqual(sm.writes.length, 0);
    assertDeepEqual(sm.getModuleState('d1'), { old: 7 });
  });

  test('Altform mit Mixin: readAgentState über den gespeicherten Stand', async () => {
    const saved = { problem: 'P', whys: [] };
    const { svc, sm } = setup({ states: { dx: saved } });
    const out = await svc.read('dx', { fields: [] });
    assertDeepEqual(out, readAgentState('five-why', saved, { fields: [] }));
    assertEqual(sm.writes.length, 0, 'Altform wird beim Lesen nicht zurückgeschrieben');
  });

  test('Altform mit eigenem read(): needs_mount', async () => {
    const { svc } = setup({ states: { k1: {} } });
    let err = null;
    try { await svc.read('k1'); } catch (e) { err = e; }
    assertEqual(err?.message, 'needs_mount');
    assertEqual(err?.code, 'needs_mount');
  });

  test('unbekannte Instanz: unknown_instance', async () => {
    const { svc } = setup();
    await assertRejects(() => svc.read('nope'), /unknown_instance/);
  });
});

suite('instances.write', () => {
  test('ohne Mount: laden, anwenden, speichern; command:executed und data:changed', async () => {
    const { svc, sm, bus } = setup({ states: { d1: { _schema: { version: '1.0' }, n: 1 } } });
    const res = await svc.write('d1', (m) => { m.setN({ n: 9 }); return 'ok'; });
    assertDeepEqual(res, { mounted: false, result: 'ok' });
    assertEqual(sm.writes.length, 1);
    assertEqual(sm.getModuleState('d1').n, 9);
    const cmd = bus.emitted.find(([n]) => n === 'command:executed');
    assertTrue(cmd, 'command:executed fehlt');
    assertEqual(cmd[1].instanceId, 'd1');
    assertEqual(cmd[1].command, 'setN');
    assertTrue(bus.emitted.some(([n, p]) => n === 'data:changed' && p === 'module:d1'), 'data:changed fehlt');
    noRemote(bus);
  });

  test('ohne Mount: zwischen Laden und Speichern kommt kein Mount dazwischen', async () => {
    const live = new Map();
    let liveAtWrite = null;
    const sipoc = targetModule({
      // Jedes `await` nach dem Laden gäbe diesem Mount die Gelegenheit.
      onLoad: () => queueMicrotask(() => live.set('d1', { model: Doc.fromJSON({ n: 0 }) })),
    });
    const { svc, sm } = setup({ states: { d1: { n: 1 } }, modules: { sipoc }, live });
    const orig = sm.setModuleState;
    sm.setModuleState = (id, s) => { liveAtWrite = live.has(id); orig.call(sm, id, s); };
    const res = await svc.write('d1', (m) => m.setN({ n: 3 }));
    assertEqual(res.mounted, false);
    assertEqual(liveAtWrite, false, 'Mount lag zwischen Laden und Speichern');
    assertEqual(sm.getModuleState('d1').n, 3);
  });

  test('ohne gespeicherten Zustand: Model aus createDefault, Wert gespeichert', async () => {
    const sipoc = targetModule({ createDefault: () => Doc.fromJSON({ _schema: { version: '1.0' }, n: 42 }) });
    const { svc, sm } = setup({ modules: { sipoc } });
    await svc.write('d2', (m) => { m.setN({ n: m.n + 1 }); });
    assertEqual(sm.getModuleState('d2').n, 43);
  });

  test('abgeschlossenes Projekt: nichts gespeichert', async () => {
    const { svc, sm } = setup({ states: { d1: { n: 1 } }, completed: true });
    await svc.write('d1', (m) => m.setN({ n: 5 }));
    assertEqual(sm.writes.length, 0);
    assertDeepEqual(sm.getModuleState('d1'), { n: 1 });
  });

  test('gemountet: fn bekommt vm.model, der Dienst speichert nicht selbst', async () => {
    const vm = { model: Doc.fromJSON({ n: 1 }) };
    const { svc, sm } = setup({ live: new Map([['d1', vm]]) });
    const res = await svc.write('d1', (m) => { m.setN({ n: 6 }); return m; });
    assertEqual(res.mounted, true);
    assertEqual(res.result, vm.model);
    assertEqual(vm.model.n, 6);
    assertEqual(sm.writes.length, 0);
  });

  test('während des Mounts: wartet, schreibt ins lebende Model, das erste Speichern behält den Wert', async () => {
    const bus = makeBus();
    const sm = makeState({ phases: PHASES(), states: { d1: { n: 1 } }, bus });
    const ws = Object.create(Workspace.prototype);
    ws._instances = new Map();
    ws._pending = new Map();
    ws._stateManager = sm;
    const vm = { model: Doc.fromJSON({ n: 1 }) };
    let finish;
    ws._pending.set('d1', new Promise((resolve) => {
      finish = () => {
        ws._instances.set('d1', { getActionData: () => vm, getState: () => vm.model.toJSON() });
        ws._pending.delete('d1');
        resolve();
      };
    }));
    const svc = createInstances({
      stateManager: sm, moduleRegistry: { loadModule: async () => targetModule() },
      workspace: ws, eventBus: bus, createData: () => ({}),
    });
    const pending = svc.write('d1', (m) => m.setN({ n: 8 }));
    await new Promise((r) => setTimeout(r, 0));
    assertEqual(sm.writes.length, 0, 'während des Mounts nichts in den Speicher');
    finish();
    const res = await pending;
    assertEqual(res.mounted, true);
    assertEqual(vm.model.n, 8);
    ws._persistAllModuleStates();
    assertEqual(sm.getModuleState('d1').n, 8);
    noRemote(bus);
  });

  test('Altform: needs_mount', async () => {
    const { svc } = setup({ states: { dx: {} } });
    let err = null;
    try { await svc.write('dx', () => {}); } catch (e) { err = e; }
    assertEqual(err?.code, 'needs_mount');
  });
});
