/**
 * createModule({ history }) — Verlauf je Modulinstanz im Kern.
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { createModule } from '../../js/core/template-module.js';
import { defineModel, command, text, number } from '../../js/core/model.js';

const Doc = defineModel({
  fields: { name: text({ default: '' }), n: number({ default: 0 }) },
  commands: { inc: command({ params: {}, run() { this.n += 1; } }) },
});

let seq = 0;
const stored = {};
const busListeners = [];

function fakeContext(instanceId) {
  return {
    instanceId,
    stateManager: {
      getModuleState: (id) => stored[id] ?? { name: 'start', n: 0 },
      setModuleState: (id, s) => { stored[id] = JSON.parse(JSON.stringify(s)); },
      getProjectCycle: () => 'dmaic',
      get: () => undefined,
    },
    i18n: { t: (k) => k, tf: () => (k) => k, getLanguage: () => 'de' },
    eventBus: { on: (n, f) => busListeners.push([n, f]), off: () => {}, emit: () => {} },
    notify: () => {},
    dialog: { confirm: async () => true },
    theme: 'light',
    language: 'de',
  };
}

// Alpine.nextTick löst die Sperrflags erst nach einem setTimeout: zwei Takte abwarten.
const flush = async () => { await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0)); };
const mounted = [];

async function mount(history) {
  if (!Alpine.version) Alpine.start();
  const id = `hist-test-${++seq}`;
  const key = `js/modules/${id}/${id}.html`;
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', key);
  const comp = `histTest${seq}`;
  tpl.innerHTML = `<div x-data="${comp}"><input class="f" x-model="model.name"><span x-text="model.n"></span></div>`;
  document.body.append(tpl);
  const mod = createModule({
    config: { id, engine: 'alpine', phase: 'define', templateUrl: new URL(key, document.baseURI).href },
    Model: Doc,
    view() { return {}; },
    ...(history === undefined ? {} : { history }),
  });
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container, tpl);
  const context = fakeContext(`h${seq}`);
  await mod.init(container, context);
  await flush();
  const data = () => Alpine.$data(container.querySelector('[x-data]'));
  return { mod, container, context, data };
}

suite('createModule history', () => {
  test('Kommando erzeugt einen Schritt, gleicher Stand keinen zweiten', async () => {
    const { mod, data } = await mount({ depth: 3 });
    assertEqual(mod.historyCan('undo'), false);
    data().model.inc({});
    await flush();
    assertEqual(mod.historyCan('undo'), true);
    data().model.name = 'start';
    data().model.n = 1;
    await flush();
    assertTrue(mod.historyStep('undo'));
    assertEqual(data().model.n, 0);
    assertEqual(mod.historyCan('undo'), false, 'gleicher Stand erzeugte keinen zweiten Schritt');
  });

  test('Tippen im Feld: focusin bis focusout ist ein Schritt', async () => {
    const { mod, container, data } = await mount(true);
    const input = container.querySelector('.f');
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    for (const v of ['a', 'ab', 'abc']) { data().model.name = v; await flush(); }
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    assertTrue(mod.historyStep('undo'));
    assertEqual(data().model.name, 'start');
    assertEqual(mod.historyCan('undo'), false);
    assertTrue(mod.historyStep('redo'));
    assertEqual(data().model.name, 'abc');
  });

  test('Rückgängig bei noch gesetztem Fokus: ein Schritt, Text ganz weg, Wiederholen bringt ihn zurück', async () => {
    const { mod, container, data } = await mount(true);
    const input = container.querySelector('.f');
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    data().model.name = 'getippt'; await flush();
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    mod.historyStep('undo');
    await flush();
    assertEqual(data().model.name, 'start');
    mod.historyStep('redo');
    await flush();
    assertEqual(data().model.name, 'getippt');
  });

  test('historyStep schreibt ins lebende Model zurück: kein Remount, persistiert, kein neuer Schritt', async () => {
    const { mod, container, context, data } = await mount(true);
    const root = container.querySelector('[x-data]');
    data().marker = 'same';
    data().model.inc({});
    await flush();
    assertEqual(stored[context.instanceId].n, 1);
    assertTrue(mod.historyStep('undo'));
    await flush();
    assertEqual(container.querySelector('[x-data]'), root, 'dasselbe Element');
    assertEqual(data().marker, 'same', 'dieselbe Komponente');
    assertEqual(data().model.n, 0);
    assertEqual(stored[context.instanceId].n, 0);
    assertEqual(stored[context.instanceId].name, 'start');
    assertEqual(mod.historyCan('undo'), false);
    assertEqual(mod.historyCan('redo'), true);
    assertEqual(mod._history.canUndo, false, 'Zurückschreiben erzeugte keinen Schritt');
  });

  test('_historyFlags folgt dem Verlauf', async () => {
    const { mod, data } = await mount(true);
    assertEqual(mod._historyFlags.canUndo, false);
    data().model.inc({});
    await flush();
    assertEqual(mod._historyFlags.canUndo, true);
    mod.historyStep('undo');
    assertEqual(mod._historyFlags.canUndo, false);
    assertEqual(mod._historyFlags.canRedo, true);
  });

  test('setState, loadExample und applyRemoteState leeren den Verlauf', async () => {
    const { mod, data } = await mount(true);
    data().model.inc({}); await flush();
    assertTrue(mod.historyCan('undo'), 'stelle 1');
    mod.setState({ name: 'x', n: 5 });
    await flush();
    assertEqual(mod.historyCan('undo'), false);

    data().model.inc({}); await flush();
    assertTrue(mod.historyCan('undo'), 'stelle 2');
    mod.applyRemoteState({ name: 'r', n: 9 });
    await flush();
    assertEqual(mod.historyCan('undo'), false);
    assertEqual(data().model.n, 9);

    data().model.inc({}); await flush();
    assertTrue(mod.historyCan('undo'), 'stelle 3');
    await mod.loadExample?.({ data: { name: 'e', n: 2 }, meta: { id: 'e' } });
    await flush();
    assertEqual(mod.historyCan('undo'), false);
  });

  test('ohne history: kein Verlauf, kein Aufzeichnen', async () => {
    const { mod, data } = await mount(undefined);
    data().model.inc({}); await flush();
    assertEqual(mod.historyCan('undo'), false);
    assertEqual(mod.historyStep('undo'), false);
    assertEqual(mod._history ?? null, null);
  });

  test('destroy verwirft den Verlauf', async () => {
    const { mod, data } = await mount(true);
    data().model.inc({}); await flush();
    await mod.destroy();
    assertEqual(mod.historyCan('undo'), false);
  });

  test('abgeschlossenes Projekt: historyStep schreibt nichts zurück', async () => {
    const { mod, context, data } = await mount(true);
    data().model.name = 'neu'; await flush();
    context.stateManager.isCompleted = () => true;
    assertEqual(mod.historyStep('undo'), false);
    assertEqual(data().model.name, 'neu');
  });

  test('historyBegin/historyEnd: zwei Kommandos sind ein Schritt', async () => {
    const { mod, data } = await mount(true);
    mod.historyBegin();
    data().model.inc({}); await flush();
    data().model.inc({}); await flush();
    mod.historyEnd();
    assertTrue(mod.historyCan('undo'), 'die Flags folgen dem Schließen');
    assertTrue(mod.historyStep('undo'));
    await flush();
    assertEqual(data().model.n, 0);
    assertEqual(mod.historyCan('undo'), false);
  });

  test('historyEnd schließt keinen Schritt, den der Fokus geöffnet hat', async () => {
    const { mod, container, data } = await mount(true);
    const input = container.querySelector('.f');
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    mod.historyBegin();
    data().model.inc({}); await flush();
    mod.historyEnd();
    assertEqual(mod._history.isOpen, true, 'der Schritt des Feldes bleibt offen');
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    assertEqual(mod._history.isOpen, false);
  });

  test('ohne history: keine Haken historyBegin/historyEnd', async () => {
    const { mod } = await mount(undefined);
    assertEqual(typeof mod.historyBegin, 'undefined');
    assertEqual(typeof mod.historyEnd, 'undefined');
  });

  test('history mit manualPersist wird abgelehnt', () => {
    let err = null;
    try {
      createModule({
        config: { id: 'hist-mp', engine: 'alpine', phase: 'define', templateUrl: 'x.html', manualPersist: true },
        Model: Doc, view() { return {}; }, history: true,
      });
    } catch (e) { err = e; }
    assertTrue(err !== null && /manualPersist/.test(err.message));
  });
});
