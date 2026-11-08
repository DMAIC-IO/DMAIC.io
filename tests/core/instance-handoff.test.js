/**
 * Tests for core/instance-handoff.js — eine Instanz eines anderen Moduls in
 * der Phase der aufrufenden Instanz anlegen.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { openInstance, findOwnPhase } from '../../js/core/instance-handoff.js';

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
