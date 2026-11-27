/**
 * GLM-Regression: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem
 * echten Modul, der echten Vorlage, einem Arbeitsblatt im Fake-stateManager
 * und einem Fake-chartManager. Prüft die Spaltenwähler (Y schließt die X aus,
 * die Versuchszahl X und Y; Y auf die Versuchszahl leert diese im selben
 * Schritt), Verfahren als Knopfgruppe, automatische Wahl, gekoppelte
 * Prozentfelder samt Ablehnung, Reiter samt wirksamem Reiter, Diagramme,
 * Schwelle am Schieber, `swapSuccess` mit Ablehnung, Prognose samt
 * Viewmodel-Kommando `predict`, den Lauf `saveAsModel`, das Altprojekt ohne
 * Verlaufsschritt (alte chartEdits: Residuen, Q-Q, Cook; ROC erbt keinen),
 * zwei Instanzen und die gelöschte Spalte.
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
import { fmt } from '../../js/modules/glm-regression/viewmodel/present.js';
import mod from '../../js/modules/glm-regression/viewmodel/viewmodel.js';

const ID = 'glm-regression';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const WS = 'ws1';
const INST = 'glm-1';
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

const X = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const BIN = [0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1];
const CNT = [0, 1, 1, 2, 1, 3, 2, 4, 3, 5, 4, 6, 5, 7, 8, 9];
/** Ein Arbeitsblatt mit X, binärer Zielgröße, Zähldaten, Anteil und Versuchszahl. */
const sheet = () => ({
  sheets: [{
    id: 's1', name: 'Daten',
    state: {
      rowCount: 16,
      columns: [
        { id: 'x', name: 'X', shortName: 'C1', type: 'numeric', values: [...X] },
        { id: 'bin', name: 'Bin', shortName: 'C2', type: 'numeric', values: [...BIN] },
        { id: 'cnt', name: 'N', shortName: 'C3', type: 'numeric', values: [...CNT] },
        { id: 'share', name: 'Anteil', shortName: 'C4', type: 'numeric', values: X.map((v) => v / 20) },
        { id: 'tr', name: 'Versuche', shortName: 'C5', type: 'numeric', values: X.map(() => 20) },
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
const trialsSelect = (h) => h.q('[data-ref="trials-select"] select');
const BINOMIAL = saved({ colRefs: [ref('x')], yRef: ref('bin'), method: 'binomial' });
/** Erwartet eine Ablehnung des Aufrufs. @param {() => unknown} fn */
function rejects(fn) {
  let err = null;
  try { fn(); } catch (e) { err = e; }
  return err;
}

suite('glm-regression: Viewmodel im Browser', () => {
  test('ohne Arbeitsblatt: Hinweis, kein Ergebnis, Prozentfelder aus der Vorgabe', async () => {
    const h = await mount(null, { noWorksheet: true });
    await until(() => h.q('[data-ref="no-worksheet"]') !== null);
    assertEqual(text(h.q('[data-ref="no-worksheet"]')), tr('noWorksheet'));
    assertEqual(text(h.q('[data-ref="selected-info"]')), tr('selectColumns'));
    assertEqual(h.q('[data-ref="results"]').style.display, 'none');
    assertEqual(h.q('[data-ref="conf-level"]').value, '95');
    assertEqual(h.q('[data-ref="alpha-level"]').value, '5');
    assertEqual(h.q('[data-ref="error-box"]').style.display, 'none');
    assertEqual(h.q('[data-ref="detect-info"]').style.display, 'none');
  });

  test('Wähler: Y ohne die X, Versuchszahl ohne X und Y; Y auf die Versuchszahl leert diese im selben Schritt', async () => {
    const h = await mount(null);
    const vm = h.vm();
    await until(() => h.qa('[data-ref="picker-cols"] input[type="checkbox"]').length === 5);
    toggleX(h, 'x');
    await settle();
    assertDeepEqual(plain(vm.model.colRefs), [ref('x')]);
    assertEqual(text(h.q('[data-ref="selected-info"]')), tr('selectYHint'));
    await until(() => ySelect(h) !== null && [...ySelect(h).options].length > 1);
    assertTrue(![...ySelect(h).options].map((o) => o.value).includes(keyOf('x')), 'X fehlt im Y-Wähler');
    type(ySelect(h), keyOf('share'));
    await until(() => vm.model.yRef !== null);
    await until(() => trialsSelect(h) !== null && ![...trialsSelect(h).options].map((o) => o.value).includes(keyOf('share')));
    type(trialsSelect(h), keyOf('tr'));
    await until(() => vm.model.trialsRef !== null);
    await settle();
    // Y auf die Versuchszahl: die Versuchszahl wird geleert, ein Rückgängig stellt beides her.
    setFields(vm.model, { yRef: ref('tr') });
    await until(() => vm.model.trialsRef === null);
    assertDeepEqual(plain(vm.model.yRef), ref('tr'));
    await settle();
    assertTrue(mod.historyStep('undo'));
    await until(() => vm.model.trialsRef !== null);
    assertDeepEqual(plain(vm.model.yRef), ref('share'));
    assertDeepEqual(plain(vm.model.trialsRef), ref('tr'));
    // Versuchszahl unter die X: sie wird geleert.
    toggleX(h, 'tr');
    await until(() => vm.model.trialsRef === null);
    assertEqual(vm.model.colRefs.length, 2);
  });

  test('Versuchszahl allein auf Y oder unter die X gesetzt (Agent): die Ansicht leert sie im selben Schritt', async () => {
    const h = await mount(saved({ colRefs: [ref('x')], yRef: ref('share') }));
    const vm = h.vm();
    await settle();
    // Der Wähler bietet Y nicht an; die Rechnung nähme Y sonst als Gewichte.
    setFields(vm.model, { trialsRef: ref('share') });
    await until(() => vm.model.trialsRef === null);
    assertEqual(vm.model.trialsRef, null);
    await settle();
    setFields(vm.model, { trialsRef: ref('x') });
    await until(() => vm.model.trialsRef === null);
    assertEqual(vm.model.trialsRef, null);
    await settle();
    // Rückgängig nimmt Setzen und Leeren zusammen: zurück zum Stand ohne Versuchszahl.
    assertTrue(mod.historyStep('undo'));
    await settle();
    assertEqual(vm.model.trialsRef, null);
    assertDeepEqual(plain(vm.model.yRef), ref('share'));
  });

  test('Verfahren als Knopfgruppe, automatische Wahl mit Hinweis, Fehlergrund', async () => {
    const h = await mount(saved({ colRefs: [ref('x')], yRef: ref('bin') }));
    const vm = h.vm();
    await until(() => text(h.q('[data-ref="detect-info"]')) !== '');
    assertEqual(text(h.q('[data-ref="detect-info"]')), tr('autoDetectBinary'));
    assertEqual(h.qa('[data-ref="method-group"] [role="radio"]').length, 4);
    assertTrue(h.q('[data-method="auto"]').classList.contains('btn--active'));
    h.q('[data-method="poisson"]').click();
    await until(() => vm.model.method === 'poisson');
    await until(() => h.q('[data-ref="detect-info"]').style.display === 'none');
    assertTrue(h.q('[data-method="poisson"]').classList.contains('btn--active'));
    setFields(vm.model, { yRef: ref('cnt'), method: 'binomial' });
    await until(() => text(h.q('[data-ref="error-box"]')) === tr('errorNotBinary'));
    assertEqual(text(h.q('[data-ref="error-box"]')), tr('errorNotBinary'));
    await until(() => h.q('[data-ref="results"]').style.display === 'none');
    assertEqual(h.q('[data-ref="results"]').style.display, 'none');
  });

  test('Prozentfelder gekoppelt: Konfidenz führt α mit, Ablehnung mit Rücksprung', async () => {
    const h = await mount(BINOMIAL);
    const vm = h.vm();
    await until(() => h.q('[data-ref="kpis"]') !== null);
    const conf = h.q('[data-ref="conf-level"]');
    type(conf, '90');
    await settle();
    assertDeepEqual([vm.model.confLevel, vm.model.alpha], [0.9, 0.1]);
    assertEqual(h.q('[data-ref="alpha-level"]').value, '10');
    type(h.q('[data-ref="alpha-level"]'), '2,5');
    await settle();
    assertDeepEqual([vm.model.confLevel, vm.model.alpha], [0.975, 0.025]);
    assertEqual(conf.value, '97,5');
    for (const bad of ['0', '100', 'abc']) {
      type(conf, bad);
      await settle();
      assertEqual(vm.model.confLevel, 0.975, bad);
      assertEqual(conf.value, '97,5', bad);
      assertTrue(conf.classList.contains('field--error'), bad);
    }
    assertTrue(mod.historyStep('undo'));
    await until(() => vm.model.confLevel === 0.9);
    assertEqual(vm.model.alpha, 0.1);
  });

  test('Reiter und Diagramme: ROC nur binomial, wirksamer Reiter beim Lesen, Route', async () => {
    const h = await mount(saved({ colRefs: [ref('x')], yRef: ref('cnt'), method: 'poisson', activeTab: 'roc' }));
    const vm = h.vm();
    await until(() => h.qa('[data-ref="tabs"] [role="tab"]').length === 3);
    assertEqual(vm.effectiveTab, 'model');
    assertTrue(h.q('[data-tab-content="model"]') !== null);
    h.q('[data-ref="tabs"] [data-tab="diagnostics"]').click();
    await until(() => vm.model.activeTab === 'diagnostics');
    await until(() => h.charts.length === 3);
    assertDeepEqual(h.charts.map((c) => c.config.title).sort(), [tr('cooksTitle'), tr('qqTitle'), tr('residualsVsFitted')].sort());
    assertTrue(h.q('[data-ref="overdispersion"]') !== null);
    setFields(vm.model, { yRef: ref('bin'), method: 'binomial' });
    await until(() => h.qa('[data-ref="tabs"] [role="tab"]').length === 4);
    vm.onRouteChanged(['roc']);
    await until(() => vm.model.activeTab === 'roc');
    await until(() => h.charts.some((c) => String(c.config.title).startsWith(tr('rocCurve'))));
    assertEqual(text(h.q('[data-ref="auc"]')), fmt(vm.result.auc, 'de'));
    vm.onRouteChanged(['bogus']);
    await settle();
    assertEqual(vm.model.activeTab, 'roc');
  });

  test('Schwelle am Schieber zählt die Tafel neu', async () => {
    const h = await mount(saved({ ...BINOMIAL, activeTab: 'roc' }));
    const vm = h.vm();
    await until(() => h.q('[data-ref="cutoff-slider"]') !== null);
    assertEqual(text(h.q('[data-ref="cutoff-display"]')), '0,50');
    const before = text(h.q('.glm__tp'));
    type(h.q('[data-ref="cutoff-slider"]'), '0.9');
    await until(() => vm.model.cutoff === 0.9);
    await until(() => text(h.q('[data-ref="cutoff-display"]')) === '0,90');
    assertEqual(text(h.q('.glm__tp')), String(vm.classification.tp));
    assertTrue(vm.classification.tp <= Number(before));
  });

  test('swapSuccess: Knopf tauscht und rechnet neu; ohne binäres Ergebnis abgelehnt', async () => {
    const h = await mount(BINOMIAL);
    const vm = h.vm();
    await until(() => h.q('[data-action="swap-success"]') !== null);
    assertEqual(text(h.q('[data-ref="success-class"]')), '1');
    const b1 = vm.result.coefficients[1].estimate;
    h.q('[data-action="swap-success"]').click();
    await until(() => vm.model.successClass === 0);
    await until(() => text(h.q('[data-ref="success-class"]')) === '0');
    assertAlmostEqual(vm.result.coefficients[1].estimate, -b1, 1e-6);
    setFields(vm.model, { yRef: ref('cnt'), method: 'poisson' });
    await settle();
    assertTrue(rejects(() => vm.swapSuccess({})) !== null);
    assertEqual(h.q('[data-action="swap-success"]'), null);
  });

  test('Prognose: Felder mit Dezimalkomma, Berechnen, Viewmodel-Kommando predict mit Ablehnung', async () => {
    const h = await mount(saved({ ...BINOMIAL, activeTab: 'prediction' }));
    const vm = h.vm();
    await until(() => h.q('[data-ref="pred-x-1"]') !== null);
    h.q('[data-action="predict"]').click();
    await until(() => text(h.q('[data-ref="predict-result"]')) === tr('errorInvalidInput'));
    type(h.q('[data-ref="pred-x-1"]'), '7,5');
    await until(() => h.q('[data-ref="predict-response"]') !== null);
    const p = vm.prediction;
    assertTrue(p.response > 0 && p.response < 1);
    assertEqual(text(h.q('[data-ref="predict-response"]')), fmt(p.response, 'de', 6));
    const out = vm.predict({ values: { X: 2 } });
    assertTrue(out.response < p.response);
    await settle();
    assertEqual(h.q('[data-ref="pred-x-1"]').value, '2');
    assertEqual(vm.predict({ values: {} }), null);
    for (const bad of [{ Z: 1 }, { X: 'x' }]) assertTrue(rejects(() => vm.predict({ values: bad })) !== null, JSON.stringify(bad));
  });

  test('saveAsModel: Ablehnung ohne Fit, Speichern ins eigene Model, Aktualisieren behält die id, ein Schritt je Speichern', async () => {
    const h = await mount(saved({ colRefs: [ref('x')], yRef: ref('cnt'), method: 'binomial' }));
    const vm = h.vm();
    await settle();
    const no = await vm._asyncTaskHost.start('saveAsModel', {});
    assertEqual(no.status, 'rejected');
    assertEqual(no.reason, tr('saveBlocked'));
    setFields(vm.model, { yRef: ref('bin') });
    await until(() => h.q('[data-action="save-as-model"]') !== null);
    assertEqual(text(h.q('[data-action="save-as-model"]')), tr('saveAsModel'));
    h.q('[data-action="save-as-model"]').click();
    await until(() => vm.model.savedModelId !== null);
    const id = vm.model.savedModelId;
    assertEqual(vm.model.savedModelName, `Bin — ${tr('family_binomial')}`);
    assertEqual(vm.savedModel.id, id);
    assertDeepEqual(vm.savedModel.terms, ['Intercept', 'X']);
    assertDeepEqual(vm.savedModel.family, { name: 'binomial', link: 'logit' });
    assertEqual(vm.savedModel.dataSnapshot.y.length, 16);
    await until(() => text(h.q('[data-ref="model-status"]')) === tr('modelSaved'));
    assertEqual(text(h.q('[data-action="save-as-model"]')), tr('updateModel'));
    assertTrue(h.notes.some((n) => n.type === 'success' && n.message === tr('modelSaved')));
    const again = await vm._asyncTaskHost.start('saveAsModel', {});
    assertEqual(again.status, 'done');
    assertEqual(again.value, id);
    assertTrue(mod.historyStep('undo'));
    await settle();
    assertEqual(vm.model.savedModelId, id);
    assertTrue(mod.historyStep('undo'));
    await until(() => vm.model.savedModelId === null);
    assertEqual(vm.savedModel, null);
    assertTrue(mod.historyStep('redo'));
    await until(() => vm.model.savedModelId === id);
  });

  test('Altprojekt (a): Migration und alte chartEdits ohne Verlaufsschritt; ROC erbt keinen Schlüssel', async () => {
    const fx = await (await fetch(new URL('./glm-regression/legacy-project.json', import.meta.url), { cache: 'no-cache' })).json();
    const p = fx.projects[0];
    const { doc } = adoptProjectModels(plain({ phases: p.phases, moduleStates: p.moduleStates, models: p.models }), { phaseFor: () => 'improve' });
    const A_ID = 'f4309ced-02f5-458f-a437-1d0b99aec268';
    const SOLDER = '42907b00-e8a7-4743-957f-efa88bb88055';
    const chartEdits = { [A_ID]: plain(p.chartEdits[A_ID]) };
    const h = await mount(plain(doc.moduleStates[A_ID]), { inst: A_ID, sheets: { [SOLDER]: plain(doc.moduleStates[SOLDER]) }, chartEdits });
    const vm = h.vm();
    assertEqual(mod.historyCan('undo'), false);
    assertEqual(vm.model.activeTab, 'diagnostics');
    assertEqual(vm.model.cutoff, 0.4);
    await until(() => vm.model.cooksEdits.title === 'Alt Cook');
    assertEqual(vm.model.residualsEdits.title, 'Alt Residuen');
    assertEqual(vm.model.qqEdits.title, 'Alt Q-Q');
    await until(() => h.charts.some((c) => c.config.title === 'Alt Q-Q'));
    assertDeepEqual(Object.keys(chartEdits[A_ID]).filter((k) => Object.keys(chartEdits[A_ID][k]).length > 0), []);
    assertEqual(mod.historyCan('undo'), false);
    assertEqual(h.q('[data-ref="conf-level"]').value, '95');
    assertEqual(vm.savedModel.id, '2c3754ea-544d-4fbb-b98e-aacb9f5887dd');
    h.q('[data-ref="tabs"] [data-tab="roc"]').click();
    await until(() => vm.model.activeTab === 'roc');
    await until(() => h.charts.some((c) => String(c.config.title).startsWith(tr('rocCurve'))));
    assertDeepEqual(plain(vm.model.rocEdits), {});
    assertEqual(text(h.q('[data-ref="cutoff-display"]')), '0,40');
  });

  test('zwei Instanzen: Verfahren, Reiter und Prognose bleiben je Instanz', async () => {
    const a = await mount(BINOMIAL, { inst: 'a' });
    const b = await mount(BINOMIAL, { inst: 'b', keep: true });
    await until(() => a.q('[data-ref="kpis"]') !== null && b.q('[data-ref="kpis"]') !== null);
    a.q('[data-method="auto"]').click();
    await until(() => a.vm().model.method === 'auto');
    assertEqual(b.vm().model.method, 'binomial');
    b.q('[data-ref="tabs"] [data-tab="roc"]').click();
    await until(() => b.vm().model.activeTab === 'roc');
    assertEqual(a.vm().model.activeTab, 'model');
    b.vm().predict({ values: { X: 1 } });
    await settle();
    assertDeepEqual(plain(a.vm().state.predictInputs), {});
  });

  test('gelöschte Spalte: Bezug bleibt, Meldung, kein Ergebnis, keine Diagramme', async () => {
    const ws = sheet();
    ws.sheets[0].state.columns = ws.sheets[0].state.columns.filter((c) => c.id !== 'bin');
    const h = await mount(saved({ ...BINOMIAL, activeTab: 'diagnostics' }), { sheets: { [WS]: ws } });
    const vm = h.vm();
    await until(() => text(h.q('[data-ref="error-box"]')) !== '');
    assertEqual(text(h.q('[data-ref="error-box"]')), tr('errColumnMissing'));
    assertDeepEqual(plain(vm.model.yRef), ref('bin'));
    assertEqual(vm.result, null);
    assertEqual(h.q('[data-ref="results"]').style.display, 'none');
    assertEqual(h.charts.length, 0);
  });
});
