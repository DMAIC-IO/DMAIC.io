/**
 * Entprelltes Speichern für Models mit table() (createModule, P5) und flushPersist.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import Alpine from '../../vendor/alpinejs/csp.js';
import { createModule } from '../../js/core/template-module.js';
import { defineModel, table, number, command, markTableChanged, schemaHasTable, list, object, text } from '../../js/core/model.js';
import { TableData } from '../../js/core/table-data.js';

const Doc = defineModel({
  fields: { data: table(), n: number({ default: 0 }) },
  commands: {
    setCell: command({
      params: { r: number(), v: number() },
      run({ r, v }) { this.data.columns[0][r] = v; markTableChanged(this, this.data); },
    }),
  },
});

let seq = 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const flush = async () => { await wait(0); await wait(0); };

async function mount() {
  if (!Alpine.version) Alpine.start();
  const id = `tbl-persist-${++seq}`;
  const key = `js/modules/${id}/${id}.html`;
  const tpl = document.createElement('template');
  tpl.setAttribute('data-tpl', key);
  tpl.innerHTML = `<div x-data="${id.replace(/-(\w)/g, (_, c) => c.toUpperCase())}"><input class="n" x-model="model.n"></div>`;
  document.body.append(tpl);
  const calls = [];
  const context = {
    instanceId: `${id}-1`,
    instances: Object.freeze({ list: () => [], read: async () => ({}), interact: async () => ({ ok: true }) }),
    stateManager: {
      getModuleState: () => ({ data: { rowCount: 3, columns: [[1, 2, 3]] }, n: 0 }),
      setModuleState: (_id, s) => { calls.push(s); },
      getProjectCycle: () => 'dmaic',
      get: () => undefined,
    },
    i18n: { t: (k) => k, tf: () => (k) => k, getLanguage: () => 'de' },
    eventBus: { on: () => {}, off: () => {}, emit: () => {} },
    notify: () => {},
    dialog: { confirm: async () => true },
    theme: 'light',
    language: 'de',
  };
  const mod = createModule({
    config: { id, engine: 'alpine', phase: 'define', templateUrl: new URL(key, document.baseURI).href },
    Model: Doc,
    view: () => ({}),
  });
  const container = document.createElement('div');
  document.body.append(container);
  await mod.init(container, context);
  await wait(200); // Entprellung aus dem Anlauf abwarten
  calls.length = 0;
  const data = () => Alpine.$data(container.querySelector('[x-data]'));
  return { mod, container, data, calls };
}

suite('createModule table() — entprelltes Speichern', () => {
  test('schemaHasTable erkennt table() rekursiv', () => {
    assertTrue(schemaHasTable(Doc.schema));
    assertEqual(schemaHasTable(defineModel({ fields: { a: text() } }).schema), false);
    assertTrue(schemaHasTable(defineModel({ fields: { l: list(object({ t: table() })) } }).schema));
  });

  test('nach setCell steht nichts sofort im stateManager, nach 150 ms schon', async () => {
    const { data, calls } = await mount();
    data().model.setCell({ r: 0, v: 9 });
    await flush();
    assertEqual(calls.length, 0, 'noch nicht');
    await wait(250);
    assertEqual(calls.length, 1);
    assertEqual(calls[0].data.columns[0][0], 9);
  });

  test('zehn Aufrufe innerhalb von 100 ms ergeben genau ein setModuleState', async () => {
    const { data, calls } = await mount();
    for (let k = 0; k < 10; k++) { data().model.setCell({ r: k % 3, v: k }); await wait(5); }
    await wait(300);
    assertEqual(calls.length, 1);
    assertDeepEqual(calls[0].data.columns[0], [9, 7, 8]);
  });

  test('flushPersist schreibt sofort', async () => {
    const { mod, data, calls } = await mount();
    data().model.setCell({ r: 1, v: 5 });
    await flush();
    mod.flushPersist();
    assertEqual(calls.length, 1);
    assertEqual(calls[0].data.columns[0][1], 5);
    await wait(250);
    assertEqual(calls.length, 1, 'der Entpreller schreibt nicht noch einmal');
  });

  test('destroy innerhalb der Entprellung schreibt', async () => {
    const { mod, data, calls } = await mount();
    data().model.setCell({ r: 2, v: 4 });
    await flush();
    assertEqual(calls.length, 0);
    await mod.destroy();
    assertEqual(calls.length, 1);
    assertEqual(calls[0].data.columns[0][2], 4);
  });

  test('ein Nicht-Tabellenfeld per x-model wird ebenfalls gespeichert', async () => {
    const { container, calls, mod } = await mount();
    const input = container.querySelector('.n');
    input.value = '42';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    mod.flushPersist();
    assertEqual(calls.length, 1);
    assertEqual(calls[0].n, 42);
  });

  test('der gespeicherte Stand teilt keine Arrays mit dem Model', async () => {
    const { mod, data, calls } = await mount();
    data().model.setCell({ r: 0, v: 9 });
    await flush();
    mod.flushPersist();
    const saved = calls[0];
    assertTrue(!(saved.data instanceof TableData));
    data().model.setCell({ r: 0, v: 11 });
    assertEqual(saved.data.columns[0][0], 9, 'der gespeicherte Stand ändert sich nicht');
  });

  test('flushPersist ohne Ausstehendes schreibt nichts', async () => {
    const { mod, calls } = await mount();
    mod.flushPersist();
    assertEqual(calls.length, 0);
  });
});
