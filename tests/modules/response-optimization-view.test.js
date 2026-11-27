/**
 * Zielgrößenoptimierung: das Viewmodel im Browser (viewmodel/viewmodel.js) mit
 * dem echten Modul, der echten Vorlage und einem Leser über gespeicherte
 * Regressions-/GLM-Zustände im Fake-stateManager. Prüft Leerzustand und
 * Nachladen der Besitzer, die Modellzeilen mit R²-Abzeichen, die
 * Vorgabefelder (Kästchen, Wunschfunktion, Zahlen mit Dezimalkomma samt
 * Ablehnung und Grenzenfolge), Sperrgründe, den Lauf `runOptimize` mit
 * Ergebnis und Wirkungsfläche, die Achsenwahl, fehlende Modelle und das
 * veraltete Ergebnis, das Altprojekt ohne Verlaufsschritt und zwei Instanzen.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerCommandDirectives } from '../../js/core/command-directives.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { registerAsyncTaskDirectives } from '../../js/core/async-task-directives.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { registerReader } from '../../js/core/source.js';
import { adoptProjectModels } from '../../js/core/project-models.js';
import { setModelName } from '../../js/core/model.js';
import { evaluateDerived } from '../../js/core/derived.js';
import { State as Regression } from '../../js/modules/regression/domain/model.js';
import { State as Glm } from '../../js/modules/glm-regression/domain/model.js';
import mod from '../../js/modules/response-optimization/viewmodel/viewmodel.js';

setModelName(Regression, 'regression');
setModelName(Glm, 'glm-regression');

const ID = 'response-optimization';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const INST = 'ro-1';
const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 80 };
const OWNERS = { regression: Regression, 'glm-regression': Glm };
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
    registerCommandDirectives(Alpine);
    registerFieldDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
    registerWidgetDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
    registerAsyncTaskDirectives(Alpine, { i18n: WIDGET_I18N });
    if (!Alpine.version) Alpine.start();
    UI = await (await fetch(new URL(`../../js/modules/${ID}/resources/i18n/ui.de.json`, import.meta.url), { cache: 'no-cache' })).json();
    prepared = true;
  }
  if (document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) return;
  const html = await (await fetch(new URL(`../../${TPL_KEY}`, import.meta.url), { cache: 'no-cache' })).text();
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', TPL_KEY);
  tpl.innerHTML = html;
  document.body.append(tpl);
}

/** Ein lineares Modell y = 1 + 2A + 3B. @param {string} id @param {Record<string, any>} [over] */
function rec(id, over = {}) {
  return {
    id, name: `Modell ${id}`, termSet: ['Intercept', 'A', 'B'], coef: [1, 2, 3], df: 5, rSqAdj: 0.9, lofPValue: null,
    factorSpec: [{ name: 'A', low: 0, high: 1 }, { name: 'B', low: 0, high: 2 }],
    spec: {
      predictors: [{ id: 'A', kind: 'continuous' }, { id: 'B', kind: 'continuous' }],
      terms: [{ id: 'A', factors: [{ id: 'A', degree: 1 }] }, { id: 'B', factors: [{ id: 'B', degree: 1 }] }],
    },
    dataSnapshot: { X: [[0, 0], [1, 2]], y: [1, 9], factorSpec: [{ name: 'A', low: 0, high: 1 }, { name: 'B', low: 0, high: 2 }], termSet: ['Intercept', 'A', 'B'] },
    ...over,
  };
}
/** Der Rohzustand einer Besitzerinstanz mit Modell. @param {Record<string, any>} r */
const owner = (r) => ({ savedModelId: r.id, savedModelName: r.name, savedModel: r });
const saved = (/** @type {object} */ o) => ({ _schema: { version: '1.0' }, specs: {}, optimization: null, ...o });

function unmountAll() {
  while (mounted.length) {
    const old = mounted.pop();
    Alpine.destroyTree(old);
    old.remove();
  }
}

/**
 * Modul einhängen; Besitzer liegen unter ihren ids in `owners`.
 * @param {object|null} model
 * @param {{ inst?: string, keep?: boolean, owners?: Record<string, { moduleId?: string, state: any }>, unloaded?: string[], shared?: any }} [opts]
 */
async function mount(model, { inst = INST, keep = false, owners = {}, unloaded = [], shared = null } = {}) {
  await prepare();
  if (!keep) unmountAll();
  const env = shared ?? (() => {
    const states = {};
    const phases = { improve: [] };
    for (const [id, o] of Object.entries(owners)) {
      states[id] = o.state;
      phases.improve.push({ instanceId: id, moduleId: o.moduleId ?? 'regression' });
    }
    const handlers = [];
    const bus = {
      on: (n, fn) => handlers.push([n, fn]),
      off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
      emit: (n, p) => { for (const [a, f] of [...handlers]) if (a === n) f(p); },
    };
    installWorksheetRevisions(bus);
    const notLoaded = new Set(unloaded);
    const loads = [];
    /** @type {() => void} */
    let release = () => {};
    const gate = new Promise((r) => { release = r; });
    const moduleOf = (id) => Object.values(phases).flat().find((r) => r.instanceId === id)?.moduleId;
    const sm = {
      getModuleState: (id) => states[id] ?? null,
      setModuleState: (id, s) => { states[id] = s; },
      getProjectCycle: () => 'dmaic',
      get: (path) => ({ phases, 'settings.confidenceLevel': 95, 'settings.power': 80 })[path],
      getChartEdits: () => null,
      setChartEdit: () => {},
    };
    registerReader(sm, (id) => {
      const m = moduleOf(id);
      if (!m) throw Object.assign(new Error(`unknown_instance: ${id}`), { code: 'unknown_instance' });
      if (notLoaded.has(m)) throw Object.assign(new Error(`not_loaded: ${id}`), { code: 'not_loaded' });
      const Model = OWNERS[m];
      if (!Model) return {};
      const model = Model.fromJSON(JSON.parse(JSON.stringify(states[id] ?? {})), { context: CTX, repair: true });
      return evaluateDerived(model, null, ['savedModel'], (k) => k);
    }, async (id) => {
      loads.push(id);
      await gate;
      const m = moduleOf(id);
      if (!notLoaded.has(m)) return false;
      notLoaded.delete(m);
      return true;
    });
    if (unloaded.length === 0) release();
    return { states, phases, bus, sm, loads, release };
  })();
  env.states[inst] = model;
  if (!Object.values(env.phases).flat().some((r) => r.instanceId === inst)) env.phases.improve.push({ instanceId: inst, moduleId: ID });
  const notes = [];
  const context = {
    instanceId: inst,
    instances: { list: () => [], read: async () => ({}), interact: async () => ({ ok: false, results: [] }) },
    stateManager: env.sm,
    i18n: { t: (k) => k, tf: () => tr, getLanguage: () => 'de' },
    eventBus: env.bus,
    chartManager: {
      create: async (el, type, config) => ({ el, type, config: { ...config } }),
      update: (chart, config) => { Object.assign(chart.config, config); },
      destroy: () => {},
    },
    notify: (message, type) => notes.push({ message, type }),
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
    env, notes, container,
    vm: () => Alpine.$data(container.querySelector('[x-data]')),
    q: (sel) => container.querySelector(sel),
    qa: (sel) => [...container.querySelectorAll(sel)],
  };
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const text = (el) => (el ? el.textContent.trim() : '');
/** Ein Eingabefeld wie der Nutzer ändern (`input` und `change`). */
function type(el, value) {
  if (!el) throw new Error('Feld fehlt');
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
const row = (h, id) => h.q(`.ro__model-row[data-model-id="${id}"]`);
const field = (h, id, action) => row(h, id)?.querySelector(`[data-action="${action}"]`);
/** Das Kästchen eines Modells umschalten. */
function toggle(h, id) {
  const cb = field(h, id, 'toggle-model');
  cb.checked = !cb.checked;
  cb.dispatchEvent(new Event('change', { bubbles: true }));
}
const startBtn = (h) => h.q('[data-action="optimize"]');

suite('response-optimization: Viewmodel im Browser', () => {
  test('ohne Modelle: Leerzustand, keine Eingabe', async () => {
    const h = await mount(null);
    await until(() => h.q('[data-ref="empty-state"]') !== null);
    assertEqual(text(h.q('[data-ref="empty-state"]')), tr('emptyState'));
    assertEqual(h.q('.ro__input'), null);
  });

  test('ungelesener Besitzer: Hinweis „wird geladen“, Laden angestoßen, danach die Modelle', async () => {
    const h = await mount(null, { owners: { r1: { state: owner(rec('m1')) } }, unloaded: ['regression'] });
    await until(() => h.q('[data-ref="models-loading"]') !== null);
    assertEqual(text(h.q('[data-ref="models-loading"]')), tr('modelsLoading'));
    await until(() => h.env.loads.includes('r1'));
    assertDeepEqual(h.env.loads, ['r1']);
    h.env.release();
    // Das frisch geladene Modul erhöht den Zähler der Instanz: die Modelle erscheinen.
    await until(() => row(h, 'm1') !== null);
    assertTrue(row(h, 'm1') !== null, 'Modell nach dem Laden sichtbar');
  });

  test('Besitzer ändert sein Modell ohne Mount: nach data:changed folgt die Liste', async () => {
    const h = await mount(null, { owners: { r1: { state: owner(rec('m1')) } } });
    await until(() => row(h, 'm1') !== null);
    h.env.states.r1 = owner(rec('m1', { name: 'Neu', rSqAdj: 0.7 }));
    h.env.bus.emit('data:changed', 'module:r1');
    await until(() => text(row(h, 'm1')?.querySelector('.ro__model-name')) === 'Neu');
    h.env.states.r1 = { savedModelId: null, savedModelName: null };
    h.env.bus.emit('data:changed', 'module:r1');
    await until(() => h.q('[data-ref="empty-state"]') !== null);
    assertEqual(row(h, 'm1'), null);
  });

  test('Modellzeilen: Name, R²-Abzeichen in der App-Sprache, Vorgabe erst bei Auswahl', async () => {
    const h = await mount(null, { owners: { r1: { state: owner(rec('m1')) }, r2: { state: owner(rec('m2', { rSqAdj: 0.6 })) } } });
    await until(() => row(h, 'm2') !== null);
    assertEqual(text(row(h, 'm1').querySelector('.ro__model-name')), 'Modell m1');
    const badge = row(h, 'm2').querySelector('.ro__r2');
    assertTrue(badge.classList.contains('ro__r2--warn'));
    assertTrue(text(badge).endsWith('0,600'), text(badge));
    assertEqual(row(h, 'm1').querySelector('.ro__spec').style.display, 'none');
    toggle(h, 'm1');
    await until(() => row(h, 'm1').querySelector('.ro__spec').style.display !== 'none');
    assertDeepEqual(plain(h.vm().model.specs), { m1: { selected: true } });
    assertEqual(field(h, 'm1', 'lower').value, '1');
    assertEqual(field(h, 'm1', 'upper').value, '9');
    assertEqual(field(h, 'm1', 'weight').value, '1');
  });

  test('Vorgabefelder: Dezimalkomma, Ablehnung, Grenzenfolge, Zielwert nur bei Ziel', async () => {
    const h = await mount(saved({ specs: { m1: { selected: true } } }), { owners: { r1: { state: owner(rec('m1')) } } });
    const vm = h.vm();
    await until(() => field(h, 'm1', 'lower') !== null);
    type(field(h, 'm1', 'lower'), '2,5');
    await until(() => vm.model.specs.m1.lower === 2.5);
    assertEqual(field(h, 'm1', 'lower').value, '2,5');
    type(field(h, 'm1', 'weight'), 'abc');
    await settle();
    assertTrue(field(h, 'm1', 'weight').classList.contains('field--error'));
    assertEqual(field(h, 'm1', 'weight').value, '1');
    type(field(h, 'm1', 'weight'), '0');
    await settle();
    assertEqual(vm.model.specs.m1.weight, undefined);
    type(field(h, 'm1', 'upper'), '2');
    await settle();
    assertEqual(vm.model.specs.m1.upper, undefined);
    assertEqual(field(h, 'm1', 'upper').title, tr('invariants.specBounds'));
    assertEqual(field(h, 'm1', 'upper').value, '9');
    const target = field(h, 'm1', 'target').closest('label');
    assertEqual(target.style.display, 'none');
    type(field(h, 'm1', 'kind'), 'target');
    await until(() => target.style.display !== 'none');
    assertEqual(vm.model.specs.m1.kind, 'target');
    assertEqual(field(h, 'm1', 'target').value, '5');
  });

  test('Sperrgründe: niedriges R² sperrt den Start mit Grund', async () => {
    const h = await mount(saved({ specs: { m1: { selected: true } } }), { owners: { r1: { state: owner(rec('m1', { rSqAdj: 0.3 })) } } });
    await until(() => h.q('[data-ref="diagnostic"]') !== null);
    const reason = text(h.q('[data-ref="diagnostic"] li'));
    assertEqual(reason, tr('lowR2', { name: 'Modell m1', value: '0,300' }));
    await until(() => startBtn(h).disabled);
    assertTrue(startBtn(h).disabled);
    assertEqual(startBtn(h).title, reason);
  });

  test('ohne Auswahl ist der Start gesperrt: „Kein Modell ausgewählt.“', async () => {
    const h = await mount(null, { owners: { r1: { state: owner(rec('m1')) } } });
    await until(() => startBtn(h) !== null && startBtn(h).disabled);
    assertEqual(startBtn(h).title, tr('noModelSelected'));
  });

  test('runOptimize: Ergebnis, Tabellen, Wirkungsfläche, Meldung; ein Verlaufsschritt', async () => {
    const h = await mount(saved({ specs: { m1: { selected: true } } }), { owners: { r1: { state: owner(rec('m1')) } } });
    const vm = h.vm();
    await until(() => startBtn(h) !== null && !startBtn(h).disabled);
    assertEqual(text(h.q('[data-ref="placeholder"]')), tr('placeholderResult'));
    startBtn(h).click();
    await until(() => vm.model.optimization !== null);
    assertDeepEqual(plain(vm.model.optimization.modelRefs), ['m1']);
    await until(() => h.q('[data-ref="d-value"]') !== null);
    assertEqual(text(h.q('[data-ref="d-value"]')), '1,000');
    const cells = h.qa('[data-ref="optimum-table"] tbody td').map(text);
    assertDeepEqual(cells, ['A', '1,0000', 'B', '2,0000']);
    assertDeepEqual(h.qa('[data-ref="prediction-table"] tbody td').map(text), ['Modell m1', '9,0000', '1,000']);
    await until(() => h.q('[data-ref="contour-host"]') !== null);
    const cfg = vm.contourChart;
    assertEqual(cfg.grid.length, 28);
    assertDeepEqual([cfg.xLabel, cfg.yLabel, cfg.zLabel], ['A', 'B', 'Modell m1']);
    assertEqual(cfg.points.length, 1);
    assertDeepEqual(h.notes.at(-1), { message: tr('optimizeSuccess', { D: '1,000' }), type: 'success' });
    await until(() => h.q('[data-ref="placeholder"]').style.display === 'none');
    assertEqual(h.q('[data-ref="placeholder"]').style.display, 'none');
    assertTrue(mod.historyStep('undo'));
    await until(() => vm.model.optimization === null);
    assertTrue(mod.historyStep('redo'));
    await until(() => vm.model.optimization !== null);
  });

  test('Achsenwahl ab drei stetigen Faktoren; Optimieren setzt sie zurück', async () => {
    const three = rec('m3', {
      termSet: ['Intercept', 'A', 'B', 'C'], coef: [1, 2, 3, 4],
      factorSpec: [{ name: 'A', low: 0, high: 1 }, { name: 'B', low: 0, high: 2 }, { name: 'C', low: 0, high: 1 }],
      spec: {
        predictors: [{ id: 'A', kind: 'continuous' }, { id: 'B', kind: 'continuous' }, { id: 'C', kind: 'continuous' }],
        terms: ['A', 'B', 'C'].map((id) => ({ id, factors: [{ id, degree: 1 }] })),
      },
    });
    const h = await mount(saved({ specs: { m3: { selected: true } } }), { owners: { r1: { state: owner(three) } } });
    const vm = h.vm();
    await until(() => startBtn(h) !== null && !startBtn(h).disabled);
    startBtn(h).click();
    await until(() => h.q('[data-action="contour-axis"][data-axis="x"]') !== null);
    type(h.q('[data-action="contour-axis"][data-axis="x"]'), 'C');
    await until(() => vm.contourChart.xLabel === 'C');
    assertEqual(vm.state.contourXId, 'C');
    startBtn(h).click();
    await until(() => vm.state.contourXId === null);
    await until(() => vm.contourChart.xLabel === 'A');
  });

  test('fehlende Modelle und veraltetes Ergebnis: Hinweise, keine Wirkungsfläche', async () => {
    const opt = { modelRefs: ['gone'], result: { xOpt: [1, 2], yPredictions: [9], dPerResponse: [1], D: 0.5, factorNames: ['A', 'B'], modelNames: ['Alt'], iter: 2 } };
    const h = await mount(saved({ specs: { gone: { selected: true } }, optimization: opt }), { owners: { r1: { state: owner(rec('m1')) } } });
    await until(() => h.q('[data-ref="missing-models"]') !== null);
    assertEqual(text(h.q('[data-ref="missing-models"]')), tr('missingModels', { ids: 'gone' }));
    await until(() => h.q('[data-ref="result-stale"]') !== null);
    assertEqual(text(h.q('[data-ref="result-stale"]')), tr('resultStale'));
    assertEqual(text(h.q('[data-ref="d-value"]')), '0,500');
    assertEqual(h.q('[data-ref="contour-host"]'), null);
  });

  test('Altprojekt (a): Migration ohne Verlaufsschritt; Vorgabe, Ergebnis und Fläche wie gespeichert', async () => {
    const fx = await (await fetch(new URL('./response-optimization/legacy-project.json', import.meta.url), { cache: 'no-cache' })).json();
    const p = fx.projects[0];
    const { doc } = adoptProjectModels(plain({ phases: p.phases, moduleStates: p.moduleStates, models: p.models, optimizations: p.optimizations }), { phaseFor: () => 'improve' });
    const A = 'd1adb015-b51f-4d6c-8de4-d5fbb56d2aff';
    const OWNER = 'reg-model-pizza-lieferzeit';
    const h = await mount(plain(doc.moduleStates[A]), { inst: A, owners: { [OWNER]: { state: plain(doc.moduleStates[OWNER]) } } });
    const vm = h.vm();
    assertEqual(mod.historyCan('undo'), false);
    await until(() => field(h, 'model-pizza-lieferzeit', 'kind') !== null);
    assertEqual(field(h, 'model-pizza-lieferzeit', 'kind').value, 'min');
    assertEqual(field(h, 'model-pizza-lieferzeit', 'lower').value, '6,6');
    assertEqual(field(h, 'model-pizza-lieferzeit', 'upper').value, '30');
    await until(() => h.q('[data-ref="d-value"]') !== null);
    assertEqual(text(h.q('[data-ref="d-value"]')), '0,999');
    assertDeepEqual(h.qa('[data-ref="optimum-table"] tbody td').map(text), ['Entfernung', '0,6477', 'Verkehr', '1,0000']);
    await until(() => h.q('[data-ref="contour-host"]') !== null);
    assertEqual(vm.contourChart.zLabel, 'Lieferzeit — Modell');
    assertEqual(mod.historyCan('undo'), false);
  });

  test('zwei Instanzen: getrennte Vorgaben und Ergebnisse', async () => {
    const owners = { r1: { state: owner(rec('m1')) } };
    const a = await mount(saved({ specs: { m1: { selected: true } } }), { inst: 'ro-a', owners });
    const b = await mount(null, { inst: 'ro-b', keep: true, shared: a.env });
    await until(() => row(b, 'm1') !== null && startBtn(a) !== null && !startBtn(a).disabled);
    startBtn(a).click();
    await until(() => a.vm().model.optimization !== null);
    await settle();
    assertEqual(b.vm().model.optimization, null);
    assertEqual(b.q('[data-ref="d-value"]'), null);
    toggle(b, 'm1');
    await until(() => b.vm().model.specs.m1?.selected === true);
    type(field(b, 'm1', 'kind'), 'min');
    await until(() => b.vm().model.specs.m1.kind === 'min');
    assertEqual(a.vm().model.specs.m1.kind, undefined);
  });
});
