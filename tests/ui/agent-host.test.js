/**
 * Tests für ui/agent-host.js — der Port, über den die DOM-freie
 * Agentenschicht an Router und Workspace kommt. Spec §2: derselbe Weg wie
 * die UI, kein zweiter Routingpfad.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import { createAgentHost } from '../../js/ui/agent-host.js';

const DEFS = {
  'five-why': { id: 'five-why', phase: 'define', cycles: { dmaic: { phase: 'define', allowedPhases: ['measure'] } } },
  'worksheet': { id: 'worksheet', phase: 'data' },
};

function makeHost({ phases, activeInstance = null } = {}) {
  const state = structuredClone(phases ?? {
    data: [],
    define: [{ instanceId: 'fw-1', moduleId: 'five-why', order: 0 }],
    measure: [],
  });
  const calls = [];
  const stateManager = {
    getActiveProjectId: () => 'p-1',
    isCompleted: () => false,
    get: (path) => (path === 'phases' ? state : path.startsWith('phases.') ? state[path.slice(7)] : undefined),
    set: (path, value) => { state[path.slice(7)] = value; },
    removeModuleState: () => {},
  };
  const moduleRegistry = { get: (id) => DEFS[id], getActiveCycle: () => 'dmaic' };
  const eventBus = { emit: (name, payload) => calls.push(['emit', name, payload]) };
  const mounted = new Map();
  const workspace = {
    getActiveModuleInfo: () => activeInstance,
    getInstance: (id) => mounted.get(id) ?? null,
    removeInstance: async (id) => { calls.push(['removeInstance', id]); return true; },
  };
  const router = {
    navigate: async (route) => { calls.push(['navigate', route]); },
  };
  return {
    host: createAgentHost({ stateManager, moduleRegistry, eventBus, router, workspace }),
    calls, state, mounted,
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
