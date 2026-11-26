/**
 * Einheitenumrechner: das Viewmodel im Browser (viewmodel/viewmodel.js) mit
 * dem echten Modul und der echten Vorlage. Prüft: Vorgabe und Hilfe-Anker,
 * Größenart über die Knöpfe, die Auswahl „Eingang“ über das Kommando (die
 * Zieleinheit zieht in einem Schritt mit, Rückgängig zeigt beide Auswahlen),
 * Agent über das Model samt Ablehnung, Zahlen und Daten in der App-Sprache,
 * Zeitzonen über die Auswahlfelder, den Takt der Weltzeituhr (startet und
 * endet mit der Instanz), zwei Instanzen und das Altprojekt ohne
 * Verlaufsschritt.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerCommandDirectives } from '../../js/core/command-directives.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import mod from '../../js/modules/unit-converter/viewmodel/viewmodel.js';

const ID = 'unit-converter';
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
    if (!Alpine.version) Alpine.start();
    for (const lang of ['de', 'en']) {
      UI[lang] = await (await fetch(new URL(`../../js/modules/${ID}/resources/i18n/ui.${lang}.json`, import.meta.url), { cache: 'no-cache' })).json();
    }
    const css = new URL(`../../js/modules/${ID}/resources/style.css`, import.meta.url).href;
    if (![...document.styleSheets].some((sh) => sh.href === css)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = css;
      await new Promise((ok, fail) => { link.onload = ok; link.onerror = fail; document.head.append(link); });
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

/** Laufende Takte: `setInterval`/`clearInterval` mitzählen. */
const timers = new Set();
const origSet = globalThis.setInterval;
const origClear = globalThis.clearInterval;
function spyTimers() {
  timers.clear();
  globalThis.setInterval = /** @type {any} */ ((fn, ms, ...a) => { const h = origSet(fn, ms, ...a); timers.add(h); return h; });
  globalThis.clearInterval = /** @type {any} */ ((h) => { timers.delete(h); origClear(h); });
}
function unspyTimers() {
  globalThis.setInterval = origSet;
  globalThis.clearInterval = origClear;
}

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
  /** @param {string} ref @returns {HTMLSelectElement} */
  const sel = (ref) => /** @type {HTMLSelectElement} */ (q(`select[data-ref="${ref}"]`));
  const h = {
    inst, states, container, q, qa, vm, sel,
    text: (ref) => q(`[data-ref="${ref}"]`)?.textContent ?? null,
    activeCat: () => q('.module-unit-converter__cat-btn--active')?.getAttribute('data-cat') ?? null,
    units: () => ({ from: sel('fromUnit').value, to: sel('toUnit').value }),
    toOptions: () => [...sel('toUnit').options].map((o) => o.value),
    catBtn: (key) => /** @type {HTMLButtonElement} */ (q(`.module-unit-converter__cat-btn[data-cat="${key}"]`)),
    choose: async (ref, value) => {
      const el = sel(ref);
      el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      await settle();
    },
    type: async (ref, value) => {
      const el = /** @type {HTMLInputElement} */ (q(`input[data-ref="${ref}"]`));
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
    },
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

suite('unit-converter Viewmodel im Browser', () => {
  test('Vorgabe: Länge nm → µm, Strich, Hilfe-Anker an Beschriftungen und Knöpfen', async () => {
    LANG = 'de';
    const h = await mount('uc-1', null);
    await until(() => h.activeCat() === 'laenge');
    assertEqual(h.activeCat(), 'laenge');
    assertDeepEqual(h.units(), { from: 'nm', to: 'um' });
    assertEqual(h.text('resultVal'), '—');
    assertEqual(h.text('formulaText'), '—');
    assertEqual(h.qa('[data-ref="refBody"] tr').length, 7);
    assertEqual(h.qa('[data-ref="tzRefBody"] tr').length, 7);
    assertDeepEqual(helpKeys(h).sort(), [
      'actions.selectCategory.help', 'actions.swapTimezones.help', 'actions.swapUnits.help', 'actions.tzSetNow.help',
      'fields.fromUnit.help', 'fields.toUnit.help', 'fields.tzFrom.help', 'fields.tzTo.help',
      'types.ConversionResult.factor', 'types.ConversionResult.value',
      'types.TimezoneResult.date', 'types.TimezoneResult.diffHours', 'types.TimezoneResult.time',
    ]);
    assertEqual(h.inst.historyCan('undo'), false);
  });

  test('Größenart über die Knöpfe, ein Schritt', async () => {
    LANG = 'de';
    const h = await mount('uc-1', null);
    await h.click(h.catBtn('masse'));
    await until(() => h.activeCat() === 'masse');
    assertDeepEqual(h.units(), { from: 'mg', to: 'g' });
    assertEqual(h.text('catTitle'), 'Masse');
    assertTrue(await h.undo());
    await until(() => h.activeCat() === 'laenge');
    assertDeepEqual(h.units(), { from: 'nm', to: 'um' });
  });

  test('Eingang über das Kommando: die Zieleinheit zieht in einem Schritt mit, Rückgängig zeigt beide', async () => {
    LANG = 'de';
    const h = await mount('uc-1', null);
    await h.click(h.catBtn('laborwerte'));
    await until(() => h.units().from === 'mgdl_bz');
    await h.choose('fromUnit', 'proz_hb');
    await until(() => h.units().to === 'mmolmol_hb');
    assertDeepEqual(h.units(), { from: 'proz_hb', to: 'mmolmol_hb' });
    assertDeepEqual(h.toOptions(), ['proz_hb', 'mmolmol_hb', 'eag_mgdl', 'eag_mmoll']);
    assertTrue(await h.undo());
    await until(() => h.units().from === 'mgdl_bz');
    assertDeepEqual(h.units(), { from: 'mgdl_bz', to: 'mmoll_bz' });
    await h.redo();
    await until(() => h.units().from === 'proz_hb');
    assertDeepEqual(h.units(), { from: 'proz_hb', to: 'mmolmol_hb' });
  });

  test('Zieleinheit, Wert und Tauschen über die Oberfläche', async () => {
    LANG = 'de';
    const h = await mount('uc-1', null);
    await h.choose('fromUnit', 'm');
    await h.choose('toUnit', 'cm');
    await h.type('inputVal', '1');
    await until(() => h.text('resultVal') === '100');
    assertEqual(h.text('formulaText'), '1 m = 100 cm');
    await h.click(h.q('[data-action="swap"]'));
    await until(() => h.units().from === 'cm');
    assertDeepEqual(h.units(), { from: 'cm', to: 'm' });
    assertEqual(h.text('resultVal'), '0,01');
    await h.type('inputVal', 'abc');
    assertEqual(h.text('resultVal'), '—');
    const s = h.saved();
    assertEqual(s.inputVal, 'abc');
  });

  test('Agent über das Model: sichtbar, Ablehnung lässt die Anzeige stehen', async () => {
    LANG = 'de';
    const h = await mount('uc-1', null);
    const model = h.vm().model;
    model.selectCategory({ catKey: 'masse' });
    model.setFromUnit({ unitKey: 'kg' });
    model.toUnit = 'g';
    model.inputVal = '2,5';
    await until(() => h.text('resultVal') === '2.500');
    assertDeepEqual(h.units(), { from: 'kg', to: 'g' });
    let err = null;
    try { model.toUnit = 'cm'; } catch (e) { err = e; }
    assertEqual(err?.invariant, 'unitsValid');
    await settle();
    assertDeepEqual(h.units(), { from: 'kg', to: 'g' });
  });

  test('Zahlen und Daten in Englisch', async () => {
    LANG = 'en';
    const h = await mount('uc-1', { ...SCHEMA, activeCat: 'laenge', fromUnit: 'm', toUnit: 'in', inputVal: '1234.5', tzFrom: 1, tzTo: 0, tzTime: '23:30', tzDate: '2026-03-29' });
    await until(() => h.text('resultVal') === '48,602.3622');
    assertEqual(h.text('formulaText'), '1 m = 39.370079 in');
    assertEqual(h.text('tzResult'), '21:30');
    assertEqual(h.text('tzResultDate'), 'Sun, 03/29/2026');
    LANG = 'de';
  });

  test('Zeitzonen über die Auswahlfelder, Datumsgrenze, Rückgängig', async () => {
    LANG = 'de';
    const h = await mount('uc-1', { ...SCHEMA, tzTime: '01:00', tzDate: '2026-01-12' });
    await h.choose('tzTo', 17);
    await until(() => h.text('tzResult') === '19:00 Uhr');
    assertEqual(h.text('tzResultDate'), 'So., 11.01.2026');
    assertTrue(h.text('tzDiff').startsWith('-6h'));
    assertEqual(h.saved().tzTo, 17);
    await h.click(h.q('[data-action="tz-swap"]'));
    await until(() => h.sel('tzFrom').value === '17');
    assertEqual(h.sel('tzTo').value, '1');
    assertTrue(await h.undo());
    await until(() => h.sel('tzFrom').value === '1');
    assertEqual(h.sel('tzTo').value, '17');
  });

  test('Weltzeituhr: ein Takt je Instanz, endet mit der Instanz', async () => {
    LANG = 'de';
    unmountAll();
    spyTimers();
    try {
      await mount('uc-1', null);
      await mount('uc-2', null, { keep: true });
      assertEqual(timers.size, 2);
      unmountAll();
      await settle();
      assertEqual(timers.size, 0);
    } finally { unspyTimers(); }
  });

  test('zwei Instanzen: eigene ids, eigene Zustände', async () => {
    LANG = 'de';
    const a = await mount('uc-a', null);
    const b = await mount('uc-b', null, { keep: true });
    assertTrue(a.sel('fromUnit').id !== b.sel('fromUnit').id);
    await a.click(a.catBtn('druck'));
    await until(() => a.activeCat() === 'druck');
    assertEqual(b.activeCat(), 'laenge');
  });

  test('Altprojekt ohne _schema: kein Verlaufsschritt, Werte sichtbar', async () => {
    LANG = 'de';
    const h = await mount('uc-1', { activeCat: 'masse', fromUnit: 'kg', toUnit: 'g', inputVal: '2,5', tzFrom: '5', tzTo: '13', tzTime: '08:15', tzDate: '2026-03-02' });
    await until(() => h.activeCat() === 'masse');
    assertEqual(h.text('resultVal'), '2.500');
    assertEqual(h.sel('tzFrom').value, '5');
    assertEqual(h.sel('tzTo').value, '13');
    assertEqual(h.inst.historyCan('undo'), false);
  });
});
