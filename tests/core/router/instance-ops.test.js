// app/dev/tests/core/router/instance-ops.test.js
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import { findExistingInstance, findInstancePhase, createInstance } from '../../../js/core/router/instance-ops.js';

function fakeState(phases) {
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
    const def = { phase: 'measure', cycles: {} };

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
});
