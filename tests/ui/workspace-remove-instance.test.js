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
  const savedStates = [];
  const shown = [];
  const state = structuredClone(phases);
  ws._instances = new Map();
  ws._containers = new Map();
  ws._pending = new Map();
  ws._activePhase = 'define';
  ws._eventBus = { emit: (name, payload) => events.push([name, payload]) };
  ws._stateManager = {
    isCompleted: () => false,
    get: (path) => (path === 'phases' ? state : path.startsWith('phases.') ? state[path.slice(7)] : undefined),
    set: (path, value) => { state[path.slice(7)] = value; },
    removeModuleState: (id) => removedStates.push(id),
    setModuleState: (id, value) => savedStates.push([id, value]),
  };
  ws._showPhase = (phase) => { shown.push(phase); };
  return { ws, events, removedStates, savedStates, shown, state };
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

suite('workspace restoreInstance', () => {
  const two = {
    define: [
      { instanceId: 'fw-1', moduleId: 'five-why', order: 0 },
      { instanceId: 'fw-2', moduleId: 'five-why', order: 1, customName: 'Zwei' },
    ],
  };

  test('bringt eine entfernte Instanz mit derselben Id an ihre Stelle zurück', async () => {
    const { ws, events, savedStates, state } = makeWorkspace(two);
    const before = structuredClone(state.define);
    const record = structuredClone(state.define[0]);
    await ws.removeInstance('fw-1');
    events.length = 0;
    const ok = await ws.restoreInstance({
      instanceId: 'fw-1', module: 'five-why', phase: 'define', state: { why: ['a'] }, record, index: 0,
    });
    assertEqual(ok, true);
    assertDeepEqual(state.define, before);
    assertDeepEqual(savedStates, [['fw-1', { why: ['a'] }]]);
    // Ohne Sprung: die Ansicht bleibt, wo sie ist.
    assertDeepEqual(events, [['module:added', { moduleId: 'five-why', phase: 'define', instanceId: 'fw-1', silent: true }]]);
  });

  test('ohne Eintrag hängt sie einen neuen ans Ende', async () => {
    const { ws, state, savedStates } = makeWorkspace();
    await ws.restoreInstance({ instanceId: 'fw-9', module: 'five-why', phase: 'define', state: null });
    assertDeepEqual(state.define.at(-1), { instanceId: 'fw-9', moduleId: 'five-why', order: 1 });
    assertDeepEqual(savedStates, []);
  });

  test('eine vorhandene Id wird nicht verdoppelt', async () => {
    const { ws, events, state } = makeWorkspace();
    assertEqual(await ws.restoreInstance({ instanceId: 'fw-1', module: 'five-why', phase: 'define', state: {} }), false);
    assertEqual(state.define.length, 1);
    assertDeepEqual(events, []);
  });

  test('verweigert im abgeschlossenen Projekt', async () => {
    const { ws, state } = makeWorkspace({ define: [] });
    ws._stateManager.isCompleted = () => true;
    assertEqual(await ws.restoreInstance({ instanceId: 'fw-1', module: 'five-why', phase: 'define', state: {} }), false);
    assertDeepEqual(state.define, []);
  });
});
