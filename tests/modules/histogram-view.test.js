/**
 * Histogramm: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem
 * echten Modul, einem Fake-stateManager mit Arbeitsblatt und einem
 * Fake-chartManager. Prüft Reihen, Kennzahlen, Diagrammkonfiguration,
 * Fehlertext, Klasseneinteilung und die Lesefläche.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/histogram/viewmodel/viewmodel.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { CHART_COLORS_RGBA } from '../../js/core/chart/chart-colors.js';
import { WIDGET_I18N } from '../widget-i18n.js';

const ID = 'histogram';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;

/** Die Texte, die die Prüfungen lesen; sonst der Schlüssel. */
const TEXTS = {
  chartTitle: 'Histogramm',
  xLabel: 'Messwert',
  yLabel: 'Häufigkeit',
  errTooFew: 'Zu wenig Werte für Spalte "{col}".',
};
const fill = (s, p) => (p ? s.replace(/\{(\w+)\}/g, (_, k) => String(p[k])) : s);

const sheetWith = (...cols) => ({
  sheets: [{
    id: 's1',
    state: { columns: cols.map((values, i) => ({ id: `c${i}`, name: `Spalte ${i}`, shortName: `S${i}`, values })) },
  }],
});
const ref = (i, instanceId = 'ws1') => ({ instanceId, sheetId: 's1', columnId: `c${i}` });

let widgetsRegistered = false;
const flush = () => new Promise((r) => setTimeout(r, 0));
const mounted = [];

function ensureTemplate() {
  if (!Alpine.version) Alpine.start();
  if (!widgetsRegistered) { registerWidgetDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS }); widgetsRegistered = true; }
  if (document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) return;
  // Schlankes Gerüst mit dem Namen und den x-widget-Bindungen der echten Vorlage
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', TPL_KEY);
  tpl.innerHTML = '<div x-data="histogram">'
    + '<div class="field-error" data-ref="error-box" x-show="errorText" x-text="errorText"></div>'
    + '<div data-ref="placeholder" x-show="!hasSeries">leer</div>'
    + '<template x-if="hasSeries"><div data-ref="chart-area">'
    + '<div data-ref="chart" x-widget="histogram-chart" x-widget-config="histogram" x-widget-value="model.histogramChart"></div>'
    + '<div data-ref="stats-panel" x-show="model.showStats" x-widget="stats-table" x-widget-rows="stats" x-widget-conf-level="model.confLevel"></div>'
    + '</div></template>'
    + '</div>';
  document.body.append(tpl);
}

/**
 * Modul mit Fake-Diensten einhängen.
 * @param {object|null} model gespeicherter Zustand der Instanz
 * @param {Record<string, any>} [sheets] Modulzustände weiterer Instanzen
 */
async function mount(model, sheets = {}) {
  ensureTemplate();
  while (mounted.length) mounted.pop().remove();
  const states = { 'hist-1': model, ...sheets };
  const handlers = [];
  const bus = {
    on: (name, fn) => handlers.push([name, fn]),
    off: (name, fn) => { const i = handlers.findIndex(([n, f]) => n === name && f === fn); if (i >= 0) handlers.splice(i, 1); },
    emit: (name, payload) => { for (const [n, f] of [...handlers]) if (n === name) f(payload); },
  };
  installWorksheetRevisions(bus);
  const chartCalls = [];
  const chartManager = {
    // Wie der echte Manager: das Diagramm trägt seine Konfiguration (das Widget liest `chart.config`).
    create: async (el, type, config) => { chartCalls.push(['create', type, config]); return { el, type, config: { ...config } }; },
    update: (chart, config) => { chartCalls.push(['update', chart.type, config]); Object.assign(chart.config, config); },
    destroy: () => {},
  };
  const context = {
    instanceId: 'hist-1',
    stateManager: {
      getModuleState: (id) => states[id] ?? null,
      setModuleState: () => {},
      getProjectCycle: () => 'dmaic',
      get: () => undefined,
    },
    i18n: {
      t: (k) => k,
      tf: () => (k, p) => (Object.hasOwn(TEXTS, k) ? fill(TEXTS[k], p) : k),
      getLanguage: () => 'de',
    },
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
  await flush();
  return {
    states, bus, chartCalls, container,
    vm: () => Alpine.$data(container.querySelector('[x-data]')),
  };
}

const one = (r = ref(0)) => ({ datasets: [{ valueRef: r, groupRef: null }] });
const shown = (el) => el.style.display !== 'none';

suite('histogram: Viewmodel im Browser', () => {
  test('ohne Datensatz: keine Reihen, Platzhalter sichtbar, kein Diagramm', async () => {
    const { vm, chartCalls, container } = await mount(null);
    assertEqual(vm().hasSeries, false);
    assertEqual(vm().histogram, null);
    assertTrue(shown(container.querySelector('[data-ref="placeholder"]')), 'Platzhalter verborgen');
    assertEqual(chartCalls.filter((c) => c[0] === 'create').length, 0);
  });

  test('eine Spalte: eine Reihe, Kennzahlen und Diagramm mit Titel', async () => {
    const { vm, chartCalls } = await mount(one(), { ws1: sheetWith([1, 2, 3, 4]) });
    await flush();
    const s = vm().series.series;
    assertEqual(s.length, 1);
    assertEqual(s[0].name, 'Spalte 0');
    assertEqual(s[0].fillColor, CHART_COLORS_RGBA[0]);
    assertEqual(vm().stats[0].stats.n, 4);
    const created = chartCalls.filter((c) => c[0] === 'create');
    assertEqual(created.length, 1);
    assertEqual(created[0][1], 'histogram');
    assertEqual(created[0][2].title, 'Histogramm: Spalte 0');
    assertEqual(created[0][2].xLabel, 'Messwert');
    assertEqual(created[0][2].binWidth, undefined);
  });

  test('Gruppenspalte mit zwei Stufen: zwei Reihen „Spalte — Stufe“', async () => {
    const { vm } = await mount(
      { datasets: [{ valueRef: ref(0), groupRef: ref(1) }] },
      { ws1: sheetWith([1, 2, 3, 4, 5, 6], ['a', 'b', 'a', 'b', 'a', 'b']) },
    );
    assertDeepEqual(vm().series.series.map((x) => x.name), ['Spalte 0 — a', 'Spalte 0 — b']);
  });

  test('ein Wert: errorText aus errTooFew, bleibt stehen, bis die Daten passen', async () => {
    const { vm, states, bus, container } = await mount(one(), { ws1: sheetWith([7]) });
    assertEqual(vm().errorText, 'Zu wenig Werte für Spalte "Spalte 0".');
    assertEqual(vm().hasSeries, false);
    assertDeepEqual(vm().stats, []);
    await new Promise((r) => setTimeout(r, 50));
    assertTrue(shown(container.querySelector('[data-ref="error-box"]')), 'Fehler verschwand');
    states.ws1 = sheetWith([7, 8, 9]);
    bus.emit('worksheet:dataChanged', { instanceId: 'ws1' });
    await flush();
    assertEqual(vm().errorText, '');
    assertEqual(vm().hasSeries, true);
  });

  test('setBinMode manual mit Breite → binWidth in der Konfiguration; auto → ohne', async () => {
    const { vm } = await mount(one(), { ws1: sheetWith([1, 2, 3, 4]) });
    vm().model.setBinMode({ binMode: 'manual' });
    vm().model.binWidth = 0.5;
    await flush();
    assertEqual(vm().isManual, true);
    assertEqual(vm().histogram.binWidth, 0.5);
    assertDeepEqual(vm().binModeOptions.map((o) => [o.value, o.selected]), [['auto', false], ['manual', true]]);
    vm().model.setBinMode({ binMode: 'auto' });
    await flush();
    assertEqual(vm().model.binWidth, null);
    assertTrue(!('binWidth' in vm().histogram), 'binWidth bei auto');
  });

  test('Arbeitsblatt ändert sich: neue Reihen ohne Neuaufbau des Moduls', async () => {
    const { vm, states, bus, container } = await mount(one(), { ws1: sheetWith([1, 2, 3, 4]) });
    // Alpine.$data liefert je Aufruf einen neuen Proxy: die Wurzel vergleichen
    const before = container.querySelector('[x-data]');
    states.ws1 = sheetWith([1, 2, 3, 4, 5, 6]);
    bus.emit('worksheet:dataChanged', { instanceId: 'ws1' });
    await flush();
    assertTrue(container.querySelector('[x-data]') === before, 'Komponente neu aufgebaut');
    assertEqual(vm().series.series[0].values.length, 6);
    assertEqual(vm().stats[0].stats.n, 6);
  });

  test('im Editor ausgeblendete Reihe fehlt in den Kennzahlen', async () => {
    const { vm } = await mount(
      { datasets: [{ valueRef: ref(0), groupRef: null }, { valueRef: ref(1), groupRef: null }] },
      { ws1: sheetWith([1, 2, 3, 4], [5, 6, 7, 8]) },
    );
    assertEqual(vm().stats.length, 2);
    vm().model.histogramChart = { series: [{ name: 'Spalte 1', visible: false }] };
    await flush();
    assertDeepEqual(vm().stats.map((r) => r.name), ['Spalte 0']);
  });

  test('im Editor ausgeblendete Reihe fehlt im Titel', async () => {
    const { vm } = await mount(
      { datasets: [{ valueRef: ref(0), groupRef: null }, { valueRef: ref(1), groupRef: null }] },
      { ws1: sheetWith([1, 2, 3, 4], [5, 6, 7, 8]) },
    );
    assertEqual(vm().histogram.title, 'Histogramm: Spalte 0, Spalte 1');
    vm().model.histogramChart = { series: [{ name: 'Spalte 1', visible: false }] };
    await flush();
    assertEqual(vm().histogram.title, 'Histogramm: Spalte 0');
  });

  test('Altstand: umbenannte Reihe behält ihre Füllfarbe über den Index', async () => {
    const { vm } = await mount({ ...one(), seriesOverrides: [{ name: 'Alter Name', fillColor: 'red' }] }, { ws1: sheetWith([1, 2, 3, 4]) });
    await flush();
    assertEqual(vm().series.series[0].name, 'Spalte 0');
    assertEqual(vm().series.series[0].fillColor, 'red');
  });
  test('Altstand: Gruppenreihen und dieselbe Spalte doppelt bekommen je ihren Eintrag', async () => {
    const g = mount({ datasets: [{ valueRef: ref(0), groupRef: ref(1) }], seriesOverrides: [{ fillColor: 'red' }, { fillColor: 'blue' }] },
      { ws1: sheetWith([1, 2, 3, 4], ['a', 'a', 'b', 'b']) });
    const { vm } = await g;
    await flush();
    assertDeepEqual(vm().series.series.map((x) => x.fillColor), ['red', 'blue']);
    const d = await mount({ datasets: [{ valueRef: ref(0), groupRef: null }, { valueRef: ref(0), groupRef: null }], seriesOverrides: [{ fillColor: 'red' }, { fillColor: 'blue' }] },
      { ws1: sheetWith([1, 2, 3, 4]) });
    await flush();
    assertDeepEqual(d.vm().series.series.map((x) => x.fillColor), ['red', 'blue']);
  });
  test('Altstand: eine Einstellung des Editors nach Reihenname gewinnt gegen den alten Eintrag', async () => {
    const { vm } = await mount({ ...one(), seriesOverrides: [{ fillColor: 'red' }] },
      { ws1: sheetWith([1, 2, 3, 4]) });
    await flush();
    vm().model.histogramChart = { series: [{ name: 'Spalte 0', fillColor: 'green' }] };
    await flush();
    assertEqual(vm().shown[0].fillColor, 'green');
  });
  test('Altstand: andere Datensätze verwerfen die alten Einträge', async () => {
    const { vm } = await mount({ ...one(), seriesOverrides: [{ fillColor: 'red' }] }, { ws1: sheetWith([1, 2, 3, 4], [5, 6, 7, 8]) });
    await flush();
    assertEqual(vm().series.series[0].fillColor, 'red');
    vm().model.datasets = [{ valueRef: ref(1), groupRef: null }];
    await flush();
    assertDeepEqual(vm().model.legacySeries, []);
    assertEqual(vm().series.series[0].fillColor, CHART_COLORS_RGBA[0]);
  });

  test('read(): Felder und Kennzahlen, keine alten Hilfsfelder', async () => {
    const { vm } = await mount(one(), { ws1: sheetWith([1, 2, 3, 4]) });
    const out = vm().read();
    for (const k of ['datasets', 'binMode', 'binWidth', 'confLevel', 'stats']) assertTrue(k in out, `read() ohne ${k}`);
    for (const k of ['activeParams', 'pickableColumns', 'activeColumnSlots']) assertTrue(!(k in out), `read() mit ${k}`);
    assertEqual(typeof out.stats[0].stats.mean, 'number');
    assertEqual(out.stats[0].stats.n, 4);
  });
});
