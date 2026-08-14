/**
 * Tests for core/scenario-loader.js
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { loadScenario, describeScenario, countScenarioWorksheets } from '../../js/core/scenario-loader.js';
import { provisionWorksheet } from '../../js/core/examples-registry.js';

const EXAMPLES = {
  'ex-sipoc': { id: 'ex-sipoc', modules: ['sipoc'], title: { de: 'SIPOC', en: 'SIPOC' } },
  'ex-reg':   { id: 'ex-reg',   modules: ['regression'], title: { de: 'Reg', en: 'Reg' } },
  'ex-corr':  { id: 'ex-corr',  modules: ['correlation'], title: { de: 'Corr', en: 'Corr' } },
  'ex-multi': { id: 'ex-multi', modules: ['process-capability', 'histogram'], title: { de: 'M', en: 'M' } },
};

/** Minimal worksheet state accepted by provisionWorksheet(). */
const WS_STATE = { sheets: [{ id: 'sheet-1', name: 'Shared', state: {} }], activeSheetId: 'sheet-1' };

/**
 * Builds fakes for loadScenario(). The workspace's `loadExample` genuinely
 * calls the real `provisionWorksheet` (against a real phases-shaped
 * stateManager) whenever the payload carries a `worksheetKey` — a double that
 * merely records calls without exercising the pool would make the dedup
 * tests pass regardless of whether the implementation is correct.
 *
 * @param {object} [opts]
 * @param {string|null} [opts.failOn] moduleId whose loadExample throws
 * @param {string|null} [opts.mountFailOn] moduleId whose instantiateDetached
 *   resolves to null (mirrors workspace.js swallowing a mount error)
 * @param {string|null} [opts.noLoadExampleOn] moduleId whose mounted
 *   instance has no `loadExample` function
 */
function makeDeps({ failOn = null, mountFailOn = null, noLoadExampleOn = null } = {}) {
  const created = [];
  const mounted = [];
  const disposed = [];
  const events = [];
  const phases = {};
  const moduleStates = {};

  const stateManager = {
    get: (key) => {
      if (key === 'phases') return phases;
      const m = /^phases\.(.+)$/.exec(key);
      return m ? (phases[m[1]] ?? []) : undefined;
    },
    set: (key, val) => {
      const m = /^phases\.(.+)$/.exec(key);
      if (m) phases[m[1]] = val;
    },
    setModuleState: (instanceId, state) => { moduleStates[instanceId] = state; },
    removeModuleState: (instanceId) => { delete moduleStates[instanceId]; },
    getModuleInstance: () => null,
  };
  const eventBus = { emit: (name, payload) => events.push({ name, payload }) };

  const examplesRegistry = {
    get: (id) => EXAMPLES[id],
    load: async (id) => ({
      meta: EXAMPLES[id],
      data: {},
      worksheetKey: (id === 'ex-reg' || id === 'ex-corr') ? 'worksheets/shared.json' : null,
    }),
  };

  const workspace = {
    instantiateDetached: async (instanceId, moduleId, extraContext) => {
      mounted.push({ instanceId, moduleId, extraContext });
      if (mountFailOn && moduleId === mountFailOn) return null;
      if (noLoadExampleOn && moduleId === noLoadExampleOn) return {};
      const ctx = { stateManager, eventBus, ...extraContext };
      return {
        loadExample: async (payload) => {
          if (failOn && moduleId === failOn) throw new Error('load failed');
          // Real dedup mechanism: only a module that actually loads a
          // worksheet-backed example provisions one.
          if (payload.worksheetKey) provisionWorksheet(ctx, WS_STATE);
        },
      };
    },
    disposeDetached: async (instanceId, instance) => { disposed.push({ instanceId, instance }); },
  };

  return {
    created, mounted, disposed, events, phases,
    deps: {
      examplesRegistry,
      moduleRegistry: { get: (id) => ({ id, phase: 'define' }) },
      stateManager,
      eventBus,
      workspace,
      // Seam for tests, mirroring createInstance's real side effect (pushing
      // into `phases`) so orphan-removal on failure can be observed.
      __createInstance: (moduleId) => {
        const instanceId = `inst-${created.length + 1}`;
        created.push({ instanceId, moduleId });
        const list = phases.define ?? (phases.define = []);
        list.push({ instanceId, moduleId, order: list.length, state: {} });
        return instanceId;
      },
    },
  };
}

suite('loadScenario', () => {
  test('loads every item in order', async () => {
    const { deps, mounted } = makeDeps();
    const result = await loadScenario({
      ...deps,
      scenario: { id: 's', items: ['ex-sipoc', 'ex-reg'] },
    });
    assertDeepEqual(result.loaded, ['ex-sipoc', 'ex-reg']);
    assertDeepEqual(mounted.map(m => m.moduleId), ['sipoc', 'regression']);
  });

  test('resolves the #module suffix', async () => {
    const { deps, mounted } = makeDeps();
    await loadScenario({ ...deps, scenario: { id: 's', items: ['ex-multi#histogram'] } });
    assertEqual(mounted[0].moduleId, 'histogram');
  });

  test('falls back to the first module without a suffix', async () => {
    const { deps, mounted } = makeDeps();
    await loadScenario({ ...deps, scenario: { id: 's', items: ['ex-multi'] } });
    assertEqual(mounted[0].moduleId, 'process-capability');
  });

  test('shares one worksheet pool across items', async () => {
    const { deps, mounted } = makeDeps();
    await loadScenario({ ...deps, scenario: { id: 's', items: ['ex-reg', 'ex-corr'] } });
    assertTrue(mounted[0].extraContext.worksheetPool === mounted[1].extraContext.worksheetPool,
      'same pool instance');
    assertEqual(mounted[0].extraContext.worksheetKey, 'worksheets/shared.json');
    assertEqual(mounted[1].extraContext.worksheetKey, 'worksheets/shared.json');
  });

  test('a failing item does not abort the run', async () => {
    const { deps, phases } = makeDeps({ failOn: 'regression' });
    const result = await loadScenario({
      ...deps,
      scenario: { id: 's', items: ['ex-reg', 'ex-sipoc'] },
    });
    assertDeepEqual(result.loaded, ['ex-sipoc']);
    assertEqual(result.failed.length, 1);
    assertEqual(result.failed[0].exampleId, 'ex-reg');
    assertEqual(result.failed[0].moduleId, 'regression');
    assertEqual(result.failed[0].error, 'load failed');
    assertEqual(
      (phases.define || []).filter(i => i.moduleId === 'regression').length, 0,
      'no orphan instance left behind for the failed item',
    );
  });

  test('a mount failure is reported distinctly and leaves no orphan', async () => {
    const { deps, phases } = makeDeps({ mountFailOn: 'regression' });
    const result = await loadScenario({
      ...deps,
      scenario: { id: 's', items: ['ex-reg', 'ex-sipoc'] },
    });
    assertDeepEqual(result.loaded, ['ex-sipoc']);
    assertEqual(result.failed.length, 1);
    assertEqual(result.failed[0].exampleId, 'ex-reg');
    assertEqual(result.failed[0].moduleId, 'regression');
    assertEqual(result.failed[0].error, 'module failed to mount');
    assertEqual(
      (phases.define || []).filter(i => i.moduleId === 'regression').length, 0,
      'no orphan instance left behind for the failed mount',
    );
  });

  test('a mount failure does not inflate the worksheet count', async () => {
    // ex-reg carries a worksheetKey but fails to mount — its worksheet is
    // never actually provisioned, so it must not be counted.
    const { deps } = makeDeps({ mountFailOn: 'regression' });
    const result = await loadScenario({ ...deps, scenario: { id: 's', items: ['ex-reg'] } });
    assertEqual(result.worksheets, 0);
  });

  test('a module without loadExample is reported distinctly from a mount failure', async () => {
    const { deps } = makeDeps({ noLoadExampleOn: 'sipoc' });
    const result = await loadScenario({ ...deps, scenario: { id: 's', items: ['ex-sipoc'] } });
    assertEqual(result.failed.length, 1);
    assertEqual(result.failed[0].moduleId, 'sipoc');
    assertEqual(result.failed[0].error, 'module has no loadExample');
  });

  test('a failure never deletes a pre-existing instance of the same module', async () => {
    const { deps, phases } = makeDeps({ failOn: 'sipoc' });
    phases.define = [{ instanceId: 'active-1', moduleId: 'sipoc', order: 0, state: {} }];
    const result = await loadScenario({ ...deps, scenario: { id: 's', items: ['ex-sipoc'] } });
    assertEqual(result.failed.length, 1);
    assertEqual(phases.define.length, 1, 'only the loader\'s own instance is rolled back');
    assertEqual(phases.define[0].instanceId, 'active-1');
  });

  test('disposes every mounted instance, including after loadExample throws', async () => {
    const { deps, mounted, disposed } = makeDeps({ failOn: 'regression' });
    await loadScenario({ ...deps, scenario: { id: 's', items: ['ex-reg', 'ex-sipoc'] } });
    assertEqual(disposed.length, mounted.length, 'every mounted instance was disposed');
    assertDeepEqual(disposed.map(d => d.instanceId), mounted.map(m => m.instanceId));
  });

  test('does not dispose an instance that failed to mount', async () => {
    const { deps, mounted, disposed } = makeDeps({ mountFailOn: 'regression' });
    await loadScenario({ ...deps, scenario: { id: 's', items: ['ex-reg', 'ex-sipoc'] } });
    // Only the sipoc mount succeeded — nothing to dispose for the failed regression mount.
    assertEqual(mounted.length, 2);
    assertEqual(disposed.length, 1);
    assertEqual(disposed[0].instanceId, mounted[1].instanceId);
  });

  test('emits progress for every item', async () => {
    const { deps, events } = makeDeps();
    await loadScenario({ ...deps, scenario: { id: 's', items: ['ex-sipoc', 'ex-reg'] } });
    const progress = events.filter(e => e.name === 'scenario:progress');
    assertEqual(progress.length, 2);
    assertEqual(progress[0].payload.index, 1);
    assertEqual(progress[0].payload.total, 2);
    assertEqual(progress[1].payload.exampleId, 'ex-reg');
  });

  test('never mounts detached onto a live instance id', async () => {
    // Regression guard for the scenario-overwrite bug: a detached mount that
    // reuses a MOUNTED instance's id re-registers that instance's Alpine.data
    // factory and has its freshly loaded state clobbered by
    // Workspace._persistAllModuleStates() on the next phase/tab switch.
    // Every item must therefore get a brand-new instance id.
    const { deps, created, mounted, phases } = makeDeps();
    phases.define = [{ instanceId: 'active-1', moduleId: 'sipoc', order: 0, state: {} }];
    await loadScenario({ ...deps, scenario: { id: 's', items: ['ex-sipoc'] } });
    assertEqual(created.length, 1, 'a fresh instance was created');
    assertTrue(mounted[0].instanceId !== 'active-1', 'never mounts onto the live instance id');
    assertEqual(mounted[0].instanceId, created[0].instanceId);
  });

  test('counts distinct worksheets actually provisioned', async () => {
    const { deps } = makeDeps();
    const result = await loadScenario({
      ...deps,
      scenario: { id: 's', items: ['ex-reg', 'ex-corr', 'ex-sipoc'] },
    });
    assertEqual(result.worksheets, 1);
  });

  test('uses the real createInstance when no seam is injected', async () => {
    // Exercises the production default path (no __createInstance override):
    // scenario-loader must wire the real createInstance from instance-ops.js.
    const phases = { define: [] };
    const stateManager = {
      get: (key) => {
        if (key === 'phases') return phases;
        const m = /^phases\.(.+)$/.exec(key);
        return m ? phases[m[1]] : undefined;
      },
      set: (key, val) => {
        const m = /^phases\.(.+)$/.exec(key);
        if (m) phases[m[1]] = val;
      },
    };
    const moduleRegistry = {
      get: (id) => ({ id, phase: 'define', cycles: {} }),
      getActiveCycle: () => 'dmaic',
    };
    const events = [];
    const eventBus = { emit: (name, payload) => events.push({ name, payload }) };
    const mounted = [];
    const workspace = {
      instantiateDetached: async (instanceId, moduleId, extraContext) => {
        mounted.push({ instanceId, moduleId, extraContext });
        return { loadExample: async () => {} };
      },
      disposeDetached: async () => {},
    };
    const examplesRegistry = {
      get: (id) => EXAMPLES[id],
      load: async (id) => ({ meta: EXAMPLES[id], data: {}, worksheetKey: null }),
    };

    const result = await loadScenario({
      scenario: { id: 's', items: ['ex-sipoc'] },
      examplesRegistry, moduleRegistry, stateManager, eventBus, workspace,
    });

    assertDeepEqual(result.loaded, ['ex-sipoc']);
    assertEqual(phases.define.length, 1, 'real createInstance persisted an instance');
    assertEqual(phases.define[0].moduleId, 'sipoc');
    assertEqual(mounted[0].instanceId, phases.define[0].instanceId);
  });
});

suite('describeScenario', () => {
  test('every item counts as a newly created module', () => {
    const info = describeScenario({
      scenario: { id: 's', items: ['ex-sipoc', 'ex-reg', 'ex-corr'] },
    });
    assertEqual(info.total, 3);
    assertEqual(info.newCount, 3);
  });

  test('reports zero for a scenario without items', () => {
    const info = describeScenario({ scenario: { id: 's' } });
    assertEqual(info.total, 0);
    assertEqual(info.newCount, 0);
  });
});

suite('countScenarioWorksheets', () => {
  test('counts distinct worksheet keys', async () => {
    const { deps } = makeDeps();
    const n = await countScenarioWorksheets({
      scenario: { id: 's', items: ['ex-reg', 'ex-corr', 'ex-sipoc'] },
      examplesRegistry: deps.examplesRegistry,
    });
    assertEqual(n, 1);
  });

  test('returns zero when no item carries a worksheet', async () => {
    const { deps } = makeDeps();
    const n = await countScenarioWorksheets({
      scenario: { id: 's', items: ['ex-sipoc'] },
      examplesRegistry: deps.examplesRegistry,
    });
    assertEqual(n, 0);
  });
});
