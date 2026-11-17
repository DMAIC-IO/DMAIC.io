/**
 * Tests für Workspace.getInstancesByModuleId — deterministische Auflösung
 * einer Modulinstanz, unabhängig davon, welche Kachel gerade aktiv ist.
 */
import { suite, test, assertEqual } from '../test-utils.js';
import { Workspace } from '../../js/ui/workspace.js';

/** Minimaler Workspace ohne DOM: nur die Instanzverwaltung wird geprüft. */
function makeWorkspace() {
  const ws = Object.create(Workspace.prototype);
  ws._instances = new Map();
  return ws;
}

suite('workspace instances', () => {
  test('getInstancesByModuleId liefert alle Instanzen des Typs in Einfügereihenfolge', () => {
    const ws = makeWorkspace();
    const a = { id: 'worksheet', tag: 'a' };
    const b = { id: 'sipoc', tag: 'b' };
    const c = { id: 'worksheet', tag: 'c' };
    ws._instances.set('i1', a);
    ws._instances.set('i2', b);
    ws._instances.set('i3', c);
    assertEqual(ws.getInstancesByModuleId('worksheet').map(i => i.tag).join(','), 'a,c');
  });

  test('getInstancesByModuleId liefert ein leeres Array, wenn der Typ fehlt', () => {
    const ws = makeWorkspace();
    assertEqual(ws.getInstancesByModuleId('worksheet').length, 0);
  });
});

/**
 * Workspace ohne DOM, die durch `_showPhase` laufen kann: Tab-Leiste und
 * Modulfläche sind Attrappen, Tabs und Aktionen werden nicht gezeichnet.
 */
function makePhaseWorkspace(phases) {
  const ws = Object.create(Workspace.prototype);
  const node = () => ({ replaceChildren() {}, append() {}, querySelectorAll: () => [] });
  ws._instances = new Map();
  ws._containers = new Map();
  ws._pending = new Map();
  ws._lastActiveByPhase = new Map();
  ws._actionEffectDisposers = [];
  ws._tabsEl = node();
  ws._moduleArea = node();
  ws._eventBus = { emit() {}, on() {} };
  ws._stateManager = {
    get: (path) => (path === 'phases' ? phases : phases[path.slice('phases.'.length)]),
    setModuleState() {},
  };
  ws._renderTab = () => {};
  ws._renderActions = () => {};
  ws._ensureInstantiated = async () => {};
  return ws;
}

suite('workspace live viewmodels', () => {
  test('getLiveViewmodel liefert das Viewmodel einer Instanz oder null', () => {
    const ws = makeWorkspace();
    const vm = { model: {} };
    ws._containers = new Map([['i1', { isConnected: true }], ['i2', { isConnected: true }]]);
    ws._instances.set('i1', { getActionData: () => vm });
    ws._instances.set('i2', {});
    assertEqual(ws.getLiveViewmodel('i1'), vm);
    // Wieder eingehängt, aber Alpine hat noch nicht neu aufgebaut: `$data` ist ein leerer Proxy.
    ws._containers.set('i3', { isConnected: true });
    ws._instances.set('i3', { getActionData: () => ({}) });
    assertEqual(ws.getLiveViewmodel('i3'), null);
    assertEqual(ws.getLiveViewmodel('i2'), null);
    assertEqual(ws.getLiveViewmodel('fehlt'), null);
  });

  test('isPending meldet eine laufende Einhängung', () => {
    const ws = makeWorkspace();
    ws._pending = new Map([['i1', Promise.resolve()]]);
    assertEqual(ws.isPending('i1'), true);
    assertEqual(ws.isPending('i2'), false);
  });

  test('nach einem Phasenwechsel ist die Instanz der alten Phase nicht mehr gemountet', () => {
    // Alpine räumt eine aus dem Dokument gelöste Komponente ab (x-data-Cleanup):
    // `$data` liefert danach einen leeren Proxy. Beim Wiedereinhängen lädt das
    // Modul den gespeicherten Stand neu — der ist bis dahin der Besitzer.
    const phases = {
      define: [{ instanceId: 'd1', moduleId: 'sipoc' }],
      measure: [{ instanceId: 'm1', moduleId: 'sipoc' }],
    };
    const ws = makePhaseWorkspace(phases);
    const vm = { model: { n: 1 } };
    ws._instances.set('d1', { getActionData: () => vm, getState: () => null });
    const container = { style: {}, dataset: {}, isConnected: true };
    ws._containers.set('d1', container);
    ws._showPhase('define');
    assertEqual(ws.getLiveViewmodel('d1'), vm);
    container.isConnected = false;            // `_moduleArea.replaceChildren()` löst die Hülle
    ws._showPhase('measure');
    assertEqual(ws._activePhase, 'measure');
    assertEqual(ws.getLiveViewmodel('d1'), null);
  });

  test('setInstances reicht list und read in den Modulkontext, nicht write', () => {
    const ws = Object.create(Workspace.prototype);
    ws._context = {};
    ws._i18n = { getLanguage: () => 'de' };
    const svc = { list: () => [], read: async () => ({}), write: async () => ({}) };
    ws.setInstances(svc);
    const globalDoc = globalThis.document;
    if (!globalDoc) globalThis.document = /** @type {any} */ ({ documentElement: { dataset: {} } });
    try {
      const ctx = ws._buildContext('i1', null);
      assertEqual(ctx.instances.list, svc.list);
      assertEqual(ctx.instances.read, svc.read);
      assertEqual('write' in ctx.instances, false);
    } finally {
      if (!globalDoc) delete globalThis.document;
    }
  });
});

suite('workspace interactAsKernel', () => {
  test('schickt den Stapel ohne Aufrufer-Instanz, mit der Quelle als moduleId', async () => {
    const ws = makeWorkspace();
    const calls = [];
    ws.setModuleInteract(async (stack, caller) => { calls.push([stack, caller]); return { ok: true, results: [] }; });
    const stack = [{ op: 'project.read' }];
    const out = await ws.interactAsKernel(stack, 'zeg-sheet');
    assertEqual(out.ok, true);
    assertEqual(calls.length, 1);
    assertEqual(calls[0][0], stack);
    assertEqual(JSON.stringify(calls[0][1]), JSON.stringify({ instanceId: null, moduleId: 'zeg-sheet' }));
  });

  test('vor dem Verdrahten antwortet es surface_failed', async () => {
    const ws = makeWorkspace();
    ws._moduleInteract = null;
    const out = await ws.interactAsKernel([{ op: 'project.read' }], 'zeg-sheet');
    assertEqual(out.ok, false);
    assertEqual(out.error, 'surface_failed');
  });
});
