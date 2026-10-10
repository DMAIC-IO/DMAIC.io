/**
 * gen-versions-json.test.mjs — runs the server-side aggregation script against
 * a temporary docroot and checks the versions.json it writes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'gen-versions-json.sh');

/** Builds a docroot: one /app/<tag>/ folder per release, plus optional legacy folders. */
function docroot({ releases = [], legacy = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'gen-versions-'));
  mkdirSync(join(root, 'app'));
  for (const r of releases) {
    const dir = join(root, 'app', `v${r.version}`);
    mkdirSync(dir);
    writeFileSync(join(dir, 'release.json'), JSON.stringify(r));
  }
  for (const folder of legacy) mkdirSync(join(root, folder));
  return root;
}

/** Runs the script and returns the parsed versions.json. */
function generate(root, titles) {
  const env = { ...process.env, DEPLOY_ROOT: root };
  if (titles) env.TITLES_B64 = Buffer.from(JSON.stringify(titles)).toString('base64');
  else delete env.TITLES_B64;
  execFileSync('bash', [SCRIPT], { env, stdio: 'pipe' });
  return JSON.parse(readFileSync(join(root, 'versions.json'), 'utf8'));
}

test('aggregates every /app/vX.Y.Z/ release, newest is current', (t) => {
  const root = docroot({ releases: [
    { version: '1.10.0', date: '2026-10-01', title: 'b' },
    { version: '1.2.0', date: '2026-09-01', title: 'a' },
  ] });
  t.after(() => rmSync(root, { recursive: true }));
  symlinkSync('v1.10.0', join(root, 'app', 'latest'));

  const out = generate(root);
  assert.equal(out.current, '1.10.0');
  assert.deepEqual(out.releases.map(r => [r.version, r.url]),
    [['1.2.0', '/app/v1.2.0/'], ['1.10.0', '/app/v1.10.0/']]);
  assert.equal(statSync(join(root, 'versions.json')).mode & 0o777, 0o644);
});

test('overlays bilingual titles by version and keeps the others', (t) => {
  const root = docroot({ releases: [
    { version: '1.1.0', date: '2026-09-11', title: 'chore(release): 1.1.0' },
    { version: '1.2.0', date: '2026-10-03', title: 'chore(release): 1.2.0' },
  ] });
  t.after(() => rmSync(root, { recursive: true }));

  const out = generate(root, { '1.2.0': { de: 'Neu', en: 'New' } });
  assert.deepEqual(out.releases.find(r => r.version === '1.2.0').title, { de: 'Neu', en: 'New' });
  assert.equal(out.releases.find(r => r.version === '1.1.0').title, 'chore(release): 1.1.0');
});

test('lists the frozen legacy releases that exist on the server, oldest first', (t) => {
  const root = docroot({
    releases: [{ version: '0.4.1', date: '2026-05-09', title: 'x' }],
    legacy: ['v0.2', 'v0.3'],
  });
  t.after(() => rmSync(root, { recursive: true }));

  const out = generate(root, { '0.3.0': { de: 'Zyklen', en: 'Cycles' } });
  assert.equal(out.current, '0.4.1');
  assert.deepEqual(out.releases.map(r => [r.version, r.date, r.url]), [
    ['0.2.0', '2026-05-02', '/v0.2/'],
    ['0.3.0', '2026-05-02', '/v0.3/'],
    ['0.4.1', '2026-05-09', '/app/v0.4.1/'],
  ]);
  assert.deepEqual(out.releases[1].title, { de: 'Zyklen', en: 'Cycles' });
});

test('leaves out a legacy release whose folder is gone', (t) => {
  const root = docroot({ releases: [{ version: '1.0.0', date: '2026-08-18' }], legacy: ['v0.3'] });
  t.after(() => rmSync(root, { recursive: true }));

  assert.deepEqual(generate(root).releases.map(r => r.version), ['0.3.0', '1.0.0']);
});
