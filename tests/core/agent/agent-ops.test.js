/**
 * Tests for core/agent/agent-ops.js — direct coverage of the runtime
 * defences that Ruling R7a keeps even though Stufe 6 of the validator
 * (agent-validate.js) now intercepts the same cases first on the normal
 * `interact()` path. Without a test calling `createOps` directly, these two
 * branches (`module.add`, `module.remove` against `host.isCompleted()`)
 * would be asserted nowhere and could be deleted without a single red test —
 * see Task 11 review item 2.
 */
import { suite, test, assertEqual } from '../../test-utils.js';
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
