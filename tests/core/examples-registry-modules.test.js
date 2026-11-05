/**
 * ExamplesRegistry: Beispiele der Module in neuer Form (Katalog EXAMPLES /
 * EXAMPLE_REFS, resources/examples/ über ModuleResources.url).
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue, beforeEach, afterEach } from '../test-utils.js';
import { ExamplesRegistry } from '../../js/core/examples-registry.js';

const CATALOG = { examples: { 'neu-p': 'neu', 'neu-csv': 'neu', 'neu-ws': 'neu' }, exampleRefs: { 'neu-csv': ['andere'], 'alt-1': ['neu'] } };
const RESOURCES = { url: (id, file) => (id === 'neu' ? `mod/neu/${file}` : undefined) };
const NEU_FILE = { $schema: 'x', examples: [
  { id: 'neu-p', type: 'project', title: { de: 'P', en: 'P' }, file: 'projects/p.json', format: 'json' },
  { id: 'neu-csv', type: 'dataset', title: { de: 'C', en: 'C' }, file: 'd.csv', format: 'csv' },
  { id: 'neu-ws', type: 'project', title: { de: 'W', en: 'W' }, file: 'projects/w.json', format: 'json' },
] };

let originalFetch;
let calls;
function stubFetch(responses) {
  calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    const entry = responses[url];
    if (!entry) throw new Error(`Unexpected fetch: ${url}`);
    if (entry.reject) throw new Error('network down');
    return { ok: entry.ok !== false, status: entry.ok === false ? 404 : 200, json: async () => structuredClone(entry.json), text: async () => entry.text };
  };
}

function makeRegistry() {
  const reg = new ExamplesRegistry({ resources: RESOURCES, catalog: CATALOG });
  reg.setCatalog({ examples: [{ id: 'alt-1', type: 'project', modules: ['histogram'], file: 'projects/a.json', format: 'json' }] });
  return reg;
}

suite('ExamplesRegistry: Beispiele der neuen Form', () => {
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  test('hasExamples kennt Besitzer und Nutzer aus dem Katalog, ohne zu laden', () => {
    stubFetch({});
    const reg = makeRegistry();
    assertTrue(reg.hasExamples('neu'));
    assertTrue(reg.hasExamples('andere'));
    assertEqual(reg.hasExamples('kano'), false);
    assertDeepEqual(calls, []);
  });

  test('get lädt examples.json des Besitzers einmal; modules = Besitzer + exampleRefs; ohne $schema', async () => {
    stubFetch({ 'mod/neu/examples/examples.json': { json: NEU_FILE } });
    const reg = makeRegistry();
    const [a, b] = await Promise.all([reg.get('neu-csv'), reg.get('neu-p')]);
    assertDeepEqual(a.modules, ['neu', 'andere']);
    assertDeepEqual(b.modules, ['neu']);
    assertEqual(calls.length, 1);
    assertEqual(reg.peek('neu-p').id, 'neu-p', 'nach dem Laden bekannt');
    assertEqual(await reg.get('gibt-es-nicht'), undefined);
  });

  test('Fehlschlag beim Laden von examples.json wird nicht gespeichert', async () => {
    stubFetch({ 'mod/neu/examples/examples.json': { reject: true } });
    const reg = makeRegistry();
    let threw = false;
    try { await reg.get('neu-p'); } catch { threw = true; }
    assertTrue(threw);
    stubFetch({ 'mod/neu/examples/examples.json': { json: NEU_FILE } });
    assertEqual((await reg.get('neu-p')).id, 'neu-p');
  });

  test('getForModule: ein kaputtes examples.json warnt und wird übersprungen', async () => {
    stubFetch({ 'mod/neu/examples/examples.json': { reject: true } });
    const reg = makeRegistry();
    const warn = console.warn; const warned = [];
    console.warn = (...a) => warned.push(a.join(' '));
    try {
      const list = await reg.getForModule('neu');
      assertDeepEqual(list.map((e) => e.id), ['alt-1']);
      assertTrue(warned.some((w) => w.includes('[examples]') && w.includes('neu-p')));
    } finally { console.warn = warn; }
  });

  test('getForModule vereint Index, eigene Beispiele und exampleRefs, ohne Doppel', async () => {
    stubFetch({ 'mod/neu/examples/examples.json': { json: NEU_FILE } });
    const reg = makeRegistry();
    assertDeepEqual((await reg.getForModule('neu')).map((e) => e.id), ['alt-1', 'neu-p', 'neu-csv', 'neu-ws']);
    assertDeepEqual((await reg.getForModule('andere')).map((e) => e.id), ['neu-csv']);
    assertDeepEqual((await reg.getForModule('histogram')).map((e) => e.id), ['alt-1']);
    assertDeepEqual(reg.peek('alt-1').modules, ['histogram', 'neu'], 'Index-Eintrag mit exampleRefs ergänzt');
  });

  test('load: Datei über ModuleResources.url; shared/-Worksheet unter ./examples/; worksheetKey', async () => {
    stubFetch({
      'mod/neu/examples/examples.json': { json: NEU_FILE },
      'mod/neu/examples/projects/p.json': { json: { sourceWorksheetFile: 'shared/worksheets/pizza.json' } },
      './examples/shared/worksheets/pizza.json': { json: { sheets: [{ id: 's1' }] } },
      'mod/neu/examples/projects/w.json': { json: { sourceWorksheetFile: 'eigen.json' } },
      'mod/neu/examples/eigen.json': { json: { sheets: [] } },
      'mod/neu/examples/d.csv': { text: 'a,b\n1,2\n' },
    });
    const reg = makeRegistry();
    const p = await reg.load('neu-p');
    assertEqual(p.worksheetKey, 'shared/worksheets/pizza.json');
    assertDeepEqual(p.data.sourceWorksheetData, { sheets: [{ id: 's1' }] });
    assertEqual(p.data.sourceWorksheetFile, undefined);
    assertEqual((await reg.load('neu-ws')).worksheetKey, 'modules/neu/eigen.json');
    const csv = await reg.load('neu-csv');
    assertEqual(csv.worksheetKey, 'modules/neu/d.csv');
    assertEqual(csv.data.columns[0].name, 'a');
  });

  test('load: Datei fehlt in #module-resources → Fehler mit Pfad', async () => {
    stubFetch({ 'mod/neu/examples/examples.json': { json: NEU_FILE } });
    const reg = new ExamplesRegistry({
      resources: { url: (id, file) => (file === 'examples/examples.json' ? 'mod/neu/examples/examples.json' : undefined) },
      catalog: CATALOG,
    });
    let msg = '';
    try { await reg.load('neu-p'); } catch (e) { msg = e.message; }
    assertTrue(msg.includes('neu: examples/projects/p.json fehlt in #module-resources'), msg);
  });

  test('alte Form unverändert: ./examples/<file>, worksheetKey = sourceWorksheetFile', async () => {
    stubFetch({
      './examples/projects/a.json': { json: { sourceWorksheetFile: 'shared/worksheets/w.json' } },
      './examples/shared/worksheets/w.json': { json: { sheets: [] } },
    });
    const reg = makeRegistry();
    assertEqual((await reg.load('alt-1')).worksheetKey, 'shared/worksheets/w.json');
  });

  test('Standard-Katalog ist der eingecheckte (heute leer): Index-Verhalten wie bisher', async () => {
    const reg = new ExamplesRegistry();
    reg.setCatalog({ examples: [{ id: 'x', type: 'project', modules: ['sipoc'] }] });
    assertDeepEqual((await reg.getForModule('sipoc')).map((e) => e.id), ['x']);
  });
});
