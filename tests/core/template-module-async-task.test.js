/**
 * createModule mit asyncTasks: Werte, Status, read(), Abbau, Neuaufbau.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, assertThrows } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { createModule } from '../../js/core/template-module.js';
import { asyncTask, defineAsyncTaskSlots, createAsyncTasks } from '../../js/core/async-task.js';
import { defineComputedSlots, bindComputed } from '../../js/core/computed.js';
import { defineModel, number } from '../../js/core/model.js';

const Doc = defineModel({ fields: { a: number({ default: 1 }) } });
const ID = 'task-test';
const TPL_KEY = `js/modules/${ID}/${ID}.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));

function ensureTemplate() {
  if (!Alpine.version) Alpine.start();
  if (document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) return;
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', TPL_KEY);
  tpl.innerHTML = '<div x-data="taskTest"><span class="tt-twice" x-text="twice"></span></div>';
  document.body.append(tpl);
}

function fakeContext(notified) {
  return {
    instanceId: 'tt-1',
    stateManager: { getModuleState: () => ({ a: 2 }), setModuleState: () => {}, getProjectCycle: () => 'dmaic', get: () => undefined },
    i18n: { t: (k) => k, tf: () => (k) => k, getLanguage: () => 'de' },
    eventBus: { on: () => {}, off: () => {}, emit: () => {} },
    notify: (...args) => notified.push(args),
    dialog: { confirm: async () => true },
    theme: 'light', language: 'de',
  };
}

const gates = [];
let autoStarts = 0;
const tasks = {
  calc: asyncTask({
    params: { n: number({ min: 0 }) },
    blocked() { return this.model.a < 0 ? 'negativ' : null; },
    async run({ n }) { return this.model.a + (n ?? 0); },
  }),
  twice: asyncTask({
    auto: true,
    async run() {
      autoStarts += 1;
      const a = this.model.a;
      await new Promise((r) => gates.push(r));
      return a * 2;
    },
  }),
};

async function mount(extra = {}) {
  ensureTemplate();
  const notified = [];
  const mod = createModule({
    config: { id: ID, engine: 'alpine', phase: 'define', templateUrl: new URL(TPL_KEY, document.baseURI).href },
    Model: Doc,
    asyncTasks: tasks,
    view() { return {}; },
    ...extra,
  });
  const container = document.createElement('div');
  document.body.append(container);
  await mod.init(container, fakeContext(notified));
  await flush();
  return { mod, container, notified, vm: () => Alpine.$data(container.querySelector('[x-data]')) };
}

suite('createModule mit asyncTasks', () => {
  test('auto-Wert im Template, Neustart bei Änderung', async () => {
    gates.length = 0; autoStarts = 0;
    const { mod, container, vm } = await mount();
    gates.splice(0).forEach((r) => r()); await flush();
    assertEqual(container.querySelector('.tt-twice').textContent, '4');
    vm().model.a = 5; await flush();
    gates.splice(0).forEach((r) => r()); await flush();
    assertEqual(vm().twice, 10);
    await mod.destroy(); container.remove();
  });

  test('manueller Start über den Griff, Prüfung der Parameter', async () => {
    const { mod, container, vm } = await mount();
    assertDeepEqual(await vm()._asyncTaskHost.start('calc', { n: 3 }), { status: 'done', value: 5 });
    assertEqual(vm().calc, 5);
    const bad = await vm()._asyncTaskHost.start('calc', { n: -1 });
    assertEqual(bad.status, 'rejected');
    await mod.destroy(); container.remove();
  });

  test('asyncTasks im Template lesbar, nur lesbar', async () => {
    gates.length = 0;
    const { mod, container, vm } = await mount();
    assertEqual(vm().asyncTasks.twice.running, true);
    assertEqual(vm().asyncTasks.calc.running, false);
    gates.splice(0).forEach((r) => r()); await flush();
    assertEqual(vm().asyncTasks.twice.running, false);
    const pending = vm()._asyncTaskHost.start('calc', { n: 1 });
    assertEqual(vm().asyncTasks.calc.running, true);
    await pending;
    assertEqual(vm().asyncTasks.calc.running, false);
    assertThrows(() => { vm().asyncTasks = {}; });
    await mod.destroy(); container.remove();
  });

  test('ohne asyncTasks fehlt das Glied', async () => {
    const { mod, container, vm } = await mount({ asyncTasks: undefined });
    assertEqual(Object.hasOwn(vm(), 'asyncTasks'), false);
    await mod.destroy(); container.remove();
  });

  test('read() liefert asyncTasks', async () => {
    gates.length = 0;
    const { mod, container, vm } = await mount();
    gates.splice(0).forEach((r) => r()); await flush();
    const r = vm().read();
    assertDeepEqual(r.asyncTasks, {
      calc: { running: false, progress: null, error: null },
      twice: { running: false, progress: null, error: null, value: 4 },
    });
    await mod.destroy(); container.remove();
  });

  test('Sprachwechsel: alter Lauf verworfen, auto startet neu', async () => {
    gates.length = 0; autoStarts = 0;
    const { mod, container, vm } = await mount();
    const oldGate = gates.shift();
    mod.onLanguageChange(); await flush();
    assertEqual(autoStarts, 2);
    oldGate(); await flush();
    assertEqual(vm().twice, null, 'Ergebnis des alten Laufs kommt nicht an');
    gates.splice(0).forEach((r) => r()); await flush();
    assertEqual(vm().twice, 4);
    await mod.destroy(); container.remove();
  });

  test('Sprachwechsel bricht das Signal des alten Laufs ab', async () => {
    const signals = [];
    const { mod, container } = await mount({ asyncTasks: {
      twice: asyncTask({ auto: true, async run(_a, { signal }) { signals.push(signal); await new Promise(() => {}); } }),
    } });
    assertEqual(signals.length, 1);
    assertEqual(signals[0].aborted, false);
    mod.onLanguageChange(); await flush();
    assertEqual(signals.length, 2);
    assertEqual(signals[0].aborted, true, 'alter Lauf beim Neuaufbau abgebrochen');
    assertEqual(signals[1].aborted, false);
    await mod.destroy(); container.remove();
    assertEqual(signals[1].aborted, true, 'destroy bricht den laufenden Lauf ab');
  });

  test('ein Task-Wert lässt sich am Viewmodel nicht schreiben', async () => {
    const { mod, container, vm } = await mount();
    assertThrows(() => { vm().twice = 5; }, /asyncTask twice is read-only/);
    assertThrows(() => { vm().calc = 5; }, /asyncTask calc is read-only/);
    await mod.destroy(); container.remove();
  });

  test('blocked() eines deklarierten Tasks läuft mit this.model und sperrt den Start', async () => {
    const { mod, container, vm } = await mount();
    vm().model.a = -1;
    assertEqual(vm()._asyncTaskHost.blockedReason('calc'), 'negativ');
    assertEqual((await vm()._asyncTaskHost.start('calc', { n: 1 })).status, 'rejected');
    vm().model.a = 3;
    assertEqual(vm()._asyncTaskHost.blockedReason('calc'), null);
    await mod.destroy(); container.remove();
  });

  test('destroy gibt die Beobachter frei', async () => {
    gates.length = 0; autoStarts = 0;
    const { mod, container, vm } = await mount();
    const model = vm().model;
    await mod.destroy();
    model.a = 9; await flush();
    assertEqual(autoStarts, 1);
    container.remove();
  });

  test('Prüfungen beim Erzeugen', () => {
    const base = { config: { id: ID, engine: 'alpine', phase: 'define', templateUrl: new URL(TPL_KEY, document.baseURI).href }, Model: Doc };
    assertThrows(() => createModule({ ...base, asyncTasks: tasks }), /asyncTasks needs view/);
    assertThrows(() => createModule({ ...base, view() { return {}; }, asyncTasks: { x: { run() {} } } }), /asyncTasks.x is not an asyncTask/);
    assertThrows(() => createModule({ ...base, view() { return {}; }, asyncTasks: { a: tasks.calc } }), /asyncTask a collides with field/);
  });

  test('Kollision mit einem Glied des view-Blocks wirft beim Anlegen', () => {
    assertThrows(() => createModule({
      config: { id: ID, engine: 'alpine', phase: 'define', templateUrl: new URL(TPL_KEY, document.baseURI).href },
      Model: Doc, asyncTasks: { calc: tasks.calc },
      view() { return { get calc() { return 1; } }; },
    }), /createModule\(task-test\): asyncTask calc collides with view member$/);
  });

  test('Kollision mit einem computed oder reservierten Namen wirft beim Anlegen', () => {
    const base = { config: { id: ID, engine: 'alpine', phase: 'define', templateUrl: new URL(TPL_KEY, document.baseURI).href }, Model: Doc };
    assertThrows(() => createModule({ ...base, asyncTasks: { calc: tasks.calc }, view() { return { computed: { calc() { return 1; } } }; } }),
      /createModule\(task-test\): asyncTask calc collides with computed$/);
    assertThrows(() => createModule({ ...base, asyncTasks: { init: tasks.calc }, view() { return {}; } }),
      /createModule\(task-test\): asyncTask init collides with view member$/);
    assertThrows(() => createModule({ ...base, asyncTasks: { asyncTasks: tasks.calc }, view() { return {}; } }),
      /createModule\(task-test\): asyncTask asyncTasks collides with view member$/);
  });

  test('Kollision mit einem Kommando wirft beim Anlegen', () => {
    const WithCmd = defineModel({ fields: { a: number({ default: 1 }) }, commands: { calc: { run() {} } } });
    assertThrows(() => createModule({
      config: { id: ID, engine: 'alpine', phase: 'define', templateUrl: new URL(TPL_KEY, document.baseURI).href },
      Model: WithCmd, asyncTasks: { calc: tasks.calc }, view() { return {}; },
    }), /createModule\(task-test\): asyncTask calc collides with command$/);
  });

  test('Tasks ohne defineModel-Model werfen beim Anlegen', () => {
    assertThrows(() => createModule({
      config: { id: ID, engine: 'alpine', phase: 'define', templateUrl: new URL(TPL_KEY, document.baseURI).href },
      asyncTasks: { calc: tasks.calc }, view() { return {}; },
    }), /createModule\(task-test\): asyncTasks need a defineModel Model$/);
  });

  test('ein Feld namens asyncTasks wirft beim Anlegen', () => {
    const Bad = defineModel({ fields: { asyncTasks: number({ default: 1 }) } });
    assertThrows(() => createModule({
      config: { id: ID, engine: 'alpine', phase: 'define', templateUrl: new URL(TPL_KEY, document.baseURI).href },
      Model: Bad, asyncTasks: { calc: tasks.calc }, view() { return {}; },
    }), /createModule\(task-test\): field asyncTasks is reserved$/);
  });

  test('ein Feld namens init wirft beim Anlegen, auch ohne asyncTasks', () => {
    const Bad = defineModel({ fields: { init: number({ default: 1 }) } });
    assertThrows(() => createModule({
      config: { id: ID, engine: 'alpine', phase: 'define', templateUrl: new URL(TPL_KEY, document.baseURI).href },
      Model: Bad, view() { return {}; },
    }), /createModule\(task-test\): field init is reserved$/);
  });

  test('view().init() sieht den Task-Host', async () => {
    let seen = null;
    const { mod, container } = await mount({ view() { return { init() { seen = this._asyncTaskHost; } }; } });
    assertTrue(seen !== null && typeof seen.start === 'function', String(seen));
    await mod.destroy(); container.remove();
  });
});

suite('asyncTask: auto-Start in Alpines Durchlauf', () => {
  test('ein Leser, der im selben Durchlauf schon lief, sieht den Laufzustand eines Neustarts', async () => {
    // reader und der auto-Effect hängen an model.a; reader steht vorn in der
    // Warteschlange und liest busy, bevor der Neustart den Laufzustand setzt.
    // Schriebe der Start im Effect, verwürfe Alpine den Weckruf an reader, und
    // busy bliebe für ihn veraltet (verborgene Regression im Planer-Fall).
    const comp = { model: { a: 1 } };
    defineAsyncTaskSlots(comp, ['live']);
    defineComputedSlots(comp, ['busy']);
    const vm = Alpine.reactive(comp);
    const releaseComputed = bindComputed(Alpine, vm, { busy() { return this._asyncTasks.live.running; } });
    let seen = '';
    const reader = Alpine.effect(() => { seen = `${vm.model.a}:${vm.busy}`; });
    let first = true;
    const host = createAsyncTasks({
      defs: { live: asyncTask({ auto: true, run() {
        void this.model.a;
        if (first) { first = false; return null; }
        return new Promise(() => {});
      } }) },
      vm, reactivity: { effect: Alpine.effect, release: Alpine.release }, checkArgs: () => ({}),
    });
    await flush();
    assertEqual(seen, '1:false');
    vm.model.a = 2;
    await flush();
    await flush();
    assertEqual(vm._asyncTasks.live.running, true);
    assertEqual(seen, '2:true');
    host.release();
    Alpine.release(reader);
    releaseComputed();
  });
});
