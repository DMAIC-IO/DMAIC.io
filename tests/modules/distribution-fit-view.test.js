/**
 * Verteilungstest: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem
 * echten Modul und der echten Vorlage, einem Fake-stateManager mit
 * Arbeitsblatt und einem Fake-chartManager. Prüft die Getter, den Datentyp
 * über die Knopfgruppe und instance.set, die Zählung „eine Engine-Ausführung
 * je Änderung“, den Klappzustand der Normalitätsanalyse, die Fehlertexte, den
 * Fall „referenzierte Spalte gelöscht“ und das Altprojekt mit der Übernahme
 * alter chartEdits beim Einhängen.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/distribution-fit/viewmodel/viewmodel.js';
import { State } from '../../js/modules/distribution-fit/domain/model.js';
import { engineRuns } from '../../js/modules/distribution-fit/domain/analyze.js';
import { setFields } from '../../js/core/model.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import { withStoredWorksheetReader } from '../helpers/worksheet-reader.js';

const ID = 'distribution-fit';
const INST = 'df-1';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
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
    registerFieldDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
    registerWidgetDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
    if (!Alpine.version) Alpine.start();
    UI = await (await fetch(new URL(`../../js/modules/${ID}/resources/i18n/ui.de.json`, import.meta.url), { cache: 'no-cache' })).json();
    prepared = true;
  }
  // Andere Tests legen unter demselben Schlüssel womöglich ein schlankes Gerüst ab: hier immer die echte Vorlage.
  const html = await (await fetch(new URL(`../../${TPL_KEY}`, import.meta.url), { cache: 'no-cache' })).text();
  let tpl = document.querySelector(`template[data-tpl="${TPL_KEY}"]`);
  if (!tpl) {
    tpl = document.createElement('template');
    tpl.setAttribute('data-tpl', TPL_KEY);
    document.body.append(tpl);
  }
  tpl.innerHTML = html;
}

/** Spalte „Fehler“ der Altprojekt-Fixture (n = 30 Ganzzahlen 0…9). */
const VALUES = [3, 5, 2, 4, 6, 3, 1, 4, 5, 2, 7, 3, 4, 0, 5, 3, 2, 6, 4, 3, 8, 2, 4, 5, 3, 1, 4, 9, 3, 5];
const SHEET = (values = VALUES) => ({
  sheets: [{
    id: 's1',
    state: { rowCount: values.length, columns: [{ id: 'c0', name: 'Fehler', type: 'numeric', values: [...values] }] },
  }],
});
const REF = { instanceId: 'ws1', sheetId: 's1', columnId: 'c0' };
/** Gespeicherter Stand der neuen Form. */
const stored = (over = {}) => ({ ...new State().toJSON(), columnRef: REF, ...over });
/** Die Altform aus der Fixture `legacy-project.json` (ohne `_schema`). */
const LEGACY = { columnRef: REF, dataType: 'discrete', exampleWorksheetId: null };

/**
 * Modul mit Fake-Diensten einhängen; das Arbeitsblatt liegt unter `ws1`.
 * @param {object|null} model gespeicherter Zustand der Instanz
 * @param {{ sheet?: any, chartEdits?: Record<string, any> }} [opts]
 */
async function mount(model, { sheet = SHEET(), chartEdits = {} } = {}) {
  await prepare();
  while (mounted.length) {
    const old = mounted.pop();
    Alpine.destroyTree(old);
    old.remove();
  }
  const states = { [INST]: model, ws1: sheet };
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
    destroy: () => {},
  };
  /** @type {any[][]} */
  const notes = [];
  const context = {
    instanceId: INST,
    instances: { list: () => [], read: async () => ({}), interact: async () => ({ ok: false, results: [] }) },
    stateManager: withStoredWorksheetReader({
      getModuleState: (id) => states[id] ?? null,
      setModuleState: (id, s) => { states[id] = s; },
      getProjectCycle: () => 'dmaic',
      get: (path) => (path === 'phases' ? { data: [{ instanceId: 'ws1', moduleId: 'worksheet' }] } : undefined),
      getChartEdits: (inst, key) => chartEdits[inst]?.[key] ?? null,
      setChartEdit: (inst, key, k, v) => {
        const e = chartEdits[inst]?.[key];
        if (!e) return;
        if (v === null) delete e[k]; else e[k] = v;
      },
    }),
    i18n: { t: (k) => k, tf: () => tr, getLanguage: () => 'de' },
    eventBus: bus,
    chartManager,
    notify: (...args) => { notes.push(args); },
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
    states, charts, container, chartEdits, notes,
    vm: () => Alpine.$data(container.querySelector('[x-data]')),
    /** Die Konfiguration, die das Diagramm zuletzt zeigt. */
    shown: () => charts.at(-1)?.config ?? null,
    q: (sel) => container.querySelector(sel),
    qa: (sel) => [...container.querySelectorAll(sel)],
  };
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const text = (el) => el.textContent.trim();
const shownEl = (el) => !!el && el.style.display !== 'none';

suite('distribution-fit: Viewmodel im Browser', () => {
  test('Ergebnis: Kennwerte, Rangliste, Histogramm, Normalitätskarten mit Lab-Knopf über das Widget', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertTrue(vm.hasResult, 'kein Ergebnis');
    assertEqual(vm.errorText, '');
    assertDeepEqual(vm.kpiCells.map((c) => c.value), ['30', '3,8667', '2,0297', '4,0000', '0,5650', '0,5206', '0,0000', '9,0000']);
    assertEqual(vm.kpiCells[0].help, 'modules.distribution-fit.types.DescStats.n');
    assertDeepEqual(vm.rankRows.map((r) => r.name).sort(),
      ['Binomial', 'Exponential', 'Gamma', 'Log-Normal', 'Normal', 'Poisson', 'Weibull'], 'auto bei Ganzzahlen: stetig und diskret');
    assertDeepEqual(vm.rankRows.map((r) => r.isBest), [true, false, false, false, false, false, false]);
    assertDeepEqual(plain(vm.histogram), {
      title: tr('histogram'), data: VALUES, showNormalCurve: true,
      barColor: 'var(--color-chart-1)', normalCurveColor: 'var(--color-chart-2)', showLegend: false,
    });
    assertEqual(vm.legacyEditKey, 'histogram');
    assertEqual(h.charts.length, 1);
    assertEqual(h.charts[0].type, 'histogram');
    assertEqual(h.shown().title, tr('histogram'));
    assertEqual(h.qa('.dmike-kpi').length, 8);
    assertEqual(h.qa('.distfit__table-wrap tbody tr').length, 7);
    assertEqual(h.qa('.distfit__detail-tile').length, 7);
    assertEqual(vm.nddCards.length, 4);
    assertDeepEqual(h.qa('.distfit__ndd-card .dmike-algo-link').map((b) => b.dataset.algoId),
      ['shapiro-wilk', 'anderson-darling', 'jarque-bera', 'dagostino-pearson']);
    assertEqual(h.qa('.distfit__ndd-algo-link').length, 0);
    assertEqual(text(h.q('.distfit__ndd-score-label')), vm.nddConsensus.scoreLabel);
    assertEqual(text(h.q('.distfit__ndd-card .distfit__ndd-row span')), `${tr('nddStatistic')} (W)`);
    assertTrue(!shownEl(h.q('[data-ref="placeholder"]')), 'Platzhalter sichtbar');
    assertTrue(shownEl(h.q('[data-ref="results"]')), 'Ergebnis verborgen');
    assertTrue(!shownEl(h.q('[data-ref="error-box"]')), 'Fehlerkasten sichtbar');
    // Die Lesefläche nennt dasselbe Ergebnis.
    const out = vm.read();
    assertEqual(out.result.stats.n, 30);
    assertDeepEqual(out.result.results.map((f) => f.name), vm.rankRows.map((r) => r.name));
    assertDeepEqual(plain(out.activeColumnSlots), ['columnRef']);
  });

  test('Datentyp über die Knopfgruppe: ein Verlaufsschritt, aktiver Knopf, genau eine Engine-Ausführung', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertEqual(mod.historyCan('undo'), false);
    assertDeepEqual(h.qa('.distfit__toggle-btn.btn--active').map((b) => b.dataset.dtype), ['auto']);
    const before = engineRuns();
    h.q('.distfit__toggle-btn[data-dtype="discrete"]').click();
    await settle();
    // Lesefläche, Ergebnis und alle Getter danach lesen: keine weitere Rechnung.
    vm.read();
    void vm.result; void vm.kpiCells; void vm.rankRows; void vm.detailTiles; void vm.nddCards; void vm.histogram;
    await settle();
    assertEqual(engineRuns() - before, 1, 'Engine-Ausführungen je Änderung');
    assertEqual(vm.model.dataType, 'discrete');
    assertDeepEqual(vm.rankRows.map((r) => r.name), ['Poisson', 'Binomial']);
    assertDeepEqual(h.qa('.distfit__toggle-btn.btn--active').map((b) => b.dataset.dtype), ['discrete']);
    assertEqual(h.states[INST].dataType, 'discrete');
    assertTrue(mod.historyStep('undo'), 'kein Schritt zum Zurücknehmen');
    await settle();
    assertEqual(vm.model.dataType, 'auto');
    assertEqual(mod.historyCan('undo'), false);
    assertEqual(h.qa('.distfit__table-wrap tbody tr').length, 7);
  });

  test('Datentyp über setFields (instance.set): Knopfgruppe zeigt ihn; Unbekanntes abgelehnt', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    setFields(vm.model, { dataType: 'continuous' });
    await settle();
    assertDeepEqual(h.qa('.distfit__toggle-btn.btn--active').map((b) => b.dataset.dtype), ['continuous']);
    assertEqual(vm.rankRows.length, 5);
    let err = null;
    try { setFields(vm.model, { dataType: 'normal' }); } catch (e) { err = e; }
    assertTrue(err instanceof Error, 'abgelehnt');
    assertEqual(vm.model.dataType, 'continuous');
  });

  test('Klappzustand: toggleNdd schaltet den UI-State, kein Verlaufsschritt, bleibt beim Neurechnen', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertEqual(vm.state.nddCollapsed, false);
    assertEqual(h.q('.distfit__ndd-toggle .icon').dataset.icon, 'nav.collapse-up');
    h.q('[data-action="toggle-ndd"]').click();
    await settle();
    assertEqual(vm.state.nddCollapsed, true);
    assertTrue(h.q('[data-ref="ndd-body"]').classList.contains('distfit__ndd-body--collapsed'), 'Körper nicht zugeklappt');
    assertEqual(h.q('[data-action="toggle-ndd"]').title, tr('nddExpand'));
    assertEqual(mod.historyCan('undo'), false);
    assertEqual(h.states[INST].nddCollapsed, undefined, 'UI-State gespeichert');
    vm.model.dataType = 'continuous';
    await settle();
    assertEqual(vm.state.nddCollapsed, true, 'Neurechnen klappt wieder auf');
    assertTrue(h.q('[data-ref="ndd-body"]').classList.contains('distfit__ndd-body--collapsed'), 'Körper nach Neurechnen offen');
    vm.toggleNdd();
    await settle();
    assertEqual(vm.state.nddCollapsed, false);
    assertEqual(h.q('[data-action="toggle-ndd"]').title, tr('nddCollapse'));
  });

  test('Fehlertexte: unter fünf Zahlen, ohne Streuung; ohne Spalte kein Fehler', async () => {
    const few = await mount(stored(), { sheet: SHEET([1, 2, '2,5', null, 4]) });
    assertEqual(few.vm().hasResult, false);
    assertEqual(few.vm().errorText, tr('errMin5'));
    assertEqual(text(few.q('[data-ref="error-box"]')), tr('errMin5'));
    assertTrue(shownEl(few.q('[data-ref="error-box"]')), 'Fehlerkasten verborgen');
    assertTrue(shownEl(few.q('[data-ref="placeholder"]')), 'Platzhalter verborgen');
    assertEqual(few.vm().result, null);
    const flat = await mount(stored(), { sheet: SHEET([2, 2, 2, 2, 2, 2]) });
    assertEqual(flat.vm().errorText, tr('errZeroVariance'));
    assertEqual(flat.vm().result, null);
    assertEqual(flat.vm().histogram, null);
    const none = await mount(stored({ columnRef: null }));
    assertEqual(none.vm().errorText, '');
    assertTrue(!shownEl(none.q('[data-ref="error-box"]')), 'Fehlerkasten ohne Spalte sichtbar');
    assertTrue(shownEl(none.q('[data-ref="placeholder"]')), 'Platzhalter verborgen');
  });

  test('referenzierte Spalte gelöscht: Bezug bleibt, kein Ergebnis, errMin5, kein Wurf', async () => {
    const sheet = SHEET();
    sheet.sheets[0].state.columns.splice(0, 1);
    const h = await mount(stored(), { sheet });
    const vm = h.vm();
    assertDeepEqual(plain(vm.model.columnRef), REF);
    assertEqual(vm.hasResult, false);
    assertEqual(vm.errorText, tr('errMin5'));
    assertEqual(vm.result, null);
    assertEqual(vm.histogram, null);
    assertDeepEqual(vm.rankRows, []);
    assertEqual(text(h.q('[data-ref="error-box"]')), tr('errMin5'));
    assertTrue(shownEl(h.q('[data-ref="placeholder"]')), 'Platzhalter verborgen');
    assertEqual(h.q('[data-ref="results"]').style.display, 'none');
    assertEqual(h.q('[data-ref="histogram"]'), null);
  });

  test('Altprojekt: Migration, chartEdits gewinnen, Alteintrag gelöscht, kein Verlaufsschritt', async () => {
    const chartEdits = { [INST]: { histogram: { title: 'Legacy', showLegend: true, bgColor: '#eef6ff', yLabel: 'Anzahl' } } };
    const h = await mount(plain(LEGACY), { chartEdits });
    const vm = h.vm();
    assertEqual(vm.model.dataType, 'discrete');
    assertEqual(vm.model.chart.title, 'Legacy');
    assertEqual(vm.model.chart.showLegend, true);
    assertEqual(vm.model.chart.bgColor, '#eef6ff');
    assertEqual(vm.model.chart.yLabel, 'Anzahl');
    assertEqual(Object.keys(h.chartEdits[INST].histogram).length, 0, 'Alteintrag nicht gelöscht');
    assertEqual(h.shown().title, 'Legacy');
    assertEqual(h.shown().showLegend, true);
    assertEqual(h.shown().bgColor, '#eef6ff');
    assertEqual(h.shown().yLabel, 'Anzahl');
    assertDeepEqual(vm.rankRows.map((r) => r.name), ['Poisson', 'Binomial']);
    assertDeepEqual(h.qa('.distfit__toggle-btn.btn--active').map((b) => b.dataset.dtype), ['discrete']);
    assertEqual(mod.historyCan('undo'), false);
  });
});
