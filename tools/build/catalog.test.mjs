/**
 * Modulkatalog (tools/build/catalog.mjs).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  renderCatalogModule, collectCatalogTexts, renderCatalogTexts, catalogConflicts, readLegacyIds,
  CATALOG_LANGS, CATALOG_TEXT_KEYS, CATALOG_SCHEMA_REF,
} from './catalog.mjs';
import { APP_DIR } from './build.mjs';
import { CONVERTED_MODULES } from './converted-modules.mjs';

/** Temp-App aus `{ pfad: inhalt }`. */
function appWith(files) {
  const root = mkdtempSync(join(tmpdir(), 'catalog-'));
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}

const UI = (name) => JSON.stringify({ name, description: `${name} kurz`, whenToUse: `${name} wann`, col: 'Spalte' });

test('renderCatalogModule ohne umgestellte Module: nur manifest.js', () => {
  const src = renderCatalogModule([]);
  assert.match(src, /^\/\/ ERZEUGT von tools\/build\/catalog\.mjs/);
  assert.match(src, /import legacy from '\.\/manifest\.js';/);
  assert.match(src, /export const CONVERTED = Object\.freeze\(\[\]\);/);
  assert.match(src, /export const MODULES = Object\.freeze\(\[\.\.\.legacy, \.\.\.\[\]\.map\(fromDescriptor\)\]\);/);
  assert.doesNotMatch(src, /module\.js'/);
});

test('renderCatalogModule importiert je umgestelltem Modul dessen module.js', () => {
  const src = renderCatalogModule(['alpha', 'beta']);
  assert.match(src, /import m0 from '\.\/alpha\/module\.js';/);
  assert.match(src, /import m1 from '\.\/beta\/module\.js';/);
  assert.match(src, /export const CONVERTED = Object\.freeze\(\["alpha","beta"\]\);/);
  assert.match(src, /\.\.\.\[m0, m1\]\.map\(fromDescriptor\)/);
});

test('collectCatalogTexts liest name, description, whenToUse aus ui.<lang>.json', () => {
  const root = appWith({ 'js/modules/neu/resources/i18n/ui.de.json': UI('Neu') });
  assert.deepEqual(collectCatalogTexts(root, ['neu'], 'de'),
    { neu: { name: 'Neu', description: 'Neu kurz', whenToUse: 'Neu wann' } });
});

test('collectCatalogTexts wirft bei fehlender Datei', () => {
  const root = appWith({});
  assert.throws(() => collectCatalogTexts(root, ['neu'], 'en'),
    /catalog: neu: resources\/i18n\/ui\.en\.json fehlt/);
});

test('collectCatalogTexts wirft bei fehlendem oder leerem Schlüssel', () => {
  const root = appWith({ 'js/modules/neu/resources/i18n/ui.de.json': JSON.stringify({ name: 'Neu', description: '' }) });
  assert.throws(() => collectCatalogTexts(root, ['neu'], 'de'),
    /catalog: neu: resources\/i18n\/ui\.de\.json ohne description/);
});

test('renderCatalogTexts: stabiles JSON mit $schema zuerst und Zeilenende', () => {
  assert.equal(CATALOG_SCHEMA_REF, '../../schemas/catalog-texts.schema.json');
  assert.equal(renderCatalogTexts({}), '{\n  "$schema": "../../schemas/catalog-texts.schema.json"\n}\n');
  assert.equal(renderCatalogTexts({ a: { name: 'A' } }),
    '{\n  "$schema": "../../schemas/catalog-texts.schema.json",\n  "a": {\n    "name": "A"\n  }\n}\n');
});

test('catalogConflicts meldet Ids, die in manifest.js und CONVERTED_MODULES stehen', () => {
  assert.deepEqual(catalogConflicts(['sipoc', 'pareto'], ['sipoc']),
    ['catalog: sipoc: steht noch in manifest.js — ein umgestelltes Modul hat nur module.js']);
  assert.deepEqual(catalogConflicts(['pareto'], ['sipoc']), []);
});

test('readLegacyIds liest die Ids aus manifest.js', async () => {
  const ids = await readLegacyIds(APP_DIR);
  assert.ok(ids.includes('sipoc'));
  assert.equal(new Set(ids).size, ids.length);
});

test('Konstanten', () => {
  assert.deepEqual([...CATALOG_LANGS], ['de', 'en']);
  assert.deepEqual([...CATALOG_TEXT_KEYS], ['name', 'description', 'whenToUse']);
});

test('eingecheckter Katalog ist aktuell', () => {
  assert.equal(readFileSync(join(APP_DIR, 'js', 'modules', 'catalog.generated.js'), 'utf8'), renderCatalogModule(CONVERTED_MODULES));
  for (const lang of CATALOG_LANGS) {
    assert.equal(readFileSync(join(APP_DIR, 'js', 'modules', `catalog.${lang}.json`), 'utf8'),
      renderCatalogTexts(collectCatalogTexts(APP_DIR, CONVERTED_MODULES, lang)));
  }
});
