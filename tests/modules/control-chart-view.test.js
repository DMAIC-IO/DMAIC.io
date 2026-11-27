/**
 * Regelkarte für Variablen (I-MR, X̄-R, X̄-S): das Viewmodel im Browser
 * (viewmodel/viewmodel.js) mit dem echten Modul, der echten Vorlage, einem
 * Fake-stateManager mit Arbeitsblatt, einem Fake-chartManager und einer
 * Attrappe des Dialog-Dienstes. Prüft die Getter samt Vorlage (Altprojekte
 * I-MR mit Phase II und X̄-R mit Stufen), die Zählung der Engine-Aufrufe,
 * den Kartentypwechsel mit Rückgängig und Wiederholen, die
 * Viewmodel-Kommandos `setPhase2` und `setAnnotation` samt Ablehnungen,
 * Knopf und Dialog, das Verwerfen eingefrorener Grenzen beim Spaltenwechsel
 * (ein Verlaufsschritt), den Fehlerkasten, den Fall „referenzierte Spalte
 * gelöscht“ und das Altprojekt mit der Übernahme alter chartEdits je
 * Teilkarte.
 */
import { suite, test, assert, assertEqual, assertTrue, assertDeepEqual, assertDeepClose } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/control-chart/viewmodel/viewmodel.js';
import { State } from '../../js/modules/control-chart/domain/model.js';
import { engineRuns } from '../../js/modules/control-chart/domain/analyze.js';
import { setFields } from '../../js/core/model.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { registerCommandDirectives } from '../../js/core/command-directives.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import { withStoredWorksheetReader } from '../helpers/worksheet-reader.js';
import { DURCHMESSER, LAENGE, RIESIG, LEGACY_RESULT, LEGACY_XBAR_RESULT } from './control-chart/analyze.test.js';
import { LEGACY as LEGACY_FIXTURE, LEGACY_XBAR as LEGACY_XBAR_FIXTURE } from './control-chart/migrations.test.js';

const ID = 'control-chart';
const INST = 'cc-1';
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
    registerCommandDirectives(Alpine);
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

/** Spalte „Durchmesser“ mit einer Änderung am ersten Wert. */
const DURCHMESSER2 = DURCHMESSER.map((v, i) => (i === 0 ? 10.01 : v));
const COLS = [
  { id: 'dm', name: 'Durchmesser', values: DURCHMESSER },
  { id: 'len', name: 'Laenge', values: LAENGE },
  { id: 'other', name: 'Fremd', values: [1, 2, 3, 4, 5] },
  { id: 'huge', name: 'Riesig', values: RIESIG },
];
const SHEET = (cols = COLS) => ({
  sheets: [{
    id: 's1',
    state: { rowCount: Math.max(...cols.map((c) => c.values.length), 0), columns: cols.map((c) => ({ type: 'numeric', ...c, values: [...c.values] })) },
  }],
});
/** Das Blatt mit geänderten Werten einer Spalte. */
const sheetWith = (id, values) => SHEET(COLS.map((c) => (c.id === id ? { ...c, values } : c)));
const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });
const plain = (v) => JSON.parse(JSON.stringify(v));
/** Die Altfixture I-MR mit Bezügen auf das Testblatt (ohne `_schema`). */
const LEGACY = () => {
  const l = plain(LEGACY_FIXTURE);
  l.columnRef = ref('dm');
  l.frozenLimits.columnRef = ref('dm');
  return l;
};
/** Die Altfixture X̄-R mit Bezug auf das Testblatt (ohne `_schema`). */
const LEGACY_XBAR = () => ({ ...plain(LEGACY_XBAR_FIXTURE), columnRef: ref('len') });
/** Gespeicherter Stand der neuen Form. */
const stored = (over = {}) => ({ ...new State().toJSON(), columnRef: ref('dm'), ...over });
/** Die alten chartEdits der Fixture I-MR, je Teilkarte. */
const LEGACY_EDITS = () => ({
  [INST]: {
    i: { title: 'Legacy I', showTitle: true, bgColor: '#eef6ff', yLabel: 'Durchmesser (Legacy)' },
    mr: { title: 'Legacy MR', showTitle: true },
  },
});

/**
 * Attrappe des Dialog-Dienstes: `form` leiht den Inhalt aus und gibt ihn beim
 * Schließen zurück; `confirm` antwortet mit `answer`.
 */
function fakeDialog() {
  const d = {
    open: null,
    confirms: [],
    answer: true,
    async confirm(opts) { d.confirms.push(opts); return d.answer; },
    form(opts) {
      return new Promise((resolve) => {
        const body = document.createElement('div');
        document.body.append(body);
        const home = opts.content.parentNode;
        const next = opts.content.nextSibling;
        body.append(opts.content);
        let settled = false;
        const finish = (result) => {
          if (settled) return;
          settled = true;
          home.insertBefore(opts.content, next);
          body.remove();
          d.open = null;
          resolve(result);
        };
        const api = {
          confirm: () => { if (!settled && !(opts.onConfirm && opts.onConfirm(body) === false)) finish(true); },
          cancel: () => finish(false),
          del: () => { if (!settled && !(opts.onDelete && opts.onDelete() === false)) finish(true); },
        };
        d.open = { opts, body, api };
        opts.onMount?.(body, { confirm: api.confirm, cancel: api.cancel });
      });
    },
  };
  return d;
}

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
  const notes = [];
  const dialog = fakeDialog();
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
    notify: (message, type) => notes.push({ message, type }),
    dialog,
    theme: 'light',
    language: 'de',
  };
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container);
  await mod.init(container, context);
  await settle();
  const vm = () => Alpine.$data(container.querySelector('[x-data]'));
  /** Die lebenden Diagramme in den Zeichenflächen. */
  const live = () => charts.filter((c) => c.alive && c.el.isConnected && c.el.closest('[data-chart-host]'));
  return {
    states, charts, container, chartEdits, vm, live, bus, notes, dialog,
    /** Die lebenden Diagramme der Teilkarte `key`. */
    in: (key) => live().filter((c) => c.el.closest(`[data-chart-host="${key}"]`)),
    q: (sel) => container.querySelector(sel),
    qa: (sel) => [...container.querySelectorAll(sel)],
  };
}

const text = (el) => el.textContent.trim();
/** Alle Getter und die Lesefläche lesen, wie Vorlage und Agent es tun. */
const readAll = (vm) => {
  vm.read();
  vm.read({ fields: ['points'] });
  void vm.hasResult; void vm.errorText; void vm.kpi; void vm.chartViews; void vm.violationRows;
  void vm.stagesWarning; void vm.phase2Badge; void vm.phase2Button; void vm.showSubgroup;
  void vm.showNoViolations; void vm.showViolations; void vm.violationsHeader;
};
/** Eine Auswahl oder ein Feld wie der Nutzer ändern. */
function choose(el, value) {
  if (!el) throw new Error('Feld fehlt');
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
/** Die Auswahl des Spaltenwählers. */
function pickerSelect(h) {
  const sel = h.q('[data-ref="col-picker-wrap"] select');
  if (!sel) throw new Error('Spaltenwähler fehlt');
  return sel;
}
/** Der Schlüssel der Spalte `name` im Wähler. */
function pickerValue(h, name) {
  const o = [...pickerSelect(h).options].find((x) => x.textContent.includes(name));
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
/** Wirft `fn`? Liefert den Fehler. */
async function rejects(fn) {
  try { await fn(); } catch (err) { return err; }
  throw new Error('keine Ablehnung');
}
/** Das Datenblatt ersetzen und melden. */
function replaceSheet(h, sheet) {
  h.states.ws1 = sheet;
  h.bus.emit('worksheet:dataChanged', { instanceId: 'ws1' });
}

/** Prüft die leere Ausgabe ohne Meldung. */
function assertEmpty(h) {
  const vm = h.vm();
  assertEqual(vm.hasResult, false);
  assertEqual(vm.kpi, null);
  assertDeepEqual(plain(vm.chartViews), {});
  assertDeepEqual(plain(vm.violationRows), []);
  assertEqual(vm.errorText, '');
  assertEqual(vm.stagesWarning, '');
  assertEqual(vm.showNoViolations, false);
  const out = vm.read({ fields: ['result', 'points'] });
  assertEqual(out.result, null);
  assertDeepEqual(plain(out.points), []);
  assertEqual(h.q('.dmike-kpi-strip'), null);
  assertEqual(h.qa('.control-chart__chart-section').length, 0);
  assertEqual(h.q('.control-chart__no-violations'), null);
  assertEqual(h.q('.control-chart__violations-panel'), null);
  assertEqual(h.q('.control-chart__error'), null);
  assertEqual(h.charts.length, 0);
}

suite('control-chart: Viewmodel im Browser', () => {
  test('Altprojekt I-MR (neue Form): KPI-Leiste, Teilkarten, Verletzungsliste, Phase II, Eingaben, Lesefläche', async () => {
    const h = await mount(State.fromJSON(LEGACY(), { repair: true }).toJSON());
    const vm = h.vm();
    assertTrue(vm.hasResult, 'kein Ergebnis');
    assertEqual(vm.errorText, '');
    assertDeepClose(plain(vm.read({ fields: ['result'] }).result), LEGACY_RESULT);
    assertEqual(vm.read({ fields: ['points'] }).points.length, 30);
    // KPI-Leiste: feste Zellen mit festen Ankern, Zahlen mit Dezimalkomma.
    assertEqual(vm.kpi, vm.kpi, 'KPI-Leiste bei gleicher Rechnung neu gebaut');
    assertDeepEqual(h.qa('.dmike-kpi-value').map(text), ['10,0000', '10,300', '5', '1,667']);
    assertDeepEqual(h.qa('.dmike-kpi-label').map(text), [tr('statCL'), 'UCL / LCL', tr('statViolations'), 'Cpk']);
    assertDeepEqual(h.qa('.dmike-kpi-sub').map(text), ['σ̂ = 0,1000', '9,700', 'von 30 Datenpunkten', 'Cp = 1,833']);
    assertDeepEqual(h.qa('.dmike-kpi-label').map((el) => el.getAttribute('data-help-key')), [
      'SubchartLimits.cl', 'SubchartLimits.ucl', 'Result.signals', 'Capability.cpk',
    ].map((k) => `modules.${ID}.types.${k}`));
    assertTrue(h.qa('.dmike-kpi')[2].classList.contains('dmike-kpi--bad'), 'Klasse der Verletzungen');
    assertTrue(h.qa('.dmike-kpi')[3].classList.contains('dmike-kpi--good'), 'Klasse von Cpk');
    // Teilkarten { i, mr }: Kopfzeilen, Abzeichen, je eine Zeichenfläche mit einem Diagramm.
    const views = vm.chartViews;
    assertDeepEqual(Object.keys(views), ['i', 'mr']);
    assertEqual(vm.chartViews, views, 'Teilkarten bei gleicher Rechnung neu gebaut');
    assertDeepEqual([views.i.legacyEditKey, views.mr.legacyEditKey], ['i', 'mr']);
    assertDeepEqual(h.qa('.control-chart__chart-title').map(text), ['I-Chart — Durchmesser', 'MR-Chart — Durchmesser']);
    assertDeepEqual(h.qa('.control-chart__badge').map(text), ['5 Verletzungen', '2 Verletzungen']);
    assertDeepEqual(h.qa('.control-chart__badge .icon').map((el) => el.getAttribute('data-icon')), ['status.warning', 'status.warning']);
    assertDeepEqual(h.qa('.control-chart__plot-wrap').map((el) => el.getAttribute('data-chart-host')), ['i', 'mr']);
    assertEqual(h.live().length, 2);
    assertEqual(h.in('i').length, 1);
    assertEqual(h.in('mr').length, 1);
    assertTrue(h.live().every((c) => c.type === 'control-chart'), 'falscher Diagrammtyp');
    const i = h.in('i')[0].config;
    assertEqual(i.values.length, 30);
    assertDeepEqual([i.cl, i.ucl, i.lcl, i.sigma], [10, 10.3, 9.7, 0.1]);
    assertDeepEqual([...i.violationIndices], [20, 24, 25, 26, 28]);
    assertDeepEqual([...i.excludedIndices], [20]);
    assertEqual(i.baselineEnd, 20);
    assertDeepEqual([i.usl, i.lsl], [10.5, 9.4]);
    assertEqual(i.yLabel, 'Einzelwert');
    assertEqual(i.xLabel, tr('xLabelSample'));
    const mr = h.in('mr')[0].config;
    assertEqual(mr.values[0], null);
    assertDeepEqual([mr.cl, mr.ucl, mr.lcl], [0.1128, 0.3685, 0]);
    assertDeepEqual([mr.usl, mr.lsl], [null, null]);
    // Verletzungsliste mit Anmerkungen.
    assertEqual(text(h.q('.control-chart__violations-header')), `⚑ ${tr('violationsTitle', { count: 5 })}`);
    const rows = h.qa('.control-chart__violation-row');
    assertDeepEqual(rows.map((r) => r.getAttribute('data-violation-index')), ['20', '24', '25', '26', '28']);
    assertEqual(text(rows[0].querySelector('.control-chart__v-ann')), 'Werkzeugwechsel ⊘');
    assertEqual(rows[0].querySelector('.control-chart__v-ann').getAttribute('data-excluded'), '1');
    assertEqual(text(rows[4].querySelector('.control-chart__v-ann')), 'Messung wiederholt');
    assertEqual(rows[4].querySelector('.control-chart__v-ann').hasAttribute('data-excluded'), false);
    assertEqual(text(rows[1].querySelector('.control-chart__v-add')), tr('annotationAdd'));
    assertEqual(h.q('.control-chart__no-violations'), null);
    // Phase II eingefroren.
    assertEqual(text(h.q('.control-chart__phase2-badge')), tr('phase2_frozen'));
    assertTrue(h.q('.control-chart__phase2-badge').classList.contains('control-chart__phase2-badge--frozen'), 'Klasse eingefroren');
    assertEqual(h.q('.control-chart__phase2-badge .icon').getAttribute('data-icon'), 'action.lock');
    const btn = h.q('[data-ref="phase2-toggle"]');
    assertEqual(text(btn), tr('phase2_unfreeze'));
    assertTrue(btn.classList.contains('btn--secondary'), 'Klasse des Knopfs');
    assertEqual(btn.getAttribute('data-arg-enabled'), 'false');
    assertEqual(btn.getAttribute('data-help-key'), `modules.${ID}.actions.setPhase2.help`);
    // Eingaben.
    assertEqual(h.q('[data-ref="chart-type"]').value, 'i-mr');
    assertEqual(h.q('[data-ref="subgroup-row"]').style.display, 'none');
    assertEqual(h.q('[data-ref="baseline-count"]').value, '20');
    assertEqual(h.q('[data-ref="lsl"]').value, '9,4');
    assertEqual(h.q('[data-ref="usl"]').value, '10,5');
    assertEqual(h.q('[data-ref="stages"]').value, '');
    assertEqual(pickerSelect(h).value, pickerValue(h, 'Durchmesser'));
    assertDeepEqual(h.qa('[data-rule]').filter((el) => el.checked).map((el) => el.getAttribute('data-rule')), ['1', '2', '5', '6']);
    assertEqual(h.q('[data-ref="stages-warning"]').style.display, 'none');
    assertEqual(h.q('.control-chart__error'), null);
    // Klappen der Regelliste: UI-State, Klassen und Chevron.
    assertEqual(h.q('.control-chart__chevron').getAttribute('data-icon'), 'nav.expand-down');
    h.q('[data-ref="nelson-toggle"]').click();
    await settle();
    assertTrue(h.q('[data-ref="nelson-panel"]').classList.contains('field-checks--collapsed'), 'Regelliste nicht zugeklappt');
    assertTrue(h.q('[data-ref="nelson-toggle"]').classList.contains('control-chart__collapsible--collapsed'), 'Klasse des Kopfs');
    assertEqual(h.q('.control-chart__chevron').getAttribute('data-icon'), 'nav.expand-right');
  });

  test('Altprojekt X̄-R mit Stufen: Warnung, Zusatz der Stufe, Teilkarten { xbar, r }, keine Verletzungen', async () => {
    const h = await mount(State.fromJSON(LEGACY_XBAR(), { repair: true }).toJSON());
    const vm = h.vm();
    assertDeepClose(plain(vm.read({ fields: ['result'] }).result), LEGACY_XBAR_RESULT);
    assertEqual(vm.stagesWarning, tr('stagesSplitSubgroup', { stages: '22', n: 5 }));
    assertEqual(text(h.q('[data-ref="stages-warning"]')), vm.stagesWarning);
    assertEqual(h.q('[data-ref="stages-warning"]').style.display, '');
    assertEqual(h.q('[data-ref="subgroup-row"]').style.display, '');
    assertEqual(h.q('[data-ref="subgroup-size"]').value, '5');
    assertEqual(h.q('[data-ref="stages"]').value, '22');
    assertEqual(h.q('[data-ref="chart-type"]').value, 'xbar-r');
    assertEqual(text(h.q('.dmike-kpi-label')), `${tr('statCL')} (${tr('stageN', { n: 2 })})`);
    assertDeepEqual(h.qa('.dmike-kpi-value').map(text), ['10,4987', '10,583', '0', '3,708']);
    assertDeepEqual(Object.keys(vm.chartViews), ['xbar', 'r']);
    assertDeepEqual(h.qa('.control-chart__badge').map(text), [tr('stable'), tr('stable')]);
    assertDeepEqual(h.qa('.control-chart__badge .icon').map((el) => el.getAttribute('data-icon')), ['status.ok', 'status.ok']);
    assertDeepEqual([...h.in('xbar')[0].config.stageBoundaries], [5]);
    assertEqual(h.in('xbar')[0].config.baselineEnd, null);
    assertEqual(h.in('xbar')[0].config.cl.length, 8);
    assertEqual(text(h.q('.control-chart__no-violations')), tr('noViolations'));
    assertEqual(h.q('.control-chart__violations-panel'), null);
    assertEqual(text(h.q('.control-chart__phase2-badge')), tr('phase2_live'));
    assertEqual(h.q('[data-ref="phase2-toggle"]').getAttribute('data-arg-enabled'), 'true');
    assertEqual(h.live().length, 2);
  });

  test('ohne Spalte, mit zu wenig Werten, mit gelöschter Spalte: leere Ausgabe ohne Meldung, Bezug bleibt', async () => {
    let h = await mount(new State().toJSON());
    assertEqual(h.vm().analysis, null);
    assertEmpty(h);
    h = await mount(stored(), { sheet: sheetWith('dm', [10, 'x', null]) });
    assertEmpty(h);
    h = await mount(stored({ chartTypeId: 'xbar-r', subgroupSize: 5 }), { sheet: sheetWith('dm', [10, 11, 12]) });
    assertEqual(h.vm().errorText, tr('errCompute'), 'weniger Werte als eine Untergruppe');
    // Referenzierte Spalte gelöscht: Bezug und eingefrorene Grenzen bleiben im Model, nichts gerechnet.
    const legacy = State.fromJSON(LEGACY(), { repair: true }).toJSON();
    h = await mount(legacy, { sheet: SHEET(COLS.filter((c) => c.id !== 'dm')) });
    assertDeepEqual(plain(h.vm().model.columnRef), ref('dm'));
    assertDeepEqual(plain(h.vm().model.frozenLimits.columnRef), ref('dm'));
    assertEmpty(h);
  });

  test('Überlauf (Werte um 1,7·10³⁰⁸): stehender Fehlerkasten, nichts sonst, result null', async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      const h = await mount(stored({ columnRef: ref('huge') }));
      const vm = h.vm();
      assertEqual(vm.hasResult, false);
      assertDeepEqual(plain(vm.analysis), { status: 'error', reason: 'errCompute' });
      assertEqual(vm.errorText, 'Berechnung fehlgeschlagen.');
      assertEqual(text(h.q('[data-ref="error-area"] .control-chart__error')), tr('errCompute'));
      assertEqual(vm.kpi, null);
      assertDeepEqual(plain(vm.chartViews), {});
      assertEqual(vm.read({ fields: ['result'] }).result, null);
      assertEqual(h.q('.dmike-kpi-strip'), null);
      assertEqual(h.qa('.control-chart__chart-section').length, 0);
      assertEqual(h.q('.control-chart__no-violations'), null);
      assertEqual(h.charts.length, 0);
      setFields(vm.model, { columnRef: ref('dm') });
      await settle();
      assertEqual(vm.errorText, '');
      assertEqual(h.q('.control-chart__error'), null);
      assertEqual(h.live().length, 2);
    } finally {
      console.warn = warn;
    }
  });

  test('Zählung: eine Engine-Rechnung je wirksamer Änderung, keine bei Kommentar, Stufen gleicher Wirkung, Editor, Beispielblatt, fremder Spalte, Klappen und Neueinhängen', async () => {
    const h = await mount(stored({ usl: 10.5, lsl: 9.4 }));
    const vm = h.vm();
    readAll(vm);
    await settle();
    const m = vm.model;
    assertEqual(await runsOf(vm, () => choose(pickerSelect(h), pickerValue(h, 'Laenge'))), 1, 'Spalte über den Wähler');
    assertEqual(await runsOf(vm, () => setFields(m, { columnRef: ref('dm') })), 1, 'Spalte über die Senke');
    assertEqual(await runsOf(vm, () => choose(h.q('[data-ref="chart-type"]'), 'xbar-r')), 1, 'Kartentyp');
    assertEqual(m.subgroupSize, 2);
    assertEqual(await runsOf(vm, () => choose(h.q('[data-ref="subgroup-size"]'), '5')), 1, 'Untergruppe');
    assertEqual(m.subgroupSize, 5);
    assertEqual(await runsOf(vm, () => m.setChartType({ chartTypeId: 'i-mr' })), 1, 'Kartentyp zurück');
    assertEqual(await runsOf(vm, () => choose(h.q('[data-ref="baseline-count"]'), '20')), 1, 'Phase I');
    assertEqual(m.baselineCount, 20);
    assertEqual(await runsOf(vm, () => choose(h.q('[data-ref="stages"]'), '12,25')), 1, 'Stufen');
    assertEqual(await runsOf(vm, () => choose(h.q('[data-ref="stages"]'), '12, 25')), 0, 'Stufen gleicher Wirkung');
    assertEqual(m.stagesText, '12, 25');
    assertEqual(await runsOf(vm, () => choose(h.q('[data-ref="stages"]'), '')), 1, 'Stufen leer');
    assertEqual(await runsOf(vm, () => choose(h.q('[data-ref="lsl"]'), '9,3')), 1, 'LSL');
    assertEqual(m.lsl, 9.3);
    assertEqual(await runsOf(vm, () => choose(h.q('[data-ref="usl"]'), '10,6')), 1, 'USL');
    assertEqual(m.usl, 10.6);
    const box = h.q('[data-rule="3"]');
    assertEqual(await runsOf(vm, () => { box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); }), 1, 'Regel');
    assertDeepEqual(plain(m.enabledRules), [1, 3]);
    assertEqual(await runsOf(vm, () => vm.setAnnotation({ index: 4, comment: 'nur Text', excluded: false })), 0, 'Kommentar ohne Ausschluss');
    assertEqual(await runsOf(vm, () => vm.setAnnotation({ index: 4, comment: 'nur Text', excluded: true })), 1, 'Ausschluss');
    assertEqual(await runsOf(vm, () => m.removeAnnotation({ index: 4 })), 1, 'Ausschluss gelöscht');
    assertEqual(await runsOf(vm, () => vm.setPhase2({ enabled: true })), 1, 'Phase II ein');
    assertTrue(vm.read({ fields: ['result'] }).result.frozen, 'nicht eingefroren');
    assertEqual(await runsOf(vm, () => vm.setPhase2({ enabled: false })), 1, 'Phase II aus');
    assertEqual(await runsOf(vm, () => replaceSheet(h, sheetWith('dm', DURCHMESSER2))), 1, 'Wertänderung der Spalte');
    assertEqual(await runsOf(vm, () => replaceSheet(h, SHEET(COLS.map((c) => (c.id === 'dm' ? { ...c, values: DURCHMESSER2 }
      : c.id === 'other' ? { ...c, values: [9, 9, 9] } : c))))), 0, 'Wertänderung einer fremden Spalte');
    assertEqual(await runsOf(vm, () => { m.charts = { i: { title: 'Neu', showTitle: true } }; }), 0, 'model.charts');
    assertEqual(await runsOf(vm, () => { m.exampleWorksheetId = 'ws-x'; }), 0, 'exampleWorksheetId');
    assertEqual(await runsOf(vm, () => h.q('[data-ref="nelson-toggle"]').click()), 0, 'Regelliste klappen');
    // Neueinhängen ohne Änderung: keine Rechnung, auch nach read() und allen Gettern.
    const before = engineRuns();
    const again = await mount(plain(h.states[INST]), { sheet: plain(h.states.ws1) });
    readAll(again.vm());
    await settle();
    readAll(again.vm());
    assertEqual(engineRuns() - before, 0, 'Engine-Aufrufe beim Neueinhängen');
    assertTrue(again.vm().hasResult, 'kein Ergebnis nach dem Neueinhängen');
    assertEqual(again.live().length, 2);
  });

  test('Kartentypwechsel: klemmt die Untergruppe, ein Schritt, Teilkarten wechseln, Rückgängig und Wiederholen', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertEqual(mod.historyCan('undo'), false);
    choose(h.q('[data-ref="chart-type"]'), 'xbar-r');
    await settle();
    assertDeepEqual([vm.model.chartTypeId, vm.model.subgroupSize], ['xbar-r', 2]);
    assertDeepEqual(Object.keys(vm.chartViews), ['xbar', 'r']);
    assertDeepEqual(h.qa('[data-chart-host]').map((el) => el.getAttribute('data-chart-host')), ['xbar', 'r']);
    assertEqual(h.in('xbar').length, 1);
    assertEqual(h.in('r').length, 1);
    assertEqual(h.live().length, 2, 'mehr als ein Diagramm je Teilkarte');
    assertEqual(h.q('[data-ref="subgroup-row"]').style.display, '');
    // Eine Untergruppe außerhalb des Bereichs nennt den Grund am Feld.
    choose(h.q('[data-ref="subgroup-size"]'), '15');
    await settle();
    assertEqual(vm.model.subgroupSize, 2);
    // Der Text der Invariante kommt über den globalen Übersetzer (hier der Schlüssel).
    assertEqual(text(h.q('[data-ref="subgroup-error"]')), `modules.${ID}.invariants.subgroupRange`);
    choose(h.q('[data-ref="subgroup-size"]'), '2');
    await settle();
    assertTrue(mod.historyStep('undo'), 'kein Schritt zum Zurücknehmen');
    await settle();
    assertDeepEqual([vm.model.chartTypeId, vm.model.subgroupSize], ['i-mr', 1]);
    assertEqual(h.q('[data-ref="chart-type"]').value, 'i-mr');
    assertDeepEqual(Object.keys(vm.chartViews), ['i', 'mr']);
    assertEqual(h.live().length, 2);
    assertEqual(mod.historyCan('undo'), false, 'mehr als ein Schritt');
    assertTrue(mod.historyStep('redo'), 'Wiederholen');
    await settle();
    assertDeepEqual([vm.model.chartTypeId, vm.model.subgroupSize], ['xbar-r', 2]);
    assertEqual(h.q('[data-ref="chart-type"]').value, 'xbar-r');
    assertEqual(h.live().length, 2);
    // X̄-S teilt die X̄-Karte mit X̄-R.
    vm.model.setChartType({ chartTypeId: 'xbar-s' });
    await settle();
    assertDeepEqual(Object.keys(vm.chartViews), ['xbar', 's']);
    assertEqual(h.in('xbar').length, 1);
    assertEqual(h.in('s').length, 1);
    assertEqual(vm.model.subgroupSize, 2);
  });

  test('setPhase2: Ablehnung ohne Ergebnis und mit wirksamen Stufen, Einfrieren auch mit Stufentext jenseits der Werte, Freigeben, Knopf, Rückgängig', async () => {
    let h = await mount(new State().toJSON());
    let err = await rejects(() => h.vm().setPhase2({ enabled: true }));
    assertDeepEqual([err.param, err.hintKey, err.message], ['enabled', 'phase2_needsData', tr('phase2_needsData')]);
    h.q('[data-ref="phase2-toggle"]').click();
    await settle();
    // Die Meldung des Knopfs ist der Hinweis des Moduls (`hintKey`) über den
    // globalen Übersetzer (hier der Schlüssel).
    assertDeepEqual(h.notes.at(-1), { message: `modules.${ID}.phase2_needsData`, type: 'error' });
    assertEqual(h.vm().model.frozenLimits, null);
    h = await mount(stored({ stagesText: '12' }));
    const vm = h.vm();
    err = await rejects(() => vm.setPhase2({ enabled: true }));
    assertDeepEqual([err.param, err.hintKey], ['enabled', 'phase2_noStages']);
    assertEqual(vm.model.frozenLimits, null);
    // Stufentext jenseits der Werte wirkt nicht: einfrieren geht (über den Knopf).
    setFields(vm.model, { stagesText: '100' });
    await settle();
    assertEqual(mod.historyCan('undo'), true);
    h.q('[data-ref="phase2-toggle"]').click();
    await settle();
    const fl = plain(vm.model.frozenLimits);
    assertTrue(fl !== null, 'nicht eingefroren');
    assertDeepEqual(Object.keys(fl), ['chartTypeId', 'subgroupSize', 'columnRef', 'baselineEnd', 'primary', 'secondary', 'excludedIndices']);
    assertDeepEqual(fl.columnRef, ref('dm'));
    assertEqual(fl.baselineEnd, 30);
    assertTrue(vm.read({ fields: ['result'] }).result.frozen, 'Grenzen gelten nicht');
    assertEqual(text(h.q('.control-chart__phase2-badge')), tr('phase2_frozen'));
    assertEqual(h.q('[data-ref="phase2-toggle"]').getAttribute('data-arg-enabled'), 'false');
    // Erneut einfrieren: nichts.
    vm.setPhase2({ enabled: true });
    assertDeepEqual(plain(vm.model.frozenLimits), fl);
    // Rückgängig nimmt das Einfrieren zurück.
    assertTrue(mod.historyStep('undo'), 'kein Schritt');
    await settle();
    assertEqual(vm.model.frozenLimits, null);
    assertEqual(vm.model.stagesText, '100');
    assertTrue(mod.historyStep('redo'), 'Wiederholen');
    await settle();
    assertDeepEqual(plain(vm.model.frozenLimits), fl);
    // Freigeben über den Knopf.
    h.q('[data-ref="phase2-toggle"]').click();
    await settle();
    assertEqual(vm.model.frozenLimits, null);
    assertEqual(text(h.q('[data-ref="phase2-toggle"]')), tr('phase2_freeze'));
    vm.setPhase2({ enabled: false });
    assertEqual(vm.model.frozenLimits, null);
  });

  test('setAnnotation: Ablehnung ohne Ergebnis und außerhalb, Setzen, Löschen bei leer; Dialog mit Startwerten, Speichern, Löschknopf mit Rückfrage', async () => {
    let h = await mount(new State().toJSON());
    let err = await rejects(() => h.vm().setAnnotation({ index: 0, comment: 'x', excluded: false }));
    assertEqual(err.param, 'index');
    h = await mount(State.fromJSON(LEGACY(), { repair: true }).toJSON());
    const vm = h.vm();
    err = await rejects(() => vm.setAnnotation({ index: 30, comment: 'x', excluded: false }));
    assertEqual(err.param, 'index');
    assertTrue(/0\.\.29/.test(err.message), err.message);
    assertDeepEqual(Object.keys(plain(vm.model.annotations)), ['20', '28']);
    vm.setAnnotation({ index: 24, comment: 'Neu', excluded: false });
    assertDeepEqual(plain(vm.model.annotations[24]), { comment: 'Neu', excluded: false });
    vm.setAnnotation({ index: 24, comment: '', excluded: false });
    assertEqual(Object.hasOwn(vm.model.annotations, '24'), false);
    // Dialog über die Zeile ohne Anmerkung: leere Startwerte, Fokus auf dem Kommentar, kein Löschknopf.
    h.qa('.control-chart__violation-row')[1].click();
    await settle();
    assert(h.dialog.open, 'Dialog nicht offen');
    assertEqual(h.dialog.open.opts.title, tr('annotationTitle', { idx: 25 }));
    assertEqual(h.dialog.open.opts.onDelete, undefined);
    let ta = h.dialog.open.body.querySelector('[data-ref="ann-comment"]');
    assertEqual(ta.value, '');
    assertEqual(document.activeElement, ta);
    assertEqual(h.dialog.open.body.querySelector('[data-ref="ann-excluded"]').checked, false);
    ta.value = 'Lauf';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    const box = h.dialog.open.body.querySelector('[data-ref="ann-excluded"]');
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    h.dialog.open.api.confirm();
    await settle();
    assertEqual(h.dialog.open, null, 'Dialog nach dem Speichern offen');
    assertDeepEqual(plain(vm.model.annotations[24]), { comment: 'Lauf', excluded: true });
    assertDeepEqual([...h.in('i')[0].config.excludedIndices], [20, 24]);
    assertEqual(text(h.qa('.control-chart__violation-row')[1].querySelector('.control-chart__v-ann')), 'Lauf ⊘');
    // Bestehende Anmerkung über Enter: Startwerte aus current, Löschknopf mit allgemeiner Rückfrage.
    h.qa('.control-chart__violation-row')[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    assert(h.dialog.open, 'Dialog nicht offen');
    ta = h.dialog.open.body.querySelector('[data-ref="ann-comment"]');
    assertEqual(ta.value, 'Werkzeugwechsel');
    assertEqual(h.dialog.open.body.querySelector('[data-ref="ann-excluded"]').checked, true);
    assertEqual(typeof h.dialog.open.opts.onDelete, 'function');
    h.dialog.answer = false;
    h.dialog.open.api.del();
    await settle();
    assertEqual(h.dialog.confirms.length, 1, 'keine Rückfrage');
    assertTrue(Object.hasOwn(vm.model.annotations, '20'), 'trotz Nein gelöscht');
    h.dialog.answer = true;
    h.dialog.open.api.del();
    await settle();
    assertEqual(h.dialog.confirms.length, 2);
    assertEqual(Object.hasOwn(vm.model.annotations, '20'), false);
    assertEqual(h.dialog.open, null, 'Dialog nach dem Löschen offen');
    assertDeepEqual([...h.in('i')[0].config.excludedIndices], [24]);
    // Unverändert absenden schließt wie Abbrechen.
    h.qa('.control-chart__violation-row')[1].click();
    await settle();
    const before = plain(vm.model.annotations);
    h.dialog.open.api.confirm();
    await settle();
    assertEqual(h.dialog.open, null);
    assertDeepEqual(plain(vm.model.annotations), before);
  });

  test('Spaltenwechsel mit eingefrorenen Grenzen: verworfen mit Hinweis in einem Schritt; Rückgängig stellt beides her', async () => {
    const h = await mount(State.fromJSON(LEGACY(), { repair: true }).toJSON());
    const vm = h.vm();
    assertEqual(mod.historyCan('undo'), false);
    const fl = plain(vm.model.frozenLimits);
    choose(pickerSelect(h), pickerValue(h, 'Laenge'));
    await settle();
    assertDeepEqual(plain(vm.model.columnRef), ref('len'));
    assertEqual(vm.model.frozenLimits, null);
    assertDeepEqual(h.notes.at(-1), { message: tr('phase2_columnChanged'), type: 'info' });
    assertEqual(text(h.q('.control-chart__phase2-badge')), tr('phase2_live'));
    assertTrue(mod.historyStep('undo'), 'kein Schritt');
    await settle();
    assertDeepEqual(plain(vm.model.columnRef), ref('dm'));
    assertDeepEqual(plain(vm.model.frozenLimits), fl);
    assertEqual(mod.historyCan('undo'), false, 'mehr als ein Schritt');
    assertTrue(mod.historyCan('redo'), 'kein Wiederholen');
    const notes = h.notes.length;
    assertTrue(mod.historyStep('redo'), 'Wiederholen');
    await settle();
    assertDeepEqual(plain(vm.model.columnRef), ref('len'));
    assertEqual(vm.model.frozenLimits, null);
    assertEqual(h.notes.length, notes, 'Hinweis beim Wiederholen');
    // Grenzen ohne Spalte bleiben beim Wechsel.
    const noCol = State.fromJSON(LEGACY(), { repair: true }).toJSON();
    noCol.frozenLimits.columnRef = null;
    const h2 = await mount(noCol);
    choose(pickerSelect(h2), pickerValue(h2, 'Laenge'));
    await settle();
    assertTrue(h2.vm().model.frozenLimits !== null, 'Grenzen ohne Spalte verworfen');
  });

  test('Spalte im Arbeitsblatt gelöscht, während das Modul eingehängt ist: ein Verlaufsschritt, keine Rechnung, kein Wurf', async () => {
    const h = await mount(State.fromJSON(LEGACY(), { repair: true }).toJSON());
    const vm = h.vm();
    replaceSheet(h, SHEET(COLS.filter((c) => c.id !== 'dm')));
    await settle();
    await settle();
    assertEqual(vm.hasResult, false);
    assertEqual(vm.read({ fields: ['result'] }).result, null);
    assertEqual(h.charts.filter((c) => c.alive && c.el.isConnected).length, 0);
    if (vm.model.columnRef === null) {
      // Der Wähler verwirft den Bezug; die Grenzen der Spalte fallen im selben Schritt.
      assertEqual(vm.model.frozenLimits, null);
      assertTrue(mod.historyStep('undo'), 'kein Schritt');
      await settle();
      assertDeepEqual(plain(vm.model.columnRef), ref('dm'));
      assertTrue(vm.model.frozenLimits !== null, 'Grenzen nicht zurück');
      assertEqual(mod.historyCan('undo'), false, 'mehr als ein Schritt');
    } else {
      assertDeepEqual(plain(vm.model.columnRef), ref('dm'));
      assertTrue(vm.model.frozenLimits !== null, 'Grenzen ohne Spaltenwechsel verworfen');
      assertEqual(mod.historyCan('undo'), false);
    }
  });

  test('Altprojekt: Migration, chartEdits je Teilkarte übernommen, kein Verlaufsschritt; ein Diagramm je Teilkarte auch nach erneutem Öffnen', async () => {
    const h = await mount(LEGACY(), { chartEdits: LEGACY_EDITS() });
    const vm = h.vm();
    assertDeepEqual(plain(vm.model.columnRef), ref('dm'));
    assertEqual(vm.model.baselineCount, 20);
    assertDeepEqual(plain(vm.model.enabledRules), [1, 2, 5, 6]);
    assertDeepClose(plain(vm.read({ fields: ['result'] }).result), LEGACY_RESULT);
    assertDeepEqual(plain(vm.model.charts.i), { title: 'Legacy I', showTitle: true, bgColor: '#eef6ff', yLabel: 'Durchmesser (Legacy)' });
    assertDeepEqual(plain(vm.model.charts.mr), { title: 'Legacy MR', showTitle: true });
    assertEqual(Object.keys(h.chartEdits[INST].i).length, 0, 'Alteintrag i nicht gelöscht');
    assertEqual(Object.keys(h.chartEdits[INST].mr).length, 0, 'Alteintrag mr nicht gelöscht');
    assertEqual(mod.historyCan('undo'), false);
    assertEqual(vm.chartViews.i.config.title, '');
    const i = h.in('i')[0].config;
    assertEqual(i.title, 'Legacy I');
    assertEqual(i.showTitle, true);
    assertEqual(i.bgColor, '#eef6ff');
    assertEqual(i.yLabel, 'Durchmesser (Legacy)');
    const mr = h.in('mr')[0].config;
    assertEqual(mr.title, 'Legacy MR');
    assertEqual(mr.yLabel, 'Gleitende Spannweite');
    assertDeepEqual(h.qa('.dmike-kpi-value').map(text), ['10,0000', '10,300', '5', '1,667']);
    assertEqual(h.live().length, 2);
    const again = await mount(plain(h.states[INST]), { chartEdits: h.chartEdits });
    assertEqual(again.qa('.control-chart__chart-section').length, 2);
    assertEqual(again.in('i').length, 1);
    assertEqual(again.in('mr').length, 1);
    assertEqual(again.live().length, 2, 'mehr als ein Diagramm je Teilkarte nach dem Neuöffnen');
    assertEqual(again.in('i')[0].config.title, 'Legacy I');
    assertEqual(again.vm().model.charts.i.yLabel, 'Durchmesser (Legacy)');
    assertEqual(mod.historyCan('undo'), false);
  });
});
