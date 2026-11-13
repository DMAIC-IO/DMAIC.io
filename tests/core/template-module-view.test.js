/**
 * Tests for core/template-module.js in der neuen Form: view(ctx) statt
 * data(), UI-State aus defineState, Ereignis state:changed.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual, assertThrows } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { createModule } from '../../js/core/template-module.js';
import { defineModel, defineState, command, text, oneOf, record } from '../../js/core/model.js';

const Doc = defineModel({ fields: { title: text() } });
const Ui = defineState({ tab: oneOf(['a', 'b']), drafts: record(['x', 'y'], text()) });

const ID = 'view-test';
const TPL_KEY = `js/modules/${ID}/${ID}.html`;

let projectCycle = 'dmaic';
let projectSettings = {};
const busListeners = [];

function ensureTemplate() {
  if (!Alpine.version) Alpine.start();
  if (document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) return;
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', TPL_KEY);
  tpl.innerHTML = '<div x-data="viewTest"><span class="vt-label" x-text="label"></span></div>';
  document.body.append(tpl);
}

let seenCtx = null;

function makeModule(extra = {}) {
  return createModule({
    config: { id: ID, engine: 'alpine', phase: 'define', templateUrl: new URL(TPL_KEY, document.baseURI).href },
    Model: Doc,
    State: Ui,
    view(ctx) {
      seenCtx = ctx;
      return {
        get label() { return `${this.model.title}:${this.state.tab}`; },
        pick(tab) { this.state.tab = tab; },
        init() { this.inited = true; },
      };
    },
    ...extra,
  });
}

function fakeContext({ events, notified }) {
  return {
    instanceId: 'vt-1',
    instances: Object.freeze({ list: () => [], read: async () => ({}), interact: async () => ({ ok: true }) }),
    stateManager: { getModuleState: () => ({ title: 'abc' }), setModuleState: () => {}, getProjectCycle: () => projectCycle, get: (k) => projectSettings[k] },
    i18n: { t: k => k, tf: () => k => k, getLanguage: () => 'de' },
    eventBus: {
      on: (name, fn) => busListeners.push([name, fn]),
      off: (name, fn) => { const i = busListeners.findIndex(([n, f]) => n === name && f === fn); if (i >= 0) busListeners.splice(i, 1); },
      emit: (name, payload) => { events.push([name, payload]); for (const [n, f] of [...busListeners]) if (n === name) f(payload); },
    },
    notify: (...args) => notified.push(args),
    dialog: { confirm: async () => true },
    theme: 'light',
    language: 'de',
  };
}

const mounted = [];
const flush = () => new Promise(r => setTimeout(r, 0));

async function mount(extra) {
  ensureTemplate();
  while (mounted.length) mounted.pop().remove();
  const events = []; const notified = [];
  const context = fakeContext({ events, notified });
  const mod = makeModule(extra);
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container);
  await mod.init(container, context);
  await flush();
  return { context, container, events, notified, data: () => Alpine.$data(container.querySelector('[x-data]')) };
}

suite('createModule mit view(ctx) und State', () => {
  test('state je Komponente aus State.create(), Getter sieht model und state', async () => {
    const { container, data } = await mount();
    assertEqual(container.querySelector('.vt-label').textContent, 'abc:a');
    assertDeepEqual({ ...data().state }, { tab: 'a', drafts: { x: '', y: '' } });
    assertEqual(data().moduleId, ID);
  });

  test('ctx: Kontextdienste und Kennungen, kein module', async () => {
    const { context, notified } = await mount();
    assertDeepEqual(Object.keys(seenCtx).sort(), ['context', 'cssVars', 'data', 'dialog', 'eventBus', 'i18n', 'instanceId', 'instances', 'moduleId', 'notify', 'openDialog']);
    assertEqual(seenCtx.context, context);
    assertEqual(seenCtx.instances, context.instances);
    assertEqual(seenCtx.dialog, context.dialog);
    assertEqual(seenCtx.instanceId, 'vt-1');
    assertEqual(seenCtx.moduleId, ID);
    seenCtx.notify('m', 'error');
    assertDeepEqual(notified, [['m', 'error']]);
  });

  test('ctx.openDialog ist eine Funktion', async () => {
    await mount();
    assertEqual(typeof seenCtx.openDialog, 'function');
  });

  test('init aus dem view-Block läuft', async () => {
    const { data } = await mount();
    assertEqual(data().inited, true);
  });

  test('state:changed bei flachem Schreiben', async () => {
    const { data, events } = await mount();
    data().pick('b');
    await flush();
    const hit = events.find(([n, p]) => n === 'state:changed' && p.key === 'tab');
    assertDeepEqual(hit[1], { instanceId: 'vt-1', key: 'tab', value: 'b' });
  });

  test('state:changed bei verschachteltem Schreiben, Wert als Kopie', async () => {
    const { data, events } = await mount();
    data().state.drafts.x = 'neu';
    await flush();
    const hit = events.find(([n, p]) => n === 'state:changed' && p.key === 'drafts');
    assertDeepEqual(hit[1].value, { x: 'neu', y: '' });
    data().state.drafts.y = 'z';
    assertEqual(hit[1].value.y, '', 'gemeldeter Wert ist eine Kopie');
  });

  test('view ohne State: state ist {}, kein state:changed', async () => {
    const { data, events } = await mount({ State: undefined });
    assertDeepEqual({ ...data().state }, {});
    assertTrue(!events.some(([n]) => n === 'state:changed'));
  });

  test('data und view zusammen wirft', () => {
    assertThrows(() => createModule({ config: { id: 'x-both', engine: 'alpine' }, Model: Doc,
      data: () => ({}), view: () => ({}) }), /^createModule\(x-both\): data and view are mutually exclusive$/);
  });

  test('State ohne view wirft', () => {
    assertThrows(() => createModule({ config: { id: 'x-state', engine: 'alpine' }, Model: Doc, State: Ui,
      data: () => ({}) }), /^createModule\(x-state\): State requires view$/);
  });

  test('_ui: Griff der Kommando-Primitive mit reaktivem Model, Diensten und forms', async () => {
    const forms = { NoteForm: { schema: { fields: {} } } };
    const { data, context, container, notified } = await mount({ forms });
    const ui = data()._ui;
    // Alpines Reaktivität hüllt Objekte ein; Identität prüft das Rohobjekt.
    const raw = Alpine.raw(ui);
    assertEqual(ui.moduleId, ID);
    assertEqual(raw.forms, forms);
    assertEqual(raw.dialog, context.dialog);
    assertEqual(raw.i18n, context.i18n);
    ui.notify('kaputt', 'error');
    assertDeepEqual(notified.at(-1), ['kaputt', 'error']);
    ui.model.title = 'neu';
    await flush();
    assertEqual(container.querySelector('.vt-label').textContent, 'neu:a');
  });

  test('services.instances is ctx.instances', async () => {
    const { data, context } = await mount();
    assertEqual(Alpine.raw(data()._ui.services).instances, context.instances);
  });

  test('_ui: ohne forms ein leeres Objekt', async () => {
    const { data } = await mount();
    assertDeepEqual(data()._ui.forms, {});
  });

  test('Aufräumen: gemountete Container entfernen', () => {
    while (mounted.length) mounted.pop().remove();
    assertEqual(mounted.length, 0);
  });
});

suite('createModule: Kontext des Models', () => {
  test('Zyklus beim Anlegen, Wechsel per cycle:changed, Abmelden beim Abbau', async () => {
    projectCycle = 'eightd';
    busListeners.length = 0;
    const { data, context, container } = await mount();
    await flush();
    assertEqual(busListeners.filter(([n]) => n === 'cycle:changed').length, 1);
    assertEqual(data().model.context.cycle, 'eightd');
    assertEqual(data()._ui.instanceId, 'vt-1');
    projectCycle = 'dmadv';
    context.eventBus.emit('cycle:changed', { from: 'eightd', to: 'dmadv' });
    assertEqual(data().model.context.cycle, 'dmadv');
    Alpine.destroyTree(container);
    assertEqual(busListeners.filter(([n]) => n === 'cycle:changed').length, 0);
    projectCycle = 'dmaic';
  });

  test('settings:changed setzt Konfidenzniveau und Teststärke neu', async () => {
    projectSettings = { 'settings.confidenceLevel': 95 };
    const { data, context } = await mount();
    assertEqual(data().model.context.confidenceLevel, 95);
    projectSettings = { 'settings.confidenceLevel': 90, 'settings.power': 85 };
    context.eventBus.emit('settings:changed', { key: 'confidenceLevel', value: 90 });
    assertEqual(data().model.context.confidenceLevel, 90);
    assertEqual(data().model.context.power, 85);
    projectSettings = {};
  });
});

suite('createModule: computed im view-Block', () => {
  test('this.<name> liest das computed, neu nach Model-Änderung', async () => {
    let runs = 0;
    const { data } = await mount({
      view() {
        return {
          computed: { shout() { runs += 1; return String(this.model.title).toUpperCase(); } },
          get label() { return this.shout; },
        };
      },
    });
    assertEqual(data().label, 'ABC');
    data().model.title = 'xy';
    await flush();
    assertEqual(data().shout, 'XY');
    assertEqual(runs, 2);
  });

  test('Name eines computed kollidiert mit einem Glied → wirft beim Anlegen', () => {
    assertThrows(() => makeModule({ view() { return { computed: { label() { return 1; } }, get label() { return 2; } }; } }),
      /computed label collides/);
  });

  test('read() enthält kein computed, das Viewmodel liest es weiter', async () => {
    const { data } = await mount({
      view() { return { computed: { shout() { return { text: String(this.model.title) }; } } }; },
    });
    assertDeepEqual(data().shout, { text: 'abc' });
    assertEqual('shout' in data().read(), false);
  });

  test('agentEntry kennt ein computed nicht als Lesefeld', () => {
    const entry = makeModule({ view() { return { computed: { a() { return 1; } } }; } }).agentEntry;
    assertEqual(entry.fields.a, undefined);
  });

  test('readComputed als Option wirft', () => {
    assertThrows(() => makeModule({ readComputed: ['a'], view() { return { computed: { a() { return 1; } } }; } }),
      /createModule\(view-test\): readComputed is gone — computed is not readable$/);
  });

  test('readBulk als Option wirft', () => {
    assertThrows(() => makeModule({ readBulk: [], view() { return {}; } }),
      /createModule\(view-test\): readBulk is gone — use derivedBulk in the Model$/);
  });

  test('computed muss eine Funktion sein — beim Anlegen', () => {
    assertThrows(() => makeModule({ view() { return { computed: { a: 1 } }; } }), /createModule\(view-test\): computed a must be a function$/);
  });

  for (const name of ['cssVars', 'changeRoute', '_ui', 'init', 'destroy', '_asyncTasks', '_asyncTaskHost', 'asyncTasks', 'moduleId']) {
    test(`computed ${name} kollidiert beim Anlegen`, () => {
      assertThrows(() => makeModule({ view() { return { computed: { [name]() { return 1; } } }; } }), new RegExp(`computed ${name} collides`));
    });
  }

  test('view-Glied moduleId wirft lesbar statt „Cannot redefine property“', () => {
    assertThrows(() => makeModule({ view() { return { moduleId: 'x' }; } }), /createModule\(view-test\): view member moduleId is reserved$/);
  });

  test('Feld mit dem Namen eines computed wirft', () => {
    assertThrows(() => makeModule({ view() { return { computed: { title() { return 1; } } }; } }), /createModule\(view-test\): field title collides with computed$/);
  });

  test('view liest ctx beim Anlegen nicht', () => {
    assertThrows(() => makeModule({ view(ctx) { void ctx.data; return {}; } }),
      /createModule\(view-test\): view\(ctx\) reads ctx\.data while the module is created — read ctx only inside members$/);
  });

  test('destroy gibt die Effects frei', async () => {
    let runs = 0;
    const { data, container } = await mount({
      view() { return { computed: { c() { runs += 1; return this.model.title; } } }; },
    });
    const vm = data();
    Alpine.destroyTree(container.querySelector('[x-data]'));
    vm.model.title = 'neu';
    await flush();
    assertEqual(runs, 1);
  });
});

const DocCmd = defineModel({
  fields: { title: text() },
  view: { zoom: text() },
  commands: { addItem: command({ run() {} }) },
});

suite('createModule: view-Block aus Teilen', () => {
  test('view: [a, b] — Glieder und computed beider Teile in der Komponente', async () => {
    const a = () => ({ x() { return 'x'; }, computed: { upper() { return String(this.model.title).toUpperCase(); } } });
    const b = () => ({ get y() { return `${this.upper}!`; }, computed: { len() { return String(this.model.title).length; } } });
    const { data } = await mount({ view: [a, b] });
    assertEqual(data().x(), 'x');
    assertEqual(data().y, 'ABC!');
    assertEqual(data().len, 3);
    data().model.title = 'wxyz';
    await flush();
    assertEqual(data().upper, 'WXYZ');
    assertEqual(data().len, 4);
  });

  test('Teile bekommen denselben ctx', async () => {
    const seen = [];
    await mount({ view: [(ctx) => { seen.push(ctx); return {}; }, (ctx) => { seen.push(ctx); return {}; }] });
    // je zwei Aufrufe: Probe beim Anlegen (wirft bei Zugriff) und Mount
    assertEqual(seen.length, 4);
    assertEqual(seen[2].instanceId, 'vt-1');
    assertEqual(seen[3].moduleId, ID);
  });

  test('doppeltes Glied über Teile wirft, nennt beide Teile', () => {
    assertThrows(() => makeModule({ view: [() => ({ x() {} }), () => ({ get x() { return 1; } })] }),
      /createModule\(view-test\): view\[1\] member x collides with view\[0\] member$/);
  });

  test('doppeltes computed über Teile wirft, nennt beide Teile', () => {
    assertThrows(() => makeModule({ view: [() => ({ computed: { c() { return 1; } } }), () => ({ computed: { c() { return 2; } } })] }),
      /createModule\(view-test\): view\[1\] computed c collides with view\[0\] computed$/);
  });

  test('Glied gegen computed eines anderen Teils wirft, in beide Richtungen', () => {
    assertThrows(() => makeModule({ view: [() => ({ computed: { c() { return 1; } } }), () => ({ c() {} })] }),
      /createModule\(view-test\): view\[1\] member c collides with view\[0\] computed$/);
    assertThrows(() => makeModule({ view: [() => ({ c() {} }), () => ({ computed: { c() { return 1; } } })] }),
      /createModule\(view-test\): view\[1\] computed c collides with view\[0\] member$/);
  });

  test('init und destroy je Teil: init in Reihenfolge, destroy umgekehrt', async () => {
    const calls = [];
    const part = (n) => () => ({ init() { calls.push(`init ${n}`); }, destroy() { calls.push(`destroy ${n}`); } });
    const { container } = await mount({ view: [part('a'), part('b')] });
    assertDeepEqual(calls, ['init a', 'init b']);
    Alpine.destroyTree(container.querySelector('[x-data]'));
    assertDeepEqual(calls, ['init a', 'init b', 'destroy b', 'destroy a']);
  });

  test('Einzelfunktion verhält sich wie bisher', async () => {
    const { data } = await mount();
    assertEqual(data().label, 'abc:a');
    assertEqual(data().inited, true);
  });

  test('leere Liste und Teil ohne Funktion werfen', () => {
    assertThrows(() => makeModule({ view: [] }), /createModule\(view-test\): view must not be an empty list$/);
    assertThrows(() => makeModule({ view: [() => ({}), 1] }), /createModule\(view-test\): view\[1\] must be a function$/);
  });
});

suite('createModule: Kollisionen des view-Blocks, auch ohne Tasks', () => {
  const make = (view, extra = {}) => createModule({
    config: { id: ID, engine: 'alpine', phase: 'define', templateUrl: new URL(TPL_KEY, document.baseURI).href },
    Model: DocCmd,
    view,
    ...extra,
  });

  test('Glied mit dem Namen eines Model-Kommandos wirft', () => {
    assertThrows(() => make(() => ({ addItem() {} })), /createModule\(view-test\): view member addItem collides with model command$/);
  });

  test('Glied mit dem Namen eines Felds wirft', () => {
    assertThrows(() => make(() => ({ get title() { return 1; } })), /createModule\(view-test\): view member title collides with field$/);
  });

  test('Glied mit dem Namen eines Ansichtsfelds wirft', () => {
    assertThrows(() => make(() => ({ zoom() {} })), /createModule\(view-test\): view member zoom collides with view field$/);
  });

  test('Glied mit dem Namen eines Viewmodel-Kommandos wirft (statt still zu überschreiben)', () => {
    assertThrows(() => make(() => ({ rename() {} }), { commands: { rename: command({ run() {} }) } }),
      /createModule\(view-test\): view member rename collides with viewmodel command$/);
  });

  test('computed mit dem Namen eines Kommandos wirft', () => {
    assertThrows(() => make(() => ({ computed: { addItem() { return 1; } } })),
      /createModule\(view-test\): computed addItem collides with model command$/);
  });

  test('Kollision in einem späteren Teil nennt den Teil', () => {
    assertThrows(() => make([() => ({}), () => ({ addItem() {} })]),
      /createModule\(view-test\): view\[1\] member addItem collides with model command$/);
  });
});
