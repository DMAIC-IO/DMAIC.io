/**
 * 5-Why: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem echten
 * Modul und der echten Vorlage. Prüft: Leerzustand, Hilfe-Anker, alle Knöpfe
 * je Ebene samt Kennzeichen und Grundursache, Antworten über die Textfelder
 * (ein Schritt je Fokus), Löschen mit genau einer Rückfrage, Einklappen über
 * Umschalter und Werkzeugleiste, die Höhe der Antwortfelder (auch verborgen
 * geschrieben), Rückgängig/
 * Wiederholen, Agent und `instance.set`, zwei Instanzen, den JSON-Export und
 * das Altprojekt ohne Verlaufsschritt.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerCommandDirectives, runUiCommand } from '../../js/core/command-directives.js';
import { runExport } from '../../js/core/exporter.js';
import { setFields } from '../../js/core/model.js';
import mod from '../../js/modules/five-why/viewmodel/viewmodel.js';
import { State } from '../../js/modules/five-why/domain/model.js';
import { schemaAgentEntry } from '../../js/core/agent/agent-schema.js';
import { stripPaths } from '../../js/core/view-fields.js';

const ID = 'five-why';
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

/** Text des Moduls unter einem Punktpfad, Platzhalter `{n}` ersetzt; sonst der Pfad. */
function tr(path, params) {
  const v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), UI);
  const text = typeof v === 'string' ? v : path;
  return params ? text.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : text;
}

async function prepare() {
  if (!prepared) {
    registerCommandDirectives(Alpine);
    if (!Alpine.version) Alpine.start();
    UI = await (await fetch(new URL(`../../js/modules/${ID}/resources/i18n/ui.de.json`, import.meta.url), { cache: 'no-cache' })).json();
    // Die Höhe der Antwortfelder ist reines CSS (`field-sizing`): ohne die
    // Modulstile (Testseite ohne Bundle) wüchse nichts.
    const css = new URL(`../../js/modules/${ID}/resources/style.css`, import.meta.url).href;
    if (![...document.styleSheets].some((sh) => sh.href === css)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = css;
      await new Promise((ok, fail) => { link.onload = ok; link.onerror = fail; document.head.append(link); });
    }
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

/** Ein Altknoten wie ihn `State.createNode` schrieb. */
function oldNode(id, level, parentId, answer, children = [], collapsed = false) {
  return { id, level, parentId, question: '', answer, children, collapsed };
}

/** Stand aus der Fixture `legacy-project.json` (ohne `_schema`, wie die Altform ihn schrieb). */
const LEGACY = {
  problem: 'Ölverlust an Linie 3 & Prüfstand <B> > Grenzwert',
  nodes: [
    oldNode(3, 1, null, 'Öl tropft aus der Ringleitung', [
      oldNode(7, 2, 3, 'Dichtung am Flansch ist spröde', [
        oldNode(8, 3, 7, 'Falscher Dichtungswerkstoff für 90 °C', [
          oldNode(12, 4, 8, 'Einkauf bestellt nach alter Stückliste\nÄnderung von 2024 nie eingepflegt', [
            oldNode(20, 5, 12, 'Kein Änderungsprozess für Stücklisten & Lieferantendaten'),
          ]),
        ]),
      ]),
      oldNode(11, 2, 3, ''),
    ]),
    oldNode(5, 1, null, 'Prüfstand meldet zu spät', [oldNode(6, 2, 5, 'Grenzwert < 2 bar ist zu weich eingestellt')], true),
  ],
};
/** Ein kleiner Stand der Zielform: Wurzel 1 mit Kind 2 (mit Kind 3), Wurzel 4. */
const SMALL = {
  _schema: { name: ID, version: '1.0' },
  problem: 'Ausschuss',
  nodes: [
    { id: 1, level: 1, parentId: null, answer: 'eins', children: [
      { id: 2, level: 2, parentId: 1, answer: 'zwei', children: [
        { id: 3, level: 3, parentId: 2, answer: 'drei', children: [] },
      ] },
    ] },
    { id: 4, level: 1, parentId: null, answer: '', children: [] },
  ],
  collapsed: [],
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
    chartManager: { create: async () => ({}), update: () => {}, destroy: () => {} },
    notify: (...args) => { notes.push(args); },
    dialog: { confirm: async (o) => { confirms.push(o); return confirm; }, show: () => ({ close() {}, setTitle() {} }) },
    theme: 'light',
    language: 'de',
  };
  const container = document.createElement('div');
  container.style.width = '800px';
  document.body.append(container);
  mounted.push(container);
  const inst = { ...mod };
  await inst.init(container, context);
  await settle();
  const q = (sel) => container.querySelector(sel);
  const qa = (sel) => [...container.querySelectorAll(sel)];
  const vm = () => Alpine.$data(container.querySelector('[x-data]'));
  /** Der Knoten mit dieser id. @param {number} id @returns {HTMLElement} */
  const nodeEl = (id) => /** @type {HTMLElement} */ (q(`.five-why__node[data-node-id="${id}"]`));
  const h = {
    inst, states, notes, confirms, commands, container, q, qa, vm, nodeEl,
    ids: () => qa('.five-why__node').map((el) => Number(el.getAttribute('data-node-id'))),
    tags: () => qa('.five-why__tag').map((el) => el.textContent.trim()),
    answers: () => qa('.five-why__answer').map((el) => /** @type {HTMLTextAreaElement} */ (el).value),
    stats: () => qa('.five-why__stat').map((el) => el.textContent.trim()),
    answer: (id) => /** @type {HTMLTextAreaElement} */ (q(`.five-why__answer[data-id="${id}"]`)),
    /** Knopf auf der Karte des Knotens. @param {number} id @param {'toggle'|'add-child'|'delete'} action */
    btn: (id, action) => /** @type {HTMLButtonElement|null} */ (nodeEl(id)?.querySelector(`:scope > .five-why__card [data-action="${action}"]`) ?? null),
    /** Inline-Knopf „Why n hinzufügen“ unter dem Knoten. @param {number} id */
    inlineAdd: (id) => /** @type {HTMLButtonElement|null} */ (nodeEl(id)?.querySelector(':scope > .five-why__children > .five-why__add-child-btn') ?? null),
    /** Ob die Unterfragen des Knotens sichtbar sind. @param {number} id */
    open: (id) => {
      const c = /** @type {HTMLElement|null} */ (nodeEl(id)?.querySelector(':scope > .five-why__children') ?? null);
      return c !== null && !c.hidden;
    },
    saved: () => plain(states[instanceId]),
    /** In ein Antwortfeld tippen (Fokus bleibt). @param {number} id @param {string} text */
    type: (id, text) => {
      const el = h.answer(id);
      el.focus();
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
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

suite('five-why: Viewmodel im Browser', () => {
  test('Leerzustand: Problemfeld, kein Knoten, Knopf und Statistik mit 0, nichts gespeichert', async () => {
    const h = await mount('fw-1', null);
    const input = /** @type {HTMLInputElement} */ (h.q('[data-ref="problemInput"]'));
    assertEqual(input.value, '');
    assertEqual(input.placeholder, tr('problemPlaceholder'));
    assertEqual(h.q('.five-why__problem-label').textContent, tr('problem'));
    assertTrue(input.id !== '', 'Problemfeld ohne id');
    assertEqual(/** @type {HTMLLabelElement} */ (h.q('.five-why__problem-label')).htmlFor, input.id);
    assertEqual(h.ids().length, 0);
    assertEqual(h.q('[data-ref="addRoot"]').textContent.trim(), tr('addWhy'));
    assertDeepEqual(h.stats(), [`0 ${tr('statsNodes')}`, `0 ${tr('statsDepth')}`, `0 ${tr('statsBranches')}`, `0 ${tr('statsAnswered')}`]);
    assertEqual(h.states['fw-1'], null);
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Hilfe-Anker: Problemstellung, Why hinzufügen, Statistik; Antwortfelder und Knöpfe je Knoten leer', async () => {
    const h = await mount('fw-1', plain(LEGACY));
    const keys = [...new Set(h.qa('[data-help-key]').map((el) => el.getAttribute('data-help-key')).filter(Boolean))];
    assertDeepEqual(keys, [
      `modules.${ID}.fields.problem.help`, `modules.${ID}.actions.addRoot.help`, `modules.${ID}.fields.stats.help`,
    ]);
    assertEqual(h.q('.five-why__problem-label').getAttribute('data-help-key'), `modules.${ID}.fields.problem.help`);
    assertTrue(h.q('.five-why__stats-list').classList.contains('context-help-anchor--overlay'), 'Statistik ohne Overlay-Anker');
    const perNode = [...h.qa('.five-why__answer'), ...h.qa('.five-why__icon-btn'), ...h.qa('.five-why__add-child-btn')];
    assertEqual(h.qa('.five-why__answer').length, 8);
    for (const el of perNode) assertEqual(el.getAttribute('data-help-key'), '', el.className);
    unmountAll();
  });

  test('Knöpfe je Ebene: Plus und Inline-Knopf legen an, Kennzeichen aus dem Pfad, Ebene 5 ohne Plus, Umschalter und Unterfragen', async () => {
    const h = await mount('fw-1', null);
    await h.click(h.q('[data-ref="addRoot"]'));
    await until(() => h.ids().length === 1);
    await h.click(h.btn(1, 'add-child'));
    await until(() => h.ids().length === 2);
    await h.click(h.inlineAdd(2));
    await until(() => h.ids().length === 3);
    assertEqual(h.inlineAdd(3).textContent, tr('addWhyN').replace('{n}', '4'));
    await h.click(h.btn(3, 'add-child'));
    await until(() => h.ids().length === 4);
    assertEqual(h.inlineAdd(4).textContent, tr('addWhyN').replace('{n}', '5'));
    await h.click(h.inlineAdd(4));
    await until(() => h.ids().length === 5);
    assertDeepEqual(h.ids(), [1, 2, 3, 4, 5]);
    assertDeepEqual(h.tags(), ['W1', 'W1.1', 'W1.1.1', 'W1.1.1.1', tr('rootCause')]);
    assertDeepEqual(h.qa('.five-why__tag').map((el) => el.getAttribute('data-level')), ['1', '2', '3', '4', '5']);
    assertTrue(h.nodeEl(5).querySelector('.five-why__tag [data-icon="flow.root-cause"]') !== null, 'Symbol der Grundursache fehlt');
    assertTrue(h.nodeEl(5).querySelector('.five-why__card').classList.contains('five-why__card--root-cause'), 'Grundursache ohne Kartenklasse');
    assertEqual(h.btn(5, 'add-child'), null);
    assertEqual(h.btn(5, 'toggle'), null);
    assertEqual(h.nodeEl(5).querySelector('.five-why__children'), null);
    assertTrue(h.btn(5, 'delete') !== null, 'Löschknopf auf Ebene 5 fehlt');
    assertEqual(h.answer(5).placeholder, tr('rootCausePlaceholder'));
    assertEqual(h.answer(1).placeholder, tr('answerPlaceholder'));
    assertEqual(h.btn(1, 'add-child').title, tr('addSubQuestion'));
    assertEqual(h.btn(1, 'toggle').title, tr('collapse'));
    assertDeepEqual(h.commands, ['addRoot', 'addChild', 'addChild', 'addChild', 'addChild']);
    const saved = h.saved();
    assertValid(saved);
    assertEqual(saved.nodes[0].children[0].children[0].children[0].children[0].level, 5);
    // Ein Schritt je Anlage.
    for (let n = 4; n >= 0; n--) {
      assertTrue(h.inst.historyStep('undo'), `Rückgängig bis ${n}`);
      await until(() => h.ids().length === n);
    }
    assertEqual(h.inst.historyCan('undo'), false);
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen');
    await until(() => h.ids().length === 1);
    unmountAll();
  });

  test('Antwort tippen: speichert, ein Schritt je Fokus bis Ebene 5; Rückgängig/Wiederholen nach Verlassen des Felds', async () => {
    const h = await mount('fw-1', plain(LEGACY));
    h.type(20, 'K');
    h.type(20, 'Kein Prozess');
    await settle();
    h.answer(20).blur();
    await settle();
    assertEqual(h.vm().model.nodes[0].children[0].children[0].children[0].children[0].answer, 'Kein Prozess');
    assertEqual(h.saved().nodes[0].children[0].children[0].children[0].children[0].answer, 'Kein Prozess');
    assertValid(h.saved());
    h.type(11, 'neu');
    await settle();
    h.answer(11).blur();
    await settle();
    assertTrue(h.stats()[3].startsWith('8 '), h.stats()[3]);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Ebene 2)');
    await until(() => h.answer(11).value === '');
    assertEqual(h.answer(20).value, 'Kein Prozess');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Ebene 5)');
    await until(() => h.answer(20).value === LEGACY.nodes[0].children[0].children[0].children[0].children[0].answer);
    assertEqual(h.inst.historyCan('undo'), false);
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen');
    await until(() => h.answer(20).value === 'Kein Prozess');
    unmountAll();
  });

  test('Löschen: mit Unterfragen genau die eigene Frage, ohne genau die allgemeine; Abbrechen lässt stehen; Rückgängig stellt Teilbaum samt collapsed her', async () => {
    let h = await mount('fw-1', plain(LEGACY), { confirm: false });
    await h.click(h.btn(5, 'delete'));
    await settle();
    assertEqual(h.confirms.length, 1);
    assertEqual(h.confirms[0].message, `modules.${ID}.deleteConfirm`);
    assertDeepEqual(h.ids(), [3, 7, 8, 12, 20, 11, 5, 6]);
    await h.click(h.btn(11, 'delete'));
    await settle();
    assertEqual(h.confirms.length, 2);
    assertEqual(h.confirms[1].message, 'common.confirmDelete');
    assertEqual(h.inst.historyCan('undo'), false);
    h = await mount('fw-1', plain(LEGACY));
    await h.click(h.btn(5, 'delete'));
    await until(() => h.ids().length === 6);
    assertEqual(h.confirms.length, 1);
    assertDeepEqual(h.ids(), [3, 7, 8, 12, 20, 11]);
    assertDeepEqual(h.saved().collapsed, []);
    await h.click(h.btn(20, 'delete'));
    await until(() => h.ids().length === 5);
    assertEqual(h.confirms.length, 2);
    assertValid(h.saved());
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Ebene 5)');
    await until(() => h.ids().length === 6);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Teilbaum)');
    await until(() => h.ids().length === 8);
    assertDeepEqual(h.ids(), [3, 7, 8, 12, 20, 11, 5, 6]);
    assertDeepEqual(plain(h.vm().model.collapsed), [5]);
    assertEqual(h.open(5), false);
    assertEqual(h.answer(6).value, 'Grenzwert < 2 bar ist zu weich eingestellt');
    unmountAll();
  });

  test('Einklappen: Umschalter und Werkzeugleiste blenden ein und aus, je ein Schritt; read() und Inhalt unverändert; Anlegen klappt auf', async () => {
    const h = await mount('fw-1', SMALL);
    const read0 = JSON.stringify(h.vm().read({ fields: ['nodes'] }));
    assertEqual(h.inst.historyCan('undo'), false);
    assertEqual(h.open(1), true);
    assertEqual(h.btn(1, 'toggle').getAttribute('aria-expanded'), 'true');
    await h.click(h.btn(1, 'toggle'));
    await until(() => !h.open(1));
    assertEqual(h.btn(1, 'toggle').title, tr('expand'));
    assertEqual(h.btn(1, 'toggle').getAttribute('aria-expanded'), 'false');
    assertEqual(h.btn(1, 'toggle').querySelector('.icon').getAttribute('data-icon'), 'nav.expand-right');
    assertDeepEqual(h.saved().collapsed, [1]);
    assertEqual(JSON.stringify(h.vm().read({ fields: ['nodes'] })), read0);
    // Die Revision rechnet ohne Ansichtsfelder: Einklappen ändert sie nicht.
    const viewFields = schemaAgentEntry(State).viewFields;
    assertDeepEqual(viewFields, ['collapsed']);
    assertEqual(JSON.stringify(stripPaths(h.saved(), viewFields)), JSON.stringify(stripPaths(plain(SMALL), viewFields)));
    const ui = h.vm()._ui;
    await runUiCommand(ui, 'setCollapseAll', { collapsed: true });
    await until(() => !h.open(2));
    assertDeepEqual(h.saved().collapsed, [1, 2]);
    await runUiCommand(ui, 'setCollapseAll', { collapsed: false });
    await until(() => h.open(1) && h.open(2));
    assertDeepEqual(h.saved().collapsed, []);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (alle auf)');
    await until(() => !h.open(1) && !h.open(2));
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (alle zu)');
    await until(() => !h.open(1) && h.open(2));
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Umschalter)');
    await until(() => h.open(1));
    assertEqual(h.inst.historyCan('undo'), false);
    // Anlegen am eingeklappten Knoten klappt ihn auf.
    await h.click(h.btn(1, 'toggle'));
    await until(() => !h.open(1));
    await h.click(h.btn(1, 'add-child'));
    await until(() => h.open(1) && h.ids().length === 5);
    assertDeepEqual(h.saved().collapsed, []);
    assertEqual(JSON.stringify(h.vm().read().stats), JSON.stringify({ totalNodes: 5, maxDepth: 3, branches: 1, answered: 3 }));
    unmountAll();
  });

  test('Höhe der Antwortfelder folgt Tippen, Agent, Rückgängig und Aufklappen', async () => {
    const h = await mount('fw-1', SMALL);
    const one = h.answer(3).offsetHeight;
    assertTrue(one > 0, 'Antwortfeld ohne Höhe');
    // Tippen: das Feld wächst mit dem Text (field-sizing, ohne Messung).
    const base = h.answer(4).offsetHeight;
    h.type(4, 'a\nb\nc\nd\ne\nf');
    await until(() => h.answer(4).offsetHeight > base);
    assertTrue(h.answer(4).offsetHeight > base, `Höhe nach dem Tippen ${h.answer(4).offsetHeight} ≤ ${base}`);
    assertTrue(Math.abs(h.answer(4).offsetHeight - h.answer(4).scrollHeight) <= 1, 'Höhe nach dem Tippen ≠ scrollHeight');
    h.answer(4).blur();
    await settle();
    h.vm().model.setAnswer({ nodeId: 3, text: 'a\nb\nc\nd\ne\nf' });
    await until(() => h.answer(3).offsetHeight > one);
    const six = h.answer(3).offsetHeight;
    assertTrue(six > one, `Höhe nach dem Agenten ${six} ≤ ${one}`);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig');
    await until(() => h.answer(3).offsetHeight < six);
    assertEqual(h.answer(3).offsetHeight, one);
    // Eingeklappt gesetzt, beim Aufklappen in der vollen Höhe.
    h.vm().model.toggleCollapse({ nodeId: 2 });
    await until(() => !h.open(2));
    h.vm().model.setAnswer({ nodeId: 3, text: 'a\nb\nc\nd\ne\nf' });
    await settle();
    h.vm().model.toggleCollapse({ nodeId: 2 });
    await until(() => h.open(2) && h.answer(3).offsetHeight === six);
    assertEqual(h.answer(3).offsetHeight, six);
    unmountAll();
  });

  test('Höhe der Antwortfelder: verborgen geschrieben, beim Einblenden gewachsen', async () => {
    const h = await mount('fw-1', SMALL);
    const one = h.answer(1).offsetHeight;
    h.container.style.display = 'none';
    await settle();
    h.vm().model.setAnswer({ nodeId: 1, text: 'a\nb\nc\nd\ne\nf' });
    await settle();
    h.container.style.display = '';
    const el = h.answer(1);
    await until(() => el.offsetHeight > one && Math.abs(el.offsetHeight - el.scrollHeight) <= 1);
    assertTrue(el.offsetHeight > one, `Höhe nach dem Einblenden ${el.offsetHeight} ≤ ${one}`);
    assertTrue(Math.abs(el.offsetHeight - el.scrollHeight) <= 1, `Höhe ${el.offsetHeight} ≠ scrollHeight ${el.scrollHeight}`);
    unmountAll();
  });

  test('Agent: Kommandos erscheinen in der Ansicht; Ebene 5 und unbekannte ids abgelehnt; instance.set prüft ids und Verweise', async () => {
    const h = await mount('fw-1', SMALL);
    const m = h.vm().model;
    const id = m.addChild({ parentId: 3 });
    await until(() => h.ids().includes(id));
    assertEqual(h.tags()[h.ids().indexOf(id)], 'W1.1.1.1');
    const l5 = m.addChild({ parentId: id });
    await until(() => h.ids().includes(l5));
    assertEqual(h.tags()[h.ids().indexOf(l5)], tr('rootCause'));
    m.setAnswer({ nodeId: l5, text: 'Grund' });
    await until(() => h.answer(l5).value === 'Grund');
    let err = null;
    try { m.addChild({ parentId: l5 }); } catch (e) { err = e; }
    assertEqual(err?.param, 'parentId');
    err = null;
    try { m.removeNode({ nodeId: 99 }); } catch (e) { err = e; }
    assertEqual(err?.param, 'nodeId');
    m.removeNode({ nodeId: 1 });
    await until(() => h.ids().length === 1);
    assertEqual(h.confirms.length, 0);
    setFields(m, { problem: 'Neu', nodes: [{ id: 9, level: 1, parentId: null, answer: 'neun', children: [] }] });
    await until(() => h.ids()[0] === 9);
    assertEqual(/** @type {HTMLInputElement} */ (h.q('[data-ref="problemInput"]')).value, 'Neu');
    const before = JSON.stringify(h.saved());
    for (const values of [
      { nodes: [{ id: 9, level: 1, parentId: null, answer: '', children: [] }, { id: 9, level: 1, parentId: null, answer: '', children: [] }] },
      { nodes: [{ id: 9, level: 1, parentId: 3, answer: '', children: [] }] },
    ]) {
      err = null;
      try { setFields(m, values); } catch (e) { err = e; }
      assertTrue(err instanceof Error, JSON.stringify(values));
    }
    await settle();
    assertEqual(JSON.stringify(h.saved()), before);
    assertDeepEqual(h.ids(), [9]);
    unmountAll();
  });

  test('zwei Instanzen: Knöpfe, Tippen und Rückgängig bleiben im eigenen Modul', async () => {
    const a = await mount('fw-1', SMALL);
    const b = await mount('fw-2', SMALL, { keep: true });
    await b.click(b.btn(4, 'add-child'));
    await until(() => b.ids().length === 5);
    assertEqual(a.ids().length, 4);
    await a.click(a.btn(1, 'toggle'));
    await until(() => !a.open(1));
    assertEqual(b.open(1), true);
    a.type(4, 'nur A');
    await settle();
    a.answer(4).blur();
    await settle();
    assertEqual(b.answer(4).value, '');
    assertTrue(b.inst.historyStep('undo'), 'Rückgängig B');
    await until(() => b.ids().length === 4);
    assertEqual(a.answer(4).value, 'nur A');
    assertEqual(a.open(1), false);
    unmountAll();
  });

  test('Export: JSON in der bisherigen Form, auch für den leeren Baum', async () => {
    const h = await mount('fw-1', plain(LEGACY));
    const files = [];
    const io = { downloadFile: () => files.push(null), downloadBlob: async (blob, name) => files.push({ name, text: await blob.text() }) };
    await runExport(h.vm()._ui, 'json', /** @type {any} */ (io));
    await until(() => files.length === 1);
    assertEqual(files[0].name, '5why-export.json');
    const out = JSON.parse(files[0].text);
    assertDeepEqual(Object.keys(out), ['tool', 'timestamp', 'problem', 'nodes']);
    assertEqual(out.tool, '5-Why');
    const strip = (o) => { const { timestamp, ...rest } = o; return rest; };
    // Wie die Altform: je Knoten question leer, children (Ebene 5 leer) und collapsed.
    assertEqual(JSON.stringify(strip(out)), JSON.stringify({ tool: '5-Why', problem: LEGACY.problem, nodes: LEGACY.nodes }));
    setFields(h.vm().model, { problem: '', nodes: [] });
    await settle();
    await runExport(h.vm()._ui, 'json', /** @type {any} */ (io));
    await until(() => files.length === 2);
    assertEqual(JSON.stringify(strip(JSON.parse(files[1].text))), JSON.stringify({ tool: '5-Why', problem: '', nodes: [] }));
    unmountAll();
  });

  test('Altprojekt: alle Werte sichtbar, eingeklappt bleibt zu, Laden ist kein Verlaufsschritt, read() mit stats', async () => {
    const h = await mount('fw-1', plain(LEGACY));
    assertDeepEqual(h.ids(), [3, 7, 8, 12, 20, 11, 5, 6]);
    assertDeepEqual(h.tags(), ['W1', 'W1.1', 'W1.1.1', 'W1.1.1.1', tr('rootCause'), 'W1.2', 'W2', 'W2.1']);
    assertDeepEqual(h.answers(), [
      'Öl tropft aus der Ringleitung', 'Dichtung am Flansch ist spröde', 'Falscher Dichtungswerkstoff für 90 °C',
      'Einkauf bestellt nach alter Stückliste\nÄnderung von 2024 nie eingepflegt',
      'Kein Änderungsprozess für Stücklisten & Lieferantendaten', '', 'Prüfstand meldet zu spät',
      'Grenzwert < 2 bar ist zu weich eingestellt',
    ]);
    assertEqual(/** @type {HTMLInputElement} */ (h.q('[data-ref="problemInput"]')).value, LEGACY.problem);
    assertEqual(h.open(3), true);
    assertEqual(h.open(5), false);
    assertDeepEqual(h.stats(), [`8 ${tr('statsNodes')}`, `5 ${tr('statsDepth')}`, `1 ${tr('statsBranches')}`, `7 ${tr('statsAnswered')}`]);
    // Mit den Modulstilen passen zwei Zeilen in die Grundhöhe des Felds (wie bisher).
    assertTrue(h.answer(7).offsetHeight > 0, 'Antwortfeld ohne Höhe');
    assertTrue(h.answer(12).offsetHeight >= h.answer(7).offsetHeight, 'zweizeilige Antwort niedriger');
    assertEqual(h.inst.historyCan('undo'), false);
    const read = plain(h.vm().read());
    assertDeepEqual(Object.keys(read), ['problem', 'nodes', 'stats']);
    assertDeepEqual(read.nodes, { $bulk: true, kind: 'tree', nodeCount: 8, depth: 5 });
    assertDeepEqual(read.stats, { totalNodes: 8, maxDepth: 5, branches: 1, answered: 7 });
    unmountAll();
  });
});
