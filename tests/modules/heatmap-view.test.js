/**
 * Heatmap: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem echten
 * Modul und der echten Vorlage, einem Fake-stateManager mit Arbeitsblatt und
 * einem Fake-chartManager. Prüft Getter, Kreuztabelle, die Auswahl
 * „Aggregation“, den Fall „referenzierte Spalte gelöscht“ und das Altprojekt
 * mit der Übernahme alter chartEdits beim Einhängen.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/heatmap/viewmodel/viewmodel.js';
import { State } from '../../js/modules/heatmap/domain/model.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import { withStoredWorksheetReader } from '../helpers/worksheet-reader.js';

const ID = 'heatmap';
const INST = 'heatmap-1';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
const mounted = [];
let prepared = false;
let UI = null;

/** Text des Moduls; sonst der Schlüssel. */
function tr(key) {
  const v = UI?.[key];
  return typeof v === 'string' ? v : key;
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

/** Arbeitsblatt mit Spaltenvariable „Linie“ (`cx`), Zeilenvariable „Schicht“ (`cg`) und Werten „Zeit“ (`cv`). */
const SHEET = () => ({
  sheets: [{
    id: 's1',
    state: {
      rowCount: 6,
      columns: [
        { id: 'cx', name: 'Linie', type: 'text', values: ['A', 'B', 'A', 'C', 'B', 'A'] },
        { id: 'cg', name: 'Schicht', type: 'text', values: ['W1', 'W2', 'W1', 'W2', 'W1', 'W2'] },
        { id: 'cv', name: 'Zeit', type: 'numeric', values: [10, 5, 20, 1, '2,5', 4] },
      ],
    },
  }],
});
const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });
/** Gespeicherter Stand der neuen Form; Vorgabe: Spalten- und Zeilenvariable, ohne Werte (Zählen). */
const stored = (row = { x: ref('cx'), g: ref('cg'), v: null }, over = {}) => ({
  ...new State().toJSON(),
  datasets: [row],
  ...over,
});
/** Objekt mit sortierten Schlüsseln, für Vergleiche ohne Reihenfolge. */
const sorted = (o) => Object.fromEntries(Object.entries(JSON.parse(JSON.stringify(o))).sort(([a], [b]) => a.localeCompare(b)));

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


/** Zeilen der Tabelle als Texte je Zelle. */
const tableText = (container) => [...container.querySelectorAll('table.heatmap-module__stats-table tr')]
  .map((tr) => [...tr.querySelectorAll('th, td')].map((c) => c.textContent));

suite('heatmap: Viewmodel im Browser', () => {
  test('Zählen: Raster, Achsentitel aus den Spaltennamen, Titel aus, ganze Zahlen', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertTrue(vm.hasData, 'keine Daten');
    assertDeepEqual(JSON.parse(JSON.stringify(vm.heatmapChart)), {
      title: '',
      showTitle: false,
      xLabel: 'Linie',
      yLabel: 'Schicht',
      xCategories: ['A', 'B', 'C'],
      yCategories: ['W1', 'W2'],
      cells: [[2, 1, 0], [1, 1, 1]],
      valueLabel: tr('axisCount'),
      valueDecimals: 0,
    });
    assertEqual(vm.legacyEditKey, 'heatmap');
    assertEqual(vm.decimals, 0);
    assertEqual(vm.showTotals, true);
    assertEqual(h.charts.length, 1);
    assertEqual(h.charts[0].type, 'heatmap');
    assertEqual(h.shown().showTitle, false);
    assertEqual(h.shown().valueDecimals, 0);
    assertTrue(h.container.querySelector('[data-ref="placeholder"]').style.display === 'none', 'Platzhalter sichtbar');
    assertEqual(h.container.querySelector('[data-ref="error-box"]'), null);
  });

  test('Kreuztabelle im Zählmodus: Ecke, Köpfe, Zeilen, Summen', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertEqual(vm.statsCorner, 'Schicht \\ Linie');
    assertDeepEqual([...vm.statsHeaders], ['A', 'B', 'C']);
    assertDeepEqual(JSON.parse(JSON.stringify(vm.statsRows)), [
      { label: 'W1', cells: ['2', '1', '0'], total: '3' },
      { label: 'W2', cells: ['1', '1', '1'], total: '3' },
    ]);
    assertDeepEqual([...vm.statsColTotals], ['3', '2', '1']);
    assertEqual(vm.statsGrandTotal, '6');
    assertDeepEqual(tableText(h.container), [
      ['Schicht \\ Linie', 'A', 'B', 'C', tr('statTotal')],
      ['W1', '2', '1', '0', '3'],
      ['W2', '1', '1', '1', '3'],
      [tr('statTotal'), '3', '2', '1', '6'],
    ]);
    const total = h.container.querySelector('table.heatmap-module__stats-table tbody tr:last-child');
    assertTrue(total.classList.contains('heatmap-module__stats-total'), 'Summenzeile ohne Klasse');
    assertEqual(total.getAttribute('style'), null);
    assertDeepEqual(JSON.parse(JSON.stringify(vm.stats)), {
      xCategories: ['A', 'B', 'C'],
      yCategories: ['W1', 'W2'],
      cells: [[2, 1, 0], [1, 1, 1]],
      rowTotals: [3, 3],
      colTotals: [3, 2, 1],
      total: 6,
    });
  });

  test('Mittelwert: Beschriftung der Werte, leere Zelle als null und Strich, keine Summen', async () => {
    const h = await mount(stored({ x: ref('cx'), g: ref('cg'), v: ref('cv') }));
    const vm = h.vm();
    const cfg = JSON.parse(JSON.stringify(vm.heatmapChart));
    assertEqual(cfg.valueLabel, `${tr('axisMeanOf')} Zeit`);
    assertDeepEqual(cfg.cells, [[15, 2.5, null], [4, 5, 1]]);
    assertEqual('valueDecimals' in cfg, false);
    assertEqual(h.shown().valueDecimals, undefined);
    assertEqual(vm.decimals, 1);
    assertEqual(vm.showTotals, false);
    assertDeepEqual(JSON.parse(JSON.stringify(vm.statsRows)), [
      { label: 'W1', cells: ['15,0', '2,5', '—'], total: '' },
      { label: 'W2', cells: ['4,0', '5,0', '1,0'], total: '' },
    ]);
    assertDeepEqual([...vm.statsColTotals], []);
    assertEqual(vm.statsGrandTotal, '');
    assertDeepEqual(tableText(h.container), [
      ['Schicht \\ Linie', 'A', 'B', 'C'],
      ['W1', '15,0', '2,5', '—'],
      ['W2', '4,0', '5,0', '1,0'],
    ]);
    assertEqual(h.container.querySelector('.heatmap-module__stats-total'), null);
    const stats = JSON.parse(JSON.stringify(vm.stats));
    assertEqual(stats.rowTotals, null);
    assertEqual(stats.total, null);
  });

  test('Summe: Beschriftung, Summen mit den Stellen aus model.chart', async () => {
    const h = await mount(stored({ x: ref('cx'), g: ref('cg'), v: ref('cv') }, { aggregation: 'sum', chart: { valueDecimals: 2 } }));
    const vm = h.vm();
    assertEqual(vm.heatmapChart.valueLabel, `${tr('axisSumOf')} Zeit`);
    assertEqual(vm.decimals, 2);
    assertEqual(vm.showTotals, true);
    assertEqual(h.shown().valueDecimals, 2);
    assertDeepEqual(tableText(h.container), [
      ['Schicht \\ Linie', 'A', 'B', 'C', tr('statTotal')],
      ['W1', '30,00', '2,50', '—', '32,50'],
      ['W2', '4,00', '5,00', '1,00', '10,00'],
      [tr('statTotal'), '34,00', '7,50', '1,00', '42,50'],
    ]);
    assertEqual(vm.stats.total, 42.5);
  });

  test('Ecke ohne lesbaren Spaltennamen: Ersatztexte', async () => {
    const h = await mount(new State().toJSON());
    assertEqual(h.vm().statsCorner, `${tr('statG')} \\ ${tr('statX')}`);
  });

  test('Auswahl „Aggregation“: nur mit Wertespalte; Optionen Mittelwert, Summe; Wechsel schreibt das Model', async () => {
    let h = await mount(stored());
    assertEqual(h.vm().showAggregation, false);
    assertEqual(h.container.querySelector('[data-action="set-agg"]'), null);
    assertTrue(!!h.container.querySelector('[data-ref="options-wrap"]'), 'Optionsbereich fehlt');
    assertTrue(h.container.querySelector('[data-ref="options-wrap"]').style.display !== 'none', 'Optionsbereich verborgen');

    h = await mount(stored({ x: ref('cx'), g: ref('cg'), v: ref('cv') }));
    const vm = h.vm();
    assertEqual(vm.showAggregation, true);
    assertDeepEqual(JSON.parse(JSON.stringify(vm.aggregationOptions)), [
      { value: 'mean', label: tr('aggMean'), selected: true },
      { value: 'sum', label: tr('aggSum'), selected: false },
    ]);
    const sel = h.container.querySelector('[data-ref="options-wrap"] select[data-action="set-agg"]');
    assertEqual(sel.options.length, 2);
    sel.value = 'sum';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    assertEqual(vm.model.aggregation, 'sum');
    assertEqual(vm.aggregationOptions[1].selected, true);
    assertEqual(vm.showTotals, true);
    assertEqual(h.shown().valueLabel, `${tr('axisSumOf')} Zeit`);
    assertEqual(mod.historyCan('undo'), true);
  });

  test('ohne Spalte: Platzhalter mit Text, kein Diagramm, stats null', async () => {
    const h = await mount(new State().toJSON());
    const vm = h.vm();
    assertEqual(vm.hasData, false);
    assertEqual(vm.stats, null);
    assertDeepEqual([...vm.statsRows], []);
    const ph = h.container.querySelector('[data-ref="placeholder"]');
    assertTrue(ph.style.display !== 'none', 'Platzhalter verborgen');
    assertEqual(ph.textContent, tr('placeholderPickBoth'));
    assertEqual(h.container.querySelector('[data-ref="chart-area"]'), null);
    assertEqual(h.charts.length, 0);
  });

  for (const [slot, col] of [['x', 'cx'], ['g', 'cg'], ['v', 'cv']]) {
    test(`referenzierte Spalte gelöscht (${slot}): Bezug bleibt im Model, kein Diagramm, stats null, kein Wurf`, async () => {
      const sheet = SHEET();
      const cols = sheet.sheets[0].state.columns;
      cols.splice(cols.findIndex((c) => c.id === col), 1);
      const h = await mount(stored({ x: ref('cx'), g: ref('cg'), v: ref('cv') }), { sheet });
      const vm = h.vm();
      assertDeepEqual(JSON.parse(JSON.stringify(vm.model.datasets[0][slot])), ref(col));
      assertEqual(vm.hasData, false);
      assertEqual(vm.stats, null);
      assertDeepEqual([...vm.statsRows], []);
      assertTrue(h.container.querySelector('[data-ref="placeholder"]').style.display !== 'none', 'Platzhalter verborgen');
      assertEqual(h.container.querySelector('[data-ref="chart-area"]'), null);
      assertEqual(h.charts.length, 0);
    });
  }

  /** Altstand ohne `_schema`, Werte wie die Fixture des Altprojekts. */
  const legacy = (over = {}) => ({
    xRef: ref('cx'),
    gRef: ref('cg'),
    vRef: ref('cv'),
    chartConfig: {
      title: 'Modelltitel', showTitle: true, aggregation: 'sum', showCellLabels: true,
      cellGap: 3, valueDecimals: 2, colorScheme: 'plasma', bgColor: '#fff8e1', ...over,
    },
    exampleWorksheetId: null,
  });

  test('Altprojekt: chartEdits gewinnen über das Model, Alteintrag gelöscht, kein Verlaufsschritt', async () => {
    const h = await mount(legacy(), { chartEdits: { [INST]: { heatmap: { title: 'Legacy', colorScheme: 'thermal', labelSize: 14 } } } });
    const vm = h.vm();
    assertDeepEqual(sorted(vm.model.chart), sorted({
      title: 'Legacy', showTitle: true, colorScheme: 'thermal', labelSize: 14, cellGap: 3, valueDecimals: 2, bgColor: '#fff8e1',
    }));
    assertDeepEqual(JSON.parse(JSON.stringify(vm.model.datasets)), [{ x: ref('cx'), g: ref('cg'), v: ref('cv') }]);
    assertEqual(vm.model.aggregation, 'sum');
    assertEqual(Object.keys(h.chartEdits[INST].heatmap).length, 0, 'Alteintrag nicht gelöscht');
    const shown = h.shown();
    assertEqual(shown.title, 'Legacy');
    assertEqual(shown.showTitle, true);
    assertEqual(shown.colorScheme, 'thermal');
    assertEqual(shown.labelSize, 14);
    assertEqual(shown.cellGap, 3);
    assertEqual(shown.valueDecimals, 2);
    assertEqual(shown.bgColor, '#fff8e1');
    assertEqual(shown.valueLabel, `${tr('axisSumOf')} Zeit`);
    assertEqual(tableText(h.container)[1][1], '30,00');
    assertEqual(mod.historyCan('undo'), false);
  });

  test('Altprojekt mit Konflikt um valueDecimals: der Alteintrag gilt in Diagramm und Tabelle', async () => {
    const h = await mount(legacy(), { chartEdits: { [INST]: { heatmap: { valueDecimals: 3 } } } });
    const vm = h.vm();
    assertEqual(vm.model.chart.valueDecimals, 3);
    assertEqual(vm.decimals, 3);
    assertEqual(h.shown().valueDecimals, 3);
    assertDeepEqual(tableText(h.container)[1], ['W1', '30,000', '2,500', '—', '32,500']);
    assertEqual(vm.statsGrandTotal, '42,500');
  });

  test('Altprojekt mit leerem Modeltitel: Titel aus chartEdits bleibt verborgen wie in der Altform', async () => {
    const h = await mount(legacy({ title: '', colorScheme: 'viridis', cellGap: 1, valueDecimals: 1, bgColor: null }),
      { chartEdits: { [INST]: { heatmap: { title: 'X' } } } });
    const vm = h.vm();
    assertDeepEqual(sorted(vm.model.chart), { title: 'X' });
    assertEqual(vm.heatmapChart.showTitle, false);
    assertEqual(h.shown().title, 'X');
    assertEqual(h.shown().showTitle, false);
  });

  test('neue Instanz: Titel aus, ein im Editor getippter Titel bleibt verborgen bis „Titel anzeigen“', async () => {
    const h = await mount(stored());
    assertEqual(h.vm().heatmapChart.showTitle, false);
    assertEqual(h.shown().showTitle, false);
    h.vm().model.chart = { title: 'Neu' };
    await settle();
    assertEqual(h.shown().title, 'Neu');
    assertEqual(h.shown().showTitle, false);
    h.vm().model.chart = { title: 'Neu', showTitle: true };
    await settle();
    assertEqual(h.shown().showTitle, true);
  });
});
