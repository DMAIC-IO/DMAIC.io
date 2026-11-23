/**
 * Pareto-Diagramm: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem
 * echten Modul und der echten Vorlage, einem Fake-stateManager mit
 * Arbeitsblatt und einem Fake-chartManager. Prüft Getter, geordnete Tabelle,
 * die Auswahl „Aggregation“, den Fall „referenzierte Spalte gelöscht“ und das
 * Altprojekt mit der Übernahme alter chartEdits beim Einhängen.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/pareto/viewmodel/viewmodel.js';
import { State } from '../../js/modules/pareto/domain/model.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import { withStoredWorksheetReader } from '../helpers/worksheet-reader.js';
import { PALETTE } from '../../js/core/chart/chart-data-prep.js';

const ID = 'pareto';
const INST = 'pareto-1';
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

/** Arbeitsblatt mit Kategorie „Grund“ (`cx`), Werten „Kosten“ (`cy`) und Gruppe „Werk“ (`cg`). */
const SHEET = () => ({
  sheets: [{
    id: 's1',
    state: {
      rowCount: 6,
      columns: [
        { id: 'cx', name: 'Grund', type: 'text', values: ['A', 'B', 'A', 'C', 'B', 'A'] },
        { id: 'cy', name: 'Kosten', type: 'numeric', values: [10, 5, 20, 1, '2,5', 4] },
        { id: 'cg', name: 'Werk', type: 'text', values: ['W1', 'W2', 'W1', 'W2', 'W1', 'W2'] },
      ],
    },
  }],
});
const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });
/** Gespeicherter Stand der neuen Form; Vorgabe: Kategorie und Werte, ohne Gruppe. */
const stored = (row = { x: ref('cx'), y: ref('cy'), g: null }, over = {}) => ({
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

suite('pareto: Viewmodel im Browser', () => {
  test('Kategorie und Werte: Einträge, Achsentitel, rechte Achse aus i18n, Sammelposten an, keine Legende', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertTrue(vm.hasData, 'keine Daten');
    assertDeepEqual(JSON.parse(JSON.stringify(vm.paretoChart)), {
      title: '',
      showTitle: false,
      items: [
        { name: 'A', value: 34, color: PALETTE[0] },
        { name: 'B', value: 7.5, color: PALETTE[1] },
        { name: 'C', value: 1, color: PALETTE[2] },
      ],
      xLabel: 'Grund',
      yLabel: `${tr('axisSumOf')} Kosten`,
      rightYLabel: tr('cumLabel'),
      otherLabel: tr('otherLabel'),
      otherCountTemplate: tr('otherCountTemplate'),
      otherBucket: true,
      showLegend: false,
    });
    assertEqual(vm.paretoChart.rightYLabel, 'Kumulativ %');
    assertEqual(vm.legacyEditKey, 'pareto');
    assertEqual(h.charts.length, 1);
    assertEqual(h.charts[0].type, 'pareto');
    assertEqual(h.shown().otherBucket, true);
    assertEqual(h.shown().showLegend, false);
    assertEqual(h.shown().rightYLabel, 'Kumulativ %');
    assertTrue(h.container.querySelector('[data-ref="placeholder"]').style.display === 'none', 'Platzhalter sichtbar');
  });

  test('rechte Achse auf Englisch: „Cumulative %“', async () => {
    const en = await (await fetch(new URL(`../../js/modules/${ID}/resources/i18n/ui.en.json`, import.meta.url), { cache: 'no-cache' })).json();
    assertEqual(en.cumLabel, 'Cumulative %');
  });

  test('Achsentitel und Tabellenkopf je Modus: Häufigkeit, Summe, Mittelwert', async () => {
    let h = await mount(stored({ x: ref('cx'), y: null, g: null }));
    let vm = h.vm();
    assertEqual(vm.paretoChart.yLabel, tr('axisCount'));
    assertEqual(vm.statsValueHeader, tr('statCount'));
    assertDeepEqual(vm.paretoChart.items.map((it) => [it.name, it.value]), [['A', 3], ['B', 2], ['C', 1]]);
    assertEqual(vm.showAggregation, false);

    h = await mount(stored());
    vm = h.vm();
    assertEqual(vm.statsValueHeader, tr('statSum'));
    assertEqual(vm.showAggregation, true);

    h = await mount(stored(undefined, { aggregation: 'mean' }));
    vm = h.vm();
    assertEqual(vm.paretoChart.yLabel, `${tr('axisMeanOf')} Kosten`);
    assertEqual(vm.statsValueHeader, tr('statMean'));
    assertDeepEqual(vm.paretoChart.items.map((it) => [it.name, it.value]), [['A', 34 / 3], ['B', 3.75], ['C', 1]]);
  });

  test('mit Gruppe: Kategorien und Gruppen statt Einträgen, Legende an', async () => {
    const h = await mount(stored({ x: ref('cx'), y: null, g: ref('cg') }));
    const vm = h.vm();
    const cfg = JSON.parse(JSON.stringify(vm.paretoChart));
    assertEqual('items' in cfg, false);
    assertDeepEqual(cfg.categories, ['A', 'B', 'C']);
    assertDeepEqual(cfg.groups, [
      { name: 'W1', values: [2, 1, 0], color: PALETTE[0] },
      { name: 'W2', values: [1, 1, 1], color: PALETTE[1] },
    ]);
    assertEqual(cfg.showLegend, true);
    assertEqual(cfg.otherBucket, true);
    assertEqual(h.shown().showLegend, true);
    assertDeepEqual(vm.statsRows.map((r) => [r.name, r.value, r.color]), [['A', '3', PALETTE[0]], ['B', '2', PALETTE[1]], ['C', '1', PALETTE[2]]]);

    const h2 = await mount(stored({ x: ref('cx'), y: ref('cy'), g: ref('cg') }));
    assertDeepEqual(JSON.parse(JSON.stringify(h2.vm().paretoChart.groups)).map((g) => g.values), [[30, 2.5, 0], [4, 5, 1]]);
  });

  test('geordnete Tabelle: Zeilen, kumulierte Anteile, Summe, Farbfeld und Name', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertDeepEqual(JSON.parse(JSON.stringify(vm.statsRows)), [
      { color: PALETTE[0], name: 'A', value: '34', cumPct: '80,0 %' },
      { color: PALETTE[1], name: 'B', value: '7,5', cumPct: '97,6 %' },
      { color: PALETTE[2], name: 'C', value: '1', cumPct: '100,0 %' },
    ]);
    assertEqual(vm.statsTotal, '42,5');
    assertEqual(vm.statsTotalPct, '100,0 %');
    assertEqual(vm.swatchStyle({ color: '#123456' }), 'background:#123456');
    assertEqual(vm.rowLabel({ name: 'B' }), ' B');
    const table = h.container.querySelector('[data-ref="stats-panel"] table.pareto-module__stats-table');
    assertTrue(!!table, 'keine Tabelle');
    const ths = table.querySelectorAll('thead th');
    assertEqual(ths[1].textContent, tr('statSum'));
    assertTrue(ths[2].querySelector('span').classList.contains('context-help-anchor--overlay'), 'letzter Kopf ohne Overlay-Anker');
    const rows = table.querySelectorAll('tbody tr');
    assertEqual(rows.length, 4);
    const swatch = table.querySelector('.pareto-module__stats-color');
    assertTrue(swatch.getAttribute('style').replace(/\s/g, '').startsWith('background:'), 'Farbfeld ohne Farbe');
    assertEqual(rows[0].querySelectorAll('td')[0].textContent, ' A');
    assertTrue(rows[3].classList.contains('pareto-module__stats-total'), 'Summenzeile ohne Klasse');
    assertEqual(rows[3].getAttribute('style'), null);
    assertEqual(rows[3].querySelectorAll('td')[0].textContent, tr('statTotal'));
    assertEqual(rows[3].querySelectorAll('td')[1].textContent, '42,5');
    const stats = JSON.parse(JSON.stringify(vm.stats));
    assertEqual(stats.total, 42.5);
    assertDeepEqual(stats.rows.map((r) => [r.name, r.value]), [['A', 34], ['B', 7.5], ['C', 1]]);
    assertEqual(h.container.querySelector('[data-ref="error-box"]'), null);
  });

  test('Auswahl „Aggregation“: nur mit Wertespalte, Optionen, Wechsel schreibt das Model', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertDeepEqual(JSON.parse(JSON.stringify(vm.aggregationOptions)), [
      { value: 'sum', label: tr('aggSum'), selected: true },
      { value: 'mean', label: tr('aggMean'), selected: false },
    ]);
    const sel = h.container.querySelector('[data-ref="options-wrap"] select[data-action="set-agg"]');
    assertTrue(!!sel, 'keine Auswahl');
    assertEqual(sel.options.length, 2);
    sel.value = 'mean';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    assertEqual(vm.model.aggregation, 'mean');
    assertEqual(vm.aggregationOptions[1].selected, true);
    assertEqual(vm.statsValueHeader, tr('statMean'));
    assertEqual(mod.historyCan('undo'), true);

    const h2 = await mount(stored({ x: ref('cx'), y: null, g: null }));
    assertEqual(h2.container.querySelector('[data-ref="options-wrap"] select'), null);
  });

  test('ohne Spalte: Platzhalter mit Text, kein Diagramm, stats null', async () => {
    const h = await mount(new State().toJSON());
    const vm = h.vm();
    assertEqual(vm.hasData, false);
    assertEqual(vm.stats, null);
    assertDeepEqual([...vm.statsRows], []);
    const ph = h.container.querySelector('[data-ref="placeholder"]');
    assertTrue(ph.style.display !== 'none', 'Platzhalter verborgen');
    assertEqual(ph.textContent, tr('placeholderPickX'));
    assertEqual(h.container.querySelector('[data-ref="chart-area"]'), null);
    assertEqual(h.charts.length, 0);
  });

  for (const [slot, col] of [['x', 'cx'], ['y', 'cy'], ['g', 'cg']]) {
    test(`referenzierte Spalte gelöscht (${slot}): Bezug bleibt im Model, kein Diagramm, stats null, kein Wurf`, async () => {
      const sheet = SHEET();
      const cols = sheet.sheets[0].state.columns;
      cols.splice(cols.findIndex((c) => c.id === col), 1);
      const h = await mount(stored({ x: ref('cx'), y: ref('cy'), g: ref('cg') }), { sheet });
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

  test('Altprojekt: chartEdits gewinnen über das Model, Alteintrag gelöscht, kein Verlaufsschritt', async () => {
    const legacy = {
      xRef: ref('cx'),
      yRef: ref('cy'),
      gRef: ref('cg'),
      chartConfig: {
        title: 'Modelltitel', showTitle: true, aggregation: 'mean', maxItems: 4, otherBucket: true,
        refLineValue: 70, barOpacity: 0.75, bgColor: '#fff8e1',
      },
      exampleWorksheetId: null,
    };
    const h = await mount(legacy, { chartEdits: { [INST]: { pareto: { title: 'Legacy', refLineValue: 90, cumDotSymbol: 'square' } } } });
    const vm = h.vm();
    assertDeepEqual(sorted(vm.model.chart), sorted({
      title: 'Legacy', showTitle: true, refLineValue: 90, cumDotSymbol: 'square', maxItems: 4, bgColor: '#fff8e1',
    }));
    assertDeepEqual(JSON.parse(JSON.stringify(vm.model.datasets)), [{ x: ref('cx'), y: ref('cy'), g: ref('cg') }]);
    assertEqual(vm.model.aggregation, 'mean');
    assertEqual(Object.keys(h.chartEdits[INST].pareto).length, 0, 'Alteintrag nicht gelöscht');
    const shown = h.shown();
    assertEqual(shown.title, 'Legacy');
    assertEqual(shown.showTitle, true);
    assertEqual(shown.refLineValue, 90);
    assertEqual(shown.cumDotSymbol, 'square');
    assertEqual(shown.maxItems, 4);
    assertEqual(shown.otherBucket, true);
    assertEqual(shown.showLegend, true);
    assertEqual(shown.bgColor, '#fff8e1');
    assertEqual(mod.historyCan('undo'), false);
  });

  test('Altprojekt mit leerem Modeltitel: Titel aus chartEdits bleibt verborgen wie in der Altform', async () => {
    const legacy = {
      xRef: ref('cx'),
      yRef: ref('cy'),
      gRef: null,
      chartConfig: { title: '', showTitle: true, aggregation: 'sum', maxItems: 20, otherBucket: true, refLineValue: 80, barOpacity: 0.75, bgColor: null },
      exampleWorksheetId: null,
    };
    const h = await mount(legacy, { chartEdits: { [INST]: { pareto: { title: 'X' } } } });
    const vm = h.vm();
    assertDeepEqual(sorted(vm.model.chart), { title: 'X' });
    assertEqual(vm.paretoChart.showTitle, false);
    assertEqual(h.shown().title, 'X');
    assertEqual(h.shown().showTitle, false);
  });

  test('neue Instanz: Titel aus, ein im Editor getippter Titel bleibt verborgen bis „Titel anzeigen“', async () => {
    const h = await mount(stored());
    assertEqual(h.vm().paretoChart.showTitle, false);
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
