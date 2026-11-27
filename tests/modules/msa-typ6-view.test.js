/**
 * MSA Typ 6: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem echten
 * Modul und der echten Vorlage, einem Fake-stateManager mit Arbeitsblatt,
 * einem Fake-chartManager und einem Stub-Dienst `instances`. Prüft Kennzahlen
 * im Zahlformat der Sprache, Fehlerkasten und Warntext, die Typ-1-Auswahl
 * (Liste, Auffrischen, Übernahme in einem Schritt), die Regel-Kästchen, die
 * Zeilenmarkierung, den Fall „referenzierte Spalte gelöscht“, zwei Instanzen
 * nebeneinander und das Altprojekt mit chartEdits ohne Verlaufsschritt.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/msa-typ6/viewmodel/viewmodel.js';
import { State } from '../../js/modules/msa-typ6/domain/model.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import { withStoredWorksheetReader } from '../helpers/worksheet-reader.js';

const ID = 'msa-typ6';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
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
    registerFieldDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
    registerWidgetDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
    if (!Alpine.version) Alpine.start();
    UI = await (await fetch(new URL(`../../js/modules/${ID}/resources/i18n/ui.de.json`, import.meta.url), { cache: 'no-cache' })).json();
    prepared = true;
  }
  const html = await (await fetch(new URL(`../../${TPL_KEY}`, import.meta.url), { cache: 'no-cache' })).text();
  let tpl = document.querySelector(`template[data-tpl="${TPL_KEY}"]`);
  if (!tpl) {
    tpl = document.createElement('template');
    tpl.setAttribute('data-tpl', TPL_KEY);
    document.body.append(tpl);
  }
  tpl.innerHTML = html;
}

function unmountAll() {
  while (mounted.length) {
    const old = mounted.pop();
    Alpine.destroyTree(old);
    old.remove();
  }
}

/** 30 Einzelwerte um 10 (I-MR), ab Punkt 26 verschoben; dazu 25 Untergruppen à 5 für x̄-R. */
const VALUES = Array.from({ length: 30 }, (_, i) => 10 + (((i * 7) % 11) - 5) * 0.01 + (i >= 25 ? 0.2 : 0));
const XBAR = Array.from({ length: 125 }, (_, i) => 20 + (((i * 13) % 17) - 8) * 0.1);
const SHEET = () => ({
  sheets: [{
    id: 's1',
    state: {
      rowCount: 125,
      columns: [
        { id: 'v', name: 'Messwert', type: 'numeric', values: [...VALUES] },
        { id: 'x', name: 'Messwert x̄', type: 'numeric', values: [...XBAR] },
        { id: 'g', name: 'Untergruppe', type: 'numeric', values: XBAR.map((_, i) => Math.floor(i / 5) + 1) },
        { id: 'few', name: 'Wenig', type: 'numeric', values: VALUES.slice(0, 5) },
      ],
    },
  }],
});
const ref = (columnId) => ({ instanceId: 'ws1', sheetId: 's1', columnId });

/** Gespeicherter Stand der neuen Form. */
const stored = (params = {}, over = {}) => {
  const base = new State().toJSON();
  return { ...base, columns: { timestamp: null, value: ref('v'), subgroup: null }, ...over, params: { ...base.params, measurementName: 'Welle', baselineK: 15, ...params } };
};
/** Altstände (Instanzen a und b der E2E-Fixture, auf das Test-Blatt umgehängt), ohne `_schema`. */
const LEGACY_A = {
  params: { measurementName: 'Welle alt', unit: 'µm', chartType: 'i-mr', limitsMode: 'given', baselineK: '7', mu0: 10.002, sigma0: null, sourceTyp1InstanceId: 't1', enabledRules: ['1', '3'], alpha: 0.1 },
  columns: { timestamp: null, value: ref('v'), subgroup: null },
  exampleWorksheetId: 'ws-alt-beispiel',
};
const LEGACY_B = {
  params: { measurementName: 'Kolben alt', unit: 'mm', chartType: 'xbar-r', limitsMode: 'from-study', baselineK: 20, mu0: null, sigma0: null, sourceTyp1InstanceId: null, enabledRules: [], alpha: '0.01' },
  columns: { timestamp: null, value: ref('x'), subgroup: ref('g') },
  exampleWorksheetId: null,
};
const plain = (v) => JSON.parse(JSON.stringify(v));

/** Stub-Dienst `instances`: Typ-1-Instanzen mit `read`-Antworten (Fehler als `Error`). */
function typ1Instances(reads) {
  const calls = [];
  return {
    calls,
    list: ({ modules } = {}) => (modules?.includes('msa-typ1') ? Object.keys(reads).map((instanceId) => ({ instanceId, moduleId: 'msa-typ1', phase: 'measure' })) : []),
    read: async (id, opts) => {
      calls.push([id, opts]);
      const r = reads[id];
      if (r instanceof Error) throw r;
      return r;
    },
    interact: async () => ({ ok: false, results: [] }),
  };
}

/**
 * Eine Instanz einhängen (eigene Kopie des Moduls wie in der Registry); das
 * Arbeitsblatt liegt unter `ws1`.
 * @param {string} instanceId
 * @param {object|null} model gespeicherter Zustand
 * @param {{ sheet?: any, chartEdits?: Record<string, any>, keep?: boolean, instances?: any }} [opts]
 */
async function mount(instanceId, model, { sheet = SHEET(), chartEdits = {}, keep = false, instances = typ1Instances({}) } = {}) {
  await prepare();
  if (!keep) unmountAll();
  const states = { [instanceId]: model, ws1: sheet };
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
  const phases = { data: [{ instanceId: 'ws1', moduleId: 'worksheet' }] };
  const context = {
    instanceId,
    instances,
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
  const inst = { ...mod };
  await inst.init(container, context);
  await settle();
  const q = (sel) => container.querySelector(sel);
  return {
    inst, states, charts, container, chartEdits, q, bus,
    vm: () => Alpine.$data(container.querySelector('[x-data]')),
    /** Text in ein Eingabefeld tippen und es verlassen. */
    type: async (ref, text) => {
      const el = /** @type {HTMLInputElement} */ (q(`[data-ref="${ref}"]`));
      el.focus();
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      await settle();
    },
    /** Eine Option eines Auswahlfelds wählen. */
    choose: async (ref, value) => {
      const el = /** @type {HTMLSelectElement} */ (q(`[data-ref="${ref}"]`));
      el.value = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
    },
  };
}

suite('msa-typ6: Viewmodel im Browser', () => {
  test('Kennzahlen, Deutung und Warnung im deutschen Zahlformat; drei Diagramme', async () => {
    const h = await mount('t6-1', stored());
    const vm = h.vm();
    assertTrue(!!vm.res, 'kein Ergebnis');
    assertEqual(vm.res.meta.pointCount, 30);
    assertTrue(/^\d+,\d{3}$/.test(vm.kpiMean), vm.kpiMean);
    assertTrue(vm.kpiDriftP.includes(','), vm.kpiDriftP);
    assertTrue(vm.interpretation.length > 0 && !vm.interpretation.startsWith('modules.'), vm.interpretation);
    // Warnung „k < 20“ mit eingesetztem k (die Altform zeigte „{k}“).
    const warn = h.container.querySelector('.dmike-infobox--warn .dmike-infobox__detail').textContent;
    assertTrue(warn.includes('15') && !warn.includes('{k}'), warn);
    assertEqual(h.q('[data-ref="error-box"]'), null);
    assertEqual(h.q('.module-msa-typ6__empty'), null);
    assertEqual(vm.primaryConfig.showZones, true);
    assertEqual(vm.secondaryConfig.showZones, false);
    assertEqual(vm.driftConfig.series.length, 2);
    assertEqual(vm.legacyPrimaryKey, 'control-chart');
    assertEqual(vm.legacySecondaryKey, 'control-chart#2');
    assertEqual(vm.legacyDriftKey, 'scatter');
    await until(() => h.charts.length === 3);
    assertDeepEqual(h.charts.map((c) => c.type).sort(), ['control-chart', 'control-chart', 'scatter']);
  });

  test('Engine lehnt ab: stehender Fehlerkasten mit Text und Werten, keine Diagramme', async () => {
    const h = await mount('t6-1', stored({}, { columns: { timestamp: null, value: ref('few'), subgroup: null } }));
    const vm = h.vm();
    assertEqual(vm.res, null);
    assertDeepEqual(plain(vm.result), { invalid: { code: 'E_TOO_FEW_POINTS', params: { min: 10 } } });
    await until(() => !!h.q('[data-ref="error-box"]'));
    assertEqual(h.q('[data-ref="error-box"]').textContent.trim(), tr('errors.E_TOO_FEW_POINTS', { min: 10 }));
    assertEqual(h.container.querySelectorAll('[data-chart-host]').length, 0);
    assertEqual(h.q('.module-msa-typ6__empty'), null);
  });

  test('referenzierte Spalte gelöscht: Bezug bleibt im Model, Leertext, keine Rechnung', async () => {
    const sheet = SHEET();
    sheet.sheets[0].state.columns.splice(0, 1);
    const h = await mount('t6-1', stored(), { sheet });
    const vm = h.vm();
    assertDeepEqual(plain(vm.model.columns.value), ref('v'));
    assertEqual(vm.result, null);
    assertEqual(vm.primaryConfig, null);
    assertTrue(!!h.q('.module-msa-typ6__empty'), 'Leertext');
    assertEqual(h.container.querySelectorAll('.dmike-kpi').length, 0);
  });

  test('Typ-1-Liste: Name und μ/σ aus columnStats; ohne Kennwerte oder bei Lesefehler entfällt die Instanz', async () => {
    const instances = typ1Instances({
      t1: { params: { name: 'Normal Ø10' }, columnStats: { n: 30, mean: 10.000267, stdDev: 0.0020331 } },
      t2: { params: { name: 'Leer' }, columnStats: null },
      t3: new Error('needs_mount'),
      t4: { params: { name: '' }, columnStats: { n: 2, mean: 1, stdDev: 0.5 } },
    });
    const warn = console.warn;
    console.warn = () => {};
    let h;
    try {
      h = await mount('t6-1', stored({ limitsMode: 'given' }), { instances });
      await until(() => h.vm().state.typ1Options.length === 2);
    } finally { console.warn = warn; }
    assertDeepEqual(instances.calls.map(([id, o]) => [id, o.fields]), [['t1', ['params', 'columnStats']], ['t2', ['params', 'columnStats']], ['t3', ['params', 'columnStats']], ['t4', ['params', 'columnStats']]]);
    const labels = [...h.container.querySelectorAll('[data-ref="sel-source-typ1"] option')].map((o) => o.textContent);
    assertDeepEqual(labels.slice(1), ['Normal Ø10 (μ=10,000, σ=0,002)', 't4 (μ=1,000, σ=0,500)']);
  });

  test('Typ-1-Auswahl: Quelle, μ₀ und σ₀ in einem Schritt; Rückgängig stellt alles zurück', async () => {
    const instances = typ1Instances({ t1: { params: { name: 'Normal' }, columnStats: { n: 30, mean: 10.5, stdDev: 0.25 } } });
    const h = await mount('t6-1', stored({ limitsMode: 'given', mu0: 9, sigma0: 1 }), { instances });
    await until(() => h.vm().state.typ1Options.length === 1);
    await h.choose('sel-source-typ1', 't1');
    const vm = h.vm();
    assertEqual(vm.model.sourceTyp1InstanceId, 't1');
    assertEqual(vm.model.params.mu0, 10.5);
    assertEqual(vm.model.params.sigma0, 0.25);
    await until(() => /** @type {HTMLInputElement} */ (h.q('[data-ref="inp-mu0"]')).value === '10,5');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig fehlgeschlagen');
    await settle();
    assertEqual(vm.model.sourceTyp1InstanceId, null);
    assertEqual(vm.model.params.mu0, 9);
    assertEqual(vm.model.params.sigma0, 1);
    assertEqual(h.inst.historyCan('undo'), false);
    await until(() => /** @type {HTMLSelectElement} */ (h.q('[data-ref="sel-source-typ1"]')).value === '');
    // Platzhalter: nur die Auswahl zurück, μ₀/σ₀ bleiben.
    await h.choose('sel-source-typ1', 't1');
    await h.choose('sel-source-typ1', '');
    assertEqual(vm.model.sourceTyp1InstanceId, null);
    assertEqual(vm.model.params.mu0, 10.5);
  });

  test('Typ-1-Liste frischt bei module:added/removed und eigenem module:activated auf, nach destroy nicht mehr', async () => {
    const reads = { t1: { params: { name: 'A' }, columnStats: { n: 3, mean: 1, stdDev: 0.1 } } };
    const instances = typ1Instances(reads);
    const h = await mount('t6-1', stored({ limitsMode: 'given' }), { instances });
    await until(() => h.vm().state.typ1Options.length === 1);
    reads.t2 = { params: { name: 'B' }, columnStats: { n: 3, mean: 2, stdDev: 0.2 } };
    h.bus.emit('module:added', { moduleId: 'msa-typ1', instanceId: 't2' });
    await until(() => h.vm().state.typ1Options.length === 2);
    assertEqual(h.vm().state.typ1Options.length, 2);
    reads.t2.columnStats = { n: 3, mean: 3, stdDev: 0.3 };
    h.bus.emit('module:activated', { instanceId: 'andere' });
    await settle();
    assertEqual(h.vm().state.typ1Options[1].mean, 2);
    h.bus.emit('module:activated', { instanceId: 't6-1' });
    await until(() => h.vm().state.typ1Options[1].mean === 3);
    assertEqual(h.vm().state.typ1Options[1].mean, 3);
    delete reads.t1;
    h.bus.emit('module:removed', { moduleId: 'msa-typ1', instanceId: 't1' });
    await until(() => h.vm().state.typ1Options.length === 1);
    assertEqual(h.vm().state.typ1Options[0].instanceId, 't2');
    const before = instances.calls.length;
    unmountAll();
    h.bus.emit('module:added', { moduleId: 'msa-typ1' });
    await settle();
    assertEqual(instances.calls.length, before);
  });

  test('Regel-Kästchen rufen toggleRule; Rückgängig hakt wieder an', async () => {
    const h = await mount('t6-1', stored());
    const box = /** @type {HTMLInputElement} */ (h.container.querySelector('.module-msa-typ6__nelson-list input[value="3"]'));
    assertEqual(box.checked, true);
    box.click();
    await settle();
    assertDeepEqual([...h.vm().model.params.enabledRules], [1, 2, 4, 5, 6]);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig fehlgeschlagen');
    await until(() => box.checked);
    assertDeepEqual([...h.vm().model.params.enabledRules], [1, 2, 3, 4, 5, 6]);
    assertEqual(box.checked, true);
  });

  test('Radiogruppen, Zahlenfelder und α: Wahl schreibt das Model, Sichtbarkeit folgt', async () => {
    const h = await mount('t6-1', stored());
    const radio = /** @type {HTMLInputElement} */ (h.q('[data-ref="grp-limits-mode"] input[value="given"]'));
    radio.click();
    await settle();
    assertEqual(h.vm().model.params.limitsMode, 'given');
    await until(() => /** @type {HTMLElement} */ (h.q('[data-ref="group-baseline-k"]')).style.display === 'none');
    assertEqual(/** @type {HTMLElement} */ (h.q('[data-ref="group-given-limits"]')).style.display, '');
    await h.type('inp-mu0', '10,25');
    assertEqual(h.vm().model.params.mu0, 10.25);
    await h.type('inp-sigma0', 'abc');
    assertEqual(h.vm().model.params.sigma0, null);
    await h.choose('sel-alpha', '0.1');
    assertEqual(h.vm().model.params.alpha, 0.1);
    assertEqual(/** @type {HTMLSelectElement} */ (h.q('[data-ref="sel-alpha"]')).options[2].textContent, '0,10');
    /** @type {HTMLInputElement} */ (h.q('[data-ref="grp-chart-type"] input[value="xbar-r"]')).click();
    await until(() => /** @type {HTMLElement} */ (h.q('[data-ref="group-subgroup-picker"]')).style.display === '');
    assertEqual(h.vm().model.params.chartType, 'xbar-r');
  });

  test('Zeile angeklickt: markiert, nach der Pause nicht mehr', async () => {
    const h = await mount('t6-1', stored());
    await until(() => h.container.querySelectorAll('.module-msa-typ6__violation-row').length > 0);
    const row = /** @type {HTMLElement} */ (h.container.querySelector('.module-msa-typ6__violation-row'));
    row.click();
    await settle();
    assertTrue(row.classList.contains('module-msa-typ6__violation-row--active'), 'markiert');
    await until(() => !row.classList.contains('module-msa-typ6__violation-row--active'));
    assertEqual(h.vm().state.highlightedIndex, null);
  });

  test('zwei Instanzen nebeneinander: Radiogruppen und Eingaben getrennt', async () => {
    const a = await mount('t6-a', stored());
    const b = await mount('t6-b', stored({ measurementName: 'B' }), { keep: true });
    /** @type {HTMLInputElement} */ (b.q('[data-ref="grp-chart-type"] input[value="xbar-r"]')).click();
    await settle();
    assertEqual(b.vm().model.params.chartType, 'xbar-r');
    assertEqual(a.vm().model.params.chartType, 'i-mr');
    assertEqual(/** @type {HTMLInputElement} */ (a.q('[data-ref="grp-chart-type"] input[value="i-mr"]')).checked, true);
    await b.type('inp-baseline-k', '12');
    assertEqual(a.vm().model.params.baselineK, 15);
    assertEqual(b.vm().model.params.baselineK, 12);
  });

  test('Altprojekt: Werte migriert, chartEdits in den drei Feldern, kein Verlaufsschritt', async () => {
    const a = await mount('t6-a', plain(LEGACY_A));
    const va = a.vm();
    assertDeepEqual(plain(va.model.params), { measurementName: 'Welle alt', unit: 'µm', chartType: 'i-mr', limitsMode: 'given', baselineK: 7, mu0: 10.002, sigma0: null, enabledRules: [1, 3], alpha: 0.1 });
    assertEqual(va.model.sourceTyp1InstanceId, 't1');
    assertEqual(va.res, null);
    await until(() => !!a.q('[data-ref="error-box"]'));
    assertEqual(a.q('[data-ref="error-box"]').textContent.trim(), tr('errors.E_GIVEN_LIMITS_INVALID'));
    assertEqual(a.inst.historyCan('undo'), false);

    const b = await mount('t6-b', plain(LEGACY_B), {
      chartEdits: { 't6-b': { 'control-chart': { title: 'Mittelwerte alt' }, 'control-chart#2': { title: 'Spannweiten alt' }, scatter: { title: 'Drift alt' } } },
    });
    const vb = b.vm();
    await until(() => vb.model.driftChart?.title === 'Drift alt' && vb.model.secondaryChart?.title === 'Spannweiten alt');
    assertEqual(vb.model.primaryChart.title, 'Mittelwerte alt');
    assertEqual(vb.model.secondaryChart.title, 'Spannweiten alt');
    assertEqual(vb.model.driftChart.title, 'Drift alt');
    assertEqual(b.inst.historyCan('undo'), false);
    assertEqual(vb.res.meta.chartType, 'xbar-r');
    assertDeepEqual([...vb.model.params.enabledRules], []);
    assertEqual(vb.res.ruleViolations.length, 0);
  });
});
