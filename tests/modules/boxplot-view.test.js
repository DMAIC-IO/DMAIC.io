/**
 * Boxplot: das Viewmodel im Browser (viewmodel/viewmodel.js) mit
 * dem echten Modul und der echten Vorlage, einem Fake-stateManager mit
 * Arbeitsblatt und einem Fake-chartManager. Prüft Getter, Fehlertexte, den
 * Fall „referenzierte Spalte gelöscht“ und das Altprojekt mit der Übernahme
 * alter chartEdits beim Einhängen.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/boxplot/viewmodel/viewmodel.js';
import { State } from '../../js/modules/boxplot/domain/model.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import { withStoredWorksheetReader } from '../helpers/worksheet-reader.js';
import { storedSource } from '../helpers/stored-source.js';
import { evaluateDerived } from '../../js/core/derived.js';
import { CHART_COLORS } from '../../js/core/chart/chart-colors.js';

const ID = 'boxplot';
const INST = 'bp-1';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
const mounted = [];
let prepared = false;
let UI = null;

/** Text des Moduls mit `{name}` gefüllt; sonst der Schlüssel. */
function tr(key, params) {
  const v = UI?.[key];
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

/** Arbeitsblatt mit numerischen Spalten `c0`, `c1`, … namens „Spalte 0“, … */
const sheetWith = (...cols) => ({
  sheets: [{
    id: 's1',
    state: {
      rowCount: Math.max(0, ...cols.map((v) => v.length)),
      columns: cols.map((values, i) => ({ id: `c${i}`, name: `Spalte ${i}`, type: 'numeric', values })),
    },
  }],
});
const ref = (i) => ({ instanceId: 'ws1', sheetId: 's1', columnId: `c${i}` });
const SHEET = () => {
  const s = sheetWith([10, 12, 8, 15, 25], [20, 22, 18, 25, 35]);
  s.sheets[0].state.columns.push({ id: 'g', name: 'Gruppe', type: 'text', values: ['G1', 'G1', 'G1', 'G2', 'G2'] });
  return s;
};
const gref = { instanceId: 'ws1', sheetId: 's1', columnId: 'g' };
/** Gespeicherter Stand der neuen Form. */
const stored = (over = {}) => ({
  ...new State().toJSON(),
  datasets: [{ value: ref(0), group: null }],
  ...over,
});

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
    // Wie der echte Manager: das Diagramm trägt seine Konfiguration.
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
  };
}

/** Zeile der Datensätze. */
const row = (v, group = null) => ({ value: v === null ? null : ref(v), group });

suite('boxplot: Viewmodel im Browser', () => {
  test('eine Reihe: Konfiguration mit Titel, x-Achse, ohne Legende, ohne Modellschalter', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertTrue(vm.hasSeries, 'keine Box');
    assertEqual(vm.errorText, '');
    assertDeepEqual(JSON.parse(JSON.stringify(vm.boxChart)), {
      title: tr('chartTitle'), xLabel: tr('xLabel'), yLabel: '', showLegend: false, showYTicks: false,
      groups: [{ name: 'Spalte 0', values: [10, 12, 8, 15, 25] }],
    });
    assertEqual(vm.legacyEditKey, 'boxplot');
    assertEqual(h.charts.length, 1);
    assertEqual(h.charts[0].type, 'boxplot');
    assertEqual(h.container.querySelector('[data-ref="placeholder"]').style.display, 'none');
  });

  test('Gruppenspalte und zweite Reihe: drei Boxen, Legende an', async () => {
    const h = await mount(stored({ datasets: [row(0, gref), row(1)] }));
    const vm = h.vm();
    assertDeepEqual(vm.boxChart.groups.map((g) => g.name), ['Spalte 0 — G1', 'Spalte 0 — G2', 'Spalte 1']);
    assertEqual(vm.boxChart.showLegend, true);
    assertEqual(h.shown().showLegend, true);
  });

  test('ohne Wertespalte: keine Box, kein Fehlertext, leerer Platzhalter sichtbar', async () => {
    const h = await mount(stored({ datasets: [row(null)] }));
    const vm = h.vm();
    assertEqual(vm.hasSeries, false);
    assertEqual(vm.errorText, '');
    assertEqual(vm.boxChart, null);
    assertEqual(vm.stats, null);
    const ph = h.container.querySelector('[data-ref="placeholder"]');
    assertTrue(ph.style.display !== 'none', 'Platzhalter verborgen');
    assertEqual(ph.textContent.trim(), '');
    assertEqual(h.container.querySelector('[data-ref="chart-card"]'), null);
  });

  test('zu wenig Zahlen: übersetzter Fehlertext mit dem Spaltennamen, kein Diagramm, keine Tabelle', async () => {
    const h = await mount(stored(), { sheet: sheetWith([5, 'x', null]) });
    const vm = h.vm();
    assertEqual(vm.hasSeries, false);
    assertEqual(vm.errorText, tr('errTooFew', { col: 'Spalte 0' }));
    const box = h.container.querySelector('[data-ref="error-box"]');
    assertEqual(box.textContent, vm.errorText);
    assertTrue(box.style.display !== 'none', 'Fehlerkasten verborgen');
    assertEqual(h.container.querySelector('[data-ref="plot"]'), null);
    assertEqual(h.container.querySelector('[data-ref="stats-panel"]'), null);
  });

  test('Fehler verschwindet, sobald die Ursache behoben ist (kein Zeitgeber)', async () => {
    const h = await mount(stored({ datasets: [row(0, gref)] }), { sheet: (() => { const s = sheetWith([1, 2]); s.sheets[0].state.columns.push({ id: 'g', name: 'Gruppe', type: 'text', values: ['A', 'B'] }); return s; })() });
    const vm = h.vm();
    assertEqual(vm.errorText, tr('errNoData'));
    vm.model.datasets = [row(0)];
    await settle();
    assertEqual(vm.errorText, '');
    assertTrue(vm.hasSeries, 'keine Box nach der Korrektur');
    assertEqual(h.container.querySelector('[data-ref="error-box"]').style.display, 'none');
  });

  test('referenzierte Spalte gelöscht: Bezug bleibt im Model, keine Box, stats null, kein Wurf', async () => {
    const sheet = SHEET();
    sheet.sheets[0].state.columns.splice(0, 1);
    const h = await mount(stored(), { sheet });
    const vm = h.vm();
    assertDeepEqual(JSON.parse(JSON.stringify(vm.model.datasets[0].value)), ref(0));
    assertEqual(vm.hasSeries, false);
    assertEqual(vm.stats, null);
    assertEqual(vm.errorText, tr('errTooFew', { col: '?' }));
  });

  test('stats ist die Ableitung des Models; Tabelle mit Boxfarbe aus dem Editor, Lücke → Palette', async () => {
    const h = await mount(stored({ datasets: [row(0), row(1)] }));
    const vm = h.vm();
    const expected = evaluateDerived(State.fromJSON(stored({ datasets: [row(0), row(1)] })), storedSource({ ws1: SHEET() })).stats;
    assertDeepEqual(JSON.parse(JSON.stringify(vm.stats)), JSON.parse(JSON.stringify(expected)));
    assertEqual(vm.statsRows.length, 2);
    assertEqual(vm.statsRows[0].color, CHART_COLORS[0]);
    assertEqual(vm.statsRows[1].color, CHART_COLORS[1]);
    vm.model.chart = { boxColors: [null, '#123456'] };
    await settle();
    assertEqual(vm.statsRows[0].color, CHART_COLORS[0]);
    assertEqual(vm.statsRows[1].color, '#123456');
    assertEqual(h.shown().boxColors[1], '#123456');
  });

  test('Bezugslinie aus model.chart erreicht das Diagramm', async () => {
    const line = { dir: 'v', value: 14, label: 'Ziel' };
    const h = await mount(stored({ chart: { refLines: [line] } }));
    assertDeepEqual(JSON.parse(JSON.stringify(h.shown().refLines)), [line]);
  });

  test('Konfidenzniveau wirkt auf stats, Statistik-Schalter blendet die Tabelle aus', async () => {
    const h = await mount(stored({ confLevel: 90 }));
    const vm = h.vm();
    const ci90 = vm.stats[0].ci.mean;
    vm.model.confLevel = 99;
    await settle();
    assertTrue(vm.stats[0].ci.mean[0] < ci90[0], 'Intervall bei 99 % nicht breiter');
    const h2 = await mount(stored({ showStats: false }));
    assertEqual(h2.container.querySelector('[data-ref="stats-panel"]').style.display, 'none');
  });

  test('Altprojekt: chartEdits gewinnen über das Model (showOutliers), Alteintrag gelöscht, kein Verlaufsschritt', async () => {
    const legacy = {
      seriesRefs: [ref(0), ref(1)],
      groupRefs: [gref, null],
      showMean: false, showOutliers: false, showStats: true, confLevel: 90,
      refLines: [{ dir: 'v', value: 20, label: 'Ziel' }], refAreas: [], bgColor: '#fff8e1', boxColors: ['#aa3355'],
      exampleWorksheetId: null,
    };
    const h = await mount(legacy, { chartEdits: { [INST]: { boxplot: { title: 'Legacy', showOutliers: true, boxHeight: 0.4 } } } });
    const vm = h.vm();
    assertDeepEqual(JSON.parse(JSON.stringify(vm.model.datasets)), [row(0, gref), row(1)]);
    assertEqual(vm.model.chart.showOutliers, true);
    assertEqual(vm.model.chart.showMean, false);
    assertEqual(vm.model.chart.title, 'Legacy');
    assertEqual(vm.model.chart.boxHeight, 0.4);
    assertEqual(vm.model.chart.bgColor, '#fff8e1');
    assertDeepEqual(JSON.parse(JSON.stringify(vm.model.chart.boxColors)), ['#aa3355']);
    assertDeepEqual(JSON.parse(JSON.stringify(vm.model.chart.refLines)), [{ dir: 'v', value: 20, label: 'Ziel' }]);
    assertEqual(vm.model.confLevel, 90);
    assertEqual(Object.keys(h.chartEdits[INST].boxplot).length, 0, 'Alteintrag nicht gelöscht');
    assertEqual(h.shown().title, 'Legacy');
    assertEqual(h.shown().showOutliers, true);
    assertEqual(h.shown().showMean, false);
    assertEqual(h.shown().boxColors[0], '#aa3355');
    assertEqual(vm.statsRows[0].color, '#aa3355');
    assertEqual(vm.boxChart.groups.length, 3);
    assertEqual(mod.historyCan('undo'), false);
  });
});
