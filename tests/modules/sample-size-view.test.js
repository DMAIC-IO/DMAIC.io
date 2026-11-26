/**
 * Stichprobenumfang: das Viewmodel im Browser (viewmodel/viewmodel.js) mit
 * dem echten Modul, der echten Vorlage und einem Fake-chartManager. Prüft
 * Knöpfe und Felder → Model, die Sichtbarkeit der Effektangaben je Variante,
 * Kennzahlen und Satz, die Power-Kurve im `x-if`, Schreiben von außen
 * (`setFields` wie `instance.set`), Rückgängig/Wiederholen, das Altprojekt
 * mit der Übernahme alter chartEdits ohne Verlaufsschritt und zwei
 * Instanzen nebeneinander.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerCommandDirectives } from '../../js/core/command-directives.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import { setFields } from '../../js/core/model.js';
import mod from '../../js/modules/sample-size/viewmodel/viewmodel.js';
import { State } from '../../js/modules/sample-size/domain/model.js';

const ID = 'sample-size';
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
    registerCommandDirectives(Alpine);
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

/** Alle eingehängten Instanzen abbauen. */
function unmountAll() {
  while (mounted.length) {
    const old = mounted.pop();
    Alpine.destroyTree(old);
    old.remove();
  }
}

/**
 * Modul mit Fake-Diensten einhängen.
 * @param {object|null} model gespeicherter Zustand der Instanz
 * @param {{ inst?: string, chartEdits?: Record<string, any>, keep?: boolean }} [opts]
 */
async function mount(model, { inst = 'ss-1', chartEdits = {}, keep = false } = {}) {
  await prepare();
  if (!keep) unmountAll();
  const states = { [inst]: model };
  const handlers = [];
  const bus = {
    on: (n, fn) => handlers.push([n, fn]),
    off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
    emit: (n, p) => { for (const [a, f] of [...handlers]) if (a === n) f(p); },
  };
  /** @type {any[]} */
  const charts = [];
  const chartManager = {
    create: async (el, type, config) => { const c = { el, type, config: { ...config }, alive: true }; charts.push(c); return c; },
    update: (chart, config) => { Object.assign(chart.config, config); },
    destroy: (chart) => { if (chart) chart.alive = false; },
  };
  const context = {
    instanceId: inst,
    instances: { list: () => [], read: async () => ({}), interact: async () => ({ ok: false, results: [] }) },
    stateManager: {
      getModuleState: (id) => states[id] ?? null,
      setModuleState: (id, s) => { states[id] = s; },
      getProjectCycle: () => 'dmaic',
      get: (path) => (path === 'settings.confidenceLevel' ? 95 : path === 'settings.power' ? 80 : undefined),
      getChartEdits: (i, key) => chartEdits[i]?.[key] ?? null,
      setChartEdit: (i, key, k, v) => {
        const e = chartEdits[i]?.[key];
        if (!e) return;
        if (v === null) delete e[k]; else e[k] = v;
      },
    },
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
  const live = () => charts.filter((c) => c.alive && c.el.isConnected);
  return {
    states, charts, container, chartEdits, vm, live,
    q: (sel) => container.querySelector(sel),
    qa: (sel) => [...container.querySelectorAll(sel)],
  };
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const text = (el) => el.textContent.trim();
/** Ein Eingabefeld oder eine Auswahl wie der Nutzer ändern. */
function type(el, value) {
  if (!el) throw new Error('Feld fehlt');
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
const EMPTY = { varianceOne: { sigma0: null, sigmaAlt: null }, varianceTwo: { ratio: null }, mean: { delta: null, sigma: null } };
/** Gespeicherter Stand der neuen Form. */
const stored = (over = {}) => ({ ...new State({ cycle: 'dmaic', confidenceLevel: 95, power: 80 }).toJSON(), ...over });
/** Die Altform der Fixture `legacy-project.json`, Instanz (a). */
const LEGACY_A = {
  category: 'mean', testType: 'two', direction: 'less', alpha: 0.01, power: 0.9,
  sigma0: '2', sigmaAlt: '', ratio: '', delta: '0.5', sigma: '0.8',
};
/** Die Altform, Instanz (b). */
const LEGACY_B = {
  category: 'variance', testType: 'one', direction: 'two-sided', alpha: null, power: null,
  sigma0: '1.5', sigmaAlt: '0', ratio: 'abc', delta: '', sigma: '',
};

suite('sample-size: Viewmodel im Browser', () => {
  test('leer: Platzhalter, kein Ergebnis, Felder als Text mit Dezimalkomma, keine Bereichsattribute', async () => {
    const h = await mount(null);
    const vm = h.vm();
    assertEqual(vm.hasResult, false);
    assertEqual(vm.kpi, null);
    assertEqual(vm.powerChart, null);
    assertEqual(vm.read({ fields: ['result'] }).result, null);
    await until(() => h.q('[data-ref="results"]').style.display === 'none');
    assertEqual(h.q('[data-ref="results"]').style.display, 'none');
    assertTrue(h.q('[data-ref="placeholder"]').style.display !== 'none', 'Platzhalter verborgen');
    assertEqual(h.q('.dmike-kpi-strip'), null);
    assertEqual(h.charts.length, 0);
    for (const [r, v] of [['alpha', '0,05'], ['power', '0,8'], ['sigma0', ''], ['sigma-alt', '']]) {
      const el = h.q(`[data-ref="${r}"]`);
      assertEqual(el.type, 'text', `${r}: Eingabeart`);
      assertEqual(el.getAttribute('inputmode'), 'decimal', `${r}: inputmode`);
      assertEqual(el.value, v, `${r}: Wert`);
      assertTrue(!el.hasAttribute('min') && !el.hasAttribute('max') && !el.hasAttribute('step'), `${r}: Bereichsattribute`);
    }
    assertEqual(h.q('[data-ref="sigma0"]').getAttribute('placeholder'), tr('sigma0Placeholder'));
    assertEqual(h.q('[data-ref="ratio"]'), null);
    assertEqual(h.q('[data-ref="delta"]'), null);
    assertEqual(h.q('[data-ref="direction"]').value, 'two-sided');
    assertDeepEqual(plain(vm.directionOptions).map((o) => o.label), [`≠ ${tr('twoSided')}`, `> ${tr('greater')}`, `< ${tr('less')}`]);
    assertDeepEqual(h.qa('.smpsize__toggle-btn.btn--active').map((b) => b.dataset.cat ?? b.dataset.type), ['variance', 'one']);
  });

  test('Knöpfe und Felder schreiben ins Model; Varianten zeigen ihre Felder, Werte anderer bleiben', async () => {
    const h = await mount(null);
    const vm = h.vm();
    type(h.q('[data-ref="sigma0"]'), '2');
    type(h.q('[data-ref="sigma-alt"]'), '4');
    await settle();
    assertDeepEqual(plain(vm.model.effect.varianceOne), { sigma0: 2, sigmaAlt: 4 });
    await until(() => h.live().length === 1);
    assertTrue(vm.hasResult, 'kein Ergebnis');
    assertDeepEqual(h.qa('.dmike-kpi-value').map(text), [vm.kpi.n, '80%', '0,05', '4,000']);
    // Testtyp per Klick: Verhältnisfeld, σ-Felder weg, Werte bleiben gespeichert.
    h.q('[data-type="two"]').click();
    await until(() => h.q('[data-ref="ratio"]') !== null);
    assertEqual(vm.model.testType, 'two');
    assertEqual(h.q('[data-ref="sigma0"]'), null);
    assertEqual(vm.hasResult, false);
    assertDeepEqual(plain(vm.model.effect.varianceOne), { sigma0: 2, sigmaAlt: 4 });
    type(h.q('[data-ref="ratio"]'), '2,5');
    await settle();
    assertEqual(vm.model.effect.varianceTwo.ratio, 2.5);
    await until(() => h.qa('.dmike-kpi').length === 5);
    assertEqual(h.qa('.dmike-kpi').length, 5);
    assertEqual(text(h.qa('.dmike-kpi-label')[3]), tr('varianceRatio'));
    // Kategorie per Klick: Δ und σ.
    h.q('[data-cat="mean"]').click();
    await until(() => h.q('[data-ref="delta"]') !== null);
    assertEqual(vm.model.category, 'mean');
    assertDeepEqual(h.qa('.smpsize__toggle-btn.btn--active').map((b) => b.dataset.cat ?? b.dataset.type), ['mean', 'two']);
    type(h.q('[data-ref="direction"]'), 'greater');
    await settle();
    assertEqual(vm.model.direction, 'greater');
    // Zurück zu Varianz/2: der alte Verhältniswert steht wieder da.
    h.q('[data-cat="variance"]').click();
    await until(() => h.q('[data-ref="ratio"]') !== null);
    assertEqual(h.q('[data-ref="ratio"]').value, '2,5');
  });

  test('Ablehnung: 0, Negatives und Unlesbares in Effektfeldern, α/Power außerhalb des Bereichs', async () => {
    const h = await mount(stored({ effect: { ...EMPTY, varianceOne: { sigma0: 1, sigmaAlt: 2 } } }));
    const vm = h.vm();
    for (const raw of ['0', '-1', 'abc']) {
      type(h.q('[data-ref="sigma-alt"]'), raw);
      await settle();
      assertEqual(vm.model.effect.varianceOne.sigmaAlt, 2, `σ₁ ${raw} angenommen`);
    }
    for (const raw of ['0,9', '0', '0,00001']) {
      type(h.q('[data-ref="alpha"]'), raw);
      await settle();
      assertEqual(vm.model.alpha, 0.05, `α ${raw} angenommen`);
    }
    for (const raw of ['1,5', '0,3', '1']) {
      type(h.q('[data-ref="power"]'), raw);
      await settle();
      assertEqual(vm.model.power, 0.8, `Power ${raw} angenommen`);
    }
    type(h.q('[data-ref="alpha"]'), '0,1');
    await settle();
    assertEqual(vm.model.alpha, 0.1);
  });

  test('Ergebnis: Satz, Kennzahlen, Lab-Link, Power-Kurve mit Konfiguration der Altform', async () => {
    const h = await mount(stored({ category: 'mean', testType: 'two', effect: { ...EMPTY, mean: { delta: 0.5, sigma: 0.8 } } }));
    const vm = h.vm();
    await until(() => h.live().length === 1);
    assertEqual(text(h.q('.smpsize__summary strong')), `${tr('requiredN')} (${tr('perGroup')}): 42`);
    assertEqual(text(h.q('.smpsize__summary p')), tr('resultSummary', { n: '42', power: '80', alpha: '0,05' }));
    assertDeepEqual(h.qa('.dmike-kpi-value').map(text), ['42', '80%', '0,05', '0,625', '84']);
    assertDeepEqual(h.qa('.dmike-kpi-label').map((el) => el.getAttribute('data-help-key')), [
      'nRequired', 'power', 'alpha', 'effectValue', 'totalN',
    ].map((k) => `modules.${ID}.types.Result.${k}`));
    assertEqual(vm.algoId, 'two-sample-t-test');
    assertTrue(h.q('.smpsize__algo-link .dmike-algo-link') !== null, 'kein Lab-Link');
    const c = h.live()[0];
    assertEqual(c.type, 'scatter');
    assertTrue(c.el.closest('[data-ref="power-chart"]') !== null, 'Diagramm außerhalb der Zeichenfläche');
    assertEqual(c.config.xDec, 0);
    assertEqual(c.config.yDec, 0);
    assertEqual(c.config.title, tr('sectionCurve'));
    assertDeepEqual(c.config.series.map((s) => s.name), [tr('power'), 'n = 42']);
    const out = vm.read({ fields: ['result', 'activeParams'] });
    assertDeepEqual(plain(out.result), {
      nRequired: 42, totalN: 84, alpha: 0.05, power: 0.8, effectLabel: tr('cohensD'), effectValue: 0.625, algoId: 'two-sample-t-test',
    });
    assertDeepEqual(plain(out.activeParams), ['category', 'testType', 'direction', 'alpha', 'power', 'effect.mean.delta', 'effect.mean.sigma']);
  });

  test('Diagramm im x-if: ungültig → weg, wieder gültig → Editor-Einstellungen wieder darüber', async () => {
    const h = await mount(stored({ effect: { ...EMPTY, varianceOne: { sigma0: 2, sigmaAlt: 4 } }, powerCurveEdits: { title: 'Eigen' } }));
    const vm = h.vm();
    await until(() => h.live().length === 1);
    assertEqual(h.live()[0].config.title, 'Eigen');
    setFields(vm.model, { effect: { ...EMPTY, varianceOne: { sigma0: 2, sigmaAlt: null } } });
    await until(() => h.live().length === 0);
    assertEqual(h.live().length, 0);
    setFields(vm.model, { effect: { ...EMPTY, varianceOne: { sigma0: 2, sigmaAlt: 3 } } });
    await until(() => h.live().length === 1);
    assertEqual(h.live()[0].config.title, 'Eigen');
  });

  test('Schreiben von außen (instance.set) erscheint in Feldern und Ergebnis', async () => {
    const h = await mount(null);
    const vm = h.vm();
    setFields(vm.model, { category: 'mean', effect: { ...EMPTY, mean: { delta: 0.3, sigma: 0.5 } } });
    await until(() => h.q('[data-ref="delta"]') !== null && vm.hasResult);
    assertEqual(h.q('[data-ref="delta"]').value, '0,3');
    assertEqual(h.q('[data-ref="sigma"]').value, '0,5');
    await until(() => h.qa('.dmike-kpi-value').length === 4);
    assertEqual(text(h.qa('.dmike-kpi-value')[0]), '24');
  });

  test('Rückgängig/Wiederholen: Kategoriewechsel und Feldänderung je ein Schritt', async () => {
    const h = await mount(stored({ effect: { ...EMPTY, varianceOne: { sigma0: 2, sigmaAlt: 4 }, mean: { delta: 1, sigma: 1 } } }));
    const vm = h.vm();
    assertEqual(mod.historyCan('undo'), false);
    h.q('[data-cat="mean"]').click();
    await until(() => h.q('[data-ref="delta"]') !== null);
    assertTrue(mod.historyStep('undo'), 'kein Schritt zum Zurücknehmen');
    await until(() => h.q('[data-ref="sigma0"]') !== null);
    assertEqual(vm.model.category, 'variance');
    assertEqual(mod.historyCan('undo'), false, 'mehr als ein Schritt');
    assertTrue(mod.historyCan('redo'), 'kein Schritt zum Wiederholen');
    assertTrue(mod.historyStep('redo'), 'Wiederholen');
    await until(() => h.q('[data-ref="delta"]') !== null);
    assertEqual(vm.model.category, 'mean');
    type(h.q('[data-ref="delta"]'), '0,5');
    await settle();
    assertEqual(vm.model.effect.mean.delta, 0.5);
    assertTrue(mod.historyStep('undo'), 'Feldänderung kein Schritt');
    await settle();
    assertEqual(vm.model.effect.mean.delta, 1);
    assertEqual(h.q('[data-ref="delta"]').value, '1');
  });

  test('Altprojekt: Migration und alte chartEdits ohne Verlaufsschritt', async () => {
    const chartEdits = { 'ss-1': { scatter: { title: 'Legacy Power', bgColor: '#eef6ff' } } };
    const h = await mount(plain(LEGACY_A), { chartEdits });
    const vm = h.vm();
    assertEqual(vm.model.category, 'mean');
    assertEqual(vm.model.testType, 'two');
    assertEqual(vm.model.direction, 'less');
    assertEqual(vm.model.alpha, 0.01);
    assertEqual(vm.model.power, 0.9);
    assertDeepEqual(plain(vm.model.effect), { ...EMPTY, varianceOne: { sigma0: 2, sigmaAlt: null }, mean: { delta: 0.5, sigma: 0.8 } });
    await until(() => h.live().length === 1);
    assertDeepEqual(plain(vm.model.powerCurveEdits), { title: 'Legacy Power', bgColor: '#eef6ff' });
    assertEqual(h.live()[0].config.title, 'Legacy Power');
    assertEqual(Object.keys(h.chartEdits['ss-1'].scatter).length, 0, 'Alteintrag nicht gelöscht');
    assertDeepEqual(h.qa('.dmike-kpi-value').map(text), ['> 5.000', '90%', '0,01', '0,625', '> 10.000']);
    assertEqual(h.q('[data-ref="alpha"]').value, '0,01');
    assertEqual(mod.historyCan('undo'), false);
    const b = await mount(plain(LEGACY_B));
    assertEqual(b.vm().model.alpha, 0.05);
    assertEqual(b.vm().model.power, 0.8);
    assertEqual(b.q('[data-ref="sigma0"]').value, '1,5');
    assertEqual(b.q('[data-ref="sigma-alt"]').value, '');
    assertEqual(b.vm().hasResult, false);
    assertEqual(mod.historyCan('undo'), false);
  });

  test('zwei Instanzen: jede schreibt und zeigt nur ihr Model', async () => {
    const a = await mount(stored({ effect: { ...EMPTY, varianceOne: { sigma0: 2, sigmaAlt: 4 } } }), { inst: 'ss-a' });
    const b = await mount(null, { inst: 'ss-b', keep: true });
    b.q('[data-cat="mean"]').click();
    await until(() => b.q('[data-ref="delta"]') !== null);
    assertEqual(a.vm().model.category, 'variance');
    assertTrue(a.q('[data-ref="sigma0"]') !== null, 'Instanz a umgeschaltet');
    type(b.q('[data-ref="delta"]'), '1');
    await settle();
    assertEqual(a.vm().model.effect.mean.delta, null);
    assertEqual(b.vm().model.effect.mean.delta, 1);
    const radios = (h) => h.qa('[data-cat]').map((el) => el.getAttribute('aria-checked'));
    assertDeepEqual(radios(a), ['true', 'false']);
    assertDeepEqual(radios(b), ['false', 'true']);
    unmountAll();
  });
});
