/**
 * Regression: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem
 * echten Modul, der echten Vorlage, einem Arbeitsblatt im Fake-stateManager
 * und einem Fake-chartManager. Prüft die Spaltenwähler (Y schließt die X aus,
 * Y unter den X wird im selben Schritt geleert), Grad, Prozentfelder samt
 * Ablehnung, Reiter, Terme und Sortierung, vermengte Terme, Einzelmodelle,
 * Prognose samt Viewmodel-Kommando `predict`, den Lauf `saveAsModel`, das
 * Altprojekt ohne Verlaufsschritt (alte chartEdits auch in den Zellen der
 * Haupteffekte), zwei Instanzen, die gelöschte Spalte und die offene
 * Versuchsvorgabe aus `importExperiment` (beim Einhängen ohne Schritt, an
 * der angezeigten Instanz im Schritt des Imports, ohne Daten offen).
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual, assertAlmostEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerCommandDirectives } from '../../js/core/command-directives.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { registerAsyncTaskDirectives } from '../../js/core/async-task-directives.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { setFields } from '../../js/core/model.js';
import { adoptProjectModels } from '../../js/core/project-models.js';
import { withStoredWorksheetReader } from '../helpers/worksheet-reader.js';
import { fmt } from '../../js/modules/regression/viewmodel/present.js';
import mod from '../../js/modules/regression/viewmodel/viewmodel.js';

const ID = 'regression';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const WS = 'ws1';
const INST = 'reg-1';
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
    registerCommandDirectives(Alpine);
    registerFieldDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
    registerWidgetDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
    registerAsyncTaskDirectives(Alpine, { i18n: WIDGET_I18N });
    if (!Alpine.version) Alpine.start();
    UI = await (await fetch(new URL(`../../js/modules/${ID}/resources/i18n/ui.de.json`, import.meta.url), { cache: 'no-cache' })).json();
    prepared = true;
  }
  if (document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) return;
  const html = await (await fetch(new URL(`../../${TPL_KEY}`, import.meta.url), { cache: 'no-cache' })).text();
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', TPL_KEY);
  tpl.innerHTML = html;
  document.body.append(tpl);
}

const A = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const B = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3];
const Y = [6.2, 5.6, 9.8, 8.4, 13.7, 18.2, 14.4, 18.7, 19.2, 19.6];
const G = [2.1, 2.9, 4.2, 5.8, 8.1, 11.6, 16.0, 22.9, 31.8, 45.2];
/** Ein Arbeitsblatt mit zwei X, Y, Wachstum und einer zu A kollinearen Spalte. */
const sheet = () => ({
  sheets: [{
    id: 's1', name: 'Daten',
    state: {
      rowCount: 10,
      columns: [
        { id: 'a', name: 'A', shortName: 'C1', type: 'numeric', values: [...A] },
        { id: 'b', name: 'B', shortName: 'C2', type: 'numeric', values: [...B] },
        { id: 'y', name: 'Y', shortName: 'C3', type: 'numeric', values: [...Y] },
        { id: 'g', name: 'G', shortName: 'C4', type: 'numeric', values: [...G] },
        { id: 'a2', name: 'A2', shortName: 'C5', type: 'numeric', values: A.map((v) => 2 * v) },
      ],
    },
  }],
  activeSheetId: 's1',
});
const ref = (columnId) => ({ instanceId: WS, sheetId: 's1', columnId });
const keyOf = (columnId) => `${WS}|s1|${columnId}`;
/** Ein gespeicherter Stand der neuen Form. */
const saved = (o) => ({ _schema: { version: '1.0' }, ...o });

function unmountAll() {
  while (mounted.length) {
    const old = mounted.pop();
    Alpine.destroyTree(old);
    old.remove();
  }
}

/**
 * Modul einhängen; die Arbeitsblätter liegen unter ihren ids.
 * @param {object|null} model
 * @param {{ inst?: string, keep?: boolean, sheets?: Record<string, any>, chartEdits?: Record<string, any>, noWorksheet?: boolean }} [opts]
 */
async function mount(model, { inst = INST, keep = false, sheets = { [WS]: sheet() }, chartEdits = {}, noWorksheet = false } = {}) {
  await prepare();
  if (!keep) unmountAll();
  const states = { [inst]: model, ...(noWorksheet ? {} : sheets) };
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
    destroy: (chart) => { const i = charts.indexOf(chart); if (i >= 0) charts.splice(i, 1); },
  };
  const phases = { data: noWorksheet ? [] : Object.keys(sheets).map((instanceId) => ({ instanceId, moduleId: 'worksheet' })) };
  const notes = [];
  const context = {
    instanceId: inst,
    instances: { list: () => [], read: async () => ({}), interact: async () => ({ ok: false, results: [] }) },
    stateManager: withStoredWorksheetReader({
      getModuleState: (id) => states[id] ?? null,
      setModuleState: (id, s) => { states[id] = s; },
      getProjectCycle: () => 'dmaic',
      get: (path) => ({ phases, 'phases.data': phases.data, 'settings.confidenceLevel': 95, 'settings.power': 80 })[path],
      getChartEdits: (i, key) => chartEdits[i]?.[key] ?? null,
      setChartEdit: (i, key, k, v) => {
        const e = chartEdits[i]?.[key];
        if (!e) return;
        if (v === null) delete e[k]; else e[k] = v;
      },
    }),
    i18n: { t: (k) => k, tf: () => tr, getLanguage: () => 'de' },
    eventBus: bus,
    chartManager,
    notify: (message, type) => notes.push({ message, type }),
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
    states, charts, chartEdits, container, notes,
    vm: () => Alpine.$data(container.querySelector('[x-data]')),
    q: (sel) => container.querySelector(sel),
    qa: (sel) => [...container.querySelectorAll(sel)],
  };
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const text = (el) => (el ? el.textContent.trim() : '');
/** Ein Eingabefeld wie der Nutzer ändern (`input` und `change`). */
function type(el, value) {
  if (!el) throw new Error('Feld fehlt');
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
/** Ein Kästchen im X-Wähler umschalten. */
function toggleX(h, columnId) {
  const cb = h.q(`[data-ref="picker-cols"] input[data-col-key="${keyOf(columnId)}"]`);
  if (!cb) throw new Error(`Kästchen für ${columnId} fehlt`);
  cb.checked = !cb.checked;
  cb.dispatchEvent(new Event('change', { bubbles: true }));
}
const ySelect = (h) => h.q('[data-ref="y-select"] select');
const kpiValue = (h, help) => text(h.q(`.dmike-kpi-label[data-help-key="modules.regression.types.Result.${help}"]`)?.previousElementSibling);
const POLY = saved({ colRefs: [ref('a'), ref('b')], yRef: ref('y'), polyDegree: 2 });

suite('regression: Viewmodel im Browser', () => {
  test('ohne Arbeitsblatt: Hinweis, kein Ergebnis, Prozentfelder aus der Vorgabe', async () => {
    const h = await mount(null, { noWorksheet: true });
    await until(() => h.q('[data-ref="no-worksheet"]') !== null);
    assertEqual(text(h.q('[data-ref="no-worksheet"]')), tr('noWorksheet'));
    assertEqual(text(h.q('[data-ref="selected-info"]')), tr('selectColumns'));
    assertEqual(h.q('[data-ref="results"]').style.display, 'none');
    assertEqual(h.q('[data-ref="conf-level"]').value, '95');
    assertEqual(h.q('[data-ref="alpha-level"]').value, '5');
    assertEqual(h.q('[data-ref="error-box"]').style.display, 'none');
    assertEqual(h.q('[data-ref="doe-import"]'), null);
  });

  test('Wähler: X per Kästchen, Y per Auswahl ohne die X; Y unter den X wird im selben Schritt geleert', async () => {
    const h = await mount(null);
    const vm = h.vm();
    await until(() => h.qa('[data-ref="picker-cols"] input[type="checkbox"]').length === 5);
    toggleX(h, 'a');
    toggleX(h, 'b');
    await settle();
    assertDeepEqual(plain(vm.model.colRefs), [ref('a'), ref('b')]);
    assertEqual(text(h.q('[data-ref="selected-info"]')), tr('selectYHint'));
    await until(() => ySelect(h) !== null && [...ySelect(h).options].length > 1);
    const yKeys = [...ySelect(h).options].map((o) => o.value);
    assertTrue(!yKeys.includes(keyOf('a')) && !yKeys.includes(keyOf('b')), 'X fehlen im Y-Wähler');
    assertTrue(yKeys.includes(keyOf('y')));
    type(ySelect(h), keyOf('y'));
    await until(() => h.q('[data-ref="results"]').style.display !== 'none' && h.q('[data-ref="kpis"]') !== null);
    assertDeepEqual(plain(vm.model.yRef), ref('y'));
    assertEqual(text(h.q('[data-ref="selected-info"]')), tr('multiMode', { n: 2 }));
    assertEqual(kpiValue(h, 'R2'), fmt(vm.result.R2, 'de'));
    await until(() => h.charts.some((c) => c.config.title === tr('tabActualVsPredicted')));
    // Y als drittes X: Y wird geleert, ein Rückgängig stellt beides her.
    toggleX(h, 'y');
    await until(() => vm.model.yRef === null);
    assertEqual(vm.model.colRefs.length, 3);
    await settle();
    assertTrue(mod.historyStep('undo'));
    await until(() => vm.model.colRefs.length === 2);
    assertDeepEqual(plain(vm.model.yRef), ref('y'));
  });

  test('Typ, Grad und Prozentfelder: gesperrter Grad, Ablehnung mit Rücksprung', async () => {
    const h = await mount(POLY);
    const vm = h.vm();
    await until(() => h.q('[data-ref="kpis"]') !== null);
    assertEqual(h.q('[data-ref="poly-degree"]').value, '2');
    assertTrue(h.q('[data-ref="poly-degree"] option[value="3"]').disabled, 'Grad 3 gesperrt');
    assertEqual(text(h.q('[data-ref="degree-hint"]')), tr('degreeDisabledHint', { deg: 3, terms: 10, n: 10 }));
    assertDeepEqual(vm.activeDegrees, [1, 2]);
    const conf = h.q('[data-ref="conf-level"]');
    type(conf, '90');
    await settle();
    assertEqual(vm.model.confLevel, 0.9);
    type(conf, '97,5');
    await settle();
    assertEqual(vm.model.confLevel, 0.975);
    assertEqual(conf.value, '97,5');
    for (const bad of ['0', '100', 'abc']) {
      type(conf, bad);
      await settle();
      assertEqual(vm.model.confLevel, 0.975, bad);
      assertEqual(conf.value, '97,5', bad);
      assertTrue(conf.classList.contains('field--error'), bad);
    }
    type(h.q('[data-ref="alpha-level"]'), '10');
    await settle();
    assertEqual(vm.model.alpha, 0.1);
    assertTrue(!h.q('[data-ref="alpha-level"]').classList.contains('field--error'));
    type(h.q('[data-ref="reg-type"]'), 'exponential');
    await until(() => vm.model.regType === 'exponential');
    await until(() => h.q('[data-ref="degree-field"]').style.display === 'none');
  });

  test('Reiter: Klick wählt, Haupteffekte nur bei mehreren X, wirksamer Reiter beim Lesen', async () => {
    const h = await mount(saved({ ...POLY, activeTab: 'interaction' }));
    const vm = h.vm();
    await until(() => h.qa('[data-ref="tabs"] [role="tab"]').length === 8);
    assertEqual(vm.shownTab, 'interaction');
    await until(() => h.qa('[data-ref="chart-interaction"] .reg__effects-cell').length === 2);
    await until(() => h.charts.filter((c) => /×/.test(c.config.title ?? '')).length === 2);
    assertDeepEqual(h.charts.filter((c) => /×/.test(c.config.title)).map((c) => c.config.series.length), [3, 3]);
    h.q('[data-ref="tabs"] [data-tab="residuals"]').click();
    await until(() => vm.model.activeTab === 'residuals');
    await until(() => h.charts.some((c) => c.config.title === tr('residualsVsFitted')));
    h.q('[data-ref="tabs"] [data-tab="main-effects"]').click();
    await until(() => vm.model.activeTab === 'main-effects');
    await until(() => h.qa('[data-ref="chart-main-effects"] .reg__effects-cell').length === Object.keys(vm.mainEffects).length);
    assertEqual(Object.keys(vm.mainEffects).length, 0, 'A·B steht im Modell: keine Zelle ohne Wechselwirkung');
    // Route: der erste Abschnitt wählt den Reiter über die Leiste.
    vm.onRouteChanged(['qq']);
    await until(() => vm.model.activeTab === 'qq');
    vm.onRouteChanged(['bogus']);
    await settle();
    assertEqual(vm.model.activeTab, 'qq');
    h.q('[data-ref="tabs"] [data-tab="main-effects"]').click();
    await until(() => vm.model.activeTab === 'main-effects');
    // Ein X: kein Reiter Haupteffekte, gezeigt wird der erste.
    setFields(vm.model, { colRefs: [ref('a')] });
    await until(() => h.qa('[data-ref="tabs"] [role="tab"]').length === 6);
    assertEqual(vm.model.activeTab, 'main-effects');
    assertEqual(vm.shownTab, 'scatter');
    assertTrue(h.q('[data-tab-content="scatter"]') !== null);
  });

  test('Terme: Kästchen schließt aus, Rückgängig; Sortierung nach p als Schalter; vermengter Term', async () => {
    const h = await mount(POLY);
    const vm = h.vm();
    await until(() => h.q('input.reg__term-cb[data-term="A·B"]') !== null);
    const cb = h.q('input.reg__term-cb[data-term="A·B"]');
    cb.checked = false;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => vm.model.excludedTerms.length === 1);
    assertDeepEqual(plain(vm.model.excludedTerms), ['A·B']);
    await until(() => h.q('tr.reg__tr--excluded') !== null);
    assertTrue(mod.historyStep('undo'));
    await until(() => vm.model.excludedTerms.length === 0);
    const sort = h.q('[data-ref="sort-coef-p"]');
    assertEqual(sort.checked, false);
    h.q('[data-action="sort-coef-p"]').click();
    await until(() => vm.model.coefSortByP === true);
    assertTrue(h.q('[data-ref="sort-coef-p"]').checked);
    assertTrue(h.q('[data-action="sort-coef-p"]').classList.contains('reg__sort-btn--active'));
    // Kollineare X: Grund und Knopf „Term ausschließen“.
    setFields(vm.model, { colRefs: [ref('a'), ref('a2')], polyDegree: 1 });
    await until(() => h.q('[data-action="exclude-aliased"]') !== null);
    assertTrue(text(h.q('[data-ref="error-box"]')) !== '');
    assertEqual(h.q('[data-ref="results"]').style.display, 'none');
    const term = h.q('[data-action="exclude-aliased"]').getAttribute('data-arg-term');
    h.q('[data-action="exclude-aliased"]').click();
    await until(() => vm.model.excludedTerms.includes(term));
  });

  test('Einzelmodelle: X-Wahl über die Knopfgruppe, je X ein Ergebnis', async () => {
    const h = await mount(saved({ colRefs: [ref('a'), ref('b')], yRef: ref('g'), regType: 'exponential' }));
    const vm = h.vm();
    await until(() => h.qa('[data-ref="x-selector"] [role="radio"]').length === 2);
    assertEqual(vm.activeX, keyOf('a'));
    assertTrue(h.q(`[data-x-key="${keyOf('a')}"]`).classList.contains('reg__x-btn--active'));
    const r2a = kpiValue(h, 'R2');
    h.q(`[data-x-key="${keyOf('b')}"]`).click();
    await until(() => vm.model.activeXKey === keyOf('b'));
    await until(() => kpiValue(h, 'R2') !== r2a);
    assertTrue(h.q(`[data-x-key="${keyOf('b')}"]`).classList.contains('reg__x-btn--active'));
    assertEqual(vm.canSaveModel, false);
    assertEqual(h.q('[data-action="save-as-model"]'), null);
  });

  test('Prognose: Felder mit Dezimalkomma, Viewmodel-Kommando predict mit Ablehnung', async () => {
    const h = await mount(saved({ colRefs: [ref('a'), ref('b')], yRef: ref('y') }));
    const vm = h.vm();
    await until(() => h.qa('[data-ref="predict-inputs"] input').length === 2);
    const [ia, ib] = h.qa('[data-ref="predict-inputs"] input');
    type(ia, '5,5');
    await settle();
    assertEqual(h.q('[data-ref="predict-result"]').style.display, 'none', 'B fehlt');
    type(ib, '3');
    await until(() => text(h.q('[data-ref="predict-result"]')) !== '');
    const yHat = vm.prediction.yHat;
    assertEqual(text(h.q('[data-ref="predict-result"] span')), `Ŷ(A=5,500, B=3,000) = ${fmt(yHat, 'de')}`);
    const c = vm.result.coefficients;
    assertAlmostEqual(yHat, c[0].coeff + c[1].coeff * 5.5 + c[2].coeff * 3, 1e-9);
    const out = vm.predict({ values: { A: 2, B: 2 } });
    assertAlmostEqual(out.yHat, c[0].coeff + c[1].coeff * 2 + c[2].coeff * 2, 1e-9);
    await settle();
    assertEqual(ia.value, '2');
    assertEqual(vm.predict({ values: { A: 1 } }), null);
    for (const bad of [{ Z: 1 }, { A: 'x' }]) {
      let err = null;
      try { vm.predict({ values: bad }); } catch (e) { err = e; }
      assertTrue(err !== null, JSON.stringify(bad));
    }
  });

  test('saveAsModel: Ablehnung ohne Polynom, Speichern ins eigene Model, Aktualisieren behält die id, Rückgängig', async () => {
    const h = await mount(saved({ colRefs: [ref('a'), ref('b')], yRef: ref('g'), regType: 'exponential' }));
    const vm = h.vm();
    await until(() => h.q('[data-ref="kpis"]') !== null);
    const no = await vm._asyncTaskHost.start('saveAsModel', {});
    assertEqual(no.status, 'rejected');
    assertEqual(no.reason, tr('saveBlocked'));
    setFields(vm.model, { regType: 'polynomial', yRef: ref('y') });
    await until(() => h.q('[data-action="save-as-model"]') !== null);
    assertEqual(text(h.q('[data-action="save-as-model"]')), tr('saveAsModel'));
    h.q('[data-action="save-as-model"]').click();
    await until(() => vm.model.savedModelId !== null);
    const id = vm.model.savedModelId;
    assertEqual(vm.model.savedModelName, tr('defaultModelName', { y: 'Y' }));
    assertEqual(vm.savedModel.id, id);
    assertDeepEqual(vm.savedModel.termSet, ['Intercept', 'A', 'B']);
    assertEqual(vm.savedModel.dataSnapshot.y.length, 10);
    await until(() => text(h.q('[data-ref="model-status"]')) === tr('modelSaved'));
    assertEqual(text(h.q('[data-action="save-as-model"]')), tr('updateModel'));
    assertTrue(h.notes.some((n) => n.type === 'success' && n.message === tr('modelSaved')));
    const again = await vm._asyncTaskHost.start('saveAsModel', {});
    assertEqual(again.status, 'done');
    assertEqual(again.value, id);
    assertTrue(mod.historyStep('undo'));
    assertTrue(mod.historyStep('undo'));
    await until(() => vm.model.savedModelId === null);
    assertEqual(vm.savedModel, null);
  });

  test('Altprojekt (a): Migration und alte chartEdits ohne Verlaufsschritt, auch in den Zellen der Haupteffekte', async () => {
    const fx = await (await fetch(new URL('./regression/legacy-project.json', import.meta.url), { cache: 'no-cache' })).json();
    const p = fx.projects[0];
    const { doc } = adoptProjectModels(plain({ phases: p.phases, moduleStates: p.moduleStates, models: p.models }), { phaseFor: () => 'improve' });
    const A_ID = '1e9f66c8-6e81-47f1-876b-8796bbf550a5';
    const PIZZA = '47b47da9-f80e-46cb-a277-184a2be85a29';
    const chartEdits = { [A_ID]: plain(p.chartEdits[A_ID]) };
    const h = await mount(plain(doc.moduleStates[A_ID]), { inst: A_ID, sheets: { [PIZZA]: plain(doc.moduleStates[PIZZA]) }, chartEdits });
    const vm = h.vm();
    assertEqual(mod.historyCan('undo'), false);
    assertEqual(vm.model.activeTab, 'main-effects');
    assertEqual(vm.model.polyDegree, 2);
    assertDeepEqual(plain(vm.model.excludedTerms), ['Entfernung·Verkehr']);
    await until(() => h.qa('[data-ref="chart-main-effects"] .reg__effects-cell').length === 2);
    await until(() => vm.model.mainEffectsEdits['1']?.title === 'Alt Haupteffekt 2');
    assertEqual(vm.model.mainEffectsEdits['0'].title, 'Alt Haupteffekt 1');
    await until(() => h.charts.some((c) => c.config.title === 'Alt Haupteffekt 2'));
    assertTrue(!('main-effects:scatter#2' in chartEdits[A_ID]) || Object.keys(chartEdits[A_ID]['main-effects:scatter#2']).length === 0);
    assertEqual(mod.historyCan('undo'), false);
    assertEqual(h.q('[data-ref="conf-level"]').value, '95');
    assertEqual(h.q('[data-ref="alpha-level"]').value, '5');
    assertTrue(h.q('[data-action="toggle-pi"]').checked);
    assertEqual(text(h.q('[data-ref="model-status"]')), tr('modelSaved'));
    assertEqual(h.q('input.reg__term-cb[data-term="Entfernung·Verkehr"]').checked, false);
    assertEqual(vm.savedModel.id, 'e2fa7357-af8c-4092-9128-a5510acc08e4');
    // Die übrigen Altschlüssel kommen mit ihrem Reiter.
    h.q('[data-ref="tabs"] [data-tab="ss-pie"]').click();
    await until(() => vm.model.pieEdits.title === 'Alt Kreis' && vm.model.barEdits.title === 'Alt Balken');
    h.q('[data-ref="tabs"] [data-tab="scatter"]').click();
    await until(() => vm.model.scatterEdits.title === 'Alt Streuung A');
  });

  test('offene Versuchsvorgabe beim Einhängen: gerechnet, Teil der Grundlage, kein Schritt', async () => {
    const h = await mount(saved({
      colRefs: [ref('a'), ref('b')], yRef: ref('y'), pendingDesignTerms: ['M0', 'M1', 'I0_1'],
      activeImportSource: { experimentId: 'p1', sourceColumn: 'y', transform: 'identity' },
    }));
    const vm = h.vm();
    await until(() => vm.model.pendingDesignTerms.length === 0);
    assertEqual(vm.model.polyDegree, 2);
    assertDeepEqual([...plain(vm.model.excludedTerms)].sort(), ['A²', 'B²']);
    assertDeepEqual(plain(vm.effectiveDesignNotice), { aliased: [], saturated: [] });
    assertEqual(mod.historyCan('undo'), false);
    await until(() => h.states[INST]?.pendingDesignTerms?.length === 0);
    assertEqual(h.states[INST].polyDegree, 2);
  });

  test('importExperiment an der angezeigten Instanz: Vorgabe im selben Schritt, ein Rückgängig nimmt beides', async () => {
    const h = await mount(saved({ colRefs: [ref('g')], yRef: ref('y'), regType: 'power' }));
    const vm = h.vm();
    await settle();
    vm.model.importExperiment({
      colRefs: [ref('a'), ref('b')], yRef: ref('y'), designTerms: ['M0', 'M1', 'I0_1'],
      source: { experimentId: 'p1', sourceColumn: 'y', transform: 'identity' },
    });
    await until(() => vm.model.pendingDesignTerms.length === 0 && vm.model.polyDegree === 2);
    await settle();
    assertTrue(mod.historyCan('undo'));
    assertTrue(mod.historyStep('undo'));
    await until(() => vm.model.regType === 'power');
    assertDeepEqual(plain(vm.model.colRefs), [ref('g')]);
    assertEqual(vm.model.polyDegree, 1);
    assertEqual(vm.model.activeImportSource, null);
    assertEqual(mod.historyCan('undo'), false);
    assertTrue(mod.historyStep('redo'));
    await until(() => vm.model.polyDegree === 2);
    assertDeepEqual(plain(vm.model.pendingDesignTerms), []);
  });

  test('ohne rechenbare Daten bleibt die Vorgabe offen; unbekannter Schlüssel der Auswahl: Hinweis, nichts geschrieben', async () => {
    const h = await mount(saved({
      colRefs: [ref('a'), ref('b')], yRef: ref('weg'), pendingDesignTerms: ['M0', 'M1'],
      activeImportSource: { experimentId: 'p1', sourceColumn: 'weg', transform: 'identity' },
    }));
    const vm = h.vm();
    await settle();
    assertDeepEqual(plain(vm.model.pendingDesignTerms), ['M0', 'M1']);
    assertEqual(vm.model.polyDegree, 1);
    const before = JSON.stringify(vm.model.toJSON());
    vm.importChoice('p9|raw|0');
    await settle();
    assertEqual(JSON.stringify(vm.model.toJSON()), before);
    assertEqual(h.notes.at(-1)?.message, tr('importUnknown'));
    // Wird Y lesbar, geht die Vorgabe auf.
    setFields(vm.model, { yRef: ref('y'), activeImportSource: { experimentId: 'p1', sourceColumn: 'y', transform: 'identity' } });
    await until(() => vm.model.pendingDesignTerms.length === 0);
    assertEqual(vm.model.polyDegree, 1);
  });

  test('offene Vorgabe entfällt, wenn X, Y oder Grad sich ändern, bevor sie aufgeht', async () => {
    const h = await mount(saved({
      colRefs: [ref('a'), ref('b')], yRef: ref('weg'), pendingDesignTerms: ['M0', 'M1', 'I0_1'],
      activeImportSource: { experimentId: 'p1', sourceColumn: 'weg', transform: 'identity' },
    }));
    const vm = h.vm();
    await settle();
    assertDeepEqual(plain(vm.model.pendingDesignTerms), ['M0', 'M1', 'I0_1']);
    setFields(vm.model, { polyDegree: 3 });
    await until(() => vm.model.pendingDesignTerms.length === 0);
    assertEqual(vm.model.polyDegree, 3);
    assertDeepEqual(plain(vm.model.excludedTerms), []);
  });

  test('zwei Instanzen: Typ, Reiter und Prognose bleiben je Instanz', async () => {
    const a = await mount(POLY, { inst: 'a' });
    const b = await mount(POLY, { inst: 'b', keep: true });
    await until(() => a.q('[data-ref="kpis"]') !== null && b.q('[data-ref="kpis"]') !== null);
    type(a.q('[data-ref="reg-type"]'), 'power');
    await until(() => a.vm().model.regType === 'power');
    assertEqual(b.vm().model.regType, 'polynomial');
    b.q('[data-ref="tabs"] [data-tab="qq"]').click();
    await until(() => b.vm().model.activeTab === 'qq');
    assertEqual(a.vm().model.activeTab, 'scatter');
    b.vm().predict({ values: { A: 1, B: 1 } });
    await settle();
    assertDeepEqual(plain(a.vm().state.predictInputs), {});
  });

  test('gelöschte Spalte: Bezug bleibt, Meldung, kein Ergebnis, keine Diagramme', async () => {
    const ws = sheet();
    ws.sheets[0].state.columns = ws.sheets[0].state.columns.filter((c) => c.id !== 'y');
    const h = await mount(POLY, { sheets: { [WS]: ws } });
    const vm = h.vm();
    await until(() => text(h.q('[data-ref="error-box"]')) !== '');
    assertEqual(text(h.q('[data-ref="error-box"]')), tr('errColumnMissing'));
    assertDeepEqual(plain(vm.model.yRef), ref('y'));
    assertEqual(vm.result, null);
    assertEqual(h.q('[data-ref="results"]').style.display, 'none');
    assertEqual(h.charts.length, 0);
  });
});
