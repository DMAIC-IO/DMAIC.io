/**
 * Tests for core/template-module.js mit deklarativem Model (core/model.js):
 * Deskriptoren, Beobachter → command:executed, read, Viewmodel-Kommandos,
 * Reparatur beim Laden, applyRemoteState.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual, assertThrows } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { createModule } from '../../js/core/template-module.js';
import { runUiCommand } from '../../js/core/command-directives.js';
import { defineModel, command, text, number, oneOf, index, list, record, boolean, columnRef } from '../../js/core/model.js';

const COLS = ['a', 'b'];
const Board = defineModel({
  fields: { title: text(), columns: record(COLS, list(text())) },
  view: { mode: oneOf(['month', 'week']) },
  commands: {
    moveItem: command({
      params: { from: oneOf(COLS), idx: index('columns[from]', { existing: true }), to: oneOf(COLS) },
      returns: boolean(),
      run({ from, idx, to }) { const [x] = this.columns[from].splice(idx, 1); this.columns[to].push(x); return true; },
    }),
  },
});

const ID = 'schema-test';
const TPL_KEY = `js/modules/${ID}/${ID}.html`;

function ensureTemplate() {
  if (!Alpine.version) Alpine.start();
  if (document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) return;
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', TPL_KEY);
  tpl.innerHTML = '<div x-data="schemaTest"><span class="st-title" x-text="model.title"></span><span class="st-upper" x-text="upperTitle"></span></div>';
  document.body.append(tpl);
}

function makeModule() {
  return createModule({
    config: { id: ID, engine: 'alpine', phase: 'define',
      templateUrl: new URL(TPL_KEY, document.baseURI).href },
    Model: Board,
    commands: {
      label: command({ params: { upper: boolean() }, returns: text(),
        run({ upper }) { return upper ? this.model.title.toUpperCase() : this.model.title; } }),
    },
    data: () => ({
      get upperTitle() { return this.model.title.toUpperCase(); },
    }),
  });
}

function fakeContext(saved, { events, persisted }) {
  return {
    instanceId: 'st-1',
    stateManager: {
      getModuleState: () => saved,
      setModuleState: (...args) => persisted.push(args),
    },
    i18n: { t: k => k, tf: () => k => k, getLanguage: () => 'de' },
    eventBus: { on: () => {}, emit: (name, payload) => events.push([name, payload]) },
    theme: 'light',
    language: 'de',
  };
}

const mounted = [];
const flush = () => new Promise(r => setTimeout(r, 0));

async function mount(saved = { title: 'abc', columns: { a: ['x', 'y'], b: [] }, mode: 'week' }) {
  ensureTemplate();
  while (mounted.length) mounted.pop().remove();
  const events = []; const persisted = [];
  const mod = makeModule();
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container);
  await mod.init(container, fakeContext(saved, { events, persisted }));
  return { mod, container, events, persisted, data: () => Alpine.$data(container.querySelector('[x-data]')) };
}

suite('createModule mit Schema-Model', () => {
  test('Model ist geladen, Template bindet direkt', async () => {
    const { container } = await mount();
    await flush();
    assertEqual(container.querySelector('.st-title').textContent, 'abc');
  });

  test('Getter aus data() bleibt ein Getter (Deskriptoren)', async () => {
    const { container, data } = await mount();
    data().model.title = 'neu';
    await flush();
    assertEqual(container.querySelector('.st-upper').textContent, 'NEU');
  });

  test('Kommando meldet command:executed und speichert', async () => {
    const { data, events, persisted } = await mount();
    assertEqual(data().model.moveItem({ from: 'a', idx: 0, to: 'b' }), true);
    await flush();
    const hit = events.find(([n]) => n === 'command:executed');
    assertDeepEqual(hit[1], { instanceId: 'st-1', command: 'moveItem', args: { from: 'a', idx: 0, to: 'b' }, result: true });
    assertTrue(persisted.length > 0, 'persist-$watch lief');
  });

  test('read() liefert den Lesezustand', async () => {
    const { data } = await mount();
    const out = data().read();
    assertEqual(out.title, 'abc');
    assertDeepEqual(out.columns, { a: ['x', 'y'], b: [] });
  });

  test('Viewmodel-Kommando prüft, läuft mit this = Viewmodel und meldet', async () => {
    const { data, events } = await mount();
    assertEqual(data().label({ upper: true }), 'ABC');
    assertThrows(() => data().label({ upper: 'ja' }), /^invalid upper "ja"; allowed: true, false$/);
    assertTrue(events.some(([n, p]) => n === 'command:executed' && p.command === 'label'));
  });

  test('Viewmodel-Kommando aus der Oberfläche: _ui führt es über die Komponente aus', async () => {
    const { data } = await mount();
    assertDeepEqual(await runUiCommand(data()._ui, 'label', { upper: true }), { ok: true, result: 'ABC' });
  });

  test('moduleId und agentEntry', async () => {
    const { mod, data } = await mount();
    assertEqual(data().moduleId, ID);
    assertEqual(mod.agentEntry.schema, true);
    assertEqual(mod.agentEntry.actions.moveItem.target, 'model');
    assertEqual(mod.agentEntry.actions.label.target, 'viewmodel');
    assertDeepEqual(mod.agentEntry.viewFields, ['mode']);
  });

  test('ungültiger gespeicherter Inhalt wird repariert', async () => {
    const warn = console.warn; console.warn = () => {};
    try {
      const { data } = await mount({ title: 7, columns: { a: ['x'], b: [] } });
      assertEqual(data().model.title, '');
      assertDeepEqual(data().model.columns.a, ['x']);
    } finally { console.warn = warn; }
  });

  test('applyRemoteState ersetzt die Felder, Beobachter bleibt', async () => {
    const { mod, data, events } = await mount();
    await mod.applyRemoteState({ title: 'remote', columns: { a: ['r'], b: [] } });
    assertEqual(data().model.title, 'remote');
    data().model.moveItem({ from: 'a', idx: 0, to: 'b' });
    assertTrue(events.some(([n, p]) => n === 'command:executed' && p.args.idx === 0));
  });

  test('Model- und Viewmodel-Kommando mit demselben Namen wirft', () => {
    assertThrows(() => createModule({ config: { id: 'x-clash', engine: 'alpine' }, Model: Board,
      commands: { moveItem: command({ run() {} }) }, data: () => ({}) }), /command moveItem is both a model and a viewmodel command/);
  });

  test('commands ohne Schema-Model wirft', () => {
    assertThrows(() => createModule({ config: { id: 'x-legacy', engine: 'alpine' }, Model: class {},
      commands: { a: command({ run() {} }) }, data: () => ({}) }), /commands need a defineModel Model/);
  });

  test('Aufräumen: gemountete Container entfernen', () => {
    while (mounted.length) mounted.pop().remove();
    assertEqual(mounted.length, 0);
  });
});

// ─── Standard-loadExample mit Arbeitsblatt ──────────────────

const Sourced = defineModel({ fields: { title: text(), src: columnRef(), exampleWorksheetId: text() } });

/** Modul ohne Einbau: setState/getState laufen über `_tmpl`, der Kontext ist ein Stub. */
function sourcedModule({ answer }) {
  const log = { confirms: 0, hook: [], events: [], notes: [] };
  const store = { phases: { data: [] } };
  const states = {};
  const mod = createModule({
    config: { id: 'schema-sourced', engine: 'alpine', phase: 'analyze' },
    Model: Sourced,
    data: () => ({}),
    beforeLoadExample(data) {
      log.hook.push(this._loadingExample);
      return { ...data, title: 'Beispiel' };
    },
  });
  mod._context = {
    instanceId: 'me',
    i18n: { t: (k) => k, getLanguage: () => 'de' },
    notify: (msg, kind) => log.notes.push(kind),
    dialog: { confirm: async () => { log.confirms++; return answer; } },
    eventBus: { emit: (name) => log.events.push(name), on() {}, off() {} },
    stateManager: {
      get: (path) => path.split('.').reduce((o, k) => o?.[k], store),
      set(path, v) { const ks = path.split('.'); const last = ks.pop(); ks.reduce((o, k) => (o[k] ??= {}), store)[last] = v; },
      setModuleState(id, st) { states[id] = st; },
      getModuleState: (id) => states[id] ?? null,
      removeModuleState(id) { delete states[id]; },
    },
  };
  mod.setState({ title: 'alt' });
  return { mod, log, store, states };
}

const sourcedPayload = () => ({ meta: { id: 'ex' }, data: {
  src: { instanceId: '__source__', sheetId: 's1', columnId: 'c1' },
  sourceWorksheetData: { sheets: [{ id: 's1', name: 'S', state: { columns: [] } }] },
} });

/** Wartet (höchstens 2 s), bis `cond` gilt — Rückfrage und dynamischer Import liegen davor. */
async function until(cond) {
  const end = Date.now() + 2000;
  while (!cond()) {
    if (Date.now() > end) throw new Error('Bedingung nicht erreicht');
    await new Promise((r) => setTimeout(r, 5));
  }
}

suite('createModule: Standard-loadExample mit sourceWorksheetData', () => {
  test('provisioniert, hängt Spaltenbezüge um, Hook im Ladefenster, eine Rückfrage', async () => {
    const { mod, log, store, states } = sourcedModule({ answer: true });
    await mod.loadExample(sourcedPayload());
    const st = mod.getState();
    assertEqual(log.confirms, 1);
    assertDeepEqual(log.hook, [true]);
    assertEqual(mod._loadingExample, false);
    assertEqual(st.title, 'Beispiel');
    assertEqual(store.phases.data.length, 1);
    assertEqual(st.exampleWorksheetId, store.phases.data[0].instanceId);
    assertEqual(st.src.instanceId, st.exampleWorksheetId);
    assertEqual(states.me.src.instanceId, st.exampleWorksheetId);
    assertTrue(log.events.includes('module:added'));
    assertDeepEqual(log.notes, ['success']);
  });

  // Seit der Lader auf das lesbare Arbeitsblatt wartet (instances.read), reicht
  // das Ladefenster bis setState über einen await hinweg: `_loadingExample`
  // muss bis dahin stehen bleiben (kano.refreshTrees liest es).
  test('Ladefenster bleibt offen, bis das Arbeitsblatt lesbar ist und setState lief', async () => {
    const { mod } = sourcedModule({ answer: true });
    let release;
    mod._context.instances = { read: () => new Promise((r) => { release = r; }) };
    const done = mod.loadExample(sourcedPayload());
    await until(() => release !== undefined);
    assertEqual(mod._loadingExample, true, 'während des Wartens');
    assertEqual(mod.getState().title, 'alt', 'setState noch nicht gelaufen');
    release({});
    await done;
    assertEqual(mod._loadingExample, false, 'danach');
    assertEqual(mod.getState().title, 'Beispiel');
  });

  test('zweites Laden während des Wartens: das verwaiste Arbeitsblatt des ersten verschwindet', async () => {
    const { mod, store } = sourcedModule({ answer: true });
    let open;
    let reads = 0;
    const gate = new Promise((r) => { open = r; });
    mod._context.instances = { read: () => { reads++; return gate; } };
    const first = mod.loadExample(sourcedPayload());
    await until(() => reads === 1);
    const second = mod.loadExample(sourcedPayload());
    await until(() => reads === 2);
    open({});
    await Promise.all([first, second]);
    assertEqual(store.phases.data.length, 1, `Arbeitsblätter: ${store.phases.data.length}`);
    assertEqual(mod.getState().exampleWorksheetId, store.phases.data[0].instanceId);
  });

  test('abgelehnte Rückfrage: kein Hook, kein Arbeitsblatt, Stand unverändert', async () => {
    const { mod, log, store } = sourcedModule({ answer: false });
    await mod.loadExample(sourcedPayload());
    assertEqual(log.confirms, 1);
    assertDeepEqual(log.hook, []);
    assertEqual(store.phases.data.length, 0);
    assertDeepEqual(log.events, []);
    assertDeepEqual(log.notes, []);
    assertEqual(mod.getState().title, 'alt');
  });
});

// ─── fromExample: fremde Beispielformen vor dem Arbeitsblatt-Zweig ─────

/** Wie `sourcedModule`, aber mit `fromExample` statt `beforeLoadExample`. */
function fromExampleModule(fromExample, ModelClass = Sourced) {
  const log = { notes: [] };
  const store = { phases: { data: [] } };
  const states = {};
  const mod = createModule({
    config: { id: 'schema-from-example', engine: 'alpine', phase: 'analyze' },
    Model: ModelClass,
    data: () => ({}),
    fromExample,
  });
  mod._context = {
    instanceId: 'me',
    i18n: { t: (k) => k, getLanguage: () => 'de' },
    notify: (msg, kind) => log.notes.push(kind),
    dialog: { confirm: async () => true },
    eventBus: { emit() {}, on() {}, off() {} },
    stateManager: {
      get: (path) => path.split('.').reduce((o, k) => o?.[k], store),
      set(path, v) { const ks = path.split('.'); const last = ks.pop(); ks.reduce((o, k) => (o[k] ??= {}), store)[last] = v; },
      setModuleState(id, st) { states[id] = st; },
      getModuleState: (id) => states[id] ?? null,
      removeModuleState(id) { delete states[id]; },
    },
  };
  mod.setState({ title: 'alt' });
  return { mod, log, store };
}

suite('createModule: fromExample', () => {
  test('bekommt data und meta; Ergebnis mit sourceWorksheetData geht durch den Arbeitsblatt-Zweig', async () => {
    const seen = [];
    const { mod, store } = fromExampleModule((data, meta) => {
      seen.push([data, meta]);
      return { title: 'Beispiel', src: { instanceId: '__source__', sheetId: 's1', columnId: 'c1' },
        sourceWorksheetData: { sheets: [{ id: 's1', name: 'S', state: { columns: [] } }] } };
    });
    const payload = { meta: { id: 'ex' }, data: { fremd: 1 } };
    await mod.loadExample(payload);
    assertEqual(seen[0][0], payload.data);
    assertEqual(seen[0][1], payload.meta);
    const st = mod.getState();
    assertEqual(st.title, 'Beispiel');
    assertEqual(store.phases.data.length, 1);
    assertEqual(st.exampleWorksheetId, store.phases.data[0].instanceId);
    assertEqual(st.src.instanceId, st.exampleWorksheetId);
  });

  test('CSV-Form: csvToWorksheet baut das Arbeitsblatt, der Bezug wird umgebogen', async () => {
    const { mod, store } = fromExampleModule((data, meta, { csvToWorksheet }) => ({
      title: 'CSV',
      sourceWorksheetData: csvToWorksheet(data, meta),
      src: { instanceId: '__source__', sheetId: 'sheet-csv', columnId: 'c-0' },
    }));
    await mod.loadExample({ meta: { id: 'csv-ex', columns: [{ name: 'x' }] }, data: { columns: [{ name: 'x', values: [1, 2, 3] }] } });
    const st = mod.getState();
    assertEqual(store.phases.data.length, 1);
    assertEqual(st.src.instanceId, st.exampleWorksheetId);
    assertEqual(st.src.sheetId, 'sheet-csv');
    assertEqual(st.src.columnId, 'c-0');
  });

  test('ohne sourceWorksheetData im Ergebnis: setState-Zweig', async () => {
    const { mod, store } = fromExampleModule((data) => ({ title: `x${data.n}` }));
    await mod.loadExample({ meta: { id: 'ex' }, data: { n: 1 } });
    assertEqual(mod.getState().title, 'x1');
    assertEqual(store.phases.data.length, 0);
  });

  test('Beispiel ohne meta: fromExample bekommt {}', async () => {
    const seen = [];
    const { mod } = fromExampleModule((data, meta) => { seen.push(meta); return { title: 'x' }; });
    await mod.loadExample({ data: { n: 1 } });
    assertDeepEqual(seen, [{}]);
    assertEqual(mod.getState().title, 'x');
  });

  test('Modul ohne Arbeitsblatt-Schema: sourceWorksheetData im Ergebnis löst keinen Arbeitsblatt-Zweig aus', async () => {
    const Plain = defineModel({ fields: { title: text() } });
    const { mod, store } = fromExampleModule(() => ({ title: 'plain', sourceWorksheetData: { sheets: [] } }), Plain);
    await mod.loadExample({ meta: { id: 'ex' }, data: {} });
    assertEqual(mod.getState().title, 'plain');
    assertEqual(store.phases.data.length, 0);
  });

  test('fromExample und beforeLoadExample schließen sich aus', () => {
    assertThrows(() => createModule({
      config: { id: 'schema-both', engine: 'alpine', phase: 'analyze' },
      Model: Sourced, data: () => ({}), fromExample: (d) => d, beforeLoadExample: (d) => d,
    }), /createModule\(schema-both\): fromExample and beforeLoadExample are exclusive/);
  });
});

// ─── Vorgaben aus dem Kontext beim Setzen und Fernübernehmen ─────

const Ctx = defineModel({
  fields: {
    title: text(),
    alpha: number({ exclusiveMin: 0, exclusiveMax: 1, default: (c) => Number((1 - c.confidenceLevel / 100).toFixed(4)) }),
  },
});

function ctxContext(persisted) {
  return {
    instanceId: 'ctx-1',
    stateManager: {
      get: (path) => (path === 'settings.confidenceLevel' ? 90 : undefined),
      getModuleState: () => ({ title: 'abc' }),
      setModuleState: (id, st) => persisted.push(st),
    },
    i18n: { t: (k) => k, tf: () => (k) => k, getLanguage: () => 'de' },
    eventBus: { on: () => {}, emit: () => {} },
    theme: 'light',
    language: 'de',
  };
}

suite('createModule: fehlende Felder bekommen die Vorgabe des Projektkontexts', () => {
  test('setState ohne alpha speichert 0,1 bei Konfidenzniveau 90', () => {
    const persisted = [];
    const mod = createModule({ config: { id: 'schema-ctx', engine: 'alpine', phase: 'define' }, Model: Ctx, data: () => ({}) });
    mod._context = ctxContext(persisted);
    mod.setState({ title: 'neu' });
    assertEqual(persisted.at(-1).alpha, 0.1);
    assertEqual(mod.getState().alpha, 0.1);
  });

  test('applyRemoteState ohne alpha übernimmt 0,1 bei Konfidenzniveau 90', async () => {
    ensureTemplate();
    while (mounted.length) mounted.pop().remove();
    const persisted = [];
    const mod = createModule({ config: { id: ID, engine: 'alpine', phase: 'define',
      templateUrl: new URL(TPL_KEY, document.baseURI).href }, Model: Ctx, data: () => ({}) });
    const container = document.createElement('div');
    document.body.append(container);
    mounted.push(container);
    await mod.init(container, ctxContext(persisted));
    await mod.applyRemoteState({ title: 'remote' });
    assertEqual(Alpine.$data(container.querySelector('[x-data]')).model.alpha, 0.1);
    container.remove(); mounted.pop();
  });
});

// ─── Laden mit Kontext, genau einmal; Beispiel-Lader ohne Doppelladen ─────

/** Zählt die Aufrufe von `Model.fromJSON`, solange `fn` läuft. */
async function countFromJSON(Model, fn) {
  const orig = Model.fromJSON;
  let calls = 0;
  Model.fromJSON = function counted(...args) { calls++; return orig.apply(this, args); };
  try { await fn(); } finally { Model.fromJSON = orig; }
  return calls;
}

/** Eingehängtes Modul mit einem Speicher, der das Gesicherte wirklich zurückgibt. */
async function mountStateful(Model, saved, events = []) {
  ensureTemplate();
  while (mounted.length) mounted.pop().remove();
  const states = { 'ctx-1': saved };
  const mod = createModule({ config: { id: ID, engine: 'alpine', phase: 'define',
    templateUrl: new URL(TPL_KEY, document.baseURI).href }, Model, data: () => ({}) });
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container);
  const context = ctxContext([]);
  context.eventBus = { on: () => {}, emit: (name, payload) => events.push([name, payload]) };
  context.stateManager.getModuleState = (id) => states[id] ?? null;
  context.stateManager.setModuleState = (id, st) => { states[id] = st; };
  await mod.init(container, context);
  return { mod, container, data: () => Alpine.$data(container.querySelector('[x-data]')) };
}

suite('createModule: Laden mit Kontext, genau einmal', () => {
  test('setState lädt mit Kontext und genau einmal', async () => {
    const { mod, data } = await mountStateful(Ctx, { title: 'abc' });
    const calls = await countFromJSON(Ctx, () => mod.setState({ title: 'neu' }));
    assertEqual(calls, 1);
    assertEqual(data().model.title, 'neu');
    assertEqual(data().model.alpha, 0.1);
  });

  test('setState mit kaputtem Zustand: eine Warnung, Vorgabe aus dem Kontext', async () => {
    const { mod, data } = await mountStateful(Ctx, { title: 'abc' });
    const warnings = [];
    const warn = console.warn; console.warn = (...a) => { if (String(a[0]).startsWith('[createModule]')) warnings.push(a.join(' ')); };
    try { mod.setState({ title: 'neu', alpha: 7 }); } finally { console.warn = warn; }
    assertEqual(warnings.length, 1, warnings.join(' | '));
    assertEqual(data().model.alpha, 0.1);
  });

  test('applyRemoteState nutzt die Vorgaben aus den Einstellungen', async () => {
    const { mod, data } = await mountStateful(Ctx, { title: 'abc' });
    await mod.applyRemoteState({ title: 'remote', alpha: 7 });
    assertEqual(data().model.title, 'remote');
    assertEqual(data().model.alpha, 0.1);
  });
});

suite('createModule: Beispiel laden', () => {
  test('lädt den Stand mit Arbeitsblatt höchstens zweimal (Rückfrage, setState)', async () => {
    const { mod } = sourcedModule({ answer: true });
    const calls = await countFromJSON(Sourced, () => mod.loadExample(sourcedPayload()));
    assertEqual(calls, 2);
  });

  test('mit Arbeitsblatt wird der Stand nur einmal gesichert', async () => {
    const { mod } = sourcedModule({ answer: true });
    let writes = 0;
    const set = mod._context.stateManager.setModuleState;
    mod._context.stateManager.setModuleState = (id, st) => { if (id === 'me') writes++; set(id, st); };
    await mod.loadExample(sourcedPayload());
    assertEqual(writes, 1);
  });

  test('beim Ersetzen wird das vorige Arbeitsblatt entfernt', async () => {
    const { mod, store } = sourcedModule({ answer: true });
    await mod.loadExample(sourcedPayload());
    await mod.loadExample(sourcedPayload());
    assertEqual(store.phases.data.length, 1);
  });

  test('ohne Arbeitsblatt wird der Stand nur einmal gesichert', async () => {
    const { mod, states } = sourcedModule({ answer: true });
    let writes = 0;
    const set = mod._context.stateManager.setModuleState;
    mod._context.stateManager.setModuleState = (id, st) => { writes++; set(id, st); };
    await mod.loadExample({ meta: { id: 'ex' }, data: { title: 'x' } });
    assertEqual(writes, 1);
    assertEqual(states.me.title, 'Beispiel');
  });

  test('fromExample wirft → Meldung, kein Absturz', async () => {
    const { mod, log } = fromExampleModule(() => { throw new Error('kaputt'); });
    await mod.loadExample({ meta: { id: 'ex' }, data: { n: 1 } });
    assertDeepEqual(log.notes, ['error']);
    assertEqual(mod.getState().title, 'alt');
  });
});

suite('createModule mit Schema-Model — gelöste Hülle', () => {
  test('gelöst: kein Zustand, kein Speichern; wieder eingehängt: der gespeicherte Stand wird neu geladen', async () => {
    ensureTemplate();
    while (mounted.length) mounted.pop().remove();
    const store = new Map([['st-1', { title: 'alt', columns: { a: [], b: [] }, mode: 'week' }]]);
    const persisted = [];
    const ctx = {
      instanceId: 'st-1',
      stateManager: {
        getModuleState: (id) => store.get(id) ?? null,
        setModuleState: (id, s) => { persisted.push([id, s]); store.set(id, s); },
      },
      i18n: { t: k => k, tf: () => k => k, getLanguage: () => 'de' },
      eventBus: { on: () => {}, off: () => {}, emit: () => {} },
      theme: 'light',
      language: 'de',
    };
    const mod = makeModule();
    const host = document.createElement('div');
    const container = document.createElement('div');
    host.append(container);
    document.body.append(host);
    mounted.push(host);
    await mod.init(container, ctx);
    await flush();
    assertEqual(mod.getActionData().model.title, 'alt');

    // Wie `_moduleArea.replaceChildren()` beim Phasenwechsel. Die App startet
    // Alpine, dessen MutationObserver eine gelöste Komponente mit destroyTree
    // abräumt und eine wieder eingehängte mit initTree neu aufbaut; der
    // Testläufer startet Alpine nicht, darum hier ausdrücklich.
    container.remove();
    Alpine.destroyTree(container);
    await flush();
    assertEqual(mod.getActionData()?.model, undefined, 'Alpine hat die Komponente abgeräumt');
    assertEqual(mod.getState(), null, 'eine gelöste Instanz liefert keinen Zustand zum Speichern');
    // Sprachwechsel und setState erreichen auch gelöste Instanzen; sie dürfen
    // die Komponente nicht in der gelösten Hülle wiederbeleben.
    mod.onLanguageChange('en');
    assertEqual(mod.getState(), null, 'Sprachwechsel belebt die gelöste Instanz nicht');
    mod.setState({ title: 'gesetzt', columns: { a: [], b: [] }, mode: 'week' });
    assertEqual(store.get('st-1').title, 'gesetzt', 'setState speichert');
    assertEqual(mod.getState(), null, 'setState belebt die gelöste Instanz nicht');

    // Ein Schreiben ohne Mount (Dienst instances) legt den neuen Stand ab.
    store.set('st-1', { title: 'neu', columns: { a: [], b: [] }, mode: 'week' });
    const before = persisted.length;
    host.append(container);                        // Zurück in die Phase
    Alpine.initTree(container);
    await flush();
    assertEqual(mod.getActionData().model.title, 'neu', 'beim Wiedereinhängen aus dem Speicher geladen');
    assertEqual(container.querySelector('.st-title').textContent, 'neu');
    assertEqual(persisted.slice(before).some(([, s]) => s?.title === 'alt'), false, 'der alte Stand wird nie gespeichert');
  });

  test('nie eingehängt (Einhängung ohne Dokument): setState bleibt lebendig, getState liefert den neuen Stand', async () => {
    ensureTemplate();
    const store = new Map([['hl-1', { title: 'alt', columns: { a: [], b: [] }, mode: 'week' }]]);
    const ctx = {
      instanceId: 'hl-1',
      stateManager: {
        getModuleState: (id) => store.get(id) ?? null,
        setModuleState: (id, s) => { store.set(id, s); },
      },
      i18n: { t: k => k, tf: () => k => k, getLanguage: () => 'de' },
      eventBus: { on: () => {}, off: () => {}, emit: () => {} },
      theme: 'light',
      language: 'de',
    };
    const mod = makeModule();
    const container = document.createElement('div');   // nie im Dokument
    await mod.init(container, ctx);
    await flush();
    assertEqual(mod.getState().title, 'alt');
    mod.setState({ title: 'gesetzt', columns: { a: [], b: [] }, mode: 'week' });
    // Altmodule speichern nach setState noch einmal `getState()` — ein null
    // hier löschte den eben gesetzten Stand.
    assertEqual(mod.getState()?.title, 'gesetzt', 'getState liefert den gesetzten Stand');
    mod._context.stateManager.setModuleState('hl-1', mod.getState());
    assertEqual(store.get('hl-1')?.title, 'gesetzt', 'der Stand bleibt gespeichert');
    await mod.destroy();
  });
});
