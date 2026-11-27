/**
 * Lessons Learned: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem
 * echten Modul, der echten Vorlage, den Modulstilen und dem echten
 * Dialogdienst. Prüft: Leerzustand, Hilfe-Anker, Karten auf- und zuklappen,
 * ein Formular für Anlegen und Bearbeiten (letzte Phase als Vorgabe,
 * Maßnahmen mit +, Enter und ×, nur Maßnahmen geändert schreibt), Abhaken
 * und Löschen als je ein Verlaufsschritt, Filter und Suche, Import über die
 * verborgene Dateiauswahl, Änderungen des Agenten, zwei Instanzen (ids je
 * Instanz) und Abbau bei offenem Dialog.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual, fakeChartManager } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerCommandDirectives } from '../../js/core/command-directives.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerFileDropDirective } from '../../js/core/file-drop-directive.js';
import { createDialogService, DIALOG_TEMPLATE } from '../../js/ui/dialog/dialog.js';
import { inlineTileTemplate } from './tile-test-utils.js';
import mod from '../../js/modules/lessons-learned/viewmodel/viewmodel.js';
import tile from '../../js/modules/lessons-learned/tile/tile.js';
import { validateSchema, resolveSettings } from '../../js/pages/dashboard/tile-settings.js';
import { State } from '../../js/modules/lessons-learned/domain/model.js';

const ID = 'lessons-learned';
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
/** @type {any} */
let DIALOG = null;

/** Text des Moduls unter einem Punktpfad, Platzhalter gefüllt; sonst der Pfad. */
function tr(path, params) {
  const v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), UI);
  if (typeof v !== 'string') return path;
  return params ? v.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : v;
}

async function prepare() {
  if (!prepared) {
    registerCommandDirectives(Alpine);
    registerFieldDirective(Alpine, { i18n: { t: (k) => k, getLanguage: () => 'de' } });
    registerFileDropDirective(Alpine);
    if (!Alpine.version) Alpine.start();
    UI = await (await fetch(new URL(`../../js/modules/${ID}/resources/i18n/ui.de.json`, import.meta.url), { cache: 'no-cache' })).json();
    await inlineTileTemplate(DIALOG_TEMPLATE);
    DIALOG = createDialogService({ i18n: { t: (k) => k } });
    const css = new URL(`../../js/modules/${ID}/resources/style.css`, import.meta.url).href;
    if (![...document.styleSheets].some((sh) => sh.href === css)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = css;
      await new Promise((ok, fail) => { link.onload = ok; link.onerror = fail; document.head.append(link); });
    }
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

/** Die offenen Dialoge. */
const dialogs = () => [...document.querySelectorAll('.dialog')];

function unmountAll() {
  for (const el of dialogs()) el.querySelector('.dialog__cancel')?.click();
  while (mounted.length) {
    const old = mounted.pop();
    Alpine.destroyTree(old);
    old.remove();
  }
  for (const el of dialogs()) el.remove();
}

const plain = (v) => JSON.parse(JSON.stringify(v));
/** Eine Erfahrung in Normalform. @param {object} l */
const lesson = (l) => ({
  id: '', title: '', category: 'success', phase: 'control', impact: 'medium', owner: '', description: '',
  rootCause: '', recommendation: '', actions: [], createdAt: 0, updatedAt: 0, ...l,
});

/** Ein kleiner Stand der Zielform: a die älteste, c die neueste. */
const SMALL = {
  _schema: { name: ID, version: '1.0' },
  lessons: [
    lesson({ id: 'a', title: 'Alpha', category: 'success', impact: 'high', owner: 'Anna', description: 'Beschreibung A',
      actions: [{ text: 'Erste', done: false }, { text: 'Zweite', done: true }], createdAt: 1780315200000, updatedAt: 1780315200000 }),
    lesson({ id: 'b', title: 'Beta', category: 'problem', phase: 'design', impact: 'low', rootCause: 'Ursache B',
      createdAt: 1780401600000, updatedAt: 1780401600000 }),
    lesson({ id: 'c', title: 'Gamma', category: 'improve', phase: 'measure', recommendation: 'Empfehlung C',
      createdAt: 1780488000000, updatedAt: 1780488000000 }),
  ],
};

/**
 * Eine Instanz einhängen (eigene Kopie des Moduls wie in der Registry).
 * @param {string} instanceId
 * @param {object|null} model gespeicherter Zustand
 * @param {{ keep?: boolean, confirm?: boolean, cycle?: string }} [opts]
 */
async function mount(instanceId, model, { keep = false, confirm = true, cycle = 'dmaic' } = {}) {
  await prepare();
  if (!keep) unmountAll();
  const states = { [instanceId]: model };
  /** @type {any[][]} */
  const notes = [];
  /** @type {any[]} */
  const confirms = [];
  const handlers = [];
  /** @type {string[]} */
  const commands = [];
  const context = {
    instanceId,
    instances: { list: () => [], read: async () => ({}), interact: async () => ({ ok: false, results: [] }) },
    stateManager: {
      getModuleState: (id) => states[id] ?? null,
      setModuleState: (id, s) => { states[id] = s; },
      getProjectCycle: () => cycle,
      get: () => undefined,
      getChartEdits: () => null,
      setChartEdit: () => {},
    },
    i18n: { t: (k) => k, tf: () => tr, getLanguage: () => 'de' },
    eventBus: {
      on: (n, fn) => handlers.push([n, fn]),
      off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
      emit: (n, p) => {
        if (n === 'command:executed') commands.push(p.command);
        for (const [a, f] of [...handlers]) if (a === n) f(p);
      },
    },
    chartManager: fakeChartManager(),
    notify: (...args) => { notes.push(args); },
    dialog: {
      form: (o) => DIALOG.form(o),
      show: (o) => DIALOG.show(o),
      confirm: async (o) => { confirms.push(o); return confirm; },
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
  const q = (sel) => container.querySelector(sel);
  const qa = (sel) => [...container.querySelectorAll(sel)];
  const vm = () => Alpine.$data(container.querySelector('[x-data]'));
  /** Das offene Formular (im Dialog) oder null. */
  const form = () => /** @type {HTMLFormElement|null} */ (dialogs().at(-1)?.querySelector('.ll__form') ?? null);
  const h = {
    inst, states, notes, confirms, commands, container, q, qa, vm, form,
    saved: () => plain(states[instanceId]),
    titles: () => qa('.ll__card .ll__card-title').map((el) => el.textContent),
    card: (id) => /** @type {HTMLElement} */ (q(`.ll__card[data-lesson-id="${id}"]`)),
    head: (id) => /** @type {HTMLButtonElement} */ (h.card(id).querySelector('.ll__card-head')),
    stat: (i) => h.qa('.ll__stat-value')[i].textContent,
    field: (name) => /** @type {any} */ (form()?.querySelector(`[data-field="${name}"]`)),
    tags: () => [...(form()?.querySelectorAll('.ll__action-tag > span') ?? [])].map((el) => el.textContent),
    /** Öffnet die Karte und wartet, bis ihr Inhalt sichtbar ist. */
    expand: async (id) => { h.head(id).click(); await until(() => h.head(id).getAttribute('aria-expanded') === 'true'); await settle(); },
    /** Öffnet einen Dialog und wartet auf das Formular. */
    openWith: async (fn) => { fn(); await until(() => h.form() !== null); await settle(); },
    /** Setzt ein Feld wie eine Eingabe (input und change). */
    set: (el, value) => {
      el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    save: async () => { dialogs().at(-1).querySelector('.dialog__confirm').click(); await settle(); },
    cancel: async () => { dialogs().at(-1).querySelector('.dialog__cancel').click(); await until(() => h.form() === null); },
  };
  return h;
}

/** Der gespeicherte Stand lädt streng (ohne Reparatur). @param {any} saved */
function assertValid(saved) {
  let err = null;
  try { State.fromJSON(plain(saved)); } catch (e) { err = e; }
  assertEqual(err, null, `gespeicherter Stand ungültig: ${err?.message}`);
}

suite('lessons-learned: Viewmodel im Browser', () => {
  test('Leerzustand: Kennzahlen 0, kein Leertext, keine Karte, nichts gespeichert, kein Verlauf', async () => {
    const h = await mount('ll-1', null);
    assertDeepEqual([0, 1, 2, 3, 4].map(h.stat), ['0', '0', '0', '0', '0']);
    assertEqual(h.q('.ll__empty').textContent, '');
    assertEqual(h.titles().length, 0);
    assertEqual(h.states['ll-1'], null);
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Hilfe-Anker: Beschriftungen und Wirkung auf fields, Kartenknöpfe auf actions; Formular und Eingaben leer', async () => {
    const h = await mount('ll-1', plain(SMALL));
    await h.expand('a');
    const keys = h.qa('[data-help-key]').map((el) => el.getAttribute('data-help-key')).filter(Boolean);
    const count = (k) => keys.filter((x) => x === `modules.${ID}.${k}`).length;
    for (const f of ['title', 'category', 'phase', 'owner', 'description', 'rootCause', 'recommendation', 'actions']) {
      assertEqual(count(`fields.lessons.${f}.help`), 1, f);
    }
    assertEqual(count('fields.lessons.impact.help'), 4, 'impact: Formular und drei Karten');
    assertEqual(count('fields.stats.help'), 1);
    assertEqual(count('state.search.help'), 1);
    assertEqual(count('state.filter.help'), 1);
    // Bearbeiten und Löschen je Karte, auch zugeklappt (x-show); Haken je Maßnahme.
    assertEqual(count('actions.updateLesson.help'), 3);
    assertEqual(count('actions.removeLesson.help'), 3);
    assertEqual(count('actions.setActionDone.help'), 2);
    assertEqual(keys.length, 23, keys.join(', '));
    const form = h.q('.ll__form');
    for (const el of [form, ...form.querySelectorAll('input, select, textarea')]) {
      assertEqual(el.getAttribute('data-help-key'), '', el.getAttribute('data-field') ?? el.tagName);
    }
    assertTrue(form.noValidate, 'novalidate');
    // Kein Anker auf einem nur für Vorleser sichtbaren Element.
    assertEqual(h.qa('.dmike-sr-only[data-help-key]').length, 0);
    unmountAll();
  });

  test('Karten: neueste zuerst; der Kopf ist ein Knopf mit aria-expanded; Phase anderer Zyklen ohne Farbklasse', async () => {
    const h = await mount('ll-1', plain(SMALL));
    assertDeepEqual(h.titles(), ['Gamma', 'Beta', 'Alpha']);
    const head = h.head('a');
    assertEqual(head.tagName, 'BUTTON');
    assertEqual(head.getAttribute('aria-expanded'), 'false');
    assertEqual(h.card('a').querySelector('.ll__card-body').style.display, 'none');
    await h.expand('a');
    assertTrue(h.card('a').querySelector('.ll__card-body').style.display !== 'none', 'Inhalt verborgen');
    assertEqual(h.card('a').querySelector('.ll__section-text').textContent, 'Beschreibung A');
    assertEqual(h.card('a').querySelector('.ll__chevron').getAttribute('data-icon'), 'nav.expand-down');
    // Phase eines anderen Zyklus: ihr Name, keine Farbregel im Stil.
    const tagB = h.card('b').querySelector('.ll__phase-tag');
    assertEqual(tagB.textContent, 'phases.design');
    assertEqual(getComputedStyle(tagB).backgroundColor, 'rgba(0, 0, 0, 0)');
    const tagC = h.card('c').querySelector('.ll__phase-tag');
    assertTrue(tagC.classList.contains('ll__phase-tag--measure'));
    assertTrue(getComputedStyle(tagC).backgroundColor !== 'rgba(0, 0, 0, 0)', 'Phasenfarbe fehlt');
    assertEqual(h.card('a').querySelectorAll('.ll__card-meta span')[3].textContent, tr('actionsSummary', { done: 1, total: 2 }));
    head.click();
    await until(() => head.getAttribute('aria-expanded') === 'false');
    assertEqual(h.vm().state.openCards.length, 0);
    unmountAll();
  });

  test('Kennzahlen, Filter als Knopfgruppe und Suche', async () => {
    const h = await mount('ll-1', plain(SMALL));
    assertDeepEqual([0, 1, 2, 3, 4].map(h.stat), ['3', '1', '1', '1', '1']);
    const chips = h.qa('.ll__filter-chip');
    assertEqual(chips[0].tagName, 'LABEL');
    assertEqual(h.q('.ll__filters').getAttribute('role'), 'radiogroup');
    chips[2].click();
    await until(() => h.titles().length === 1);
    assertDeepEqual(h.titles(), ['Beta']);
    assertTrue(chips[2].classList.contains('ll__filter-chip--active'));
    assertEqual(chips[2].querySelector('input').checked, true);
    // Optionsfelder je Instanz benannt, Pfeiltasten wählen den Nachbarn (Browser).
    assertTrue(chips[2].querySelector('input').name.includes('ll-1'), chips[2].querySelector('input').name);
    chips[0].click();
    await until(() => h.titles().length === 3);
    h.set(h.q('[data-ref="search"]'), 'empfehlung');
    await until(() => h.titles().length === 1);
    assertDeepEqual(h.titles(), ['Gamma']);
    h.set(h.q('[data-ref="search"]'), 'nichts');
    await until(() => h.titles().length === 0);
    assertEqual(h.q('.ll__empty').textContent, tr('noResults'));
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Neue Lesson mit der letzten Phase des Zyklus; leerer Titel nach Berührung hält offen; ein Schritt', async () => {
    const h = await mount('ll-1', null, { cycle: 'dmadv' });
    await h.openWith(() => h.vm().openAdd());
    assertEqual(dialogs().at(-1).querySelector('.dialog__title').textContent, tr('addTitle'));
    assertEqual(h.field('phase').value, 'verify');
    assertDeepEqual([...h.field('phase').options].map((o) => o.value), ['define', 'measure', 'analyze', 'design', 'verify']);
    assertEqual(h.field('category').value, 'success');
    assertEqual(h.field('impact').value, 'medium');
    h.set(h.field('owner'), 'Nur Owner');
    await h.save();
    await until(() => h.field('title')?.getAttribute('aria-invalid') === 'true');
    assertTrue(h.form() !== null, 'Dialog geschlossen');
    assertEqual(h.commands.length, 0);
    h.set(h.field('title'), 'Neu');
    await h.save();
    await until(() => h.form() === null);
    assertDeepEqual(h.commands, ['addLesson']);
    const added = h.vm().model.lessons[0];
    assertEqual(added.phase, 'verify');
    assertEqual(added.owner, 'Nur Owner');
    assertValid(h.saved());
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig');
    await until(() => h.titles().length === 0);
    unmountAll();
  });

  test('Bearbeiten mit fremder Phase zeigt die letzte; unberührt bleibt sie, berührt wird sie geschrieben', async () => {
    const h = await mount('ll-1', plain(SMALL));
    await h.expand('b');
    await h.openWith(() => h.card('b').querySelector('[data-action="edit"]').click());
    assertEqual(dialogs().at(-1).querySelector('.dialog__title').textContent, tr('editTitle'));
    assertEqual(h.field('title').value, 'Beta');
    assertEqual(h.field('phase').value, 'control');
    assertEqual(h.field('rootCause').value, 'Ursache B');
    assertEqual(document.activeElement, h.field('title'));
    await h.save();
    await until(() => h.form() === null);
    assertEqual(h.commands.length, 0);
    assertEqual(h.vm().model.lessons[1].phase, 'design');
    await h.openWith(() => h.card('b').querySelector('[data-action="edit"]').click());
    h.set(h.field('owner'), 'Bert');
    await h.save();
    await until(() => h.form() === null);
    assertDeepEqual(h.commands, ['updateLesson']);
    assertEqual(h.vm().model.lessons[1].phase, 'control');
    assertEqual(h.vm().model.lessons[1].owner, 'Bert');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig');
    await until(() => h.vm().model.lessons[1].phase === 'design');
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen');
    await until(() => h.vm().model.lessons[1].owner === 'Bert');
    unmountAll();
  });

  test('Maßnahmen im Dialog — +, Enter (sendet nicht ab) und ×; nur eine Maßnahme anhängen schreibt, ein Schritt', async () => {
    const h = await mount('ll-1', plain(SMALL));
    await h.expand('a');
    await h.openWith(() => h.card('a').querySelector('[data-action="edit"]').click());
    assertDeepEqual(h.tags(), ['Erste', 'Zweite']);
    const input = h.form().querySelector('[data-ref="actionInput"]');
    h.set(input, '  ');
    h.form().querySelector('[data-ref="addActionBtn"]').click();
    await settle();
    assertDeepEqual(h.tags(), ['Erste', 'Zweite']);
    h.set(input, 'Dritte');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await until(() => h.tags().length === 3);
    assertEqual(input.value, '');
    assertTrue(h.form() !== null, 'Enter hat abgesendet');
    assertEqual(h.commands.length, 0);
    h.set(input, 'Vierte');
    h.form().querySelector('[data-ref="addActionBtn"]').click();
    await until(() => h.tags().length === 4);
    h.form().querySelectorAll('.ll__action-tag-remove')[0].click();
    await until(() => h.tags().length === 3);
    assertDeepEqual(h.tags(), ['Zweite', 'Dritte', 'Vierte']);
    assertEqual(h.vm().model.lessons[0].actions.length, 2, 'Formular schreibt ins Model');
    await h.save();
    await until(() => h.form() === null);
    assertDeepEqual(h.commands, ['updateLesson']);
    assertDeepEqual(plain(h.vm().model.lessons[0].actions),
      [{ text: 'Zweite', done: true }, { text: 'Dritte', done: false }, { text: 'Vierte', done: false }]);
    assertValid(h.saved());
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig');
    await until(() => h.vm().model.lessons[0].actions.length === 2);
    assertEqual(h.vm().model.lessons[0].actions[0].text, 'Erste');
    // Abbrechen verwirft, danach öffnet „Neue Lesson“ leer.
    await h.openWith(() => h.card('a').querySelector('[data-action="edit"]').click());
    h.set(input, 'Verworfen');
    h.form().querySelector('[data-ref="addActionBtn"]').click();
    await until(() => h.tags().length === 3);
    await h.cancel();
    assertEqual(h.vm().model.lessons[0].actions.length, 2);
    await h.openWith(() => h.vm().openAdd());
    assertDeepEqual(h.tags(), []);
    assertEqual(h.field('title').value, '');
    assertEqual(input.value, '');
    await h.cancel();
    unmountAll();
  });

  test('Haken ist ein Schritt; Agent-Änderungen folgen in Karte, Kennzahlen und Kachel', async () => {
    const h = await mount('ll-1', plain(SMALL));
    await h.expand('a');
    const checks = () => [...h.card('a').querySelectorAll('.ll__action-check')];
    assertEqual(checks()[0].getAttribute('aria-pressed'), 'false');
    assertEqual(checks()[1].getAttribute('aria-pressed'), 'true');
    checks()[0].click();
    await until(() => h.stat(4) === '0');
    assertDeepEqual(h.commands, ['setActionDone']);
    assertTrue(checks()[0].classList.contains('ll__action-check--done'));
    assertEqual(h.vm().model.lessons[0].actions[0].done, true);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig');
    await until(() => h.stat(4) === '1');
    assertEqual(checks()[0].classList.contains('ll__action-check--done'), false);
    h.vm().model.updateLesson({ lessonId: 'c', category: 'problem', title: 'Gamma neu' });
    await until(() => h.stat(2) === '2');
    assertEqual(h.card('c').querySelector('.ll__card-title').textContent, 'Gamma neu');
    assertEqual(h.stat(3), '0');
    const settings = resolveSettings(validateSchema(tile.settings), {});
    const vm = tile.viewModel({ tileId: 't', instanceId: 'll-1', state: h.saved(), settings,
      i18n: { t: (k) => k, getLanguage: () => 'de' }, theme: 'light', chartManager: null, stateManager: null });
    const s = Object.fromEntries(vm.statItems.map((x) => [x.key, x.value]));
    assertDeepEqual(s, { success: '1', problem: '2', improve: '0', openActions: '1' });
    unmountAll();
  });

  test('Löschen fragt genau einmal; Abbrechen lässt stehen; Rückgängig bringt die Karte zugeklappt zurück', async () => {
    let h = await mount('ll-1', plain(SMALL), { confirm: false });
    await h.expand('a');
    h.card('a').querySelector('[data-action="delete"]').click();
    await settle();
    assertEqual(h.confirms.length, 1);
    assertEqual(h.confirms[0].message, `modules.${ID}.confirm.removeLesson`);
    assertEqual(h.titles().length, 3);
    h = await mount('ll-1', plain(SMALL));
    await h.expand('a');
    h.card('a').querySelector('[data-action="delete"]').click();
    await until(() => h.titles().length === 2);
    assertEqual(h.confirms.length, 1);
    assertDeepEqual(h.commands, ['removeLesson']);
    assertDeepEqual(plain(h.vm().state.openCards), []);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig');
    await until(() => h.titles().length === 3);
    assertEqual(h.head('a').getAttribute('aria-expanded'), 'false');
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen');
    await until(() => h.titles().length === 2);
    h.vm().model.removeLesson({ lessonId: 'b' });
    await until(() => h.titles().length === 1);
    assertEqual(h.confirms.length, 1, 'Agent ohne Rückfrage');
    unmountAll();
  });

  test('Import über die verborgene Dateiauswahl — Meldung, ein Schritt, doppelte id neu; Fehler lassen den Stand', async () => {
    const h = await mount('ll-1', plain(SMALL));
    const drop = h.q('[data-ref="importDrop"]');
    assertEqual(drop.getAttribute('x-file-drop'), 'importFile');
    assertTrue(drop.hidden, 'sichtbare Ablagefläche');
    const input = drop.querySelector('input[type="file"]');
    assertEqual(input.getAttribute('accept'), '.json');
    let opened = 0;
    input.addEventListener('click', (e) => { e.preventDefault(); opened += 1; });
    h.vm().openImport();
    assertEqual(opened, 1);
    const file = (text) => ({ text: async () => text });
    await h.vm().importFile(file(JSON.stringify([{ id: 'a', title: 'Doppelt' }, { title: 'Frei' }])));
    await until(() => h.titles().length === 5);
    assertDeepEqual(h.notes.at(-1), [tr('importSuccess', { count: 2 }), 'success']);
    const ids = h.vm().model.lessons.map((l) => l.id);
    assertEqual(new Set(ids).size, 5, ids.join(','));
    assertDeepEqual(h.commands, ['importLessons']);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig');
    await until(() => h.titles().length === 3);
    const warn = console.warn;
    console.warn = () => {};
    try {
      await h.vm().importFile(file('{kaputt'));
      await h.vm().importFile(file('{"title":"Objekt"}'));
    } finally { console.warn = warn; }
    await settle();
    assertDeepEqual(h.notes.slice(-2), [[tr('importError'), 'error'], [tr('importError'), 'error']]);
    assertEqual(h.titles().length, 3);
    unmountAll();
  });

  test('zwei Instanzen: Beschriftungen zeigen aufs eigene Feld, keine doppelten ids; Titel ist Pflicht; Dialog bleibt im eigenen Modul', async () => {
    const a = await mount('ll-1', plain(SMALL));
    const b = await mount('ll-2', plain(SMALL), { keep: true });
    assertTrue(a.vm().fieldId('title') !== b.vm().fieldId('title'), 'fieldId gleich');
    for (const h of [a, b]) {
      const form = h.q('.ll__form');
      const labels = [...form.querySelectorAll('label')];
      assertEqual(labels.length, 9);
      for (const label of labels) {
        const target = document.getElementById(label.htmlFor);
        assertTrue(!!target && form.contains(target), `${label.htmlFor} zeigt nicht ins eigene Formular`);
      }
      const title = form.querySelector('[data-field="title"]');
      assertTrue(title.hasAttribute('required'), 'required');
      assertEqual(title.getAttribute('aria-required'), 'true');
    }
    const ids = [...document.querySelectorAll('.ll__form [id]')].map((el) => el.id);
    assertEqual(ids.length, 18);
    assertEqual(new Set(ids).size, ids.length, 'doppelte ids');
    await b.openWith(() => b.vm().openAdd());
    b.set(b.field('title'), 'Nur B');
    await b.save();
    await until(() => b.form() === null);
    assertEqual(b.titles().length, 4);
    assertEqual(a.titles().length, 3);
    assertEqual(a.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Abbau bei offenem Dialog schließt ihn', async () => {
    const h = await mount('ll-1', plain(SMALL));
    await h.openWith(() => h.vm().openAdd());
    assertEqual(dialogs().length, 1);
    h.inst.destroy();
    await until(() => dialogs().length === 0);
    assertEqual(dialogs().length, 0);
    unmountAll();
  });
});
