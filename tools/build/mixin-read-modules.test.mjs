/**
 * MIXIN_READ_MODULES (js/core/agent/agent-read-mixin.js) nennt genau die
 * Module, die `agentReadMixin(` in ihr Viewmodel spreizen. Ohne Mount liest
 * `core/instances.js` diese Module über den gespeicherten Stand; ein Modul mit
 * eigenem `read()` darf dort nicht stehen, eines mit Mixin nicht fehlen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { APP_DIR } from './build.mjs';
import { MIXIN_READ_MODULES } from '../../js/core/agent/agent-read-mixin.js';

/**
 * Alle `.js`-Dateien unter `dir`, rekursiv.
 * @param {string} dir
 * @returns {string[]}
 */
function jsFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return jsFiles(full);
    return name.endsWith('.js') ? [full] : [];
  });
}

/** Der Spread im Viewmodel, nicht eine Erwähnung im Kommentar. */
const SPREAD = /\.\.\.\s*agentReadMixin\(/;

/**
 * Die Module unter `js/modules/`, deren Quelltext `...agentReadMixin(` spreizt.
 * @param {string} root App-Verzeichnis
 * @returns {string[]} sortiert
 */
function modulesSpreadingMixin(root) {
  const modulesDir = join(root, 'js', 'modules');
  return readdirSync(modulesDir)
    .filter((id) => statSync(join(modulesDir, id)).isDirectory())
    .filter((id) => jsFiles(join(modulesDir, id)).some((f) => SPREAD.test(readFileSync(f, 'utf8'))))
    .sort();
}

test('MIXIN_READ_MODULES ist sortiert und ohne Doppel', () => {
  assert.deepEqual([...MIXIN_READ_MODULES], [...new Set(MIXIN_READ_MODULES)].sort());
});

test('MIXIN_READ_MODULES nennt genau die Module, die agentReadMixin( spreizen', () => {
  assert.deepEqual([...MIXIN_READ_MODULES], modulesSpreadingMixin(APP_DIR));
});
