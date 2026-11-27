/**
 * DoE-Berater: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem
 * echten Modul und der echten Vorlage. Prüft: Vorgabe mit Katalog und
 * Hilfe-Ankern, Reiter per Klick und Pfeiltaste (je ein Verlaufsschritt),
 * Antwort → Frage und Spur, Zurück und Neu starten, Ergebniskarte und
 * „kein DoE“, Agent über das Model samt Ablehnung, Rückgängig/Wiederholen,
 * Sprachwechsel, zwei Instanzen und den Altstand ohne Verlaufsschritt.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerCommandDirectives } from '../../js/core/command-directives.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerTablistDirective } from '../../js/core/tablist.js';
import mod from '../../js/modules/doe-advisor/viewmodel/viewmodel.js';

const ID = 'doe-advisor';
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
/** @type {Record<string, any>} */
const UI = {};
let LANG = 'de';

/** Text des Moduls unter einem Punktpfad mit `{name}`; sonst der Pfad. */
function trp(path, params = {}) {
  const v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), UI[LANG]);
  return typeof v === 'string' ? v.replace(/\{(\w+)\}/g, (_, k) => String(params[k])) : path;
}

async function prepare() {
  if (!prepared) {
    registerCommandDirectives(Alpine);
    registerFieldDirective(Alpine, { i18n: { t: (k) => k, getLanguage: () => LANG } });
    registerTablistDirective(Alpine);
    if (!Alpine.version) Alpine.start();
    for (const lang of ['de', 'en']) {
      UI[lang] = await (await fetch(new URL(`../../js/modules/${ID}/resources/i18n/ui.${lang}.json`, import.meta.url), { cache: 'no-cache' })).json();
    }
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

const plain = (v) => JSON.parse(JSON.stringify(v));

/**
 * Eine Instanz einhängen (eigene Kopie des Moduls wie in der Registry).
 * @param {string} instanceId @param {object|null} model gespeicherter Zustand
 * @param {{ keep?: boolean }} [opts]
 */
async function mount(instanceId, model, { keep = false } = {}) {
  await prepare();
  if (!keep) unmountAll();
  const states = { [instanceId]: model };
  const handlers = [];
  const context = {
    instanceId,
    instances: { list: () => [], read: async () => ({}), interact: async () => ({ ok: false, results: [] }) },
    stateManager: {
      getModuleState: (id) => states[id] ?? null,
      setModuleState: (id, s) => { states[id] = s; },
      getProjectCycle: () => 'dmaic',
      get: () => undefined,
      getChartEdits: () => null,
      setChartEdit: () => {},
    },
    i18n: { t: (k) => k, tf: () => (k, p) => trp(k, p), getLanguage: () => LANG },
    eventBus: {
      on: (n, fn) => handlers.push([n, fn]),
      off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
      emit: (n, p) => { for (const [a, f] of [...handlers]) if (a === n) f(p); },
    },
    chartManager: { create: async () => ({}), update: () => {}, destroy: () => {} },
    notify: () => {},
    dialog: { confirm: async () => true, show: () => ({ close() {}, setTitle() {} }) },
    theme: 'light',
    language: LANG,
  };
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container);
  const inst = { ...mod };
  await inst.init(container, context);
  await settle();
  const q = (sel) => container.querySelector(sel);
  const qa = (sel) => [...container.querySelectorAll(sel)];
  const vm = () => Alpine.$data(container.querySelector('[x-data]'));
  /** @param {string} t @returns {HTMLButtonElement} */
  const tab = (t) => /** @type {HTMLButtonElement} */ (q(`[role="tab"][data-tab="${t}"]`));
  const h = {
    inst, states, container, q, qa, vm, tab,
    activeTab: () => q('[role="tab"][aria-selected="true"]')?.getAttribute('data-tab') ?? null,
    options: () => qa('.doe-advisor__option').map((b) => b.getAttribute('data-option')),
    option: (o) => /** @type {HTMLButtonElement} */ (q(`.doe-advisor__option[data-option="${o}"]`)),
    question: () => q('.doe-advisor__wizard-question-text')?.textContent?.trim() ?? null,
    trail: () => qa('.doe-advisor__wizard-trail-item').map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
    stepLabel: () => q('.doe-advisor__wizard-step-label')?.textContent?.trim() ?? null,
    resultId: () => q('.doe-advisor__result')?.getAttribute('data-design-id') ?? null,
    resultTitle: () => q('.doe-advisor__result-title')?.textContent?.trim() ?? null,
    back: () => /** @type {HTMLButtonElement|null} */ (q('.doe-advisor__wizard-back')),
    restart: () => /** @type {HTMLButtonElement} */ (q('.doe-advisor__wizard-restart')),
    click: async (el) => { el.click(); await settle(); },
    undo: async () => { const ok = h.inst.historyStep('undo'); await settle(); return ok; },
    redo: async () => { const ok = h.inst.historyStep('redo'); await settle(); return ok; },
    saved: () => plain(states[instanceId]),
  };
  return h;
}

/** Die Hilfeschlüssel unter der Wurzel (ohne leere), gekürzt um das Modulpräfix. */
const helpKeys = (h) => h.qa('[data-help-key]').map((el) => el.getAttribute('data-help-key')).filter(Boolean)
  .map((k) => k.replace(`modules.${ID}.`, ''));

const SCHEMA = { _schema: { name: ID, version: '1.0' } };

suite('doe-advisor Viewmodel im Browser', () => {
  test('Vorgabe: Übersicht mit 13 Plänen und 5 Phasen, Hilfe-Anker, kein Verlaufsschritt', async () => {
    LANG = 'de';
    const h = await mount('da-1', null);
    await until(() => h.activeTab() === 'overview');
    assertEqual(h.qa('.doe-advisor__table').length, 3);
    assertEqual(h.qa('.doe-advisor__row').length, 13);
    assertEqual(h.qa('.doe-advisor__table--phase tbody tr').length, 5);
    assertEqual(h.qa('.doe-advisor__table--ccd tbody tr').length, 10);
    assertEqual(h.tab('overview').classList.contains('dmike-tab--active'), true);
    assertEqual(h.tab('overview').textContent.trim(), 'Übersicht');
    assertDeepEqual(helpKeys(h).sort(), ['actions.answer.help', 'actions.restart.help', 'fields.tab.help']);
    assertEqual(h.options().length, 4);
    assertTrue(h.options().every((o) => h.option(o).getAttribute('data-help-key') === ''));
    assertEqual(h.inst.historyCan('undo'), false);
  });

  test('Reiter per Klick und Pfeiltaste: je ein Schritt, Rückgängig zurück', async () => {
    LANG = 'de';
    const h = await mount('da-1', null);
    await h.click(h.tab('wizard'));
    await until(() => h.activeTab() === 'wizard');
    assertEqual(h.saved().tab, 'wizard');
    h.tab('wizard').focus();
    h.tab('wizard').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    assertEqual(document.activeElement, h.tab('ccd'));
    await h.click(/** @type {HTMLElement} */ (document.activeElement));
    await until(() => h.activeTab() === 'ccd');
    assertTrue(await h.undo());
    await until(() => h.activeTab() === 'wizard');
    assertTrue(await h.undo());
    await until(() => h.activeTab() === 'overview');
    assertTrue(await h.redo());
    await until(() => h.activeTab() === 'wizard');
  });

  test('Antwort → nächste Frage und Spur; Zurück und Neu starten', async () => {
    LANG = 'de';
    const h = await mount('da-1', null);
    await h.click(h.tab('wizard'));
    assertEqual(h.back(), null);
    assertEqual(h.stepLabel(), 'Schritt 1 von ca. 4');
    await h.click(h.option('improve'));
    await until(() => h.options().length === 5);
    assertEqual(h.question(), UI.de.wizard.goal.question);
    assertDeepEqual(h.trail(), [`${UI.de.wizard.phase.short}: ${UI.de.wizard.phase.options.improve.label}`]);
    assertTrue(h.back() !== null);
    assertEqual(h.back()?.getAttribute('data-help-key'), `modules.${ID}.actions.back.help`);
    await h.click(h.option('optimization'));
    await h.click(h.option('hard'));
    await until(() => h.options().length === 3);
    assertEqual(h.stepLabel(), 'Schritt 4 von ca. 5');
    await h.click(/** @type {HTMLButtonElement} */ (h.back()));
    await until(() => h.options().length === 2);
    assertDeepEqual(h.saved().history, ['phase', 'goal']);
    await h.click(h.restart());
    await until(() => h.options().length === 4);
    assertDeepEqual(h.trail(), []);
    assertEqual(h.back(), null);
  });

  test('Ergebniskarte: Empfehlung mit Ankern am Text, „kein DoE“ ohne Versuchsplan', async () => {
    LANG = 'de';
    const h = await mount('da-1', null);
    await h.click(h.tab('wizard'));
    for (const o of ['improve', 'optimization', 'hard', 'forbidden']) await h.click(h.option(o));
    await until(() => h.resultId() === 'box-behnken');
    assertEqual(h.resultTitle(), UI.de.designs['box-behnken'].name);
    assertEqual(h.stepLabel(), UI.de.wizardResultLabel);
    assertDeepEqual(h.options(), []);
    const keys = helpKeys(h);
    for (const k of ['name', 'factors', 'levels', 'effort']) assertTrue(keys.includes(`types.Recommendation.${k}`), k);
    assertEqual(h.q('.doe-advisor__result-title span')?.getAttribute('data-help-key'), `modules.${ID}.types.Recommendation.name`);
    await h.click(h.restart());
    await h.click(h.option('define-measure'));
    await until(() => h.q('.doe-advisor__result--none') !== null);
    assertEqual(h.resultId(), null);
    assertTrue(h.back() !== null);
  });

  test('Agent über das Model: sichtbar, Ablehnung lässt die Anzeige stehen; Rückgängig nimmt die Antwort samt Spur', async () => {
    LANG = 'de';
    const h = await mount('da-1', null);
    await h.click(h.tab('wizard'));
    const model = h.vm().model;
    assertEqual(model.answer({ opt: 'improve' }), 'goal');
    await until(() => h.options().length === 5);
    assertEqual(model.answer({ opt: 'mixture' }), 'result:mixture');
    await until(() => h.resultId() === 'mixture');
    let err = null;
    try { model.answer({ opt: 'improve' }); } catch (e) { err = e; }
    assertEqual(err?.hintKey, 'hints.noOpenQuestion');
    await settle();
    assertEqual(h.resultId(), 'mixture');
    assertTrue(await h.undo());
    await until(() => h.options().length === 5);
    assertDeepEqual(h.saved().answers, { phase: 'improve' });
    assertTrue(await h.redo());
    await until(() => h.resultId() === 'mixture');
    assertEqual(h.activeTab(), 'wizard');
    const r = plain(h.vm().read());
    assertTrue(!Object.hasOwn(r, 'tab'), 'read() mit tab');
    assertEqual(r.recommendation.name, UI.de.designs.mixture.name);
  });

  test('Neu starten auf frischem Stand: kein Verlaufsschritt', async () => {
    LANG = 'de';
    const h = await mount('da-1', null);
    await h.click(h.tab('wizard'));
    assertTrue(await h.undo());
    await until(() => h.activeTab() === 'overview');
    await h.click(h.tab('wizard'));
    await h.click(h.restart());
    assertTrue(await h.undo());
    await until(() => h.activeTab() === 'overview');
    assertEqual(h.inst.historyCan('undo'), false);
  });

  test('Sprache en: Frage und Empfehlung übersetzt', async () => {
    LANG = 'en';
    try {
      const h = await mount('da-1', { ...SCHEMA, tab: 'wizard', currentStep: 'result:dsd', answers: { phase: 'analyze', goal: 'screening', screeningCurvature: 'yes' }, history: ['phase', 'goal', 'screening-curvature'] });
      await until(() => h.resultId() === 'dsd');
      assertEqual(h.resultTitle(), UI.en.designs.dsd.name);
      assertEqual(h.tab('wizard').textContent.trim(), 'Advisor');
      assertEqual(plain(h.vm().read()).recommendation.effort, UI.en.designs.dsd.effort);
    } finally { LANG = 'de'; }
  });

  test('zwei Instanzen: eigene Zustände', async () => {
    LANG = 'de';
    const a = await mount('da-a', null);
    const b = await mount('da-b', null, { keep: true });
    await a.click(a.tab('wizard'));
    await a.click(a.option('control'));
    await until(() => a.resultId() === 'evop');
    assertEqual(b.activeTab(), 'overview');
    assertEqual(b.saved()?.currentStep ?? 'phase', 'phase');
  });

  test('Altstand 1.0 (Task 0, Instanz a): kein Verlaufsschritt, Werte sichtbar', async () => {
    LANG = 'de';
    const h = await mount('da-1', { ...SCHEMA, tab: 'wizard', currentStep: 'corners', answers: { phase: 'improve', goal: 'optimization', limits: 'hard' }, history: ['phase', 'goal', 'limits'] });
    await until(() => h.options().length === 3);
    assertEqual(h.activeTab(), 'wizard');
    assertDeepEqual(h.options(), ['allowed', 'forbidden', 'constrained']);
    assertEqual(h.trail().length, 3);
    assertEqual(h.inst.historyCan('undo'), false);
  });

  test('unstimmiger Altstand ohne _schema wird normalisiert geladen, ohne Verlaufsschritt', async () => {
    LANG = 'de';
    const h = await mount('da-1', { tab: 'wizard', currentStep: 'result', answers: { 'factor-count': '3' }, history: ['intro', 'factor-count'], result: 'x' });
    await until(() => h.options().length === 4);
    assertEqual(h.activeTab(), 'wizard');
    assertDeepEqual(h.trail(), []);
    assertEqual(h.inst.historyCan('undo'), false);
  });
});
