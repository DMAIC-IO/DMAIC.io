import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { LocalAdapter } from '../../../js/core/storage/local-adapter.js';
import { VERSION } from '../../../js/core/version.js';
import { stripPatch } from '../../../js/core/version-utils.js';

const PREFIX = `dmike_v${stripPatch(VERSION)}_`;

suite('LocalAdapter', () => {
  test('supportsMultiProject is true', () => {
    assertEqual(new LocalAdapter().supportsMultiProject, true);
  });

  test('createProject then listProjects returns the entry and sets active', () => {
    localStorage.removeItem(`${PREFIX}projects`);
    const a = new LocalAdapter();
    const id = a.createProject('P1', 'dmaic');
    const list = a.listProjects();
    assertEqual(list.length, 1);
    assertEqual(list[0].id, id);
    assertEqual(list[0].name, 'P1');
    assertEqual(a.getActiveProjectId(), id);
  });

  test('loadProjectDoc returns null for an unknown project', async () => {
    const a = new LocalAdapter();
    assertEqual(await a.loadProjectDoc('nope'), null);
  });

  test('setProjectStatus updates the entry status', () => {
    localStorage.removeItem(`${PREFIX}projects`);
    const a = new LocalAdapter();
    const id = a.createProject('P1', 'dmaic');
    a.setProjectStatus(id, 'completed');
    const list = a.listProjects();
    const found = list.find(p => p.id === id);
    assertEqual(found.status, 'completed');
  });

  test('reorderProjects swaps entries and is bounds-guarded', () => {
    localStorage.removeItem(`${PREFIX}projects`);
    const a = new LocalAdapter();
    const id1 = a.createProject('P1', 'dmaic');
    const id2 = a.createProject('P2', 'dmaic');
    a.reorderProjects(0, 1);
    let list = a.listProjects();
    assertEqual(list[0].id, id2, 'P2 should be at index 0 after swap');
    assertEqual(list[1].id, id1, 'P1 should be at index 1 after swap');

    // Out-of-bounds call should not throw and should leave list unchanged
    a.reorderProjects(5, 0);
    list = a.listProjects();
    assertEqual(list[0].id, id2, 'List should be unchanged after out-of-bounds reorder');
    assertEqual(list[1].id, id1, 'List should be unchanged after out-of-bounds reorder');
  });

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

  test('dashboard null round-trips', async () => {
    localStorage.removeItem(`${PREFIX}projects`);
    const a = new LocalAdapter();
    const id = a.createProject('DashNull', 'dmaic');
    a.saveProjectMeta(id, {
      projectMeta: { name: 'DashNull', cycle: 'dmaic' },
      phases: {},
      phaseAchievement: {},
      phaseAchievementHistory: {},
      models: {},
      optimizations: {},
      dashboard: null,
      version: VERSION,
    });
    const doc = await a.loadProjectDoc(id);
    assertEqual(doc.dashboard, null);
  });

  test('deleteProject drains pending writes', async () => {
    localStorage.removeItem(`${PREFIX}projects`);
    const a = new LocalAdapter();
    const id = a.createProject('DrainTest', 'dmaic');
    a.putModule(id, 'm1', { x: 1 });
    // do NOT flush — pending write stays in memory
    await a.deleteProject(id);
    assertEqual(a._pending.get(id), undefined);
    assertEqual(a._pendingDel.get(id), undefined);
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

  test('addProjectEntry appends a raw entry without activating it', () => {
    localStorage.removeItem(`${PREFIX}projects`);
    const a = new LocalAdapter();
    const active = a.createProject('Active', 'dmaic');
    a.addProjectEntry({ id: 'imp1', name: 'Imported', cycle: 'dmaic', created: 'c', modified: 'm', status: 'completed' });
    const list = a.listProjects();
    assertEqual(list.length, 2);
    const entry = list.find(p => p.id === 'imp1');
    assertEqual(entry.name, 'Imported');
    assertEqual(entry.status, 'completed');
    // active project is unchanged (addProjectEntry does not activate)
    assertEqual(a.getActiveProjectId(), active);
  });

  test('updateProjectEntry patches name and modified, preserves existing cycle', () => {
    localStorage.removeItem(`${PREFIX}projects`);
    const a = new LocalAdapter();
    const id = a.createProject('Original', 'dmaic');
    a.updateProjectEntry(id, { name: 'Renamed', modified: 'M1' });
    const entry = a.listProjects().find(p => p.id === id);
    assertEqual(entry.name, 'Renamed');
    assertEqual(entry.modified, 'M1');
    assertEqual(entry.cycle, 'dmaic');
  });

  test('updateProjectEntry legacy default-fill: entry without cycle gets DEFAULT_CYCLE', () => {
    localStorage.removeItem(`${PREFIX}projects`);
    localStorage.setItem(`${PREFIX}projects`, JSON.stringify([{ id: 'x', name: 'N', status: 'active' }]));
    const a = new LocalAdapter();
    a.updateProjectEntry('x', { name: 'N2' });
    const entry = a.listProjects().find(p => p.id === 'x');
    assertEqual(entry.name, 'N2');
    assertEqual(entry.cycle, 'dmaic');
  });

  test('updateProjectEntry unknown id is a no-op (no throw, no new entry)', () => {
    localStorage.removeItem(`${PREFIX}projects`);
    const a = new LocalAdapter();
    a.createProject('Existing', 'dmaic');
    const before = a.listProjects().length;
    a.updateProjectEntry('nope', { name: 'z' });
    assertEqual(a.listProjects().length, before);
  });

  test('migrateLegacyIfNeeded moves un-namespaced keys + module_* into project namespace', () => {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
    localStorage.setItem(`${PREFIX}projectMeta`, JSON.stringify({ name: 'Old', cycle: 'dmaic' }));
    localStorage.setItem(`${PREFIX}phases`, JSON.stringify({ data: [] }));
    localStorage.setItem(`${PREFIX}module_inst1`, JSON.stringify({ v: 1 }));
    const a = new LocalAdapter();
    const list = a.listProjects();
    assertEqual(list.length, 1);
    assertEqual(localStorage.getItem(`${PREFIX}projectMeta`), null); // legacy key removed
    const id = list[0].id;
    const projectPrefix = `${PREFIX}p_${id}_`;
    assertEqual(localStorage.getItem(`${projectPrefix}projectMeta`) !== null, true); // migrated to namespace
    assertEqual(localStorage.getItem(`${projectPrefix}phases`) !== null, true); // migrated to namespace
    assertEqual(localStorage.getItem(`${projectPrefix}module_inst1`), JSON.stringify({ v: 1 })); // module_* swept
  });
});
