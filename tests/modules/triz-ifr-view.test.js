/**
 * Ideales Endresultat (TRIZ): das Viewmodel im Browser (viewmodel/viewmodel.js)
 * mit dem echten Modul und der echten Vorlage. Prüft: Eingaben schreiben ins
 * Model, Rückgängig und Wiederholen, ids je Instanz (zwei Instanzen ohne
 * doppelte ids), den Hinweisknopf und das Altprojekt ohne Verlaufsschritt.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual, fakeChartManager } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import mod from '../../js/modules/triz-ifr/viewmodel/viewmodel.js';

const ID = 'triz-ifr';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
const FIELDS = ['system', 'usefulFunction', 'harmfulEffect', 'ifr1', 'ifr2', 'ifr3', 'obstacles'];
const ROLES = { system: 'system', usefulFunction: 'useful', harmfulEffect: 'harmful', ifr1: 'ifr1', ifr2: 'ifr2', ifr3: 'ifr3', obstacles: 'obstacles' };
/** @type {HTMLElement[]} */
const mounted = [];
let prepared = false;
let UI = null;

/** Text des Moduls; sonst der Schlüssel. */
function tr(key) {
  const v = UI?.[key];
  return typeof v === 'string' ? v : key;
}

async function prepare() {
  if (!prepared) {
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

/** Stand aus der Fixture `legacy-project.json` (gespeichert mit `_schema` '1.0'). */
const LEGACY = {
  _schema: { name: 'triz-ifr', version: '1.0' },
  system: 'Kühlmittelpumpe für Fräszentrum',
  usefulFunction: 'fördert Kühlschmierstoff an die Schneide',
  harmfulEffect: 'Späne & Öl verstopfen den Ansaugfilter <täglich>',
  ifr1: 'Die Pumpe hält ihren Filter von selbst frei — „ohne Wartung“.',
  ifr2: 'Es gibt keinen Filter, der verstopfen könnte.',
  ifr3: 'Der Kühlmittelstrom selbst spült die Späne aus dem "Sumpf".',
  obstacles: '• Späne sind länger als die Maschenweite\n• Öl & Emulsion trennen sich im Becken\n• Füllstand < Mindestmaß bei Schichtende',
};

/**
 * Eine Instanz einhängen (eigene Kopie des Moduls wie in der Registry).
 * @param {string} instanceId
 * @param {object|null} model gespeicherter Zustand
 * @param {{ keep?: boolean }} [opts] `keep`: vorher eingehängte Instanzen bleiben
 */
async function mount(instanceId, model, { keep = false } = {}) {
  await prepare();
  if (!keep) unmountAll();
  const states = { [instanceId]: model };
  /** @type {any[][]} */
  const notes = [];
  const handlers = [];
  const bus = {
    on: (n, fn) => handlers.push([n, fn]),
    off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
    emit: (n, p) => { for (const [a, f] of [...handlers]) if (a === n) f(p); },
  };
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
    i18n: { t: (k) => k, tf: () => tr, getLanguage: () => 'de' },
    eventBus: bus,
    chartManager: fakeChartManager(),
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
  return {
    inst, states, notes, container, q,
    vm: () => Alpine.$data(container.querySelector('[x-data]')),
    field: (name) => q(`[data-role="${ROLES[name]}"]`),
    /** Text in ein Feld tippen und das Feld verlassen. */
    type: async (name, value) => {
      const el = q(`[data-role="${ROLES[name]}"]`);
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
      return el;
    },
  };
}

suite('triz-ifr: Viewmodel im Browser', () => {
  test('jede Eingabe schreibt ihr Feld im Model und im gespeicherten Stand', async () => {
    const h = await mount('ifr-1', null);
    const vm = h.vm();
    // Einzeilige Eingaben verwerfen Zeilenumbrüche; die Textfelder behalten sie.
    const value = (name) => (h.field(name).tagName === 'TEXTAREA' ? ` Text für ${name}\nzweite Zeile` : ` Text für ${name} & <Größe>`);
    for (const name of FIELDS) {
      await h.type(name, value(name));
      assertEqual(vm.model[name], value(name), name);
      assertEqual(h.states['ifr-1'][name], value(name), `${name} gespeichert`);
    }
    assertDeepEqual(vm.read(), Object.fromEntries(FIELDS.map((n) => [n, value(n)])));
  });

  test('Abzeichen, Beschriftungen und Platzhalter kommen aus der Übersetzung', async () => {
    const h = await mount('ifr-1', null);
    assertDeepEqual([...h.container.querySelectorAll('.triz-ifr__level-num')].map((el) => el.textContent), [tr('ifr1Num'), tr('ifr2Num'), tr('ifr3Num')]);
    assertEqual(tr('ifr2Num'), 'IFR-2');
    assertEqual(h.field('system').placeholder, tr('systemPlaceholder'));
    assertEqual(h.field('obstacles').placeholder, tr('obstaclesPlaceholder'));
    const keys = [...h.container.querySelectorAll('[data-help-key]')].map((el) => el.getAttribute('data-help-key'));
    assertDeepEqual(keys, FIELDS.map((n) => `modules.triz-ifr.fields.${n}.help`));
  });

  test('Rückgängig nimmt eine Eingabe zurück, Wiederholen stellt sie her', async () => {
    const h = await mount('ifr-1', null);
    const vm = h.vm();
    assertEqual(h.inst.historyCan('undo'), false);
    await h.type('system', 'Bandförderer');
    assertTrue(h.inst.historyCan('undo'), 'kein Schritt nach der Eingabe');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig ohne Wirkung');
    await settle();
    assertEqual(vm.model.system, '');
    assertEqual(h.field('system').value, '');
    assertEqual(h.inst.historyCan('undo'), false);
    assertTrue(h.inst.historyCan('redo'), 'kein Schritt zum Wiederholen');
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen ohne Wirkung');
    await settle();
    assertEqual(vm.model.system, 'Bandförderer');
    assertEqual(h.field('system').value, 'Bandförderer');
  });

  test('zwei Instanzen: ids je Instanz, jede Beschriftung zeigt auf das eigene Feld', async () => {
    const a = await mount('ifr-a', null);
    const b = await mount('ifr-b', null, { keep: true });
    assertTrue(a.vm().fieldId('system') !== b.vm().fieldId('system'), 'fieldId gleich');
    const ids = [...document.querySelectorAll('.triz-ifr [id]')].map((el) => el.id);
    assertEqual(ids.length, 6);
    assertEqual(new Set(ids).size, ids.length, `doppelte ids: ${ids.join(', ')}`);
    for (const h of [a, b]) {
      for (const label of h.container.querySelectorAll('label[for]')) {
        const target = document.getElementById(label.htmlFor);
        assertTrue(!!target && h.container.contains(target), `${label.htmlFor} zeigt nicht ins eigene Modul`);
      }
    }
    await b.type('system', 'nur B');
    assertEqual(b.vm().model.system, 'nur B');
    assertEqual(a.vm().model.system, '');
    unmountAll();
  });

  test('Hinweisknopf meldet den übersetzten Hinweis als Info und ändert nichts', async () => {
    const h = await mount('ifr-1', null);
    h.q('[data-action="open-resources"]').click();
    await settle();
    assertDeepEqual(h.notes, [[tr('openResourcesHint'), 'info']]);
    assertEqual(h.inst.historyCan('undo'), false);
    assertEqual(h.vm().model.hasContent(), false);
  });

  test('Altprojekt: alle sieben Werte sichtbar, Laden ist kein Verlaufsschritt', async () => {
    const h = await mount('ifr-1', structuredClone(LEGACY));
    for (const name of FIELDS) assertEqual(h.field(name).value, LEGACY[name], name);
    assertEqual(h.inst.historyCan('undo'), false);
    const { _schema, ...fields } = LEGACY;
    assertDeepEqual(h.vm().read(), fields);
    unmountAll();
  });
});
