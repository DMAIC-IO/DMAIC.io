/**
 * Ausreißertest: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem
 * echten Modul und der echten Vorlage, einem Fake-stateManager mit
 * Arbeitsblatt und einem Fake-chartManager. Prüft die Getter, die Kästchen
 * der Verfahren samt Ablehnung des letzten, die Heilung der Diagrammwahl beim
 * Lesen, den Fall „referenzierte Spalte gelöscht“ und das Altprojekt mit der
 * Übernahme alter chartEdits beim Einhängen.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/outlier-test/viewmodel/viewmodel.js';
import { State } from '../../js/modules/outlier-test/domain/model.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import { withStoredWorksheetReader } from '../helpers/worksheet-reader.js';

const ID = 'outlier-test';
const INST = 'ot-1';
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

/** Spalte „Durchmesser“ der Altprojekt-Fixture: ein deutlicher Ausreißer oben (Index 19). */
const VALUES = [10.02, 9.98, 10.01, 9.97, 10.03, 10, 9.99, 10.02, 10.01, 9.98, 10, 10.03, 9.97, 10.01, 9.99, 10.02, 10, 9.98, 10.01, 10.45];
const SHEET = () => ({
  sheets: [{
    id: 's1',
    state: { rowCount: VALUES.length, columns: [{ id: 'c0', name: 'Durchmesser', type: 'numeric', values: [...VALUES] }] },
  }],
});
const REF = { instanceId: 'ws1', sheetId: 's1', columnId: 'c0' };
/** Gespeicherter Stand der neuen Form. */
const stored = (over = {}) => ({ ...new State({ cycle: 'dmaic', confidenceLevel: 95, power: 80 }).toJSON(), colRef: REF, ...over });
/** Die Altform aus der Fixture `legacy-project.json` (ohne `_schema`). */
const LEGACY = {
  colRef: REF, alpha: 0.1, side: 'upper', tukeyFactor: 2, hampelK: 2.5, zThreshold: 2.5,
  modZThreshold: 3, esdMaxOutliers: 3, enabled: ['z-score', 'grubbs', 'tukey-iqr', 'generalized-esd'],
  chartMethod: 'grubbs', exampleWorksheetId: null,
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
  /** @type {any[][]} */
  const notes = [];
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
    notify: (...args) => { notes.push(args); },
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
    states, charts, container, chartEdits, notes,
    vm: () => Alpine.$data(container.querySelector('[x-data]')),
    /** Die Konfiguration, die das Diagramm zuletzt zeigt. */
    shown: () => charts.at(-1)?.config ?? null,
    box: (mid) => container.querySelector(`input[data-method="${mid}"]`),
    cards: () => [...container.querySelectorAll('.outliertest__card')],
  };
}

const plain = (v) => JSON.parse(JSON.stringify(v));
/** Kästchen umschalten wie ein Klick. */
const toggle = (box) => { box.checked = !box.checked; box.dispatchEvent(new Event('change', { bubbles: true })); };

suite('outlier-test: Viewmodel im Browser', () => {
  test('Diagramm: Titel mit Spalte und Verfahren, Gruppen nach dem gezeigten Ziel, Legende nur mit Ausreißern', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertTrue(vm.hasResult, 'kein Ergebnis');
    assertEqual(vm.colName, 'Durchmesser');
    assertEqual(vm.chartMethodShown, 'all');
    assertEqual(vm.ivp.title, tr('chartTitle', { col: 'Durchmesser', method: tr('chartMethodAll') }));
    assertEqual(vm.ivp.yLabel, 'Durchmesser');
    assertEqual(vm.ivp.showLegend, true);
    assertEqual(vm.ivp.showMedian, true);
    assertDeepEqual(vm.ivp.groups.map((g) => g.values.length), [19, 1]);
    assertDeepEqual(plain(vm.ivp.pointColors), ['var(--color-accent)', 'var(--color-error)']);
    assertEqual(vm.legacyEditKey, 'individual-value-plot');
    assertEqual(h.charts.length, 1);
    assertEqual(h.charts[0].type, 'individual-value-plot');
    assertEqual(h.shown().title, vm.ivp.title);
    assertEqual(h.container.querySelector('[data-ref="placeholder"]').style.display, 'none');
    // Gezeigtes Verfahren über die Knopfgruppe: Titel, Gruppen, aktiver Knopf.
    h.container.querySelector('.outliertest__chart-method-btn[data-chart-method="grubbs"]').click();
    await settle();
    assertEqual(vm.model.chartMethod, 'grubbs');
    assertEqual(vm.ivp.title, tr('chartTitle', { col: 'Durchmesser', method: tr('mGrubbs') }));
    assertEqual(vm.ivp.groups[1].name, `${tr('groupOutliers')} — ${tr('mGrubbs')}`);
    assertEqual(h.shown().title, vm.ivp.title);
    const active = [...h.container.querySelectorAll('.outliertest__chart-method-btn.btn--active')].map((b) => b.dataset.chartMethod);
    assertDeepEqual(active, ['grubbs']);
  });

  test('ohne Ausreißer: eine Gruppe, keine Legende, keine Tabelle, nur „alle“ in der Diagrammwahl', async () => {
    const sheet = SHEET();
    sheet.sheets[0].state.columns[0].values = [1, 2, 3, 4, 5, 6];
    const h = await mount(stored(), { sheet });
    const vm = h.vm();
    assertEqual(vm.ivp.groups.length, 1);
    assertEqual(vm.ivp.showLegend, false);
    assertDeepEqual(plain(vm.ivp.pointColors), ['var(--color-accent)']);
    assertEqual(vm.flaggedShow, false);
    assertDeepEqual(vm.chartSegs.map((s) => s.val), ['all']);
    assertEqual(h.container.querySelector('.outliertest__flagged'), null);
  });

  test('Karten: je aktivem Verfahren eine, Lab-Link übers Widget, Zahlen mit Dezimalkomma', async () => {
    const h = await mount(stored());
    const vm = h.vm();
    assertEqual(vm.methodCards.length, 7);
    assertEqual(h.cards().length, 7);
    assertEqual(h.container.querySelectorAll('.outliertest__card .dmike-algo-link').length, 7);
    assertEqual(h.container.querySelectorAll('.outliertest__algo-link').length, 0);
    const grubbs = vm.methodCards[0];
    assertEqual(grubbs.label, tr('mGrubbs'));
    assertEqual(grubbs.metrics[0].value, '4,1774');
    assertDeepEqual(vm.summaryKpis.map((k) => k.value), ['20', 'Durchmesser', '1', '7']);
    assertEqual(h.container.querySelectorAll('.outliertest__flagged tbody tr').length, 1);
  });

  test('Diagrammwahl: gespeichertes Verfahren ohne Markierung zeigt „alle“, der Wert bleibt', async () => {
    const h = await mount(stored({ chartMethod: 'dixon-q', enabled: ['grubbs', 'z-score'] }));
    const vm = h.vm();
    assertEqual(vm.model.chartMethod, 'dixon-q');
    assertEqual(vm.chartMethodShown, 'all');
    assertDeepEqual(vm.chartSegs.map((s) => [s.val, s.activeClass]), [['all', 'btn--active'], ['grubbs', ''], ['z-score', '']]);
    assertEqual(vm.ivp.title, tr('chartTitle', { col: 'Durchmesser', method: tr('chartMethodAll') }));
    // Wird das Verfahren aktiv und markiert es, zeigt das Diagramm es wieder.
    vm.model.chartMethod = 'grubbs';
    await settle();
    assertEqual(vm.chartMethodShown, 'grubbs');
    vm.model.enabled = ['z-score'];
    await settle();
    assertEqual(vm.model.chartMethod, 'grubbs');
    assertEqual(vm.chartMethodShown, 'all');
  });

  test('Kästchen: an und aus über toggleMethod, ein Rückgängig-Schritt je Änderung, feste Reihenfolge', async () => {
    const h = await mount(stored({ enabled: ['grubbs'] }));
    const vm = h.vm();
    assertEqual(mod.historyCan('undo'), false);
    toggle(h.box('modified-z'));
    await settle();
    toggle(h.box('dixon-q'));
    await settle();
    assertDeepEqual([...vm.model.enabled], ['grubbs', 'dixon-q', 'modified-z']);
    assertEqual(h.cards().length, 3);
    toggle(h.box('grubbs'));
    await settle();
    assertDeepEqual([...vm.model.enabled], ['dixon-q', 'modified-z']);
    assertTrue(mod.historyStep('undo'), 'kein Schritt zum Zurücknehmen');
    await settle();
    assertDeepEqual([...vm.model.enabled], ['grubbs', 'dixon-q', 'modified-z']);
    assertTrue(h.box('grubbs').checked, 'Kästchen folgt dem Rückgängig nicht');
    assertTrue(mod.historyStep('undo'));
    assertTrue(mod.historyStep('undo'));
    await settle();
    assertDeepEqual([...vm.model.enabled], ['grubbs']);
    assertEqual(mod.historyCan('undo'), false);
    assertEqual(h.notes.length, 0);
  });

  test('Kästchen: das letzte Verfahren abwählen wird abgelehnt, das Kästchen springt zurück, ein Hinweis erscheint', async () => {
    const h = await mount(stored({ enabled: ['tukey-iqr'] }));
    const vm = h.vm();
    const box = h.box('tukey-iqr');
    toggle(box);
    await settle();
    assertDeepEqual([...vm.model.enabled], ['tukey-iqr']);
    assertTrue(box.checked, 'Kästchen nicht zurückgesprungen');
    assertEqual(h.notes.length, 1);
    assertEqual(h.notes[0][0], tr('invariants.enabledNotEmpty'));
    assertTrue(h.notes[0][0] !== 'invariants.enabledNotEmpty', 'Hinweis nicht übersetzt');
    assertEqual(mod.historyCan('undo'), false);
  });

  test('Eingaben: Werte des Models mit Dezimalkomma, Seite in der Auswahl', async () => {
    const h = await mount(stored({ alpha: 0.1, side: 'lower', tukeyFactor: 2.5, esdMaxOutliers: 4 }));
    const q = (r) => h.container.querySelector(`[data-ref="${r}"]`);
    assertEqual(q('alpha').value, '0,1');
    assertEqual(q('tukey-factor').value, '2,5');
    assertEqual(q('esd-max').value, '4');
    assertEqual(q('side').value, 'lower');
    assertEqual(q('side').options.length, 3);
    const h2 = await mount(stored());
    assertEqual(h2.container.querySelector('[data-ref="esd-max"]').value, '');
    assertEqual(h2.container.querySelector('[data-ref="esd-max"]').placeholder, tr('esdMaxAuto'));
  });

  test('referenzierte Spalte gelöscht: Bezug bleibt im Model, kein Ergebnis, Platzhalter, kein Wurf', async () => {
    const sheet = SHEET();
    sheet.sheets[0].state.columns.splice(0, 1);
    const h = await mount(stored(), { sheet });
    const vm = h.vm();
    assertDeepEqual(plain(vm.model.colRef), REF);
    assertEqual(vm.hasResult, false);
    assertEqual(vm.result, null);
    assertEqual(vm.ivp, null);
    assertDeepEqual(vm.methodCards, []);
    assertDeepEqual(plain(vm.chartMethodOptions), ['all']);
    const ph = h.container.querySelector('[data-ref="placeholder"]');
    assertTrue(ph.style.display !== 'none', 'Platzhalter verborgen');
    assertEqual(h.container.querySelector('[data-ref="results"]').style.display, 'none');
    assertEqual(h.container.querySelector('[data-ref="chart"]'), null);
  });

  test('unter drei Zahlen: kein Ergebnis, Platzhalter', async () => {
    const sheet = SHEET();
    sheet.sheets[0].state.columns[0].values = [1, '2,5', null, 4];
    const h = await mount(stored(), { sheet });
    assertEqual(h.vm().hasResult, false);
    assertEqual(h.vm().result, null);
    assertTrue(h.container.querySelector('[data-ref="placeholder"]').style.display !== 'none', 'Platzhalter verborgen');
  });

  test('Altprojekt: Migration und chartEdits gewinnen, Alteintrag gelöscht, kein Verlaufsschritt', async () => {
    const chartEdits = { [INST]: { 'individual-value-plot': { title: 'Legacy', showMedian: false, bgColor: '#eef6ff', yLabel: 'Durchmesser' } } };
    const h = await mount(plain(LEGACY), { chartEdits });
    const vm = h.vm();
    assertDeepEqual([...vm.model.enabled], ['grubbs', 'generalized-esd', 'tukey-iqr', 'z-score']);
    assertEqual(vm.model.chartMethod, 'grubbs');
    assertEqual(vm.chartMethodShown, 'grubbs');
    assertEqual(vm.model.alpha, 0.1);
    assertEqual(vm.model.side, 'upper');
    assertEqual(vm.model.esdMaxOutliers, 3);
    assertEqual(vm.model.chart.title, 'Legacy');
    assertEqual(vm.model.chart.showMedian, false);
    assertEqual(vm.model.chart.bgColor, '#eef6ff');
    assertEqual(vm.model.chart.yLabel, 'Durchmesser');
    assertEqual(Object.keys(h.chartEdits[INST]['individual-value-plot']).length, 0, 'Alteintrag nicht gelöscht');
    assertEqual(h.shown().title, 'Legacy');
    assertEqual(h.shown().showMedian, false);
    assertEqual(h.shown().bgColor, '#eef6ff');
    assertDeepEqual(h.cards().map((c) => c.querySelector('.outliertest__card-title').textContent.trim()),
      [tr('mGrubbs'), tr('mESD'), tr('mTukey'), tr('mZScore')]);
    assertDeepEqual(['grubbs', 'generalized-esd', 'tukey-iqr', 'z-score', 'dixon-q'].map((m) => h.box(m).checked), [true, true, true, true, false]);
    assertEqual(h.container.querySelector('[data-ref="alpha"]').value, '0,1');
    assertEqual(h.container.querySelector('[data-ref="side"]').value, 'upper');
    assertEqual(mod.historyCan('undo'), false);
  });
});
