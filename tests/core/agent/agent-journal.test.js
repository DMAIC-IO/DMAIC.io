/**
 * Tests for core/agent/agent-journal.js — das Journal eines Stapels: was es
 * vor dem ersten Schreiben festhält und wie `rollback` den Stand von vorher
 * zurückbringt (Instanzzustände, angelegte und entfernte Instanzen, Phasen).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { createJournal } from '../../../js/core/agent/agent-journal.js';

/** stateManager und Host als Fakes; `calls` protokolliert die Host-Aufrufe. */
function setup({ phases, states = {}, mounted = [], liveStates = {} } = {}) {
  const state = {
    phases: structuredClone(phases ?? {
      data: [{ instanceId: 'ws1', moduleId: 'worksheet', order: 0 }],
      define: [{ instanceId: 'fw1', moduleId: 'five-why', order: 0, customName: 'Warum' }],
    }),
  };
  const moduleStates = new Map(Object.entries(structuredClone(states)));
  const calls = [];
  const stateManager = {
    get: (path) => path.split('.').reduce((o, k) => o?.[k], state),
    set: (path, value) => {
      const keys = path.split('.');
      let o = state;
      for (const k of keys.slice(0, -1)) o = o[k];
      o[keys.at(-1)] = value;
    },
    getModuleState: (id) => moduleStates.get(id) ?? null,
    setModuleState: (id, s) => { moduleStates.set(id, structuredClone(s)); },
    removeModuleState: (id) => { moduleStates.delete(id); },
  };
  const host = {
    removeInstance: async (id) => {
      calls.push(['remove', id]);
      for (const items of Object.values(state.phases)) {
        const i = items.findIndex((r) => r.instanceId === id);
        if (i >= 0) items.splice(i, 1);
      }
      moduleStates.delete(id);
      return true;
    },
    restoreInstance: async (entry) => {
      calls.push(['restore', entry.instanceId]);
      const items = state.phases[entry.phase];
      items.splice(entry.index ?? items.length, 0,
        entry.record ?? { instanceId: entry.instanceId, moduleId: entry.module, order: items.length });
      if (entry.state != null) moduleStates.set(entry.instanceId, structuredClone(entry.state));
    },
    applyLiveState: (id, s) => { if (mounted.includes(id)) calls.push(['live', id, s]); },
    isMounted: (id) => mounted.includes(id),
    // Wie der echte Host: legt den lebenden Stand ab, wenn er abweicht.
    settle: async (id) => {
      calls.push(['settle', id]);
      if (Object.hasOwn(liveStates, id)) moduleStates.set(id, structuredClone(liveStates[id]));
    },
  };
  return { stateManager, host, state, moduleStates, calls, journal: createJournal({ stateManager, host }) };
}

suite('agent journal — Rücknahme', () => {
  test('rollback restores touched module state', async () => {
    const { journal, stateManager, moduleStates } = setup({ states: { ws1: { rows: 1 } } });
    journal.touchInstance('ws1');
    stateManager.setModuleState('ws1', { rows: 2 });
    // Ein zweites Berühren hält den ersten Stand fest, nicht den Zwischenstand.
    journal.touchInstance('ws1');
    stateManager.setModuleState('ws1', { rows: 3 });
    await journal.rollback();
    assertDeepEqual(moduleStates.get('ws1'), { rows: 1 });
  });

  test('rollback removes a state that did not exist before', async () => {
    const { journal, stateManager, moduleStates } = setup();
    journal.touchInstance('ws1');
    stateManager.setModuleState('ws1', { rows: 2 });
    await journal.rollback();
    assertEqual(moduleStates.has('ws1'), false);
  });

  test('rollback removes added instance', async () => {
    const { journal, state, stateManager, calls, moduleStates } = setup();
    const before = structuredClone(state.phases);
    journal.touchStructure();
    state.phases.data.push({ instanceId: 'ws2', moduleId: 'worksheet', order: 1 });
    journal.noteAdded('ws2');
    // Das neue Blatt wird danach beschrieben: es verschwindet trotzdem ganz.
    journal.touchInstance('ws2');
    stateManager.setModuleState('ws2', { rows: 5 });
    await journal.rollback();
    assertDeepEqual(calls, [['remove', 'ws2']]);
    assertEqual(moduleStates.has('ws2'), false);
    assertDeepEqual(state.phases, before);
  });

  test('rollback restores removed instance with same id', async () => {
    const { journal, state, host, calls, moduleStates } = setup({ states: { fw1: { why: ['a'] } } });
    const before = structuredClone(state.phases);
    journal.touchStructure();
    journal.noteRemoved({ instanceId: 'fw1', module: 'five-why', phase: 'define', state: { why: ['a'] } });
    await host.removeInstance('fw1');
    calls.length = 0;
    await journal.rollback();
    assertDeepEqual(calls, [['restore', 'fw1']]);
    assertDeepEqual(moduleStates.get('fw1'), { why: ['a'] });
    // Derselbe Eintrag an derselben Stelle, Name inklusive.
    assertDeepEqual(state.phases, before);
  });

  test('rollback applies live state to mounted legacy instance', async () => {
    // Das lebende Model ist schon weiter als der gespeicherte Stand (der
    // persist-Weg hängt hinterher): settle legt es ab, dann geht der alte
    // Stand in Speicher UND lebendes Model.
    const { journal, moduleStates, calls } = setup({
      states: { ws1: { rows: 1 } }, mounted: ['ws1'], liveStates: { ws1: { rows: 2 } },
    });
    journal.touchInstance('ws1');
    await journal.rollback();
    assertDeepEqual(calls, [['settle', 'ws1'], ['live', 'ws1', { rows: 1 }]]);
    assertDeepEqual(moduleStates.get('ws1'), { rows: 1 });
  });

  test('an unchanged touched instance is left alone', async () => {
    // Ein abgelehnter Aufruf ändert nichts: kein Neuladen des lebenden
    // Models, der Verlauf der Instanz bleibt.
    const { journal, calls } = setup({ states: { ws1: { rows: 1 } }, mounted: ['ws1'] });
    journal.touchInstance('ws1');
    await journal.rollback();
    assertDeepEqual(calls, [['settle', 'ws1']]);
  });

  test('rollback restores phases', async () => {
    const { journal, state } = setup();
    const before = structuredClone(state.phases);
    journal.touchStructure();
    state.phases.define[0].customName = 'Anders';
    state.phases.data = [];
    journal.touchStructure();
    await journal.rollback();
    assertDeepEqual(state.phases, before);
  });

  test('an untouched journal changes nothing', async () => {
    const { journal, state, calls, moduleStates } = setup({ states: { ws1: { rows: 1 } } });
    const before = structuredClone(state.phases);
    await journal.rollback();
    assertDeepEqual(state.phases, before);
    assertDeepEqual(calls, []);
    assertDeepEqual(moduleStates.get('ws1'), { rows: 1 });
  });

  test('added then removed in one stack: rolled back in reverse order', async () => {
    const { journal, state, calls } = setup();
    const before = structuredClone(state.phases);
    journal.touchStructure();
    state.phases.data.push({ instanceId: 'ws2', moduleId: 'worksheet', order: 1 });
    journal.noteAdded('ws2');
    journal.noteRemoved({ instanceId: 'ws2', module: 'worksheet', phase: 'data', state: null });
    state.phases.data.pop();
    await journal.rollback();
    assertDeepEqual(calls.map(([kind]) => kind), ['restore', 'remove']);
    assertDeepEqual(state.phases, before);
  });
});
