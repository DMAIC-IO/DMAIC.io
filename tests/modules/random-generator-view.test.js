/**
 * Zufallsgenerator: das Viewmodel im Browser (viewmodel/viewmodel.js) mit dem
 * echten Modul, der echten Vorlage, einem Fake-stateManager mit Arbeitsblatt
 * und einem Fake-Stapel. Prüft: Leerzustand, Verteilung per Klick
 * (`x-set`) und per Agent (`setFields`) samt Rückgängig, Parameter je
 * Verteilung über `x-field` (Dezimalkomma, Grenze, Reihenfolge M5),
 * leerer Startwert, Kennzahlen in der App-Sprache, Kategorien (anlegen,
 * Gewicht, entfernen), Zielwähler aus dem Arbeitsblatt und das Senden
 * (neues Arbeitsblatt, gefüllte Spalte als Hinweis), den Export, zwei
 * Instanzen und das Altprojekt ohne Verlaufsschritt.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { registerCommandDirectives } from '../../js/core/command-directives.js';
import { registerFieldDirective } from '../../js/core/field-directive.js';
import { registerWidgetDirective } from '../../js/core/widget-directive.js';
import { installWorksheetRevisions } from '../../js/core/worksheet-data.js';
import { setFields } from '../../js/core/model.js';
import { runExport } from '../../js/core/exporter.js';
import { WIDGETS } from '../../js/widgets/registry.js';
import { WIDGET_I18N } from '../widget-i18n.js';
import { withStoredWorksheetReader } from '../helpers/worksheet-reader.js';
import mod from '../../js/modules/random-generator/viewmodel/viewmodel.js';

const ID = 'random-generator';
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
/** @param {string} path @param {object} [params] */
function trp(path, params = {}) {
  return tr(path).replace(/\{(\w+)\}/g, (_, k) => String(params[k]));
}

async function prepare() {
  if (!prepared) {
    registerCommandDirectives(Alpine);
    registerFieldDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
    registerWidgetDirective(Alpine, { i18n: WIDGET_I18N, widgets: WIDGETS });
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

/** Arbeitsblatt `ws1` mit Blatt „Daten“: `c1` gefüllt, `c2` leer. */
const SHEET = () => ({
  sheets: [{
    id: 's1',
    name: 'Daten',
    state: {
      rowCount: 3,
      columns: [
        { id: 'c1', name: 'Voll', type: 'numeric', values: [1, 2, 3] },
        { id: 'c2', name: 'Leer', type: 'numeric', values: [] },
      ],
    },
  }],
});
const plain = (v) => JSON.parse(JSON.stringify(v));
/** Altstand (a) aus der E2E-Fixture, ohne `_schema`. */
const LEGACY_A = {
  currentDist: 'normal', seed: 7, count: 200, params: { mu: 5, sigma: 2, epsilon: 0, delta: 1 },
  attributes: [{ id: 'x1', name: 'A', weight: 1 }], attrCount: 50, attrSeed: 42,
};

/**
 * Eine Instanz einhängen.
 * @param {string} instanceId @param {object|null} model
 * @param {{ keep?: boolean, sheet?: any, interact?: (stack: any) => Promise<any>, chartEdits?: object }} [opts]
 */
async function mount(instanceId, model, { keep = false, sheet = SHEET(), interact, chartEdits = {} } = {}) {
  await prepare();
  if (!keep) unmountAll();
  const states = { [instanceId]: model, ws1: sheet };
  /** @type {any[][]} */
  const notes = [];
  /** @type {any[]} */
  const stacks = [];
  /** @type {any[]} */
  const activated = [];
  const handlers = [];
  const bus = {
    on: (n, fn) => handlers.push([n, fn]),
    off: (n, fn) => { const i = handlers.findIndex(([a, f]) => a === n && f === fn); if (i >= 0) handlers.splice(i, 1); },
    emit: (n, p) => {
      if (n === 'module:activated') activated.push(p);
      for (const [a, f] of [...handlers]) if (a === n) f(p);
    },
  };
  installWorksheetRevisions(bus);
  const context = {
    instanceId,
    instances: {
      list: () => [{ instanceId: 'ws1', moduleId: 'worksheet' }],
      read: async () => ({}),
      interact: async (stack) => {
        stacks.push(plain(stack));
        if (interact) return interact(stack);
        return { ok: true, results: [{ id: 'ws', result: { instanceId: 'ws-new' } }, { id: 'write', result: { instanceId: 'ws-new', value: ['n1'] } }] };
      },
    },
    stateManager: withStoredWorksheetReader({
      getModuleState: (id) => states[id] ?? null,
      setModuleState: (id, s) => { states[id] = s; },
      getProjectCycle: () => 'dmaic',
      get: (path) => (path === 'phases' ? { data: [{ instanceId: 'ws1', moduleId: 'worksheet' }] } : undefined),
      getChartEdits: (inst, key) => chartEdits[inst]?.[key] ?? null,
      setChartEdit: () => {},
    }),
    i18n: { t: (k) => k, tf: () => trp, getLanguage: () => 'de' },
    eventBus: bus,
    chartManager: { create: async (el, type, config) => ({ el, type, config }), update: () => {}, destroy: () => {} },
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
  const h = {
    inst, states, notes, stacks, activated, container, q, qa,
    vm: () => Alpine.$data(container.querySelector('[x-data]')),
    btn: (dist) => /** @type {HTMLButtonElement} */ (q(`.rg-sidebar__btn[data-dist="${dist}"]`)),
    field: (ref) => /** @type {HTMLInputElement} */ (q(`[data-ref="${ref}"]`)),
    kpis: () => Object.fromEntries(qa('.dmike-kpi').map((k) => [k.querySelector('.dmike-kpi-label').textContent, k.querySelector('.dmike-kpi-value').textContent])),
    /** Text in ein Feld tippen und bestätigen. */
    type: async (ref, text) => {
      const el = h.field(ref);
      el.focus();
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      await settle();
    },
    click: async (el) => { el.click(); await settle(); },
    undo: async () => { const ok = h.inst.historyStep('undo'); await settle(); return ok; },
    redo: async () => { const ok = h.inst.historyStep('redo'); await settle(); return ok; },
    saved: () => plain(states[instanceId]),
  };
  return h;
}

suite('random-generator: Viewmodel im Browser', () => {
  test('leer: keine Verteilung aktiv, kein Inhalt; Klick wählt, Rückgängig stellt zurück', async () => {
    const h = await mount('rg-1', null);
    assertEqual(h.vm().model.currentDist, null);
    assertTrue(h.q('.rg-main__empty') !== null);
    assertEqual(h.qa('.rg-sidebar__btn--active').length, 0);
    assertEqual(h.q('aside').getAttribute('role'), 'radiogroup');
    assertEqual(h.qa('.rg-sidebar__btn[role="radio"]').length, 26);
    await h.click(h.btn('uniform'));
    await until(() => h.q('.rg-dist-title')?.textContent === tr('distUniform'));
    assertEqual(h.vm().model.currentDist, 'uniform');
    assertDeepEqual(h.qa('.rg-sidebar__btn--active').map((b) => b.dataset.dist), ['uniform']);
    assertEqual(h.kpis()[tr('statN')], '1.000');
    assertEqual(await h.undo(), true);
    await until(() => h.q('.rg-main__empty') !== null);
    assertEqual(h.vm().model.currentDist, null);
    assertEqual(await h.redo(), true);
    await until(() => h.vm().model.currentDist === 'uniform');
  });

  test('Agent setzt die Verteilung: sichtbar wie ein Klick', async () => {
    const h = await mount('rg-1', null);
    setFields(h.vm().model, { currentDist: 'attributive' });
    await until(() => h.q('.rg-attr-row') !== null);
    assertDeepEqual(h.qa('.rg-sidebar__btn--active').map((b) => b.dataset.dist), ['attributive']);
    assertEqual(h.qa('.rg-attr-row').length, 3);
  });

  test('Altprojekt (a): Kennzahlen in der App-Sprache, Parameter in den Feldern, kein Verlaufsschritt', async () => {
    const h = await mount('rg-1', plain(LEGACY_A));
    await until(() => h.kpis()[tr('statMean')] !== undefined);
    assertEqual(h.inst.historyCan('undo'), false);
    const k = h.kpis();
    assertEqual(k[tr('statN')], '200');
    assertEqual(k[tr('statMean')], '4,9574');
    assertEqual(k[tr('statMin')], '-0,3602');
    assertEqual(h.field('param-mu').value, '5');
    assertEqual(h.field('param-sigma').value, '2');
    assertEqual(h.field('count').value, '200');
    assertEqual(h.field('seed').value, '7');
    assertEqual(h.q('.rg-data__count').textContent, '200');
    assertEqual(h.qa('.rg-data__values span').length, 200);
    assertTrue(/^-?\d+,\d{6}$/.test(h.qa('.rg-data__values span')[0].textContent), h.qa('.rg-data__values span')[0].textContent);
  });

  test('Parameter: Dezimalkomma, Grenze abgelehnt mit Meldung, Verteilungen behalten ihre Werte', async () => {
    const h = await mount('rg-1', null);
    await h.click(h.btn('normal'));
    await until(() => h.field('param-mu') !== null);
    await h.type('param-mu', '2,5');
    assertEqual(h.vm().model.params.normal.mu, 2.5);
    await h.type('param-sigma', '0');
    assertEqual(h.vm().model.params.normal.sigma, 1);
    assertEqual(h.field('param-sigma').value, '1');
    assertTrue(h.vm().fieldError('model.params.normal.sigma') !== '', 'Meldung fehlt');
    await h.click(h.btn('logistic'));
    await until(() => h.q('.rg-dist-title')?.textContent === tr('distLogistic'));
    assertEqual(h.field('param-mu').value, '0');
    await h.click(h.btn('normal'));
    await until(() => h.field('param-mu')?.value === '2,5');
  });

  test('M5: uniform a über b wird abgelehnt, die Meldung nennt die Regel', async () => {
    const h = await mount('rg-1', null);
    await h.click(h.btn('uniform'));
    await until(() => h.field('param-a') !== null);
    await h.type('param-a', '5');
    assertEqual(h.vm().model.params.uniform.a, 0);
    assertEqual(h.vm().fieldError('model.params.uniform.a'), `modules.${ID}.invariants.uniformOrder`);
    await h.type('param-b', '9');
    await h.type('param-a', '5');
    assertDeepEqual(plain(h.vm().model.params.uniform), { a: 5, b: 9 });
  });

  test('leerer Startwert: Feld leer mit Platzhalter 42, Werte wie mit 42', async () => {
    const h = await mount('rg-1', null);
    await h.click(h.btn('poisson'));
    await until(() => h.field('seed') !== null);
    const at42 = h.kpis()[tr('statMean')];
    await h.type('seed', '0');
    assertEqual(h.vm().model.seed, 0);
    await h.type('seed', '');
    assertEqual(h.vm().model.seed, null);
    assertEqual(h.field('seed').value, '');
    assertEqual(h.field('seed').placeholder, '42');
    await until(() => h.kpis()[tr('statMean')] === at42);
    await h.type('seed', '1,5');
    assertEqual(h.vm().model.seed, null);
  });

  test('Kategorien: anlegen, Gewicht, entfernen mit Rückfrage; Anteile und Häufigkeiten', async () => {
    const h = await mount('rg-1', null);
    await h.click(h.btn('attributive'));
    await until(() => h.q('.rg-attr-row') !== null);
    assertDeepEqual(h.qa('.rg-attr-prob__bar-label').map((e) => e.textContent), ['10,0%', '20,0%', '70,0%']);
    await h.click(h.q('[data-ref="attr-add"]'));
    assertEqual(h.vm().model.attributes.length, 4);
    const w = /** @type {HTMLInputElement} */ (h.q('.rg-attr-row__weight[data-i="0"]'));
    w.focus(); w.value = '3,5'; w.dispatchEvent(new Event('input', { bubbles: true })); w.dispatchEvent(new Event('change', { bubbles: true })); w.blur();
    await settle();
    assertEqual(h.vm().model.attributes[0].weight, 3.5);
    await h.click(h.q('.rg-attr-row__remove[data-i="1"]'));
    await until(() => h.vm().model.attributes.length === 3);
    assertDeepEqual(h.vm().model.attributes.map((a) => a.name), ['A', 'C', '']);
    assertTrue(h.qa('.rg-freq-row').length > 0);
    assertEqual(h.kpis()[tr('catCount')], '2');
  });

  test('Zielwähler: leere Spalten je Blatt und „neue Spalte“; Senden an ein neues Arbeitsblatt holt es nach vorn', async () => {
    const h = await mount('rg-1', null);
    await h.click(h.btn('bernoulli'));
    await until(() => h.q('[data-ref="target"]') !== null);
    const sel = /** @type {HTMLSelectElement} */ (h.q('[data-ref="target"]'));
    await until(() => sel.querySelectorAll('optgroup option').length === 2);
    assertDeepEqual([...sel.querySelectorAll('optgroup option')].map((o) => o.value), ['ws1|s1|c2', 'ws1|s1|__new__']);
    assertEqual(sel.querySelector('optgroup').label, 'Daten');
    await h.click(h.q('[data-ref="send"]'));
    assertDeepEqual(h.notes.at(-1), [tr('selectTarget')]);
    sel.value = '__create_worksheet__';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    await h.click(h.q('[data-ref="send"]'));
    await until(() => h.activated.length > 0);
    assertEqual(h.stacks.length, 1);
    assertDeepEqual(h.activated, [{ instanceId: 'ws-new' }]);
    assertEqual(h.notes.at(-1)[1], 'success');
  });

  test('Senden an eine inzwischen gefüllte Spalte: Hinweis, kein Stapel; Agent ohne Ansichtswechsel', async () => {
    const sheet = SHEET();
    const h = await mount('rg-1', null, { sheet });
    await h.click(h.btn('bernoulli'));
    await until(() => h.q('[data-ref="target"]') !== null);
    h.vm().state.target = 'ws1|s1|c9';
    await settle();
    await h.click(h.q('[data-ref="send"]'));
    await until(() => h.notes.length > 0);
    assertDeepEqual(h.notes.at(-1), [tr('targetUnavailable'), 'warning']);
    assertEqual(h.stacks.length, 0);
    const out = await h.vm()._asyncTaskHost.start('toWorksheet', { target: 'ws1|s1|c2' });
    assertEqual(out.status, 'done');
    assertEqual(h.activated.length, 0);
    assertEqual(h.stacks.length, 1);
  });

  test('Export: CSV mit Spalte Value, Dateiname mit Startwert; ohne Verteilung keine Datei', async () => {
    const h = await mount('rg-1', plain(LEGACY_A));
    await until(() => h.kpis()[tr('statN')] === '200');
    /** @type {{ text: string, name: string }[]} */
    const files = [];
    const io = { downloadFile: (text, name) => files.push({ text, name }), downloadBlob: () => {} };
    await runExport(h.vm()._ui, 'csv', io);
    await until(() => files.length === 1);
    assertEqual(files[0].name, 'normal_seed7_n200.csv');
    const lines = files[0].text.split(/\r?\n/).filter(Boolean);
    assertEqual(lines.length, 202, lines.slice(0, 3).join('|'));
    assertEqual(lines[1], '"Value"');
    const e = await mount('rg-2', null);
    files.length = 0;
    await runExport(e.vm()._ui, 'csv', io);
    await settle();
    assertEqual(files.length, 0);
  });

  test('zwei Instanzen: eine Wahl wirkt nur in ihrer Instanz', async () => {
    const a = await mount('rg-a', null);
    const b = await mount('rg-b', null, { keep: true });
    await a.click(a.btn('normal'));
    await until(() => a.vm().model.currentDist === 'normal');
    assertEqual(b.vm().model.currentDist, null);
    assertEqual(b.qa('.rg-sidebar__btn--active').length, 0);
    await b.click(b.btn('geometric'));
    await until(() => b.vm().model.currentDist === 'geometric');
    assertEqual(a.vm().model.currentDist, 'normal');
  });
});
