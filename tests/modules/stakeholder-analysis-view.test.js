/**
 * Stakeholder-Analyse: das Viewmodel im Browser (viewmodel/viewmodel.js) mit
 * dem echten Modul, der echten Vorlage und dem echten Dialogdienst. Prüft:
 * Leerzustand, Hilfe-Anker, Wertanzeige der Regler aus den Formularwerten,
 * ein Formular für Anlegen und Bearbeiten (Startwerte aus `current`,
 * normalisierte Fremdwerte, unberührtes Formular), Ablehnung des leeren
 * Namens, Löschen mit der Rückfrage des Kommandos, Abbau bei offenem Dialog,
 * Ableitungen nach Änderungen des Agenten, je ein Verlaufsschritt mit
 * Rückgängig/Wiederholen, zwei Instanzen (auch ids je Instanz) und das
 * Altprojekt ohne Verlaufsschritt.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual, fakeChartManager } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerCommandDirectives } from '../../js/core/command-directives.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { createDialogService, DIALOG_TEMPLATE } from '../../js/ui/dialog/dialog.js';
import { inlineTileTemplate } from './tile-test-utils.js';
import mod from '../../js/modules/stakeholder-analysis/viewmodel/viewmodel.js';
import tile from '../../js/modules/stakeholder-analysis/tile/tile.js';
import { validateSchema, resolveSettings } from '../../js/pages/dashboard/tile-settings.js';
import { State } from '../../js/modules/stakeholder-analysis/domain/model.js';

const ID = 'stakeholder-analysis';
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
/** @type {any} */
let DIALOG = null;

/** Text des Moduls unter einem Punktpfad, Platzhalter gefüllt; sonst der Pfad. */
function tr(path, params) {
  const v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), UI);
  if (typeof v !== 'string') return path;
  return params ? v.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : v;
}

async function prepare() {
  if (!prepared) {
    registerCommandDirectives(Alpine);
    registerFieldDirective(Alpine, { i18n: { t: (k) => k, getLanguage: () => 'de' } });
    if (!Alpine.version) Alpine.start();
    UI = await (await fetch(new URL(`../../js/modules/${ID}/resources/i18n/ui.de.json`, import.meta.url), { cache: 'no-cache' })).json();
    await inlineTileTemplate(DIALOG_TEMPLATE);
    DIALOG = createDialogService({ i18n: { t: (k) => k } });
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

/** Die offenen Dialoge. */
const dialogs = () => [...document.querySelectorAll('.dialog')];

function unmountAll() {
  for (const el of dialogs()) el.querySelector('.dialog__cancel')?.click();
  while (mounted.length) {
    const old = mounted.pop();
    Alpine.destroyTree(old);
    old.remove();
  }
  for (const el of dialogs()) el.remove();
}

const plain = (v) => JSON.parse(JSON.stringify(v));
/** Ein Eintrag in Normalform. @param {object} e */
const entry = (e) => ({ id: '', name: '', role: '', power: 3, interest: 3, support: 'neutral', category: 'intern', notes: '', ...e });

/** Ein kleiner Stand der Zielform. */
const SMALL = {
  _schema: { name: ID, version: '1.1' },
  stakeholders: [
    entry({ id: 'a', name: 'Anna Alt', role: 'Leitung', power: 5, interest: 5, support: 'supporter', notes: 'Sponsor' }),
    entry({ id: 'b', name: 'Bert', power: 2, interest: 2, support: 'resistor', category: 'Sponsor' }),
    entry({ id: 'c', name: 'Clara', power: 2, interest: 4, support: 'critic', category: 'kunde' }),
  ],
};

/** Instanz (b) der E2E-Fixture `legacy-project.json` (`_schema` '1.0'). */
const LEGACY_B = {
  _schema: { name: ID, version: '1.0' },
  stakeholders: [
    { name: 'Lieferant Müller GmbH', role: 'Zulieferer', power: 7, interest: '4', support: '', category: 'extern', notes: 'Liefertermine wöchentlich abstimmen' },
    { id: 'b2', name: 'Einkauf', role: 'Strategischer Einkauf', power: 2, interest: 2, support: 'resistor', category: 'Sponsor', notes: '' },
    { id: 'b3', name: 'Kundenservice', role: '', power: '4.7', interest: 5, support: 'critic', category: 'kunde', notes: 'Beschwerden bündeln' },
  ],
};

/**
 * Eine Instanz einhängen (eigene Kopie des Moduls wie in der Registry).
 * @param {string} instanceId
 * @param {object|null} model gespeicherter Zustand
 * @param {{ keep?: boolean, confirm?: boolean }} [opts]
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
    dialog: {
      form: (o) => DIALOG.form(o),
      show: (o) => DIALOG.show(o),
      confirm: async (o) => { confirms.push(o); return confirm; },
    },
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
  /** Das offene Formular (im Dialog) oder null. */
  const form = () => /** @type {HTMLFormElement|null} */ (dialogs().at(-1)?.querySelector('.sha__form') ?? null);
  const h = {
    inst, states, notes, confirms, commands, container, q, qa, vm, form,
    saved: () => plain(states[instanceId]),
    cards: () => qa('.sha__card .sha__card-name').map((el) => el.textContent),
    roles: () => qa('.sha__card .sha__card-role').map((el) => el.textContent),
    strategies: () => qa('.sha__card .sha__strategy').map((el) => el.textContent),
    chips: (quad) => qa(`.sha__matrix-cell[data-quad="${quad}"] .sha__chip`).map((el) => el.textContent.trim()),
    summary: () => qa('.sha__summary-container tbody tr').map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())),
    commNames: () => qa('.sha__comm-name').map((el) => el.textContent),
    commQuads: () => qa('.sha__comm-quad').map((el) => el.textContent),
    warning: () => q('[data-ref="criticWarning"]')?.textContent.trim() ?? null,
    field: (name) => /** @type {any} */ (form()?.querySelector(`[data-field="${name}"]`)),
    out: (ref) => form()?.querySelector(`[data-ref="${ref}"]`)?.textContent ?? null,
    addBtn: () => /** @type {HTMLButtonElement} */ (q('.sha__add-btn')),
    editBtn: (i) => /** @type {HTMLButtonElement} */ (qa('.sha__edit-btn')[i]),
    delBtn: (i) => /** @type {HTMLButtonElement} */ (qa('.sha__del-btn')[i]),
    /** Öffnet den Dialog über einen Knopf und wartet auf das Formular. */
    open: async (btn) => { btn.click(); await until(() => h.form() !== null); await settle(); },
    /** Setzt ein Feld wie eine Eingabe (input und change). */
    set: (name, value) => {
      const el = h.field(name);
      el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    /** Speichern im Dialog. */
    save: async () => { dialogs().at(-1).querySelector('.dialog__confirm').click(); await settle(); },
    cancel: async () => { dialogs().at(-1).querySelector('.dialog__cancel').click(); await until(() => h.form() === null); },
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

suite('stakeholder-analysis: Viewmodel im Browser', () => {
  test('Leerzustand: Zähler 0, Leertexte, keine Tabelle, nichts gespeichert, kein Verlauf', async () => {
    const h = await mount('sa-1', null);
    assertEqual(h.q('.sha__counter').textContent, '0');
    assertEqual(h.q('.sha__empty-title').textContent, tr('noStakeholders'));
    assertEqual(h.q('.sha__summary-container'), null);
    assertEqual(h.q('.sha__comm-container'), null);
    assertEqual(h.warning(), null);
    assertDeepEqual(h.qa('.sha__legend [data-tone]').map((el) => el.dataset.tone), ['supporter', 'neutral', 'critic']);
    assertEqual(h.states['sa-1'], null);
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Hilfe-Anker: Spaltenköpfe und Beschriftungen auf fields, Knöpfe auf actions; Formular, Eingaben und Auswahllisten leer', async () => {
    const h = await mount('sa-1', plain(SMALL));
    const all = [...h.qa('[data-help-key]'), ...h.qa('.sha__modal-forms [data-help-key]')];
    const keys = [...new Set(all)].map((el) => el.getAttribute('data-help-key')).filter(Boolean);
    const count = (k) => keys.filter((x) => x === `modules.${ID}.${k}`).length;
    for (const f of ['name', 'role', 'power', 'interest', 'support']) assertEqual(count(`fields.stakeholders.${f}.help`), 2, f);
    for (const f of ['category', 'notes']) assertEqual(count(`fields.stakeholders.${f}.help`), 1, f);
    assertEqual(count('fields.quadrants.help'), 1);
    assertEqual(count('actions.addStakeholder.help'), 1);
    assertEqual(count('actions.updateStakeholder.help'), 3);
    assertEqual(count('actions.removeStakeholder.help'), 3);
    assertEqual(keys.length, 20, keys.join(', '));
    const form = h.q('.sha__form');
    for (const el of [form, ...form.querySelectorAll('input, select, textarea')]) {
      assertEqual(el.getAttribute('data-help-key'), '', el.getAttribute('data-field') ?? el.tagName);
    }
    unmountAll();
  });

  test('STOPP 1: Regler zeigen 3 beim Anlegen, den Altwert beim Bearbeiten, folgen der Eingabe sofort; gespeichert wird die Zahl', async () => {
    const h = await mount('sa-1', plain(SMALL));
    await h.open(h.addBtn());
    assertEqual(h.field('power').value, '3');
    assertEqual(h.out('vPower'), '3');
    assertEqual(h.out('vInterest'), '3');
    assertEqual(h.form().querySelector('[data-ref="vPower"]').tagName, 'OUTPUT');
    h.field('power').value = '5';
    h.field('power').dispatchEvent(new Event('input', { bubbles: true }));
    await until(() => h.out('vPower') === '5');
    assertEqual(h.out('vPower'), '5');
    h.set('interest', 1);
    await until(() => h.out('vInterest') === '1');
    h.set('name', 'Neu');
    await h.save();
    await until(() => h.form() === null);
    const added = h.vm().model.stakeholders[3];
    assertEqual(added.power, 5);
    assertEqual(added.interest, 1);
    assertEqual(typeof h.saved().stakeholders[3].power, 'number');
    await h.open(h.editBtn(2));
    assertEqual(h.out('vPower'), '2');
    assertEqual(h.out('vInterest'), '4');
    assertEqual(h.field('interest').value, '4');
    await h.cancel();
    unmountAll();
  });

  test('STOPP 2: ein Formular, zwei Kommandos — Anlegen mit Vorgaben, Bearbeiten mit current (normalisiert), danach wieder leer', async () => {
    const h = await mount('sa-1', plain(SMALL));
    await h.open(h.editBtn(1));
    assertEqual(dialogs().at(-1).querySelector('.dialog__title').textContent, tr('editStakeholder'));
    assertEqual(h.field('name').value, 'Bert');
    assertEqual(h.field('support').value, 'neutral');
    assertEqual(h.field('category').value, 'intern');
    assertEqual(document.activeElement, h.field('name'));
    // Unberührt: der Kern schließt still, der gespeicherte Fremdwert bleibt.
    await h.save();
    await until(() => h.form() === null);
    assertEqual(h.commands.length, 0);
    assertEqual(h.vm().model.stakeholders[1].support, 'resistor');
    // Berührt: alle Werte des Formulars gehen an updateStakeholder.
    await h.open(h.editBtn(1));
    h.set('notes', 'geändert');
    await h.save();
    await until(() => h.form() === null);
    assertDeepEqual(h.commands, ['updateStakeholder']);
    assertEqual(JSON.stringify(h.vm().model.stakeholders[1]),
      JSON.stringify(entry({ id: 'b', name: 'Bert', power: 2, interest: 2, notes: 'geändert' })));
    assertValid(h.saved());
    await h.open(h.addBtn());
    assertEqual(dialogs().at(-1).querySelector('.dialog__title').textContent, tr('addStakeholder'));
    assertEqual(h.field('name').value, '');
    assertEqual(h.field('notes').value, '');
    assertEqual(h.field('support').value, 'neutral');
    assertEqual(h.field('category').value, 'intern');
    assertEqual(h.out('vPower'), '3');
    h.set('name', 'Dora');
    h.set('support', 'critic');
    h.set('category', 'behoerde');
    await h.save();
    await until(() => h.form() === null);
    assertDeepEqual(h.commands, ['updateStakeholder', 'addStakeholder']);
    const d = h.vm().model.stakeholders[3];
    assertEqual(JSON.stringify({ ...d, id: '' }), JSON.stringify(entry({ name: 'Dora', support: 'critic', category: 'behoerde' })));
    assertTrue(d.id.startsWith('s'), d.id);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Anlegen)');
    await until(() => h.cards().length === 3);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Bearbeiten)');
    await until(() => h.vm().model.stakeholders[1].support === 'resistor');
    assertEqual(h.vm().model.stakeholders[1].notes, '');
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen');
    await until(() => h.vm().model.stakeholders[1].notes === 'geändert');
    unmountAll();
  });

  test('Leerer Name: unberührtes Anlegen schließt still; berührt bleibt der Dialog offen, Name markiert und fokussiert', async () => {
    const h = await mount('sa-1', null);
    await h.open(h.addBtn());
    await h.save();
    await until(() => h.form() === null);
    assertEqual(h.commands.length, 0);
    await h.open(h.addBtn());
    h.set('role', 'Nur Rolle');
    await h.save();
    await until(() => h.field('name')?.getAttribute('aria-invalid') === 'true');
    assertTrue(h.form() !== null, 'Dialog geschlossen');
    assertEqual(document.activeElement, h.field('name'));
    assertEqual(h.commands.length, 0);
    assertEqual(h.vm().model.stakeholders.length, 0);
    await h.cancel();
    unmountAll();
  });

  test('STOPP 3: Löschen fragt genau einmal mit Namen; Abbrechen lässt alles stehen; ein Schritt, Rückgängig bringt Karte, Chip und Zeile zurück', async () => {
    let h = await mount('sa-1', plain(SMALL), { confirm: false });
    await h.click(h.delBtn(0));
    await settle();
    assertEqual(h.confirms.length, 1);
    assertEqual(h.confirms[0].message, `modules.${ID}.confirm.removeStakeholder`);
    assertEqual(h.cards().length, 3);
    assertEqual(h.inst.historyCan('undo'), false);
    h = await mount('sa-1', plain(SMALL));
    await h.click(h.delBtn(0));
    await until(() => h.cards().length === 2);
    assertEqual(h.confirms.length, 1);
    assertDeepEqual(h.commands, ['removeStakeholder']);
    assertDeepEqual(h.chips('manage-closely'), []);
    assertEqual(h.summary().length, 2);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig');
    await until(() => h.cards().length === 3);
    assertDeepEqual(h.cards(), ['Anna Alt', 'Bert', 'Clara']);
    assertDeepEqual(h.chips('manage-closely'), ['Anna Alt']);
    assertEqual(h.summary()[0][0], 'Anna Alt');
    assertEqual(h.vm().model.stakeholders[0].id, 'a');
    assertTrue(h.inst.historyStep('redo'), 'Wiederholen');
    await until(() => h.cards().length === 2);
    // Agent: ohne Rückfrage.
    h.vm().model.removeStakeholder({ id: 'b' });
    await until(() => h.cards().length === 1);
    assertEqual(h.confirms.length, 1);
    unmountAll();
  });

  test('STOPP 3: Abbau des Moduls bei offenem Dialog schließt ihn, das Formular kehrt heim', async () => {
    const h = await mount('sa-1', plain(SMALL));
    await h.open(h.editBtn(0));
    assertEqual(dialogs().length, 1);
    h.inst.destroy();
    await until(() => dialogs().length === 0);
    assertEqual(dialogs().length, 0);
    assertTrue(h.container.querySelector('.sha__modal-forms .sha__form') !== null || h.container.childElementCount === 0, 'Formular nicht heimgekehrt');
    unmountAll();
  });

  test('STOPP 4: Ableitungen folgen dem Agenten — Chip, Rang, Strategie und Warnung; Rückgängig stellt alles zurück', async () => {
    const h = await mount('sa-1', plain(SMALL));
    assertEqual(h.warning(), null);
    assertDeepEqual(h.chips('keep-informed'), ['Clara']);
    assertDeepEqual(h.summary().map((r) => r[0]), ['Anna Alt', 'Clara', 'Bert']);
    h.vm().model.updateStakeholder({ id: 'c', power: '5' });
    await until(() => h.chips('manage-closely').length === 2);
    assertDeepEqual(h.chips('manage-closely'), ['Anna Alt', 'Clara']);
    assertDeepEqual(h.chips('keep-informed'), []);
    assertEqual(h.strategies()[2], tr('quadManageClosely'));
    assertTrue(h.qa('.sha__card .sha__strategy')[2].classList.contains('sha__q--manage-closely'));
    assertTrue((h.warning() ?? '').includes('Clara'), h.warning());
    assertTrue(h.qa('.sha__chip--alert').length === 1);
    assertDeepEqual(h.summary().map((r) => r[0]), ['Anna Alt', 'Clara', 'Bert']);
    assertDeepEqual(h.commQuads()[1], `${tr('quadManageClosely')} · ${tr('categoryCustomer')}`);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig');
    await until(() => h.warning() === null);
    assertDeepEqual(h.chips('keep-informed'), ['Clara']);
    assertEqual(h.strategies()[2], tr('quadKeepInformed'));
    assertEqual(h.qa('.sha__chip--alert').length, 0);
    unmountAll();
  });

  test('STOPP 4: die Kachel zeigt nach dem Speichern dieselben Zahlen wie die Matrix', async () => {
    const h = await mount('sa-1', plain(SMALL));
    await h.open(h.editBtn(2));
    h.set('power', 5);
    await h.save();
    await until(() => h.form() === null);
    const settings = resolveSettings(validateSchema(tile.settings), {});
    const vm = tile.viewModel({ tileId: 't', instanceId: 'sa-1', state: h.saved(), settings,
      i18n: { t: (k) => k, getLanguage: () => 'de' }, theme: 'light', chartManager: null, stateManager: null });
    const quads = ['manage-closely', 'keep-satisfied', 'keep-informed', 'monitor'];
    assertDeepEqual(vm.quadCells.map((c) => [c.quadrant, c.count]), quads.map((q) => [q, String(h.chips(q).length)]));
    assertDeepEqual(vm.support.map((x) => [x.key, x.count]), [['supporter', '1'], ['neutral', '0'], ['critic', '1'], ['other', '1']]);
    assertDeepEqual(vm.critics, [{ name: 'Clara', role: null }]);
    assertEqual(vm.criticsLabel, 'dashboard.stakeholderCritics');
    unmountAll();
  });

  test('Fremdwerte zeigen den gespeicherten Text; Kategorien der Wertemenge ihren Namen', async () => {
    const h = await mount('sa-1', plain(SMALL));
    const bert = h.summary().find((r) => r[0] === 'Bert');
    assertEqual(bert[4], 'resistor');
    assertDeepEqual(h.commQuads(), [
      `${tr('quadManageClosely')} · ${tr('categoryIntern')}`,
      `${tr('quadKeepInformed')} · ${tr('categoryCustomer')}`,
      `${tr('quadMonitor')} · Sponsor`,
    ]);
    const dot = h.qa('.sha__matrix-cell[data-quad="monitor"] .sha__chip-dot')[0];
    assertTrue(dot.classList.contains('sha__chip-dot--critic'), dot.className);
    assertDeepEqual(h.roles(), ['Leitung', '—', '—']);
    const avatar = h.q('.sha__card .sha__avatar');
    assertEqual(avatar.textContent, 'AA');
    assertTrue(/\bsha__avatar--c\d\b/.test(avatar.className), avatar.className);
    unmountAll();
  });

  test('zwei Instanzen: Dialog und Kommando bleiben im eigenen Modul, Verlauf je Instanz', async () => {
    const a = await mount('sa-1', plain(SMALL));
    const b = await mount('sa-2', plain(SMALL), { keep: true });
    await b.open(b.editBtn(0));
    b.set('name', 'Nur B');
    await b.save();
    await until(() => b.form() === null);
    assertEqual(b.cards()[0], 'Nur B');
    assertEqual(a.cards()[0], 'Anna Alt');
    assertEqual(a.inst.historyCan('undo'), false);
    await a.open(a.addBtn());
    a.set('name', 'Nur A');
    await a.save();
    await until(() => a.form() === null);
    assertEqual(a.cards().length, 4);
    assertEqual(b.cards().length, 3);
    assertTrue(b.inst.historyStep('undo'), 'Rückgängig B');
    await until(() => b.cards()[0] === 'Anna Alt');
    assertEqual(a.cards().length, 4);
    unmountAll();
  });

  test('zwei Instanzen: Beschriftungen und Wertanzeigen zeigen aufs eigene Feld, keine doppelten ids; Name ist Pflicht', async () => {
    const a = await mount('sa-1', plain(SMALL));
    const b = await mount('sa-2', plain(SMALL), { keep: true });
    assertTrue(a.vm().fieldId('name') !== b.vm().fieldId('name'), 'fieldId gleich');
    for (const h of [a, b]) {
      const form = h.q('.sha__form');
      const labels = [...form.querySelectorAll('label')];
      assertEqual(labels.length, 7);
      for (const label of labels) {
        const target = document.getElementById(label.htmlFor);
        assertTrue(!!target && form.contains(target), `${label.htmlFor} zeigt nicht ins eigene Formular`);
      }
      for (const [ref, field] of [['vPower', 'power'], ['vInterest', 'interest']]) {
        const out = /** @type {HTMLOutputElement} */ (form.querySelector(`[data-ref="${ref}"]`));
        assertEqual(out.htmlFor.value, form.querySelector(`[data-field="${field}"]`).id, ref);
      }
      const name = form.querySelector('[data-field="name"]');
      assertTrue(name.hasAttribute('required'), 'required');
      assertEqual(name.getAttribute('aria-required'), 'true');
    }
    const ids = [...document.querySelectorAll('.sha__form [id]')].map((el) => el.id);
    assertEqual(ids.length, 14);
    assertEqual(new Set(ids).size, ids.length, 'doppelte ids');
    await b.open(b.editBtn(0));
    const label = b.form().querySelector('label[for]');
    assertTrue(b.form().contains(document.getElementById(label.htmlFor)), 'im Dialog verknüpft');
    await b.cancel();
    unmountAll();
  });

  test('Altprojekt (1.0): alle Werte sichtbar, Laden ist kein Verlaufsschritt, read() mit quadrants', async () => {
    const h = await mount('sa-1', plain(LEGACY_B));
    assertDeepEqual(h.cards(), ['Lieferant Müller GmbH', 'Einkauf', 'Kundenservice']);
    assertDeepEqual(h.roles(), ['Zulieferer', 'Strategischer Einkauf', '—']);
    assertDeepEqual(h.chips('manage-closely'), ['Lieferant Müller GmbH', 'Kundenservice']);
    assertDeepEqual(h.chips('monitor'), ['Einkauf']);
    assertTrue((h.warning() ?? '').includes('Kundenservice'), h.warning());
    assertDeepEqual(h.summary().map((r) => r[0]), ['Lieferant Müller GmbH', 'Kundenservice', 'Einkauf']);
    assertEqual(h.summary()[2][4], 'resistor');
    assertDeepEqual(h.commQuads()[2], `${tr('quadMonitor')} · Sponsor`);
    assertEqual(h.inst.historyCan('undo'), false);
    const read = plain(h.vm().read({ fields: ['stakeholders', 'quadrants'] }));
    assertDeepEqual(read.stakeholders.map((s) => s.id), ['s1', 'b2', 'b3']);
    assertDeepEqual(read.quadrants, [
      { id: 's1', quadrant: 'manage-closely' }, { id: 'b2', quadrant: 'monitor' }, { id: 'b3', quadrant: 'manage-closely' },
    ]);
    const lean = plain(h.vm().read());
    assertEqual(lean.stakeholders.rowCount, 3);
    assertEqual(lean.quadrants.rowCount, 3);
    assertDeepEqual(lean.quadrants.columns, ['id', 'quadrant']);
    unmountAll();
  });
});
