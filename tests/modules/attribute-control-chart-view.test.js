/**
 * Attributive Regelkarte: das Viewmodel im Browser (viewmodel/viewmodel.js)
 * mit dem echten Modul, einem Fake-stateManager mit Arbeitsblatt und einem
 * Fake-chartManager. Prüft die reaktive Ableitung, das Diagramm über
 * das Diagramm-Widget, die Lesefläche und das Regel-Kästchen.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { ATTRIBUTE_CHART_TYPES } from '../../js/engines/attribute-control-chart-engine.js';
import mod from '../../js/modules/attribute-control-chart/viewmodel/viewmodel.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { checkValue } from '../../js/core/model.js';
import controlChart from '../../js/widgets/control-chart/schema.js';
import { WIDGET_I18N } from '../widget-i18n.js';

const ID = 'attribute-control-chart';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;

const D = { instanceId: 'ws1', sheetId: 's1', columnId: 'c0' };
const cState = { chartTypeId: 'c', defectsRef: D };

/** Ein Arbeitsblatt mit Zahlenspalten `c0`, `c1`, … */
const sheetWith = (...cols) => ({
  sheets: [{
    id: 's1',
    name: 'Blatt',
    state: { columns: cols.map((values, i) => ({ id: `c${i}`, name: `Spalte ${i}`, type: 'numeric', values })) },
  }],
});

/** Phasen des Fake-Projekts: ein Arbeitsblatt in control. */
const PHASES = { control: [{ instanceId: 'ws1', moduleId: 'worksheet' }] };

let widgetsRegistered = false;
const flush = () => new Promise((r) => setTimeout(r, 0));
const mounted = [];

function ensureTemplate() {
  if (!Alpine.version) Alpine.start();
  if (!widgetsRegistered) { registerWidgetDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS }); widgetsRegistered = true; }
  if (document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) return;
  // Schlankes Gerüst mit dem Namen und der x-widget-Bindung der echten Vorlage
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', TPL_KEY);
  tpl.innerHTML = '<div x-data="attributeControlChart">'
    + '<span class="acc-title" x-text="chartTitle"></span>'
    + '<div class="acc-plot" x-widget="control-chart" x-widget-config="controlChart" x-widget-value="model.controlChartEdits" x-widget-legacy-edit-key="legacyEditKeys.control"></div>'
    + '</div>';
  document.body.append(tpl);
}

/**
 * Modul mit Fake-Diensten einhängen.
 * @param {object} model gespeicherter Zustand der Instanz
 * @param {Record<string, any>} [sheets] Modulzustände der Arbeitsblätter
 */
async function mount(model, sheets = {}) {
  ensureTemplate();
  while (mounted.length) mounted.pop().remove();
  const states = { 'acc-1': model, ...sheets };
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
    instanceId: 'acc-1',
    stateManager: {
      getModuleState: (id) => states[id] ?? null,
      setModuleState: () => {},
      getProjectCycle: () => 'dmaic',
      get: (path) => {
        if (path === 'phases') return PHASES;
        const m = /^phases\.(.+)$/.exec(path);
        return m ? PHASES[m[1]] ?? [] : undefined;
      },
    },
    i18n: {
      t: (k) => k,
      tf: () => (k) => k,
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

suite('attribute-control-chart: Viewmodel im Browser', () => {
  test('Wert im Arbeitsblatt ändern rechnet neu', async () => {
    const { vm, states, bus } = await mount(cState, { ws1: sheetWith([3, 4, 2, 5, 3, 4, 3, 2, 4, 3]) });
    assertDeepEqual(vm().result.signals, []);
    states.ws1 = sheetWith([2, 2, 2, 2, 2, 2, 2, 2, 2, 30]);
    bus.emit('worksheet:dataChanged', { instanceId: 'ws1' });
    await flush();
    assertDeepEqual(vm().result.signals, [9]);
  });

  test('ein Diagramm über das Widget; Konfiguration ohne editKey, Listen statt Set und Zahl', async () => {
    const { chartCalls, vm } = await mount(cState, { ws1: sheetWith([2, 2, 2, 2, 2, 2, 2, 2, 2, 30]) });
    await flush();
    const creates = chartCalls.filter((c) => c[0] === 'create');
    assertEqual(creates.length, 1);
    assertEqual(creates[0][1], 'control-chart');
    const cfg = vm().controlChart;
    assertEqual(cfg.editKey, undefined);
    assertTrue(Array.isArray(cfg.violationIndices));
    assertDeepEqual(cfg.violationIndices, [9]);
    assertTrue(Array.isArray(cfg.cl));
    checkValue(controlChart.props.config, 'controlChart', cfg);
  });

  test('read(): Felder, Lesefelder, Punkte als Massenfeld', async () => {
    const { vm } = await mount(cState, { ws1: sheetWith([2, 2, 2, 2, 2, 2, 2, 2, 2, 30]) });
    const out = vm().read();
    assertEqual(out.chartTypeId, 'c');
    assertDeepEqual(out.activeColumnSlots, ['defectsRef']);
    assertDeepEqual(out.activeParams, ['chartTypeId', 'baselineCount', 'enabledRules']);
    assertDeepEqual(out.pickableColumns.defectsRef.map((c) => c.key), ['ws1|s1|c0']);
    assertEqual(out.result.valid, 10);
    assertDeepEqual(out.points, { $bulk: true, kind: 'table', rowCount: 10, columns: ['value', 'n', 'ucl', 'lcl', 'signal'] });
    assertTrue(!('exampleWorksheetId' in out));
  });

  test('p: Spaltenrollen defectsRef und sizeRef', async () => {
    const { vm } = await mount({ chartTypeId: 'p', defectsRef: D }, { ws1: sheetWith([3, 4, 2, 5]) });
    assertDeepEqual(vm().activeColumnSlots, ['defectsRef', 'sizeRef']);
    assertDeepEqual(Object.keys(vm().pickableColumns), ['defectsRef', 'sizeRef']);
  });

  test('chartTypes: Optionen kommen aus der Engine', async () => {
    const { vm } = await mount(cState, { ws1: sheetWith([3, 4, 2, 5]) });
    assertDeepEqual(vm().chartTypes.map((o) => o.value), ATTRIBUTE_CHART_TYPES.map((c) => c.id));
    assertDeepEqual(vm().chartTypes.filter((o) => o.selected).map((o) => o.value), ['c']);
    assertTrue(vm().chartTypes.every((o) => typeof o.label === 'string' && o.label.length > 0));
  });

  test('np: constantN aktiv, size nicht', async () => {
    const { vm } = await mount({ chartTypeId: 'np', defectsRef: D, constantN: 100 }, { ws1: sheetWith([3, 4, 2, 5]) });
    assertDeepEqual(vm().activeParams, ['chartTypeId', 'constantN', 'baselineCount', 'enabledRules']);
    assertEqual(vm().requiresConstantN, true);
    assertEqual(vm().requiresSampleSize, false);
  });

  test('ruleChanged geht über toggleRule', async () => {
    const { vm } = await mount(cState, { ws1: sheetWith([3, 4, 2, 5]) });
    vm().ruleChanged({ id: 5 }, { target: { checked: true } });
    vm().ruleChanged({ id: 2 }, { target: { checked: true } });
    assertDeepEqual([...vm().model.enabledRules], [1, 2, 5]);
  });
});
