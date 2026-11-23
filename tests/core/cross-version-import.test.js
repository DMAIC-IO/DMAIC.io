/**
 * Tests for js/core/cross-version-import.js — buildSnapshotFromVersion().
 *
 * The takeover reads another version's localStorage namespace and must carry
 * every per-project key that LocalAdapter.saveProjectMeta() writes; anything
 * left out is silently lost when the user upgrades to a new MINOR version.
 *
 * We seed a fictitious "v0.8" namespace. No `dmike_v0.8` IndexedDB exists in
 * the test environment, so module states come back empty — the localStorage
 * half is what is under test here.
 */
import { suite, test, assertEqual, assertDeepEqual, afterEach } from '../test-utils.js';
import { buildSnapshotFromVersion } from '../../js/core/cross-version-import.js';
import { LocalAdapter } from '../../js/core/storage/local-adapter.js';

const MM = '0.8';
const PREFIX = `dmike_v${MM}_`;
const PROJECT = `${PREFIX}p_p1_`;

function seed(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function seedProjectList(entry = { id: 'p1', name: 'X' }) {
  seed(`${PREFIX}projects`, [entry]);
}

suite('core/cross-version-import', () => {
  afterEach(() => {
    Object.keys(localStorage)
      .filter(k => k.startsWith(PREFIX))
      .forEach(k => localStorage.removeItem(k));
  });

  test('carries chart editor settings (chartEdits) of each project', async () => {
    seedProjectList();
    seed(`${PROJECT}projectMeta`, { name: 'X', cycle: 'dmaic' });
    const chartEdits = {
      inst1: { bar: { refLines: [{ axis: 'y', value: 5, label: 'USL' }], titleSize: 20, xLabel: 'Defect' } },
    };
    seed(`${PROJECT}chartEdits`, chartEdits);

    const snapshot = await buildSnapshotFromVersion(MM);

    assertDeepEqual(snapshot.projects[0].chartEdits, chartEdits);
  });

  test('carries saved models and optimizations of each project', async () => {
    seedProjectList();
    seed(`${PROJECT}projectMeta`, { name: 'X', cycle: 'dmaic' });
    const models = { m1: { kind: 'regression', response: 'Y', terms: ['A'] } };
    const optimizations = { o1: { modelId: 'm1', goal: 'max' } };
    seed(`${PROJECT}models`, models);
    seed(`${PROJECT}optimizations`, optimizations);

    const snapshot = await buildSnapshotFromVersion(MM);

    assertDeepEqual(snapshot.projects[0].models, models);
    assertDeepEqual(snapshot.projects[0].optimizations, optimizations);
  });

  test('defaults the three maps to {} when the old version never wrote them', async () => {
    seedProjectList();
    seed(`${PROJECT}projectMeta`, { name: 'X', cycle: 'dmaic' });

    const snapshot = await buildSnapshotFromVersion(MM);

    assertDeepEqual(snapshot.projects[0].chartEdits, {});
    assertDeepEqual(snapshot.projects[0].models, {});
    assertDeepEqual(snapshot.projects[0].optimizations, {});
  });

  test('a project without saved projectMeta keeps cycle and timestamps from the project list', async () => {
    seedProjectList({
      id: 'p1', name: 'X', cycle: 'dmadv',
      created: '2026-01-02T03:04:05.000Z', modified: '2026-02-03T04:05:06.000Z',
    });

    const snapshot = await buildSnapshotFromVersion(MM);
    const meta = snapshot.projects[0].projectMeta;

    assertEqual(meta.name, 'X');
    assertEqual(meta.cycle, 'dmadv');
    assertEqual(meta.created, '2026-01-02T03:04:05.000Z');
    assertEqual(meta.modified, '2026-02-03T04:05:06.000Z');
  });

  test('carries every per-project field LocalAdapter persists (guard against future fields)', async () => {
    seedProjectList();
    seed(`${PROJECT}projectMeta`, { name: 'X', cycle: 'dmaic' });

    const persisted = Object.keys(await new LocalAdapter(PREFIX).loadProjectDoc('p1')).sort();
    const carried = new Set(Object.keys((await buildSnapshotFromVersion(MM)).projects[0]));
    const missing = persisted.filter(k => !carried.has(k));

    assertDeepEqual(missing, [], `takeover drops: ${missing.join(', ')}`);
  });
});
