// app/dev/tests/core/workspace-detached.test.js
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { Workspace } from '../../js/ui/workspace.js';

function makeWorkspace(instantiateImpl) {
  const container = document.createElement('div');
  const moduleRegistry = { instantiate: instantiateImpl };
  const deps = {
    moduleRegistry,
    eventBus: { on: () => {}, emit: () => {} },
    stateManager: { get: () => ({}), getActiveProjectId: () => 'p1' },
    i18n: { t: (k) => k, getLanguage: () => 'de' },
    modal: () => {},
    notify: () => {},
    chartManager: {},
    examples: {},
  };
  return new Workspace(container, deps);
}

suite('ui/workspace detached lifecycle', () => {
  test('instantiateDetached returns the instance without touching the maps', async () => {
    const sentinel = { id: 'sipoc', loadExample: async () => {} };
    let mountedContainer = null;
    const ws = makeWorkspace(async (moduleId, containerEl) => {
      mountedContainer = containerEl;
      return sentinel;
    });

    const instance = await ws.instantiateDetached('inst-1', 'sipoc');

    assertEqual(instance, sentinel);
    // Detached: never registered in the live maps.
    assertTrue(!ws._instances.has('inst-1'));
    assertTrue(!ws._containers.has('inst-1'));
    // Container was created but never attached to the document.
    assertTrue(mountedContainer instanceof HTMLElement);
    assertTrue(mountedContainer.parentNode === null);
  });

  test('instantiateDetached returns null when instantiate throws', async () => {
    const ws = makeWorkspace(async () => { throw new Error('load failed'); });
    const instance = await ws.instantiateDetached('inst-2', 'broken');
    assertEqual(instance, null);
  });

  test('disposeDetached calls destroy and swallows errors', async () => {
    const ws = makeWorkspace(async () => ({}));
    let destroyed = 0;
    await ws.disposeDetached('inst-3', { destroy: async () => { destroyed++; } });
    assertEqual(destroyed, 1);
    // Null instance and throwing destroy must not reject.
    await ws.disposeDetached('inst-4', null);
    await ws.disposeDetached('inst-5', { destroy: () => { throw new Error('x'); } });
    assertTrue(true);
  });
});
