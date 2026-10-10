/**
 * release-titles.test.mjs — release gate for the bilingual release titles.
 *
 * The versions page lists every release with a title in the reader's
 * language; the titles come from .github/release-titles.json, which the
 * release workflow writes into release.json and gen-versions-json.sh overlays
 * onto the aggregate. Bumping VERSION without a title fails here, the same way
 * a missing golden export fixture fails the migration gate.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TITLES = JSON.parse(readFileSync(join(APP_DIR, '.github', 'release-titles.json'), 'utf8'));
const VERSION = readFileSync(join(APP_DIR, 'js', 'core', 'version.js'), 'utf8')
  .match(/export const VERSION = '([^']+)'/)[1];

test('the current VERSION has a release title', () => {
  assert.ok(TITLES[VERSION],
    `No title for ${VERSION} in .github/release-titles.json — add { "de", "en" } before tagging the release.`);
});

test('every release title is keyed by a plain SemVer version', () => {
  for (const version of Object.keys(TITLES)) {
    assert.match(version, /^\d+\.\d+\.\d+$/, `"${version}" is not MAJOR.MINOR.PATCH`);
  }
});

test('every release title carries a German and an English text', () => {
  for (const [version, title] of Object.entries(TITLES)) {
    assert.deepEqual(Object.keys(title).sort(), ['de', 'en'], `${version}: expected exactly de and en`);
    for (const lang of ['de', 'en']) {
      assert.equal(typeof title[lang], 'string', `${version}.${lang} is not a string`);
      assert.notEqual(title[lang].trim(), '', `${version}.${lang} is empty`);
    }
  }
});
