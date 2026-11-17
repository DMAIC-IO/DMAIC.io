/**
 * createModule({ history }) — Verlauf je Modulinstanz im Kern.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { createModule } from '../../js/core/template-module.js';
import { defineModel, command, text, number, list, index, recordInverse } from '../../js/core/model.js';

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

const Vals = defineModel({
  fields: { vals: list(number(), { default: () => [0, 0, 0] }) },
  commands: {
    set: command({
      params: { i: index('vals', { existing: true }), v: number() },
      run({ i, v }) {
        recordInverse(this, { type: 'set', i, v: this.vals[i] });
        const next = [...this.vals];
        next[i] = v;
        this.vals = next;
      },
    }),
  },
});

// Umkehrungen, die werfen: `bad` -> explode; `trap` -> trap2, dessen Umkehrung explode ist.
const Faulty = defineModel({
  fields: { vals: list(number(), { default: () => [0, 0, 0] }) },
  commands: {
    set: Vals.schema.commands.set,
    explode: command({ params: {}, run() { throw new Error('boom'); } }),
    bad: command({ params: {}, run() { recordInverse(this, { type: 'explode' }); this.vals = [...this.vals.slice(0, 2), 9]; } }),
    trap2: command({ params: {}, run() { recordInverse(this, { type: 'explode' }); } }),
    trap: command({ params: {}, run() { recordInverse(this, { type: 'trap2' }); this.vals = [7, ...this.vals.slice(1)]; } }),
  },
});

async function mount(history, { Model = Doc, html = '<input class="f" x-model="model.name"><span x-text="model.n"></span>', initial, base = {} } = {}) {
  if (!Alpine.version) Alpine.start();
  const id = `hist-test-${++seq}`;
  const key = `js/modules/${id}/${id}.html`;
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', key);
  const comp = `histTest${seq}`;
  tpl.innerHTML = `<div x-data="${comp}">${html}</div>`;
  document.body.append(tpl);
  const mod = createModule({
    config: { id, engine: 'alpine', phase: 'define', templateUrl: new URL(key, document.baseURI).href },
    Model,
    view() { return {}; },
    ...(history === undefined ? {} : { history }),
    ...base,
  });
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container, tpl);
  const context = fakeContext(`h${seq}`);
  if (initial) stored[context.instanceId] = initial;
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

suite('createModule history — Modus inverse', () => {
  const opts = { Model: Vals, html: '<span x-text="model.vals.join()"></span>', initial: { vals: [0, 0, 0] } };

  test('drei Kommandos: dreimal zurück zum Ausgang, dreimal vor zum Endstand, ohne toJSON', async () => {
    const { mod, data } = await mount({ mode: 'inverse' }, opts);
    const m = data().model;
    m.set({ i: 0, v: 1 });
    m.set({ i: 1, v: 2 });
    m.set({ i: 0, v: 3 });
    await flush();
    assertDeepEqual([...m.vals], [3, 2, 0]);
    const raw = Alpine.raw(m);
    let calls = 0;
    const orig = raw.toJSON;
    raw.toJSON = function () { calls += 1; return orig.call(this); };
    try {
      for (let k = 0; k < 3; k++) assertTrue(mod.historyStep('undo'), `undo ${k}`);
      assertEqual(calls, 0, 'Rückgängig ruft toJSON nicht');
      assertDeepEqual([...m.vals], [0, 0, 0]);
      assertEqual(mod.historyCan('undo'), false);
      for (let k = 0; k < 3; k++) assertTrue(mod.historyStep('redo'), `redo ${k}`);
      assertEqual(calls, 0, 'Wiederholen ruft toJSON nicht');
      assertDeepEqual([...m.vals], [3, 2, 0]);
      assertEqual(mod.historyCan('redo'), false);
    } finally {
      delete raw.toJSON;
    }
    await flush();
    assertTrue(mod.historyStep('undo'));
    await flush();
    assertDeepEqual([...m.vals], [1, 2, 0], 'erneut zurück nach Wiederholen');
    assertTrue(mod.historyCan('redo'));
  });

  test('historyBegin, zehn Kommandos, historyEnd: ein Schritt', async () => {
    const { mod, data } = await mount({ mode: 'inverse', depth: 5 }, opts);
    const m = data().model;
    mod.historyBegin();
    for (let k = 1; k <= 10; k++) m.set({ i: k % 3, v: k });
    mod.historyEnd();
    await flush();
    assertTrue(mod.historyStep('undo'));
    assertDeepEqual([...m.vals], [0, 0, 0]);
    assertEqual(mod.historyCan('undo'), false);
    assertTrue(mod.historyStep('redo'));
    assertDeepEqual([...m.vals], [9, 10, 8]);
  });

  test('Rückgängig persistiert über den Speicher-Watch', async () => {
    const { mod, context, data } = await mount({ mode: 'inverse' }, opts);
    data().model.set({ i: 2, v: 7 });
    await flush();
    assertDeepEqual(stored[context.instanceId].vals, [0, 0, 7]);
    mod.historyStep('undo');
    await flush();
    assertDeepEqual(stored[context.instanceId].vals, [0, 0, 0]);
  });

  test('Fehler mitten im Schritt: Model und beide Stapel wie vor dem Versuch', async () => {
    const { mod, data } = await mount({ mode: 'inverse' }, { ...opts, Model: Faulty });
    const m = data().model;
    mod.historyBegin();
    m.bad({});              // Umkehrung 'explode' wirft (läuft als zweite)
    m.set({ i: 0, v: 5 });  // Umkehrung läuft zuerst und gelingt
    mod.historyEnd();
    await flush();
    const before = [...m.vals];
    assertDeepEqual(before, [5, 0, 9]);
    let err = null;
    try { mod.historyStep('undo'); } catch (e) { err = e; }
    await flush();
    assertTrue(err !== null && /boom/.test(err.message), 'der Fehler wird weitergereicht');
    assertDeepEqual([...m.vals], before, 'Model wie vor dem Versuch');
    assertEqual(mod._history._undo.length, 1, 'Schritt liegt wieder auf dem Rückgängig-Stapel');
    assertEqual(mod._history._redo.length, 0);
    assertTrue(mod.historyCan('undo'));
    assertEqual(mod.historyCan('redo'), false);
  });

  test('Fehler beim Rückrollen: Verlauf wird zurückgesetzt', async () => {
    const { mod, data } = await mount({ mode: 'inverse' }, { ...opts, Model: Faulty });
    const m = data().model;
    mod.historyBegin();
    m.bad({});
    m.trap({});
    mod.historyEnd();
    await flush();
    let err = null;
    try { mod.historyStep('undo'); } catch (e) { err = e; }
    assertTrue(err !== null && /boom/.test(err.message));
    assertEqual(mod.historyCan('undo'), false);
    assertEqual(mod.historyCan('redo'), false);
  });

  test('history mit unbekanntem mode wird abgelehnt', () => {
    let err = null;
    try {
      createModule({ config: { id: 'hist-mode', engine: 'alpine', phase: 'define', templateUrl: 'x.html' },
        Model: Vals, view() { return {}; }, history: { mode: 'snapshot' } });
    } catch (e) { err = e; }
    assertTrue(err !== null && /history must be/.test(err.message));
  });
});

suite('createModule onCommand und ctx.history', () => {
  const opts = { Model: Vals, html: '<span x-text="model.vals.join()"></span>', initial: { vals: [0, 0, 0] } };

  test('onCommand: je Kommando mit { instanceId, eventBus }, auch je Umkehr-Kommando beim Rückgängig', async () => {
    const calls = [];
    const { mod, context, data } = await mount({ mode: 'inverse' }, {
      ...opts, base: { onCommand: (name, ctx) => calls.push([name, ctx]) },
    });
    data().model.set({ i: 0, v: 4 });
    assertEqual(calls.length, 1);
    assertEqual(calls[0][0], 'set');
    assertEqual(calls[0][1].instanceId, context.instanceId);
    assertTrue(calls[0][1].eventBus === context.eventBus, 'der Bus des Kontexts');
    mod.historyStep('undo');
    assertEqual(calls.length, 2, 'Rückgängig meldet sein Umkehr-Kommando');
    assertEqual(calls[1][0], 'set');
  });

  test('onCommand: Laden eines Fremdstands meldet mit name null', async () => {
    const calls = [];
    const { mod } = await mount({ mode: 'inverse' }, { ...opts, base: { onCommand: (name) => calls.push(name) } });
    mod.applyRemoteState({ vals: [1, 1, 1] });
    assertDeepEqual(calls, [null]);
    mod.setState({ vals: [2, 2, 2] });
    assertDeepEqual(calls, [null, null]);
  });

  test('onCommand: auch am Model ohne Mount (loadDetached)', () => {
    const calls = [];
    const mod = createModule({
      config: { id: 'oncmd-detached', engine: 'alpine', phase: 'define', templateUrl: 'x.html' },
      Model: Vals, view() { return {}; }, onCommand: (name, ctx) => calls.push([name, ctx.instanceId]),
    });
    const bus = { emit: () => {} };
    const m = mod.loadDetached({ vals: [0, 0, 0] }, { instanceId: 'd1', eventBus: bus });
    m.set({ i: 1, v: 3 });
    assertDeepEqual(calls, [['set', 'd1']]);
  });

  test('onCommand muss eine Funktion sein', () => {
    let err = null;
    try {
      createModule({ config: { id: 'oncmd-bad', engine: 'alpine', phase: 'define', templateUrl: 'x.html' },
        Model: Vals, view() { return {}; }, onCommand: 'x' });
    } catch (e) { err = e; }
    assertTrue(err !== null && /onCommand must be a function/.test(err.message));
  });

  test('ctx.history: can und step erreichen den Verlauf der Instanz', async () => {
    let hist = null;
    const { data } = await mount({ mode: 'inverse' }, { ...opts, base: { view(ctx) { return { init() { hist = ctx.history; } }; } } });
    assertTrue(hist !== null, 'ctx.history mit history');
    assertEqual(hist.can('undo'), false);
    data().model.set({ i: 2, v: 9 });
    await flush();
    assertTrue(hist.can('undo'));
    assertTrue(hist.step('undo'));
    assertDeepEqual([...data().model.vals], [0, 0, 0]);
    assertTrue(hist.can('redo'));
  });

  test('ctx.history ist null ohne history', async () => {
    let hist;
    await mount(undefined, { ...opts, base: { view(ctx) { return { init() { hist = ctx.history; } }; } } });
    assertEqual(hist, null);
  });
});
