/**
 * Makigami: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem echten
 * Modul und der echten Vorlage. Prüft: Leerzustand, das Altprojekt ohne
 * Verlaufsschritt mit allen Werten (Matrix, Karten, Klappzustand, unlesbare
 * Zeit, Einstellungen, Kennzahlen), Hilfe-Anker, Mitwirkung und
 * Verschwendung über Punkt und Chip, Klappen der Karten und den
 * Einstellungsbereich (Ansichtsfelder über Kommandos der Oberfläche), die Normalform beim Verlassen eines
 * Dauerfelds (ohne Schritt, wenn nichts zu tun ist), Löschen mit Rückfrage,
 * die gesperrten Löschknöpfe beim letzten Eintrag, den Faktor über `x-field`,
 * Umsortieren per Alt+Pfeil an beiden Griffen, zwei Instanzen mit gleichen
 * Schritt-ids und die Exporte.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual, fakeChartManager } from '../../test-utils.js';
import Alpine from '../../../vendor/alpinejs/csp.js';
import { registerCommandDirectives } from '../../../js/core/command-directives.js';
import { registerFieldDirective } from '../../../js/core/field-directive.js';
import { WIDGETS } from '../../../js/widgets/registry.js';
import { WIDGET_I18N } from '../../widget-i18n.js';
import { runExport } from '../../../js/core/exporter.js';
import { formatDuration } from '../../../js/modules/makigami/domain/duration.js';
import mod from '../../../js/modules/makigami/viewmodel/viewmodel.js';

const ID = 'makigami';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const LEGACY_A = '5b1c7d20-3e4f-4a51-9c62-0d7e8f9a1b01';
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
/** Wartet, bis `ok()` gilt; höchstens zwei Sekunden. @param {() => boolean} ok */
async function until(ok) {
  for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
}
/** @type {HTMLElement[]} */
const mounted = [];
let prepared = false;
/** @type {any} */
let UI = null;
const plain = (v) => JSON.parse(JSON.stringify(v));

/** Text des Moduls unter einem Punktpfad, `{name}` gefüllt; sonst der Pfad. */
function tr(path, params) {
  const v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), UI);
  if (typeof v !== 'string') return path;
  return v.replace(/\{(\w+)\}/g, (_, k) => (params && k in params ? String(params[k]) : `{${k}}`));
}

async function prepare() {
  if (!prepared) {
    registerCommandDirectives(Alpine);
    registerFieldDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
    if (!Alpine.version) Alpine.start();
    UI = await (await fetch(new URL(`../../../js/modules/${ID}/resources/i18n/ui.de.json`, import.meta.url), { cache: 'no-cache' })).json();
    prepared = true;
  }
  if (document.querySelector(`template[data-tpl="${TPL_KEY}"]`)?.content.childElementCount) return;
  const html = await (await fetch(new URL(`../../../${TPL_KEY}`, import.meta.url), { cache: 'no-cache' })).text();
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

/** Die Altinstanz (a) aus dem Altprojekt (ohne `_schema`). */
async function legacyA() {
  const res = await fetch(new URL('./legacy-project.json', import.meta.url), { cache: 'no-cache' });
  return (await res.json()).moduleStates[LEGACY_A];
}
async function fixtureText(name) {
  return (await fetch(new URL(`./${name}`, import.meta.url), { cache: 'no-cache' })).text();
}

/** Ein kleiner Stand der Zielform: zwei Rollen, drei Schritte. */
const SMALL = {
  _schema: { name: ID, version: '1.0' },
  title: 'Klein',
  roles: [{ id: 'r-1', label: 'Einkauf' }, { id: 'r-2', label: 'Lager' }],
  steps: [
    { id: 's-1', title: 'Bestellen', description: '', roleIds: ['r-1'], processTime: '10min', waitTime: '1h', mudaIds: [], notes: '' },
    { id: 's-2', title: 'Prüfen', description: '', roleIds: [], processTime: '', waitTime: '', mudaIds: [], notes: '' },
    { id: 's-3', title: 'Einlagern', description: '', roleIds: ['r-2'], processTime: '5min', waitTime: '', mudaIds: [], notes: '' },
  ],
  collapsed: [],
  settingsOpen: false,
};

/**
 * Eine Instanz einhängen (eigene Kopie des Moduls wie in der Registry).
 * @param {string} instanceId @param {object|null} model gespeicherter Stand
 * @param {{ keep?: boolean, confirm?: boolean }} [opts]
 */
async function mount(instanceId, model, { keep = false, confirm = true } = {}) {
  await prepare();
  if (!keep) unmountAll();
  const states = { [instanceId]: model };
  const notes = [];
  const confirms = [];
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
    i18n: { t: (k, p) => (k.startsWith(`modules.${ID}.`) ? tr(k.slice(ID.length + 9), p) : k), tf: () => tr, getLanguage: () => 'de' },
    eventBus: {
      on: (n, fn) => handlers.push([n, fn]),
      off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
      emit: (n, p) => { for (const [a, f] of [...handlers]) if (a === n) f(p); },
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
  const q = (sel) => /** @type {HTMLElement} */ (container.querySelector(sel));
  const qa = (sel) => /** @type {HTMLElement[]} */ ([...container.querySelectorAll(sel)]);
  const vm = () => Alpine.$data(container.querySelector('[x-data]'));
  const h = {
    inst, states, notes, confirms, container, q, qa, vm,
    saved: () => plain(states[instanceId]),
    stepTitles: () => qa('.makigami__step-title-input').map((el) => /** @type {HTMLInputElement} */ (el).value),
    roleLabels: () => qa('.makigami__role-label-input').map((el) => /** @type {HTMLInputElement} */ (el).value),
    /** Punkte je Rolle: true = wirkt mit. */
    dots: () => qa('tbody tr[data-role-id]').map((row) => [...row.querySelectorAll('.makigami__dot')]
      .map((b) => b.classList.contains('makigami__dot--active'))),
    dot: (roleId, stepId) => q(`.makigami__dot[data-role-id="${roleId}"][data-step-id="${stepId}"]`),
    card: (stepId) => q(`.makigami__card[data-step-id="${stepId}"]`),
    time: (stepId, kind) => /** @type {HTMLInputElement} */ (q(`[data-action="edit-${kind}-time"][data-step-id="${stepId}"]`)),
    kpi: (key) => q(`[data-kpi="${key}"]`).textContent,
    type: async (el, value) => {
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await settle();
    },
    leave: async (el) => {
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new FocusEvent('blur'));
      el.blur();
      await settle();
    },
    key: async (el, key, init = {}) => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
      await settle();
    },
    click: async (el) => { el.click(); await settle(); },
  };
  return h;
}

suite('makigami: Viewmodel im Browser', () => {
  test('Leerzustand: Hinweis und zwei Knöpfe, keine Matrix, Kennzahlen als Strich, nichts gespeichert', async () => {
    const h = await mount('mk-1', null);
    assertTrue(h.q('.makigami__matrix-empty') !== null, 'Leerfläche fehlt');
    assertEqual(h.q('.makigami__matrix'), null);
    assertEqual(h.qa('.makigami__matrix-empty [x-command]').length, 2);
    assertDeepEqual(['process', 'wait', 'lead', 'pce'].map((k) => h.kpi(k)), ['—', '—', '—', '—']);
    assertEqual(h.q('.makigami__empty').textContent, tr('stepsEmpty'));
    assertTrue(h.q('[data-ref="settings"]').hidden, 'Einstellungen offen');
    assertEqual(h.states['mk-1'], null);
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Altprojekt: alle Werte sichtbar, Laden ist kein Verlaufsschritt', async () => {
    const old = await legacyA();
    const h = await mount('mk-1', plain(old));
    assertEqual(h.inst.historyCan('undo'), false);
    assertEqual(/** @type {HTMLInputElement} */ (h.q('[data-ref="title"]')).value, old.title);
    assertDeepEqual(h.roleLabels(), ['Kunde', 'Sachbearbeitung Reklamationsmanagement', '']);
    assertDeepEqual(h.stepTitles(), old.steps.map((s) => s.title));
    assertDeepEqual(h.qa('.makigami__step-idx').map((el) => el.textContent), ['S1', 'S2', 'S3', 'S4']);
    assertDeepEqual(h.dots(), [[true, false, false, false], [true, false, false, true], [false, true, false, false]]);
    assertDeepEqual(h.qa('.makigami__card-title').map((el) => el.textContent), ['Reklamation erfassen', old.steps[1].title, 'S3', 'Gutschrift buchen']);
    assertDeepEqual(h.qa('.makigami__card').map((el) => el.dataset.expanded), ['true', 'false', 'true', 'true']);
    await until(() => h.card('s-2').querySelector('.makigami__card-body').style.display === 'none');
    assertEqual(/** @type {HTMLElement} */ (h.card('s-2').querySelector('.makigami__card-body')).style.display, 'none');
    // Unlesbar ist nur „20 Minuten“ (s-3, Bearbeitung): markiert, ohne neu zu lesen.
    assertDeepEqual(h.vm().invalidTimes, [{ stepId: 's-3', field: 'processTime' }]);
    assertTrue(h.time('s-3', 'process').classList.contains('makigami__time-input--invalid'));
    assertEqual(h.time('s-3', 'process').getAttribute('aria-invalid'), 'true');
    assertEqual(h.time('s-1', 'process').getAttribute('aria-invalid'), 'false');
    assertEqual(h.time('s-2', 'process').value, '1,5h');
    assertEqual(/** @type {HTMLTextAreaElement} */ (h.q(`#mk-notes-mk-1-s-1`)).value, 'Zeile 1\nZeile 2');
    assertDeepEqual(h.qa('.makigami__card[data-step-id="s-1"] .makigami__chip--muda.makigami__chip--active').map((el) => el.dataset.mudaId),
      ['muda-motion', 'muda-medien']);
    assertDeepEqual(h.qa('.makigami__card[data-step-id="s-1"] [data-action="toggle-role-chip"].makigami__chip--active').map((el) => el.dataset.roleId),
      ['r-kd', 'r-sb']);
    assertEqual(h.q('.makigami__chip--muda[data-step-id="s-1"][data-muda-id="muda-transport"] .makigami__chip-label').textContent, 'Botengang');
    assertEqual(h.q('.makigami__chip--muda[data-step-id="s-1"][data-muda-id="muda-waiting"] .makigami__chip-label').textContent, tr('muda.waiting'));
    assertEqual(h.q('.makigami__chip--muda[data-step-id="s-1"][data-muda-id="muda-waiting"]').getAttribute('style'), '--chip-color:#d0021b');
    // Einstellungen offen, Kürzel, Namen mit Platzhalter, Einheiten mit Faktor im Format der App-Sprache.
    assertTrue(!h.q('[data-ref="settings"]').hidden, 'Einstellungen zu');
    assertEqual(h.qa('[data-action="edit-muda-code"]').length, 9);
    const transport = /** @type {HTMLInputElement} */ (h.q('[data-action="edit-muda-label"][data-muda-id="muda-transport"]'));
    assertEqual(transport.value, 'Botengang');
    assertEqual(transport.placeholder, tr('muda.transport'));
    assertDeepEqual(h.qa('[data-action="edit-unit-label"]').map((el) => /** @type {HTMLInputElement} */ (el).value), ['s', 'min', 'h', 'd', 'wk']);
    assertDeepEqual(h.qa('[data-action="edit-unit-factor"]').map((el) => /** @type {HTMLInputElement} */ (el).value), ['1', '60', '3600', '28800', '144000']);
    // Kennzahlen: 20 Minuten zählt nicht mit.
    const units = h.vm().model.timeUnits;
    assertEqual(h.kpi('process'), formatDuration(115 * 60, units));
    assertEqual(h.kpi('process'), '1h 55min');
    assertEqual(h.kpi('wait'), formatDuration(61 * 3600, units));
    assertEqual(h.kpi('lead'), formatDuration(61 * 3600 + 115 * 60, units));
    assertEqual(h.kpi('pce'), '3,0 %');
    assertDeepEqual(h.states['mk-1'], plain(old));
    unmountAll();
  });

  test('Hilfe-Anker an Beschriftungen, Abschnitten und Spaltenköpfen; Punkte, Chips, Faktor und Löschknöpfe leer', async () => {
    const h = await mount('mk-1', { ...plain(SMALL), settingsOpen: true });
    const keys = h.qa('[data-help-key]').map((el) => el.getAttribute('data-help-key')).filter(Boolean);
    const count = (k) => keys.filter((x) => x === `modules.${ID}.${k}`).length;
    for (const k of ['fields.roles.help', 'fields.steps.help', 'fields.mudaCategories.help', 'fields.timeUnits.help',
      'fields.mudaCategories.code.help', 'fields.mudaCategories.label.help', 'fields.mudaCategories.color.help',
      'fields.timeUnits.label.help', 'fields.timeUnits.factorSeconds.help', 'fields.settingsOpen.help',
      'types.MakigamiKpi.process', 'types.MakigamiKpi.wait', 'types.MakigamiKpi.lead', 'types.MakigamiKpi.pce']) {
      assertEqual(count(k), 1, k);
    }
    for (const k of ['fields.steps.description.help', 'fields.steps.processTime.help', 'fields.steps.waitTime.help',
      'fields.steps.notes.help', 'actions.setParticipation.help', 'actions.setMuda.help']) {
      assertEqual(count(k), 3, k);
    }
    for (const el of [...h.qa('.makigami__dot'), ...h.qa('.makigami__chip'), ...h.qa('.makigami__head-delete:not([data-action="close-settings"])'),
      ...h.qa('[data-action="edit-unit-factor"]')]) {
      assertEqual(el.getAttribute('data-help-key'), '', el.className);
    }
    // Anker nie an Griffen und nie an Eingaben.
    for (const el of [...h.qa('.makigami__drag-handle'), ...h.qa('input[type="text"]'), ...h.qa('textarea')]) {
      assertTrue(!el.getAttribute('data-help-key'), el.className);
    }
    // Feld-ids je Instanz und Schritt, die Beschriftung zeigt darauf.
    const label = /** @type {HTMLLabelElement} */ (h.q('.makigami__card[data-step-id="s-2"] label[for]'));
    assertEqual(label.htmlFor, 'mk-desc-mk-1-s-2');
    assertTrue(h.q(`#${label.htmlFor}`) !== null);
    unmountAll();
  });

  test('Mitwirkung und Verschwendung: Punkt und Chip schalten, je ein Schritt; Rückgängig/Wiederholen', async () => {
    const h = await mount('mk-1', plain(SMALL));
    await h.click(h.dot('r-2', 's-2'));
    await until(() => h.dot('r-2', 's-2').classList.contains('makigami__dot--active'));
    assertEqual(h.dot('r-2', 's-2').getAttribute('aria-pressed'), 'true');
    assertDeepEqual(h.saved().steps[1].roleIds, ['r-2']);
    const chip = h.q('[data-action="toggle-role-chip"][data-step-id="s-2"][data-role-id="r-2"]');
    assertTrue(chip.classList.contains('makigami__chip--active'), 'Chip folgt dem Punkt');
    await h.click(chip);
    await until(() => !h.dot('r-2', 's-2').classList.contains('makigami__dot--active'));
    assertDeepEqual(h.saved().steps[1].roleIds, []);
    await h.click(h.q('.makigami__chip--muda[data-step-id="s-1"][data-muda-id="muda-waiting"]'));
    await until(() => h.saved().steps[0].mudaIds.length === 1);
    assertDeepEqual(h.saved().steps[0].mudaIds, ['muda-waiting']);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig Verschwendung');
    await until(() => h.saved().steps[0].mudaIds.length === 0);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig Chip');
    await until(() => h.dot('r-2', 's-2').classList.contains('makigami__dot--active'));
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen');
    await until(() => !h.dot('r-2', 's-2').classList.contains('makigami__dot--active'));
    unmountAll();
  });

  test('Karten klappen über das Ansichtsfeld collapsed; Einstellungen über Leiste und Schließknopf', async () => {
    const h = await mount('mk-1', plain(SMALL));
    const toggle = /** @type {HTMLElement} */ (h.card('s-1').querySelector('.makigami__card-toggle'));
    assertEqual(toggle.getAttribute('aria-label'), tr('cardCollapse'));
    await h.click(toggle);
    await until(() => h.card('s-1').dataset.expanded === 'false');
    assertDeepEqual(h.saved().collapsed, ['s-1']);
    assertEqual(toggle.getAttribute('aria-expanded'), 'false');
    assertEqual(toggle.getAttribute('aria-label'), tr('cardExpand'));
    await h.click(toggle);
    await until(() => h.card('s-1').dataset.expanded === 'true');
    assertDeepEqual(h.saved().collapsed, []);
    const action = h.inst.getActions().find((a) => a.icon === 'action.settings');
    assertEqual(action.dynamicText(h.vm(), tr), tr('settingsOpen'));
    action.onClick(h.vm());
    await until(() => !h.q('[data-ref="settings"]').hidden);
    assertEqual(h.saved().settingsOpen, true);
    assertEqual(action.dynamicText(h.vm(), tr), tr('settingsClose'));
    await h.click(h.q('[data-action="close-settings"]'));
    await until(() => h.q('[data-ref="settings"]').hidden);
    assertEqual(h.saved().settingsOpen, false);
    unmountAll();
  });

  test('Dauerfeld: Tippen speichert den Text, Verlassen schreibt die Normalform; nichts zu tun ist kein Schritt', async () => {
    const h = await mount('mk-1', plain(SMALL));
    const el = h.time('s-2', 'process');
    await h.type(el, '90min');
    assertEqual(h.saved().steps[1].processTime, '90min');
    await h.leave(el);
    await until(() => h.saved().steps[1].processTime === '1h 30min');
    assertEqual(el.value, '1h 30min');
    assertEqual(h.kpi('process'), '1h 45min');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig Normalform');
    await until(() => h.saved().steps[1].processTime === '90min');
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen Normalform');
    await until(() => h.saved().steps[1].processTime === '1h 30min');
    // Schon in Normalform, leer oder unlesbar: kein Kommando, kein Schritt.
    const before = h.saved();
    const undoBefore = h.inst.historyCan('undo');
    await h.leave(h.time('s-1', 'process'));
    await h.leave(h.time('s-2', 'wait'));
    assertDeepEqual(h.saved(), before);
    await h.type(h.time('s-3', 'wait'), 'bald');
    await until(() => h.time('s-3', 'wait').classList.contains('makigami__time-input--invalid'));
    assertEqual(h.q('.makigami__card[data-step-id="s-3"] .makigami__time-row .makigami__field:last-child .makigami__field-error').style.display, '');
    const afterTyping = h.saved();
    await h.leave(h.time('s-3', 'wait'));
    assertDeepEqual(h.saved(), afterTyping);
    assertEqual(h.time('s-3', 'wait').value, 'bald');
    assertEqual(undoBefore, true);
    unmountAll();
  });

  test('Normalform ohne Änderung: ein Altprojekt bleibt ohne Verlaufsschritt', async () => {
    const h = await mount('mk-1', plain(await legacyA()));
    await h.leave(h.time('s-1', 'process'));
    await h.leave(h.time('s-3', 'process'));
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Löschen: Schritt und Rolle fragen mit Namen; Abbruch lässt alles stehen', async () => {
    const h = await mount('mk-1', plain(SMALL), { confirm: false });
    await h.click(h.q('[data-action="delete-step"][data-step-id="s-2"]'));
    assertEqual(h.confirms.length, 1);
    assertEqual(h.confirms[0].message, tr('confirm.removeStep', { title: 'Prüfen' }));
    assertEqual(h.saved().steps.length, 3);
    const k = await mount('mk-1', plain(SMALL));
    await k.click(k.q('[data-action="delete-role"][data-role-id="r-1"]'));
    assertEqual(k.confirms.length, 1);
    assertEqual(k.confirms[0].message, tr('confirm.removeRole', { label: 'Einkauf' }));
    await until(() => k.roleLabels().length === 1);
    assertDeepEqual(k.saved().steps[0].roleIds, []);
    await k.click(k.q('[data-action="delete-step"][data-step-id="s-2"]'));
    await until(() => k.stepTitles().length === 2);
    assertDeepEqual(k.stepTitles(), ['Bestellen', 'Einlagern']);
    assertEqual(k.confirms[1].message, tr('confirm.removeStep', { title: 'Prüfen' }));
    unmountAll();
  });

  test('Einstellungen: letzter Eintrag gesperrt mit Hinweis, Faktor über x-field, Zurücksetzen fragt', async () => {
    const h = await mount('mk-1', {
      ...plain(SMALL), settingsOpen: true,
      mudaCategories: [{ id: 'm-a', code: 'A', label: 'Alpha', color: '#112233' }, { id: 'm-b', code: 'B', label: '', color: '#445566' }],
      timeUnits: [{ id: 'u-min', label: 'min', factorSeconds: 60 }],
    });
    const mudaDel = () => /** @type {HTMLButtonElement[]} */ (h.qa('[data-action="delete-muda"]'));
    assertDeepEqual(mudaDel().map((b) => b.disabled), [false, false]);
    assertEqual(mudaDel()[0].title, 'common.delete');
    const unitDel = /** @type {HTMLButtonElement} */ (h.q('[data-action="delete-unit"]'));
    assertTrue(unitDel.disabled, 'letzte Einheit nicht gesperrt');
    assertEqual(unitDel.title, tr('hints.lastUnit'));
    await h.click(mudaDel()[1]);
    await until(() => mudaDel().length === 1);
    assertTrue(mudaDel()[0].disabled, 'letzte Art nicht gesperrt');
    assertEqual(mudaDel()[0].title, tr('hints.lastMuda'));
    assertEqual(mudaDel()[0].getAttribute('aria-label'), tr('hints.lastMuda'));
    // Faktor: Text mit Dezimalkomma; Unlesbares wird abgewiesen.
    const factor = /** @type {HTMLInputElement} */ (h.q('[data-action="edit-unit-factor"]'));
    assertEqual(factor.type, 'text');
    await h.type(factor, '90,5');
    await until(() => h.saved().timeUnits[0].factorSeconds === 90.5);
    await h.type(factor, '0');
    assertEqual(h.saved().timeUnits[0].factorSeconds, 90.5);
    await h.leave(factor);
    // Hinzufügen und Zurücksetzen.
    await h.click(h.q('[data-action="add-unit"]'));
    await until(() => h.saved().timeUnits.length === 2);
    assertTrue(!(/** @type {HTMLButtonElement} */ (h.q('[data-action="delete-unit"]'))).disabled, 'zwei Einheiten: Löschen frei');
    const n = h.confirms.length;
    await h.click(h.q('[data-action="reset-settings"]'));
    assertEqual(h.confirms.length, n + 1);
    assertEqual(h.confirms[n].message, tr('confirm.resetSettings'));
    await until(() => h.saved().mudaCategories.length === 8);
    assertEqual(h.saved().timeUnits.length, 4);
    // Name ändern per x-model.
    const label = /** @type {HTMLInputElement} */ (h.q('[data-action="edit-muda-label"][data-muda-id="muda-transport"]'));
    await h.type(label, 'Botengang');
    assertEqual(h.saved().mudaCategories[0].label, 'Botengang');
    assertEqual(h.q('.makigami__chip--muda[data-step-id="s-1"][data-muda-id="muda-transport"] .makigami__chip-label').textContent, 'Botengang');
    unmountAll();
  });

  test('Umsortieren mit Alt+Pfeil: Schritt nach rechts, Rolle nach unten, je ein Schritt', async () => {
    const h = await mount('mk-1', plain(SMALL));
    const stepGrip = /** @type {HTMLElement} */ (h.q('.makigami__drag-handle--step[data-step-id="s-1"]'));
    assertEqual(stepGrip.tagName, 'BUTTON');
    assertEqual(stepGrip.getAttribute('aria-label'), 'common.reorder');
    stepGrip.focus();
    await h.key(stepGrip, 'ArrowRight', { altKey: true });
    await until(() => h.stepTitles()[1] === 'Bestellen');
    assertDeepEqual(h.stepTitles(), ['Prüfen', 'Bestellen', 'Einlagern']);
    assertDeepEqual(h.dots(), [[false, true, false], [false, false, true]]);
    // Ein senkrechter Pfeil am Schrittgriff hat kein Ziel (Gruppen abgeschlossen).
    const again = /** @type {HTMLElement} */ (h.q('.makigami__drag-handle--step[data-step-id="s-1"]'));
    again.focus();
    await h.key(again, 'ArrowDown', { altKey: true });
    assertDeepEqual(h.stepTitles(), ['Prüfen', 'Bestellen', 'Einlagern']);
    const roleGrip = /** @type {HTMLElement} */ (h.q('.makigami__drag-handle--role[data-role-id="r-1"]'));
    roleGrip.focus();
    await h.key(roleGrip, 'ArrowDown', { altKey: true });
    await until(() => h.roleLabels()[1] === 'Einkauf');
    assertDeepEqual(h.roleLabels(), ['Lager', 'Einkauf']);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig Rolle');
    await until(() => h.roleLabels()[0] === 'Einkauf');
    assertDeepEqual(h.stepTitles(), ['Prüfen', 'Bestellen', 'Einlagern']);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig Schritt');
    await until(() => h.stepTitles()[0] === 'Bestellen');
    unmountAll();
  });

  test('Vorschau der Geste: gezogenes Element blass, Marke am Ziel auf der richtigen Seite', async () => {
    const h = await mount('mk-1', plain(SMALL));
    h.vm().state.dropPreview = { group: 'steps', index: 2, id: 's-1' };
    await settle();
    const heads = () => h.qa('.makigami__matrix-step-head');
    assertTrue(heads()[0].classList.contains('makigami__matrix-step-head--dragging'));
    assertTrue(heads()[2].classList.contains('makigami__matrix-step-head--drag-over'));
    assertTrue(heads()[2].classList.contains('makigami__matrix-step-head--drag-over-end'));
    h.vm().state.dropPreview = { group: 'roles', index: 0, id: 'r-2' };
    await settle();
    const roles = h.qa('.makigami__matrix-role-head');
    assertTrue(roles[1].classList.contains('makigami__matrix-role-head--dragging'));
    assertTrue(roles[0].classList.contains('makigami__matrix-role-head--drag-over'));
    assertTrue(!roles[0].classList.contains('makigami__matrix-role-head--drag-over-end'));
    assertEqual(heads().filter((el) => el.className.includes('--drag')).length, 0);
    h.vm().state.dropPreview = null;
    await settle();
    assertEqual(h.qa('[class*="--drag"]').length, 0);
    unmountAll();
  });

  test('Zwei Instanzen mit gleichen Schritt-ids: eigene DOM-ids, getrennte Zustände', async () => {
    const a = await mount('mk-a', plain(SMALL));
    const b = await mount('mk-b', plain(SMALL), { keep: true });
    const ids = [...document.querySelectorAll('[id^="mk-"]')].map((el) => el.id);
    assertEqual(new Set(ids).size, ids.length);
    assertTrue(a.q('#mk-desc-mk-a-s-1') !== null && b.q('#mk-desc-mk-b-s-1') !== null);
    await b.click(b.dot('r-2', 's-1'));
    await until(() => b.dot('r-2', 's-1').classList.contains('makigami__dot--active'));
    assertTrue(!a.dot('r-2', 's-1').classList.contains('makigami__dot--active'));
    await a.click(/** @type {HTMLElement} */ (a.card('s-1').querySelector('.makigami__card-toggle')));
    await until(() => a.card('s-1').dataset.expanded === 'false');
    assertEqual(b.card('s-1').dataset.expanded, 'true');
    assertEqual(a.inst.historyCan('undo'), true);
    assertTrue(b.inst.historyStep('undo'), 'Rückgängig B');
    await until(() => !b.dot('r-2', 's-1').classList.contains('makigami__dot--active'));
    assertEqual(a.card('s-1').dataset.expanded, 'false');
    unmountAll();
  });

  test('Exporte: JSON zeichengleich mit der Altform, Tabellen mit Marke und Kennzahlen, Bild mit Ecke', async () => {
    const h = await mount('mk-1', plain(await legacyA()));
    const blobs = [];
    const io = {
      downloadFile: () => {},
      downloadBlob: (blob, name) => blobs.push({ blob, name }),
      ensureXLSX: async () => { throw new Error('nicht geladen'); },
    };
    await runExport(h.vm()._ui, 'json', io);
    assertEqual(blobs.length, 1);
    assertEqual(blobs[0].name, 'reklamation-gutschrift-q4.json');
    assertEqual(await blobs[0].blob.text(), await fixtureText('legacy-export.json'));
    const ui = h.vm()._ui;
    const rows = ui.exports.table.call(ui.component);
    assertDeepEqual(rows[0], ['exportColStep', 'exportColActivity', 'exportColRoles', 'exportColProcess', 'exportColWait', 'exportColMuda', 'exportColNotes'].map((k) => tr(k)));
    assertDeepEqual(rows[1].slice(2, 6), ['Kunde; Sachbearbeitung Reklamationsmanagement', '15min', '1h', 'Bewegung; Medienbruch']);
    assertEqual(rows[2][2], tr('rolePlaceholder'));
    const sheets = ui.exports.tables.call(ui.component);
    assertDeepEqual(Object.keys(sheets), [tr('exportSheetMatrix'), tr('exportSheetSteps'), tr('exportSheetKPI')]);
    assertDeepEqual(sheets[tr('exportSheetMatrix')][1], ['Kunde', 'x', '', '', '']);
    assertDeepEqual(sheets[tr('exportSheetKPI')], [
      [tr('kpiProcess'), '1h 55min'],
      [tr('kpiWait'), h.kpi('wait')],
      [tr('kpiLead'), h.kpi('lead')],
      [tr('kpiPCE'), '3,0 %'],
    ]);
    const svg = ui.exports.image.call(ui.component);
    assertTrue(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="224"'), svg.slice(0, 100));
    assertTrue(svg.includes(`>${tr('rolesHeaderRows')} / ${tr('rolesHeaderCols')}</text>`), 'Ecke fehlt');
    assertEqual(ui.exports.fileName.call(ui.component), 'reklamation-gutschrift-q4');
    unmountAll();
  });
});
