/**
 * Tests for core/agent/agent-ops.js — direct coverage of the runtime
 * defences that are kept even though Stufe 6 of the validator
 * (agent-validate.js) now intercepts the same cases first on the normal
 * `interact()` path. Without a test calling `createOps` directly, these two
 * branches (`module.add`, `module.remove` against `host.isCompleted()`)
 * would be asserted nowhere and could be deleted without a single red test —
 * see Task 11 review item 2.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { createOps } from '../../../js/core/agent/agent-ops.js';
import { defineModel, command, oneOf, index, list, record, text } from '../../../js/core/model.js';
import { I18n } from '../../../js/core/i18n.js';
import { asyncTask } from '../../../js/core/async-task.js';
import { schemaAgentEntry } from '../../../js/core/agent/agent-schema.js';
import { State as MsaTyp2State } from '../../../js/modules/msa-typ2/domain/model.js';

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

suite('agent ops — runtime defence for a completed project', () => {
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

  test('falsche Phase im abgeschlossenen Projekt meldet project_completed', async () => {
    const ops = createOps(makeDeps({ completed: true }));
    const out = await ops['module.add']({ module: 'five-why', phase: 'measure' });
    assertEqual(out.error, 'project_completed');
  });

  test('module_singleton nennt weiter die vorhandene Instanz', async () => {
    const deps = makeDeps({ completed: false });
    deps.moduleRegistry.get = (id) => ({ ...DEFS.find(d => d.id === id), singleton: true });
    const ops = createOps(deps);
    const out = await ops['module.add']({ module: 'five-why' });
    assertEqual(out.error, 'module_singleton');
    assertTrue(out.message.includes('fw-1'), out.message);
  });

  test('eine Phase außerhalb des Zyklus meldet unknown_phase mit getAllPhaseIds', async () => {
    const ops = createOps(makeDeps({ completed: false }));
    const out = await ops['module.add']({ module: 'five-why', phase: 'nirgendwo' });
    assertEqual(out.error, 'unknown_phase');
    assertTrue(out.available.includes('define') && out.available.includes('control'));
  });

  test('eine Phase des Zyklus, die das Modul nicht bietet, nennt allowedPhases', async () => {
    const ops = createOps(makeDeps({ completed: false }));
    const out = await ops['module.add']({ module: 'five-why', phase: 'measure' });
    assertEqual(out.error, 'unknown_phase');
    assertDeepEqual(out.available, ['define']);
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

suite('agent ops — Teil-Viewmodels', () => {
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

suite('agent ops — Schema-Module', () => {
  const COLS = ['a', 'b'];
  const Board = defineModel({
    fields: { title: text(), columns: record(COLS, list(text())) },
    view: { mode: oneOf(['month', 'week']) },
    commands: {
      moveItem: command({
        params: { from: oneOf(COLS), idx: index('columns[from]', { existing: true }), to: oneOf(COLS) },
        run({ from, idx, to }) { const [x] = this.columns[from].splice(idx, 1); this.columns[to].push(x); return true; },
      }),
    },
  });
  const VM_COMMANDS = { label: command({ params: {}, run() { return `#${this.model.title}`; } }) };
  const ENTRY = schemaAgentEntry(Board, VM_COMMANDS);
  const STUB = { tagged: true, available: true, schema: true, violations: [], reported: [], actions: {}, fields: {} };

  function schemaDeps() {
    const model = Board.fromJSON({ title: 'T', columns: { a: ['x'], b: [] }, mode: 'week' });
    const viewmodel = { model, label() { return `#${this.model.title}`; }, read() { return model.toJSON(); } };
    const defs = [{ id: 'board', phase: 'define', cycles: { dmaic: { phase: 'define' } } }];
    const phases = { define: [{ instanceId: 'b-1', moduleId: 'board', order: 0 }] };
    const deps = {
      stateManager: { get: (p) => (p === 'phases' ? phases : p.startsWith('phases.') ? phases[p.slice(7)] : undefined) },
      moduleRegistry: { getAll: () => defs, get: (id) => defs.find(d => d.id === id), getActiveCycle: () => 'dmaic' },
      i18n: I18N,
      registry: { board: STUB },
      loadModule: async () => ({ agentEntry: ENTRY }),
      getHelp: async () => null,
      appVersion: '1.2.3',
      host: { isCompleted: () => false, getViewmodel: async () => viewmodel, getCurrentView: () => null },
    };
    return { deps, model };
  }

  test('Kommando mit einem Objekt läuft auf dem Model', async () => {
    const { deps, model } = schemaDeps();
    const out = await createOps(deps)['instance.call']({ instance: 'b-1', method: 'moveItem', args: [{ from: 'a', idx: 0, to: 'b' }] });
    assertEqual(out.value, true);
    assertDeepEqual(model.columns.b, ['x']);
  });

  test('ungültiges Kommando → call_failed mit Vertragsmeldung', async () => {
    const { deps } = schemaDeps();
    const out = await createOps(deps)['instance.call']({ instance: 'b-1', method: 'moveItem', args: [{ from: 'a', idx: 5, to: 'b' }] });
    assertEqual(out.ok, false);
    assertEqual(out.error, 'call_failed');
    assertTrue(out.message.includes('invalid idx 5; allowed: 0..0'), out.message);
  });

  test('mehr als ein Argument → call_failed', async () => {
    const { deps } = schemaDeps();
    const out = await createOps(deps)['instance.call']({ instance: 'b-1', method: 'moveItem', args: [{}, {}] });
    assertEqual(out.error, 'call_failed');
  });

  test('Viewmodel-Kommando läuft auf dem Viewmodel', async () => {
    const { deps } = schemaDeps();
    const out = await createOps(deps)['instance.call']({ instance: 'b-1', method: 'label', args: [] });
    assertEqual(out.value, '#T');
  });

  test('read lässt Ansichtsfelder weg', async () => {
    const { deps } = schemaDeps();
    const out = await createOps(deps)['instance.call']({ instance: 'b-1', method: 'read' });
    assertEqual(out.value.title, 'T');
    assertEqual('mode' in out.value, false);
  });

  test('describe lädt das Modul und nennt die Kommandos', async () => {
    const { deps } = schemaDeps();
    const out = await createOps(deps)['module.describe']({ module: 'board' });
    assertDeepEqual(out.actions.map(a => a.name), ['read', 'moveItem', 'label']);
    assertDeepEqual(out.actions[1].keys.map(k => k.name), ['from', 'idx', 'to']);
  });

  test('catalog.read zeigt den Platzhalter als verfügbar, ohne zu laden', async () => {
    const { deps } = schemaDeps();
    let loads = 0;
    deps.loadModule = async () => { loads += 1; return { agentEntry: ENTRY }; };
    const out = await createOps(deps)['catalog.read']();
    assertEqual(out.modules[0].available, true);
    assertEqual(loads, 0);
  });

  test('catalog.read: Modul in neuer Form mit Name und whenToUse aus den Katalogtexten, ohne zu laden', async () => {
    const { deps } = schemaDeps();
    const i18n = new I18n('de');
    i18n._cache.set('de', {});
    i18n.mergeModule('neu', 'de', { name: 'Neu', description: 'Kurz', whenToUse: 'Wann' });
    const defs = [{ id: 'neu', form: 'module', phase: 'define', cycles: { dmaic: { phase: 'define' } } }];
    let loads = 0;
    const out = await createOps({
      ...deps,
      i18n,
      moduleRegistry: { getAll: () => defs, get: (id) => defs.find((d) => d.id === id), getActiveCycle: () => 'dmaic' },
      registry: {},
      loadModule: async () => { loads += 1; return {}; },
    })['catalog.read']();
    assertDeepEqual(out.modules.map((m) => [m.id, m.name, m.whenToUse, m.phase]), [['neu', 'Neu', 'Wann', 'define']]);
    assertEqual(loads, 0);
  });

  test('instance.set setzt Felder und liefert normalisierte Werte', async () => {
    const { deps, model } = schemaDeps();
    const out = await createOps(deps)['instance.set']({ instance: 'b-1', values: { title: 'Neu' } });
    assertDeepEqual(out, { instanceId: 'b-1', values: { title: 'Neu' } });
    assertEqual(model.title, 'Neu');
  });

  test('instance.set: Ansichtsfeld → call_failed, nichts geschrieben', async () => {
    const { deps, model } = schemaDeps();
    const out = await createOps(deps)['instance.set']({ instance: 'b-1', values: { title: 'Neu', mode: 'month' } });
    assertEqual(out.error, 'call_failed');
    assertTrue(out.message.includes('unknown field "mode"; available: title, columns'), out.message);
    assertEqual(model.title, 'T');
  });

  test('instance.set auf einem Modul ohne Schema → call_failed setNotSupported', async () => {
    const deps = makeDeps({ completed: false });
    // Vor createOps setzen: createOps liest deps.registry beim Erzeugen.
    deps.registry = { 'five-why': { tagged: true, available: true, violations: [], actions: { read: { params: [] } }, fields: {} } };
    const out = await createOps(deps)['instance.set']({ instance: 'fw-1', values: { problem: 'x' } });
    assertEqual(out.error, 'call_failed');
    assertTrue(out.message.startsWith('agent.errors.setNotSupported'), out.message);
  });

  test('instance.set mit unbekannter Instanz → unknown_instance', async () => {
    const { deps } = schemaDeps();
    const out = await createOps(deps)['instance.set']({ instance: 'nope', values: {} });
    assertEqual(out.error, 'unknown_instance');
  });
});

suite('agent ops — asynchrone Abläufe', () => {
  const Board = defineModel({ fields: { title: text() } });
  const ENTRY_T = schemaAgentEntry(Board, {}, { asyncTasks: { compute: asyncTask({ params: {}, run() { return 1; } }) } });
  const STUB = { tagged: true, available: true, schema: true, violations: [], reported: [], actions: {}, fields: {} };

  function setup(outcomes, vmExtra = null) {
    const cancelled = [];
    const viewmodel = vmExtra ?? {
      model: Board.fromJSON({ title: 'T' }),
      _asyncTaskHost: { start: async () => outcomes.shift(), cancel: (name) => (cancelled.push(name), true) },
    };
    const defs = [{ id: 'board', phase: 'define', cycles: { dmaic: { phase: 'define' } } }];
    const phases = { define: [{ instanceId: 'b-1', moduleId: 'board', order: 0 }] };
    const ops = createOps({
      stateManager: { get: (p) => (p === 'phases' ? phases : p.startsWith('phases.') ? phases[p.slice(7)] : undefined) },
      moduleRegistry: { getAll: () => defs, get: (id) => defs.find(d => d.id === id), getActiveCycle: () => 'dmaic' },
      i18n: I18N,
      registry: { board: STUB },
      loadModule: async () => ({ agentEntry: ENTRY_T }),
      getHelp: async () => null,
      appVersion: '1.2.3',
      host: { isCompleted: () => false, getViewmodel: async () => viewmodel, getCurrentView: () => null },
    });
    return { ops, cancelled };
  }
  const call = (ops, method, args = [{}]) => ops['instance.call']({ instance: 'b-1', method, args });

  test('Erfolg liefert den Rückgabewert', async () => {
    const { ops } = setup([{ status: 'done', value: { x: 1 } }]);
    assertDeepEqual((await call(ops, 'compute')).value, { x: 1 });
  });
  test('Abbruch liefert { cancelled: true } ohne Fehler', async () => {
    const { ops } = setup([{ status: 'cancelled' }]);
    const out = await call(ops, 'compute');
    assertEqual(out.error, undefined);
    assertDeepEqual(out.value, { cancelled: true });
  });
  test('Fehler → call_failed mit der Meldung', async () => {
    const { ops } = setup([{ status: 'failed', error: new Error('kaputt') }]);
    const out = await call(ops, 'compute');
    assertEqual(out.error, 'call_failed');
    assertTrue(out.message.includes('kaputt'), out.message);
  });
  test('Abweisung → call_failed mit dem Grund', async () => {
    const { ops } = setup([{ status: 'rejected', reason: 'asyncTask compute is already running' }]);
    const out = await call(ops, 'compute');
    assertEqual(out.error, 'call_failed');
    assertTrue(out.message.includes('already running'), out.message);
  });
  test('compute.cancel → { cancelled: true }', async () => {
    const { ops, cancelled } = setup([]);
    const out = await call(ops, 'compute.cancel', []);
    assertDeepEqual(out.value, { cancelled: true });
    assertDeepEqual(cancelled, ['compute']);
  });
  test('Task-Aktionen stehen im Katalog und sind keine Teil-Viewmodels', async () => {
    const { ops } = setup([]);
    const out = await ops['module.describe']({ module: 'board' });
    assertDeepEqual(out.actions.map(a => a.name), ['read', 'compute', 'compute.cancel']);
    const bad = await call(ops, 'gibtEsNicht', []);
    assertEqual(bad.error, 'unknown_method');
    assertDeepEqual(bad.available, ['compute', 'compute.cancel', 'read']);
  });
  test('ohne Ablauf-Host: unknown_method, und der Task gilt nicht als Teil-Viewmodel', async () => {
    // `compute` am Viewmodel ist hier ein Objekt mit einer Methode; als Teil-Viewmodel
    // gelesen erschiene `compute.foo` in der Liste der lebenden Methoden.
    const { ops } = setup([], { model: Board.fromJSON({ title: 'T' }), read() {}, compute: { foo() {} } });
    const out = await call(ops, 'compute');
    assertEqual(out.error, 'unknown_method');
    assertDeepEqual(out.available, ['read']);
  });
});

suite('agent ops — Lesen und Schreiben ohne Ansichtswechsel', () => {
  const Board = defineModel({
    fields: { title: text() },
    view: { mode: oneOf(['month', 'week']) },
    commands: {
      rename: command({ params: { title: text() }, run({ title }) { this.title = title; return title; } }),
    },
  });
  const VM_COMMANDS = { label: command({ params: {}, run() { return `#${this.model.title}`; } }) };
  const ENTRY = schemaAgentEntry(Board, VM_COMMANDS,
    { asyncTasks: { compute: asyncTask({ params: {}, run() { return 1; } }) } });
  const STUB = { tagged: true, available: true, schema: true, violations: [], reported: [], actions: {}, fields: {} };

  /**
   * Ein Host, der jede Navigation protokolliert, und ein `instances`-Dienst,
   * der ein nicht gemountetes Model hält. `legacy: true` lässt den Dienst wie
   * für ein Altmodul mit eigenem `read()` `needs_mount` werfen.
   */
  function setup({ legacy = false, registry = { board: STUB }, moduleId = 'board' } = {}) {
    const log = [];
    const model = Board.fromJSON({ title: 'T', mode: 'week' });
    const viewmodel = {
      model,
      label() { return `#${this.model.title}`; },
      read() { log.push('vm.read'); return { ...model.toJSON(), from: 'vm' }; },
      doIt() { log.push('vm.doIt'); return 'done'; },
      _asyncTaskHost: { start: async () => ({ status: 'done', value: 7 }), cancel: () => true },
    };
    const needsMount = () => Object.assign(new Error('needs_mount'), { code: 'needs_mount' });
    const instances = {
      read: async (id, options) => {
        log.push(`instances.read:${id}:${JSON.stringify(options ?? null)}`);
        if (legacy) throw needsMount();
        return { title: model.title, from: 'instances' };
      },
      write: async (id, fn) => {
        log.push(`instances.write:${id}`);
        if (legacy) throw needsMount();
        return { mounted: false, result: fn(model) };
      },
    };
    const defs = [{ id: moduleId, phase: 'define', cycles: { dmaic: { phase: 'define' } } }];
    const phases = { define: [{ instanceId: 'b-1', moduleId, order: 0 }] };
    const ops = createOps({
      stateManager: { get: (p) => (p === 'phases' ? phases : p.startsWith('phases.') ? phases[p.slice(7)] : undefined) },
      moduleRegistry: { getAll: () => defs, get: (id) => defs.find(d => d.id === id), getActiveCycle: () => 'dmaic' },
      i18n: I18N,
      registry,
      loadModule: async () => ({ agentEntry: ENTRY }),
      getHelp: async () => null,
      appVersion: '1.2.3',
      instances,
      host: {
        isCompleted: () => false,
        getCurrentView: () => null,
        openInstance: async (id) => { log.push(`open:${id}`); return { instanceId: id }; },
        getViewmodel: async (id) => { log.push(`getViewmodel:${id}`); return viewmodel; },
      },
    });
    return { ops, log, model, instances };
  }
  const navigated = (log) => log.some(e => e.startsWith('open:') || e.startsWith('getViewmodel:'));

  test('read geht über instances.read und navigiert nicht', async () => {
    const { ops, log } = setup();
    const out = await ops['instance.call']({ instance: 'b-1', method: 'read', args: [{ fields: ['title'] }] });
    assertDeepEqual(out.value, { title: 'T', from: 'instances' });
    assertDeepEqual(log, ['instances.read:b-1:{"fields":["title"]}']);
    assertEqual(navigated(log), false);
  });

  test('read eines Altmoduls mit eigenem read() fällt auf den Ansichtswechsel zurück', async () => {
    const { ops, log } = setup({ legacy: true });
    const out = await ops['instance.call']({ instance: 'b-1', method: 'read' });
    assertEqual(out.value.from, 'vm');
    assertEqual('mode' in out.value, false, 'Ansichtsfelder fallen auch auf dem alten Weg');
    assertDeepEqual(log, ['instances.read:b-1:null', 'getViewmodel:b-1', 'vm.read']);
  });

  test('instance.set auf eine Zielform geht über instances.write, nicht über getViewmodel', async () => {
    const { ops, log, model } = setup();
    const out = await ops['instance.set']({ instance: 'b-1', values: { title: 'Neu' } });
    assertDeepEqual(out, { instanceId: 'b-1', values: { title: 'Neu' } });
    assertEqual(model.title, 'Neu');
    assertDeepEqual(log, ['instances.write:b-1']);
  });

  test('instance.set mit ungültigem Feld → call_failed, nichts geschrieben, keine Navigation', async () => {
    const { ops, log, model } = setup();
    const out = await ops['instance.set']({ instance: 'b-1', values: { title: 'Neu', mode: 'month' } });
    assertEqual(out.error, 'call_failed');
    assertTrue(out.message.startsWith('agent.errors.callFailed|instance.set'), out.message);
    assertEqual(model.title, 'T');
    assertEqual(navigated(log), false);
  });

  test('Model-Kommando der Zielform geht über instances.write, nicht über getViewmodel', async () => {
    const { ops, log, model } = setup();
    const out = await ops['instance.call']({ instance: 'b-1', method: 'rename', args: [{ title: 'X' }] });
    assertEqual(out.value, 'X');
    assertEqual(model.title, 'X');
    assertDeepEqual(log, ['instances.write:b-1']);
  });

  test('Model-Kommando mit zwei Argumenten → call_failed vor dem Schreiben', async () => {
    const { ops, log } = setup();
    const out = await ops['instance.call']({ instance: 'b-1', method: 'rename', args: [{}, {}] });
    assertEqual(out.error, 'call_failed');
    assertDeepEqual(log, []);
  });

  test('instances.write meldet project_completed → project_completed, ohne Navigation', async () => {
    const { ops, log, instances } = setup();
    // Der Prüfer fängt das abgeschlossene Projekt sonst vorher ab; hier weiß es nur der Dienst.
    instances.write = async () => { throw Object.assign(new Error('project_completed'), { code: 'project_completed' }); };
    assertEqual((await ops['instance.set']({ instance: 'b-1', values: { title: 'Neu' } })).error, 'project_completed');
    assertEqual((await ops['instance.call']({ instance: 'b-1', method: 'rename', args: [{ title: 'X' }] })).error,
      'project_completed');
    assertEqual(navigated(log), false);
  });

  test('Model-Kommando, das das Model nicht hat → unknown_method mit den Katalogaktionen, nichts geschrieben', async () => {
    const { ops, log, instances } = setup();
    let applied = null;
    instances.write = async (id, fn) => {
      log.push(`instances.write:${id}`);
      try { return { mounted: false, result: fn({ title: 'T' }) }; } catch (e) { applied = 'nein'; throw e; }
    };
    const out = await ops['instance.call']({ instance: 'b-1', method: 'rename', args: [{ title: 'X' }] });
    assertEqual(out.error, 'unknown_method', JSON.stringify(out));
    assertEqual(out.message, 'agent.errors.unknownMethod|board,rename');
    assertDeepEqual(out.available, ['compute', 'compute.cancel', 'label', 'read', 'rename']);
    assertEqual(applied, 'nein');
    assertEqual(navigated(log), false);
  });

  test('Einhängen reißt die Frist (unknown_instance vom Dienst) → unknown_instance mit viewmodelNotAlive', async () => {
    const { ops, instances } = setup();
    const timeout = () => { throw Object.assign(new Error('unknown_instance'), { code: 'unknown_instance' }); };
    instances.read = async () => timeout();
    instances.write = async () => timeout();
    for (const action of [
      { instance: 'b-1', method: 'read' },
      { instance: 'b-1', method: 'rename', args: [{ title: 'X' }] },
    ]) {
      const out = await ops['instance.call'](action);
      assertEqual(out.error, 'unknown_instance', action.method);
      assertEqual(out.message, 'agent.errors.viewmodelNotAlive|b-1', action.method);
      assertDeepEqual(out.available, [], action.method);
    }
    const set = await ops['instance.set']({ instance: 'b-1', values: { title: 'Neu' } });
    assertEqual(set.error, 'unknown_instance');
    assertEqual(set.message, 'agent.errors.viewmodelNotAlive|b-1');
  });

  test('Viewmodel-Kommando bleibt beim Ansichtswechsel', async () => {
    const { ops, log } = setup();
    const out = await ops['instance.call']({ instance: 'b-1', method: 'label', args: [] });
    assertEqual(out.value, '#T');
    assertDeepEqual(log, ['getViewmodel:b-1']);
  });

  test('asyncTask-Aktion und ihr .cancel bleiben beim Ansichtswechsel', async () => {
    const { ops, log } = setup();
    assertEqual((await ops['instance.call']({ instance: 'b-1', method: 'compute', args: [{}] })).value, 7);
    assertDeepEqual((await ops['instance.call']({ instance: 'b-1', method: 'compute.cancel', args: [] })).value,
      { cancelled: true });
    assertDeepEqual(log, ['getViewmodel:b-1', 'getViewmodel:b-1']);
  });

  test('Aktion eines Altmoduls bleibt beim Ansichtswechsel', async () => {
    const legacyEntry = { tagged: true, available: true, violations: [], fields: {},
      actions: { read: { params: [] }, doIt: { params: [] } } };
    const { ops, log } = setup({ registry: { 'old-mod': legacyEntry }, moduleId: 'old-mod' });
    const out = await ops['instance.call']({ instance: 'b-1', method: 'doIt', args: [] });
    assertEqual(out.value, 'done');
    assertDeepEqual(log, ['getViewmodel:b-1', 'vm.doIt']);
  });
});

suite('agent ops — Ablehnung wegen einer Invariante', () => {
  const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 90 };
  const TABLE = {
    'agent.errors.callFailed': 'Aufruf von "{method}" ist fehlgeschlagen: {detail}',
    'modules.msa-typ2.invariants.limitsOrder': 'USG muss kleiner als OSG sein',
  };
  const i18n = {
    getLanguage: () => 'de',
    exists: (key) => key in TABLE,
    t: (key, params) => {
      let out = TABLE[key] ?? key;
      for (const [k, v] of Object.entries(params ?? {})) out = out.replace(`{${k}}`, String(v));
      return out;
    },
  };

  /** `mounted: true` lässt den Dienst `needs_mount` werfen: dann schreibt die Fläche ins lebende Model. */
  function setup({ mounted = false } = {}) {
    const model = new MsaTyp2State(CTX);
    const defs = [{ id: 'msa-typ2', phase: 'measure', cycles: { dmaic: { phase: 'measure' } } }];
    const phases = { measure: [{ instanceId: 'm-1', moduleId: 'msa-typ2', order: 0 }] };
    const ops = createOps({
      stateManager: { get: (p) => (p === 'phases' ? phases : p.startsWith('phases.') ? phases[p.slice(7)] : undefined) },
      moduleRegistry: { getAll: () => defs, get: (id) => defs.find(d => d.id === id), getActiveCycle: () => 'dmaic' },
      i18n,
      registry: { 'msa-typ2': { tagged: true, available: true, schema: true, violations: [], reported: [], actions: {}, fields: {} } },
      loadModule: async () => ({ agentEntry: schemaAgentEntry(MsaTyp2State) }),
      getHelp: async () => null,
      appVersion: '1.2.3',
      instances: {
        read: async () => ({}),
        write: async (id, fn) => {
          if (mounted) throw Object.assign(new Error('needs_mount'), { code: 'needs_mount' });
          return { mounted: false, result: fn(model) };
        },
      },
      host: {
        isCompleted: () => false,
        getCurrentView: () => null,
        openInstance: async (id) => ({ instanceId: id }),
        getViewmodel: async () => ({ model }),
      },
    });
    return { ops, model };
  }

  for (const mounted of [false, true]) {
    test(`instance.set mit lsl über usl nennt die Regel (${mounted ? 'eingehängt' : 'nicht eingehängt'})`, async () => {
      const { ops } = setup({ mounted });
      const out = await ops['instance.set']({ instance: 'm-1', values: { lsl: 5, usl: 1 } });
      assertEqual(out.error, 'call_failed', JSON.stringify(out));
      assertEqual(out.invariant, 'limitsOrder');
      assertTrue(out.message.includes('allowed: USG muss kleiner als OSG sein'), out.message);
      assertTrue(!out.message.includes('a value that keeps'), out.message);
    });
  }

  test('ein Fehler ohne Invariante bleibt wörtlich wie bisher, ohne Feld invariant', async () => {
    const { ops } = setup();
    const out = await ops['instance.set']({ instance: 'm-1', values: { k: 7 } });
    assertEqual(out.error, 'call_failed');
    assertEqual('invariant' in out, false);
    assertTrue(out.message.startsWith('Aufruf von "instance.set" ist fehlgeschlagen: invalid k 7; allowed:'), out.message);
  });
});
