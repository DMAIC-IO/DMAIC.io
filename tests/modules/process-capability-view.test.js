/**
 * Prozessfähigkeit: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem
 * echten Modul und der echten Vorlage, einem Fake-stateManager mit
 * Arbeitsblatt und einem Fake-chartManager. Prüft Kennzahlen und
 * Diagrammkonfiguration, den übersetzten Schätzerhinweis, die Leerzustände,
 * den Fall „referenzierte Spalte gelöscht“, das Leeren der ID-Spalte samt
 * Rückgängig und die Übernahme alter chartEdits beim Einhängen.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/process-capability/viewmodel/viewmodel.js';
import { State } from '../../js/modules/process-capability/domain/model.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import { withStoredWorksheetReader } from '../helpers/worksheet-reader.js';

const ID = 'process-capability';
const INST = 'pc-1';
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

/** 30 Messwerte um 50 (Cpk am Altmodul: 0.7269). */
const VALUES = Array.from({ length: 30 }, (_, i) => 50 + ((i * 7) % 11 - 5) / 50);
/** Untergruppen-IDs zu VALUES, je fünf Werte eine Gruppe. */
const IDS = VALUES.map((_, i) => `G${Math.floor(i / 5) + 1}`);

/**
 * Arbeitsblatt mit zwei Blättern: s1 mit Messwerten (c0) und IDs (c1), s2 mit
 * Messwerten (c0).
 */
const SHEET = () => ({
  sheets: [
    {
      id: 's1',
      state: {
        rowCount: VALUES.length,
        columns: [
          { id: 'c0', name: 'Durchmesser', type: 'numeric', values: [...VALUES] },
          { id: 'c1', name: 'Charge', type: 'text', values: [...IDS] },
        ],
      },
    },
    {
      id: 's2',
      state: {
        rowCount: VALUES.length,
        columns: [{ id: 'c0', name: 'Länge', type: 'numeric', values: [...VALUES] }],
      },
    },
  ],
});
/** Nur eine Textspalte. */
const TEXT_SHEET = () => ({
  sheets: [{ id: 's1', state: { rowCount: 2, columns: [{ id: 'c0', name: 'Name', type: 'text', values: ['a', 'b'] }] } }],
});
const A1 = { instanceId: 'ws1', sheetId: 's1', columnId: 'c0' };
const A2 = { instanceId: 'ws1', sheetId: 's1', columnId: 'c1' };
const B1 = { instanceId: 'ws1', sheetId: 's2', columnId: 'c0' };

/** Gespeicherter Stand der neuen Form. */
const stored = (over = {}, params = {}) => {
  const base = new State().toJSON();
  return { ...base, columnRef: A1, ...over, params: { ...base.params, lsl: 49.8, usl: 50.2, target: 50, ...params } };
};

/** Ein Wert aus dem Model als einfaches Objekt. */
const plain = (v) => JSON.parse(JSON.stringify(v));

/**
 * Modul mit Fake-Diensten einhängen; das Arbeitsblatt liegt unter `ws1`.
 * @param {object|null} model gespeicherter Zustand der Instanz
 * @param {{ sheet?: any, worksheet?: boolean, chartEdits?: Record<string, any> }} [opts]
 */
async function mount(model, { sheet = SHEET(), worksheet = true, chartEdits = {} } = {}) {
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
  const phases = worksheet ? { measure: [{ instanceId: 'ws1', moduleId: 'worksheet' }] } : { measure: [] };
  const context = {
    instanceId: INST,
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
  await mod.init(container, context);
  await settle();
  return {
    states, charts, container, chartEdits,
    vm: () => Alpine.$data(container.querySelector('[x-data]')),
  };
}

suite('process-capability: Viewmodel im Browser', () => {
  test('Messspalte mit 30 Werten und Grenzen: Cpk wie im Altmodul, Histogramm mit den Werten', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    const cpk = vm.mainKpis.find((k) => k.key === 'cpk');
    assertEqual(cpk.value, '0.7269');
    assertEqual(cpk.label, 'Cpk (Tatsächlich)');
    assertEqual(cpk.sub, 'Grenzwert: ≥ 1,33 · Nicht fähig · KI 95%: [0.5051; 0.9488]');
    assertEqual(vm.chart.data.length, 30);
    assertEqual(vm.chart.normalCurveColor, 'var(--color-info)');
    assertEqual(vm.chart.barColor, 'var(--color-accent)');
    assertEqual(vm.chart.showNormalCurve, true);
    assertEqual(vm.chart.showLegend, true);
    assertEqual(vm.chart.refLines.length, 3);
    assertEqual(vm.legacyEditKey, 'histogram');
    assertEqual(h.charts.at(-1)?.type, 'histogram');
    assertTrue(!!h.container.querySelector('[data-ref="kpi-main"] [data-kpi="cpk"]'), 'Cpk-Kachel fehlt');
  });

  test('Schätzer sbar bei Größe 1: übersetzter Hinweis', async () => {
    const h = await mount(stored({}, { withinMethod: 'sbar' }));
    const vm = h.vm();
    const expected = tr('methodFallbackHint', {
      method: tr('withinMethodNames.sbar'),
      kind: tr('kindSubgroups'),
      fallback: tr('withinMethodNames.averageMR'),
    });
    assertTrue(!expected.includes('{'), 'Text nicht gefüllt');
    assertEqual(vm.withinHint, expected);
    assertEqual(h.container.querySelector('[data-ref="within-hint"]').textContent, expected);
  });

  test('Leerzustände: ohne Arbeitsblatt, nur Textspalten', async () => {
    let h = await mount(stored({ columnRef: null }), { worksheet: false });
    assertEqual(h.vm().hasWorksheet, false);
    assertEqual(h.vm().hasNumericColumns, false);
    h = await mount(stored({ columnRef: null }), { sheet: TEXT_SHEET() });
    assertEqual(h.vm().hasWorksheet, true);
    assertEqual(h.vm().hasNumericColumns, false);
    h = await mount(stored());
    assertEqual(h.vm().hasWorksheet, true);
    assertEqual(h.vm().hasNumericColumns, true);
  });

  test('referenzierte Messspalte gelöscht: Bezug bleibt im Model, kein Ergebnis, kein Wurf', async () => {
    const sheet = SHEET();
    sheet.sheets[0].state.columns.splice(0, 1);
    const h = await mount(stored(), { sheet });
    const vm = h.vm();
    assertDeepEqual(plain(vm.model.columnRef), A1);
    assertEqual(vm.analysis.result, null);
    assertDeepEqual(vm.mainKpis, []);
    assertEqual(vm.chart, null);
  });

  test('Modus Spalte: Messspalte wechselt aufs andere Blatt, ID-Spalte leert sich; ein Rückgängig holt beides', async () => {
    const h = await mount(stored({ subgroupColumnRef: A2 }, { subgroupMode: 'column' }));
    const vm = h.vm();
    assertTrue(!!vm.analysis.result, 'kein Ergebnis im Modus Spalte');
    vm.model.columnRef = B1;
    await settle();
    assertEqual(vm.model.subgroupColumnRef, null);
    assertTrue(mod.historyCan('undo'), 'kein Schritt zum Zurücknehmen');
    assertTrue(mod.historyStep('undo'), 'Rückgängig fehlgeschlagen');
    await settle();
    assertDeepEqual(plain(vm.model.columnRef), A1);
    assertDeepEqual(plain(vm.model.subgroupColumnRef), A2);
    await vm.$nextTick();
    await settle();
    assertDeepEqual(plain(vm.model.subgroupColumnRef), A2, 'Picker überschreibt die wiederhergestellte ID-Spalte');
    assertEqual(mod.historyCan('undo'), false);
    assertEqual(mod.historyCan('redo'), true);
  });

  test('Modus Größe: Messspalte wechselt aufs andere Blatt, ID-Spalte bleibt', async () => {
    const h = await mount(stored({ subgroupColumnRef: A2 }));
    const vm = h.vm();
    vm.model.columnRef = B1;
    await settle();
    assertDeepEqual(plain(vm.model.subgroupColumnRef), A2);
  });

  test('ID-Spalte ausschließen: excludeForSubgroup nennt die Messspalte', async () => {
    let h = await mount(stored());
    assertDeepEqual(plain(h.vm().excludeForSubgroup), [A1]);
    h = await mount(stored({ columnRef: null }));
    assertDeepEqual(plain(h.vm().excludeForSubgroup), []);
  });

  test('Altprojekt mit chartEdits.histogram: Titel im Feld, kein Verlaufsschritt', async () => {
    const legacy = {
      params: { name: '', lsl: '49,8', usl: '50.2', target: '', unit: 'mm', confidence: '95' },
      columnRef: A1,
    };
    const h = await mount(legacy, { chartEdits: { [INST]: { histogram: { title: 'T' } } } });
    const vm = h.vm();
    assertEqual(vm.model.histogramChart.title, 'T');
    assertEqual(mod.historyCan('undo'), false);
    assertEqual(vm.mainKpis.find((k) => k.key === 'cpk').value, '0.7269');
  });
});
