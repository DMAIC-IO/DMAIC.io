/**
 * Gates der umgestellten Module (tools/build/module-gates.mjs).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listModuleFiles, checkStructure, checkDescriptor, parseDescriptor } from './module-gates.mjs';

/** Temp-App aus `{ pfad: inhalt }`. */
function appWith(files) {
  const root = mkdtempSync(join(tmpdir(), 'module-gates-'));
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, body);
  }
  return root;
}

const GOOD_PATHS = [
  'domain/model.js', 'domain/model.types.js', 'domain/routing.js', 'domain/commands/move-item.js',
  'interaction/reorder.js', 'io/export.js', 'module.js',
  'resources/data/references.json', 'resources/examples/examples.json', 'resources/examples/pizza.csv',
  'resources/i18n/context-help.de.json', 'resources/i18n/context-help.en.json',
  'resources/i18n/help.de.json', 'resources/i18n/ui.en.json',
  'resources/rows.part.html', 'resources/style.css', 'resources/tile.goals.html', 'resources/tile.html',
  'resources/view.html', 'tile/tile.js', 'viewmodel/chart-config.js', 'viewmodel/viewmodel.js',
];

const DESCRIPTOR = `/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'neu',
  version: '1.0.0',
  icon: 'module.neu',
  phase: 'data',
  group: 'visualize',
  cycles: { dmaic: { phase: 'define', allowedPhases: ['define'] } },
  uses: ['worksheet'],
  exampleRefs: ['pizza'],
  load: () => import('./viewmodel/viewmodel.js'),
  tile: () => import('./tile/tile.js'),
};
`;
const CTX = { moduleIds: ['neu', 'worksheet'], exampleIds: ['pizza'], paths: GOOD_PATHS };

test('listModuleFiles: rekursiv, relativ, sortiert', () => {
  const root = appWith({ 'js/modules/neu/module.js': '', 'js/modules/neu/domain/model.js': '', 'js/modules/neu/resources/i18n/ui.de.json': '{}' });
  assert.deepEqual(listModuleFiles(root, 'neu'), ['domain/model.js', 'module.js', 'resources/i18n/ui.de.json']);
});

test('Struktur: vollständige neue Form ist grün', () => {
  assert.deepEqual(checkStructure('neu', GOOD_PATHS), []);
});

test('Struktur: Pflichtdateien, Wurzel, Ordner, Namen', () => {
  assert.deepEqual(checkStructure('neu', [
    'module.js', 'neu.js', 'helpers/x.js', 'viewmodel/index.js', 'domain/neu-analysis.js',
    'resources/view.html', 'resources/extra.txt', 'resources/i18n/de.json', 'resources/data/x.csv',
    'resources/assets/a.png', 'tile/tile.html', 'io/readme.md',
  ]), [
    'structure: domain/model.js: fehlt',
    'structure: viewmodel/viewmodel.js: fehlt',
    'structure: neu.js: im Wurzelverzeichnis ist nur module.js erlaubt',
    'structure: helpers/x.js: Ordner helpers/ ist nicht erlaubt (erlaubt: domain, viewmodel, interaction, io, tile, resources)',
    'structure: viewmodel/index.js: Dateiname nach Rolle, ohne Modulnamen und ohne index (D2)',
    'structure: domain/neu-analysis.js: Dateiname nach Rolle, ohne Modulnamen und ohne index (D2)',
    'structure: resources/extra.txt: unter resources/ nur view.html, *.part.html, style.css, tile[.<name>].html',
    'structure: resources/i18n/de.json: unter resources/i18n/ nur ui|help|context-help.<de|en>.json',
    'structure: resources/data/x.csv: unter resources/data/ nur .json',
    'structure: resources/assets/a.png: Ordner resources/assets/ ist nicht erlaubt (erlaubt: i18n, examples, data)',
    'structure: tile/tile.html: unter tile/ nur <name>.js',
    'structure: io/readme.md: unter io/ nur .js',
  ]);
});

test('Beschreibung: gültige module.js ist grün', () => {
  assert.deepEqual(checkDescriptor('neu', DESCRIPTOR, CTX), []);
});

test('parseDescriptor: Literale und Lader', () => {
  const { fields, problems } = parseDescriptor(DESCRIPTOR);
  assert.deepEqual(problems, []);
  assert.deepEqual(fields.get('uses'), ['worksheet']);
  assert.deepEqual(fields.get('cycles'), { dmaic: { phase: 'define', allowedPhases: ['define'] } });
  assert.deepEqual(fields.get('load'), { import: './viewmodel/viewmodel.js' });
});

test('Beschreibung: Import, weitere Anweisungen, fehlendes @type', () => {
  const src = `import x from '../../core/x.js';\nexport default { id: 'neu', version: '1.0.0', icon: 'i', load: () => import('./viewmodel/viewmodel.js') };\n`;
  assert.deepEqual(checkDescriptor('neu', src, CTX), [
    'descriptor: module.js: genau eine Anweisung: export default { … } (kein import, keine weiteren Anweisungen)',
  ]);
  const noType = `export default { id: 'neu', version: '1.0.0', icon: 'i', load: () => import('./viewmodel/viewmodel.js') };\n`;
  assert.deepEqual(checkDescriptor('neu', noType, CTX), [
    "descriptor: module.js: JSDoc @type {import('../../core/module-descriptor.js').ModuleDescriptor} fehlt",
  ]);
});

test('Beschreibung: Felder, Werte, Lader, Verweise', () => {
  const src = `/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'alt',
  version: '1',
  owner: 'x',
  phase: PHASE,
  uses: ['fehlt'],
  exampleRefs: ['nix'],
  load: () => import('../other/viewmodel.js'),
  tile: () => import('./tile/missing.js'),
  ...rest,
};
`;
  assert.deepEqual(checkDescriptor('neu', src, CTX), [
    'descriptor: module.js: unbekanntes Feld owner',
    'descriptor: module.js: phase: nur Literale (Strings, Zahlen, Booleans, Arrays, Objekte mit festen Schlüsseln)',
    'descriptor: module.js: nur feste Schlüssel mit Wert (...rest)',
    'descriptor: module.js: Pflichtfeld icon fehlt',
    'descriptor: module.js: id "alt" ≠ Ordner neu',
    'descriptor: module.js: version "1": x.y.z erwartet',
    'descriptor: module.js: uses: unbekanntes Modul fehlt',
    'descriptor: module.js: exampleRefs: unbekanntes Beispiel nix',
    'descriptor: module.js: load: Ziel ../other/viewmodel.js nicht erlaubt (erwartet ./viewmodel/viewmodel.js)',
    'descriptor: module.js: tile: ./tile/missing.js existiert nicht',
  ]);
});

test('Beschreibung: Lader ohne import(), Kurzschreibweise, tile-Ziel, Pflicht load', () => {
  const src = `/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */
export default {
  id: 'neu',
  version: '1.0.0',
  icon,
  load: () => 5,
  tile: () => import('./tile/a/b.js'),
};
`;
  assert.deepEqual(checkDescriptor('neu', src, CTX), [
    'descriptor: module.js: nur feste Schlüssel mit Wert (icon)',
    "descriptor: module.js: load: () => import('./…') erwartet",
    'descriptor: module.js: Pflichtfeld icon fehlt',
    'descriptor: module.js: tile: Ziel ./tile/a/b.js nicht erlaubt (erwartet ./tile/<name>.js)',
  ]);
});

test('Beschreibung: export default ohne Objektliteral', () => {
  assert.deepEqual(checkDescriptor('neu', 'export default makeIt();\n', CTX), [
    'descriptor: module.js: genau eine Anweisung: export default { … } (kein import, keine weiteren Anweisungen)',
  ]);
});
