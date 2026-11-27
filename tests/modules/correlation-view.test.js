/**
 * Korrelation: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem
 * echten Modul, der echten Vorlage, einem Arbeitsblatt im Fake-stateManager
 * und einem Fake-chartManager. Prüft den Spaltenwähler (Klickfolge), den
 * Konfidenz-Handler samt Ablehnung, Methode und Filter, Hover/Klick/Klappen,
 * Agent-`set` → Anzeige, Rückgängig, das Altprojekt ohne Verlaufsschritt
 * (samt alter chartEdits), zwei Instanzen und die gelöschte Spalte.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerCommandDirectives } from '../../js/core/command-directives.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { setFields } from '../../js/core/model.js';
import { withStoredWorksheetReader } from '../helpers/worksheet-reader.js';
import mod from '../../js/modules/correlation/viewmodel/viewmodel.js';

const ID = 'correlation';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const WS = 'ws1';
const INST = 'corr-1';
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

const X = [10, 12, 8, 15, 25, 20, 18, 22, 30, 28];
const Y = [20, 22, 18, 30, 45, 38, 35, 40, 55, 50];
const T = ['1:16', '1:19', '1:13', '1:22', '1:37', '1:31', null, '1:34', '1:46', '1:43'];
/** Das Arbeitsblatt des Altprojekts (Task 0). */
const sheet = () => ({
  sheets: [{
    id: 'sheet_corr', name: 'Messung',
    state: {
      rowCount: 10,
      columns: [
        { id: 'col_druck', name: 'Druck', shortName: 'C1', type: 'numeric', values: [...X] },
        { id: 'col_ausbeute', name: 'Ausbeute', shortName: 'C2', type: 'numeric', values: [...Y] },
        { id: 'col_dauer', name: 'Dauer', shortName: 'C3', type: 'time', values: [...T] },
        { id: 'col_probe_a', name: 'Probe A', shortName: 'C4', type: 'numeric', values: X.map((v, i) => (i < 5 ? v : null)) },
        { id: 'col_probe_b', name: 'Probe B', shortName: 'C5', type: 'numeric', values: Y.map((v, i) => (i >= 2 && i < 7 ? v : null)) },
      ],
    },
  }],
  activeSheetId: 'sheet_corr',
});
const ref = (columnId) => ({ instanceId: WS, sheetId: 'sheet_corr', columnId });
const keyOf = (columnId) => `${WS}|sheet_corr|${columnId}`;
/** Altprojekt (a): Altpaar, Konfidenz 0,9. */
const LEGACY_A = { colRefX: ref('col_druck'), colRefY: ref('col_ausbeute'), confidenceLevel: 0.9 };
/** Altprojekt (b): drei Spalten, Kendall, Filter, Konfidenz null, alte Ergebnisse. */
const LEGACY_B = {
  colRefs: [ref('col_druck'), ref('col_ausbeute'), ref('col_dauer')], confidenceLevel: null,
  matrixMethod: 'kendall', filterMinR: 0.3, filterMaxP: 0.05, exampleWorksheetId: null,
  result: { n: 3 }, matrixResult: { names: ['alt'] },
};

function unmountAll() {
  while (mounted.length) {
    const old = mounted.pop();
    Alpine.destroyTree(old);
    old.remove();
  }
}

/**
 * Modul einhängen; das Arbeitsblatt liegt unter `ws1`.
 * @param {object|null} model
 * @param {{ inst?: string, keep?: boolean, ws?: any, chartEdits?: Record<string, any>, noWorksheet?: boolean }} [opts]
 */
async function mount(model, { inst = INST, keep = false, ws = sheet(), chartEdits = {}, noWorksheet = false } = {}) {
  await prepare();
  if (!keep) unmountAll();
  const states = { [inst]: model, ...(noWorksheet ? {} : { [WS]: ws }) };
  const handlers = [];
  const bus = {
    on: (n, fn) => handlers.push([n, fn]),
    off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
    emit: (n, p) => { for (const [a, f] of [...handlers]) if (a === n) f(p); },
  };
  installWorksheetRevisions(bus);
  /** @type {any[]} */
  const charts = [];
  const chartManager = {
    create: async (el, type, config) => { const c = { el, type, config: { ...config } }; charts.push(c); return c; },
    update: (chart, config) => { Object.assign(chart.config, config); },
    destroy: (chart) => { const i = charts.indexOf(chart); if (i >= 0) charts.splice(i, 1); },
  };
  const phases = noWorksheet ? { data: [] } : { data: [{ instanceId: WS, moduleId: 'worksheet' }] };
  const context = {
    instanceId: inst,
    instances: { list: () => [], read: async () => ({}), interact: async () => ({ ok: false, results: [] }) },
    stateManager: withStoredWorksheetReader({
      getModuleState: (id) => states[id] ?? null,
      setModuleState: (id, s) => { states[id] = s; },
      getProjectCycle: () => 'dmaic',
      get: (path) => ({ phases, 'phases.data': phases.data, 'settings.confidenceLevel': 95, 'settings.power': 80 })[path],
      getChartEdits: (i, key) => chartEdits[i]?.[key] ?? null,
      setChartEdit: (i, key, k, v) => {
        const e = chartEdits[i]?.[key];
        if (!e) return;
        if (v === null) delete e[k]; else e[k] = v;
      },
    }),
    i18n: { t: (k) => k, tf: () => tr, getLanguage: () => 'de' },
    eventBus: bus,
    chartManager,
    notify: () => {},
    dialog: { confirm: async () => true },
    theme: 'light',
    language: 'de',
  };
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container);
  await mod.init(container, context);
  await settle();
  return {
    states, charts, chartEdits, container,
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
/** Ein Kästchen im Spaltenwähler umschalten. */
function toggleColumn(h, columnId) {
  const cb = h.q(`[data-ref="col-list"] input[data-col-key="${keyOf(columnId)}"]`);
  if (!cb) throw new Error(`Kästchen für ${columnId} fehlt`);
  cb.checked = !cb.checked;
  cb.dispatchEvent(new Event('change', { bubbles: true }));
}
const checkedKeys = (h) => h.qa('[data-ref="col-list"] input[type="checkbox"]').filter((c) => c.checked).map((c) => c.dataset.colKey);
const cell = (h, i, j) => h.q(`td[data-row="${i}"][data-col="${j}"]`);
const visiblePairs = (h) => h.qa('.corr__matrix-plot-card').filter((c) => c.style.display !== 'none').map((c) => c.dataset.pair);
/** Über die Matrix fahren bzw. klicken wie die Maus (Ereignis am inneren Element). */
function mouse(h, name, i, j) {
  const target = cell(h, i, j).querySelector('span') ?? cell(h, i, j);
  target.dispatchEvent(new MouseEvent(name, { bubbles: true }));
}

suite('correlation: Viewmodel im Browser', () => {
  test('ohne Arbeitsblatt: Hinweis, kein Wähler, Auswahlhinweis', async () => {
    const h = await mount(null, { noWorksheet: true });
    await until(() => h.q('.corr__hint') !== null);
    assertEqual(text(h.q('.corr__hint')), tr('noWorksheet'));
    assertEqual(h.q('[data-ref="col-list"]').style.display, 'none');
    assertEqual(text(h.q('[data-ref="selected-info"]')), tr('selectMinTwo'));
    assertEqual(h.q('[data-ref="conf-input"]').value, '95');
    assertEqual(h.q('[data-ref="error-box"]').style.display, 'none');
  });

  test('Wähler: Klickfolge wird Reihenfolge, Abwählen, Rückgängig; Agent-set erscheint; Doppelte abgelehnt', async () => {
    const h = await mount(null);
    const vm = h.vm();
    await until(() => h.qa('[data-ref="col-list"] input[type="checkbox"]').length === 5);
    toggleColumn(h, 'col_ausbeute');
    await settle();
    assertEqual(text(h.q('[data-ref="selected-info"]')), tr('selectOneMore'));
    toggleColumn(h, 'col_druck');
    await until(() => h.qa('.corr__card').length === 3);
    assertDeepEqual(plain(vm.model.colRefs), [ref('col_ausbeute'), ref('col_druck')]);
    assertEqual(vm.analysis.result._nameX, 'Ausbeute');
    assertEqual(text(h.q('[data-ref="selected-info"]')), tr('pairwiseMode'));
    await until(() => h.charts.length === 1);
    assertEqual(h.charts[0].config.xLabel, 'Ausbeute');
    toggleColumn(h, 'col_ausbeute');
    await until(() => h.qa('.corr__card').length === 0);
    assertDeepEqual(plain(vm.model.colRefs), [ref('col_druck')]);
    assertTrue(mod.historyStep('undo'));
    await until(() => h.qa('.corr__card').length === 3);
    assertDeepEqual(plain(vm.model.colRefs), [ref('col_ausbeute'), ref('col_druck')]);
    // Agent schreibt die Liste (wie instance.set).
    setFields(vm.model, { colRefs: [ref('col_druck'), ref('col_ausbeute'), ref('col_dauer')] });
    await until(() => h.q('.corr__matrix-table') !== null);
    assertDeepEqual(checkedKeys(h).sort(), [keyOf('col_ausbeute'), keyOf('col_dauer'), keyOf('col_druck')].sort());
    let err = null;
    try { setFields(vm.model, { colRefs: [ref('col_druck'), ref('col_druck')] }); } catch (e) { err = e; }
    assertTrue(err !== null && /uniqueColumnRefs/.test(String(err.message) + String(err.invariant)));
    assertEqual(vm.model.colRefs.length, 3);
  });

  test('Konfidenz: Prozent und Anteil, Ablehnung mit Rücksprung, gleicher Wert ohne Schritt', async () => {
    const h = await mount({ _schema: { version: '1.0' }, colRefs: [ref('col_druck'), ref('col_ausbeute')], confidenceLevel: 0.95 });
    const vm = h.vm();
    const input = () => h.q('[data-ref="conf-input"]');
    await until(() => h.qa('.corr__card').length === 3);
    type(input(), '97,5 %');
    await settle();
    assertEqual(vm.model.confidenceLevel, 0.975);
    assertEqual(input().value, '97,5');
    assertEqual(text(h.q('.corr__ci-label')), `${tr('confidenceInterval')} 97,5 %`);
    type(input(), '0,95');
    await settle();
    assertEqual(vm.model.confidenceLevel, 0.95);
    assertEqual(mod.historyCan('undo'), true);
    for (const bad of ['40', 'abc', '100']) {
      type(input(), bad);
      await settle();
      assertEqual(vm.model.confidenceLevel, 0.95, bad);
      assertEqual(input().value, '95', bad);
      assertTrue(input().classList.contains('field--error'), bad);
      assertEqual(input().getAttribute('aria-invalid'), 'true', bad);
    }
    type(input(), '95');
    await settle();
    assertTrue(!input().classList.contains('field--error'));
    assertTrue(mod.historyStep('undo'));
    await settle();
    assertEqual(vm.model.confidenceLevel, 0.975, 'gleicher Wert legte keinen Schritt an');
    // Enter verlässt das Feld.
    input().focus();
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assertTrue(document.activeElement !== input());
  });

  test('Matrix: Methode über x-set, Filter über x-field, Hover, Klick isoliert, Klappen; Filter nicht in read()', async () => {
    const h = await mount({ _schema: { version: '1.0' }, colRefs: [ref('col_druck'), ref('col_ausbeute'), ref('col_dauer')] });
    const vm = h.vm();
    await until(() => h.q('.corr__matrix-table') !== null && h.qa('.corr__matrix-plot-card').length === 3);
    await until(() => h.charts.length === 3);
    assertDeepEqual(h.qa('.corr__toggle-btn.btn--active').map((b) => b.dataset.method), ['pearson']);
    h.q('.corr__toggle-btn[data-method="kendall"]').click();
    await until(() => vm.model.matrixMethod === 'kendall');
    assertEqual(h.q('.corr__toggle-btn[data-method="kendall"]').getAttribute('aria-checked'), 'true');
    assertEqual(text(cell(h, 1, 0).querySelector('.corr__matrix-r')), '1,0000');
    // Hover-Kreuz.
    mouse(h, 'mouseover', 2, 1);
    await settle();
    assertTrue(cell(h, 2, 0).classList.contains('corr__matrix--highlight'));
    assertTrue(cell(h, 1, 1).classList.contains('corr__matrix--highlight'));
    assertTrue(!cell(h, 1, 0).classList.contains('corr__matrix--highlight'));
    h.q('.corr__matrix-table').dispatchEvent(new MouseEvent('mouseleave'));
    await settle();
    assertEqual(h.qa('.corr__matrix--highlight').length, 0);
    // Klick isoliert, zweiter Klick hebt auf.
    mouse(h, 'click', 2, 0);
    await settle();
    assertDeepEqual(visiblePairs(h), ['0-2']);
    assertTrue(cell(h, 2, 0).classList.contains('corr__matrix-cell--selected'));
    mouse(h, 'click', 2, 0);
    await settle();
    assertEqual(visiblePairs(h).length, 3);
    // Auswahl fällt beim Methodenwechsel.
    mouse(h, 'click', 1, 0);
    await settle();
    assertDeepEqual(visiblePairs(h), ['0-1']);
    h.q('.corr__toggle-btn[data-method="pearson"]').click();
    await until(() => visiblePairs(h).length === 3);
    // Klappen einzeln und alle.
    h.qa('[data-action="toggle-plot"]')[0].click();
    await settle();
    assertTrue(h.qa('.corr__matrix-plot-card')[0].classList.contains('corr__matrix-plot-card--collapsed'));
    h.q('[data-action="toggle-all-plots"]').click();
    await settle();
    assertEqual(h.qa('.corr__matrix-plot-card--collapsed').length, 3);
    assertEqual(text(h.q('[data-action="toggle-all-plots"]')), tr('expandAll'));
    // Filter: Text mit Komma, Ablehnung außerhalb [0; 1]; nicht in read().
    const before = JSON.stringify(vm.read());
    type(h.q('[data-ref="filter-min-r"]'), '0,999');
    await settle();
    assertEqual(vm.model.filterMinR, 0.999);
    assertTrue(h.qa('.corr__matrix-cell--dimmed').length > 0);
    assertEqual(JSON.stringify(vm.read()), before);
    assertTrue(!('filterMinR' in vm.read()));
    type(h.q('[data-ref="filter-min-r"]'), '2');
    await settle();
    assertEqual(vm.model.filterMinR, 0.999);
    type(h.q('[data-ref="filter-min-r"]'), '');
    await settle();
    assertEqual(vm.model.filterMinR, null);
    // Andere Spaltenwahl: der UI-State fällt.
    setFields(vm.model, { colRefs: [ref('col_dauer'), ref('col_ausbeute'), ref('col_druck')] });
    await until(() => h.qa('.corr__matrix-plot-card').length === 3);
    assertEqual(h.qa('.corr__matrix-plot-card--collapsed').length, 0);
    assertEqual(text(h.q('[data-action="toggle-all-plots"]')), tr('collapseAll'));
  });

  test('Altprojekt: Migration ohne Verlaufsschritt, chartEdits übernommen, Werte sichtbar', async () => {
    const chartEdits = { [INST]: { single: { title: 'Alt Streuung', showTitle: true } } };
    const h = await mount(plain(LEGACY_A), { chartEdits });
    const vm = h.vm();
    assertEqual(mod.historyCan('undo'), false);
    assertDeepEqual(plain(vm.model.colRefs), [ref('col_druck'), ref('col_ausbeute')]);
    assertEqual(vm.model.confidenceLevel, 0.9);
    assertEqual(vm.model.pairEdits.title, 'Alt Streuung');
    await until(() => h.qa('.corr__card').length === 3 && h.charts.length === 1);
    assertEqual(h.q('[data-ref="conf-input"]').value, '90');
    assertEqual(text(h.qa('.corr__big-r')[0]), '0,9967');
    assertEqual(h.charts[0].config.title, 'Alt Streuung');
    assertEqual(mod.historyCan('undo'), false);

    const edits = { [INST]: { 'pair:0-1': { title: 'Alt Paar', showTitle: true } } };
    const b = await mount(plain(LEGACY_B), { chartEdits: edits });
    const bvm = b.vm();
    assertEqual(mod.historyCan('undo'), false);
    assertEqual(bvm.model.confidenceLevel, 0.95);
    assertEqual(bvm.model.matrixMethod, 'kendall');
    assertEqual(bvm.model.filterMinR, 0.3);
    await until(() => b.q('.corr__matrix-table') !== null && b.charts.length > 0);
    assertEqual(b.q('[data-ref="filter-min-r"]').value, '0,3');
    assertEqual(b.q('[data-ref="filter-max-p"]').value, '0,05');
    assertEqual(bvm.model.matrixEdits['0-1']?.title, 'Alt Paar');
    await until(() => b.charts.some((c) => c.config.title === 'Alt Paar'));
    assertEqual(mod.historyCan('undo'), false);
  });

  test('gelöschte Spalte: Bezug bleibt, Meldung, kein Diagramm, keine Rechnung', async () => {
    const ws = sheet();
    ws.sheets[0].state.columns = ws.sheets[0].state.columns.filter((c) => c.id !== 'col_ausbeute');
    const h = await mount({ _schema: { version: '1.0' }, colRefs: [ref('col_druck'), ref('col_ausbeute'), ref('col_dauer')] }, { ws });
    const vm = h.vm();
    await until(() => text(h.q('[data-ref="error-box"]')) !== '');
    assertEqual(text(h.q('[data-ref="error-box"]')), tr('errColumnMissing'));
    assertEqual(vm.model.colRefs.length, 3);
    assertEqual(h.q('.corr__matrix-table'), null);
    assertEqual(h.qa('.corr__card').length, 0);
    assertEqual(h.charts.length, 0);
    assertEqual(vm.read().mode, 'none');
  });

  test('zu wenige Paare: Fehlerkasten bleibt stehen', async () => {
    const h = await mount({ _schema: { version: '1.0' }, colRefs: [ref('col_probe_a'), ref('col_probe_b')] });
    await until(() => text(h.q('[data-ref="error-box"]')) !== '');
    assertEqual(text(h.q('[data-ref="error-box"]')), tr('errMin4', { n: 3 }));
    assertEqual(h.qa('.corr__card').length, 0);
  });

  test('zwei Instanzen: Auswahl und Methode bleiben je Instanz', async () => {
    const a = await mount({ _schema: { version: '1.0' }, colRefs: [ref('col_druck'), ref('col_ausbeute'), ref('col_dauer')] }, { inst: 'a' });
    const b = await mount({ _schema: { version: '1.0' }, colRefs: [ref('col_druck'), ref('col_ausbeute'), ref('col_dauer')] }, { inst: 'b', keep: true });
    await until(() => a.q('.corr__matrix-table') !== null && b.q('.corr__matrix-table') !== null);
    a.q('.corr__toggle-btn[data-method="spearman"]').click();
    await until(() => a.vm().model.matrixMethod === 'spearman');
    assertEqual(b.vm().model.matrixMethod, 'pearson');
    mouse(a, 'click', 1, 0);
    await settle();
    assertDeepEqual(visiblePairs(a), ['0-1']);
    assertEqual(visiblePairs(b).length, 3);
  });
});
