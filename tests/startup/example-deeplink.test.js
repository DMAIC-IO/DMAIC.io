/**
 * Tests for js/startup/example-deeplink.js
 */
import { suite, test, assertEqual, assertTrue, afterEach } from '../test-utils.js';
import exampleDeeplink from '../../js/startup/example-deeplink.js';

function setSearch(qs) {
  history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : '') + location.hash);
}

function makeStateManager(phases = {}) {
  const store = { phases };
  return {
    get: (path) => {
      if (path === 'phases') return store.phases;
      const m = /^phases\.(.+)$/.exec(path);
      if (m) return store.phases[m[1]];
      return undefined;
    },
    set: (path, val) => {
      const m = /^phases\.(.+)$/.exec(path);
      if (m) store.phases[m[1]] = val;
    },
    _store: store,
  };
}

function makeCtx(overrides = {}) {
  const emitted = [];
  const notified = [];
  return {
    emitted,
    notified,
    stateManager: makeStateManager(),
    eventBus: { emit: (ev, p) => emitted.push({ ev, p }), on() {}, off() {} },
    moduleRegistry: {
      get: (id) => ({ id, phase: 'measure', cycles: {} }),
      getActiveCycle: () => 'dmaic',
    },
    examplesRegistry: {
      load: async () => ({ data: {}, meta: {} }),
      get: (id) => ({ id, type: 'scenario', items: ['ex-a#histogram', 'ex-b#boxplot'] }),
    },
    workspace: { getActiveModuleInfo: () => null },
    notify: (msg, level) => notified.push({ msg, level }),
    i18n: { t: (k) => k },
    ...overrides,
  };
}

suite('startup/example-deeplink', () => {
  afterEach(() => { setSearch(''); });

  test('shouldRun is false with no module/example params', () => {
    setSearch('foo=bar');
    assertEqual(exampleDeeplink.shouldRun(makeCtx()), false);
  });

  test('shouldRun is true when module param present', () => {
    setSearch('module=process-capability');
    assertTrue(!!exampleDeeplink.shouldRun(makeCtx()));
  });

  test('shouldRun is true when example param present', () => {
    setSearch('example=foo');
    assertTrue(!!exampleDeeplink.shouldRun(makeCtx()));
  });

  test('run strips module/example params from URL but keeps others', () => {
    setSearch('module=process-capability&keep=1');
    exampleDeeplink.run(makeCtx());
    const params = new URLSearchParams(location.search);
    assertEqual(params.get('module'), null);
    assertEqual(params.get('keep'), '1');
  });

  test('run creates a new instance and emits module:added when none exists', () => {
    setSearch('module=process-capability');
    const ctx = makeCtx();
    exampleDeeplink.run(ctx);
    const added = ctx.emitted.find(e => e.ev === 'module:added');
    assertTrue(!!added);
    assertEqual(added.p.moduleId, 'process-capability');
    assertEqual(added.p.phase, 'measure');
  });

  test('run warns and bails on unknown module (no emit)', () => {
    setSearch('module=does-not-exist');
    const ctx = makeCtx({ moduleRegistry: { get: () => undefined, getActiveCycle: () => 'dmaic' } });
    exampleDeeplink.run(ctx);
    assertEqual(ctx.emitted.length, 0);
  });

  test('shouldRun is true when the scenario param is present', () => {
    setSearch('scenario=scenario-hubschrauber-full');
    assertTrue(!!exampleDeeplink.shouldRun(makeCtx()));
  });

  test('run strips the scenario param as well', () => {
    setSearch('scenario=scenario-hubschrauber-full&keep=1');
    exampleDeeplink.run(makeCtx());
    const params = new URLSearchParams(location.search);
    assertEqual(params.get('scenario'), null);
    assertEqual(params.get('keep'), '1');
  });

  test('scenario alone works — unlike example, it does not need a module', async () => {
    setSearch('scenario=scenario-hubschrauber-full');
    let asked = null;
    const ctx = makeCtx({
      __loadScenario: async ({ scenario }) => { asked = scenario; return { loaded: ['ex-a'], failed: [] }; },
    });
    exampleDeeplink.run(ctx);
    await new Promise((r) => setTimeout(r, 0));
    assertEqual(asked?.id, 'scenario-hubschrauber-full');
  });

  test('an unknown scenario id warns and loads nothing', async () => {
    setSearch('scenario=gibt-es-nicht');
    let called = false;
    const ctx = makeCtx({
      examplesRegistry: { load: async () => ({}), get: () => undefined },
      __loadScenario: async () => { called = true; return { loaded: [], failed: [] }; },
    });
    exampleDeeplink.run(ctx);
    await new Promise((r) => setTimeout(r, 0));
    assertEqual(called, false);
    assertTrue(ctx.notified.length > 0);
  });

  test('partial scenario-item failures notify the user, not just the console', async () => {
    setSearch('scenario=scenario-hubschrauber-full');
    const ctx = makeCtx({
      __loadScenario: async () => ({
        loaded: ['ex-a'],
        failed: [{ exampleId: 'ex-b', error: 'boom' }],
      }),
    });
    exampleDeeplink.run(ctx);
    await new Promise((r) => setTimeout(r, 0));
    assertTrue(ctx.notified.length > 0);
  });

  test('scenario wins over module when both are present', async () => {
    setSearch('scenario=scenario-hubschrauber-full&module=histogram');
    let asked = null;
    const ctx = makeCtx({
      __loadScenario: async ({ scenario }) => { asked = scenario; return { loaded: [], failed: [] }; },
    });
    exampleDeeplink.run(ctx);
    await new Promise((r) => setTimeout(r, 0));
    assertEqual(asked?.id, 'scenario-hubschrauber-full');
    assertEqual(ctx.emitted.some(e => e.ev === 'module:activated'), false);
  });
});
