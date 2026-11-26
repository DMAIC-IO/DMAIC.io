/**
 * TRIZ Stoff-Feld-Analyse: das Viewmodel im Browser (viewmodel/viewmodel.js)
 * mit dem echten Modul und der echten Vorlage. Prüft: Leerzustand mit
 * Auswahllisten, Dreieck und den fünf Klassen, Hilfe-Anker, Eingaben über
 * `x-model`/`x-field`/`x-set` (gespeicherter Stand gültig, je ein
 * Verlaufsschritt), Diagnose und sichtbare Klassen, Kanten des Dreiecks,
 * Auf- und Zuklappen der Klassen ohne Schreiben beim Einhängen, Notiz je
 * Standardlösung auf einen fehlenden Schlüssel, Vormerkung über das
 * Kästchen, ids je Instanz und das Altprojekt ohne Verlaufsschritt.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerCommandDirectives } from '../../js/core/command-directives.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import mod from '../../js/modules/triz-sufield/viewmodel/viewmodel.js';
import { State } from '../../js/modules/triz-sufield/domain/model.js';
import { setFields } from '../../js/core/model.js';

const ID = 'triz-sufield';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
/** @type {HTMLElement[]} */
const mounted = [];
let prepared = false;
let UI = null;

/** Text des Moduls unter einem Punktpfad, `{name}` aus `params`; sonst der Pfad. */
function tr(path, params) {
  const v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), UI);
  if (typeof v !== 'string') return path;
  return params ? v.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : v;
}

async function prepare() {
  if (!prepared) {
    registerFieldDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
    registerCommandDirectives(Alpine);
    if (!Alpine.version) Alpine.start();
    UI = await (await fetch(new URL(`../../js/modules/${ID}/resources/i18n/ui.de.json`, import.meta.url), { cache: 'no-cache' })).json();
    prepared = true;
  }
  // Eine schon eingebettete Vorlage (wie im Build) bleibt stehen.
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

/** Stand aus der Fixture `legacy-project.json` (mit `_schema` '1.0', wie die Altform ihn schrieb). */
const LEGACY = {
  _schema: { name: ID, version: '1.0' },
  s1: 'Öl & Späne <Größe "M3"> im Kühlschmierstoff',
  s2: 'Fräser',
  field: 'E',
  link: 'excessive',
  problemNote: 'Funkenerosion greift die Schneide an.\nStrom zu hoch — Schneide überhitzt & bricht.',
  notes: {
    '2.2.5': 'Gepulster Strom statt Dauerstrom.\nSpitzen < 40 A & Pausen "kurz".',
    '5.3.1': 'Phasenwechsel im Kühlmittel nutzen —\nVerdampfung führt Wärme ab.',
  },
  selected: { '2.2.5': true, '4.2.1': true },
  filterMode: 'all',
  expandedClasses: [5, 2],
};
const plain = (v) => JSON.parse(JSON.stringify(v));

/** Ereignisbus mit einsehbarer Handlerliste (`handlers`: `[name, fn]`-Paare). */
function makeBus() {
  /** @type {[string, Function][]} */
  const handlers = [];
  return {
    handlers,
    on: (n, fn) => handlers.push([n, fn]),
    off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
    emit: (n, p) => { for (const [a, f] of [...handlers]) if (a === n) f(p); },
  };
}

/**
 * Eine Instanz einhängen (eigene Kopie des Moduls wie in der Registry).
 * @param {string} instanceId
 * @param {object|null} model gespeicherter Zustand
 * @param {{ keep?: boolean, bus?: ReturnType<typeof makeBus> }} [opts] `keep`: vorher eingehängte
 *   Instanzen bleiben; `bus`: gemeinsamer Ereignisbus mehrerer Instanzen (sonst ein eigener)
 */
async function mount(instanceId, model, { keep = false, bus = makeBus() } = {}) {
  await prepare();
  if (!keep) unmountAll();
  const states = { [instanceId]: model };
  /** @type {any[][]} */
  const notes = [];
  const context = {
    instanceId,
    instances: { list: () => [], read: async () => ({}), interact: async () => ({ ok: false, results: [] }) },
    stateManager: {
      getModuleState: (id) => states[id] ?? null,
      setModuleState: (id, s) => { states[id] = s; },
      getProjectCycle: () => 'eightd',
      get: () => undefined,
      getChartEdits: () => null,
      setChartEdit: () => {},
    },
    i18n: { t: (k) => k, tf: () => tr, getLanguage: () => 'de' },
    eventBus: bus,
    chartManager: { create: async () => ({}), update: () => {}, destroy: () => {} },
    notify: (...args) => { notes.push(args); },
    dialog: { confirm: async () => true, show: () => ({ close() {}, setTitle() {} }) },
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
  const klass = (c) => /** @type {HTMLDetailsElement} */ (q(`.triz-sf__class[data-class="${c}"]`));
  const std = (id) => /** @type {HTMLLIElement} */ (q(`.triz-sf__standard[data-id="${id}"]`));
  return {
    inst, states, notes, container, q, qa, klass, std,
    vm: () => Alpine.$data(container.querySelector('[x-data]')),
    input: (role) => /** @type {HTMLInputElement} */ (q(`[data-role="${role}"]`)),
    select: (role) => /** @type {HTMLSelectElement} */ (q(`select[data-role="${role}"]`)),
    radio: (v) => /** @type {HTMLInputElement} */ (q(`input[data-role="filter"][value="${v}"]`)),
    note: (id) => /** @type {HTMLTextAreaElement} */ (std(id).querySelector('[data-role="standard-note"]')),
    box: (id) => /** @type {HTMLInputElement} */ (std(id).querySelector('[data-role="standard-select"]')),
    pin: (id) => /** @type {HTMLElement} */ (std(id).querySelector('.triz-sf__standard-pin')),
    edge: () => /** @type {SVGLineElement} */ (q('line.triz-sf__edge')),
    svgText: (x, y) => q(`svg text[x="${x}"][y="${y}"]`)?.textContent ?? null,
    /** Sichtbare Klassen (Nummern in DOM-Reihenfolge). */
    visible: () => qa('.triz-sf__class').filter((el) => el.style.display !== 'none').map((el) => Number(el.dataset.class)),
    /** Offene Klassen (Nummern in DOM-Reihenfolge). */
    open: () => qa('.triz-sf__class').filter((el) => el.open).map((el) => Number(el.dataset.class)),
    /** Ins Feld wechseln, Text tippen und das Feld verlassen. */
    type: async (el, value) => {
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      await settle();
    },
    /** Wahl in einer Auswahlliste; danach verlässt der Fokus die Liste. */
    choose: async (role, value) => {
      const el = /** @type {HTMLSelectElement} */ (q(`select[data-role="${role}"]`));
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      await settle();
    },
    /** Klick auf den Kopf einer Klasse (klappt sie im Browser auf oder zu). */
    toggleClass: async (c) => { klass(c).querySelector('summary').click(); await settle(); },
    /** Eine Standardlösung öffnen (reiner DOM-Zustand). */
    openStd: async (id) => { std(id).querySelector('details').open = true; await settle(); },
    click: async (el) => { el.click(); await settle(); },
  };
}

/** Der gespeicherte Stand lädt streng (ohne Reparatur). @param {any} saved */
function assertValid(saved) {
  let err = null;
  try { State.fromJSON(plain(saved)); } catch (e) { err = e; }
  assertEqual(err, null, `gespeicherter Stand ungültig: ${err?.message}`);
}

suite('triz-sufield: Viewmodel im Browser', () => {
  test('Leerzustand: Listen mit Leeroption, Dreieck ohne Feld, fünf Klassen mit 78 Lösungen, Klasse 1 offen, nichts gespeichert', async () => {
    const h = await mount('sf-1', null);
    const field = h.select('field');
    assertDeepEqual([...field.options].map((o) => o.value), ['', 'M', 'A', 'T', 'C', 'E', 'Mg']);
    assertDeepEqual([...field.options].map((o) => o.textContent), [tr('selectPlaceholder'), ...['M', 'A', 'T', 'C', 'E', 'Mg'].map((f) => tr(`field.${f}`))]);
    assertEqual(field.value, '');
    const link = h.select('link');
    assertDeepEqual([...link.options].map((o) => o.value), ['', 'useful', 'insufficient', 'excessive', 'harmful', 'missing']);
    assertEqual(link.options[2].textContent, tr('link.insufficient'));
    assertEqual(link.value, '');
    assertEqual(h.input('s1').value, '');
    assertEqual(h.input('s1').placeholder, tr('s1Placeholder'));
    assertEqual(h.input('s2').placeholder, tr('s2Placeholder'));
    assertEqual(h.q('[data-role="problem-note"]').getAttribute('aria-label'), tr('problemNoteLabel'));
    // Dreieck: Platzhalter als Beschriftung, kein Feld, gestrichelte Seiten.
    assertEqual(h.svgText('160', '14'), tr('fieldEmpty'));
    assertEqual(h.svgText('60', '195'), tr('s1Placeholder'));
    assertEqual(h.svgText('260', '195'), tr('s2Placeholder'));
    assertTrue(h.q('svg.triz-sf__diagram').classList.contains('triz-sf__edge--empty'), 'Kantenklasse ohne Verknüpfung');
    assertEqual(h.qa('svg line')[1].getAttribute('stroke-dasharray'), '2 4');
    // Diagnose ohne Stoffe.
    assertEqual(h.q('.triz-sf__diagnosis-text span').textContent, tr('situation.partial'));
    assertDeepEqual(h.qa('.triz-sf__diagnosis-classes code').map((el) => el.textContent), ['1']);
    // Filter „nur empfohlene“, Klassen.
    assertEqual(h.radio('auto').checked, true);
    assertEqual(h.radio('all').checked, false);
    assertEqual(h.qa('.triz-sf__class').length, 5);
    assertDeepEqual(h.qa('.triz-sf__class').map((el) => el.querySelectorAll('.triz-sf__standard').length), [13, 25, 6, 17, 17]);
    assertEqual(h.qa('.triz-sf__standard').length, 78);
    assertDeepEqual(h.visible(), [1]);
    assertDeepEqual(h.open(), [1]);
    assertEqual(h.klass(1).querySelector('.icon').getAttribute('data-icon'), 'nav.expand-down');
    assertEqual(h.klass(2).querySelector('.icon').getAttribute('data-icon'), 'nav.expand-right');
    assertEqual(h.klass(2).querySelector('.triz-sf__class-count').textContent, '(25)');
    assertEqual(h.klass(3).querySelector('.triz-sf__class-title').textContent, tr('class.3.name'));
    assertEqual(h.klass(3).querySelector('.triz-sf__class-desc').textContent, tr('class.3.description'));
    // Eine Lösung: Texte aus den Übersetzungen, ohne Notiz und Vormerkung.
    const s = h.std('2.2.5');
    assertEqual(s.querySelector('.triz-sf__standard-id').textContent, '2.2.5');
    assertEqual(s.querySelector('.triz-sf__standard-title').textContent, tr('standards.2.2.5.title'));
    assertEqual(s.querySelector('.triz-sf__standard-desc').textContent, tr('standards.2.2.5.description'));
    assertEqual(s.querySelector('.triz-sf__standard-trigger span').textContent, tr('standards.2.2.5.trigger'));
    assertEqual(s.querySelector('.triz-sf__standard-example span').textContent, tr('standards.2.2.5.example'));
    assertEqual(h.note('2.2.5').value, '');
    assertEqual(h.note('2.2.5').placeholder, tr('standardNotePlaceholder'));
    assertEqual(h.box('2.2.5').checked, false);
    assertEqual(h.pin('2.2.5').style.display, 'none');
    assertEqual(h.pin('2.2.5').getAttribute('data-icon'), 'status.selected');
    assertEqual(s.className.trim(), 'triz-sf__standard');
    // Einhängen schreibt nichts und legt keinen Schritt an.
    assertEqual(h.states['sf-1'], null);
    assertEqual(h.inst.historyCan('undo'), false);
    assertDeepEqual(plain(h.vm().model.expandedClasses), []);
    assertDeepEqual(plain(h.vm().state.autoOpen), [1]);
    unmountAll();
  });

  test('Hilfe-Anker: Beschriftungen, Diagnose, Filter, je Klasse Name und Beschreibung, je Lösung das Kästchen; Listen und Wirt leer', async () => {
    const h = await mount('sf-1', null);
    const keys = h.qa('[data-help-key]').map((el) => el.getAttribute('data-help-key')).filter(Boolean);
    const count = (k) => keys.filter((x) => x === `modules.${ID}.${k}`).length;
    for (const k of ['s1', 's2', 'field', 'link', 'diagnosis', 'filterMode']) assertEqual(count(`fields.${k}.help`), 1, k);
    assertEqual(count('types.Diagnosis.situation'), 1);
    assertEqual(count('types.Diagnosis.suggestedClasses'), 1);
    assertEqual(count('fields.expandedClasses.help'), 5);
    assertEqual(count('fields.standards.help'), 5);
    assertEqual(count('fields.selected.help'), 78);
    assertEqual(keys.length, 6 + 2 + 5 + 5 + 78, keys.slice(0, 20).join(', '));
    assertEqual(h.select('field').getAttribute('data-help-key'), '');
    assertEqual(h.select('link').getAttribute('data-help-key'), '');
    const host = h.q('[role="radiogroup"]');
    assertEqual(host.getAttribute('data-help-key'), '');
    assertEqual(host.getAttribute('aria-label'), tr('filterAria'));
    assertEqual(h.qa('.triz-sf__filter-label')[1].getAttribute('data-help-anchor'), 'box');
    assertEqual(h.q('.triz-sf__diagnosis-text strong').getAttribute('data-help-key'), `modules.${ID}.fields.diagnosis.help`);
    assertEqual(h.std('1.1.1').querySelector('.triz-sf__standard-select').getAttribute('data-help-key'), `modules.${ID}.fields.selected.help`);
    unmountAll();
  });

  test('Stoffe, Listen und Problemnotiz schreiben ins Model, gespeichert gültig, je ein Verlaufsschritt; Rückgängig und Wiederholen', async () => {
    const h = await mount('sf-1', null);
    const vm = h.vm();
    await h.type(h.input('s1'), 'Bohrer & Co <M8>');
    assertEqual(vm.model.s1, 'Bohrer & Co <M8>');
    assertEqual(h.states['sf-1'].s1, 'Bohrer & Co <M8>');
    assertValid(h.states['sf-1']);
    await h.type(h.input('s2'), 'Beton');
    await h.choose('field', 'Mg');
    assertEqual(vm.model.field, 'Mg');
    assertEqual(h.states['sf-1'].field, 'Mg');
    assertValid(h.states['sf-1']);
    await h.choose('link', 'harmful');
    assertEqual(h.states['sf-1'].link, 'harmful');
    await h.type(h.q('[data-role="problem-note"]'), 'Zeile 1\n"Zeile" 2 & <mehr>');
    assertEqual(h.states['sf-1'].problemNote, 'Zeile 1\n"Zeile" 2 & <mehr>');
    assertValid(h.states['sf-1']);
    // Leeroption nimmt die Wahl zurück.
    await h.choose('field', '');
    assertEqual(vm.model.field, '');
    assertEqual(h.states['sf-1'].field, '');
    assertValid(h.states['sf-1']);

    // Sechs Eingaben, sechs Schritte.
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Leeroption) ohne Wirkung');
    await settle();
    assertEqual(h.select('field').value, 'Mg');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Problemnotiz) ohne Wirkung');
    await settle();
    assertEqual(h.q('[data-role="problem-note"]').value, '');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Verknüpfung) ohne Wirkung');
    await settle();
    assertEqual(h.select('link').value, '');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Feld) ohne Wirkung');
    await settle();
    assertEqual(h.select('field').value, '');
    assertEqual(h.states['sf-1'].field, '');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (S2) ohne Wirkung');
    await settle();
    assertEqual(h.input('s2').value, '');
    assertEqual(h.input('s1').value, 'Bohrer & Co <M8>');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (S1) ohne Wirkung');
    await settle();
    assertEqual(h.input('s1').value, '');
    assertEqual(h.inst.historyCan('undo'), false);
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen (S1) ohne Wirkung');
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen (S2) ohne Wirkung');
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen (Feld) ohne Wirkung');
    await settle();
    assertEqual(h.input('s1').value, 'Bohrer & Co <M8>');
    assertEqual(h.select('field').value, 'Mg');
    assertEqual(h.states['sf-1'].field, 'Mg');
    unmountAll();
  });

  test('Diagnose und sichtbare Klassen folgen Verknüpfung und Filter; der Filter ist ein Schritt', async () => {
    const h = await mount('sf-1', null);
    await h.type(h.input('s1'), 'Bohrer');
    await h.type(h.input('s2'), 'Beton');
    assertEqual(h.q('.triz-sf__diagnosis-text span').textContent, tr('situation.incomplete'));
    await h.choose('field', 'M');
    const cases = [
      ['useful', 'complete-useful', [2, 3]],
      ['insufficient', 'complete-insufficient', [2]],
      ['excessive', 'complete-excessive', [2, 5]],
      ['harmful', 'complete-harmful', [1, 5]],
      ['missing', 'incomplete', [1]],
    ];
    for (const [link, situation, classes] of cases) {
      await h.choose('link', link);
      assertEqual(h.q('.triz-sf__diagnosis-text span').textContent, tr(`situation.${situation}`), link);
      assertDeepEqual(h.qa('.triz-sf__diagnosis-classes code').map((el) => Number(el.textContent)), classes, link);
      assertDeepEqual(h.visible(), classes, link);
    }
    // Die beim Einhängen offene Klasse 1 bleibt offen, solange nichts gespeichert ist.
    assertDeepEqual(h.open(), [1]);
    assertDeepEqual(plain(h.vm().model.expandedClasses), []);
    const before = h.states['sf-1'];
    await h.click(h.radio('all'));
    assertEqual(h.vm().model.filterMode, 'all');
    assertEqual(h.states['sf-1'].filterMode, 'all');
    assertValid(h.states['sf-1']);
    assertDeepEqual(h.visible(), [1, 2, 3, 4, 5]);
    assertEqual(h.radio('all').checked, true);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Filter) ohne Wirkung');
    await settle();
    assertEqual(h.radio('auto').checked, true);
    assertEqual(h.states['sf-1'].filterMode, 'auto');
    assertDeepEqual(h.states['sf-1'], before);
    assertDeepEqual(h.visible(), [1]);
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen (Filter) ohne Wirkung');
    await settle();
    assertDeepEqual(h.visible(), [1, 2, 3, 4, 5]);
    unmountAll();
  });

  test('Dreieck: Kantenklasse, Strichart und Pfeilspitze je Verknüpfung, Beschriftungen gekürzt', async () => {
    const h = await mount('sf-1', null);
    const arrow = `url(#triz-sf-arrow-sf-1)`;
    assertEqual(h.q('marker').id, 'triz-sf-arrow-sf-1');
    assertEqual(h.edge().getAttribute('marker-end'), arrow);
    assertEqual(h.edge().getAttribute('stroke-dasharray'), null);
    const want = { useful: null, insufficient: '6 4', excessive: null, harmful: '2 4', missing: '2 6' };
    for (const [link, dash] of Object.entries(want)) {
      await h.choose('link', link);
      const svg = h.q('svg.triz-sf__diagram');
      assertTrue(svg.classList.contains(`triz-sf__edge--${link}`), `Kantenklasse ${link}`);
      assertEqual(svg.classList.contains('triz-sf__edge--empty'), false);
      assertEqual(h.edge().getAttribute('stroke-dasharray'), dash, link);
      assertEqual(h.edge().getAttribute('marker-end'), link === 'missing' ? null : arrow, link);
      assertEqual(h.edge().getAttribute('stroke'), null, 'Farbe kommt aus dem CSS');
    }
    await h.choose('field', 'T');
    assertEqual(h.svgText('160', '14'), tr('field.T'));
    assertEqual(h.qa('svg line')[1].getAttribute('stroke-dasharray'), '0');
    await h.type(h.input('s1'), 'Öl & Späne <Größe "M3"> im Kühlschmierstoff');
    assertEqual(h.svgText('60', '195'), 'Öl & Späne <Größe "M3…');
    await h.type(h.input('s2'), 'Fräser');
    assertEqual(h.svgText('260', '195'), 'Fräser');
    unmountAll();
  });

  test('Klassenkopf: Aufklappen und Zuklappen je ein Schritt, auch die einzige offene bleibt zu; Rückgängig und Wiederholen', async () => {
    const h = await mount('sf-1', null);
    const vm = h.vm();
    await h.click(h.radio('all'));
    assertEqual(h.inst.historyCan('undo'), true);
    assertDeepEqual(h.open(), [1]);
    // Erstes Aufklappen: der sichtbare Stand (1) und die neue Klasse in einem Schritt.
    await h.toggleClass(4);
    assertDeepEqual(h.open(), [1, 4]);
    assertDeepEqual(plain(vm.model.expandedClasses), [1, 4]);
    assertDeepEqual(h.states['sf-1'].expandedClasses, [1, 4]);
    assertDeepEqual(plain(vm.state.autoOpen), []);
    assertValid(h.states['sf-1']);
    assertEqual(h.klass(4).querySelector('.icon').getAttribute('data-icon'), 'nav.expand-down');
    await h.toggleClass(1);
    assertDeepEqual(h.open(), [4]);
    assertDeepEqual(h.states['sf-1'].expandedClasses, [4]);
    // Die einzige offene zuklappen: alle zu, keine springt auf.
    await h.toggleClass(4);
    assertDeepEqual(h.open(), []);
    assertDeepEqual(h.states['sf-1'].expandedClasses, []);
    await settle();
    assertDeepEqual(h.open(), []);
    // Drei Klicks, drei Schritte; danach der Filter.
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (4 zu) ohne Wirkung');
    await settle();
    assertDeepEqual(h.open(), [4]);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (1 zu) ohne Wirkung');
    await settle();
    assertDeepEqual(h.open(), [1, 4]);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (4 auf) ohne Wirkung');
    await settle();
    // Zurück auf den leeren Stand: der UI-State ist geleert, alle Klassen zu.
    assertDeepEqual(plain(vm.model.expandedClasses), []);
    assertDeepEqual(h.open(), []);
    assertEqual(vm.model.filterMode, 'all');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Filter) ohne Wirkung');
    await settle();
    assertEqual(h.inst.historyCan('undo'), false, 'das Rendern von open legte einen Schritt an');
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen (Filter)');
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen (4 auf)');
    await settle();
    assertDeepEqual(h.open(), [1, 4]);
    assertDeepEqual(h.states['sf-1'].expandedClasses, [1, 4]);
    assertEqual(h.inst.historyCan('redo'), true);
    unmountAll();
  });

  test('Zuklappen der beim Einhängen offenen Klasse: bleibt zu, das Model bleibt leer (kein Schritt), neu eingehängt ist sie wieder offen', async () => {
    const h = await mount('sf-1', null);
    await h.toggleClass(1);
    await settle();
    assertDeepEqual(h.open(), []);
    assertDeepEqual(plain(h.vm().state.autoOpen), []);
    assertDeepEqual(plain(h.vm().model.expandedClasses), []);
    // Das Model ändert sich nicht ([] → []): kein Verlaufsschritt.
    assertEqual(h.inst.historyCan('undo'), false);
    const saved = h.states['sf-1'];
    if (saved) assertValid(saved);
    // Neu eingehängt gilt wieder die Vorbelegung (wie die Altform beim Einhängen).
    const again = await mount('sf-1', saved ? plain(saved) : null);
    assertDeepEqual(again.open(), [1]);
    assertEqual(again.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Aufklappstand von außen (Agent): die Anzeige zeigt genau den gespeicherten Stand, die Vorbelegung entfällt; Rückgängig und Wiederholen ebenso', async () => {
    const h = await mount('sf-1', null);
    const vm = h.vm();
    assertDeepEqual(h.open(), [1]);
    vm.model.setExpandedClasses({ classes: [4] });
    await settle();
    assertDeepEqual(h.open(), [4]);
    assertDeepEqual(plain(vm.state.autoOpen), []);
    assertDeepEqual(h.states['sf-1'].expandedClasses, [4]);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Agent) ohne Wirkung');
    await settle();
    // Zurück auf den leeren Stand: die Vorbelegung kehrt nicht zurück.
    assertDeepEqual(plain(vm.model.expandedClasses), []);
    assertDeepEqual(h.open(), []);
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen (Agent) ohne Wirkung');
    await settle();
    assertDeepEqual(h.open(), [4]);
    // Neu eingehängt mit gespeichertem Stand: genau dieser offen.
    const again = await mount('sf-1', plain(h.states['sf-1']));
    assertDeepEqual(again.open(), [4]);
    unmountAll();
  });

  test('Aufklappstand von außen: leerer Agentenaufruf, Rückgängig, Fremdstand und instance.set; ohne Änderung bleibt die Vorbelegung', async () => {
    // Agent setzt [] in einer frischen Instanz: kein geänderter Stand, aber die Anzeige folgt dem Aufruf.
    let h = await mount('sf-1', null);
    let vm = h.vm();
    vm.model.setExpandedClasses({ classes: [] });
    await settle();
    assertDeepEqual(h.open(), []);
    assertDeepEqual(plain(vm.model.expandedClasses), []);
    // Rückgängig eines Agentenaufrufs nach dem Filter: der Filter allein lässt die Vorbelegung stehen.
    h = await mount('sf-1', null);
    vm = h.vm();
    await h.click(h.radio('all'));
    assertDeepEqual(h.open(), [1]);
    vm.model.setExpandedClasses({ classes: [2, 3] });
    await settle();
    assertDeepEqual(h.open(), [2, 3]);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Agent) ohne Wirkung');
    await settle();
    assertDeepEqual(h.open(), []);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Filter) ohne Wirkung');
    await settle();
    assertDeepEqual(h.open(), []);
    // Fremdstand in der laufenden Instanz (ohne Neueinhängen).
    h = await mount('sf-1', null);
    vm = h.vm();
    h.inst.applyRemoteState({ ...plain(h.inst.getState()), expandedClasses: [3] });
    await settle();
    assertDeepEqual(h.open(), [3]);
    assertDeepEqual(plain(h.vm().state.autoOpen), []);
    // instance.set: der Aufklappstand ist ein Ansichtsfeld und nicht setzbar; Inhaltsfelder lassen die Vorbelegung stehen.
    h = await mount('sf-1', null);
    vm = h.vm();
    let err = null;
    try { setFields(vm.model, { expandedClasses: [4] }); } catch (e) { err = e; }
    assertTrue(err instanceof Error, 'Ansichtsfeld über instance.set gesetzt');
    setFields(vm.model, { s1: 'Bohrer' });
    await settle();
    assertDeepEqual(h.open(), [1]);
    assertDeepEqual(plain(vm.model.expandedClasses), []);
    unmountAll();
  });

  test('Notiz je Lösung: fehlender Schlüssel leer, Tippen legt ihn an, gespeichert streng gültig, Rückgängig nimmt ihn weg', async () => {
    const h = await mount('sf-1', null);
    await h.openStd('1.1.2');
    const ta = h.note('1.1.2');
    assertEqual(ta.value, '');
    assertEqual(ta.getAttribute('aria-labelledby'), 'triz-sf-std-1.1.2-sf-1');
    assertEqual(document.getElementById(ta.getAttribute('aria-labelledby')), h.std('1.1.2').querySelector('.triz-sf__standard-title'));
    await h.type(ta, 'Feld einführen & <prüfen>\n"zweite" Zeile');
    assertDeepEqual(plain(h.vm().model.notes), { '1.1.2': 'Feld einführen & <prüfen>\n"zweite" Zeile' });
    assertDeepEqual(h.states['sf-1'].notes, { '1.1.2': 'Feld einführen & <prüfen>\n"zweite" Zeile' });
    assertValid(h.states['sf-1']);
    assertEqual(h.note('1.1.1').value, '');
    // Eine zweite Notiz in einer anderen Klasse.
    await h.click(h.radio('all'));
    await h.toggleClass(5);
    await h.openStd('5.3.1');
    await h.type(h.note('5.3.1'), 'Phasenwechsel');
    assertDeepEqual(h.states['sf-1'].notes, { '1.1.2': 'Feld einführen & <prüfen>\n"zweite" Zeile', '5.3.1': 'Phasenwechsel' });
    assertValid(h.states['sf-1']);
    // Leer getippt bleibt der Schlüssel mit leerem Text stehen.
    await h.type(h.note('5.3.1'), '');
    assertDeepEqual(h.states['sf-1'].notes, { '1.1.2': 'Feld einführen & <prüfen>\n"zweite" Zeile', '5.3.1': '' });
    assertValid(h.states['sf-1']);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (leer) ohne Wirkung');
    await settle();
    assertEqual(h.note('5.3.1').value, 'Phasenwechsel');
    // Notiz 5.3.1, Klasse 5, Filter: drei Schritte.
    for (let i = 0; i < 3; i++) assertTrue(h.inst.historyStep('undo'), `Rückgängig ${i}`);
    await settle();
    assertDeepEqual(plain(h.vm().model.notes), { '1.1.2': 'Feld einführen & <prüfen>\n"zweite" Zeile' });
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (erste Notiz) ohne Wirkung');
    await settle();
    assertDeepEqual(plain(h.vm().model.notes), {});
    assertDeepEqual(h.states['sf-1'].notes, {});
    assertEqual(ta.value, '');
    assertEqual(ta.value === 'undefined', false);
    assertEqual(h.inst.historyCan('undo'), false);
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen ohne Wirkung');
    await settle();
    assertEqual(h.note('1.1.2').value, 'Feld einführen & <prüfen>\n"zweite" Zeile');
    unmountAll();
  });

  test('Kästchen: Vormerkung über setStandardSelected, Stern und Akzentrand folgen, je ein Schritt, Rückgängig nimmt sie zurück', async () => {
    const h = await mount('sf-1', null);
    await h.openStd('1.2.3');
    await h.click(h.box('1.2.3'));
    assertDeepEqual(plain(h.vm().model.selected), { '1.2.3': true });
    assertDeepEqual(h.states['sf-1'].selected, { '1.2.3': true });
    assertValid(h.states['sf-1']);
    assertEqual(h.box('1.2.3').checked, true);
    assertEqual(h.pin('1.2.3').style.display, '');
    assertTrue(h.std('1.2.3').classList.contains('is-selected'), 'Akzentrand fehlt');
    assertEqual(h.std('1.2.2').classList.contains('is-selected'), false);
    await h.click(h.box('1.1.1'));
    assertDeepEqual(h.states['sf-1'].selected, { '1.2.3': true, '1.1.1': true });
    // Abhaken löscht den Schlüssel.
    await h.click(h.box('1.2.3'));
    assertDeepEqual(h.states['sf-1'].selected, { '1.1.1': true });
    assertEqual(h.pin('1.2.3').style.display, 'none');
    assertEqual(h.std('1.2.3').classList.contains('is-selected'), false);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (abhaken) ohne Wirkung');
    await settle();
    assertEqual(h.box('1.2.3').checked, true);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (1.1.1) ohne Wirkung');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (1.2.3) ohne Wirkung');
    await settle();
    assertDeepEqual(h.states['sf-1'].selected, {});
    assertEqual(h.box('1.2.3').checked, false);
    assertEqual(h.pin('1.2.3').style.display, 'none');
    assertEqual(h.inst.historyCan('undo'), false);
    assertEqual(h.notes.length, 0);
    unmountAll();
  });

  test('zwei Instanzen: eindeutige ids, label[for], aria-labelledby und Pfeilspitze im eigenen Modul, Radio-Namen verschieden, Kommandos getrennt', async () => {
    const bus = makeBus();
    const a = await mount('sf-a', null, { bus });
    const b = await mount('sf-b', null, { keep: true, bus });
    const ids = [...document.querySelectorAll('.triz-sf [id]')].map((el) => el.id);
    assertEqual(ids.length, 2 * (4 + 1 + 78));
    assertEqual(new Set(ids).size, ids.length, 'doppelte ids');
    for (const h of [a, b]) {
      const labels = h.container.querySelectorAll('label[for]');
      assertEqual(labels.length, 4);
      for (const l of labels) {
        const target = document.getElementById(/** @type {HTMLLabelElement} */ (l).htmlFor);
        assertTrue(!!target && h.container.contains(target), `${l.htmlFor} zeigt nicht ins eigene Modul`);
      }
      for (const ta of h.qa('[data-role="standard-note"]')) {
        const title = document.getElementById(ta.getAttribute('aria-labelledby'));
        assertTrue(!!title && h.container.contains(title), `${ta.getAttribute('aria-labelledby')} zeigt nicht ins eigene Modul`);
      }
      const marker = h.q('marker');
      const ref = h.edge().getAttribute('marker-end');
      assertEqual(ref, `url(#${marker.id})`);
      assertTrue(h.container.contains(document.getElementById(marker.id)), 'Pfeilspitze nicht im eigenen Modul');
    }
    const nameA = a.radio('auto').name;
    const nameB = b.radio('auto').name;
    assertTrue(nameA !== '' && nameB !== '' && nameA !== nameB, `Radio-Namen: ${nameA} / ${nameB}`);
    assertEqual(a.radio('all').name, nameA);
    await a.type(a.input('s1'), 'A');
    await b.type(b.input('s1'), 'B');
    await b.click(b.radio('all'));
    await b.openStd('1.1.1');
    await b.type(b.note('1.1.1'), 'nur B');
    assertEqual(a.vm().model.s1, 'A');
    assertEqual(a.vm().model.filterMode, 'auto');
    assertEqual(a.radio('auto').checked, true);
    assertDeepEqual(plain(a.vm().model.notes), {});
    assertEqual(b.vm().model.filterMode, 'all');
    assertDeepEqual(plain(b.vm().model.notes), { '1.1.1': 'nur B' });
    // Gemeinsamer Bus: ein Agentenaufruf an B lässt die Vorbelegung von A stehen.
    assertDeepEqual(a.open(), [1]);
    b.vm().model.setExpandedClasses({ classes: [3] });
    await settle();
    assertDeepEqual(b.open(), [3]);
    assertDeepEqual(a.open(), [1]);
    assertDeepEqual(plain(a.vm().state.autoOpen), [1]);
    unmountAll();
    const left = bus.handlers.filter(([n]) => n === 'command:executed').length;
    assertEqual(left, 0, `nach dem Abbau noch ${left} command:executed-Handler`);
  });

  test('Altprojekt: alle Werte sichtbar, Laden ist kein Verlaufsschritt, read() mit Diagnose und Massenfeld', async () => {
    const h = await mount('sf-1', plain(LEGACY));
    await settle();
    assertEqual(h.input('s1').value, LEGACY.s1);
    assertEqual(h.input('s2').value, 'Fräser');
    assertEqual(h.select('field').value, 'E');
    assertEqual(h.select('link').value, 'excessive');
    assertEqual(h.q('[data-role="problem-note"]').value, LEGACY.problemNote);
    assertEqual(h.svgText('160', '14'), tr('field.E'));
    assertEqual(h.svgText('60', '195'), 'Öl & Späne <Größe "M3…');
    assertEqual(h.q('.triz-sf__diagnosis-text span').textContent, tr('situation.complete-excessive'));
    assertDeepEqual(h.qa('.triz-sf__diagnosis-classes code').map((el) => el.textContent), ['2', '5']);
    assertEqual(h.radio('all').checked, true);
    assertDeepEqual(h.visible(), [1, 2, 3, 4, 5]);
    assertDeepEqual(h.open(), [2, 5]);
    assertDeepEqual(plain(h.vm().state.autoOpen), []);
    assertEqual(h.note('2.2.5').value, LEGACY.notes['2.2.5']);
    assertEqual(h.note('5.3.1').value, LEGACY.notes['5.3.1']);
    assertEqual(h.note('1.1.1').value, '');
    assertEqual(h.box('2.2.5').checked, true);
    assertEqual(h.box('4.2.1').checked, true);
    assertEqual(h.box('5.3.1').checked, false);
    assertEqual(h.pin('2.2.5').style.display, '');
    assertTrue(h.std('4.2.1').classList.contains('is-selected'), 'Akzentrand an 4.2.1');
    assertEqual(h.inst.historyCan('undo'), false);
    assertDeepEqual(h.states['sf-1'], LEGACY, 'Einhängen änderte den gespeicherten Stand');
    const { _schema, filterMode, expandedClasses, ...fields } = plain(LEGACY);
    const read = h.vm().read({ fields: ['s1', 's2', 'field', 'link', 'problemNote', 'notes', 'selected', 'diagnosis'] });
    const { standards: bulk, ...named } = read;
    assertDeepEqual(named, { ...fields, diagnosis: { situation: 'complete-excessive', suggestedClasses: [2, 5] } });
    assertDeepEqual(bulk, { $bulk: true, kind: 'table', rowCount: 78, columns: ['id', 'class', 'group', 'title', 'trigger'] });
    const all = h.vm().read();
    assertEqual('filterMode' in all, false);
    assertEqual('expandedClasses' in all, false);
    assertEqual(all.standards.$bulk, true);
    assertEqual(all.standards.rowCount, 78);
    const rows = h.vm().read({ fields: ['standards'], rows: { from: 0, to: 2 } });
    assertEqual(rows.standards.length, 2);
    assertDeepEqual(rows['standards$range'], { from: 0, to: 2, rowCount: 78 });
    assertDeepEqual(rows.standards[0], { id: '1.1.1', class: 1, group: '1.1', title: tr('standards.1.1.1.title'), trigger: tr('standards.1.1.1.trigger') });
    unmountAll();
  });
});
