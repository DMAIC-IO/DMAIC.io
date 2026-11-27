/**
 * Kano: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem echten
 * Modul, der echten Vorlage, einem Nachbau von `ctx.instances` (Bäume in der
 * Leseform des Baum-Moduls) und einem Fake-chartManager. Prüft das Lesen der
 * Bäume samt Broadcasts, die Heilung auf den einzigen Baum, den Lauf
 * `applySync` und seine Sperre, Baum- und Ebenenwahl (Rückfrage, Abbruch,
 * Rückgängig), Reiter mit Umbenennen und Löschen, Antworten, Auswertung,
 * Diagramm samt altem Editor-Eintrag ohne Verlaufsschritt und zwei
 * Instanzen.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import Alpine from '../../../vendor/alpinejs/csp.js';
import { registerCommandDirectives } from '../../../js/core/command-directives.js';
import { registerFieldDirective } from '../../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../../js/core/widget-directive.js';
import { registerTablistDirective } from '../../../js/core/tablist.js';
import { registerAsyncTaskDirectives } from '../../../js/core/async-task-directives.js';
import { WIDGETS } from '../../../js/widgets/registry.js';
import { WIDGET_I18N } from '../../widget-i18n.js';
import { formatNumber } from '../../../js/core/number-format.js';
import { withStoredWorksheetReader } from '../../helpers/worksheet-reader.js';
import { runExport } from '../../../js/core/exporter.js';
import mod from '../../../js/modules/kano/viewmodel/viewmodel.js';

const ID = 'kano';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const INST = 'kano-1';
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
/** Wartet, bis `ok()` gilt; höchstens zwei Sekunden. @param {() => boolean} ok */
async function until(ok) {
  for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
}
/** @type {HTMLElement[]} */
const mounted = [];
let prepared = false;
/** @type {any} */
let UI = null;

/** Text des Moduls mit `{name}` gefüllt; sonst der Schlüssel. */
function tr(key, params) {
  const v = key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), UI);
  if (typeof v !== 'string') return key;
  return v.replace(/\{(\w+)\}/g, (_, k) => (params && k in params ? String(params[k]) : `{${k}}`));
}

async function prepare() {
  if (!prepared) {
    registerTablistDirective(Alpine);
    registerCommandDirectives(Alpine);
    registerFieldDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
    registerWidgetDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
    registerAsyncTaskDirectives(Alpine, { i18n: { t: (k, p) => (p ? `${k}${JSON.stringify(p)}` : k) } });
    if (!Alpine.version) Alpine.start();
    UI = await (await fetch(new URL(`../../../js/modules/${ID}/resources/i18n/ui.de.json`, import.meta.url), { cache: 'no-cache' })).json();
    prepared = true;
  }
  if (document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) return;
  const html = await (await fetch(new URL(`../../../${TPL_KEY}`, import.meta.url), { cache: 'no-cache' })).text();
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', TPL_KEY);
  tpl.innerHTML = html;
  document.body.append(tpl);
}

function unmountAll() {
  while (mounted.length) {
    const old = mounted.pop();
    Alpine.destroyTree(old);
    old.remove();
  }
}

/** Ein Baum in der Leseform: eine Stimme mit Bedürfnissen (und je einem Treiber). */
const treeOf = (vocText, needs) => ({
  vocs: [{ id: 'v1', text: vocText, needs: needs.map(([id, text]) => ({ id, text, drivers: [{ id: `${id}-d`, text: `${text} T`, requirements: [] }] })) }],
});

/**
 * Eine Projektwelt mit Bus und Bäumen, geteilt von allen Instanzen eines Tests.
 * @param {Record<string, any>} [trees] instanceId → Leseform
 */
function world(trees = {}) {
  const handlers = [];
  const bus = {
    on: (n, fn) => handlers.push([n, fn]),
    off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
    emit: (n, p) => { for (const [a, f] of [...handlers]) if (a === n) f(p); },
  };
  const reads = [];
  return {
    bus,
    trees,
    reads,
    handlers,
    instances: {
      list: ({ modules } = {}) => (modules && !modules.includes('voc-ctx-tree') ? []
        : Object.keys(trees).map((instanceId) => ({ instanceId, moduleId: 'voc-ctx-tree', phase: 'define', title: '' }))),
      read: async (id, opts) => {
        reads.push([id, opts]);
        if (!trees[id]) throw Object.assign(new Error('unknown_instance'), { code: 'unknown_instance' });
        return JSON.parse(JSON.stringify(trees[id]));
      },
      interact: async () => ({ ok: false, results: [] }),
    },
  };
}

/**
 * Modul einhängen.
 * @param {object|null} model gespeicherter Stand
 * @param {{ inst?: string, keep?: boolean, w?: any, confirm?: boolean, chartEdits?: Record<string, any> }} [opts]
 */
async function mount(model, { inst = INST, keep = false, w = world(), confirm = true, chartEdits = {} } = {}) {
  await prepare();
  if (!keep) unmountAll();
  const states = { [inst]: model };
  /** @type {any[]} */
  const charts = [];
  const asked = [];
  const notes = [];
  const chartManager = {
    create: async (el, type, config) => { const c = { el, type, config: { ...config } }; charts.push(c); return c; },
    update: (chart, config) => { Object.assign(chart.config, config); },
    destroy: (chart) => { const i = charts.indexOf(chart); if (i >= 0) charts.splice(i, 1); },
  };
  const context = {
    instanceId: inst,
    instances: w.instances,
    stateManager: withStoredWorksheetReader({
      getModuleState: (id) => states[id] ?? null,
      setModuleState: (id, s) => { states[id] = s; },
      getProjectCycle: () => 'dmaic',
      get: (path) => ({ phases: { define: [] }, 'phases.define': [] })[path],
      getChartEdits: (i, key) => chartEdits[i]?.[key] ?? null,
      setChartEdit: (i, key, k, v) => {
        const e = chartEdits[i]?.[key];
        if (!e) return;
        if (v === null) delete e[k]; else e[k] = v;
      },
    }),
    i18n: { t: (k, p) => (k.startsWith(`modules.${ID}.`) ? tr(k.slice(ID.length + 9), p) : k), tf: () => tr, getLanguage: () => 'de' },
    eventBus: w.bus,
    chartManager,
    notify: (...a) => notes.push(a),
    dialog: { confirm: async (o) => { asked.push(o); return confirm; } },
    theme: 'light',
    language: 'de',
  };
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container);
  await mod.init(container, context);
  await settle();
  return {
    states, charts, chartEdits, container, asked, notes, w,
    vm: () => Alpine.$data(container.querySelector('[x-data]')),
    q: (sel) => container.querySelector(sel),
    qa: (sel) => [...container.querySelectorAll(sel)],
  };
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const text = (el) => el.textContent.trim();
const shown = (el) => el.style.display !== 'none';
/** Ein Auswahlfeld wie der Nutzer ändern. */
function choose(el, value) {
  if (!el) throw new Error('Feld fehlt');
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
const V = { _schema: { version: '1.0' } };
/** Gespeicherter Stand mit Merkmalen und Befragten. */
const filled = (over = {}) => ({
  ...V,
  source: { instanceId: 't1', level: 'need' },
  options: { importance: true },
  items: [
    { id: 'i1', nodeId: 'n1', label: 'Schnell', path: 'Stimme', missing: false },
    { id: 'i2', nodeId: 'n2', label: 'Günstig', path: 'Stimme', missing: false },
  ],
  respondents: [{ id: 'r1', name: 'Ada' }, { id: 'r2', name: 'Ben' }],
  answers: { r1: { i1: { f: 1, d: 5, w: 9 }, i2: { f: 4, d: 3, w: null } } },
  activeRespondentId: 'r1',
  ...over,
});

suite('kano: Viewmodel im Browser', () => {
  test('ohne Baum: Hinweis, nur „keine“ in der Auswahl, Übernehmen gesperrt mit Grund', async () => {
    const h = await mount(null);
    await until(() => shown(h.q('.dmike-infobox')));
    assertEqual(text(h.q('.dmike-infobox')), tr('sourceNone'));
    assertEqual(h.qa('[data-ref="treeSelect"] option').length, 1);
    const btn = h.q('[data-ref="syncBtn"]');
    assertTrue(btn.disabled);
    assertEqual(btn.title, tr('sourceNone'));
    assertEqual(text(h.q('[data-ref="syncStatus"]')), '');
    assertTrue(shown(h.q('.kano__hint')), 'Hinweis „keine Merkmale“');
    assertEqual(h.charts.length, 0);
    assertEqual(btn.getAttribute('data-help-key'), 'modules.kano.asyncTasks.applySync.help');
  });

  test('einziger Baum: Heilung beim Lesen, Übernahme speichert Verknüpfung und Merkmale in einem Schritt', async () => {
    const w = world({ t1: treeOf('Lieferung', [['n1', 'Schnell'], ['n2', 'Günstig']]) });
    const h = await mount(null, { w });
    const vm = h.vm();
    await until(() => h.qa('[data-ref="treeSelect"] option').length === 2);
    assertEqual(vm.sourceId, 't1');
    assertEqual(vm.model.source.instanceId, null, 'Heilung speichert nicht');
    assertEqual(h.q('[data-ref="treeSelect"]').value, 't1');
    assertEqual(text(h.qa('[data-ref="treeSelect"] option')[1]), 'Lieferung');
    await until(() => !h.q('[data-ref="syncBtn"]').disabled);
    assertEqual(text(h.q('[data-ref="syncStatus"]')), tr('syncPending', { added: 2, renamed: 0, missing: 0 }));
    assertEqual(mod.historyCan('undo'), false);
    h.q('[data-ref="syncBtn"]').click();
    await until(() => vm.model.items.length === 2);
    await until(() => !h.q('.kano__sync').hasAttribute('data-async-task-running'));
    assertEqual(vm.model.source.instanceId, 't1');
    assertDeepEqual(vm.model.items.map((i) => [i.nodeId, i.label, i.path]), [['n1', 'Schnell', 'Lieferung'], ['n2', 'Günstig', 'Lieferung']]);
    await until(() => text(h.q('[data-ref="syncStatus"]')) === tr('syncClean'));
    assertTrue(h.q('[data-ref="syncBtn"]').disabled);
    assertEqual(h.q('[data-ref="syncBtn"]').title, tr('syncClean'));
    assertTrue(h.w.reads.some(([id, o]) => id === 't1' && o.fields[0] === 'vocs'));
    assertTrue(mod.historyStep('undo'));
    await until(() => vm.model.items.length === 0);
    assertEqual(vm.model.source.instanceId, null);
    assertEqual(mod.historyCan('undo'), false, 'ein Schritt');
  });

  test('Baum ändert sich: data:changed zieht Status nach, module:removed zeigt Hinweis und sourceHint', async () => {
    const w = world({ t1: treeOf('Lieferung', [['n1', 'Schnell'], ['n2', 'Günstig']]) });
    const h = await mount(filled(), { w });
    const vm = h.vm();
    await until(() => vm.state.trees.length === 1);
    // Die Pfade der gespeicherten Merkmale („Stimme“) weichen vom Baum ab.
    await until(() => text(h.q('[data-ref="syncStatus"]')) === tr('syncPending', { added: 0, renamed: 2, missing: 0 }));
    w.trees.t1 = treeOf('Stimme', [['n1', 'Schnell'], ['n2', 'Günstig'], ['n3', 'Neu']]);
    w.bus.emit('data:changed', 'module:fremd');
    await settle();
    assertEqual(vm.state.trees[0].name, 'Lieferung', 'fremde Instanz liest nicht neu');
    w.bus.emit('data:changed', 'module:t1');
    await until(() => text(h.q('[data-ref="syncStatus"]')) === tr('syncPending', { added: 1, renamed: 0, missing: 0 }));
    delete w.trees.t1;
    w.bus.emit('module:removed', { instanceId: 't1', moduleId: 'voc-ctx-tree' });
    await until(() => shown(h.q('.dmike-infobox')));
    assertEqual(vm.model.source.instanceId, 't1', 'Verknüpfung bleibt gespeichert');
    assertEqual(h.qa('[data-ref="treeSelect"] option').length, 1);
    assertEqual(vm.read({ fields: ['sourceHint'] }).sourceHint, tr('sourceHint.unknownTree'));
    assertEqual(text(h.q('[data-ref="syncStatus"]')), tr('sourceHint.unknownTree'));
  });

  test('zwei Bäume, verknüpfter gelöscht: Knopf gesperrt mit Grund „Baum fehlt“, Statuszeile nennt ihn', async () => {
    const w = world({
      t1: treeOf('Lieferung', [['n1', 'Schnell'], ['n2', 'Günstig']]),
      t2: treeOf('Service', [['m1', 'Freundlich']]),
    });
    const h = await mount(filled(), { w });
    const vm = h.vm();
    await until(() => vm.state.trees.length === 2);
    await until(() => text(h.q('[data-ref="syncStatus"]')) === tr('syncPending', { added: 0, renamed: 2, missing: 0 }));
    delete w.trees.t1;
    w.bus.emit('module:removed', { instanceId: 't1', moduleId: 'voc-ctx-tree' });
    await until(() => vm.state.trees.length === 1);
    assertEqual(vm.sourceId, 't1', 'Verknüpfung bleibt gespeichert');
    assertEqual(vm.activeTree, null);
    assertTrue(!shown(h.q('.dmike-infobox')), 'ein Baum ist noch da');
    await until(() => text(h.q('[data-ref="syncStatus"]')) === tr('sourceHint.unknownTree'));
    const btn = h.q('[data-ref="syncBtn"]');
    assertTrue(btn.disabled);
    assertEqual(btn.title, tr('sourceHint.unknownTree'));
  });

  test('Baumwahl „keine“: Verknüpfung gelöst, Heilung gesperrt, losgelöst-Hinweis', async () => {
    const w = world({ t1: treeOf('Lieferung', [['n1', 'Schnell']]) });
    const h = await mount(filled(), { w });
    const vm = h.vm();
    await until(() => h.qa('[data-ref="treeSelect"] option').length === 2);
    assertEqual(h.q('[data-ref="treeSelect"]').value, 't1');
    choose(h.q('[data-ref="treeSelect"]'), '');
    await settle();
    assertEqual(vm.model.source.instanceId, null);
    assertTrue(vm.state.unlinked);
    assertEqual(vm.sourceId, null);
    await until(() => shown(h.q('[data-ref="detachedInfo"]')));
    assertEqual(text(h.q('[data-ref="syncStatus"]')), tr('syncDetached'));
    assertTrue(h.q('[data-ref="syncBtn"]').disabled);
    choose(h.q('[data-ref="treeSelect"]'), 't1');
    await settle();
    assertEqual(vm.model.source.instanceId, 't1');
    assertEqual(vm.state.unlinked, false);
  });

  test('Ebene: Rückfrage bei Antworten, Abbrechen lässt Feld und Daten, Bestätigen leert in einem Schritt', async () => {
    const no = await mount(filled(), { confirm: false });
    const sel = () => no.q('[data-ref="levelSelect"]');
    await until(() => sel().value === 'need');
    choose(sel(), 'driver');
    await until(() => no.asked.length === 1);
    await settle();
    assertEqual(no.vm().model.source.level, 'need');
    assertEqual(sel().value, 'need');
    assertEqual(no.vm().model.items.length, 2);
    assertEqual(no.asked[0].message, tr('confirm.setSourceLevel'));

    const yes = await mount(filled());
    const vm = yes.vm();
    choose(yes.q('[data-ref="levelSelect"]'), 'driver');
    await until(() => vm.model.items.length === 0);
    assertEqual(vm.model.source.level, 'driver');
    assertDeepEqual(plain(vm.model.answers), {});
    assertTrue(mod.historyStep('undo'));
    await until(() => vm.model.items.length === 2);
    assertEqual(vm.model.source.level, 'need');
    assertEqual(vm.model.answers.r1.i1.f, 1);
    await until(() => yes.q('[data-ref="levelSelect"]').value === 'need');

    // Ohne Antworten keine Rückfrage.
    const quiet = await mount(filled({ answers: {} }));
    choose(quiet.q('[data-ref="levelSelect"]'), 'req');
    await until(() => quiet.vm().model.source.level === 'req');
    assertEqual(quiet.asked.length, 0);
  });

  test('Reiter: anlegen mit Vorgabename, wählen über x-set, umbenennen, Esc, leer, löschen mit Rückfrage', async () => {
    const h = await mount(filled());
    const vm = h.vm();
    const tabs = () => h.qa('[role="tab"]');
    await until(() => tabs().length === 2);
    assertEqual(tabs()[0].getAttribute('aria-selected'), 'true');
    assertEqual(tabs()[0].getAttribute('tabindex'), '0');
    assertEqual(tabs()[1].getAttribute('tabindex'), '-1');
    assertTrue(tabs()[0].classList.contains('dmike-tab--active'));
    assertEqual(tabs()[1].title, `Ben — ${tr('respondentRenameHint')}`);
    assertEqual(h.q('[data-ref="respondentTabs"]').getAttribute('data-help-key'), '');
    tabs()[1].click();
    await until(() => vm.model.activeRespondentId === 'r2');
    await until(() => tabs()[1].getAttribute('aria-selected') === 'true');
    assertEqual(h.q('select[data-field="f"]').value, '', 'Ben ohne Antworten');

    h.q('[data-ref="addRespondent"]').click();
    await until(() => tabs().length === 3);
    assertEqual(vm.model.respondents[2].name, tr('respondentDefault', { n: 3 }));
    assertEqual(vm.model.activeRespondentId, 'r2', 'die aktive bleibt');

    tabs()[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => h.q('.kano__tab-rename-input') !== null);
    const input = h.q('.kano__tab-rename-input');
    await until(() => document.activeElement === input);
    assertEqual(input.value, 'Ada');
    const arrow = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    input.dispatchEvent(arrow);
    assertEqual(document.activeElement, input, 'Pfeiltaste bleibt im Feld');
    input.value = 'Ada Lovelace';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await until(() => h.q('.kano__tab-rename-input') === null);
    assertEqual(vm.model.respondents[0].name, 'Ada Lovelace');

    tabs()[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => h.q('.kano__tab-rename-input') !== null);
    h.q('.kano__tab-rename-input').value = 'Weg';
    h.q('.kano__tab-rename-input').dispatchEvent(new Event('input', { bubbles: true }));
    h.q('.kano__tab-rename-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await until(() => h.q('.kano__tab-rename-input') === null);
    assertEqual(vm.model.respondents[0].name, 'Ada Lovelace', 'Esc verwirft');

    tabs()[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => h.q('.kano__tab-rename-input') !== null);
    h.q('.kano__tab-rename-input').value = '   ';
    h.q('.kano__tab-rename-input').dispatchEvent(new Event('input', { bubbles: true }));
    h.q('.kano__tab-rename-input').dispatchEvent(new Event('blur'));
    await until(() => h.q('.kano__tab-rename-input') === null);
    assertEqual(vm.model.respondents[0].name, 'Ada Lovelace', 'leer lässt den alten Namen');

    // Löschen der aktiven: Rückfrage, die erste rückt nach.
    h.qa('.kano__tab-del-btn')[1].click();
    await until(() => vm.model.respondents.length === 2);
    assertEqual(h.asked.length, 1);
    assertEqual(h.asked[0].message, tr('confirm.removeRespondent'));
    assertEqual(vm.model.activeRespondentId, 'r1');
    assertEqual(h.qa('.kano__tab-del-btn')[0].getAttribute('data-confirm-delete'), null);
  });

  test('Reiter löschen: Abbrechen lässt die Befragte', async () => {
    const h = await mount(filled(), { confirm: false });
    await until(() => h.qa('.kano__tab-del-btn').length === 2);
    h.qa('.kano__tab-del-btn')[0].click();
    await until(() => h.asked.length === 1);
    await settle();
    assertEqual(h.vm().model.respondents.length, 2);
  });

  test('Antworten, Auswertung, Kennzahlen, Merkmal löschen; Wichtigkeit aus blendet Spalten aus', async () => {
    const h = await mount(filled());
    const vm = h.vm();
    await until(() => h.qa('.kano__capture tbody tr').length === 2);
    const row = (id) => h.q(`.kano__capture tr[data-item-id="${id}"]`);
    assertEqual(row('i1').querySelector('select[data-field="f"]').value, '1');
    assertEqual(row('i1').querySelector('select[data-field="w"]').value, '9');
    choose(row('i2').querySelector('select[data-field="w"]'), '7');
    await settle();
    assertEqual(vm.model.answers.r1.i2.w, 7);
    choose(row('i2').querySelector('select[data-field="w"]'), '');
    await settle();
    assertEqual(vm.model.answers.r1.i2.w, null);
    // Ben bekommt eine erste Antwort.
    h.qa('[role="tab"]')[1].click();
    await until(() => vm.model.activeRespondentId === 'r2');
    choose(row('i1').querySelector('select[data-field="f"]'), '5');
    await settle();
    assertDeepEqual(plain(vm.model.answers.r2.i1), { f: 5, d: null, w: null });

    const kpis = h.qa('[data-ref="kpis"] .dmike-kpi-value').map(text);
    assertEqual(kpis[0], '2');
    assertEqual(kpis[1], '2');
    assertEqual(kpis[2], `${Math.round(vm.result.totals.completeness * 100)} %`);
    const results = h.qa('.kano__result tbody tr');
    assertEqual(results.length, 2);
    const r1 = h.q('.kano__result tr[data-item-id="i1"]').querySelectorAll('td');
    assertEqual(text(r1[0]), 'Schnell');
    const ev = vm.result.rows.find((r) => r.itemId === 'i1');
    assertEqual(text(r1[8]), formatNumber(ev.cs, 'de', { decimals: 2 }));
    assertEqual(text(r1[10]), formatNumber(ev.importanceMean, 'de', { decimals: 1 }));

    const box = h.q('[data-ref="importanceToggle"]');
    box.checked = false;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => vm.model.options.importance === false);
    await until(() => !shown(h.q('.kano__capture thead th:nth-child(4)')));
    assertEqual(shown(h.q('.kano__result thead th:nth-child(11)')), false);

    row('i2').querySelector('.dmike-del-btn').click();
    await until(() => vm.model.items.length === 1);
    assertEqual(h.asked.length, 1, 'Kern fragt allgemein');
    assertEqual(vm.model.answers.r1.i2, undefined);
  });

  test('Diagramm: Widget mit Achsentexten, ohne Legende; alter Editor-Eintrag ohne Verlaufsschritt', async () => {
    const chartEdits = { [INST]: { scatter: { title: 'Alt Kano' } } };
    const h = await mount(filled(), { chartEdits });
    const vm = h.vm();
    await until(() => h.charts.length === 1);
    const c = h.charts[0];
    assertEqual(c.type, 'scatter');
    assertEqual(c.config.xLabel, tr('chartX'));
    assertEqual(c.config.showLegend, false);
    assertEqual(c.config.title, 'Alt Kano');
    assertEqual(c.config.series.length, vm.result.rows.filter((r) => r.cs !== null && r.ds !== null).length);
    assertEqual(vm.model.scatterEdits.title, 'Alt Kano');
    assertEqual(mod.historyCan('undo'), false);
    assertTrue(h.q('[data-ref="chart"]').classList.contains('kano__chart'));
  });

  test('XLSX: ein Blatt „Kano“ wie die Altform; ohne Merkmale keine Datei, keine Meldung', async () => {
    const h = await mount(filled());
    /** @type {any[]} */
    const books = [];
    const XLSX = {
      utils: { book_new: () => ({ sheets: [] }), aoa_to_sheet: (rows) => rows, book_append_sheet: (wb, rows, name) => wb.sheets.push(name) },
      writeFile: (wb, name) => books.push({ name, sheets: wb.sheets }),
    };
    const io = { downloadFile() {}, downloadBlob() {}, ensureXLSX: async () => XLSX };
    await runExport(h.vm()._ui, 'xlsx', io);
    assertDeepEqual(books, [{ name: 'kano.xlsx', sheets: ['Kano'] }]);
    h.vm().model.setItems({ items: [] });
    await settle();
    const notes = h.notes.length;
    await runExport(h.vm()._ui, 'xlsx', io);
    assertEqual(books.length, 1);
    assertEqual(h.notes.length, notes);
    unmountAll();
  });

  test('zwei Instanzen: Reiter, Umbenennen und Bäume je Instanz', async () => {
    const w = world({ t1: treeOf('Lieferung', [['n1', 'Schnell']]) });
    const a = await mount(filled(), { inst: 'a', w });
    const b = await mount(filled(), { inst: 'b', w, keep: true });
    await until(() => a.qa('[role="tab"]').length === 2 && b.qa('[role="tab"]').length === 2);
    a.qa('[role="tab"]')[1].click();
    await until(() => a.vm().model.activeRespondentId === 'r2');
    assertEqual(b.vm().model.activeRespondentId, 'r1');
    b.qa('[role="tab"]')[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await until(() => b.q('.kano__tab-rename-input') !== null);
    assertEqual(a.q('.kano__tab-rename-input'), null);
    b.q('.kano__tab-rename-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await until(() => b.q('.kano__tab-rename-input') === null);
    choose(a.q('[data-ref="treeSelect"]'), '');
    await settle();
    assertEqual(a.vm().state.unlinked, true);
    assertEqual(b.vm().state.unlinked, false);
    // Beide hören den Broadcast, nach dem Abbau keiner mehr.
    const before = w.reads.length;
    w.bus.emit('module:added', { instanceId: 't2', moduleId: 'voc-ctx-tree' });
    await settle();
    assertEqual(w.reads.length - before, 2);
    unmountAll();
    assertEqual(w.handlers.length, 0, 'abgemeldet');
  });
});
