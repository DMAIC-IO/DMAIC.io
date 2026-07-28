// app/dev/tests/core/dev-tools-seeder.test.js
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { seedAllModules } from '../../js/core/dev-tools-seeder.js';

/** Minimal stateManager backing `phases` (mirrors instance-ops.test.js). */
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

function fakeRegistry(defs, cycle = 'dmaic') {
  return { getAll: () => defs, getActiveCycle: () => cycle };
}

function fakeExamples(map) {
  return {
    getForModule: (id) => map[id] || [],
    load: async (exId) => ({ meta: { id: exId }, data: { exId } }),
  };
}

/** Records calls; returns a per-call instance (default: no-op loadExample). */
function fakeWorkspace({ instanceFor } = {}) {
  const calls = { instantiate: [], dispose: [] };
  return {
    calls,
    async instantiateDetached(instanceId, moduleId) {
      calls.instantiate.push({ instanceId, moduleId });
      return instanceFor ? instanceFor(moduleId) : { loadExample: async () => {} };
    },
    async disposeDetached(instanceId, instance) {
      calls.dispose.push({ instanceId, instance });
    },
  };
}

const eventBus = { emit: () => {} };

suite('core/dev-tools-seeder', () => {
  test('idempotent: module with an existing instance is skipped', async () => {
    const sm = fakeState({ define: [{ instanceId: 'x', moduleId: 'sipoc' }] });
    const reg = fakeRegistry([{ id: 'sipoc', phase: 'define', cycles: { dmaic: { phase: 'define' } } }]);
    const ws = fakeWorkspace();

    const res = await seedAllModules({
      moduleRegistry: reg, examplesRegistry: fakeExamples({}), stateManager: sm, eventBus, workspace: ws,
    });

    assertEqual(res.skipped.length, 1);
    assertEqual(res.skipped[0], 'sipoc');
    assertEqual(res.added.length, 0);
    assertEqual(ws.calls.instantiate.length, 0);          // no detached mount
    assertEqual(sm.get('phases.define').length, 1);        // no second instance
  });

  test('no example: module added but never instantiated/loaded', async () => {
    const sm = fakeState({ define: [] });
    const reg = fakeRegistry([{ id: 'sipoc', phase: 'define', cycles: { dmaic: { phase: 'define' } } }]);
    const ws = fakeWorkspace();

    const res = await seedAllModules({
      moduleRegistry: reg, examplesRegistry: fakeExamples({}), stateManager: sm, eventBus, workspace: ws,
    });

    assertEqual(res.added.length, 1);
    assertEqual(res.added[0], 'sipoc');
    assertEqual(res.examplesLoaded.length, 0);
    assertEqual(ws.calls.instantiate.length, 0);
    assertEqual(sm.get('phases.define').length, 1);
  });

  test('with example: first example loaded once, then disposed', async () => {
    const sm = fakeState({ measure: [] });
    const reg = fakeRegistry([{ id: 'cpk', phase: 'measure', cycles: { dmaic: { phase: 'measure' } } }]);
    const loaded = [];
    const instance = { loadExample: async (p) => { loaded.push(p); } };
    const ws = fakeWorkspace({ instanceFor: () => instance });
    // Two catalog examples for cpk — only the FIRST must be used.
    const examples = fakeExamples({ cpk: [{ id: 'ex1' }, { id: 'ex2' }] });

    const res = await seedAllModules({
      moduleRegistry: reg, examplesRegistry: examples, stateManager: sm, eventBus, workspace: ws,
    });

    assertEqual(res.added[0], 'cpk');
    assertEqual(res.examplesLoaded.length, 1);
    assertEqual(res.examplesLoaded[0], 'cpk');
    assertEqual(loaded.length, 1);
    assertEqual(loaded[0].meta.id, 'ex1');                 // first example, not ex2
    assertEqual(ws.calls.instantiate.length, 1);
    assertEqual(ws.calls.dispose.length, 1);               // disposed after load
  });

  test('loadExample failure: run continues and still disposes', async () => {
    const sm = fakeState({ measure: [] });
    const reg = fakeRegistry([
      { id: 'cpk', phase: 'measure', cycles: { dmaic: { phase: 'measure' } } },
      { id: 'ppk', phase: 'measure', cycles: { dmaic: { phase: 'measure' } } },
    ]);
    const ws = fakeWorkspace({
      instanceFor: (moduleId) => moduleId === 'cpk'
        ? { loadExample: async () => { throw new Error('boom'); } }
        : { loadExample: async () => {} },
    });
    const examples = fakeExamples({ cpk: [{ id: 'a' }], ppk: [{ id: 'b' }] });

    const res = await seedAllModules({
      moduleRegistry: reg, examplesRegistry: examples, stateManager: sm, eventBus, workspace: ws,
    });

    assertTrue(res.added.includes('cpk') && res.added.includes('ppk'));
    assertEqual(res.examplesLoaded.length, 1);             // only ppk succeeded
    assertEqual(res.examplesLoaded[0], 'ppk');
    assertEqual(ws.calls.dispose.length, 2);               // both disposed (finally)
  });
});
