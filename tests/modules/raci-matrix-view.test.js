/**
 * RACI-Matrix: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem
 * echten Modul und der echten Vorlage. Prüft: Leerzustand, Hilfe-Anker,
 * Anlegen über die Formulare, Rollenzyklus an der Zelle, Inline-Umbenennen
 * samt Fokus, Esc, leerem und gleichem Text (auch bei Altnamen mit Rand-Leerzeichen), Schließen bei Änderungen von
 * außen, Entfernen mit Rückfrage, Verschieben über das Kommando und Alt+Pfeil
 * am Griff, Warnsymbole nur mit Stakeholdern, je ein Verlaufsschritt mit
 * Rückgängig/Wiederholen, Änderungen über Agent und `instance.set`, zwei
 * Instanzen, den CSV-Export und das Altprojekt ohne Verlaufsschritt.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual, fakeChartManager } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerCommandDirectives } from '../../js/core/command-directives.js';
import { runExport } from '../../js/core/exporter.js';
import { setFields } from '../../js/core/model.js';
import mod from '../../js/modules/raci-matrix/viewmodel/viewmodel.js';
import { State } from '../../js/modules/raci-matrix/domain/model.js';

const ID = 'raci-matrix';
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

async function prepare() {
  if (!prepared) {
    registerCommandDirectives(Alpine);
    if (!Alpine.version) Alpine.start();
    UI = await (await fetch(new URL(`../../js/modules/${ID}/resources/i18n/ui.de.json`, import.meta.url), { cache: 'no-cache' })).json();
    prepared = true;
  }
  // Eine schon eingebettete Vorlage (wie im Build) bleibt stehen.
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

/** Stand aus der Fixture `legacy-project.json` (ohne `_schema`, wie die Altform ihn schrieb). */
const LEGACY = {
  activities: [
    'Anforderungen aufnehmen',
    'Lieferantenbewertung für alle Zulieferer der Baugruppe Getriebegehäuse durchführen',
    'Prüfplan für Öl & Späne <Größe "M3"> freigeben',
    'Abschlussbericht schreiben',
  ],
  stakeholders: ['Projektleitung', 'Qualitätssicherung Werk Süd (Leitung Messtechnik)', 'Einkauf'],
  assignments: { '2:2': 'A', '0:1': 'A', '1:2': 'I', '0:0': 'R', '2:0': 'R', '1:1': 'A', '0:2': 'C', '2:1': 'A' },
};
/** Ein kleiner Stand der Zielform: drei Aktivitäten, zwei Stakeholder, drei Rollen. */
const SMALL = {
  _schema: { name: ID, version: '1.0' },
  activities: [{ id: 'a1', name: 'Planen' }, { id: 'a2', name: 'Bauen' }, { id: 'a3', name: 'Prüfen' }],
  stakeholders: [{ id: 's1', name: 'Leitung' }, { id: 's2', name: 'Team' }],
  assignments: { 'a1:s1': 'A', 'a1:s2': 'R', 'a2:s2': 'C' },
};
const plain = (v) => JSON.parse(JSON.stringify(v));

/**
 * Eine Instanz einhängen (eigene Kopie des Moduls wie in der Registry).
 * @param {string} instanceId
 * @param {object|null} model gespeicherter Zustand
 * @param {{ keep?: boolean, confirm?: boolean }} [opts] `keep`: vorher eingehängte Instanzen
 *   bleiben; `confirm`: Antwort der Lösch-Rückfrage
 */
async function mount(instanceId, model, { keep = false, confirm = true } = {}) {
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
    i18n: { t: (k) => k, tf: () => tr, getLanguage: () => 'de' },
    eventBus: {
      on: (n, fn) => handlers.push([n, fn]),
      off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
      emit: (n, p) => {
        if (n === 'command:executed') commands.push(p.command);
        for (const [a, f] of [...handlers]) if (a === n) f(p);
      },
    },
    chartManager: fakeChartManager(),
    notify: (...args) => { notes.push(args); },
    dialog: { confirm: async (o) => { confirms.push(o); return confirm; }, show: () => ({ close() {}, setTitle() {} }) },
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
  const vm = () => Alpine.$data(container.querySelector('[x-data]'));
  const h = {
    inst, states, notes, confirms, commands, container, q, qa, vm,
    rows: () => qa('tbody tr'),
    /** Namen der Zeilen in Anzeigereihenfolge. */
    names: () => qa('.raci__activity-text').map((el) => el.textContent),
    heads: () => qa('.raci__th-text').map((el) => el.textContent),
    /** Rollen je Zeile (Zellentexte). */
    grid: () => h.rows().map((tr) => [...tr.querySelectorAll('.raci__cell')].map((td) => td.textContent)),
    cell: (a, s) => /** @type {HTMLElement} */ (q(`.raci__cell[data-a="${a}"][data-s="${s}"]`)),
    input: (kind) => /** @type {HTMLInputElement} */ (q(`[data-add="${kind}"]`)),
    addBtn: (kind) => /** @type {HTMLButtonElement} */ (q(`[data-add-btn="${kind}"]`)),
    delBtn: (kind, idx) => /** @type {HTMLButtonElement} */ (q(`.raci__del-btn[data-del="${kind}"][data-idx="${idx}"]`)),
    nameEl: (kind, idx) => /** @type {HTMLElement} */ (q(`[data-rename="${kind}"][data-idx="${idx}"]`)),
    renameInput: () => /** @type {HTMLInputElement|null} */ (q('.raci__rename-input')),
    grip: (idx) => /** @type {HTMLButtonElement} */ (h.rows()[idx].querySelector('.raci__grip')),
    saved: () => plain(states[instanceId]),
    /** Text in eine Eingabezeile tippen und über Enter (Formular) oder den Knopf absenden. */
    add: async (kind, text, { button = false } = {}) => {
      const el = h.input(kind);
      el.focus();
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (button) h.addBtn(kind).click();
      else /** @type {HTMLFormElement} */ (el.form).requestSubmit();
      await settle();
    },
    /** Doppelklick auf einen Namen; wartet auf das Umbenennen-Feld. */
    dblclick: async (kind, idx) => {
      h.nameEl(kind, idx).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await until(() => h.renameInput() !== null && document.activeElement === h.renameInput());
    },
    /** Im offenen Umbenennen-Feld tippen. */
    typeRename: (value) => {
      const el = h.renameInput();
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    key: async (el, key, init = {}) => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
      await settle();
    },
    click: async (el) => { el.click(); await settle(); },
  };
  return h;
}

/** Der gespeicherte Stand lädt streng (ohne Reparatur). @param {any} saved */
function assertValid(saved) {
  let err = null;
  try { State.fromJSON(plain(saved)); } catch (e) { err = e; }
  assertEqual(err, null, `gespeicherter Stand ungültig: ${err?.message}`);
}

suite('raci-matrix: Viewmodel im Browser', () => {
  test('Leerzustand: Legende, zwei Eingabezeilen, keine Tabelle, nichts gespeichert', async () => {
    const h = await mount('rm-1', null);
    const legend = h.qa('.raci__legend-item');
    assertDeepEqual(legend.map((el) => el.textContent), ['R', 'A', 'C', 'I'].map((r) => `${r} = ${tr(`role${r}`)}`));
    assertDeepEqual(legend.map((el) => el.className.trim()), ['R', 'A', 'C', 'I'].map((r) => `raci__legend-item raci__role--${r.toLowerCase()}`));
    assertEqual(h.input('activity').placeholder, tr('activityPlaceholder'));
    assertEqual(h.input('activity').getAttribute('aria-label'), tr('activityPlaceholder'));
    assertEqual(h.input('activity').maxLength, 200);
    assertEqual(h.input('stakeholder').placeholder, tr('stakeholderPlaceholder'));
    assertEqual(h.input('stakeholder').maxLength, 120);
    assertEqual(h.addBtn('activity').textContent, `+ ${tr('addActivity')}`);
    assertEqual(h.addBtn('stakeholder').textContent, `+ ${tr('addStakeholder')}`);
    assertEqual(h.q('.raci__table'), null);
    assertTrue(h.q('.raci__empty') !== null, 'Leerfläche fehlt');
    assertEqual(h.q('.raci__empty').textContent, '');
    assertEqual(h.q('.raci__hint'), null);
    assertEqual(h.states['rm-1'], null);
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Hilfe-Anker: Legende, Knöpfe, Eckkopf und je Warnsymbol; Formulare, Eingaben, Zellen und Löschknöpfe leer', async () => {
    const h = await mount('rm-1', LEGACY);
    const keys = h.qa('[data-help-key]').map((el) => el.getAttribute('data-help-key')).filter(Boolean);
    const count = (k) => keys.filter((x) => x === `modules.${ID}.${k}`).length;
    assertEqual(count('fields.assignments.help'), 1);
    assertEqual(h.q('.raci__legend').getAttribute('data-help-key'), `modules.${ID}.fields.assignments.help`);
    assertEqual(count('actions.addActivity.help'), 1);
    assertEqual(count('actions.addStakeholder.help'), 1);
    assertEqual(count('actions.cycleRole.help'), 1);
    assertEqual(h.q('.raci__th-corner span').getAttribute('data-help-key'), `modules.${ID}.actions.cycleRole.help`);
    assertEqual(count('fields.warnings.help'), 3);
    assertEqual(keys.length, 7, keys.join(', '));
    for (const el of [...h.qa('form'), ...h.qa('.raci__add-input'), ...h.qa('.raci__cell'), ...h.qa('.raci__del-btn')]) {
      assertEqual(el.getAttribute('data-help-key'), '', el.className);
    }
    assertEqual(h.qa('.raci__cell').length, 12);
    assertEqual(h.qa('.raci__del-btn').length, 7);
    assertEqual(h.q('.raci__th-corner span').textContent, `${tr('activity')} \\ ${tr('stakeholder')}`);
    unmountAll();
  });

  test('Anlegen: Enter und Knopf legen an, das Feld wird leer, je ein Schritt; Leerzeichen abgelehnt, leeres Feld still; Rückgängig/Wiederholen', async () => {
    const h = await mount('rm-1', null);
    await h.add('activity', '  Planen  ');
    await until(() => h.names().length === 1);
    assertDeepEqual(h.names(), ['Planen']);
    assertEqual(h.input('activity').value, '');
    assertEqual(document.activeElement, h.input('activity'));
    assertTrue(h.q('.raci__hint') !== null, 'Hinweis ohne Stakeholder fehlt');
    assertEqual(h.q('.raci__hint').textContent, tr('addStakeholderHint'));
    await h.add('stakeholder', 'Leitung', { button: true });
    await until(() => h.heads().length === 1);
    assertDeepEqual(h.heads(), ['Leitung']);
    assertEqual(h.input('stakeholder').value, '');
    assertEqual(h.q('.raci__hint'), null);
    const saved = h.saved();
    assertValid(saved);
    assertEqual(saved.activities.length, 1);
    assertTrue(saved.activities[0].id !== '' && !saved.activities[0].id.includes(':'), saved.activities[0].id);
    assertEqual(saved.stakeholders[0].name, 'Leitung');
    // Nur Leerzeichen: Ablehnung am Feld, nichts angelegt.
    await h.add('activity', '   ');
    assertEqual(h.names().length, 1);
    assertEqual(h.input('activity').getAttribute('aria-invalid'), 'true');
    assertEqual(h.vm().model.activities.length, 1);
    // Leeres, unberührtes Feld: still nichts.
    const before = h.notes.length;
    h.input('stakeholder').form.requestSubmit();
    await settle();
    assertEqual(h.vm().model.stakeholders.length, 1);
    assertEqual(h.notes.length, before);
    // Je ein Schritt.
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Stakeholder) ohne Wirkung');
    await until(() => h.heads().length === 0);
    assertDeepEqual(h.names(), ['Planen']);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Aktivität) ohne Wirkung');
    await until(() => h.q('.raci__table') === null);
    assertEqual(h.inst.historyCan('undo'), false);
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen ohne Wirkung');
    await until(() => h.names().length === 1);
    assertEqual(h.vm().model.activities[0].id, saved.activities[0].id);
    unmountAll();
  });

  test('Rückgängig nimmt eine Zeile samt später gesetzter Rollen in der richtigen Reihenfolge zurück', async () => {
    const h = await mount('rm-1', SMALL);
    await h.add('activity', 'Abnehmen');
    await until(() => h.names().length === 4);
    // Ein Mausklick auf die Zelle nimmt dem Eingabefeld den Fokus (die Zelle selbst ist nicht fokussierbar).
    h.input('activity').blur();
    await h.click(h.cell(3, 0));
    await h.click(h.cell(3, 1));
    await h.click(h.cell(3, 1));
    assertDeepEqual(h.grid()[3], ['R', 'A']);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig 1');
    await until(() => h.grid()[3][1] === 'R');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig 2');
    await until(() => h.grid()[3][1] === '');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig 3');
    await until(() => h.grid()[3][0] === '');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig 4');
    await until(() => h.names().length === 3);
    assertEqual(h.inst.historyCan('undo'), false);
    assertEqual(JSON.stringify(h.vm().model.assignments), JSON.stringify(SMALL.assignments));
    unmountAll();
  });

  test('Zelle: ein Klick ist ein Schritt durch den Zyklus mit Farbklasse; Rückgängig/Wiederholen je ein Schritt; Agent setRole/cycleRole gleich', async () => {
    const h = await mount('rm-1', SMALL);
    const cell = () => h.cell(2, 0);
    const seen = [];
    for (let i = 0; i < 5; i++) {
      await h.click(cell());
      seen.push([cell().textContent, cell().className.trim()]);
    }
    assertDeepEqual(seen, [
      ['R', 'raci__cell raci__role--r'], ['A', 'raci__cell raci__role--a'], ['C', 'raci__cell raci__role--c'],
      ['I', 'raci__cell raci__role--i'], ['', 'raci__cell'],
    ]);
    assertEqual(h.saved().assignments['a3:s1'], undefined);
    cell().focus();
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig ohne Wirkung');
    await until(() => cell().textContent === 'I');
    assertEqual(h.saved().assignments['a3:s1'], 'I');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig 2 ohne Wirkung');
    await until(() => cell().textContent === 'C');
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen ohne Wirkung');
    await until(() => cell().textContent === 'I');
    // Agent.
    const vm = h.vm();
    vm.model.setRole({ activityId: 'a3', stakeholderId: 's2', role: 'A' });
    await until(() => h.cell(2, 1).textContent === 'A');
    assertEqual(h.cell(2, 1).className.trim(), 'raci__cell raci__role--a');
    vm.model.cycleRole({ activityId: 'a3', stakeholderId: 's2' });
    await until(() => h.cell(2, 1).textContent === 'C');
    assertEqual(h.cell(2, 1).className.trim(), 'raci__cell raci__role--c');
    vm.model.setRole({ activityId: 'a3', stakeholderId: 's2', role: '' });
    await until(() => h.cell(2, 1).textContent === '');
    assertEqual(h.cell(2, 1).className.trim(), 'raci__cell');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Agent) ohne Wirkung');
    await until(() => h.cell(2, 1).textContent === 'C');
    assertValid(h.saved());
    unmountAll();
  });

  test('Umbenennen: Doppelklick fokussiert und markiert; Enter, Verlassen übernehmen; Esc, leer und gleich ohne Schritt; Rückgängig', async () => {
    const h = await mount('rm-1', SMALL);
    await h.dblclick('activity', 1);
    const input = h.renameInput();
    assertTrue(input !== null, 'kein Umbenennen-Feld');
    assertEqual(document.activeElement, input);
    assertEqual(input.value, 'Bauen');
    assertEqual(input.selectionStart, 0);
    assertEqual(input.selectionEnd, 'Bauen'.length);
    await until(() => h.nameEl('activity', 1).style.display === 'none');
    assertEqual(h.nameEl('activity', 1).style.display, 'none');
    assertEqual(h.nameEl('activity', 1).title, `Bauen — ${tr('renameHint')}`);
    h.typeRename('  Montieren ');
    await h.key(input, 'Enter');
    await until(() => h.renameInput() === null);
    assertEqual(h.names()[1], 'Montieren');
    assertEqual(h.saved().activities[1].name, 'Montieren');
    assertEqual(h.saved().activities[1].id, 'a2');
    // Esc verwirft.
    await h.dblclick('activity', 1);
    h.typeRename('Verworfen');
    await h.key(h.renameInput(), 'Escape');
    await until(() => h.renameInput() === null);
    assertEqual(h.names()[1], 'Montieren');
    // Leer und gleich: kein Schritt.
    await h.dblclick('activity', 1);
    h.typeRename('   ');
    h.renameInput().blur();
    await until(() => h.renameInput() === null);
    await h.dblclick('activity', 1);
    h.renameInput().blur();
    await until(() => h.renameInput() === null);
    assertEqual(h.names()[1], 'Montieren');
    // Verlassen übernimmt (Stakeholder).
    await h.dblclick('stakeholder', 0);
    h.typeRename('Projektleitung');
    h.renameInput().blur();
    await until(() => h.renameInput() === null);
    assertEqual(h.heads()[0], 'Projektleitung');
    // Zwei Schritte: Stakeholder, Aktivität.
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Stakeholder) ohne Wirkung');
    await until(() => h.heads()[0] === 'Leitung');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Aktivität) ohne Wirkung');
    await until(() => h.names()[1] === 'Bauen');
    assertEqual(h.inst.historyCan('undo'), false);
    assertEqual(h.notes.length, 0);
    unmountAll();
  });

  test('Umbenennen ohne Änderung: Altname mit Rand-Leerzeichen bleibt wörtlich, kein Schritt (Aktivität und Stakeholder)', async () => {
    const h = await mount('rm-1', { activities: ['Planen', ' Bauen '], stakeholders: [' Team '], assignments: {} });
    await h.dblclick('activity', 1);
    assertEqual(h.renameInput().value, ' Bauen ');
    h.renameInput().blur();
    await until(() => h.renameInput() === null);
    await h.dblclick('stakeholder', 0);
    h.renameInput().blur();
    await until(() => h.renameInput() === null);
    await settle();
    assertEqual(h.vm().model.activities[1].name, ' Bauen ');
    assertEqual(h.vm().model.stakeholders[0].name, ' Team ');
    assertEqual(h.inst.historyCan('undo'), false);
    assertEqual(h.notes.length, 0);
    unmountAll();
  });

  test('Umbenennen bei Änderungen von außen: Löschen durch den Agenten, Rückgängig der Anlage, Umbenennen durch den Agenten schließen das Feld ohne Übernahme', async () => {
    const h = await mount('rm-1', SMALL);
    const vm = h.vm();
    // Agent entfernt die Zeile im offenen Feld.
    await h.dblclick('activity', 2);
    h.typeRename('Entwurf');
    vm.model.removeActivity({ activityId: 'a3' });
    await until(() => h.renameInput() === null);
    assertEqual(vm.state.renaming, null);
    assertDeepEqual(h.names(), ['Planen', 'Bauen']);
    // Rückgängig der vorherigen Anlage im offenen Feld.
    await h.add('activity', 'Neu');
    await until(() => h.names().length === 3);
    await h.dblclick('activity', 2);
    h.typeRename('Entwurf');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Anlage) ohne Wirkung');
    await until(() => h.renameInput() === null);
    assertDeepEqual(h.names(), ['Planen', 'Bauen']);
    // Agent benennt um: der Entwurf überschreibt den neuen Namen nicht.
    await h.dblclick('activity', 0);
    h.typeRename('Veralteter Entwurf');
    const input = h.renameInput();
    vm.model.renameActivity({ activityId: 'a1', value: 'Vom Agenten' });
    await until(() => h.renameInput() === null);
    input.dispatchEvent(new Event('blur'));
    await settle();
    assertEqual(h.names()[0], 'Vom Agenten');
    assertEqual(h.saved().activities[0].name, 'Vom Agenten');
    // instance.set auf die Stakeholder im offenen Feld.
    await h.dblclick('stakeholder', 1);
    setFields(vm.model, { stakeholders: [{ id: 's1', name: 'Leitung' }], assignments: { 'a1:s1': 'A' } });
    await until(() => h.renameInput() === null);
    assertDeepEqual(h.heads(), ['Leitung']);
    assertEqual(h.notes.length, 0);
    unmountAll();
  });

  test('Entfernen: genau eine Rückfrage, Abbrechen lässt alles stehen, Bestätigen nimmt Zeile bzw. Spalte samt Rollen; Rückgängig mit gleichen ids', async () => {
    let h = await mount('rm-1', SMALL, { confirm: false });
    await h.click(h.delBtn('activity', 0));
    await settle();
    assertEqual(h.confirms.length, 1);
    assertEqual(h.confirms[0].message, 'common.confirmDelete');
    assertDeepEqual(h.names(), ['Planen', 'Bauen', 'Prüfen']);
    assertEqual(h.inst.historyCan('undo'), false);
    h = await mount('rm-1', SMALL);
    await h.click(h.delBtn('activity', 0));
    await until(() => h.names().length === 2);
    assertEqual(h.confirms.length, 1);
    assertDeepEqual(h.names(), ['Bauen', 'Prüfen']);
    assertEqual(JSON.stringify(h.saved().assignments), JSON.stringify({ 'a2:s2': 'C' }));
    await h.click(h.delBtn('stakeholder', 1));
    await until(() => h.heads().length === 1);
    assertEqual(h.confirms.length, 2);
    assertEqual(JSON.stringify(h.saved().assignments), '{}');
    assertValid(h.saved());
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Stakeholder) ohne Wirkung');
    await until(() => h.heads().length === 2);
    assertEqual(h.vm().model.stakeholders[1].id, 's2');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Aktivität) ohne Wirkung');
    await until(() => h.names().length === 3);
    assertDeepEqual(plain(h.vm().model.activities), SMALL.activities);
    assertEqual(JSON.stringify(h.vm().model.assignments), JSON.stringify(SMALL.assignments));
    assertDeepEqual(h.grid(), [['A', 'R'], ['', 'C'], ['', '']]);
    unmountAll();
  });

  test('Verschieben: Kommando und Alt+Pfeil am Griff je ein Schritt, Rollen wandern mit, letzte Zeile bleibt, Fokus am Griff der verschobenen Zeile', async () => {
    const h = await mount('rm-1', SMALL);
    const vm = h.vm();
    vm.model.moveActivity({ activityId: 'a1', to: 2 });
    await until(() => h.names()[2] === 'Planen');
    assertDeepEqual(h.names(), ['Bauen', 'Prüfen', 'Planen']);
    assertDeepEqual(h.grid(), [['', 'C'], ['', ''], ['A', 'R']]);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Agent) ohne Wirkung');
    await until(() => h.names()[0] === 'Planen');
    assertDeepEqual(h.grid(), [['A', 'R'], ['', 'C'], ['', '']]);
    // Alt+Pfeil.
    h.commands.length = 0;
    h.grip(0).focus();
    await h.key(h.grip(0), 'ArrowDown', { altKey: true });
    await until(() => h.names()[1] === 'Planen');
    assertDeepEqual(h.names(), ['Bauen', 'Planen', 'Prüfen']);
    assertDeepEqual(h.grid(), [['', 'C'], ['A', 'R'], ['', '']]);
    await until(() => document.activeElement === h.grip(1));
    assertEqual(document.activeElement?.closest('tr')?.dataset.id, 'a1');
    assertEqual(h.saved().activities.map((a) => a.id).join(','), 'a2,a1,a3');
    assertDeepEqual(h.commands, ['moveActivity']);
    // Letzte und erste Zeile: Alt+Pfeil über den Rand tut nichts, kein Kommando.
    h.grip(2).focus();
    await h.key(h.grip(2), 'ArrowDown', { altKey: true });
    h.grip(0).focus();
    await h.key(h.grip(0), 'ArrowUp', { altKey: true });
    assertDeepEqual(h.names(), ['Bauen', 'Planen', 'Prüfen']);
    assertDeepEqual(h.commands, ['moveActivity']);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Alt+Pfeil) ohne Wirkung');
    await until(() => h.names()[0] === 'Planen');
    assertEqual(h.inst.historyCan('undo'), false);
    assertEqual(vm.state.dropPreview, null);
    assertEqual(h.qa('.dmike-table__row--drop-target').length, 0);
    unmountAll();
  });

  test('Warnsymbole nur mit Stakeholdern, Titel übersetzt, Zeilenrand; folgen dem Stand', async () => {
    const h = await mount('rm-1', SMALL);
    const warned = () => h.rows().map((tr) => (tr.querySelector('.raci__row-warn') ? tr.querySelector('.raci__row-warn').title : null));
    assertDeepEqual(warned(), [null, `${tr('warn_noR')}, ${tr('warn_noA')}`, `${tr('warn_noR')}, ${tr('warn_noA')}`]);
    assertDeepEqual(h.rows().map((tr) => tr.classList.contains('raci__row--warn')), [false, true, true]);
    await h.click(h.cell(1, 0));
    await until(() => warned()[1] === tr('warn_noA'));
    await h.click(h.cell(1, 1));
    await h.click(h.cell(1, 1));
    await h.click(h.cell(1, 0));
    await until(() => warned()[1] === `${tr('warn_noR')}, ${tr('warn_multiA')}`);
    // Ohne Stakeholder keine Warnungen.
    setFields(h.vm().model, { stakeholders: [], assignments: {} });
    await until(() => h.qa('.raci__row-warn').length === 0);
    assertEqual(h.qa('.raci__row--warn').length, 0);
    assertEqual(h.vm().warnings.length, 3);
    unmountAll();
  });

  test('instance.set: Felder erscheinen; doppelte id und verwaiste Rolle abgelehnt, Stand und Ansicht unverändert', async () => {
    const h = await mount('rm-1', SMALL);
    const vm = h.vm();
    setFields(vm.model, { activities: [{ id: 'x1', name: 'Eins' }], assignments: { 'x1:s2': 'I' } });
    await until(() => h.names().length === 1);
    assertDeepEqual(h.names(), ['Eins']);
    assertDeepEqual(h.grid(), [['', 'I']]);
    const before = JSON.stringify(h.saved());
    for (const values of [
      { activities: [{ id: 'x1', name: 'Eins' }, { id: 'x1', name: 'Zwei' }] },
      { assignments: { 'x1:s2': 'I', 'x9:s1': 'R' } },
      { assignments: { 'x1:s2': 'X' } },
    ]) {
      let err = null;
      try { setFields(vm.model, values); } catch (e) { err = e; }
      assertTrue(err instanceof Error, JSON.stringify(values));
    }
    await settle();
    assertEqual(JSON.stringify(h.saved()), before);
    assertDeepEqual(h.grid(), [['', 'I']]);
    unmountAll();
  });

  test('zwei Instanzen: Umbenennen fokussiert nur das eigene Feld, Kommandos und Alt+Pfeil bleiben im eigenen Modul', async () => {
    const a = await mount('rm-1', SMALL);
    const b = await mount('rm-2', SMALL, { keep: true });
    await b.dblclick('activity', 0);
    assertEqual(a.renameInput(), null);
    assertTrue(b.renameInput() !== null, 'Feld der zweiten Instanz fehlt');
    assertEqual(document.activeElement, b.renameInput());
    b.typeRename('Nur B');
    await b.key(b.renameInput(), 'Enter');
    await until(() => b.renameInput() === null);
    assertEqual(b.names()[0], 'Nur B');
    assertEqual(a.names()[0], 'Planen');
    await a.dblclick('stakeholder', 1);
    assertEqual(document.activeElement, a.renameInput());
    assertEqual(b.renameInput(), null);
    await a.key(a.renameInput(), 'Escape');
    a.grip(0).focus();
    await a.key(a.grip(0), 'ArrowDown', { altKey: true });
    await until(() => a.names()[1] === 'Planen');
    assertDeepEqual(b.names(), ['Nur B', 'Bauen', 'Prüfen']);
    await b.click(b.cell(2, 0));
    assertEqual(b.cell(2, 0).textContent, 'R');
    assertEqual(a.cell(2, 0).textContent, '');
    assertEqual(a.inst.historyCan('undo'), true);
    assertTrue(b.inst.historyStep('undo'), 'Rückgängig B');
    await until(() => b.cell(2, 0).textContent === '');
    assertEqual(a.names()[1], 'Planen');
    unmountAll();
  });

  test('Export: CSV aus der Tabelle, ohne Stakeholder keine Datei und keine Meldung', async () => {
    const h = await mount('rm-1', SMALL);
    const files = [];
    const io = { downloadFile: (text, name) => files.push({ text, name }), downloadBlob: () => files.push(null), ensureXLSX: async () => { throw new Error('nicht geladen'); } };
    await runExport(h.vm()._ui, 'csv', io);
    assertEqual(files.length, 1);
    assertEqual(files[0].name, 'raci-matrix.csv');
    assertEqual(files[0].text, 'sep=;\n"Aktivität";"Leitung";"Team"\n"Planen";"A";"R"\n"Bauen";"";"C"\n"Prüfen";"";""\n');
    setFields(h.vm().model, { stakeholders: [], assignments: {} });
    await settle();
    const notes = h.notes.length;
    await runExport(h.vm()._ui, 'csv', io);
    await runExport(h.vm()._ui, 'xlsx', io);
    assertEqual(files.length, 1);
    assertEqual(h.notes.length, notes);
    unmountAll();
  });

  test('Altprojekt: alle Werte sichtbar, Laden ist kein Verlaufsschritt, read() mit warnings', async () => {
    const h = await mount('rm-1', plain(LEGACY));
    assertDeepEqual(h.names(), LEGACY.activities);
    assertDeepEqual(h.heads(), LEGACY.stakeholders);
    assertDeepEqual(h.grid(), [['R', 'A', 'C'], ['', 'A', 'I'], ['R', 'A', 'A'], ['', '', '']]);
    const titles = h.rows().map((tr) => tr.querySelector('.raci__row-warn')?.title ?? null);
    assertDeepEqual(titles, [null, tr('warn_noR'), tr('warn_multiA'), `${tr('warn_noR')}, ${tr('warn_noA')}`]);
    assertEqual(h.inst.historyCan('undo'), false);
    const read = plain(h.vm().read());
    assertDeepEqual(Object.keys(read).sort(), ['activities', 'assignments', 'stakeholders', 'warnings']);
    assertDeepEqual(read.activities.map((a) => a.id), ['a1', 'a2', 'a3', 'a4']);
    assertDeepEqual(read.stakeholders.map((s) => s.id), ['s1', 's2', 's3']);
    assertEqual(Object.keys(read.assignments).length, 8);
    assertEqual(read.assignments['a3:s3'], 'A');
    assertDeepEqual(read.warnings, [
      { activityId: 'a2', issues: ['noR'] },
      { activityId: 'a3', issues: ['multiA'] },
      { activityId: 'a4', issues: ['noR', 'noA'] },
    ]);
    unmountAll();
  });
});
