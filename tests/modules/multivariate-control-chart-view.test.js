/**
 * Multivariate Regelkarte: das Viewmodel im Browser (viewmodel/viewmodel.js)
 * mit dem echten Modul, der echten Vorlage, einem Fake-stateManager mit
 * Arbeitsblatt und einem Fake-chartManager. Prüft die Getter, die Zählung der
 * Engine-Aufrufe (eine je Änderung an Spalten, α und wirksamer Phase-I-Länge,
 * keine bei einer Phase-I-Länge innerhalb 1 … p und keine beim Neueinhängen)
 * samt Zeit je Änderung, Rückgängig, zu wenige Zeilen, den Fall
 * „referenzierte Spalte gelöscht“, doppelte Bezüge und das Altprojekt mit der
 * Übernahme alter chartEdits beim Einhängen.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual, assertDeepClose } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/multivariate-control-chart/viewmodel/viewmodel.js';
import { State } from '../../js/modules/multivariate-control-chart/domain/model.js';
import { engineRuns } from '../../js/modules/multivariate-control-chart/domain/analyze.js';
import { setFields } from '../../js/core/model.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import { withStoredWorksheetReader } from '../helpers/worksheet-reader.js';

const ID = 'multivariate-control-chart';
const INST = 'mvcc-1';
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

/** Spalten der Altprojekt-Fixture (n = 30; Index 24 bricht den Zusammenhang). */
const DRUCK = [
  5.07, 5.05, 5.02, 5.11, 5.1, 4.85, 5.03, 5.1, 5.06, 5.1, 5.06, 4.8, 4.79, 4.81, 4.98,
  4.83, 4.99, 5.05, 4.56, 5.28, 4.99, 5.23, 5.31, 5.38, 5.35, 4.72, 4.95, 4.82, 4.81, 4.65,
];
const TEMP = [
  180.4, 182.2, 180.4, 180.7, 179.4, 178.5, 179.8, 182.1, 180.1, 182.3, 184.4, 178.7, 174.4, 177, 177.8,
  176.1, 181.5, 183.4, 170.6, 185.4, 180.7, 184, 187, 184.7, 174, 173.6, 178.7, 173.6, 175.8, 172,
];
const DICHTE = [
  1.207, 1.21, 1.21, 1.214, 1.192, 1.183, 1.191, 1.204, 1.213, 1.228, 1.2, 1.198, 1.174, 1.184, 1.179,
  1.179, 1.206, 1.199, 1.166, 1.218, 1.203, 1.213, 1.233, 1.225, 1.215, 1.176, 1.193, 1.182, 1.173, 1.163,
];

/** Spalten des Beispiels `spc-multivariate-t2` (n = 40). */
const X1 = [
  9.443, 9.4997, 9.9555, 10.0867, 9.7519, 9.67, 10.0307, 9.0826, 11.8523, 10.8144,
  9.4757, 9.1637, 9.8257, 11.7311, 10.7309, 9.9616, 11.6278, 10.8584, 12.8445, 9.6387,
  10.2156, 11.0843, 9.839, 10.9086, 10.5786, 10.1041, 9.885, 9.1481, 11.581, 11.5,
  8.8, 11.3882, 9.3073, 10.0255, 10.2312, 10.4696, 9.7404, 9.6072, 9.721, 10.2589,
];
const X2 = [
  17.8709, 19.1593, 20.2643, 19.8516, 18.4807, 20.2459, 19.0573, 18.7571, 23.701, 21.8733,
  18.0973, 17.7089, 20.0591, 22.7193, 19.3088, 21.1978, 23.5493, 20.5041, 24.4945, 19.4812,
  23.182, 22.2895, 17.525, 21.3701, 23.0546, 21.2058, 18.6837, 20.7732, 22.6193, 17,
  23.5, 20.6831, 18.6879, 19.9861, 21.1606, 20.6288, 18.9269, 19.2184, 18.2083, 20.9376,
];

/** `read().result` der Altform für die Altprojekt-Fixture. */
const LEGACY_RESULT = {
  n: 30, p: 3, m: 20, cl: 3.3529411764705883, ucl: 18.254249708826574,
  mean: [4.982000000000001, 179.76, 1.1977499999999999],
  covariance: [
    [0.026216842105263177, 0.5011368421052635, 0.0021136842105263175],
    [0.5011368421052635, 12.086736842105273, 0.046352631578947395],
    [0.0021136842105263175, 0.046352631578947395, 0.0002674605263157896],
  ],
  signals: [24],
};

/** `read().result` der Altform für das Beispiel. */
const EXAMPLE_RESULT = {
  n: 40, p: 2, m: 40, cl: 2.0526315789473686, ucl: 14.598254418877096,
  mean: [10.260962500000002, 20.400564999999997],
  covariance: [[0.807552591121795, 0.9953267166025642], [0.9953267166025642, 3.764149381307691]],
  signals: [],
};

const COLS = [
  { id: 'druck', name: 'Druck', values: DRUCK },
  { id: 'temp', name: 'Temperatur', values: TEMP },
  { id: 'dichte', name: 'Dichte', values: DICHTE },
  { id: 'x1', name: 'X1', values: X1 },
  { id: 'x2', name: 'X2', values: X2 },
];
const SHEET = (cols = COLS) => ({
  sheets: [{
    id: 's1',
    state: { rowCount: Math.max(...cols.map((c) => c.values.length), 0), columns: cols.map((c) => ({ type: 'numeric', ...c, values: [...c.values] })) },
  }],
});
const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });
const LEGACY_REFS = [ref('druck'), ref('temp'), ref('dichte')];
const EXAMPLE_REFS = [ref('x1'), ref('x2')];
/** Gespeicherter Stand der neuen Form. */
const stored = (over = {}) => ({ ...new State().toJSON(), columnRefs: LEGACY_REFS, alpha: 0.01, baselineCount: 20, ...over });
/** Die Altform aus der Fixture `legacy-project.json` (ohne `_schema`). */
const LEGACY = { columnRefs: LEGACY_REFS, alpha: 0.01, baselineCount: 20, exampleWorksheetId: null };

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
  const vm = () => Alpine.$data(container.querySelector('[x-data]'));
  return {
    states, charts, container, chartEdits, vm,
    /** Die Konfiguration, die das Diagramm zuletzt zeigt. */
    shown: () => charts.at(-1)?.config ?? null,
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
  void vm.hasResult; void vm.errorText; void vm.kpi; void vm.badge; void vm.plot; void vm.chartTitle;
};
/** Ein Eingabefeld wie der Nutzer ändern. */
function type(el, value) {
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
/** Ein Kästchen im Spaltenwähler umschalten. */
function toggleColumn(h, columnId) {
  const cb = h.q(`[data-ref="col-picker-wrap"] input[data-col-key="ws1|s1|${columnId}"]`);
  if (!cb) throw new Error(`Kästchen für ${columnId} fehlt`);
  cb.checked = !cb.checked;
  cb.dispatchEvent(new Event('change', { bubbles: true }));
}
/** Alle Ableitungen des Models (Lesefläche des Agenten). */
const DERIVED = ['result', 'points', 'error', 'message', 'activeParams', 'activeMultiSlots'];
/** Die genannten Lesefelder aus `read()`. */
const pick = (out, keys) => Object.fromEntries(keys.map((k) => [k, out[k]]));
/** Wirft `fn`? Liefert den Fehler oder null. */
function thrown(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

/** Pseudozufall, fest geseedet (LCG), normalverteilt über Box-Muller. */
function normals(seed) {
  let s = seed >>> 0;
  const u = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 1) / 4294967297; };
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}
/** `k` korrelierte Spalten mit je `n` Werten (gemeinsamer Faktor). */
function correlated(n, k, seed = 7) {
  const z = normals(seed);
  const cols = Array.from({ length: k }, (_, j) => ({ id: `v${j}`, name: `V${j}`, values: new Array(n) }));
  for (let i = 0; i < n; i++) {
    const f = z();
    for (let j = 0; j < k; j++) cols[j].values[i] = 10 + j + 0.8 * f + 0.6 * z();
  }
  return cols;
}
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/**
 * Zeit und Engine-Aufrufe je Änderung: zwei Aufwärmläufe, dann zehn
 * gemessene Änderungen. `view` misst von der Änderung, bis `computed
 * analysis`, Presenter, `plot` und die Ableitungen ohne die Zeilenliste
 * gelesen sind (was jede Änderung in der Oberfläche kostet); `bulk` danach
 * das Lesen der Zeilenliste `points` durch den Agenten.
 * @returns {Promise<{ view: { median: number, max: number }, bulk: { median: number, max: number }, runs: number[] }>}
 */
async function measure(vm, changes) {
  const view = [];
  const bulk = [];
  const runs = [];
  for (let i = 0; i < 12; i++) {
    const before = engineRuns();
    const t0 = performance.now();
    setFields(vm.model, changes[i % changes.length]);
    void vm.hasResult; void vm.errorText; void vm.kpi; void vm.badge; void vm.plot; void vm.chartTitle;
    vm.read({ fields: DERIVED.filter((f) => f !== 'points') });
    const t1 = performance.now();
    vm.read({ fields: ['points'] });
    const t2 = performance.now();
    await settle();
    readAll(vm);
    if (i >= 2) { view.push(t1 - t0); bulk.push(t2 - t1); runs.push(engineRuns() - before); }
  }
  const stat = (xs) => ({ median: median(xs), max: Math.max(...xs) });
  return { view: stat(view), bulk: stat(bulk), runs };
}

suite('multivariate-control-chart: Viewmodel im Browser', () => {
  test('Ergebnis (Altprojekt-Daten): KPI-Leiste, Abzeichen, Kopfzeile, Diagramm, Felder, Lesefläche', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertTrue(vm.hasResult, 'kein Ergebnis');
    assertEqual(vm.errorText, '');
    assertDeepEqual(plain(vm.kpi), {
      uclText: '18,254', alphaText: 'α = 0,01', pText: '3', baselineText: 'm = 20 Baseline',
      signals: 1, ofText: 'von 30 Datenpunkten', signalsClass: 'dmike-kpi--bad',
    });
    assertDeepEqual(plain(vm.badge), { text: tr('unstable', { count: 1 }), cls: 'mvcc__badge--unstable', stable: false, unstable: true });
    assertEqual(vm.chartTitle, 'Hotelling T² — Druck, Temperatur, Dichte');
    const out = vm.read({ fields: ['result', 'points', 'error', 'message', 'activeParams', 'activeMultiSlots'] });
    assertDeepClose(plain(out.result), LEGACY_RESULT);
    assertEqual(out.points.length, 30);
    assertEqual(out.points[24].signal, true);
    assertEqual(out.points.filter((p) => p.signal).length, 1);
    assertEqual(out.error, null);
    assertEqual(out.message, null);
    assertDeepEqual(plain(out.activeParams), ['alpha', 'baselineCount']);
    assertDeepEqual(plain(out.activeMultiSlots), ['columnRefs']);
    const plot = plain(vm.plot);
    assertDeepEqual(plot, {
      title: '', showTitle: false, showLegend: false, xLabel: tr('xLabelSample'), yLabel: tr('yLabel_t2'),
      values: out.points.map((p) => p.t2),
      cl: [LEGACY_RESULT.cl], ucl: [LEGACY_RESULT.ucl], lcl: [0], sigma: [0],
      violationIndices: [24], usl: null, lsl: null, showZones: false,
    });
    assertTrue(plot.values.every((v) => Number.isFinite(v)), 'nicht endlicher Wert im Diagramm');
    assertEqual(vm.legacyEditKey, 'control-chart');
    // Vorlage: drei Kacheln in alter Reihenfolge mit festen Ankern, Kopfzeile mit Warn-Icon, ein Diagramm.
    assertEqual(h.qa('[data-ref="stats-bar"] .dmike-kpi').length, 3);
    assertDeepEqual(h.qa('.dmike-kpi-value').map(text), ['18,254', '3', '1']);
    assertDeepEqual(h.qa('.dmike-kpi-label').map(text), [tr('kpiUclT2'), tr('statVariables'), tr('statSignals')]);
    assertDeepEqual(h.qa('.dmike-kpi-sub').map(text), ['α = 0,01', 'm = 20 Baseline', 'von 30 Datenpunkten']);
    assertDeepEqual(h.qa('.dmike-kpi-label').map((el) => el.getAttribute('data-help-key')), [
      `modules.${ID}.types.Result.ucl`, `modules.${ID}.types.Result.p`, `modules.${ID}.types.Result.signals`,
    ]);
    assertTrue(h.qa('.dmike-kpi')[2].classList.contains('dmike-kpi--bad'), 'Klasse der dritten Kachel');
    assertEqual(text(h.q('.mvcc__chart-title')), 'Hotelling T² — Druck, Temperatur, Dichte');
    assertTrue(h.q('.mvcc__badge').classList.contains('mvcc__badge--unstable'), 'Klasse des Abzeichens');
    assertEqual(h.qa('.mvcc__badge [data-icon="status.warning"]').length, 1);
    assertEqual(h.qa('.mvcc__badge [data-icon="status.ok"]').length, 0);
    assertEqual(h.qa('[data-ref="chart-wrap"] .mvcc__chart-section').length, 1);
    assertEqual(h.qa('[data-ref="plot"]').length, 1);
    assertEqual(h.charts.length, 1);
    assertEqual(h.charts[0].type, 'control-chart');
    assertTrue(h.charts[0].el.closest('[data-ref="plot"]') !== null, 'Diagramm nicht im Wirt');
    assertDeepEqual([...h.shown().violationIndices], [24]);
    assertEqual(h.q('.mvcc__error'), null);
    // Spaltenwähler: drei Kästchen angehakt.
    const checked = h.qa('[data-ref="col-picker-wrap"] input[type="checkbox"]').filter((c) => c.checked).map((c) => c.dataset.colKey);
    assertDeepEqual(checked, ['ws1|s1|druck', 'ws1|s1|temp', 'ws1|s1|dichte']);
    // Zahlenfelder als Text mit Dezimalkomma, ohne Bereichsattribute.
    const alpha = h.q('[data-ref="alpha"]');
    assertEqual(alpha.type, 'text');
    assertEqual(alpha.getAttribute('inputmode'), 'decimal');
    assertEqual(alpha.value, '0,01');
    const base = h.q('[data-ref="baseline-count"]');
    assertEqual(base.type, 'text');
    assertEqual(base.getAttribute('inputmode'), 'numeric');
    assertEqual(base.value, '20');
    assertEqual(base.getAttribute('placeholder'), tr('baselineAll'));
    for (const el of [alpha, base]) {
      assertTrue(!el.hasAttribute('step') && !el.hasAttribute('min') && !el.hasAttribute('max'), 'Bereichsattribute am Zahlenfeld');
    }
  });

  test('Beispiel: stabil, Abzeichen mit OK-Icon, Phase I leer heißt alle', async () => {
    const h = await mount(stored({ columnRefs: EXAMPLE_REFS, alpha: 0.0027, baselineCount: null }));
    const vm = h.vm();
    assertDeepClose(plain(vm.read({ fields: ['result'] }).result), EXAMPLE_RESULT);
    assertDeepEqual(plain(vm.kpi), {
      uclText: '14,598', alphaText: 'α = 0,0027', pText: '2', baselineText: 'm = 40 Baseline',
      signals: 0, ofText: 'von 40 Datenpunkten', signalsClass: 'dmike-kpi--good',
    });
    assertDeepEqual(plain(vm.badge), { text: tr('stable'), cls: 'mvcc__badge--stable', stable: true, unstable: false });
    assertEqual(h.qa('.mvcc__badge [data-icon="status.ok"]').length, 1);
    assertEqual(h.qa('.mvcc__badge [data-icon="status.warning"]').length, 0);
    assertEqual(vm.chartTitle, 'Hotelling T² — X1, X2');
    assertEqual(h.q('[data-ref="baseline-count"]').value, '');
    assertEqual(h.q('[data-ref="alpha"]').value, '0,0027');
  });

  test('unter zwei Spalten: alles leer, kein Diagramm, kein Fehlerkasten', async () => {
    for (const columnRefs of [[], [ref('druck')]]) {
      const h = await mount(stored({ columnRefs }));
      const vm = h.vm();
      assertEqual(vm.hasResult, false);
      assertEqual(vm.analysis, null);
      assertEqual(vm.kpi, null);
      assertEqual(vm.badge, null);
      assertEqual(vm.plot, null);
      assertEqual(vm.errorText, '');
      const out = vm.read({ fields: ['result', 'points', 'error', 'message'] });
      assertDeepEqual(plain(pick(out, ['result', 'points', 'error', 'message'])), { result: null, points: [], error: null, message: null });
      assertEqual(h.q('.dmike-kpi-strip'), null);
      assertEqual(h.q('[data-ref="plot"]'), null);
      assertEqual(h.q('.mvcc__error'), null);
      assertEqual(h.charts.length, 0);
    }
  });

  test('zu wenige Zeilen: stehender Fehlerkasten gleich message (errTooFewRows mit p), kein Diagramm', async () => {
    const short = [
      { id: 'a', name: 'A', values: [1, 2, 3, 4] },
      { id: 'b', name: 'B', values: [2, '2,5', 1, 7] },
      { id: 'c', name: 'C', values: [5, 3, 8] },
    ];
    const h = await mount(stored({ columnRefs: [ref('a'), ref('b'), ref('c')] }), { sheet: SHEET(short) });
    const vm = h.vm();
    assertEqual(vm.hasResult, false);
    const out = vm.read({ fields: ['result', 'error', 'message'] });
    assertEqual(out.error, 'errTooFewRows');
    assertEqual(out.message, tr('errTooFewRows', { p: 3 }));
    assertEqual(out.result, null);
    assertEqual(vm.errorText, out.message);
    assertEqual(text(h.q('[data-ref="error-area"] .mvcc__error')), out.message);
    assertEqual(h.q('.dmike-kpi-strip'), null);
    assertEqual(h.q('[data-ref="plot"]'), null);
    assertEqual(h.charts.length, 0);
  });

  test('konstante Spalte: Fehlerkasten err_singular', async () => {
    const cols = [...COLS, { id: 'k', name: 'Konstant', values: DRUCK.map(() => 1) }];
    const h = await mount(stored({ columnRefs: [ref('druck'), ref('k')] }), { sheet: SHEET(cols) });
    const vm = h.vm();
    assertEqual(vm.hasResult, false);
    assertEqual(vm.read({ fields: ['error'] }).error, 'err_singular');
    assertEqual(vm.errorText, tr('err_singular'));
    assertEqual(text(h.q('.mvcc__error')), tr('err_singular'));
  });

  test('Zählung und Zeit: eine Engine-Rechnung je Änderung, keine beim Neueinhängen und bei Phase I innerhalb 1 … p', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    readAll(vm);
    await settle();
    // Spaltenwechsel über die instance.set-Senke.
    let before = engineRuns();
    setFields(vm.model, { columnRefs: EXAMPLE_REFS });
    await settle();
    readAll(vm);
    await settle();
    assertEqual(engineRuns() - before, 1, 'Engine-Aufrufe je Spaltenwechsel');
    assertEqual(vm.chartTitle, 'Hotelling T² — X1, X2');
    // Spaltenwechsel über den Wähler.
    before = engineRuns();
    toggleColumn(h, 'druck');
    await settle();
    readAll(vm);
    await settle();
    assertDeepEqual(plain(vm.model.columnRefs), [...EXAMPLE_REFS, ref('druck')]);
    assertEqual(engineRuns() - before, 1, 'Engine-Aufrufe je Spaltenwechsel über den Wähler');
    assertEqual(vm.kpi.pText, '3');
    // α über das Feld.
    before = engineRuns();
    type(h.q('[data-ref="alpha"]'), '0,05');
    await settle();
    readAll(vm);
    await settle();
    assertEqual(vm.model.alpha, 0.05);
    assertEqual(engineRuns() - before, 1, 'Engine-Aufrufe je α-Wechsel');
    assertEqual(vm.kpi.alphaText, 'α = 0,05');
    // Phase I über das Feld, wirksam (> p).
    before = engineRuns();
    type(h.q('[data-ref="baseline-count"]'), '15');
    await settle();
    readAll(vm);
    await settle();
    assertEqual(vm.model.baselineCount, 15);
    assertEqual(engineRuns() - before, 1, 'Engine-Aufrufe je wirksamer Phase-I-Änderung');
    assertEqual(vm.kpi.baselineText, 'm = 15 Baseline');
    // Phase I innerhalb 1 … p: wirkungslos, keine Rechnung.
    setFields(vm.model, { baselineCount: null });
    await settle();
    readAll(vm);
    before = engineRuns();
    for (const v of ['2', '3', '1']) {
      type(h.q('[data-ref="baseline-count"]'), v);
      await settle();
      readAll(vm);
      await settle();
    }
    assertEqual(vm.model.baselineCount, 1);
    assertEqual(engineRuns() - before, 0, 'Engine-Aufrufe bei Phase I innerhalb 1 … p');
    assertEqual(vm.kpi.baselineText, 'm = 30 Baseline');
    // Neueinhängen ohne Änderung: keine Rechnung, auch nach read() und allen Gettern.
    before = engineRuns();
    const again = await mount(plain(h.states[INST]));
    readAll(again.vm());
    await settle();
    readAll(again.vm());
    assertEqual(engineRuns() - before, 0, 'Engine-Aufrufe beim Neueinhängen');
    assertTrue(again.vm().hasResult, 'kein Ergebnis nach dem Neueinhängen');
  });

  test('Je Änderung eine Rechnung (n = 10 000, p = 10, und das Beispiel; ein Durchgang, Zeiten nur protokolliert)', async () => {
    const big = correlated(10000, 11);
    const refsA = big.slice(0, 10).map((c) => ref(c.id));
    const refsB = big.slice(1, 11).map((c) => ref(c.id));
    const cases = [
      { name: 'n=10000 p=10', sheet: SHEET(big), model: stored({ columnRefs: refsA, alpha: 0.0027, baselineCount: null }), refs: [refsB, refsA], bc: [200, 300] },
      { name: 'Beispiel', sheet: SHEET(), model: stored({ columnRefs: EXAMPLE_REFS, alpha: 0.0027, baselineCount: null }), refs: [[ref('x2'), ref('x1')], EXAMPLE_REFS], bc: [20, 30] },
    ];
    /** @type {string[]} */
    const report = [];
    for (const c of cases) {
      const h = await mount(c.model, { sheet: c.sheet });
      const vm = h.vm();
      assertTrue(vm.hasResult, `${c.name}: kein Ergebnis`);
      const kinds = {
        Spalten: c.refs.map((columnRefs) => ({ columnRefs })),
        alpha: [{ alpha: 0.01 }, { alpha: 0.0027 }],
        baselineCount: c.bc.map((baselineCount) => ({ baselineCount })),
      };
      for (const [kind, changes] of Object.entries(kinds)) {
        const m = await measure(vm, changes);
        report.push(`${c.name} ${kind}: Ansicht Median ${m.view.median.toFixed(2)} ms (Maximum ${m.view.max.toFixed(2)}), points Median ${m.bulk.median.toFixed(2)} ms (Maximum ${m.bulk.max.toFixed(2)}), Engine je Änderung ${[...new Set(m.runs)].join('/')}`);
        assertDeepEqual(m.runs, new Array(10).fill(1), `${c.name} ${kind}: Engine-Aufrufe je Änderung`);
      }
      assertTrue(vm.hasResult, `${c.name}: kein Ergebnis nach der Messung`);
    }
    console.log(`multivariate-control-chart Messung:\n  ${report.join('\n  ')}`);
  });

  test('Rückgängig nach α-Änderung: alter Wert, Wiederholen möglich', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertEqual(mod.historyCan('undo'), false);
    type(h.q('[data-ref="alpha"]'), '0,05');
    await settle();
    assertEqual(vm.model.alpha, 0.05);
    assertEqual(h.states[INST].alpha, 0.05);
    assertTrue(mod.historyStep('undo'), 'kein Schritt zum Zurücknehmen');
    await settle();
    assertEqual(vm.model.alpha, 0.01);
    assertEqual(h.q('[data-ref="alpha"]').value, '0,01');
    assertEqual(vm.kpi.alphaText, 'α = 0,01');
    assertEqual(mod.historyCan('undo'), false, 'mehr als ein Schritt');
    assertTrue(mod.historyCan('redo'), 'kein Schritt zum Wiederholen');
    assertTrue(mod.historyStep('redo'), 'Wiederholen');
    await settle();
    assertEqual(vm.model.alpha, 0.05);
  });

  test('Zahlenfelder lehnen Bereichsfremdes ab', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    for (const raw of ['0', '1', '1,5', 'abc']) {
      type(h.q('[data-ref="alpha"]'), raw);
      await settle();
      assertEqual(vm.model.alpha, 0.01, `α ${raw} angenommen`);
    }
    for (const raw of ['0', '2,5', '-3']) {
      type(h.q('[data-ref="baseline-count"]'), raw);
      await settle();
      assertEqual(vm.model.baselineCount, 20, `Phase I ${raw} angenommen`);
    }
    type(h.q('[data-ref="baseline-count"]'), '');
    await settle();
    assertEqual(vm.model.baselineCount, null);
    assertEqual(vm.kpi.baselineText, 'm = 30 Baseline');
  });

  test('referenzierte Spalte gelöscht: Bezüge bleiben, leere Ausgabe, result und message null, kein Wurf', async () => {
    const cols = COLS.filter((c) => c.id !== 'dichte');
    const h = await mount(stored(), { sheet: SHEET(cols) });
    const vm = h.vm();
    assertDeepEqual(plain(vm.model.columnRefs), LEGACY_REFS);
    assertEqual(vm.hasResult, false);
    assertEqual(vm.plot, null);
    assertEqual(vm.kpi, null);
    assertEqual(vm.errorText, '');
    const out = vm.read({ fields: ['result', 'points', 'error', 'message'] });
    assertDeepEqual(plain(pick(out, ['result', 'points', 'error', 'message'])), { result: null, points: [], error: null, message: null });
    assertEqual(h.q('.dmike-kpi-strip'), null);
    assertEqual(h.q('[data-ref="plot"]'), null);
    assertEqual(h.q('.mvcc__error'), null);
    assertEqual(h.charts.length, 0);
  });

  test('doppelte Bezüge: Schreiben abgelehnt (uniqueColumnRefs), Altstand beim Laden auf das erste Vorkommen repariert', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    const err = thrown(() => setFields(vm.model, { columnRefs: [ref('druck'), ref('temp'), ref('druck')] }));
    assertTrue(err !== null, 'Doppelte angenommen');
    assertEqual(err.invariant, 'uniqueColumnRefs');
    assertDeepEqual(plain(vm.model.columnRefs), LEGACY_REFS);
    assertEqual(mod.historyCan('undo'), false, 'abgelehnter Schreibversuch als Schritt');
    // Altstand ohne _schema mit doppeltem Bezug.
    const dup = await mount({ ...LEGACY, columnRefs: [ref('druck'), ref('temp'), ref('druck')] });
    const dvm = dup.vm();
    assertDeepEqual(plain(dvm.model.columnRefs), [ref('druck'), ref('temp')]);
    assertTrue(dvm.hasResult, 'kein Ergebnis nach der Reparatur');
    assertEqual(dvm.kpi.pText, '2');
    assertEqual(mod.historyCan('undo'), false);
    const checked = dup.qa('[data-ref="col-picker-wrap"] input[type="checkbox"]').filter((c) => c.checked).map((c) => c.dataset.colKey);
    assertDeepEqual(checked, ['ws1|s1|druck', 'ws1|s1|temp']);
  });

  test('Altprojekt: Migration, chartEdits gewinnen über die Konfiguration, Alteintrag gelöscht, kein Verlaufsschritt, ein Diagramm', async () => {
    const chartEdits = { [INST]: { 'control-chart': { title: 'Legacy', showTitle: true, bgColor: '#eef6ff', yLabel: 'T² (Legacy)' } } };
    const h = await mount(plain(LEGACY), { chartEdits });
    const vm = h.vm();
    assertDeepEqual(plain(vm.model.columnRefs), LEGACY_REFS);
    assertEqual(vm.model.alpha, 0.01);
    assertEqual(vm.model.baselineCount, 20);
    assertEqual(vm.model.chart.title, 'Legacy');
    assertEqual(vm.model.chart.showTitle, true);
    assertEqual(vm.model.chart.bgColor, '#eef6ff');
    assertEqual(vm.model.chart.yLabel, 'T² (Legacy)');
    assertEqual(Object.keys(h.chartEdits[INST]['control-chart']).length, 0, 'Alteintrag nicht gelöscht');
    // Die Konfiguration des Moduls sagt title '', showTitle false und die eigene y-Achse; der Alteintrag gewinnt.
    assertEqual(vm.plot.title, '');
    assertEqual(vm.plot.yLabel, tr('yLabel_t2'));
    assertEqual(h.shown().title, 'Legacy');
    assertEqual(h.shown().showTitle, true);
    assertEqual(h.shown().bgColor, '#eef6ff');
    assertEqual(h.shown().yLabel, 'T² (Legacy)');
    assertDeepClose(plain(vm.read({ fields: ['result'] }).result), LEGACY_RESULT);
    assertDeepEqual(h.qa('.dmike-kpi-value').map(text), ['18,254', '3', '1']);
    assertEqual(h.q('[data-ref="alpha"]').value, '0,01');
    assertEqual(h.q('[data-ref="baseline-count"]').value, '20');
    assertEqual(mod.historyCan('undo'), false);
    // Eine Diagrammkarte und ein Diagramm, auch nach erneutem Öffnen des gespeicherten Stands.
    assertEqual(h.qa('.mvcc__chart-section').length, 1);
    assertEqual(h.qa('[data-ref="plot"]').length, 1);
    assertEqual(h.charts.length, 1, 'mehr als ein Diagramm');
    const again = await mount(plain(h.states[INST]), { chartEdits: h.chartEdits });
    assertEqual(again.qa('.mvcc__chart-section').length, 1);
    assertEqual(again.qa('[data-ref="plot"]').length, 1);
    assertEqual(again.charts.length, 1, 'mehr als ein Diagramm nach dem Neuöffnen');
    assertEqual(again.shown().title, 'Legacy');
    assertEqual(again.vm().model.chart.yLabel, 'T² (Legacy)');
    assertEqual(mod.historyCan('undo'), false);
  });
});
