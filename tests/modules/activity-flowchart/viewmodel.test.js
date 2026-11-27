/**
 * Activity-Flowchart: das Viewmodel im Browser (viewmodel/viewmodel.js) mit
 * dem echten Modul und der echten Vorlage (samt Unterschritt-Teil).
 * Prüft: Altprojekt ohne Verlaufsschritt (Bänder, Raster, Wiedereinstieg,
 * Unterschritte), Leerzustand, Hilfe-Anker, die Getter der Gestenvorschau
 * (Lücke, Bandzeile, Schienen), das Einfügemenü, das Band-Ende, den
 * Auswahlmodus samt ✕ und Escape, die Frage der Raute (`x-field`), die
 * Tastatur der Geste `flow` (Stelle und Band getrennt), den Import über
 * Stub-Instanzen, zwei Instanzen mit eigenem Layout und den JSON-Export.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import Alpine from '../../../vendor/alpinejs/csp.js';
import { registerCommandDirectives } from '../../../js/core/command-directives.js';
import { registerFieldDirective } from '../../../js/core/field-directive.js';
import mod from '../../../js/modules/activity-flowchart/viewmodel/viewmodel.js';
import { State } from '../../../js/modules/activity-flowchart/domain/model.js';
import { toJsonTree } from '../../../js/modules/activity-flowchart/io/export.js';

const ID = 'activity-flowchart';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const PART = 'js/core/flowchart/substeps.view.part.html';
const INSTANCE_A = '6a2f8b31-4d5c-4e9f-8c32-1b7d3f9e5a01';
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
let FIXTURE = null;
let LEGACY_READ = null;
const plain = (v) => JSON.parse(JSON.stringify(v));

/** Text des Moduls unter einem Punktpfad, Platzhalter `{n}` ersetzt; sonst der Pfad. */
function tr(path, params) {
  const v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), UI);
  const text = typeof v === 'string' ? v : path;
  return params ? text.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : text;
}

const fetchJson = async (p) => (await fetch(new URL(p, import.meta.url), { cache: 'no-cache' })).json();

async function prepare() {
  if (!prepared) {
    registerCommandDirectives(Alpine);
    registerFieldDirective(Alpine, { i18n: { t: (k) => k, getLanguage: () => 'de' } });
    if (!Alpine.version) Alpine.start();
    UI = await fetchJson(`../../../js/modules/${ID}/resources/i18n/ui.de.json`);
    FIXTURE = await fetchJson('./legacy-project.json');
    LEGACY_READ = await fetchJson('./legacy-read.json');
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

/**
 * Kleine Kette der Zielform: s1 → d1 (Raute, Band no:d1 mit s2) → s3.
 * @param {string} [noTarget] Wiedereinstieg der Raute
 */
const small = (noTarget = 'end') => ({
  _schema: { name: ID, version: '1.0' },
  steps: [
    { id: 's1', title: 'Eins', description: '', kind: 'activity', branchId: 'main', decision: null, substeps: [] },
    { id: 'd1', title: '', description: '', kind: 'decision', branchId: 'main', decision: { label: 'Gut?', noTarget }, substeps: [] },
    { id: 's2', title: 'Nacharbeit', description: '', kind: 'activity', branchId: 'no:d1', decision: null, substeps: [] },
    { id: 's3', title: 'Drei', description: '', kind: 'activity', branchId: 'main', decision: null, substeps: [] },
  ],
  expanded: [],
});
/** Nur Hauptpfad: zwei Aktivitäten. */
const PLAIN = {
  _schema: { name: ID, version: '1.0' },
  steps: [
    { id: 'p1', title: 'A', description: '', kind: 'activity', branchId: 'main', decision: null, substeps: [] },
    { id: 'p2', title: 'B', description: '', kind: 'activity', branchId: 'main', decision: null, substeps: [] },
  ],
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
  container.style.width = '1200px';
  document.body.append(container);
  mounted.push(container);
  const inst = { ...mod };
  await inst.init(container, context);
  await settle();
  const q = (sel) => container.querySelector(sel);
  const qa = (sel) => [...container.querySelectorAll(sel)];
  const card = (id) => /** @type {HTMLElement|null} */ (q(`.af__step[data-step-id="${id}"]`));
  const h = {
    inst, states, notes, forms, confirms, listCalls, container, q, qa, card,
    vm: () => Alpine.$data(container.querySelector('[x-data]')),
    /** Schritt-ids in Anzeigefolge. */
    ids: () => qa('.af__step').map((el) => el.dataset.stepId),
    /** Bandbeschriftungen von oben nach unten. */
    bands: () => qa('.af__band-label').map((el) => el.textContent.trim()),
    grip: (id) => /** @type {HTMLButtonElement} */ (card(id)?.querySelector('.af__grip')),
    steps: () => plain(Alpine.$data(container.querySelector('[x-data]')).model.steps),
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

suite('activity-flowchart: Viewmodel im Browser', () => {
  test('Altprojekt (a): Bänder wie die Altform, Raster, Wiedereinstieg, a1 aufgeklappt, kein Verlaufsschritt', async () => {
    await prepare();
    const h = await mount('af-1', plain(FIXTURE.moduleStates[INSTANCE_A]));
    assertDeepEqual(h.bands(), LEGACY_READ.de.a.bands.map((b) => b.label));
    assertDeepEqual(h.ids(), ['a1', 'a2', 'a2b', 'a3', 'a3b', 'a4', 'a5', 'a6', 'a7', 'a7b', 'a8']);
    assertDeepEqual(h.qa('.af__grip').map((el) => el.textContent), ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11']);
    // data-* der Karte: Kettenindex, Band, id
    const a2b = h.card('a2b');
    assertEqual(a2b.dataset.stepIndex, '2');
    assertEqual(a2b.dataset.bandId, 'no:a2');
    assertEqual(a2b.dataset.id, 'a2b');
    assertEqual(h.card('a6').dataset.bandId, 'main', 'Band einer späteren Raute fällt in den Hauptpfad');
    // Zeile = Band, Spalte aus dem Layout (+1 für die Beschriftungsspalte)
    assertTrue(/grid-row: 2;/.test(a2b.getAttribute('style')), a2b.getAttribute('style'));
    assertEqual(h.q('.af__canvas').getAttribute('style'), '--fc-lane-count: 6');
    assertEqual(h.q('.af__canvas').classList.contains('af__canvas--plain'), false);
    // Rücksprung a2 → a1: Pfeil gedreht, Band läuft nach links, Marke mit ↩
    assertTrue(h.card('a2b').querySelector('.af__connector-arrow').classList.contains('af__connector-arrow--back'), 'Pfeil im Rückwärtsband');
    assertTrue(h.q('.af__tail[data-band-id="no:a2"]').classList.contains('af__tail--back'), 'Band-Ende im Rückwärtsband');
    assertEqual(h.q('.af__rejoin[data-band-id="no:a2"] .af__band-exit-target').textContent, '↩ Anfrage erfassen');
    assertEqual(h.q('.af__rejoin[data-band-id="no:a7"] .af__band-exit-target').textContent, 'Auftrag anlegen');
    // Ziele nach A9: eigenes und unbekanntes Ziel → Prozessende, Einladung am Band-Ende
    assertDeepEqual(h.qa('.af__rejoin').map((el) => el.dataset.bandId), ['no:a2', 'no:a7']);
    assertDeepEqual(h.qa('.af__tail .af__band-exit-group').map((el) => el.dataset.bandId), ['no:a3', 'no:a4', 'no:a5']);
    assertEqual(h.q('.af__tail[data-band-id="no:a3"] .af__band-exit-target').textContent, tr('pickEntry'));
    // Werte sichtbar
    assertEqual(/** @type {HTMLTextAreaElement} */ (h.card('a2').querySelector('.af__decision-label')).value, 'Anfrage vollständig?');
    assertEqual(/** @type {HTMLTextAreaElement} */ (h.card('a1').querySelector('.af__step-title')).value, 'Anfrage erfassen');
    assertEqual(/** @type {HTMLTextAreaElement} */ (h.card('a1').querySelector('.af__step-description')).value, 'Per E-Mail oder Telefon.');
    assertDeepEqual(h.qa('.fc-substep-number').map((el) => el.textContent), ['1.1', '1.2']);
    assertEqual(h.qa('.af__diamond').length, 5);
    assertEqual(h.q('.af__empty-hint'), null);
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Leerzustand: Leerhinweis, keine Karte, keine Beschriftungsspalte', async () => {
    const h = await mount('af-1', null);
    assertEqual(h.q('.af__empty-hint').textContent, tr('emptyHint'));
    assertEqual(h.qa('.af__step').length, 0);
    assertEqual(h.q('.fc-swimlane-labels'), null);
    assertTrue(h.q('.af__canvas').classList.contains('af__canvas--plain'), 'ohne Bänder ohne Schienenplatz');
    assertEqual(h.qa('.af__lane').length, 1);
    unmountAll();
  });

  test('Hilfe-Anker: Griff mit Overlay, Hauptpfad, „Nein“, Band-Ende; Schleifenknöpfe leer', async () => {
    const h = await mount('af-1', plain(small()));
    for (const g of h.qa('.af__grip')) {
      assertEqual(g.getAttribute('data-help-key'), `modules.${ID}.actions.moveStep.help`);
      assertTrue(g.classList.contains('context-help-anchor--overlay'), 'Griff ohne Overlay-Anker');
      assertEqual(g.getAttribute('aria-label'), tr('stepGrip'));
      assertEqual(g.tagName, 'BUTTON');
    }
    assertEqual(h.qa('.af__grip').length, 4, 'Griff an Karte und Raute');
    assertDeepEqual(h.qa('.af__band-label span').map((el) => el.getAttribute('data-help-key')), [`modules.${ID}.fields.bands.help`, '']);
    assertEqual(h.q('.af__branch--no .af__branch-word').getAttribute('data-help-key'), `modules.${ID}.fields.steps.decision.help`);
    assertEqual(h.q('.af__band-add [data-add="activity"]').getAttribute('data-help-key'), `modules.${ID}.actions.addStep.help`);
    assertEqual(h.q('.af__band-add [data-add="decision"]').getAttribute('data-help-key'), '');
    assertEqual(h.q('.af__tail [data-exit="pick"]').getAttribute('data-help-key'), `modules.${ID}.actions.setDecisionTarget.help`);
    for (const el of [...h.qa('[data-action="insert-step"]'), ...h.qa('.af__delete')]) {
      assertEqual(el.getAttribute('data-help-key'), '', el.className);
    }
    assertEqual(h.q('.af__step-title').getAttribute('data-help-key'), `modules.${ID}.fields.steps.title.help`);
    assertEqual(h.q('.af__decision-label').getAttribute('data-help-key'), `modules.${ID}.fields.steps.decision.label.help`);
    unmountAll();
  });

  test('Getter der Vorschau: Lücke über indexToGap, Bandzeile ganz, Schienen nur während der Geste', async () => {
    const h = await mount('af-1', plain(small()));
    const vm = h.vm();
    assertEqual(vm.gapClass(1), '');
    assertEqual(h.qa('.fc-connector--rail').length, 0);
    assertDeepEqual(h.qa('[data-gap]').map((el) => el.dataset.gap), ['1', '2', '3']);
    // Raute d1 zieht ihren Block (d1, s2) an den Anfang: Endindex 0 → Lücke 0
    vm.state.flowPreview = { id: 'd1', index: 0, band: 'main' };
    await settle();
    assertEqual(vm.previewGap, 0);
    assertEqual(h.qa('.fc-connector--rail').length, 2);
    assertTrue(h.q('[data-gap="0"]').classList.contains('is-drop-target'), 'Lücke 0 nicht hervorgehoben');
    assertDeepEqual(h.qa('.is-drop-target').map((el) => el.dataset.gap), ['0']);
    assertTrue(h.card('d1').classList.contains('is-dragging'), 'gezogene Raute ohne is-dragging');
    // Block ans Ende: Endindex 2 → Lücke 4 (hinter s3)
    vm.state.flowPreview = { id: 'd1', index: 2, band: 'main' };
    await settle();
    assertEqual(vm.previewGap, 4);
    assertTrue(h.q('[data-gap="4"]').classList.contains('is-drop-target'), 'Schiene hinter der Kette nicht hervorgehoben');
    // Bandziel: s3 ins Band no:d1 → ganze Zeile, keine Lücke
    vm.state.flowPreview = { id: 's3', index: 3, band: 'no:d1' };
    await settle();
    assertEqual(vm.previewGap, null);
    assertDeepEqual(h.qa('.af__lane.is-drop-target').map((el) => el.dataset.bandId), ['no:d1']);
    assertEqual(h.qa('[data-gap].is-drop-target').length, 0);
    // Eigenes Band, alte Stelle: nichts
    vm.state.flowPreview = { id: 's2', index: 2, band: 'no:d1' };
    await settle();
    assertEqual(h.qa('.is-drop-target').length, 0);
    vm.state.flowPreview = null;
    await settle();
    assertEqual(h.qa('.fc-connector--rail').length, 0);
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Einfügemenü: Verbinder öffnet, „Entscheidung“ legt an dieser Stelle im Band der Karte an, Menü schließt, ein Schritt', async () => {
    const h = await mount('af-1', plain(small()));
    await h.click(h.card('s2').querySelector('[data-action="insert-step"]'));
    assertEqual(h.vm().state.insertMenu?.index, 2);
    assertTrue(h.card('s2').classList.contains('af__step--menu-open'), 'Karte mit Menü nicht angehoben');
    await h.click(h.card('s2').querySelector('.af__insert-menu [data-insert="decision"]'));
    await until(() => h.ids().length === 5);
    assertEqual(h.vm().state.insertMenu, null);
    assertEqual(h.q('.af__insert-menu'), null);
    const steps = h.steps();
    assertEqual(steps[2].kind, 'decision');
    assertEqual(steps[2].branchId, 'no:d1');
    assertDeepEqual(steps[2].decision, { label: '', noTarget: 'end' });
    assertEqual(steps[3].id, 's2');
    assertValid(h.saved());
    // zweiter Klick auf denselben Verbinder schließt das Menü wieder; Leinwandklick ebenso
    const conn = h.card('s3').querySelector('[data-action="insert-step"]');
    await h.click(conn);
    await h.click(conn);
    assertEqual(h.vm().state.insertMenu, null);
    await h.click(conn);
    await h.click(h.q('.af__canvas'));
    assertEqual(h.vm().state.insertMenu, null);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig ohne Wirkung');
    await until(() => h.ids().length === 4);
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Band-Ende: Aktivität und Entscheidung landen am Ende des Bands', async () => {
    const h = await mount('af-1', plain(small()));
    await h.click(h.q('.af__tail[data-band-id="no:d1"] [data-add="activity"]'));
    await until(() => h.ids().length === 5);
    assertDeepEqual(h.steps().map((s) => [s.kind, s.branchId]).slice(2, 4), [['activity', 'no:d1'], ['activity', 'no:d1']]);
    await h.click(h.q('.af__tail[data-band-id="no:d1"] [data-add="decision"]'));
    await until(() => h.ids().length === 6);
    const added = h.steps()[4];
    assertEqual(added.kind, 'decision');
    assertEqual(added.branchId, 'no:d1');
    assertEqual(h.steps()[5].id, 's3');
    // das neue Unterband hat sein eigenes Band-Ende
    await until(() => h.q(`.af__tail[data-band-id="no:${added.id}"]`) !== null);
    assertEqual(h.bands().length, 3);
    assertValid(h.saved());
    unmountAll();
  });

  test('Auswahlmodus: Einladung hebt Karten hervor, Klick setzt Ziel, ✕ setzt Prozessende, Escape bricht ab', async () => {
    const h = await mount('af-1', plain(small()));
    await h.click(h.q('.af__tail[data-band-id="no:d1"] [data-exit="pick"]'));
    assertEqual(h.vm().state.pickBand, 'no:d1');
    assertTrue(h.card('s1').classList.contains('af__step--pickable'), 's1 nicht wählbar');
    assertTrue(h.card('s3').classList.contains('af__step--pickable'), 's3 nicht wählbar');
    assertTrue(h.card('d1').classList.contains('af__step--dimmed'), 'eigene Raute nicht abgeblendet');
    assertTrue(h.card('s2').classList.contains('af__step--dimmed'), 'Umwegkarte nicht abgeblendet');
    // Klick auf eine nicht wählbare Karte: kein Ziel, Auswahl endet (Leinwand)
    await h.click(h.card('s2'));
    assertEqual(h.vm().state.pickBand, null);
    assertEqual(h.steps()[1].decision.noTarget, 'end');
    // Escape bricht ab
    await h.click(h.q('.af__tail[data-band-id="no:d1"] [data-exit="pick"]'));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await settle();
    assertEqual(h.vm().state.pickBand, null);
    // Ziel wählen
    await h.click(h.q('.af__tail[data-band-id="no:d1"] [data-exit="pick"]'));
    await h.click(h.card('s3'));
    await until(() => h.steps()[1].decision.noTarget === 's3');
    assertEqual(h.vm().state.pickBand, null);
    await until(() => h.q('.af__rejoin[data-band-id="no:d1"]') !== null);
    assertEqual(h.q('.af__rejoin .af__band-exit-target').textContent, 'Drei');
    assertEqual(h.q('.af__tail[data-band-id="no:d1"] [data-exit="pick"]'), null, 'Einladung trotz Ziel');
    // ✕ setzt das Prozessende
    const clear = h.q('.af__rejoin .af__band-exit-clear');
    assertTrue(clear.querySelector('[data-icon="action.close"]') !== null, '✕ ohne Icon');
    await h.click(clear);
    await until(() => h.steps()[1].decision.noTarget === 'end');
    assertEqual(h.confirms.length, 0, '✕ fragt nach');
    assertValid(h.saved());
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig ohne Wirkung');
    await until(() => h.steps()[1].decision.noTarget === 's3');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig ohne Wirkung');
    await until(() => h.steps()[1].decision.noTarget === 'end');
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Frage der Raute über x-field: Tippen schreibt das Model und den Bandnamen; Rückgängig', async () => {
    const h = await mount('af-1', plain(small()));
    const label = /** @type {HTMLTextAreaElement} */ (h.card('d1').querySelector('.af__decision-label'));
    label.focus();
    label.value = 'Passt alles?';
    label.dispatchEvent(new Event('input', { bubbles: true }));
    label.dispatchEvent(new Event('change', { bubbles: true }));
    label.blur();
    await until(() => h.steps()[1].decision.label === 'Passt alles?');
    await until(() => h.bands()[1] === tr('bandLabel', { q: 'Passt alles?' }));
    assertEqual(h.saved().steps[1].decision.label, 'Passt alles?');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig ohne Wirkung');
    await until(() => h.steps()[1].decision.label === 'Gut?');
    assertEqual(label.value, 'Gut?');
    unmountAll();
  });

  test('Schritt löschen mit Rückfrage; abgelehnte Rückfrage lässt alles stehen; Raute löst ihr Band auf', async () => {
    const h = await mount('af-1', plain(small()), { confirm: false });
    await h.click(h.card('d1').querySelector('.af__delete'));
    assertEqual(h.confirms.length, 1);
    assertEqual(h.ids().length, 4);
    const k = await mount('af-1', plain(small()));
    await k.click(k.card('d1').querySelector('.af__delete'));
    await until(() => k.ids().length === 3);
    assertDeepEqual(k.steps().map((s) => [s.id, s.branchId]), [['s1', 'main'], ['s2', 'main'], ['s3', 'main']]);
    assertEqual(k.q('.fc-swimlane-labels'), null);
    unmountAll();
  });

  test('Geste flow per Tastatur: ←/→ verschiebt (Band bleibt), ↓ wechselt das Band (Stelle bleibt), Escape ohne Kommando', async () => {
    const h = await mount('af-1', plain(small()));
    // s3: ↓ ins Band no:d1, Enter → setStepBand
    let grip = h.grip('s3');
    grip.focus();
    await h.key(grip, 'Enter');
    assertDeepEqual(plain(h.vm().state.flowPreview), { id: 's3', index: 3, band: 'main' });
    await h.key(grip, 'ArrowUp');
    assertEqual(h.vm().state.flowPreview.band, 'main', 'oberstes Band: ↑ ändert nichts');
    await h.key(grip, 'ArrowDown');
    assertDeepEqual(plain(h.vm().state.flowPreview), { id: 's3', index: 3, band: 'no:d1' });
    await h.key(grip, 'Enter');
    await until(() => h.steps()[3].branchId === 'no:d1');
    assertEqual(h.vm().state.flowPreview, null);
    assertDeepEqual(h.steps().map((s) => s.id), ['s1', 'd1', 's2', 's3']);
    // s1: → an Stelle 1, Band bleibt main
    grip = h.grip('s1');
    grip.focus();
    await h.key(grip, 'Enter');
    await h.key(grip, 'ArrowRight');
    assertDeepEqual(plain(h.vm().state.flowPreview), { id: 's1', index: 1, band: 'main' });
    await h.key(grip, 'Enter');
    await until(() => h.steps()[1].id === 's1');
    assertDeepEqual(h.steps().map((s) => [s.id, s.branchId]), [['d1', 'main'], ['s1', 'main'], ['s2', 'no:d1'], ['s3', 'no:d1']]);
    assertValid(h.saved());
    // Escape bricht ab, ohne zu schreiben (und lässt das Einfügemenü in Ruhe)
    h.vm().toggleInsertMenu(2, 'no:d1');
    await settle();
    const g = h.grip('s2');
    g.focus();
    await h.key(g, 'Enter');
    await h.key(g, 'ArrowLeft');
    await h.key(g, 'Escape');
    assertEqual(h.vm().state.flowPreview, null);
    assertEqual(h.vm().state.insertMenu?.index, 2, 'Escape der Geste schloss das Menü');
    assertDeepEqual(h.steps().map((s) => s.id), ['d1', 's1', 's2', 's3']);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig ohne Wirkung');
    await until(() => h.steps()[0].id === 's1');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig ohne Wirkung');
    await until(() => h.steps()[3].branchId === 'main');
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('openImport ohne Quelle meldet importEmptyHint und öffnet keinen Dialog', async () => {
    const h = await mount('af-1', null);
    h.vm().openImport();
    await settle();
    assertDeepEqual(h.listCalls, [{ modules: ['process-map', 'sipoc'] }]);
    assertDeepEqual(h.notes, [[tr('importEmptyHint'), 'info']]);
    assertEqual(h.forms.length, 0);
    unmountAll();
  });

  test('Import: Auswahlzeilen, Dialog mit importForm, Process Map und SIPOC landen als Aktivitäten im Hauptpfad', async () => {
    const list = [
      { instanceId: 'p1', moduleId: 'process-map', phase: 'analyze', title: '' },
      { instanceId: 'p2', moduleId: 'process-map', phase: 'analyze', title: 'Wareneingang' },
      { instanceId: 'q1', moduleId: 'sipoc', phase: 'define', title: '' },
    ];
    const reads = {
      p2: { steps: [{ title: 'Prüfen', description: 'Sicht' }, { title: 'Montieren' }] },
      q1: { columns: { suppliers: [], inputs: [], process: ['Bestellen', ' Backen ', ''], outputs: [], customers: [] } },
    };
    const h = await mount('af-1', plain(PLAIN), { list, reads });
    h.vm().openImport();
    await settle();
    assertDeepEqual(h.vm().state.importOptions.map((o) => [o.instanceId, o.moduleId, o.label]), [
      ['p1', 'process-map', '#1'], ['p2', 'process-map', 'Wareneingang'], ['q1', 'sipoc', ''],
    ]);
    assertEqual(h.vm().state.importPick, 'p1');
    assertEqual(h.forms.length, 1);
    assertEqual(h.forms[0].content, h.vm().$refs.importForm);
    assertEqual(h.forms[0].title, tr('importTitle'));
    const radios = h.qa('.af__import-option input[type="radio"]');
    assertEqual(radios.length, 3);
    assertTrue(radios.every((r) => /** @type {HTMLInputElement} */ (r).name === 'af-import-pick-af-1'), 'Radio-Name nicht je Instanz');
    assertTrue(h.q('.af__import-option[data-instance-id="p1"]').classList.contains('af__import-option--selected'), 'Vorauswahl nicht markiert');
    const r2 = /** @type {HTMLInputElement} */ (h.q('.af__import-option[data-instance-id="p2"] input'));
    r2.checked = true;
    r2.dispatchEvent(new Event('change', { bubbles: true }));
    assertEqual(h.vm().state.importPick, 'p2');
    h.forms[0].onConfirm(h.vm().$refs.importForm);
    await until(() => h.ids().length === 4);
    assertDeepEqual(h.notes.at(-1), [tr('importDone', { n: 2 }), 'success']);
    h.vm().state.importPick = 'q1';
    assertEqual(await h.vm().runImport(), 2);
    assertDeepEqual(h.steps().slice(2).map((s) => [s.title, s.description, s.kind, s.branchId]), [
      ['Prüfen', 'Sicht', 'activity', 'main'], ['Montieren', '', 'activity', 'main'],
      ['Bestellen', '', 'activity', 'main'], ['Backen', '', 'activity', 'main'],
    ]);
    assertValid(h.saved());
    unmountAll();
  });

  test('runImport meldet einen Lesefehler übersetzt und hängt nichts an', async () => {
    const list = [{ instanceId: 'q1', moduleId: 'sipoc', phase: 'define', title: 'Pizza' }];
    const h = await mount('af-1', plain(PLAIN), { list, readError: new Error('unknown_instance') });
    h.vm().openImport();
    await settle();
    const warn = console.warn;
    console.warn = () => {};
    let n;
    try { n = await h.vm().runImport(); } finally { console.warn = warn; }
    assertEqual(n, 0);
    assertEqual(h.steps().length, 2);
    assertDeepEqual(h.notes.at(-1), [tr('importFailed'), 'error']);
    unmountAll();
  });

  test('Zwei Instanzen: je eigenes Layout (Merker je Model), getrennte Stände und Radio-Namen', async () => {
    const a = await mount('af-1', plain(small('s1')));
    const b = await mount('af-2', plain(PLAIN), { keep: true });
    assertEqual(a.bands().length, 2);
    assertEqual(b.bands().length, 0);
    assertTrue(b.q('.af__canvas').classList.contains('af__canvas--plain'), 'zweite Instanz mit Beschriftungsspalte');
    assertEqual(b.card('p2').getAttribute('style'), 'grid-row: 1; grid-column: 2');
    assertTrue(a.q('.af__tail[data-band-id="no:d1"]').classList.contains('af__tail--back'), 'Rücksprung der ersten Instanz fehlt');
    await a.click(a.card('s3').querySelector('[data-action="insert-step"]'));
    await a.click(a.card('s3').querySelector('[data-insert="activity"]'));
    await until(() => a.ids().length === 5);
    assertEqual(b.ids().length, 2);
    assertEqual(b.inst.historyCan('undo'), false);
    assertTrue(a.inst.historyStep('undo'), 'Rückgängig ohne Wirkung');
    await until(() => a.ids().length === 4);
    assertEqual(b.vm().fieldId('import-pick'), 'af-import-pick-af-2');
    assertEqual(a.vm().fieldId('import-pick'), 'af-import-pick-af-1');
    unmountAll();
  });

  test('exports.tree() ist toJsonTree des Models (expanded aus dem Ansichtsfeld)', async () => {
    await prepare();
    const h = await mount('af-1', plain(FIXTURE.moduleStates[INSTANCE_A]));
    const ui = h.vm()._ui;
    assertTrue(ui.exports !== null, 'exports fehlt');
    const tree = ui.exports.tree.call(ui.component);
    assertDeepEqual(tree, toJsonTree(h.vm().model));
    assertEqual(ui.exports.fileName, ID);
    assertEqual(tree.steps[0].expanded, true);
    assertEqual(tree.steps.filter((s) => s.expanded).length, 1);
    unmountAll();
  });

  test('Textfelder wie die Altform: zwei Zeilen Grundhöhe, ein langer Titel und eine lange Frage wachsen (field-sizing)', async () => {
    for (const [key, path] of [['flowchart', 'js/core/flowchart/flowchart.css'], [ID, `js/modules/${ID}/resources/style.css`]]) {
      if (document.querySelector(`style[data-test-css="${key}"]`)) continue;
      const css = document.createElement('style');
      css.dataset.testCss = key;
      css.textContent = await (await fetch(new URL(`../../../${path}`, import.meta.url), { cache: 'no-cache' })).text();
      document.head.append(css);
    }
    const h = await mount('af-1', plain(small()));
    // Breite der Altform: ein Textfeld ohne `cols` ist 20 Zeichen breit.
    const ref = document.createElement('textarea');
    ref.className = 'fc-card__title';
    ref.style.flex = 'none';
    h.card('s1').querySelector('.fc-card__header').append(ref);
    const refWidth = ref.getBoundingClientRect().width;
    ref.remove();
    const titleEl = /** @type {HTMLTextAreaElement} */ (h.q('.af__step[data-step-id="s1"] .af__step-title'));
    const minWidth = parseFloat(getComputedStyle(titleEl).minWidth);
    assertTrue(Math.abs(minWidth - refWidth) < 1.5, `Mindestbreite ${minWidth}px, Altform ${refWidth}px`);
    for (const sel of ['.af__step[data-step-id="s1"] .af__step-title', '.af__step[data-step-id="d1"] .af__decision-label']) {
      const el = /** @type {HTMLTextAreaElement} */ (h.q(sel));
      const line = parseFloat(getComputedStyle(el).lineHeight);
      assertTrue(line > 0, `line-height ${line}`);
      const short = el.getBoundingClientRect().height;
      assertTrue(short >= 2 * line - 1, `${sel}: ${short}px, erwartet ≥ ${2 * line}px`);
      el.value = 'Ein recht langer Text, der sicher über mehrere Zeilen des schmalen Feldes umbricht und weiter';
      await settle();
      assertTrue(el.getBoundingClientRect().height > short + line / 2, `${sel} wächst nicht`);
      assertTrue(el.getBoundingClientRect().width < 300, `${sel} wächst in die Breite`);
    }
    unmountAll();
  });
});
