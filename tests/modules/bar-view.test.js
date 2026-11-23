/**
 * Balkendiagramm: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem
 * echten Modul und der echten Vorlage, einem Fake-stateManager mit
 * Arbeitsblatt und einem Fake-chartManager. Prüft Getter, Tabelle, die
 * Auswahl „Aggregation“, das Kästchen „Gestapelt“, den Fall „referenzierte
 * Spalte gelöscht“ und das Altprojekt mit der Übernahme alter chartEdits beim
 * Einhängen.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/bar/viewmodel/viewmodel.js';
import { State } from '../../js/modules/bar/domain/model.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import { withStoredWorksheetReader } from '../helpers/worksheet-reader.js';
import { PALETTE } from '../../js/core/chart/chart-data-prep.js';

const ID = 'bar';
const INST = 'bar-1';
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

suite('bar: Viewmodel im Browser', () => {
  test('Kategorie und Werte: eine Reihe nach der Wertespalte, Achsentitel, Titel aus, keine Legende', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertTrue(vm.hasData, 'keine Daten');
    assertDeepEqual(JSON.parse(JSON.stringify(vm.barChart)), {
      title: '',
      showTitle: false,
      categories: ['A', 'B', 'C'],
      groups: [{ name: 'Kosten', values: [34 / 3, 3.75, 1], color: PALETTE[0] }],
      xLabel: 'Grund',
      yLabel: `${tr('axisMeanOf')} Kosten`,
      stacked: false,
      showLegend: false,
    });
    assertEqual(vm.legacyEditKey, 'bar');
    assertEqual(h.charts.length, 1);
    assertEqual(h.charts[0].type, 'bar');
    assertEqual(h.shown().showLegend, false);
    assertEqual(h.shown().showTitle, false);
    assertTrue(h.container.querySelector('[data-ref="placeholder"]').style.display === 'none', 'Platzhalter sichtbar');
  });

  test('Achsentitel, Tabellenkopf und Reihenname je Modus: Häufigkeit, Mittelwert, Summe', async () => {
    let h = await mount(stored({ x: ref('cx'), y: null, g: null }));
    let vm = h.vm();
    assertEqual(vm.barChart.yLabel, tr('axisCount'));
    assertEqual(vm.statsValueHeader, tr('statCount'));
    assertDeepEqual(JSON.parse(JSON.stringify(vm.barChart.groups)), [{ name: 'Grund', values: [3, 2, 1], color: PALETTE[0] }]);
    assertEqual(vm.showTotal, true);

    h = await mount(stored());
    vm = h.vm();
    assertEqual(vm.barChart.yLabel, `${tr('axisMeanOf')} Kosten`);
    assertEqual(vm.statsValueHeader, tr('statMean'));
    assertEqual(vm.showTotal, false);

    h = await mount(stored(undefined, { aggregation: 'sum' }));
    vm = h.vm();
    assertEqual(vm.barChart.yLabel, `${tr('axisSumOf')} Kosten`);
    assertEqual(vm.statsValueHeader, tr('statSum'));
    assertDeepEqual([...vm.barChart.groups[0].values], [34, 7.5, 1]);
  });

  test('mit Gruppe: eine Reihe je Gruppe, Legende an, Gruppenspalte in der Tabelle', async () => {
    const h = await mount(stored({ x: ref('cx'), y: null, g: ref('cg') }, { stacked: true }));
    const vm = h.vm();
    const cfg = JSON.parse(JSON.stringify(vm.barChart));
    assertDeepEqual(cfg.categories, ['A', 'B', 'C']);
    assertDeepEqual(cfg.groups, [
      { name: 'W1', values: [2, 1, 0], color: PALETTE[0] },
      { name: 'W2', values: [1, 1, 1], color: PALETTE[1] },
    ]);
    assertEqual(cfg.showLegend, true);
    assertEqual(cfg.stacked, true);
    assertEqual(h.shown().showLegend, true);
    assertEqual(h.shown().stacked, true);
    assertEqual(vm.showGroupCol, true);
    assertEqual(vm.showTotal, true);
    assertDeepEqual(JSON.parse(JSON.stringify(vm.statsRows)), [
      { color: PALETTE[0], name: 'A', group: 'W1', value: '2' },
      { color: PALETTE[0], name: 'B', group: 'W1', value: '1' },
      { color: PALETTE[0], name: 'C', group: 'W1', value: '0' },
      { color: PALETTE[1], name: 'A', group: 'W2', value: '1' },
      { color: PALETTE[1], name: 'B', group: 'W2', value: '1' },
      { color: PALETTE[1], name: 'C', group: 'W2', value: '1' },
    ]);
    assertEqual(vm.statsTotal, '6');
    const table = h.container.querySelector('[data-ref="stats-panel"] table.bar-module__stats-table');
    const ths = table.querySelectorAll('thead th');
    assertEqual(ths.length, 3);
    assertEqual(ths[1].textContent, tr('statGroup'));
    assertEqual(ths[2].textContent, tr('statCount'));
    assertTrue(ths[2].querySelector('span').classList.contains('context-help-anchor--overlay'), 'letzter Kopf ohne Overlay-Anker');
    const rows = table.querySelectorAll('tbody tr');
    assertEqual(rows.length, 7);
    assertEqual(rows[0].querySelectorAll('td')[1].textContent, 'W1');
    const total = rows[6];
    assertTrue(total.classList.contains('bar-module__stats-total'), 'Summenzeile ohne Klasse');
    assertEqual(total.getAttribute('style'), null);
    assertEqual(total.querySelectorAll('td').length, 3);
    assertEqual(total.querySelectorAll('td')[0].textContent, tr('statTotal'));
    assertEqual(total.querySelectorAll('td')[2].textContent, '6');
    const stats = JSON.parse(JSON.stringify(vm.stats));
    assertDeepEqual(stats, {
      categories: ['A', 'B', 'C'],
      groups: [{ name: 'W1', values: [2, 1, 0] }, { name: 'W2', values: [1, 1, 1] }],
      total: 6,
    });

    const h2 = await mount(stored({ x: ref('cx'), y: ref('cy'), g: ref('cg') }, { aggregation: 'sum' }));
    assertDeepEqual(JSON.parse(JSON.stringify(h2.vm().barChart.groups)).map((g) => g.values), [[30, 2.5, 0], [4, 5, 1]]);
    assertEqual(h2.vm().stats.total, null);
  });

  test('Tabelle ohne Gruppe: Zeilen, Farbfeld und Name, keine Summenzeile mit Wertespalte', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertDeepEqual(JSON.parse(JSON.stringify(vm.statsRows)), [
      { color: PALETTE[0], name: 'A', group: 'Kosten', value: '11,33' },
      { color: PALETTE[0], name: 'B', group: 'Kosten', value: '3,75' },
      { color: PALETTE[0], name: 'C', group: 'Kosten', value: '1' },
    ]);
    assertEqual(vm.showGroupCol, false);
    assertEqual(vm.swatchStyle({ color: '#123456' }), 'background:#123456');
    assertEqual(vm.rowLabel({ name: 'B' }), ' B');
    const table = h.container.querySelector('[data-ref="stats-panel"] table.bar-module__stats-table');
    const ths = table.querySelectorAll('thead th');
    assertEqual(ths.length, 2);
    assertEqual(ths[1].textContent, tr('statMean'));
    assertTrue(ths[1].querySelector('span').classList.contains('context-help-anchor--overlay'), 'letzter Kopf ohne Overlay-Anker');
    const rows = table.querySelectorAll('tbody tr');
    assertEqual(rows.length, 3);
    assertEqual(table.querySelector('.bar-module__stats-total'), null);
    const swatch = table.querySelector('.bar-module__stats-color');
    assertTrue(swatch.getAttribute('style').replace(/\s/g, '').startsWith('background:'), 'Farbfeld ohne Farbe');
    assertEqual(rows[0].querySelectorAll('td')[0].textContent, ' A');
    assertEqual(rows[0].querySelectorAll('td').length, 2);
    assertEqual(h.container.querySelector('[data-ref="error-box"]'), null);

    const h2 = await mount(stored({ x: ref('cx'), y: null, g: null }));
    const rows2 = h2.container.querySelectorAll('table.bar-module__stats-table tbody tr');
    assertEqual(rows2.length, 4);
    assertEqual(rows2[3].querySelectorAll('td').length, 2);
    assertEqual(rows2[3].querySelectorAll('td')[1].textContent, '6');
    assertEqual(h2.vm().stats.total, 6);
  });

  test('Optionen: Auswahl nur mit Wertespalte, Kästchen nur mit Gruppenspalte, Bereich nur mit einem davon', async () => {
    let h = await mount(stored({ x: ref('cx'), y: null, g: null }));
    let vm = h.vm();
    assertEqual(vm.showAggregation, false);
    assertEqual(vm.showStacked, false);
    assertEqual(vm.showOptions, false);
    assertEqual(h.container.querySelector('[data-ref="options-wrap"]').style.display, 'none');
    assertEqual(h.container.querySelector('[data-action="set-agg"]'), null);
    assertEqual(h.container.querySelector('[data-action="set-stacked"]'), null);

    h = await mount(stored());
    vm = h.vm();
    assertEqual(vm.showAggregation, true);
    assertEqual(vm.showStacked, false);
    assertEqual(vm.showOptions, true);
    assertTrue(h.container.querySelector('[data-ref="options-wrap"]').style.display !== 'none', 'Optionsbereich verborgen');
    assertTrue(!!h.container.querySelector('[data-action="set-agg"]'), 'keine Auswahl');
    assertEqual(h.container.querySelector('[data-action="set-stacked"]'), null);

    h = await mount(stored({ x: ref('cx'), y: null, g: ref('cg') }));
    vm = h.vm();
    assertEqual(vm.showAggregation, false);
    assertEqual(vm.showStacked, true);
    assertEqual(vm.showOptions, true);
    assertEqual(h.container.querySelector('[data-action="set-agg"]'), null);
    assertTrue(!!h.container.querySelector('[data-action="set-stacked"]'), 'kein Kästchen');
  });

  test('Auswahl „Aggregation“: Optionen Mittelwert, Summe; Wechsel schreibt das Model', async () => {
    const h = await mount(stored());
    const vm = h.vm();
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
    assertEqual(vm.statsValueHeader, tr('statSum'));
    assertEqual(h.shown().yLabel, `${tr('axisSumOf')} Kosten`);
    assertEqual(mod.historyCan('undo'), true);
  });

  test('Kästchen „Gestapelt“: schreibt das Model, das Diagramm stapelt', async () => {
    const h = await mount(stored({ x: ref('cx'), y: null, g: ref('cg') }));
    const vm = h.vm();
    const box = /** @type {HTMLInputElement} */ (h.container.querySelector('input[data-action="set-stacked"]'));
    assertEqual(box.checked, false);
    assertEqual(h.shown().stacked, false);
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    assertEqual(vm.model.stacked, true);
    assertEqual(h.shown().stacked, true);
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
        title: 'Modelltitel', showTitle: true, titleSize: 18, showLegend: true, stacked: true, aggregation: 'sum',
        barGap: 4, categoryGap: 0.3, bgColor: '#fff8e1', xLabel: 'Kategorie alt', yLabel: '',
      },
      exampleWorksheetId: null,
    };
    const h = await mount(legacy, { chartEdits: { [INST]: { bar: { title: 'Legacy', titleSize: 20, labelSize: 14 } } } });
    const vm = h.vm();
    assertDeepEqual(sorted(vm.model.chart), sorted({
      title: 'Legacy', showTitle: true, titleSize: 20, labelSize: 14, xLabel: 'Kategorie alt', bgColor: '#fff8e1',
    }));
    assertDeepEqual(JSON.parse(JSON.stringify(vm.model.datasets)), [{ x: ref('cx'), y: ref('cy'), g: ref('cg') }]);
    assertEqual(vm.model.aggregation, 'sum');
    assertEqual(vm.model.stacked, true);
    assertEqual(Object.keys(h.chartEdits[INST].bar).length, 0, 'Alteintrag nicht gelöscht');
    const shown = h.shown();
    assertEqual(shown.title, 'Legacy');
    assertEqual(shown.showTitle, true);
    assertEqual(shown.titleSize, 20);
    assertEqual(shown.labelSize, 14);
    assertEqual(shown.xLabel, 'Kategorie alt');
    assertEqual(shown.yLabel, `${tr('axisSumOf')} Kosten`);
    assertEqual(shown.bgColor, '#fff8e1');
    assertEqual(shown.stacked, true);
    assertEqual(shown.showLegend, true);
    assertEqual(mod.historyCan('undo'), false);
  });

  test('Altprojekt mit leerem Modeltitel: Titel aus chartEdits bleibt verborgen wie in der Altform', async () => {
    const legacy = {
      xRef: ref('cx'),
      yRef: null,
      gRef: null,
      chartConfig: { title: '', showTitle: true, titleSize: 15, showLegend: true, stacked: false, aggregation: 'mean', barGap: 4, categoryGap: 0.3, bgColor: null, xLabel: '', yLabel: '' },
      exampleWorksheetId: null,
    };
    const h = await mount(legacy, { chartEdits: { [INST]: { bar: { title: 'X' } } } });
    const vm = h.vm();
    assertDeepEqual(sorted(vm.model.chart), { title: 'X' });
    assertEqual(vm.barChart.showTitle, false);
    assertEqual(h.shown().title, 'X');
    assertEqual(h.shown().showTitle, false);
  });

  test('neue Instanz: Titel aus, ein im Editor getippter Titel bleibt verborgen bis „Titel anzeigen“', async () => {
    const h = await mount(stored());
    assertEqual(h.vm().barChart.showTitle, false);
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
