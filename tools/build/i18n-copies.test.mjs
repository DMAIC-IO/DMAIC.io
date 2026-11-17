import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

test('a global source (no modules. prefix) is compared in i18n/<lang>.json', () => {
  const root = mkdtempSync(join(tmpdir(), 'i18n-copies-'));
  const own = join(root, 'js/modules/sheet/resources/i18n');
  mkdirSync(own, { recursive: true });
  mkdirSync(join(root, 'i18n'));
  writeFileSync(join(own, 'copies.json'), JSON.stringify({ defaultName: 'sheet.defaultName' }));
  writeFileSync(join(own, 'ui.de.json'), JSON.stringify({ defaultName: 'Tabelle' }));
  writeFileSync(join(own, 'ui.en.json'), JSON.stringify({ defaultName: 'Sheet' }));
  writeFileSync(join(root, 'i18n/de.json'), JSON.stringify({ sheet: { defaultName: 'Tabelle' } }));
  writeFileSync(join(root, 'i18n/en.json'), JSON.stringify({ sheet: { defaultName: 'Table' } }));
  const r = checkI18nCopies(root);
  assert.deepEqual(r.map((f) => [f.lang, f.reason, f.sourceFile, f.sourceValue]), [['en', 'differs', 'i18n/en.json', 'Table']]);
});

test('worksheet: defaultSheetName and writeFailed are copies of the global worksheet.* texts', () => {
  const copies = JSON.parse(readFileSync(join(ROOT, 'js/modules/worksheet/resources/i18n/copies.json'), 'utf8'));
  assert.deepEqual(copies, { defaultSheetName: 'worksheet.defaultSheetName', writeFailed: 'worksheet.writeFailed' });
});

test('the real tree has no diverging copies', () => {
  assert.deepEqual(checkI18nCopies(ROOT).map(formatI18nCopyFinding), []);
});
