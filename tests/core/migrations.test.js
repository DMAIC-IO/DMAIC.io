/**
 * Tests for js/core/migrations.js
 *
 * Two layers:
 * 1. Behavioural unit tests for migrateToLatest() (PATCH-tolerance, chain).
 * 2. Regression tests over goldene Fixtures: every export file ever shipped
 *    must still migrate to the current VERSION without throwing. New
 *    fixtures are added to KNOWN_FIXTURES at every MINOR/MAJOR release.
 */
import { suite, test, assertEqual } from '../test-utils.js';
import { migrateToLatest } from '../../js/core/migrations.js';
import { VERSION } from '../../js/core/version.js';
import { stripPatch } from '../../js/core/version-utils.js';
import { adoptProjectModels } from '../../js/core/project-models.js';

/**
 * Every export-file fixture that has ever been shipped. Add new entries
 * here on every MINOR/MAJOR release — never remove existing ones.
 * @type {{ file: string, kind: 'single' | 'all' }[]}
 */
const KNOWN_FIXTURES = [
  { file: 'v0.2.0_single_project.json', kind: 'single' },
  { file: 'v0.2.0_all_projects.json',   kind: 'all'    },
  { file: 'v0.3.0_single_project.json', kind: 'single' },
  { file: 'v0.3.0_all_projects.json',   kind: 'all'    },
  { file: 'v0.5.0_8d_project.json',     kind: 'single' },
  { file: 'v0.9.0_single_project.json', kind: 'single' },
  { file: 'v1.0.0_single_project.json', kind: 'single' },
  { file: 'v1.1.0_single_project.json', kind: 'single' },
  { file: 'v1.2.0_single_project.json', kind: 'single' },
  { file: 'v1.3.0_single_project.json', kind: 'single' },
  { file: 'v1.4.0_single_project.json', kind: 'single' },
  { file: 'v1.5.0_single_project.json', kind: 'single' },
  { file: 'v1.6.0_single_project.json', kind: 'single' },
  { file: 'v1.7.0_single_project.json', kind: 'single' },
  { file: 'v1.8.0_single_project.json', kind: 'single' },
  { file: 'v1.9.0_single_project.json', kind: 'single' },
  { file: 'v1.9.6_models_project.json', kind: 'single' },
];

async function loadFixture(file) {
  const res = await fetch(new URL(`../fixtures/exports/${file}`, import.meta.url));
  if (!res.ok) throw new Error(`Failed to load ${file}: ${res.status}`);
  return res.json();
}

suite('Migrations — behavioural', () => {
  test('same MAJOR.MINOR: returns data unchanged', () => {
    const data = { appVersion: '0.2.0', foo: 'bar' };
    const result = migrateToLatest(data, '0.2.0');
    assertEqual(result.foo, 'bar');
  });

  test('same MAJOR.MINOR different PATCH: returns data unchanged', () => {
    const data = { appVersion: '0.2.0', foo: 'bar' };
    const result = migrateToLatest(data, '0.2.5');
    assertEqual(result.foo, 'bar');
    assertEqual(result.appVersion, '0.2.5');
  });

  test('stamps target version on output', () => {
    const data = { appVersion: '0.2.0', foo: 'bar' };
    const result = migrateToLatest(data, VERSION);
    assertEqual(result.appVersion, VERSION);
  });

  test.todo('older MINOR: runs migration chain end-to-end');
  test.todo('missing appVersion: defaults to oldest known and migrates');

  // ─── 0.2 → 0.3 cycle migration ──────────────────────────────

  test('0.2→0.3: single-project export gets cycle = dmaic', () => {
    const data = {
      appVersion: '0.2.0',
      projectMeta: { name: 'Legacy', created: 'x', modified: 'y' },
      phases: {},
    };
    const result = migrateToLatest(data, '0.3.0');
    assertEqual(result.projectMeta.cycle, 'dmaic');
  });

  test('0.2→0.3: multi-project export adds cycle to each project', () => {
    const data = {
      appVersion: '0.2.0',
      projects: [
        { projectMeta: { name: 'A' } },
        { projectMeta: { name: 'B' } },
      ],
    };
    const result = migrateToLatest(data, '0.3.0');
    assertEqual(result.projects[0].projectMeta.cycle, 'dmaic');
    assertEqual(result.projects[1].projectMeta.cycle, 'dmaic');
  });

  test('0.2→0.3: existing cycle field is preserved (idempotent)', () => {
    const data = {
      appVersion: '0.2.0',
      projectMeta: { name: 'Already', cycle: 'dmadv' },
    };
    const result = migrateToLatest(data, '0.3.0');
    assertEqual(result.projectMeta.cycle, 'dmadv');
  });

  test('0.2→0.3: tolerates missing projectMeta', () => {
    const data = { appVersion: '0.2.0' };
    const result = migrateToLatest(data, '0.3.0');
    // Migration should not throw; appVersion is updated.
    assertEqual(result.appVersion, '0.3.0');
  });
});

suite('Migrations — goldene Fixtures', () => {
  for (const { file, kind } of KNOWN_FIXTURES) {
    test(`${file} migrates to current VERSION without error`, async () => {
      const data = await loadFixture(file);
      const migrated = migrateToLatest(data, VERSION);
      assertEqual(migrated.appVersion, VERSION);

      // Shape sanity — make sure the migration did not destroy the export.
      if (kind === 'single') {
        assertEqual(typeof migrated.projectMeta, 'object');
        assertEqual(typeof migrated.phases, 'object');
        assertEqual(typeof migrated.moduleStates, 'object');
      } else {
        assertEqual(Array.isArray(migrated.projects), true);
      }
    });
  }

  // The app writes ZEG history entries as { t: <epoch ms>, v: <percent> }
  // (js/ui/dmaic-tiles.js) and has never written anything else, so a
  // fixture in another shape would not resemble a real export.
  for (const { file, kind } of KNOWN_FIXTURES) {
    test(`${file} stores ZEG history in the app's {t, v} shape`, async () => {
      const data = await loadFixture(file);
      const projects = kind === 'single' ? [data] : data.projects;
      for (const proj of projects) {
        for (const [phase, entries] of Object.entries(proj.phaseAchievementHistory || {})) {
          for (const e of entries) {
            const where = `${phase} entry ${JSON.stringify(e)}`;
            assertEqual(Object.keys(e).sort().join(','), 't,v', `${where}: expected keys t, v`);
            assertEqual(Number.isFinite(e.t), true, `${where}: t must be epoch ms`);
            assertEqual(Number.isFinite(e.v), true, `${where}: v must be a number`);
          }
        }
      }
    });
  }

  test('current VERSION fixture exists', () => {
    const currentMM = stripPatch(VERSION);
    const matching = KNOWN_FIXTURES.filter(f => f.file.startsWith(`v${currentMM}.`));
    if (matching.length === 0) {
      throw new Error(
        `No goldene Fixture for v${currentMM} in tests/fixtures/exports/. ` +
        `Add one and register it in KNOWN_FIXTURES before tagging the release.`
      );
    }
  });
});

// Modelle beim Besitzer:
// echter Einzelexport der Altform mit `models` (Besitzer regression/glm, Waise
// m-c ohne Besitzer) und `optimizations` (o1 verwiesen, o2 unverwiesen). Nach
// Versionskette und `adoptProjectModels` tragen die Instanzen die Daten.
suite('Migrations — golden v1.9.6_models_project through adoptProjectModels', () => {
  const OWNER_A = 'fd4d076e-e27c-4b93-b77a-1d2671d8505c';
  const OWNER_B = 'f4309ced-02f5-458f-a437-1d0b99aec268';
  const ORPHAN_C = '1e9f66c8-6e81-47f1-876b-8796bbf550a5';
  const RO = 'r0e5f6a7-0001-4b2c-8d3e-9f0a1b2c3d4e';

  /** Kurzform der Zustände der drei Module nach der Übernahme. */
  async function adopted() {
    const raw = await loadFixture('v1.9.6_models_project.json');
    const { doc, changed, phasesChanged } = adoptProjectModels(migrateToLatest(raw, VERSION), { phaseFor: () => 'analyze' });
    const out = {};
    for (const [phase, list] of Object.entries(doc.phases)) {
      for (const e of list) {
        if (!['regression', 'glm-regression', 'response-optimization'].includes(e.moduleId)) continue;
        const st = doc.moduleStates[e.instanceId] || {};
        out[e.instanceId] = {
          phase, moduleId: e.moduleId, customName: e.customName ?? null,
          savedModelId: st.savedModelId ?? null,
          savedModel: st.savedModel?.id ?? null,
          optimization: st.optimization ? { modelRefs: st.optimization.modelRefs, D: st.optimization.result?.D } : null,
        };
      }
    }
    return { doc, changed, phasesChanged, out };
  }

  test('owners, orphan and optimizer carry the legacy data', async () => {
    const { out } = await adopted();
    assertEqual(JSON.stringify(out), JSON.stringify({
      [OWNER_B]: { phase: 'analyze', moduleId: 'glm-regression', customName: null, savedModelId: 'm-b', savedModel: 'm-b', optimization: null },
      [OWNER_A]: { phase: 'improve', moduleId: 'regression', customName: null, savedModelId: 'm-a', savedModel: 'm-a', optimization: null },
      [RO]: { phase: 'improve', moduleId: 'response-optimization', customName: null, savedModelId: null, savedModel: null,
        optimization: { modelRefs: ['m-a', 'm-c'], D: 0.999880070146285 } },
      [ORPHAN_C]: { phase: 'improve', moduleId: 'regression', customName: 'Lieferzeit quadratisch — Modell', savedModelId: 'm-c', savedModel: 'm-c', optimization: null },
    }));
  });

  test('the records arrive unchanged (hash and coefficients)', async () => {
    const raw = await loadFixture('v1.9.6_models_project.json');
    const { doc } = await adopted();
    for (const [id, owner] of [['m-a', OWNER_A], ['m-b', OWNER_B], ['m-c', ORPHAN_C]]) {
      assertEqual(JSON.stringify(doc.moduleStates[owner].savedModel), JSON.stringify(raw.models[id]), id);
    }
  });

  test('legacy keys are gone, a second run changes nothing', async () => {
    const { doc, changed, phasesChanged } = await adopted();
    assertEqual(JSON.stringify(changed.slice().sort()), JSON.stringify([OWNER_A, OWNER_B, ORPHAN_C, RO].sort()));
    assertEqual(phasesChanged, true);
    for (const k of ['models', 'optimizations', 'experiments']) assertEqual(k in doc, false, k);
    const again = adoptProjectModels(doc, { phaseFor: () => 'analyze' });
    assertEqual(again.changed.length, 0);
    assertEqual(again.doc, doc);
  });
});
