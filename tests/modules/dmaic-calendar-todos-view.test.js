/**
 * Projektkalender: der Teil viewmodel/todos.js im Browser mit dem echten
 * Modul und der echten Vorlage, `ctx.instances` als Attrappe. Prüft: Lesen
 * beim Einhängen, Neulesen bei Änderung einer Aufgabenliste und bei neuer
 * Aufgabenliste, Abmelden, ein veralteter Lesevorgang überschreibt keinen
 * neueren, der Stapel je Kommando samt vorläufiger Anzeige, Vorbelegung und
 * Rückfrage, die Ablehnung als Hinweis und der Dialog am Aufgabentermin.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual, fakeChartManager } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerCommandDirectives } from '../../js/core/command-directives.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { todayISO, addDaysISO } from '../../js/core/local-date.js';
import mod from '../../js/modules/dmaic-calendar/viewmodel/viewmodel.js';

const ID = 'dmaic-calendar';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
/** Wartet, bis `ok()` gilt; höchstens zwei Sekunden. @param {() => boolean} ok */
async function until(ok) {
  for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
}
/** @type {HTMLElement[]} */
const mounted = [];
let prepared = false;

async function prepare() {
  if (!prepared) {
    registerCommandDirectives(Alpine);
    registerFieldDirective(Alpine, { i18n: { t: (k) => k, getLanguage: () => 'de' } });
    if (!Alpine.version) Alpine.start();
    prepared = true;
  }
  if (document.querySelector(`template[data-tpl="${TPL_KEY}"]`)?.content.childElementCount) return;
  const html = await (await fetch(new URL(`../../${TPL_KEY}`, import.meta.url), { cache: 'no-cache' })).text();
  let tpl = document.querySelector(`template[data-tpl="${TPL_KEY}"]`);
  if (!tpl) {
    tpl = document.createElement('template');
    tpl.setAttribute('data-tpl', TPL_KEY);
    document.body.append(tpl);
  }
  tpl.innerHTML = html;
}

function unmountAll() {
  while (mounted.length) {
    const old = mounted.pop();
    Alpine.destroyTree(old);
    old.remove();
  }
}

const T0 = todayISO();
const OWN = { id: 'e1', title: 'Eigener Termin', date: addDaysISO(T0, 1), time: '10:00', duration: 60, desc: '', phase: 'define' };

/**
 * Den Kalender mit zwei Aufgabenlisten einhängen. `todos[id]` ist der Stand,
 * den `read` liefert; ein Aufruf im Stapel ändert ihn wie das echte Modul.
 * @param {{ ok?: boolean }} [opts]
 */
async function mount({ ok = true } = {}) {
  await prepare();
  unmountAll();
  const todos = {
    t1: [
      { id: 'a', text: 'Bericht', owner: 'Max', due: addDaysISO(T0, 2), status: 'open', cal: true, time: '08:00', duration: 45 },
      { id: 'b', text: 'Ohne Kalender', owner: '', due: addDaysISO(T0, 2), status: 'open', cal: false },
    ],
    t2: [{ id: 'c', text: 'Messplan', owner: '', due: addDaysISO(T0, 3), status: 'open', cal: true }],
  };
  const lists = [
    { instanceId: 't1', moduleId: 'todo', phase: 'measure', title: '' },
    { instanceId: 't2', moduleId: 'todo', phase: 'analyze', title: '' },
  ];
  /** @type {any[]} */ const reads = [];
  /** @type {any[]} */ const stacks = [];
  /** @type {any[]} */ const notes = [];
  /** @type {any[]} */ const confirms = [];
  /** @type {Array<(r: any) => void>|null} gesetzt: `read` wartet, bis der Test löst */
  const gate = { held: null };
  const handlers = [];
  const states = { cal: { _schema: { name: ID, version: '1.1' }, events: [OWN], viewMode: 'month' } };
  const dialogs = { form: null };
  const context = {
    instanceId: 'cal',
    instances: {
      list: ({ modules } = {}) => lists.filter((l) => !modules || modules.includes(l.moduleId)),
      read: (id, o) => {
        reads.push([id, o]);
        const value = { items: JSON.parse(JSON.stringify(todos[id])) };
        if (gate.held) return new Promise((resolve) => gate.held.push(() => resolve(value)));
        return Promise.resolve(value);
      },
      interact: async (stack) => {
        stacks.push(stack);
        if (!ok) return { ok: false, error: { code: 'rejected' } };
        for (const op of stack) {
          const items = todos[op.instance];
          const { itemId, ...changes } = op.args[0];
          if (op.method === 'removeTodo') todos[op.instance] = items.filter((i) => i.id !== itemId);
          if (op.method === 'updateTodo') Object.assign(items.find((i) => i.id === itemId), changes);
        }
        return { ok: true, results: [] };
      },
    },
    stateManager: {
      getModuleState: (id) => states[id] ?? null,
      setModuleState: (id, s) => { states[id] = s; },
      getProjectCycle: () => 'dmaic',
      get: () => undefined,
      getChartEdits: () => null,
      setChartEdit: () => {},
    },
    i18n: { t: (k) => k, tf: () => (k) => k, getLanguage: () => 'de' },
    eventBus: {
      on: (n, fn) => handlers.push([n, fn]),
      off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
      emit: (n, p) => { for (const [a, f] of [...handlers]) if (a === n) f(p); },
    },
    chartManager: fakeChartManager(),
    notify: (...a) => notes.push(a),
    dialog: {
      confirm: async (o) => { confirms.push(o); return true; },
      form: (opts) => new Promise((resolve) => {
        const body = document.createElement('div');
        document.body.append(body);
        const home = opts.content.parentNode;
        const next = opts.content.nextSibling;
        body.append(opts.content);
        dialogs.form = { opts, close: () => { home.insertBefore(opts.content, next); body.remove(); dialogs.form = null; resolve(false); } };
        opts.onMount?.(body, { confirm() {}, cancel() {} });
      }),
      show: () => ({ close() {}, setTitle() {} }),
    },
    theme: 'light',
    language: 'de',
  };
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container);
  const inst = { ...mod };
  await inst.init(container, context);
  await settle();
  const vm = () => Alpine.$data(container.querySelector('[x-data]'));
  await until(() => vm().state.todoReads.length === 2);
  const upcomingTitles = () => [...container.querySelectorAll('.module-calendar__upcoming-title')].map((e) => e.textContent);
  return { inst, container, vm, todos, lists, reads, stacks, notes, confirms, gate, handlers, dialogs, context, upcomingTitles };
}

suite('dmaic-calendar: Aufgabentermine lesen', () => {
  test('beim Einhängen je Aufgabenliste items; Termine mit Phase der Liste, Vorgaben 09:00/30', async () => {
    const h = await mount();
    assertDeepEqual(h.reads, [['t1', { fields: ['items'] }], ['t2', { fields: ['items'] }]]);
    const todo = h.vm().todoEvents.map((e) => [e.id, e.title, e.time, e.duration, e.phase]);
    assertDeepEqual(todo, [['todo:t1:a', 'Bericht', '08:00', 45, 'measure'], ['todo:t2:c', 'Messplan', '09:00', 30, 'analyze']]);
    await until(() => h.upcomingTitles().length === 3);
    assertDeepEqual(h.upcomingTitles(), ['Eigener Termin', 'Bericht', 'Messplan']);
    assertEqual(h.container.querySelectorAll('.module-calendar__upcoming-item--todo').length, 2);
  });

  test('Neulesen bei data:changed einer Aufgabenliste und bei module:added; fremde Pfade nicht', async () => {
    const h = await mount();
    const n = h.reads.length;
    h.context.eventBus.emit('data:changed', 'module:cal');
    h.context.eventBus.emit('data:changed', 'chartEdits');
    h.context.eventBus.emit('module:added', { moduleId: 'sipoc' });
    await settle();
    assertEqual(h.reads.length, n, 'kein Neulesen');
    h.todos.t1[0].text = 'Bericht 2';
    h.context.eventBus.emit('data:changed', 'module:t1');
    await until(() => h.upcomingTitles().includes('Bericht 2'));
    assertTrue(h.upcomingTitles().includes('Bericht 2'));
    h.lists.push({ instanceId: 't3', moduleId: 'todo', phase: 'define', title: '' });
    h.todos.t3 = [{ id: 'd', text: 'Neu', owner: '', due: T0, status: 'open', cal: true }];
    h.context.eventBus.emit('module:added', { moduleId: 'todo' });
    await until(() => h.vm().state.todoReads.length === 3);
    assertTrue(h.vm().todoEvents.some((e) => e.id === 'todo:t3:d'));
    h.lists.splice(2, 1);
    h.context.eventBus.emit('module:removed', { moduleId: 'todo' });
    await until(() => h.vm().state.todoReads.length === 2);
    assertEqual(h.vm().todoEvents.some((e) => e.id === 'todo:t3:d'), false);
  });

  test('ein veralteter Lesevorgang überschreibt keinen neueren', async () => {
    const h = await mount();
    h.gate.held = [];
    h.vm().reloadTodos();
    const first = h.gate.held.splice(0);
    h.todos.t1[0].text = 'Neuer';
    h.vm().reloadTodos();
    const second = h.gate.held.splice(0);
    h.gate.held = null;
    second.forEach((go) => go());
    await until(() => h.vm().todoEvents.some((e) => e.title === 'Neuer'));
    first.forEach((go) => go());
    await settle();
    assertEqual(h.vm().todoEvents[0].title, 'Neuer');
  });

  test('destroy meldet alle Abos ab', async () => {
    const h = await mount();
    assertTrue(h.handlers.some(([n]) => n === 'data:changed'));
    unmountAll();
    await settle();
    assertDeepEqual(h.handlers.filter(([n]) => ['data:changed', 'module:added', 'module:removed'].includes(n)), []);
  });
});

suite('dmaic-calendar: Aufgabentermine schreiben', () => {
  test('editTodoEvent: ein Stapel updateTodo; sofort sichtbar, danach neu gelesen', async () => {
    const h = await mount();
    const n = h.reads.length;
    h.vm().editTodoEvent({ instanceId: 't1', itemId: 'a', title: 'Bericht neu', date: T0, time: '11:00', duration: 50 });
    assertDeepEqual(h.vm().todoEventOf('t1', 'a'), {
      id: 'todo:t1:a', todo: { instanceId: 't1', itemId: 'a' }, title: 'Bericht neu', date: T0, time: '11:00', duration: 50, phase: 'measure',
    });
    assertDeepEqual(h.stacks, [[{ op: 'instance.call', module: 'todo', instance: 't1', method: 'updateTodo',
      args: [{ itemId: 'a', text: 'Bericht neu', due: T0, time: '11:00', duration: 50 }] }]]);
    await until(() => h.reads.length >= n + 2);
    assertEqual(h.todos.t1[0].text, 'Bericht neu');
    assertEqual(h.vm().model.events.length, 1, 'das eigene Model bleibt unberührt');
  });

  test('ein vor dem Ändern gestarteter Lesevorgang setzt die vorläufige Anzeige nicht zurück', async () => {
    const h = await mount();
    h.gate.held = [];
    h.vm().reloadTodos();
    const stale = h.gate.held.splice(0);
    // Das Neulesen nach dem Aufruf bleibt angehalten: geprüft wird allein,
    // was der alte Lesevorgang anrichtet.
    h.vm().editTodoEvent({ instanceId: 't1', itemId: 'a', title: 'Vorläufig' });
    stale.forEach((go) => go());
    await settle();
    assertEqual(h.vm().todoEventOf('t1', 'a').title, 'Vorläufig');
    const later = h.gate.held.splice(0);
    h.gate.held = null;
    later.forEach((go) => go());
    await settle();
  });

  test('editTodoEvent nur mit Datum und Beginn (Geste move): nur diese Angaben', async () => {
    const h = await mount();
    h.vm().editTodoEvent({ instanceId: 't2', itemId: 'c', date: T0, time: '07:30' });
    assertDeepEqual(h.stacks[0][0].args, [{ itemId: 'c', due: T0, time: '07:30' }]);
  });

  test('removeTodoEvent: Rückfrage mit Titel, Stapel removeTodo, Termin weg', async () => {
    const h = await mount();
    const def = h.vm()._ui.vmCommands.removeTodoEvent;
    assertDeepEqual(def.confirm.call(h.vm(), { instanceId: 't1', itemId: 'a' }), { key: 'confirm.removeTodoEvent', params: { title: 'Bericht' } });
    h.vm().removeTodoEvent({ instanceId: 't1', itemId: 'a' });
    assertEqual(h.vm().todoEvents.some((e) => e.id === 'todo:t1:a'), false);
    assertDeepEqual(h.stacks, [[{ op: 'instance.call', module: 'todo', instance: 't1', method: 'removeTodo', args: [{ itemId: 'a' }] }]]);
    await until(() => h.todos.t1.length === 1);
    assertEqual(h.todos.t1.length, 1);
  });

  test('current: Vorbelegung aus dem Gelesenen; ohne feste Argumente leer; unbekannte Aufgabe wirft mit param', async () => {
    const h = await mount();
    const def = h.vm()._ui.vmCommands.editTodoEvent;
    assertDeepEqual(def.current.call(h.vm(), { instanceId: 't1', itemId: 'a' }), { title: 'Bericht', date: addDaysISO(T0, 2), time: '08:00', duration: 45 });
    assertDeepEqual(def.current.call(h.vm(), {}), {});
    let err = null;
    try { h.vm().editTodoEvent({ instanceId: 't1', itemId: 'zz', title: 'x' }); } catch (e) { err = e; }
    assertEqual(err?.param, 'itemId');
    assertEqual(h.stacks.length, 0);
  });

  test('Ablehnung des Stapels: übersetzter Hinweis, danach neu gelesen', async () => {
    const h = await mount({ ok: false });
    const warn = console.warn;
    console.warn = () => {};
    try {
      const n = h.reads.length;
      h.vm().editTodoEvent({ instanceId: 't1', itemId: 'a', title: 'Nie' });
      await until(() => h.notes.length > 0 && h.reads.length >= n + 2);
      assertDeepEqual(h.notes[0], ['todoWriteFailed', 'error']);
      await until(() => h.vm().todoEventOf('t1', 'a').title === 'Bericht');
      assertEqual(h.vm().todoEventOf('t1', 'a').title, 'Bericht', 'das Neulesen nimmt die vorläufige Anzeige zurück');
    } finally {
      console.warn = warn;
    }
  });

  test('Dialog am Aufgabentermin: Formular ohne Beschreibung und Phase, vorbelegt; Löschen angeboten', async () => {
    const h = await mount();
    await until(() => h.container.querySelectorAll('.module-calendar__upcoming-item--todo').length === 2);
    h.container.querySelector('.module-calendar__upcoming-item--todo').click();
    await until(() => h.dialogs.form !== null);
    const body = h.dialogs.form.opts.content;
    assertEqual(body.querySelector('[data-ref="todoEvTitle"]').value, 'Bericht');
    assertEqual(body.querySelector('[data-ref="todoEvTime"]').value, '08:00');
    assertEqual(body.querySelector('[data-ref="todoEvEnd"]').value, '08:45');
    assertEqual(body.querySelector('[data-ref="evDesc"]'), null);
    assertEqual(typeof h.dialogs.form.opts.onDelete, 'function');
    assertEqual(h.dialogs.form.opts.title, 'editTodoEvent');
    h.dialogs.form.close();
  });
});
