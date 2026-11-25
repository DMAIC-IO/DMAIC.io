/**
 * Widerspruchsmatrix (TRIZ): das Viewmodel im Browser
 * (viewmodel/viewmodel.js) mit dem echten Modul und der echten Vorlage.
 * Prüft: Auswahllisten über `x-field` (nullbar, Optionen aus `x-for`), die
 * Empfehlung je Zustand, Tausch und Matrixzellen über die Kommandos (je ein
 * Verlaufsschritt), das Kontrollkästchen der Matrix, Hilfe-Anker,
 * Rückgängig und Wiederholen, ids je Instanz und das Altprojekt ohne
 * Verlaufsschritt.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerCommandDirectives } from '../../js/core/command-directives.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import mod from '../../js/modules/triz-contradiction-matrix/viewmodel/viewmodel.js';

const ID = 'triz-contradiction-matrix';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
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
    registerFieldDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
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

/** Stand aus der Fixture `legacy-project.json`: Altform ohne `_schema`. */
const LEGACY = {
  improving: 21,
  worsening: 33,
  problemNote: 'Mehr Leistung des Rührwerks & schnellere Charge <Ziel "30 min">.\nDie Bedienung wird dabei schwerer — Bediener müssen öfter nachregeln (> 5 Eingriffe).',
  showMatrix: true,
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
    chartManager: { create: async () => ({}), update: () => {}, destroy: () => {} },
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
  const select = (role) => /** @type {HTMLSelectElement} */ (q(`select[data-role="${role}"]`));
  return {
    inst, states, notes, container, q, qa, select,
    vm: () => Alpine.$data(container.querySelector('[x-data]')),
    swapBtn: () => q('button[data-action="swap"]'),
    toggle: () => /** @type {HTMLInputElement} */ (q('input[data-action="toggle-matrix"]')),
    table: () => q('.triz-cm__mx'),
    cell: (i, j) => q(`.triz-cm__mx-cell[data-i-idx="${i}"][data-j-idx="${j}"]`),
    descs: () => qa('.triz-cm__param-desc').map((el) => el.textContent),
    cards: () => qa('.triz-cm__principle-num').map((el) => Number(el.textContent)),
    cardNames: () => qa('.triz-cm__principle-name').map((el) => el.textContent),
    picked: () => qa('.triz-cm__mx-cell.is-picked').map((el) => `${el.dataset.iIdx}/${el.dataset.jIdx}`),
    activeHeads: () => ({
      rows: qa('.triz-cm__mx-row-head.is-active').map((el) => el.textContent),
      cols: qa('.triz-cm__mx-col-head.is-active').map((el) => el.textContent),
    }),
    /**
     * Wahl in einer Auswahlliste wie mit der Maus: der Browser setzt den Wert
     * und meldet `change`, danach verlässt der Fokus die Liste (solange sie
     * ihn hat, bündelt der Kern alle Änderungen zu einem Schritt).
     */
    choose: async (role, value) => {
      const el = select(role);
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      await settle();
    },
    /** Ins Feld wechseln, Text tippen und das Feld verlassen. */
    type: async (el, value) => {
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      await settle();
    },
    click: async (el) => { el.click(); await settle(); },
  };
}

suite('triz-contradiction-matrix: Viewmodel im Browser', () => {
  test('Leerzustand: Leeroptionen, 39 Optionen in Reihenfolge, Hinweis, Kästchen leer, keine Matrix', async () => {
    const h = await mount('cm-1', null);
    for (const role of ['improving', 'worsening']) {
      const el = h.select(role);
      assertEqual(el.value, '', role);
      const opts = [...el.options];
      assertEqual(opts.length, 40, role);
      assertEqual(opts[0].value, '');
      assertEqual(opts[0].textContent, tr('selectPlaceholder'));
      assertDeepEqual(opts.slice(1).map((o) => o.value), Array.from({ length: 39 }, (_, k) => String(k + 1)));
      assertEqual(opts[9].textContent, `9. ${tr('parameters.9.name')}`);
      assertEqual(opts[39].textContent, `39. ${tr('parameters.39.name')}`);
    }
    assertDeepEqual(h.descs(), []);
    assertEqual(h.q('.triz-cm__hint').textContent, tr('hintSelectBoth'));
    assertEqual(h.q('.triz-cm__warn'), null);
    assertDeepEqual(h.cards(), []);
    assertEqual(h.toggle().checked, false);
    assertEqual(h.toggle().closest('label').textContent.trim(), tr('showMatrix'));
    assertEqual(h.table(), null);
    assertEqual(h.q('.triz-cm__problem').placeholder, tr('problemPlaceholder'));
    assertEqual(h.swapBtn().getAttribute('aria-label'), tr('swap'));
    assertEqual(h.inst.historyCan('undo'), false);
  });

  test('Hilfe-Anker: je Beschriftung einer, Auswahllisten und Matrixzellen leer, Legende sammelt die Zellen', async () => {
    const h = await mount('cm-1', { ...LEGACY });
    const keys = h.qa('[data-help-key]').map((el) => el.getAttribute('data-help-key')).filter(Boolean);
    const count = (k) => keys.filter((x) => x === k).length;
    for (const f of ['improving', 'worsening', 'problemNote', 'recommendation', 'showMatrix']) {
      assertEqual(count(`modules.${ID}.fields.${f}.help`), 1, f);
    }
    assertEqual(count(`modules.${ID}.actions.swapParams.help`), 1);
    assertEqual(count(`modules.${ID}.actions.pickCell.help`), 1);
    assertEqual(keys.length, 7, keys.join(', '));
    assertEqual(h.q('.triz-cm__mx-legend > span').getAttribute('data-help-key'), `modules.${ID}.actions.pickCell.help`);
    assertEqual(h.toggle().closest('label').getAttribute('data-help-key'), `modules.${ID}.fields.showMatrix.help`);
    for (const role of ['improving', 'worsening']) assertEqual(h.select(role).getAttribute('data-help-key'), '', role);
    const commandCells = h.qa('.triz-cm__mx-cell[x-command]');
    assertEqual(commandCells.length, 39 * 38);
    for (const el of commandCells) assertEqual(el.getAttribute('data-help-key'), '');
  });

  test('beschriftete Auswahllisten: label[for] zeigt auf die eigene Liste', async () => {
    const h = await mount('cm-1', null);
    for (const role of ['improving', 'worsening']) {
      const label = h.q(`.triz-cm__label--${role}`);
      assertEqual(document.getElementById(label.htmlFor), h.select(role), role);
    }
  });

  test('Wahl schreibt die Zahl ins Model, zeigt die Beschreibung, ein Schritt je Wahl; Leeroption nimmt sie zurück', async () => {
    const h = await mount('cm-1', null);
    const vm = h.vm();
    await h.choose('improving', '9');
    assertEqual(vm.model.improving, 9);
    assertEqual(h.states['cm-1'].improving, 9);
    assertDeepEqual(h.descs(), [tr('parameters.9.description')]);
    await h.choose('worsening', '14');
    assertEqual(vm.model.worsening, 14);
    assertDeepEqual(h.cards(), [8, 3, 26, 14]);
    assertDeepEqual(h.cardNames(), [8, 3, 26, 14].map((id) => tr(`principles.${id}.name`)));
    assertEqual(h.q('.triz-cm__hint'), null);
    await h.choose('improving', '');
    assertEqual(vm.model.improving, null);
    assertEqual(h.states['cm-1'].improving, null);
    assertEqual(h.select('improving').value, '');
    assertDeepEqual(h.descs(), [tr('parameters.14.description')]);
    assertEqual(h.q('.triz-cm__hint').textContent, tr('hintSelectBoth'));

    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Leeroption) ohne Wirkung');
    await settle();
    assertEqual(vm.model.improving, 9);
    assertEqual(h.select('improving').value, '9');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (worsening) ohne Wirkung');
    await settle();
    assertEqual(vm.model.worsening, null);
    assertEqual(h.select('worsening').value, '');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (improving) ohne Wirkung');
    await settle();
    assertEqual(vm.model.improving, null);
    assertEqual(h.select('improving').value, '');
    assertEqual(h.inst.historyCan('undo'), false, 'mehr als ein Schritt je Wahl');
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen ohne Wirkung');
    await settle();
    assertEqual(h.select('improving').value, '9');
    assertEqual(h.notes.length, 0, JSON.stringify(h.notes));
  });

  test('Empfehlung je Zustand: Hinweis, Warnung, keine Empfehlung, Karten', async () => {
    const h = await mount('cm-1', null);
    await h.choose('improving', '5');
    assertEqual(h.q('.triz-cm__hint').textContent, tr('hintSelectBoth'));
    await h.choose('worsening', '5');
    assertEqual(h.q('.triz-cm__warn').textContent, tr('warnSameParameter'));
    assertEqual(h.q('.triz-cm__hint'), null);
    assertDeepEqual(h.cards(), []);
    await h.choose('improving', '1');
    await h.choose('worsening', '2');
    assertEqual(h.q('.triz-cm__hint').textContent, tr('noContradiction'));
    assertEqual(h.q('.triz-cm__warn'), null);
    assertEqual(h.q('.triz-cm__principles').style.display, 'none');
    await h.choose('worsening', '3');
    assertDeepEqual(h.cards(), [15, 8, 29, 34]);
    assertEqual(h.q('.triz-cm__principles').style.display, '');
    assertEqual(h.qa('.triz-cm__principle-desc')[0].textContent, tr('principles.15.description'));
    assertEqual(h.q('.triz-cm__hint'), null);
  });

  test('Tauschknopf tauscht über das Kommando, ein Verlaufsschritt', async () => {
    const h = await mount('cm-1', null);
    const vm = h.vm();
    await h.choose('improving', '9');
    await h.choose('worsening', '14');
    await h.click(h.swapBtn());
    assertEqual(vm.model.improving, 14);
    assertEqual(vm.model.worsening, 9);
    assertEqual(h.select('improving').value, '14');
    assertEqual(h.select('worsening').value, '9');
    assertEqual(h.states['cm-1'].improving, 14);
    assertDeepEqual(h.cards(), [8, 13, 26, 14]);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Tausch) ohne Wirkung');
    await settle();
    assertEqual(h.select('improving').value, '9');
    assertEqual(h.select('worsening').value, '14');
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen (Tausch) ohne Wirkung');
    await settle();
    assertEqual(h.select('improving').value, '14');
    assertEqual(h.notes.length, 0, JSON.stringify(h.notes));
  });

  test('Kontrollkästchen schaltet die Matrix, der gespeicherte Stand folgt; jedes Umschalten ist ein Verlaufsschritt', async () => {
    const h = await mount('cm-1', null);
    const vm = h.vm();
    await h.click(h.toggle());
    assertEqual(h.toggle().checked, true);
    assertEqual(vm.model.showMatrix, true);
    assertEqual(h.states['cm-1'].showMatrix, true);
    assertTrue(!!h.table(), 'Matrix fehlt');
    assertEqual(h.qa('.triz-cm__mx-col-head').length, 39);
    assertEqual(h.qa('.triz-cm__mx-row-head').length, 39);
    assertEqual(h.qa('.triz-cm__mx-cell').length, 39 * 39);
    assertEqual(h.qa('.triz-cm__mx-cell[x-command="pickCell"]').length, 39 * 38);
    const diag = h.qa('.triz-cm__mx-cell.is-diag');
    assertEqual(diag.length, 39);
    for (const el of diag) {
      assertEqual(el.dataset.iIdx, el.dataset.jIdx);
      assertTrue(!el.hasAttribute('x-command'), `Diagonale ${el.dataset.iIdx} mit Kommando`);
      assertEqual(el.textContent, '·');
    }
    // Reihenfolge in einer Zeile: Spalte 1 bis 39, die Diagonale an ihrem Platz.
    const row9 = [...h.cell(9, 1).parentElement.querySelectorAll('td')].map((el) => Number(el.dataset.jIdx));
    assertDeepEqual(row9, Array.from({ length: 39 }, (_, k) => k + 1));
    assertEqual(h.cell(9, 14).textContent, '4');
    assertEqual(h.cell(1, 2).textContent, '');
    assertTrue(h.cell(1, 2).classList.contains('is-empty'), '1/2 nicht leer');
    assertTrue(h.cell(9, 14).classList.contains('is-filled'), '9/14 nicht gefüllt');
    assertEqual(h.cell(9, 14).title, `9↑ ${tr('parameters.9.name')} / 14↓ ${tr('parameters.14.name')}: 8, 3, 26, 14`);
    assertEqual(h.cell(5, 5).title, '5 ↔ 5');
    assertEqual(h.q('.triz-cm__mx-row-head').title, `1. ${tr('parameters.1.name')}`);
    // Das Ansichtsfeld steht im gespeicherten Stand, also im Verlauf des
    // Kerns: jedes Umschalten ist ein Schritt (Verhalten festgehalten).
    await h.click(h.toggle());
    assertEqual(h.toggle().checked, false);
    assertEqual(vm.model.showMatrix, false);
    assertEqual(h.states['cm-1'].showMatrix, false);
    assertEqual(h.table(), null);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (aus) ohne Wirkung');
    await settle();
    assertEqual(h.toggle().checked, true);
    assertTrue(!!h.table(), 'Matrix fehlt nach Rückgängig');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (an) ohne Wirkung');
    await settle();
    assertEqual(h.toggle().checked, false);
    assertEqual(h.states['cm-1'].showMatrix, false);
    assertEqual(h.inst.historyCan('undo'), false, 'mehr als ein Schritt je Umschalten');
    assertEqual(h.notes.length, 0, JSON.stringify(h.notes));
  });

  test('Zellklick setzt beide Parameter in einem Schritt; Diagonale und gewählte Zelle ändern nichts', async () => {
    const h = await mount('cm-1', { improving: null, worsening: null, problemNote: '', showMatrix: true });
    const vm = h.vm();
    await h.click(h.cell(9, 14));
    assertEqual(vm.model.improving, 9);
    assertEqual(vm.model.worsening, 14);
    assertEqual(h.select('improving').value, '9');
    assertEqual(h.select('worsening').value, '14');
    assertDeepEqual(h.picked(), ['9/14']);
    assertDeepEqual(h.activeHeads(), { rows: ['9'], cols: ['14'] });
    assertDeepEqual(h.cards(), [8, 3, 26, 14]);
    assertEqual(h.states['cm-1'].worsening, 14);
    // Diagonale: kein Kommando, keine Änderung, kein Schritt.
    await h.click(h.cell(7, 7));
    assertEqual(vm.model.improving, 9);
    assertEqual(vm.model.worsening, 14);
    // Schon gewählte Zelle: kein weiterer Schritt.
    await h.click(h.cell(9, 14));
    await h.click(h.cell(1, 3));
    assertDeepEqual(h.picked(), ['1/3']);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (1/3) ohne Wirkung');
    await settle();
    assertDeepEqual(h.picked(), ['9/14']);
    assertEqual(h.select('improving').value, '9');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (9/14) ohne Wirkung');
    await settle();
    assertEqual(vm.model.improving, null);
    assertEqual(vm.model.worsening, null);
    assertDeepEqual(h.picked(), []);
    assertEqual(h.inst.historyCan('undo'), false, 'mehr als ein Schritt je Zellklick');
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen ohne Wirkung');
    await settle();
    assertDeepEqual(h.picked(), ['9/14']);
    assertEqual(h.notes.length, 0, JSON.stringify(h.notes));
  });

  test('Rückgängig und Wiederholen der Problemnotiz', async () => {
    const h = await mount('cm-1', null);
    const vm = h.vm();
    const note = h.q('.triz-cm__problem');
    await h.type(note, 'Fester & leichter <Rahmen>\nzweite Zeile');
    assertEqual(vm.model.problemNote, 'Fester & leichter <Rahmen>\nzweite Zeile');
    assertEqual(h.states['cm-1'].problemNote, 'Fester & leichter <Rahmen>\nzweite Zeile');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig ohne Wirkung');
    await settle();
    assertEqual(note.value, '');
    assertEqual(h.inst.historyCan('undo'), false);
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen ohne Wirkung');
    await settle();
    assertEqual(note.value, 'Fester & leichter <Rahmen>\nzweite Zeile');
  });

  test('zwei Instanzen: eindeutige ids, label[for] im eigenen Modul, Wahl, Tausch und Matrix in B lassen A stehen', async () => {
    const a = await mount('cm-a', null);
    const b = await mount('cm-b', null, { keep: true });
    const ids = [...document.querySelectorAll('.triz-cm [id]')].map((el) => el.id);
    assertEqual(ids.length, 4);
    assertEqual(new Set(ids).size, ids.length, `doppelte ids: ${ids.join(', ')}`);
    for (const h of [a, b]) {
      const labels = h.container.querySelectorAll('label[for]');
      assertEqual(labels.length, 2);
      for (const label of labels) {
        const target = document.getElementById(label.htmlFor);
        assertTrue(!!target && h.container.contains(target), `${label.htmlFor} zeigt nicht ins eigene Modul`);
      }
    }
    await a.choose('improving', '2');
    await b.choose('improving', '9');
    await b.choose('worsening', '14');
    await b.click(b.swapBtn());
    await b.click(b.toggle());
    await b.click(b.cell(1, 3));
    assertEqual(a.vm().model.improving, 2);
    assertEqual(a.vm().model.worsening, null);
    assertEqual(a.vm().model.showMatrix, false);
    assertEqual(a.table(), null);
    assertEqual(b.vm().model.improving, 1);
    assertEqual(b.vm().model.worsening, 3);
    assertEqual(a.select('improving').value, '2');
    unmountAll();
  });

  test('Altprojekt: alle Werte sichtbar, Laden ist kein Verlaufsschritt, read() mit Empfehlung', async () => {
    const h = await mount('cm-1', { ...LEGACY });
    assertEqual(h.select('improving').value, '21');
    assertEqual(h.select('worsening').value, '33');
    assertDeepEqual(h.descs(), [tr('parameters.21.description'), tr('parameters.33.description')]);
    assertDeepEqual(h.cards(), [26, 35, 10]);
    assertDeepEqual(h.cardNames(), ['Kopieren', 'Eigenschaftsänderung', 'Vorgezogene Wirkung']);
    assertEqual(h.q('.triz-cm__problem').value, LEGACY.problemNote);
    assertEqual(h.toggle().checked, true);
    assertTrue(!!h.table(), 'Matrix fehlt');
    assertDeepEqual(h.picked(), ['21/33']);
    assertDeepEqual(h.activeHeads(), { rows: ['21'], cols: ['33'] });
    assertEqual(h.inst.historyCan('undo'), false);
    const { showMatrix: _view, ...fields } = LEGACY;
    assertDeepEqual(h.vm().read(), {
      ...fields,
      recommendation: {
        status: 'found',
        principles: [26, 35, 10].map((id) => ({ id, name: tr(`principles.${id}.name`), description: tr(`principles.${id}.description`) })),
      },
    });
    unmountAll();
  });
});
