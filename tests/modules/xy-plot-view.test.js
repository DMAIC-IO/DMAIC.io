/**
 * XY-Diagramm: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem
 * echten Modul und der echten Vorlage, einem Fake-stateManager mit
 * Arbeitsblatt und einem Fake-chartManager. Prüft Getter, Fehlertexte, den
 * Fall „referenzierte Spalte gelöscht“, die Reihen-Einstellungen alter Stände
 * samt Leeren und Rückgängig, und die Übernahme alter chartEdits beim
 * Einhängen.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/xy-plot/viewmodel/viewmodel.js';
import { State } from '../../js/modules/xy-plot/domain/model.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import { withStoredWorksheetReader } from '../helpers/worksheet-reader.js';
import { storedSource } from '../helpers/stored-source.js';
import { evaluateDerived } from '../../js/core/derived.js';

const ID = 'xy-plot';
const INST = 'xy-1';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
const mounted = [];
let prepared = false;
let UI = null;

/** Text des Moduls mit `{name}` gefüllt; sonst der Schlüssel. */
function tr(key, params) {
  const v = UI?.[key];
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

/** Arbeitsblatt mit numerischen Spalten `c0`, `c1`, … namens „Spalte 0“, … */
const sheetWith = (...cols) => ({
  sheets: [{
    id: 's1',
    state: {
      rowCount: Math.max(0, ...cols.map((v) => v.length)),
      columns: cols.map((values, i) => ({ id: `c${i}`, name: `Spalte ${i}`, type: 'numeric', values })),
    },
  }],
});
const ref = (i) => ({ instanceId: 'ws1', sheetId: 's1', columnId: `c${i}` });
const SHEET = () => sheetWith([1, 2, 3, 4], [2, 4, 5, 8], [9, 8, 7, 6]);
/** Gespeicherter Stand der neuen Form. */
const stored = (over = {}) => ({
  ...new State().toJSON(),
  datasets: [{ x: ref(0), y: ref(1), group: null, size: null }],
  ...over,
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
    // Wie der echte Manager: das Diagramm trägt seine Konfiguration.
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
  return {
    states, charts, container, chartEdits,
    vm: () => Alpine.$data(container.querySelector('[x-data]')),
    /** Die Konfiguration, die das Diagramm zuletzt zeigt. */
    shown: () => charts.at(-1)?.config ?? null,
  };
}

/** Zeile der Datensätze mit X/Y-Spalte. */
const row = (x, y, errorBars = { mode: 'none' }) => ({ x: x === null ? null : ref(x), y: y === null ? null : ref(y), group: null, size: null, errorBars });

suite('xy-plot: Viewmodel im Browser', () => {
  test('zwei numerische Spalten: eine Reihe, X-Spaltenname an der Achse, Verbindungslinie im Editor', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertTrue(vm.hasSeries, 'keine Reihe');
    assertEqual(vm.errorText, '');
    assertEqual(vm.scatter.series.length, 1);
    assertEqual(vm.scatter.series[0].name, 'Spalte 1');
    assertEqual(vm.scatter.xLabel, 'Spalte 0');
    assertEqual(vm.scatter.yLabel, '');
    assertEqual(vm.scatter.title, '');
    assertEqual(vm.scatter.editConnectLine, true);
    assertEqual(vm.legacyEditKey, 'scatter');
    assertEqual(h.charts.length, 1);
    assertEqual(h.charts[0].type, 'scatter');
    assertTrue(h.container.querySelector('[data-ref="placeholder"]').style.display === 'none', 'Platzhalter sichtbar');
  });

  test('nur X gewählt: keine Reihe, kein Fehlertext, Platzhalter mit Text', async () => {
    const h = await mount(stored({ datasets: [row(0, null)] }));
    const vm = h.vm();
    assertEqual(vm.hasSeries, false);
    assertEqual(vm.errorText, '');
    assertEqual(vm.scatter, null);
    const ph = h.container.querySelector('[data-ref="placeholder"]');
    assertTrue(ph.style.display !== 'none', 'Platzhalter verborgen');
    assertEqual(ph.textContent, tr('placeholderText'));
  });

  test('zu wenige Paare: übersetzter Fehlertext mit dem Spaltennamen', async () => {
    const h = await mount(stored(), { sheet: sheetWith([1, null, null], [2, 3, 4]) });
    const vm = h.vm();
    assertEqual(vm.hasSeries, false);
    assertEqual(vm.errorText, tr('errTooFew', { col: 'Spalte 1' }));
    assertEqual(h.container.querySelector('[data-ref="error-box"]').textContent, vm.errorText);
  });

  test('referenzierte Y-Spalte gelöscht: Bezug bleibt im Model, keine Reihe, kein Wurf', async () => {
    const sheet = SHEET();
    sheet.sheets[0].state.columns.splice(1, 1);
    const h = await mount(stored(), { sheet });
    const vm = h.vm();
    assertDeepEqual(JSON.parse(JSON.stringify(vm.model.datasets[0].y)), ref(1));
    assertEqual(vm.hasSeries, false);
    assertEqual(vm.stats, null);
  });

  test('Fehlerbalken: die Reihe trägt errorBars im Getter scatter', async () => {
    const h = await mount(stored({ datasets: [row(0, 1, { mode: 'columns', columns: { yPlus: ref(2) } })] }));
    const eb = h.vm().scatter.series[0].errorBars;
    assertEqual(eb.yMode, 'relative');
    assertDeepEqual([...eb.yPlus], [9, 8, 7, 6]);
    assertEqual(h.shown().series[0].errorBars.yMode, 'relative');
  });

  test('referenzierte Fehlerspalte gelöscht: Bezug bleibt, kein Balken in diese Richtung, Punkte bleiben', async () => {
    const sheet = SHEET();
    sheet.sheets[0].state.columns.splice(2, 1);
    const h = await mount(stored({ datasets: [row(0, 1, { mode: 'columns', columns: { yPlus: ref(2), yMinus: ref(1) } })] }), { sheet });
    const vm = h.vm();
    assertDeepEqual(JSON.parse(JSON.stringify(vm.model.datasets[0].errorBars.columns.yPlus)), ref(2));
    const s = vm.scatter.series[0];
    assertEqual(s.x.length, 4);
    assertTrue(s.errorBars.yPlus.every((v) => v === null));
    assertDeepEqual([...s.errorBars.yMinus], [2, 4, 5, 8]);
  });

  test('eine Fehlerbalken-Änderung lässt legacySeries stehen, eine Slot-Änderung leert sie', async () => {
    const h = await mount(stored({ legacySeries: [{ name: 'Alt' }] }));
    const vm = h.vm();
    vm.model.setErrorBars({ index: 0, spec: { mode: 'constant', constant: { yPlus: 1 } } });
    await settle();
    assertEqual(vm.model.legacySeries.length, 1);
    assertEqual(vm.scatter.series[0].name, 'Alt');
    assertDeepEqual([...vm.scatter.series[0].errorBars.yPlus], [1, 1, 1, 1]);
    vm.model.datasets = [row(0, 2, { mode: 'constant', constant: { yPlus: 1 } })];
    await settle();
    assertEqual(vm.model.legacySeries.length, 0);
  });

  test('stats ist die Ableitung des Models', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    const expected = evaluateDerived(State.fromJSON(stored()), storedSource({ ws1: SHEET() })).stats;
    assertDeepEqual(JSON.parse(JSON.stringify(vm.stats)), JSON.parse(JSON.stringify(expected)));
    assertEqual(vm.stats[0].stats.n, 4);
  });

  test('Kennzahlentabelle trägt die Farbe der Reihe, auch nach dem Editor', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertEqual(vm.statsRows.length, 1);
    assertEqual(vm.statsRows[0].color, vm.scatter.series[0].color);
    assertEqual(vm.statsRows[0].stats.n, 4);
    vm.model.chart = { series: [{ name: 'Spalte 1', color: '#123456' }] };
    await settle();
    assertEqual(vm.statsRows[0].color, '#123456');
  });

  test('legacySeries liegt nach Index über der Reihe, auch der Name; andere Datenreihen leeren sie, Rückgängig holt beides', async () => {
    const h = await mount(stored({ legacySeries: [{ name: 'Alt', color: 'red' }] }));
    const vm = h.vm();
    assertEqual(vm.scatter.series[0].name, 'Alt');
    assertEqual(vm.scatter.series[0].color, 'red');
    assertEqual(h.vm().model.legacySeries.length, 1);
    vm.model.datasets = [row(0, 2)];
    await settle();
    assertEqual(vm.model.legacySeries.length, 0);
    assertEqual(vm.scatter.series[0].name, 'Spalte 2');
    assertTrue(mod.historyStep('undo'), 'kein Schritt zum Zurücknehmen');
    await settle();
    assertDeepEqual(JSON.parse(JSON.stringify(vm.model.datasets)), [row(0, 1)]);
    assertEqual(vm.model.legacySeries.length, 1);
    assertEqual(vm.model.legacySeries[0].name, 'Alt');
    assertEqual(mod.historyCan('undo'), false);
    assertEqual(mod.historyCan('redo'), true);
    await settle();
    assertEqual(vm.model.legacySeries.length, 1, 'Rückgängig leert die Einstellungen nicht erneut');
    assertTrue(mod.historyStep('redo'), 'kein Schritt zum Wiederholen');
    await settle();
    assertDeepEqual(JSON.parse(JSON.stringify(vm.model.datasets)), [row(0, 2)]);
    assertEqual(vm.model.legacySeries.length, 0);
  });

  test('Altprojekt mit Verbindungslinie je Index: der Editor-Eintrag nach Name gewinnt, beides überlebt das Neuladen', async () => {
    const legacy = {
      datasets: [{ xRef: ref(0), yRef: ref(1), groupRef: null }],
      seriesOverrides: [{ connectLine: { show: true, dash: 'dash' } }],
    };
    const h = await mount(legacy);
    const vm = h.vm();
    assertEqual(h.shown().series[0].connectLine.dash, 'dash');
    vm.model.chart = { series: [{ name: 'Spalte 1', connectLine: { show: true, dash: 'dot', width: 2 } }] };
    await settle();
    assertEqual(h.shown().series[0].connectLine.dash, 'dot');
    // Neu laden mit dem gespeicherten Stand.
    const again = await mount(h.states[INST]);
    assertEqual(again.vm().model.legacySeries.length, 1);
    assertEqual(again.shown().series[0].connectLine.dash, 'dot');
  });

  test('Altprojekt mit chartEdits und Referenzlinie: beides im Feld, kein Verlaufsschritt', async () => {
    const legacy = {
      datasets: [{ xRef: ref(0), yRef: ref(1), groupRef: null }],
      refLines: [{ dir: 'h', value: 3 }],
    };
    const h = await mount(legacy, { chartEdits: { [INST]: { scatter: { xLabel: 'L' } } } });
    const vm = h.vm();
    assertEqual(vm.model.chart.xLabel, 'L');
    assertEqual(vm.model.chart.refLines.length, 1);
    assertEqual(Object.keys(h.chartEdits[INST].scatter).length, 0, 'Alteintrag nicht gelöscht');
    assertEqual(h.shown().xLabel, 'L');
    assertEqual(mod.historyCan('undo'), false);
  });
});
