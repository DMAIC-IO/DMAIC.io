/**
 * Tests for Workspace.reset() and instantiateDetached extraContext.
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { Workspace } from '../../js/ui/workspace.js';

function makeWorkspace() {
  const container = document.createElement('div');
  const eventBus = { on: () => {}, emit: () => {} };
  const stateManager = {
    get: () => [],
    getModuleState: () => ({}),
    setModuleState: () => {},
    isCompleted: () => false,
  };
  const i18n = { t: (k) => k, getLanguage: () => 'de' };
  const moduleRegistry = {
    instantiate: async (moduleId, el, context) => ({ moduleId, context, destroy() { this.destroyed = true; } }),
    get: () => ({ id: 'x' }),
  };
  const ws = new Workspace(container, {
    moduleRegistry, eventBus, stateManager, i18n,
    modal: () => {}, notify: () => {}, helpPanel: null,
    chartManager: null, examples: null, glossary: null,
  });
  ws.render();
  return ws;
}

suite('Workspace.reset', () => {
  test('destroys every mounted instance', async () => {
    const ws = makeWorkspace();
    const a = { destroyed: false, destroy() { this.destroyed = true; } };
    const b = { destroyed: false, destroy() { this.destroyed = true; } };
    ws._instances.set('a', a);
    ws._instances.set('b', b);
    await ws.reset();
    assertTrue(a.destroyed, 'instance a destroyed');
    assertTrue(b.destroyed, 'instance b destroyed');
  });

  test('clears instance and container maps', async () => {
    const ws = makeWorkspace();
    ws._instances.set('a', { destroy() {} });
    ws._containers.set('a', document.createElement('div'));
    await ws.reset();
    assertEqual(ws._instances.size, 0);
    assertEqual(ws._containers.size, 0);
  });

  test('survives a module whose destroy throws', async () => {
    const ws = makeWorkspace();
    ws._instances.set('bad', { destroy() { throw new Error('boom'); } });
    const ok = { destroyed: false, destroy() { this.destroyed = true; } };
    ws._instances.set('ok', ok);
    await ws.reset();
    assertTrue(ok.destroyed, 'later instance still destroyed');
    assertEqual(ws._instances.size, 0);
  });

  test('empties tab bar and module area', async () => {
    const ws = makeWorkspace();
    ws._tabsEl.appendChild(document.createElement('span'));
    ws._moduleArea.appendChild(document.createElement('div'));
    await ws.reset();
    assertEqual(ws._tabsEl.childElementCount, 0);
    assertEqual(ws._moduleArea.childElementCount, 0);
  });
});

suite('Workspace.instantiateDetached extraContext', () => {
  test('merges extra context after the defaults', async () => {
    const ws = makeWorkspace();
    const pool = new Map();
    const inst = await ws.instantiateDetached('i-1', 'demo', { worksheetPool: pool, worksheetKey: 'w.json' });
    assertEqual(inst.context.worksheetKey, 'w.json');
    assertTrue(inst.context.worksheetPool === pool, 'pool passed by reference');
  });

  test('extra context does not break the notify/confirm overrides', async () => {
    const ws = makeWorkspace();
    const inst = await ws.instantiateDetached('i-2', 'demo', { worksheetKey: 'w.json' });
    assertEqual(typeof inst.context.notify, 'function');
    assertEqual(await inst.context.confirmPopout('x'), true);
  });
});
