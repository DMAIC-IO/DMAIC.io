/**
 * createModule mit derived im Model: Zellen im Viewmodel, read(), loadDetached/readDetached.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertThrows } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { createModule } from '../../js/core/template-module.js';
import { asyncTask } from '../../js/core/async-task.js';
import { defineModel, number, command } from '../../js/core/model.js';
import { stripPaths } from '../../js/core/view-fields.js';

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
    i18n: { t: (k) => k, tf: () => (k) => k, getLanguage: () => 'de' },
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
    assertDeepEqual(mod.readDetached(model, data), mounted);
    assertEqual('zoom' in mod.readDetached(model, data), false, 'Ansichtsfelder fehlen');
    assertDeepEqual(mod.readDetached(model, data, { fields: ['rows'] }).rows, [{ i: 3 }]);
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

  test('agentEntry kennt derived', () => {
    ensureTemplate();
    const { fields } = makeModule().agentEntry;
    assertEqual(fields.double.derived, true);
    assertDeepEqual([fields.rows.bulk, fields.rows.bulkKind], [true, 'table']);
    assertEqual(fields.label, undefined);
  });
});
