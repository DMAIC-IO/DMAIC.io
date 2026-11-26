/**
 * Taschenrechner: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem
 * echten Modul und der echten Vorlage. Prüft: Leerzustand und Hilfe-Anker,
 * Tasten → Anzeige, Agent (Kommando am Model) → Anzeige, Rückgängig →
 * Rückfall auf die Anzeige beim Einhängen, Winkeleinheit als Knopfgruppe,
 * Grenzen über das Feld (Dezimalkomma), Zahlen in der App-Sprache, die
 * Tastatur (nur sichtbare Instanz, nicht in Feldern, nicht mit Strg/Alt) und
 * das Altprojekt ohne Verlaufsschritt.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerCommandDirectives } from '../../js/core/command-directives.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerTablistDirective } from '../../js/core/tablist.js';
import mod from '../../js/modules/calculator/viewmodel/viewmodel.js';
import { State } from '../../js/modules/calculator/domain/model.js';

const ID = 'calculator';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
/** Wartet, bis `ok()` gilt; höchstens zwei Sekunden. @param {() => boolean} ok */
async function until(ok) {
  for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
}
/** @type {HTMLElement[]} */
const mounted = [];
/** Sprache der Instanzen. */
let lang = 'de';
let prepared = false;
let UI = null;

/** Text des Moduls unter einem Punktpfad; sonst der Pfad. */
function tr(path) {
  const v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), UI);
  return typeof v === 'string' ? v : path;
}
/** Übersetzer der Tests: Modultext mit `{n}`. @param {string} path @param {object} [params] */
function trp(path, params = {}) {
  return tr(path).replace(/\{(\w+)\}/g, (_, k) => String(params[k]));
}

async function prepare() {
  if (!prepared) {
    registerCommandDirectives(Alpine);
    registerFieldDirective(Alpine, { i18n: { t: (k) => k, getLanguage: () => 'de' } });
    registerTablistDirective(Alpine);
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


/**
 * Eine Instanz einhängen (eigene Kopie des Moduls wie in der Registry).
 * @param {string} instanceId
 * @param {object|null} model gespeicherter Zustand
 * @param {{ keep?: boolean, confirm?: boolean, hidden?: boolean }} [opts]
 */
async function mount(instanceId, model, { keep = false, confirm = true, hidden = false } = {}) {
  await prepare();
  if (!keep) unmountAll();
  const states = { [instanceId]: model };
  /** @type {any[][]} */
  const notes = [];
  /** @type {any[]} */
  const confirms = [];
  const handlers = [];
  /** @type {string[]} */
  const commands = [];
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
    i18n: { t: (k) => k, tf: () => (k, p) => trp(k, p), getLanguage: () => lang },
    eventBus: {
      on: (n, fn) => handlers.push([n, fn]),
      off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
      emit: (n, p) => {
        if (n === 'command:executed') commands.push(p.command);
        for (const [a, f] of [...handlers]) if (a === n) f(p);
      },
    },
    chartManager: { create: async () => ({}), update: () => {}, destroy: () => {} },
    notify: (...args) => { notes.push(args); },
    dialog: { confirm: async (o) => { confirms.push(o); return confirm; }, show: () => ({ close() {}, setTitle() {} }) },
    theme: 'light',
    language: 'de',
  };
  // Die Tastatur gilt nur im Arbeitsbereich der App.
  const host = document.createElement('div');
  host.className = 'app-workspace';
  const container = document.createElement('div');
  if (hidden) container.style.display = 'none';
  host.append(container);
  document.body.append(host);
  mounted.push(host);
  const inst = { ...mod };
  await inst.init(container, context);
  await settle();
  const q = (sel) => container.querySelector(sel);
  const qa = (sel) => [...container.querySelectorAll(sel)];
  const vm = () => Alpine.$data(container.querySelector('[x-data]'));
  const h = {
    inst, states, notes, commands, container, q, qa, vm, context,
    tab: (m) => /** @type {HTMLButtonElement} */ (q(`[role="tab"][data-tab="${m}"]`)),
    activeTab: () => q('[role="tab"].dmike-tab--active')?.getAttribute('data-tab') ?? null,
    top: () => q('[data-ref="expr"]')?.textContent ?? null,
    result: () => q('[data-ref="display"]')?.textContent.trim() ?? null,
    /** Sichtbare Taste nach data-text/data-fn/data-action. @param {string} id */
    key: (id) => /** @type {HTMLButtonElement} */ (qa(`[data-text="${id}"], [data-fn="${id}"], [data-action="${id}"]`).find((el) => el.closest('[data-panel]') === null || !el.closest('.module-calculator__panel--hidden'))),
    press: async (...ids) => { for (const id of ids) { h.key(id).click(); await settle(); } },
    values: (ref) => qa(`[data-ref="${ref}"] .module-calculator__val`).map((el) => el.textContent),
    saved: () => plain(states[instanceId]),
    /** Taste am Fenster, ausgelöst am fokussierten Element. */
    windowKey: async (key, init = {}) => {
      const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
      (document.activeElement ?? document.body).dispatchEvent(e);
      await settle();
      return e.defaultPrevented;
    },
    undo: async () => { const ok = h.inst.historyStep('undo'); await settle(); return ok; },
    redo: async () => { const ok = h.inst.historyStep('redo'); await settle(); return ok; },
  };
  return h;
}

const plain = (v) => JSON.parse(JSON.stringify(v));
/** Altstand ohne `_schema` wie das Golden-Fixture. */
const LEGACY = {
  mode: 'ss', expression: '(12.4+13.1+11.8)/3', lastResult: 12.433333333333334, memory: 0, angleMode: 'DEG',
  dataset: [12.4, 13.1, 11.8], ssDataset: [12.4, 13.1, 11.8, 14.2], lsl: '10', usl: '13.5',
};

suite('calculator Viewmodel — Leerzustand und Anker', () => {
  test('Anzeige 0, Reiter Wissenschaftlich, Anker der Aktionstasten', async () => {
    const h = await mount('c1', null);
    assertEqual(h.result(), '0');
    assertEqual(h.top(), '');
    assertEqual(h.activeTab(), 'sci');
    const keys = h.qa('[data-help-key]').map((el) => el.getAttribute('data-help-key')).filter(Boolean);
    for (const k of ['actions.switchMode.help', 'fields.angleMode.help', 'actions.memStore.help', 'actions.calculate.help',
      'actions.addData.help', 'actions.removeLastSS.help', 'types.StatKey.mean', 'types.CapabilityKey.lcl', 'fields.dataset.help']) {
      assertTrue(keys.includes(`modules.calculator.${k}`), k);
    }
    assertEqual(h.inst.historyCan('undo'), false);
  });
});

suite('calculator Viewmodel — Tasten, Agent, Rückgängig', () => {
  test('Tasten rechnen, Zeile darüber zeigt den Ausdruck', async () => {
    const h = await mount('c1', null);
    await h.press('1', '2', '+', '3', 'calculate');
    assertEqual(h.result(), '15');
    assertEqual(h.top(), '12+3 =');
    await h.press('×', '2', 'calculate');
    assertEqual(h.result(), '30');
    assertEqual(h.saved().lastResult, 30);
  });
  test('Agent über das Model: Anzeige folgt', async () => {
    const h = await mount('c1', null);
    const m = h.vm().model;
    m.switchMode({ m: 'stats' });
    m.addDataValue({ value: 2.5 });
    m.addDataValue({ value: 3 });
    await until(() => h.values('data-display').length === 2);
    assertDeepEqual(h.values('data-display'), ['2,5', '3']);
    m.calcStat({ type: 'mean' });
    await until(() => h.result() === '2,75');
    assertEqual(h.result(), '2,75');
    assertEqual(h.top(), 'x̄');
    assertEqual(h.activeTab(), 'stats');
  });
  test('Rückgängig nach dem Rechnen zeigt den alten Ausdruck, Wiederholen den Stand', async () => {
    const h = await mount('c1', null);
    await h.press('2', '+', '3', 'calculate');
    assertEqual(h.result(), '5');
    assertTrue(await h.undo(), 'Rückgängig ohne Wirkung');
    await until(() => h.result() === '2+3');
    assertEqual(h.result(), '2+3');
    assertEqual(h.top(), '');
    assertTrue(await h.redo(), 'Wiederholen ohne Wirkung');
    await until(() => h.saved().lastResult === 5);
    assertEqual(h.result(), '5');
  });
  test('Klick auf den aktiven Reiter behält die Eingabe, ohne Verlaufsschritt', async () => {
    const h = await mount('c1', null);
    await h.press('4');
    const steps = h.inst.historyCan('undo');
    h.tab('sci').click();
    await settle();
    assertEqual(h.result(), '4');
    assertEqual(steps, true);
    h.tab('stats').click();
    await until(() => h.activeTab() === 'stats');
    assertEqual(h.result(), '0');
    assertEqual(h.saved().expression, '');
  });
  test('Fehler rot, Hinweis ohne Fehlerfarbe, Entfernt', async () => {
    const h = await mount('c1', null);
    await h.press('(', 'calculate');
    assertEqual(h.result(), 'Fehler');
    assertTrue(h.q('.module-calculator__result--error') !== null);
    h.vm().model.switchMode({ m: 'stats' });
    h.vm().model.addDataValue({ value: 1 });
    await settle();
    h.q('[data-stat="stdS"]').click();
    await until(() => h.result() === 'n ≥ 2 nötig');
    assertEqual(h.top(), 's');
    assertEqual(h.q('.module-calculator__result--error'), null);
    await h.press('remove-last');
    assertEqual(h.result(), 'Entfernt');
    assertDeepEqual(h.saved().dataset, []);
  });
  test('DEG/RAD als Knopfgruppe, ein Schritt', async () => {
    const h = await mount('c1', null);
    const btn = h.key('toggle-angle');
    assertEqual(btn.getAttribute('aria-label'), 'Winkeleinheit: DEG, wechseln');
    await h.press('toggle-angle');
    await until(() => h.saved().angleMode === 'RAD');
    assertEqual(btn.getAttribute('aria-label'), 'Winkeleinheit: RAD, wechseln');
    assertEqual(h.q('[data-ref="angle-mode"]').textContent, 'RAD');
    assertTrue(await h.undo());
    await until(() => h.saved().angleMode === 'DEG');
    assertEqual(h.saved().angleMode, 'DEG');
  });
  test('Grenzen über das Feld mit Dezimalkomma', async () => {
    const h = await mount('c1', null);
    h.tab('sixsigma').click();
    await until(() => h.activeTab() === 'sixsigma');
    const el = /** @type {HTMLInputElement} */ (h.q('[data-ref="lsl"]'));
    el.value = '5,5';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => h.saved().lsl === 5.5);
    assertEqual(h.saved().lsl, 5.5);
    assertEqual(el.getAttribute('type'), 'text');
  });
});

suite('calculator Viewmodel — Tastatur', () => {
  test('Zeichen, Enter, Backspace, Escape in der sichtbaren Instanz', async () => {
    const h = await mount('c1', null);
    for (const k of ['6', '*', '7']) await h.windowKey(k);
    assertEqual(h.result(), '6×7');
    assertEqual(await h.windowKey('Enter'), true);
    assertEqual(h.result(), '42');
    for (const k of ['1', '2']) await h.windowKey(k);
    assertEqual(await h.windowKey('Backspace'), true);
    assertEqual(h.result(), '1');
    await h.windowKey('Escape');
    assertEqual(h.result(), '0');
  });
  test('nicht mit Strg/Alt/Meta, nicht in Textfeldern', async () => {
    const h = await mount('c1', null);
    await h.windowKey('1', { ctrlKey: true });
    await h.windowKey('2', { altKey: true });
    await h.windowKey('3', { metaKey: true });
    assertEqual(h.saved()?.expression ?? '', '');
    const ta = document.createElement('textarea');
    document.body.append(ta);
    ta.focus();
    await h.windowKey('9');
    ta.remove();
    assertEqual(h.saved()?.expression ?? '', '');
  });
  test('nicht nach einem anderen Empfänger, nicht in einem Dialog', async () => {
    const h = await mount('c1', null);
    const stop = (e) => e.preventDefault();
    document.body.addEventListener('keydown', stop, { capture: true });
    try {
      await h.windowKey('4');
    } finally {
      document.body.removeEventListener('keydown', stop, { capture: true });
    }
    assertEqual(h.saved()?.expression ?? '', '');
    for (const attrs of [{ role: 'dialog' }, { 'aria-modal': 'true' }]) {
      const dlg = document.createElement('div');
      for (const [k, v] of Object.entries(attrs)) dlg.setAttribute(k, v);
      const btn = document.createElement('button');
      dlg.append(btn);
      document.body.append(dlg);
      btn.focus();
      await h.windowKey('8');
      await h.windowKey('Enter');
      dlg.remove();
    }
    assertEqual(h.saved()?.expression ?? '', '');
    await h.windowKey('5');
    assertEqual(h.saved().expression, '5');
  });
  test('zwei Instanzen: nur die sichtbare tippt', async () => {
    const a = await mount('ca', null);
    const b = await mount('cb', null, { keep: true, hidden: true });
    await a.windowKey('5');
    assertEqual(a.saved().expression, '5');
    assertEqual(b.saved()?.expression ?? '', '');
  });
  test('Enter im Statistikbereich übernimmt den Wert', async () => {
    const h = await mount('c1', null);
    h.tab('stats').click();
    await until(() => h.activeTab() === 'stats');
    for (const k of ['1', '.', '5', 'Enter']) await h.windowKey(k);
    assertDeepEqual(h.saved().dataset, [1.5]);
    assertEqual(h.result(), '1,5');
    assertTrue(h.q('[data-ref="display"] .icon')?.getAttribute('data-icon') === 'status.ok');
  });
});

suite('calculator Viewmodel — Altprojekt und Sprache', () => {
  test('Altstand: Prozessbereich, Ausdruck, Grenzen, kein Verlaufsschritt', async () => {
    const h = await mount('c1', LEGACY);
    assertEqual(h.activeTab(), 'sixsigma');
    assertEqual(h.result(), '(12.4+13.1+11.8)/3');
    assertDeepEqual(h.values('ss-data-display'), ['12,4', '13,1', '11,8', '14,2']);
    assertEqual(/** @type {HTMLInputElement} */ (h.q('[data-ref="lsl"]')).value, '10');
    assertEqual(/** @type {HTMLInputElement} */ (h.q('[data-ref="usl"]')).value, '13,5');
    assertEqual(h.inst.historyCan('undo'), false);
  });
  test('Anzeige übersteht das Neueinhängen, nicht das Entfernen der Instanz', async () => {
    const h = await mount('c1', null);
    await h.press('2', '+', '3', 'calculate');
    assertEqual(h.top(), '2+3 =');
    const again = await mount('c1', h.saved());
    assertEqual(again.top(), '2+3 =');
    assertEqual(again.result(), '5');
    again.context.eventBus.emit('module:removed', { instanceId: 'c1' });
    const fresh = await mount('c1', again.saved());
    assertEqual(fresh.top(), '');
    assertEqual(fresh.result(), '5');
  });
  test('Zahlen in Englisch mit Punkt', async () => {
    lang = 'en';
    try {
      const h = await mount('c1', { ...LEGACY, mode: 'stats' });
      assertDeepEqual(h.values('data-display'), ['12.4', '13.1', '11.8']);
      assertEqual(h.q('[data-ref="data-count"]').textContent, 'n = 3');
    } finally {
      lang = 'de';
    }
  });
});
