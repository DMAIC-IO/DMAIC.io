/**
 * Gates der umgestellten Module (tools/build/module-gates.mjs).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { listModuleFiles, checkStructure, checkDescriptor, parseDescriptor, checkUses, checkLayers, checkSchemaLiteral, checkTileSettings, checkSchemaPaths, checkTemplateBindings, checkWritePath, checkViewReads, checkCommandsRef, checkPickerCss, checkChartBindings, checkContextHelp, readStateBindings, readViewmodelCommands, checkConvertedModule, readExampleIds, checkReferenceFile, checkHelpFiles, readCommandForms, checkCommandRefs, checkFileDropRefs, formHelpKeys, readConfirmKeys, checkConfirmKeys, checkListBindings, checkDefaultArgRefs, checkChoiceGroups, checkInvariantTexts, viewNamesOf, viewNamesDetailOf, computedNamesOf, checkWidgetTemplates, modelMembersOf, checkFieldErrorPaths } from './module-gates.mjs';
import { viewMemberNamesOf } from './view-names.mjs';
import { CONVERTED_MODULES } from './converted-modules.mjs';
import { APP_DIR } from './build.mjs';
import { defineModel, command, text, number, oneOf, index, idOf, list, record, map, object, boolean, date, columnRef, defineWidget, datasets } from '../../js/core/model.js';

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
    { path: 'io/handoff.js', text: "import { worksheetWrite } from '@/core/worksheet-write.js';\n" },
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
    { path: 'domain/b.js', text: "export const f = () => document.body;\nexport function g() { return context.i18n; }\nexport const ok = { document: 1 }.document;\n" },
    { path: 'domain/deep/c.js', text: "const m = await import('../../interaction/reorder.js');\n" },
    { path: 'io/export.js', text: "import Alpine from 'alpinejs';\nexport const x = () => Alpine.store('a');\nexport const y = () => document.title;\n" },
    { path: 'io/free.js', text: "export const x = () => Alpine.store('a');\n" },
    { path: 'viewmodel/viewmodel.js', text: "import Alpine from '@alpinejs/csp';\n" },
  ];
  assert.deepEqual(checkLayers(fx(files)), ex([
    'layer: domain/a.js: Import @alpinejs/csp in domain/ verboten (Alpine)',
    'layer: domain/a.js: Import @/core/dom.js in domain/ verboten (DOM-Helfer)',
    'layer: domain/a.js: Import @/ui/column-picker.js in domain/ verboten (UI)',
    'layer: domain/a.js: Import ../viewmodel/viewmodel.js in domain/ verboten (höhere Schicht)',
    'layer: domain/b.js: document in domain/ verboten',
    'layer: domain/b.js: context in domain/ verboten',
    'layer: domain/deep/c.js: Import ../../interaction/reorder.js in domain/ verboten (höhere Schicht)',
    'layer: io/export.js: Import alpinejs in io/ verboten (Alpine)',
    'layer: io/free.js: Alpine in io/ verboten',
  ]));
});

test('Layer: this.context im Model ist der Modellkontext (schlichte Werte) und erlaubt', () => {
  const files = [
    { path: 'domain/model.js', text: "export const m = { run() { return this.context.cycle; } };\n" },
  ];
  assert.deepEqual(checkLayers(fx(files)), []);
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

test('Layer: lokal deklarierte Namen sind keine Globals, weitere Globals in domain gesperrt', () => {
  const files = [
    { path: 'domain/local.js', text: [
      "import { context } from './ctx.js';",
      'export function a(window) { return window.x; }',
      'export function b() { const document = {}; return document.title; }',
      'export function c() { if (true) { let window = 1; } return window; }',
      'export const d = ({ Alpine }) => Alpine;',
      'export function e() { return context; }',
    ].join('\n') },
    { path: 'domain/globals.js', text: [
      'export const g = () => globalThis.document;',
      'export const n = () => navigator.language;',
      'export const s = () => [localStorage, sessionStorage, indexedDB];',
      'export const h = (x) => x instanceof HTMLElement;',
      "export const f = () => fetch('/x');",
    ].join('\n') },
    { path: 'io/local.js', text: 'export function x(Alpine) { return Alpine; }\n' },
  ];
  assert.deepEqual(checkLayers(fx(files)), [
    'layer: domain/globals.js: globalThis in domain/ verboten',
    'layer: domain/globals.js: navigator in domain/ verboten',
    'layer: domain/globals.js: localStorage in domain/ verboten',
    'layer: domain/globals.js: sessionStorage in domain/ verboten',
    'layer: domain/globals.js: indexedDB in domain/ verboten',
    'layer: domain/globals.js: HTMLElement in domain/ verboten',
    'layer: domain/globals.js: fetch in domain/ verboten',
  ]);
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

test('Schema-Literal: async run (Methode, Funktionsausdruck, Pfeil) wird gemeldet', () => {
  const src = `${MODEL_IMPORT}export const State = defineModel({
  fields: { n: number() },
  commands: {
    a: command({ params: {}, async run() {} }),
    b: command({ params: {}, run: async function () {} }),
    c: command({ params: {}, run: async () => {} }),
    d: command({ params: {}, run() {} }),
  },
});
`.replaceAll('@/', ['..', '..', '..', ''].join('/'));
  assert.deepEqual(checkSchemaLiteral(src), [
    `${P} command a: async run — use asyncTask`,
    `${P} command b: async run — use asyncTask`,
    `${P} command c: async run — use asyncTask`,
  ]);
});

test('readViewmodelCommands: async run wird vermerkt', () => {
  const vm = 'export default createModule({ commands: { a: command({ params: {}, async run() {} }), b: command({ run: async () => {} }), c: command({ run() {} }) } });\n';
  assert.deepEqual(readViewmodelCommands(vm), { a: { params: {}, asyncRun: true }, b: { params: {}, asyncRun: true }, c: { params: {} } });
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

test('Schema-Pfade: map liefert dieselben Pfade wie record', () => {
  const viaRecord = defineModel({ fields: { r: record(['a'], object({ a: idOf('xs') })) } });
  const viaMap = defineModel({ fields: { r: map(text(), object({ a: idOf('xs') })) } });
  assert.deepEqual(checkSchemaPaths(viaMap.schema), checkSchemaPaths(viaRecord.schema));
  assert.equal(checkSchemaPaths(viaMap.schema).length, 1);
  const withKey = defineModel({ fields: { m: map(idOf('nope'), text()) } });
  assert.equal(checkSchemaPaths(withKey.schema).length, 1);
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

test('Template ↔ Schema: einfache Anführungszeichen werden ebenso geprüft', () => {
  const files = [{ path: 'resources/view.html', text: "<input x-model='model.nope'><input x-field='model.title'><span x-text='model.ghost'></span><input x-field='model.alpha'>" }];
  assert.deepEqual(checkTemplateBindings(files, SCHEMA_FOR_VIEW), [
    'template: resources/view.html: x-model="model.nope": nope ist weder Feld noch Ansichtsfeld',
    'template: resources/view.html: x-field="model.title": title (text) hat keine Regeln — x-model verwenden',
    'template: resources/view.html: x-text="model.ghost": ghost ist weder Feld noch Ansichtsfeld',
  ]);
});

test('modelMembersOf: Getter und Methoden der Klasse über defineModel', () => {
  const text = [
    "import { defineModel, text } from '@/core/model.js';",
    'export class State extends defineModel({ fields: { title: text() } }) {',
    '  get label() { return this.title; }',
    '  shout() { return this.title.toUpperCase(); }',
    '  static make() { return new State(); }',
    '}',
    'class Other { get nope() { return 1; } }',
  ].join('\n');
  assert.deepEqual([...modelMembersOf(text)].sort(), ['label', 'shout']);
});

test('Template ↔ Schema: Getter der Model-Klasse sind lesbar, nicht bindbar', () => {
  const files = [{ path: 'resources/view.html', text: '<span x-text="model.label"></span><input x-model="model.label"><div x-field="model.shout"></div>' }];
  assert.deepEqual(checkTemplateBindings(files, SCHEMA_FOR_VIEW, new Map(), new Set(['label', 'shout'])), [
    'template: resources/view.html: x-model="model.label": label ist ein Getter oder eine Methode der Model-Klasse — nur lesbar',
    'template: resources/view.html: x-field="model.shout": shout ist ein Getter oder eine Methode der Model-Klasse — nur lesbar',
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

test('Schreibweg: tile/ zählt, Aliase auf this.model und mutierende Aufrufe sind Schreibzugriffe', () => {
  const H = '— über ein Kommando, instance.set oder x-model/x-field schreiben';
  const files = [
    { path: 'tile/tile.js', text: 'function a() { this.model.title = "x"; }\n' },
    { path: 'viewmodel/alias.js', text: [
      'function b() { const m = this.model; m.title = 1; m.count++; Object.assign(m, {}); m = null; }',
      'function c() { const { list } = this.model; list.push(1); list.x = 2; }',
      'function d() { const items = this.model.items; items.sort(); items[0] = 1; }',
      'function e() { this.model.list.splice(0, 1); Object.assign(this.model, { a: 1 }); Object.assign(this.model.cfg, {}); }',
      'function f() { const m = []; m.push(1); const n = this.model.items.slice(); n.push(1); Object.assign({}, this.model); }',
      'function g() { const m = this.model; { const m = []; m.push(1); } }',
    ].join('\n') },
    { path: 'domain/model.js', text: 'function h() { this.model.list.push(1); }\n' },
  ];
  assert.deepEqual(checkWritePath(files), [
    `write: tile/tile.js: this.model.title = … ${H}`,
    `write: viewmodel/alias.js: m.title = … ${H}`,
    `write: viewmodel/alias.js: m.count++ ${H}`,
    `write: viewmodel/alias.js: Object.assign(m, …) ${H}`,
    `write: viewmodel/alias.js: list.push(…) ${H}`,
    `write: viewmodel/alias.js: list.x = … ${H}`,
    `write: viewmodel/alias.js: items.sort(…) ${H}`,
    `write: viewmodel/alias.js: items[0] = … ${H}`,
    `write: viewmodel/alias.js: this.model.list.splice(…) ${H}`,
    `write: viewmodel/alias.js: Object.assign(this.model, …) ${H}`,
    `write: viewmodel/alias.js: Object.assign(this.model.cfg, …) ${H}`,
  ]);
});

test('Schreibweg: Listenelemente über find/at, for…of und Callback-Parameter sind Model-Ziele', () => {
  const H = '— über ein Kommando, instance.set oder x-model/x-field schreiben';
  const files = [
    { path: 'viewmodel/items.js', text: [
      'function a(v) { this.model.factors.find((f) => f.id === v).name = v; this.model.items.at(-1).tags.push(v); }',
      'function b(v) { const f = this.model.factors.find((x) => x.id === v); f.unit = v; f.n++; Object.assign(f, {}); f = null; }',
      'function c() { for (const it of this.model.items) { it.done = true; delete it.tmp; } for (let it of this.model.items) it = null; }',
      'function d() { this.model.items.forEach((i) => { i.done = true; }); this.model.items.map(function (i, k) { i.k = k; k = 0; }); }',
      'function e() { const m = this.model; m.items.findLast((i) => i.ok).ok = false; m.items.some(({ sub }) => sub.push(1)); }',
      'function f() { return this.model.items.map((i) => i.x).filter((x) => x); }',
      'function g() { for (const it of this.model.items.slice()) it.copy = 1; for (const it of [1, 2]) it.x = 1; [1].forEach((i) => { i.x = 1; }); }',
      'function h() { this.model.items.forEach((i) => { const j = {}; j.x = i.x; }); }',
    ].join('\n') },
  ];
  assert.deepEqual(checkWritePath(files), [
    `write: viewmodel/items.js: this.model.factors.find((f) => f.id === v).name = … ${H}`,
    `write: viewmodel/items.js: this.model.items.at(-1).tags.push(…) ${H}`,
    `write: viewmodel/items.js: f.unit = … ${H}`,
    `write: viewmodel/items.js: f.n++ ${H}`,
    `write: viewmodel/items.js: Object.assign(f, …) ${H}`,
    `write: viewmodel/items.js: it.done = … ${H}`,
    `write: viewmodel/items.js: delete it.tmp ${H}`,
    `write: viewmodel/items.js: i.done = … ${H}`,
    `write: viewmodel/items.js: i.k = … ${H}`,
    `write: viewmodel/items.js: m.items.findLast((i) => i.ok).ok = … ${H}`,
    `write: viewmodel/items.js: sub.push(…) ${H}`,
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

test('readViewmodelCommands: commands als Bezeichner, über den relativen Import aufgelöst', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vm-commands-'));
  writeFileSync(join(dir, 'commands.js'), "export const commands = {\n  pick: command({ params: { id: number() }, run() {} }),\n};\n");
  const vmFile = join(dir, 'viewmodel.js');
  const short = "import { commands } from './commands.js';\nexport default createModule({ commands });\n";
  const named = "import { commands as vmc } from './commands.js';\nexport default createModule({ commands: vmc });\n";
  const local = "const vmc = { go: command({ run() {} }) };\nexport default createModule({ commands: vmc });\n";
  assert.deepEqual(readViewmodelCommands(short, vmFile), { pick: { params: { id: true } } });
  assert.deepEqual(readViewmodelCommands(named, vmFile), { pick: { params: { id: true } } });
  assert.deepEqual(readViewmodelCommands(local, vmFile), { go: { params: {} } });
  assert.deepEqual(readViewmodelCommands(short), {});
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

test('checkConvertedModule: Viewmodel-Kommando mit async run wird gemeldet', async () => {
  const vm = "export default { commands: { open: command({ params: {}, async run() {} }) } };\n";
  const root = convertedFixture({ 'js/modules/neu/viewmodel/viewmodel.js': vm });
  const findings = await checkConvertedModule(root, 'neu');
  assert.ok(findings.includes('viewmodel: viewmodel/viewmodel.js: command open: async run — use asyncTask'), findings.join('\n'));
});

const VM_WITH_TASK = 'export default createModule({ asyncTasks: { compute: asyncTask({ async run() {} }) } });\n';
const TASK_VIEW = '<template data-tpl="neu"><input x-model="model.title"><input x-field="model.alpha"><div x-async-task="compute"><button x-async-task-start></button></div></template>';
const helpWithTasks = () => JSON.stringify({ ...JSON.parse(HELP_FULL), asyncTasks: { compute: { help: 'Rechnen', cancel: { help: 'Abbrechen' } } } });

test('checkConvertedModule: asyncTask ohne Hilfetexte wird gemeldet, mit Hilfe grün', async () => {
  const bare = await checkConvertedModule(convertedFixture({
    'js/modules/neu/viewmodel/viewmodel.js': VM_WITH_TASK, 'js/modules/neu/resources/view.html': TASK_VIEW,
  }), 'neu');
  assert.deepEqual(bare, ['de', 'en'].flatMap((lang) => [
    `help: resources/i18n/context-help.${lang}.json: asyncTasks.compute.help fehlt`,
    `help: resources/i18n/context-help.${lang}.json: asyncTasks.compute.cancel.help fehlt`,
  ]));
  const full = await checkConvertedModule(convertedFixture({
    'js/modules/neu/viewmodel/viewmodel.js': VM_WITH_TASK, 'js/modules/neu/resources/view.html': TASK_VIEW,
    'js/modules/neu/resources/i18n/context-help.de.json': helpWithTasks(),
    'js/modules/neu/resources/i18n/context-help.en.json': helpWithTasks(),
  }), 'neu');
  assert.deepEqual(full, []);
});

test('checkConvertedModule: unbekannter Task in der Vorlage und auto mit params', async () => {
  const findings = await checkConvertedModule(convertedFixture({
    'js/modules/neu/viewmodel/viewmodel.js': 'export default createModule({ asyncTasks: { compute: asyncTask({ async run() {} }), preview: asyncTask({ auto: true, params: { n: number() }, async run() {} }) } });\n',
    'js/modules/neu/resources/view.html': TASK_VIEW.replace('"compute"', '"ghost"'),
    'js/modules/neu/resources/i18n/context-help.de.json': helpWithTasks(),
    'js/modules/neu/resources/i18n/context-help.en.json': helpWithTasks(),
  }), 'neu');
  assert.ok(findings.includes('template: resources/view.html: x-async-task="ghost": kein Task aus asyncTasks'), findings.join('\n'));
  assert.ok(findings.includes('asyncTask: viewmodel/viewmodel.js: preview: invalid params with auto: true; allowed: params and blocked only without auto'), findings.join('\n'));
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

test('readCommandForms: Formulare mit Kommando, data-command-form-schema und x-param', () => {
  const files = [{ path: 'resources/view.html', text: '<form class="x" x-command-form="addItem" :data-arg-col="c"><input x-param="text"></form><form><input x-param="nope"></form><form x-command-form="addItem" data-command-form-schema="NoteForm"><textarea x-param="note"></textarea></form>' }];
  assert.deepEqual(readCommandForms(files), [
    { path: 'resources/view.html', command: 'addItem', form: null, params: ['text'] },
    { path: 'resources/view.html', command: 'addItem', form: 'NoteForm', params: ['note'] },
  ]);
});

test('Kommando-Bezüge: Kommandos, data-command-form-schema, x-param', () => {
  const files = [{ path: 'resources/view.html', text: [
    '<button x-command="removeItem"></button><button x-command="ghost"></button>',
    '<form x-command-form="addItem"><input x-param="text"><input x-param="col2"></form>',
    '<form x-command-form="addItem" data-command-form-schema="NoteForm"><input x-param="note"><input x-param="zzz"></form>',
    '<form x-command-form="nope"></form><form x-command-form="addItem" data-command-form-schema="Gone"></form>',
    '<button x-dialog="f" data-dialog-command="addItem" data-dialog-delete="drop"></button>',
  ].join('') }];
  assert.deepEqual(checkCommandRefs(files, CMD_SCHEMA, FORM_SCHEMAS), [
    'command: resources/view.html: x-command="ghost": kein Kommando des Models oder Viewmodels',
    'command: resources/view.html: x-command-form="nope": kein Kommando des Models oder Viewmodels',
    'command: resources/view.html: data-dialog-delete="drop": kein Kommando des Models',
    'command: resources/view.html: data-command-form-schema="Gone": kein Export aus viewmodel/forms.js',
    'command: resources/view.html: x-param="col2": kein Parameter von addItem',
    'command: resources/view.html: x-param="zzz": kein Feld von NoteForm',
  ]);
});

test('Kommando-Bezüge: x-command und x-command-form nennen auch ein Viewmodel-Kommando', () => {
  const files = [{ path: 'resources/view.html', text: [
    '<button x-command="pickChart" :data-arg-type="s.type"></button><button x-command="ghost"></button>',
    '<form x-command-form="pickChart"><input x-param="type"><input x-param="nope"></form>',
    '<button x-dialog="f" data-dialog-command="pickChart"></button>',
  ].join('') }];
  assert.deepEqual(checkCommandRefs(files, CMD_SCHEMA, FORM_SCHEMAS, { pickChart: { params: { type: true } } }), [
    'command: resources/view.html: x-command="ghost": kein Kommando des Models oder Viewmodels',
    'command: resources/view.html: data-dialog-command="pickChart": kein Kommando des Models',
    'command: resources/view.html: x-param="nope": kein Parameter von pickChart',
  ]);
});

test('Formularhilfe: nur Felder, die kein Parameter des Kommandos sind', () => {
  const forms = readCommandForms([{ path: 'resources/view.html', text: '<form x-command-form="addItem" data-command-form-schema="NoteForm"><input x-param="text"><input x-param="note"></form><form x-command-form="addItem"><input x-param="text"></form>' }]);
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

test('checkConvertedModule: Kommando-Formular mit data-command-form-schema verlangt Formularhilfe', async () => {
  const view = '<form x-command-form="moveItem" data-command-form-schema="MoveForm" data-arg-from="a" data-arg-idx="0"><input x-param="to"><input x-param="note"></form>';
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

const LIST_SCHEMA = defineModel({
  fields: {
    items: list(object({ id: text(), text: text(), due: date({ empty: true }) })),
    risks: list(object({ id: text(), actions: list(object({ id: text(), owner: text() })) })),
  },
  view: { mode: oneOf(['a', 'b']) },
  commands: {
    removeItem: command({ params: { id: idOf('items') }, run() {} }),
    addItem: command({ params: { text: text(), due: date({ optional: true }) }, run() {} }),
  },
}).schema;

test('Template ↔ Schema: x-set auf Felder, x-field auf date', () => {
  const files = [{ path: 'resources/view.html', text: '<div x-set="model.mode"></div><div x-set="model.nope"></div><input x-field="model.items[i].due">' }];
  assert.deepEqual(checkTemplateBindings(files, LIST_SCHEMA), [
    'template: resources/view.html: x-set="model.nope": nope ist weder Feld noch Ansichtsfeld',
  ]);
});

test('Listenpfade: beide Formen, verschachtelt, Schlüssel, Anker', () => {
  const text = [
    '<template x-for="(item, i) in model.items" :key="item.id">',
    '  <input x-field="item.text"><input x-field="model.items[i].due"><input x-field="item.id"><input x-field="item.nope">',
    '</template>',
    '<template x-for="r in model.risks" :key="r.id"><template x-for="act in r.actions" :key="act.id"><input x-field="act.owner"></template></template>',
    '<template x-for="c in columns" :key="c"><input x-field="c.name"></template>',
  ].join('\n');
  const { findings, helpKeys } = checkListBindings([{ path: 'resources/view.html', text }], LIST_SCHEMA);
  assert.deepEqual(findings, [
    'template: resources/view.html: x-field="item.id": id ist der Schlüssel von items',
    'template: resources/view.html: x-field="item.nope": nope passt nicht zum Schema',
    'template: resources/view.html: x-field="c.name": c ist weder model, state noch ein Eintrag einer Modell-Liste aus x-for',
  ]);
  assert.deepEqual(helpKeys, ['fields.items.due.help', 'fields.items.text.help', 'fields.risks.actions.owner.help']);
});

test('Listenpfade: einfache Anführungszeichen, Klammerinhalt mit dem anderen Anführungszeichen', () => {
  const text = "<input x-field='model.items[i].due'><input x-field='model.items[i].nope'><input x-field=\"model.items[i].text\">";
  const { findings, helpKeys } = checkListBindings([{ path: 'resources/view.html', text }], LIST_SCHEMA);
  assert.deepEqual(findings, ['template: resources/view.html: x-field="model.items[i].nope": nope passt nicht zum Schema']);
  assert.deepEqual(helpKeys, ['fields.items.due.help', 'fields.items.text.help']);
});

test('Startwerte: Parameter des Kommandos, kein Konflikt mit data-arg-*', () => {
  const text = [
    '<form x-command-form="addItem" data-default-arg-text="x" data-default-arg-nope="1"></form>',
    '<button x-dialog.dblclick="f" :data-default-arg-due="d"></button>',
    '<button x-dialog="f" data-arg-text="a" data-default-arg-text="b"></button>',
    '<form x-ref="f" x-command-form="addItem"></form>',
  ].join('\n');
  assert.deepEqual(checkDefaultArgRefs([{ path: 'resources/view.html', text }], LIST_SCHEMA), [
    'command: resources/view.html: data-default-arg-nope: kein Parameter von addItem',
    'command: resources/view.html: data-default-arg-text: text steht auch als data-arg-text',
  ]);
});

test('Knopfgruppen: Optionen brauchen role="radio" (außer input type=radio)', () => {
  const text = [
    '<div role="radiogroup" x-set="model.mode"><button type="button" role="radio" value="a"></button><button type="button" value="b"></button></div>',
    '<div x-param="due"><div><input type="radio" value="x"><button :value="p"></button></div></div>',
    '<input x-param="text">',
  ].join('\n');
  assert.deepEqual(checkChoiceGroups([{ path: 'resources/view.html', text }]), [
    'template: resources/view.html: x-set="model.mode": Option <button value="b"> ohne role="radio"',
    'template: resources/view.html: x-param="due": Option <button :value="p"> ohne role="radio"',
  ]);
});

test('Knopfgruppen: Kästchen einer x-param-Gruppe (Listenparameter) brauchen keine Rolle', () => {
  const text = [
    '<div x-param="ids"><label><input type="checkbox" :value="x.id"></label><input type="checkbox" value="3"></div>',
    '<div role="radiogroup" x-set="model.mode"><input type="checkbox" value="a"></div>',
  ].join('\n');
  assert.deepEqual(checkChoiceGroups([{ path: 'resources/view.html', text }]), [
    'template: resources/view.html: x-set="model.mode": Option <input type="checkbox" value="a"> ohne role="radio"',
  ]);
});

test('Knopfgruppen: role="tab" nur in einer tablist mit x-set', () => {
  const text = [
    '<div role="tablist" x-tablist x-set="model.view"><button type="button" role="tab" :value="v"></button></div>',
    '<div role="radiogroup" x-set="model.mode"><button type="button" role="tab" value="a"></button></div>',
    '<div role="tablist" x-param="due"><button type="button" role="tab" value="a"></button></div>',
  ].join('\n');
  assert.deepEqual(checkChoiceGroups([{ path: 'resources/view.html', text }]), [
    'template: resources/view.html: x-set="model.mode": Option <button role="tab" value="a"> ohne role="radio"',
    'template: resources/view.html: x-param="due": Option <button role="tab" value="a"> ohne role="radio"',
  ]);
});

test('readStateBindings: auch x-set="state.<f>"', () => {
  assert.deepEqual(readStateBindings([{ path: 'resources/view.html', text: '<div x-set="state.tab"></div><input x-field="state.level">' }]), ['level', 'tab']);
});

test('Listenpfade: derselbe Eintragsname über zwei Listen wird in Dokumentreihenfolge aufgelöst', () => {
  const text = [
    '<template x-for="x in model.items"><input x-field="x.text"><input x-field="x.owner"></template>',
    '<template x-for="r in model.risks"><template x-for="x in r.actions"><input x-field="x.owner"><input x-field="x.due"></template></template>',
  ].join('\n');
  const { findings, helpKeys } = checkListBindings([{ path: 'resources/view.html', text }], LIST_SCHEMA);
  assert.deepEqual(findings, [
    'template: resources/view.html: x-field="x.owner": owner passt nicht zum Schema',
    'template: resources/view.html: x-field="x.due": due passt nicht zum Schema',
  ]);
  assert.deepEqual(helpKeys, ['fields.items.text.help', 'fields.risks.actions.owner.help']);
});

const INVARIANT_MODEL = `import { defineModel, number } from '@/core/model.js';
export const State = defineModel({
  fields: {},
  view: { a: number({ default: 1 }), b: number({ default: 2 }) },
  invariants: {
    order: { fields: ['a', 'b'], test(m) { return m.a < m.b; } },
    arrow: { fields: ['a'], test: (m) => m.a > 0 },
    extra: { fields: ['a'], test(m) { return true; }, note: 'x' },
    healed: { fields: ['a'], test(m) { return m.a > 0; }, repair(m) { m._v.a = 1; } },
    healedArrow: { fields: ['a'], test(m) { return m.a > 0; }, repair: (m) => { m._v.a = 1; } },
    healedValue: { fields: ['a'], test(m) { return m.a > 0; }, repair: 1 },
  },
  commands: {},
});
`;

test('Schema-Literal: invariants mit test als Methode, repair als Funktion', () => {
  assert.deepEqual(checkSchemaLiteral(INVARIANT_MODEL), [
    'schema: domain/model.js: test von invariants.arrow ist eine Pfeilfunktion — this muss das Model sein',
    "schema: domain/model.js: invariants.extra: nur fields (String-Literale), test und repair erlaubt (note: 'x')",
    'schema: domain/model.js: repair von invariants.healedValue: Funktion oder Methode erwartet',
  ]);
});

test('Invarianten: Text je Sprache', () => {
  const schema = { invariants: { order: { fields: ['a', 'b'] }, span: { fields: ['a'] } } };
  assert.deepEqual(checkInvariantTexts(schema, { de: { invariants: { order: 'Von vor Bis.' } }, en: { invariants: { order: 'From before to.', span: ' ' } } }), [
    'ui: resources/i18n/ui.de.json: invariants.span fehlt',
    'ui: resources/i18n/ui.en.json: invariants.span fehlt',
  ]);
});

test('Schema-Literal: columnRef mit Literal-Optionen ist erlaubt', () => {
  const src = `import { defineModel, columnRef, list } from '${MODEL_URL}';
export const State = defineModel({ fields: { a: columnRef({ types: ['numeric'], minCount: 3 }), k: list(columnRef({ nullable: false })) } });`;
  assert.deepEqual(checkSchemaLiteral(src), []);
});

test('Template: x-field auf columnRef und list(columnRef) ist erlaubt, auf list(text) nicht', () => {
  const schema = { fields: { a: columnRef(), k: list(columnRef({ nullable: false })), t: list(text()) }, view: {} };
  const files = [{ path: 'resources/view.html', text: '<div x-field="model.a"></div><div x-field="model.k"></div><div x-field="model.t"></div>' }];
  assert.deepEqual(checkTemplateBindings(files, schema), [
    'template: resources/view.html: x-field="model.t": t (list) hat keine Regeln — x-model verwenden',
  ]);
});

test('view-Block: kein stateManager/getModuleState, außerhalb erlaubt', () => {
  const text = `export default createModule({
  createDefault(context) { return context.stateManager.get('settings'); },
  view(ctx) {
    return {
      computed: { result() { return ctx.context.stateManager.getModuleState('x'); } },
      get n() { return ctx.data.numeric(this.model.colRef1); },
    };
  },
});`;
  assert.deepEqual(checkViewReads([{ path: 'viewmodel/viewmodel.js', text }]), [
    'view: viewmodel/viewmodel.js: stateManager im view-Block — Arbeitsblätter über ctx.data lesen',
    'view: viewmodel/viewmodel.js: getModuleState im view-Block — Arbeitsblätter über ctx.data lesen',
  ]);
});

test('Picker-CSS: keine Regeln auf col-picker-Klassen', () => {
  assert.deepEqual(checkPickerCss({ path: 'resources/style.css', text: '.hyptest__picker { margin: 0; }' }), []);
  assert.deepEqual(checkPickerCss({ path: 'resources/style.css', text: '.hyptest__picker .col-picker__select { width: 100%; }' }), [
    'css: resources/style.css: .col-picker__select — Klassen des Pickers nicht stylen, nur das Wirtselement',
  ]);
  assert.deepEqual(checkPickerCss(null), []);
});

test('x-chart ist verboten', () => {
  assert.deepEqual(checkChartBindings([{ path: 'resources/view.html', text: '<div x-chart="plot"></div>' }]), [
    'template: resources/view.html: x-chart="plot": x-chart ist abgelöst — x-widget mit einem Diagramm-Widget verwenden',
  ]);
  assert.deepEqual(checkChartBindings([{ path: 'resources/tile.html', text: '<div x-widget="control-chart" x-widget-config="chart"></div>' }]), []);
});

test('checkViewReads: view-Teile aus importierten Dateien des Moduls', () => {
  const base = appWith({
    'viewmodel/causes.js': 'export function causesView(ctx) { return { get x() { return ctx.stateManager.get("a"); } }; }\n',
  });
  const vm = { path: 'viewmodel/viewmodel.js', text: "import { causesView } from './causes.js';\nexport default createModule({ view: [causesView, (ctx) => ({ y: 1 })] });\n" };
  assert.deepEqual(checkViewReads([vm], base), ['view: viewmodel/viewmodel.js: stateManager im view-Block — Arbeitsblätter über ctx.data lesen']);
});

test('checkViewReads: nicht auflösbarer view-Teil wird gemeldet', () => {
  const base = appWith({ 'viewmodel/causes.js': 'export function causesView(ctx) { return { y: 1 }; }\n' });
  const vm = { path: 'viewmodel/viewmodel.js', text: "import { causesView } from './causes.js';\nimport { goneView } from './gone.js';\nexport default createModule({ view: [causesView, goneView] });\n" };
  assert.deepEqual(checkViewReads([vm], base), ['view: viewmodel/viewmodel.js: view[1] nicht auflösbar — view-Block nicht prüfbar']);
});

test('checkCommandsRef: nicht auflösbarer commands-Bezeichner wird gemeldet', () => {
  const base = appWith({ 'viewmodel/commands.js': 'export const commands = { go: command({ run() {} }) };\n' });
  const ok = { path: 'viewmodel/viewmodel.js', text: "import { commands } from './commands.js';\nexport default createModule({ commands });\n" };
  const gone = { path: 'viewmodel/viewmodel.js', text: "import { vmc } from './gone.js';\nexport default createModule({ commands: vmc });\n" };
  const notLiteral = { path: 'viewmodel/viewmodel.js', text: "const vmc = make();\nexport default createModule({ commands: vmc });\n" };
  assert.deepEqual(checkCommandsRef([ok], base), []);
  assert.deepEqual(checkCommandsRef([gone], base), ['command: viewmodel/viewmodel.js: commands (vmc) nicht auflösbar — Viewmodel-Kommandos nicht prüfbar']);
  assert.deepEqual(checkCommandsRef([notLiteral], base), ['command: viewmodel/viewmodel.js: commands (vmc) nicht auflösbar — Viewmodel-Kommandos nicht prüfbar']);
  assert.deepEqual(checkCommandsRef([{ path: 'viewmodel/viewmodel.js', text: 'export default createModule({ commands: { a: command({ run() {} }) } });' }], base), []);
});

test('checkViewReads: auch tile/*.js', () => {
  const tile = { path: 'tile/tile.js', text: 'export default createTile({ view(ctx) { return { get x() { return ctx.stateManager.get("a"); } }; } });' };
  assert.deepEqual(checkViewReads([tile]), ['view: tile/tile.js: stateManager im view-Block — Arbeitsblätter über ctx.data lesen']);
});

test('checkSchemaLiteral: default als Funktion des Kontexts', () => {
  const src = `import { defineModel, number } from 'core/model.js';
export const State = defineModel({ fields: {
  alpha: number({ default: (c) => Number((1 - c.confidenceLevel / 100).toFixed(4)) }),
  powerGoal: number({ default(c) { return c.power / 100; } }),
} });\n`;
  assert.deepEqual(checkSchemaLiteral(src), []);
  const settings = `import { defineSettings, number } from 'core/model.js';
export const Settings = defineSettings({ n: number({ min: 0, max: 1, default: () => 1 }) });\n`;
  assert.ok(checkSchemaLiteral(settings, { define: 'defineSettings', file: 'tile/settings.js' })[0].includes('Funktion nicht erlaubt'));
});

// Importzeilen zusammengesetzt, damit der Grenz-Scanner sie nicht als echte Importe liest.
const imp = (what, from) => 'import' + ` ${what} from '${from}';`;

test('checkSchemaLiteral: edits() eines Widget-Schemas und Diagrammfarben', () => {
  const ok = [
    imp('{ defineModel, list, text }', '../../../core/model.js'),
    imp('histogramChart', '../../../widgets/histogram-chart/schema.js'),
    imp('{ CHART_COLORS_RGBA }', '../../../core/chart/chart-colors.js'),
    'export const State = defineModel({ fields: { c: list(text(), { default: CHART_COLORS_RGBA }) }, view: { h: histogramChart.edits() } });',
  ].join('\n');
  assert.deepEqual(checkSchemaLiteral(ok), []);
  const bad = ok.replace('histogramChart.edits()', 'histogramChart.other()');
  assert.deepEqual(checkSchemaLiteral(bad), ['schema: domain/model.js: Aufruf histogramChart.other() ist kein Konstruktor aus core/model.js']);
  const withArg = ok.replace('histogramChart.edits()', 'histogramChart.edits(1)');
  assert.equal(checkSchemaLiteral(withArg).length, 1);
});

test('Layer: domain importiert aus js/widgets nur schema.js, Diagrammfarben sind erlaubt', () => {
  const files = [
    { path: 'domain/model.js', text: [imp('h', '../../../widgets/histogram-chart/schema.js'), imp('{ CHART_COLORS_RGBA }', '../../../core/chart/chart-colors.js')].join('\n') },
    { path: 'domain/a.js', text: [imp('m', '../../../widgets/histogram-chart/mount.js'), imp('p', '../../../widgets/chart-mount.js'), imp('q', '../../../widgets/chart-parts.js')].join('\n') },
  ];
  assert.deepEqual(checkLayers(files), [
    'layer: domain/a.js: Import ../../../widgets/histogram-chart/mount.js in domain/ verboten (aus js/widgets/ nur schema.js)',
    'layer: domain/a.js: Import ../../../widgets/chart-mount.js in domain/ verboten (aus js/widgets/ nur schema.js)',
    'layer: domain/a.js: Import ../../../widgets/chart-parts.js in domain/ verboten (aus js/widgets/ nur schema.js)',
  ]);
});

test('viewNamesOf: Getter, computed und Datenglieder des view-Blocks', () => {
  const vm = `export default createModule({ view() { return {
    get stats() { return 1; }, computed: { helper() { return 2; } }, legacyEditKeys: { a: 'x' }, plain: 3,
  }; } });`;
  assert.deepEqual(viewNamesDetailOf(vm), { getters: ['stats'], computed: ['helper'], data: ['legacyEditKeys', 'plain'] });
  assert.deepEqual([...viewNamesOf(vm)].sort(), ['helper', 'legacyEditKeys', 'plain', 'stats']);
});

test('checkContextHelp verlangt fields.<computed>.help', () => {
  const schema = { fields: {}, commands: {} };
  assert.deepEqual(checkContextHelp(schema, { de: { fields: {} }, en: { fields: { series: { help: 'S' } } } }, {}, [], [], ['series']),
    ['help: resources/i18n/context-help.de.json: fields.series.help fehlt']);
  assert.deepEqual(checkContextHelp(schema, { de: { fields: {} }, en: { fields: {} } }), []);
});

test('computedNamesOf meldet kein verschachteltes computed in einem Datenglied', () => {
  const vm = `export default createModule({
    view: (ctx) => ({
      opts: { computed: { fake() { return 1; } } },
      computed: { real() { return 1; } },
    }),
  });`;
  assert.deepEqual(computedNamesOf(vm), ['real']);
});

test('computedNamesOf liest die Schlüssel des computed-Objekts im view-Block', () => {
  const vm = `export default createModule({
    view: (ctx) => ({
      plain: 1,
      computed: { a() { return 1; }, b: () => 2, get c() { return 3; } },
    }),
  });`;
  assert.deepEqual(computedNamesOf(vm), ['a', 'b', 'c']);
  assert.deepEqual(computedNamesOf('export default createModule({ view: () => ({ x: 1 }) });'), []);
  assert.deepEqual(computedNamesOf('export default {}'), []);
  assert.deepEqual(computedNamesOf(`const computed = { other() {} }; export default createModule({ view: () => ({ computed: { z() {} } }) });`), ['z']);
});

test('Schema-Literal: version/migrations in einem Feldobjekt sind kein Schema-Kopf', () => {
  const src = `import { defineModel, text } from '${MODEL_URL}';
export const State = defineModel({
  version: '1.0',
  fields: { t: text({ version: '2.0', migrations: {} }), version: text() },
});
`;
  assert.deepEqual(checkSchemaLiteral(src), [
    "schema: domain/model.js: version nur am obersten defineModel-Literal erlaubt (version: '2.0')",
    'schema: domain/model.js: migrations nur am obersten defineModel-Literal erlaubt (migrations: {})',
  ]);
});

test('Schema-Literal: default als Funktion nur in Feldspezifikationen, nicht in Kommandoparametern', () => {
  const src = `import { defineModel, command, number } from '${MODEL_URL}';
export const State = defineModel({
  fields: { a: number({ default: () => 1 }) },
  commands: { go: command({ params: { default: () => 1 }, run() {} }) },
});
`;
  assert.deepEqual(checkSchemaLiteral(src), [
    'schema: domain/model.js: Funktion nicht erlaubt (() => 1) — Callbacks nur als run',
  ]);
});

test('findViewBlock: trifft den view-Block des createModule-Arguments, nicht ein früheres defineModel', () => {
  const text = `const State = defineModel({ view: { zoom: number() } });
export default createModule({ view() { return { computed: { fromModule() { return 1; } } }; } });
`;
  assert.deepEqual(computedNamesOf(text), ['fromModule']);
  const early = `const State = defineModel({ view: { computed: { wrong: 1 } } });
export default createModule({ view() { return { get x() { return ctx.stateManager; } }; } });
`;
  assert.deepEqual(checkViewReads([{ path: 'viewmodel/viewmodel.js', text: early }]), [
    'view: viewmodel/viewmodel.js: stateManager im view-Block — Arbeitsblätter über ctx.data lesen',
  ]);
});

test('checkViewReads: auch asyncTasks.*.run, wie im view-Block', () => {
  const text = `export default createModule({
  asyncTasks: { compute: asyncTask({ run(_, ctx) { return ctx.stateManager.get('a'); } }), ok: asyncTask({ run() { return 1; } }) },
  view() { return {}; },
});
`;
  assert.deepEqual(checkViewReads([{ path: 'viewmodel/viewmodel.js', text }]), [
    'view: viewmodel/viewmodel.js: stateManager in asyncTasks.compute.run — Arbeitsblätter über ctx.data lesen',
  ]);
});

test('Picker-CSS: Selektoren zählen, Kommentare, Deklarationen und Zeichenketten nicht', () => {
  const css = (text) => checkPickerCss({ path: 'resources/style.css', text });
  assert.deepEqual(css('/* .col-picker__select war früher gestylt */ .a { margin: 0; }'), []);
  assert.deepEqual(css('.a { content: ".col-picker__x"; }'), []);
  assert.deepEqual(css('.a { margin: 0; }\n/* .col-picker */\n.b .col-picker-row, .c { margin: 0; }'), [
    'css: resources/style.css: .col-picker-row — Klassen des Pickers nicht stylen, nur das Wirtselement',
  ]);
  assert.deepEqual(css('@media (min-width: 1px) { .x > .col-picker__select:hover { width: 1px; } }'), [
    'css: resources/style.css: .col-picker__select — Klassen des Pickers nicht stylen, nur das Wirtselement',
  ]);
});

test('x-chart in einfachen Anführungszeichen wird geprüft', () => {
  assert.deepEqual(checkChartBindings([{ path: 'resources/view.html', text: "<div x-chart='name'></div><p x-chart = \"b\"></p>" }]), [
    "template: resources/view.html: x-chart='name': x-chart ist abgelöst — x-widget mit einem Diagramm-Widget verwenden",
    'template: resources/view.html: x-chart="b": x-chart ist abgelöst — x-widget mit einem Diagramm-Widget verwenden',
  ]);
});

test('viewNamesDetailOf: nur Getter der obersten Ebene, verschachtelte zählen nicht', () => {
  const vm = `export default createModule({ view() { return {
    get top() { return { get inner() { return 1; } }; },
    helper: { get deep() { return 1; } },
    computed: { c() { return 1; } },
  }; } });`;
  assert.deepEqual(viewNamesDetailOf(vm), { getters: ['top'], computed: ['c'], data: ['helper'] });
});

test('viewNamesDetailOf: Kurzschreibweise liefert die Namen', () => {
  const vm = `export default createModule({ view() { const foo = 1; const bar = 2; return { foo, bar }; } });`;
  assert.deepEqual(viewNamesDetailOf(vm), { getters: [], computed: [], data: ['foo', 'bar'] });
});

test('viewNamesDetailOf: das return des view-Blocks, nicht das erste Objekt davor', () => {
  const vm = `export default createModule({ view(ctx) {
    const helper = () => { return { wrong: 1, get alsoWrong() { return 1; } }; };
    return { right: helper() };
  } });`;
  assert.deepEqual(viewNamesDetailOf(vm), { getters: [], computed: [], data: ['right'] });
  const arrow = `export default createModule({ view: (ctx) => ({ get g() { return 1; }, d: 1 }) });`;
  assert.deepEqual(viewNamesDetailOf(arrow), { getters: ['g'], computed: [], data: ['d'] });
});

test('kein view-Block: keine Namen, kein Befund; Nicht-Literal am createModule: Befund', () => {
  const empty = { getters: [], computed: [], data: [] };
  assert.deepEqual(viewNamesDetailOf('export default createModule({ commands: {} });'), empty);
  assert.deepEqual(viewNamesDetailOf('export default createModule(config);'), empty);
  assert.deepEqual(viewNamesDetailOf('export default {};'), empty);
  assert.deepEqual(computedNamesOf('export default createModule(config);'), []);
  const hidden = 'export default createModule(config);\nconst config = { view() { return { get x() { return ctx.stateManager; } }; } };';
  assert.deepEqual(checkViewReads([{ path: 'viewmodel/viewmodel.js', text: hidden }]), [
    'view: viewmodel/viewmodel.js: createModule-Argument ist kein Objektliteral — view-Block nicht prüfbar',
  ]);
  assert.deepEqual(checkViewReads([{ path: 'tile/tile.js', text: 'export default createTile(config);' }]), [
    'view: tile/tile.js: createTile-Argument ist kein Objektliteral — view-Block nicht prüfbar',
  ]);
  assert.deepEqual(checkViewReads([{ path: 'viewmodel/viewmodel.js', text: 'export const helper = 1;' }]), []);
  assert.deepEqual(checkViewReads([{ path: 'viewmodel/viewmodel.js', text: 'export default createModule({});' }]), []);
});

const DEMO_WIDGETS = new Map([['demo', { props: { items: { optional: true } }, value: null }]]);
const TILE_BINDING = '<template data-tpl="tile-extra"><div x-widget="demo" x-widget-items="foo"></div></template>';
const TILE_FINDING = 'template: resources/tile.extra.html: x-widget-items="foo": foo ist weder Getter noch computed des view-Blocks';

test('Kachelvorlage resources/tile.extra.html liest die Namen aus tile/extra.js', async () => {
  const tile = 'export default createTile({ view() { return { get foo() { return []; } }; } });\n';
  const ok = convertedFixture({ 'js/modules/neu/resources/tile.extra.html': TILE_BINDING, 'js/modules/neu/tile/extra.js': tile });
  assert.deepEqual(await checkConvertedModule(ok, 'neu', { widgets: DEMO_WIDGETS }), []);
  const wrong = convertedFixture({ 'js/modules/neu/resources/tile.extra.html': TILE_BINDING, 'js/modules/neu/tile/extra.js': tile.replace('foo', 'bar') });
  assert.deepEqual(await checkConvertedModule(wrong, 'neu', { widgets: DEMO_WIDGETS }), [TILE_FINDING]);
});

test('Kachelvorlage ohne tile/<name>.js: die Namen sind leer, die Bindung wird gemeldet', async () => {
  const root = convertedFixture({ 'js/modules/neu/resources/tile.extra.html': TILE_BINDING });
  const findings = await checkConvertedModule(root, 'neu', { widgets: DEMO_WIDGETS });
  assert.deepEqual(findings, [TILE_FINDING]);
});

test('checkConvertedModule: Picker-CSS und x-chart über die Verdrahtung', async () => {
  const root = convertedFixture({
    'js/modules/neu/resources/style.css': '/* .col-picker */ .neu .col-picker__select { width: 1px; }',
    'js/modules/neu/resources/other.html': "<div x-chart='plot'></div>",
  });
  const findings = await checkConvertedModule(root, 'neu');
  assert.deepEqual(findings.filter((f) => f.startsWith('css:') || f.includes('x-chart')), [
    'css: resources/style.css: .col-picker__select — Klassen des Pickers nicht stylen, nur das Wirtselement',
    "template: resources/other.html: x-chart='plot': x-chart ist abgelöst — x-widget mit einem Diagramm-Widget verwenden",
  ]);
});

test('checkConvertedModule: Lesezugriffe im view-Block und in asyncTasks über die Verdrahtung', async () => {
  const vm = `export default createModule({
  asyncTasks: { compute: asyncTask({ run(_, ctx) { return ctx.stateManager.get('a'); } }) },
  view(ctx) { return { get x() { return ctx.getModuleState('m'); } }; },
});\n`;
  const root = convertedFixture({ 'js/modules/neu/viewmodel/viewmodel.js': vm });
  const findings = (await checkConvertedModule(root, 'neu')).filter((f) => f.startsWith('view:'));
  assert.deepEqual(findings, [
    'view: viewmodel/viewmodel.js: getModuleState im view-Block — Arbeitsblätter über ctx.data lesen',
    'view: viewmodel/viewmodel.js: stateManager in asyncTasks.compute.run — Arbeitsblätter über ctx.data lesen',
  ]);
});

test('viewNamesDetailOf: das letzte return der obersten Ebene gewinnt gegen einen Guard davor', () => {
  const vm = `export default createModule({ view(ctx) {
    if (!ctx) return { guard: 1 };
    return { real: 1 };
  } });`;
  assert.deepEqual(viewNamesDetailOf(vm), { getters: [], computed: [], data: ['real'] });
});

test('Kachel-Vorlage: state.<pfad> ist ein Befund, auch wenn das Modul das UI-Feld hat', () => {
  const widgets = new Map([['stats-table', defineWidget({ name: 'stats-table', props: { level: number() } })]]);
  const templates = [{ path: 'resources/tile.html', text: '<div x-widget="stats-table" x-widget-level="state.level"></div>' }];
  const tileText = () => 'export default createTile({ view: () => ({}) });';
  assert.deepEqual(checkWidgetTemplates(templates, { widgets, schema: { fields: {}, view: {} }, viewNames: new Set(), tileText, stateSchema: { fields: { level: number() } } }),
    ['tile: resources/tile.html: state.level — Kacheln haben keinen state']);
});

test('x-field auf list(<forKind>) nur, wo das Widget Listen bindet (columnRef)', () => {
  const widgets = new Map([['dataset-picker', defineWidget({ name: 'dataset-picker', value: datasets({}), forKind: 'datasets' })]]);
  const files = [{ path: 'resources/view.html', text: '<div x-field="model.sets"></div><div x-field="model.many"></div>' }];
  const schema = defineModel({ fields: { sets: datasets({}), many: list(datasets({})) }, commands: {} }).schema;
  assert.deepEqual(checkTemplateBindings(files, schema, widgets),
    ['template: resources/view.html: x-field="model.many": many (list) hat keine Regeln — x-model verwenden']);
});

test('checkConvertedModule: fehlerhaftes Widget-Schema wird zum Befund statt zum Absturz', async () => {
  const root = convertedFixture({ 'js/widgets/bad/schema.js': "export default { name: 'other' };\n" });
  const findings = await checkConvertedModule(root, 'neu');
  assert.ok(findings.some((f) => f.startsWith('widget: js/widgets: Schemas lassen sich nicht laden (widgets/bad/schema.js')), findings.join('\n'));
});

test('Listenpfade: x-field auf Map-Einträge, Anker, Nicht-Map scheitert', () => {
  const schema = defineModel({
    fields: {
      items: list(object({ id: text(), name: text() })),
      scores: map(text(), map(text(), number({ min: 0, max: 9 }))),
      concepts: list(object({ id: text(), picks: map(idOf('items'), text()) })),
    },
  }).schema;
  const html = [
    '<input x-field="model.scores[r]"><input x-field="model.scores[r][c]">',
    '<input x-field="model.concepts[i].picks[p]"><input x-field="model.scores[3]">',
    '<input x-field="model.items[i]"><input x-field="model.items[i].name[k]"><input x-field="model[r]">',
  ].join('\n');
  const { findings, helpKeys } = checkListBindings([{ path: 'resources/view.html', text: html }], schema);
  assert.deepEqual(findings, [
    'template: resources/view.html: x-field="model.items[i]": [i] passt nicht zum Schema',
    'template: resources/view.html: x-field="model.items[i].name[k]": [k] passt nicht zum Schema',
    'template: resources/view.html: x-field="model[r]": [r] passt nicht zum Schema',
  ]);
  assert.deepEqual(helpKeys, ['fields.concepts.picks.help', 'fields.scores.help']);
});

test('Listenpfade: Map-Eintrag gefolgt von einem Namen meldet "nur der letzte Schritt"', () => {
  const schema = defineModel({
    fields: { m: map(text(), object({ label: text() })) },
  }).schema;
  const { findings } = checkListBindings([{ path: 'resources/view.html', text: '<input x-field="model.m[k].label">' }], schema);
  assert.deepEqual(findings, ['template: resources/view.html: x-field="model.m[k].label": ein Map-Eintrag darf nur der letzte Schritt sein']);
});

test('checkFieldErrorPaths: fieldError braucht ein x-field mit demselben Ausdruck', () => {
  const ok = { path: 'resources/view.html', text: `<input x-field="model.lsl"><span x-text="fieldError('model.lsl')"></span>` };
  assert.deepEqual(checkFieldErrorPaths([ok]), []);
  const typo = { path: 'resources/view.html', text: `<input x-field="model.lsl"><span x-text="fieldError('model.lls')"></span>` };
  assert.deepEqual(checkFieldErrorPaths([typo]), [
    "template: resources/view.html: fieldError('model.lls'): kein x-field mit diesem Ausdruck",
  ]);
});

test('checkFieldErrorPaths: zwei Aufrufe in einem Ausdruck, x-field im anderen Template zählt nicht', () => {
  const view = { path: 'resources/view.html', text: `<input x-field="model.lsl"><span x-text="fieldError('model.lsl') || fieldError('model.usl')"></span>` };
  const part = { path: 'resources/limits.part.html', text: '<input x-field="model.usl">' };
  assert.deepEqual(checkFieldErrorPaths([view, part]), [
    "template: resources/view.html: fieldError('model.usl'): kein x-field mit diesem Ausdruck",
  ]);
});

const DERIVED_MODEL = (derived, bulk = "['a']") => `import { defineModel, number } from '@/core/model.js';
export const State = defineModel({
  fields: { n: number({ default: 1 }) },
  derived: { ${derived} },
  derivedBulk: ${bulk},
});
`;

test('Schema-Literal: derived mit Methoden, derivedBulk als Textliterale', () => {
  assert.deepEqual(checkSchemaLiteral(DERIVED_MODEL('a(data) { return data.numeric("c"); }, b: function (data, d) { return d.a; }')), []);
});

test('Schema-Literal: derived als Pfeilfunktion, Zahl oder Spread und derivedBulk mit Bezeichner sind Befunde', () => {
  assert.deepEqual(checkSchemaLiteral(DERIVED_MODEL('a: (data) => 1, b: 2, ...rest', '[x]')), [
    'schema: domain/model.js: derived.a ist eine Pfeilfunktion — this muss das Model sein',
    'schema: domain/model.js: derived.b: Funktion oder Methode erwartet (b: 2)',
    'schema: domain/model.js: derived: Spread nicht erlaubt (...rest)',
    'schema: domain/model.js: derivedBulk muss ein Array aus Textliteralen sein ([x])',
  ]);
});

test('Schreibweg: derived in domain/model.js schreibt nicht ins Model, Lesen ist frei', () => {
  const text = [
    'export const State = defineModel({',
    '  derived: {',
    '    a() { this.n = 1; return 1; },',
    '    b() { this.list.push(1); return 1; },',
    '    c(data) { const x = this.list.map((i) => i + 1); return this.n + x.length + data.numeric("c").length; },',
    '  },',
    '  commands: { go: command({ run() { this.n = 2; } }) },',
    '});',
  ].join('\n');
  assert.deepEqual(checkWritePath([{ path: 'domain/model.js', text }]), [
    'write: domain/model.js: this.n = … — über ein Kommando, instance.set oder x-model/x-field schreiben',
    'write: domain/model.js: this.list.push(…) — über ein Kommando, instance.set oder x-model/x-field schreiben',
  ]);
});

test('Schema-Literal: async oder Generator unter derived sind Befunde', () => {
  assert.deepEqual(checkSchemaLiteral(DERIVED_MODEL('async a() { return 1; }, *b() { yield 1; }, c: async function () { return 1; }', "['a']")), [
    'schema: domain/model.js: derived.a: async oder Generator nicht erlaubt — eine Ableitung ist synchron',
    'schema: domain/model.js: derived.b: async oder Generator nicht erlaubt — eine Ableitung ist synchron',
    'schema: domain/model.js: derived.c: async oder Generator nicht erlaubt — eine Ableitung ist synchron',
  ]);
});

test('Dateiablage: x-file-drop nennt ein Glied des view-Blocks', () => {
  const vm = 'export default createModule({ view() { return { handleFile(f) {}, other: 1 }; } });';
  const files = [{ path: 'resources/view.html', text: '<div x-file-drop="handleFile"></div><div x-file-drop="fehlt"></div>' }];
  assert.deepEqual(checkFileDropRefs(files, viewMemberNamesOf(vm)), [
    'file-drop: resources/view.html: x-file-drop="fehlt": kein Glied des view-Blocks',
  ]);
  assert.deepEqual(checkFileDropRefs([files[0]], new Set(['handleFile', 'fehlt'])), []);
});
