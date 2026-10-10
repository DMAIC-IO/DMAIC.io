/**
 * Tests that the workspace remembers the last active module per phase, so
 * switching phases and coming back reopens the module the user left there
 * instead of jumping to the first tab.
 */
import { suite, test, assertEqual } from '../test-utils.js';
import { Workspace } from '../../js/ui/workspace.js';

function makeWorkspace(phases, eventBus = { on: () => {}, emit: () => {} }) {
  const container = document.createElement('div');
  const get = (path) => {
    if (path === 'phases') return phases;
    if (path.startsWith('phases.')) return phases[path.slice('phases.'.length)];
    return undefined;
  };
  const stateManager = {
    get,
    getModuleState: () => ({}),
    setModuleState: () => {},
    isCompleted: () => false,
  };
  const i18n = { t: (k) => k, getLanguage: () => 'de' };
  const moduleRegistry = { instantiate: async () => ({}), get: () => ({ id: 'x' }) };
  const ws = new Workspace(container, {
    moduleRegistry, eventBus, stateManager, i18n,
    modal: () => {}, notify: () => {}, helpPanel: null,
    chartManager: null, examples: null, glossary: null,
  });
  // Tab DOM and module mounting are not under test here.
  ws._renderTab = () => {};
  ws._instantiateModule = async (id) => { ws._containers.set(id, document.createElement('div')); };
  ws.render();
  return ws;
}

const PHASES = {
  define: [{ instanceId: 'd1', moduleId: 'x' }, { instanceId: 'd2', moduleId: 'x' }],
  measure: [{ instanceId: 'm1', moduleId: 'x' }, { instanceId: 'm2', moduleId: 'x' }],
};

suite('Workspace — last active module per phase', () => {
  test('returning to a phase reopens the module last selected there', async () => {
    const ws = makeWorkspace(PHASES);
    await ws._activateTab('d2');
    ws._showPhase('measure');
    ws._showPhase('define');
    assertEqual(ws._activeInstanceId, 'd2');
  });

  test('each phase keeps its own selection', async () => {
    const ws = makeWorkspace(PHASES);
    await ws._activateTab('d2');
    ws._showPhase('measure');
    await ws._activateTab('m2');
    ws._showPhase('define');
    assertEqual(ws._activeInstanceId, 'd2');
    ws._showPhase('measure');
    assertEqual(ws._activeInstanceId, 'm2');
  });

  test('a phase never visited still opens its first module', () => {
    const ws = makeWorkspace(PHASES);
    ws._showPhase('measure');
    assertEqual(ws._activeInstanceId, 'm1');
  });

  test('a remembered module that was removed falls back to the first module', async () => {
    const phases = structuredClone(PHASES);
    const ws = makeWorkspace(phases);
    await ws._activateTab('d2');
    ws._showPhase('measure');
    phases.define = phases.define.filter(i => i.instanceId !== 'd2');
    ws._showPhase('define');
    assertEqual(ws._activeInstanceId, 'd1');
  });

  test('a module that finishes mounting late does not take the tab back', async () => {
    // Real bus: the workspace's own module:activated listener must run.
    const listeners = {};
    const bus = {
      on: (n, fn) => { (listeners[n] ||= []).push(fn); },
      off: () => {},
      emit: (n, p) => { (listeners[n] || []).forEach(fn => fn(p)); },
    };
    const ws = makeWorkspace(PHASES, bus);
    let finishD1;
    ws._containers.clear();                 // render() already mounted d1
    ws._instantiateModule = (id) => {
      ws._containers.set(id, document.createElement('div'));
      return id === 'd1' ? new Promise((r) => { finishD1 = r; }) : Promise.resolve();
    };
    const slow = ws._activateTab('d1');     // first chunk load still pending …
    await ws._activateTab('d2');            // … while the user picks another tab
    finishD1();
    await slow;
    assertEqual(ws._activeInstanceId, 'd2');
  });

  test('reset() forgets the remembered modules', async () => {
    const ws = makeWorkspace(PHASES);
    await ws._activateTab('d2');
    ws._showPhase('measure');
    await ws.reset();
    ws._showPhase('define');
    assertEqual(ws._activeInstanceId, 'd1');
  });
});
