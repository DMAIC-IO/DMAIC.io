/**
 * Tests for core/instance-handoff.js — eine Instanz eines anderen Moduls in
 * der Phase der aufrufenden Instanz anlegen.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { openInstance, findOwnPhase, openOrActivateInstance, revealInstance } from '../../js/core/instance-handoff.js';

/** StateManager- und EventBus-Attrappe, die Schreibzugriffe mitschreibt. */
function fakes(initial) {
  const phases = structuredClone(initial.phases);
  const log = { moduleState: [], emits: [] };
  const sm = {
    get(path) {
      if (path === 'phases') return phases;
      if (path.startsWith('phases.')) return phases[path.slice(7)];
      return undefined;
    },
    set(path, value) { phases[path.slice(7)] = value; },
    setModuleState(id, s) { log.moduleState.push([id, s]); },
  };
  const bus = { emit(evt, payload) { log.emits.push([evt, payload]); } };
  return { sm, bus, log };
}

suite('instance-handoff', () => {
  test('legt in der eigenen Phase an, schreibt Zustand, meldet module:added ohne silent', () => {
    const { sm, bus, log } = fakes({ phases: { analyze: [{ instanceId: 'me', moduleId: 'chart-suggestion' }] } });
    const out = openInstance({ stateManager: sm, eventBus: bus, instanceId: 'me' },
      { moduleId: 'histogram', state: { datasets: [] } });
    assertEqual(out.moduleId, 'histogram');
    assertDeepEqual(sm.get('phases.analyze')[1], { instanceId: out.instanceId, moduleId: 'histogram', order: 1, state: {} });
    assertDeepEqual(log.moduleState, [[out.instanceId, { datasets: [] }]]);
    assertDeepEqual(log.emits, [['module:added', { moduleId: 'histogram', phase: 'analyze', instanceId: out.instanceId }]]);
  });

  test('aufrufende Instanz in keiner Phase → data', () => {
    const { sm, bus, log } = fakes({ phases: { analyze: [{ instanceId: 'other', moduleId: 'x' }] } });
    assertEqual(findOwnPhase(sm, 'me'), 'data');
    const out = openInstance({ stateManager: sm, eventBus: bus, instanceId: 'me' },
      { moduleId: 'histogram', state: {} });
    assertEqual(log.emits[0][1].phase, 'data');
    assertEqual(sm.get('phases.data')[0].instanceId, out.instanceId);
    assertEqual(sm.get('phases.data')[0].order, 0);
  });
});

suite('instance-handoff: openOrActivateInstance (Übergabe an chart-suggestion)', () => {
  /** Dienste einer Arbeitsblatt-Instanz `ws` in der Phase `measure`. */
  function services(items) {
    const phases = { define: [{ instanceId: 'other', moduleId: 'chart-suggestion', order: 0 }], measure: items };
    const states = {};
    const events = [];
    return {
      phases, states, events,
      services: {
        instanceId: 'ws',
        stateManager: {
          get: (path) => (path === 'phases' ? phases : phases[path.slice('phases.'.length)]),
          set: (path, v) => { phases[path.slice('phases.'.length)] = v; },
          setModuleState: (id, st) => { states[id] = st; },
        },
        eventBus: { emit: (n, p) => events.push([n, p]) },
      },
    };
  }
  const selection = { sourceInstanceId: 'ws', sourceSheetId: 's1', ts: 1, columns: [] };
  const target = {
    moduleId: 'chart-suggestion',
    state: { selection, selectedChartType: null },
    loadEvent: { name: 'chart-suggestion:load', detail: { selection } },
  };

  test('neue Instanz über openInstance: in der eigenen Phase, Zustand gesetzt, module:added, dann das Ladeereignis', () => {
    const h = services([{ instanceId: 'ws', moduleId: 'worksheet', order: 0 }]);
    const id = openOrActivateInstance(h.services, target);
    assertEqual(h.phases.measure.length, 2);
    assertDeepEqual(h.phases.measure[1], { instanceId: id, moduleId: 'chart-suggestion', order: 1, state: {} });
    assertDeepEqual(h.states[id], { selection, selectedChartType: null });
    assertDeepEqual(h.events.map(([n]) => n), ['module:added', 'chart-suggestion:load']);
    assertDeepEqual(h.events[0][1], { moduleId: 'chart-suggestion', phase: 'measure', instanceId: id });
    assertDeepEqual(h.events[1][1], { instanceId: id, selection });
  });

  test('bestehende Instanz der eigenen Phase: Zustand gesetzt, Ladeereignis, module:activated', () => {
    const h = services([{ instanceId: 'ws', moduleId: 'worksheet', order: 0 }, { instanceId: 'cs', moduleId: 'chart-suggestion', order: 1 }]);
    assertEqual(openOrActivateInstance(h.services, target), 'cs');
    assertEqual(h.phases.measure.length, 2);
    assertDeepEqual(h.states.cs, { selection, selectedChartType: null });
    assertDeepEqual(h.events, [['chart-suggestion:load', { instanceId: 'cs', selection }], ['module:activated', { instanceId: 'cs' }]]);
  });

  test('ohne loadEvent: nur Zustand und Aktivieren', () => {
    const h = services([{ instanceId: 'ws', moduleId: 'worksheet', order: 0 }, { instanceId: 'cs', moduleId: 'chart-suggestion', order: 1 }]);
    openOrActivateInstance(h.services, { moduleId: 'chart-suggestion', state: { a: 1 } });
    assertDeepEqual(h.events, [['module:activated', { instanceId: 'cs' }]]);
  });
});

suite('instance-handoff: revealInstance (Senden durch den Nutzer holt das Ziel nach vorn)', () => {
  test('bekannte Instanz: module:activated, Ergebnis true', () => {
    const { sm, bus, log } = fakes({ phases: { measure: [{ instanceId: 'me', moduleId: 'random-generator' }, { instanceId: 'ws', moduleId: 'worksheet' }] } });
    assertEqual(revealInstance({ stateManager: sm, eventBus: bus }, 'ws'), true);
    assertDeepEqual(log.emits, [['module:activated', { instanceId: 'ws' }]]);
  });

  test('unbekannte oder fehlende Instanz: kein Ereignis, Ergebnis false', () => {
    const { sm, bus, log } = fakes({ phases: { measure: [{ instanceId: 'me', moduleId: 'random-generator' }] } });
    assertEqual(revealInstance({ stateManager: sm, eventBus: bus }, 'gone'), false);
    assertEqual(revealInstance({ stateManager: sm, eventBus: bus }, null), false);
    assertEqual(revealInstance({ stateManager: sm, eventBus: bus }, undefined), false);
    assertDeepEqual(log.emits, []);
  });
});
