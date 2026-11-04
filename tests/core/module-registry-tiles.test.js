import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../test-utils.js';
import { ModuleRegistry } from '../../js/core/module-registry.js';
import { ChunkLoadError } from '../../js/core/chunks.js';

const noopLoad = () => Promise.resolve({ default: {} });

suite('ModuleRegistry: tiles', () => {
  test('hasTile reflects loadTile on the manifest entry', () => {
    const r = new ModuleRegistry();
    r.register({ id: 'a', phase: 'define', load: noopLoad, loadTile: () => Promise.resolve({ default: {} }) });
    r.register({ id: 'b', phase: 'define', load: noopLoad });
    assertTrue(r.hasTile('a'));
    assertEqual(r.hasTile('b'), false);
    assertEqual(r.hasTile('missing'), false);
  });

  test('loadTile loads once and caches the default export', async () => {
    const tile = { render() {} };
    let calls = 0;
    const r = new ModuleRegistry();
    r.register({ id: 'a', phase: 'define', load: noopLoad,
      loadTile: () => { calls++; return Promise.resolve({ default: tile }); } });
    assertTrue(await r.loadTile('a') === tile);
    assertTrue(await r.loadTile('a') === tile);
    assertEqual(calls, 1);
  });

  test('loadTile resolves undefined without loadTile or for unknown ids', async () => {
    const r = new ModuleRegistry();
    r.register({ id: 'b', phase: 'define', load: noopLoad });
    assertEqual(await r.loadTile('b'), undefined);
    assertEqual(await r.loadTile('missing'), undefined);
  });

  test('a failed load rejects with ChunkLoadError and is retried next time', async () => {
    const tile = { render() {} };
    let fail = true;
    const r = new ModuleRegistry();
    r.register({ id: 'a', phase: 'define', load: noopLoad,
      loadTile: () => (fail ? Promise.reject(new Error('net')) : Promise.resolve({ default: tile })) });
    let caught = null;
    try { await r.loadTile('a'); } catch (err) { caught = err; }
    assertTrue(caught instanceof ChunkLoadError);
    fail = false;
    assertTrue(await r.loadTile('a') === tile);
  });
});

suite('ModuleRegistry: Module in neuer Form', () => {
  function fakeResources(log, { fail = false } = {}) {
    return { prepare: (id) => { log.push(`prepare:${id}`); return fail ? Promise.reject(new Error('net')) : Promise.resolve(); } };
  }

  test('loadModule bereitet ein Modul in neuer Form vor, alte Form nicht', async () => {
    const log = [];
    const r = new ModuleRegistry();
    r.setResources(fakeResources(log));
    r.register({ id: 'neu', phase: 'define', form: 'module', load: () => { log.push('load:neu'); return Promise.resolve({ default: { id: 'neu' } }); } });
    r.register({ id: 'alt', phase: 'define', load: () => { log.push('load:alt'); return Promise.resolve({ default: { id: 'alt' } }); } });
    assertEqual((await r.loadModule('neu')).id, 'neu');
    assertEqual((await r.loadModule('alt')).id, 'alt');
    await r.loadModule('neu');
    assertEqual(log.filter((l) => l === 'prepare:neu').length, 1);
    assertEqual(log.includes('prepare:alt'), false);
  });

  test('loadModule: scheitert prepare, bleibt das Modul ungeladen und wird erneut versucht', async () => {
    const log = [];
    const r = new ModuleRegistry();
    let fail = true;
    r.setResources({ prepare: () => (fail ? Promise.reject(new Error('net')) : Promise.resolve()) });
    r.register({ id: 'neu', phase: 'define', form: 'module', load: () => { log.push('load'); return Promise.resolve({ default: { id: 'neu' } }); } });
    let threw = false;
    try { await r.loadModule('neu'); } catch { threw = true; }
    assertTrue(threw);
    fail = false;
    assertEqual((await r.loadModule('neu')).id, 'neu');
  });

  test('loadModule ohne Lader für Bestandteile wirft klar', async () => {
    const r = new ModuleRegistry();
    r.register({ id: 'neu', phase: 'define', form: 'module', load: noopLoad });
    let msg = '';
    try { await r.loadModule('neu'); } catch (e) { msg = e.message; }
    assertEqual(msg, '[ModuleRegistry] neu: Modul in neuer Form, aber kein Lader für Bestandteile');
  });

  test('loadTile bereitet vor (Kachel-Template liegt in derselben Datei)', async () => {
    const log = [];
    const r = new ModuleRegistry();
    r.setResources(fakeResources(log));
    r.register({ id: 'neu', phase: 'define', form: 'module', load: noopLoad, loadTile: () => Promise.resolve({ default: { t: 1 } }) });
    assertEqual((await r.loadTile('neu')).t, 1);
    assertDeepEqual(log, ['prepare:neu']);
  });

  test('loadTile: scheitert prepare, kommt ChunkLoadError (wie ein Chunk-Fehler) und der nächste Versuch lädt neu', async () => {
    const r = new ModuleRegistry();
    let fail = true;
    r.setResources({ prepare: () => (fail ? Promise.reject(new Error('net')) : Promise.resolve()) });
    r.register({ id: 'neu', phase: 'define', form: 'module', load: noopLoad, loadTile: () => Promise.resolve({ default: { t: 1 } }) });
    let caught = null;
    try { await r.loadTile('neu'); } catch (err) { caught = err; }
    assertTrue(caught instanceof ChunkLoadError);
    fail = false;
    assertEqual((await r.loadTile('neu')).t, 1);
  });
});
