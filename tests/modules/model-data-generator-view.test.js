/**
 * Modelldaten-Generator: das Viewmodel im Browser (viewmodel/viewmodel.js)
 * mit dem echten Modul, der echten Vorlage, einem Fake-stateManager und
 * einem Fake-Stapel. Prüft: Knopf „Daten generieren“, Koeffizienten über
 * den Handler (Dezimalkomma, Ablehnung, Rückgängig), Faktorgrenzen über
 * `x-field` (Pfad über `model`) mit der Invariante, Anlegen/Entfernen mit Rücksetzen der β,
 * Ergebnis folgt dem Model, Eckknopf „In Datensammlung öffnen“ (Stapel,
 * Ansichtswechsel), das Altprojekt ohne Verlaufsschritt und zwei Instanzen.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerCommandDirectives } from '../../js/core/command-directives.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { setFields } from '../../js/core/model.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import { withStoredWorksheetReader } from '../helpers/worksheet-reader.js';
import mod from '../../js/modules/model-data-generator/viewmodel/viewmodel.js';

const ID = 'model-data-generator';
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

/** Text des Moduls unter einem Punktpfad; sonst der Pfad. */
function tr(path) {
  const v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), UI);
  return typeof v === 'string' ? v : path;
}
/** @param {string} path @param {object} [params] */
function trp(path, params = {}) {
  return tr(path).replace(/\{(\w+)\}/g, (_, k) => String(params[k]));
}

async function prepare() {
  if (!prepared) {
    registerCommandDirectives(Alpine);
    registerFieldDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
    registerWidgetDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
    if (!Alpine.version) Alpine.start();
    UI = await (await fetch(new URL(`../../js/modules/${ID}/resources/i18n/ui.de.json`, import.meta.url), { cache: 'no-cache' })).json();
    prepared = true;
  }
  if (document.querySelector(`template[data-tpl="${TPL_KEY}"]`)?.content.childElementCount) return;
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

/** Arbeitsblatt `ws1` mit Blatt „Daten“: `c1` gefüllt, `c2` leer. */
const SHEET = () => ({
  sheets: [{
    id: 's1',
    name: 'Daten',
    state: {
      rowCount: 3,
      columns: [
        { id: 'c1', name: 'Voll', type: 'numeric', values: [1, 2, 3] },
        { id: 'c2', name: 'Leer', type: 'numeric', values: [] },
      ],
    },
  }],
});
const plain = (v) => JSON.parse(JSON.stringify(v));
/** Altstand (a) aus der E2E-Fixture, `_schema` 1.0. */
const LEGACY_A = {
  _schema: { name: 'model-data-generator', version: '1.0' },
  factors: [
    { name: 'Temperatur', min: 150, max: 250 }, { name: 'Druck', min: 1, max: 10 },
    { name: 'Zeit', min: 5, max: 60 }, { name: 'Katalysator', min: 0.5, max: 2.5 },
  ],
  maxOrder: 3, intercept: 20, yName: 'Ausbeute', samplingMethod: 'lhs', sampleSize: 60, noiseStd: 0.5, seed: 7,
  betas: { 0: 1.5, 1: -0.8, 4: 0.25, 10: 0.05 },
};

/**
 * Eine Instanz einhängen.
 * @param {string} instanceId @param {object|null} model
 * @param {{ keep?: boolean, sheet?: any, interact?: (stack: any) => Promise<any>, chartEdits?: object }} [opts]
 */
async function mount(instanceId, model, { keep = false, sheet = SHEET(), interact, chartEdits = {} } = {}) {
  await prepare();
  if (!keep) unmountAll();
  const states = { [instanceId]: model, ws1: sheet };
  /** @type {any[][]} */
  const notes = [];
  /** @type {any[]} */
  const stacks = [];
  /** @type {any[]} */
  const activated = [];
  const handlers = [];
  const bus = {
    on: (n, fn) => handlers.push([n, fn]),
    off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
    emit: (n, p) => {
      if (n === 'module:activated') activated.push(p);
      for (const [a, f] of [...handlers]) if (a === n) f(p);
    },
  };
  installWorksheetRevisions(bus);
  const context = {
    instanceId,
    instances: {
      list: () => [{ instanceId: 'ws1', moduleId: 'worksheet' }],
      read: async () => ({}),
      interact: async (stack) => {
        stacks.push(plain(stack));
        if (interact) return interact(stack);
        return { ok: true, results: [{ id: 'ws', result: { instanceId: 'ws-new' } }, { id: 'write', result: { instanceId: 'ws-new', value: ['n1'] } }] };
      },
    },
    stateManager: withStoredWorksheetReader({
      getModuleState: (id) => states[id] ?? null,
      setModuleState: (id, s) => { states[id] = s; },
      getProjectCycle: () => 'dmaic',
      get: (path) => (path === 'phases' ? { data: [{ instanceId: 'ws1', moduleId: 'worksheet' }] } : undefined),
      getChartEdits: (inst, key) => chartEdits[inst]?.[key] ?? null,
      setChartEdit: () => {},
    }),
    i18n: { t: (k) => k, tf: () => trp, getLanguage: () => 'de' },
    eventBus: bus,
    chartManager: { create: async (el, type, config) => ({ el, type, config }), update: () => {}, destroy: () => {} },
    notify: (...args) => { notes.push(args); },
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
  const qa = (sel) => [...container.querySelectorAll(sel)];
  const h = {
    inst, states, notes, stacks, activated, container, q, qa, bus,
    vm: () => Alpine.$data(container.querySelector('[x-data]')),
    factorInput: (i, f) => /** @type {HTMLInputElement} */ (q(`.mdg-factor-grid--row [data-field="${f}"][data-idx="${i}"]`)),
    beta: (idx) => /** @type {HTMLInputElement} */ (q(`input[data-beta="${idx}"]`)),
    equation: () => q('[data-ref="equation"]').textContent.replace(/\s+/g, ' ').trim(),
    /** Ein Element per Tastatur füllen und bestätigen. @param {HTMLInputElement} el @param {string} text */
    typeInto: async (el, text) => {
      el.focus();
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      await settle();
    },
    field: (ref) => /** @type {HTMLInputElement} */ (q(`[data-ref="${ref}"]`)),
    kpis: () => Object.fromEntries(qa('.dmike-kpi').map((k) => [k.querySelector('.dmike-kpi-label').textContent, k.querySelector('.dmike-kpi-value').textContent])),
    /** Text in ein Feld tippen und bestätigen. */
    type: async (ref, text) => {
      const el = h.field(ref);
      el.focus();
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      await settle();
    },
    click: async (el) => { el.click(); await settle(); },
    undo: async () => { const ok = h.inst.historyStep('undo'); await settle(); return ok; },
    redo: async () => { const ok = h.inst.historyStep('redo'); await settle(); return ok; },
    saved: () => plain(states[instanceId]),
  };
  return h;
}


suite('model-data-generator: Viewmodel im Browser', () => {
  test('Knopf „Daten generieren“ zeigt Kennzahlen, Zähler und Vorschau mit beiden Eckknöpfen', async () => {
    const h = await mount('mdg-1', null);
    assertEqual(h.q('[data-ref="results"]'), null);
    assertEqual(h.equation(), 'Y = 50 + ε');
    await h.click(h.q('[data-ref="generate"]'));
    await until(() => h.q('[data-ref="data-table"] tbody td') !== null);
    const k = h.kpis();
    assertEqual(k[tr('statN')], '100');
    assertTrue(/^\d+,\d{4}$/.test(k[tr('statMean')]), k[tr('statMean')]);
    assertEqual(h.q('[data-ref="row-count"]').textContent, `(100 ${tr('rows')})`);
    const corner = h.qa('[data-ref="data-table"] thead th.datagrid__corner button').map((b) => b.className);
    assertDeepEqual(corner, ['datagrid__export-btn', 'datagrid__open-in-ws-btn']);
    assertEqual(h.inst.historyCan('undo'), false);
  });

  test('Koeffizient: Dezimalkomma über setBeta, Gleichung und Kennzahlen folgen; Unlesbares abgewiesen; Rückgängig', async () => {
    const h = await mount('mdg-1', null);
    await h.click(h.q('[data-ref="generate"]'));
    await until(() => h.kpis()[tr('statMean')] !== undefined);
    const before = h.kpis()[tr('statMean')];
    await h.typeInto(h.beta(0), '1,5');
    assertDeepEqual(plain(h.vm().model.betas), { 0: 1.5 });
    assertEqual(h.equation(), 'Y = 50 + 1,5·Temperatur + ε');
    await until(() => h.kpis()[tr('statMean')] !== before);
    await h.typeInto(h.beta(1), 'abc');
    assertDeepEqual(plain(h.vm().model.betas), { 0: 1.5 });
    assertEqual(h.beta(1).value, '0');
    assertEqual(h.beta(1).getAttribute('aria-invalid'), 'true');
    assertEqual(await h.undo(), true);
    await until(() => h.beta(0).value === '0');
    assertDeepEqual(plain(h.vm().model.betas), {});
    assertEqual(h.beta(1).getAttribute('aria-invalid'), null);
    await until(() => h.kpis()[tr('statMean')] === before);
  });

  test('Faktorgrenzen: Dezimalkomma; Min über Max abgelehnt mit dem Text der Invariante', async () => {
    const h = await mount('mdg-1', null);
    await h.typeInto(h.factorInput(1, 'min'), '2,5');
    assertEqual(h.vm().model.factors[1].min, 2.5);
    assertEqual(h.factorInput(1, 'min').value, '2,5');
    await h.typeInto(h.factorInput(0, 'min'), '300');
    assertEqual(h.vm().model.factors[0].min, 150);
    assertEqual(h.factorInput(0, 'min').value, '150');
    assertEqual(h.factorInput(0, 'min').getAttribute('aria-invalid'), 'true');
    assertEqual(h.vm().fieldError('model.factors[i].min'), `modules.${ID}.invariants.factorRange`);
    await h.typeInto(h.factorInput(0, 'name'), 'Temp');
    assertEqual(h.vm().model.factors[0].name, 'Temp');
    await until(() => h.q('[data-beta="0"]').closest('.mdg-beta-item').querySelector('.mdg-beta-name').textContent === 'Temp');
  });

  test('Faktor anlegen und entfernen: β zurück auf 0, je ein Schritt; letzter Faktor ohne Knopf', async () => {
    const h = await mount('mdg-1', null);
    await h.typeInto(h.beta(0), '2');
    await h.click(h.q('[data-ref="add-factor"]'));
    assertEqual(h.vm().model.factors.length, 4);
    assertEqual(h.vm().model.factors[3].name, 'Faktor_4');
    assertDeepEqual(plain(h.vm().model.betas), {});
    assertEqual(h.qa('input[data-beta]').length, 14);
    assertEqual(await h.undo(), true);
    await until(() => h.vm().model.factors.length === 3);
    assertDeepEqual(plain(h.vm().model.betas), { 0: 2 });
    for (let n = 3; n > 1; n--) {
      await h.click(h.q('.mdg-btn-remove[data-idx="0"]'));
      await until(() => h.vm().model.factors.length === n - 1);
    }
    assertEqual(h.qa('.mdg-btn-remove').length, 0);
  });

  test('Ergebnis folgt dem Model, auch einem Agenten auf der verborgenen Instanz', async () => {
    const h = await mount('mdg-1', null);
    await h.click(h.q('[data-ref="generate"]'));
    await until(() => h.kpis()[tr('statN')] === '100');
    setFields(h.vm().model, { sampleSize: 20000, samplingMethod: 'lhs' });
    await until(() => h.kpis()[tr('statN')] === '20.000');
    assertEqual(h.q('[data-ref="row-count"]').textContent, `(20.000 ${tr('rows')})`);
  });

  test('Eckknopf „In Datensammlung öffnen“: ein Stapel mit neuem Arbeitsblatt, holt es nach vorn', async () => {
    const h = await mount('mdg-1', null);
    await h.click(h.q('[data-ref="generate"]'));
    await until(() => h.q('[data-ref="data-table"] .datagrid__open-in-ws-btn') !== null);
    await h.click(h.q('[data-ref="data-table"] .datagrid__open-in-ws-btn'));
    await until(() => h.activated.length > 0);
    assertDeepEqual(h.activated, [{ instanceId: 'ws-new' }]);
    assertEqual(h.stacks.length, 1);
    const stack = h.stacks[0];
    const rename = stack.find((a) => a.method === 'renameSheet');
    assertEqual(rename.args[0].name, tr('name'));
    const write = stack.find((a) => a.method === 'writeColumns');
    const cols = write.args[0].columns;
    assertDeepEqual(cols.map((c) => c.name), ['Temperatur', 'Druck', 'Zeit', 'Y']);
    assertDeepEqual(cols.map((c) => [c.type, c.format?.decimals, c.values.length]), Array(4).fill(['numeric', 4, 100]));
    assertEqual(h.vm().model.factors.length, 3);
  });

  test('Altprojekt (a): kein Verlaufsschritt, Werte wie die Altform in der App-Sprache', async () => {
    const h = await mount('mdg-1', plain(LEGACY_A));
    assertEqual(h.inst.historyCan('undo'), false);
    assertEqual(h.equation(), 'Ausbeute = 20 + 1,5·Temperatur − 0,8·Temperatur·Druck + 0,25·Temperatur·Zeit + 0,05·Druck·Katalysator + ε');
    assertEqual(h.factorInput(3, 'min').value, '0,5');
    await h.click(h.q('[data-ref="generate"]'));
    await until(() => h.kpis()[tr('statN')] === '60');
    const k = h.kpis();
    assertDeepEqual([k[tr('statMean')], k[tr('statStd')], k[tr('min')], k[tr('max')]], ['20,4555', '0,6688', '18,8987', '21,9096']);
    assertDeepEqual(h.qa('.mdg-group-label').map((e) => e.textContent).slice(1), [tr('mainEffects'), '2-Fach Wechselwirkungen', '3-Fach Wechselwirkungen']);
  });

  test('zwei Instanzen: Änderungen und Knopf wirken nur in ihrer Instanz', async () => {
    const a = await mount('mdg-a', null);
    const b = await mount('mdg-b', null, { keep: true });
    await a.click(a.q('[data-ref="add-factor"]'));
    assertEqual(a.vm().model.factors.length, 4);
    assertEqual(b.vm().model.factors.length, 3);
    await b.click(b.q('[data-ref="generate"]'));
    await until(() => b.q('[data-ref="results"]') !== null);
    assertEqual(a.q('[data-ref="results"]'), null);
    assertTrue(a.q('label[for]').getAttribute('for') !== b.q('label[for]').getAttribute('for'), 'DOM-ids je Instanz');
  });
});
