/**
 * Modulkatalog (tools/build/catalog.mjs).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  renderCatalogModule, collectExampleCatalog, collectCatalogTexts, renderCatalogTexts, catalogConflicts, readLegacyIds,
  moduleOrderDiff, MODULE_ORDER, CATALOG_LANGS, CATALOG_TEXT_KEYS, CATALOG_SCHEMA_REF,
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
  const src = renderCatalogModule([], {}, ['sipoc']);
  assert.match(src, /export const EXAMPLES = Object\.freeze\(\{\}\);/);
  assert.match(src, /export const EXAMPLE_REFS = Object\.freeze\(\{\}\);/);
  assert.match(src, /^\/\/ ERZEUGT von tools\/build\/catalog\.mjs/);
  assert.match(src, /import legacy from '\.\/manifest\.js';/);
  assert.match(src, /export const CONVERTED = Object\.freeze\(\[\]\);/);
  assert.match(src, /export const MODULES = Object\.freeze\(\[\.\.\.legacy, \.\.\.\[\]\.map\(fromDescriptor\)\]\s*\.sort\(\(a, b\) => MODULE_ORDER\.indexOf\(a\.id\) - MODULE_ORDER\.indexOf\(b\.id\)\)\);/);
  assert.match(src, /export const MODULE_ORDER = Object\.freeze\(\["sipoc"\]\);/);
  assert.doesNotMatch(src, /module\.js'/);
});

test('renderCatalogModule importiert je umgestelltem Modul dessen module.js', () => {
  const src = renderCatalogModule(['alpha', 'beta'], {}, ['alpha', 'beta']);
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

test('readLegacyIds liest die Ids aus manifest.js (ohne umgestellte)', async () => {
  const ids = await readLegacyIds(APP_DIR);
  // Seit Paket 3d ist kein Modul mehr in der alten Form.
  assert.deepEqual(ids, []);
  assert.ok(!ids.includes('sipoc'));
  assert.ok(!ids.includes('dmaic-calendar'));
  assert.equal(new Set(ids).size, ids.length);
});

test('MODULE_ORDER: echter Baum — jedes Modul genau einmal', async () => {
  assert.deepEqual(moduleOrderDiff(await readLegacyIds(APP_DIR), CONVERTED_MODULES), []);
});

test('MODULE_ORDER: die Alt-Module stehen in der Reihenfolge von manifest.js', async () => {
  const legacy = await readLegacyIds(APP_DIR);
  assert.deepEqual(MODULE_ORDER.filter((id) => legacy.includes(id)), legacy);
});

test('moduleOrderDiff meldet Fehlende, Doppel und Unbekannte', () => {
  assert.deepEqual(moduleOrderDiff(['a', 'b'], ['c'], ['a', 'a', 'x']), [
    'catalog: MODULE_ORDER: a steht mehrfach darin',
    'catalog: MODULE_ORDER: x ist kein Modul',
    'catalog: MODULE_ORDER: b fehlt',
    'catalog: MODULE_ORDER: c fehlt',
  ]);
});

test('renderCatalogModule sortiert MODULES nach MODULE_ORDER', () => {
  const out = renderCatalogModule(['neu'], {}, ['alt', 'neu', 'ende']);
  assert.match(out, /export const MODULE_ORDER = Object\.freeze\(\["alt","neu","ende"\]\);/);
  assert.match(out, /export const MODULES = Object\.freeze\(\[\.\.\.legacy, \.\.\.\[m0\]\.map\(fromDescriptor\)\]\s*\.sort\(\(a, b\) => MODULE_ORDER\.indexOf\(a\.id\) - MODULE_ORDER\.indexOf\(b\.id\)\)\);/);
});

test('MODULE_ORDER wird vor jeder Verwendung im Katalog ausgegeben (TDZ)', () => {
  const out = renderCatalogModule(['neu'], {}, ['neu']);
  const decl = out.indexOf('export const MODULE_ORDER');
  assert.ok(decl > -1);
  assert.ok(decl < out.indexOf('export const MODULES'));
  assert.ok(decl < out.indexOf('MODULE_ORDER.indexOf'));
});

test('Konstanten', () => {
  assert.deepEqual([...CATALOG_LANGS], ['de', 'en']);
  assert.deepEqual([...CATALOG_TEXT_KEYS], ['name', 'description', 'whenToUse']);
});

test('eingecheckter Katalog ist aktuell', () => {
  assert.equal(readFileSync(join(APP_DIR, 'js', 'modules', 'catalog.generated.js'), 'utf8'), renderCatalogModule(CONVERTED_MODULES, collectExampleCatalog(APP_DIR, CONVERTED_MODULES), MODULE_ORDER));
  for (const lang of CATALOG_LANGS) {
    assert.equal(readFileSync(join(APP_DIR, 'js', 'modules', `catalog.${lang}.json`), 'utf8'),
      renderCatalogTexts(collectCatalogTexts(APP_DIR, CONVERTED_MODULES, lang)));
  }
});

test('collectExampleCatalog: Besitzer aus examples.json, Nutzer aus exampleRefs, sortiert', () => {
  const desc = (id, refs) => `/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */\nexport default { id: '${id}', version: '1.0.0', icon: 'module.x', exampleRefs: ${JSON.stringify(refs)}, load: () => import('./viewmodel/viewmodel.js') };\n`;
  const root = appWith({
    'js/modules/beta/module.js': desc('beta', ['b-2', 'alt-1']),
    'js/modules/beta/resources/examples/examples.json': JSON.stringify({ examples: [{ id: 'b-2' }, { id: 'b-1' }] }),
    'js/modules/alpha/module.js': desc('alpha', ['b-1']),
  });
  const cat = collectExampleCatalog(root, ['alpha', 'beta']);
  assert.deepEqual(cat, { examples: { 'b-1': 'beta', 'b-2': 'beta' }, exampleRefs: { 'alt-1': ['beta'], 'b-1': ['alpha'], 'b-2': ['beta'] } });
  assert.deepEqual(Object.keys(cat.examples), ['b-1', 'b-2']);
  const src = renderCatalogModule(['alpha', 'beta'], cat);
  assert.match(src, /export const EXAMPLES = Object\.freeze\(\{"b-1":"beta","b-2":"beta"\}\);/);
  assert.match(src, /export const EXAMPLE_REFS = Object\.freeze\(\{"alt-1":\["beta"\],"b-1":\["alpha"\],"b-2":\["beta"\]\}\);/);
});
