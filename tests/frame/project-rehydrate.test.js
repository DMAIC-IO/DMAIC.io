/**
 * Tests for frame/project-rehydrate.js
 */
import { suite, test, assertEqual, assertDeepEqual } from '../test-utils.js';
import { rehydrateProject } from '../../js/frame/project-rehydrate.js';

function makeDeps(cycleId = 'dmaic') {
  const calls = [];
  const emitted = [];
  return {
    calls,
    emitted,
    deps: {
      stateManager: {
        getActiveProjectId: () => 'p-1',
        getProjectCycle: () => cycleId,
      },
      eventBus: { emit: (name, payload) => { calls.push(`emit:${name}`); emitted.push({ name, payload }); } },
      moduleRegistry: { setActiveCycle: () => { calls.push('setActiveCycle'); } },
      dmaicTiles: { rebuild: () => { calls.push('rebuild'); } },
      workspace: { reset: async () => { calls.push('reset'); } },
      router: { navigate: async (route, opts) => { calls.push('navigate'); calls.push(JSON.stringify({ route, opts })); } },
    },
  };
}

suite('rehydrateProject', () => {
  test('resets the workspace before rebuilding the tiles', async () => {
    const { deps, calls } = makeDeps();
    await rehydrateProject(deps);
    assertEqual(calls.indexOf('reset') < calls.indexOf('rebuild'), true);
  });

  test('emits project:rehydrated with the active project id', async () => {
    const { deps, emitted } = makeDeps();
    await rehydrateProject(deps);
    const evt = emitted.find(e => e.name === 'project:rehydrated');
    assertDeepEqual(evt.payload, { projectId: 'p-1' });
  });

  test('navigates to the first phase of the active cycle with replace', async () => {
    const { deps, calls } = makeDeps('dmaic');
    await rehydrateProject(deps);
    const payload = JSON.parse(calls[calls.length - 1]);
    assertEqual(payload.route.kind, 'phase');
    assertEqual(payload.route.projectId, 'p-1');
    assertEqual(typeof payload.route.phaseId, 'string');
    assertDeepEqual(payload.opts, { replace: true });
  });

  test('navigation happens after the rehydrate event', async () => {
    const { deps, calls } = makeDeps();
    await rehydrateProject(deps);
    assertEqual(calls.indexOf('emit:project:rehydrated') < calls.indexOf('navigate'), true);
  });

  test('navigate:false skips the router but still resets, rebuilds and emits', async () => {
    const { deps, calls, emitted } = makeDeps();
    await rehydrateProject(deps, { navigate: false });
    assertEqual(calls.includes('reset'), true);
    assertEqual(calls.includes('rebuild'), true);
    assertEqual(calls.includes('navigate'), false);
    const evt = emitted.find(e => e.name === 'project:rehydrated');
    assertDeepEqual(evt.payload, { projectId: 'p-1' });
  });
});
