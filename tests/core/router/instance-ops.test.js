// app/dev/tests/core/router/instance-ops.test.js
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import { findExistingInstance, findInstancePhase, createInstance } from '../../../js/core/router/instance-ops.js';

function fakeState(phases = {}) {
  return {
    _p: phases,
    get(key) {
      if (key === 'phases') return this._p;
      const m = /^phases\.(.+)$/.exec(key);
      return m ? this._p[m[1]] : undefined;
    },
    set(key, val) {
      const m = /^phases\.(.+)$/.exec(key);
      if (m) this._p[m[1]] = val;
    },
  };
}

suite('router/instance-ops', () => {
  test('findInstancePhase: locates phase holding instanceId', () => {
    const sm = fakeState({
      define: [{ instanceId: 'aaa', moduleId: 'sipoc' }],
      measure: [{ instanceId: 'bbb', moduleId: 'cpk' }],
    });
    assertEqual(findInstancePhase(sm, 'aaa'), 'define');
    assertEqual(findInstancePhase(sm, 'bbb'), 'measure');
    assertEqual(findInstancePhase(sm, 'zzz'), null);
  });

  test('findExistingInstance: finds first instance of moduleId', () => {
    const sm = fakeState({
      define: [],
      measure: [{ instanceId: 'bbb', moduleId: 'cpk' }],
    });
    const result = findExistingInstance(sm, 'cpk');
    assertEqual(result.instanceId, 'bbb');
    assertEqual(result.phaseId, 'measure');
  });

  test('findExistingInstance: returns null when not found', () => {
    const sm = fakeState({ define: [] });
    assertEqual(findExistingInstance(sm, 'nonexistent'), null);
  });

  test('createInstance: adds instance and emits module:added', () => {
    const sm = fakeState({ measure: [] });
    const emitted = [];
    const eventBus = { emit: (ev, p) => emitted.push({ ev, p }) };
    const moduleRegistry = { getActiveCycle: () => 'dmaic' };
    // Realistische Definition: die Vorgabephase kommt aus der Zyklus-
    // Zuordnung, nicht aus `def.phase` — so steht sie auch im Manifest.
    const def = { phase: 'measure', cycles: { dmaic: { phase: 'measure' } } };

    const id = createInstance(sm, moduleRegistry, eventBus, 'cpk', def);

    assertTrue(typeof id === 'string' && id.length > 0);
    const insts = sm.get('phases.measure');
    assertEqual(insts.length, 1);
    assertEqual(insts[0].moduleId, 'cpk');
    assertEqual(insts[0].instanceId, id);
    assertEqual(emitted.length, 1);
    assertEqual(emitted[0].ev, 'module:added');
    assertEqual(emitted[0].p.instanceId, id);
  });

  test('createInstance legt ein Modul ohne Zyklus-Zuordnung nach extras, nicht in seine Heimatphase', () => {
    // `triz-ifr` trägt `phase: 'improve'`, hat aber keine `cycles.dmaic`-
    // Zuordnung. Das Anlegemenü bietet es nur unter `extras` an; die alte
    // Ableitung legte es nach `improve` — ein Eimer, den kein Menü kennt.
    const state = fakeState();
    const registry = { getActiveCycle: () => 'dmaic' };
    const events = [];
    const bus = { emit: (name, payload) => events.push([name, payload]) };
    const def = { id: 'triz-ifr', phase: 'improve', cycles: undefined };

    createInstance(state, registry, bus, 'triz-ifr', def);

    assertEqual((state.get('phases.improve') ?? []).length, 0);
    assertEqual((state.get('phases.extras') ?? []).length, 1);
    assertEqual(events[0][1].phase, 'extras');
  });

  test('createInstance nimmt eine ausdrückliche Phase als Überschreiber', () => {
    const state = fakeState();
    const registry = { getActiveCycle: () => 'dmaic' };
    const bus = { emit: () => {} };
    const def = { id: 'ishikawa', phase: 'analyze',
                  cycles: { dmaic: { phase: 'analyze', allowedPhases: ['analyze', 'measure'] } } };

    createInstance(state, registry, bus, 'ishikawa', def, { phase: 'measure' });

    assertEqual((state.get('phases.measure') ?? []).length, 1);
  });
});
