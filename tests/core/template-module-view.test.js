/**
 * Tests for core/template-module.js in der neuen Form: view(ctx) statt
 * data(), UI-State aus defineState, Ereignis state:changed.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual, assertThrows } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { createModule } from '../../js/core/template-module.js';
import { defineModel, defineState, text, oneOf, record } from '../../js/core/model.js';

const Doc = defineModel({ fields: { title: text() } });
const Ui = defineState({ tab: oneOf(['a', 'b']), drafts: record(['x', 'y'], text()) });

const ID = 'view-test';
const TPL_KEY = `js/modules/${ID}/${ID}.html`;

let projectCycle = 'dmaic';
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
    stateManager: { getModuleState: () => ({ title: 'abc' }), setModuleState: () => {}, getProjectCycle: () => projectCycle },
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
    assertDeepEqual(Object.keys(seenCtx).sort(), ['context', 'cssVars', 'dialog', 'eventBus', 'i18n', 'instanceId', 'moduleId', 'notify']);
    assertEqual(seenCtx.context, context);
    assertEqual(seenCtx.dialog, context.dialog);
    assertEqual(seenCtx.instanceId, 'vt-1');
    assertEqual(seenCtx.moduleId, ID);
    seenCtx.notify('m', 'error');
    assertDeepEqual(notified, [['m', 'error']]);
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
});
