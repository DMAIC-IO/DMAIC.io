/**
 * Tests für createModule({ exports }): Prüfungen beim Erzeugen, Menü,
 * cssVars, Griff _ui für runExport.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows, assertTrue } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { createModule } from '../../js/core/template-module.js';
import { defineModel, text } from '../../js/core/model.js';

const Doc = defineModel({ fields: { title: text() } });
const ID = 'exports-test';
const TPL_KEY = `js/modules/${ID}/${ID}.html`;
const make = (exportsDef, extra = {}) => createModule({
  config: { id: ID, engine: 'alpine', phase: 'define', templateUrl: new URL(TPL_KEY, document.baseURI).href, ...extra.config },
  Model: Doc,
  view: extra.view ?? (() => ({})),
  data: extra.data,
  exports: exportsDef,
});

function ensureTemplate() {
  if (!Alpine.version) Alpine.start();
  if (document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) return;
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', TPL_KEY);
  tpl.innerHTML = '<div x-data="exportsTest" style="--x-test-a: 12px; --x-test-b:  red "><span></span></div>';
  document.body.append(tpl);
}

const mounted = [];
let seenCtx = null;
/** Alle eingehängten Container entfernen. */
function unmountAll() { while (mounted.length) mounted.pop().remove(); }
async function mount(exportsDef, extraCtx = {}) {
  ensureTemplate();
  unmountAll();
  const context = {
    instanceId: 'ex-1',
    stateManager: { getModuleState: () => ({ title: 'abc' }), setModuleState: () => {} },
    i18n: { t: (k) => k, tf: () => (k) => k, getLanguage: () => 'de' },
    eventBus: { on: () => {}, emit: () => {} },
    notify: () => {},
    dialog: {},
    ...extraCtx,
  };
  const mod = make(exportsDef, { view(ctx) { seenCtx = ctx; return {}; } });
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container);
  await mod.init(container, context);
  await new Promise((r) => setTimeout(r, 0));
  return { mod, data: () => Alpine.$data(container.querySelector('[x-data]')) };
}

const f = () => [];

suite('createModule mit exports: Prüfungen', () => {
  test('nur mit view', () => {
    assertThrows(() => createModule({ config: { id: 'x-ex', engine: 'alpine' }, Model: Doc, data: () => ({}), exports: { table: f } }),
      /^createModule\(x-ex\): exports requires view$/);
  });
  test('exports: null ist kein Objekt', () => {
    assertThrows(() => make(null), /^createModule\(exports-test\): exports must be an object$/);
  });
  test('unbekannter Schlüssel', () => {
    assertThrows(() => make({ table: f, csv: f }), /^createModule\(exports-test\): exports\.csv is unknown \(allowed: fileName, table, tables, tree, image\)$/);
  });
  test('mindestens ein Mapper', () => {
    assertThrows(() => make({ fileName: 'x' }), /^createModule\(exports-test\): exports needs at least one of table, tables, tree, image$/);
  });
  test('Mapper sind Funktionen', () => {
    assertThrows(() => make({ table: [] }), /^createModule\(exports-test\): exports\.table must be a function$/);
  });
  test('fileName ist Text oder Funktion', () => {
    assertThrows(() => make({ table: f, fileName: 3 }), /^createModule\(exports-test\): exports\.fileName must be a string or a function$/);
    make({ table: f, fileName: () => 'x' });
  });
});

suite('createModule mit exports: Menü', () => {
  test('Dropdown hinten, nur vorhandene Formate, feste Reihenfolge', () => {
    const mod = make({ image: f, table: f }, { config: { actions: [{ icon: 'action.add', title: 'x', onClick: () => {} }] } });
    const actions = mod.getActions();
    assertEqual(actions.length, 2);
    assertEqual(actions[0].title, 'x');
    assertDeepEqual({ ...actions[1], children: undefined }, { icon: 'action.download', title: 'export.label', children: undefined });
    assertDeepEqual(actions[1].children, [
      { icon: 'format.xlsx', title: 'export.xlsx', export: 'xlsx' },
      { icon: 'format.csv', title: 'export.csv', export: 'csv' },
      { icon: 'format.png', title: 'export.png', export: 'png' },
      { icon: 'format.svg', title: 'export.svg', export: 'svg' },
    ]);
  });
  test('ohne exports: Aktionen unverändert', () => {
    const mod = createModule({ config: { id: 'x-plain', engine: 'alpine', actions: [] }, Model: Doc, view: () => ({}) });
    assertDeepEqual(mod.getActions(), []);
  });
});

suite('createModule mit exports: cssVars und _ui', () => {
  test('ctx.cssVars und this.cssVars lesen am Instanz-Root, getrimmt, fehlend leer', async () => {
    const { data } = await mount({ table: f });
    const map = { a: '--x-test-a', b: '--x-test-b', c: '--x-test-missing' };
    assertDeepEqual(seenCtx.cssVars(map), { a: '12px', b: 'red', c: '' });
    assertDeepEqual(data().cssVars(map), { a: '12px', b: 'red', c: '' });
  });
  test('this.chartSVG reicht Typ und Konfiguration an den chartManager', async () => {
    const calls = [];
    const { data } = await mount({ image() { return this.chartSVG('node-diagram', { padding: 3 }); } },
      { chartManager: { renderSVG: async (t, c) => { calls.push([t, c]); return '<svg/>'; } } });
    const ui = data()._ui;
    assertEqual(await ui.exports.image.call(ui.component), '<svg/>');
    assertDeepEqual(calls, [['node-diagram', { padding: 3 }]]);
  });
  test('_ui trägt exports und die Komponente', async () => {
    const def = { table() { return [[this.model.title]]; } };
    const { data } = await mount(def);
    const ui = data()._ui;
    assertEqual(Alpine.raw(ui).exports, def);
    assertDeepEqual(ui.exports.table.call(ui.component), [['abc']]);
    assertEqual(ui.moduleId, ID);
  });
  test('ohne exports: _ui.exports ist null', async () => {
    const { data } = await mount(undefined);
    assertEqual(data()._ui.exports, null);
    assertTrue(typeof data()._ui.component === 'object');
    unmountAll();
    assertEqual(mounted.length, 0);
  });
});
