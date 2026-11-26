/**
 * MSA Typ 1: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem echten
 * Modul und der echten Vorlage, einem Fake-stateManager mit Arbeitsblatt und
 * einem Fake-chartManager. Prüft Kennzahlen, Statistiktabelle und Formeln im
 * Zahlformat der Sprache, die Diagrammkonfiguration, die Ablehnung am Feld
 * (Text, USG ≥ OSG), k₁/k₂ an den Auswahlfeldern, den Fall „referenzierte
 * Spalte gelöscht“, zwei Instanzen nebeneinander, Rückgängig und das
 * Altprojekt mit chartEdits ohne Verlaufsschritt.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/msa-typ1/viewmodel/viewmodel.js';
import { State } from '../../js/modules/msa-typ1/domain/model.js';
import { ZONE_FILL } from '../../js/modules/msa-typ1/viewmodel/present.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import { withStoredWorksheetReader } from '../helpers/worksheet-reader.js';

const ID = 'msa-typ1';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
/** Wartet, bis `ok()` gilt; höchstens zwei Sekunden. @param {() => boolean} ok */
async function until(ok) {
  for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
}
/** @type {HTMLElement[]} */
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
  const html = await (await fetch(new URL(`../../${TPL_KEY}`, import.meta.url), { cache: 'no-cache' })).text();
  let tpl = document.querySelector(`template[data-tpl="${TPL_KEY}"]`);
  if (!tpl) {
    tpl = document.createElement('template');
    tpl.setAttribute('data-tpl', TPL_KEY);
    document.body.append(tpl);
  }
  tpl.innerHTML = html;
}

function unmountAll() {
  while (mounted.length) {
    const old = mounted.pop();
    Alpine.destroyTree(old);
    old.remove();
  }
}

/** Die 30 Werte des Altprojekts (Cg 1,8445, Cgk 1,8117 bei k₁ 0,15, k₂ 4). */
const VALUES = [10.002, 9.998, 10.001, 10.003, 9.997, 10.0, 10.002, 9.999, 10.001, 9.998,
  10.004, 10.0, 9.996, 10.001, 10.002, 9.999, 10.003, 10.0, 9.998, 10.001,
  10.002, 9.997, 10.0, 10.003, 9.999, 10.001, 9.998, 10.002, 10.0, 10.001];
const SHEET = () => ({
  sheets: [{
    id: 's1',
    state: {
      rowCount: VALUES.length,
      columns: [
        { id: 'c0', name: 'Durchmesser', type: 'numeric', values: [...VALUES] },
        { id: 'c1', name: 'Kurz', type: 'numeric', values: VALUES.slice(0, 10) },
      ],
    },
  }],
});
const A = { instanceId: 'ws1', sheetId: 's1', columnId: 'c0' };
const SHORT = { instanceId: 'ws1', sheetId: 's1', columnId: 'c1' };

/** Gespeicherter Stand der neuen Form. */
const stored = (params = {}, over = {}) => {
  const base = new State().toJSON();
  return { ...base, columnRef: A, ...over, params: { ...base.params, name: 'Bohrung Ø10', unit: 'µm', ref: 10, lsl: 9.9, usl: 10.1, k1: 0.15, k2: 4, ...params } };
};
/** Altstand (Instanz a der E2E-Fixture), ohne `_schema`. */
const LEGACY = {
  params: { name: 'Bohrung Ø10', ref: '10,0', unit: 'µm', lsl: '9.9', usl: 10.1, k1: '0.15', k2: '4' },
  columnRef: A,
  exampleWorksheetId: 'ws-alt-beispiel',
};
const plain = (v) => JSON.parse(JSON.stringify(v));

/**
 * Eine Instanz einhängen (eigene Kopie des Moduls wie in der Registry); das
 * Arbeitsblatt liegt unter `ws1`.
 * @param {string} instanceId
 * @param {object|null} model gespeicherter Zustand
 * @param {{ sheet?: any, chartEdits?: Record<string, any>, keep?: boolean }} [opts]
 */
async function mount(instanceId, model, { sheet = SHEET(), chartEdits = {}, keep = false } = {}) {
  await prepare();
  if (!keep) unmountAll();
  const states = { [instanceId]: model, ws1: sheet };
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
    create: async (el, type, config) => { const c = { el, type, config: { ...config } }; charts.push(c); return c; },
    update: (chart, config) => { Object.assign(chart.config, config); },
    destroy: () => {},
  };
  const phases = { data: [{ instanceId: 'ws1', moduleId: 'worksheet' }] };
  const context = {
    instanceId,
    instances: { list: () => [], read: async () => ({}), interact: async () => ({ ok: false, results: [] }) },
    stateManager: withStoredWorksheetReader({
      getModuleState: (id) => states[id] ?? null,
      setModuleState: (id, s) => { states[id] = s; },
      getProjectCycle: () => 'dmaic',
      get: (path) => (path === 'phases' ? phases : undefined),
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
  const inst = { ...mod };
  await inst.init(container, context);
  await settle();
  const q = (sel) => container.querySelector(sel);
  return {
    inst, states, charts, container, chartEdits, q,
    vm: () => Alpine.$data(container.querySelector('[x-data]')),
    /** Text in ein Eingabefeld tippen und es verlassen. */
    type: async (ref, text) => {
      const el = /** @type {HTMLInputElement} */ (q(`[data-ref="${ref}"]`));
      el.focus();
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      await settle();
    },
    /** Eine Option eines Auswahlfelds wählen. */
    choose: async (ref, value) => {
      const el = /** @type {HTMLSelectElement} */ (q(`[data-ref="${ref}"]`));
      el.value = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
    },
  };
}

suite('msa-typ1: Viewmodel im Browser', () => {
  test('Kennzahlen, Tabelle und Formeln im deutschen Zahlformat wie die Altform', async () => {
    const h = await mount('t1-1', stored());
    const vm = h.vm();
    assertTrue(!!vm.result, 'kein Ergebnis');
    assertEqual(vm.isTwoSided, true);
    assertEqual(vm.fmtOpt(vm.result.Cg), '1,8445');
    assertEqual(vm.fmtOpt(vm.result.Cgk), '1,8117');
    assertEqual(vm.statusClass, 'dmike-kpi--good');
    assertEqual(vm.statusLabel, tr('statusPass'));
    assertEqual(vm.featureName, 'Bohrung Ø10');
    assertEqual(vm.thresholdPass, '1,33');
    assertEqual(vm.thresholdWarn, '1,00');
    assertEqual(vm.k1Label(0.2), '0,20 (20 %)');
    assertEqual(vm.biasTestText, `${tr('biasTestLine', { t: '0,72', df: 29, p: '= 0,478' })} · ${tr('biasNotSignificant')}`);
    const cols = vm.statCols;
    assertEqual(cols.length, 10);
    assertEqual(cols[1].value, '10,0003 µm');
    assertEqual(cols[9].value, '0,15 / 4');
    assertEqual(cols[9].help, null);
    assertEqual(vm.halfZone(), '0,0150');
    assertEqual(vm.absBias(), '0,0003');
    const kpi = h.container.querySelector('.dmike-kpi-value').textContent;
    assertEqual(kpi, '1,8445');
    const tags = [...h.container.querySelectorAll('.msa-typ1__tag')].map((el) => el.textContent);
    assertEqual(tags[0], 'Cg ≥ 1,33');
    assertTrue(tags[2].startsWith('1,00 ≤ '), tags[2]);
    assertEqual(h.container.querySelectorAll('.dmike-algo-link, [x-widget="algo-lab-link"]').length >= 2, true);
  });

  test('Diagramme: Verlauf mit Punktgröße je Reihe, Zone und Bezugslinien; Histogramm mit Linien', async () => {
    const vm = (await mount('t1-1', stored())).vm();
    const run = vm.runChart;
    assertEqual(run.markerSize, undefined);
    assertEqual(run.series[0].markerSize, 5);
    assertEqual(run.series[0].x.length, 30);
    assertDeepEqual(run.moduleRefLines.map((l) => l.label), [tr('chartRefLabel'), 'common.sym.xbar', 'common.sym.usl', 'common.sym.lsl']);
    assertEqual(run.moduleRefAreas[0].color, ZONE_FILL);
    assertEqual(run.moduleRefAreas[0].label, tr('chartZoneLabel'));
    const hist = vm.histChart;
    assertEqual(hist.data.length, 30);
    assertEqual(hist.binMethod, undefined);
    assertEqual(hist.normalCurveColor, 'var(--color-info)');
    assertDeepEqual(hist.moduleRefLines.map((l) => l.label), ['common.sym.lsl', 'common.sym.usl', 'common.sym.target']);
    assertEqual(vm.legacyRunKey, 'scatter');
    assertEqual(vm.legacyHistKey, 'histogram');
  });

  test('einseitig: keine Cg/Cgk-Kacheln, keine Formeln, Bias bleibt', async () => {
    const h = await mount('t1-1', stored({ usl: null }));
    assertEqual(h.vm().isTwoSided, false);
    assertEqual(h.container.querySelectorAll('.dmike-kpi').length, 2);
    assertEqual(h.q('[data-ref="formulas-section"]'), null);
    assertEqual(h.vm().statusLabel, tr('statusOneSided'));
  });

  test('Eingaben: Komma wird Zahl, Text abgelehnt, USG über OSG abgelehnt mit Grund', async () => {
    const h = await mount('t1-1', stored());
    await h.type('inp-ref', '10,001');
    assertEqual(h.vm().model.params.ref, 10.001);
    await h.type('inp-ref', 'abc');
    assertEqual(h.vm().model.params.ref, 10.001);
    await h.type('inp-usl', '9,8');
    assertEqual(h.vm().model.params.usl, 10.1);
    // Der Grund ist der Text der Invariante (der Fake-Übersetzer liefert den Schlüssel).
    const err = h.q('[data-ref="limits-error"]').textContent;
    assertEqual(err, 'modules.msa-typ1.invariants.limitsOrder');
    await h.type('inp-usl', '10,2');
    assertEqual(h.vm().model.params.usl, 10.2);
    assertEqual(h.q('[data-ref="limits-error"]').textContent, '');
  });

  test('k₁/k₂ an den Auswahlfeldern: Wahl schreibt die Zahl, Model spiegelt die Auswahl', async () => {
    const h = await mount('t1-1', stored());
    assertEqual(/** @type {HTMLSelectElement} */ (h.q('[data-ref="inp-k1"]')).value, '0.15');
    assertEqual(/** @type {HTMLSelectElement} */ (h.q('[data-ref="inp-k2"]')).value, '4');
    await h.choose('inp-k1', '0.1');
    await h.choose('inp-k2', '6');
    assertEqual(h.vm().model.params.k1, 0.1);
    assertEqual(h.vm().model.params.k2, 6);
    h.vm().model.params = { ...h.vm().model.params, k1: 0.2 };
    await until(() => /** @type {HTMLSelectElement} */ (h.q('[data-ref="inp-k1"]')).value === '0.2');
    assertEqual(/** @type {HTMLSelectElement} */ (h.q('[data-ref="inp-k1"]')).value, '0.2');
  });

  test('Rückgängig nimmt eine Eingabe zurück', async () => {
    const h = await mount('t1-1', stored());
    await h.type('inp-ref', '10,001');
    assertTrue(h.inst.historyCan('undo'), 'kein Schritt');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig fehlgeschlagen');
    await settle();
    assertEqual(h.vm().model.params.ref, 10);
    assertEqual(h.inst.historyCan('redo'), true);
  });

  test('referenzierte Spalte gelöscht: Bezug bleibt im Model, kein Ergebnis, kein Wurf', async () => {
    const sheet = SHEET();
    sheet.sheets[0].state.columns.splice(0, 1);
    const h = await mount('t1-1', stored(), { sheet });
    const vm = h.vm();
    assertDeepEqual(plain(vm.model.columnRef), A);
    assertEqual(vm.analysis, null);
    assertEqual(vm.result, null);
    assertEqual(vm.runChart, null);
    assertEqual(h.container.querySelectorAll('.dmike-kpi').length, 0);
  });

  test('zu wenige Werte: Oberfläche stumm, analysis nennt den Grund, columnStats rechnet', async () => {
    const h = await mount('t1-1', stored({}, { columnRef: SHORT }));
    const vm = h.vm();
    assertEqual(vm.result, null);
    assertDeepEqual(plain(vm.analysis.invalid), { key: 'modules.msa-typ1.errTooFewValues', vars: { n: 10 } });
    assertEqual(vm.columnStats.n, 10);
    assertEqual(h.q('.field-error'), null);
  });

  test('zwei Instanzen nebeneinander: jede rechnet mit ihren Eingaben', async () => {
    const a = await mount('t1-a', stored());
    const b = await mount('t1-b', stored({ k1: 0.2, k2: 3, name: 'B' }), { keep: true });
    assertEqual(a.vm().fmtOpt(a.vm().result.Cg), '1,8445');
    assertEqual(b.vm().featureName, 'B');
    assertTrue(b.vm().result.Cg !== a.vm().result.Cg, 'gleiche Kennzahl');
    await b.type('inp-ref', '10,001');
    assertEqual(a.vm().model.params.ref, 10);
    assertEqual(b.vm().model.params.ref, 10.001);
  });

  test('Altprojekt mit chartEdits: Werte als Zahl, Editor-Einstellungen im Feld, kein Verlaufsschritt', async () => {
    const h = await mount('t1-1', plain(LEGACY), {
      chartEdits: { 't1-1': { scatter: { title: 'Verlauf alt' }, histogram: { title: 'Histogramm alt', binMethod: 'manual', binCount: 6 } } },
    });
    const vm = h.vm();
    await until(() => vm.model.histogramChart?.binCount === 6);
    assertDeepEqual({ ...vm.model.params }, { name: 'Bohrung Ø10', unit: 'µm', ref: 10, lsl: 9.9, usl: 10.1, k1: 0.15, k2: 4 });
    assertEqual(vm.model.runChartEdits.title, 'Verlauf alt');
    assertEqual(vm.model.histogramChart.title, 'Histogramm alt');
    assertEqual(vm.model.histogramChart.binCount, 6);
    assertEqual(h.inst.historyCan('undo'), false);
    assertEqual(vm.fmtOpt(vm.result.Cg), '1,8445');
    assertEqual(/** @type {HTMLInputElement} */ (h.q('[data-ref="inp-ref"]')).value, '10');
    assertEqual(/** @type {HTMLInputElement} */ (h.q('[data-ref="inp-lsl"]')).value, '9,9');
  });
});
