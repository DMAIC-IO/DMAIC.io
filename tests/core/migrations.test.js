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
