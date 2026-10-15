import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Regression guard for the nightly outage after d3e4eed: the date suites only
// bite east of UTC, the laptop runs in CEST, GitHub runners in UTC. Both unit
// runners must pin one time zone instead of inheriting the host's.

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PINNED_ZONE = 'Europe/Berlin';

for (const hostZone of ['UTC', 'America/Los_Angeles']) {
  test(`node unit runner ignores a host time zone of ${hostZone}`, () => {
    const run = spawnSync(process.execPath, ['tests/run-node.mjs', 'datagrid-date-input'], {
      cwd: APP_DIR,
      env: { ...process.env, TZ: hostZone },
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, `run-node.mjs failed under TZ=${hostZone}:\n${run.stdout}${run.stderr}`);
  });
}

test('node unit runner pins the time zone', () => {
  const source = readFileSync(join(APP_DIR, 'tests/run-node.mjs'), 'utf8');
  assert.ok(source.includes(`process.env.TZ = '${PINNED_ZONE}'`));
});

test('browser unit runner pins the same time zone', () => {
  const source = readFileSync(join(APP_DIR, 'tools/test-browser/run.mjs'), 'utf8');
  assert.ok(source.includes(`newPage({ timezoneId: '${PINNED_ZONE}' })`));
});
