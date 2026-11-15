/**
 * Kopierte Kano-Texte des Fragebogen-Generators: 16 Einträge in copies.json,
 * das Gate meldet eine abweichende Kopie.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkI18nCopies } from './i18n-copies.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OWN = 'js/modules/survey-builder/resources/i18n';

/** Testkopie mit den Texten des Moduls und seiner Quelle (Altform von kano). */
function treeCopy() {
  const root = mkdtempSync(join(tmpdir(), 'sb-copies-'));
  mkdirSync(join(root, OWN), { recursive: true });
  mkdirSync(join(root, 'i18n'), { recursive: true });
  for (const f of ['copies.json', 'ui.de.json', 'ui.en.json']) cpSync(join(ROOT, OWN, f), join(root, OWN, f));
  for (const l of ['de', 'en']) cpSync(join(ROOT, 'i18n', `${l}.json`), join(root, 'i18n', `${l}.json`));
  return root;
}

test('copies.json lists the 16 kano texts', () => {
  const copies = JSON.parse(readFileSync(join(ROOT, OWN, 'copies.json'), 'utf8'));
  assert.equal(Object.keys(copies).length, 16);
  for (const [own, src] of Object.entries(copies)) assert.equal(src, `modules.${own}`);
});

test('the copies equal their source in both languages', () => {
  assert.deepEqual(checkI18nCopies(treeCopy()).filter((f) => f.module === 'survey-builder'), []);
});

test('a changed value in a copy of the tree is reported', () => {
  const root = treeCopy();
  const file = join(root, OWN, 'ui.de.json');
  const ui = JSON.parse(readFileSync(file, 'utf8'));
  ui.kano.catM = 'Anders';
  writeFileSync(file, JSON.stringify(ui));
  const r = checkI18nCopies(root).filter((f) => f.module === 'survey-builder');
  assert.deepEqual(r.map((f) => [f.own, f.lang, f.reason]), [['kano.catM', 'de', 'differs']]);
});
