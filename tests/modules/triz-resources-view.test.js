/**
 * Ressourcen-Checkliste (TRIZ): das Viewmodel im Browser
 * (viewmodel/viewmodel.js) mit dem echten Modul und der echten Vorlage.
 * Prüft: Raster 6 × 3 in Reihenfolge, System und Notizen schreiben ins
 * Model, der Statusknopf schaltet über das Kommando weiter (ein
 * Verlaufsschritt je Klick), Rückgängig und Wiederholen, ids je Instanz und
 * das Altprojekt ohne Verlaufsschritt.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual, fakeChartManager } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerCommandDirectives } from '../../js/core/command-directives.js';
import mod from '../../js/modules/triz-resources/viewmodel/viewmodel.js';

const ID = 'triz-resources';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
const CATEGORIES = ['substance', 'field', 'space', 'time', 'info', 'function'];
const LEVELS = ['sub', 'sys', 'super'];
const ICONS = { substance: 'domain.substance', field: 'domain.field', space: 'domain.geometry', time: 'domain.time', info: 'domain.info', function: 'domain.function' };
const FILL = { unknown: 'fill.0', unused: 'fill.25', partial: 'fill.50', full: 'fill.100' };
/** @type {HTMLElement[]} */
const mounted = [];
let prepared = false;
let UI = null;

/** Text des Moduls unter einem Punktpfad; sonst der Pfad. */
function tr(path) {
  const v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), UI);
  return typeof v === 'string' ? v : path;
}

async function prepare() {
  if (!prepared) {
    registerCommandDirectives(Alpine);
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
  _schema: { name: 'triz-resources', version: '1.0' },
  system: 'Gurtförderer für Schüttgut & Späne <Linie "Süd">',
  cells: {
    substance: {
      sub: { notes: 'Gurt aus EP-Gewebe & Gummi; Abrieb < 0,5 mm/Jahr.', status: 'full' },
      sys: { notes: 'Schüttgut selbst (Körnung 0–32 mm)\nFeuchte Anteile kleben.', status: 'partial' },
      super: { notes: '', status: 'unused' },
    },
    field: {
      sub: { notes: 'Schwerkraft auf das Gut — „kostenlos“.', status: 'full' },
      sys: { notes: 'Reibung Gurt/Trommel', status: 'unknown' },
      super: { notes: 'Magnetfeld des Abscheiders (Halle 3)\nnur tagsüber in Betrieb.', status: 'unused' },
    },
    space: {
      sub: { notes: 'Hohlraum unter dem Obertrum', status: 'partial' },
      sys: { notes: '', status: 'full' },
      super: { notes: 'Freiraum über der Strecke: 2,40 m "lichte Höhe".', status: 'unknown' },
    },
    time: {
      sub: { notes: 'Rücklauf des Untertrums ≈ 40 % der Umlaufzeit.', status: 'unused' },
      sys: { notes: 'Stillstand nachts 22:00–06:00\nWartungsfenster.', status: 'partial' },
      super: { notes: '', status: 'unknown' },
    },
    info: {
      sub: { notes: 'Geräusch der Tragrollen <Lager defekt?>', status: 'full' },
      sys: { notes: 'Stromaufnahme des Antriebs → Beladung', status: 'unused' },
      super: { notes: '', status: 'unknown' },
    },
    function: {
      sub: { notes: 'Abstreifer reinigt & dosiert zugleich.', status: 'partial' },
      sys: { notes: '', status: 'unknown' },
      super: { notes: 'Druckluftring der Nachbaranlage: könnte als Klopfer dienen.\nÜbergabe prüfen.', status: 'unused' },
    },
  },
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
      getProjectCycle: () => 'eightd',
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
  const qa = (sel) => [...container.querySelectorAll(sel)];
  const statusBtn = (c, l) => q(`button[data-role="status"][data-cat="${c}"][data-lvl="${l}"]`);
  return {
    inst, states, notes, container, q, qa, statusBtn,
    vm: () => Alpine.$data(container.querySelector('[x-data]')),
    system: () => q('[data-role="system"]'),
    notesField: (c, l) => q(`textarea[data-role="notes"][data-cat="${c}"][data-lvl="${l}"]`),
    /** Status der Zelle laut Klasse des Knopfs. */
    shownStatus: (c, l) => [...statusBtn(c, l).classList].find((k) => k.startsWith('triz-res__status--'))?.slice('triz-res__status--'.length),
    shownIcon: (c, l) => statusBtn(c, l).querySelector('[data-icon]').getAttribute('data-icon'),
    /** Ins Feld wechseln, Text tippen und das Feld verlassen (Fokus wie bei der Bedienung). */
    type: async (el, value) => {
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      await settle();
      return el;
    },
  };
}

suite('triz-resources: Viewmodel im Browser', () => {
  test('Raster 6 × 3 in Reihenfolge mit Icons, Spaltenköpfen und Platzhaltern', async () => {
    const h = await mount('res-1', null);
    assertDeepEqual(h.qa('.triz-res__col-head').map((el) => el.textContent), LEVELS.map((l) => tr(`level.${l}`)));
    assertDeepEqual(h.qa('.triz-res__row-title').map((el) => el.textContent), CATEGORIES.map((c) => tr(`category.${c}.name`)));
    assertDeepEqual(h.qa('.triz-res__row-head [data-icon]').map((el) => el.getAttribute('data-icon')), CATEGORIES.map((c) => ICONS[c]));
    const cells = h.qa('.triz-res__cell').map((el) => `${el.dataset.cat}.${el.dataset.lvl}`);
    assertDeepEqual(cells, CATEGORIES.flatMap((c) => LEVELS.map((l) => `${c}.${l}`)));
    assertEqual(h.system().placeholder, tr('systemPlaceholder'));
    for (const c of CATEGORIES) {
      for (const l of LEVELS) {
        assertEqual(h.notesField(c, l).placeholder, tr(`category.${c}.prompt`), `${c}.${l}`);
        assertEqual(h.shownStatus(c, l), 'unknown');
        assertEqual(h.shownIcon(c, l), 'fill.0');
        assertEqual(h.statusBtn(c, l).getAttribute('aria-label'), tr('status.unknown'));
      }
    }
  });

  test('Hilfe-Anker an jeder Beschriftung, keiner an den Statusknöpfen', async () => {
    const h = await mount('res-1', null);
    const keys = h.qa('[data-help-key]').map((el) => el.getAttribute('data-help-key')).filter(Boolean);
    const count = (k) => keys.filter((x) => x === k).length;
    assertEqual(count(`modules.${ID}.fields.system.help`), 1);
    assertEqual(count(`modules.${ID}.fields.cells.help`), 6);
    assertEqual(count(`modules.${ID}.actions.cycleStatus.help`), 1);
    assertEqual(keys.length, 8, keys.join(', '));
    const buttons = h.qa('button[data-role="status"]');
    assertEqual(buttons.length, 18);
    for (const el of buttons) assertEqual(el.getAttribute('data-help-key'), '');
  });

  test('System und Notiz schreiben ins Model und in den gespeicherten Stand', async () => {
    const h = await mount('res-1', null);
    const vm = h.vm();
    await h.type(h.system(), ' Bandförderer & <Linie> "Nord" ');
    assertEqual(vm.model.system, ' Bandförderer & <Linie> "Nord" ');
    assertEqual(h.states['res-1'].system, ' Bandförderer & <Linie> "Nord" ');
    for (const c of CATEGORIES) {
      for (const l of LEVELS) {
        await h.type(h.notesField(c, l), `Notiz ${c}/${l}\nzweite Zeile`);
        assertEqual(vm.model.cells[c][l].notes, `Notiz ${c}/${l}\nzweite Zeile`, `${c}.${l}`);
        assertEqual(h.states['res-1'].cells[c][l].notes, `Notiz ${c}/${l}\nzweite Zeile`, `${c}.${l} gespeichert`);
      }
    }
    assertEqual(vm.read().cells.info.super.status, 'unknown');
  });

  test('Klick auf den Statusknopf schaltet über das Kommando weiter, ein Verlaufsschritt je Klick', async () => {
    const h = await mount('res-1', null);
    const vm = h.vm();
    const order = ['unused', 'partial', 'full', 'unknown'];
    for (const want of order) {
      h.statusBtn('space', 'sys').click();
      await settle();
      assertEqual(vm.model.cells.space.sys.status, want);
      assertEqual(h.states['res-1'].cells.space.sys.status, want);
      assertEqual(h.shownStatus('space', 'sys'), want);
      assertEqual(h.shownIcon('space', 'sys'), FILL[want]);
      assertEqual(h.statusBtn('space', 'sys').getAttribute('aria-label'), tr(`status.${want}`));
    }
    // Nachbarzellen bleiben stehen.
    assertEqual(vm.model.cells.space.sub.status, 'unknown');
    assertEqual(vm.model.cells.time.sys.status, 'unknown');
    for (let i = 0; i < order.length; i++) {
      assertTrue(h.inst.historyStep('undo'), `Rückgängig ${i + 1} ohne Wirkung`);
      await settle();
    }
    assertEqual(h.inst.historyCan('undo'), false, 'mehr als ein Schritt je Klick');
    assertEqual(vm.model.cells.space.sys.status, 'unknown');
    assertEqual(h.notes.length, 0, JSON.stringify(h.notes));
  });

  test('Rückgängig und Wiederholen für Status und Notiz', async () => {
    const h = await mount('res-1', null);
    const vm = h.vm();
    h.statusBtn('field', 'super').click();
    await settle();
    await h.type(h.notesField('field', 'super'), 'Magnetfeld');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Notiz) ohne Wirkung');
    await settle();
    assertEqual(vm.model.cells.field.super.notes, '');
    assertEqual(h.notesField('field', 'super').value, '');
    assertEqual(vm.model.cells.field.super.status, 'unused');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Status) ohne Wirkung');
    await settle();
    assertEqual(vm.model.cells.field.super.status, 'unknown');
    assertEqual(h.shownStatus('field', 'super'), 'unknown');
    assertEqual(h.inst.historyCan('undo'), false);
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen (Status) ohne Wirkung');
    await settle();
    assertEqual(h.shownStatus('field', 'super'), 'unused');
    assertEqual(h.shownIcon('field', 'super'), 'fill.25');
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen (Notiz) ohne Wirkung');
    await settle();
    assertEqual(h.notesField('field', 'super').value, 'Magnetfeld');
  });

  test('zwei Instanzen: eindeutige ids, label[for] im eigenen Modul, Klick in B lässt A stehen', async () => {
    const a = await mount('res-a', null);
    const b = await mount('res-b', null, { keep: true });
    const ids = [...document.querySelectorAll('.triz-res [id]')].map((el) => el.id);
    assertEqual(ids.length, 2);
    assertEqual(new Set(ids).size, ids.length, `doppelte ids: ${ids.join(', ')}`);
    for (const h of [a, b]) {
      const labels = h.container.querySelectorAll('label[for]');
      assertEqual(labels.length, 1);
      for (const label of labels) {
        const target = document.getElementById(label.htmlFor);
        assertTrue(!!target && h.container.contains(target), `${label.htmlFor} zeigt nicht ins eigene Modul`);
        assertEqual(target, h.system());
      }
    }
    b.statusBtn('info', 'sub').click();
    await settle();
    assertEqual(b.vm().model.cells.info.sub.status, 'unused');
    assertEqual(a.vm().model.cells.info.sub.status, 'unknown');
    assertEqual(a.shownStatus('info', 'sub'), 'unknown');
    await b.type(b.notesField('info', 'sub'), 'nur B');
    assertEqual(a.vm().model.cells.info.sub.notes, '');
    await b.type(b.system(), 'nur B');
    assertEqual(a.vm().model.system, '');
    unmountAll();
  });

  test('Altprojekt: alle Werte sichtbar, Laden ist kein Verlaufsschritt', async () => {
    const h = await mount('res-1', structuredClone(LEGACY));
    assertEqual(h.system().value, LEGACY.system);
    for (const c of CATEGORIES) {
      for (const l of LEVELS) {
        const { notes, status } = LEGACY.cells[c][l];
        assertEqual(h.notesField(c, l).value, notes, `${c}.${l}`);
        assertEqual(h.shownStatus(c, l), status, `${c}.${l} Status`);
        assertEqual(h.shownIcon(c, l), FILL[status], `${c}.${l} Icon`);
        assertEqual(h.statusBtn(c, l).getAttribute('aria-label'), tr(`status.${status}`), `${c}.${l} Beschriftung`);
      }
    }
    assertEqual(h.inst.historyCan('undo'), false);
    const { _schema, ...fields } = LEGACY;
    assertDeepEqual(h.vm().read(), fields);
    unmountAll();
  });
});
