/**
 * Tests for core/agent/agent-ops.js — direct coverage of the runtime
 * defences that Ruling R7a keeps even though Stufe 6 of the validator
 * (agent-validate.js) now intercepts the same cases first on the normal
 * `interact()` path. Without a test calling `createOps` directly, these two
 * branches (`module.add`, `module.remove` against `host.isCompleted()`)
 * would be asserted nowhere and could be deleted without a single red test —
 * see Task 11 review item 2.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { createOps } from '../../../js/core/agent/agent-ops.js';

const DEFS = [
  { id: 'five-why', phase: 'define', cycles: { dmaic: { phase: 'define' } } },
];

const REGISTRY = {
  'five-why': { tagged: false, available: false, violations: [], actions: {}, fields: {} },
};

const I18N = {
  getLanguage: () => 'de',
  exists: () => false,
  t: (key, params) => (params ? `${key}|${Object.values(params).join(',')}` : key),
};

/** A host whose `isCompleted()` is fixed; every write port throws if called —
 * the runtime defence must return BEFORE any of them run. */
function makeDeps({ completed }) {
  const phases = { define: [{ instanceId: 'fw-1', moduleId: 'five-why', order: 0 }] };
  return {
    stateManager: {
      get: (path) => (path === 'phases' ? phases : path.startsWith('phases.') ? phases[path.slice(7)] : undefined),
    },
    moduleRegistry: {
      getAll: () => DEFS,
      get: (id) => DEFS.find(d => d.id === id),
      getActiveCycle: () => 'dmaic',
    },
    i18n: I18N,
    registry: REGISTRY,
    getHelp: async () => null,
    appVersion: '1.2.3',
    host: {
      isCompleted: () => completed,
      addInstance: async () => { throw new Error('must not be called in a completed project'); },
      removeInstance: async () => { throw new Error('must not be called in a completed project'); },
      openInstance: async () => { throw new Error('not used by this suite'); },
      getViewmodel: async () => { throw new Error('not used by this suite'); },
      getCurrentView: () => null,
    },
  };
}

suite('agent ops — runtime defence for a completed project (Ruling R7a)', () => {
  test('module.add reports project_completed and never calls host.addInstance', async () => {
    const ops = createOps(makeDeps({ completed: true }));
    const out = await ops['module.add']({ module: 'five-why' });
    assertEqual(out.ok, false);
    assertEqual(out.error, 'project_completed');
  });

  test('module.remove reports project_completed and never calls host.removeInstance', async () => {
    const ops = createOps(makeDeps({ completed: true }));
    const out = await ops['module.remove']({ instance: 'fw-1' });
    assertEqual(out.ok, false);
    assertEqual(out.error, 'project_completed');
  });

  // Control: the same op succeeds when the project is NOT completed —
  // otherwise the two tests above could pass against an `isCompleted` that
  // is never even read.
  test('control: module.add succeeds in a project that is not completed', async () => {
    const deps = makeDeps({ completed: false });
    deps.host.addInstance = async (moduleId, phase) =>
      ({ instanceId: `${moduleId}-new`, module: moduleId, phase: phase ?? 'define' });
    const ops = createOps(deps);
    const out = await ops['module.add']({ module: 'five-why' });
    assertEqual(out.error, undefined, JSON.stringify(out));
    assertEqual(out.module, 'five-why');
  });
});

suite('agent ops — Teil-Viewmodels (Spec 2026-10-24 E3)', () => {
  class Draft {
    constructor() { this.calls = []; this.inner = { go() {} }; }
    addQuestion(text) { this.calls.push(text); return this; }
    questionClass() { return {}; }
    _private() {}
  }
  const registry = {
    'survey-builder': {
      available: true, violations: [], fields: {},
      actions: {
        read: { params: [] },
        'draft.addQuestion': { params: [{ name: 'text' }] },
        'draft.gone': { params: [] },
        'draft.inner.go': { params: [] },
      },
    },
  };
  function depsWith(viewmodel) {
    const base = makeDeps({ completed: false });
    const phases = { define: [{ instanceId: 'sb-1', moduleId: 'survey-builder', order: 0 }] };
    return {
      ...base,
      registry,
      stateManager: { get: (path) => (path === 'phases' ? phases : path.startsWith('phases.') ? phases[path.slice(7)] : undefined) },
      host: { ...base.host, getViewmodel: async () => viewmodel },
    };
  }
  const call = (vm, method, args = []) => createOps(depsWith(vm))['instance.call']({ instance: 'sb-1', method, args });

  test('a dotted method runs on the sub-viewmodel, with this bound to it', async () => {
    const vm = { model: {}, draft: new Draft() };
    const out = await call(vm, 'draft.addQuestion', ['Q1']);
    assertTrue(out.value === vm.draft, JSON.stringify(out));
    assertDeepEqual(vm.draft.calls, ['Q1']);
  });

  test('a dotted name outside the catalog is refused with the catalog actions', async () => {
    const out = await call({ model: {}, draft: new Draft() }, 'draft.questionClass');
    assertEqual(out.error, 'unknown_method');
    assertDeepEqual(out.available, ['draft.addQuestion', 'draft.gone', 'draft.inner.go', 'read']);
  });

  test('a catalog action the live sub-viewmodel lacks lists its prefixed methods', async () => {
    const out = await call({ model: {}, draft: new Draft() }, 'draft.gone');
    assertEqual(out.error, 'unknown_method');
    assertDeepEqual(out.available, ['draft.addQuestion', 'draft.questionClass']);
  });

  test('inherited Object.prototype names are refused as unknown_method with the catalog actions', async () => {
    for (const name of ['constructor', 'valueOf']) {
      const out = await call({ model: {}, draft: new Draft() }, name);
      assertEqual(out.error, 'unknown_method', name);
      assertDeepEqual(out.available, ['draft.addQuestion', 'draft.gone', 'draft.inner.go', 'read'], name);
    }
  });

  test('only one level: draft.inner.go is not resolved', async () => {
    const out = await call({ model: {}, draft: new Draft() }, 'draft.inner.go');
    assertEqual(out.error, 'unknown_method');
  });
});
