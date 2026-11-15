import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { checkI18nCopies, formatI18nCopyFinding } from './i18n-copies.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const fx = (name) => fileURLToPath(new URL(`./fixtures/i18n-copies/${name}/`, import.meta.url));

test('equal copies produce no findings', () => {
  assert.deepEqual(checkI18nCopies(fx('equal')), []);
});

test('differing copies are reported per language with both values and files', () => {
  const r = checkI18nCopies(fx('differs'));
  assert.deepEqual(r.map((f) => [f.lang, f.reason]), [['de', 'differs'], ['en', 'differs']]);
  const de = r[0];
  assert.equal(de.module, 'survey');
  assert.equal(de.own, 'kano.scale1');
  assert.equal(de.source, 'modules.kano.scale1');
  assert.equal(de.ownValue, 'Gefaellt');
  assert.equal(de.sourceValue, 'Gefaellt!');
  assert.equal(de.ownFile, 'js/modules/survey/resources/i18n/ui.de.json');
  assert.equal(de.sourceFile, 'i18n/de.json');
});

test('missing source key in en is reported', () => {
  const r = checkI18nCopies(fx('missing-source'));
  assert.equal(r.length, 1);
  assert.equal(r[0].reason, 'missing_source');
  assert.equal(r[0].lang, 'en');
});

test('missing own key is reported', () => {
  const r = checkI18nCopies(fx('missing-own'));
  assert.deepEqual(r.map((f) => [f.lang, f.reason]), [['de', 'missing_own'], ['en', 'missing_own']]);
});

test('a source module in target form is compared in its ui file, not the legacy file', () => {
  const r = checkI18nCopies(fx('target-form'));
  assert.deepEqual(r, []);
  // the legacy value ("alt") would have differed
});

test('message names keys, language, both values and both files', () => {
  const msg = formatI18nCopyFinding(checkI18nCopies(fx('differs'))[0]);
  for (const part of ['kano.scale1', 'modules.kano.scale1', 'de', 'Gefaellt', 'Gefaellt!',
    'js/modules/survey/resources/i18n/ui.de.json', 'i18n/de.json']) {
    assert.ok(msg.includes(part), `message lacks ${part}: ${msg}`);
  }
});

test('the real tree has no diverging copies', () => {
  assert.deepEqual(checkI18nCopies(ROOT).map(formatI18nCopyFinding), []);
});
