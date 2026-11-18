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
  const loaded = new Set(Object.keys(mods));
  const moduleRegistry = { loadModule: async (id) => mods[id], getLoaded: (id) => (loaded.has(id) ? mods[id] : null) };
  const ws = workspace ?? makeWorkspace(live);
  const source = Object.freeze({ read: () => ({}), list: () => [] });
  const svc = createInstances({ stateManager: sm, moduleRegistry, workspace: ws, eventBus: bus, createSource: () => source });
  return { svc, sm, bus, ws, mods, source, loaded };
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
    const { svc, mods, source, sm } = setup({ states: { d1: saved } });
    const out = await svc.read('d1', { fields: [] });
    assertEqual(out.n, 5);
    assertEqual(out.double, 10);
    assertEqual('zoom' in out, false, 'Ansichtsfeld gestrichen');
    assertDeepEqual(out.asyncTasks, { calc: { running: false, progress: null, error: null } });
    assertEqual(mods.sipoc.reads[0].data, source, 'Leser aus createSource');
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

  test('ohne gespeicherten Zustand: Lesen legt die Vorgabe ab, Revision wie nach Öffnen und Verlassen', async () => {
    const { svc, sm, bus } = setup();
    const out = await svc.read('d2');
    assertEqual(out.n, 1, 'Vorgabe des Models');
    assertEqual(sm.writes.length, 1, 'die Vorgabe einmal gespeichert');
    assertEqual(sm.getModuleState('d2').n, 1);
    const afterRead = sm.getModuleRevision('d2');
    // Öffnen lädt die Vorgabe (kein Stand gespeichert), Verlassen speichert ihr toJSON().
    sm.setModuleState('d2', initialModel(Doc, null, undefined, {}).toJSON());
    assertEqual(sm.getModuleRevision('d2'), afterRead, 'Öffnen und Verlassen ändern die Revision nicht');
    noRemote(bus);
  });

  test('ohne gespeicherten Zustand im abgeschlossenen Projekt: nichts abgelegt', async () => {
    const { svc, sm } = setup({ completed: true });
    assertEqual((await svc.read('d2')).n, 1);
    assertEqual(sm.writes.length, 0);
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

  test('readStored-Modul nicht eingehängt: readStored(saved, options) statt needs_mount', async () => {
    const readStored = (saved, o) => ({ saved, o });
    const { svc } = setup({ states: { k1: { a: 1 } }, modules: { kano: { id: 'kano', readStored } } });
    assertDeepEqual(await svc.read('k1', { fields: [] }), { saved: { a: 1 }, o: { fields: [] } });
  });
});

/** Wirft `fn` synchron, liefert den Fehler (oder null). */
function caught(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

suite('instances.readSync', () => {
  test('nicht geladen → not_loaded', () => {
    const { svc, loaded } = setup({ states: { d1: { n: 5 } } });
    loaded.clear();
    const err = caught(() => svc.readSync('d1'));
    assertEqual(err?.code, 'not_loaded');
  });

  test('unbekannte Instanz → unknown_instance', () => {
    const { svc } = setup();
    assertEqual(caught(() => svc.readSync('nope'))?.code, 'unknown_instance');
  });

  test('Zielform nicht eingehängt: readDetached bekommt den Leser aus createSource', () => {
    const { svc, mods, source } = setup({ states: { d1: { _schema: { version: '1.0' }, n: 5 } } });
    svc.readSync('d1', { fields: [] });
    assertTrue(mods.sipoc.reads.at(-1).data === source, 'derselbe Leser wie aus createSource');
  });

  test('Zielform nicht eingehängt: synchron, Migration wird zurückgeschrieben', () => {
    const { svc, sm } = setup({ states: { d1: { _schema: { version: '1.0' }, n: 5, zoom: 2 }, m1: { old: 7 } } });
    const out = svc.readSync('d1', { fields: [] });
    assertEqual(out.n, 5);
    assertEqual(out.double, 10);
    assertEqual('zoom' in out, false);
    assertEqual(sm.writes.length, 0);
    assertEqual(svc.readSync('m1').n, 7);
    assertEqual(sm.writes.length, 1, 'Migration einmal zurückgeschrieben');
  });

  test('abgeschlossenes Projekt: schreibt nie', () => {
    const { svc, sm } = setup({ states: { d1: { old: 7 } }, completed: true });
    assertEqual(svc.readSync('d1').n, 7);
    assertEqual(sm.writes.length, 0);
  });

  test('Zielform eingehängt: vm.read ohne Ansichtsfelder', () => {
    const vm = { model: Doc.fromJSON({ n: 4 }), read: (opts) => ({ n: 4, zoom: 3, double: 8, opts }) };
    const { svc } = setup({ live: new Map([['d1', vm]]) });
    assertDeepEqual(svc.readSync('d1', { fields: ['x'] }), { n: 4, double: 8, opts: { fields: ['x'] } });
  });

  test('im Einhängen: liest den gespeicherten Stand', () => {
    const live = new Map([['d1', { model: Doc.fromJSON({ n: 0 }), read: () => { throw new Error('vm.read unerwartet'); } }]]);
    const ws = { ...makeWorkspace(live), isPending: () => true };
    const { svc } = setup({ states: { d1: { _schema: { version: '1.0' }, n: 5 } }, workspace: ws });
    assertEqual(svc.readSync('d1').n, 5);
  });

  test('readStored-Modul eingehängt: vm.read und flushPendingWork bleiben ungerufen', () => {
    const vm = {
      read: () => { throw new Error('vm.read unerwartet'); },
      flushPendingWork: () => { throw new Error('flush unerwartet'); },
    };
    const readStored = (saved, o) => ({ saved, o });
    const { svc } = setup({ states: { k1: { a: 1 } }, modules: { kano: { id: 'kano', readStored } }, live: new Map([['k1', vm]]) });
    assertDeepEqual(svc.readSync('k1', { fields: [] }), { saved: { a: 1 }, o: { fields: [] } });
  });

  test('Zielform mit readStored eingehängt: readSync ruft vm.read, nicht readStored', () => {
    const vm = { model: Doc.fromJSON({ n: 4 }), read: (o) => ({ n: 4, zoom: 3, live: true, o }) };
    const readStored = () => { throw new Error('readStored unerwartet'); };
    const mod = { ...targetModule(), readStored };
    const { svc } = setup({ states: { d1: { _schema: { version: '1.0' }, n: 1 } }, modules: { sipoc: mod }, live: new Map([['d1', vm]]) });
    assertDeepEqual(svc.readSync('d1', { fields: [] }), { n: 4, live: true, o: { fields: [] } });
  });

  test('Zielform mit readStored eingehängt: read (async) ruft vm.read', async () => {
    const vm = { model: Doc.fromJSON({ n: 4 }), read: async () => ({ n: 4, live: true }) };
    const readStored = () => { throw new Error('readStored unerwartet'); };
    const mod = { ...targetModule(), readStored };
    const { svc } = setup({ states: { d1: { _schema: { version: '1.0' }, n: 1 } }, modules: { sipoc: mod }, live: new Map([['d1', vm]]) });
    assertDeepEqual(await svc.read('d1'), { n: 4, live: true });
  });

  test('Zielform mit readStored ohne Mount, aktuelle Version: readStored ohne loadDetached', () => {
    let loads = 0;
    const mod = { ...targetModule({ onLoad: () => { loads++; } }), readStored: (saved, o) => ({ stored: saved.n, zoom: 9, o }) };
    const { svc, sm } = setup({ states: { d1: { _schema: { version: '1.0' }, n: 5 } }, modules: { sipoc: mod } });
    assertDeepEqual(svc.readSync('d1', { fields: [] }), { stored: 5, o: { fields: [] } });
    assertEqual(loads, 0);
    assertEqual(sm.writes.length, 0);
  });

  test('Zielform mit readStored ohne Mount, Version 0: einmal migriert, zurückgeschrieben, dann readStored', () => {
    let loads = 0;
    let stored = 0;
    const mod = { ...targetModule({ onLoad: () => { loads++; } }), readStored: (saved) => { stored++; return { stored: saved.n }; } };
    const { svc, sm } = setup({ states: { d1: { old: 7 } }, modules: { sipoc: mod } });
    assertEqual(svc.readSync('d1').n, 7);
    assertEqual(loads, 1);
    assertEqual(stored, 0);
    assertEqual(sm.writes.length, 1);
    assertDeepEqual(svc.readSync('d1'), { stored: 7 });
    assertEqual(loads, 1, 'kein zweites Laden');
    assertEqual(sm.writes.length, 1);
  });

  test('Zielform mit readStored im Einhängen: gespeicherter Stand über readStored', () => {
    const live = new Map([['d1', { model: Doc.fromJSON({ n: 0 }), read: () => { throw new Error('vm.read unerwartet'); } }]]);
    const ws = { ...makeWorkspace(live), isPending: () => true };
    const mod = { ...targetModule(), readStored: (saved) => ({ stored: saved.n }) };
    const { svc } = setup({ states: { d1: { _schema: { version: '1.0' }, n: 5 } }, modules: { sipoc: mod }, workspace: ws });
    assertDeepEqual(svc.readSync('d1'), { stored: 5 });
  });

  test('Altform ohne readStored und ohne Mixin → needs_mount', () => {
    const { svc } = setup({ states: { k1: {} } });
    assertEqual(caught(() => svc.readSync('k1'))?.code, 'needs_mount');
  });

  test('vm.read liefert ein Promise → async_read', () => {
    const vm = { model: Doc.fromJSON({ n: 4 }), read: async () => ({ n: 4 }) };
    const { svc } = setup({ live: new Map([['d1', vm]]) });
    assertEqual(caught(() => svc.readSync('d1'))?.code, 'async_read');
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

  test('abgeschlossenes Projekt: project_completed, nichts angewandt oder gespeichert', async () => {
    const { svc, sm } = setup({ states: { d1: { n: 1 } }, completed: true });
    let called = false;
    let err = null;
    try { await svc.write('d1', () => { called = true; }); } catch (e) { err = e; }
    assertEqual(err?.message, 'project_completed');
    assertEqual(err?.code, 'project_completed');
    assertEqual(called, false);
    assertEqual(sm.writes.length, 0);
    assertDeepEqual(sm.getModuleState('d1'), { n: 1 });
  });

  test('abgeschlossenes Projekt, gemountet: project_completed, das lebende Model bleibt', async () => {
    const vm = { model: Doc.fromJSON({ _schema: { version: '1.0' }, n: 1 }) };
    const { svc } = setup({ live: new Map([['d1', vm]]), completed: true });
    let err = null;
    try { await svc.write('d1', (m) => m.setN({ n: 5 })); } catch (e) { err = e; }
    assertEqual(err?.code, 'project_completed');
    assertEqual(vm.model.n, 1);
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
    ws._containers = new Map();
    ws._pending = new Map();
    ws._stateManager = sm;
    const vm = { model: Doc.fromJSON({ n: 1 }) };
    let finish;
    ws._pending.set('d1', new Promise((resolve) => {
      finish = () => {
        ws._instances.set('d1', { getActionData: () => vm, getState: () => vm.model.toJSON() });
        ws._containers.set('d1', { isConnected: true });
        ws._pending.delete('d1');
        resolve();
      };
    }));
    const svc = createInstances({
      stateManager: sm, moduleRegistry: { loadModule: async () => targetModule() },
      workspace: ws, eventBus: bus, createSource: () => ({ read: () => ({}), list: () => [] }),
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

  test('Instanz einer anderen Phase: Schreiben speichert, ein späteres Speichern aller Instanzen überschreibt nicht', async () => {
    const bus = makeBus();
    const sm = makeState({ phases: PHASES(), states: { d1: { _schema: { version: '1.0' }, n: 1, zoom: 1 } }, bus });
    const ws = Object.create(Workspace.prototype);
    ws._stateManager = sm;
    ws._pending = new Map();
    // Wie nach `_showPhase`: die Hülle ist gelöst, Alpine hat die Komponente
    // abgeräumt — `$data` ist leer, `getState()` liefert null.
    ws._containers = new Map([['d1', { isConnected: false }]]);
    ws._instances = new Map([['d1', { getActionData: () => ({}), getState: () => null }]]);
    const svc = createInstances({
      stateManager: sm, moduleRegistry: { loadModule: async () => targetModule() },
      workspace: ws, eventBus: bus, createSource: () => ({ read: () => ({}), list: () => [] }),
    });
    const res = await svc.write('d1', (m) => m.setN({ n: 9 }));
    assertEqual(res.mounted, false);
    ws._persistAllModuleStates();
    assertEqual(sm.getModuleState('d1').n, 9);
    noRemote(bus);
  });

  test('Altform: needs_mount', async () => {
    const { svc } = setup({ states: { dx: {} } });
    let err = null;
    try { await svc.write('dx', () => {}); } catch (e) { err = e; }
    assertEqual(err?.code, 'needs_mount');
  });
});
