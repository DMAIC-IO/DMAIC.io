/**
 * Messverlaufsdiagramm: das Viewmodel im Browser (viewmodel/viewmodel.js) mit
 * dem echten Modul und der echten Vorlage, einem Fake-stateManager mit
 * Arbeitsblatt und einem Fake-chartManager. Prüft die Getter, die Felder für
 * Bezugswert und Teile je Streifen, die Zählung „eine Engine-Ausführung je
 * Spaltenwechsel, keine sonst; Tippen in der Kopfzeile baut keine Streifen
 * neu“, Rückgängig, den Fall „referenzierte Spalte gelöscht“ (Messwert und
 * Prüfer) und das Altprojekt mit der Übernahme alter chartEdits je Streifen.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/gage-run-chart/viewmodel/viewmodel.js';
import { State } from '../../js/modules/gage-run-chart/domain/model.js';
import { engineRuns } from '../../js/modules/gage-run-chart/domain/analyze.js';
import { setFields } from '../../js/core/model.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import { withStoredWorksheetReader } from '../helpers/worksheet-reader.js';

const ID = 'gage-run-chart';
const INST = 'grc-1';
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

/** Spalten der Altprojekt-Fixture (16 Zeilen, Zeile 8 ohne Messwert). */
const TEIL = [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4];
const PRUEFER = ['A', 'A', 'B', 'B', 'A', 'A', 'B', 'B', 'A', 'A', 'B', 'B', 'A', 'A', 'B', 'B'];
const D = [
  10.02, 10.04, 10.06, 10.08, 10.12, 10.1, 10.14, null,
  9.98, 10, 10.03, 10.05, 10.2, 10.22, 10.24, 10.26,
];
/** Eine zweite Messwertspalte gleicher Länge. */
const D2 = D.map((v) => (v === null ? null : Math.round((v + 1) * 100) / 100));
const COLS = () => [
  { id: 'c-teil', name: 'Teil', type: 'numeric', values: TEIL },
  { id: 'c-pruefer', name: 'Prüfer', type: 'text', values: PRUEFER },
  { id: 'c-d', name: 'Durchmesser', type: 'numeric', values: D },
  { id: 'c-d2', name: 'Durchmesser 2', type: 'numeric', values: D2 },
];
const SHEET = (cols = COLS()) => ({
  sheets: [{
    id: 's1',
    state: { rowCount: Math.max(...cols.map((c) => c.values.length), 0), columns: cols.map((c) => ({ ...c, values: [...c.values] })) },
  }],
});
const ref = (columnId) => ({ instanceId: 'ws1', sheetId: 's1', columnId });
const INFO = { name: 'Bügelmessschraube', date: '2026-06-07', reporter: 'QS', tolerance: '±0,1', misc: 'Probe' };
/** Gespeicherter Stand der neuen Form. */
const stored = (over = {}) => ({
  ...new State().toJSON(),
  part: ref('c-teil'), operator: ref('c-pruefer'), measurement: ref('c-d'),
  refValue: 10.5, partsPerRow: 2, connectWithin: false, showOperatorMean: false, gageInfo: { ...INFO },
  ...over,
});
/** Die Altform aus der Fixture `legacy-project.json` (ohne `_schema`). */
const LEGACY = {
  columnRefs: { part: ref('c-teil'), operator: ref('c-pruefer'), measurement: ref('c-d') },
  refValue: '10,5', partsPerRow: 2, connectWithin: false, showOperatorMean: false,
  gageInfo: { ...INFO }, exampleWorksheetId: null,
};

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
  const q = (sel) => container.querySelector(sel);
  return {
    states, charts, container, chartEdits, bus,
    vm: () => Alpine.$data(container.querySelector('[x-data]')),
    q,
    qa: (sel) => [...container.querySelectorAll(sel)],
    /** Die Konfiguration, die Streifen `i` zuletzt zeigt. */
    shown: (i) => charts.filter((c) => c.el.isConnected && c.el.closest('[data-strip]')?.dataset.strip === String(i)).at(-1)?.config ?? null,
    /** Text in ein Feld tippen und bestätigen. */
    type: async (sel, value) => {
      const el = q(sel);
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
      return el;
    },
  };
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const text = (el) => el.textContent.trim();
/** Alle Getter und die Lesefläche samt Punkten lesen, wie Vorlage und Agent es tun. */
const readAll = (vm) => {
  vm.read({ fields: ['points'] });
  void vm.result; void vm.points; void vm.kpi; void vm.warningTexts; void vm.runStrips; void vm.chartTitle;
  void vm.hasResult; void vm.errorText; void vm.hasGageInfo;
};

suite('gage-run-chart: Viewmodel im Browser', () => {
  test('Ergebnis: Kopfzeilenblock, KPI-Leiste, Hinweise, Kopfzeile und zwei Streifen', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertTrue(vm.hasResult, 'kein Ergebnis');
    assertEqual(vm.errorText, '');
    assertTrue(vm.hasGageInfo, 'Kopfzeile leer');
    assertDeepEqual(plain(vm.kpi), {
      n: 15, partsText: tr('statParts', { count: 4 }), operatorCount: 2, rowsText: tr('statRows', { count: 2 }),
      refText: '10,5000', refLabel: tr('refCustom'), refSubText: tr('statGrandMean', { v: '10,1027' }),
    });
    assertDeepEqual(vm.warningTexts, [tr('warn_unbalanced'), tr('warnDroppedRows', { count: 1 })]);
    assertEqual(vm.chartTitle, tr('chartTitle', { col: 'Durchmesser' }));
    const strips = vm.runStrips;
    assertDeepEqual(strips.map((s) => s.legacyEditKey), ['gage-run-chart', 'gage-run-chart#2']);
    assertDeepEqual(strips.map((s) => s.key), ['strip-0', 'strip-1']);
    assertDeepEqual(strips.map((s) => s.config.xLabel), ['', 'Teil']);
    assertDeepEqual(strips.map((s) => s.config.yLabel), ['Durchmesser', 'Durchmesser']);
    assertDeepEqual(strips.map((s) => s.config.refValue), [10.5, 10.5]);
    assertDeepEqual(strips.map((s) => s.config.refLabel), [tr('refCustom'), tr('refCustom')]);
    assertDeepEqual(strips.map((s) => [s.config.showOperatorMean, s.config.connectWithin, s.config.showLegend]), [[false, false, true], [false, false, true]]);
    // Vorlage
    assertDeepEqual(h.qa('[data-ref="gage-info"] .gage-run-chart__gage-value').map(text), Object.values(INFO));
    assertDeepEqual(h.qa('[data-ref="gage-info"] .gage-run-chart__gage-label').map(text), ['name', 'date', 'reporter', 'tolerance', 'misc'].map((k) => tr(`gageInfo_${k}`)));
    assertEqual(h.qa('[data-ref="stats-bar"] .dmike-kpi').length, 3);
    assertDeepEqual(h.qa('.dmike-kpi-value').map(text), ['15', '2', '10,5000']);
    assertDeepEqual(h.qa('.dmike-kpi-label').map(text), [tr('statMeasurements'), tr('statOperators'), tr('refCustom')]);
    assertDeepEqual(h.qa('.dmike-kpi-sub').map(text), [tr('statParts', { count: 4 }), tr('statRows', { count: 2 }), tr('statGrandMean', { v: '10,1027' })]);
    assertDeepEqual(h.qa('.gage-run-chart__warning').map(text), [tr('warn_unbalanced'), tr('warnDroppedRows', { count: 1 })]);
    assertTrue(h.q('[data-ref="warnings"]').style.display !== 'none', 'Hinweise ausgeblendet');
    assertEqual(text(h.q('.gage-run-chart__chart-title')), tr('chartTitle', { col: 'Durchmesser' }));
    assertDeepEqual(h.qa('.gage-run-chart__strip').map((el) => el.dataset.strip), ['0', '1']);
    assertEqual(h.charts.length, 2, 'Zahl der Diagramme');
    assertTrue(h.charts.every((c) => c.type === 'gage-run-chart'), 'Diagrammtyp');
    assertEqual(h.shown(0).xLabel, '');
    assertEqual(h.shown(1).xLabel, 'Teil');
    assertDeepEqual(h.shown(1).panels.map((p) => p.part), ['3', '4']);
    assertEqual(text(h.q('[data-ref="error-box"]')), '');
    // Felder: Text mit Dezimalkomma, ohne Bereichsattribute; Kästchen und Kopfzeile.
    const ref = h.q('[data-ref="inp-ref-value"]');
    assertEqual(ref.value, '10,5');
    assertEqual(ref.type, 'text');
    assertEqual(ref.getAttribute('inputmode'), 'decimal');
    const ppr = h.q('[data-ref="inp-parts-per-row"]');
    assertEqual(ppr.value, '2');
    assertEqual(ppr.type, 'text');
    assertEqual(ppr.getAttribute('inputmode'), 'numeric');
    assertTrue(!ppr.hasAttribute('min') && !ppr.hasAttribute('max') && !ppr.hasAttribute('step'), 'Bereichsattribute');
    assertEqual(h.q('[data-ref="chk-connect"]').checked, false);
    assertEqual(h.q('[data-ref="chk-operator-mean"]').checked, false);
    assertEqual(h.q('[data-ref="inp-gage-name"]').value, INFO.name);
    // Lesefläche: dieselben Zahlen.
    const out = vm.read({ fields: ['points'] });
    assertEqual(out.result.n, 15);
    assertEqual(out.result.refValue, 10.5);
    assertEqual(out.points.length, 15);
    assertDeepEqual(plain(out.points[0]), { part: '1', operator: 'A', value: 10.02 });
    assertDeepEqual(plain(out.activeColumnSlots), ['part', 'operator', 'measurement']);
    assertDeepEqual(plain(out.activeParams), ['refValue', 'partsPerRow', 'connectWithin', 'showOperatorMean', 'gageInfo']);
  });

  test('ohne Bezugswert: Gesamtmittel, Beschriftung Mittelwert, Spanne; leere Kopfzeile ausgeblendet', async () => {
    const h = await mount(stored({ refValue: null, gageInfo: { name: '', date: '', reporter: '', tolerance: '', misc: '' } }));
    const vm = h.vm();
    assertEqual(vm.kpi.refText, '10,1027');
    assertEqual(vm.kpi.refLabel, tr('refMean'));
    assertEqual(vm.kpi.refSubText, tr('statSpan', { min: '9,9800', max: '10,2600' }));
    assertEqual(vm.runStrips[0].config.refLabel, tr('refMean'));
    assertEqual(vm.hasGageInfo, false);
    assertEqual(h.q('[data-ref="gage-info"]').style.display, 'none');
    assertEqual(h.q('[data-ref="inp-ref-value"]').value, '');
  });

  test('ohne Spalte: alles leer, keine Streifen', async () => {
    const h = await mount(stored({ measurement: null }));
    const vm = h.vm();
    assertEqual(vm.hasResult, false);
    assertEqual(vm.kpi, null);
    assertDeepEqual(vm.runStrips, []);
    assertDeepEqual(vm.warningTexts, []);
    assertEqual(vm.errorText, '');
    assertEqual(vm.result, null);
    assertEqual(h.q('[data-ref="stats-bar"]'), null);
    assertEqual(h.q('[data-ref="strips"]'), null);
    assertEqual(h.charts.length, 0);
  });

  test('keine verwertbaren Messwerte: Fehlerkasten mit übersetztem Text, keine Ausgabe', async () => {
    const cols = COLS();
    cols[2] = { ...cols[2], values: D.map(() => null) };
    const h = await mount(stored(), { sheet: SHEET(cols) });
    const vm = h.vm();
    assertEqual(vm.hasResult, false);
    assertEqual(vm.result, null);
    assertEqual(vm.errorText, tr('errNoData'));
    assertEqual(text(h.q('[data-ref="error-box"]')), tr('errNoData'));
    assertEqual(h.q('[data-ref="stats-bar"]'), null);
  });

  test('Zählung: ein Spaltenwechsel ruft die Engine einmal, alles andere gar nicht', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    readAll(vm);
    await settle();
    let before = engineRuns();
    setFields(vm.model, { measurement: ref('c-d2') });
    await settle();
    readAll(vm);
    await settle();
    assertEqual(engineRuns() - before, 1, 'Engine-Ausführungen je Spaltenwechsel');
    assertEqual(vm.chartTitle, tr('chartTitle', { col: 'Durchmesser 2' }));
    assertEqual(h.shown(0).yLabel, 'Durchmesser 2');
    // Über den Wähler (dieselbe Senke).
    before = engineRuns();
    const sel = h.q('[data-ref="col-measurement-wrap"] select');
    sel.value = [...sel.options].find((o) => /c-d$/.test(o.value)).value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    readAll(vm);
    await settle();
    assertDeepEqual(plain(vm.model.measurement), ref('c-d'));
    assertEqual(engineRuns() - before, 1, 'Engine-Ausführungen je Spaltenwechsel über den Wähler');

    before = engineRuns();
    await h.type('[data-ref="inp-parts-per-row"]', '3');
    readAll(vm);
    assertEqual(vm.model.partsPerRow, 3);
    assertEqual(vm.runStrips.length, 2);
    assertDeepEqual(h.shown(0).panels.map((p) => p.part), ['1', '2', '3']);
    await h.type('[data-ref="inp-ref-value"]', '3,5');
    readAll(vm);
    assertEqual(vm.model.refValue, 3.5);
    assertEqual(vm.kpi.refText, '3,5000');
    assertEqual(h.shown(0).refValue, 3.5);
    const chk = h.q('[data-ref="chk-connect"]');
    chk.checked = true;
    chk.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    readAll(vm);
    assertEqual(vm.model.connectWithin, true);
    assertEqual(h.shown(0).connectWithin, true);
    setFields(vm.model, { showOperatorMean: true, partsPerRow: 1, refValue: null });
    await settle();
    readAll(vm);
    assertEqual(vm.runStrips.length, 4);
    assertEqual(engineRuns() - before, 0, 'Engine-Ausführungen je Einstellung');

    // Tippen in der Kopfzeile baut keine Streifen neu.
    const strips = vm.runStrips;
    const chartsBefore = h.charts.length;
    await h.type('[data-ref="inp-gage-name"]', 'Neu');
    readAll(vm);
    assertEqual(vm.model.gageInfo.name, 'Neu');
    assertEqual(text(h.q('[data-ref="gage-info"] .gage-run-chart__gage-value')), 'Neu');
    assertTrue(vm.runStrips === strips, 'runStrips neu gebaut');
    assertEqual(h.charts.length, chartsBefore, 'Diagramme neu angelegt');
    setFields(vm.model, { gageInfo: { ...INFO, misc: 'anders' } });
    await settle();
    readAll(vm);
    assertTrue(vm.runStrips === strips, 'runStrips neu gebaut (instance.set)');
    assertEqual(engineRuns() - before, 0, 'Engine-Ausführungen je Kopfzeile');
  });

  test('Teile je Streifen: 0, 21, 2,5 und abc abgelehnt mit Rücksprung', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    for (const raw of ['0', '21', '2,5', 'abc']) {
      const el = await h.type('[data-ref="inp-parts-per-row"]', raw);
      assertEqual(vm.model.partsPerRow, 2, `${raw} angenommen`);
      assertEqual(el.getAttribute('aria-invalid'), 'true', `${raw} nicht markiert`);
      assertEqual(el.value, '2', `${raw}: kein Rücksprung`);
    }
    const el = await h.type('[data-ref="inp-parts-per-row"]', '20');
    assertEqual(vm.model.partsPerRow, 20);
    assertTrue(el.getAttribute('aria-invalid') !== 'true', 'gültiger Wert noch markiert');
    assertEqual(vm.runStrips.length, 1);
  });

  test('Bezugswert: abc abgelehnt, 3,5 angenommen, leeres Feld nimmt das Gesamtmittel', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    const el = await h.type('[data-ref="inp-ref-value"]', 'abc');
    assertEqual(vm.model.refValue, 10.5);
    assertEqual(el.getAttribute('aria-invalid'), 'true');
    assertEqual(el.value, '10,5');
    await h.type('[data-ref="inp-ref-value"]', '3,5');
    assertEqual(vm.model.refValue, 3.5);
    assertEqual(text(h.qa('.dmike-kpi-value')[2]), '3,5000');
    await h.type('[data-ref="inp-ref-value"]', '');
    assertEqual(vm.model.refValue, null);
    assertEqual(text(h.qa('.dmike-kpi-value')[2]), '10,1027');
    assertEqual(text(h.qa('.dmike-kpi-label')[2]), tr('refMean'));
    assertEqual(vm.result.refValue, vm.result.grandMean);
  });

  test('Rückgängig: Teile je Streifen ändern, zurücknehmen, wiederholen möglich', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertEqual(mod.historyCan('undo'), false);
    await h.type('[data-ref="inp-parts-per-row"]', '4');
    assertEqual(vm.model.partsPerRow, 4);
    assertEqual(h.states[INST].partsPerRow, 4);
    assertEqual(vm.runStrips.length, 1);
    assertTrue(mod.historyStep('undo'), 'kein Schritt zum Zurücknehmen');
    await settle();
    assertEqual(vm.model.partsPerRow, 2);
    assertEqual(h.q('[data-ref="inp-parts-per-row"]').value, '2');
    assertEqual(vm.runStrips.length, 2);
    assertEqual(mod.historyCan('undo'), false);
    assertTrue(mod.historyCan('redo'), 'kein Schritt zum Wiederholen');
  });

  for (const [what, idx, slot] of [['Messwertspalte', 2, 'measurement'], ['Prüferspalte', 1, 'operator']]) {
    test(`referenzierte ${what} gelöscht: Bezug bleibt, leere Ausgabe, result null, points leer, kein Wurf`, async () => {
      const cols = COLS();
      cols.splice(idx, 1);
      const h = await mount(stored(), { sheet: SHEET(cols) });
      const vm = h.vm();
      const expected = slot === 'measurement' ? ref('c-d') : ref('c-pruefer');
      assertDeepEqual(plain(vm.model[slot]), expected);
      assertEqual(vm.hasResult, false);
      assertEqual(vm.result, null);
      assertDeepEqual(plain(vm.points), []);
      assertDeepEqual(vm.runStrips, []);
      assertEqual(vm.kpi, null);
      assertEqual(vm.errorText, '');
      const out = vm.read({ fields: ['points'] });
      assertEqual(out.result, null);
      assertDeepEqual(plain(out.points), []);
      assertEqual(h.q('[data-ref="stats-bar"]'), null);
      assertEqual(h.q('[data-ref="strips"]'), null);
      assertEqual(text(h.q('[data-ref="error-box"]')), '');
    });
  }

  test('Altprojekt: Migration, chartEdits je Streifen gewinnen über die Konfiguration, Alteinträge gelöscht, kein Verlaufsschritt', async () => {
    const chartEdits = {
      [INST]: {
        'gage-run-chart': { title: 'Legacy', showTitle: true, bgColor: '#eef6ff', yLabel: 'Messwert (mm)' },
        'gage-run-chart#2': { title: 'Legacy 2', showTitle: true },
      },
    };
    const h = await mount(plain(LEGACY), { chartEdits });
    const vm = h.vm();
    assertEqual(vm.model.refValue, 10.5);
    assertEqual(vm.model.partsPerRow, 2);
    assertDeepEqual(plain(vm.model.measurement), ref('c-d'));
    assertDeepEqual(plain(vm.model.runStripEdits[0]), { title: 'Legacy', showTitle: true, bgColor: '#eef6ff', yLabel: 'Messwert (mm)' });
    assertDeepEqual(plain(vm.model.runStripEdits[1]), { title: 'Legacy 2', showTitle: true });
    assertEqual(Object.keys(h.chartEdits[INST]['gage-run-chart']).length, 0, 'erster Alteintrag nicht gelöscht');
    assertEqual(Object.keys(h.chartEdits[INST]['gage-run-chart#2']).length, 0, 'zweiter Alteintrag nicht gelöscht');
    // Die Konfiguration sagt title '', showTitle false und den Spaltennamen; die Alteinträge gewinnen.
    assertEqual(vm.runStrips[0].config.title, '');
    assertEqual(vm.runStrips[0].config.yLabel, 'Durchmesser');
    assertEqual(h.shown(0).title, 'Legacy');
    assertEqual(h.shown(0).showTitle, true);
    assertEqual(h.shown(0).bgColor, '#eef6ff');
    assertEqual(h.shown(0).yLabel, 'Messwert (mm)');
    assertEqual(h.shown(1).title, 'Legacy 2');
    assertEqual(h.shown(1).showTitle, true);
    assertEqual(h.shown(1).yLabel, 'Durchmesser');
    assertEqual(h.shown(1).bgColor ?? null, null);
    assertEqual(h.charts.length, 2, 'mehr als ein Diagramm je Streifen');
    assertEqual(h.q('[data-ref="inp-ref-value"]').value, '10,5');
    assertEqual(vm.kpi.refText, '10,5000');
    assertDeepEqual(h.qa('[data-ref="gage-info"] .gage-run-chart__gage-value').map(text), Object.values(INFO));
    assertEqual(mod.historyCan('undo'), false);
  });
});
