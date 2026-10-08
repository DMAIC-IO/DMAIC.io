/**
 * Tests für Workspace.getInstance / removeInstance — der bestätigungsfreie
 * Entfernungspfad, den der Agent benutzt. _removeModule fragt nach und
 * delegiert dann hierher: ein Pfad, zwei Aufrufer.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import { Workspace } from '../../js/ui/workspace.js';

/** Minimaler Workspace ohne DOM. */
function makeWorkspace(phases = { define: [{ instanceId: 'fw-1', moduleId: 'five-why', order: 0 }] }) {
  const ws = Object.create(Workspace.prototype);
  const events = [];
  const removedStates = [];
  const shown = [];
  const state = structuredClone(phases);
  ws._instances = new Map();
  ws._containers = new Map();
  ws._activePhase = 'define';
  ws._eventBus = { emit: (name, payload) => events.push([name, payload]) };
  ws._stateManager = {
    isCompleted: () => false,
    get: (path) => (path === 'phases' ? state : path.startsWith('phases.') ? state[path.slice(7)] : undefined),
    set: (path, value) => { state[path.slice(7)] = value; },
    removeModuleState: (id) => removedStates.push(id),
  };
  ws._showPhase = (phase) => { shown.push(phase); };
  return { ws, events, removedStates, shown, state };
}

suite('workspace getInstance', () => {
  test('liefert die lebende Instanz', () => {
    const { ws } = makeWorkspace();
    const inst = { id: 'five-why' };
    ws._instances.set('fw-1', inst);
    assertEqual(ws.getInstance('fw-1'), inst);
  });

  test('liefert null für eine nicht gemountete Instanz', () => {
    const { ws } = makeWorkspace();
    assertEqual(ws.getInstance('nope'), null);
  });
});

suite('workspace removeInstance', () => {
  test('entfernt Zustand, Eintrag und Instanz und emittiert module:removed', async () => {
    const { ws, events, removedStates, shown, state } = makeWorkspace();
    let destroyed = false;
    ws._instances.set('fw-1', { destroy: async () => { destroyed = true; } });
    const ok = await ws.removeInstance('fw-1');
    assertEqual(ok, true);
    assertTrue(destroyed, 'destroy() wurde aufgerufen');
    assertEqual(ws._instances.has('fw-1'), false);
    assertDeepEqual(state.define, []);
    assertDeepEqual(removedStates, ['fw-1']);
    assertDeepEqual(events, [['module:removed', { moduleId: 'five-why', phase: 'define', instanceId: 'fw-1' }]]);
    assertDeepEqual(shown, ['define']);
  });

  test('funktioniert auch ohne gemountete Instanz', async () => {
    const { ws, state } = makeWorkspace();
    assertEqual(await ws.removeInstance('fw-1'), true);
    assertDeepEqual(state.define, []);
  });

  test('liefert false für eine unbekannte Instanz und verändert nichts', async () => {
    const { ws, events, state } = makeWorkspace();
    assertEqual(await ws.removeInstance('nope'), false);
    assertDeepEqual(events, []);
    assertEqual(state.define.length, 1);
  });

  test('verweigert im abgeschlossenen Projekt', async () => {
    const { ws, state } = makeWorkspace();
    ws._stateManager.isCompleted = () => true;
    assertEqual(await ws.removeInstance('fw-1'), false);
    assertEqual(state.define.length, 1);
  });

  test('ein werfendes destroy() hält die Entfernung nicht auf', async () => {
    const { ws, state } = makeWorkspace();
    ws._instances.set('fw-1', { destroy: async () => { throw new Error('boom'); } });
    assertEqual(await ws.removeInstance('fw-1'), true);
    assertDeepEqual(state.define, []);
  });
});
