/**
 * Zeitgewichtete Regelkarten: das Viewmodel im Browser (viewmodel/viewmodel.js)
 * mit dem echten Modul, der echten Vorlage, einem Fake-stateManager mit
 * Arbeitsblatt und einem Fake-chartManager. Prüft die Getter samt Vorlage je
 * Kartentyp (Teilkarten in einer Schleife über ein Objekt, Altschlüssel je
 * Teilkarte), die Zählung der Engine-Aufrufe (eine je wirksamer Änderung,
 * keine bei Parametern des anderen Typs, bei der σ-Methode mit σ-Vorgabe, bei
 * Phase I ≥ n statt leer und beim Neueinhängen), den Typwechsel mit
 * Rückgängig, Rückgängig nach λ, den Fehlerkasten bei Überlauf, den Fall
 * „referenzierte Spalte gelöscht“ und das Altprojekt mit der Übernahme alter
 * chartEdits je Teilkarte.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/time-weighted-chart/viewmodel/viewmodel.js';
import { State } from '../../js/modules/time-weighted-chart/domain/model.js';
import { engineRuns } from '../../js/modules/time-weighted-chart/domain/analyze.js';
import { setFields } from '../../js/core/model.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import { withStoredWorksheetReader } from '../helpers/worksheet-reader.js';
import {
  DURCHMESSER, WERT, LEGACY_RESULT, LEGACY_EWMA_RESULT, EXAMPLE_EWMA_RESULT,
} from './time-weighted-chart/analyze.test.js';

const ID = 'time-weighted-chart';
const INST = 'twc-1';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
const mounted = [];
let prepared = false;
let UI = null;

/** Text des Moduls mit `{name}` gefüllt; sonst der Schlüssel. */
function tr(key, params) {
  const v = key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), UI);
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

/** Werte um 1,7·10³⁰⁸: das Mittel der Phase I läuft über. */
const HUGE = [1.7e308, 1.6e308, 1.75e308, 1.65e308, 1.7e308, 1.62e308];

const COLS = [
  { id: 'd', name: 'Durchmesser', values: DURCHMESSER },
  { id: 'w', name: 'Wert', values: WERT },
  { id: 'huge', name: 'Riesig', values: HUGE },
];
const SHEET = (cols = COLS) => ({
  sheets: [{
    id: 's1',
    state: { rowCount: Math.max(...cols.map((c) => c.values.length), 0), columns: cols.map((c) => ({ type: 'numeric', ...c, values: [...c.values] })) },
  }],
});
const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });
const PARAMS = (o = {}) => ({ ewma: { lambda: 0.2, L: 3, ...o.ewma }, cusum: { kSigma: 0.5, hSigma: 4, ...o.cusum } });
const LEGACY_PARAMS = PARAMS({ ewma: { lambda: 0.1, L: 2.7 }, cusum: { hSigma: 5 } });
/** Gespeicherter Stand der neuen Form (Altprojekt-Werte). */
const stored = (over = {}) => ({
  ...new State().toJSON(), chartTypeId: 'cusum', columnRef: ref('d'), sigmaMethod: 'sd', baselineCount: 20,
  targetOverride: 25, params: LEGACY_PARAMS, ...over,
});
/** Das Beispiel `spc-time-weighted-ewma` in der neuen Form. */
const exampleEwma = () => ({ ...new State().toJSON(), columnRef: ref('w') });
/** Die Altform aus der Fixture `legacy-project.json` (ohne `_schema`). */
const LEGACY = {
  chartTypeId: 'cusum', columnRef: ref('d'), sigmaMethod: 'sd', baselineCount: 20, targetOverride: 25,
  sigmaOverride: null, lambda: 0.1, L: 2.7, kSigma: 0.5, hSigma: 5, exampleWorksheetId: null,
};
/** Die alten chartEdits der Fixture. */
const LEGACY_EDITS = () => ({
  [INST]: {
    cusum: { title: 'Legacy', showTitle: true, bgColor: '#eef6ff', yLabel: 'C (Legacy)' },
    ewma: { title: 'Legacy EWMA', showTitle: true },
  },
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
    create: async (el, type, config) => { const c = { el, type, config: { ...config }, alive: true }; charts.push(c); return c; },
    update: (chart, config) => { Object.assign(chart.config, config); },
    destroy: (chart) => { if (chart) chart.alive = false; },
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
  const vm = () => Alpine.$data(container.querySelector('[x-data]'));
  /** Die lebenden Diagramme, je Zeichenfläche. */
  const live = () => charts.filter((c) => c.alive && c.el.isConnected);
  return {
    states, charts, container, chartEdits, vm, live,
    /** Die Diagramme in der Zeichenfläche einer Teilkarte. */
    in: (key) => live().filter((c) => c.el.closest(`[data-chart-host="${key}"]`)),
    q: (sel) => container.querySelector(sel),
    qa: (sel) => [...container.querySelectorAll(sel)],
  };
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const text = (el) => el.textContent.trim();
/** Alle Getter und die Lesefläche lesen, wie Vorlage und Agent es tun. */
const readAll = (vm) => {
  vm.read();
  vm.read({ fields: ['points'] });
  void vm.hasResult; void vm.errorText; void vm.kpi; void vm.chartViews; void vm.typeHint;
  void vm.sectionParamsLabel; void vm.chartTypeOptions; void vm.sigmaMethodOptions;
  vm.shows('params.ewma.lambda'); vm.kpiIs('ewma');
};
/** Ein Eingabefeld oder eine Auswahl wie der Nutzer ändern. */
function type(el, value) {
  if (!el) throw new Error('Feld fehlt');
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
/** Engine-Aufrufe einer Änderung: ändern, alles lesen, nochmals lesen. */
async function runsOf(vm, change) {
  const before = engineRuns();
  change();
  await settle();
  readAll(vm);
  await settle();
  readAll(vm);
  return engineRuns() - before;
}
/** Die gelesenen Felder des Models. */
const DERIVED = ['result', 'points', 'activeParams', 'activeColumnSlots'];
const pick = (out, keys) => Object.fromEntries(keys.map((k) => [k, out[k]]));

suite('time-weighted-chart: Viewmodel im Browser', () => {
  test('CUSUM (Altprojekt-Daten): KPI-Leiste, zwei Teilkarten mit Altschlüsseln, Felder, Lesefläche', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertTrue(vm.hasResult, 'kein Ergebnis');
    assertEqual(vm.errorText, '');
    assertDeepEqual(plain(vm.kpi), {
      type: 'cusum', targetText: '25,0000', sigmaHatText: 'σ̂ = 0,0446', signals: 12, ofText: 'von 40 Datenpunkten',
      signalsClass: 'dmike-kpi--bad', hText: '0,2232', kText: 'k = 0,0223',
    });
    const out = vm.read({ fields: DERIVED });
    assertDeepEqual(plain(out.result), LEGACY_RESULT);
    assertEqual(out.points.length, 40);
    assertDeepEqual(plain(out.activeParams), ['chartTypeId', 'sigmaMethod', 'baselineCount', 'targetOverride', 'sigmaOverride', 'params.cusum.kSigma', 'params.cusum.hSigma']);
    assertDeepEqual(plain(out.activeColumnSlots), ['columnRef']);
    // Teilkarten: Objekt in Zeichenreihenfolge, Altschlüssel je Teilkarte.
    const views = vm.chartViews;
    assertDeepEqual(Object.keys(views), ['cusum_plus', 'cusum_minus']);
    assertEqual(views.cusum_plus.legacyEditKey, 'cusum');
    assertEqual(views.cusum_minus.legacyEditKey, 'cusum#2');
    assertEqual(views.cusum_plus.title, 'CUSUM C⁺ — Durchmesser');
    assertEqual(views.cusum_minus.title, 'CUSUM C⁻ — Durchmesser');
    assertDeepEqual(plain(views.cusum_plus.badge), { text: tr('unstable', { count: 12 }), cls: 'twc__badge--unstable', stable: false, unstable: true });
    assertDeepEqual(plain(views.cusum_minus.badge), { text: tr('stable'), cls: 'twc__badge--stable', stable: true, unstable: false });
    assertDeepEqual(plain(views.cusum_plus.config.ucl), [LEGACY_RESULT.h]);
    assertDeepEqual(plain(views.cusum_plus.config.violationIndices), LEGACY_RESULT.signalsHigh);
    assertDeepEqual(plain(views.cusum_minus.config.violationIndices), []);
    assertEqual(views.cusum_plus.config.yLabel, tr('yLabel_cusumHigh'));
    assertEqual(views.cusum_minus.config.yLabel, tr('yLabel_cusumLow'));
    assertEqual(vm.chartViews, views, 'Teilkarten bei gleicher Rechnung neu gebaut');
    // Vorlage: CUSUM-Satz der KPI-Leiste mit festen Ankern.
    assertEqual(h.qa('[data-ref="stats-bar"] .dmike-kpi').length, 3);
    assertDeepEqual(h.qa('.dmike-kpi-value').map(text), ['25,0000', '0,2232', '12']);
    assertDeepEqual(h.qa('.dmike-kpi-label').map(text), [tr('statTarget'), tr('statHLimit'), tr('statSignals')]);
    assertDeepEqual(h.qa('.dmike-kpi-sub').map(text), ['σ̂ = 0,0446', 'k = 0,0223', 'von 40 Datenpunkten']);
    assertDeepEqual(h.qa('.dmike-kpi-label').map((el) => el.getAttribute('data-help-key')), [
      `modules.${ID}.types.Result.target`, `modules.${ID}.types.Result.h`, `modules.${ID}.types.Result.signalsHigh`,
    ]);
    assertTrue(h.qa('.dmike-kpi')[2].classList.contains('dmike-kpi--bad'), 'Klasse der dritten Kachel');
    // Zwei Abschnitte mit Kopfzeile, Abzeichen und je einem Diagramm in der eigenen Zeichenfläche.
    const sections = h.qa('[data-ref="charts-wrap"] .twc__chart-section');
    assertEqual(sections.length, 2);
    assertDeepEqual(h.qa('.twc__chart-title').map(text), ['CUSUM C⁺ — Durchmesser', 'CUSUM C⁻ — Durchmesser']);
    assertDeepEqual(h.qa('.twc__plot-wrap').map((el) => el.getAttribute('data-chart-host')), ['cusum_plus', 'cusum_minus']);
    assertEqual(sections[0].querySelectorAll('[data-icon="status.warning"]').length, 1);
    assertEqual(sections[0].querySelectorAll('[data-icon="status.ok"]').length, 0);
    assertEqual(sections[1].querySelectorAll('[data-icon="status.ok"]').length, 1);
    assertEqual(sections[1].querySelectorAll('[data-icon="status.warning"]').length, 0);
    assertEqual(h.live().length, 2);
    assertEqual(h.in('cusum_plus').length, 1);
    assertEqual(h.in('cusum_minus').length, 1);
    assertTrue(h.live().every((c) => c.type === 'control-chart'), 'falscher Diagrammtyp');
    assertDeepEqual([...h.in('cusum_plus')[0].config.violationIndices], LEGACY_RESULT.signalsHigh);
    assertEqual(h.in('cusum_minus')[0].config.yLabel, tr('yLabel_cusumLow'));
    assertEqual(h.q('.twc__error'), null);
    // Eingaben: Auswahlen und Zahlenfelder als Text mit Dezimalkomma, ohne Bereichsattribute.
    assertEqual(h.q('[data-ref="chart-type"]').value, 'cusum');
    assertEqual(h.q('[data-ref="sigma-method"]').value, 'sd');
    assertDeepEqual(plain(vm.chartTypeOptions).map((o) => [o.value, o.selected]), [['ewma', false], ['cusum', true]]);
    assertDeepEqual(plain(vm.sigmaMethodOptions).map((o) => [o.value, o.label, o.selected]), [['mr', tr('sigma_mr'), false], ['sd', tr('sigma_sd'), true]]);
    assertEqual(vm.typeHint, tr('typeHint_cusum'));
    assertEqual(vm.sectionParamsLabel, tr('sectionParams_cusum'));
    assertEqual(h.q('[data-ref="lambda"]'), null);
    assertEqual(h.q('[data-ref="L"]'), null);
    assertEqual(vm.shows('params.ewma.lambda'), false);
    assertEqual(vm.shows('params.cusum.hSigma'), true);
    const fields = {
      'baseline-count': ['20', 'numeric'], 'target-override': ['25', 'decimal'], 'sigma-override': ['', 'decimal'],
      kSigma: ['0,5', 'decimal'], hSigma: ['5', 'decimal'],
    };
    for (const [r, [value, mode]] of Object.entries(fields)) {
      const el = h.q(`[data-ref="${r}"]`);
      assertEqual(el.type, 'text', `${r}: Eingabeart`);
      assertEqual(el.getAttribute('inputmode'), mode, `${r}: inputmode`);
      assertEqual(el.value, value, `${r}: Wert`);
      assertTrue(!el.hasAttribute('step') && !el.hasAttribute('min') && !el.hasAttribute('max'), `${r}: Bereichsattribute`);
    }
    assertEqual(h.q('[data-ref="baseline-count"]').getAttribute('placeholder'), tr('baselineAll'));
    assertEqual(h.q('[data-ref="target-override"]').getAttribute('placeholder'), tr('targetAuto'));
    assertEqual(h.q('[data-ref="sigma-override"]').getAttribute('placeholder'), tr('sigmaAuto'));
    assertEqual(h.q('[data-ref="col-picker-wrap"] select').value !== '', true, 'Spaltenwähler ohne Wahl');
  });

  test('EWMA (Beispiel): eine Teilkarte, KPI-Satz der EWMA, λ-Felder sichtbar', async () => {
    const h = await mount(exampleEwma());
    const vm = h.vm();
    assertDeepEqual(plain(vm.read({ fields: ['result'] }).result), EXAMPLE_EWMA_RESULT);
    assertDeepEqual(plain(vm.kpi), {
      type: 'ewma', targetText: '10,0582', sigmaHatText: 'σ̂ = 0,0965', signals: 4, ofText: 'von 60 Datenpunkten',
      signalsClass: 'dmike-kpi--bad', sigmaSteadyText: '0,0322', lambdaText: 'λ = 0,2',
    });
    assertDeepEqual(h.qa('.dmike-kpi-value').map(text), ['10,0582', '0,0322', '4']);
    assertDeepEqual(h.qa('.dmike-kpi-sub').map(text), ['σ̂ = 0,0965', 'λ = 0,2', 'von 60 Datenpunkten']);
    assertDeepEqual(h.qa('.dmike-kpi-label').map((el) => el.getAttribute('data-help-key')), [
      `modules.${ID}.types.Result.target`, `modules.${ID}.types.Result.sigmaSteady`, `modules.${ID}.types.Result.signals`,
    ]);
    const views = vm.chartViews;
    assertDeepEqual(Object.keys(views), ['ewma']);
    assertEqual(views.ewma.legacyEditKey, 'ewma');
    assertEqual(views.ewma.title, 'EWMA — Wert');
    const c = plain(views.ewma.config);
    assertEqual(c.values.length, 60);
    assertDeepEqual(c.cl, [EXAMPLE_EWMA_RESULT.cl]);
    assertEqual(c.ucl.length, 60);
    assertEqual(c.sigma.length, 60);
    assertDeepEqual(c.violationIndices, EXAMPLE_EWMA_RESULT.signals);
    assertEqual(h.qa('.twc__chart-section').length, 1);
    assertEqual(h.in('ewma').length, 1);
    assertEqual(h.live().length, 1);
    assertEqual(h.q('[data-ref="lambda"]').value, '0,2');
    assertEqual(h.q('[data-ref="L"]').value, '3');
    assertEqual(h.q('[data-ref="kSigma"]'), null);
    assertEqual(vm.typeHint, tr('typeHint_ewma'));
    assertEqual(vm.sectionParamsLabel, tr('sectionParams_ewma'));
    assertEqual(h.q('[data-ref="baseline-count"]').value, '');
  });

  test('ohne Spalte: alles leer, keine Teilkarte, kein Fehlerkasten', async () => {
    const h = await mount(new State().toJSON());
    const vm = h.vm();
    assertEqual(vm.hasResult, false);
    assertEqual(vm.analysis, null);
    assertEqual(vm.kpi, null);
    assertDeepEqual(plain(vm.chartViews), {});
    assertEqual(vm.errorText, '');
    assertDeepEqual(plain(pick(vm.read({ fields: ['result', 'points'] }), ['result', 'points'])), { result: null, points: [] });
    assertEqual(h.q('.dmike-kpi-strip'), null);
    assertEqual(h.qa('.twc__chart-section').length, 0);
    assertEqual(h.q('.twc__error'), null);
    assertEqual(h.charts.length, 0);
  });

  test('Überlauf (Werte um 1,7·10³⁰⁸ ohne Ziel): stehender Fehlerkasten errCompute, kein Diagramm, result null', async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      const h = await mount(stored({ chartTypeId: 'ewma', columnRef: ref('huge'), sigmaMethod: 'mr', baselineCount: null, targetOverride: null }));
      const vm = h.vm();
      assertEqual(vm.hasResult, false);
      assertDeepEqual(plain(vm.analysis), { status: 'error', reason: 'errCompute' });
      assertEqual(vm.errorText, tr('errCompute'));
      assertEqual(vm.errorText, 'Berechnung fehlgeschlagen.');
      assertEqual(text(h.q('[data-ref="error-area"] .twc__error')), tr('errCompute'));
      assertEqual(vm.kpi, null);
      assertDeepEqual(plain(vm.chartViews), {});
      assertDeepEqual(plain(pick(vm.read({ fields: ['result', 'points'] }), ['result', 'points'])), { result: null, points: [] });
      assertEqual(h.q('.dmike-kpi-strip'), null);
      assertEqual(h.qa('.twc__chart-section').length, 0);
      assertEqual(h.charts.length, 0);
      // Ursache behoben (andere Spalte mit Ziel): der Kasten verschwindet.
      setFields(vm.model, { columnRef: ref('d'), targetOverride: 25 });
      await settle();
      assertEqual(vm.errorText, '');
      assertEqual(h.q('.twc__error'), null);
      assertTrue(vm.hasResult, 'kein Ergebnis nach behobener Ursache');
    } finally {
      console.warn = warn;
    }
  });

  test('Zählung: eine Engine-Rechnung je wirksamer Änderung, keine bei wirkungslosen Änderungen und beim Neueinhängen', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    readAll(vm);
    await settle();
    // Spaltenwechsel über die instance.set-Senke und über den Wähler.
    assertEqual(await runsOf(vm, () => setFields(vm.model, { columnRef: ref('w') })), 1, 'Spaltenwechsel');
    assertEqual(vm.chartViews.cusum_plus.title, 'CUSUM C⁺ — Wert');
    const sel = h.q('[data-ref="col-picker-wrap"] select');
    assertEqual(await runsOf(vm, () => type(sel, [...sel.options].find((o) => o.textContent.includes('Durchmesser')).value)), 1, 'Spaltenwechsel über den Wähler');
    assertDeepEqual(plain(vm.model.columnRef), ref('d'));
    // Phase I (σ aus der Schätzung): leer ist eine Änderung, danach ≥ n wirkungslos.
    assertEqual(await runsOf(vm, () => type(h.q('[data-ref="baseline-count"]'), '')), 1, 'Phase I leer');
    assertEqual(vm.model.baselineCount, null);
    assertEqual(await runsOf(vm, () => type(h.q('[data-ref="baseline-count"]'), '40')), 0, 'Phase I = n statt leer');
    assertEqual(await runsOf(vm, () => type(h.q('[data-ref="baseline-count"]'), '99')), 0, 'Phase I > n statt leer');
    // Ziel, σ-Vorgabe, h und k über die Felder.
    assertEqual(await runsOf(vm, () => type(h.q('[data-ref="target-override"]'), '25,01')), 1, 'Ziel');
    assertEqual(vm.model.targetOverride, 25.01);
    assertEqual(await runsOf(vm, () => type(h.q('[data-ref="hSigma"]'), '4,5')), 1, 'h');
    assertEqual(vm.model.params.cusum.hSigma, 4.5);
    assertEqual(await runsOf(vm, () => type(h.q('[data-ref="kSigma"]'), '0,6')), 1, 'k');
    assertEqual(await runsOf(vm, () => type(h.q('[data-ref="sigma-override"]'), '0,05')), 1, 'σ-Vorgabe');
    assertEqual(vm.model.sigmaOverride, 0.05);
    // σ-Methode bei σ-Vorgabe > 0: wirkungslos.
    assertEqual(await runsOf(vm, () => type(h.q('[data-ref="sigma-method"]'), 'mr')), 0, 'σ-Methode bei σ-Vorgabe');
    assertEqual(vm.model.sigmaMethod, 'mr');
    // Parameter des anderen Typs: wirkungslos.
    assertEqual(await runsOf(vm, () => setFields(vm.model, { params: { ...plain(vm.model.params), ewma: { lambda: 0.3, L: 2.5 } } })), 0, 'Parameter des anderen Typs');
    assertEqual(vm.model.params.ewma.lambda, 0.3);
    // Typwechsel über die Auswahl, dann λ über das Feld.
    assertEqual(await runsOf(vm, () => type(h.q('[data-ref="chart-type"]'), 'ewma')), 1, 'Typwechsel');
    assertDeepEqual(Object.keys(vm.chartViews), ['ewma']);
    assertEqual(await runsOf(vm, () => type(h.q('[data-ref="lambda"]'), '0,25')), 1, 'λ');
    assertEqual(vm.model.params.ewma.lambda, 0.25);
    assertEqual(vm.kpi.lambdaText, 'λ = 0,25');
    // Parameter des anderen Typs im EWMA-Modus: wirkungslos.
    assertEqual(await runsOf(vm, () => setFields(vm.model, { params: { ...plain(vm.model.params), cusum: { kSigma: 0.4, hSigma: 6 } } })), 0, 'Parameter von CUSUM im EWMA-Modus');
    // Neueinhängen ohne Änderung: keine Rechnung, auch nach read() und allen Gettern.
    const before = engineRuns();
    const again = await mount(plain(h.states[INST]));
    readAll(again.vm());
    await settle();
    readAll(again.vm());
    assertEqual(engineRuns() - before, 0, 'Engine-Aufrufe beim Neueinhängen');
    assertTrue(again.vm().hasResult, 'kein Ergebnis nach dem Neueinhängen');
    assertEqual(again.in('ewma').length, 1);
  });

  test('Typwechsel CUSUM → EWMA mit Rückgängig und Wiederholen: ein Schritt, Teilkarten wechseln', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertEqual(mod.historyCan('undo'), false);
    type(h.q('[data-ref="chart-type"]'), 'ewma');
    await settle();
    assertEqual(vm.model.chartTypeId, 'ewma');
    assertDeepEqual(plain(vm.read({ fields: ['result'] }).result), LEGACY_EWMA_RESULT);
    assertDeepEqual(h.qa('.twc__plot-wrap').map((el) => el.getAttribute('data-chart-host')), ['ewma']);
    assertEqual(h.in('ewma').length, 1);
    assertEqual(h.live().length, 1, 'alte Teilkarten leben weiter');
    assertEqual(h.q('[data-ref="lambda"]').value, '0,1');
    assertEqual(h.q('[data-ref="L"]').value, '2,7');
    assertEqual(h.q('[data-ref="hSigma"]'), null);
    assertDeepEqual(h.qa('.dmike-kpi-value').map(text), ['25,0000', '0,0102', '9']);
    assertTrue(mod.historyStep('undo'), 'kein Schritt zum Zurücknehmen');
    await settle();
    assertEqual(vm.model.chartTypeId, 'cusum');
    assertEqual(h.q('[data-ref="chart-type"]').value, 'cusum');
    assertDeepEqual(Object.keys(vm.chartViews), ['cusum_plus', 'cusum_minus']);
    assertDeepEqual(h.qa('.twc__plot-wrap').map((el) => el.getAttribute('data-chart-host')), ['cusum_plus', 'cusum_minus']);
    assertEqual(h.in('cusum_plus').length, 1);
    assertEqual(h.in('cusum_minus').length, 1);
    assertEqual(h.live().length, 2);
    assertEqual(h.q('[data-ref="hSigma"]').value, '5');
    assertEqual(mod.historyCan('undo'), false, 'mehr als ein Schritt');
    assertTrue(mod.historyCan('redo'), 'kein Schritt zum Wiederholen');
    assertTrue(mod.historyStep('redo'), 'Wiederholen');
    await settle();
    assertEqual(vm.model.chartTypeId, 'ewma');
    assertEqual(h.in('ewma').length, 1);
  });

  test('Rückgängig nach λ-Änderung: alter Wert, Wiederholen möglich', async () => {
    const h = await mount(stored({ chartTypeId: 'ewma' }));
    const vm = h.vm();
    type(h.q('[data-ref="lambda"]'), '0,3');
    await settle();
    assertEqual(vm.model.params.ewma.lambda, 0.3);
    assertEqual(h.states[INST].params.ewma.lambda, 0.3);
    assertTrue(mod.historyStep('undo'), 'kein Schritt zum Zurücknehmen');
    await settle();
    assertEqual(vm.model.params.ewma.lambda, 0.1);
    assertEqual(h.q('[data-ref="lambda"]').value, '0,1');
    assertEqual(vm.kpi.lambdaText, 'λ = 0,1');
    assertEqual(mod.historyCan('undo'), false, 'mehr als ein Schritt');
    assertTrue(mod.historyCan('redo'), 'kein Schritt zum Wiederholen');
  });

  test('Zahlenfelder lehnen Bereichsfremdes ab', async () => {
    const h = await mount(stored({ chartTypeId: 'ewma' }));
    const vm = h.vm();
    for (const raw of ['0', '1,5', '-1', 'abc']) {
      type(h.q('[data-ref="lambda"]'), raw);
      await settle();
      assertEqual(vm.model.params.ewma.lambda, 0.1, `λ ${raw} angenommen`);
    }
    type(h.q('[data-ref="lambda"]'), '1');
    await settle();
    assertEqual(vm.model.params.ewma.lambda, 1);
    for (const raw of ['0', '2,5', '-3']) {
      type(h.q('[data-ref="baseline-count"]'), raw);
      await settle();
      assertEqual(vm.model.baselineCount, 20, `Phase I ${raw} angenommen`);
    }
    type(h.q('[data-ref="sigma-override"]'), '-1');
    await settle();
    assertEqual(vm.model.sigmaOverride, null);
  });

  test('referenzierte Spalte gelöscht: Bezug bleibt, leere Ausgabe, result null, kein Wurf', async () => {
    const h = await mount(stored(), { sheet: SHEET(COLS.filter((c) => c.id !== 'd')) });
    const vm = h.vm();
    assertDeepEqual(plain(vm.model.columnRef), ref('d'));
    assertEqual(vm.hasResult, false);
    assertEqual(vm.kpi, null);
    assertDeepEqual(plain(vm.chartViews), {});
    assertEqual(vm.errorText, '');
    assertDeepEqual(plain(pick(vm.read({ fields: ['result', 'points'] }), ['result', 'points'])), { result: null, points: [] });
    assertEqual(h.q('.dmike-kpi-strip'), null);
    assertEqual(h.qa('.twc__chart-section').length, 0);
    assertEqual(h.q('.twc__error'), null);
    assertEqual(h.charts.length, 0);
  });

  test('Altprojekt: Migration, chartEdits je Teilkarte übernommen, kein Verlaufsschritt; Typwechsel übernimmt ewma in einem Schritt', async () => {
    const h = await mount(plain(LEGACY), { chartEdits: LEGACY_EDITS() });
    const vm = h.vm();
    assertEqual(vm.model.chartTypeId, 'cusum');
    assertDeepEqual(plain(vm.model.columnRef), ref('d'));
    assertEqual(vm.model.sigmaMethod, 'sd');
    assertEqual(vm.model.baselineCount, 20);
    assertEqual(vm.model.targetOverride, 25);
    assertEqual(vm.model.sigmaOverride, null);
    assertDeepEqual(plain(vm.model.params), LEGACY_PARAMS);
    assertDeepEqual(plain(vm.read({ fields: ['result'] }).result), LEGACY_RESULT);
    // Obere Teilkarte erbt 'cusum'; die untere hat keinen Alteintrag ('cusum#2' fehlt in der Fixture).
    assertDeepEqual(plain(vm.model.charts.cusum_plus), { title: 'Legacy', showTitle: true, bgColor: '#eef6ff', yLabel: 'C (Legacy)' });
    assertEqual(vm.model.charts.cusum_minus, undefined);
    assertEqual(Object.keys(h.chartEdits[INST].cusum).length, 0, 'Alteintrag cusum nicht gelöscht');
    assertDeepEqual(plain(h.chartEdits[INST].ewma), { title: 'Legacy EWMA', showTitle: true });
    assertEqual(mod.historyCan('undo'), false);
    // Die Konfiguration sagt title '' und die eigene y-Achse; der Alteintrag gewinnt in der Zeichnung.
    assertEqual(vm.chartViews.cusum_plus.config.title, '');
    const top = h.in('cusum_plus')[0].config;
    assertEqual(top.title, 'Legacy');
    assertEqual(top.showTitle, true);
    assertEqual(top.bgColor, '#eef6ff');
    assertEqual(top.yLabel, 'C (Legacy)');
    const bottom = h.in('cusum_minus')[0].config;
    assertEqual(bottom.yLabel, tr('yLabel_cusumLow'));
    assertEqual(bottom.bgColor, undefined);
    assertDeepEqual(h.qa('.dmike-kpi-value').map(text), ['25,0000', '0,2232', '12']);
    assertEqual(h.live().length, 2);
    // Typwechsel: die EWMA-Karte hängt ein und übernimmt den Alteintrag, gefaltet in den Schritt des Wechsels.
    type(h.q('[data-ref="chart-type"]'), 'ewma');
    await settle();
    assertDeepEqual(plain(vm.model.charts.ewma), { title: 'Legacy EWMA', showTitle: true });
    assertEqual(Object.keys(h.chartEdits[INST].ewma).length, 0, 'Alteintrag ewma nicht gelöscht');
    assertEqual(h.in('ewma')[0].config.title, 'Legacy EWMA');
    assertTrue(mod.historyCan('undo'), 'Typwechsel kein Schritt');
    assertTrue(mod.historyStep('undo'), 'Rückgängig');
    await settle();
    assertEqual(vm.model.chartTypeId, 'cusum');
    assertEqual(mod.historyCan('undo'), false, 'Typwechsel und Übernahme als zwei Schritte');
    // Erneutes Öffnen des gespeicherten Stands: eine Zeichnung je Teilkarte, Einstellungen aus dem Model.
    const again = await mount(plain(h.states[INST]), { chartEdits: h.chartEdits });
    assertEqual(again.qa('.twc__chart-section').length, 2);
    assertEqual(again.in('cusum_plus').length, 1);
    assertEqual(again.in('cusum_minus').length, 1);
    assertEqual(again.live().length, 2, 'mehr als ein Diagramm je Teilkarte nach dem Neuöffnen');
    assertEqual(again.in('cusum_plus')[0].config.title, 'Legacy');
    assertEqual(mod.historyCan('undo'), false);
  });

  test('Altprojekt mit Eintrag cusum#2: die untere Teilkarte erbt ihn', async () => {
    const edits = LEGACY_EDITS();
    edits[INST]['cusum#2'] = { title: 'Unten', showTitle: true };
    const h = await mount(plain(LEGACY), { chartEdits: edits });
    const vm = h.vm();
    assertDeepEqual(plain(vm.model.charts.cusum_minus), { title: 'Unten', showTitle: true });
    assertEqual(vm.model.charts.cusum_plus.title, 'Legacy');
    assertEqual(Object.keys(h.chartEdits[INST]['cusum#2']).length, 0, 'Alteintrag cusum#2 nicht gelöscht');
    assertEqual(h.in('cusum_minus')[0].config.title, 'Unten');
    assertEqual(h.in('cusum_plus')[0].config.title, 'Legacy');
    assertEqual(mod.historyCan('undo'), false);
  });
});
