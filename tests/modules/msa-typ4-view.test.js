/**
 * MSA Typ 4: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem echten
 * Modul und der echten Vorlage, einem Fake-stateManager mit Arbeitsblatt und
 * einem Fake-chartManager. Prüft Kennzahlen je Norm im Zahlformat der
 * Sprache, den Fehlerkasten, das späte Einhängen der Residuen, die
 * Invariante limitsOrder am Feld, den Fall „referenzierte Spalte gelöscht“,
 * zwei Instanzen nebeneinander und das Altprojekt mit chartEdits unter allen
 * vier Altschlüsseln ohne Verlaufsschritt.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/msa-typ4/viewmodel/viewmodel.js';
import { State } from '../../js/modules/msa-typ4/domain/model.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import { withStoredWorksheetReader } from '../helpers/worksheet-reader.js';

const ID = 'msa-typ4';
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

/** Fünf Referenzen zu je drei Wiederholungen, leicht steigender Bias; dazu vier Referenzen (zu wenige). */
const REF = [2, 2, 2, 4, 4, 4, 6, 6, 6, 8, 8, 8, 10, 10, 10];
const MEAS = REF.map((x, i) => x + 0.01 * x + ((i % 3) - 1) * 0.02);
const SHEET = () => ({
  sheets: [{
    id: 's1',
    state: {
      rowCount: 15,
      columns: [
        { id: 'r', name: 'Referenz', type: 'numeric', values: [...REF] },
        { id: 'm', name: 'Messwert', type: 'numeric', values: [...MEAS] },
        { id: 'r4', name: 'Referenz 4', type: 'numeric', values: REF.map((x) => Math.min(x, 8)) },
      ],
    },
  }],
});
const ref = (columnId) => ({ instanceId: 'ws1', sheetId: 's1', columnId });

/** Gespeicherter Stand der neuen Form. */
const stored = (params = {}, over = {}) => {
  const base = new State().toJSON();
  return {
    ...base, refColumn: ref('r'), measColumn: ref('m'), ...over,
    params: { ...base.params, name: 'Bolzen', tolerance: { LSL: 0, USL: 12 }, ...params },
  };
};
/** Altstand (Instanz a der E2E-Fixture, auf das Test-Blatt umgehängt), ohne `_schema`. */
const LEGACY_A = {
  params: { name: 'Bolzen alt', unit: 'µm', norm: 'AIAG', pvMode: 'tolerance', tolerance: { LSL: '0', USL: '12,0' }, sigmaP: '', alpha: '0.10' },
  refColumn: ref('r'), measColumn: ref('m'), exampleWorksheetId: 'ws-alt-beispiel',
};
const LEGACY_EDITS = {
  linearity: { title: 'Linearität alt' }, 'pct-bias': { title: '%Bias alt' },
  'per-ref': { title: 'Je Referenz alt' }, residual: { title: 'Residuen alt' },
};
const plain = (v) => JSON.parse(JSON.stringify(v));

/**
 * Eine Instanz einhängen (eigene Kopie des Moduls wie in der Registry); das
 * Arbeitsblatt liegt unter `ws1`.
 * @param {string} instanceId
 * @param {object|null} model gespeicherter Zustand
 * @param {{ sheet?: any, chartEdits?: Record<string, any>, keep?: boolean }} [opts]
 */
async function mount(instanceId, model, { sheet = SHEET(), chartEdits = {}, keep = false } = {}) {
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

suite('msa-typ4: Viewmodel im Browser', () => {
  test('AIAG: Kennzahlen und Deutung im deutschen Zahlformat; drei Diagramme, Residuen noch nicht', async () => {
    const h = await mount('t4-1', stored());
    const vm = h.vm();
    assertTrue(!!vm.res, 'kein Ergebnis');
    assertTrue(/^\d+,\d{2} %$/.test(vm.kpiAiag.lin), vm.kpiAiag.lin);
    assertTrue(/^p = /.test(vm.kpiAiag.slopeP), vm.kpiAiag.slopeP);
    assertTrue(vm.interpretationText.length > 0 && !vm.interpretationText.includes('{'), vm.interpretationText);
    assertEqual(h.container.querySelectorAll('.dmike-kpi').length, 4);
    assertEqual(h.q('[data-ref="error-box"]'), null);
    assertEqual(h.q('.module-msa-typ4__empty'), null);
    assertEqual(h.container.querySelectorAll('.msa-typ4__table tbody tr').length, 5);
    assertEqual(vm.legacyLinearityKey, 'linearity');
    assertEqual(vm.legacyPctBiasKey, 'pct-bias');
    assertEqual(vm.legacyPerRefKey, 'per-ref');
    assertEqual(vm.legacyResidualKey, 'residual');
    assertEqual(vm.linearityConfig.series[1].errorBars.yPlus.length, 41);
    await until(() => h.charts.length === 3);
    assertEqual(h.charts.length, 3);
    assertEqual(vm.state.residualsOpen, false);
  });

  test('Residuen: Aufklappen hängt das Diagramm ein, Zuklappen hängt es aus', async () => {
    const h = await mount('t4-1', stored());
    await until(() => h.charts.length === 3);
    const det = /** @type {HTMLDetailsElement} */ (h.q('[data-ref="residuals-details"]'));
    det.open = true;
    await until(() => h.vm().state.residualsOpen === true);
    await until(() => h.charts.length === 4);
    assertEqual(h.charts.length, 4);
    assertTrue(!!h.q('[data-ref="chart-residuals"] .msa-typ4__chart-inner'), 'Wirt eingehängt');
    det.open = false;
    await until(() => h.vm().state.residualsOpen === false);
    await until(() => !h.q('[data-ref="chart-residuals"] .msa-typ4__chart-inner'));
    assertEqual(h.q('[data-ref="chart-residuals"] .msa-typ4__chart-inner'), null);
    assertEqual(h.inst.historyCan('undo'), false);
  });

  test('VDA 5 und 6·σP: Kacheln wechseln, σP-Feld sichtbar', async () => {
    const h = await mount('t4-1', stored());
    /** @type {HTMLInputElement} */ (h.q('[data-ref="grp-norm"] input[value="VDA5"]')).click();
    await settle();
    assertEqual(h.vm().model.params.norm, 'VDA5');
    await until(() => !!h.container.querySelector('[data-help-key="modules.msa-typ4.types.KpiVda5.Q_MS_BI"]'));
    assertEqual(h.container.querySelectorAll('.dmike-kpi').length, 4);
    assertEqual(h.container.querySelector('[data-help-key="modules.msa-typ4.types.KpiAiag.percentLinearity"]'), null);
    assertEqual(/** @type {HTMLElement} */ (h.q('[data-ref="group-sigma"]')).style.display, 'none');
    /** @type {HTMLInputElement} */ (h.q('[data-ref="grp-pv"] input[value="sixSigma"]')).click();
    await until(() => /** @type {HTMLElement} */ (h.q('[data-ref="group-sigma"]')).style.display === '');
    await h.type('inp-sigma', '0,5');
    assertEqual(h.vm().model.params.sigmaP, 0.5);
    await until(() => h.vm().res?.pv.value === 3);
    assertEqual(h.vm().res.pv.mode, 'sixSigma');
    await h.choose('sel-alpha', '0.1');
    assertEqual(h.vm().model.params.alpha, 0.1);
    assertEqual(/** @type {HTMLSelectElement} */ (h.q('[data-ref="sel-alpha"]')).options[2].textContent, '0,10');
  });

  test('Engine lehnt ab: stehender Fehlerkasten mit Text und Werten, Leertext, keine Diagramme', async () => {
    const h = await mount('t4-1', stored({}, { refColumn: ref('r4') }));
    const vm = h.vm();
    assertEqual(vm.res, null);
    assertDeepEqual(plain(vm.result), { invalid: { key: 'modules.msa-typ4.errTooFewReferences', vars: { got: 4 } } });
    await until(() => !!h.q('[data-ref="error-box"]'));
    assertEqual(h.q('[data-ref="error-box"]').textContent.trim(), tr('errTooFewReferences', { got: 4 }));
    assertTrue(!!h.q('.module-msa-typ4__empty'), 'Leertext');
    assertEqual(h.container.querySelectorAll('.msa-typ4__chart[x-widget]').length, 0);
    vm.model.refColumn = ref('r');
    await until(() => !h.q('[data-ref="error-box"]'));
    assertEqual(h.q('[data-ref="error-box"]'), null);
  });

  test('limitsOrder: USL unter LSL am Feld abgelehnt, Grund steht, Korrektur löscht ihn', async () => {
    const h = await mount('t4-1', stored());
    await h.type('inp-lsl', '13');
    assertEqual(h.vm().model.params.tolerance.LSL, 0);
    // Der Kern übersetzt den Invariantentext global; der Stub liefert den Schlüssel.
    assertEqual(h.q('[data-ref="limits-error"]').textContent.trim(), 'modules.msa-typ4.invariants.limitsOrder');
    await h.type('inp-lsl', '1,5');
    assertEqual(h.vm().model.params.tolerance.LSL, 1.5);
    assertEqual(h.q('[data-ref="limits-error"]').textContent.trim(), '');
  });

  test('referenzierte Spalte gelöscht: Bezug bleibt im Model, Leertext, keine Rechnung', async () => {
    const sheet = SHEET();
    sheet.sheets[0].state.columns.splice(1, 1);
    const h = await mount('t4-1', stored(), { sheet });
    const vm = h.vm();
    assertDeepEqual(plain(vm.model.measColumn), ref('m'));
    assertEqual(vm.result, null);
    assertEqual(vm.linearityConfig, null);
    assertTrue(!!h.q('.module-msa-typ4__empty'), 'Leertext');
    assertEqual(h.q('[data-ref="error-box"]'), null);
    assertEqual(h.container.querySelectorAll('.dmike-kpi').length, 0);
  });

  test('zwei Instanzen nebeneinander: Radiogruppen und Eingaben getrennt', async () => {
    const a = await mount('t4-a', stored());
    const b = await mount('t4-b', stored({ name: 'B' }), { keep: true });
    const nameA = /** @type {HTMLInputElement} */ (a.q('[data-ref="grp-norm"] input[value="AIAG"]')).name;
    const nameB = /** @type {HTMLInputElement} */ (b.q('[data-ref="grp-norm"] input[value="AIAG"]')).name;
    assertTrue(nameA !== nameB && nameA.includes('t4-a'), `${nameA} / ${nameB}`);
    /** @type {HTMLInputElement} */ (b.q('[data-ref="grp-norm"] input[value="VDA5"]')).click();
    await settle();
    assertEqual(b.vm().model.params.norm, 'VDA5');
    assertEqual(a.vm().model.params.norm, 'AIAG');
    assertEqual(/** @type {HTMLInputElement} */ (a.q('[data-ref="grp-norm"] input[value="AIAG"]')).checked, true);
    await b.type('inp-usl', '20');
    assertEqual(a.vm().model.params.tolerance.USL, 12);
    assertEqual(b.vm().model.params.tolerance.USL, 20);
  });

  test('Altprojekt: Werte migriert, chartEdits in den vier Feldern, spätes Residuen-Widget ohne Verlaufsschritt', async () => {
    const h = await mount('t4-a', plain(LEGACY_A), { chartEdits: { 't4-a': plain(LEGACY_EDITS) } });
    const vm = h.vm();
    assertDeepEqual(plain(vm.model.params), { name: 'Bolzen alt', unit: 'µm', norm: 'AIAG', pvMode: 'tolerance', tolerance: { LSL: 0, USL: 12 }, sigmaP: null, alpha: 0.1 });
    assertEqual(vm.model.exampleWorksheetId, 'ws-alt-beispiel');
    await until(() => vm.model.perRefChart?.title === 'Je Referenz alt');
    assertEqual(vm.model.linearityChart.title, 'Linearität alt');
    assertEqual(vm.model.pctBiasChart.title, '%Bias alt');
    assertEqual(vm.model.perRefChart.title, 'Je Referenz alt');
    assertEqual(h.inst.historyCan('undo'), false);
    // Residuen erst nach dem Aufklappen: der Alteintrag wird dann übernommen.
    /** @type {HTMLDetailsElement} */ (h.q('[data-ref="residuals-details"]')).open = true;
    await until(() => vm.model.residualChart?.title === 'Residuen alt');
    assertEqual(vm.model.residualChart.title, 'Residuen alt');
    assertEqual(h.inst.historyCan('undo'), false);
  });
});
