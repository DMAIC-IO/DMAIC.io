/**
 * Aufgabenliste: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem
 * echten Modul und der echten Vorlage. Prüft: Leerzustand, Hilfe-Anker,
 * Eingaben an der richtigen Zeile auch bei Sortierung und Filter, Status
 * und Häkchen, Sortieren über den Spaltenkopf, Umsortieren mit Alt+Pfeil
 * bei Sortierung und Filter (die angezeigte Folge wird gespeichert), je ein
 * Verlaufsschritt mit Rückgängig/Wiederholen, Löschen mit Rückfrage, Fokus
 * nach dem Anlegen, die Kalenderspalte samt Abmelden, zwei Instanzen und
 * das Altprojekt ohne Verlaufsschritt.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual, fakeChartManager } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerCommandDirectives } from '../../js/core/command-directives.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import mod from '../../js/modules/todo/viewmodel/viewmodel.js';
import { State } from '../../js/modules/todo/domain/model.js';

const ID = 'todo';
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
let UI = null;

/** Text des Moduls unter einem Punktpfad mit Platzhaltern; sonst der Pfad. */
function tr(path, params = {}) {
  const v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), UI);
  return typeof v === 'string' ? v.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : path;
}

async function prepare() {
  if (!prepared) {
    registerCommandDirectives(Alpine);
    registerFieldDirective(Alpine, { i18n: { t: (k) => k, getLanguage: () => 'de' } });
    if (!Alpine.version) Alpine.start();
    UI = await (await fetch(new URL(`../../js/modules/${ID}/resources/i18n/ui.de.json`, import.meta.url), { cache: 'no-cache' })).json();
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

const SCHEMA = { _schema: { name: ID, version: '1.0' } };
const VIEW = { filterStatus: 'all', filterOwner: 'all', search: '', sortCol: 'due', sortAsc: true };
/** Drei Aufgaben, gespeicherte Folge a, b, c; nach Zieldatum angezeigt c, a, b. */
const SMALL = {
  ...SCHEMA,
  items: [
    { id: 'a', text: 'Audit', owner: 'Max', due: '2026-06-05', status: 'open', cal: false },
    { id: 'b', text: 'Bericht', owner: 'Erika', due: '2026-06-20', status: 'in-progress', cal: true },
    { id: 'c', text: 'Check', owner: 'Max', due: '2026-06-01', status: 'blocked', cal: false },
  ],
  ...VIEW,
};
/** Liste 2 des Altprojekts (ohne `_schema`, wie die Altform sie schrieb). */
const LEGACY = {
  items: [
    { text: 'Messsystemanalyse durchführen', owner: 'Søren Ähnlich', due: '15.06.2026', status: 'in-progress', cal: false },
    { id: 'x2', text: 'Daten erheben', owner: 'Anna Müller', due: '2026-06-20', status: 'open', cal: false },
  ],
  filterStatus: '', filterOwner: 'all', search: '', sortAsc: true,
};
const plain = (v) => JSON.parse(JSON.stringify(v));

/**
 * Eine Instanz einhängen (eigene Kopie des Moduls wie in der Registry).
 * @param {string} instanceId
 * @param {object|null} model gespeicherter Zustand
 * @param {{ keep?: boolean, confirm?: boolean, calendar?: boolean }} [opts]
 */
async function mount(instanceId, model, { keep = false, confirm = true, calendar = false } = {}) {
  await prepare();
  if (!keep) unmountAll();
  const states = { [instanceId]: model };
  /** @type {any[]} */
  const confirms = [];
  const handlers = [];
  /** @type {string[]} */
  const commands = [];
  const project = { calendar };
  const context = {
    instanceId,
    instances: {
      list: ({ modules } = {}) => (project.calendar && (!modules || modules.includes('dmaic-calendar'))
        ? [{ instanceId: 'cal-1', moduleId: 'dmaic-calendar', phase: 'define', title: '' }] : []),
      read: async () => ({}),
      interact: async () => ({ ok: false, results: [] }),
    },
    stateManager: {
      getModuleState: (id) => states[id] ?? null,
      setModuleState: (id, s) => { states[id] = s; },
      getProjectCycle: () => 'dmaic',
      get: () => undefined,
      getChartEdits: () => null,
      setChartEdit: () => {},
    },
    i18n: { t: (k) => k, tf: () => tr, getLanguage: () => 'de' },
    eventBus: {
      on: (n, fn) => handlers.push([n, fn]),
      off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
      emit: (n, p) => {
        if (n === 'command:executed' && p.instanceId === instanceId) commands.push(p.command);
        for (const [a, f] of [...handlers]) if (a === n) f(p);
      },
    },
    chartManager: fakeChartManager(),
    notify: () => {},
    dialog: { confirm: async (o) => { confirms.push(o); return confirm; }, show: () => ({ close() {}, setTitle() {} }) },
    theme: 'light',
    language: 'de',
  };
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container);
  const inst = { ...mod };
  await inst.init(container, context);
  await settle();
  const q = (sel) => container.querySelector(sel);
  const qa = (sel) => [...container.querySelectorAll(sel)];
  const vm = () => Alpine.$data(container.querySelector('[x-data]'));
  const h = {
    inst, states, confirms, commands, container, q, qa, vm, handlers, project, context,
    rows: () => qa('tbody tr'),
    /** ids der angezeigten Zeilen. */
    ids: () => h.rows().map((r) => r.dataset.id),
    field: (id, name) => /** @type {HTMLInputElement} */ (q(`tr[data-id="${id}"] [data-field="${name}"]`)),
    grip: (idx) => /** @type {HTMLButtonElement} */ (h.rows()[idx].querySelector('.todo__grip')),
    saved: () => plain(states[instanceId]),
    counter: () => q('.todo__counter').textContent,
    /** In ein Feld tippen und es verlassen (ein Verlaufsschritt). */
    type: async (el, value) => {
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      await settle();
    },
    select: async (el, value) => {
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      await settle();
    },
    key: async (el, key, init = {}) => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
      await settle();
    },
    click: async (el) => { el.click(); await settle(); },
    undo: async () => { const ok = inst.historyStep('undo'); await settle(); return ok; },
    redo: async () => { const ok = inst.historyStep('redo'); await settle(); return ok; },
  };
  return h;
}

/** Der gespeicherte Stand lädt streng (ohne Reparatur). @param {any} saved */
function assertValid(saved) {
  let err = null;
  try { State.fromJSON(plain(saved)); } catch (e) { err = e; }
  assertEqual(err, null, `gespeicherter Stand ungültig: ${err?.message}`);
}

const visible = (el) => !!el && getComputedStyle(el).display !== 'none';

suite('todo: Viewmodel im Browser', () => {
  test('Leerzustand: Leertext, keine Tabelle, Zähler 0 / 0, keine Kalenderspalte, kein Schritt', async () => {
    const h = await mount('td-1', null);
    await until(() => visible(h.q('.todo__empty')));
    assertTrue(visible(h.qa('.todo__empty')[0]), 'Leertext');
    assertEqual(h.qa('.todo__empty')[0].textContent, tr('emptyState'));
    assertTrue(!visible(h.q('.todo__table')), 'Tabelle sichtbar');
    assertEqual(h.counter(), '0 / 0');
    assertEqual(h.qa('.todo__col-cal').length, 0);
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Hilfe-Anker: Filter und Spaltenköpfe auf fields.*, Kopfzellen und Eingaben leer; Kalenderkopf mit Kalender', async () => {
    const h = await mount('td-1', plain(SMALL), { calendar: true });
    await until(() => h.rows().length === 3);
    assertEqual(h.q('.todo__filter-label').dataset.helpKey, 'modules.todo.fields.filterStatus.help');
    const heads = h.qa('thead th[data-sort] > span[data-help-key]').map((s) => s.dataset.helpKey);
    assertDeepEqual(heads, ['text', 'owner', 'due', 'status'].map((f) => `modules.todo.fields.items.${f}.help`));
    assertTrue(h.qa('thead th[data-sort]').every((th) => th.dataset.helpKey === ''), 'Kopfzellen tragen data-help-key=""');
    assertEqual(h.q('thead .todo__col-cal [data-help-key]').dataset.helpKey, 'modules.todo.fields.items.cal.help');
    for (const sel of ['[data-filter="status"]', '[data-filter="owner"]', '[data-filter="search"]', '[data-field="text"]', '[data-field="status"]', '[data-action="delete"]', '[data-action="cal"]', '[data-action="toggle"]']) {
      assertEqual(h.q(sel).dataset.helpKey, '', sel);
    }
    unmountAll();
  });

  test('Eingaben treffen die richtige Zeile auch nach Umsortieren und mit Filter; je ein Schritt, Rückgängig je Eintrag', async () => {
    const h = await mount('td-1', plain(SMALL));
    await until(() => h.rows().length === 3);
    assertDeepEqual(h.ids(), ['c', 'a', 'b']);
    // Text nach Spaltenkopf absteigend sortiert.
    await h.click(h.q('th[data-sort="text"]'));
    await h.click(h.q('th[data-sort="text"]'));
    await until(() => h.ids().join() === 'c,b,a');
    await h.type(h.field('b', 'text'), 'Bericht neu');
    await h.type(h.field('a', 'owner'), 'Anna');
    await h.type(h.field('c', 'due'), '2026-07-01');
    assertDeepEqual(h.saved().items.map((i) => [i.id, i.text, i.owner, i.due]), [
      ['a', 'Audit', 'Anna', '2026-06-05'], ['b', 'Bericht neu', 'Erika', '2026-06-20'], ['c', 'Check', 'Max', '2026-07-01'],
    ]);
    // Mit Filter auf Max: nur a (jetzt Anna) fällt heraus.
    await h.select(h.q('[data-filter="owner"]'), 'Max');
    await until(() => h.ids().join() === 'c');
    await h.type(h.field('c', 'text'), 'Check 2');
    assertEqual(h.saved().items[2].text, 'Check 2');
    assertEqual(h.counter(), '1 / 3');
    // Rückgängig: Filter, dann je Eintrag.
    assertTrue(await h.undo(), 'Rückgängig Text c');
    assertEqual(h.saved().items[2].text, 'Check');
    assertTrue(await h.undo(), 'Rückgängig Filter');
    await until(() => h.rows().length === 3);
    assertTrue(await h.undo(), 'Rückgängig Datum c');
    assertEqual(h.saved().items[2].due, '2026-06-01');
    assertTrue(await h.undo(), 'Rückgängig Owner a');
    assertEqual(h.saved().items[0].owner, 'Max');
    assertTrue(await h.undo(), 'Rückgängig Text b');
    assertEqual(h.saved().items[1].text, 'Bericht');
    assertTrue(await h.redo(), 'Wiederholen Text b');
    await until(() => h.field('b', 'text').value === 'Bericht neu');
    assertValid(h.saved());
    unmountAll();
  });

  test('Status-Auswahl und Häkchen: genau die Zeile, je ein Schritt; Häkchen schaltet erledigt und offen', async () => {
    const h = await mount('td-1', plain(SMALL));
    await until(() => h.rows().length === 3);
    await h.select(h.field('a', 'status'), 'blocked');
    assertEqual(h.saved().items[0].status, 'blocked');
    const check = () => /** @type {HTMLInputElement} */ (h.q('tr[data-id="b"] [data-action="toggle"]'));
    check().checked = true;
    check().dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    assertEqual(h.saved().items[1].status, 'done');
    await until(() => h.q('tr[data-id="b"]').classList.contains('todo__row--done'));
    check().checked = false;
    check().dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    assertEqual(h.saved().items[1].status, 'open');
    assertTrue(await h.undo(), 'Rückgängig offen');
    assertEqual(h.saved().items[1].status, 'done');
    assertTrue(await h.undo(), 'Rückgängig erledigt');
    assertTrue(await h.undo(), 'Rückgängig Status a');
    assertEqual(h.saved().items[0].status, 'open');
    await until(() => h.field('a', 'status').value === 'open');
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Spaltenkopf: neue Spalte aufsteigend, dieselbe dreht; Pfeil folgt; kein Inhalt, aber ein Schritt', async () => {
    const h = await mount('td-1', plain(SMALL));
    await until(() => h.rows().length === 3);
    const arrow = (col) => h.q(`th[data-sort="${col}"] .todo__sort-arrow`);
    assertEqual(arrow('due').dataset.icon, 'nav.arrow-up');
    assertTrue(arrow('due').classList.contains('todo__sort-arrow--active'));
    await h.click(h.q('th[data-sort="owner"]'));
    await until(() => h.ids().join() === 'b,a,c');
    assertEqual(arrow('owner').dataset.icon, 'nav.arrow-up');
    assertEqual(arrow('due').dataset.icon, 'action.sort');
    await h.click(h.q('th[data-sort="owner"]'));
    await until(() => arrow('owner').dataset.icon === 'nav.arrow-down');
    assertDeepEqual([h.saved().sortCol, h.saved().sortAsc], ['owner', false]);
    assertDeepEqual(h.commands, ['sortBy', 'sortBy']);
    assertTrue(await h.undo(), 'Rückgängig');
    assertDeepEqual([h.saved().sortCol, h.saved().sortAsc], ['owner', true]);
    unmountAll();
  });

  test('Umsortieren mit Alt+Pfeil bei Sortierung und Filter: angezeigte Folge wird gespeichert, manuell, ein Schritt', async () => {
    const h = await mount('td-1', { ...plain(SMALL), filterStatus: 'all', search: '' });
    await until(() => h.rows().length === 3);
    // Filter: nur Max (c, a nach Datum).
    await h.select(h.q('[data-filter="owner"]'), 'Max');
    await until(() => h.ids().join() === 'c,a');
    h.commands.length = 0;
    h.grip(0).focus();
    await h.key(h.grip(0), 'ArrowDown', { altKey: true });
    await until(() => h.ids().join() === 'a,c');
    assertDeepEqual(h.commands, ['moveTodo']);
    assertDeepEqual(h.saved().items.map((i) => i.id), ['a', 'c', 'b']);
    assertEqual(h.saved().sortCol, 'manual');
    await until(() => document.activeElement === h.grip(1));
    // Über den Rand: nichts.
    await h.key(h.grip(1), 'ArrowDown', { altKey: true });
    assertDeepEqual(h.commands, ['moveTodo']);
    assertTrue(await h.undo(), 'Rückgängig Verschieben');
    await until(() => h.ids().join() === 'c,a');
    assertDeepEqual(h.saved().items.map((i) => i.id), ['a', 'b', 'c']);
    assertEqual(h.saved().sortCol, 'due');
    assertTrue(await h.redo(), 'Wiederholen');
    await until(() => h.ids().join() === 'a,c');
    assertEqual(h.vm().state.dropPreview, null);
    assertEqual(h.qa('.dmike-table__row--drop-target').length, 0);
    unmountAll();
  });

  test('Löschen: Rückfrage vom Kern, Abbrechen lässt stehen, Bestätigen löscht genau die Zeile', async () => {
    const h = await mount('td-1', plain(SMALL), { confirm: false });
    await until(() => h.rows().length === 3);
    await h.click(h.q('tr[data-id="a"] [data-action="delete"]'));
    await settle();
    assertEqual(h.confirms.length, 1);
    assertEqual(h.saved().items.length, 3);
    unmountAll();
    const k = await mount('td-1', plain(SMALL), { confirm: true });
    await until(() => k.rows().length === 3);
    await k.click(k.q('tr[data-id="a"] [data-action="delete"]'));
    await until(() => k.rows().length === 2);
    assertEqual(k.confirms.length, 1);
    assertDeepEqual(k.saved().items.map((i) => i.id), ['b', 'c']);
    unmountAll();
  });

  test('Anlegen: neue Zeile, Fokus auf ihrem Text; Agent-Anlage ebenso; zwei Instanzen fokussieren nur die eigene', async () => {
    const a = await mount('td-1', plain(SMALL));
    const b = await mount('td-2', plain(SMALL), { keep: true });
    const id = b.vm().model.addTodo({});
    await until(() => document.activeElement === b.field(id, 'text'));
    assertEqual(document.activeElement, b.field(id, 'text'));
    assertEqual(a.rows().length, 3);
    assertEqual(b.rows().length, 4);
    assertEqual(b.counter(), '4 / 4');
    const id2 = a.vm().model.addTodo({});
    await until(() => document.activeElement === a.field(id2, 'text'));
    assertEqual(b.rows().length, 4);
    assertTrue(await b.undo(), 'Rückgängig B');
    await until(() => b.rows().length === 3);
    assertEqual(a.rows().length, 4);
    unmountAll();
  });

  test('Kalenderspalte: erscheint mit Kalender, folgt module:added|removed, Knopf schaltet die Marke; Abmelden beim Aushängen', async () => {
    const h = await mount('td-1', plain(SMALL));
    await until(() => h.rows().length === 3);
    assertEqual(h.qa('[data-action="cal"]').length, 0);
    h.project.calendar = true;
    h.context.eventBus.emit('module:added', { moduleId: 'dmaic-calendar', instanceId: 'cal-1' });
    await until(() => h.qa('[data-action="cal"]').length === 3);
    const btn = () => h.q('tr[data-id="a"] [data-action="cal"]');
    assertEqual(btn().getAttribute('aria-pressed'), 'false');
    await h.click(btn());
    await until(() => btn().getAttribute('aria-pressed') === 'true');
    assertTrue(btn().classList.contains('todo__cal-btn--active'));
    assertEqual(h.saved().items[0].cal, true);
    h.project.calendar = false;
    h.context.eventBus.emit('module:removed', { moduleId: 'dmaic-calendar', instanceId: 'cal-1' });
    await until(() => h.qa('[data-action="cal"]').length === 0);
    assertEqual(h.saved().items[0].cal, true);
    const subs = () => h.handlers.filter(([n]) => ['module:added', 'module:removed', 'command:executed'].includes(n)).length;
    assertTrue(subs() >= 3, 'Abos fehlen');
    const before = subs();
    unmountAll();
    assertEqual(subs(), before - 3);
    unmountAll();
  });

  test('Überfällig: nur gültiges Datum vor heute und nicht erledigt; „KW 23“ nie', async () => {
    const h = await mount('td-1', { ...SCHEMA, items: [
      { id: 'p', text: 'alt', owner: '', due: '2000-01-01', status: 'open', cal: false },
      { id: 'k', text: 'kw', owner: '', due: 'KW 23', status: 'open', cal: false },
      { id: 'd', text: 'fertig', owner: '', due: '2000-01-01', status: 'done', cal: false },
    ], ...VIEW });
    await until(() => h.rows().length === 3);
    const overdue = (id) => h.q(`tr[data-id="${id}"]`).classList.contains('todo__row--overdue');
    assertDeepEqual([overdue('p'), overdue('k'), overdue('d')], [true, false, false]);
    unmountAll();
  });

  test('Altprojekt: alle Werte sichtbar, Laden ist kein Verlaufsschritt, Zieldatum ISO', async () => {
    const h = await mount('td-1', plain(LEGACY));
    await until(() => h.rows().length === 2);
    assertDeepEqual(h.ids(), ['t1', 'x2']);
    assertEqual(h.field('t1', 'text').value, 'Messsystemanalyse durchführen');
    assertEqual(h.field('t1', 'owner').value, 'Søren Ähnlich');
    assertEqual(h.field('t1', 'due').value, '2026-06-15');
    assertEqual(h.field('t1', 'status').value, 'in-progress');
    assertEqual(h.field('x2', 'status').value, 'open');
    assertEqual(/** @type {HTMLSelectElement} */ (h.q('[data-filter="status"]')).value, 'all');
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });
});
