/**
 * Physikalischer Widerspruch (TRIZ): das Viewmodel im Browser
 * (viewmodel/viewmodel.js) mit dem echten Modul und der echten Vorlage.
 * Prüft: vier Karten in Reihenfolge, Hilfe-Anker, Texte und Notizen
 * schreiben ins Model, der Tauschknopf läuft über das Kommando (ein
 * Verlaufsschritt), die Wahl des Prinzips über die Radiogruppe, Rückgängig
 * und Wiederholen, ids je Instanz und das Altprojekt ohne Verlaufsschritt.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual, fakeChartManager } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerCommandDirectives } from '../../js/core/command-directives.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import mod from '../../js/modules/triz-physical-contradiction/viewmodel/viewmodel.js';

const ID = 'triz-physical-contradiction';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
const PRINCIPLES = ['time', 'space', 'condition', 'system'];
const ICONS = { time: 'domain.time', space: 'domain.space', condition: 'domain.condition', system: 'domain.system' };
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

/** Stand aus der Fixture `legacy-project.json` (gespeichert mit `_schema` '1.0'). */
const LEGACY = {
  _schema: { name: 'triz-physical-contradiction', version: '1.0' },
  parameter: 'Spaltmaß der Tür & Dichtung <Typ "B">',
  requirementA: 'groß — leichtes Schließen bei Kälte & Eis (> 4 mm)',
  requirementNotA: 'klein — dicht gegen Zugluft "ohne Pfeifen" (< 2 mm)',
  problemNote: 'Beschwerden über Zugluft im Winter.\nMessung: Spalt 3,5 mm ± 0,5 — „zu groß“ laut Kunde.',
  principleNotes: {
    time: 'Spalt nur beim Schließen groß: Dichtung fährt erst nach dem Einrasten aus.\nAktor oder Feder?',
    space: '',
    condition: 'Dichtung aus Formgedächtnis-Elastomer: weich < 0 °C, quillt bei Nässe & schließt den Spalt.\nTest „Kältekammer“ geplant.',
    system: 'Zweite Dichtlippe im Rahmen <Supersystem>;\nTür bleibt "wie sie ist".',
  },
  selectedPrinciple: 'condition',
  solutionNote: 'Quellende Dichtung als Lösungsrichtung.\nMuster bestellen & Zugluft messen (Ziel < 0,2 m/s).',
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
  const radio = (k) => /** @type {HTMLInputElement} */ (q(`input[data-role="select-principle"][value="${k}"]`));
  return {
    inst, states, notes, container, q, qa, radio,
    vm: () => Alpine.$data(container.querySelector('[x-data]')),
    field: (role) => q(`[data-role="${role}"]`),
    note: (k) => q(`textarea[data-role="principle-note"][data-principle="${k}"]`),
    swapBtn: () => q('button[data-action="swap"]'),
    solution: () => q('.triz-pc__solution'),
    /** Schlüssel der gewählten Radios. */
    checked: () => qa('input[data-role="select-principle"]').filter((el) => el.checked).map((el) => el.value),
    /** Schlüssel der Karten mit Akzentrahmen. */
    selectedCards: () => qa('.triz-pc__principle.is-selected').map((el) => el.dataset.principle),
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
    /** Wahl wie mit einer Pfeiltaste: der Browser setzt `checked` und meldet `change`. */
    arrowTo: async (k) => {
      const el = /** @type {HTMLInputElement} */ (q(`input[data-role="select-principle"][value="${k}"]`));
      el.focus();
      el.checked = true;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
    },
  };
}

suite('triz-physical-contradiction: Viewmodel im Browser', () => {
  test('vier Karten in Reihenfolge mit Nummer, Icon, Name, Frage, Beispiel und Platzhaltern', async () => {
    const h = await mount('pc-1', null);
    assertDeepEqual(h.qa('.triz-pc__principle').map((el) => el.dataset.principle), PRINCIPLES);
    assertDeepEqual(h.qa('.triz-pc__principle-num').map((el) => el.textContent), ['1', '2', '3', '4']);
    assertDeepEqual(h.qa('.triz-pc__principle-head [data-icon]').map((el) => el.getAttribute('data-icon')), PRINCIPLES.map((k) => ICONS[k]));
    assertDeepEqual(h.qa('.triz-pc__principle-title').map((el) => el.textContent), PRINCIPLES.map((k) => tr(`principles.${k}.name`)));
    assertDeepEqual(h.qa('.triz-pc__principle-question').map((el) => el.textContent), PRINCIPLES.map((k) => tr(`principles.${k}.question`)));
    assertDeepEqual(h.qa('.triz-pc__principle-example span').map((el) => el.textContent), PRINCIPLES.map((k) => tr(`principles.${k}.example`)));
    for (const k of PRINCIPLES) assertEqual(h.note(k).placeholder, tr('principleNotePlaceholder'), k);
    assertEqual(h.field('parameter').placeholder, 'z. B. Länge des Tragflügels');
    assertEqual(h.field('requirement-a').placeholder, tr('requirementAPlaceholder'));
    assertEqual(h.field('requirement-not-a').placeholder, tr('requirementNotAPlaceholder'));
    assertEqual(h.field('problem-note').placeholder, tr('problemNotePlaceholder'));
    assertEqual(h.swapBtn().getAttribute('aria-label'), tr('swap'));
    // Vorgabe: kein Prinzip gewählt, kein Lösungsabschnitt.
    assertEqual(h.vm().model.selectedPrinciple, null);
    assertDeepEqual(h.checked(), []);
    assertDeepEqual(h.selectedCards(), []);
    assertEqual(h.solution(), null);
  });

  test('Hilfe-Anker an jeder Beschriftung, Wirt der Radiogruppe ohne eigenen', async () => {
    const h = await mount('pc-1', structuredClone(LEGACY));
    const keys = h.qa('[data-help-key]').map((el) => el.getAttribute('data-help-key')).filter(Boolean);
    const count = (k) => keys.filter((x) => x === k).length;
    for (const f of ['parameter', 'requirementA', 'requirementNotA', 'problemNote', 'solutionNote']) {
      assertEqual(count(`modules.${ID}.fields.${f}.help`), 1, f);
    }
    assertEqual(count(`modules.${ID}.fields.principleNotes.help`), 4);
    assertEqual(count(`modules.${ID}.fields.selectedPrinciple.help`), 4);
    assertEqual(count(`modules.${ID}.actions.swap.help`), 1);
    assertEqual(keys.length, 14, keys.join(', '));
    assertEqual(h.q('[role="radiogroup"]').getAttribute('data-help-key'), '');
    for (const el of h.qa('.triz-pc__principle-title')) assertTrue(!!el.getAttribute('data-help-key'), 'Prinzipname ohne Anker');
  });

  test('Texte und Notizen schreiben ins Model und in den gespeicherten Stand', async () => {
    const h = await mount('pc-1', null);
    const vm = h.vm();
    const texts = {
      parameter: ['parameter', ' Länge & <Breite> "Flügel" '],
      'requirement-a': ['requirementA', 'lang — Auftrieb'],
      'requirement-not-a': ['requirementNotA', 'kurz — Widerstand'],
      'problem-note': ['problemNote', 'Zeile 1\nZeile 2 „Zitat“'],
    };
    for (const [role, [field, value]] of Object.entries(texts)) {
      await h.type(h.field(role), value);
      assertEqual(vm.model[field], value, field);
      assertEqual(h.states['pc-1'][field], value, `${field} gespeichert`);
    }
    for (const k of PRINCIPLES) {
      await h.type(h.note(k), `Notiz ${k}\nzweite Zeile & <mehr>`);
      assertEqual(vm.model.principleNotes[k], `Notiz ${k}\nzweite Zeile & <mehr>`, k);
      assertEqual(h.states['pc-1'].principleNotes[k], `Notiz ${k}\nzweite Zeile & <mehr>`, `${k} gespeichert`);
    }
    // Tippen in eine Notiz wählt kein Prinzip.
    assertEqual(vm.model.selectedPrinciple, null);
    assertDeepEqual(h.checked(), []);
    h.radio('space').click();
    await settle();
    await h.type(h.q('[data-role="solution-note"]'), 'Lösung\nmit zwei Zeilen');
    assertEqual(vm.model.solutionNote, 'Lösung\nmit zwei Zeilen');
    assertEqual(h.states['pc-1'].solutionNote, 'Lösung\nmit zwei Zeilen');
    assertEqual(h.notes.length, 0, JSON.stringify(h.notes));
  });

  test('Tauschknopf tauscht A und Nicht-A über das Kommando, ein Verlaufsschritt', async () => {
    const h = await mount('pc-1', null);
    const vm = h.vm();
    await h.type(h.field('requirement-a'), 'lang');
    await h.type(h.field('requirement-not-a'), 'kurz');
    h.swapBtn().click();
    await settle();
    assertEqual(vm.model.requirementA, 'kurz');
    assertEqual(vm.model.requirementNotA, 'lang');
    assertEqual(h.field('requirement-a').value, 'kurz');
    assertEqual(h.field('requirement-not-a').value, 'lang');
    assertEqual(h.states['pc-1'].requirementA, 'kurz');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Tausch) ohne Wirkung');
    await settle();
    assertEqual(vm.model.requirementA, 'lang');
    assertEqual(vm.model.requirementNotA, 'kurz');
    assertEqual(h.field('requirement-a').value, 'lang');
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen (Tausch) ohne Wirkung');
    await settle();
    assertEqual(h.field('requirement-a').value, 'kurz');
    assertEqual(h.field('requirement-not-a').value, 'lang');
    assertEqual(h.notes.length, 0, JSON.stringify(h.notes));
  });

  test('Wahl über Radio, Beschriftung und Pfeiltaste, ein Schritt je Wahl, Rückgängig führt auf keine Wahl', async () => {
    const h = await mount('pc-1', null);
    const vm = h.vm();
    h.radio('condition').click();
    await settle();
    assertEqual(vm.model.selectedPrinciple, 'condition');
    assertEqual(h.states['pc-1'].selectedPrinciple, 'condition');
    assertDeepEqual(h.checked(), ['condition']);
    assertDeepEqual(h.selectedCards(), ['condition']);
    assertTrue(!!h.solution(), 'Lösungsabschnitt fehlt');
    assertEqual(h.q('.triz-pc__solution-chosen strong').textContent, tr('principles.condition.name'));
    // Klick auf die Beschriftung der Karte.
    h.q('.triz-pc__principle[data-principle="time"] .triz-pc__principle-select').click();
    await settle();
    assertEqual(vm.model.selectedPrinciple, 'time');
    assertDeepEqual(h.checked(), ['time']);
    assertDeepEqual(h.selectedCards(), ['time']);
    // Pfeiltaste: der Browser wählt die nächste Option.
    await h.arrowTo('space');
    assertEqual(vm.model.selectedPrinciple, 'space');
    assertEqual(h.q('.triz-pc__solution-chosen strong').textContent, tr('principles.space.name'));
    // Klick auf die gewählte Option ändert nichts.
    h.radio('space').click();
    await settle();
    // Tippen in eine Notiz lässt die Wahl stehen und ist kein Wahlschritt.
    await h.type(h.note('system'), 'Notiz');
    assertEqual(vm.model.selectedPrinciple, 'space');
    assertDeepEqual(h.checked(), ['space']);

    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Notiz) ohne Wirkung');
    await settle();
    assertEqual(vm.model.principleNotes.system, '');
    assertEqual(vm.model.selectedPrinciple, 'space');
    for (const want of ['time', 'condition', null]) {
      assertTrue(h.inst.historyStep('undo'), `Rückgängig auf ${want} ohne Wirkung`);
      await settle();
      assertEqual(vm.model.selectedPrinciple, want);
    }
    assertEqual(h.inst.historyCan('undo'), false, 'mehr als ein Schritt je Wahl');
    assertDeepEqual(h.checked(), []);
    assertDeepEqual(h.selectedCards(), []);
    assertEqual(h.solution(), null);
    assertEqual(h.states['pc-1'].selectedPrinciple, null);

    assertTrue(h.inst.historyStep('redo'), 'Wiederholen ohne Wirkung');
    await settle();
    assertEqual(vm.model.selectedPrinciple, 'condition');
    assertDeepEqual(h.checked(), ['condition']);
    assertTrue(!!h.solution(), 'Lösungsabschnitt fehlt nach Wiederholen');
    assertEqual(h.notes.length, 0, JSON.stringify(h.notes));
  });

  test('Rückgängig und Wiederholen einer Prinzipnotiz', async () => {
    const h = await mount('pc-1', null);
    const vm = h.vm();
    await h.type(h.note('time'), 'Zeitlich trennen');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig ohne Wirkung');
    await settle();
    assertEqual(vm.model.principleNotes.time, '');
    assertEqual(h.note('time').value, '');
    assertEqual(h.inst.historyCan('undo'), false);
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen ohne Wirkung');
    await settle();
    assertEqual(h.note('time').value, 'Zeitlich trennen');
  });

  test('Beschriftung der Notizfelder über aria-labelledby auf vorhandene ids', async () => {
    const h = await mount('pc-1', structuredClone(LEGACY));
    for (const k of PRINCIPLES) {
      const target = document.getElementById(h.note(k).getAttribute('aria-labelledby'));
      assertTrue(!!target && h.container.contains(target), `${k}: Ziel fehlt`);
      assertEqual(target.textContent, tr(`principles.${k}.name`));
    }
    const sol = h.q('[data-role="solution-note"]');
    const head = document.getElementById(sol.getAttribute('aria-labelledby'));
    assertTrue(!!head && h.solution().contains(head), 'Überschrift der Lösung fehlt');
    assertEqual(head.textContent, tr('solutionHeading'));
    unmountAll();
  });

  test('zwei Instanzen: eindeutige ids und Radio-Namen, label[for] im eigenen Modul, Wahl in B lässt A stehen', async () => {
    const a = await mount('pc-a', null);
    const b = await mount('pc-b', null, { keep: true });
    const ids = [...document.querySelectorAll('.triz-pc [id]')].map((el) => el.id);
    assertEqual(ids.length, 2 * (4 + 4));
    assertEqual(new Set(ids).size, ids.length, `doppelte ids: ${ids.join(', ')}`);
    const names = (h) => new Set(h.qa('input[type="radio"]').map((el) => el.name));
    assertEqual(names(a).size, 1);
    assertEqual(names(b).size, 1);
    assertTrue([...names(a)][0] !== [...names(b)][0], 'gleicher Radio-Name in beiden Instanzen');
    for (const h of [a, b]) {
      const labels = h.container.querySelectorAll('label[for]');
      assertEqual(labels.length, 4);
      for (const label of labels) {
        const target = document.getElementById(label.htmlFor);
        assertTrue(!!target && h.container.contains(target), `${label.htmlFor} zeigt nicht ins eigene Modul`);
      }
    }
    a.radio('time').click();
    await settle();
    b.radio('system').click();
    await settle();
    assertEqual(a.vm().model.selectedPrinciple, 'time');
    assertEqual(b.vm().model.selectedPrinciple, 'system');
    assertDeepEqual(a.checked(), ['time']);
    assertDeepEqual(b.checked(), ['system']);
    await b.type(b.note('space'), 'nur B');
    assertEqual(a.vm().model.principleNotes.space, '');
    await b.type(b.field('requirement-a'), 'nur B');
    b.swapBtn().click();
    await settle();
    assertEqual(b.vm().model.requirementNotA, 'nur B');
    assertEqual(a.vm().model.requirementA, '');
    assertEqual(a.vm().model.requirementNotA, '');
    unmountAll();
  });

  test('Altprojekt: alle Werte sichtbar, Laden ist kein Verlaufsschritt', async () => {
    const h = await mount('pc-1', structuredClone(LEGACY));
    assertEqual(h.field('parameter').value, LEGACY.parameter);
    assertEqual(h.field('requirement-a').value, LEGACY.requirementA);
    assertEqual(h.field('requirement-not-a').value, LEGACY.requirementNotA);
    assertEqual(h.field('problem-note').value, LEGACY.problemNote);
    for (const k of PRINCIPLES) assertEqual(h.note(k).value, LEGACY.principleNotes[k], k);
    assertDeepEqual(h.checked(), ['condition']);
    assertDeepEqual(h.selectedCards(), ['condition']);
    assertEqual(h.q('.triz-pc__solution-chosen strong').textContent, 'Trennung nach Bedingung');
    assertEqual(h.q('[data-role="solution-note"]').value, LEGACY.solutionNote);
    assertEqual(h.inst.historyCan('undo'), false);
    const { _schema, ...fields } = LEGACY;
    assertDeepEqual(h.vm().read(), fields);
    unmountAll();
  });
});
