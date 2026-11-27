/**
 * Paarweiser Vergleich: das Viewmodel im Browser (viewmodel/viewmodel.js) mit
 * dem echten Modul und der echten Vorlage. Prüft: Leerzustand und
 * Hilfe-Anker je Reiter, Anlegen über das Formular samt Ablehnungen am Feld,
 * Reiter auf dem Ansichtsfeld (Klick, Sperren, kein Fokus per Maus),
 * Start mit derselben Paarfolge nach Rückgängig/Wiederholen, Entscheidungen
 * bis zum Ergebnis, „Zurück“ als Knopfgruppe, Tastenkürzel (auch mit zwei
 * Instanzen), Matrixzellen, Löschen mit Rückfrage, Agent über das Model,
 * Zahlen in der App-Sprache, die Exporte und das Altprojekt ohne
 * Verlaufsschritt.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual, fakeChartManager } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerCommandDirectives } from '../../js/core/command-directives.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerTablistDirective } from '../../js/core/tablist.js';
import { runExport } from '../../js/core/exporter.js';
import mod from '../../js/modules/pairwise-comparison/viewmodel/viewmodel.js';
import { State } from '../../js/modules/pairwise-comparison/domain/model.js';

const ID = 'pairwise-comparison';
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

const CRITERIA = ['Kosten', 'Prüfaufwand; Stufe "B"', 'Lieferzeit', 'Service'];
const PAIRS = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];
/** Stand aus der E2E-Fixture `legacy-project.json` (ohne `_schema`, wie die Altform ihn schrieb). */
const LEGACY = {
  criteria: CRITERIA,
  matrix: [[0, 1, 0.5, 1], [0, 0, 0, 1], [0.5, 1, 0, 0], [0, 0, 1, 0]],
  pairs: PAIRS,
  currentPair: 6,
  viewPhase: 'results',
};
/** Ein laufender Vergleich der Zielform: drei Kriterien, feste Paarfolge, nichts entschieden. */
const RUNNING = {
  _schema: { name: ID, version: '1.0' },
  criteria: ['A', 'B', 'C'],
  matrix: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
  pairs: [[0, 1], [0, 2], [1, 2]],
  currentPair: 0,
  viewPhase: 'compare',
};
const plain = (v) => JSON.parse(JSON.stringify(v));

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
    i18n: { t: (k) => k, tf: () => (k, p) => trp(k, p), getLanguage: () => 'de' },
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
  if (hidden) container.style.display = 'none';
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
    tab: (p) => /** @type {HTMLButtonElement} */ (q(`[role="tab"][data-tab="${p}"]`)),
    activeTab: () => q('[role="tab"].dmike-tab--active')?.getAttribute('data-tab') ?? null,
    input: () => /** @type {HTMLInputElement} */ (q('[data-ref="criterionInput"]')),
    addBtn: () => /** @type {HTMLButtonElement} */ (q('[data-action="add"]')),
    startBtn: () => /** @type {HTMLButtonElement} */ (q('[data-action="start"]')),
    chips: () => qa('.pairwise__chip-label').map((el) => el.textContent),
    removeBtn: (i) => /** @type {HTMLButtonElement} */ (q(`.pairwise__chip-remove[data-idx="${i}"]`)),
    progress: () => q('.pairwise__progress-text')?.textContent ?? null,
    names: () => qa('.pairwise__vs-name').map((el) => el.textContent),
    option: (side) => /** @type {HTMLButtonElement} */ (side === 'left' ? qa('.pairwise__vs-option')[0] : qa('.pairwise__vs-option')[1]),
    tieBtn: () => /** @type {HTMLButtonElement} */ (q('.pairwise__vs-tie')),
    backBtn: () => /** @type {HTMLButtonElement} */ (q('[data-action="back-to-input"]')),
    ranking: () => qa('.pairwise__rank-item').map((li) => [li.querySelector('.pairwise__rank-name').textContent, li.querySelector('.pairwise__rank-score').textContent]),
    cell: (i, j) => /** @type {HTMLElement} */ (q(`.pairwise__matrix-cell[data-i="${i}"][data-j="${j}"]`)),
    /** Zellen je Zeile samt Summe. */
    grid: () => qa('.pairwise__matrix tbody tr').map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent)),
    saved: () => plain(states[instanceId]),
    /** Text tippen und über den Knopf (oder Enter = Formular) absenden. */
    add: async (text, { enter = false } = {}) => {
      const el = h.input();
      el.focus();
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (enter) /** @type {HTMLFormElement} */ (el.form).requestSubmit();
      else h.addBtn().click();
      await settle();
    },
    /** Taste am Fenster (wie ein Tastendruck ohne Fokus in einem Feld). */
    windowKey: async (key) => {
      const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      (document.activeElement ?? document.body).dispatchEvent(e);
      await settle();
      return e.defaultPrevented;
    },
    click: async (el) => { el.click(); await settle(); },
    undo: async () => { const ok = h.inst.historyStep('undo'); await settle(); return ok; },
    redo: async () => { const ok = h.inst.historyStep('redo'); await settle(); return ok; },
  };
  return h;
}

/** Der gespeicherte Stand lädt streng (ohne Reparatur). @param {any} saved */
function assertValid(saved) {
  let err = null;
  try { State.fromJSON(plain(saved)); } catch (e) { err = e; }
  assertEqual(err, null, `gespeicherter Stand ungültig: ${err?.message}`);
}

/** Die Hilfeschlüssel unter der Wurzel (ohne leere), gekürzt um das Modulpräfix. */
const helpKeys = (h) => h.qa('[data-help-key]').map((el) => el.getAttribute('data-help-key')).filter(Boolean)
  .map((k) => k.replace(`modules.${ID}.`, ''));

suite('pairwise-comparison: Viewmodel im Browser', () => {
  test('Leerzustand: Reiter Kriterien aktiv, Vergleich und Ergebnis gesperrt, Leertext, Start gesperrt, nichts gespeichert', async () => {
    const h = await mount('pc-1', null);
    assertEqual(h.qa('[role="tab"]').length, 3);
    assertEqual(h.activeTab(), 'input');
    assertEqual(h.tab('input').getAttribute('aria-selected'), 'true');
    assertDeepEqual(h.qa('[role="tab"]').map((b) => b.textContent.trim()), ['01Kriterien', '02Vergleich', '03Ergebnis']);
    assertEqual(h.tab('input').disabled, false);
    assertEqual(h.tab('compare').disabled, true);
    assertEqual(h.tab('results').disabled, true);
    assertTrue(h.q('.pairwise__empty') !== null, 'Leertext fehlt');
    assertEqual(h.q('.pairwise__empty span').textContent, trp('emptyHint', { n: 3 }));
    assertEqual(h.startBtn().disabled, true);
    assertEqual(h.startBtn().textContent.trim(), trp('startBtnNeed', { n: 3 }));
    assertEqual(h.input().maxLength, 60);
    assertEqual(h.input().placeholder, tr('criterionPlaceholder'));
    assertEqual(h.addBtn().textContent, `+ ${tr('addBtn')}`);
    assertEqual(document.activeElement, h.input());
    assertEqual(h.states['pc-1'], null);
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Hilfe-Anker je Reiter; Formular, Eingabe, Chip-Löschknöpfe und Zellen leer', async () => {
    let h = await mount('pc-1', { ...RUNNING, viewPhase: 'input' });
    assertDeepEqual(helpKeys(h), [
      'fields.viewPhase.help', 'actions.addCriterion.help', 'actions.removeCriterion.help', 'actions.startComparison.help',
    ]);
    assertEqual(h.q('.dmike-tabs').getAttribute('data-help-key'), `modules.${ID}.fields.viewPhase.help`);
    assertEqual(h.q('.pairwise__chips').getAttribute('data-help-key'), `modules.${ID}.actions.removeCriterion.help`);
    for (const el of [h.q('form'), h.input(), ...h.qa('.pairwise__chip-remove')]) assertEqual(el.getAttribute('data-help-key'), '', el.className);
    assertEqual(h.qa('.pairwise__chip-remove').length, 3);

    h = await mount('pc-1', RUNNING);
    assertDeepEqual(helpKeys(h), [
      'fields.viewPhase.help', 'actions.chooseLeft.help', 'actions.chooseRight.help', 'actions.tieCurrent.help', 'fields.viewPhase.help',
    ]);
    assertEqual(h.q('.pairwise__compare-actions').getAttribute('data-help-key'), `modules.${ID}.fields.viewPhase.help`);

    h = await mount('pc-1', plain(LEGACY));
    assertDeepEqual(helpKeys(h), [
      'fields.viewPhase.help', 'types.Result.ranking', 'types.RankEntry.score', 'types.RankEntry.score',
      'types.RankEntry.score', 'types.RankEntry.score', 'types.Result.scores', 'types.Result.scores', 'actions.cycleCell.help',
    ]);
    assertEqual(h.q('.pairwise__matrix-hint > span').getAttribute('data-help-key'), `modules.${ID}.actions.cycleCell.help`);
    for (const el of h.qa('td.pairwise__matrix-cell:not(.pairwise__matrix-cell--sum)')) assertEqual(el.getAttribute('data-help-key'), '');
    assertEqual(h.qa('td.pairwise__matrix-cell:not(.pairwise__matrix-cell--sum)').length, 16);
    unmountAll();
  });

  test('STOPP 4 Formular: Knopf und Enter legen an (Feld leer); Doppelung und Leerzeichen am Feld abgelehnt, Text bleibt; leeres Feld still; je Anlage ein Schritt', async () => {
    const h = await mount('pc-1', null);
    await h.add('  Kosten  ');
    await until(() => h.chips().length === 1);
    assertDeepEqual(h.chips(), ['Kosten']);
    assertEqual(h.input().value, '');
    await h.add('Zeit', { enter: true });
    await until(() => h.chips().length === 2);
    h.input().blur();
    // Doppelung: Hinweis am Feld, Text bleibt, keine Meldung.
    const notes = h.notes.length;
    await h.add('Kosten');
    assertEqual(h.chips().length, 2);
    assertEqual(h.input().getAttribute('aria-invalid'), 'true');
    // Der Kern übersetzt `hintKey` über `i18n.t` (hier der Schlüssel selbst).
    assertEqual(h.input().title, `modules.${ID}.duplicateWarning`);
    assertEqual(h.input().value, 'Kosten');
    assertEqual(h.notes.length, notes);
    // Nur Leerzeichen: Ablehnung am Feld.
    await h.add('   ');
    assertEqual(h.input().getAttribute('aria-invalid'), 'true');
    assertEqual(h.vm().model.criteria.length, 2);
    // Leeres, unberührtes Feld: still nichts.
    await h.add('');
    h.input().form.requestSubmit();
    await settle();
    assertEqual(h.vm().model.criteria.length, 2);
    assertEqual(h.notes.length, notes);
    assertValid(h.saved());
    // Eine Anlage über den Knopf ist ein Schritt.
    h.input().blur();
    await settle();
    await h.add('Qualität');
    await until(() => h.chips().length === 3);
    h.input().blur();
    assertTrue(await h.undo(), 'Rückgängig ohne Wirkung');
    await until(() => h.chips().length === 2);
    assertDeepEqual(h.chips(), ['Kosten', 'Zeit']);
    assertTrue(await h.redo(), 'Wiederholen ohne Wirkung');
    await until(() => h.chips().length === 3);
    unmountAll();
  });

  test('STOPP 4 volle Liste: Feld und Knopf gesperrt, Hinweis mit 15', async () => {
    const h = await mount('pc-1', { ...RUNNING, criteria: Array.from({ length: 15 }, (_, i) => `K${i + 1}`), matrix: [], pairs: [], viewPhase: 'input' });
    assertEqual(h.input().disabled, true);
    assertEqual(h.addBtn().disabled, true);
    assertEqual(h.q('.pairwise__hint').textContent, trp('maxReached', { n: 15 }));
    assertEqual(h.startBtn().textContent.trim().startsWith(trp('startBtnReady', { n: 105 })), true);
    unmountAll();
  });

  test('STOPP 2 Start und Zufall: Start zeigt Vergleich; Rückgängig → Eingabe ohne Lauf; Wiederholen → dieselbe Paarfolge', async () => {
    const h = await mount('pc-1', { ...RUNNING, matrix: [], pairs: [], viewPhase: 'input' });
    assertEqual(h.startBtn().disabled, false);
    assertTrue(h.q('[data-icon="action.send-to"]').style.display !== 'none', 'Icon fehlt');
    h.input().blur();
    await h.click(h.startBtn());
    await until(() => h.activeTab() === 'compare');
    assertEqual(h.progress(), '0 / 3');
    const pairs = plain(h.vm().model.pairs);
    assertEqual(pairs.length, 3);
    assertEqual(h.tab('compare').disabled, false);
    assertTrue(await h.undo(), 'Rückgängig ohne Wirkung');
    await until(() => h.activeTab() === 'input');
    assertEqual(h.vm().model.pairs.length, 0);
    assertEqual(h.tab('compare').disabled, true);
    // Kein Fokus ins Textfeld: sonst ginge Strg+Y an den Browser.
    assertTrue(document.activeElement !== h.input(), 'Fokus im Eingabefeld nach Rückgängig');
    assertTrue(await h.redo(), 'Wiederholen ohne Wirkung');
    await until(() => h.activeTab() === 'compare');
    assertEqual(JSON.stringify(h.vm().model.pairs), JSON.stringify(pairs));
    unmountAll();
  });

  test('STOPP 2 Entscheidungen: links, rechts, gleichwertig; das letzte Paar zeigt das Ergebnis, Rückgängig → Vergleich mit dem letzten Paar', async () => {
    const h = await mount('pc-1', RUNNING);
    assertDeepEqual(h.names(), ['A', 'B']);
    await h.click(h.option('left'));
    await until(() => h.progress() === '1 / 3');
    assertDeepEqual(h.names(), ['A', 'C']);
    await h.click(h.option('right'));
    await until(() => h.progress() === '2 / 3');
    assertDeepEqual(h.names(), ['B', 'C']);
    await h.click(h.tieBtn());
    await until(() => h.activeTab() === 'results');
    assertDeepEqual(plain(h.vm().model.matrix), [[0, 1, 0], [0, 0, 0.5], [1, 0.5, 0]]);
    assertEqual(h.tab('compare').disabled, true);
    assertTrue(await h.undo(), 'Rückgängig ohne Wirkung');
    await until(() => h.activeTab() === 'compare');
    assertEqual(h.progress(), '2 / 3');
    assertDeepEqual(h.names(), ['B', 'C']);
    assertTrue(await h.redo(), 'Wiederholen ohne Wirkung');
    await until(() => h.activeTab() === 'results');
    unmountAll();
  });

  test('STOPP 1 Reiter: Klick wechselt (ein Schritt), gesperrte Reiter wirken nicht, Mausklick fokussiert nicht; Agent schaltet sichtbar um', async () => {
    const h = await mount('pc-1', plain(LEGACY));
    assertEqual(h.activeTab(), 'results');
    assertEqual(h.tab('compare').disabled, true);
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    h.tab('input').dispatchEvent(down);
    assertEqual(down.defaultPrevented, true);
    await h.click(h.tab('input'));
    await until(() => h.activeTab() === 'input');
    assertEqual(h.tab('results').classList.contains('dmike-tab--active'), false);
    assertEqual(h.saved().viewPhase, 'input');
    await h.click(h.tab('compare'));
    assertEqual(h.activeTab(), 'input');
    assertTrue(await h.undo(), 'Rückgängig ohne Wirkung');
    await until(() => h.activeTab() === 'results');
    assertTrue(await h.redo(), 'Wiederholen ohne Wirkung');
    await until(() => h.activeTab() === 'input');
    // Agent: ein neuer Start schaltet sichtbar um.
    h.vm().model.startComparison({});
    await until(() => h.activeTab() === 'compare');
    assertEqual(h.progress(), '0 / 6');
    assertTrue(!Object.hasOwn(plain(h.vm().read()), 'viewPhase'), 'read() mit viewPhase');
    unmountAll();
  });

  test('STOPP 3 Zurück: schreibt den Reiter als ein Schritt, Rückgängig zurück auf Vergleich', async () => {
    const h = await mount('pc-1', RUNNING);
    await h.click(h.option('left'));
    await until(() => h.progress() === '1 / 3');
    await h.click(h.backBtn());
    await until(() => h.activeTab() === 'input');
    assertEqual(h.saved().viewPhase, 'input');
    assertEqual(h.saved().currentPair, 1);
    assertEqual(h.tab('compare').disabled, false);
    assertTrue(await h.undo(), 'Rückgängig ohne Wirkung');
    await until(() => h.activeTab() === 'compare');
    assertEqual(h.progress(), '1 / 3');
    unmountAll();
  });

  test('STOPP 5 Tastatur: ← → Leertaste stimmen ab, nicht bei Fokus auf einem Knopf, nicht im Reiter Kriterien; Rückgängig nimmt die Taste zurück', async () => {
    const h = await mount('pc-1', RUNNING);
    /** @type {HTMLElement} */ (document.activeElement)?.blur?.();
    assertTrue(await h.windowKey('ArrowRight'), 'Taste nicht verbraucht');
    await until(() => h.progress() === '1 / 3');
    assertEqual(h.vm().model.matrix[1][0], 1);
    await h.windowKey(' ');
    await until(() => h.progress() === '2 / 3');
    h.tieBtn().focus();
    assertEqual(await h.windowKey('ArrowLeft'), false);
    assertEqual(h.progress(), '2 / 3');
    h.tieBtn().blur();
    assertTrue(await h.undo(), 'Rückgängig ohne Wirkung');
    await until(() => h.progress() === '1 / 3');
    await h.click(h.backBtn());
    await until(() => h.activeTab() === 'input');
    h.input().blur();
    assertEqual(await h.windowKey('ArrowLeft'), false);
    assertEqual(h.vm().model.currentPair, 1);
    unmountAll();
  });

  test('STOPP 5 zwei Instanzen im Vergleich: nur die sichtbare stimmt ab', async () => {
    const a = await mount('pc-1', RUNNING);
    const b = await mount('pc-2', RUNNING, { keep: true, hidden: true });
    /** @type {HTMLElement} */ (document.activeElement)?.blur?.();
    await a.windowKey('ArrowLeft');
    await until(() => a.vm().model.currentPair === 1);
    await settle();
    assertEqual(a.vm().model.currentPair, 1);
    assertEqual(b.vm().model.currentPair, 0);
    unmountAll();
  });

  test('STOPP 6 Zelle: Zyklus samt Gegenzelle, Summen und Rangliste folgen, Diagonale nicht klickbar; Rückgängig stellt beide Zellen zurück; Agent cycleCell', async () => {
    const h = await mount('pc-1', plain(LEGACY));
    assertDeepEqual(h.grid()[1], ['0', '—', '0', '1', '1,0']);
    await h.click(h.cell(1, 0));
    await until(() => h.cell(1, 0).textContent === '0,5');
    assertEqual(h.cell(0, 1).textContent, '0,5');
    assertEqual(h.cell(1, 0).className.includes('pairwise__matrix-cell--tie'), true);
    assertEqual(h.grid()[0][4], '2,0');
    assertEqual(h.grid()[1][4], '1,5');
    await h.click(h.cell(1, 0));
    await until(() => h.cell(1, 0).textContent === '1');
    assertEqual(h.cell(0, 1).textContent, '0');
    assertDeepEqual(h.ranking().map((r) => r[0]), ['Prüfaufwand; Stufe "B"', 'Kosten', 'Lieferzeit', 'Service']);
    // Die Diagonale trägt die Klasse, deren Stil Klicks abhält (`pointer-events: none`; die Brücke lädt das Modul-CSS nicht).
    assertTrue(h.cell(2, 2).classList.contains('pairwise__matrix-cell--diag'), 'Diagonalklasse fehlt');
    assertEqual(h.cell(2, 2).title, '');
    assertTrue(await h.undo(), 'Rückgängig ohne Wirkung');
    await until(() => h.cell(1, 0).textContent === '0,5');
    assertEqual(h.cell(0, 1).textContent, '0,5');
    assertTrue(await h.undo(), 'Rückgängig 2 ohne Wirkung');
    await until(() => h.cell(1, 0).textContent === '0');
    assertEqual(h.cell(0, 1).textContent, '1');
    assertEqual(h.inst.historyCan('undo'), false);
    h.vm().model.cycleCell({ i: 3, j: 0 });
    await until(() => h.cell(3, 0).textContent === '0,5');
    assertEqual(h.cell(0, 3).textContent, '0,5');
    unmountAll();
  });

  test('STOPP 7 Chip löschen: Rückfrage, dann ein Schritt; im Lauf leert es Matrix und Paare; Rückgängig bringt beides zurück; Abbrechen lässt alles stehen', async () => {
    let h = await mount('pc-1', { ...RUNNING, currentPair: 1, matrix: [[0, 1, 0], [0, 0, 0], [0, 0, 0]], viewPhase: 'input' }, { confirm: false });
    await h.click(h.removeBtn(0));
    assertEqual(h.confirms.length, 1);
    assertDeepEqual(h.chips(), ['A', 'B', 'C']);
    h = await mount('pc-1', { ...RUNNING, currentPair: 1, matrix: [[0, 1, 0], [0, 0, 0], [0, 0, 0]], viewPhase: 'input' });
    h.input().blur();
    await h.click(h.removeBtn(0));
    await until(() => h.chips().length === 2);
    assertEqual(h.confirms.length, 1);
    assertDeepEqual(h.chips(), ['B', 'C']);
    assertEqual(h.saved().pairs.length, 0);
    assertEqual(h.tab('compare').disabled, true);
    assertTrue(await h.undo(), 'Rückgängig ohne Wirkung');
    await until(() => h.chips().length === 3);
    assertEqual(h.vm().model.currentPair, 1);
    assertEqual(h.tab('compare').disabled, false);
    // Agent im Vergleich: ohne Rückfrage, der Reiter geht auf Kriterien (T1); Rückgängig zurück auf Vergleich.
    await h.click(h.tab('compare'));
    await until(() => h.activeTab() === 'compare');
    h.vm().model.removeCriterion({ i: 2 });
    await until(() => h.activeTab() === 'input');
    assertEqual(h.confirms.length, 1);
    assertDeepEqual(h.chips(), ['A', 'B']);
    assertTrue(await h.undo(), 'Rückgängig (Agent) ohne Wirkung');
    await until(() => h.activeTab() === 'compare');
    assertEqual(h.progress(), '1 / 3');
    unmountAll();
  });

  test('Agent: Anlegen erscheint als Chip, Ablehnungen ändern nichts', async () => {
    const h = await mount('pc-1', null);
    const m = h.vm().model;
    assertEqual(m.addCriterion({ text: 'Kosten' }), 0);
    await until(() => h.chips().length === 1);
    let err = null;
    try { m.addCriterion({ text: 'Kosten' }); } catch (e) { err = e; }
    assertEqual(err?.hintKey, 'duplicateWarning');
    err = null;
    try { m.startComparison({}); } catch (e) { err = e; }
    assertTrue(err instanceof Error, 'Start unter drei nicht abgelehnt');
    await settle();
    assertDeepEqual(h.chips(), ['Kosten']);
    assertEqual(h.activeTab(), 'input');
    unmountAll();
  });

  test('Altprojekt: Ergebnis in de (Komma), Legende, Laden ist kein Verlaufsschritt, read() ohne viewPhase', async () => {
    const h = await mount('pc-1', plain(LEGACY));
    assertEqual(h.activeTab(), 'results');
    assertDeepEqual(h.ranking(), [['Kosten', '2,5'], ['Lieferzeit', '1,5'], ['Prüfaufwand; Stufe "B"', '1,0'], ['Service', '1,0']]);
    assertDeepEqual(h.grid(), [
      ['—', '1', '0,5', '1', '2,5'],
      ['0', '—', '0', '1', '1,0'],
      ['0,5', '1', '—', '0', '1,5'],
      ['0', '0', '1', '—', '1,0'],
    ]);
    assertDeepEqual(h.qa('.pairwise__matrix-legend').map((el) => el.textContent.trim()),
      [`1 = ${tr('legendWin')}`, `0,5 = ${tr('legendTie')}`, `0 = ${tr('legendLose')}`]);
    assertEqual(h.q('.pairwise__rank-item').className.includes('pairwise__rank-item--gold'), true);
    assertEqual(h.inst.historyCan('undo'), false);
    const read = plain(h.vm().read());
    assertDeepEqual(Object.keys(read), ['criteria', 'matrix', 'pairs', 'currentPair', 'result']);
    assertDeepEqual(read.result.scores, [2.5, 1, 1.5, 1]);
    unmountAll();
  });

  test('Altstand mit unerreichbarem Reiter zeigt die Eingabe; der Lauf bleibt', async () => {
    const h = await mount('pc-1', { ...plain(LEGACY), viewPhase: 'compare' });
    assertEqual(h.activeTab(), 'input');
    assertEqual(h.vm().model.currentPair, 6);
    assertEqual(h.tab('results').disabled, false);
    unmountAll();
  });

  test('Export: CSV und JSON nach dem Ergebnis, vorher keine Datei und keine Meldung', async () => {
    const h = await mount('pc-1', plain(LEGACY));
    const files = [];
    const io = {
      downloadFile: (text, name) => files.push({ text, name }),
      downloadBlob: async (blob, name) => files.push({ text: await blob.text(), name }),
      ensureXLSX: async () => { throw new Error('nicht geladen'); },
    };
    await runExport(h.vm()._ui, 'csv', io);
    await runExport(h.vm()._ui, 'json', io);
    await until(() => files.length === 2);
    assertEqual(files[0].name, 'pairwise-comparison.csv');
    assertEqual(files[0].text, [
      'sep=;',
      `"";"Kosten";"Prüfaufwand; Stufe ""B""";"Lieferzeit";"Service";"${tr('sum')}"`,
      '"Kosten";"-";1;0,5;1;2,5',
      '"Prüfaufwand; Stufe ""B""";0;"-";0;1;1',
      '"Lieferzeit";0,5;1;"-";0;1,5',
      '"Service";0;0;1;"-";1',
      '',
    ].join('\n'));
    assertEqual(files[1].name, 'pairwise-comparison.json');
    const tree = JSON.parse(files[1].text);
    assertDeepEqual(Object.keys(tree), ['tool', 'timestamp', 'criteria', 'matrix', 'scores', 'ranking']);
    assertDeepEqual(tree.ranking.map((r) => r.rank), [1, 2, 3, 4]);
    const r = await mount('pc-1', RUNNING);
    const notes = r.notes.length;
    await runExport(r.vm()._ui, 'csv', io);
    await runExport(r.vm()._ui, 'json', io);
    await runExport(r.vm()._ui, 'xlsx', io);
    await settle();
    assertEqual(files.length, 2);
    assertEqual(r.notes.length, notes);
    unmountAll();
  });
});
