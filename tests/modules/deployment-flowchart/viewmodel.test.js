/**
 * Deployment-Flowchart: das Viewmodel im Browser (viewmodel/viewmodel.js)
 * mit dem echten Modul und der echten Vorlage (samt Unterschritt-Teil).
 * Prüft: Altprojekt ohne Verlaufsschritt (Bahnen nach `order`, Schritt ohne
 * Bahn sichtbar), Hilfe-Anker, die Getter der Kettenvorschau (`slotClass`,
 * `gapClass`, `showGap`, Schienen), den Verbinder-Klick, „Rolle hinzufügen“
 * mit Fokus, Umbenennen und Entfernen von Bahnen, die Tastatur der
 * Kettengeste (Bahnwechsel), den Import über Stub-Instanzen, zwei Instanzen
 * und den JSON-Export.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import Alpine from '../../../vendor/alpinejs/csp.js';
import { registerCommandDirectives } from '../../../js/core/command-directives.js';
import { registerFieldDirective } from '../../../js/core/field-directive.js';
import mod from '../../../js/modules/deployment-flowchart/viewmodel/viewmodel.js';
import { State } from '../../../js/modules/deployment-flowchart/domain/model.js';
import { toJsonTree } from '../../../js/modules/deployment-flowchart/io/export.js';

const ID = 'deployment-flowchart';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const PART = 'js/core/flowchart/substeps.view.part.html';
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
    UI = await (await fetch(new URL(`../../../js/modules/${ID}/resources/i18n/ui.de.json`, import.meta.url), { cache: 'no-cache' })).json();
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

/** Instanz (a) der Task-0-Fixture: Bahnen in vertauschter `order`, `unassigned` in der Mitte. */
const LEGACY_A = {
  steps: [
    { id: 'a1', title: 'Bestellung aufgeben', description: 'Per E-Mail oder Portal.', laneId: 'lane-kunde', expanded: false, substeps: [] },
    { id: 'a2', title: 'Auftrag erfassen', description: 'Im ERP anlegen.', laneId: 'lane-vertrieb', expanded: true,
      substeps: [{ id: 'a2x', title: 'Kundendaten prüfen' }, { id: 'a2y', title: 'Preis kalkulieren' }], owner: 'MW' },
    { id: 'a3', title: 'Klärung offen', description: '', laneId: 'unassigned', expanded: false, substeps: [] },
    { id: 'a4', title: 'Auftrag fertigen', description: 'Los 1 von 2.', laneId: 'lane-fertigung', expanded: false,
      substeps: [{ id: 'a4x', title: 'Material bereitstellen' }] },
  ],
  lanes: [
    { id: 'lane-kunde', name: 'Kunde', order: 3 },
    { id: 'lane-vertrieb', name: 'Vertrieb', order: 0 },
    { id: 'unassigned', name: '', order: 2 },
    { id: 'lane-fertigung', name: 'Fertigung', order: 1 },
  ],
};
/** Instanz (b): ohne `lanes`, ein Schritt ohne `laneId`. */
const LEGACY_B = {
  steps: [
    { id: 'b1', title: 'Erster Schritt', description: 'Ohne Rollen', laneId: 'unassigned', expanded: false, substeps: [] },
    { id: 'b2', title: 'Ohne Bahn', description: '', expanded: false, substeps: [] },
  ],
};
/** Ein kleiner Stand der Zielform: zwei Rollen, drei Schritte. */
const SMALL = {
  _schema: { name: ID, version: '1.0' },
  steps: [
    { id: 's1', title: 'Eins', description: '', laneId: 'r1', substeps: [] },
    { id: 's2', title: 'Zwei', description: '', laneId: 'r2', substeps: [] },
    { id: 's3', title: 'Drei', description: '', laneId: 'r1', substeps: [] },
  ],
  lanes: [{ id: 'r1', name: 'Einkauf' }, { id: 'r2', name: 'Lager' }],
  expanded: [],
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
  const context = {
    instanceId,
    instances: {
      list: (opts) => { listCalls.push(opts); return list; },
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
  container.style.width = '1000px';
  document.body.append(container);
  mounted.push(container);
  const inst = { ...mod };
  await inst.init(container, context);
  await settle();
  const q = (sel) => container.querySelector(sel);
  const qa = (sel) => [...container.querySelectorAll(sel)];
  const h = {
    inst, states, notes, forms, confirms, listCalls, container, q, qa,
    vm: () => Alpine.$data(container.querySelector('[x-data]')),
    /** Titel der Kette in Anzeigefolge. */
    titles: () => qa('.df__col .df__step-title').map((el) => /** @type {HTMLTextAreaElement} */ (el).value),
    /** Bandbeschriftungen von oben nach unten. */
    bands: () => qa('.df__band-label').map((el) => el.textContent),
    /** Bahn-id des Slots, in dem die Karte des Schritts liegt. @param {string} id */
    laneOf: (id) => /** @type {HTMLElement|null} */ (q(`.df__col[data-step-id="${id}"] .df__step`)?.closest('[data-band]'))?.dataset.band ?? null,
    grip: (id) => /** @type {HTMLButtonElement} */ (q(`.df__col[data-step-id="${id}"] .df__grip`)),
    laneInput: (id) => /** @type {HTMLInputElement|null} */ (q(`.df__lane-name[data-lane-id="${id}"]`)),
    saved: () => plain(states[instanceId]),
    key: async (el, key) => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      await settle();
    },
    click: async (el) => { el.click(); await settle(); },
  };
  return h;
}

/** Der gespeicherte Stand lädt streng (ohne Reparatur). @param {any} saved */
function assertValid(saved) {
  let err = null;
  try { State.fromJSON(plain(saved)); } catch (e) { err = e; }
  assertEqual(err, null, `gespeicherter Stand ungültig: ${err?.message}`);
}

suite('deployment-flowchart: Viewmodel im Browser', () => {
  test('Altprojekt (a): Bahnen nach order, alle Werte sichtbar, a2 aufgeklappt, kein Verlaufsschritt', async () => {
    const h = await mount('df-1', plain(LEGACY_A));
    assertDeepEqual(h.bands(), ['Vertrieb', 'Fertigung', tr('unassigned'), 'Kunde']);
    assertDeepEqual(h.titles(), ['Bestellung aufgeben', 'Auftrag erfassen', 'Klärung offen', 'Auftrag fertigen']);
    assertDeepEqual(['a1', 'a2', 'a3', 'a4'].map(h.laneOf), ['lane-kunde', 'lane-vertrieb', 'unassigned', 'lane-fertigung']);
    assertDeepEqual(h.qa('.df__grip').map((el) => el.textContent), ['01', '02', '03', '04']);
    assertEqual(/** @type {HTMLTextAreaElement} */ (h.q('.df__col[data-step-id="a4"] .df__step-description')).value, 'Los 1 von 2.');
    // nur a2 ist aufgeklappt
    assertDeepEqual(h.qa('.fc-substep-title').map((el) => /** @type {HTMLInputElement} */ (el).value), ['Kundendaten prüfen', 'Preis kalkulieren']);
    assertDeepEqual(h.qa('.fc-substep-number').map((el) => el.textContent), ['2.1', '2.2']);
    // Seitenleiste: drei Namensfelder, die reservierte Bahn als Text, kein Entfernen dort
    assertDeepEqual(h.qa('input.df__lane-name').map((el) => /** @type {HTMLInputElement} */ (el).value), ['Vertrieb', 'Fertigung', 'Kunde']);
    assertEqual(h.q('.df__lane-item[data-lane-id="unassigned"] .df__lane-name--fixed').textContent, tr('unassigned'));
    assertEqual(h.q('.df__lane-item[data-lane-id="unassigned"] .df__lane-remove'), null);
    assertEqual(h.qa('.df__lane-remove').length, 3);
    assertEqual(h.q('.df__canvas').getAttribute('style'), '--fc-lane-count: 4');
    assertEqual(h.q('.df__empty-hint'), null);
    assertEqual(h.inst.historyCan('undo'), false);
    // data-band nur an den Slots der Spalten
    assertTrue(h.qa('[data-band]').every((el) => el.classList.contains('df__slot')), 'data-band außerhalb der Slots');
    assertEqual(h.qa('[data-step-index]').length, 4);
    assertTrue(h.qa('[data-step-index]').every((el) => el.classList.contains('df__col')), 'data-step-index außerhalb der Spalten');
    unmountAll();
  });

  test('Altprojekt (b): ohne lanes, Schritt ohne laneId liegt sichtbar in „Nicht zugeordnet“', async () => {
    const h = await mount('df-2', plain(LEGACY_B));
    assertDeepEqual(h.bands(), [tr('unassigned')]);
    assertDeepEqual(h.titles(), ['Erster Schritt', 'Ohne Bahn']);
    assertDeepEqual(['b1', 'b2'].map(h.laneOf), ['unassigned', 'unassigned']);
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Leerzustand: Leerhinweis ohne Bahnen, keine Karte', async () => {
    const h = await mount('df-1', null);
    assertEqual(h.q('.df__empty-hint').textContent, tr('emptyHint'));
    assertEqual(h.qa('.df__col').length, 0);
    assertEqual(h.q('.df__sidebar-hint').textContent, tr('laneHint'));
    unmountAll();
  });

  test('Hilfe-Anker: Seitenleistentitel, reservierte Bahn, Griff mit Overlay; Verbinder und Löschknöpfe leer', async () => {
    const h = await mount('df-1', plain(LEGACY_A));
    assertEqual(h.q('.df__sidebar-title span').getAttribute('data-help-key'), `modules.${ID}.fields.lanes.help`);
    assertEqual(h.q('.df__lane-name--fixed').getAttribute('data-help-key'), `modules.${ID}.fields.steps.laneId.help`);
    for (const g of h.qa('.df__grip')) {
      assertEqual(g.getAttribute('data-help-key'), `modules.${ID}.actions.moveStep.help`);
      assertTrue(g.classList.contains('context-help-anchor--overlay'), 'Griff ohne Overlay-Anker');
      assertEqual(g.getAttribute('aria-label'), tr('stepGrip'));
      assertEqual(g.tagName, 'BUTTON');
    }
    for (const el of [...h.qa('[data-action="insert-step"]'), ...h.qa('.df__delete'), ...h.qa('.df__lane-remove')]) {
      assertEqual(el.getAttribute('data-help-key'), '', el.className);
    }
    assertEqual(h.q('input.df__lane-name').getAttribute('data-help-key'), `modules.${ID}.fields.lanes.name.help`);
    assertEqual(h.q('.df__step-title').getAttribute('data-help-key'), `modules.${ID}.fields.steps.title.help`);
    unmountAll();
  });

  test('Getter der Vorschau: showGap, Schienen, gapClass, slotClass (ganzes Band), cardClass', async () => {
    const h = await mount('df-1', plain(SMALL));
    const vm = h.vm();
    assertEqual(vm.showGap(0, 'r1'), false);
    assertEqual(vm.showGap(1, 'r2'), true);
    assertEqual(vm.showGap(1, 'r1'), false);
    assertEqual(vm.showStartRail(0, 'r1'), false);
    assertEqual(vm.gapClass(1), '');
    assertEqual(vm.slotClass('r2'), '');
    assertEqual(h.qa('[data-action="insert-step"]').map((el) => el.getAttribute('data-idx')).join(), '1,2');
    assertEqual(h.qa('.fc-connector--rail').length, 0);
    // Schritt s1 an Index 2 und in die Bahn r2
    vm.state.chainPreview = { id: 's1', index: 2, band: 'r2' };
    await settle();
    assertEqual(vm.previewGap, 3);
    assertEqual(vm.gapClass(3), 'fc-connector--drop is-drop-target');
    assertEqual(vm.gapClassAfter(2), 'fc-connector--drop is-drop-target');
    assertEqual(vm.gapClass(1), 'fc-connector--drop');
    assertEqual(vm.slotClass('r2'), 'is-drop-target');
    assertEqual(vm.slotClass('r1'), '');
    assertEqual(vm.showStartRail(0, 'r1'), true);
    assertEqual(vm.showEndRail(2, 'r1'), true);
    assertEqual(vm.showEndRail(2, 'r2'), false);
    assertDeepEqual(h.qa('.df__slot.is-drop-target').map((el) => el.dataset.band), ['r2', 'r2', 'r2']);
    assertEqual(h.qa('.fc-connector--rail').length, 2);
    assertTrue(h.q('.df__col[data-step-id="s1"] .df__step').classList.contains('is-dragging'), 'gezogene Karte ohne is-dragging');
    assertEqual(h.q('.df__col[data-step-id="s3"] [data-gap="3"]').classList.contains('is-drop-target'), true);
    // Eigene Bahn hebt nichts hervor, alte Stelle ist keine Ziellücke
    vm.state.chainPreview = { id: 's1', index: 0, band: 'r1' };
    await settle();
    assertEqual(vm.previewGap, null);
    assertEqual(vm.slotClass('r1'), '');
    assertEqual(h.qa('.df__slot.is-drop-target').length, 0);
    vm.state.chainPreview = null;
    await settle();
    assertEqual(h.qa('.fc-connector--rail').length, 0);
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Verbinder-Klick fügt an dieser Stelle in der Bahn der Karte ein; ein Schritt, Rückgängig', async () => {
    const h = await mount('df-1', plain(SMALL));
    await h.click(h.q('.df__col[data-step-id="s2"] [data-action="insert-step"]'));
    await until(() => h.titles().length === 4);
    const steps = h.vm().model.steps;
    assertDeepEqual(steps.map((s) => s.id).filter((id) => id.startsWith('s') && !['s1', 's2', 's3'].includes(id)).length, 1);
    assertEqual(steps[0].id, 's1');
    assertEqual(steps[2].id, 's2');
    assertEqual(steps[1].laneId, 'r2');
    assertEqual(steps[1].title, '');
    assertValid(h.saved());
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig ohne Wirkung');
    await until(() => h.titles().length === 3);
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('„Rolle hinzufügen“ legt an und fokussiert das neue Feld; das Kommando allein stiehlt keinen Fokus', async () => {
    const h = await mount('df-1', plain(SMALL));
    h.vm().addLaneAndFocus();
    await until(() => h.qa('input.df__lane-name').length === 3);
    const id = h.vm().model.lanes[2].id;
    assertTrue(id.startsWith('lane-'), id);
    await until(() => document.activeElement === h.laneInput(id));
    assertEqual(document.activeElement, h.laneInput(id));
    assertEqual(h.laneInput(id).placeholder, tr('unnamedLane'));
    assertEqual(h.bands()[2], tr('unnamedLane'));
    /** @type {HTMLElement} */ (document.activeElement).blur();
    const other = h.vm().model.addLane({});
    await until(() => h.qa('input.df__lane-name').length === 4);
    assertTrue(document.activeElement !== h.laneInput(other), 'Kommando hat fokussiert');
    assertValid(h.saved());
    unmountAll();
  });

  test('Bahn umbenennen über das Namensfeld (ein Schritt), Bahn entfernen mit Rückfrage verschiebt ihre Schritte', async () => {
    const h = await mount('df-1', plain(SMALL));
    const input = h.laneInput('r1');
    input.focus();
    input.value = 'Beschaffung';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.blur();
    await until(() => h.vm().model.lanes[0].name === 'Beschaffung');
    await until(() => h.bands()[0] === 'Beschaffung');
    assertEqual(h.saved().lanes[0].name, 'Beschaffung');
    await h.click(h.q('.df__lane-remove[data-arg-lane-id="r1"]'));
    await until(() => h.vm().model.lanes.every((l) => l.id !== 'r1'));
    assertEqual(h.confirms.length, 1);
    assertDeepEqual(h.vm().model.lanes.map((l) => l.id), ['r2', 'unassigned']);
    assertDeepEqual(['s1', 's2', 's3'].map(h.laneOf), ['unassigned', 'r2', 'unassigned']);
    assertValid(h.saved());
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Entfernen) ohne Wirkung');
    await until(() => h.laneOf('s1') === 'r1');
    assertEqual(h.vm().model.lanes[0].name, 'Beschaffung');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Umbenennen) ohne Wirkung');
    await until(() => h.vm().model.lanes[0].name === 'Einkauf');
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Schritt löschen mit Rückfrage; abgelehnte Rückfrage lässt alles stehen', async () => {
    const h = await mount('df-1', plain(SMALL), { confirm: false });
    await h.click(h.q('.df__col[data-step-id="s2"] .df__delete'));
    assertEqual(h.confirms.length, 1);
    assertEqual(h.titles().length, 3);
    const k = await mount('df-1', plain(SMALL));
    await k.click(k.q('.df__col[data-step-id="s2"] .df__delete'));
    await until(() => k.titles().length === 2);
    assertDeepEqual(k.titles(), ['Eins', 'Drei']);
    unmountAll();
  });

  test('Kettengeste per Tastatur: Enter, ↑/↓ wechselt die Bahn (Grenzen halten), Enter legt ab; Escape ohne Kommando', async () => {
    const h = await mount('df-1', plain(SMALL));
    const grip = h.grip('s2');
    grip.focus();
    await h.key(grip, 'Enter');
    assertTrue(h.vm().state.chainPreview !== null, 'Geste nicht aufgenommen');
    await h.key(grip, 'ArrowDown');
    assertEqual(h.vm().state.chainPreview.band, 'r2', 'unterste Bahn: ↓ ändert nichts');
    await h.key(grip, 'ArrowUp');
    assertEqual(h.vm().state.chainPreview.band, 'r1');
    await h.key(grip, 'ArrowUp');
    assertEqual(h.vm().state.chainPreview.band, 'r1', 'oberste Bahn: ↑ ändert nichts');
    await h.key(grip, 'Enter');
    await until(() => h.laneOf('s2') === 'r1');
    assertEqual(h.vm().state.chainPreview, null);
    assertDeepEqual(h.vm().model.steps.map((s) => [s.id, s.laneId]), [['s1', 'r1'], ['s2', 'r1'], ['s3', 'r1']]);
    assertValid(h.saved());
    // Escape bricht ab, ohne zu schreiben
    const g3 = h.grip('s3');
    g3.focus();
    await h.key(g3, 'Enter');
    await h.key(g3, 'ArrowLeft');
    await h.key(g3, 'Escape');
    assertEqual(h.vm().state.chainPreview, null);
    assertDeepEqual(h.vm().model.steps.map((s) => s.id), ['s1', 's2', 's3']);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig ohne Wirkung');
    await until(() => h.laneOf('s2') === 'r2');
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('openImport ohne Quelle meldet importEmptyHint und öffnet keinen Dialog', async () => {
    const h = await mount('df-1', null);
    h.vm().openImport();
    await settle();
    assertDeepEqual(h.listCalls, [{ modules: ['process-map', 'sipoc'] }]);
    assertDeepEqual(h.notes, [[tr('importEmptyHint'), 'info']]);
    assertEqual(h.forms.length, 0);
    unmountAll();
  });

  test('Import: Auswahlzeilen, Dialog mit importForm, SIPOC und Process Map landen in „Nicht zugeordnet“', async () => {
    const list = [
      { instanceId: 'p1', moduleId: 'process-map', phase: 'analyze', title: '' },
      { instanceId: 'p2', moduleId: 'process-map', phase: 'analyze', title: 'Wareneingang' },
      { instanceId: 's1', moduleId: 'sipoc', phase: 'define', title: '' },
    ];
    const reads = {
      p2: { steps: [{ title: 'Prüfen', description: 'Sicht' }, { title: 'Montieren' }] },
      s1: { columns: { suppliers: [], inputs: [], process: ['Bestellen', ' Backen ', ''], outputs: [], customers: [] } },
    };
    const h = await mount('df-1', plain(SMALL), { list, reads });
    h.vm().openImport();
    await settle();
    assertDeepEqual(h.vm().state.importOptions.map((o) => [o.instanceId, o.moduleId, o.label]), [
      ['p1', 'process-map', '#1'], ['p2', 'process-map', 'Wareneingang'], ['s1', 'sipoc', ''],
    ]);
    assertEqual(h.vm().state.importPick, 'p1');
    assertEqual(h.forms.length, 1);
    assertEqual(h.forms[0].content, h.vm().$refs.importForm);
    assertEqual(h.forms[0].title, tr('importTitle'));
    const radios = h.qa('.df__import-option input[type="radio"]');
    assertEqual(radios.length, 3);
    assertTrue(radios.every((r) => /** @type {HTMLInputElement} */ (r).name === 'df-import-pick-df-1'), 'Radio-Name nicht je Instanz');
    assertTrue(h.q('.df__import-option[data-instance-id="p1"]').classList.contains('df__import-option--selected'), 'Vorauswahl nicht markiert');
    // Auswahl über die Liste, Bestätigen über den Dialog
    const r2 = /** @type {HTMLInputElement} */ (h.q('.df__import-option[data-instance-id="p2"] input'));
    r2.checked = true;
    r2.dispatchEvent(new Event('change', { bubbles: true }));
    assertEqual(h.vm().state.importPick, 'p2');
    h.forms[0].onConfirm(h.vm().$refs.importForm);
    await until(() => h.titles().length === 5);
    assertDeepEqual(h.notes.at(-1), [tr('importDone', { n: 2 }), 'success']);
    h.vm().state.importPick = 's1';
    assertEqual(await h.vm().runImport(), 2);
    const steps = h.vm().model.steps;
    assertDeepEqual(steps.slice(3).map((s) => [s.title, s.description, s.laneId]), [
      ['Prüfen', 'Sicht', 'unassigned'], ['Montieren', '', 'unassigned'], ['Bestellen', '', 'unassigned'], ['Backen', '', 'unassigned'],
    ]);
    assertDeepEqual(h.vm().model.lanes.map((l) => l.id), ['r1', 'r2', 'unassigned']);
    assertValid(h.saved());
    unmountAll();
  });

  test('runImport meldet einen Lesefehler übersetzt und hängt nichts an', async () => {
    const list = [{ instanceId: 's1', moduleId: 'sipoc', phase: 'define', title: 'Pizza' }];
    const h = await mount('df-1', plain(SMALL), { list, readError: new Error('unknown_instance') });
    h.vm().openImport();
    await settle();
    const warn = console.warn;
    console.warn = () => {};
    let n;
    try { n = await h.vm().runImport(); } finally { console.warn = warn; }
    assertEqual(n, 0);
    assertEqual(h.vm().model.steps.length, 3);
    assertDeepEqual(h.notes.at(-1), [tr('importFailed'), 'error']);
    unmountAll();
  });

  test('Zwei Instanzen: getrennte Stände, Radio-Namen und Fokus je Instanz', async () => {
    const a = await mount('df-1', plain(SMALL));
    const b = await mount('df-2', plain(LEGACY_B), { keep: true });
    await a.click(a.q('.df__col[data-step-id="s2"] [data-action="insert-step"]'));
    await until(() => a.titles().length === 4);
    assertEqual(b.titles().length, 2);
    b.vm().addLaneAndFocus();
    await until(() => b.qa('input.df__lane-name').length === 1);
    await until(() => b.container.contains(document.activeElement));
    assertEqual(a.qa('input.df__lane-name').length, 2);
    assertTrue(!a.container.contains(document.activeElement), 'Fokus in der falschen Instanz');
    assertEqual(a.inst.historyCan('undo'), true);
    assertTrue(a.inst.historyStep('undo'), 'Rückgängig ohne Wirkung');
    await until(() => a.titles().length === 3);
    assertEqual(b.vm().model.lanes.length, 2);
    assertEqual(b.vm().fieldId('import-pick'), 'df-import-pick-df-2');
    assertEqual(a.vm().fieldId('import-pick'), 'df-import-pick-df-1');
    unmountAll();
  });

  test('exports.tree() ist toJsonTree des Models (expanded aus dem Ansichtsfeld, order = Position)', async () => {
    const h = await mount('df-1', plain(LEGACY_A));
    const ui = h.vm()._ui;
    assertTrue(ui.exports !== null, 'exports fehlt');
    const tree = ui.exports.tree.call(ui.component);
    assertDeepEqual(tree, toJsonTree(h.vm().model));
    assertEqual(ui.exports.fileName, ID);
    assertDeepEqual(tree.lanes.map((l) => [l.id, l.order]), [['lane-vertrieb', 0], ['lane-fertigung', 1], ['unassigned', 2], ['lane-kunde', 3]]);
    assertDeepEqual(tree.steps.map((s) => s.expanded), [false, true, false, false]);
    unmountAll();
  });

  test('Kartenhöhe wie die Altform: ein einzeiliger Titel hält zwei Zeilen Höhe, ein langer wächst (field-sizing)', async () => {
    // Die Altform hatte Titel-Textfelder ohne `rows` (Vorgabe zwei Zeilen), die
    // `autoSize` nie darunter schrumpfte; die Kartenhöhe bleibt (Spec §11).
    for (const [key, path] of [['flowchart', 'js/core/flowchart/flowchart.css'], [ID, `js/modules/${ID}/resources/style.css`]]) {
      if (document.querySelector(`style[data-test-css="${key}"]`)) continue;
      const css = document.createElement('style');
      css.dataset.testCss = key;
      css.textContent = await (await fetch(new URL(`../../../${path}`, import.meta.url), { cache: 'no-cache' })).text();
      document.head.append(css);
    }
    const h = await mount('df-1', plain(SMALL));
    const title = /** @type {HTMLTextAreaElement} */ (h.q('.df__col[data-step-id="s1"] .df__step-title'));
    const line = parseFloat(getComputedStyle(title).lineHeight);
    assertTrue(line > 0, `line-height ${line}`);
    const short = title.getBoundingClientRect().height;
    assertTrue(short >= 2 * line - 1, `einzeiliger Titel ${short}px, erwartet ≥ ${2 * line}px`);
    title.value = 'Ein recht langer Titel, der sicher über mehrere Zeilen der schmalen Karte umbricht';
    await settle();
    assertTrue(title.getBoundingClientRect().height > short + line / 2, 'langer Titel wächst nicht');
    unmountAll();
  });
});
