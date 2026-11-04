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
import { schemaAgentEntry } from '../../../js/core/agent/agent-schema.js';

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
