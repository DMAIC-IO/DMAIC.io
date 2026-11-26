/**
 * FMEA: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem echten
 * Modul und der echten Vorlage. Prüft: Altprojekt ohne Verlaufsschritt,
 * Textfelder über `x-model` (äußere und innere Schleife), Stufen und
 * Senkungen über `x-field` (nullbar, Leeroption), Merkmal, Methode und Art
 * über `x-set`, Skalenzellen (schreiben nur bei Änderung), Anlegen, Löschen
 * und Zuklappen über `x-command`, den Hinweis nach dem Sortieren, das
 * Burndown-Fenster, Hilfe-Anker und ids je Instanz — mit Rückgängig.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import Alpine from '../../../vendor/alpinejs/csp.js';
import { registerCommandDirectives } from '../../../js/core/command-directives.js';
import { registerFieldDirective } from '../../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../../js/core/widget-directive.js';
import { WIDGETS } from '../../../js/widgets/registry.js';
import { WIDGET_I18N } from '../../widget-i18n.js';
import mod from '../../../js/modules/fmea/viewmodel/viewmodel.js';
import { LEGACY_STATE } from './legacy.js';

const ID = 'fmea';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const until = async (fn, n = 100) => { for (let i = 0; i < n && !fn(); i++) await new Promise((r) => setTimeout(r, 20)); };
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
    registerWidgetDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
    registerCommandDirectives(Alpine);
    if (!Alpine.version) Alpine.start();
    UI = await (await fetch(new URL(`../../../js/modules/${ID}/resources/i18n/ui.de.json`, import.meta.url), { cache: 'no-cache' })).json();
    prepared = true;
  }
  // Eine Seite, die die Vorlage schon mitbringt (unter Trusted Types), behält sie.
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

const legacy = () => JSON.parse(JSON.stringify(LEGACY_STATE));

/**
 * Eine Instanz einhängen (eigene Kopie des Moduls wie in der Registry).
 * @param {string} instanceId @param {object|null} model @param {{ keep?: boolean, settings?: any }} [opts]
 */
async function mount(instanceId, model, { keep = false, settings } = {}) {
  await prepare();
  if (!keep) unmountAll();
  const states = { [instanceId]: model };
  /** @type {any[][]} */
  const notes = [];
  /** @type {any[]} */
  const dialogs = [];
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
      get: (k) => (k === 'settings.fmea' ? settings : undefined),
      getChartEdits: () => null,
      setChartEdit: () => {},
    },
    i18n: { t: (k) => k, tf: () => tr, getLanguage: () => 'de' },
    eventBus: bus,
    chartManager: { create: async (el, type, config) => { el.append(document.createElement('svg')); return { config }; }, update: (c, config) => { c.config = config; }, destroy: () => {} },
    notify: (...args) => { notes.push(args); },
    dialog: { confirm: async () => true, show: (o) => { dialogs.push(o); const node = o.content; const home = node.parentNode; const box = document.createElement('div'); document.body.append(box); box.append(node); const handle = { close: () => { home.append(node); box.remove(); o.onClose?.(); } }; o.handle = handle; return handle; } },
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
  const card = (id) => q(`.fmea__risk-card[data-risk-id="${id}"]`);
  /** Wert setzen und das Feld verlassen (ein Feldbesuch). */
  const enter = async (el, value) => {
    el.focus();
    if (el.type === 'checkbox') el.checked = value; else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
    await settle();
  };
  return {
    inst, states, notes, dialogs, container, q, qa, card, enter,
    vm: () => Alpine.$data(container.querySelector('[x-data]')),
    badge: (id) => card(id).querySelector('[data-rpn-badge]').textContent,
    click: async (el) => { el.click(); await settle(); },
    undo: async () => { const ok = inst.historyStep('undo'); await settle(); return ok; },
    redo: async () => { const ok = inst.historyStep('redo'); await settle(); return ok; },
  };
}

suite('fmea: Viewmodel im Browser', () => {
  test('Altprojekt: Karten, Abzeichen, Kennzahlen, Zuklappen, ohne Verlaufsschritt', async () => {
    const h = await mount('f-1', legacy());
    assertDeepEqual(h.qa('.fmea__risk-card').map((c) => c.dataset.riskId), ['r1', 'x2', 'r3']);
    // x2 hat im Altprojekt S '15', auf 10 geklemmt (A9): RPN 10·3·2 = 60.
    assertDeepEqual(['r1', 'x2', 'r3'].map(h.badge), ['RPN 216', 'RPN 60', 'RPN 343']);
    assertTrue(h.card('r3').classList.contains('fmea__risk-card--collapsed'));
    assertTrue(h.card('r1').classList.contains('fmea__risk-card--critical'));
    assertEqual(h.q('[data-stat="total"]').textContent, '3');
    assertEqual(h.q('[data-stat="max"]').textContent, '343');
    assertEqual(h.q('[data-stat="avg"]').textContent, '206');
    assertEqual(h.card('x2').querySelector('select[name="sev"]').value, '10');
    assertEqual(h.card('r1').querySelector('select[name="sev"]').value, '9');
    assertEqual(h.card('r1').querySelector('select[name="deltaO"]').value, '2');
    assertEqual(h.card('r1').querySelector('[data-proj-rpn]').textContent, 'RPN 27');
    assertEqual(h.q('[data-method="rpn"]').classList.contains('btn--active'), true);
    assertEqual(h.q('[data-method="rpn"]').getAttribute('aria-checked'), 'true');
    assertEqual(h.inst.historyCan('undo'), false);
  });

  test('x-model: Risiko- und Maßnahmentext speichern, ein Schritt je Feldbesuch', async () => {
    const h = await mount('f-1', legacy());
    const vm = h.vm();
    await h.enter(h.card('r1').querySelector('textarea[name="failureMode"]'), 'Neu');
    await h.enter(h.card('r1').querySelector('textarea[name="actionText"]'), 'Tun');
    assertEqual(vm.model.risks[0].failureMode, 'Neu');
    assertEqual(vm.model.risks[0].actions[0].text, 'Tun');
    assertTrue(await h.undo());
    assertTrue(vm.model.risks[0].actions[0].text !== 'Tun');
    assertEqual(vm.model.risks[0].failureMode, 'Neu');
    assertTrue(await h.undo());
    assertTrue(vm.model.risks[0].failureMode !== 'Neu');
    assertEqual(h.inst.historyCan('undo'), false);
  });

  test('x-field S/O/D: Zahl, Leeroption null, Abzeichen folgt, Rückgängig', async () => {
    const h = await mount('f-1', legacy());
    const vm = h.vm();
    const sev = () => h.card('x2').querySelector('select[name="sev"]');
    assertEqual(vm.model.risks[1].sev, 10);
    await h.enter(sev(), '5');
    assertEqual(vm.model.risks[1].sev, 5);
    assertEqual(h.badge('x2'), 'RPN 30');
    await h.enter(sev(), '');
    assertEqual(vm.model.risks[1].sev, null);
    assertEqual(h.badge('x2'), 'RPN —');
    assertTrue(await h.undo());
    assertEqual(vm.model.risks[1].sev, 5);
    assertEqual(sev().value, '5');
    assertTrue(await h.undo());
    assertEqual(vm.model.risks[1].sev, 10);
    assertEqual(h.badge('x2'), 'RPN 60');
    assertEqual(h.inst.historyCan('undo'), false);
  });

  test('Senkung, erledigt, Datum: Zielwerte folgen', async () => {
    const h = await mount('f-1', legacy());
    const vm = h.vm();
    const row = () => h.card('r1').querySelectorAll('[data-action-body] tr')[1];
    await h.enter(row().querySelector('select[name="deltaS"]'), '3');
    assertEqual(vm.model.risks[0].actions[1].deltaS, 3);
    assertEqual(h.card('r1').querySelector('[data-proj-s]').textContent, '6');
    await h.enter(row().querySelector('input[type="checkbox"]'), true);
    assertEqual(vm.model.risks[0].actions[1].done, true);
    await h.enter(row().querySelector('input[name="actionDate"]'), '2026-05-01');
    assertEqual(vm.model.risks[0].actions[1].date, '2026-05-01');
    assertTrue(await h.undo());
    assertEqual(vm.model.risks[0].actions[1].date, '2026-04-15');
  });

  test('Merkmal: Abzeichen und Hinweis S ≥ 9', async () => {
    const h = await mount('f-1', legacy());
    const hint = () => /** @type {HTMLElement} */ (h.card('x2').querySelector('[data-special-char-hint]'));
    // x2 steht mit S 10 (aus '15' geklemmt) schon über der Schwelle.
    assertEqual(hint().style.display, '');
    await h.enter(h.card('x2').querySelector('select[name="sev"]'), '');
    assertEqual(hint().style.display, 'none');
    await h.enter(h.card('x2').querySelector('select[name="sev"]'), '9');
    assertEqual(hint().style.display, '');
    assertEqual(h.card('r1').querySelector('[data-special-char-badge]').textContent, 'CC');
    await h.enter(h.card('r1').querySelector('select[name="specialChar"]'), 'SC');
    assertEqual(h.vm().model.risks[0].specialChar, 'SC');
    assertTrue(h.card('r1').querySelector('[data-special-char-badge]').classList.contains('fmea__badge--sc'));
  });

  test('x-set Methode und Art: Abzeichen wechseln, Rückgängig', async () => {
    const h = await mount('f-1', legacy());
    const vm = h.vm();
    await h.click(h.q('[data-method="ap"]'));
    assertEqual(vm.model.method, 'ap');
    assertEqual(h.badge('r1'), 'AP H');
    await h.click(h.q('[data-fmea-type="process"]'));
    assertEqual(vm.model.fmeaType, 'process');
    assertTrue(await h.undo());
    assertEqual(vm.model.fmeaType, 'design');
    assertTrue(await h.undo());
    assertEqual(vm.model.method, 'rpn');
    assertEqual(h.badge('r1'), 'RPN 216');
  });

  test('Skalenzelle: unverändert verlassen schreibt nichts, Ändern ein Schritt, Rückgängig stellt her', async () => {
    const h = await mount('f-1', legacy());
    const vm = h.vm();
    const cell = () => h.q('[data-scale="sevLow"]');
    const before = cell().textContent;
    assertEqual(before, tr('sevLow'));
    const leave = async (text) => {
      if (text !== undefined) cell().textContent = text;
      cell().dispatchEvent(new FocusEvent('blur'));
      await settle();
    };
    await leave();
    assertDeepEqual(Object.keys(vm.model.scales).sort(), ['ap.design.sev.10.meaning', 'sevHigh']);
    assertEqual(h.inst.historyCan('undo'), false);
    await leave('Eigen');
    assertEqual(vm.model.scales.sevLow, 'Eigen');
    assertTrue(await h.undo());
    assertEqual(vm.model.scales.sevLow, undefined);
    assertEqual(cell().textContent, before);
    assertEqual(h.q('[data-scale="sevHigh"]').textContent, 'Kunde verärgert (eigener Text)');
    assertEqual(h.q('[data-scale="occLowRate"]').textContent, tr('occLowRate'));
    assertEqual(h.qa('[data-ref="rpn-scales"] [data-scale]').length, 30);
  });

  test('x-command: Maßnahme anlegen und löschen, Zuklappen, Risiko löschen samt Rückgängig', async () => {
    const h = await mount('f-1', legacy());
    const vm = h.vm();
    await h.click(h.card('r3').querySelector('[data-action="add-action"]'));
    assertEqual(vm.model.risks[2].actions.length, 1);
    await h.click(h.card('r1').querySelector('[data-action="del-action"]'));
    assertDeepEqual(vm.model.risks[0].actions.map((a) => a.id), ['a2']);
    await h.click(h.card('r3').querySelector('[data-action="toggle-collapse"]'));
    assertDeepEqual([...vm.model.collapsed], []);
    await h.click(h.card('r3').querySelector('[data-action="toggle-collapse"]'));
    await h.click(h.card('r3').querySelector('[data-action="del-risk"]'));
    assertDeepEqual(vm.model.risks.map((r) => r.id), ['r1', 'x2']);
    assertDeepEqual([...vm.model.collapsed], []);
    assertTrue(await h.undo());
    assertDeepEqual(vm.model.risks.map((r) => r.id), ['r1', 'x2', 'r3']);
    assertDeepEqual([...vm.model.collapsed], ['r3']);
    assertEqual(vm.model.risks[2].actions.length, 1);
    assertTrue(h.card('r3').classList.contains('fmea__risk-card--collapsed'));
  });

  test('Sortieren: Reihenfolge und Hinweis je Methode, auch ohne Oberfläche', async () => {
    const h = await mount('f-1', legacy());
    const vm = h.vm();
    vm.model.sortByPriority({});
    await settle();
    assertDeepEqual(h.qa('.fmea__risk-card').map((c) => c.dataset.riskId), ['r3', 'r1', 'x2']);
    assertDeepEqual(h.notes.at(-1), [tr('sortedByRPN')]);
    vm.model.method = 'ap';
    vm.model.sortByPriority({});
    await settle();
    assertDeepEqual(h.notes.at(-1), [tr('sortedByAP')]);
  });

  test('Burndown: ohne Daten Hinweis; sonst Widget im Dialog, Schließen räumt ab', async () => {
    const empty = await mount('f-1', null);
    await empty.vm().showBurndown();
    assertDeepEqual(empty.notes.at(-1), [tr('burndownNoData')]);
    assertEqual(empty.dialogs.length, 0);
    const h = await mount('f-2', legacy());
    const vm = h.vm();
    await vm.showBurndown();
    await settle();
    assertEqual(h.dialogs.length, 1);
    const host = h.dialogs[0].content.querySelector('[data-ref="burndown-chart"]');
    assertTrue(host !== null, 'Widget fehlt im geliehenen Knoten');
    await until(() => host.childElementCount > 0);
    assertTrue(host.childElementCount > 0, 'Widget hat nicht gezeichnet');
    assertEqual(vm.state.burndownOpen, true);
    const cfg = vm.burndownChart;
    assertDeepEqual(cfg.series.map((s) => s.name), [tr('burndownPlan'), tr('burndownActual')]);
    assertEqual(cfg.xDateFormat, 'short');
    h.dialogs[0].handle.close();
    await settle();
    assertEqual(vm.state.burndownOpen, false);
    assertEqual(h.q('[data-ref="burndown-chart"]'), null);
  });

  test('Hilfe-Anker und ids je Instanz', async () => {
    const a = await mount('f-1', legacy());
    const b = await mount('f-2', legacy(), { keep: true });
    const keys = a.qa('[data-help-key]').map((el) => el.getAttribute('data-help-key')).filter(Boolean);
    for (const k of ['method', 'fmeaType', 'stats', 'scales', 'riskRatings', 'risks.step', 'risks.sev', 'risks.actions.deltaD']) {
      assertTrue(keys.includes(`modules.${ID}.fields.${k}.help`), k);
    }
    const ida = a.card('r1').querySelector('select[name="sev"]').id;
    const idb = b.card('r1').querySelector('select[name="sev"]').id;
    assertTrue(ida !== '' && ida !== idb, `${ida} / ${idb}`);
    assertEqual(a.card('r1').querySelector(`label[for="${ida}"]`)?.textContent, tr('abbrS'));
  });

  test('neue FMEA: Methode und Art aus den Einstellungen, Unbekanntes → ap/process', async () => {
    const h = await mount('f-1', null, { settings: { defaultMethod: 'rpn', defaultType: 'design' } });
    assertEqual(h.vm().model.method, 'rpn');
    assertEqual(h.vm().model.fmeaType, 'design');
    for (const v of [undefined, null, 'rpn', { defaultMethod: 'xyz', defaultType: 7 }]) {
      const g = await mount('f-1', null, { settings: v });
      assertEqual(g.vm().model.method, 'ap', JSON.stringify(v));
      assertEqual(g.vm().model.fmeaType, 'process', JSON.stringify(v));
    }
  });
});
