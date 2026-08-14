/**
 * Tests for core/scenario-loader.js
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { loadScenario, describeScenario, countScenarioWorksheets } from '../../js/core/scenario-loader.js';

const EXAMPLES = {
  'ex-sipoc': { id: 'ex-sipoc', modules: ['sipoc'], title: { de: 'SIPOC', en: 'SIPOC' } },
  'ex-reg':   { id: 'ex-reg',   modules: ['regression'], title: { de: 'Reg', en: 'Reg' } },
  'ex-corr':  { id: 'ex-corr',  modules: ['correlation'], title: { de: 'Corr', en: 'Corr' } },
  'ex-multi': { id: 'ex-multi', modules: ['process-capability', 'histogram'], title: { de: 'M', en: 'M' } },
};

function makeDeps({ failOn = null } = {}) {
  const created = [];
  const mounted = [];
  const events = [];
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
      return {
        loadExample: async () => {
          if (failOn && moduleId === failOn) throw new Error('load failed');
        },
      };
    },
    disposeDetached: async () => {},
  };
  return {
    created, mounted, events,
    deps: {
      examplesRegistry,
      moduleRegistry: { get: (id) => ({ id, phase: 'define' }) },
      stateManager: {
        get: () => [],
        getModuleInstance: () => null,
      },
      eventBus: { emit: (name, payload) => events.push({ name, payload }) },
      workspace,
      __createInstance: (moduleId) => {
        const instanceId = `inst-${created.length + 1}`;
        created.push({ instanceId, moduleId });
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
    const { deps } = makeDeps({ failOn: 'regression' });
    const result = await loadScenario({
      ...deps,
      scenario: { id: 's', items: ['ex-reg', 'ex-sipoc'] },
    });
    assertDeepEqual(result.loaded, ['ex-sipoc']);
    assertEqual(result.failed.length, 1);
    assertEqual(result.failed[0].exampleId, 'ex-reg');
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

  test('overwrites the active instance instead of creating a new one', async () => {
    const { deps, created, mounted } = makeDeps();
    await loadScenario({
      ...deps,
      scenario: { id: 's', items: ['ex-sipoc'] },
      activeInstanceId: 'active-1',
      activeModuleId: 'sipoc',
    });
    assertEqual(created.length, 0, 'no new instance for the active module');
    assertEqual(mounted[0].instanceId, 'active-1');
  });

  test('counts distinct worksheets', async () => {
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
  test('reports overwrite target and new module count', () => {
    const info = describeScenario({
      scenario: { id: 's', items: ['ex-sipoc', 'ex-reg', 'ex-corr'] },
      examplesRegistry: { get: (id) => EXAMPLES[id] },
      activeModuleId: 'sipoc',
    });
    assertEqual(info.total, 3);
    assertEqual(info.overwritesModuleId, 'sipoc');
    assertEqual(info.newCount, 2);
  });

  test('reports no overwrite when the active module is not part of it', () => {
    const info = describeScenario({
      scenario: { id: 's', items: ['ex-reg'] },
      examplesRegistry: { get: (id) => EXAMPLES[id] },
      activeModuleId: 'fmea',
    });
    assertEqual(info.overwritesModuleId, null);
    assertEqual(info.newCount, 1);
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
