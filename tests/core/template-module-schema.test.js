/**
 * Tests for core/template-module.js mit deklarativem Model (core/model.js):
 * Deskriptoren, Beobachter → command:executed, read, Viewmodel-Kommandos,
 * Reparatur beim Laden, applyRemoteState.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual, assertThrows } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { createModule } from '../../js/core/template-module.js';
import { defineModel, command, text, oneOf, index, list, record, boolean, columnRef } from '../../js/core/model.js';

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
