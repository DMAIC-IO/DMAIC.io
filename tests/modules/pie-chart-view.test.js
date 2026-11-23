/**
 * Tortendiagramm: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem
 * echten Modul und der echten Vorlage, einem Fake-stateManager mit
 * Arbeitsblatt und einem Fake-chartManager. Prüft Getter, Segmenttabelle,
 * den Fall „referenzierte Spalte gelöscht“ und das Altprojekt mit der
 * Übernahme alter chartEdits beim Einhängen.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/pie-chart/viewmodel/viewmodel.js';
import { State } from '../../js/modules/pie-chart/domain/model.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import { withStoredWorksheetReader } from '../helpers/worksheet-reader.js';
import { PALETTE } from '../../js/core/chart/chart-data-prep.js';

const ID = 'pie-chart';
const INST = 'pie-1';
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

/** Arbeitsblatt mit der Beschriftungsspalte „Art“ (`cl`) und der Wertespalte „Anzahl“ (`cv`). */
const SHEET = () => ({
  sheets: [{
    id: 's1',
    state: {
      rowCount: 4,
      columns: [
        { id: 'cl', name: 'Art', type: 'text', values: ['Kratzer', 'Risse', 'Kratzer', 'Sonstige'] },
        { id: 'cv', name: 'Anzahl', type: 'numeric', values: [30, 15, 10.5, 4.5] },
      ],
    },
  }],
});
const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });
/** Gespeicherter Stand der neuen Form. */
const stored = (over = {}) => ({
  ...new State().toJSON(),
  datasets: [{ value: ref('cv'), label: ref('cl') }],
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

suite('pie-chart: Viewmodel im Browser', () => {
  test('Wert und Beschriftung: Konfiguration mit Segmenten, Palettenfarben und den Beschriftungsvorgaben der Altform', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertTrue(vm.hasSlices, 'keine Segmente');
    assertDeepEqual(JSON.parse(JSON.stringify(vm.pieChart)), {
      slices: [
        { name: 'Kratzer', value: 40.5, color: PALETTE[0] },
        { name: 'Risse', value: 15, color: PALETTE[1] },
        { name: 'Sonstige', value: 4.5, color: PALETTE[2] },
      ],
      labelMode: 'both',
      labelSize: 11,
    });
    assertEqual(vm.legacyEditKey, 'pie');
    assertEqual(h.charts.length, 1);
    assertEqual(h.charts[0].type, 'pie');
    assertEqual(h.shown().labelMode, 'both');
    assertEqual(h.shown().labelSize, 11);
    assertTrue(h.container.querySelector('[data-ref="placeholder"]').style.display === 'none', 'Platzhalter sichtbar');
  });

  test('Segmenttabelle: Zeilen, Summe, Anteile, Farbfeld und Name', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertDeepEqual(JSON.parse(JSON.stringify(vm.statsRows)), [
      { color: PALETTE[0], name: 'Kratzer', value: '40,5', pct: '67,5\u00a0%' },
      { color: PALETTE[1], name: 'Risse', value: '15', pct: '25,0\u00a0%' },
      { color: PALETTE[2], name: 'Sonstige', value: '4,5', pct: '7,5\u00a0%' },
    ]);
    assertEqual(vm.statsTotal, '60');
    assertEqual(vm.statsTotalPct, '100,0\u00a0%');
    assertEqual(vm.swatchStyle({ color: '#123456' }), 'background:#123456');
    assertEqual(vm.sliceLabel({ name: 'Risse' }), ' Risse');
    const table = h.container.querySelector('[data-ref="stats-panel"] table.pie-chart__stats-table');
    assertTrue(!!table, 'keine Tabelle');
    const rows = table.querySelectorAll('tbody tr');
    assertEqual(rows.length, 4);
    const swatch = table.querySelector('.pie-chart__stats-color');
    assertTrue(swatch.getAttribute('style').replace(/\s/g, '').startsWith('background:'), 'Farbfeld ohne Farbe');
    assertEqual(rows[0].querySelectorAll('td')[0].textContent, ' Kratzer');
    assertTrue(rows[3].classList.contains('pie-chart__stats-total'), 'Summenzeile ohne Klasse');
    assertEqual(rows[3].getAttribute('style'), null);
    assertEqual(rows[3].querySelectorAll('td')[0].textContent, tr('statTotal'));
    assertEqual(rows[3].querySelectorAll('td')[1].textContent, '60');
    assertDeepEqual(JSON.parse(JSON.stringify(vm.stats)), {
      slices: [
        { name: 'Kratzer', value: 40.5, share: 40.5 / 60 },
        { name: 'Risse', value: 15, share: 15 / 60 },
        { name: 'Sonstige', value: 4.5, share: 4.5 / 60 },
      ],
      total: 60,
    });
  });

  test('nur Werte: Häufigkeit je Wert, kein Fehlerkasten', async () => {
    const h = await mount(stored({ datasets: [{ value: ref('cl'), label: null }] }));
    const vm = h.vm();
    assertDeepEqual(vm.pieChart.slices.map((s) => [s.name, s.value]), [['Kratzer', 2], ['Risse', 1], ['Sonstige', 1]]);
    assertEqual(h.container.querySelector('[data-ref="error-box"]'), null);
  });

  test('ohne Spalte: Platzhalter ohne Text, kein Diagramm, stats null', async () => {
    const h = await mount(new State().toJSON());
    const vm = h.vm();
    assertEqual(vm.hasSlices, false);
    assertEqual(vm.stats, null);
    const ph = h.container.querySelector('[data-ref="placeholder"]');
    assertTrue(ph.style.display !== 'none', 'Platzhalter verborgen');
    assertEqual(ph.textContent.trim(), '');
    assertEqual(h.container.querySelector('[data-ref="chart-area"]'), null);
    assertEqual(h.charts.length, 0);
  });

  for (const [slot, col] of [['value', 'cv'], ['label', 'cl']]) {
    test(`referenzierte Spalte gelöscht (${slot}): Bezug bleibt im Model, kein Diagramm, stats null, kein Wurf`, async () => {
      const sheet = SHEET();
      const cols = sheet.sheets[0].state.columns;
      cols.splice(cols.findIndex((c) => c.id === col), 1);
      const h = await mount(stored(), { sheet });
      const vm = h.vm();
      assertDeepEqual(JSON.parse(JSON.stringify(vm.model.datasets[0][slot])), ref(col));
      assertEqual(vm.hasSlices, false);
      assertEqual(vm.stats, null);
      assertDeepEqual([...vm.statsRows], []);
      assertTrue(h.container.querySelector('[data-ref="placeholder"]').style.display !== 'none', 'Platzhalter verborgen');
      assertEqual(h.container.querySelector('[data-ref="chart-area"]'), null);
      assertEqual(h.charts.length, 0);
    });
  }

  test('Altprojekt: chartEdits gewinnen über das Model, Alteintrag gelöscht, kein Verlaufsschritt', async () => {
    const legacy = {
      valueRef: ref('cv'),
      labelRef: ref('cl'),
      chartConfig: {
        showTitle: true, title: 'Modelltitel', titleSize: 15, showLegend: true, showLabels: true,
        labelMode: 'percent', labelSize: 11, innerRadius: 0.4, padAngle: 0.8, startAngle: -90,
        explodeDistance: 12, strokeColor: 'rgba(255,255,255,1)', strokeWidth: 2, sortSlices: 'desc',
        centerLabel: 'Σ', centerSub: '', bgColor: '#fff8e1',
      },
      exampleWorksheetId: null,
    };
    const h = await mount(legacy, { chartEdits: { [INST]: { pie: { title: 'Legacy', showTitle: true, showLegend: false, padAngle: 2 } } } });
    const vm = h.vm();
    assertDeepEqual(sorted(vm.model.chart), sorted({
      title: 'Legacy', showTitle: true, showLegend: false, padAngle: 2,
      labelMode: 'percent', innerRadius: 0.4, sortSlices: 'desc', centerLabel: 'Σ', bgColor: '#fff8e1',
    }));
    assertDeepEqual(JSON.parse(JSON.stringify(vm.model.datasets)), [{ value: ref('cv'), label: ref('cl') }]);
    assertEqual(Object.keys(h.chartEdits[INST].pie).length, 0, 'Alteintrag nicht gelöscht');
    const shown = h.shown();
    assertEqual(shown.title, 'Legacy');
    assertEqual(shown.showLegend, false);
    assertEqual(shown.padAngle, 2);
    assertEqual(shown.innerRadius, 0.4);
    assertEqual(shown.centerLabel, 'Σ');
    assertEqual(shown.labelMode, 'percent');
    assertEqual(shown.labelSize, 11);
    assertEqual(shown.sortSlices, 'desc');
    assertEqual(shown.bgColor, '#fff8e1');
    assertEqual(mod.historyCan('undo'), false);
  });
});
