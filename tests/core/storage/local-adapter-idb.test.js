/**
 * Tests for js/core/storage/local-adapter.js that read or write module states
 * through IndexedDB. Browser runner only — without IndexedDB the adapter just
 * logs and reads empty module states, which would let the "is gone" checks
 * below pass for the wrong reason.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { LocalAdapter } from '../../../js/core/storage/local-adapter.js';
import { VERSION } from '../../../js/core/version.js';
import { stripPatch } from '../../../js/core/version-utils.js';

const PREFIX = `dmike_v${stripPatch(VERSION)}_`;

suite('LocalAdapter — IndexedDB', () => {
  test('putModule + flush persists to IDB; loadProjectDoc reads it back', async () => {
    localStorage.removeItem(`${PREFIX}projects`);
    const a = new LocalAdapter();
    const id = a.createProject('P', 'dmaic');
    a.saveProjectMeta(id, {
      projectMeta: { name: 'P', cycle: 'dmaic' }, phases: {}, phaseAchievement: {},
      phaseAchievementHistory: {}, models: {}, optimizations: {}, dashboard: null, version: VERSION,
    });
    a.putModule(id, 'inst-1', { value: 42 });
    await a.flush();
    const doc = await a.loadProjectDoc(id);
    assertDeepEqual(doc.moduleStates['inst-1'], { value: 42 });
    assertEqual(doc.projectMeta.name, 'P');
  });

  test('removeModule + flush deletes the instance', async () => {
    const a = new LocalAdapter();
    const id = a.createProject('Q', 'dmaic');
    a.putModule(id, 'x', { a: 1 });
    await a.flush();
    a.removeModule(id, 'x');
    await a.flush();
    const doc = await a.loadProjectDoc(id);
    assertEqual(doc.moduleStates['x'], undefined);
  });

  test('dropPending discards queued writes without flushing', async () => {
    localStorage.removeItem(`${PREFIX}projects`);
    const a = new LocalAdapter();
    const id = a.createProject('DropTest', 'dmaic');
    a.putModule(id, 'm1', { x: 1 });
    a.removeModule(id, 'm2');
    a.dropPending(id);
    assertEqual(a._pending.get(id), undefined);
    assertEqual(a._pendingDel.get(id), undefined);
    await a.flush(); // no-op — nothing queued
    const doc = await a.loadProjectDoc(id);
    assertEqual(doc.moduleStates['m1'], undefined);
  });

  test('flushSync persists pending module writes without the async flush (Bug 012)', async () => {
    localStorage.removeItem(`${PREFIX}projects`);
    const a = new LocalAdapter();
    const id = a.createProject('SyncFlush', 'dmaic');
    // Ensure the IDB connection is open, as it always is at runtime after load().
    await a.loadProjectDoc(id);
    a.putModule(id, 'inst-sync', { value: 99 });
    // Simulate the page-unload path: SYNCHRONOUS flush only — no async flush().
    a.flushSync();
    // The queue must have been drained (the write was issued synchronously).
    assertEqual(a._pending.get(id), undefined, 'flushSync should drain the pending queue');
    const doc = await a.loadProjectDoc(id);
    assertDeepEqual(doc.moduleStates['inst-sync'], { value: 99 });
  });

  test('flushSync also commits deletes (Bug 012)', async () => {
    localStorage.removeItem(`${PREFIX}projects`);
    const a = new LocalAdapter();
    const id = a.createProject('SyncDel', 'dmaic');
    a.putModule(id, 'gone', { keep: false });
    await a.flush();
    a.removeModule(id, 'gone');
    a.flushSync();
    const doc = await a.loadProjectDoc(id);
    assertEqual(doc.moduleStates['gone'], undefined);
  });
});
