/**
 * Tests for js/core/state-manager.js
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { EventBus } from '../../js/core/event-bus.js';
import { StateManager } from '../../js/core/state-manager.js';
import { StorageAdapter } from '../../js/core/storage/storage-adapter.js';
import { LocalAdapter } from '../../js/core/storage/local-adapter.js';
import { ModuleRegistry } from '../../js/core/module-registry.js';
import { VERSION } from '../../js/core/version.js';
import { stripPatch } from '../../js/core/version-utils.js';

// Match the StateManager's own per-version LS namespace so tests survive
// MAJOR.MINOR bumps without edits.
const LS_PREFIX = `dmike_v${stripPatch(VERSION)}_`;

suite('StateManager', () => {
  test('get/set: dot-path write and read', () => {
    const sm = new StateManager(new EventBus());
    sm.set('settings.language', 'en');
    assertEqual(sm.get('settings.language'), 'en');
  });

  test('get: returns undefined for unknown path', () => {
    const sm = new StateManager(new EventBus());
    assertEqual(sm.get('nonexistent.path'), undefined);
  });

  test('set: creates nested keys if missing', () => {
    const sm = new StateManager(new EventBus());
    sm.set('foo.bar.baz', 42);
    assertEqual(sm.get('foo.bar.baz'), 42);
  });

  // ─── Cycle awareness (v0.3) ───────────────────────────────────

  test('default state: projectMeta.cycle is dmaic', () => {
    const sm = new StateManager(new EventBus());
    assertEqual(sm.get('projectMeta.cycle'), 'dmaic');
  });

  test('default state: phases include data + extras frame tiles', () => {
    const sm = new StateManager(new EventBus());
    const keys = Object.keys(sm.get('phases')).join(',');
    assertEqual(keys, 'data,define,measure,analyze,improve,control,extras');
  });

  test('default state: phaseAchievement excludes data + extras', () => {
    const sm = new StateManager(new EventBus());
    const keys = Object.keys(sm.get('phaseAchievement')).join(',');
    assertEqual(keys, 'define,measure,analyze,improve,control');
  });

  test('_defaultState(dmadv): phases include design + verify', () => {
    const sm = new StateManager(new EventBus());
    const s = sm._defaultState('dmadv');
    assertEqual(s.projectMeta.cycle, 'dmadv');
    assertEqual(Object.keys(s.phases).join(','),
      'data,define,measure,analyze,design,verify,extras');
    assertEqual(Object.keys(s.phaseAchievement).join(','),
      'define,measure,analyze,design,verify');
  });

  test('_defaultState(unknown): falls back to dmaic', () => {
    const sm = new StateManager(new EventBus());
    const s = sm._defaultState('does-not-exist');
    assertEqual(s.projectMeta.cycle, 'dmaic');
  });

  test('createProject + getProjectCycle: cycle stored in project list', () => {
    const sm = new StateManager(new EventBus());
    // Snapshot existing projects so we can restore after the test.
    const before = sm.getProjects();
    const beforeActive = localStorage.getItem(`${LS_PREFIX}activeProject`);
    try {
      const id = sm.createProject('__cycles_test__', 'dmadv');
      assertEqual(sm.getProjectCycle(id), 'dmadv');
      const entry = sm.getProjects().find(p => p.id === id);
      assertEqual(entry.cycle, 'dmadv');
      assertEqual(entry.name, '__cycles_test__');
    } finally {
      // Restore project list and active marker so we leave LS untouched.
      localStorage.setItem(`${LS_PREFIX}projects`, JSON.stringify(before));
      if (beforeActive === null) localStorage.removeItem(`${LS_PREFIX}activeProject`);
      else localStorage.setItem(`${LS_PREFIX}activeProject`, beforeActive);
    }
  });

  test('createProject defaults to dmaic when cycleId omitted', () => {
    const sm = new StateManager(new EventBus());
    const before = sm.getProjects();
    const beforeActive = localStorage.getItem(`${LS_PREFIX}activeProject`);
    try {
      const id = sm.createProject('__cycles_test_default__');
      assertEqual(sm.getProjectCycle(id), 'dmaic');
    } finally {
      localStorage.setItem(`${LS_PREFIX}projects`, JSON.stringify(before));
      if (beforeActive === null) localStorage.removeItem(`${LS_PREFIX}activeProject`);
      else localStorage.setItem(`${LS_PREFIX}activeProject`, beforeActive);
    }
  });

  test('getProjectCycle: unknown projectId falls back to dmaic', () => {
    const sm = new StateManager(new EventBus());
    assertEqual(sm.getProjectCycle('non-existent-id'), 'dmaic');
  });

  // ─── phaseAchievementHistory persistence (v0.3) ────────────────

  test('default state: phaseAchievementHistory is empty object', () => {
    const sm = new StateManager(new EventBus());
    const h = sm.get('phaseAchievementHistory');
    assertEqual(typeof h, 'object');
    assertEqual(Object.keys(h).length, 0);
  });

  test('save/load: phaseAchievementHistory round-trips through localStorage', async () => {
    const sm1 = new StateManager(new EventBus());
    const before = sm1.getProjects();
    const beforeActive = localStorage.getItem(`${LS_PREFIX}activeProject`);
    try {
      const id = sm1.createProject('__history_persist_test__', 'dmaic');
      await sm1.switchProject(id);
      sm1.set('phaseAchievementHistory.define', [{ t: 100, v: 25 }, { t: 200, v: 50 }]);
      sm1.set('phaseAchievementHistory.measure', [{ t: 150, v: 10 }]);
      sm1.save(); // synchronous write to LS

      // Page-reload simulation: a fresh StateManager that picks up the active
      // project via load(). Using switchProject here would call save() against
      // its (default) in-memory state and clobber what sm1 just persisted.
      const sm2 = new StateManager(new EventBus());
      await sm2.load();
      const define = sm2.get('phaseAchievementHistory.define');
      const measure = sm2.get('phaseAchievementHistory.measure');
      assertEqual(define.length, 2);
      assertEqual(define[1].v, 50);
      assertEqual(measure[0].t, 150);

      await sm1.deleteProject(id);
    } finally {
      localStorage.setItem(`${LS_PREFIX}projects`, JSON.stringify(before));
      if (beforeActive === null) localStorage.removeItem(`${LS_PREFIX}activeProject`);
      else localStorage.setItem(`${LS_PREFIX}activeProject`, beforeActive);
    }
  });

  // ─── switchCycle (Plan §3.3a) ─────────────────────────────────

  /** Build a registry with DOE/glm/control-chart-style mappings. */
  function buildRegistry() {
    const reg = new ModuleRegistry();
    const noopLoad = () => Promise.resolve({ default: {} });
    reg.register({
      id: 'doe-planner', load: noopLoad,
      cycles: { dmaic: { phase: 'improve' }, dmadv: { phase: 'design' } },
    });
    reg.register({
      id: 'control-chart', load: noopLoad,
      cycles: { dmaic: { phase: 'control' }, dmadv: { phase: 'verify' } },
    });
    reg.register({
      id: 'unmapped', load: noopLoad,
      cycles: { dmaic: { phase: 'analyze' } }, // no dmadv mapping
    });
    return reg;
  }

  test('switchCycle: re-homes modules by cycle mapping', () => {
    const sm = new StateManager(new EventBus());
    sm.setModuleRegistry(buildRegistry());
    sm.set('phases.improve', [{ instanceId: 'i1', moduleId: 'doe-planner', state: {} }]);
    sm.set('phases.control', [{ instanceId: 'i2', moduleId: 'control-chart', state: {} }]);
    sm.switchCycle('dmadv');
    assertEqual(sm.get('phases.design').map(i => i.moduleId).join(','), 'doe-planner');
    assertEqual(sm.get('phases.verify').map(i => i.moduleId).join(','), 'control-chart');
  });

  test('switchCycle: unmapped modules land in first methodology phase', () => {
    const sm = new StateManager(new EventBus());
    sm.setModuleRegistry(buildRegistry());
    sm.set('phases.analyze', [{ instanceId: 'u1', moduleId: 'unmapped', state: {} }]);
    sm.switchCycle('dmadv');
    // 'unmapped' has no dmadv mapping → first DMADV methodology phase = 'define'
    assertEqual(sm.get('phases.define').map(i => i.moduleId).join(','), 'unmapped');
  });

  test('switchCycle: data tile preserved across cycle switch', () => {
    const sm = new StateManager(new EventBus());
    sm.setModuleRegistry(buildRegistry());
    sm.set('phases.data', [{ instanceId: 'd1', moduleId: 'worksheet', state: {} }]);
    sm.switchCycle('dmadv');
    assertEqual(sm.get('phases.data').map(i => i.moduleId).join(','), 'worksheet');
  });

  test('switchCycle: extras items move to first methodology phase', () => {
    const sm = new StateManager(new EventBus());
    sm.setModuleRegistry(buildRegistry());
    sm.set('phases.extras', [{ instanceId: 'e1', moduleId: 'unmapped', state: {} }]);
    sm.switchCycle('dmadv');
    assertEqual(sm.get('phases.define').map(i => i.moduleId).join(','), 'unmapped');
    assertEqual(sm.get('phases.extras').length, 0);
  });

  test('switchCycle: preserves achievement for shared phases, drops gone, zeroes new', () => {
    const sm = new StateManager(new EventBus());
    sm.setModuleRegistry(buildRegistry());
    sm.set('phaseAchievement.analyze', 80); // shared between dmaic and dmadv
    sm.set('phaseAchievement.improve', 60); // dmaic-only → dropped
    sm.switchCycle('dmadv');
    assertEqual(sm.get('phaseAchievement.analyze'), 80);
    assertEqual(sm.get('phaseAchievement.design'), 0);   // new in dmadv
    assertEqual(sm.get('phaseAchievement.verify'), 0);   // new in dmadv
    assertEqual(sm.get('phaseAchievement.improve'), undefined);
  });

  test('switchCycle: drops phaseAchievementHistory for removed phases', () => {
    const sm = new StateManager(new EventBus());
    sm.setModuleRegistry(buildRegistry());
    sm.set('phaseAchievementHistory.improve', [{ t: 1, v: 50 }]);
    sm.set('phaseAchievementHistory.analyze', [{ t: 1, v: 80 }]);
    sm.switchCycle('dmadv');
    assertEqual(sm.get('phaseAchievementHistory.improve'), undefined);
    // analyze exists in both, history preserved
    assertEqual(sm.get('phaseAchievementHistory.analyze').length, 1);
  });

  test('switchCycle: emits cycle:changed event with from/to', () => {
    const eb = new EventBus();
    const sm = new StateManager(eb);
    sm.setModuleRegistry(buildRegistry());
    let evt = null;
    eb.on('cycle:changed', e => { evt = e; });
    sm.switchCycle('dmadv');
    assertEqual(evt.from, 'dmaic');
    assertEqual(evt.to, 'dmadv');
  });

  test('switchCycle: no-op when target equals current cycle', () => {
    const sm = new StateManager(new EventBus());
    sm.setModuleRegistry(buildRegistry());
    let fired = false;
    sm._eventBus.on('cycle:changed', () => { fired = true; });
    const result = sm.switchCycle('dmaic'); // already dmaic
    assertEqual(result, false);
    assertEqual(fired, false);
  });

  test('switchCycle: round-trip DMAIC → DMADV → DMAIC restores phase placement', () => {
    const sm = new StateManager(new EventBus());
    sm.setModuleRegistry(buildRegistry());
    sm.set('phases.improve', [{ instanceId: 'i1', moduleId: 'doe-planner', state: {} }]);
    sm.set('phases.control', [{ instanceId: 'i2', moduleId: 'control-chart', state: {} }]);
    sm.switchCycle('dmadv');
    sm.switchCycle('dmaic');
    assertEqual(sm.get('phases.improve').map(i => i.moduleId).join(','), 'doe-planner');
    assertEqual(sm.get('phases.control').map(i => i.moduleId).join(','), 'control-chart');
  });

  test.todo('save/load: round-trips state through localStorage');
  test.todo('exportJSON: includes appVersion and moduleStates');
  test.todo('importJSON: restores state correctly');
  test.todo('getStorageUsage: returns numeric used/total');
  test.todo('setModuleState/getModuleState: synchronous cache round-trip');
  test.todo('flushNow: drains pending writes to IndexedDB');
  test.todo('load: populates module cache from IndexedDB');
  test.todo('switchProject: flushes pending writes before switching');

  // ─── Adapter injection (Task 4) ──────────────────────────────

  test('constructor accepts an injected adapter', () => {
    let created = false;
    class Probe extends StorageAdapter {
      supportsMultiProject = true;
      listProjects() { created = true; return []; }
      getActiveProjectId() { return null; }
    }
    const sm = new StateManager(new EventBus(), new Probe());
    sm.getProjects();
    assertEqual(created, true);
  });

  test('getProjects/createProject delegate to the injected adapter', () => {
    const calls = [];
    class Probe extends StorageAdapter {
      supportsMultiProject = true;
      listProjects() { calls.push('list'); return [{ id: 'p1', name: 'A', cycle: 'dmaic', created: '', modified: '', status: 'active' }]; }
      getActiveProjectId() { return 'p1'; }
      createProject(name, cycle) { calls.push(`create:${name}:${cycle}`); return 'new-id'; }
    }
    const sm = new StateManager(new EventBus(), new Probe());
    const list = sm.getProjects();
    assertEqual(list[0].id, 'p1');
    const id = sm.createProject('X', 'dmadv');
    assertEqual(id, 'new-id');
    assertEqual(calls.includes('create:X:dmadv'), true);
  });

  // ─── listInstances (generic flowchart-import support) ──────────

  suite('StateManager.listInstances', () => {
    test('returns [] when no phases match', () => {
      const sm = new StateManager(new EventBus());
      assertEqual(sm.listInstances('sipoc').length, 0);
    });

    test('returns [] when no instances match the moduleId', () => {
      const sm = new StateManager(new EventBus());
      sm.set('phases.define', [{ instanceId: 'i1', moduleId: 'ce-matrix' }]);
      assertEqual(sm.listInstances('sipoc').length, 0);
    });

    test('returns all matching instances across multiple phases', () => {
      const sm = new StateManager(new EventBus());
      sm.set('phases.define', [
        { instanceId: 's1', moduleId: 'sipoc', title: 'SIPOC A' },
        { instanceId: 'c1', moduleId: 'ce-matrix', title: 'C&E' },
      ]);
      sm.set('phases.measure', [
        { instanceId: 's2', moduleId: 'sipoc', title: 'SIPOC B' },
      ]);
      const result = sm.listInstances('sipoc');
      assertEqual(result.length, 2);
      assertDeepEqual(result[0], { instanceId: 's1', moduleId: 'sipoc', title: 'SIPOC A' });
      assertDeepEqual(result[1], { instanceId: 's2', moduleId: 'sipoc', title: 'SIPOC B' });
    });

    test('defaults title to instanceId when item has no title field', () => {
      const sm = new StateManager(new EventBus());
      sm.set('phases.define', [{ instanceId: 'p1', moduleId: 'process-map' }]);
      const result = sm.listInstances('process-map');
      assertEqual(result.length, 1);
      assertEqual(result[0].title, 'p1');
    });
  });
});

// ─── Remote Sync (Task 4) ───────────────────────────────────────────────────

// Minimal fake adapter: single project, manual subscribe trigger, mutable doc.
function makeFakeAdapter(initialDoc) {
  let doc = initialDoc;
  let cb = null;
  const writes = [];
  return {
    supportsMultiProject: false,
    _writes: writes,
    _setDoc(d) { doc = d; },
    _fireRemote() { if (cb) cb(); },
    subscribe(onRemoteChange) { cb = onRemoteChange; return () => { cb = null; }; },
    async loadProjectDoc() { return doc; },
    listProjects() { return [{ id: 'wb', name: 'WB', cycle: 'dmaic', status: 'active' }]; },
    getActiveProjectId() { return 'wb'; },
    setActiveProjectId() {},
    createProject() { return 'wb'; },
    saveProjectMeta(id, _d) { writes.push(['meta', id]); },
    putModule(id, iid, s) { writes.push(['put', iid, s]); },
    removeModule(id, iid) { writes.push(['rm', iid]); },
    dropPending() {}, addProjectEntry() {}, updateProjectEntry() {},
    setProjectStatus() {}, reorderProjects() {},
    async deleteProject() {}, async flush() {},
    async exportProjectDocs() { return []; }, async importProjectDoc() {},
  };
}

function baseDoc() {
  return {
    projectMeta: { name: 'WB', cycle: 'dmaic' },
    phases: { define: [{ instanceId: 'i1', moduleId: 'sipoc' }] },
    phaseAchievement: {}, phaseAchievementHistory: [], models: [],
    optimizations: [], dashboard: {}, version: '1.0.0',
    moduleStates: { i1: { columns: [['a']] } },
  };
}

suite('StateManager remote sync', () => {
  test('remote change updates cache and emits state:remote-changed', async () => {
    const bus = new EventBus();
    const adapter = makeFakeAdapter(baseDoc());
    const sm = new StateManager(bus, adapter);
    await sm.load();

    let event = null;
    bus.on('state:remote-changed', (e) => { event = e; });

    const next = baseDoc();
    next.moduleStates.i1 = { columns: [['REMOTE']] };
    adapter._setDoc(next);
    adapter._fireRemote();
    await Promise.resolve(); await Promise.resolve();

    assertDeepEqual(sm.getModuleState('i1'), { columns: [['REMOTE']] });
    assertTrue(event !== null, 'event emitted');
    assertTrue(event.instanceIds.includes('i1'), 'i1 reported changed');
  });

  test('remote-apply guard suppresses write-back', async () => {
    const bus = new EventBus();
    const adapter = makeFakeAdapter(baseDoc());
    const sm = new StateManager(bus, adapter);
    await sm.load();
    adapter._writes.length = 0;

    const next = baseDoc();
    next.moduleStates.i1 = { columns: [['REMOTE']] };
    adapter._setDoc(next);
    adapter._fireRemote();
    await Promise.resolve(); await Promise.resolve();

    // No adapter writes may result from applying a remote change.
    assertEqual(adapter._writes.length, 0, 'no write-back during remote apply');
  });

  test('metaChanged flag set when a meta field changes remotely', async () => {
    const bus = new EventBus();
    const adapter = makeFakeAdapter(baseDoc());
    const sm = new StateManager(bus, adapter);
    await sm.load();
    let event = null;
    bus.on('state:remote-changed', (e) => { event = e; });

    const next = baseDoc();
    next.version = '2.0.0';
    adapter._setDoc(next);
    adapter._fireRemote();
    await Promise.resolve(); await Promise.resolve();

    assertEqual(event.metaChanged, true);
  });

  // ─── Bug 012: module data survives immediate reload ───────────

  test('module state survives an unload flush before the async debounce (Bug 012)', async () => {
    localStorage.removeItem(`${LS_PREFIX}projects`);
    const adapter = new LocalAdapter();
    const sm = new StateManager(new EventBus(), adapter);
    await sm.load();                              // opens IDB, activates a project
    sm.setModuleState('inst-x', { hello: 'world' }); // queued; 500ms debounce NOT fired
    // Model the page unload: the synchronous flush the unload handlers now use.
    adapter.flushSync();
    // Model the reload/restart: a fresh manager reading the same storage.
    const sm2 = new StateManager(new EventBus(), new LocalAdapter());
    await sm2.load();
    assertDeepEqual(sm2.getModuleState('inst-x'), { hello: 'world' });
  });
});
