/**
 * Verlaufsdiagramm: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem
 * echten Modul und der echten Vorlage, einem Fake-stateManager mit
 * Arbeitsblatt und einem Fake-chartManager. Prüft die Getter, das α-Feld,
 * die Zählung „eine Engine-Ausführung je Spaltenwechsel, keine je α-Wechsel“,
 * Rückgängig, den Fall „referenzierte Spalte gelöscht“ und das Altprojekt mit
 * der Übernahme alter chartEdits beim Einhängen.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/run-chart/viewmodel/viewmodel.js';
import { State } from '../../js/modules/run-chart/domain/model.js';
import { engineRuns } from '../../js/modules/run-chart/domain/analyze.js';
import { setFields } from '../../js/core/model.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import { withStoredWorksheetReader } from '../helpers/worksheet-reader.js';

const ID = 'run-chart';
const INST = 'rc-1';
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

/** Spalte „Durchmesser“ der Altprojekt-Fixture (n = 24). */
const D = [
  9.96, 9.98, 10.01, 10.03, 10, 10.02, 10.04, 10.05, 10.03, 10.06, 10.08, 10.07,
  10.36, 10.38, 10.41, 10.43, 10.4, 10.42, 10.44, 10.45, 10.43, 10.46, 10.48, 10.47,
];
/** Eine zweite Spalte gleicher Länge (Durchmesser rückwärts). */
const R = [...D].reverse();
const SHEET = (cols = [{ id: 'c0', name: 'Durchmesser', values: D }, { id: 'c1', name: 'Rückwärts', values: R }]) => ({
  sheets: [{
    id: 's1',
    state: { rowCount: Math.max(...cols.map((c) => c.values.length), 0), columns: cols.map((c) => ({ type: 'numeric', ...c, values: [...c.values] })) },
  }],
});
const REF = { instanceId: 'ws1', sheetId: 's1', columnId: 'c0' };
const REF2 = { instanceId: 'ws1', sheetId: 's1', columnId: 'c1' };
/** Gespeicherter Stand der neuen Form. */
const stored = (over = {}) => ({ ...new State().toJSON(), columnRef: REF, ...over });
/** Die Altform aus der Fixture `legacy-project.json` (ohne `_schema`). */
const LEGACY = { columnRef: REF, alpha: 0.1, exampleWorksheetId: null };

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
    states, charts, container, chartEdits,
    vm: () => Alpine.$data(container.querySelector('[x-data]')),
    /** Die Konfiguration, die das Diagramm zuletzt zeigt. */
    shown: () => charts.at(-1)?.config ?? null,
    q: (sel) => container.querySelector(sel),
    qa: (sel) => [...container.querySelectorAll(sel)],
  };
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const text = (el) => el.textContent.trim();
/** Alle Getter und die Lesefläche samt Punkten lesen, wie Vorlage und Agent es tun. */
const readAll = (vm) => {
  vm.read({ fields: ['points'] });
  void vm.result; void vm.points; void vm.kpi; void vm.testRows; void vm.plot; void vm.chartTitle; void vm.hasResult;
};

suite('run-chart: Viewmodel im Browser', () => {
  test('Ergebnis: KPI-Leiste, Testtafel, Kopfzeile und Diagramm', async () => {
    const h = await mount(stored({ alpha: 0.1 }));
    const vm = h.vm();
    assertTrue(vm.hasResult, 'kein Ergebnis');
    assertDeepEqual(plain(vm.kpi), {
      medianText: '10,2200', nText: 'n = 24', runsAbout: 2, runsUpDownText: tr('statRunsUpDown', { count: 12 }),
      flagged: 2, flaggedClass: 'dmike-kpi--bad', alphaText: 'α = 0,1',
    });
    assertDeepEqual(vm.testRows.map((r) => r.pText), ['< 0,0001', '1,0000', '0,0324', '0,9676']);
    assertDeepEqual(vm.testRows.map((r) => r.flagged), [true, false, true, false]);
    assertEqual(vm.chartTitle, tr('chartTitle', { col: 'Durchmesser' }));
    const a = vm.analysis;
    assertDeepEqual(plain(vm.plot), {
      title: '', showTitle: false, showLegend: false, xLabel: tr('xLabelSample'), yLabel: 'Durchmesser',
      values: D, median: a.median,
    });
    assertEqual(vm.legacyEditKey, 'run-chart');
    // Vorlage: drei Kacheln, Kopfzeile, ein Diagramm, vier Testzeilen mit zwei Warn-Icons.
    assertEqual(h.qa('[data-ref="stats-bar"] .dmike-kpi').length, 3);
    assertDeepEqual(h.qa('.dmike-kpi-value').map(text), ['10,2200', '2', '2']);
    assertDeepEqual(h.qa('.dmike-kpi-sub').map(text), ['n = 24', tr('statRunsUpDown', { count: 12 }), 'α = 0,1']);
    assertTrue(h.qa('.dmike-kpi')[2].classList.contains('dmike-kpi--bad'), 'Klasse der dritten Kachel');
    assertEqual(text(h.q('.run-chart__chart-title')), tr('chartTitle', { col: 'Durchmesser' }));
    assertEqual(h.charts.length, 1);
    assertEqual(h.charts[0].type, 'run-chart');
    assertEqual(h.charts[0].el.closest('[data-ref="plot"]') !== null, true);
    assertEqual(h.shown().yLabel, 'Durchmesser');
    assertEqual(h.shown().showTitle, false);
    assertEqual(h.qa('.run-chart__test-row').length, 4);
    assertDeepEqual(h.qa('.run-chart__test-pvalue').map(text), ['< 0,0001', '1,0000', '0,0324', '0,9676']);
    assertEqual(h.qa('.run-chart__test-status [data-icon="status.warning"]').length, 2);
    assertEqual(h.qa('.run-chart__test-status--bad').length, 2);
    assertDeepEqual(h.qa('.run-chart__test-name strong').map(text), [tr('test_clustering'), tr('test_mixtures'), tr('test_trends'), tr('test_oscillation')]);
    // α-Feld: Text mit Dezimalkomma, ohne Bereichsattribute.
    const alpha = h.q('[data-ref="alpha"]');
    assertEqual(alpha.value, '0,1');
    assertEqual(alpha.type, 'text');
    assertEqual(alpha.getAttribute('inputmode'), 'decimal');
    assertTrue(!alpha.hasAttribute('min') && !alpha.hasAttribute('max') && !alpha.hasAttribute('step'), 'Bereichsattribute am α-Feld');
    // Lesefläche: dieselben Zahlen.
    const out = vm.read({ fields: ['points'] });
    assertEqual(out.result.n, 24);
    assertEqual(out.result.flagged, 2);
    assertEqual(out.points.length, 24);
    assertDeepEqual(plain(out.points[0]), { value: 9.96 });
    assertDeepEqual(plain(out.activeColumnSlots), ['columnRef']);
    assertDeepEqual(plain(out.activeParams), ['alpha']);
  });

  test('ohne Spalte: alles leer, kein Diagramm', async () => {
    const h = await mount(stored({ columnRef: null }));
    const vm = h.vm();
    assertEqual(vm.hasResult, false);
    assertEqual(vm.kpi, null);
    assertDeepEqual(vm.testRows, []);
    assertEqual(vm.plot, null);
    assertEqual(vm.result, null);
    assertEqual(h.q('.dmike-kpi-strip'), null);
    assertEqual(h.q('[data-ref="plot"]'), null);
    assertEqual(h.q('.run-chart__tests-panel'), null);
    assertEqual(h.charts.length, 0);
  });

  test('unter drei Zahlen: leere Ausgabe, kein Ergebnis', async () => {
    const h = await mount(stored(), { sheet: SHEET([{ id: 'c0', name: 'Kurz', values: [1, '2,5', null, 4] }]) });
    const vm = h.vm();
    assertEqual(vm.hasResult, false);
    assertEqual(vm.result, null);
    assertDeepEqual(plain(vm.points), []);
    assertEqual(h.q('.dmike-kpi-strip'), null);
  });

  test('Zählung: ein Spaltenwechsel ruft die Engine einmal, ein α-Wechsel gar nicht', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    readAll(vm);
    await settle();
    let before = engineRuns();
    setFields(vm.model, { columnRef: REF2 });
    await settle();
    readAll(vm);
    await settle();
    assertEqual(engineRuns() - before, 1, 'Engine-Ausführungen je Spaltenwechsel');
    assertEqual(vm.chartTitle, tr('chartTitle', { col: 'Rückwärts' }));
    assertEqual(h.shown().yLabel, 'Rückwärts');
    // Über den Wähler (dieselbe Senke).
    before = engineRuns();
    const sel = h.q('[data-ref="col-picker-wrap"] select');
    sel.value = [...sel.options].find((o) => o.textContent.includes('Durchmesser')).value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    readAll(vm);
    await settle();
    assertDeepEqual(plain(vm.model.columnRef), REF);
    assertEqual(engineRuns() - before, 1, 'Engine-Ausführungen je Spaltenwechsel über den Wähler');
    // α über das Feld: neue Bewertung ohne neue Rechnung.
    before = engineRuns();
    const alpha = h.q('[data-ref="alpha"]');
    alpha.value = '0,1';
    alpha.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    readAll(vm);
    await settle();
    assertEqual(vm.model.alpha, 0.1);
    assertEqual(engineRuns() - before, 0, 'Engine-Ausführungen je α-Wechsel');
    assertEqual(vm.kpi.alphaText, 'α = 0,1');
    assertEqual(vm.kpi.flagged, 2);
    assertEqual(vm.result.flagged, 2);
    setFields(vm.model, { alpha: 0.001 });
    await settle();
    readAll(vm);
    assertEqual(engineRuns() - before, 0, 'Engine-Ausführungen je α-Wechsel über instance.set');
    assertEqual(vm.kpi.flagged, 1);
    assertEqual(text(h.qa('.dmike-kpi-value')[2]), '1');
    assertEqual(h.qa('.run-chart__test-status [data-icon="status.warning"]').length, 1);
  });

  test('α-Feld lehnt Werte außerhalb von (0, 1) ab und springt zurück', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    const alpha = h.q('[data-ref="alpha"]');
    for (const raw of ['0', '1', '1,5', '-0,1']) {
      alpha.value = raw;
      alpha.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
      assertEqual(vm.model.alpha, 0.05, `${raw} angenommen`);
      assertEqual(alpha.getAttribute('aria-invalid'), 'true', `${raw} nicht markiert`);
      assertEqual(alpha.value, '0,05', `${raw}: kein Rücksprung`);
    }
    alpha.value = '0,01';
    alpha.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    assertEqual(vm.model.alpha, 0.01);
    assertTrue(alpha.getAttribute('aria-invalid') !== 'true', 'gültiger Wert noch markiert');
  });

  test('Rückgängig: α ändern, zurücknehmen, wiederholen möglich', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertEqual(mod.historyCan('undo'), false);
    const alpha = h.q('[data-ref="alpha"]');
    alpha.value = '0,2';
    alpha.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    assertEqual(vm.model.alpha, 0.2);
    assertEqual(h.states[INST].alpha, 0.2);
    assertTrue(mod.historyStep('undo'), 'kein Schritt zum Zurücknehmen');
    await settle();
    assertEqual(vm.model.alpha, 0.05);
    assertEqual(alpha.value, '0,05');
    assertEqual(vm.kpi.alphaText, 'α = 0,05');
    assertEqual(mod.historyCan('undo'), false);
    assertTrue(mod.historyCan('redo'), 'kein Schritt zum Wiederholen');
  });

  test('referenzierte Spalte gelöscht: Bezug bleibt, leere Ausgabe, result null, points leer, kein Wurf', async () => {
    const sheet = SHEET();
    sheet.sheets[0].state.columns.splice(0, 1);
    const h = await mount(stored(), { sheet });
    const vm = h.vm();
    assertDeepEqual(plain(vm.model.columnRef), REF);
    assertEqual(vm.hasResult, false);
    assertEqual(vm.result, null);
    assertDeepEqual(plain(vm.points), []);
    assertEqual(vm.plot, null);
    assertDeepEqual(vm.testRows, []);
    const out = vm.read({ fields: ['points'] });
    assertEqual(out.result, null);
    assertDeepEqual(plain(out.points), []);
    assertEqual(h.q('.dmike-kpi-strip'), null);
    assertEqual(h.q('[data-ref="plot"]'), null);
    assertEqual(h.q('.run-chart__tests-panel'), null);
  });

  test('Altprojekt: Migration, chartEdits gewinnen über die Konfiguration, Alteintrag gelöscht, kein Verlaufsschritt', async () => {
    const chartEdits = { [INST]: { 'run-chart': { title: 'Legacy', showTitle: true, bgColor: '#eef6ff', yLabel: 'Messwert (mm)' } } };
    const h = await mount(plain(LEGACY), { chartEdits });
    const vm = h.vm();
    assertEqual(vm.model.alpha, 0.1);
    assertEqual(vm.model.chart.title, 'Legacy');
    assertEqual(vm.model.chart.showTitle, true);
    assertEqual(vm.model.chart.bgColor, '#eef6ff');
    assertEqual(vm.model.chart.yLabel, 'Messwert (mm)');
    assertEqual(Object.keys(h.chartEdits[INST]['run-chart']).length, 0, 'Alteintrag nicht gelöscht');
    // Die Konfiguration des Moduls sagt title '', showTitle false und den Spaltennamen; der Alteintrag gewinnt.
    assertEqual(vm.plot.title, '');
    assertEqual(vm.plot.yLabel, 'Durchmesser');
    assertEqual(h.shown().title, 'Legacy');
    assertEqual(h.shown().showTitle, true);
    assertEqual(h.shown().bgColor, '#eef6ff');
    assertEqual(h.shown().yLabel, 'Messwert (mm)');
    assertEqual(h.charts.length, 1, 'mehr als ein Diagramm');
    assertEqual(text(h.q('.run-chart__chart-title')), tr('chartTitle', { col: 'Durchmesser' }));
    assertEqual(h.q('[data-ref="alpha"]').value, '0,1');
    assertEqual(vm.kpi.alphaText, 'α = 0,1');
    assertEqual(vm.kpi.flagged, 2);
    assertEqual(mod.historyCan('undo'), false);
  });
});
