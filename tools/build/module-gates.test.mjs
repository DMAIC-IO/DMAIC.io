/**
 * Gates der umgestellten Module (tools/build/module-gates.mjs).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { listModuleFiles, checkStructure, checkDescriptor, parseDescriptor, checkUses, checkLayers, checkSchemaLiteral, checkTileSettings, checkSchemaPaths, checkTemplateBindings, checkWritePath, checkContextHelp, readStateBindings, readViewmodelCommands, checkConvertedModule, readExampleIds, checkReferenceFile, checkHelpFiles, readCommandForms, checkCommandRefs, formHelpKeys, readConfirmKeys, checkConfirmKeys } from './module-gates.mjs';
import { CONVERTED_MODULES } from './converted-modules.mjs';
import { APP_DIR } from './build.mjs';
import { defineModel, command, text, number, oneOf, index, idOf, list, record, object, boolean } from '../../js/core/model.js';

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
    'structure: viewmodel/index.js: Dateiname nach Rolle, ohne Modulnamen und ohne index',
    'structure: domain/neu-analysis.js: Dateiname nach Rolle, ohne Modulnamen und ohne index',
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

/** Platzhalter @/ steht für den Weg aus dem Modul zu js/ (kein Literal, das den Repo-Grenzen-Scan auslöst). */
const fx = (files) => files.map((f) => ({ ...f, text: f.text.replaceAll('@/', ['..', '..', '..', ''].join('/')) }));
const ex = (lines) => lines.map((l) => l.replaceAll('@/', ['..', '..', '..', ''].join('/')));

test('uses: Worksheet-Nutzung verlangt uses worksheet', () => {
  const files = [
    { path: 'viewmodel/viewmodel.js', text: "import { createColumnPicker } from '@/ui/column-picker.js';\n" },
    { path: 'io/handoff.js', text: "import { appendRows } from '@/core/worksheet-append.js';\n" },
    { path: 'viewmodel/events.js', text: "bus.on('worksheet:changed', f);\n" },
    { path: 'domain/model.js', text: "export const x = 'worksheets';\n" },
  ];
  assert.deepEqual(checkUses(fx(files), []), [
    "uses: viewmodel/viewmodel.js: nutzt das Worksheet (ui/column-picker.js) → uses: ['worksheet'] in module.js",
    "uses: io/handoff.js: nutzt das Worksheet (core/worksheet-*) → uses: ['worksheet'] in module.js",
    "uses: viewmodel/events.js: nutzt das Worksheet (Ereignis worksheet:…) → uses: ['worksheet'] in module.js",
  ]);
  assert.deepEqual(checkUses(fx(files), ['worksheet']), []);
});

test('Layer: domain ohne Alpine, DOM, UI, Kontext und höhere Schichten', () => {
  const files = [
    { path: 'domain/model.js', text: "import { defineModel } from '@/core/model.js';\nimport { mean } from '@/core/stats.js';\n" },
    { path: 'domain/a.js', text: "import Alpine from '@alpinejs/csp';\nimport { h } from '@/core/dom.js';\nimport { p } from '@/ui/column-picker.js';\nimport { v } from '../viewmodel/viewmodel.js';\n" },
    { path: 'domain/b.js', text: "export const f = () => document.body;\nexport function g(context) { return this.context; }\nexport const ok = { document: 1 }.document;\n" },
    { path: 'domain/deep/c.js', text: "const m = await import('../../interaction/reorder.js');\n" },
    { path: 'io/export.js', text: "import Alpine from 'alpinejs';\nexport const x = () => Alpine.store('a');\nexport const y = () => document.title;\n" },
    { path: 'viewmodel/viewmodel.js', text: "import Alpine from '@alpinejs/csp';\n" },
  ];
  assert.deepEqual(checkLayers(fx(files)), ex([
    'layer: domain/a.js: Import @alpinejs/csp in domain/ verboten (Alpine)',
    'layer: domain/a.js: Import @/core/dom.js in domain/ verboten (DOM-Helfer)',
    'layer: domain/a.js: Import @/ui/column-picker.js in domain/ verboten (UI)',
    'layer: domain/a.js: Import ../viewmodel/viewmodel.js in domain/ verboten (höhere Schicht)',
    'layer: domain/b.js: document in domain/ verboten',
    'layer: domain/b.js: context in domain/ verboten',
    'layer: domain/b.js: this.context in domain/ verboten',
    'layer: domain/deep/c.js: Import ../../interaction/reorder.js in domain/ verboten (höhere Schicht)',
    'layer: io/export.js: Import alpinejs in io/ verboten (Alpine)',
    'layer: io/export.js: Alpine in io/ verboten',
  ]));
});

test('Layer: Viewmodel-Kern-Import, window und Re-Export in domain', () => {
  const files = [
    { path: 'domain/k.js', text: "import { createTemplateModule } from '@/core/template-module.js';\nimport { fieldDirective } from '@/core/field-directive.js';\n" },
    { path: 'domain/w.js', text: "export const w = () => window.location;\nexport { x } from '../io/export.js';\n" },
  ];
  assert.deepEqual(checkLayers(fx(files)), ex([
    'layer: domain/k.js: Import @/core/template-module.js in domain/ verboten (Viewmodel-Kern)',
    'layer: domain/k.js: Import @/core/field-directive.js in domain/ verboten (Viewmodel-Kern)',
    'layer: domain/w.js: window in domain/ verboten',
    'layer: domain/w.js: Import ../io/export.js in domain/ verboten (höhere Schicht)',
  ]));
});

const MODEL_URL = pathToFileURL(join(import.meta.dirname, '..', '..', 'js', 'core', 'model.js')).href;
const GOOD_MODEL = `import { defineModel, command, text, number, oneOf, index, list, record, boolean } from '${MODEL_URL}';
import { moveRun } from './commands/move.js';
export const COL_KEYS = ['a', 'b'];
const MAX = 10;
export const State = defineModel({
  fields: { title: text(), alpha: number({ min: 0, max: MAX, nullable: true, default: null }), columns: record(COL_KEYS, list(text())), mode2: oneOf(['x', 'y']) },
  view: { zoom: number({ min: -1 }) },
  commands: {
    moveItem: command({
      params: { from: oneOf(COL_KEYS), idx: index('columns[from]', { existing: true }), to: oneOf(COL_KEYS) },
      returns: boolean(),
      run({ from, idx, to }) { return true; },
    }),
    rename: command({ params: { title: text() }, returns: boolean(), run: function ({ title }) { this.title = title; return true; } }),
    move2: command({ params: {}, returns: boolean(), run: moveRun }),
  },
});
`;

/** Präfix aller Schema-Befunde. */
const P = 'schema: domain/model.js:';
const MODEL_IMPORT = "import { defineModel, command, text, number } from '@/core/model.js';\n";

test('Schema-Literal: gültiges Model ist grün', () => {
  assert.deepEqual(checkSchemaLiteral(GOOD_MODEL), []);
});

test('Schema-Literal: Spread, berechnete Schlüssel, fremde Aufrufe, Pfeil-run, Callbacks', () => {
  const src = `${MODEL_IMPORT}import { LIMIT } from './limits.js';
const extra = {};
export const State = defineModel({
  fields: { ...extra, ['x' + 1]: text(), n: number({ max: LIMIT }), t: text({ check: (v) => v }), u: makeField() },
  commands: {
    go: command({ params: {}, run: () => true }),
  },
});
`.replaceAll('@/', ['..', '..', '..', ''].join('/'));
  assert.deepEqual(checkSchemaLiteral(src), [
    `${P} Spread nicht erlaubt (...extra)`,
    `${P} berechneter Schlüssel nicht erlaubt (['x' + 1])`,
    `${P} Bezeichner LIMIT ist keine Konstante dieser Datei`,
    `${P} Funktion nicht erlaubt ((v) => v) — Callbacks nur als run`,
    `${P} Aufruf makeField() ist kein Konstruktor aus core/model.js`,
    `${P} run von go ist eine Pfeilfunktion — this muss das reaktive Model sein`,
  ]);
});

test('Schema-Literal: kein oder zwei defineModel', () => {
  assert.deepEqual(checkSchemaLiteral(`export const x = 1;\n`), [
    `${P} genau ein Aufruf defineModel({ … }) aus core/model.js erwartet, gefunden 0`,
  ]);
  const two = `${MODEL_IMPORT}export const A = defineModel({ fields: { a: text() } });\nexport const B = defineModel({ fields: { b: text() } });\n`
    .replaceAll('@/', ['..', '..', '..', ''].join('/'));
  assert.deepEqual(checkSchemaLiteral(two), [
    `${P} genau ein Aufruf defineModel({ … }) aus core/model.js erwartet, gefunden 2`,
  ]);
});

test('Schema-Literal: run weder Funktion noch Import, Kurzschreibweise, sonstiger Ausdruck', () => {
  const src = `${MODEL_IMPORT}const t = 1;
export const State = defineModel({
  fields: { t, o: number({ max: obj.limit }) },
  commands: { go: command({ params: {}, run: 5 }) },
});
`.replaceAll('@/', ['..', '..', '..', ''].join('/'));
  assert.deepEqual(checkSchemaLiteral(src), [
    `${P} Kurzschreibweise nicht erlaubt (t)`,
    `${P} nicht erlaubt: obj.limit`,
    `${P} run von go: Funktion, Methode oder Import aus ./commands/ erwartet`,
  ]);
});

test('Schema-Pfade: Felder und Parameter', () => {
  const ok = defineModel({
    fields: { items: list(object({ id: text() })), sel: idOf('items'), cols: record(['a'], list(text())) },
    commands: { pick: command({ params: { col: oneOf(['a']), i: index('cols[col]') }, returns: boolean(), run() { return true; } }) },
  });
  assert.deepEqual(checkSchemaPaths(ok.schema), []);
  const bad = defineModel({
    fields: { sel: idOf('nope'), nested: list(index('items')) },
    view: { cur: index('cols.a') },
    commands: { pick: command({ params: { i: index('cols[col]') }, returns: boolean(), run() { return true; } }) },
  });
  assert.deepEqual(checkSchemaPaths(bad.schema), [
    `${P} fields.sel: Pfad nope: Feld nope gibt es nicht`,
    `${P} fields.nested: Pfad items: Feld items gibt es nicht`,
    `${P} view.cur: Pfad cols.a: Feld cols gibt es nicht`,
    `${P} commands.pick.params.i: Pfad cols[col]: Feld cols gibt es nicht`,
    `${P} commands.pick.params.i: Pfad cols[col]: [col] ist weder Parameter noch Feld`,
  ]);
});

const SCHEMA_FOR_VIEW = defineModel({
  fields: { title: text(), alpha: number({ min: 0 }), mode: oneOf(['a', 'b']), done: boolean() },
  view: { zoom: number({ min: 1 }) },
  commands: { reset: command({ params: { to: number() }, returns: boolean(), run() { return true; } }) },
}).schema;

test('Template ↔ Schema: Bindungen auf bekannte Felder, x-field nur mit Regeln', () => {
  const files = [
    { path: 'resources/view.html', text: '<input x-model="model.title"><input x-field="model.alpha"><span x-text="model.zoom"></span><input x-model.number="model.nope">' },
    { path: 'resources/rows.part.html', text: '<input x-field="model.title"><select x-field="model.mode"></select><input type="checkbox" x-field="model.done"><span x-text="model.ghost + 1"></span>' },
  ];
  assert.deepEqual(checkTemplateBindings(files, SCHEMA_FOR_VIEW), [
    'template: resources/view.html: x-model.number="model.nope": nope ist weder Feld noch Ansichtsfeld',
    'template: resources/rows.part.html: x-field="model.title": title (text) hat keine Regeln — x-model verwenden',
    'template: resources/rows.part.html: x-field="model.done": done (boolean) hat keine Regeln — x-model verwenden',
    'template: resources/rows.part.html: x-text="model.ghost": ghost ist weder Feld noch Ansichtsfeld',
  ]);
});

test('Schreibweg: keine Zuweisung an this.model.<feld> im Viewmodel', () => {
  const files = [
    { path: 'viewmodel/viewmodel.js', text: 'function a() { this.model.title = "x"; this.model.count += 1; this.model.count++; --this.model.n; delete this.model.x; }\n' },
    { path: 'viewmodel/part.js', text: 'function b() { this.model.columns.a = []; this.model["t"] = 1; const m = this.model; this.view = 1; this.model.reset({ to: 1 }); }\n' },
    { path: 'domain/model.js', text: 'function c() { this.model.title = 1; }\n' },
  ];
  assert.deepEqual(checkWritePath(files), [
    'write: viewmodel/viewmodel.js: this.model.title = … — über ein Kommando, instance.set oder x-model/x-field schreiben',
    'write: viewmodel/viewmodel.js: this.model.count += … — über ein Kommando, instance.set oder x-model/x-field schreiben',
    'write: viewmodel/viewmodel.js: this.model.count++ — über ein Kommando, instance.set oder x-model/x-field schreiben',
    'write: viewmodel/viewmodel.js: --this.model.n — über ein Kommando, instance.set oder x-model/x-field schreiben',
    'write: viewmodel/viewmodel.js: delete this.model.x — über ein Kommando, instance.set oder x-model/x-field schreiben',
    'write: viewmodel/part.js: this.model.columns.a = … — über ein Kommando, instance.set oder x-model/x-field schreiben',
    'write: viewmodel/part.js: this.model["t"] = … — über ein Kommando, instance.set oder x-model/x-field schreiben',
  ]);
});

test('Hilfe: jedes Feld, Kommando und jeder Parameter in de und en', () => {
  const full = {
    fields: { title: { help: 'T' }, alpha: { help: 'A' }, mode: { help: 'M' }, done: { help: 'D' } },
    actions: { reset: { help: 'R', params: { to: 'Ziel' } } },
  };
  assert.deepEqual(checkContextHelp(SCHEMA_FOR_VIEW, { de: full, en: full }), []);
  const partial = { fields: { title: { help: 'T' }, alpha: { help: '' } }, actions: { reset: { params: {} } } };
  assert.deepEqual(checkContextHelp(SCHEMA_FOR_VIEW, { de: partial, en: null }), [
    'help: resources/i18n/context-help.de.json: fields.alpha.help fehlt',
    'help: resources/i18n/context-help.de.json: fields.mode.help fehlt',
    'help: resources/i18n/context-help.de.json: fields.done.help fehlt',
    'help: resources/i18n/context-help.de.json: actions.reset.help fehlt',
    'help: resources/i18n/context-help.de.json: actions.reset.params.to fehlt',
    'help: resources/i18n/context-help.en.json: Datei fehlt',
  ]);
});

test('Hilfe: Kommando ohne Parameter braucht nur den Hilfetext', () => {
  const schema = defineModel({ fields: {}, commands: { ping: command({ returns: boolean(), run() { return true; } }) } }).schema;
  const ok = { actions: { ping: { help: 'P' } } };
  assert.deepEqual(checkContextHelp(schema, { de: ok, en: ok }), []);
  assert.deepEqual(checkContextHelp(schema, { de: {}, en: ok }), ['help: resources/i18n/context-help.de.json: actions.ping.help fehlt']);
});

test('Hilfe: x-field auf UI-State braucht state.<name>.help, ungebundene State-Felder nicht', () => {
  const schema = defineModel({ fields: {} }).schema;
  const bound = readStateBindings([
    { path: 'resources/view.html', text: '<input x-field="state.tab"><input x-model="state.drafts[col.key]"><input x-field = "state.tab">' },
    { path: 'resources/tile.html', text: '<select x-field="state.unit"></select>' },
  ]);
  assert.deepEqual(bound, ['tab', 'unit']);
  const ok = { state: { tab: { help: 'T' }, unit: { help: 'U' } } };
  assert.deepEqual(checkContextHelp(schema, { de: ok, en: ok }, {}, bound), []);
  assert.deepEqual(checkContextHelp(schema, { de: { state: { tab: { help: 'T' } } }, en: ok }, {}, bound), [
    'help: resources/i18n/context-help.de.json: state.unit.help fehlt',
  ]);
});

test('Struktur: viewmodel/state.js und viewmodel/state.types.js sind erlaubt', () => {
  const paths = ['module.js', 'domain/model.js', 'viewmodel/viewmodel.js', 'viewmodel/state.js', 'viewmodel/state.types.js', 'resources/view.html'];
  assert.deepEqual(checkStructure('neu', paths), []);
});

const HELP_FULL = JSON.stringify({
  fields: { title: { help: 'T' }, alpha: { help: 'A' }, columns: { help: 'C' }, mode2: { help: 'M' } },
  actions: {
    moveItem: { help: 'Verschieben', params: { from: 'von', idx: 'Index', to: 'nach' } },
    rename: { help: 'Umbenennen', params: { title: 'Titel' } },
    move2: { help: 'Zwei' },
  },
});

/** Ein vollständig umgestelltes Fixture-Modul `neu`. */
function convertedFixture(overrides = {}) {
  return appWith({
    'examples/index.json': JSON.stringify({ examples: [{ id: 'pizza' }] }),
    'js/modules/worksheet/worksheet.js': '',
    'js/modules/neu/module.js': DESCRIPTOR,
    'js/modules/neu/domain/model.js': GOOD_MODEL,
    'js/modules/neu/domain/commands/move.js': 'export function moveRun() { return true; }\n',
    'js/modules/neu/viewmodel/viewmodel.js': "import { pick } from '@/ui/column-picker.js';\nexport default { show() { return this.model.title; } };\n".replaceAll('@/', ['..', '..', '..', ''].join('/')),
    'js/modules/neu/tile/tile.js': 'export default {};\n',
    'js/modules/neu/resources/view.html': '<template data-tpl="neu"><input x-model="model.title"><input x-field="model.alpha"></template>',
    'js/modules/neu/resources/i18n/context-help.de.json': HELP_FULL,
    'js/modules/neu/resources/i18n/context-help.en.json': HELP_FULL,
    ...overrides,
  });
}

test('checkConvertedModule: vollständiges Fixture-Modul ist grün', async () => {
  assert.deepEqual(await checkConvertedModule(convertedFixture(), 'neu'), []);
});

test('checkConvertedModule: Befunde mehrerer Gates gesammelt', async () => {
  const root = convertedFixture({
    'js/modules/neu/viewmodel/viewmodel.js': 'export default { set() { this.model.title = 1; } };\n',
    'js/modules/neu/domain/extra.js': 'export const d = () => document;\n',
    'js/modules/neu/resources/view.html': '<input x-field="model.title">',
    'js/modules/neu/resources/i18n/context-help.en.json': '{}',
  });
  const findings = await checkConvertedModule(root, 'neu');
  for (const prefix of ['layer:', 'template:', 'write:', 'help:']) {
    assert.ok(findings.some((f) => f.startsWith(prefix)), `${prefix} fehlt in:\n${findings.join('\n')}`);
  }
  assert.ok(!findings.some((f) => f.startsWith('uses:')), 'uses: worksheet ist erklärt');
});

const UI_FULL = JSON.stringify({ title: 'T', actions: { add: { label: 'A' } } });

test('ui: gleiche Schlüssel in de und en sind grün, ohne ui-Dateien auch', async () => {
  const ok = convertedFixture({ 'js/modules/neu/resources/i18n/ui.de.json': UI_FULL, 'js/modules/neu/resources/i18n/ui.en.json': UI_FULL });
  assert.deepEqual(await checkConvertedModule(ok, 'neu'), []);
});

test('ui: fehlender Schlüssel in jeder Richtung und fehlende Datei', async () => {
  const less = JSON.stringify({ title: 'T' });
  const en = convertedFixture({ 'js/modules/neu/resources/i18n/ui.de.json': UI_FULL, 'js/modules/neu/resources/i18n/ui.en.json': less });
  assert.deepEqual((await checkConvertedModule(en, 'neu')).filter((f) => f.startsWith('ui:')), ['ui: resources/i18n/ui.en.json: Schlüssel fehlt: actions.add.label']);
  const de = convertedFixture({ 'js/modules/neu/resources/i18n/ui.de.json': less, 'js/modules/neu/resources/i18n/ui.en.json': UI_FULL });
  assert.deepEqual((await checkConvertedModule(de, 'neu')).filter((f) => f.startsWith('ui:')), ['ui: resources/i18n/ui.de.json: Schlüssel fehlt: actions.add.label']);
  const gone = convertedFixture({ 'js/modules/neu/resources/i18n/ui.de.json': UI_FULL });
  assert.deepEqual((await checkConvertedModule(gone, 'neu')).filter((f) => f.startsWith('ui:')), ['ui: resources/i18n/ui.en.json fehlt']);
});

test('checkConvertedModule: ohne domain/model.js kein Absturz, nur Strukturbefund', async () => {
  const root = appWith({ 'js/modules/neu/module.js': DESCRIPTOR });
  const findings = await checkConvertedModule(root, 'neu', { moduleIds: ['neu', 'worksheet'], exampleIds: ['pizza'] });
  assert.ok(findings.includes('structure: domain/model.js: fehlt'));
});

test('checkConvertedModule: nicht ladbares oder schemaloses model.js wird gemeldet', async () => {
  for (const body of ["import './fehlt.js';\nexport const x = 1;\n", 'export const x = 1;\n']) {
    const root = convertedFixture({ 'js/modules/neu/domain/model.js': body });
    const findings = await checkConvertedModule(root, 'neu');
    assert.ok(findings.some((f) => f.startsWith('schema: domain/model.js: lässt sich nicht laden (')), findings.join('\n'));
  }
});

for (const id of CONVERTED_MODULES) {
  test(`umgestelltes Modul ${id} besteht alle Gates`, async () => {
    assert.deepEqual(await checkConvertedModule(APP_DIR, id), []);
  });
}

const MIGRATING = (extra = '') => `import { defineModel, text, list } from '${MODEL_URL}';
import { from0, other } from './migrations.js';
export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: { items: list(text()) },${extra}
});
`;

test('Schema-Literal: version und migrations mit Import aus ./migrations.js sind grün', () => {
  assert.deepEqual(checkSchemaLiteral(MIGRATING()), []);
});

test('Schema-Literal: Migrationsimport außerhalb von migrations', () => {
  assert.deepEqual(checkSchemaLiteral(MIGRATING("\n  view: { x: other },")), [
    'schema: domain/model.js: Bezeichner other aus ./migrations.js nur als Wert unter migrations erlaubt',
  ]);
});

test('Schema-Literal: falscher Schlüssel, falscher Wert, falsche version', () => {
  const text = `import { defineModel, text } from '${MODEL_URL}';
import { from0 } from './migrations.js';
const LOCAL = 1;
export const State = defineModel({
  version: 1,
  migrations: { '0-1.0': from0, '0.5→1.0': LOCAL, '0.1→1.0': (j) => j },
  fields: { t: text() },
});
`;
  assert.deepEqual(checkSchemaLiteral(text), [
    'schema: domain/model.js: version muss ein String-Literal MAJOR.MINOR sein (1)',
    "schema: domain/model.js: migrations: Schlüssel '0-1.0' hat nicht die Form 'a→b'",
    'schema: domain/model.js: migrations: Wert LOCAL ist kein Import aus ./migrations.js',
    'schema: domain/model.js: migrations: Wert (j) => j ist kein Import aus ./migrations.js',
  ]);
});

test('Schema-Literal: migrations als Konstante oder Aufruf, Kurzschreibweise, Methode', () => {
  const head = `import { defineModel, text } from '${MODEL_URL}';
import { from0 } from './migrations.js';
const STEPS = { '0→1.0': from0 };
const version = '1.0';
const migrations = STEPS;
const make = () => STEPS;
`;
  const P = 'schema: domain/model.js:';
  assert.deepEqual(checkSchemaLiteral(`${head}export const State = defineModel({ version: '1.0', migrations: STEPS, fields: { t: text() } });\n`),
    [`${P} migrations muss ein Objekt-Literal { 'a→b': <Import aus ./migrations.js> } sein (STEPS)`]);
  assert.deepEqual(checkSchemaLiteral(`${head}export const State = defineModel({ version: '1.0', migrations: make(), fields: { t: text() } });\n`),
    [`${P} migrations muss ein Objekt-Literal { 'a→b': <Import aus ./migrations.js> } sein (make())`]);
  assert.deepEqual(checkSchemaLiteral(`${head}export const State = defineModel({ version, migrations, fields: { t: text() } });\n`), [
    `${P} version muss ein String-Literal MAJOR.MINOR sein (version)`,
    `${P} migrations muss ein Objekt-Literal { 'a→b': <Import aus ./migrations.js> } sein (migrations)`,
  ]);
  assert.deepEqual(checkSchemaLiteral(`${head}export const State = defineModel({ version() { return '1.0'; }, migrations() { return STEPS; }, fields: { t: text() } });\n`), [
    `${P} version muss ein String-Literal MAJOR.MINOR sein (version() { return '1.0'; })`,
    `${P} migrations muss ein Objekt-Literal { 'a→b': <Import aus ./migrations.js> } sein (migrations() { return STEPS; })`,
  ]);
});

test('Schema-Literal: Aufruf als Konstante zählt nicht (itemText)', () => {
  const text = `import { defineModel, text, command } from '${MODEL_URL}';
const itemText = text({ trim: true });
export const State = defineModel({
  fields: { t: text() },
  commands: { add: command({ params: { t: itemText }, run({ t }) { this.t = t; } }) },
});
`;
  assert.deepEqual(checkSchemaLiteral(text), ['schema: domain/model.js: Bezeichner itemText ist keine Konstante dieser Datei']);
});

test('Schema-Literal: Konstante mit Funktions- oder Klasseninitialisierer ist keine Konstante', () => {
  const src = `${MODEL_IMPORT}const f = (v) => v;
const g = function (v) { return v; };
const K = class {};
export const State = defineModel({
  fields: { a: number({ validate: f }), b: number({ validate: g }), c: number({ validate: K }) },
});
`.replaceAll('@/', ['..', '..', '..', ''].join('/'));
  assert.deepEqual(checkSchemaLiteral(src), [
    `${P} Bezeichner f ist keine Konstante dieser Datei`,
    `${P} Bezeichner g ist keine Konstante dieser Datei`,
    `${P} Bezeichner K ist keine Konstante dieser Datei`,
  ]);
});

const VM_WITH_COMMANDS = `import { createModule } from '@/core/template-module.js';
import { command, text } from '@/core/model.js';
export default createModule({
  id: 'neu',
  commands: {
    openDialog: command({ params: { title: text(), 'mode': text() }, run() { return true; } }),
    close: command({ run() { return true; } }),
    dyn: makeCommand(),
  },
});
`.replaceAll('@/', ['..', '..', '..', ''].join('/'));

test('readViewmodelCommands: Kommandos und Parameter aus dem Literal, Unerkennbares übersprungen', () => {
  assert.deepEqual(readViewmodelCommands(VM_WITH_COMMANDS), { openDialog: { params: { title: true, mode: true } }, close: { params: {} } });
  assert.deepEqual(readViewmodelCommands('export default { show() {} };\n'), {});
  assert.deepEqual(readViewmodelCommands('export default createModule({ commands: shared });\n'), {});
});

test('Hilfe: Viewmodel-Kommandos brauchen Hilfetexte', () => {
  const schema = { fields: {}, commands: {} };
  const vm = readViewmodelCommands(VM_WITH_COMMANDS);
  const ok = { actions: { openDialog: { help: 'O', params: { title: 't', mode: 'm' } }, close: { help: 'C' } } };
  assert.deepEqual(checkContextHelp(schema, { de: ok, en: ok }, vm), []);
  assert.deepEqual(checkContextHelp(schema, { de: { actions: { close: { help: 'C' } } }, en: ok }, vm), [
    'help: resources/i18n/context-help.de.json: actions.openDialog.help fehlt',
    'help: resources/i18n/context-help.de.json: actions.openDialog.params.title fehlt',
    'help: resources/i18n/context-help.de.json: actions.openDialog.params.mode fehlt',
  ]);
});

test('checkConvertedModule: Viewmodel-Kommando ohne Hilfetext wird gemeldet', async () => {
  const vm = "export default { commands: { open: command({ params: { x: text() }, run() {} }) } };\n";
  const root = convertedFixture({ 'js/modules/neu/viewmodel/viewmodel.js': vm });
  const findings = await checkConvertedModule(root, 'neu');
  assert.ok(findings.includes('help: resources/i18n/context-help.de.json: actions.open.help fehlt'), findings.join('\n'));
  assert.ok(findings.includes('help: resources/i18n/context-help.en.json: actions.open.params.x fehlt'), findings.join('\n'));
});

const HELP_DE = { sections: { overview: { title: 'Ü', blocks: [{ type: 'paragraph', content: 'Siehe {{ref:melzer-2019}} und {{ref:x|X}}.' }] }, steps: { title: 'S', blocks: [{ type: 'steps', items: ['a'] }] } } };
const HELP_EN = { sections: { overview: { title: 'O', blocks: [{ type: 'paragraph', content: 'See {{ref:melzer-2019}}.' }] }, steps: { title: 'S', blocks: [{ type: 'steps', items: ['a'] }] } } };
const REFS_OK = { references: [{ book: 'melzer-2019' }, { id: 'x', type: 'webpage', title: 'X', author: [{ literal: 'X' }] }] };
const J = (v) => JSON.stringify(v);

test('checkReferenceFile: ohne Datei leer; Ids aus Büchern und CSL', () => {
  assert.deepEqual(checkReferenceFile(join(appWith({ 'js/modules/neu/module.js': '' }), 'js', 'modules', 'neu')), { findings: [], ids: new Set() });
  const base = join(appWith({ 'js/modules/neu/resources/data/references.json': J(REFS_OK) }), 'js', 'modules', 'neu');
  const { findings, ids } = checkReferenceFile(base);
  assert.deepEqual(findings, []);
  assert.deepEqual([...ids].sort(), ['melzer-2019', 'x']);
});

test('checkReferenceFile: unbekanntes Buch und doppelte Id', () => {
  const refs = { references: [{ book: 'nope' }, { book: 'melzer-2019' }, { id: 'melzer-2019', type: 'book', title: 'T', author: [{ family: 'M' }] }] };
  const base = join(appWith({ 'js/modules/neu/resources/data/references.json': J(refs) }), 'js', 'modules', 'neu');
  assert.deepEqual(checkReferenceFile(base).findings, [
    'references: resources/data/references.json: unbekanntes Buch: nope (bekannt: aiag-msa-4, bosch-heft-10, melzer-2019, montgomery-sqc-6)',
    'references: resources/data/references.json: Id doppelt: melzer-2019',
  ]);
});

test('checkReferenceFile: Buch-Id aus der Prototypenkette ist unbekannt, id-lose Einträge sind keine Dubletten', () => {
  const refs = { references: [{ book: 'constructor' }, { type: 'webpage' }, { type: 'webpage' }] };
  const base = join(appWith({ 'js/modules/neu/resources/data/references.json': J(refs) }), 'js', 'modules', 'neu');
  assert.deepEqual(checkReferenceFile(base).findings, [
    'references: resources/data/references.json: unbekanntes Buch: constructor (bekannt: aiag-msa-4, bosch-heft-10, melzer-2019, montgomery-sqc-6)',
  ]);
});

test('checkHelpFiles: gleiche Abschnitte und bekannte Referenzen sind grün, ohne Dateien auch', () => {
  const ids = new Set(['melzer-2019', 'x']);
  assert.deepEqual(checkHelpFiles(join(appWith({ 'js/modules/neu/module.js': '' }), 'js', 'modules', 'neu'), ids), []);
  const base = join(appWith({ 'js/modules/neu/resources/i18n/help.de.json': J(HELP_DE), 'js/modules/neu/resources/i18n/help.en.json': J(HELP_EN) }), 'js', 'modules', 'neu');
  assert.deepEqual(checkHelpFiles(base, ids), []);
});

test('checkHelpFiles: fehlende Sprache, abweichende Abschnitte, unbekannte Referenz', () => {
  const one = join(appWith({ 'js/modules/neu/resources/i18n/help.de.json': J(HELP_DE) }), 'js', 'modules', 'neu');
  assert.deepEqual(checkHelpFiles(one, new Set(['melzer-2019', 'x'])), ['help: resources/i18n/help.en.json fehlt']);
  const swapped = { sections: { steps: HELP_EN.sections.steps, overview: HELP_EN.sections.overview } };
  const base = join(appWith({ 'js/modules/neu/resources/i18n/help.de.json': J(HELP_DE), 'js/modules/neu/resources/i18n/help.en.json': J(swapped) }), 'js', 'modules', 'neu');
  assert.deepEqual(checkHelpFiles(base, new Set(['melzer-2019'])), [
    'help: resources/i18n/help.en.json: Abschnitte weichen von help.de.json ab (de: overview, steps; en: steps, overview)',
    'help: resources/i18n/help.de.json: {{ref:x}} fehlt in resources/data/references.json',
  ]);
});

test('checkConvertedModule ruft die Hilfe- und Referenz-Gates auf', async () => {
  const root = convertedFixture({
    'js/modules/neu/resources/i18n/help.de.json': J(HELP_DE),
    'js/modules/neu/resources/i18n/help.en.json': J(HELP_EN),
    'js/modules/neu/resources/data/references.json': J({ references: [{ book: 'nope' }] }),
  });
  const findings = await checkConvertedModule(root, 'neu');
  assert.ok(findings.some((f) => f.startsWith('references: resources/data/references.json: unbekanntes Buch: nope')), findings.join('\n'));
  assert.ok(findings.some((f) => f === 'help: resources/i18n/help.de.json: {{ref:melzer-2019}} fehlt in resources/data/references.json'), findings.join('\n'));
});

test('checkDescriptor: exampleRefs auf ein eigenes Beispiel wird gemeldet', () => {
  const text = `/** @type {import('../../core/module-descriptor.js').ModuleDescriptor} */\nexport default { id: 'neu', version: '1.0.0', icon: 'module.neu', exampleRefs: ['eigen', 'fremd'], load: () => import('./viewmodel/viewmodel.js') };\n`;
  const out = checkDescriptor('neu', text, {
    moduleIds: ['neu'], exampleIds: ['eigen', 'fremd'], paths: ['viewmodel/viewmodel.js'],
    exampleOwners: new Map([['eigen', 'neu'], ['fremd', 'histogram']]),
  });
  assert.deepEqual(out, ['descriptor: module.js: exampleRefs: eigen gehört diesem Modul selbst — exampleRefs nennt nur Beispiele anderer Module']);
});

test('readExampleIds: Index ohne Szenarien plus Beispiele umgestellter Module', () => {
  const root = appWith({
    'examples/index.json': JSON.stringify({ examples: [{ id: 'a', type: 'project', modules: ['x'] }, { id: 's', type: 'scenario' }] }),
  });
  assert.deepEqual(readExampleIds(root), ['a']);
});

test('Schema-Literal: current und confirm sind wie run als Methode erlaubt, als Pfeil nicht', () => {
  const ok = `${MODEL_IMPORT}export const State = defineModel({
  fields: { t: text() },
  commands: {
    go: command({ params: {}, current() { return {}; }, confirm() { return null; }, run() {} }),
  },
});
`.replaceAll('@/', ['..', '..', '..', ''].join('/'));
  assert.deepEqual(checkSchemaLiteral(ok), []);
  const bad = ok.replace('current() { return {}; }', 'current: () => ({})');
  assert.deepEqual(checkSchemaLiteral(bad), [`${P} current von go ist eine Pfeilfunktion — this muss das reaktive Model sein`]);
});

const CMD_SCHEMA = defineModel({
  fields: { columns: record(['a', 'b'], list(text())) },
  commands: {
    addItem: command({ params: { col: oneOf(['a', 'b']), text: text() }, run() {} }),
    removeItem: command({ params: { col: oneOf(['a', 'b']), idx: index('columns[col]') }, run() {} }),
  },
}).schema;
const FORM_SCHEMAS = { NoteForm: { fields: { text: text(), note: text() } } };

test('readCommandForms: Formulare mit Kommando, data-form und x-param', () => {
  const files = [{ path: 'resources/view.html', text: '<form class="x" x-command-form="addItem" :data-arg-col="c"><input x-param="text"></form><form><input x-param="nope"></form><form x-command-form="addItem" data-form="NoteForm"><textarea x-param="note"></textarea></form>' }];
  assert.deepEqual(readCommandForms(files), [
    { path: 'resources/view.html', command: 'addItem', form: null, params: ['text'] },
    { path: 'resources/view.html', command: 'addItem', form: 'NoteForm', params: ['note'] },
  ]);
});

test('Kommando-Bezüge: Kommandos, data-form, x-param', () => {
  const files = [{ path: 'resources/view.html', text: [
    '<button x-command="removeItem"></button><button x-command="ghost"></button>',
    '<form x-command-form="addItem"><input x-param="text"><input x-param="col2"></form>',
    '<form x-command-form="addItem" data-form="NoteForm"><input x-param="note"><input x-param="zzz"></form>',
    '<form x-command-form="nope"></form><form x-command-form="addItem" data-form="Gone"></form>',
    '<button x-dialog="f" data-dialog-command="addItem" data-dialog-delete="drop"></button>',
  ].join('') }];
  assert.deepEqual(checkCommandRefs(files, CMD_SCHEMA, FORM_SCHEMAS), [
    'command: resources/view.html: x-command="ghost": kein Kommando des Models',
    'command: resources/view.html: x-command-form="nope": kein Kommando des Models',
    'command: resources/view.html: data-dialog-delete="drop": kein Kommando des Models',
    'command: resources/view.html: data-form="Gone": kein Export aus viewmodel/forms.js',
    'command: resources/view.html: x-param="col2": kein Parameter von addItem',
    'command: resources/view.html: x-param="zzz": kein Feld von NoteForm',
  ]);
});

test('Formularhilfe: nur Felder, die kein Parameter des Kommandos sind', () => {
  const forms = readCommandForms([{ path: 'resources/view.html', text: '<form x-command-form="addItem" data-form="NoteForm"><input x-param="text"><input x-param="note"></form><form x-command-form="addItem"><input x-param="text"></form>' }]);
  assert.deepEqual(formHelpKeys(forms, CMD_SCHEMA, FORM_SCHEMAS), ['forms.NoteForm.note.help']);
  const help = { fields: { columns: { help: 'C' } }, actions: { addItem: { help: 'A', params: { col: 'c', text: 't' } }, removeItem: { help: 'R', params: { col: 'c', idx: 'i' } } } };
  assert.deepEqual(checkContextHelp(CMD_SCHEMA, { de: help, en: help }, {}, [], ['forms.NoteForm.note.help']), [
    'help: resources/i18n/context-help.de.json: forms.NoteForm.note.help fehlt',
    'help: resources/i18n/context-help.en.json: forms.NoteForm.note.help fehlt',
  ]);
});

test('confirm-Schlüssel: Literale aus confirm müssen in ui.de/en stehen', () => {
  const src = `${MODEL_IMPORT}export const State = defineModel({
  fields: { t: text() },
  commands: {
    a: command({ params: {}, confirm() { return this.t ? { key: 'confirm.a', params: { n: 1 } } : null; }, run() {} }),
    b: command({ params: {}, confirm: function () { return { key: 'confirm.b' }; }, run() { return { key: 'nicht.gezaehlt' }; } }),
  },
});
`;
  assert.deepEqual(readConfirmKeys(src), ['confirm.a', 'confirm.b']);
  assert.deepEqual(checkConfirmKeys(['confirm.a', 'confirm.b'], { de: { confirm: { a: 'A', b: 'B' } }, en: { confirm: { a: 'A' } } }), [
    'command: domain/model.js: confirm-Schlüssel confirm.b fehlt in resources/i18n/ui.en.json',
  ]);
  assert.deepEqual(checkConfirmKeys(['confirm.a'], { de: null, en: { confirm: { a: 'A' } } }), [
    'command: domain/model.js: confirm-Schlüssel confirm.a fehlt in resources/i18n/ui.de.json',
  ]);
});

test('Struktur: viewmodel/forms.js und viewmodel/forms.types.js sind erlaubt', () => {
  const paths = ['module.js', 'domain/model.js', 'viewmodel/viewmodel.js', 'viewmodel/forms.js', 'viewmodel/forms.types.js', 'resources/view.html'];
  assert.deepEqual(checkStructure('neu', paths), []);
});

const FORMS_FIXTURE = `import { defineForm, text } from '${MODEL_URL}';
export const MoveForm = defineForm({ fields: { to: text(), note: text() } });
`;

test('checkConvertedModule: Kommando-Formular mit data-form verlangt Formularhilfe', async () => {
  const view = '<form x-command-form="moveItem" data-form="MoveForm" data-arg-from="a" data-arg-idx="0"><input x-param="to"><input x-param="note"></form>';
  const base = { 'js/modules/neu/viewmodel/forms.js': FORMS_FIXTURE, 'js/modules/neu/resources/view.html': view };
  assert.deepEqual(await checkConvertedModule(convertedFixture(base), 'neu'), [
    'help: resources/i18n/context-help.de.json: forms.MoveForm.note.help fehlt',
    'help: resources/i18n/context-help.en.json: forms.MoveForm.note.help fehlt',
  ]);
  const help = JSON.stringify({ ...JSON.parse(HELP_FULL), forms: { MoveForm: { note: { help: 'Notiz' } } } });
  const ok = convertedFixture({
    ...base,
    'js/modules/neu/resources/i18n/context-help.de.json': help,
    'js/modules/neu/resources/i18n/context-help.en.json': help,
  });
  assert.deepEqual(await checkConvertedModule(ok, 'neu'), []);
});

test('Struktur: tile/settings.js und tile/settings.types.js sind erlaubt', () => {
  assert.deepEqual(checkStructure('neu', [...GOOD_PATHS, 'tile/settings.js', 'tile/settings.types.js']), []);
});

const SETTINGS_IMPORT = "import { defineSettings, number, oneOf } from '@/core/model.js';\n";
const SP = 'schema: tile/settings.js:';

test('Settings-Literal: rein ist ohne Befund, Funktion und fremder Aufruf sind Befunde', () => {
  const opts = { define: 'defineSettings', file: 'tile/settings.js' };
  assert.deepEqual(checkSchemaLiteral(`${SETTINGS_IMPORT}export const Settings = defineSettings({ topN: number({ integer: true, min: 1, max: 10, default: 3 }), view: oneOf(['a', 'b']) });\n`, opts), []);
  assert.deepEqual(checkSchemaLiteral(`${SETTINGS_IMPORT}export const Settings = defineSettings({ topN: number({ min: 1, max: Math.max(1, 2) }) });\n`, opts), [
    `${SP} Aufruf Math.max(1, 2) ist kein Konstruktor aus core/model.js`,
  ]);
  assert.deepEqual(checkSchemaLiteral('export const x = 1;\n', opts), [
    `${SP} genau ein Aufruf defineSettings({ … }) aus core/model.js erwartet, gefunden 0`,
  ]);
});

test('Kachel-Hilfe: help je Setting, Beschriftung im Modul oder global, Optionstexte', () => {
  const fields = { topN: { kind: 'number' }, view: { kind: 'oneOf', values: ['bar', 'list'] } };
  const help = { tile: { settings: { topN: { help: 'h' }, view: { help: 'h' } } } };
  const ui = { tile: { settings: { view: { label: 'Ansicht', options: { bar: 'Balken', list: 'Liste' } } } } };
  const global = { dashboard: { tileSettings: { topN: 'Anzahl' } } };
  assert.deepEqual(checkTileSettings(fields, { help: { de: help, en: help }, ui: { de: ui, en: ui }, global: { de: global, en: global } }), []);
  assert.deepEqual(checkTileSettings(fields, { help: { de: {}, en: help }, ui: { de: {}, en: ui }, global: { de: {}, en: global } }), [
    'help: resources/i18n/context-help.de.json: tile.settings.topN.help fehlt',
    'help: tile.settings.topN: Beschriftung fehlt (de) — tile.settings.topN.label in resources/i18n/ui.de.json oder dashboard.tileSettings.topN in i18n/de.json',
    'help: resources/i18n/context-help.de.json: tile.settings.view.help fehlt',
    'help: tile.settings.view: Beschriftung fehlt (de) — tile.settings.view.label in resources/i18n/ui.de.json oder dashboard.tileSettings.view in i18n/de.json',
    'help: resources/i18n/ui.de.json: tile.settings.view.options.bar fehlt',
    'help: resources/i18n/ui.de.json: tile.settings.view.options.list fehlt',
  ]);
});
