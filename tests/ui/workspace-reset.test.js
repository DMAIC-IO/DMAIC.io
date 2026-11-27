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
    assertEqual(await inst.context.dialog.confirm({ message: 'x' }), true);
  });
});

suite('Workspace — ausstehende Modulspeicherung', () => {
  function makeWs() {
    const hooks = [];
    const writes = [];
    const container = document.createElement('div');
    const stateManager = {
      get: (path) => (path === 'phases' ? { define: [{ instanceId: 'a' }] } : []),
      getModuleState: () => ({}),
      setModuleState: (id, s) => writes.push([id, s]),
      isCompleted: () => false,
      registerPendingWork: (fn) => { hooks.push(fn); return () => { hooks.splice(hooks.indexOf(fn), 1); }; },
    };
    const handlers = {};
    const eventBus = {
      on: (ev, fn) => { (handlers[ev] ??= []).push(fn); },
      emit: (ev, payload) => { for (const fn of handlers[ev] ?? []) fn(payload); },
    };
    const ws = new Workspace(container, {
      moduleRegistry: { instantiate: async () => ({}), get: () => ({ id: 'x' }) },
      eventBus, stateManager,
      i18n: { t: (k) => k, getLanguage: () => 'de' },
      modal: () => {}, notify: () => {}, helpPanel: null, chartManager: null, examples: null, glossary: null,
    });
    ws.render();
    return { ws, hooks, writes, eventBus };
  }

  test('render meldet genau einen Haken an, ein zweites render ersetzt ihn', () => {
    const { ws, hooks } = makeWs();
    assertEqual(hooks.length, 1);
    ws.render();
    assertEqual(hooks.length, 1);
  });

  test('der Haken verwirft die entprellte Speicherung und schreibt den lebenden Stand', () => {
    const { ws, hooks, writes } = makeWs();
    let cancelled = 0;
    ws._instances.set('a', { cancelPersist: () => { cancelled += 1; }, getState: () => ({ n: 3 }) });
    hooks[0]();
    assertEqual(cancelled, 1);
    assertEqual(writes.length, 1);
    assertEqual(writes[0][0], 'a');
    assertEqual(writes[0][1].n, 3);
  });

  test('nach einem Import schreibt der Haken eingehängte Instanzen nicht zurück (Speicher ist neuer)', () => {
    const { ws, hooks, writes, eventBus } = makeWs();
    let cancelled = 0;
    ws._instances.set('a', { cancelPersist: () => { cancelled += 1; }, getState: () => ({ n: 'alt' }) });
    eventBus.emit('project:before-import');
    assertEqual(cancelled, 1, 'die entprellte Speicherung der Instanz ist verworfen');
    hooks[0]();
    ws._persistAllModuleStates();
    assertEqual(writes.length, 0, 'kein Rückschreiben des alten Stands');
  });

  test('nach reset() schreibt der Haken neu eingehängte Instanzen wieder', async () => {
    const { ws, hooks, writes, eventBus } = makeWs();
    ws._instances.set('a', { getState: () => ({ n: 'alt' }) });
    eventBus.emit('project:before-import');
    await ws.reset();
    ws._instances.set('a', { getState: () => ({ n: 'neu' }) });
    hooks[0]();
    assertEqual(writes.length, 1);
    assertEqual(writes[0][1].n, 'neu');
  });
});
