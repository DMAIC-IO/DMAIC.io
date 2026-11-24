/**
 * Transformierte I-MR-Karte: das Viewmodel im Browser (viewmodel/viewmodel.js)
 * mit dem echten Modul, der echten Vorlage und dem auto-Task `analysis`, einem
 * Fake-stateManager mit Arbeitsblatt und einem Fake-chartManager. Prüft die
 * Getter, die Zählung der Engine-Aufrufe (eine je Spaltenwechsel und je
 * λ-Änderung im Modus manual, keine bei einem Neustart ohne geänderte Eingabe
 * und keine bei einer λ-Änderung im Modus auto), den Moduswechsel mit
 * Übernahme des geschätzten λ und Rückgängig, den Fall „referenzierte Spalte
 * gelöscht“, nicht positive Werte und das Altprojekt mit der Übernahme alter
 * chartEdits beim Einhängen.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/transformed-imr-chart/viewmodel/viewmodel.js';
import { State } from '../../js/modules/transformed-imr-chart/domain/model.js';
import { engineRuns } from '../../js/modules/transformed-imr-chart/domain/analyze.js';
import { setFields } from '../../js/core/model.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import { withStoredWorksheetReader } from '../helpers/worksheet-reader.js';

const ID = 'transformed-imr-chart';
const INST = 'timr-1';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
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

/** Spalte „Standzeit“ der Altprojekt-Fixture (n = 30, Ausreißer 64 an Stelle 24). */
const STANDZEIT = [
  12.4, 8.1, 15.3, 9.7, 21.6, 11.2, 7.4, 13.8, 10.5, 18.9, 6.8, 14.1, 9.2, 26.3, 12.7,
  8.8, 16.4, 11.9, 7.9, 19.8, 10.1, 13.3, 9.5, 64, 11.6, 8.4, 17.2, 12.2, 10.8, 14.9,
];

/** Spalte „Standzeit“ des Beispiels `spc-transformed-imr` (n = 50). */
const EXAMPLE = [
  9.4525, 3.4527, 20.8374, 7.5708, 7.5441, 10.3229, 10.6644, 10.037, 6.3887, 12.8963,
  9.6901, 7.6611, 19.9312, 11.5594, 12.0971, 9.8213, 14.2051, 18.2342, 12.2842, 21.3365,
  3.8902, 18.2201, 9.0455, 5.354, 9.3759, 15.9184, 5.4888, 14.3362, 10.2634, 15.1397,
  13.2288, 16.7757, 8.7112, 7.0475, 18.6266, 15.7543, 15.8801, 10.6116, 9.2593, 6.2557,
  8.5027, 12.0718, 11.8991, 12.3737, 8.2504, 7.7908, 5.5256, 5.582, 16.3129, 4.6639,
];

/** `read().result` der Altform für die Altprojekt-Fixture (manuell, λ = 0,25). */
const LEGACY_RESULT = {
  n: 30, lambda: 0.25, lambdaAuto: false,
  i: { cl: 3.611341686152775, ucl: 6.880092160823472, lcl: 0.3425912114820777, sigma: 1.0895834915568992 },
  mr: { cl: 1.229050178476182, ucl: 4.015306933081686, lcl: 0 },
  iOriginal: { cl: 13.110066936701209, ucl: 54.73817719553579, lcl: 1.3891713921762856 },
  signals: [23],
};

/** `read().result` der Altform für das Beispiel im Modus `auto`. */
const EXAMPLE_AUTO_RESULT = {
  n: 50, lambda: 0.35, lambdaAuto: true,
  i: { cl: 3.6587076170624835, ucl: 6.671647655761603, lcl: 0.6457675783633636, sigma: 1.00431334623304 },
  mr: { cl: 1.132865454550869, ucl: 3.7010714400176887, lcl: 0 },
  iOriginal: { cl: 10.543116638978987, ucl: 31.23115655832991, lcl: 1.7899825322494618 },
  signals: [],
};

/** `read().result` der Altform für das Beispiel im Modus `manual`, λ = 0,5. */
const EXAMPLE_MANUAL_RESULT = {
  n: 50, lambda: 0.5, lambdaAuto: false,
  i: { cl: 4.538510328562812, ucl: 8.824247748251015, lcl: 0.25277290887460957, sigma: 1.4285791398960674 },
  mr: { cl: 1.611437269802764, ucl: 5.26456556044563, lcl: 0 },
  iOriginal: { cl: 10.688029329180644, ucl: 29.291084828879292, lcl: 1.2687464447398424 },
  signals: [],
};

const SHEET = (cols = [{ id: 'c0', name: 'Standzeit', values: STANDZEIT }, { id: 'c1', name: 'Beispiel', values: EXAMPLE }]) => ({
  sheets: [{
    id: 's1',
    state: { rowCount: Math.max(...cols.map((c) => c.values.length), 0), columns: cols.map((c) => ({ type: 'numeric', ...c, values: [...c.values] })) },
  }],
});
const REF = { instanceId: 'ws1', sheetId: 's1', columnId: 'c0' };
const REF2 = { instanceId: 'ws1', sheetId: 's1', columnId: 'c1' };
/** Gespeicherter Stand der neuen Form. */
const stored = (over = {}) => ({ ...new State().toJSON(), columnRef: REF, ...over });
/** Die Altform aus der Fixture `legacy-project.json` (ohne `_schema`). */
const LEGACY = { columnRef: REF, lambdaMode: 'manual', lambdaManual: 0.25, exampleWorksheetId: null };

/**
 * Modul mit Fake-Diensten einhängen; das Arbeitsblatt liegt unter `ws1`.
 * Wartet, bis der erste Lauf von `analysis` fertig ist.
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
  const vm = () => Alpine.$data(container.querySelector('[x-data]'));
  await idle(vm());
  return {
    states, charts, container, chartEdits, vm,
    /** Die Konfiguration, die das Diagramm zuletzt zeigt. */
    shown: () => charts.at(-1)?.config ?? null,
    q: (sel) => container.querySelector(sel),
    qa: (sel) => [...container.querySelectorAll(sel)],
  };
}

/** Bis der Lauf `analysis` steht: erst anlaufen lassen, dann das Ende abwarten. */
async function idle(vm) {
  await settle();
  for (let i = 0; i < 200 && vm._asyncTasks.analysis.running; i++) await wait(10);
  await settle();
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const text = (el) => el.textContent.trim();
/** Alle Getter und die Lesefläche lesen, wie Vorlage und Agent es tun. */
const readAll = (vm) => {
  vm.read();
  void vm.result; void vm.kpi; void vm.badge; void vm.limitRows; void vm.plot; void vm.chartTitle;
  void vm.hasResult; void vm.errorText; void vm.lambdaShownText; void vm.lambdaModeOptions;
};
/** Der Wert des Tasks in der Lesefläche. */
const taskValue = (vm) => vm.read().asyncTasks.analysis.value;
/** Eine Auswahl wie der Nutzer ändern. */
function choose(el, value) {
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

suite('transformed-imr-chart: Viewmodel im Browser', () => {
  test('Ergebnis (manuell, λ 0,25): KPI-Leiste, Abzeichen, Grenzentabelle, Kopfzeile, Diagramm, λ-Feld', async () => {
    const h = await mount(stored({ lambdaMode: 'manual', lambdaManual: 0.25 }));
    const vm = h.vm();
    assertTrue(vm.hasResult, 'kein Ergebnis');
    assertDeepEqual(plain(vm.result), LEGACY_RESULT);
    assertDeepEqual(plain(vm.kpi), {
      lambdaText: '0,250', lambdaLabel: 'λ (manuell)', clText: '3,611', sigmaText: 'σ̂ = 1,090',
      signals: 1, signalsSub: 'von 30 Datenpunkten', signalsClass: 'dmike-kpi--bad',
    });
    assertDeepEqual(plain(vm.badge), { text: tr('unstable', { count: 1 }), cls: 'timr__badge--unstable', stable: false, unstable: true });
    assertDeepEqual(plain(vm.limitRows), [
      { label: 'UCL', transformed: '6,880', original: '54,738' },
      { label: 'CL', transformed: '3,611', original: '13,110' },
      { label: 'LCL', transformed: '0,343', original: '1,389' },
    ]);
    assertEqual(vm.chartTitle, 'Box-Cox I — Standzeit (λ = 0,25)');
    assertEqual(vm.errorText, '');
    const points = vm.analysis.points;
    assertEqual(points.length, 30);
    assertDeepEqual(plain(vm.plot), {
      title: '', showTitle: false, showLegend: false, xLabel: tr('xLabelSample'), yLabel: tr('yLabel'),
      values: points.map((p) => p.transformed),
      cl: [LEGACY_RESULT.i.cl], ucl: [LEGACY_RESULT.i.ucl], lcl: [LEGACY_RESULT.i.lcl], sigma: [LEGACY_RESULT.i.sigma],
      violationIndices: [23], usl: null, lsl: null, showZones: true,
    });
    assertEqual(vm.legacyEditKey, 'control-chart');
    // Vorlage: drei Kacheln in alter Reihenfolge, Kopfzeile mit Warn-Icon, ein Diagramm, drei Grenzzeilen.
    assertEqual(h.qa('[data-ref="stats-bar"] .dmike-kpi').length, 3);
    assertDeepEqual(h.qa('.dmike-kpi-value').map(text), ['0,250', '3,611', '1']);
    assertDeepEqual(h.qa('.dmike-kpi-label').map(text), ['λ (manuell)', 'CL (y)', tr('statSignals')]);
    assertDeepEqual(h.qa('.dmike-kpi-sub').map(text), [tr('boxCoxLabel'), 'σ̂ = 1,090', 'von 30 Datenpunkten']);
    assertDeepEqual(h.qa('.dmike-kpi-label').map((el) => el.getAttribute('data-help-key')), [
      `modules.${ID}.types.Result.lambda`, `modules.${ID}.types.IndividualLimits.cl`, `modules.${ID}.types.Result.signals`,
    ]);
    assertTrue(h.qa('.dmike-kpi')[2].classList.contains('dmike-kpi--bad'), 'Klasse der dritten Kachel');
    assertEqual(text(h.q('.timr__chart-title')), 'Box-Cox I — Standzeit (λ = 0,25)');
    assertTrue(h.q('.timr__badge').classList.contains('timr__badge--unstable'), 'Klasse des Abzeichens');
    assertEqual(h.qa('.timr__badge [data-icon="status.warning"]').length, 1);
    assertEqual(h.qa('.timr__badge [data-icon="status.ok"]').length, 0);
    assertEqual(h.charts.length, 1);
    assertEqual(h.charts[0].type, 'control-chart');
    assertTrue(h.charts[0].el.closest('[data-ref="plot"]') !== null, 'Diagramm nicht im Wirt');
    assertEqual(h.shown().showZones, true);
    assertDeepEqual([...h.shown().violationIndices], [23]);
    assertEqual(h.qa('.timr__limits-table tbody tr').length, 3);
    assertDeepEqual(h.qa('.timr__limits-table tbody td').map(text), ['UCL', '6,880', '54,738', 'CL', '3,611', '13,110', 'LCL', '0,343', '1,389']);
    assertEqual(h.q('.timr__error'), null);
    // λ-Modus: Auswahl zeigt manuell; λ-Feld als Text mit Dezimalkomma, frei.
    const sel = h.q('[data-ref="lambda-mode"]');
    assertEqual(sel.value, 'manual');
    assertDeepEqual([...sel.options].map((o) => o.textContent), [tr('lambdaAuto'), tr('lambdaManual')]);
    const lam = h.q('[data-ref="lambda-manual"]');
    assertEqual(h.qa('[data-ref="lambda-manual"]').length, 1);
    assertEqual(lam.value, '0,25');
    assertEqual(lam.type, 'text');
    assertEqual(lam.getAttribute('inputmode'), 'decimal');
    assertEqual(lam.disabled, false);
    assertTrue(!lam.hasAttribute('step') && !lam.hasAttribute('min') && !lam.hasAttribute('max'), 'Bereichsattribute am λ-Feld');
    // Lesefläche: Task-Wert mit Ergebnis und Punkten.
    const out = vm.read();
    assertDeepEqual(plain(out.asyncTasks.analysis.value.result), LEGACY_RESULT);
    assertEqual(out.asyncTasks.analysis.value.points.length, 30);
    assertDeepEqual(plain(out.asyncTasks.analysis.value.points[23]), { transformed: points[23].transformed, signal: true });
    assertEqual(out.asyncTasks.analysis.value.error, null);
    assertDeepEqual(plain(out.activeParams), ['lambdaMode', 'lambdaManual']);
    assertDeepEqual(plain(out.activeColumnSlots), ['columnRef']);
  });

  test('Modus auto: geschätztes λ im gesperrten Feld, gespeicherter Wert bleibt, Abzeichen stabil', async () => {
    const h = await mount(stored({ columnRef: REF2 }));
    const vm = h.vm();
    assertDeepEqual(plain(vm.result), EXAMPLE_AUTO_RESULT);
    assertEqual(vm.kpi.lambdaText, '0,350');
    assertEqual(vm.kpi.lambdaLabel, 'λ (auto)');
    assertEqual(vm.kpi.signalsClass, 'dmike-kpi--good');
    assertDeepEqual(plain(vm.badge), { text: tr('stable'), cls: 'timr__badge--stable', stable: true, unstable: false });
    assertEqual(h.qa('.timr__badge [data-icon="status.ok"]').length, 1);
    assertEqual(vm.chartTitle, 'Box-Cox I — Beispiel (λ = 0,35)');
    assertEqual(vm.autoLambda, 0.35);
    assertEqual(vm.lambdaShownText, '0,35');
    const lam = h.q('[data-ref="lambda-manual"]');
    assertEqual(h.qa('[data-ref="lambda-manual"]').length, 1);
    assertEqual(lam.disabled, true);
    assertEqual(lam.value, '0,35');
    assertEqual(h.q('[data-ref="lambda-mode"]').value, 'auto');
    assertEqual(vm.model.lambdaManual, 0, 'gespeicherter Wert im Modus auto verändert');
    assertEqual(h.states[INST].lambdaManual ?? 0, 0);
    assertDeepEqual(plain(vm.read().activeParams), ['lambdaMode']);
    assertEqual(vm.read().lambdaManual, 0);
  });

  test('ohne Spalte: alles leer, kein Diagramm, kein Fehlerkasten', async () => {
    const h = await mount(stored({ columnRef: null }));
    const vm = h.vm();
    assertEqual(vm.hasResult, false);
    assertEqual(vm.result, null);
    assertEqual(vm.kpi, null);
    assertEqual(vm.badge, null);
    assertDeepEqual(vm.limitRows, []);
    assertEqual(vm.plot, null);
    assertEqual(vm.chartTitle, '');
    assertEqual(vm.errorText, '');
    assertDeepEqual(plain(taskValue(vm)), { result: null, points: [], error: null, message: null });
    assertEqual(h.q('.dmike-kpi-strip'), null);
    assertEqual(h.q('[data-ref="plot"]'), null);
    assertEqual(h.q('.timr__limits-table'), null);
    assertEqual(h.q('.timr__error'), null);
    assertEqual(h.charts.length, 0);
    assertEqual(vm.lambdaShownText, '0');
  });

  test('unter fünf Zahlen: leere Ausgabe, kein Fehler', async () => {
    const h = await mount(stored(), { sheet: SHEET([{ id: 'c0', name: 'Kurz', values: [1, '2,5', null, 4, 5, 6] }]) });
    const vm = h.vm();
    assertEqual(vm.hasResult, false);
    assertEqual(vm.errorText, '');
    assertDeepEqual(plain(taskValue(vm)), { result: null, points: [], error: null, message: null });
    assertEqual(h.q('.dmike-kpi-strip'), null);
  });

  test('nicht positive Werte: stehender Fehlerkasten mit errPositiveOnly, kein Diagramm', async () => {
    const h = await mount(stored(), { sheet: SHEET([{ id: 'c0', name: 'Mit Null', values: [3, 4, 0, 5, 6, 7] }]) });
    const vm = h.vm();
    assertEqual(vm.hasResult, false);
    assertEqual(vm.errorText, tr('errPositiveOnly'));
    const v = taskValue(vm);
    assertEqual(v.error, 'errPositiveOnly');
    assertEqual(v.message, tr('errPositiveOnly'));
    assertEqual(v.result, null);
    assertEqual(text(h.q('[data-ref="error-area"] .timr__error')), tr('errPositiveOnly'));
    assertEqual(h.q('[data-ref="plot"]'), null);
    assertEqual(h.charts.length, 0);
  });

  test('Zählung: je Spaltenwechsel und je λ-Änderung im Modus manual genau ein Engine-Aufruf, kein Lauf im Modus auto', async () => {
    const h = await mount(stored({ lambdaMode: 'manual', lambdaManual: 0.25 }));
    const vm = h.vm();
    readAll(vm);
    await idle(vm);
    // Spaltenwechsel über instance.set-Senke.
    let before = engineRuns();
    setFields(vm.model, { columnRef: REF2 });
    await idle(vm);
    readAll(vm);
    await idle(vm);
    assertEqual(engineRuns() - before, 1, 'Engine-Aufrufe je Spaltenwechsel');
    assertEqual(vm.chartTitle, 'Box-Cox I — Beispiel (λ = 0,25)');
    // Spaltenwechsel über den Wähler.
    before = engineRuns();
    const sel = h.q('[data-ref="col-picker"] select');
    choose(sel, [...sel.options].find((o) => o.textContent.includes('Standzeit')).value);
    await idle(vm);
    readAll(vm);
    await idle(vm);
    assertDeepEqual(plain(vm.model.columnRef), REF);
    assertEqual(engineRuns() - before, 1, 'Engine-Aufrufe je Spaltenwechsel über den Wähler');
    // λ im Modus manual über das Feld.
    before = engineRuns();
    choose(h.q('[data-ref="lambda-manual"]'), '0,5');
    await idle(vm);
    readAll(vm);
    await idle(vm);
    assertEqual(vm.model.lambdaManual, 0.5);
    assertEqual(engineRuns() - before, 1, 'Engine-Aufrufe je λ-Änderung im Modus manual');
    assertEqual(vm.result.lambda, 0.5);
    // Zwei schnelle Änderungen innerhalb der Pause: ein Aufruf.
    before = engineRuns();
    setFields(vm.model, { lambdaManual: 0.6 });
    await wait(30);
    setFields(vm.model, { lambdaManual: 0.7 });
    await idle(vm);
    assertEqual(engineRuns() - before, 1, 'Engine-Aufrufe bei zwei Änderungen innerhalb der Pause');
    assertEqual(vm.result.lambda, 0.7);
    // Neustart ohne geänderte Eingabe (Neueinhängen): kein Aufruf, auch nach read() und allen Gettern.
    before = engineRuns();
    const again = await mount(plain(h.states[INST]));
    readAll(again.vm());
    await idle(again.vm());
    assertEqual(engineRuns() - before, 0, 'Engine-Aufrufe bei einem Neustart ohne geänderte Eingabe');
    assertEqual(again.vm().result.lambda, 0.7);
    // Modus auto: eine Änderung von lambdaManual startet keinen Lauf.
    const auto = await mount(stored({ columnRef: REF2 }));
    const avm = auto.vm();
    const value = avm.analysis;
    before = engineRuns();
    setFields(avm.model, { lambdaManual: 1.5 });
    await settle();
    assertEqual(avm._asyncTasks.analysis.running, false, 'Lauf im Modus auto gestartet');
    await idle(avm);
    readAll(avm);
    assertEqual(engineRuns() - before, 0, 'Engine-Aufrufe je λ-Änderung im Modus auto');
    assertTrue(avm.analysis === value, 'neuer Task-Wert im Modus auto');
    assertEqual(avm.model.lambdaManual, 1.5);
    assertEqual(avm.lambdaShownText, '0,35');
  });

  test('Moduswechsel: auto → manual übernimmt das geschätzte λ in einem Schritt; Rückgängig stellt beides zurück', async () => {
    const h = await mount(stored({ columnRef: REF2 }));
    const vm = h.vm();
    assertEqual(mod.historyCan('undo'), false);
    assertEqual(vm.result.lambda, 0.35);
    choose(h.q('[data-ref="lambda-mode"]'), 'manual');
    await idle(vm);
    assertEqual(vm.model.lambdaMode, 'manual');
    assertEqual(vm.model.lambdaManual, 0.35);
    assertEqual(h.states[INST].lambdaManual, 0.35);
    assertEqual(vm.result.lambdaAuto, false);
    assertEqual(vm.result.lambda, 0.35);
    const lam = h.q('[data-ref="lambda-manual"]');
    assertEqual(lam.disabled, false);
    assertEqual(lam.value, '0,35');
    // Ein Schritt: einmal Rückgängig führt zurück an den Anfang.
    assertTrue(mod.historyStep('undo'), 'kein Schritt zum Zurücknehmen');
    await idle(vm);
    assertEqual(vm.model.lambdaMode, 'auto');
    assertEqual(vm.model.lambdaManual, 0);
    assertEqual(mod.historyCan('undo'), false, 'mehr als ein Schritt');
    assertTrue(mod.historyCan('redo'), 'kein Schritt zum Wiederholen');
    assertEqual(h.q('[data-ref="lambda-mode"]').value, 'auto');
    assertEqual(h.q('[data-ref="lambda-manual"]').disabled, true);
    assertEqual(vm.result.lambdaAuto, true);
    // Wechsel auf manual mit λ 0,5 und zurück auf auto: lambdaManual bleibt stehen.
    vm.model.setLambdaMode({ mode: 'manual', lambda: 0.5 });
    await idle(vm);
    assertDeepEqual(plain(vm.result), EXAMPLE_MANUAL_RESULT);
    choose(h.q('[data-ref="lambda-mode"]'), 'auto');
    await idle(vm);
    assertEqual(vm.model.lambdaMode, 'auto');
    assertEqual(vm.model.lambdaManual, 0.5);
    assertDeepEqual(plain(vm.result), EXAMPLE_AUTO_RESULT);
  });

  test('Moduswechsel ohne Ergebnis übernimmt nichts', async () => {
    const h = await mount(stored({ columnRef: null, lambdaManual: 1.25 }));
    const vm = h.vm();
    choose(h.q('[data-ref="lambda-mode"]'), 'manual');
    await idle(vm);
    assertEqual(vm.model.lambdaMode, 'manual');
    assertEqual(vm.model.lambdaManual, 1.25);
  });

  test('referenzierte Spalte gelöscht: Bezug bleibt, leere Ausgabe, value.result null, kein Wurf', async () => {
    const sheet = SHEET();
    sheet.sheets[0].state.columns.splice(0, 1);
    const h = await mount(stored({ lambdaMode: 'manual', lambdaManual: 0.25 }), { sheet });
    const vm = h.vm();
    assertDeepEqual(plain(vm.model.columnRef), REF);
    assertEqual(vm.hasResult, false);
    assertEqual(vm.result, null);
    assertEqual(vm.plot, null);
    assertDeepEqual(vm.limitRows, []);
    assertEqual(vm.errorText, '');
    assertEqual(vm._asyncTasks.analysis.error, null);
    assertDeepEqual(plain(taskValue(vm)), { result: null, points: [], error: null, message: null });
    assertEqual(h.q('.dmike-kpi-strip'), null);
    assertEqual(h.q('[data-ref="plot"]'), null);
    assertEqual(h.q('.timr__limits-table'), null);
    assertEqual(h.q('.timr__error'), null);
  });

  test('Altprojekt: Migration, chartEdits gewinnen über die Konfiguration, Alteintrag gelöscht, kein Verlaufsschritt, ein Diagramm', async () => {
    const edits = () => ({ [INST]: { 'control-chart': { title: 'Legacy', showTitle: true, bgColor: '#eef6ff', yLabel: 'y (Box-Cox)' } } });
    const chartEdits = edits();
    const h = await mount(plain(LEGACY), { chartEdits });
    const vm = h.vm();
    assertEqual(vm.model.lambdaMode, 'manual');
    assertEqual(vm.model.lambdaManual, 0.25);
    assertEqual(vm.model.chart.title, 'Legacy');
    assertEqual(vm.model.chart.showTitle, true);
    assertEqual(vm.model.chart.bgColor, '#eef6ff');
    assertEqual(vm.model.chart.yLabel, 'y (Box-Cox)');
    assertEqual(Object.keys(h.chartEdits[INST]['control-chart']).length, 0, 'Alteintrag nicht gelöscht');
    // Die Konfiguration des Moduls sagt title '', showTitle false und die eigene y-Achse; der Alteintrag gewinnt.
    assertEqual(vm.plot.title, '');
    assertEqual(vm.plot.yLabel, tr('yLabel'));
    assertEqual(h.shown().title, 'Legacy');
    assertEqual(h.shown().showTitle, true);
    assertEqual(h.shown().bgColor, '#eef6ff');
    assertEqual(h.shown().yLabel, 'y (Box-Cox)');
    assertDeepEqual(plain(vm.result), LEGACY_RESULT);
    assertDeepEqual(h.qa('.dmike-kpi-value').map(text), ['0,250', '3,611', '1']);
    assertEqual(h.q('[data-ref="lambda-manual"]').value, '0,25');
    assertEqual(h.q('[data-ref="lambda-mode"]').value, 'manual');
    assertEqual(mod.historyCan('undo'), false);
    // Eine Zeichenfläche und ein Diagramm, auch nach erneutem Öffnen des gespeicherten Stands.
    assertEqual(h.qa('[data-ref="plot"]').length, 1);
    assertEqual(h.charts.length, 1, 'mehr als ein Diagramm');
    const again = await mount(plain(h.states[INST]), { chartEdits: h.chartEdits });
    assertEqual(again.qa('[data-ref="plot"]').length, 1);
    assertEqual(again.charts.length, 1, 'mehr als ein Diagramm nach dem Neuöffnen');
    assertEqual(again.shown().title, 'Legacy');
    assertEqual(again.vm().model.chart.yLabel, 'y (Box-Cox)');
    assertEqual(mod.historyCan('undo'), false);
  });
});
