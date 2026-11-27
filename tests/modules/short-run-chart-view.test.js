/**
 * Kurzserien-Regelkarte (Z-MR): das Viewmodel im Browser
 * (viewmodel/viewmodel.js) mit dem echten Modul, der echten Vorlage, einem
 * Fake-stateManager mit Arbeitsblatt und einem Fake-chartManager. Prüft die
 * Getter samt Vorlage (Altprojekt-Daten mit Hinweis, Beispiel), die Zählung
 * der Engine-Aufrufe (eine je Spalten- und Wertänderung, keine bei den
 * Editor-Einstellungen, beim Beispielblatt, bei fremden Spalten und beim
 * Neueinhängen), den Spaltenwechsel mit Rückgängig und Wiederholen, den
 * Fehlerkasten bei Überlauf, den Fall „referenzierte Spalte gelöscht“ (je
 * Spalte) und das Altprojekt mit der Übernahme alter chartEdits je Teilkarte
 * beim Einhängen.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual, assertDeepClose } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/short-run-chart/viewmodel/viewmodel.js';
import { State } from '../../js/modules/short-run-chart/domain/model.js';
import { engineRuns } from '../../js/modules/short-run-chart/domain/analyze.js';
import { setFields } from '../../js/core/model.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import { withStoredWorksheetReader } from '../helpers/worksheet-reader.js';
import { TEIL, MASS, SETUP, MESSWERT, LEGACY_RESULT, EXAMPLE_RESULT } from './short-run-chart/analyze.test.js';

const ID = 'short-run-chart';
const INST = 'src-1';
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

/** Teil A um 1,7·10³⁰⁸: die Teilesumme läuft über. */
const HUGE = [1.7e308, 1.75e308, 1.72e308, 1.71e308, 1.74e308, 10, 11, 10.5, 10.2];
const HUGE_GRP = ['A', 'A', 'A', 'A', 'A', 'B', 'B', 'B', 'B'];

const COLS = [
  { id: 'teil', name: 'Teil', type: 'text', values: TEIL },
  { id: 'mass', name: 'Mass', values: MASS },
  { id: 'setup', name: 'Setup', type: 'text', values: SETUP },
  { id: 'messwert', name: 'Messwert', values: MESSWERT },
  { id: 'other', name: 'Fremd', values: [1, 2, 3, 4, 5] },
  { id: 'huge', name: 'Riesig', values: HUGE },
  { id: 'hgrp', name: 'RiesigTeil', type: 'text', values: HUGE_GRP },
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
/** Gespeicherter Stand der neuen Form (Altprojekt-Werte). */
const stored = (over = {}) => ({ ...new State().toJSON(), valuesRef: ref('mass'), groupsRef: ref('teil'), ...over });
/** Die Altform aus der Fixture `legacy-project.json` (ohne `_schema`). */
const LEGACY = { valuesRef: ref('mass'), groupsRef: ref('teil'), exampleWorksheetId: null };
/** Die alten chartEdits der Fixture, je Teilkarte. */
const LEGACY_EDITS = () => ({
  [INST]: {
    z: { title: 'Legacy Z', showTitle: true, bgColor: '#eef6ff', yLabel: 'z (Legacy)' },
    mr: { title: 'Legacy MR', showTitle: true },
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
  /** Die lebenden Diagramme in den Zeichenflächen. */
  const live = () => charts.filter((c) => c.alive && c.el.isConnected && c.el.closest('[data-chart-host]'));
  return {
    states, charts, container, chartEdits, vm, live, bus,
    /** Die lebenden Diagramme der Teilkarte `key`. */
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
  void vm.hasResult; void vm.errorText; void vm.warningText; void vm.kpi; void vm.groupRows; void vm.chartViews;
};
/** Eine Auswahl wie der Nutzer ändern. */
function choose(el, value) {
  if (!el) throw new Error('Feld fehlt');
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
/** Der Auswahl des Spaltenwählers `picker` (`val-picker` oder `grp-picker`). */
function pickerSelect(h, picker) {
  const sel = h.q(`[data-ref="${picker}"] select`);
  if (!sel) throw new Error(`Spaltenwähler ${picker} fehlt`);
  return sel;
}
/** Die angebotenen Spalten eines Wählers (Optionstexte ohne leere Wahl). */
const pickerNames = (h, picker) => [...pickerSelect(h, picker).options].filter((o) => o.value).map((o) => text(o));
/** Der Schlüssel der Spalte `name` im Wähler `picker`. */
function pickerValue(h, picker, name) {
  const o = [...pickerSelect(h, picker).options].find((x) => x.textContent.includes(name));
  if (!o) throw new Error(`Spalte ${name} fehlt im Wähler ${picker}`);
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
const DERIVED = ['result', 'points', 'warningMsg', 'activeColumnSlots'];
const pick = (out, keys) => Object.fromEntries(keys.map((k) => [k, out[k]]));
const EMPTY_READ = { result: null, points: [], warningMsg: null };

/** Prüft die leere Ausgabe ohne Meldung. */
function assertEmpty(h) {
  const vm = h.vm();
  assertEqual(vm.hasResult, false);
  assertEqual(vm.kpi, null);
  assertDeepEqual(plain(vm.groupRows), []);
  assertDeepEqual(plain(vm.chartViews), {});
  assertEqual(vm.errorText, '');
  assertEqual(vm.warningText, '');
  assertDeepEqual(plain(pick(vm.read({ fields: ['result', 'points', 'warningMsg'] }), ['result', 'points', 'warningMsg'])), EMPTY_READ);
  assertEqual(h.q('.dmike-kpi-strip'), null);
  assertEqual(h.qa('.src__chart-section').length, 0);
  assertEqual(h.q('.src__groups-table'), null);
  assertEqual(h.q('.src__warning'), null);
  assertEqual(h.q('.src__error'), null);
  assertEqual(h.charts.length, 0);
}

suite('short-run-chart: Viewmodel im Browser', () => {
  test('Altprojekt-Daten: Hinweis, KPI-Leiste, Teiletabelle, zwei Teilkarten, Eingaben, Lesefläche', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertTrue(vm.hasResult, 'kein Ergebnis');
    assertEqual(vm.errorText, '');
    // Hinweis auf das Teil ohne Streuung.
    assertEqual(vm.warningText, tr('warningSkipped', { count: 1 }));
    assertEqual(text(h.q('[data-ref="warning-area"] .src__warning')), tr('warningSkipped', { count: 1 }));
    // KPI-Leiste mit festen Ankern.
    assertDeepEqual(plain(vm.kpi), {
      groups: 3, totalText: '20 Messwerte', mrBarText: '1,054', uclMrText: 'UCL_MR 3,444', signals: 3,
      ofText: 'von 20 Datenpunkten', signalsClass: 'dmike-kpi--bad',
    });
    assertEqual(vm.kpi, vm.kpi, 'KPI-Leiste bei gleicher Rechnung neu gebaut');
    assertEqual(h.qa('[data-ref="stats-bar"] .dmike-kpi').length, 3);
    assertDeepEqual(h.qa('.dmike-kpi-value').map(text), ['3', '1,054', '3']);
    assertDeepEqual(h.qa('.dmike-kpi-label').map(text), [tr('statGroups'), 'MR̄ (z)', tr('statSignals')]);
    assertDeepEqual(h.qa('.dmike-kpi-sub').map(text), ['20 Messwerte', 'UCL_MR 3,444', 'von 20 Datenpunkten']);
    assertDeepEqual(h.qa('.dmike-kpi-label').map((el) => el.getAttribute('data-help-key')), [
      `modules.${ID}.types.Result.groups`, `modules.${ID}.types.Result.mr`, `modules.${ID}.types.Result.signalsZ`,
    ]);
    assertTrue(h.qa('.dmike-kpi')[2].classList.contains('dmike-kpi--bad'), 'Klasse der dritten Kachel');
    // Teiletabelle: Köpfe mit Ankern, Zeilen auf drei Stellen.
    assertDeepEqual(h.qa('.src__groups-table th').map(text), [tr('thGroup'), tr('thCount'), tr('thMean'), 'σ̂', 'MR̄']);
    assertDeepEqual(h.qa('.src__groups-table th span').map((el) => el.getAttribute('data-help-key')),
      ['group', 'count', 'mean', 'sigma', 'mrBar'].map((k) => `modules.${ID}.types.GroupStats.${k}`));
    assertDeepEqual(h.qa('.src__groups-table tbody tr').map((tr_) => [...tr_.querySelectorAll('td')].map(text)), [
      ['A', '9', '10,003', '0,028', '0,031'],
      ['B', '10', '25,042', '0,104', '0,118'],
      ['C', '1', '7,500', '0,000', '0,000'],
    ]);
    // Lesefläche.
    const out = vm.read({ fields: DERIVED });
    assertDeepClose(plain(out.result), LEGACY_RESULT);
    assertEqual(out.points.length, 20);
    assertEqual(out.points[0].mr, null);
    assertTrue(out.points[16].signalZ && out.points[16].signalMR && out.points[17].signalMR, 'Signale in den Punkten');
    assertEqual(out.warningMsg, tr('warningSkipped', { count: 1 }));
    assertDeepEqual(plain(out.activeColumnSlots), ['valuesRef', 'groupsRef']);
    // Teilkarten: { z, mr } in Zeichenreihenfolge, je eine Zeichenfläche mit einem Diagramm.
    const views = vm.chartViews;
    assertDeepEqual(Object.keys(views), ['z', 'mr']);
    assertEqual(vm.chartViews, views, 'Teilkarten bei gleicher Rechnung neu gebaut');
    assertEqual(views.z.title, 'Z-Karte — Mass');
    assertEqual(views.mr.title, 'MR-Karte (z) — Mass');
    assertEqual(views.z.legacyEditKey, 'z');
    assertEqual(views.mr.legacyEditKey, 'mr');
    assertDeepEqual(h.qa('.src__chart-title').map(text), ['Z-Karte — Mass', 'MR-Karte (z) — Mass']);
    assertDeepEqual(h.qa('.src__badge').map(text), ['1 Signale', '2 Signale']);
    assertDeepEqual(h.qa('.src__badge .icon').map((el) => el.getAttribute('data-icon')), ['status.warning', 'status.warning']);
    assertTrue(h.qa('.src__badge').every((el) => el.classList.contains('src__badge--unstable')), 'Klasse der Abzeichen');
    assertDeepEqual(h.qa('.src__plot-wrap').map((el) => el.getAttribute('data-chart-host')), ['z', 'mr']);
    assertEqual(h.live().length, 2);
    assertEqual(h.in('z').length, 1);
    assertEqual(h.in('mr').length, 1);
    assertTrue(h.live().every((c) => c.type === 'control-chart'), 'falscher Diagrammtyp');
    // Der Kern macht aus den einelementigen Grenzlisten wieder Zahlen.
    const z = h.in('z')[0].config;
    assertEqual(z.values.length, 20);
    assertEqual(z.cl, 0);
    assertEqual(z.ucl, 3);
    assertEqual(z.lcl, -3);
    assertEqual(z.sigma, 1);
    assertDeepEqual([...z.violationIndices], [16]);
    assertEqual(z.showZones, true);
    assertDeepEqual([...z.stageBoundaries], [9, 19]);
    assertEqual(z.yLabel, tr('yLabel_z'));
    const mr = h.in('mr')[0].config;
    assertEqual(mr.values.length, 20);
    assertEqual(mr.values[0], null);
    assertDeepClose(mr.cl, LEGACY_RESULT.mr.cl);
    assertDeepClose(mr.ucl, LEGACY_RESULT.mr.ucl);
    assertEqual(mr.lcl, 0);
    assertDeepEqual([...mr.violationIndices], [16, 17]);
    assertEqual(mr.showZones, false);
    assertDeepEqual([...mr.stageBoundaries], [9, 19]);
    assertEqual(mr.yLabel, tr('yLabel_mrZ'));
    assertEqual(mr.xLabel, tr('xLabelSample'));
    assertEqual(h.q('.src__error'), null);
    // Eingaben: zwei Wähler mit Wahl; der Messwertwähler bietet nur Zahlenspalten.
    assertEqual(pickerSelect(h, 'val-picker').value, pickerValue(h, 'val-picker', 'Mass'));
    assertEqual(pickerSelect(h, 'grp-picker').value, pickerValue(h, 'grp-picker', 'Teil'));
    assertEqual(pickerNames(h, 'val-picker').some((n) => n.includes('Teil')), false);
    assertTrue(pickerNames(h, 'grp-picker').some((n) => n.includes('Mass')), 'Zahlenspalte fehlt im Teilewähler');
    assertDeepEqual(h.qa('.src__input .field-hint').map(text), [tr('groupsHint')]);
  });

  test('Beispiel (Setup/Messwert): Ergebnis wie die Altform, MR-Karte stabil, kein Hinweis', async () => {
    const h = await mount(stored({ valuesRef: ref('messwert'), groupsRef: ref('setup') }));
    const vm = h.vm();
    assertDeepClose(plain(vm.read({ fields: ['result'] }).result), EXAMPLE_RESULT);
    assertEqual(vm.warningText, '');
    assertEqual(vm.read({ fields: ['warningMsg'] }).warningMsg, null);
    assertEqual(h.q('.src__warning'), null);
    assertDeepEqual(h.qa('.dmike-kpi-value').map(text), ['3', '1,216', '1']);
    assertDeepEqual(plain(vm.chartViews.mr.badge), { text: tr('stable'), cls: 'src__badge--stable', icon: 'status.ok' });
    assertDeepEqual(h.qa('.src__badge .icon').map((el) => el.getAttribute('data-icon')), ['status.warning', 'status.ok']);
    assertDeepEqual([...h.in('z')[0].config.stageBoundaries], [8, 16]);
    assertEqual(h.qa('.src__groups-table tbody tr').length, 3);
    assertEqual(h.live().length, 2);
  });

  test('ohne Spalten oder mit nur einer: alles leer, kein Diagramm, kein Fehlerkasten', async () => {
    let h = await mount(new State().toJSON());
    assertEqual(h.vm().analysis, null);
    assertEmpty(h);
    h = await mount(stored({ groupsRef: null }));
    assertEmpty(h);
    h = await mount(stored({ valuesRef: null }));
    assertEmpty(h);
  });

  test('unter vier verwertbaren Paaren: leere Ausgabe ohne Meldung', async () => {
    const h = await mount(stored(), { sheet: sheetWith('mass', [10, 'x', null, 11, 12]) });
    assertEmpty(h);
  });

  test('Überlauf (Teil um 1,7·10³⁰⁸): stehender Fehlerkasten errCompute, nichts sonst, result null', async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      const h = await mount(stored({ valuesRef: ref('huge'), groupsRef: ref('hgrp') }));
      const vm = h.vm();
      assertEqual(vm.hasResult, false);
      assertDeepEqual(plain(vm.analysis), { status: 'error', reason: 'errCompute' });
      assertEqual(vm.errorText, 'Berechnung fehlgeschlagen.');
      assertEqual(text(h.q('[data-ref="error-area"] .src__error')), tr('errCompute'));
      assertEqual(vm.kpi, null);
      assertEqual(vm.warningText, '');
      assertDeepEqual(plain(vm.chartViews), {});
      assertDeepEqual(plain(pick(vm.read({ fields: ['result', 'points', 'warningMsg'] }), ['result', 'points', 'warningMsg'])), EMPTY_READ);
      assertEqual(h.q('.dmike-kpi-strip'), null);
      assertEqual(h.qa('.src__chart-section').length, 0);
      assertEqual(h.q('.src__groups-table'), null);
      assertEqual(h.charts.length, 0);
      // Ursache behoben (andere Spalten): der Kasten verschwindet.
      setFields(vm.model, { valuesRef: ref('mass'), groupsRef: ref('teil') });
      await settle();
      assertEqual(vm.errorText, '');
      assertEqual(h.q('.src__error'), null);
      assertTrue(vm.hasResult, 'kein Ergebnis nach behobener Ursache');
      assertEqual(h.live().length, 2);
    } finally {
      console.warn = warn;
    }
  });

  test('Zählung: eine Engine-Rechnung je wirksamer Änderung, keine bei Editor, Beispielblatt, fremder Spalte und Neueinhängen', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    readAll(vm);
    await settle();
    // Spaltenwechsel über die instance.set-Senke und über beide Wähler.
    assertEqual(await runsOf(vm, () => setFields(vm.model, { valuesRef: ref('messwert') })), 1, 'Messwertspalte über die Senke');
    assertEqual(vm.chartViews.z.title, 'Z-Karte — Messwert');
    assertEqual(await runsOf(vm, () => choose(pickerSelect(h, 'grp-picker'), pickerValue(h, 'grp-picker', 'Setup'))), 1, 'Teilespalte über den Wähler');
    assertDeepEqual(plain(vm.model.groupsRef), ref('setup'));
    assertDeepClose(plain(vm.read({ fields: ['result'] }).result), EXAMPLE_RESULT);
    assertEqual(await runsOf(vm, () => choose(pickerSelect(h, 'val-picker'), pickerValue(h, 'val-picker', 'Mass'))), 1, 'Messwertspalte über den Wähler');
    assertDeepEqual(plain(vm.model.valuesRef), ref('mass'));
    assertEqual(await runsOf(vm, () => setFields(vm.model, { groupsRef: ref('teil') })), 1, 'Teilespalte über die Senke');
    assertDeepClose(plain(vm.read({ fields: ['result'] }).result), LEGACY_RESULT);
    // Werte im Arbeitsblatt: die eigenen Spalten rechnen neu, eine fremde nicht.
    const mass2 = MASS.map((v, i) => (i === 0 ? 10.05 : v));
    assertEqual(await runsOf(vm, () => {
      h.states.ws1 = sheetWith('mass', mass2);
      h.bus.emit('worksheet:dataChanged', { instanceId: 'ws1' });
    }), 1, 'Wertänderung der Messwertspalte');
    const teil2 = TEIL.map((g, i) => (i === TEIL.length - 1 ? 'B' : g));
    assertEqual(await runsOf(vm, () => {
      h.states.ws1 = SHEET(COLS.map((c) => (c.id === 'mass' ? { ...c, values: mass2 } : c.id === 'teil' ? { ...c, values: teil2 } : c)));
      h.bus.emit('worksheet:dataChanged', { instanceId: 'ws1' });
    }), 1, 'Wertänderung der Teilespalte');
    assertEqual(vm.read({ fields: ['result'] }).result.groups.length, 2);
    assertEqual(vm.warningText, '');
    assertEqual(await runsOf(vm, () => {
      h.states.ws1 = SHEET(COLS.map((c) => (c.id === 'mass' ? { ...c, values: mass2 } : c.id === 'teil' ? { ...c, values: teil2 }
        : c.id === 'other' ? { ...c, values: [9, 9, 9] } : c)));
      h.bus.emit('worksheet:dataChanged', { instanceId: 'ws1' });
    }), 0, 'Wertänderung einer fremden Spalte');
    // Editor-Einstellungen und Beispielblatt: keine Rechnung.
    assertEqual(await runsOf(vm, () => { vm.model.charts = { z: { title: 'Neu', showTitle: true } }; }), 0, 'model.charts');
    assertEqual(vm.model.charts.z.title, 'Neu');
    assertEqual(await runsOf(vm, () => { vm.model.charts = { ...plain(vm.model.charts), mr: { showTitle: true } }; }), 0, 'model.charts mr');
    assertEqual(await runsOf(vm, () => { vm.model.exampleWorksheetId = 'ws-x'; }), 0, 'exampleWorksheetId');
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

  test('Spaltenwechsel mit Rückgängig und Wiederholen: ein Schritt, die andere Spalte bleibt gewählt', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertEqual(mod.historyCan('undo'), false);
    const grpKey = pickerSelect(h, 'grp-picker').value;
    choose(pickerSelect(h, 'val-picker'), pickerValue(h, 'val-picker', 'Messwert'));
    await settle();
    assertDeepEqual(plain(vm.model.valuesRef), ref('messwert'));
    assertDeepEqual(plain(vm.model.groupsRef), ref('teil'));
    assertEqual(pickerSelect(h, 'grp-picker').value, grpKey, 'Teilewahl beim Spaltenwechsel verloren');
    assertEqual(text(h.q('.src__chart-title')), 'Z-Karte — Messwert');
    assertEqual(h.live().length, 2, 'mehr als ein Diagramm je Teilkarte nach dem Wechsel');
    assertTrue(mod.historyStep('undo'), 'kein Schritt zum Zurücknehmen');
    await settle();
    assertDeepEqual(plain(vm.model.valuesRef), ref('mass'));
    assertEqual(pickerSelect(h, 'val-picker').value, pickerValue(h, 'val-picker', 'Mass'));
    assertDeepClose(plain(vm.read({ fields: ['result'] }).result), LEGACY_RESULT);
    assertEqual(h.live().length, 2);
    assertEqual(mod.historyCan('undo'), false, 'mehr als ein Schritt');
    assertTrue(mod.historyCan('redo'), 'kein Schritt zum Wiederholen');
    assertTrue(mod.historyStep('redo'), 'Wiederholen');
    await settle();
    assertDeepEqual(plain(vm.model.valuesRef), ref('messwert'));
    assertEqual(pickerSelect(h, 'val-picker').value, pickerValue(h, 'val-picker', 'Messwert'));
    assertEqual(h.live().length, 2);
  });

  test('referenzierte Spalte gelöscht (je Spalte): Bezug bleibt, leere Ausgabe, result null, kein Wurf', async () => {
    for (const gone of ['teil', 'mass']) {
      const h = await mount(stored(), { sheet: SHEET(COLS.filter((c) => c.id !== gone)) });
      const vm = h.vm();
      assertDeepEqual(plain(vm.model.valuesRef), ref('mass'), `Messwertbezug ohne ${gone}`);
      assertDeepEqual(plain(vm.model.groupsRef), ref('teil'), `Teilebezug ohne ${gone}`);
      assertEmpty(h);
    }
  });

  test('Altprojekt: Migration, chartEdits je Teilkarte übernommen, kein Verlaufsschritt; ein Diagramm je Teilkarte auch nach erneutem Öffnen', async () => {
    const h = await mount(plain(LEGACY), { chartEdits: LEGACY_EDITS() });
    const vm = h.vm();
    assertDeepEqual(plain(vm.model.valuesRef), ref('mass'));
    assertDeepEqual(plain(vm.model.groupsRef), ref('teil'));
    assertEqual(vm.model.exampleWorksheetId, null);
    assertDeepClose(plain(vm.read({ fields: ['result'] }).result), LEGACY_RESULT);
    assertDeepEqual(plain(vm.model.charts.z), { title: 'Legacy Z', showTitle: true, bgColor: '#eef6ff', yLabel: 'z (Legacy)' });
    assertDeepEqual(plain(vm.model.charts.mr), { title: 'Legacy MR', showTitle: true });
    assertEqual(Object.keys(h.chartEdits[INST].z).length, 0, 'Alteintrag z nicht gelöscht');
    assertEqual(Object.keys(h.chartEdits[INST].mr).length, 0, 'Alteintrag mr nicht gelöscht');
    assertEqual(mod.historyCan('undo'), false);
    // Die Konfiguration sagt title '' und die eigene y-Achse; der Alteintrag gewinnt in der Zeichnung.
    assertEqual(vm.chartViews.z.config.title, '');
    const z = h.in('z')[0].config;
    assertEqual(z.title, 'Legacy Z');
    assertEqual(z.showTitle, true);
    assertEqual(z.bgColor, '#eef6ff');
    assertEqual(z.yLabel, 'z (Legacy)');
    assertEqual(z.values.length, 20);
    const mr = h.in('mr')[0].config;
    assertEqual(mr.title, 'Legacy MR');
    assertEqual(mr.showTitle, true);
    assertEqual(mr.bgColor, undefined);
    assertEqual(mr.yLabel, tr('yLabel_mrZ'));
    assertEqual(mr.values.filter((v) => v !== null).length, 19);
    assertDeepEqual(h.qa('.dmike-kpi-value').map(text), ['3', '1,054', '3']);
    assertEqual(text(h.q('.src__warning')), tr('warningSkipped', { count: 1 }));
    assertEqual(h.live().length, 2);
    // Erneutes Öffnen des gespeicherten Stands: eine Zeichnung je Teilkarte, Einstellungen aus dem Model.
    const again = await mount(plain(h.states[INST]), { chartEdits: h.chartEdits });
    assertEqual(again.qa('.src__chart-section').length, 2);
    assertEqual(again.qa('[data-chart-host]').length, 2);
    assertEqual(again.in('z').length, 1);
    assertEqual(again.in('mr').length, 1);
    assertEqual(again.live().length, 2, 'mehr als ein Diagramm je Teilkarte nach dem Neuöffnen');
    assertEqual(again.in('z')[0].config.title, 'Legacy Z');
    assertEqual(again.in('mr')[0].config.title, 'Legacy MR');
    assertEqual(again.vm().model.charts.z.yLabel, 'z (Legacy)');
    assertEqual(mod.historyCan('undo'), false);
  });
});
