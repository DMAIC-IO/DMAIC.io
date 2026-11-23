/**
 * Wahrscheinlichkeitsnetz: das Viewmodel im Browser (viewmodel/viewmodel.js)
 * mit dem echten Modul und der echten Vorlage, einem Fake-stateManager mit
 * Arbeitsblatt und einem Fake-chartManager. Prüft Getter, Fehlertexte, das
 * Leeren der Einstellungen alter Stände samt Rückgängig, den Fall
 * „referenzierte Spalte gelöscht“ und das Altprojekt mit der Übernahme alter
 * chartEdits beim Einhängen.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/probability-plot/viewmodel/viewmodel.js';
import { State } from '../../js/modules/probability-plot/domain/model.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import { withStoredWorksheetReader } from '../helpers/worksheet-reader.js';
import { storedSource } from '../helpers/stored-source.js';
import { evaluateDerived } from '../../js/core/derived.js';
import { CHART_COLORS } from '../../js/core/chart/chart-colors.js';

const ID = 'probability-plot';
const INST = 'pp-1';
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
  datasets: [{ valueRef: ref(0), groupRef: null }],
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
const row = (v, groupRef = null) => ({ valueRef: v === null ? null : ref(v), groupRef });
const plain = (v) => JSON.parse(JSON.stringify(v));

suite('probability-plot: Viewmodel im Browser', () => {
  test('eine Reihe: Konfiguration mit Titel, Achsentiteln, ohne Modellschalter', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertTrue(vm.hasSeries, 'keine Reihe');
    assertEqual(vm.errorText, '');
    assertDeepEqual(plain(vm.probChart), {
      title: tr('chartTitle', { col: 'Spalte 0' }), xLabel: tr('xLabel'), yLabel: tr('yLabel'),
      series: [{ name: 'Spalte 0', values: [10, 12, 8, 15, 25], visible: true }],
    });
    assertEqual(vm.legacyEditKey, 'probability-plot');
    assertEqual(h.charts.length, 1);
    assertEqual(h.charts[0].type, 'probability-plot');
    assertEqual(h.shown().title, tr('chartTitle', { col: 'Spalte 0' }));
    assertEqual(h.container.querySelector('[data-ref="placeholder"]').style.display, 'none');
  });

  test('Gruppenspalte und zweite Reihe: drei Reihen, Titel mit allen Namen, auch ausgeblendeten', async () => {
    const h = await mount(stored({ datasets: [row(0, gref), row(1)] }));
    const vm = h.vm();
    const names = ['Spalte 0 — G1', 'Spalte 0 — G2', 'Spalte 1'];
    assertDeepEqual(vm.probChart.series.map((s) => s.name), names);
    assertEqual(vm.probChart.title, tr('chartTitle', { col: names.join(', ') }));
    vm.model.chart = { series: [{ name: 'Spalte 0 — G2', visible: false }] };
    await settle();
    assertEqual(vm.probChart.title, tr('chartTitle', { col: names.join(', ') }));
    assertDeepEqual(vm.stats.map((s) => s.name), ['Spalte 0 — G1', 'Spalte 1']);
  });

  test('Tabellenfarbe: Palette nach dem Index unter den sichtbaren Reihen, Editorfarbe gewinnt', async () => {
    const h = await mount(stored({ datasets: [row(0, gref), row(1)] }));
    const vm = h.vm();
    assertDeepEqual(vm.statsRows.map((r) => r.color), CHART_COLORS.slice(0, 3));
    vm.model.chart = { series: [{ name: 'Spalte 0 — G1', visible: false }, { name: 'Spalte 1', color: '#123456' }] };
    await settle();
    assertDeepEqual(vm.statsRows.map((r) => r.name), ['Spalte 0 — G2', 'Spalte 1']);
    assertDeepEqual(vm.statsRows.map((r) => r.color), [CHART_COLORS[0], '#123456']);
  });

  test('ohne Wertespalte: keine Reihe, kein Fehlertext, Platzhalter sichtbar', async () => {
    const h = await mount(stored({ datasets: [row(null)] }));
    const vm = h.vm();
    assertEqual(vm.hasSeries, false);
    assertEqual(vm.errorText, '');
    assertEqual(vm.probChart, null);
    assertEqual(vm.stats, null);
    const ph = h.container.querySelector('[data-ref="placeholder"]');
    assertTrue(ph.style.display !== 'none', 'Platzhalter verborgen');
    assertEqual(ph.textContent.trim(), tr('placeholderText'));
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
    const h = await mount(stored({ datasets: [row(0), row(1)] }), { sheet: sheetWith([1, 2, 3], [7]) });
    const vm = h.vm();
    assertEqual(vm.errorText, tr('errTooFew', { col: 'Spalte 1' }));
    vm.model.datasets = [row(0)];
    await settle();
    assertEqual(vm.errorText, '');
    assertTrue(vm.hasSeries, 'keine Reihe nach der Korrektur');
    assertEqual(h.container.querySelector('[data-ref="error-box"]').style.display, 'none');
  });

  test('referenzierte Spalte gelöscht: Bezug bleibt im Model, keine Reihe, stats null, kein Wurf', async () => {
    const sheet = SHEET();
    sheet.sheets[0].state.columns.splice(0, 1);
    const h = await mount(stored(), { sheet });
    const vm = h.vm();
    assertDeepEqual(plain(vm.model.datasets[0].valueRef), ref(0));
    assertEqual(vm.hasSeries, false);
    assertEqual(vm.stats, null);
    assertEqual(vm.errorText, tr('errTooFew', { col: '?' }));
    // Gruppenspalte gelöscht: keine Stufe, Meldung mit der Zeilennummer.
    const sheet2 = SHEET();
    sheet2.sheets[0].state.columns.pop();
    const h2 = await mount(stored({ datasets: [row(0, gref)] }), { sheet: sheet2 });
    const vm2 = h2.vm();
    assertDeepEqual(plain(vm2.model.datasets[0].groupRef), gref);
    assertEqual(vm2.hasSeries, false);
    assertEqual(vm2.stats, null);
    assertEqual(vm2.errorText, tr('errNoGroupLevels', { n: 1 }));
  });

  test('stats ist die Ableitung des Models', async () => {
    const h = await mount(stored({ datasets: [row(0), row(1)] }));
    const vm = h.vm();
    const expected = evaluateDerived(State.fromJSON(stored({ datasets: [row(0), row(1)] })), storedSource({ ws1: SHEET() })).stats;
    assertDeepEqual(plain(vm.stats), plain(expected));
    assertTrue(vm.stats[0].referenceLine.slope > 0, 'keine Referenzgerade');
  });

  test('Bezugslinie und Hintergrund aus model.chart erreichen das Diagramm', async () => {
    const line = { dir: 'v', value: 14, label: 'Ziel' };
    const h = await mount(stored({ chart: { refLines: [line], bgColor: '#fafafa' } }));
    assertDeepEqual(plain(h.shown().refLines), [line]);
    assertEqual(h.shown().bgColor, '#fafafa');
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

  test('legacySeries liegt nach Index über der Reihe, auch Name und Farbe; andere Datensätze leeren sie, Rückgängig holt beides', async () => {
    const h = await mount(stored({ legacySeries: [{ name: 'Alt', color: '#aa3355' }] }));
    const vm = h.vm();
    assertEqual(vm.probChart.series[0].name, 'Alt');
    assertEqual(vm.probChart.series[0].color, '#aa3355');
    assertEqual(vm.statsRows[0].name, 'Alt');
    assertEqual(vm.statsRows[0].color, '#aa3355');
    assertEqual(h.shown().series[0].color, '#aa3355');
    vm.model.datasets = [row(1)];
    await settle();
    assertEqual(vm.model.legacySeries.length, 0);
    assertEqual(vm.probChart.series[0].name, 'Spalte 1');
    assertTrue(mod.historyStep('undo'), 'kein Schritt zum Zurücknehmen');
    await settle();
    assertDeepEqual(plain(vm.model.datasets), [row(0)]);
    assertEqual(vm.model.legacySeries.length, 1);
    assertEqual(vm.model.legacySeries[0].name, 'Alt');
    assertEqual(mod.historyCan('undo'), false);
    assertEqual(mod.historyCan('redo'), true);
    await settle();
    assertEqual(vm.model.legacySeries.length, 1, 'Rückgängig leert die Einstellungen nicht erneut');
    assertTrue(mod.historyStep('redo'), 'kein Schritt zum Wiederholen');
    await settle();
    assertDeepEqual(plain(vm.model.datasets), [row(1)]);
    assertEqual(vm.model.legacySeries.length, 0);
  });

  test('Altprojekt: chartEdits gewinnen über das Model (bgColor), Reihen nach Index, Alteintrag gelöscht, kein Verlaufsschritt', async () => {
    const line = { dir: 'v', value: 14, label: 'Ziel' };
    const legacy = {
      datasets: [{ valueRef: ref(0), groupRef: gref }, { valueRef: ref(1), groupRef: null }],
      seriesOverrides: [
        { name: 'Linie Eins', color: '#aa3355', visible: true },
        { name: 'Spalte 0 — G2', visible: false },
        { name: 'Spalte 1', lineColor: '#336699', markerSymbol: 'square', visible: true },
      ],
      refLines: [line], refAreas: [], bgColor: '#fff8e1',
      showStats: true, confLevel: 90, exampleWorksheetId: null,
    };
    const h = await mount(legacy, { chartEdits: { [INST]: { 'probability-plot': { title: 'Legacy', bgColor: '#eef6ff', xLabel: 'Durchmesser' } } } });
    const vm = h.vm();
    assertDeepEqual(plain(vm.model.datasets), [row(0, gref), row(1)]);
    assertEqual(vm.model.chart.title, 'Legacy');
    assertEqual(vm.model.chart.bgColor, '#eef6ff');
    assertEqual(vm.model.chart.xLabel, 'Durchmesser');
    assertDeepEqual(plain(vm.model.chart.refLines), [line]);
    assertEqual(vm.model.legacySeries.length, 3);
    assertEqual(vm.model.confLevel, 90);
    assertEqual(Object.keys(h.chartEdits[INST]['probability-plot']).length, 0, 'Alteintrag nicht gelöscht');
    assertEqual(h.shown().title, 'Legacy');
    assertEqual(h.shown().bgColor, '#eef6ff');
    assertEqual(h.shown().xLabel, 'Durchmesser');
    assertDeepEqual(vm.probChart.series.map((s) => s.name), ['Linie Eins', 'Spalte 0 — G2', 'Spalte 1']);
    assertEqual(vm.probChart.series[1].visible, false);
    assertEqual(vm.probChart.series[2].lineColor, '#336699');
    assertDeepEqual(vm.statsRows.map((r) => r.name), ['Linie Eins', 'Spalte 1']);
    assertDeepEqual(vm.statsRows.map((r) => r.color), ['#aa3355', CHART_COLORS[1]]);
    assertEqual(mod.historyCan('undo'), false);
  });
});
