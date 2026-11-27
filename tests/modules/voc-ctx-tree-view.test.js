/**
 * VoC → CTx-Baum: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem
 * echten Modul, der echten Vorlage, den Modulstilen und dem echten
 * Dialogdienst. Prüft: Leerzustand, Hilfe-Anker, Auswahl über die Karte
 * (Knöpfe der Karte wählen nicht), Löschen der Stimme mit genau einer
 * Rückfrage, vier Formulare mit je zwei Kommandos (Startwerte aus `current`,
 * leer nach dem Bearbeiten, Elternkette, Ablehnung des leeren Texts, Fokus,
 * Strg+Enter), Umsortieren per Tastatur je Ebene ohne Gruppenwechsel, die
 * Darstellung als Variablen (wie die Altform), Farbwähler und Randstärke je
 * ein Verlaufsschritt, zwei Instanzen und das Altprojekt ohne
 * Verlaufsschritt.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual, fakeChartManager } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerCommandDirectives } from '../../js/core/command-directives.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { createDialogService, DIALOG_TEMPLATE } from '../../js/ui/dialog/dialog.js';
import { setFields } from '../../js/core/model.js';
import { parseRGBA, rgbaStr } from '../../js/core/chart/chart-core.js';
import { inlineTileTemplate } from './tile-test-utils.js';
import mod from '../../js/modules/voc-ctx-tree/viewmodel/viewmodel.js';
import { State } from '../../js/modules/voc-ctx-tree/domain/model.js';

const ID = 'voc-ctx-tree';
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
function tr(path) {
  const v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), UI);
  return typeof v === 'string' ? v : path;
}

async function prepare() {
  if (!prepared) {
    registerCommandDirectives(Alpine);
    registerFieldDirective(Alpine, { i18n: { t: (k) => k, getLanguage: () => 'de' } });
    if (!Alpine.version) Alpine.start();
    UI = await (await fetch(new URL(`../../js/modules/${ID}/resources/i18n/ui.de.json`, import.meta.url), { cache: 'no-cache' })).json();
    // Randstärke und Farben wirken über die Modulstile (Testseite ohne Bundle).
    const css = new URL(`../../js/modules/${ID}/resources/style.css`, import.meta.url).href;
    if (![...document.styleSheets].some((sh) => sh.href === css)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = css;
      await new Promise((ok, fail) => { link.onload = ok; link.onerror = fail; document.head.append(link); });
    }
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
  for (const el of document.querySelectorAll('.dmike-chart-ed-cp-overlay')) /** @type {HTMLElement} */ (el).click();
  while (mounted.length) {
    const old = mounted.pop();
    Alpine.destroyTree(old);
    old.remove();
  }
  for (const el of dialogs()) el.remove();
}

const plain = (v) => JSON.parse(JSON.stringify(v));

const COLORS = {
  voc: 'rgba(230,126,34,1)', need: 'rgba(155,89,182,1)', ctq: 'rgba(39,174,96,1)',
  ctd: 'rgba(41,128,185,1)', ctc: 'rgba(231,76,139,1)', req: 'rgba(94,88,216,1)',
};

/** Ein kleiner Stand der Zielform: zwei Stimmen, die zweite mit drei Ebenen. */
const SMALL = {
  _schema: { name: ID, version: '1.0' },
  vocs: [
    { id: 'v1', text: 'Erste Stimme', source: '', needs: [] },
    {
      id: 'v2', text: 'Zweite Stimme', source: 'Umfrage', needs: [
        {
          id: 'n1', text: 'Schnell', drivers: [
            {
              id: 'd1', text: 'Lieferzeit', type: 'ctq', requirements: [
                { id: 'r1', text: 'Unter 30 min', target: '30 min', measure: 'Kasse' },
                { id: 'r2', text: 'Meldung', target: '', measure: '' },
              ],
            },
            { id: 'd2', text: 'Preis', type: 'ctc', requirements: [] },
          ],
        },
        { id: 'n2', text: 'Verlässlich', drivers: [] },
      ],
    },
  ],
  styles: { borderWidth: 1, colors: { ...COLORS } },
  activeVocId: 'v2',
};

/** Instanz der E2E-Fixture `legacy-project.json` (ohne `_schema`, wie die Altform sie schrieb). */
const LEGACY = {
  vocs: [
    { id: 'v-alt-1', text: 'Die Größe der Pizza schwankt & <stört> mich', source: 'Umfrage Q3 > Filiale Süd' },
    {
      id: 'v-alt-2', text: 'Die Lieferung dauert zu lange – über 45 Minuten', source: 'Beschwerde-Hotline', needs: [
        {
          id: 'n-alt-1', text: 'Schnelle Lieferung', drivers: [
            {
              id: 'd-alt-1', text: 'Lieferzeit ab Bestellung', type: 'ctq', requirements: [
                { id: 'r-alt-1', text: '≤ 30 Minuten in 95 % der Fälle', target: '30 min', measure: 'Zeitstempel Kasse → Übergabe' },
                { id: 'r-alt-2', text: 'Fahrer meldet Übergabe sofort' },
              ],
            },
            { id: 'd-alt-2', text: 'Treiber mit unbekannter Art', type: 'xyz', requirements: [] },
          ],
        },
        {
          text: 'Verlässliche Zusage', drivers: [
            { id: 'd-alt-3', text: 'Zugesagtes Lieferfenster', type: 'ctq', requirements: [{ id: 'r-alt-3', text: 'Abweichung ≤ 5 min', target: '5 min', measure: 'GPS-Protokoll' }] },
          ],
        },
      ],
    },
  ],
  activeVocId: 'v-alt-2',
  styles: { borderWidth: 3.7, colors: { voc: 'rgba(200,90,20,1)', need: 'rgba(10,120,200,1)', ctq: 'rgba(30,150,80,1)', ctd: '#336699', ctc: 'rgb(300,0,0)' } },
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
  container.style.width = '1200px';
  container.style.height = '800px';
  document.body.append(container);
  mounted.push(container);
  const inst = { ...mod };
  await inst.init(container, context);
  await settle();
  const q = (sel) => container.querySelector(sel);
  const qa = (sel) => [...container.querySelectorAll(sel)];
  const vm = () => Alpine.$data(container.querySelector('[x-data]'));
  /** Das offene Formular (im Dialog) oder null. */
  const form = () => /** @type {HTMLFormElement|null} */ (dialogs().at(-1)?.querySelector('.vct__form') ?? null);
  const h = {
    inst, states, notes, confirms, commands, container, q, qa, vm, form,
    saved: () => plain(states[instanceId]),
    cards: () => qa('.vct__card .vct__card-text').map((el) => el.textContent),
    counts: () => qa('.vct__card .vct__card-count').map((el) => el.textContent),
    active: () => qa('.vct__card--active').map((el) => el.dataset.vocId),
    root: () => q('.vct__node--voc')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
    needs: () => qa('.vct__node--need').map((el) => el.dataset.needId),
    drivers: (needId) => qa(`.vct__node[data-drag-type="driver"][data-need-id="${needId}"]`).map((el) => el.dataset.drvId),
    reqs: (drvId) => qa(`.vct__node--req[data-drv-id="${drvId}"]`).map((el) => el.dataset.reqId),
    badge: (sel) => /** @type {HTMLElement} */ (q(`${sel} .vct__drag-handle`)),
    field: (name) => /** @type {any} */ (form()?.querySelector(`[data-field="${name}"]`)),
    title: () => dialogs().at(-1)?.querySelector('.dialog__title')?.textContent ?? null,
    open: async (btn) => { btn.click(); await until(() => h.form() !== null); await settle(); },
    set: (name, value) => {
      const el = h.field(name);
      el.value = String(value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    save: async () => { dialogs().at(-1).querySelector('.dialog__confirm').click(); await settle(); },
    cancel: async () => { dialogs().at(-1).querySelector('.dialog__cancel').click(); await until(() => h.form() === null); },
    click: async (el) => { el.click(); await settle(); },
    key: async (el, key, init = {}) => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
      await settle();
    },
  };
  return h;
}

/** Der gespeicherte Stand lädt streng (ohne Reparatur). @param {any} saved */
function assertValid(saved) {
  let err = null;
  try { State.fromJSON(plain(saved)); } catch (e) { err = e; }
  assertEqual(err, null, `gespeicherter Stand ungültig: ${err?.message}`);
}

/** Die Variablen, die `applyStyles` der Altform schrieb. @param {Record<string, string>} colors @returns {Record<string, string>} */
function legacyVars(colors) {
  const out = {};
  for (const [key, value] of Object.entries(colors)) {
    const c = parseRGBA(value);
    out[`--color-vct-${key}`] = rgbaStr({ ...c, a: 1 });
    out[`--color-vct-${key}-bg`] = rgbaStr({ ...c, a: 0.06 });
    out[`--color-vct-${key}-border`] = rgbaStr({ ...c, a: 0.20 });
    out[`--color-vct-${key}-badge-bg`] = rgbaStr({ ...c, a: 0.12 });
    out[`--color-vct-${key}-line`] = rgbaStr({ ...c, a: 0.25 });
  }
  return out;
}

suite('voc-ctx-tree: Viewmodel im Browser', () => {
  test('Leerzustand: Zähler 0, Leertext, kein Baum, nichts gespeichert, kein Verlauf', async () => {
    const h = await mount('vct-1', null);
    assertEqual(h.q('.vct__counter').textContent, '0');
    assertEqual(h.q('.vct__empty-text').textContent, tr('noVocs'));
    assertEqual(h.q('.vct__tree'), null);
    assertEqual(h.vm().activeVoc, null);
    assertEqual(h.states['vct-1'], null);
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Hilfe-Anker: Titel, Knopf für eine neue Stimme, Stil-Panel und Formularbeschriftungen; Knöpfe, Karten, Formulare und Eingaben leer', async () => {
    const h = await mount('vct-1', plain(SMALL));
    const keys = h.qa('[data-help-key]').map((el) => el.getAttribute('data-help-key')).filter(Boolean).sort();
    const want = [
      'actions.setActiveVoc.help', 'actions.addVoc.help',
      'fields.styles.help', 'fields.styles.borderWidth.help',
      ...['voc', 'need', 'ctq', 'ctd', 'ctc', 'req'].map((k) => `fields.styles.colors.${k}.help`),
      'actions.addVoc.params.text', 'actions.addVoc.params.source', 'actions.addNeed.params.text',
      'actions.addDriver.params.type', 'actions.addDriver.params.text',
      'actions.addRequirement.params.text', 'actions.addRequirement.params.target', 'actions.addRequirement.params.measure',
    ].map((k) => `modules.${ID}.${k}`).sort();
    assertDeepEqual(keys, want);
    for (const el of h.qa('.vct__card-select, .vct__node-btn, .vct__card-action-btn, .vct__form, .vct__form textarea, .vct__form input, .vct__type-selector, .dmike-slider, .dmike-chart-ed-color-swatch')) {
      assertEqual(el.getAttribute('data-help-key'), '', el.className);
    }
    unmountAll();
  });

  test('Karte wählt die Stimme; Bearbeiten wählt nicht; Rückgängig stellt die Auswahl zurück', async () => {
    const h = await mount('vct-1', plain(SMALL));
    assertDeepEqual(h.active(), ['v2']);
    assertEqual(h.root(), `${tr('badgeVoc')} „Zweite Stimme“ ${tr('source')}: Umfrage +`);
    assertDeepEqual(h.counts(), [`0 ${tr('needCount')} · 0 ${tr('reqShort')}`, `2 ${tr('needCount')} · 2 ${tr('reqShort')}`]);
    await h.click(h.qa('.vct__card-select')[0]);
    await until(() => h.active()[0] === 'v1');
    assertDeepEqual(h.commands, ['setActiveVoc']);
    assertEqual(h.q('.vct__node--need'), null);
    await h.open(h.qa('.vct__edit-voc-btn')[1]);
    assertDeepEqual(h.active(), ['v1']);
    assertDeepEqual(h.commands, ['setActiveVoc']);
    await h.cancel();
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Auswahl)');
    await until(() => h.active()[0] === 'v2');
    unmountAll();
  });

  test('Karte per Tastatur: echter Knopf um Text und Zählzeile, Aktionsknöpfe daneben, Zustand in aria-pressed', async () => {
    const h = await mount('vct-1', plain(SMALL));
    const sel = h.qa('.vct__card-select');
    assertEqual(sel.length, 2);
    for (const el of sel) {
      assertEqual(el.tagName, 'BUTTON');
      assertEqual(el.getAttribute('type'), 'button');
      assertTrue(el.querySelector('.vct__card-text') !== null && el.querySelector('.vct__card-count') !== null, 'Text und Zählzeile im Knopf');
      assertEqual(el.querySelector('button'), null, 'kein Knopf im Knopf');
    }
    assertEqual(h.qa('.vct__card-select .vct__card-action-btn').length, 0);
    assertEqual(h.qa('.vct__card > .vct__card-actions .vct__card-action-btn').length, 4);
    assertDeepEqual(sel.map((el) => el.getAttribute('aria-pressed')), ['false', 'true']);
    // Volle Breite der Karte, kein Browser-Rahmen oder -Hintergrund.
    const card = /** @type {HTMLElement} */ (h.qa('.vct__card')[0]);
    const cs = getComputedStyle(sel[0]);
    assertEqual(Math.round(sel[0].getBoundingClientRect().width), Math.round(card.clientWidth));
    assertEqual(cs.borderTopWidth, '0px');
    assertEqual(cs.backgroundColor, 'rgba(0, 0, 0, 0)');
    assertEqual(cs.textAlign, 'left');
    sel[0].focus();
    assertEqual(document.activeElement, sel[0]);
    await h.click(sel[0]);
    await until(() => h.active()[0] === 'v1');
    assertDeepEqual(h.qa('.vct__card-select').map((el) => el.getAttribute('aria-pressed')), ['true', 'false']);
    unmountAll();
  });

  test('Ziehgriff: Beschriftung aus Abzeichen und Verschieben', async () => {
    const h = await mount('vct-1', plain(SMALL));
    const label = (sel) => h.badge(sel).getAttribute('aria-label');
    assertEqual(label('.vct__node--need[data-need-id="n1"]'), `${tr('badgeNeed')}: common.reorder`);
    assertEqual(label('.vct__node[data-drv-id="d2"]'), 'CTC: common.reorder');
    assertEqual(label('.vct__node--req[data-req-id="r1"]'), `${tr('badgeReq')}: common.reorder`);
    unmountAll();
  });

  test('Stimme löschen: genau eine Rückfrage des Kommandos, wählt nicht; die aktive weg → die erste rückt nach', async () => {
    let h = await mount('vct-1', plain(SMALL), { confirm: false });
    await h.click(h.qa('.vct__del-voc-btn')[1]);
    await settle();
    assertEqual(h.confirms.length, 1);
    assertEqual(h.confirms[0].message, `modules.${ID}.confirm.removeVoc`);
    assertEqual(h.cards().length, 2);
    assertDeepEqual(h.commands, []);
    h = await mount('vct-1', plain(SMALL));
    await h.click(h.qa('.vct__del-voc-btn')[1]);
    await until(() => h.cards().length === 1);
    assertEqual(h.confirms.length, 1);
    assertDeepEqual(h.commands, ['removeVoc']);
    assertDeepEqual(h.active(), ['v1']);
    assertEqual(h.vm().model.activeVocId, 'v1');
    // Knoten: die allgemeine Rückfrage, einmal.
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig');
    await until(() => h.cards().length === 2);
    await h.click(h.q('.vct__del-req-btn'));
    await until(() => h.reqs('d1').length === 1);
    assertEqual(h.confirms.length, 2);
    unmountAll();
  });

  test('Formular der Stimme: Anlegen leer, Bearbeiten mit current, danach wieder leer; unberührt schließt still', async () => {
    const h = await mount('vct-1', plain(SMALL));
    await h.open(h.qa('.vct__edit-voc-btn')[1]);
    assertEqual(h.title(), tr('editVoc'));
    assertEqual(h.field('text').value, 'Zweite Stimme');
    assertEqual(h.field('source').value, 'Umfrage');
    assertEqual(document.activeElement, h.field('text'));
    await h.save();
    await until(() => h.form() === null);
    assertDeepEqual(h.commands, []);
    await h.open(h.qa('.vct__edit-voc-btn')[1]);
    h.set('source', '  Interview  ');
    await h.save();
    await until(() => h.form() === null);
    assertDeepEqual(h.commands, ['updateVoc']);
    assertEqual(h.vm().model.vocs[1].source, 'Interview');
    await h.open(h.q('.vct__add-voc-btn'));
    assertEqual(h.title(), tr('addVoc'));
    assertEqual(h.field('text').value, '');
    assertEqual(h.field('source').value, '');
    h.set('text', 'Dritte');
    await h.save();
    await until(() => h.form() === null);
    assertDeepEqual(h.commands, ['updateVoc', 'addVoc']);
    assertEqual(h.cards().length, 3);
    assertEqual(h.active()[0], h.vm().model.vocs[2].id);
    assertValid(h.saved());
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Anlegen)');
    await until(() => h.cards().length === 2);
    assertDeepEqual(h.active(), ['v2']);
    unmountAll();
  });

  test('Leerer Text: berührt bleibt der Dialog offen, Text markiert und fokussiert; Enter im Textfeld schickt nicht ab', async () => {
    const h = await mount('vct-1', plain(SMALL));
    await h.open(h.q('.vct__add-need-btn'));
    assertEqual(h.title(), tr('addNeed'));
    h.set('text', '   ');
    await h.save();
    await until(() => h.field('text')?.getAttribute('aria-invalid') === 'true');
    assertTrue(h.form() !== null, 'Dialog geschlossen');
    assertEqual(document.activeElement, h.field('text'));
    assertDeepEqual(h.commands, []);
    h.set('text', 'Neu');
    await h.key(h.field('text'), 'Enter');
    assertTrue(h.form() !== null, 'Enter schickte ab');
    assertDeepEqual(h.commands, []);
    await h.key(h.field('text'), 'Enter', { ctrlKey: true });
    await until(() => h.form() === null);
    assertDeepEqual(h.commands, ['addNeed']);
    assertDeepEqual(h.needs(), ['n1', 'n2', h.vm().model.vocs[1].needs[2].id]);
    assertEqual(h.vm().model.vocs[1].needs[2].text, 'Neu');
    unmountAll();
  });

  test('Formular des Treibers: Art als Knopfgruppe, current beim Bearbeiten, Elternkette fest; Anforderung mit Ziel und Messung', async () => {
    const h = await mount('vct-1', plain(SMALL));
    await h.open(h.qa('.vct__edit-ctx-btn')[1]);
    assertEqual(h.title(), tr('editDriver'));
    const opt = (v) => /** @type {HTMLButtonElement} */ (h.form().querySelector(`.vct__type-option[value="${v}"]`));
    assertEqual(opt('ctc').getAttribute('aria-checked'), 'true');
    assertEqual(opt('ctq').getAttribute('aria-checked'), 'false');
    assertEqual(h.field('text').value, 'Preis');
    assertEqual(h.form().querySelector('.vct__type-desc').textContent, tr('typeQuality'));
    // Die Art zeichnet in der Farbe der Knotenart, auch im Dialog außerhalb der Wurzel.
    await until(() => getComputedStyle(opt('ctc')).borderTopColor === 'rgb(231, 76, 139)');
    assertEqual(getComputedStyle(opt('ctc')).borderTopColor, 'rgb(231, 76, 139)');
    opt('ctd').click();
    await until(() => opt('ctd').getAttribute('aria-checked') === 'true');
    await h.save();
    await until(() => h.form() === null);
    assertDeepEqual(h.commands, ['updateDriver']);
    assertEqual(h.vm().model.vocs[1].needs[0].drivers[1].type, 'ctd');
    assertTrue(h.q('[data-drv-id="d2"].vct__node').classList.contains('vct__node--ctd'));
    await h.open(h.qa('.vct__add-ctx-btn')[1]);
    assertEqual(opt('ctq').getAttribute('aria-checked'), 'true');
    assertEqual(h.field('text').value, '');
    h.set('text', 'Neu');
    await h.save();
    await until(() => h.form() === null);
    assertEqual(h.vm().model.vocs[1].needs[1].drivers[0].text, 'Neu');
    assertEqual(h.vm().model.vocs[1].needs[1].drivers[0].type, 'ctq');
    await h.open(h.qa('.vct__edit-req-btn')[0]);
    assertEqual(h.title(), tr('editReq'));
    assertDeepEqual(['text', 'target', 'measure'].map((f) => h.field(f).value), ['Unter 30 min', '30 min', 'Kasse']);
    await h.cancel();
    await h.open(h.qa('.vct__add-req-btn')[0]);
    assertDeepEqual(['text', 'target', 'measure'].map((f) => h.field(f).value), ['', '', '']);
    h.set('text', 'R3');
    h.set('measure', 'Log');
    await h.save();
    await until(() => h.form() === null);
    const r = h.vm().model.vocs[1].needs[0].drivers[0].requirements[2];
    assertDeepEqual({ text: r.text, target: r.target, measure: r.measure }, { text: 'R3', target: '', measure: 'Log' });
    assertDeepEqual(h.commands, ['updateDriver', 'addDriver', 'addRequirement']);
    unmountAll();
  });

  test('Bearbeiten eines Knotens, den der Agent inzwischen gelöscht hat, wird abgelehnt; Abbrechen schließt', async () => {
    const h = await mount('vct-1', plain(SMALL));
    await h.open(h.qa('.vct__edit-need-btn')[1]);
    h.vm().model.removeNeed({ vocId: 'v2', needId: 'n2' });
    await until(() => h.needs().length === 1);
    h.set('text', 'Geändert');
    await h.save();
    await settle();
    assertTrue(h.form() !== null, 'Dialog geschlossen');
    assertTrue(h.notes.length > 0, 'keine Meldung');
    assertEqual(h.vm().model.vocs[1].needs.length, 1);
    await h.cancel();
    unmountAll();
  });

  test('Umsortieren mit Alt+Pfeil je Ebene: ein Kommando, kein Gruppenwechsel, je ein Verlaufsschritt', async () => {
    const h = await mount('vct-1', plain(SMALL));
    // Bedürfnisse.
    h.badge('[data-id="n1"]').focus();
    await h.key(h.badge('[data-id="n1"]'), 'ArrowDown', { altKey: true });
    await until(() => h.needs()[0] === 'n2');
    assertDeepEqual(h.needs(), ['n2', 'n1']);
    assertDeepEqual(h.drivers('n1'), ['d1', 'd2']);
    assertDeepEqual(h.commands, ['reorderNodes']);
    // Am Rand: nichts.
    h.badge('[data-id="n1"]').focus();
    await h.key(h.badge('[data-id="n1"]'), 'ArrowDown', { altKey: true });
    assertDeepEqual(h.commands, ['reorderNodes']);
    // Treiber: bleibt im eigenen Bedürfnis.
    h.badge('[data-id="d2"]').focus();
    await h.key(h.badge('[data-id="d2"]'), 'ArrowUp', { altKey: true });
    await until(() => h.drivers('n1')[0] === 'd2');
    assertDeepEqual(h.drivers('n1'), ['d2', 'd1']);
    assertDeepEqual(h.needs(), ['n2', 'n1']);
    // Anforderungen.
    h.badge('[data-req-id="r1"]').focus();
    await h.key(h.badge('[data-req-id="r1"]'), 'ArrowDown', { altKey: true });
    await until(() => h.reqs('d1')[0] === 'r2');
    assertDeepEqual(h.reqs('d1'), ['r2', 'r1']);
    assertDeepEqual(h.commands, ['reorderNodes', 'reorderNodes', 'reorderNodes']);
    assertValid(h.saved());
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Anforderung)');
    await until(() => h.reqs('d1')[0] === 'r1');
    assertDeepEqual(h.drivers('n1'), ['d2', 'd1']);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Treiber)');
    await until(() => h.drivers('n1')[0] === 'd1');
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Bedürfnis)');
    await until(() => h.needs()[0] === 'n1');
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Umsortieren aufgenommen: Pfeile quer wechseln die Gruppe nicht, Ablegen mit Enter, Vorschau räumt auf', async () => {
    const h = await mount('vct-1', plain(SMALL));
    const badge = () => h.badge('[data-id="d1"]');
    badge().focus();
    await h.key(badge(), ' ');
    assertTrue(h.q('[data-id="d1"][data-gesture-dragging]') !== null, 'nicht aufgenommen');
    await h.key(badge(), 'ArrowLeft');
    await h.key(badge(), 'ArrowRight');
    await h.key(badge(), 'ArrowDown');
    assertEqual(h.vm().state.dropTarget, 'd2');
    assertTrue(h.q('[data-drv-id="d2"].vct__node').classList.contains('vct__node--drag-over'));
    await h.key(badge(), 'Enter');
    await until(() => h.drivers('n1')[0] === 'd2');
    assertDeepEqual(h.drivers('n1'), ['d2', 'd1']);
    assertDeepEqual(h.commands, ['reorderNodes']);
    assertEqual(h.vm().state.dropTarget, null);
    assertEqual(h.qa('.vct__node--drag-over').length, 0);
    assertEqual(h.qa('[data-gesture-dragging]').length, 0);
    // Die Stimme ist kein Griff.
    assertEqual(h.q('.vct__node--voc .vct__drag-handle'), null);
    unmountAll();
  });

  test('Darstellung: Variablen wie die Altform an Wurzel und Formularen; Randstärke über den Regler, ein Schritt', async () => {
    const h = await mount('vct-1', plain(SMALL));
    const want = { ...legacyVars(COLORS), '--vct-border-width': '1px' };
    assertDeepEqual(h.vm().styleVars, want);
    const root = /** @type {HTMLElement} */ (h.q('.vct'));
    assertEqual(root.style.getPropertyValue('--color-vct-ctq-bg'), want['--color-vct-ctq-bg']);
    for (const f of h.qa('.vct__form')) assertEqual(f.style.getPropertyValue('--color-vct-req'), want['--color-vct-req']);
    const node = /** @type {HTMLElement} */ (h.q('.vct__node--need'));
    assertEqual(getComputedStyle(node).borderTopWidth, '1px');
    const range = /** @type {HTMLInputElement} */ (h.q('.dmike-slider'));
    assertEqual(range.value, '1');
    range.value = '2.5';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
    await until(() => h.vm().model.styles.borderWidth === 2.5);
    await until(() => getComputedStyle(node).borderTopWidth === '2.5px');
    assertEqual(h.q('.dmike-slider-row__value').textContent, '2.5');
    await until(() => h.saved()?.styles?.borderWidth === 2.5);
    assertEqual(h.saved().styles.borderWidth, 2.5);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Randstärke)');
    await until(() => h.vm().model.styles.borderWidth === 1);
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Farbwähler: Ziehen nur im Entwurf, Schließen ein Schritt; ungültige Farbe wird abgelehnt', async () => {
    const h = await mount('vct-1', plain(SMALL));
    const swatch = /** @type {HTMLElement} */ (h.q('.dmike-chart-ed-color-swatch[data-style-key="need"]'));
    swatch.click();
    await until(() => document.querySelector('.dmike-chart-ed-cp-overlay') !== null);
    h.vm().state.styleDraft = { key: 'need', value: 'rgba(1,2,3,1.00)' };
    await until(() => h.vm().styleVars['--color-vct-need'] === 'rgba(1,2,3,1.00)');
    assertEqual(swatch.style.background, 'rgb(1, 2, 3)');
    assertEqual(h.vm().model.styles.colors.need, COLORS.need);
    assertEqual(h.inst.historyCan('undo'), false);
    /** @type {HTMLElement} */ (document.querySelector('.dmike-chart-ed-cp-overlay')).click();
    await until(() => h.vm().model.styles.colors.need === 'rgba(1,2,3,1.00)');
    assertEqual(h.vm().state.styleDraft, null);
    await until(() => h.saved()?.styles?.colors?.need === 'rgba(1,2,3,1.00)');
    assertEqual(h.saved().styles.colors.need, 'rgba(1,2,3,1.00)');
    let err = null;
    try { setFields(h.vm().model, { styles: { borderWidth: 1, colors: { ...COLORS, voc: '#ff0000' } } }); } catch (e) { err = e; }
    assertTrue(err !== null, 'ungültige Farbe angenommen');
    assertEqual(h.vm().model.styles.colors.voc, COLORS.voc);
    assertTrue(h.inst.historyStep('undo'), 'Rückgängig (Farbe)');
    await until(() => h.vm().model.styles.colors.need === COLORS.need);
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Farbwähler: zurück auf den Ausgangswert (andere Schreibweise) ist kein Schritt', async () => {
    const h = await mount('vct-1', plain(SMALL));
    const swatch = /** @type {HTMLElement} */ (h.q('.dmike-chart-ed-color-swatch[data-style-key="need"]'));
    swatch.click();
    await until(() => document.querySelector('.dmike-chart-ed-cp-overlay') !== null);
    h.vm().state.styleDraft = { key: 'need', value: 'rgba(1,2,3,1.00)' };
    await settle();
    h.vm().state.styleDraft = { key: 'need', value: 'rgba(155,89,182,1.00)' };
    await settle();
    /** @type {HTMLElement} */ (document.querySelector('.dmike-chart-ed-cp-overlay')).click();
    await until(() => h.vm().state.styleDraft === null);
    await settle();
    assertEqual(h.vm().model.styles.colors.need, COLORS.need);
    assertEqual(h.inst.historyCan('undo'), false);
    assertEqual(h.commands.length, 0);
    unmountAll();
  });

  test('zwei Instanzen: Beschriftungen zeigen aufs eigene Feld, keine doppelten ids, Pflichtfelder markiert; Kommandos bleiben im eigenen Modul', async () => {
    const a = await mount('vct-1', plain(SMALL));
    const b = await mount('vct-2', plain(SMALL), { keep: true });
    assertTrue(a.vm().fieldId('voc-text') !== b.vm().fieldId('voc-text'), 'fieldId gleich');
    for (const h of [a, b]) {
      for (const label of h.qa('label[for]')) {
        const target = document.getElementById(/** @type {HTMLLabelElement} */ (label).htmlFor);
        assertTrue(!!target && h.container.contains(target), `${label.htmlFor} zeigt nicht ins eigene Modul`);
      }
      for (const ta of h.qa('.vct__form textarea')) {
        assertTrue(ta.hasAttribute('required'), 'required');
        assertEqual(ta.getAttribute('aria-required'), 'true');
      }
      for (const f of h.qa('.vct__form')) assertTrue(f.hasAttribute('novalidate'), 'novalidate');
    }
    const ids = [...document.querySelectorAll('.vct [id]')].map((el) => el.id);
    assertEqual(new Set(ids).size, ids.length, 'doppelte ids');
    await b.open(b.qa('.vct__edit-need-btn')[0]);
    b.set('text', 'Nur B');
    await b.save();
    await until(() => b.form() === null);
    assertEqual(b.vm().model.vocs[1].needs[0].text, 'Nur B');
    assertEqual(a.vm().model.vocs[1].needs[0].text, 'Schnell');
    assertEqual(a.inst.historyCan('undo'), false);
    unmountAll();
  });

  test('Altprojekt: alle Werte sichtbar, Altwerte geheilt, Laden ist kein Verlaufsschritt', async () => {
    const h = await mount('vct-1', plain(LEGACY));
    assertDeepEqual(h.cards(), LEGACY.vocs.map((v) => v.text));
    assertDeepEqual(h.active(), ['v-alt-2']);
    assertEqual(h.counts()[0], `0 ${tr('needCount')} · 0 ${tr('reqShort')}`);
    assertEqual(h.counts()[1], `2 ${tr('needCount')} · 3 ${tr('reqShort')}`);
    assertDeepEqual(h.needs(), ['n-alt-1', 'n2_2']);
    assertTrue(h.q('[data-drv-id="d-alt-2"].vct__node').classList.contains('vct__node--ctq'), 'unbekannte Art nicht als CTQ');
    assertEqual(h.q('[data-req-id="r-alt-1"] .vct__req-target').textContent, `${tr('target')}: 30 min`);
    assertEqual(h.q('[data-req-id="r-alt-2"] .vct__req-target'), null);
    const vars = h.vm().styleVars;
    assertEqual(vars['--color-vct-voc'], 'rgba(200,90,20,1.00)');
    assertEqual(vars['--color-vct-ctd'], 'rgba(41,128,185,1.00)');
    assertEqual(vars['--color-vct-ctc'], 'rgba(231,76,139,1.00)');
    assertEqual(vars['--color-vct-req'], 'rgba(94,88,216,1.00)');
    assertEqual(vars['--vct-border-width'], '3.5px');
    assertEqual(/** @type {HTMLInputElement} */ (h.q('.dmike-slider')).value, '3.5');
    assertEqual(h.inst.historyCan('undo'), false);
    unmountAll();
  });
});
