/**
 * Hypothesentest: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem
 * echten Modul, einem Fake-stateManager mit Arbeitsblatt und einem
 * Fake-chartManager. Prüft die reaktive Ableitung, die vier Residuendiagramme,
 * die Lesefläche und den Fehlerpfad der Ableitung.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/hypothesis-test/viewmodel/viewmodel.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { checkValue } from '../../js/core/model.js';
import scatterChart from '../../js/widgets/scatter-chart/schema.js';
import probabilityPlotChart from '../../js/widgets/probability-plot-chart/schema.js';
import histogramChart from '../../js/widgets/histogram-chart/schema.js';
import { residualCharts } from '../../js/modules/hypothesis-test/viewmodel/present.js';
import { WIDGET_I18N } from '../widget-i18n.js';

const ID = 'hypothesis-test';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;

const A = [10.1, 10.4, 9.8, 10.2, 10.0, 10.3];
const B = [12.9, 13.2, 12.7, 13.0, 12.8, 13.4];
const C = [11.0, 11.6, 10.7, 11.2, 11.1, 11.5];

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
  tpl.innerHTML = '<div x-data="hypothesisTest">'
    + '<span class="ht-error" x-text="errorText"></span>'
    + '<div class="ht-fits" x-widget="scatter-chart" x-widget-config="residFitted" x-widget-value="model.residFittedChart" x-widget-legacy-edit-key="legacyEditKeys.fitted"></div>'
    + '<div class="ht-normal" x-widget="probability-plot-chart" x-widget-config="residProb" x-widget-value="model.residProbChart" x-widget-legacy-edit-key="legacyEditKeys.prob"></div>'
    + '<div class="ht-hist" x-widget="histogram-chart" x-widget-config="residHist" x-widget-value="model.residHistChart" x-widget-legacy-edit-key="legacyEditKeys.hist"></div>'
    + '<div class="ht-order" x-widget="scatter-chart" x-widget-config="residOrder" x-widget-value="model.residOrderChart" x-widget-legacy-edit-key="legacyEditKeys.order"></div>'
    + '</div>';
  document.body.append(tpl);
}

/**
 * Modul mit Fake-Diensten einhängen.
 * @param {object} model gespeicherter Zustand der Instanz
 * @param {Record<string, any>} [sheets] Modulzustände weiterer Instanzen
 * @param {Record<string, any>} [settings] Werte für `stateManager.get`
 */
async function mount(model, sheets = {}, settings = {}) {
  ensureTemplate();
  while (mounted.length) mounted.pop().remove();
  const states = { 'ht-1': model, ...sheets };
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
    instanceId: 'ht-1',
    stateManager: {
      getModuleState: (id) => {
        if (id === 'wsBad') throw new Error('Blatt kaputt');
        return states[id] ?? null;
      },
      setModuleState: () => {},
      getProjectCycle: () => 'dmaic',
      get: (k) => settings[k],
    },
    i18n: {
      t: (k) => k,
      tf: () => (k, p) => (p && p.message ? `${k}|${p.message}` : k),
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

const twoSamples = (a = ref(0), b = ref(1)) => ({
  category: 'mean', testType: 'two', direction: 'two-sided', alpha: 0.05, colRef1: a, colRef2: b,
});

suite('hypothesis-test: Viewmodel im Browser', () => {
  test('frisches Modul bei 90 %: α 0,10 und kein Inhalt', async () => {
    const { vm } = await mount(null, {}, { 'settings.confidenceLevel': 90 });
    assertEqual(vm().model.alpha, 0.1);
    assertEqual(vm().model.hasContent(), false);
  });

  test('Wert im Arbeitsblatt ändern rechnet neu', async () => {
    const { vm, states, bus } = await mount(twoSamples(), { ws1: sheetWith(A, B) });
    assertEqual(vm().result.status, 'ok');
    const before = vm().result.main.p;
    assertTrue(typeof before === 'number');
    states.ws1 = sheetWith(A, [25, ...B.slice(1)]);
    bus.emit('worksheet:dataChanged', { instanceId: 'ws1' });
    await flush();
    assertEqual(vm().result.status, 'ok');
    assertTrue(vm().result.main.p !== before, 'p-Wert blieb stehen');
    assertEqual(vm().errorText, '');
  });

  test('noch keine Spalten gewählt: insufficient, kein Hinweis, display ist null', async () => {
    const { vm } = await mount({ category: 'mean', testType: 'two' }, { ws1: sheetWith(A, B) });
    assertEqual(vm().result.status, 'insufficient');
    assertEqual(vm().display, null);
    assertEqual(vm().errorText, '');
  });

  test('gepaart mit zu wenigen Paaren: errorText nennt den Grund', async () => {
    const short = [[1, 2, null, null], [2, 3, 4, null]];
    const { vm } = await mount({
      category: 'mean', testType: 'paired', colRef1: ref(0), colRef2: ref(1),
    }, { ws1: sheetWith(...short) });
    assertEqual(vm().result.status, 'insufficient');
    assertEqual(vm().errorText, 'pairedTooFew');
    assertEqual(vm().display, null);
  });

  test('vier Residuendiagramme bei k Stichproben über Widgets, Konfiguration ohne editKey', async () => {
    const { chartCalls, vm } = await mount({
      category: 'mean', testType: 'k', direction: 'two-sided', alpha: 0.05, colRefsK: [ref(0), ref(1), ref(2)],
    }, { ws1: sheetWith(A, B, C) });
    await flush();
    assertEqual(vm().result.status, 'ok');
    const created = chartCalls.filter((c) => c[0] === 'create');
    assertEqual(created.length, 4);
    assertDeepEqual(created.map((c) => c[1]).sort(), ['histogram', 'probability-plot', 'scatter', 'scatter']);
    assertTrue(created.every((c) => c[2].editKey === undefined));
  });

  test('residualCharts: vier Konfigurationen, die das Widget-Schema besteht', async () => {
    const { vm } = await mount({
      category: 'mean', testType: 'k', direction: 'two-sided', alpha: 0.05, colRefsK: [ref(0), ref(1), ref(2)],
    }, { ws1: sheetWith(A, B, C) });
    const t = (k) => k;
    const charts = residualCharts(vm().result, t);
    const n = A.length + B.length + C.length;
    assertDeepEqual(Object.keys(charts), ['fitted', 'prob', 'hist', 'order']);
    for (const c of Object.values(charts)) assertEqual(c.editKey, undefined);
    assertEqual(charts.fitted.series[0].x.length, n);
    assertEqual(charts.prob.series[0].values.length, n);
    assertEqual(charts.hist.data.length, n);
    checkValue(scatterChart.props.config, 'fitted', charts.fitted);
    checkValue(probabilityPlotChart.props.config, 'prob', charts.prob);
    checkValue(histogramChart.props.config, 'hist', charts.hist);
    checkValue(scatterChart.props.config, 'order', charts.order);
  });

  test('zwei Stichproben: keine Residuendiagramme', async () => {
    const { chartCalls, vm } = await mount(twoSamples(), { ws1: sheetWith(A, B) });
    await flush();
    assertEqual(vm().residFitted, null);
    assertEqual(chartCalls.filter((c) => c[0] === 'create').length, 0);
  });

  test('read() liefert result als JSON-Kopie mit Zahlen, ohne exampleWorksheetId', async () => {
    const { vm } = await mount(twoSamples(), { ws1: sheetWith(A, B) });
    const out = vm().read();
    assertEqual(typeof out.result.main.statistic, 'number');
    assertEqual(typeof out.result.main.p, 'number');
    assertTrue(!('exampleWorksheetId' in out));
    // Kopie: die Änderung am Lesewert berührt die Ableitung nicht
    out.result.main.p = -1;
    assertTrue(vm().result.main.p !== -1);
    assertDeepEqual(JSON.parse(JSON.stringify(out.result)), out.result);
  });

  test('describe: result ist ein abgeleitetes Feld vom Typ object|null', () => {
    const f = mod.agentEntry.fields.result;
    assertTrue(f !== undefined, 'kein Feld result');
    assertEqual(f.derived, true);
    assertEqual(f.type, 'object|null');
    // die Felder des Models sind nicht abgeleitet
    assertTrue(mod.agentEntry.fields.alpha.derived !== true);
  });

  test('wirft die Ableitung, ist result { error } und errorText zeigt analysisFailed', async () => {
    const { vm } = await mount(twoSamples(ref(0, 'wsBad'), ref(1, 'wsBad')));
    assertDeepEqual(vm().result, { error: 'Blatt kaputt' });
    assertEqual(vm().display, null);
    assertEqual(vm().errorText, 'analysisFailed|Blatt kaputt');
  });
});

suite('hypothesis-test: reine Getter des Viewmodels', () => {
  const withModel = (m) => mount({ category: 'mean', testType: 'two', direction: 'two-sided', alpha: 0.05, ...m });

  test('activeClass markiert genau den gewählten Wert', async () => {
    const { vm } = await withModel({ direction: 'greater' });
    assertEqual(vm().activeClass('direction', 'greater'), 'btn--active');
    assertEqual(vm().activeClass('direction', 'less'), '');
  });

  test('Rasterklasse der Testart-Reihe nur bei Mittelwert', async () => {
    assertEqual((await withModel({ category: 'mean' })).vm().testTypeRowClass, 'hyptest__toggle-row--grid');
    assertEqual((await withModel({ category: 'variance' })).vm().testTypeRowClass, '');
  });

  test('Spaltenbeschriftungen und zweite Spalte folgen der Testart', async () => {
    let v = (await withModel({ testType: 'paired' })).vm();
    assertEqual([v.sample1Label, v.sample2Label, v.needsSecondColumn].join('|'), 'pairedColumn1|pairedColumn2|true');
    v = (await withModel({ testType: 'two' })).vm();
    assertEqual([v.sample1Label, v.sample2Label, v.needsSecondColumn].join('|'), 'sample1Column|sample2Column|true');
    v = (await withModel({ testType: 'one' })).vm();
    assertEqual(v.needsSecondColumn, false);
    assertEqual(v.sample1Label, 'sample1Column');
  });

  test('Zielwert-Überschrift: Mittelwert oder Varianz', async () => {
    assertEqual((await withModel({ testType: 'one', category: 'mean' })).vm().targetTitle, 'targetMean');
    assertEqual((await withModel({ testType: 'one', category: 'variance' })).vm().targetTitle, 'targetVariance');
  });

  test('Annahme gleicher Varianzen: nur Mittelwert mit zwei oder k Stichproben, Text je Art', async () => {
    const flag = async (category, testType) => (await withModel({ category, testType })).vm();
    assertEqual((await flag('mean', 'two')).showEqualVariances, true);
    assertEqual((await flag('mean', 'k')).showEqualVariances, true);
    assertEqual((await flag('mean', 'one')).showEqualVariances, false);
    assertEqual((await flag('mean', 'paired')).showEqualVariances, false);
    assertEqual((await flag('variance', 'two')).showEqualVariances, false);
    assertEqual((await flag('mean', 'two')).equalVariancesLabel, 'assumeEqualVariances');
    assertEqual((await flag('mean', 'k')).equalVariancesLabel, 'assumeEqualVariancesK');
  });

  test('ohne Ergebnis: Anzeige-Getter fallen auf ihre neutralen Werte zurück', async () => {
    const v = (await withModel({})).vm();
    assertEqual(v.display, null);
    assertEqual(v.pairedNote, '');
    assertEqual(v.normLayoutClass, 'hyptest__contents');
    assertEqual(v.normalDotClass, 'hyptest__trail-dot--fail');
    assertEqual(v.normalAnswer, 'no');
    assertEqual(v.varTrailDotClass, 'hyptest__trail-dot--fail');
    assertEqual(v.varTrailAnswer, 'no');
    assertEqual(v.varTrailLabel, 'varEqual');
    assertEqual(v.varDecisionClass, 'hyptest__decision--reject');
    assertEqual(v.varDecisionText, 'varUnequal');
  });

  test('Anzeige in der App-Sprache: Komma und Intervall mit Semikolon', async () => {
    const { vm } = await mount({ ...twoSamples() }, { ws1: sheetWith(A, C) });
    const shown = vm().display.main.metrics.map((x) => x.value).join(' ');
    assertTrue(/\d,\d{4}/.test(shown), shown);
    assertTrue(/\[[^\]]*\d,\d{4}; [^\]]*\]/.test(shown), shown);
  });

  test('normale Zwei-Stichproben-Daten: Normalitäts-Getter bejahen, Varianzweg nach Annahme', async () => {
    const { vm } = await mount({ ...twoSamples(), equalVariances: true }, { ws1: sheetWith(A, C) });
    const v = vm();
    assertEqual(v.normalAnswer, 'yes');
    assertEqual(v.normalDotClass, 'hyptest__trail-dot--pass');
    assertEqual(v.normLayoutClass, 'hyptest__contents');
    assertEqual(v.varTrailAnswer, 'yes');
    assertEqual(v.varDecisionClass, 'hyptest__decision--accept');
    assertEqual(v.varDecisionText, 'varEqual');
  });

  test('k Stichproben: Raster für die Normalitätskarten', async () => {
    const { vm } = await mount({ category: 'mean', testType: 'k', direction: 'two-sided', alpha: 0.05, colRefsK: [ref(0), ref(1), ref(2)] }, { ws1: sheetWith(A, B, C) });
    assertEqual(vm().normLayoutClass, 'hyptest__norm-grid');
  });

  test('gepaart mit fehlenden Werten: pairedNote nennt die verworfenen Zeilen', async () => {
    const { vm } = await mount(
      { category: 'mean', testType: 'paired', direction: 'two-sided', alpha: 0.05, targetValue: '0', colRef1: ref(0), colRef2: ref(1) },
      { ws1: sheetWith([1, 2, 3.5, 4, null, 6.5], [1.2, 2.1, 3.9, 4.4, 5, null]) },
    );
    assertEqual(vm().display.pairInfo.dropped, 2);
    assertEqual(vm().pairedNote, 'pairedDropped');
  });

  test('previewH0/previewH1 kommen aus dem Modell', async () => {
    const v = (await withModel({ category: 'mean', testType: 'two', direction: 'greater' })).vm();
    assertEqual(v.previewH0, 'H₀: μ₁ ≤ μ₂');
    assertEqual(v.previewH1, 'H₁: μ₁ > μ₂');
  });
});
