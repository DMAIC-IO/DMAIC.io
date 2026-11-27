/**
 * Attributtest: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem
 * echten Modul, der echten Vorlage und einem Arbeitsblatt im Fake-
 * stateManager. Prüft Testart/Eingabeart über `x-set`, Felder über
 * `x-field`, Tafelzellen über die Handler (Kommando, Ablehnung, Leeren),
 * Entfernen bei MIN_DIM, den Ereigniswert (wirksamer Wert, Wahl schreibt),
 * die Anzeige in der App-Sprache, Rückgängig/Wiederholen, das Altprojekt
 * ohne Verlaufsschritt, die gelöschte Spalte und zwei Instanzen.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual, fakeChartManager } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerCommandDirectives } from '../../js/core/command-directives.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { setFields } from '../../js/core/model.js';
import { withStoredWorksheetReader } from '../helpers/worksheet-reader.js';
import mod from '../../js/modules/attribute-test/viewmodel/viewmodel.js';

const ID = 'attribute-test';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const WS = 'ws1';
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
/** Rückfragen des Dialogs seit dem letzten Einhängen. */
let confirms = 0;

/** Text des Moduls mit `{name}` gefüllt; sonst der Schlüssel. */
function tr(key, params) {
  const v = key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), UI);
  if (typeof v !== 'string') return key;
  return v.replace(/\{(\w+)\}/g, (_, k) => (params && k in params ? String(params[k]) : `{${k}}`));
}

async function prepare() {
  if (!prepared) {
    registerCommandDirectives(Alpine);
    registerFieldDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
    registerWidgetDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
    if (!Alpine.version) Alpine.start();
    UI = await (await fetch(new URL(`../../js/modules/${ID}/resources/i18n/ui.de.json`, import.meta.url), { cache: 'no-cache' })).json();
    prepared = true;
  }
  // Eine Seite mit eigener Vorlage (CSP-Sonde) behält sie.
  if (document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) return;
  const html = await (await fetch(new URL(`../../${TPL_KEY}`, import.meta.url), { cache: 'no-cache' })).text();
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', TPL_KEY);
  tpl.innerHTML = html;
  document.body.append(tpl);
}

/** Das Arbeitsblatt des Altprojekts (Task 0). */
const sheet = () => ({
  sheets: [{
    id: 'sheet_1', name: 'Prüfung',
    state: {
      rowCount: 12,
      columns: [
        { id: 'col_at_vorher', name: 'Vorher', shortName: 'C1', type: 'text', values: ['i.O.', 'i.O.', 'i.O.', 'i.O.', 'n.i.O.', 'n.i.O.', 'n.i.O.', 'n.i.O.', 'n.i.O.', 'n.i.O.', 'i.O.', 'n.i.O.'] },
        { id: 'col_at_nachher', name: 'Nachher', shortName: 'C2', type: 'text', values: ['i.O.', 'n.i.O.', 'i.O.', 'i.O.', 'i.O.', 'i.O.', 'i.O.', 'n.i.O.', 'i.O.', 'i.O.', 'i.O.', 'n.i.O.'] },
      ],
    },
  }],
  activeSheetId: 'sheet_1',
});
const ref = (columnId) => ({ instanceId: WS, sheetId: 'sheet_1', columnId });
const NO_REFS = { response: null, group: null, rowVar: null, colVar: null, counts: null, before: null, after: null };
const EMPTY_SUMMARY = {
  x: '', n: '', x1: '', n1: '', x2: '', n2: '', t: '', t1: '', t2: '', lambda0: '', diff0: '0',
  pairs: { labels: { before: '', after: '' }, counts: [['', ''], ['', '']] },
  table: { rows: ['A', 'B'], cols: ['X', 'Y'], counts: [['', ''], ['', '']] },
};
const LEGACY = {
  testKind: 'two', inputMode: 'summary', direction: 'two-sided', alpha: 0.05, p0: '0.5', pooled: false, ratePooled: false,
  equiv: { samples: 2, symmetric: true, delta: '', lower: '', upper: '' }, exposurePerRow: '1',
  summary: EMPTY_SUMMARY, colRefs: NO_REFS, eventValue: null, exampleWorksheetId: null,
};
/** Altprojekt (a): Zusammenhang 3 × 3. */
const LEGACY_A = {
  ...LEGACY, testKind: 'assoc', direction: 'less', alpha: 0.01,
  summary: { ...EMPTY_SUMMARY, table: { rows: ['Früh', 'Spät', 'Nacht'], cols: ['gut', 'Nacharbeit', 'Ausschuss'], counts: [['1 200', '40', '12'], ['980', '55', '20'], ['700', '80', '35']] } },
};
/** Altprojekt (b): McNemar über Spalten. */
const LEGACY_B = {
  ...LEGACY, testKind: 'mcnemar', inputMode: 'columns', alpha: null, p0: 'abc',
  summary: { ...EMPTY_SUMMARY, t1: '2,5' },
  colRefs: { ...NO_REFS, before: ref('col_at_vorher'), after: ref('col_at_nachher') }, eventValue: 'defekt',
};

/** Alle eingehängten Instanzen abbauen. */
function unmountAll() {
  while (mounted.length) {
    const old = mounted.pop();
    Alpine.destroyTree(old);
    old.remove();
  }
}

/**
 * Modul einhängen; das Arbeitsblatt liegt unter `ws1`.
 * @param {object|null} model @param {{ inst?: string, keep?: boolean, ws?: any }} [opts]
 */
async function mount(model, { inst = 'at-1', keep = false, ws = sheet() } = {}) {
  await prepare();
  if (!keep) unmountAll();
  confirms = 0;
  const states = { [inst]: model, [WS]: ws };
  const handlers = [];
  const bus = {
    on: (n, fn) => handlers.push([n, fn]),
    off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
    emit: (n, p) => { for (const [a, f] of [...handlers]) if (a === n) f(p); },
  };
  installWorksheetRevisions(bus);
  const phases = { data: [{ instanceId: WS, moduleId: 'worksheet' }] };
  const context = {
    instanceId: inst,
    instances: { list: () => [], read: async () => ({}), interact: async () => ({ ok: false, results: [] }) },
    stateManager: withStoredWorksheetReader({
      getModuleState: (id) => states[id] ?? null,
      setModuleState: (id, s) => { states[id] = s; },
      getProjectCycle: () => 'dmaic',
      get: (path) => ({ phases, 'phases.data': phases.data, 'settings.confidenceLevel': 95, 'settings.power': 80 })[path],
    }),
    i18n: { t: (k) => k, tf: () => tr, getLanguage: () => 'de' },
    eventBus: bus,
    chartManager: fakeChartManager(),
    notify: () => {},
    dialog: { confirm: async () => { confirms += 1; return true; } },
    theme: 'light',
    language: 'de',
  };
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container);
  await mod.init(container, context);
  await settle();
  return {
    states, container,
    vm: () => Alpine.$data(container.querySelector('[x-data]')),
    q: (sel) => container.querySelector(sel),
    qa: (sel) => [...container.querySelectorAll(sel)],
  };
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const text = (el) => el.textContent.trim();
/** Ein Eingabefeld wie der Nutzer ändern (`input` und `change`). */
function type(el, value) {
  if (!el) throw new Error('Feld fehlt');
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
const statValue = (h, key) => text(h.q(`[data-stat="${key}"] .attrtest__stat-value`));

suite('attribute-test: Viewmodel im Browser', () => {
  test('Altprojekt (b): Migration ohne Verlaufsschritt, wirksamer Ereigniswert, Bezeichnungen aus den Spalten', async () => {
    const h = await mount(plain(LEGACY_B));
    const vm = h.vm();
    assertEqual(mod.historyCan('undo'), false);
    assertEqual(vm.model.alpha, 0.05);
    assertEqual(vm.model.eventValue, 'defekt');
    await until(() => h.q('[data-ref="event"]') !== null && h.q('[data-stat="discordant"]') !== null);
    assertEqual(h.q('[data-ref="event"]').value, 'n.i.O.');
    assertEqual(statValue(h, 'discordant'), '5 / 1');
    assertTrue(h.qa('.attrtest__hypothesis').map(text)[0].includes('Vorher'));
    assertTrue(h.q('[data-ref="picker-before-wrap"]') !== null && h.q('[data-ref="picker-after-wrap"]') !== null);
    assertEqual(text(h.q('[data-ref="decision"] span')).includes('0,05'), true);
    // Wahl schreibt eventValue; ein Schritt.
    type(h.q('[data-ref="event"]'), 'i.O.');
    await settle();
    assertEqual(vm.model.eventValue, 'i.O.');
    assertEqual(statValue(h, 'discordant'), '1 / 5');
    assertTrue(mod.historyStep('undo'));
    await settle();
    assertEqual(vm.model.eventValue, 'defekt');
    assertEqual(h.q('[data-ref="event"]').value, 'n.i.O.');
  });

  test('Altprojekt (a): 3 × 3 mit 1200; Zelle tippen, „1,5“ abgelehnt, Leeren schreibt null', async () => {
    const h = await mount(plain(LEGACY_A));
    const vm = h.vm();
    assertEqual(mod.historyCan('undo'), false);
    await until(() => h.q('[data-cell="0-0"]') !== null);
    assertEqual(h.q('[data-cell="0-0"]').value, '1200');
    assertEqual(h.q('[data-row-name="0"]').value, 'Früh');
    assertEqual(h.q('[data-ref="alpha"]').value, '0,01');
    assertTrue(h.q('[data-ref="direction"]') === null, 'Richtung ohne 2 × 2');
    await until(() => h.q('[data-ref="result-table"]') !== null);
    assertEqual(text(h.q('[data-ref="result-table"] .attrtest__obs')), '1.200');
    // Zeichen für Zeichen wie die Tastatur: „1“, „1,“, „1,5“.
    for (const v of ['1', '1,', '1,5']) {
      type(h.q('[data-cell="1-1"]'), v);
      await settle();
    }
    assertEqual(vm.model.summary.table.counts[1][1], 1);
    assertEqual(h.q('[data-cell="1-1"]').value, '1,5');
    assertTrue(h.q('[data-cell="1-1"]').classList.contains('field--error'));
    type(h.q('[data-cell="1-1"]'), '60');
    await settle();
    assertEqual(vm.model.summary.table.counts[1][1], 60);
    assertTrue(!h.q('[data-cell="1-1"]').classList.contains('field--error'));
    type(h.q('[data-cell="1-1"]'), '');
    await settle();
    assertEqual(vm.model.summary.table.counts[1][1], null);
    await until(() => h.q('[data-ref="message"]').textContent.trim() !== '');
    assertEqual(vm.hasResult, false);
    assertTrue(mod.historyStep('undo'));
    await settle();
    assertEqual(vm.model.summary.table.counts[1][1], 60);
    assertEqual(h.q('[data-cell="1-1"]').value, '60');
    type(h.q('[data-row-name="2"]'), 'Nachtschicht');
    await settle();
    assertEqual(vm.model.summary.table.rows[2], 'Nachtschicht');
  });

  test('Entfernen: fragt, nimmt die Spalte, bei zwei Spalten gesperrt; Agent lehnt ab', async () => {
    const h = await mount(plain(LEGACY_A));
    const vm = h.vm();
    await until(() => h.qa('th .attrtest__remove').length === 6);
    const colButtons = () => h.qa('thead .attrtest__remove');
    assertEqual(colButtons()[0].disabled, false);
    colButtons()[0].click();
    await until(() => vm.model.summary.table.cols.length === 2);
    assertEqual(confirms, 1, 'genau eine Rückfrage');
    assertDeepEqual(plain(vm.model.summary.table.cols), ['Nacharbeit', 'Ausschuss']);
    await until(() => colButtons().length === 2 && colButtons().every((b) => b.disabled));
    let err = null;
    try { vm.model.removeCol({ col: 0 }); } catch (e) { err = e; }
    assertEqual(err?.param, 'col');
    h.q('[data-ref="add-col"]').click();
    await until(() => vm.model.summary.table.cols.length === 3);
    await until(() => colButtons().length === 3 && !colButtons()[0].disabled);
  });

  test('Testart über die drei Gruppen eines x-set; Stichproben und Grenzen als Zahl/Wahrheitswert', async () => {
    const h = await mount(null);
    const vm = h.vm();
    assertEqual(vm.model.testKind, 'two');
    h.q('[data-kind="rate2"]').click();
    await until(() => h.q('[data-ref="diff0"]') !== null);
    assertEqual(vm.model.testKind, 'rate2');
    const checked = () => h.qa('[data-kind]').filter((b) => b.getAttribute('aria-checked') === 'true').map((b) => b.dataset.kind);
    assertDeepEqual(checked(), ['rate2']);
    assertDeepEqual(h.qa('[data-kind].btn--active').map((b) => b.dataset.kind), ['rate2']);
    h.q('[data-kind="equiv"]').click();
    await until(() => h.q('[data-ref="equiv-samples"]') !== null);
    h.q('[data-samples="1"]').click();
    await until(() => h.q('[data-ref="p0"]') !== null);
    assertEqual(vm.model.equiv.samples, 1);
    h.q('[data-bounds="asymmetric"]').click();
    await until(() => h.q('[data-ref="lower"]') !== null);
    assertEqual(vm.model.equiv.symmetric, false);
    type(h.q('[data-ref="lower"]'), '-1,5');
    await settle();
    assertEqual(vm.model.equiv.lower, -1.5);
  });

  test('Spaltenmodus: Wähler je Rolle; Wechsel der Testart lässt die Wahl stehen', async () => {
    const h = await mount(null);
    const vm = h.vm();
    setFields(vm.model, { testKind: 'one', inputMode: 'columns', colRefs: { ...NO_REFS, response: ref('col_at_vorher') } });
    await until(() => h.q('[data-ref="picker-response-wrap"]') !== null && h.q('[data-stat="counts"]') !== null);
    assertEqual(h.q('[data-ref="event"]').value, 'n.i.O.');
    assertEqual(statValue(h, 'counts'), '7 / 12');
    h.q('[data-kind="mcnemar"]').click();
    await until(() => h.q('[data-ref="picker-before-wrap"]') !== null);
    assertTrue(h.q('[data-ref="picker-response-wrap"]') === null);
    h.q('[data-kind="one"]').click();
    await until(() => h.q('[data-ref="picker-response-wrap"]') !== null);
    assertDeepEqual(plain(vm.model.colRefs.response), ref('col_at_vorher'));
    // Agent schreibt die Spalten als Ganzes; Rückgängig stellt zurück.
    setFields(vm.model, { colRefs: { ...plain(vm.model.colRefs), response: ref('col_at_nachher') } });
    await until(() => statValue(h, 'counts') === '3 / 12');
    assertTrue(mod.historyStep('undo'));
    await until(() => statValue(h, 'counts') === '7 / 12');
    assertDeepEqual(plain(vm.model.colRefs.response), ref('col_at_vorher'));
  });

  test('referenzierte Spalte gelöscht: Bezug bleibt, Hinweis, keine Rechnung', async () => {
    const ws = sheet();
    ws.sheets[0].state.columns = ws.sheets[0].state.columns.filter((c) => c.id !== 'col_at_nachher');
    const h = await mount(plain(LEGACY_B), { ws });
    const vm = h.vm();
    await until(() => text(h.q('[data-ref="message"]')) !== '');
    assertEqual(vm.hasResult, false);
    assertEqual(text(h.q('[data-ref="message"]')), tr('hintPickColumns'));
    assertDeepEqual(plain(vm.model.colRefs.after), ref('col_at_nachher'));
  });

  test('Anzeige in der App-Sprache: Zählungen gruppiert, Intervalle [a; b]', async () => {
    const h = await mount(null);
    const vm = h.vm();
    setFields(vm.model, { summary: { ...plain(vm.model.summary), x1: 46, n1: 1200, x2: 21, n2: 1150 } });
    await until(() => h.q('[data-stat="counts1"]') !== null);
    assertEqual(statValue(h, 'counts1'), '46 / 1.200');
    assertTrue(/^\[-?\d+,\d+; -?\d+,\d+\]$/.test(statValue(h, 'ci')), statValue(h, 'ci'));
    assertEqual(vm.result.stats.find((s) => s.key === 'counts1').value, '46 / 1200');
    assertEqual(h.q('[data-ref="n1"]').value, '1200');
  });

  test('zwei Instanzen: jede schreibt und zeigt nur ihr Model', async () => {
    const a = await mount(null, { inst: 'at-a' });
    const b = await mount(null, { inst: 'at-b', keep: true });
    b.q('[data-kind="assoc"]').click();
    await until(() => b.q('[data-ref="table-editor"]') !== null);
    assertEqual(a.vm().model.testKind, 'two');
    assertTrue(a.q('[data-ref="table-editor"]') === null);
    const on = (h) => h.qa('[data-kind]').filter((x) => x.getAttribute('aria-checked') === 'true').map((x) => x.dataset.kind);
    assertDeepEqual(on(a), ['two']);
    assertDeepEqual(on(b), ['assoc']);
    type(b.q('[data-cell="0-0"]'), '4');
    await settle();
    assertEqual(b.vm().model.summary.table.counts[0][0], 4);
    assertEqual(a.vm().model.summary.table.counts[0][0], null);
  });
});
