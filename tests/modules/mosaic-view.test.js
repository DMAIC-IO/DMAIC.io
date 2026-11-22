/**
 * Mosaikdiagramm: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem
 * echten Modul und der echten Vorlage, einem Fake-stateManager mit
 * Arbeitsblatt und einem Fake-chartManager. Prüft Getter, Kreuztabelle, den
 * Fall „referenzierte Spalte gelöscht“ und das Altprojekt mit der Übernahme
 * alter chartEdits beim Einhängen.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/mosaic/viewmodel/viewmodel.js';
import { State } from '../../js/modules/mosaic/domain/model.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import { withStoredWorksheetReader } from '../helpers/worksheet-reader.js';
import { PALETTE } from '../../js/core/chart/chart-data-prep.js';

const ID = 'mosaic';
const INST = 'mos-1';
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

/** Arbeitsblatt mit den Kategorienspalten „Werk“ (`cx`) und „Status“ (`cg`). */
const SHEET = () => ({
  sheets: [{
    id: 's1',
    state: {
      rowCount: 6,
      columns: [
        { id: 'cx', name: 'Werk', type: 'text', values: ['A', 'A', 'A', 'B', 'B', 'C'] },
        { id: 'cg', name: 'Status', type: 'text', values: ['OK', 'OK', 'NIO', 'OK', 'NIO', 'NIO'] },
      ],
    },
  }],
});
const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });
/** Gespeicherter Stand der neuen Form. */
const stored = (over = {}) => ({
  ...new State().toJSON(),
  datasets: [{ x: ref('cx'), g: ref('cg') }],
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

suite('mosaic: Viewmodel im Browser', () => {
  test('beide Slots: Konfiguration ohne Titel, x-Achse aus dem Spaltennamen, Gruppen mit Palettenfarbe', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertTrue(vm.hasSeries, 'keine Kreuztabelle');
    assertDeepEqual(JSON.parse(JSON.stringify(vm.mosaicChart)), {
      title: '', showTitle: false, xLabel: 'Werk', yLabel: '',
      categories: ['A', 'B', 'C'],
      groups: [
        { name: 'OK', values: [2, 1, 0], color: PALETTE[0] },
        { name: 'NIO', values: [1, 1, 1], color: PALETTE[1] },
      ],
    });
    assertEqual(vm.legacyEditKey, 'mosaic');
    assertEqual(h.charts.length, 1);
    assertEqual(h.charts[0].type, 'mosaic');
    assertTrue(h.container.querySelector('[data-ref="placeholder"]').style.display === 'none', 'Platzhalter sichtbar');
  });

  test('Kreuztabelle: Ecke, Köpfe, Zeilen, Summen und Farbfeld', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertEqual(vm.statsCorner, 'Werk \\ Status');
    assertDeepEqual(JSON.parse(JSON.stringify(vm.statsHeaders)), [{ name: 'OK', color: PALETTE[0] }, { name: 'NIO', color: PALETTE[1] }]);
    assertDeepEqual(JSON.parse(JSON.stringify(vm.statsRows)), [
      { label: 'A', cells: ['2', '1'], total: '3' },
      { label: 'B', cells: ['1', '1'], total: '2' },
      { label: 'C', cells: ['0', '1'], total: '1' },
    ]);
    assertDeepEqual([...vm.statsColTotals], ['3', '3']);
    assertEqual(vm.statsGrandTotal, '6');
    assertEqual(vm.swatchStyle({ color: '#123456' }), 'background:#123456');
    const table = h.container.querySelector('[data-ref="stats-panel"] table');
    assertEqual(table.querySelectorAll('tbody tr').length, 4);
    const swatch = table.querySelector('.mosaic-module__stats-color');
    assertTrue(swatch.getAttribute('style').replace(/\s/g, '').startsWith('background:'), 'Farbfeld ohne Farbe');
    assertEqual(table.querySelectorAll('thead th')[1].textContent, ' OK');
    assertDeepEqual(JSON.parse(JSON.stringify(vm.stats)), {
      categories: ['A', 'B', 'C'],
      groups: [{ name: 'OK', counts: [2, 1, 0] }, { name: 'NIO', counts: [1, 1, 1] }],
      rowTotals: [3, 2, 1], colTotals: [3, 3], total: 6,
    });
  });

  test('Tausenderzahlen wie formatNum der Altform: mit Gruppierung', async () => {
    const sheet = SHEET();
    const [cx, cg] = sheet.sheets[0].state.columns;
    cx.values = Array.from({ length: 1200 }, () => 'A');
    cg.values = Array.from({ length: 1200 }, () => 'OK');
    sheet.sheets[0].state.rowCount = 1200;
    const h = await mount(stored(), { sheet });
    assertEqual(h.vm().statsGrandTotal, '1.200');
  });

  test('nur ein Slot: Platzhalter mit Text, kein Diagramm, Ecke mit Rückfalltext', async () => {
    const h = await mount(stored({ datasets: [{ x: ref('cx'), g: null }] }));
    const vm = h.vm();
    assertEqual(vm.hasSeries, false);
    assertEqual(vm.stats, null);
    assertEqual(vm.statsCorner, `Werk \\ ${tr('statG')}`);
    const ph = h.container.querySelector('[data-ref="placeholder"]');
    assertTrue(ph.style.display !== 'none', 'Platzhalter verborgen');
    assertEqual(ph.textContent.trim(), tr('placeholderPickBoth'));
    assertEqual(h.container.querySelector('[data-ref="chart-area"]'), null);
    assertEqual(h.charts.length, 0);
  });

  test('referenzierte Spalte gelöscht: Bezug bleibt im Model, kein Diagramm, stats null, kein Wurf', async () => {
    const sheet = SHEET();
    sheet.sheets[0].state.columns.splice(1, 1);
    const h = await mount(stored(), { sheet });
    const vm = h.vm();
    assertDeepEqual(JSON.parse(JSON.stringify(vm.model.datasets[0].g)), ref('cg'));
    assertEqual(vm.hasSeries, false);
    assertEqual(vm.stats, null);
    assertEqual(vm.statsCorner, `Werk \\ ${tr('statG')}`);
    assertEqual(h.container.querySelector('[data-ref="chart-area"]'), null);
  });

  test('Altprojekt: chartEdits gewinnen über das Model, Alteintrag gelöscht, kein Verlaufsschritt', async () => {
    const legacy = {
      xRef: ref('cx'),
      gRef: ref('cg'),
      chartConfig: { title: 'Modelltitel', showTitle: true, showLegend: true, showCellLabels: false, columnGap: 6, segmentGap: 1, bgColor: '#fff8e1' },
      exampleWorksheetId: null,
    };
    const h = await mount(legacy, { chartEdits: { [INST]: { mosaic: { title: 'Legacy', showTitle: true, showLegend: false, segmentGap: 4 } } } });
    const vm = h.vm();
    assertDeepEqual(JSON.parse(JSON.stringify(vm.model.chart)), {
      title: 'Legacy', showTitle: true, showLegend: false, segmentGap: 4,
      showCellLabels: false, columnGap: 6, bgColor: '#fff8e1',
    });
    assertEqual(Object.keys(h.chartEdits[INST].mosaic).length, 0, 'Alteintrag nicht gelöscht');
    assertEqual(h.shown().title, 'Legacy');
    assertEqual(h.shown().showTitle, true);
    assertEqual(h.shown().showLegend, false);
    assertEqual(h.shown().segmentGap, 4);
    assertEqual(h.shown().columnGap, 6);
    assertEqual(h.shown().bgColor, '#fff8e1');
    assertEqual(mod.historyCan('undo'), false);
  });
});
