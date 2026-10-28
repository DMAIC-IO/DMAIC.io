/**
 * Tests für ui/agent-host.js — der Port, über den die DOM-freie
 * Agentenschicht an Router und Workspace kommt. Derselbe Weg wie
 * die UI, kein zweiter Routingpfad.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import { createAgentHost } from '../../js/ui/agent-host.js';
import { createRevisionTracker } from '../../js/core/agent/agent-revisions.js';

const DEFS = {
  'five-why': { id: 'five-why', phase: 'define', cycles: { dmaic: { phase: 'define', allowedPhases: ['measure'] } } },
  'worksheet': { id: 'worksheet', phase: 'data' },
};

function makeHost({ phases, activeInstance = null, completed = false, ready = null } = {}) {
  const state = structuredClone(phases ?? {
    data: [],
    define: [{ instanceId: 'fw-1', moduleId: 'five-why', order: 0 }],
    measure: [],
  });
  const calls = [];
  const moduleStates = new Map();
  const stateManager = {
    getActiveProjectId: () => 'p-1',
    isCompleted: () => completed,
    get: (path) => (path === 'phases' ? state : path.startsWith('phases.') ? state[path.slice(7)] : undefined),
    // Wie der echte stateManager: im abgeschlossenen Projekt verschwindet
    // jeder Nicht-`settings.`-Schreibzugriff STILL (core/state-manager.js).
    set: (path, value) => { if (!completed) state[path.slice(7)] = value; },
    removeModuleState: () => {},
    // Der Modulzustand wie im Cache des echten stateManager; die Revision
    // hängt am Inhalt (core/state-manager.js:getModuleRevision).
    setModuleState: (id, s) => { calls.push(['persist', id, s]); moduleStates.set(id, structuredClone(s)); },
    getModuleRevision: (id) => (moduleStates.has(id) ? JSON.stringify(moduleStates.get(id)) : undefined),
    getStructureRevision: () => JSON.stringify(state),
  };
  const moduleRegistry = { get: (id) => DEFS[id], getActiveCycle: () => 'dmaic' };
  const eventBus = { emit: (name, payload) => calls.push(['emit', name, payload]) };
  const mounted = new Map();
  const workspace = {
    getActiveModuleInfo: () => activeInstance,
    getInstance: (id) => mounted.get(id) ?? null,
    // Wie der echte Workspace: der Griff auf das Viewmodel wartet das
    // Einhängen ab (ui/workspace.js:whenInstanceReady).
    whenInstanceReady: async (id) => mounted.get(id) ?? ready?.(id) ?? null,
    removeInstance: async (id) => { calls.push(['removeInstance', id]); return !completed; },
  };
  const router = {
    navigate: async (route) => { calls.push(['navigate', route]); },
  };
  return {
    host: createAgentHost({
      stateManager, moduleRegistry, eventBus, router, workspace,
      nextTick: (cb) => { calls.push(['tick']); cb(); },
    }),
    calls, state, mounted, stateManager, moduleStates,
  };
}

suite('agent host — current view', () => {
  test('liefert null, wenn kein Modul angezeigt wird', () => {
    assertEqual(makeHost().host.getCurrentView(), null);
  });

  test('liefert Instanz, Modul und Phase des angezeigten Moduls', () => {
    const { host } = makeHost({ activeInstance: { instanceId: 'fw-1', moduleId: 'five-why', instance: {} } });
    assertDeepEqual(host.getCurrentView(), { instanceId: 'fw-1', module: 'five-why', phase: 'define' });
  });
});

suite('agent host — add', () => {
  test('legt über createInstance an und liefert Id und Phase', async () => {
    const { host, state } = makeHost();
    const r = await host.addInstance('five-why');
    assertEqual(r.phase, 'define');
    assertEqual(r.module, 'five-why');
    assertTrue(typeof r.instanceId === 'string' && r.instanceId.length > 0);
    assertEqual(state.define.length, 2);
  });

  test('ein Phasen-Override landet in der genannten Phase', async () => {
    const { host, state } = makeHost();
    const r = await host.addInstance('five-why', 'measure');
    assertEqual(r.phase, 'measure');
    assertEqual(state.measure.length, 1);
    assertEqual(state.define.length, 1);
  });

  test('emittiert module:added wie der Router', async () => {
    const { host, calls } = makeHost();
    const r = await host.addInstance('worksheet');
    const added = calls.find(c => c[0] === 'emit' && c[1] === 'module:added');
    assertTrue(Boolean(added), 'module:added fehlt');
    assertEqual(added[2].instanceId, r.instanceId);
    assertEqual(added[2].phase, 'data');
  });
});

suite('agent host — open and viewmodel', () => {
  test('open navigiert auf die Modulroute des aktiven Projekts', async () => {
    const { host, calls } = makeHost();
    const r = await host.openInstance('fw-1');
    assertDeepEqual(r, { instanceId: 'fw-1', module: 'five-why', phase: 'define' });
    assertDeepEqual(calls, [['navigate', { kind: 'module', projectId: 'p-1', instanceId: 'fw-1' }]]);
  });

  test('open einer unbekannten Instanz liefert null und navigiert nicht', async () => {
    const { host, calls } = makeHost();
    assertEqual(await host.openInstance('nope'), null);
    assertDeepEqual(calls, []);
  });

  test('getViewmodel öffnet die Instanz und liefert getActionData()', async () => {
    const { host, calls, mounted } = makeHost();
    const data = { read: () => ({}) };
    mounted.set('fw-1', { getActionData: () => data });
    assertEqual(await host.getViewmodel('fw-1'), data);
    assertTrue(calls.some(c => c[0] === 'navigate'), 'die Instanz wurde geöffnet');
  });

  test('getViewmodel liefert null, wenn die Instanz nicht live wird', async () => {
    const { host } = makeHost();
    assertEqual(await host.getViewmodel('fw-1'), null);
  });

  test('remove delegiert an den bestätigungsfreien Workspace-Pfad', async () => {
    const { host, calls } = makeHost();
    assertEqual(await host.removeInstance('fw-1'), true);
    assertDeepEqual(calls, [['removeInstance', 'fw-1']]);
  });
});

// ── Review-Befund I2 ───────────────────────────────────────────────
// Der Rückfall `locate(instanceId) ?? { instanceId, module, phase: … }` hat
// im abgeschlossenen Projekt eine Instanz-Id erfunden, die es nicht gibt:
// `stateManager.set` verwirft den Schreibzugriff still, `locate()` findet
// nichts — und der Agent bekam `ok: true` mit dieser Id.
suite('agent host — der abgeschlossene Projektzustand', () => {
  test('isCompleted spiegelt den stateManager', () => {
    assertEqual(makeHost().host.isCompleted(), false);
    assertEqual(makeHost({ completed: true }).host.isCompleted(), true);
  });

  test('addInstance liefert null statt einer erfundenen Id', async () => {
    const { host, state } = makeHost({ completed: true });
    assertEqual(await host.addInstance('five-why'), null);
    assertEqual(state.define.length, 1, 'nichts wurde geschrieben');
  });

  test('addInstance fasst den Workspace im abgeschlossenen Projekt gar nicht an', async () => {
    const { host, calls } = makeHost({ completed: true });
    await host.addInstance('five-why');
    assertDeepEqual(calls, [], 'kein module:added für eine Instanz, die es nicht gibt');
  });

  test('removeInstance liefert false und ruft den Workspace nicht', async () => {
    const { host, calls } = makeHost({ completed: true });
    assertEqual(await host.removeInstance('fw-1'), false);
    assertDeepEqual(calls, []);
  });
});

suite('agent host — Persistenz abwarten (Lesen vor Schreiben)', () => {
  test('addInstance legt den Ausgangszustand der neuen Instanz einmal ab', async () => {
    const { host, calls } = makeHost({ ready: () => ({ getState: () => ({ problem: '' }) }) });
    const r = await host.addInstance('five-why');
    assertDeepEqual(calls.filter(c => c[0] === 'persist'), [['persist', r.instanceId, { problem: '' }]]);
  });

  test('addInstance ohne lebendes Modul legt nichts ab', async () => {
    const { host, calls } = makeHost();
    await host.addInstance('five-why');
    assertEqual(calls.some(c => c[0] === 'persist'), false);
  });

  test('addInstance legt den Zustand erst nach dem Einhängen ab, nicht davor', async () => {
    // Das `init()` des Moduls normalisiert sein Model während des Einhängens
    // (Controller-Ruling R1): abgelegt werden muss der Stand DANACH.
    let model = { raw: true };
    const { host, calls } = makeHost({
      ready: async () => {
        await Promise.resolve();
        model = { normalized: true };
        return { getState: () => model };
      },
    });
    const r = await host.addInstance('five-why');
    assertDeepEqual(calls.filter(c => c[0] === 'persist'), [['persist', r.instanceId, { normalized: true }]]);
  });

  test('settle wartet einen Alpine-Tick ab', async () => {
    const { host, calls } = makeHost();
    await host.settle();
    assertDeepEqual(calls.filter(c => c[0] === 'tick'), [['tick']]);
  });

  test('settle(id) legt den Zustand einer Instanz ohne gespeicherten Zustand ab', async () => {
    const { host, calls, mounted } = makeHost();
    mounted.set('fw-1', { getState: () => ({ problem: 'x' }) });
    await host.settle('fw-1');
    assertDeepEqual(calls.filter(c => c[0] === 'persist'), [['persist', 'fw-1', { problem: 'x' }]]);
  });

  test('settle(id) schreibt nichts, wenn die Instanz schon einen Zustand hat', async () => {
    const { host, calls, mounted, stateManager } = makeHost();
    stateManager.setModuleState('fw-1', { problem: 'x' });
    mounted.set('fw-1', { getState: () => ({ problem: 'anders' }) });
    await host.settle('fw-1');
    assertEqual(calls.filter(c => c[0] === 'persist').length, 1, 'nur der Aufbau oben');
  });

  test('gelesen ohne gespeicherten Zustand, dann ein Ansichtswechsel: die Instanz bleibt aktuell (R2)', async () => {
    const { host, mounted, stateManager } = makeHost();
    mounted.set('fw-1', { getState: () => ({ problem: 'x' }) });
    const revisions = createRevisionTracker(stateManager);
    // Was die Laufzeit nach einem `read` tut: settle(id), dann vermerken.
    await host.settle('fw-1');
    revisions.markInstance('fw-1');
    // Der Ansichtswechsel (`_persistAllModuleStates`) schreibt denselben Inhalt.
    stateManager.setModuleState('fw-1', { problem: 'x' });
    assertTrue(revisions.isInstanceCurrent('fw-1'), 'ein unveränderter Inhalt ist keine fremde Änderung');
  });
});
