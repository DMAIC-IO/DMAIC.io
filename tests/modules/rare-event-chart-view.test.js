/**
 * Regelkarte seltener Ereignisse: das Viewmodel im Browser
 * (viewmodel/viewmodel.js) mit dem echten Modul, der echten Vorlage, einem
 * Fake-stateManager mit Arbeitsblatt und einem Fake-chartManager. Prüft die
 * Getter samt Vorlage (t-Karte mit Lücken, g-Karte), die Zählung der
 * Engine-Aufrufe (eine je Spalten-, Typ- und Wertänderung, keine bei den
 * Editor-Einstellungen, beim Beispielblatt, bei fremden Spalten und beim
 * Neueinhängen), den Typwechsel g ↔ t mit Rückgängig und Wiederholen, den
 * Fehlerkasten bei Überlauf, den Fall „referenzierte Spalte gelöscht“ und das
 * Altprojekt mit der Übernahme alter chartEdits beim Einhängen.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/rare-event-chart/viewmodel/viewmodel.js';
import { State } from '../../js/modules/rare-event-chart/domain/model.js';
import { engineRuns } from '../../js/modules/rare-event-chart/domain/analyze.js';
import { setFields } from '../../js/core/model.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import { withStoredWorksheetReader } from '../helpers/worksheet-reader.js';
import { TAGE, TAGE_SEIT, COUNTS, LEGACY_RESULT, EXAMPLE_RESULT, COUNTS_RESULT } from './rare-event-chart/analyze.test.js';

const ID = 'rare-event-chart';
const INST = 'rec-1';
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

/** Werte um 10²⁰⁰: ḡ(ḡ + 1) läuft über (T4). */
const HUGE = [1e200, 2e200, 1.5e200, 3e200, 2.5e200];

const COLS = [
  { id: 'tage', name: 'Tage', values: TAGE },
  { id: 'seit', name: 'TageSeitLetztem', values: TAGE_SEIT },
  { id: 'counts', name: 'Counts', values: COUNTS },
  { id: 'huge', name: 'Riesig', values: HUGE },
];
const SHEET = (cols = COLS) => ({
  sheets: [{
    id: 's1',
    state: { rowCount: Math.max(...cols.map((c) => c.values.length), 0), columns: cols.map((c) => ({ type: 'numeric', ...c, values: [...c.values] })) },
  }],
});
const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });
/** Gespeicherter Stand der neuen Form (Altprojekt-Werte). */
const stored = (over = {}) => ({ ...new State().toJSON(), chartTypeId: 't', columnRef: ref('tage'), ...over });
/** Die Altform aus der Fixture `legacy-project.json` (ohne `_schema`). */
const LEGACY = { chartTypeId: 't', columnRef: ref('tage'), exampleWorksheetId: null };
/** Die alten chartEdits der Fixture. */
const LEGACY_EDITS = () => ({
  [INST]: { 'control-chart': { title: 'Legacy', showTitle: true, bgColor: '#eef6ff', yLabel: 'y (Legacy)' } },
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
  /** Die lebenden Diagramme in der Zeichenfläche. */
  const live = () => charts.filter((c) => c.alive && c.el.isConnected && c.el.closest('[data-ref="plot"]'));
  return {
    states, charts, container, chartEdits, vm, live, bus,
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
  void vm.typeHint; void vm.dataHint; void vm.chartTypeOptions; void vm.legacyEditKey;
};
/** Eine Auswahl wie der Nutzer ändern. */
function choose(el, value) {
  if (!el) throw new Error('Feld fehlt');
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
/** Der Schlüssel der Spalte `name` im Spaltenwähler. */
function pickerValue(h, name) {
  const sel = h.q('[data-ref="col-picker-wrap"] select');
  if (!sel) throw new Error('Spaltenwähler fehlt');
  const o = [...sel.options].find((x) => x.textContent.includes(name));
  if (!o) throw new Error(`Spalte ${name} fehlt im Wähler`);
  return o.value;
}
/** Engine-Aufrufe einer Änderung: ändern, alles lesen, nochmals lesen. */
async function runsOf(vm, change) {
  const before = engineRuns();
  await change();
  await settle();
  readAll(vm);
  await settle();
  readAll(vm);
  return engineRuns() - before;
}
/** Die gelesenen Felder des Models. */
const DERIVED = ['result', 'points', 'activeParams', 'activeColumnSlots'];
const pick = (out, keys) => Object.fromEntries(keys.map((k) => [k, out[k]]));

suite('rare-event-chart: Viewmodel im Browser', () => {
  test('t-Karte (Altprojekt-Daten): KPI-Leiste, Kopfzeile, ein Diagramm mit Lücken, Eingaben, Lesefläche', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertTrue(vm.hasResult, 'kein Ergebnis');
    assertEqual(vm.errorText, '');
    assertDeepEqual(plain(vm.kpi), {
      clText: '33,546', sigmaText: 'σ̂ = 0,871', uclText: '395,417', lclText: '0,000', signals: 1,
      ofText: 'von 18 Datenpunkten', signalsClass: 'dmike-kpi--bad', transformed: true,
    });
    assertEqual(vm.kpi, vm.kpi, 'KPI-Leiste bei gleicher Rechnung neu gebaut');
    const out = vm.read({ fields: DERIVED });
    assertDeepEqual(plain(out.result), LEGACY_RESULT);
    assertEqual(out.points.length, 20);
    assertEqual(out.points[7].value, null);
    assertEqual(out.points[12].value, null);
    assertEqual(out.points[15].signal, true);
    assertDeepEqual(plain(out.activeParams), ['chartTypeId']);
    assertDeepEqual(plain(out.activeColumnSlots), ['columnRef']);
    // Vorlage: KPI-Leiste mit festen Ankern, Hinweis zur Originalskala.
    assertEqual(h.qa('[data-ref="stats-bar"] .dmike-kpi').length, 3);
    assertDeepEqual(h.qa('.dmike-kpi-value').map(text), ['33,546', '395,417', '1']);
    assertDeepEqual(h.qa('.dmike-kpi-label').map(text), [tr('statCL'), 'UCL / LCL', tr('statSignals')]);
    assertDeepEqual(h.qa('.dmike-kpi-sub').map(text), ['σ̂ = 0,871', '0,000', 'von 18 Datenpunkten']);
    assertDeepEqual(h.qa('.dmike-kpi-label').map((el) => el.getAttribute('data-help-key')), [
      `modules.${ID}.types.Result.cl`, `modules.${ID}.types.Result.ucl`, `modules.${ID}.types.Result.signals`,
    ]);
    assertTrue(h.qa('.dmike-kpi')[2].classList.contains('dmike-kpi--bad'), 'Klasse der dritten Kachel');
    const note = h.q('[data-ref="stats-bar"] .field-hint');
    assertEqual(text(note), tr('originalScaleNote'));
    assertTrue(note.style.display !== 'none', 'Hinweis zur Originalskala verborgen');
    // Kopfzeile mit Abzeichen und Icon.
    assertEqual(vm.chartTitle, 't-Karte — Tage');
    assertEqual(text(h.q('.rec__chart-title')), 't-Karte — Tage');
    assertDeepEqual(plain(vm.badge), { text: '1 Signale', cls: 'rec__badge--unstable', icon: 'status.warning' });
    const badge = h.q('.rec__badge');
    assertTrue(badge.classList.contains('rec__badge--unstable'), 'Klasse des Abzeichens');
    assertEqual(badge.querySelector('.icon').getAttribute('data-icon'), 'status.warning');
    assertEqual(text(badge), '1 Signale');
    // Diagramm: ein Widget in der Zeichenfläche, Konfiguration der gezeichneten Skala.
    assertEqual(vm.legacyEditKey, 'control-chart');
    const c = plain(vm.plot);
    assertEqual(c.values.length, 20);
    assertEqual(c.values[7], null);
    assertDeepEqual(c.cl, [LEGACY_RESULT.plotted.cl]);
    assertDeepEqual(c.ucl, [LEGACY_RESULT.plotted.ucl]);
    assertDeepEqual(c.lcl, [LEGACY_RESULT.plotted.lcl]);
    assertDeepEqual(c.sigma, [LEGACY_RESULT.plotted.sigma]);
    assertDeepEqual(c.violationIndices, [15]);
    assertEqual(c.yLabel, tr('yLabel_t'));
    assertEqual(c.xLabel, tr('xLabelSample'));
    assertEqual(h.qa('.rec__chart-section').length, 1);
    assertEqual(h.live().length, 1);
    const shown = h.live()[0];
    assertEqual(shown.type, 'control-chart');
    assertEqual(shown.config.values[7], null);
    assertDeepEqual([...shown.config.violationIndices], [15]);
    assertEqual(h.q('.rec__error'), null);
    // Eingaben: Auswahl, Hinweise je Typ, Spaltenwähler mit Wahl.
    assertEqual(h.q('[data-ref="chart-type"]').value, 't');
    assertDeepEqual(plain(vm.chartTypeOptions).map((o) => [o.value, o.label, o.selected]), [['g', tr('type_g'), false], ['t', tr('type_t'), true]]);
    assertEqual(vm.typeHint, tr('typeHint_t'));
    assertEqual(vm.dataHint, tr('dataHint_t'));
    const hints = h.qa('.rec__input .field-hint').map(text);
    assertDeepEqual(hints, [tr('typeHint_t'), tr('dataHint_t')]);
    assertEqual(h.q('[data-ref="col-picker-wrap"] select').value, pickerValue(h, 'Tage'));
  });

  test('t-Karte (Beispiel): Ergebnis wie die Altform', async () => {
    const h = await mount(stored({ columnRef: ref('seit') }));
    const vm = h.vm();
    assertDeepEqual(plain(vm.read({ fields: ['result'] }).result), EXAMPLE_RESULT);
    assertEqual(vm.chartTitle, 't-Karte — TageSeitLetztem');
    assertEqual(plain(vm.plot).values.length, 25);
    assertEqual(h.live().length, 1);
  });

  test('g-Karte („Counts“): stabil, keine Originalskala, Zählwerte gezeichnet', async () => {
    const h = await mount(stored({ chartTypeId: 'g', columnRef: ref('counts') }));
    const vm = h.vm();
    assertDeepEqual(plain(vm.read({ fields: ['result'] }).result), COUNTS_RESULT);
    assertDeepEqual(plain(vm.kpi), {
      clText: '8,500', sigmaText: 'σ̂ = 8,986', uclText: '35,458', lclText: '0,000', signals: 0,
      ofText: 'von 6 Datenpunkten', signalsClass: 'dmike-kpi--good', transformed: false,
    });
    assertDeepEqual(plain(vm.badge), { text: tr('stable'), cls: 'rec__badge--stable', icon: 'status.ok' });
    assertEqual(h.q('.rec__badge .icon').getAttribute('data-icon'), 'status.ok');
    assertEqual(h.q('[data-ref="stats-bar"] .field-hint').style.display, 'none');
    assertDeepEqual(plain(vm.plot).values, [5, 10, 8, 12, 7, 9]);
    assertEqual(vm.plot.yLabel, tr('yLabel_g'));
    assertEqual(vm.chartTitle, 'g-Karte — Counts');
    assertEqual(vm.typeHint, tr('typeHint_g'));
    assertEqual(vm.dataHint, tr('dataHint_g'));
    assertDeepEqual(h.qa('.rec__input .field-hint').map(text), [tr('typeHint_g'), tr('dataHint_g')]);
  });

  test('ohne Spalte: alles leer, kein Diagramm, kein Fehlerkasten', async () => {
    const h = await mount(new State().toJSON());
    const vm = h.vm();
    assertEqual(vm.hasResult, false);
    assertEqual(vm.analysis, null);
    assertEqual(vm.kpi, null);
    assertEqual(vm.badge, null);
    assertEqual(vm.plot, null);
    assertEqual(vm.errorText, '');
    assertEqual(vm.chartTitle, 'g-Karte — ?');
    assertDeepEqual(plain(pick(vm.read({ fields: ['result', 'points'] }), ['result', 'points'])), { result: null, points: [] });
    assertEqual(h.q('.dmike-kpi-strip'), null);
    assertEqual(h.qa('.rec__chart-section').length, 0);
    assertEqual(h.q('.rec__error'), null);
    assertEqual(h.charts.length, 0);
  });

  test('t-Karte mit unter zwei positiven Werten: leere Ausgabe ohne Meldung', async () => {
    const h = await mount(stored(), { sheet: SHEET([{ id: 'tage', name: 'Tage', values: [5, 0, -1] }]) });
    const vm = h.vm();
    assertEqual(vm.hasResult, false);
    assertEqual(vm.errorText, '');
    assertEqual(h.q('.dmike-kpi-strip'), null);
    assertEqual(h.charts.length, 0);
  });

  test('Überlauf (g-Karte um 10²⁰⁰): stehender Fehlerkasten errCompute, kein Diagramm, result null', async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      const h = await mount(stored({ chartTypeId: 'g', columnRef: ref('huge') }));
      const vm = h.vm();
      assertEqual(vm.hasResult, false);
      assertDeepEqual(plain(vm.analysis), { status: 'error', reason: 'errCompute' });
      assertEqual(vm.errorText, 'Berechnung fehlgeschlagen.');
      assertEqual(text(h.q('[data-ref="error-area"] .rec__error')), tr('errCompute'));
      assertEqual(vm.kpi, null);
      assertEqual(vm.plot, null);
      assertDeepEqual(plain(pick(vm.read({ fields: ['result', 'points'] }), ['result', 'points'])), { result: null, points: [] });
      assertEqual(h.q('.dmike-kpi-strip'), null);
      assertEqual(h.qa('.rec__chart-section').length, 0);
      assertEqual(h.charts.length, 0);
      // Ursache behoben (andere Spalte): der Kasten verschwindet.
      setFields(vm.model, { columnRef: ref('counts') });
      await settle();
      assertEqual(vm.errorText, '');
      assertEqual(h.q('.rec__error'), null);
      assertTrue(vm.hasResult, 'kein Ergebnis nach behobener Ursache');
      assertEqual(h.live().length, 1);
    } finally {
      console.warn = warn;
    }
  });

  test('Zählung: eine Engine-Rechnung je wirksamer Änderung, keine bei Editor, Beispielblatt, fremder Spalte und Neueinhängen', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    readAll(vm);
    await settle();
    // Spaltenwechsel über die instance.set-Senke und über den Wähler.
    assertEqual(await runsOf(vm, () => setFields(vm.model, { columnRef: ref('seit') })), 1, 'Spaltenwechsel');
    assertEqual(vm.chartTitle, 't-Karte — TageSeitLetztem');
    assertEqual(await runsOf(vm, () => choose(h.q('[data-ref="col-picker-wrap"] select'), pickerValue(h, 'Tage'))), 1, 'Spaltenwechsel über den Wähler');
    assertDeepEqual(plain(vm.model.columnRef), ref('tage'));
    // Typwechsel über die Auswahl und über die Senke.
    assertEqual(await runsOf(vm, () => choose(h.q('[data-ref="chart-type"]'), 'g')), 1, 'Typwechsel über die Auswahl');
    assertEqual(vm.model.chartTypeId, 'g');
    assertEqual(await runsOf(vm, () => setFields(vm.model, { chartTypeId: 't' })), 1, 'Typwechsel über die Senke');
    // Werte im Arbeitsblatt: die eigene Spalte rechnet neu, eine fremde nicht.
    assertEqual(await runsOf(vm, () => {
      h.states.ws1 = SHEET(COLS.map((c) => (c.id === 'tage' ? { ...c, values: TAGE.map((v, i) => (i === 0 ? 20 : v)) } : c)));
      h.bus.emit('worksheet:dataChanged', { instanceId: 'ws1' });
    }), 1, 'Wertänderung der eigenen Spalte');
    assertEqual(vm.read({ fields: ['result'] }).result.n, 18);
    assertEqual(await runsOf(vm, () => {
      h.states.ws1 = SHEET(COLS.map((c) => (c.id === 'tage' ? { ...c, values: TAGE.map((v, i) => (i === 0 ? 20 : v)) } : c.id === 'counts' ? { ...c, values: [1, 2, 3] } : c)));
      h.bus.emit('worksheet:dataChanged', { instanceId: 'ws1' });
    }), 0, 'Wertänderung einer fremden Spalte');
    // Editor-Einstellungen und Beispielblatt: keine Rechnung.
    assertEqual(await runsOf(vm, () => { vm.model.chart = { title: 'Neu', showTitle: true }; }), 0, 'model.chart');
    assertEqual(vm.model.chart.title, 'Neu');
    assertEqual(await runsOf(vm, () => { vm.model.exampleWorksheetId = 'ws-x'; }), 0, 'exampleWorksheetId');
    // Neueinhängen ohne Änderung: keine Rechnung, auch nach read() und allen Gettern.
    const before = engineRuns();
    const again = await mount(plain(h.states[INST]), { sheet: plain(h.states.ws1) });
    readAll(again.vm());
    await settle();
    readAll(again.vm());
    assertEqual(engineRuns() - before, 0, 'Engine-Aufrufe beim Neueinhängen');
    assertTrue(again.vm().hasResult, 'kein Ergebnis nach dem Neueinhängen');
    assertEqual(again.live().length, 1);
  });

  test('Typwechsel t → g mit Rückgängig und Wiederholen: ein Schritt, die Spalte bleibt gewählt', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertEqual(mod.historyCan('undo'), false);
    const key = h.q('[data-ref="col-picker-wrap"] select').value;
    choose(h.q('[data-ref="chart-type"]'), 'g');
    await settle();
    assertEqual(vm.model.chartTypeId, 'g');
    assertDeepEqual(plain(vm.model.columnRef), ref('tage'));
    assertEqual(h.q('[data-ref="col-picker-wrap"] select').value, key, 'Spaltenwahl beim Typwechsel verloren');
    const g = plain(vm.read({ fields: ['result'] }).result);
    assertEqual(g.chartType, 'g');
    assertEqual(g.n, 20);
    assertEqual(g.transformed, false);
    assertEqual(h.q('[data-ref="stats-bar"] .field-hint').style.display, 'none');
    assertEqual(text(h.q('.rec__chart-title')), 'g-Karte — Tage');
    assertEqual(h.live().length, 1, 'mehr als ein Diagramm nach dem Typwechsel');
    assertTrue(mod.historyStep('undo'), 'kein Schritt zum Zurücknehmen');
    await settle();
    assertEqual(vm.model.chartTypeId, 't');
    assertEqual(h.q('[data-ref="chart-type"]').value, 't');
    assertDeepEqual(plain(vm.read({ fields: ['result'] }).result), LEGACY_RESULT);
    assertEqual(h.live().length, 1);
    assertEqual(mod.historyCan('undo'), false, 'mehr als ein Schritt');
    assertTrue(mod.historyCan('redo'), 'kein Schritt zum Wiederholen');
    assertTrue(mod.historyStep('redo'), 'Wiederholen');
    await settle();
    assertEqual(vm.model.chartTypeId, 'g');
    assertEqual(h.q('[data-ref="chart-type"]').value, 'g');
    assertEqual(h.live().length, 1);
  });

  test('referenzierte Spalte gelöscht: Bezug bleibt, leere Ausgabe, result null, kein Wurf', async () => {
    const h = await mount(stored(), { sheet: SHEET(COLS.filter((c) => c.id !== 'tage')) });
    const vm = h.vm();
    assertDeepEqual(plain(vm.model.columnRef), ref('tage'));
    assertEqual(vm.hasResult, false);
    assertEqual(vm.kpi, null);
    assertEqual(vm.plot, null);
    assertEqual(vm.errorText, '');
    assertDeepEqual(plain(pick(vm.read({ fields: ['result', 'points'] }), ['result', 'points'])), { result: null, points: [] });
    assertEqual(h.q('.dmike-kpi-strip'), null);
    assertEqual(h.qa('.rec__chart-section').length, 0);
    assertEqual(h.q('.rec__error'), null);
    assertEqual(h.charts.length, 0);
  });

  test('Altprojekt: Migration, chartEdits übernommen, kein Verlaufsschritt; ein Diagramm auch nach erneutem Öffnen', async () => {
    const h = await mount(plain(LEGACY), { chartEdits: LEGACY_EDITS() });
    const vm = h.vm();
    assertEqual(vm.model.chartTypeId, 't');
    assertDeepEqual(plain(vm.model.columnRef), ref('tage'));
    assertEqual(vm.model.exampleWorksheetId, null);
    assertDeepEqual(plain(vm.read({ fields: ['result'] }).result), LEGACY_RESULT);
    assertDeepEqual(plain(vm.model.chart), { title: 'Legacy', showTitle: true, bgColor: '#eef6ff', yLabel: 'y (Legacy)' });
    assertEqual(Object.keys(h.chartEdits[INST]['control-chart']).length, 0, 'Alteintrag nicht gelöscht');
    assertEqual(mod.historyCan('undo'), false);
    // Die Konfiguration sagt title '' und die eigene y-Achse; der Alteintrag gewinnt in der Zeichnung.
    assertEqual(vm.plot.title, '');
    assertEqual(h.live().length, 1);
    const shown = h.live()[0].config;
    assertEqual(shown.title, 'Legacy');
    assertEqual(shown.showTitle, true);
    assertEqual(shown.bgColor, '#eef6ff');
    assertEqual(shown.yLabel, 'y (Legacy)');
    assertEqual(shown.values.filter((v) => v !== null).length, 18);
    assertDeepEqual(h.qa('.dmike-kpi-value').map(text), ['33,546', '395,417', '1']);
    // Erneutes Öffnen des gespeicherten Stands: eine Zeichnung, Einstellungen aus dem Model.
    const again = await mount(plain(h.states[INST]), { chartEdits: h.chartEdits });
    assertEqual(again.qa('.rec__chart-section').length, 1);
    assertEqual(again.qa('[data-ref="plot"]').length, 1);
    assertEqual(again.live().length, 1, 'mehr als ein Diagramm nach dem Neuöffnen');
    assertEqual(again.live()[0].config.title, 'Legacy');
    assertEqual(again.vm().model.chart.yLabel, 'y (Legacy)');
    assertEqual(mod.historyCan('undo'), false);
  });
});
