/**
 * Tests for core/worksheet-handoff.js — Phase der eigenen Instanz und das
 * abwartbare Anlegen eines neuen Worksheets.
 */
import { suite, test, assertEqual, assert } from '../test-utils.js';
import { findOwnPhase, openNewWorksheet } from '../../js/core/worksheet-handoff.js';

/** StateManager- und EventBus-Attrappe, die Schreibzugriffe mitschreibt. */
function fakeContext(phases) {
  const state = { phases: structuredClone(phases) };
  const moduleStates = {};
  const handlers = {};
  const emitted = [];
  const stateManager = {
    get(path) {
      if (path === 'phases') return state.phases;
      if (path.startsWith('phases.')) return state.phases[path.slice(7)];
      return undefined;
    },
    set(path, value) { state.phases[path.slice(7)] = value; },
    setModuleState(id, s) { moduleStates[id] = s; },
    getModuleState(id) { return moduleStates[id] ?? null; },
  };
  const eventBus = {
    on(evt, fn) { (handlers[evt] ??= []).push(fn); },
    off(evt, fn) { handlers[evt] = (handlers[evt] ?? []).filter(h => h !== fn); },
    emit(evt, payload) {
      emitted.push({ evt, payload });
      for (const h of [...(handlers[evt] ?? [])]) h(payload);
    },
  };
  return { stateManager, eventBus, instanceId: 'tool-1', state, moduleStates, handlers, emitted };
}

suite('worksheet-handoff', () => {
  test('findOwnPhase findet die Phase der eigenen Instanz', () => {
    const ctx = fakeContext({ define: [], measure: [{ instanceId: 'tool-1', moduleId: 'x' }] });
    assertEqual(findOwnPhase(ctx.stateManager, 'tool-1'), 'measure');
  });

  test('findOwnPhase fällt auf data zurück', () => {
    const ctx = fakeContext({ define: [] });
    assertEqual(findOwnPhase(ctx.stateManager, 'tool-1'), 'data');
  });

  test('openNewWorksheet registriert die Instanz in der eigenen Phase und sendet module:added', async () => {
    const ctx = fakeContext({ data: [{ instanceId: 'tool-1', moduleId: 'x', order: 0, state: {} }] });
    const pending = openNewWorksheet(ctx, { sheetName: 'Blatt A' });
    const added = ctx.emitted.find(e => e.evt === 'module:added');
    assert(added, 'module:added wurde nicht gesendet');
    const wsId = added.payload.instanceId;
    assertEqual(added.payload.moduleId, 'worksheet');
    assertEqual(added.payload.phase, 'data');
    assertEqual(ctx.state.phases.data.length, 2);
    assertEqual(ctx.state.phases.data[1].instanceId, wsId);
    assertEqual(ctx.state.phases.data[1].order, 1);
    assert(ctx.moduleStates[wsId], 'Anfangszustand fehlt');
    ctx.eventBus.emit('module:activated', { instanceId: wsId });
    assertEqual(await pending, wsId);
  });

  test('openNewWorksheet löst erst bei module:activated der neuen Instanz auf', async () => {
    const ctx = fakeContext({ data: [{ instanceId: 'tool-1', moduleId: 'x', order: 0, state: {} }] });
    let resolved = false;
    const pending = openNewWorksheet(ctx, { sheetName: 'Blatt A' }).then((id) => { resolved = true; return id; });
    ctx.eventBus.emit('module:activated', { instanceId: 'fremd' });
    await Promise.resolve();
    assertEqual(resolved, false);
    const wsId = ctx.emitted.find(e => e.evt === 'module:added').payload.instanceId;
    ctx.eventBus.emit('module:activated', { instanceId: wsId });
    await pending;
    assertEqual(resolved, true);
    assertEqual((ctx.handlers['module:activated'] ?? []).length, 0);
  });

  test('openNewWorksheet bricht mit Fehler ab, wenn die Aktivierung ausbleibt', async () => {
    const ctx = fakeContext({ data: [{ instanceId: 'tool-1', moduleId: 'x', order: 0, state: {} }] });
    let err = null;
    try {
      await openNewWorksheet(ctx, { sheetName: 'Blatt A', timeoutMs: 10 });
    } catch (e) { err = e; }
    assert(err instanceof Error, 'Promise wurde nicht mit Fehler beendet');
    assertEqual((ctx.handlers['module:activated'] ?? []).length, 0);
  });
});
