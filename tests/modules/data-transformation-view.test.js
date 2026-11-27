/**
 * Datentransformation: das Viewmodel im Browser (viewmodel/viewmodel.js) mit
 * dem echten Modul, der echten Vorlage, einem Fake-stateManager mit
 * Arbeitsblatt und einem Fake-Stapel. Prüft: Leerzustand, Transformation per
 * Klick (`x-set`) und per Agent samt Rückgängig, λ leer (Platzhalter und
 * Schieber zeigen die Schätzung) und gesetzt (Dezimalkomma, Grenze, bleibt bei
 * neuer Spalte), Rückfall Box-Cox → Yeo-Johnson mit Hinweis ohne Schreiben,
 * Fehler, gelöschte Quellspalte, Kennwerte in der App-Sprache, Zielwähler mit
 * allen Spalten, Senden (neues Arbeitsblatt, gelöschte Zielspalte als
 * Hinweis, direkt nach einer Änderung), Kopieren, Export, zwei Instanzen und
 * das Altprojekt ohne Verlaufsschritt.
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
import mod from '../../js/modules/data-transformation/viewmodel/viewmodel.js';

const ID = 'data-transformation';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
/** Wartet, bis `ok()` gilt; höchstens zwei Sekunden. @param {() => boolean} ok */
async function until(ok) {
  for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 10));
}
/** @type {HTMLElement[]} */
const mounted = [];
/** @type {string[]} Text, den das Kommando copyExport in die Zwischenablage schrieb */
const clipboard = [];
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

const C1 = [2.3, 3.1, 1.8, 4.6, 2.9, 5.4, 3.7, 2.2, 6.8, 3.3, 4.1, 2.6, 8.9, 3.9, 2.0, 5.1, 3.5, 7.2, 2.8, 4.4];
const C2 = [-2.5, -1.0, 0, 0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, -0.5, 1.2, 2.2, 3.0, -1.5, 4.0, 0.8, 6.0];
/** Arbeitsblatt `ws1` mit Blatt „Messung“: C1 positiv, C2 mit Werten ≤ 0 (wie das Altprojekt), C3 leer. */
const SHEET = () => ({
  sheets: [{
    id: 's1',
    name: 'Messung',
    state: {
      rowCount: 20,
      columns: [
        { id: 'c1', name: 'Durchmesser', shortName: 'C1', type: 'numeric', values: [...C1] },
        { id: 'c2', name: 'Abweichung', shortName: 'C2', type: 'numeric', values: [...C2] },
        { id: 'c3', name: 'Leer', shortName: 'C3', type: 'numeric', values: [] },
      ],
    },
  }],
});
const plain = (v) => JSON.parse(JSON.stringify(v));
const ref = (columnId) => ({ instanceId: 'ws1', sheetId: 's1', columnId });
/** Altstand (a) aus der E2E-Fixture, ohne `_schema`: Box-Cox auf C1. */
const LEGACY_A = { currentTF: 'boxcox', columnRef: ref('c1'), exampleWorksheetId: null };

/**
 * Eine Instanz einhängen.
 * @param {string} instanceId @param {object|null} model
 * @param {{ keep?: boolean, sheet?: any, interact?: (stack: any) => Promise<any>, chartEdits?: object }} [opts]
 */
async function mount(instanceId, model, { keep = false, sheet = SHEET(), interact, chartEdits = {} } = {}) {
  await prepare();
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (text) => { clipboard.push(text); } },
  });
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
    inst, states, notes, stacks, activated, container, q, qa, bus,
    vm: () => Alpine.$data(container.querySelector('[x-data]')),
    tile: (id) => /** @type {HTMLButtonElement} */ (q(`.dt-tf-opt[data-id="${id}"]`)),
    active: () => qa('.dt-tf-opt--active').map((b) => b.dataset.id),
    num: (key) => /** @type {HTMLInputElement} */ (q(`.dt-param__number[data-param-key="${key}"]`)),
    range: (key) => /** @type {HTMLInputElement} */ (q(`.dt-param__range[data-range-for="${key}"]`)),
    stats: () => Object.fromEntries(qa('[data-ref="stats-body"] tr').map((r) => { const c = [...r.querySelectorAll('td')].map((td) => td.textContent); return [c[0], [c[1], c[2]]]; })),
    hasResults: () => h.q('[data-ref="stats-body"]') !== null,
    /** Text in ein Feld tippen und bestätigen. */
    type: async (el, text) => {
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

suite('data-transformation: Viewmodel im Browser', () => {
  test('leer: Box-Cox gewählt, neun Kacheln, λ-Block, keine Ausgabe; Klick wählt, Rückgängig stellt zurück', async () => {
    const h = await mount('dt-1', null);
    assertEqual(h.vm().model.currentTF, 'boxcox');
    assertEqual(h.q('.dt-tf-grid').getAttribute('role'), 'radiogroup');
    assertEqual(h.qa('.dt-tf-opt[role="radio"]').length, 9);
    assertDeepEqual(h.active(), ['boxcox']);
    assertTrue(h.num('lambda') !== null);
    assertEqual(h.num('lambda').value, '');
    assertEqual(h.hasResults(), false);
    await h.click(h.tile('johnson_su'));
    await until(() => h.num('gamma') !== null);
    assertEqual(h.vm().model.currentTF, 'johnson_su');
    assertDeepEqual(h.active(), ['johnson_su']);
    assertEqual(h.qa('.dt-param').length, 4);
    await h.click(h.tile('log'));
    await until(() => h.qa('.dt-param').length === 0);
    assertEqual(await h.undo(), true);
    await until(() => h.vm().model.currentTF === 'johnson_su');
    assertDeepEqual(h.active(), ['johnson_su']);
    assertEqual(await h.redo(), true);
    await until(() => h.vm().model.currentTF === 'log');
  });

  test('Agent setzt die Transformation: sichtbar wie ein Klick', async () => {
    const h = await mount('dt-1', null);
    setFields(h.vm().model, { currentTF: 'yeojohnson' });
    await until(() => h.active()[0] === 'yeojohnson');
    assertTrue(h.num('lambda') !== null);
  });

  test('Altprojekt (a): Kennwerte und Normalität in der App-Sprache, λ als Platzhalter, kein Verlaufsschritt', async () => {
    const h = await mount('dt-1', plain(LEGACY_A));
    await until(() => h.hasResults() && h.num('lambda').placeholder === '-0,35');
    assertEqual(h.inst.historyCan('undo'), false);
    const s = h.stats();
    assertDeepEqual(s[tr('statMean')], ['4,0300', '1,0249']);
    assertDeepEqual(s[tr('statKurtosis')], ['1,0988', '-0,6379']);
    assertDeepEqual(s['common.sym.n'], ['20', '20']);
    assertEqual(h.num('lambda').value, '');
    // Der Schieber rastet auf seinem Schritt 0,1 ein (wie die Altform).
    assertEqual(h.range('lambda').value, '-0.3');
    const rows = h.qa('.dt-normality__row').map((r) => r.textContent.replace(/\s+/g, ' ').trim());
    assertTrue(rows[0].includes('A² = 0,6846, p ≈ 0,0738'), rows[0]);
    assertTrue(rows[1].includes('A² = 0,0894, p ≈ 0,9979'), rows[1]);
    assertEqual(h.q('.dt-normality__alpha').textContent, `α = 0,05 | H₀: ${tr('h0Normal')}`);
    assertEqual(h.q('[data-ref="export-box"]').textContent.split('\n')[0], '0.722490');
    assertEqual(h.vm().model.params.boxcox.lambda, null);
    assertEqual(h.q('[data-ref="fallback-hint"]').style.display, 'none');
  });

  test('λ: Dezimalkomma, Grenze abgelehnt mit Meldung, Leeren kehrt zur Schätzung zurück, Wert bleibt bei neuer Spalte', async () => {
    const h = await mount('dt-1', plain(LEGACY_A));
    await until(() => h.num('lambda')?.placeholder === '-0,35');
    await h.type(h.num('lambda'), '0,5');
    assertEqual(h.vm().model.params.boxcox.lambda, 0.5);
    await until(() => h.range('lambda').value === '0.5');
    assertEqual(h.num('lambda').placeholder, '');
    await h.type(h.num('lambda'), '6');
    assertEqual(h.vm().model.params.boxcox.lambda, 0.5);
    assertTrue(h.vm().fieldError('model.params.boxcox.lambda') !== '', 'Meldung fehlt');
    assertEqual(h.num('lambda').value, '0,5');
    // Neue Spalte: das gesetzte λ bleibt.
    setFields(h.vm().model, { columnRef: ref('c2'), currentTF: 'johnson_su' });
    setFields(h.vm().model, { currentTF: 'boxcox', columnRef: ref('c1') });
    await settle();
    assertEqual(h.vm().model.params.boxcox.lambda, 0.5);
    await h.type(h.num('lambda'), '');
    assertEqual(h.vm().model.params.boxcox.lambda, null);
    await until(() => h.num('lambda').placeholder === '-0,35' && h.range('lambda').value === '-0.3');
    // Schieber schreibt denselben Pfad.
    const r = h.range('lambda');
    r.value = '1.2';
    r.dispatchEvent(new Event('input', { bubbles: true }));
    r.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    assertEqual(h.vm().model.params.boxcox.lambda, 1.2);
    await until(() => h.num('lambda').value === '1,2');
  });

  test('Johnson: Werte bleiben je Transformation beim Wechsel', async () => {
    const h = await mount('dt-1', null);
    await h.click(h.tile('johnson_su'));
    await until(() => h.num('delta') !== null);
    await h.type(h.num('delta'), '2,5');
    assertEqual(h.vm().model.params.johnson_su.delta, 2.5);
    await h.click(h.tile('johnson_sb'));
    await until(() => h.num('delta')?.value === '1');
    await h.click(h.tile('johnson_su'));
    await until(() => h.num('delta')?.value === '2,5');
  });

  test('Rückfall: Box-Cox auf Werten ≤ 0 zeigt Hinweis und den Yeo-Johnson-Block, gespeichert bleibt Box-Cox', async () => {
    const h = await mount('dt-1', { ...plain(LEGACY_A), columnRef: ref('c2') });
    await until(() => h.hasResults());
    assertEqual(h.vm().model.currentTF, 'boxcox');
    assertDeepEqual(h.active(), ['boxcox']);
    assertEqual(h.vm().effectiveTF, 'yeojohnson');
    assertTrue(h.q('[data-ref="fallback-hint"]').style.display !== 'none');
    assertEqual(h.q('[data-ref="fallback-hint"]').textContent, tr('warnBoxCoxFallback'));
    assertTrue(h.q('[data-help-key="modules.data-transformation.fields.params.yeojohnson.lambda.help"]') !== null);
    await until(() => h.num('lambda').placeholder === '0,8');
    assertEqual(h.inst.historyCan('undo'), false);
    setFields(h.vm().model, { columnRef: ref('c1') });
    await until(() => h.q('[data-ref="fallback-hint"]').style.display === 'none' && h.num('lambda').placeholder === '-0,35');
  });

  test('Fehler bleibt stehen, solange die Ursache besteht; gelöschte Quellspalte: keine Ausgabe, Bezug bleibt', async () => {
    const h = await mount('dt-1', { ...plain(LEGACY_A), currentTF: 'log', columnRef: ref('c2') });
    await until(() => h.q('[data-ref="error"]') !== null);
    assertEqual(h.q('[data-ref="error"]').textContent, tr('errLogPositive'));
    assertEqual(h.hasResults(), false);
    await h.click(h.tile('square'));
    await until(() => h.hasResults());
    assertEqual(h.q('[data-ref="error"]'), null);
    const ws = h.states.ws1;
    ws.sheets[0].state.columns = ws.sheets[0].state.columns.filter((c) => c.id !== 'c2');
    h.bus.emit('worksheet:dataChanged', { instanceId: 'ws1' });
    await until(() => !h.hasResults());
    assertEqual(h.q('[data-ref="error"]'), null);
    // Eingehängt verwirft der Spaltenwähler den Bezug (Kern, ROADMAP); beim Laden bleibt er.
    const sheet = SHEET();
    sheet.sheets[0].state.columns.splice(1, 1);
    const g = await mount('dt-2', { ...plain(LEGACY_A), columnRef: ref('c2') }, { sheet });
    await settle();
    await until(() => !g.vm()._asyncTasks.analysis.running);
    assertDeepEqual(plain(g.vm().model.columnRef), ref('c2'));
    assertEqual(g.hasResults(), false);
    assertEqual(g.q('[data-ref="error"]'), null);
  });

  test('Zellen ändern rechnet neu', async () => {
    const h = await mount('dt-1', plain(LEGACY_A));
    await until(() => h.stats()['common.sym.n']?.[0] === '20');
    h.states.ws1.sheets[0].state.columns[0].values.push(9.5);
    h.bus.emit('worksheet:dataChanged', { instanceId: 'ws1' });
    await until(() => h.stats()['common.sym.n']?.[0] === '21');
  });

  test('Zielwähler: alle Spalten je Blatt und „neue Spalte“; Senden an ein neues Arbeitsblatt holt es nach vorn', async () => {
    const h = await mount('dt-1', plain(LEGACY_A));
    await until(() => h.q('[data-ref="target"]') !== null);
    const sel = /** @type {HTMLSelectElement} */ (h.q('[data-ref="target"]'));
    await until(() => sel.querySelectorAll('optgroup option').length === 4);
    assertDeepEqual([...sel.querySelectorAll('optgroup option')].map((o) => o.value), ['ws1|s1|c1', 'ws1|s1|c2', 'ws1|s1|c3', 'ws1|s1|__new__']);
    assertEqual(sel.querySelector('optgroup').label, 'Messung');
    await h.click(h.q('[data-ref="send"]'));
    assertDeepEqual(h.notes.at(-1), [tr('selectTarget'), 'warning']);
    sel.value = '__create_worksheet__';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    await h.click(h.q('[data-ref="send"]'));
    await until(() => h.activated.length > 0);
    assertEqual(h.stacks.length, 1);
    const json = JSON.stringify(h.stacks[0]);
    assertTrue(json.includes(`Durchmesser (${tr('tfBoxCox')})`), json.slice(0, 300));
    assertDeepEqual(h.activated, [{ instanceId: 'ws-new' }]);
    assertEqual(h.notes.at(-1)[1], 'success');
    // Die Wahl übersteht einen neuen Lauf.
    await h.click(h.tile('sqrt'));
    await until(() => h.vm().analysis?.transform === 'sqrt');
    assertEqual(h.vm().state.target, '__create_worksheet__');
    assertEqual(/** @type {HTMLSelectElement} */ (h.q('[data-ref="target"]')).value, '__create_worksheet__');
  });

  test('Zielspalte zwischen Wahl und Senden gelöscht: Hinweis, kein Stapel; Agent an gefüllte Spalte überschreibt', async () => {
    const h = await mount('dt-1', plain(LEGACY_A));
    await until(() => h.q('[data-ref="target"]') !== null);
    h.vm().state.target = 'ws1|s1|c3';
    await settle();
    const ws = h.states.ws1;
    ws.sheets[0].state.columns = ws.sheets[0].state.columns.filter((c) => c.id !== 'c3');
    h.bus.emit('worksheet:dataChanged', { instanceId: 'ws1' });
    await settle();
    await h.click(h.q('[data-ref="send"]'));
    await until(() => h.notes.length > 0);
    assertDeepEqual(h.notes.at(-1), [tr('targetUnavailable'), 'warning']);
    assertEqual(h.stacks.length, 0);
    const out = await h.vm()._asyncTaskHost.start('toWorksheet', { target: 'ws1|s1|c2' });
    assertEqual(out.status, 'done');
    assertEqual(h.activated.length, 0);
    assertEqual(h.stacks.length, 1);
    assertTrue(JSON.stringify(h.stacks[0]).includes('overwrite') || JSON.stringify(h.stacks[0]).includes('c2'));
    const bad = await h.vm()._asyncTaskHost.start('toWorksheet', { target: 'ws1|s1|zz' });
    assertEqual(bad.status, 'failed');
  });

  test('Senden direkt nach einer Parameteränderung schickt die neuen Werte', async () => {
    const h = await mount('dt-1', plain(LEGACY_A));
    await until(() => h.hasResults());
    const p = plain(h.vm().model.params);
    p.boxcox.lambda = 1;
    setFields(h.vm().model, { params: p });
    const out = await h.vm()._asyncTaskHost.start('toWorksheet', { target: null });
    assertEqual(out.status, 'done');
    // λ = 1: x − 1 — der erste Wert 2,3 wird 1,3.
    assertTrue(JSON.stringify(h.stacks[0]).includes('1.2999999999999998') || JSON.stringify(h.stacks[0]).includes('1.3'), JSON.stringify(h.stacks[0]).slice(0, 400));
  });

  test('Kopieren: Text des Kastens in die Zwischenablage; ohne Werte abgelehnt', async () => {
    clipboard.length = 0;
    const h = await mount('dt-1', plain(LEGACY_A));
    await until(() => h.hasResults());
    await h.click(h.q('[data-action="copy"]'));
    await until(() => clipboard.length === 1);
    assertEqual(clipboard[0], h.q('[data-ref="export-box"]').textContent);
    assertEqual(clipboard[0].split('\n').length, 20);
    await until(() => h.notes.some((n) => n[0] === tr('copied')));
    const e = await mount('dt-2', null);
    let msg = null;
    try { e.vm().copyExport({}); } catch (err) { msg = /** @type {Error} */ (err).message; }
    assertEqual(msg, tr('nothingToCopy'));
  });

  test('Export: CSV mit Original und Transformiert, Dateiname transformation; ohne Werte keine Datei', async () => {
    const h = await mount('dt-1', plain(LEGACY_A));
    await until(() => h.hasResults());
    /** @type {{ text: string, name: string }[]} */
    const files = [];
    const io = { downloadFile: (text, name) => files.push({ text, name }), downloadBlob: () => {} };
    await runExport(h.vm()._ui, 'csv', io);
    await until(() => files.length === 1);
    assertEqual(files[0].name, 'transformation.csv');
    const lines = files[0].text.split(/\r?\n/).filter(Boolean);
    assertEqual(lines.length, 22, lines.slice(0, 3).join('|'));
    assertEqual(lines[1], `"${tr('original')}";"${tr('transformed')}"`);
    assertTrue(lines[2].startsWith('2,3;0,72249'), lines[2]);
    const e = await mount('dt-2', null);
    files.length = 0;
    await runExport(e.vm()._ui, 'csv', io);
    await settle();
    assertEqual(files.length, 0);
  });

  test('zwei Instanzen: eine Wahl wirkt nur in ihrer Instanz', async () => {
    const a = await mount('dt-a', null);
    const b = await mount('dt-b', null, { keep: true });
    await a.click(a.tile('log10'));
    await until(() => a.vm().model.currentTF === 'log10');
    assertEqual(b.vm().model.currentTF, 'boxcox');
    assertDeepEqual(b.active(), ['boxcox']);
    await b.click(b.tile('inverse'));
    await until(() => b.vm().model.currentTF === 'inverse');
    assertEqual(a.vm().model.currentTF, 'log10');
  });
});
