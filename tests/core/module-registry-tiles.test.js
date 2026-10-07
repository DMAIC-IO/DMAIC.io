import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
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
