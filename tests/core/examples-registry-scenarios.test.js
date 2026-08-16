/**
 * Tests for the scenario API of core/examples-registry.js
 */
import { suite, test, assertEqual, assertDeepEqual, beforeEach, afterEach } from '../test-utils.js';
import { ExamplesRegistry, parseScenarioItem } from '../../js/core/examples-registry.js';

const CATALOG = {
  version: '1.0',
  examples: [
    { id: 'ex-a', type: 'project', modules: ['sipoc'], file: 'projects/a.json', format: 'json' },
    { id: 'ex-b', type: 'dataset', modules: ['histogram', 'process-capability'], file: 'data/b.csv', format: 'csv' },
    { id: 'scn-full', type: 'scenario', cycle: 'dmaic', startPhase: 'define', items: ['ex-a', 'ex-b#histogram'] },
    { id: 'scn-starter', type: 'scenario', cycle: 'dmaic', startPhase: 'define', items: ['ex-a'] },
    { id: 'scn-other', type: 'scenario', cycle: 'dmadv', startPhase: 'define', items: ['ex-b'] },
  ],
};

function makeRegistry() {
  const reg = new ExamplesRegistry();
  reg._examples = CATALOG.examples;
  reg._initialized = true;
  return reg;
}

suite('parseScenarioItem', () => {
  test('plain id has no module', () => {
    assertDeepEqual(parseScenarioItem('ex-a'), { exampleId: 'ex-a', moduleId: null });
  });
  test('suffix selects the module', () => {
    assertDeepEqual(parseScenarioItem('ex-b#histogram'), { exampleId: 'ex-b', moduleId: 'histogram' });
  });
});

suite('ExamplesRegistry scenarios', () => {
  test('getScenarios returns every scenario entry', () => {
    assertEqual(makeRegistry().getScenarios().length, 3);
  });

  test('getScenarios filters by cycle', () => {
    const ids = makeRegistry().getScenarios({ cycle: 'dmaic' }).map(s => s.id);
    assertDeepEqual(ids, ['scn-full', 'scn-starter']);
  });

  test('getScenariosForExample matches plain and suffixed items', () => {
    const reg = makeRegistry();
    assertDeepEqual(reg.getScenariosForExample('ex-a').map(s => s.id), ['scn-full', 'scn-starter']);
    assertDeepEqual(reg.getScenariosForExample('ex-b').map(s => s.id), ['scn-full', 'scn-other']);
  });

  test('getScenariosForExample returns empty for unknown ids', () => {
    assertDeepEqual(makeRegistry().getScenariosForExample('nope'), []);
  });

  test('getForModule never returns scenarios', () => {
    const ids = makeRegistry().getForModule('sipoc').map(e => e.id);
    assertDeepEqual(ids, ['ex-a']);
  });
});

// ─── load() worksheetKey envelope ──────────────────────────────
//
// `worksheetKey` drives dedup in Task 5 and the scenario loader in Task 6, so
// each of load()'s branches gets its own fetch-stubbed case, including the
// degraded sub-fetch path (worksheet file 404s / throws) which must still
// resolve rather than reject.

suite('ExamplesRegistry load() worksheetKey', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  function makeLoadRegistry(examples) {
    const reg = new ExamplesRegistry();
    reg._examples = examples;
    reg._initialized = true;
    return reg;
  }

  /**
   * Stub globalThis.fetch to answer a fixed set of URLs.
   * `responses` maps url → { json?, text?, ok?, status?, reject? }.
   */
  function stubFetch(responses) {
    globalThis.fetch = async (url) => {
      const entry = responses[url];
      if (!entry) throw new Error(`Unexpected fetch: ${url}`);
      if (entry.reject) throw new Error('network down');
      return {
        ok: entry.ok !== false,
        status: entry.status ?? (entry.ok === false ? 404 : 200),
        json: async () => entry.json,
        text: async () => entry.text,
      };
    };
  }

  test('snapshot path: worksheetKey = sourceWorksheetFile, removed from data', async () => {
    const meta = { id: 'ex-snap', type: 'project', modules: ['sipoc'], file: 'projects/snap.json', format: 'json' };
    const reg = makeLoadRegistry([meta]);
    stubFetch({
      './examples/projects/snap.json': { json: { sourceWorksheetFile: 'worksheets/w.json' } },
      './examples/worksheets/w.json': { json: { sheets: [{ id: 's1' }] } },
    });
    const result = await reg.load('ex-snap');
    assertEqual(result.worksheetKey, 'worksheets/w.json');
    assertEqual(result.data.sourceWorksheetFile, undefined);
    assertDeepEqual(result.data.sourceWorksheetData, { sheets: [{ id: 's1' }] });
  });

  test('worksheet-module path: worksheetKey = meta.file', async () => {
    const meta = { id: 'ex-ws', type: 'project', modules: ['worksheet'], file: 'projects/ws.json', format: 'json' };
    const reg = makeLoadRegistry([meta]);
    stubFetch({
      './examples/projects/ws.json': { json: { sheets: [] } },
    });
    const result = await reg.load('ex-ws');
    assertEqual(result.worksheetKey, 'projects/ws.json');
  });

  test('json path with neither reference: worksheetKey = null (branch order pinned)', async () => {
    const meta = { id: 'ex-plain', type: 'project', modules: ['sipoc'], file: 'projects/plain.json', format: 'json' };
    const reg = makeLoadRegistry([meta]);
    stubFetch({
      './examples/projects/plain.json': { json: { foo: 'bar' } },
    });
    const result = await reg.load('ex-plain');
    assertEqual(result.worksheetKey, null);
  });

  test('CSV path: worksheetKey = meta.file', async () => {
    const meta = { id: 'ex-csv', type: 'dataset', modules: ['histogram'], file: 'data/csv.csv', format: 'csv' };
    const reg = makeLoadRegistry([meta]);
    stubFetch({
      './examples/data/csv.csv': { text: 'a,b\n1,2\n' },
    });
    const result = await reg.load('ex-csv');
    assertEqual(result.worksheetKey, 'data/csv.csv');
  });

  test('generator path: worksheetKey = null', async () => {
    const meta = { id: 'ex-gen', type: 'generator', generator: { algorithm: 'normal', params: { n: 3 }, seed: 1 } };
    const reg = makeLoadRegistry([meta]);
    const result = await reg.load('ex-gen');
    assertEqual(result.worksheetKey, null);
  });

  test('degraded sub-fetch (404): resolves, keeps worksheetKey, no sourceWorksheetData', async () => {
    const meta = { id: 'ex-snap-404', type: 'project', modules: ['sipoc'], file: 'projects/snap-404.json', format: 'json' };
    const reg = makeLoadRegistry([meta]);
    stubFetch({
      './examples/projects/snap-404.json': { json: { sourceWorksheetFile: 'worksheets/missing.json' } },
      './examples/worksheets/missing.json': { ok: false, status: 404 },
    });
    const result = await reg.load('ex-snap-404');
    assertEqual(result.worksheetKey, 'worksheets/missing.json');
    assertEqual(result.data.sourceWorksheetData, undefined);
  });

  test('degraded sub-fetch (throws): resolves, keeps worksheetKey, no sourceWorksheetData', async () => {
    const meta = { id: 'ex-snap-throw', type: 'project', modules: ['sipoc'], file: 'projects/snap-throw.json', format: 'json' };
    const reg = makeLoadRegistry([meta]);
    stubFetch({
      './examples/projects/snap-throw.json': { json: { sourceWorksheetFile: 'worksheets/throws.json' } },
      './examples/worksheets/throws.json': { reject: true },
    });
    const result = await reg.load('ex-snap-throw');
    assertEqual(result.worksheetKey, 'worksheets/throws.json');
    assertEqual(result.data.sourceWorksheetData, undefined);
  });
});
