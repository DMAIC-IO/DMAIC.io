/**
 * Process Map: das Viewmodel im Browser (viewmodel/*.js) mit dem echten
 * Modul und der echten Vorlage (samt Unterschritt-Teil).
 * Prüft: Altprojekt ohne Verlaufsschritt (alle Werte sichtbar, Vorwärtsziel
 * geheilt), Markup-Vertrag der Gesten, Hilfe-Anker, Vorschau der Kette und
 * der Geste io, Anlegen mit Fokus (Schritt, Input/Output, Rework-Schritt,
 * Unterschritt nur nach Klick), Abzeichen, Loop-Bänder samt Ablehnung am
 * Ziel, die Tastatur beider Gesten, den SIPOC-Import über Stub-Instanzen,
 * zwei Instanzen und die Exporte.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import Alpine from '../../../vendor/alpinejs/csp.js';
import { registerCommandDirectives } from '../../../js/core/command-directives.js';
import { registerFieldDirective } from '../../../js/core/field-directive.js';
import mod from '../../../js/modules/process-map/viewmodel/viewmodel.js';
import { State } from '../../../js/modules/process-map/domain/model.js';
import { toRows, toExportJSON, XLSX_SHEET } from '../../../js/modules/process-map/io/export.js';

const ID = 'process-map';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const PART = 'js/core/flowchart/substeps.view.part.html';
const LEGACY_ID = '5c2e9a71-4b3d-4f80-9e16-7a0d3c8b2f41';
const flush = () => new Promise((r) => setTimeout(r, 0));
/** Watcher und `$nextTick` laufen nach eigenen Takten. */
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
/** Wartet, bis `ok()` gilt; höchstens zwei Sekunden. @param {() => boolean} ok */
async function until(ok) {
  for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
}
/** @type {HTMLElement[]} */
const mounted = [];
let prepared = false;
let UI = null;
let LEGACY = null;
const plain = (v) => JSON.parse(JSON.stringify(v));

/** Text des Moduls unter einem Punktpfad, Platzhalter `{n}` ersetzt; sonst der Pfad. */
function tr(path, params) {
  const v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), UI);
  const text = typeof v === 'string' ? v : path;
  return params ? text.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : text;
}

async function prepare() {
  if (!prepared) {
    registerCommandDirectives(Alpine);
    registerFieldDirective(Alpine, { i18n: { t: (k) => k, getLanguage: () => 'de' } });
    if (!Alpine.version) Alpine.start();
    const json = async (p) => (await fetch(new URL(p, import.meta.url), { cache: 'no-cache' })).json();
    UI = await json(`../../../js/modules/${ID}/resources/i18n/ui.de.json`);
    LEGACY = (await json('./legacy-project.json')).moduleStates[LEGACY_ID];
    prepared = true;
  }
  // Eine schon eingebettete Vorlage (wie im Build) bleibt stehen.
  if (document.querySelector(`template[data-tpl="${TPL_KEY}"]`)?.content.childElementCount) return;
  const get = async (p) => (await fetch(new URL(`../../../${p}`, import.meta.url), { cache: 'no-cache' })).text();
  // Den Unterschritt-Teil einsetzen wie der Template-Build.
  const html = (await get(TPL_KEY)).replace(/<!--\s*@include\s+\S+\s*-->/, await get(PART));
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

/** Ein Schritt der Zielform. */
const step = (id, title, extra = {}) => ({
  id, title, description: '', valueType: null, inputs: [], outputs: [], substeps: [], loop: null, ...extra,
});
/** Drei Schritte, s2 mit zwei Inputs und einem Output, s3 mit Loop auf s1. */
const SMALL = {
  _schema: { name: ID, version: '1.0' },
  steps: [
    step('s1', 'Eins', { substeps: [{ id: 'ss1', title: 'Teil' }] }),
    step('s2', 'Zwei', {
      inputs: [{ id: 'i1', name: 'A', inputType: null }, { id: 'i2', name: 'B', inputType: 'param' }, { id: 'i3', name: 'C', inputType: null }],
      outputs: [{ id: 'o1', name: 'X' }],
    }),
    step('s3', 'Drei', { loop: { targetStepId: 's1', condition: 'Fehler', steps: [{ id: 'l1', title: 'Nacharbeit' }] } }),
  ],
  expanded: ['s1'],
};

/**
 * Eine Instanz einhängen (eigene Kopie des Moduls wie in der Registry).
 * @param {string} instanceId
 * @param {object|null} model gespeicherter Zustand
 * @param {{ keep?: boolean, confirm?: boolean, list?: any[], reads?: Record<string, any>, readError?: Error|null }} [opts]
 */
async function mount(instanceId, model, { keep = false, confirm = true, list = [], reads = {}, readError = null } = {}) {
  await prepare();
  if (!keep) unmountAll();
  const states = { [instanceId]: model };
  const notes = [];
  const forms = [];
  const confirms = [];
  const listCalls = [];
  const handlers = [];
  const instances = { list };
  const context = {
    instanceId,
    instances: {
      list: (opts) => { listCalls.push(opts); return instances.list; },
      read: async (id) => { if (readError) throw readError; return reads[id]; },
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
      emit: (n, p) => { for (const [a, f] of [...handlers]) if (a === n) f(p); },
    },
    chartManager: { create: async () => ({}), update: () => {}, destroy: () => {} },
    notify: (...args) => { notes.push(args); },
    dialog: {
      confirm: async (o) => { confirms.push(o); return confirm; },
      form: (opts) => { forms.push(opts); return Promise.resolve(true); },
      show: () => ({ close() {}, setTitle() {} }),
    },
    theme: 'light',
    language: 'de',
  };
  const container = document.createElement('div');
  container.style.width = '1200px';
  document.body.append(container);
  mounted.push(container);
  const inst = { ...mod };
  await inst.init(container, context);
  await settle();
  const q = (sel) => container.querySelector(sel);
  const qa = (sel) => [...container.querySelectorAll(sel)];
  const val = (el) => /** @type {HTMLInputElement} */ (el).value;
  const h = {
    inst, states, notes, forms, confirms, listCalls, handlers, instances, container, q, qa,
    vm: () => Alpine.$data(container.querySelector('[x-data]')),
    /** Titel der Kette in Anzeigefolge. */
    titles: () => qa('.pmap__step-row .pmap__step-title').map(val),
    card: (id) => q(`.pmap__step-row[data-step-id="${id}"]`),
    grip: (id) => /** @type {HTMLButtonElement} */ (q(`.pmap__step-row[data-step-id="${id}"] .pmap__step-number`)),
    ioGroup: (stepId, type) => q(`[data-reorder-group="${stepId}:${type}"]`),
    ioNames: (stepId, type) => qa(`[data-reorder-group="${stepId}:${type}"] .pmap__io-name`).map(val),
    ioGrip: (ioId) => /** @type {HTMLButtonElement} */ (q(`.pmap__io-item[data-io-id="${ioId}"] .pmap__io-grip`)),
    band: (id) => q(`.pmap__loop[data-step-id="${id}"]`),
    saved: () => plain(states[instanceId]),
    key: async (el, key) => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      await settle();
    },
    click: async (el) => { el.click(); await settle(); },
    type: async (el, value) => {
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      await settle();
    },
  };
  return h;
}

/** Der gespeicherte Stand lädt streng (ohne Reparatur). @param {any} saved */
function assertValid(saved) {
  let err = null;
  try { State.fromJSON(plain(saved)); } catch (e) { err = e; }
  assertEqual(err, null, `gespeicherter Stand ungültig: ${err?.message}`);
}

suite('process-map: Viewmodel im Browser', () => {
  test('Altprojekt: alle Werte sichtbar, s1 aufgeklappt, Vorwärtsziel offen, kein Verlaufsschritt', async () => {
    await prepare(); // lädt die Altinstanz
    const h = await mount('pm-1', plain(LEGACY));
    assertDeepEqual(h.titles(), ['Bestellung annehmen', 'Teig vorbereiten', 'Backen', 'Ausliefern']);
    assertDeepEqual(h.qa('.pmap__step-description').map((el) => /** @type {HTMLTextAreaElement} */ (el).value),
      ['Telefon oder online', '', 'Steinofen, 90 s', '']);
    assertDeepEqual(h.qa('.pmap__value-badge').map((el) => el.textContent), ['VA', 'BNVA', 'NVA', '–']);
    assertDeepEqual(h.qa('.pmap__step-number').map((el) => el.textContent), ['01', '02', '03', '04']);
    assertDeepEqual(h.ioNames('pm-s1', 'inputs'), ['Kundenanruf', 'Wetter', 'Speisekarte']);
    assertDeepEqual(h.qa('.pmap__step-row').length, 4);
    assertDeepEqual(h.qa('[data-reorder-group="pm-s1:inputs"] .pmap__input-type').map((el) => el.textContent), ['x', 'n', '?']);
    assertDeepEqual(h.ioNames('pm-s1', 'outputs'), ['Auftrag']);
    assertDeepEqual(h.ioNames('pm-s4', 'outputs'), ['Pizza beim Kunden']);
    assertDeepEqual(h.qa('.fc-substep-title').map((el) => /** @type {HTMLInputElement} */ (el).value), ['Adresse prüfen', 'Zahlart klären']);
    assertDeepEqual(h.qa('.fc-substep-number').map((el) => el.textContent), ['1.1', '1.2']);
    // Loop von pm-s2 zurück auf pm-s1, Vorwärtsziel von „Backen“ offen
    assertDeepEqual(h.qa('.pmap__loop').map((el) => el.getAttribute('data-step-id')), ['pm-s2', 's0m2']);
    const b2 = h.band('pm-s2');
    assertEqual(/** @type {HTMLInputElement} */ (b2.querySelector('.pmap__loop-condition')).value, 'Teig gerissen');
    assertEqual(/** @type {HTMLSelectElement} */ (b2.querySelector('.pmap__loop-target-select')).value, 'pm-s1');
    assertDeepEqual([...b2.querySelectorAll('.pmap__loop-step-title')].map((el) => /** @type {HTMLInputElement} */ (el).value), ['Neu kneten', 'Ruhen lassen']);
    const rail2 = [...b2.querySelectorAll('.pmap__loop-rail-cell')].map((el) => el.className);
    assertTrue(rail2[0].includes('pmap__loop-rail-cell--target') && rail2[1].includes('pmap__loop-rail-cell--source'), rail2.join('|'));
    const b3 = h.band('s0m2');
    assertEqual(/** @type {HTMLSelectElement} */ (b3.querySelector('.pmap__loop-target-select')).value, '');
    assertEqual(/** @type {HTMLInputElement} */ (b3.querySelector('.pmap__loop-condition')).value, 'Zu dunkel');
    assertTrue(b3.querySelector('.pmap__loop-rail-cell--source-open') !== null, 'Vorwärtsziel nicht offen');
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Markup-Vertrag: data-step-index nur an den Kartenzellen, IO-Listen als abgeschlossene Gruppen', async () => {
    const h = await mount('pm-1', plain(SMALL));
    assertEqual(h.qa('[data-step-index]').length, 3);
    assertTrue(h.qa('[data-step-index]').every((el) => el.classList.contains('pmap__step-row')), 'data-step-index außerhalb der Kartenzellen');
    // Zwischen Griff und Kartenzelle kein weiteres data-step-id
    for (const g of h.qa('.pmap__step-number')) assertTrue(g.parentElement.closest('[data-step-id]').classList.contains('pmap__step-row'), 'data-step-id zwischen Griff und Zelle');
    const g = h.ioGroup('s2', 'inputs');
    assertTrue(g.hasAttribute('data-reorder-closed'), 'Gruppe nicht abgeschlossen');
    assertEqual(g.getAttribute('data-io-step'), 's2');
    assertEqual(g.getAttribute('data-io-type'), 'inputs');
    assertDeepEqual([...g.querySelectorAll('[data-reorder-index]')].map((el) => [el.getAttribute('data-reorder-index'), el.getAttribute('data-io-id')]),
      [['0', 'i1'], ['1', 'i2'], ['2', 'i3']]);
    assertEqual(h.ioGrip('i1').tagName, 'BUTTON');
    assertEqual(h.grip('s1').tagName, 'BUTTON');
    unmountAll();
  });

  test('Hilfe-Anker: Griffe mit Overlay, Verbinder, IO-Köpfe, Loop-Beschriftungen, Rework; Löschknöpfe leer', async () => {
    const h = await mount('pm-1', plain(SMALL));
    for (const g of h.qa('.pmap__step-number')) {
      assertEqual(g.getAttribute('data-help-key'), `modules.${ID}.actions.moveStep.help`);
      assertTrue(g.classList.contains('context-help-anchor--overlay'), 'Schrittgriff ohne Overlay');
      assertEqual(g.getAttribute('aria-label'), tr('stepGrip'));
    }
    for (const g of h.qa('.pmap__io-grip')) {
      assertEqual(g.getAttribute('data-help-key'), `modules.${ID}.actions.moveIO.help`);
      assertTrue(g.classList.contains('context-help-anchor--overlay'), 'IO-Griff ohne Overlay');
      assertEqual(g.getAttribute('aria-label'), tr('ioGrip'));
    }
    assertTrue(h.qa('[data-action="insert-step"] .fc-connector__arrow').every((el) => el.getAttribute('data-help-key') === `modules.${ID}.actions.addStep.help`), 'Verbinder ohne Anker');
    assertEqual(h.qa('[data-action="insert-step"]').length, 4);
    assertTrue(h.qa('.pmap__io-label-text [data-help-key]').every((el) => el.getAttribute('data-help-key') === `modules.${ID}.actions.addIO.help`), 'IO-Kopf ohne Anker');
    assertEqual(h.qa('.pmap__io-label-text [data-help-key]').length, 6);
    const band = h.band('s3');
    assertEqual(band.querySelector('.pmap__loop-title').getAttribute('data-help-key'), `modules.${ID}.fields.steps.loop.help`);
    assertDeepEqual([...band.querySelectorAll('.pmap__loop-field-label [data-help-key]')].map((el) => el.getAttribute('data-help-key')),
      [`modules.${ID}.fields.steps.loop.condition.help`, `modules.${ID}.actions.setLoopTarget.help`]);
    assertEqual(band.querySelector('.pmap__loop-step-add [data-help-key]').getAttribute('data-help-key'), `modules.${ID}.actions.addLoopStep.help`);
    for (const el of [...h.qa('.pmap__step-delete'), ...h.qa('.pmap__io-remove'), ...h.qa('.pmap__loop-remove'), ...h.qa('.pmap__loop-step-remove'), h.q('.pmap__loop-condition')]) {
      assertEqual(el.getAttribute('data-help-key'), '', el.className);
    }
    assertEqual(h.q('.pmap__value-badge').getAttribute('data-help-key'), `modules.${ID}.actions.cycleValueType.help`);
    assertEqual(h.q('.pmap__step-loop-toggle').getAttribute('data-help-key'), `modules.${ID}.actions.setLoop.help`);
    assertEqual(h.q('.pmap__step-title').getAttribute('data-help-key'), `modules.${ID}.fields.steps.title.help`);
    assertEqual(h.q('.pmap__io-name').getAttribute('data-help-key'), `modules.${ID}.fields.steps.inputs.name.help`);
    // DOM-ids der Loop-Felder je Instanz
    assertEqual(band.querySelector('.pmap__loop-condition').id, 'pmap-condition-pm-1-s3');
    assertEqual(band.querySelector('label.pmap__loop-field-label').getAttribute('for'), 'pmap-condition-pm-1-s3');
    unmountAll();
  });

  test('Kettenvorschau: gapClass, rowClass, previewGap; Verbinder-Klick fügt ein, fokussiert, Rückgängig', async () => {
    const h = await mount('pm-1', plain(SMALL));
    const vm = h.vm();
    assertEqual(vm.gapClass(1), '');
    assertDeepEqual(h.qa('[data-action="insert-step"]').map((el) => el.getAttribute('data-gap')), ['0', '1', '2', '3']);
    vm.state.chainPreview = { id: 's1', index: 2, band: null };
    await settle();
    assertEqual(vm.previewGap, 3);
    assertEqual(vm.gapClass(3), 'fc-connector--drop is-drop-target');
    assertEqual(vm.gapClass(1), 'fc-connector--drop');
    assertTrue(h.card('s1').classList.contains('is-dragging'), 'gezogene Karte ohne is-dragging');
    assertTrue(h.q('[data-gap="3"]').classList.contains('is-drop-target'), 'Ziellücke nicht markiert');
    vm.state.chainPreview = null;
    await settle();
    assertEqual(h.qa('.fc-connector--drop').length, 0);
    await h.click(h.q('[data-action="insert-step"][data-gap="1"]'));
    await until(() => h.titles().length === 4);
    const added = vm.model.steps[1];
    assertEqual(added.title, '');
    assertTrue(added.id.startsWith('s'), added.id);
    await until(() => document.activeElement === h.card(added.id).querySelector('.pmap__step-title'));
    assertEqual(document.activeElement, h.card(added.id).querySelector('.pmap__step-title'));
    assertValid(h.saved());
    /** @type {HTMLElement} */ (document.activeElement).blur();
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig ohne Wirkung');
    await until(() => h.titles().length === 3);
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Werkzeugleiste „Schritt hinzufügen“ hängt an und fokussiert; das Kommando allein stiehlt keinen Fokus', async () => {
    const h = await mount('pm-1', plain(SMALL));
    const id = h.vm().addStepAt(h.vm().model.steps.length);
    await until(() => h.titles().length === 4);
    assertEqual(h.vm().model.steps[3].id, id);
    await until(() => document.activeElement === h.card(id).querySelector('.pmap__step-title'));
    assertEqual(document.activeElement, h.card(id).querySelector('.pmap__step-title'));
    /** @type {HTMLElement} */ (document.activeElement).blur();
    const other = h.vm().model.addStep({});
    await until(() => h.titles().length === 5);
    assertTrue(document.activeElement !== h.card(other).querySelector('.pmap__step-title'), 'Kommando hat fokussiert');
    unmountAll();
  });

  test('Abzeichen: Wertart und Input-Typ schalten per Klick weiter, je ein Verlaufsschritt', async () => {
    const h = await mount('pm-1', plain(SMALL));
    const badge = () => h.card('s1').querySelector('.pmap__value-badge');
    assertEqual(badge().textContent, '–');
    assertEqual(badge().getAttribute('title'), tr('valueTypeLabel'));
    assertTrue(badge().classList.contains('pmap__value-badge--none'), badge().className);
    await h.click(badge());
    await until(() => badge().textContent === 'VA');
    assertEqual(badge().getAttribute('title'), tr('vaLong'));
    assertTrue(h.card('s1').querySelector('.pmap__step-card').classList.contains('pmap__step-card--va'), 'kein Statusstreifen');
    const typeBtn = () => h.q('.pmap__io-item[data-io-id="i1"] .pmap__input-type');
    assertEqual(typeBtn().textContent, '?');
    await h.click(typeBtn());
    await until(() => typeBtn().textContent === 'x');
    assertEqual(typeBtn().getAttribute('title'), tr('inputTypeParamLong'));
    await h.click(typeBtn());
    await until(() => typeBtn().textContent === 'n');
    assertTrue(typeBtn().classList.contains('pmap__input-type--noise'), typeBtn().className);
    assertValid(h.saved());
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig ohne Wirkung');
    await until(() => typeBtn().textContent === 'x');
    unmountAll();
  });

  test('IO: Kopfklick legt an und fokussiert; Name über x-field; Entfernen mit Rückfrage', async () => {
    const h = await mount('pm-1', plain(SMALL));
    await h.click(h.q('.pmap__io-label[data-step-id="s1"][data-io-type="outputs"]'));
    await until(() => h.ioNames('s1', 'outputs').length === 1);
    const ioId = h.vm().model.steps[0].outputs[0].id;
    const name = /** @type {HTMLTextAreaElement} */ (h.q(`.pmap__io-item[data-io-id="${ioId}"] .pmap__io-name`));
    await until(() => document.activeElement === name);
    assertEqual(document.activeElement, name);
    assertEqual(name.placeholder, tr('outputPlaceholder'));
    await h.type(name, 'Bon');
    await until(() => h.vm().model.steps[0].outputs[0].name === 'Bon');
    await h.click(h.q('.pmap__io-item[data-io-id="i2"] .pmap__io-remove'));
    await until(() => h.ioNames('s2', 'inputs').length === 2);
    assertEqual(h.confirms.length, 1);
    assertDeepEqual(h.ioNames('s2', 'inputs'), ['A', 'C']);
    assertValid(h.saved());
    unmountAll();
  });

  test('Geste io: Vorschau-Klassen, Tastatur ↓ legt am Platz des Ziels ab, Escape und fremde Liste ohne Kommando', async () => {
    const h = await mount('pm-1', plain(SMALL));
    const vm = h.vm();
    vm.state.ioPreview = { group: 's2:inputs', index: 2, id: 'i1' };
    await settle();
    assertTrue(h.q('.pmap__io-item[data-io-id="i1"]').classList.contains('pmap__io-item--dragging'), 'gezogener Eintrag nicht blass');
    assertTrue(h.q('.pmap__io-item[data-io-id="i3"]').classList.contains('pmap__io-item--drag-over-end'), 'Ziel ohne Linie darunter');
    vm.state.ioPreview = { group: 's2:inputs', index: 0, id: 'i3' };
    await settle();
    const t0 = h.q('.pmap__io-item[data-io-id="i1"]').className;
    assertTrue(t0.includes('pmap__io-item--drag-over') && !t0.includes('--drag-over-end'), t0);
    assertEqual(vm.ioItemClass(vm.model.steps[1], 'outputs', { id: 'o1' }, 0), '');
    vm.state.ioPreview = null;
    await settle();
    // Tastatur: i1 zwei Plätze nach unten
    const grip = h.ioGrip('i1');
    grip.focus();
    await h.key(grip, 'Enter');
    assertTrue(vm.state.ioPreview !== null, 'Geste nicht aufgenommen');
    await h.key(grip, 'ArrowDown');
    await h.key(grip, 'ArrowDown');
    await h.key(grip, 'Enter');
    await until(() => h.ioNames('s2', 'inputs').join() === 'B,C,A');
    assertEqual(vm.state.ioPreview, null);
    assertValid(h.saved());
    // Escape bricht ab; am Ausgangsplatz kein Kommando
    const g2 = h.ioGrip('i2');
    g2.focus();
    await h.key(g2, 'Enter');
    await h.key(g2, 'ArrowDown');
    await h.key(g2, 'Escape');
    await h.key(g2, 'Enter');
    await h.key(g2, 'Enter');
    assertDeepEqual(h.ioNames('s2', 'inputs'), ['B', 'C', 'A']);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig ohne Wirkung');
    await until(() => h.ioNames('s2', 'inputs').join() === 'A,B,C');
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Kettengeste per Tastatur: → verschiebt, Loop-Ziel hinter der Quelle wird null (ein Schritt); Escape ohne Kommando', async () => {
    const h = await mount('pm-1', plain(SMALL));
    const grip = h.grip('s1');
    grip.focus();
    await h.key(grip, 'Enter');
    assertTrue(h.vm().state.chainPreview !== null, 'Geste nicht aufgenommen');
    await h.key(grip, 'ArrowRight');
    await h.key(grip, 'ArrowRight');
    await h.key(grip, 'Enter');
    await until(() => h.titles().join() === 'Zwei,Drei,Eins');
    assertEqual(h.vm().state.chainPreview, null);
    assertEqual(h.vm().model.steps[1].loop.targetStepId, null);
    assertTrue(h.band('s3').querySelector('.pmap__loop-rail-cell--source-open') !== null, 'Band nicht offen');
    assertValid(h.saved());
    const g3 = h.grip('s3');
    g3.focus();
    await h.key(g3, 'Enter');
    await h.key(g3, 'ArrowLeft');
    await h.key(g3, 'Escape');
    assertEqual(h.titles().join(), 'Zwei,Drei,Eins');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig ohne Wirkung');
    await until(() => h.titles().join() === 'Eins,Zwei,Drei');
    assertEqual(h.vm().model.steps[2].loop.targetStepId, 's1');
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Loop: Schalter an und aus, Bedingung über x-field, Ziel-Auswahl, Ablehnung am Agenten, Rework mit Fokus', async () => {
    const h = await mount('pm-1', plain(SMALL));
    const toggle = () => h.card('s2').querySelector('.pmap__step-loop-toggle');
    assertEqual(toggle().getAttribute('aria-pressed'), 'false');
    await h.click(toggle());
    await until(() => h.band('s2') !== null);
    assertTrue(toggle().classList.contains('pmap__step-loop-toggle--active'), 'Schalter nicht aktiv');
    assertDeepEqual(h.qa('.pmap__loop').map((el) => el.getAttribute('data-step-id')), ['s2', 's3']);
    const band = h.band('s2');
    const select = /** @type {HTMLSelectElement} */ (band.querySelector('.pmap__loop-target-select'));
    assertDeepEqual([...select.options].map((o) => [o.value, o.textContent]), [['', tr('loopSelectTarget')], ['s1', '01 — Eins']]);
    select.value = 's1';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => h.vm().model.steps[1].loop.targetStepId === 's1');
    const cond = /** @type {HTMLInputElement} */ (band.querySelector('.pmap__loop-condition'));
    await h.type(cond, 'Zu weich');
    await until(() => h.vm().model.steps[1].loop.condition === 'Zu weich');
    // Agent: Ziel hinter der Quelle wird abgelehnt, die Auswahl bleibt
    let err = null;
    try { h.vm().model.setLoopTarget({ stepId: 's2', targetStepId: 's3' }); } catch (e) { err = e; }
    assertEqual(err?.hintKey, 'loopTargetNotBefore');
    await settle();
    assertEqual(select.value, 's1');
    // Rework anlegen mit Fokus
    await h.click(band.querySelector('.pmap__loop-step-add'));
    await until(() => h.vm().model.steps[1].loop.steps.length === 1);
    const lsId = h.vm().model.steps[1].loop.steps[0].id;
    const title = /** @type {HTMLInputElement} */ (h.q(`.pmap__loop-step-item[data-loop-step-id="${lsId}"] .pmap__loop-step-title`));
    await until(() => document.activeElement === title);
    assertEqual(document.activeElement, title);
    await h.type(title, 'Neu');
    await until(() => h.vm().model.steps[1].loop.steps[0].title === 'Neu');
    assertEqual(title.size, Math.max(3, tr('loopStepPlaceholder').length) + 1);
    assertValid(h.saved());
    // Schalter aus nimmt den Loop samt Inhalt mit
    await h.click(toggle());
    await until(() => h.band('s2') === null);
    assertEqual(h.vm().model.steps[1].loop, null);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig ohne Wirkung');
    await until(() => h.band('s2') !== null);
    assertEqual(/** @type {HTMLInputElement} */ (h.band('s2').querySelector('.pmap__loop-condition')).value, 'Zu weich');
    unmountAll();
  });

  test('Loop-Ziel über die Auswahl: Ablehnung zeigt sich am Feld und springt zurück', async () => {
    const h = await mount('pm-1', plain(SMALL));
    const select = /** @type {HTMLSelectElement} */ (h.band('s3').querySelector('.pmap__loop-target-select'));
    const opt = document.createElement('option');
    opt.value = 's3';
    select.append(opt);
    select.value = 's3';
    const warn = console.warn;
    console.warn = () => {};
    try {
      await h.vm().loopTargetChanged(h.vm().model.steps[2], { target: select });
    } finally { console.warn = warn; }
    assertEqual(select.value, 's1');
    assertEqual(select.getAttribute('aria-invalid'), 'true');
    assertEqual(h.vm().model.steps[2].loop.targetStepId, 's1');
    // leer löscht das Ziel
    select.value = '';
    await h.vm().loopTargetChanged(h.vm().model.steps[2], { target: select });
    assertEqual(h.vm().model.steps[2].loop.targetStepId, null);
    assertEqual(select.getAttribute('aria-invalid'), null);
    unmountAll();
  });

  test('„+ Detail-Schritt“ fokussiert nach dem Klick, nicht nach Wiederholen und nicht beim Agenten', async () => {
    const h = await mount('pm-1', plain(SMALL));
    const add = /** @type {HTMLButtonElement} */ (h.q('.fc-substeps[data-step-id="s1"] .fc-substep-add'));
    add.focus();
    await h.click(add);
    await until(() => h.qa('.fc-substeps[data-step-id="s1"] .fc-substep-title').length === 2);
    const last = () => h.qa('.fc-substeps[data-step-id="s1"] .fc-substep-title').at(-1);
    await until(() => document.activeElement === last());
    assertEqual(document.activeElement, last());
    /** @type {HTMLElement} */ (document.activeElement).blur();
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig ohne Wirkung');
    await until(() => h.qa('.fc-substeps[data-step-id="s1"] .fc-substep-title').length === 1);
    add.focus();
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen ohne Wirkung');
    await until(() => h.qa('.fc-substeps[data-step-id="s1"] .fc-substep-title').length === 2);
    await settle();
    assertEqual(document.activeElement, add);
    h.vm().model.addSubstep({ stepId: 's1' });
    await until(() => h.qa('.fc-substeps[data-step-id="s1"] .fc-substep-title').length === 3);
    await settle();
    assertEqual(document.activeElement, add);
    unmountAll();
  });

  test('Leerzustand: Angebot nur mit SIPOC, aktualisiert bei module:added; ohne SIPOC Hinweis statt Dialog', async () => {
    const h = await mount('pm-1', null);
    assertEqual(h.q('.pmap__sipoc-offer'), null);
    assertEqual(h.q('.pmap__table'), null);
    h.vm().openImport();
    await settle();
    assertDeepEqual(h.notes, [[tr('importFromSipocHint'), 'info']]);
    assertEqual(h.forms.length, 0);
    h.instances.list = [{ instanceId: 'sp1', moduleId: 'sipoc', phase: 'define', title: '' }];
    for (const [n, fn] of h.handlers) if (n === 'module:added') fn({});
    await until(() => h.q('.pmap__sipoc-offer') !== null);
    const offer = h.q('.pmap__sipoc-offer');
    assertTrue(offer.classList.contains('btn--secondary'), offer.className);
    assertEqual(offer.querySelector('[data-help-key]').getAttribute('data-help-key'), `modules.${ID}.actions.appendSteps.help`);
    assertDeepEqual(h.listCalls.at(-1), { modules: ['sipoc'] });
    unmountAll();
    assertEqual(h.handlers.length, 0, 'Abo nicht abgemeldet');
  });

  test('SIPOC-Import: Zeilen „SIPOC #n“, leere deaktiviert, erste brauchbare vorgewählt, Bestätigen = ein Schritt', async () => {
    const list = [
      { instanceId: 'sp1', moduleId: 'sipoc', phase: 'define', title: '' },
      { instanceId: 'sp2', moduleId: 'sipoc', phase: 'measure', title: 'Pizza' },
      { instanceId: 'sp3', moduleId: 'sipoc', phase: 'measure', title: '' },
    ];
    const reads = {
      sp1: { columns: { process: ['', '  '] } },
      sp2: { columns: { process: ['Bestellen', ' Backen ', 'Schneiden', 'Packen', 'Liefern'] } },
      sp3: { columns: { process: ['Prüfen'] } },
    };
    const h = await mount('pm-1', null, { list, reads });
    await until(() => h.q('.pmap__sipoc-offer') !== null);
    await h.click(h.q('.pmap__sipoc-offer'));
    await until(() => h.forms.length === 1);
    const vm = h.vm();
    assertDeepEqual(vm.state.importOptions.map((o) => [o.instanceId, o.label, o.processCount]), [['sp1', 'SIPOC #1', 0], ['sp2', 'SIPOC #2', 5], ['sp3', 'SIPOC #3', 1]]);
    assertEqual(vm.state.importPick, 'sp2');
    assertEqual(h.forms[0].content, vm.$refs.importForm);
    assertEqual(h.forms[0].title, tr('importFromSipocTitle'));
    assertEqual(h.forms[0].confirmLabel, tr('importFromSipocConfirm'));
    await settle();
    const radios = h.qa('.pmap__sipoc-option input[type="radio"]');
    assertDeepEqual(radios.map((r) => /** @type {HTMLInputElement} */ (r).disabled), [true, false, false]);
    assertTrue(radios.every((r) => /** @type {HTMLInputElement} */ (r).name === 'pmap-sipoc-pick-pm-1'), 'Radio-Name nicht je Instanz');
    assertTrue(h.q('.pmap__sipoc-option[data-sipoc-id="sp1"]').classList.contains('pmap__sipoc-option--disabled'), 'leere Zeile nicht deaktiviert');
    assertTrue(h.q('.pmap__sipoc-option[data-sipoc-id="sp2"]').classList.contains('pmap__sipoc-option--selected'), 'Vorwahl nicht markiert');
    assertEqual(h.q('.pmap__sipoc-option[data-sipoc-id="sp1"] .pmap__sipoc-option-count').textContent, tr('importFromSipocEmpty'));
    assertEqual(h.q('.pmap__sipoc-option[data-sipoc-id="sp2"] .pmap__sipoc-option-count').textContent, tr('importFromSipocSteps', { n: 5 }));
    assertDeepEqual([...h.q('.pmap__sipoc-option[data-sipoc-id="sp2"]').querySelectorAll('.pmap__sipoc-option-chip')].map((el) => el.textContent),
      ['Bestellen', 'Backen', 'Schneiden', 'Packen', '+1']);
    // Eine leere Zeile ist nicht wählbar; Wahl über die Liste
    const r1 = /** @type {HTMLInputElement} */ (h.q('.pmap__sipoc-option[data-sipoc-id="sp1"] input'));
    r1.dispatchEvent(new Event('change', { bubbles: true }));
    assertEqual(vm.state.importPick, 'sp2');
    const r3 = /** @type {HTMLInputElement} */ (h.q('.pmap__sipoc-option[data-sipoc-id="sp3"] input'));
    r3.checked = true;
    r3.dispatchEvent(new Event('change', { bubbles: true }));
    assertEqual(vm.state.importPick, 'sp3');
    h.forms[0].onConfirm(vm.$refs.importForm);
    await until(() => h.titles().length === 1);
    assertDeepEqual(h.titles(), ['Prüfen']);
    assertDeepEqual(h.notes.at(-1), [tr('importFromSipocDone', { n: 1 }), 'success']);
    vm.state.importPick = 'sp2';
    assertEqual(await vm.runImport(), 5);
    assertDeepEqual(h.titles(), ['Prüfen', 'Bestellen', 'Backen', 'Schneiden', 'Packen', 'Liefern']);
    assertValid(h.saved());
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig ohne Wirkung');
    await until(() => h.titles().length === 1);
    unmountAll();
  });

  test('runImport meldet einen Lesefehler übersetzt und hängt nichts an', async () => {
    const list = [{ instanceId: 'sp1', moduleId: 'sipoc', phase: 'define', title: '' }];
    const h2 = await mount('pm-2', plain(SMALL), { list, readError: new Error('unknown_instance') });
    h2.vm().state.importOptions = [{ instanceId: 'sp1', label: 'SIPOC #1', processCount: 1, processPreview: ['A'] }];
    h2.vm().state.importPick = 'sp1';
    const warn = console.warn;
    console.warn = () => {};
    let n;
    try { n = await h2.vm().runImport(); } finally { console.warn = warn; }
    assertEqual(n, 0);
    assertEqual(h2.vm().model.steps.length, 3);
    assertDeepEqual(h2.notes.at(-1), [tr('importFromSipocFailed'), 'error']);
    unmountAll();
  });

  test('Zwei Instanzen: getrennte Stände, Gesten, Fokus und DOM-ids je Instanz', async () => {
    const a = await mount('pm-1', plain(SMALL));
    const b = await mount('pm-2', plain(LEGACY), { keep: true });
    await a.click(a.q('[data-action="insert-step"][data-gap="3"]'));
    await until(() => a.titles().length === 4);
    assertEqual(b.titles().length, 4);
    await until(() => a.container.contains(document.activeElement));
    const g = b.ioGrip('pm-i1');
    g.focus();
    await b.key(g, 'Enter');
    await b.key(g, 'ArrowDown');
    await b.key(g, 'Enter');
    await until(() => b.ioNames('pm-s1', 'inputs').join() === 'Wetter,Kundenanruf,Speisekarte');
    assertEqual(a.vm().state.ioPreview, null);
    assertDeepEqual(a.ioNames('s2', 'inputs'), ['A', 'B', 'C']);
    assertEqual(b.vm().fieldId('sipoc-pick'), 'pmap-sipoc-pick-pm-2');
    assertEqual(a.vm().fieldId('sipoc-pick'), 'pmap-sipoc-pick-pm-1');
    assertTrue(a.inst.historyStep('undo'), 'Rückgängig ohne Wirkung');
    await until(() => a.titles().length === 3);
    assertEqual(b.vm().model.steps[0].inputs[0].id, 'pm-i2');
    unmountAll();
  });

  test('Exporte: Zeilen (CSV/XLSX), JSON-Baum der Altform, Bild als SVG mit aufgelösten Modulfarben', async () => {
    if (!document.querySelector(`style[data-test-css="${ID}"]`)) {
      const css = document.createElement('style');
      css.dataset.testCss = ID;
      css.textContent = await (await fetch(new URL(`../../../js/modules/${ID}/resources/style.css`, import.meta.url), { cache: 'no-cache' })).text();
      document.head.append(css);
    }
    const h = await mount('pm-1', plain(LEGACY));
    const ui = h.vm()._ui;
    const c = ui.component;
    assertEqual(ui.exports.fileName, ID);
    const rows = ui.exports.table.call(c);
    assertDeepEqual(rows, toRows(h.vm().model.steps, h.vm().t));
    assertEqual(rows[1][0], 1);
    assertEqual(rows[2][0], '1.1');
    assertDeepEqual(Object.keys(ui.exports.tables.call(c)), [XLSX_SHEET]);
    const tree = ui.exports.tree.call(c);
    assertEqual(tree.tool, 'ProcessMap');
    assertDeepEqual({ ...tree, timestamp: 'x' }, { ...toExportJSON(h.vm().model.steps, 'x') });
    assertTrue(!Number.isNaN(Date.parse(tree.timestamp)), tree.timestamp);
    const svg = ui.exports.image.call(c);
    assertTrue(svg.startsWith('<svg'), svg.slice(0, 40));
    assertTrue(!svg.includes('color-mix') && !svg.includes('var('), 'unaufgelöste Farbe im SVG');
    assertTrue(svg.includes('fill="#34c759"'), 'Inputfarbe fehlt');
    assertTrue(svg.includes('fill="#e67e22"'), 'Loopfarbe fehlt');
    unmountAll();
  });
});
