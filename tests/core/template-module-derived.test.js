/**
 * createModule mit derived im Model: Zellen im Viewmodel, read(), loadDetached/readDetached.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertThrows } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { createModule } from '../../js/core/template-module.js';
import { asyncTask } from '../../js/core/async-task.js';
import { defineModel, number, command } from '../../js/core/model.js';
import { stripPaths } from '../../js/core/view-fields.js';
import { registerReader, bumpWorksheetRevisions } from '../../js/core/source.js';

const ID = 'derived-test';
const TPL_KEY = `js/modules/${ID}/${ID}.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));

const Doc = defineModel({
  fields: { n: number({ default: 1 }) },
  view: { zoom: number({ default: 1 }) },
  commands: {
    setN: command({ params: { n: number() }, run({ n }) { this.n = n; } }),
  },
  derived: {
    double() { return this.n * 2; },
    quad(_data, d) { return d.double * 2; },
    rows() { return [{ i: this.n }]; },
    fails() { throw new Error('kaputt'); },
    reader(_data, d) { return d.fails; },
    greeting(_s, _d, t) { return t('greet'); },
  },
  derivedBulk: ['rows'],
});

const tasks = {
  calc: asyncTask({ params: {}, async run() { return this.model.n; } }),
};

function ensureTemplate() {
  if (!Alpine.version) Alpine.start();
  if (document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) return;
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', TPL_KEY);
  tpl.innerHTML = '<div x-data="derivedTest"><span class="dt-double" x-text="double"></span></div>';
  document.body.append(tpl);
}

function fakeStateManager(saved) {
  return { getModuleState: () => saved, setModuleState: () => {}, getProjectCycle: () => 'dmaic', get: () => undefined };
}

function fakeContext(saved, emitted = []) {
  return {
    instanceId: 'dt-1',
    stateManager: fakeStateManager(saved),
    i18n: { t: (k) => k, tf: () => (k) => (k === 'greet' ? 'Hallo' : k), getLanguage: () => 'de' },
    eventBus: { on: () => {}, off: () => {}, emit: (...args) => emitted.push(args) },
    notify: () => {},
    dialog: { confirm: async () => true },
    theme: 'light', language: 'de',
  };
}

function makeModule(extra = {}) {
  return createModule({
    config: { id: ID, engine: 'alpine', phase: 'define', templateUrl: new URL(TPL_KEY, document.baseURI).href },
    Model: Doc,
    view() { return { computed: { label() { return `n=${this.model.n}`; } } }; },
    ...extra,
  });
}

async function mount(saved = { n: 3 }, extra = {}) {
  ensureTemplate();
  const mod = makeModule(extra);
  const container = document.createElement('div');
  document.body.append(container);
  await mod.init(container, fakeContext(saved));
  await flush();
  return { mod, container, vm: () => Alpine.$data(container.querySelector('[x-data]')) };
}

suite('createModule mit derived', () => {
  test('derived ist als Zelle im Viewmodel lesbar und folgt dem Model', async () => {
    const { mod, container, vm } = await mount();
    assertEqual(vm().double, 6);
    assertEqual(vm().quad, 12);
    assertEqual(container.querySelector('.dt-double').textContent, '6');
    vm().model.n = 5; await flush();
    assertEqual(vm().double, 10);
    assertEqual(vm().quad, 20);
    assertEqual(container.querySelector('.dt-double').textContent, '10');
    assertThrows(() => { vm().double = 1; }, /read-only/);
    await mod.destroy(); container.remove();
  });

  test('eingehängt liest eine Ableitung t der aktiven Sprache', async () => {
    const { mod, container, vm } = await mount();
    assertEqual(vm().greeting, 'Hallo');
    await mod.destroy(); container.remove();
  });

  test('ein Fehler wird { error } und pflanzt sich in lesende Einträge fort', async () => {
    const { mod, container, vm } = await mount();
    assertDeepEqual(vm().fails, { error: 'kaputt' });
    assertDeepEqual(vm().reader, { error: 'kaputt' });
    await mod.destroy(); container.remove();
  });

  test('read() liefert derived, Massenfelder als Deskriptor, kein computed', async () => {
    const { mod, container, vm } = await mount();
    const r = vm().read();
    assertEqual(r.double, 6);
    assertEqual(r.quad, 12);
    assertEqual('label' in r, false);
    assertDeepEqual(r.rows, { $bulk: true, kind: 'table', rowCount: 1, columns: ['i'] });
    assertDeepEqual(vm().read({ fields: ['rows'] }).rows, [{ i: 3 }]);
    await mod.destroy(); container.remove();
  });

  test('readDetached ist gleich dem gemounteten read() ohne Ansichtsfelder', async () => {
    const { mod, container, vm } = await mount({ n: 3, zoom: 4 });
    const sm = fakeStateManager(null);
    const model = mod.loadDetached({ n: 3, zoom: 4 }, { instanceId: 'dt-2', eventBus: null, stateManager: sm });
    const data = {};
    const mounted = stripPaths(vm().read(), Object.keys(Doc.schema.view));
    assertDeepEqual(mod.readDetached(model, data, undefined, fakeContext().i18n), mounted);
    assertEqual('zoom' in mod.readDetached(model, data, undefined, fakeContext().i18n), false, 'Ansichtsfelder fehlen');
    assertDeepEqual(mod.readDetached(model, data, { fields: ['rows'] }, fakeContext().i18n).rows, [{ i: 3 }]);
    await mod.destroy(); container.remove();
  });

  test('readDetached: asyncTasks im Ruhezustand', async () => {
    const { mod, container, vm } = await mount({ n: 3 }, { asyncTasks: tasks });
    const model = mod.loadDetached({ n: 3 }, { instanceId: 'dt-2', eventBus: null, stateManager: fakeStateManager(null) });
    const detached = mod.readDetached(model, {});
    assertDeepEqual(detached.asyncTasks, { calc: { running: false, progress: null, error: null } });
    assertDeepEqual(detached.asyncTasks, vm().read().asyncTasks);
    await mod.destroy(); container.remove();
  });

  test('ein Zyklus wird { error } wie ohne Mount', async () => {
    const Cyclic = defineModel({
      fields: { n: number({ default: 1 }) },
      derived: {
        double() { return this.n * 2; },
        a(_data, d) { return d.b; },
        b(_data, d) { return d.a; },
      },
    });
    const { mod, container, vm } = await mount({ n: 1 }, { Model: Cyclic, view() { return {}; } });
    const message = 'derived cycle: a → b → a';
    assertDeepEqual(vm().a, { error: message });
    assertDeepEqual(vm().b, { error: message });
    const model = mod.loadDetached({ n: 1 }, { instanceId: 'dt-3', eventBus: null, stateManager: fakeStateManager(null) });
    assertDeepEqual(mod.readDetached(model, {}), vm().read());
    await mod.destroy(); container.remove();
  });

  test('derived liest über src.read und rechnet nach bumpWorksheetRevisions neu (Vorladen)', async () => {
    const Reads = defineModel({
      fields: { n: number({ default: 1 }) },
      derived: { rows(src) { return src.read('ws1', {}).rowCount; } },
    });
    let loaded = false;
    const readSync = (id) => {
      if (!loaded) { const err = new Error('not_loaded: worksheet'); err.code = 'not_loaded'; throw err; }
      return { instanceId: id, rowCount: 7 };
    };
    ensureTemplate();
    const mod = makeModule({ Model: Reads, view() { return {}; } });
    const container = document.createElement('div');
    document.body.append(container);
    const ctx = fakeContext({ n: 1 });
    registerReader(ctx.stateManager, readSync);
    await mod.init(container, ctx);
    await flush();
    const vm = () => Alpine.$data(container.querySelector('[x-data]'));
    assertDeepEqual(vm().rows, { error: 'not_loaded: worksheet' });
    loaded = true;
    bumpWorksheetRevisions();
    await flush();
    assertEqual(vm().rows, 7);
    await mod.destroy(); container.remove();
  });

  test('ctx.source liegt im view-Block, ctx.data gibt es nicht', async () => {
    let seen = null;
    ensureTemplate();
    const mod = makeModule({ view(ctx) { seen = ctx; return {}; } });
    const container = document.createElement('div');
    document.body.append(container);
    const ctx = fakeContext({ n: 1 });
    registerReader(ctx.stateManager, (id) => ({ instanceId: id, rowCount: 2 }));
    await mod.init(container, ctx);
    await flush();
    assertEqual(typeof seen.source.read, 'function');
    assertEqual(typeof seen.source.list, 'function');
    assertEqual(seen.source.read('w').rowCount, 2);
    assertTrue(!('data' in seen), 'ctx.data gibt es nicht mehr');
    await mod.destroy(); container.remove();
  });

  test('m.Model ist die Model-Klasse', () => {
    ensureTemplate();
    assertEqual(makeModule().Model, Doc);
  });

  test('loadDetached: Vorgaben ohne Zustand, Beobachter sendet command:executed mit instanceId', () => {
    ensureTemplate();
    const mod = makeModule();
    const emitted = [];
    const eventBus = { emit: (...args) => emitted.push(args) };
    const model = mod.loadDetached(null, { instanceId: 'dt-9', eventBus, stateManager: fakeStateManager(null) });
    assertEqual(model.n, 1);
    model.setN({ n: 7 });
    assertEqual(model.n, 7);
    assertEqual(emitted.length, 1);
    assertEqual(emitted[0][0], 'command:executed');
    assertEqual(emitted[0][1].instanceId, 'dt-9');
    assertEqual(emitted[0][1].command, 'setN');
  });

  test('ein computed mit dem Namen eines derived wirft beim Anlegen', () => {
    assertThrows(() => makeModule({ view() { return { computed: { double() { return 0; } } }; } }),
      /computed double collides with derived/);
  });

  test('ein view-Glied mit dem Namen eines derived wirft beim Anlegen', () => {
    assertThrows(() => makeModule({ view() { return { quad() { return 0; } }; } }),
      /view member quad collides with derived/);
  });

  test('ein Viewmodel-Kommando mit dem Namen eines derived wirft beim Anlegen', () => {
    assertThrows(() => makeModule({ commands: { rows: command({ run() {} }) } }),
      /command rows collides with derived/);
  });

  test('read-Haken: eingehängtes read() und readDetached lesen über read(model, options)', async () => {
    const calls = [];
    const read = (model, options) => { calls.push(options); return { own: model.n, options: options ?? null }; };
    const { mod, container, vm } = await mount({ n: 3 }, { read });
    assertDeepEqual(vm().read({ columns: ['a'] }), { own: 3, options: { columns: ['a'] } });
    const model = mod.loadDetached({ n: 5 }, { instanceId: 'dt-4', eventBus: null, stateManager: fakeStateManager(null) });
    assertDeepEqual(mod.readDetached(model, {}, { fields: ['x'] }), { own: 5, options: { fields: ['x'] } });
    assertEqual(calls.length, 2);
    await mod.destroy(); container.remove();
  });

  test('readStored-Haken landet am Modul, ohne Haken fehlt er', () => {
    ensureTemplate();
    const readStored = (saved) => ({ saved });
    assertEqual(makeModule({ readStored }).readStored, readStored);
    assertEqual(makeModule().readStored, undefined);
  });

  test('readFields: describe nennt die Felder der eigenen Lesefläche, nur mit read', () => {
    ensureTemplate();
    const readFields = { own: { type: 'number', help: '', bulk: false, derived: true } };
    const mod = makeModule({ read: (m) => ({ own: m.n }), readFields });
    assertDeepEqual(mod.agentEntry.fields, readFields);
    assertEqual(mod.agentEntry.settable.includes('n'), true, 'setzbar bleibt aus dem Schema');
    assertThrows(() => makeModule({ readFields }), /readFields needs read/);
  });

  test('read und readStored müssen Funktionen sein', () => {
    assertThrows(() => makeModule({ read: 1 }), /read must be a function/);
    assertThrows(() => makeModule({ readStored: 'x' }), /readStored must be a function/);
  });

  test('agentEntry kennt derived', () => {
    ensureTemplate();
    const { fields } = makeModule().agentEntry;
    assertEqual(fields.double.derived, true);
    assertDeepEqual([fields.rows.bulk, fields.rows.bulkKind], [true, 'table']);
    assertEqual(fields.label, undefined);
  });
});
