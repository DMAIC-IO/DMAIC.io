/**
 * Opportunity-Flowchart: das Viewmodel im Browser (viewmodel/viewmodel.js)
 * mit dem echten Modul, einer schlanken Vorlage und Attrappen für
 * stateManager, Instanzendienst, Dialog und Meldungen. Prüft Einfügen an
 * einer Lücke, den Import über `ctx.instances` und den JSON-Export.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import Alpine from '../../../vendor/alpinejs/csp.js';
import mod from '../../../js/modules/opportunity-flowchart/viewmodel/viewmodel.js';
import { registerCommandDirectives } from '../../../js/core/command-directives.js';
import { toJsonTree } from '../../../js/modules/opportunity-flowchart/io/export.js';

const ID = 'opportunity-flowchart';
const TPL_KEY = `js/modules/${ID}/resources/view.html`;
const flush = () => new Promise((r) => setTimeout(r, 0));
/** Alpines `$nextTick` läuft erst nach einem eigenen `setTimeout`. */
const settle = async () => { await flush(); await flush(); };
const mounted = [];

/** Texte, die die Prüfungen lesen; sonst der Schlüssel mit Parametern. */
const tf = (k, p) => (p ? `${k}${JSON.stringify(p)}` : k);

function ensureTemplate() {
  registerCommandDirectives(Alpine);
  if (!Alpine.version) Alpine.start();
  if (document.querySelector(`template[data-tpl="${TPL_KEY}"]`)) return;
  // Schlankes Gerüst mit dem Namen und dem Einfügeknopf der echten Vorlage
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', TPL_KEY);
  tpl.innerHTML = '<div x-data="opportunityFlowchart">'
    + '<button type="button" data-ref="insert" x-command="addStep" data-arg-index="1" data-arg-side="nva"'
    + ' @click.stop="closeInsertMenu()"></button>'
    + '<div x-ref="importForm"></div>'
    + '</div>';
  document.body.append(tpl);
}

const step = (id, title, side = 'va') => ({ id, title, description: '', side, substeps: [] });

/**
 * Modul einhängen.
 * @param {object|null} model gespeicherter Zustand der Instanz
 * @param {{ list?: any[], reads?: Record<string, any>, readError?: Error|null }} [sources] Instanzen für `ctx.instances`
 */
async function mount(model, { list = [], reads = {}, readError = null } = {}) {
  ensureTemplate();
  while (mounted.length) mounted.pop().remove();
  const notes = [];
  const forms = [];
  const listCalls = [];
  const context = {
    instanceId: 'of-1',
    stateManager: {
      getModuleState: (id) => (id === 'of-1' ? model : null),
      setModuleState: () => {},
      getProjectCycle: () => 'dmaic',
      get: () => undefined,
    },
    i18n: { t: (k) => k, tf: () => tf, getLanguage: () => 'de' },
    eventBus: { on: () => {}, off: () => {}, emit: () => {} },
    notify: (msg, type) => notes.push([msg, type]),
    dialog: { form: (opts) => { forms.push(opts); return Promise.resolve(true); } },
    instances: {
      list: (opts) => { listCalls.push(opts); return list; },
      read: async (id) => { if (readError) throw readError; return reads[id]; },
    },
  };
  const container = document.createElement('div');
  document.body.append(container);
  mounted.push(container);
  await mod.init(container, context);
  await flush();
  return { container, notes, forms, listCalls, vm: () => Alpine.$data(container.querySelector('[x-data]')) };
}

suite('opportunity-flowchart: Viewmodel im Browser', () => {
  test('Einfügen in Lücke 1 legt den Schritt an Index 1 an und schließt das Menü', async () => {
    const h = await mount({ _schema: { version: '1.0' }, steps: [step('a', 'A'), step('b', 'B')], expanded: [] });
    h.vm().state.insertMenuAt = 1;
    h.container.querySelector('[data-ref="insert"]').click();
    await flush();
    const steps = h.vm().model.steps;
    assertEqual(steps.length, 3);
    assertEqual(steps[0].id, 'a');
    assertEqual(steps[1].side, 'nva');
    assertEqual(steps[2].id, 'b');
    assertEqual(h.vm().state.insertMenuAt, null);
  });

  test('openImport ohne Quelle zeigt importEmptyHint und öffnet keinen Dialog', async () => {
    const h = await mount(null);
    h.vm().openImport();
    await settle();
    assertDeepEqual(h.listCalls, [{ modules: ['process-map', 'sipoc'] }]);
    assertDeepEqual(h.notes, [['importEmptyHint', 'info']]);
    assertEqual(h.forms.length, 0);
  });

  test('openImport mit Quellen: Liste im UI-State, erste vorgewählt, Dialog mit importForm', async () => {
    const list = [
      { instanceId: 'p1', moduleId: 'process-map', phase: 'analyze', title: '' },
      { instanceId: 'p2', moduleId: 'process-map', phase: 'analyze', title: 'Wareneingang' },
      { instanceId: 's1', moduleId: 'sipoc', phase: 'define', title: '' },
    ];
    const h = await mount(null, { list });
    h.vm().openImport();
    await settle();
    assertDeepEqual(h.vm().state.importOptions.map((o) => [o.instanceId, o.moduleId, o.label]), [
      ['p1', 'process-map', '#1'],
      ['p2', 'process-map', 'Wareneingang'],
      ['s1', 'sipoc', ''],
    ]);
    assertEqual(h.vm().state.importPick, 'p1');
    assertEqual(h.forms.length, 1);
    assertEqual(h.forms[0].content, h.vm().$refs.importForm);
    assertEqual(h.forms[0].title, 'importTitle');
  });

  test('runImport aus SIPOC hängt die Prozess-Schritte als VA an und meldet importDone mit n', async () => {
    const list = [{ instanceId: 's1', moduleId: 'sipoc', phase: 'define', title: 'Pizza' }];
    const reads = { s1: { columns: { suppliers: [], inputs: [], process: ['Bestellen', ' Backen ', ''], outputs: [], customers: [] } } };
    const h = await mount({ _schema: { version: '1.0' }, steps: [step('a', 'A', 'nva')], expanded: [] }, { list, reads });
    h.vm().openImport();
    await settle();
    const n = await h.vm().runImport();
    assertEqual(n, 2);
    const steps = h.vm().model.steps;
    assertDeepEqual(steps.map((s) => [s.title, s.side]), [['A', 'nva'], ['Bestellen', 'va'], ['Backen', 'va']]);
    assertDeepEqual(h.notes.at(-1), ['importDone{"n":2}', 'success']);
  });

  test('runImport aus der Process Map: bnva wird NVA', async () => {
    const list = [{ instanceId: 'p1', moduleId: 'process-map', phase: 'analyze', title: 'PM' }];
    const reads = { p1: { steps: [
      { title: 'Prüfen', description: 'Sicht', valueType: 'bnva' },
      { title: 'Montieren', description: '', valueType: 'va' },
    ] } };
    const h = await mount(null, { list, reads });
    h.vm().openImport();
    await settle();
    await h.vm().runImport();
    const steps = h.vm().model.steps;
    assertDeepEqual(steps.map((s) => [s.title, s.description, s.side]),
      [['Prüfen', 'Sicht', 'nva'], ['Montieren', '', 'va']]);
    assertDeepEqual(h.notes.at(-1), ['importDone{"n":2}', 'success']);
  });

  test('runImport meldet ein Lesefehler übersetzt und hängt nichts an', async () => {
    const list = [{ instanceId: 's1', moduleId: 'sipoc', phase: 'define', title: 'Pizza' }];
    const h = await mount({ _schema: { version: '1.0' }, steps: [step('a', 'A')], expanded: [] }, { list, readError: new Error('unknown_instance') });
    h.vm().openImport();
    await settle();
    const warn = console.warn;
    console.warn = () => {};
    let n;
    try { n = await h.vm().runImport(); } finally { console.warn = warn; }
    assertEqual(n, 0);
    assertEqual(h.vm().model.steps.length, 1);
    assertDeepEqual(h.notes.at(-1), ['importFailed', 'error']);
  });

  test('exports.tree() ist toJsonTree des Models', async () => {
    const h = await mount({ _schema: { version: '1.0' }, steps: [step('a', 'A'), step('b', 'B', 'nva')], expanded: ['a'] });
    const ui = h.vm()._ui;
    assertTrue(ui.exports !== null, 'exports fehlt');
    assertDeepEqual(ui.exports.tree.call(ui.component), toJsonTree(h.vm().model));
    assertEqual(ui.exports.fileName, 'opportunity-flowchart');
  });
});
