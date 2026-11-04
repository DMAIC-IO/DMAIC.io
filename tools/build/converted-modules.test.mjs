/**
 * Liste der umgestellten Module (tools/build/converted-modules.mjs).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONVERTED_MODULES, conversionDiff } from './converted-modules.mjs';
import { APP_DIR } from './build.mjs';

function appWith(files) {
  const root = mkdtempSync(join(tmpdir(), 'converted-'));
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}

test('CONVERTED_MODULES ist sortiert und ohne Doppel', () => {
  assert.deepEqual([...CONVERTED_MODULES], [...new Set(CONVERTED_MODULES)].sort());
});

test('echter Baum: Liste, Freigabe und Dateien passen zusammen', () => {
  assert.deepEqual(conversionDiff(APP_DIR), []);
});

test('Eintrag ohne Modulverzeichnis', () => {
  const root = appWith({ 'js/modules/alt/alt.js': '' });
  assert.deepEqual(conversionDiff(root, ['neu'], ['neu']), [
    'converted: neu: kein Verzeichnis js/modules/neu/',
  ]);
});

test('Eintrag nicht freigegeben', () => {
  const root = appWith({ 'js/modules/neu/module.js': '' });
  assert.deepEqual(conversionDiff(root, ['neu'], []), [
    'converted: neu: nicht in RELEASED_MODULES (agent-release.mjs) — ein umgestelltes Modul ist vollständig freigegeben',
  ]);
});

test('Modul mit module.js oder domain/model.js außerhalb der Liste', () => {
  const root = appWith({
    'js/modules/a/module.js': '',
    'js/modules/b/domain/model.js': '',
    'js/modules/c/c.js': '',
  });
  assert.deepEqual(conversionDiff(root, [], []), [
    'converted: a: hat module.js, steht aber nicht in CONVERTED_MODULES — Module werden nur vollständig umgestellt',
    'converted: b: hat domain/model.js, steht aber nicht in CONVERTED_MODULES — Module werden nur vollständig umgestellt',
  ]);
});
