/**
 * D.Mike — Gates der umgestellten Module (module-gates.mjs)
 *
 * Geprüft werden: Struktur, Beschreibung, `uses`, Layer, Schema,
 * Template ↔ Schema, Schreibweg, Hilfe. Gilt NUR für Module in
 * `CONVERTED_MODULES` (converted-modules.mjs); `module-gates.test.mjs` führt
 * sie unter `npm run test:build` aus.
 *
 * Jede Prüfung ist eine Funktion über Pfade bzw. Dateitexte und liefert
 * Befunde `<gate>: <pfad im Modul>: <Text>`; leer = grün. Code wird mit dem
 * TypeScript-Parser gelesen (wie agent-data.mjs), das Schema per Import
 * (wie model-types.mjs).
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { parsePath } from '../../js/core/model.js';
import { loadModelSchema } from './model-types.mjs';
import { BOOKS } from '../../js/core/references-books.js';
import { readExampleOwners } from './example-catalog.mjs';
import { CONVERTED_MODULES } from './converted-modules.mjs';

/**
 * Alle Dateien eines Moduls, relativ zum Modulordner, POSIX, sortiert.
 * @param {string} appDir @param {string} id @returns {string[]}
 */
export function listModuleFiles(appDir, id) {
  const base = join(appDir, 'js', 'modules', id);
  const out = [];
  const walk = (rel) => {
    for (const name of readdirSync(join(base, rel))) {
      const p = rel ? `${rel}/${name}` : name;
      if (statSync(join(base, p)).isDirectory()) walk(p);
      else out.push(p);
    }
  };
  if (existsSync(base)) walk('');
  return out.sort();
}

/** @param {string} name @param {string} text @returns {ts.SourceFile} */
export function parseJs(name, text) {
  return ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
}

const DIRS = ['domain', 'viewmodel', 'interaction', 'io', 'tile', 'resources'];
const REQUIRED_FILES = ['module.js', 'domain/model.js', 'viewmodel/viewmodel.js', 'resources/view.html'];
const RESOURCE_TOP = /^(view\.html|[a-z0-9-]+\.part\.html|style\.css|tile(\.[a-z0-9-]+)?\.html)$/;
const I18N_FILE = /^(ui|help|context-help)\.(de|en)\.json$/;

/**
 * Gate Struktur.
 * @param {string} id @param {string[]} paths aus listModuleFiles
 * @returns {string[]}
 */
export function checkStructure(id, paths) {
  const out = [];
  for (const p of REQUIRED_FILES) if (!paths.includes(p)) out.push(`structure: ${p}: fehlt`);
  for (const p of paths) {
    const parts = p.split('/');
    const name = parts.at(-1);
    const bad = (why) => out.push(`structure: ${p}: ${why}`);
    if (parts.length === 1) {
      if (p !== 'module.js') bad('im Wurzelverzeichnis ist nur module.js erlaubt');
      continue;
    }
    const [top] = parts;
    if (!DIRS.includes(top)) {
      bad(`Ordner ${top}/ ist nicht erlaubt (erlaubt: ${DIRS.join(', ')})`);
      continue;
    }
    if (parts[1] !== 'examples' && (name === 'index.js' || name.startsWith(`${id}.`) || name.startsWith(`${id}-`))) {
      bad('Dateiname nach Rolle, ohne Modulnamen und ohne index');
    }
    if (top === 'resources') {
      if (parts.length === 2) {
        if (!RESOURCE_TOP.test(name)) bad('unter resources/ nur view.html, *.part.html, style.css, tile[.<name>].html');
      } else if (parts[1] === 'i18n') {
        if (parts.length !== 3 || !I18N_FILE.test(name)) bad('unter resources/i18n/ nur ui|help|context-help.<de|en>.json');
      } else if (parts[1] === 'data') {
        if (!name.endsWith('.json')) bad('unter resources/data/ nur .json');
      } else if (parts[1] !== 'examples') {
        bad(`Ordner resources/${parts[1]}/ ist nicht erlaubt (erlaubt: i18n, examples, data)`);
      }
    } else if (top === 'tile') {
      if (parts.length !== 2 || !name.endsWith('.js')) bad('unter tile/ nur <name>.js');
    } else if (!name.endsWith('.js')) {
      bad(`unter ${top}/ nur .js`);
    }
  }
  return out;
}

const NOT_LITERAL = Symbol('not literal');

/**
 * Wert eines Literal-Ausdrucks (String, Zahl, Boolean, null, Array, Objekt
 * mit festen Schlüsseln) oder NOT_LITERAL.
 * @param {ts.Node} n @returns {any}
 */
function literalValue(n) {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isNumericLiteral(n)) return Number(n.text);
  if (n.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (n.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (n.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(n)) {
    const vals = n.elements.map(literalValue);
    return vals.includes(NOT_LITERAL) ? NOT_LITERAL : vals;
  }
  if (ts.isObjectLiteralExpression(n)) {
    const obj = {};
    for (const p of n.properties) {
      if (!ts.isPropertyAssignment(p) || !(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) return NOT_LITERAL;
      const v = literalValue(p.initializer);
      if (v === NOT_LITERAL) return NOT_LITERAL;
      obj[p.name.text] = v;
    }
    return obj;
  }
  return NOT_LITERAL;
}

/**
 * `() => import('<ziel>')` → `'<ziel>'`, sonst null. Das Ziel prüft erst
 * `checkDescriptor` (LOADERS verlangt `./…`), damit ein falsches Ziel eine
 * eigene Meldung bekommt.
 * @param {ts.Node} n @returns {string|null}
 */
function importTarget(n) {
  if (!ts.isArrowFunction(n) || n.parameters.length !== 0) return null;
  const body = n.body;
  if (!ts.isCallExpression(body) || body.expression.kind !== ts.SyntaxKind.ImportKeyword) return null;
  const [arg] = body.arguments;
  return arg && ts.isStringLiteral(arg) ? arg.text : null;
}

const DESCRIPTOR_KEYS = ['id', 'version', 'icon', 'phase', 'group', 'cycles', 'allowedPhases', 'singleton', 'hiddenFromMenu', 'uses', 'exampleRefs', 'load', 'tile'];
const REQUIRED_KEYS = ['id', 'version', 'icon', 'load'];
const LOADERS = { load: /^\.\/viewmodel\/viewmodel\.js$/, tile: /^\.\/tile\/[a-z0-9-]+\.js$/ };
const LOADER_EXPECTED = { load: './viewmodel/viewmodel.js', tile: './tile/<name>.js' };
export const DESCRIPTOR_TYPE_TAG = "@type {import('../../core/module-descriptor.js').ModuleDescriptor}";

/**
 * Die Felder einer `module.js` als Werte; Lader als `{ import: '<ziel>' }`.
 * Liefert `{ fields, problems, shapeOk }`: `shapeOk` ist false, wenn die Datei nicht
 * aus genau einem `export default { … }` besteht (dann sind `fields` leer).
 * @param {string} text
 * @returns {{ fields: Map<string, any>, problems: string[], shapeOk: boolean }}
 */
export function parseDescriptor(text) {
  const sf = parseJs('module.js', text);
  const fields = new Map();
  const problems = [];
  const [stmt, ...more] = sf.statements;
  if (!stmt || more.length > 0 || !ts.isExportAssignment(stmt) || stmt.isExportEquals || !ts.isObjectLiteralExpression(stmt.expression)) {
    return { fields, problems: ['genau eine Anweisung: export default { … } (kein import, keine weiteren Anweisungen)'], shapeOk: false };
  }
  for (const p of stmt.expression.properties) {
    if (!ts.isPropertyAssignment(p) || !(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) {
      problems.push(`nur feste Schlüssel mit Wert (${p.getText(sf)})`);
      continue;
    }
    const key = p.name.text;
    if (!DESCRIPTOR_KEYS.includes(key)) { problems.push(`unbekanntes Feld ${key}`); continue; }
    if (key in LOADERS) {
      const target = importTarget(p.initializer);
      if (target === null) problems.push(`${key}: () => import('./…') erwartet`);
      else fields.set(key, { import: target });
      continue;
    }
    const v = literalValue(p.initializer);
    if (v === NOT_LITERAL) problems.push(`${key}: nur Literale (Strings, Zahlen, Booleans, Arrays, Objekte mit festen Schlüsseln)`);
    else fields.set(key, v);
  }
  return { fields, problems, shapeOk: true };
}

/** @param {any} v @returns {string[]} */
const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

/**
 * Gate Beschreibung.
 * @param {string} id
 * @param {string} text Inhalt von module.js
 * @param {{ moduleIds: string[], exampleIds: string[], paths: string[], exampleOwners?: Map<string, string> }} ctx
 * @returns {string[]}
 */
export function checkDescriptor(id, text, { moduleIds, exampleIds, paths, exampleOwners }) {
  const { fields, problems, shapeOk } = parseDescriptor(text);
  const out = problems.map((p) => `descriptor: module.js: ${p}`);
  if (!shapeOk) return out;
  if (!text.includes(DESCRIPTOR_TYPE_TAG)) out.push(`descriptor: module.js: JSDoc ${DESCRIPTOR_TYPE_TAG} fehlt`);
  const bad = (why) => out.push(`descriptor: module.js: ${why}`);
  for (const k of REQUIRED_KEYS) if (!fields.has(k) && !problems.some((p) => p.startsWith(`${k}:`))) bad(`Pflichtfeld ${k} fehlt`);
  for (const [key, value] of fields) {
    if (key in LOADERS) {
      const target = value.import;
      if (!LOADERS[key].test(target)) bad(`${key}: Ziel ${target} nicht erlaubt (erwartet ${LOADER_EXPECTED[key]})`);
      else if (!paths.includes(target.slice(2))) bad(`${key}: ${target} existiert nicht`);
    } else if (key === 'id' && value !== id) bad(`id ${JSON.stringify(value)} ≠ Ordner ${id}`);
    else if (key === 'version' && !(typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value))) bad(`version ${JSON.stringify(value)}: x.y.z erwartet`);
    else if (key === 'uses') for (const u of strings(value)) { if (!moduleIds.includes(u)) bad(`uses: unbekanntes Modul ${u}`); }
    else if (key === 'exampleRefs') for (const e of strings(value)) {
      if (!exampleIds.includes(e)) bad(`exampleRefs: unbekanntes Beispiel ${e}`);
      else if (exampleOwners?.get(e) === id) bad(`exampleRefs: ${e} gehört diesem Modul selbst — exampleRefs nennt nur Beispiele anderer Module`);
    }
  }
  return out;
}

/**
 * Ids aller Beispiele: examples/index.json ohne Szenarien plus
 * resources/examples/examples.json der umgestellten Module.
 * @param {string} appDir @returns {string[]}
 */
export function readExampleIds(appDir) {
  return [...readExampleOwners(appDir).keys()];
}

const WORKSHEET_USES = [
  { re: /['"][^'"]*\/ui\/column-picker\.js['"]/, what: 'ui/column-picker.js' },
  { re: /['"][^'"]*\/ui\/dataset-picker\.js['"]/, what: 'ui/dataset-picker.js' },
  { re: /['"][^'"]*\/core\/worksheet-[\w-]+\.js['"]/, what: 'core/worksheet-*' },
  { re: /['"`]worksheet:/, what: 'Ereignis worksheet:…' },
];

/**
 * Gate `uses` vollständig: wer das Datenformat des Worksheets nutzt,
 * erklärt `uses: ['worksheet']`. Ein Befund je Datei (erster Treffer).
 * @param {{ path: string, text: string }[]} files .js-Dateien des Moduls
 * @param {string[]} uses aus module.js
 * @returns {string[]}
 */
export function checkUses(files, uses) {
  if (uses.includes('worksheet')) return [];
  const out = [];
  for (const { path, text } of files) {
    const hit = WORKSHEET_USES.find(({ re }) => re.test(text));
    if (hit) out.push(`uses: ${path}: nutzt das Worksheet (${hit.what}) → uses: ['worksheet'] in module.js`);
  }
  return out;
}

const LAYER_RULES = {
  domain: {
    imports: [
      { re: /alpinejs/, why: 'Alpine' },
      { re: /\/core\/dom\.js$/, why: 'DOM-Helfer' },
      { re: /(^|\/)ui\//, why: 'UI' },
      { re: /\/core\/(template-module|field-directive)\.js$/, why: 'Viewmodel-Kern' },
      { re: /^(\.\.\/)+(viewmodel|interaction|io|tile|resources)\//, why: 'höhere Schicht' },
    ],
    globals: ['document', 'window', 'Alpine', 'context'],
  },
  io: {
    imports: [{ re: /alpinejs/, why: 'Alpine' }],
    globals: ['Alpine'],
  },
};

/** Ist `id` hier ein freier Bezeichner (kein Eigenschafts- oder Schlüsselname)? */
function isFreeIdentifier(id) {
  const p = id.parent;
  if (ts.isPropertyAccessExpression(p) && p.name === id) return false;
  if ((ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p)) && p.name === id) return false;
  if (ts.isBindingElement(p) && p.propertyName === id) return false;
  return true;
}

/**
 * Gate Layer: `domain/` ohne Alpine, DOM, UI, Kontext, höhere Schichten;
 * `io/` ohne Alpine. Ein Befund je Datei und verbotenem Namen.
 * @param {{ path: string, text: string }[]} files
 * @returns {string[]}
 */
export function checkLayers(files) {
  const out = [];
  for (const { path, text } of files) {
    const layer = path.split('/')[0];
    const rule = LAYER_RULES[layer];
    if (!rule || !path.endsWith('.js')) continue;
    const sf = parseJs(path, text);
    const seen = new Set();
    const report = (msg) => { if (!seen.has(msg)) { seen.add(msg); out.push(msg); } };
    const visit = (n) => {
      let spec = null;
      if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) spec = n.moduleSpecifier.text;
      if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) spec = n.arguments[0].text;
      if (spec !== null) {
        const hit = rule.imports.find(({ re }) => re.test(spec));
        if (hit) report(`layer: ${path}: Import ${spec} in ${layer}/ verboten (${hit.why})`);
      }
      if (ts.isPropertyAccessExpression(n) && n.expression.kind === ts.SyntaxKind.ThisKeyword && n.name.text === 'context' && layer === 'domain') {
        report(`layer: ${path}: this.context in ${layer}/ verboten`);
      }
      if (ts.isIdentifier(n) && rule.globals.includes(n.text) && isFreeIdentifier(n)) {
        const inImport = ts.isImportClause(n.parent) || ts.isImportSpecifier(n.parent) || ts.isNamespaceImport(n.parent);
        if (!inImport) report(`layer: ${path}: ${n.text} in ${layer}/ verboten`);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

const MODEL_SPEC = /(^|\/)core\/model\.js$/;
/** Präfix aller Schema-Befunde. */
const SCHEMA_PREFIX = 'schema: domain/model.js:';

/**
 * Gate Schema, Teil Literal: `defineModel({ … })` ist ein reines Literal
 * (feste Schlüssel, Konstruktoren aus core/model.js, Literale, Konstanten
 * dieser Datei; Funktionen nur als `run`). `version` ist ein String-Literal
 * `MAJOR.MINOR`; `migrations` nur `'a→b': <Import aus ./migrations.js>`.
 * @param {string} text Inhalt von domain/model.js
 * @returns {string[]}
 */
export function checkSchemaLiteral(text) {
  const P = SCHEMA_PREFIX;
  const sf = parseJs('model.js', text);
  const ctors = new Map(); // lokaler Name → importierter Name
  const runImports = new Set();
  const migrationImports = new Set();
  const consts = new Set();
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && st.importClause?.namedBindings && ts.isNamedImports(st.importClause.namedBindings)) {
      const spec = st.moduleSpecifier.text;
      for (const el of st.importClause.namedBindings.elements) {
        const imported = (el.propertyName ?? el.name).text;
        if (MODEL_SPEC.test(spec)) ctors.set(el.name.text, imported);
        else if (/^\.\/commands\//.test(spec)) runImports.add(el.name.text);
        else if (spec === './migrations.js') migrationImports.add(el.name.text);
      }
    }
    const decl = ts.isVariableStatement(st) ? st.declarationList : null;
    if (decl && (decl.flags & ts.NodeFlags.Const)) {
      for (const d of decl.declarations) if (ts.isIdentifier(d.name) && d.initializer && !ts.isCallExpression(d.initializer)
          && !ts.isArrowFunction(d.initializer) && !ts.isFunctionExpression(d.initializer) && !ts.isClassExpression(d.initializer)) consts.add(d.name.text);
    }
  }
  const calls = [];
  const find = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && ctors.get(n.expression.text) === 'defineModel') calls.push(n);
    ts.forEachChild(n, find);
  };
  find(sf);
  if (calls.length !== 1 || !calls[0].arguments[0] || !ts.isObjectLiteralExpression(calls[0].arguments[0])) {
    return [`${P} genau ein Aufruf defineModel({ … }) aus core/model.js erwartet, gefunden ${calls.length}`];
  }
  const out = [];
  const src = (n) => n.getText(sf);
  const top = calls[0].arguments[0];
  // Kopien von VERSION / MIGRATION_KEY in js/core/model.js — synchron halten.
  const VERSION_LITERAL = /^\d+\.\d+$/;
  const MIGRATION_KEY = /^(0|\d+\.\d+)→(\d+\.\d+)$/;
  const keyOf = (p) => (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null);
  for (const p of top.properties) {
    const key = keyOf(p);
    if (key !== 'version' && key !== 'migrations') continue;
    // Kurzschreibweise, Methode, Getter: keine Zuweisung — die ganze Eigenschaft zeigen.
    const v = ts.isPropertyAssignment(p) ? p.initializer : p;
    if (key === 'version') {
      if (!(ts.isStringLiteral(v) && VERSION_LITERAL.test(v.text))) out.push(`${P} version muss ein String-Literal MAJOR.MINOR sein (${src(v)})`);
      continue;
    }
    if (!ts.isObjectLiteralExpression(v)) {
      out.push(`${P} migrations muss ein Objekt-Literal { 'a→b': <Import aus ./migrations.js> } sein (${src(v)})`);
      continue;
    }
    for (const m of v.properties) {
      if (!ts.isPropertyAssignment(m) || !ts.isStringLiteral(m.name) || !MIGRATION_KEY.test(m.name.text)) {
        out.push(`${P} migrations: Schlüssel ${src(m.name ?? m)} hat nicht die Form 'a→b'`);
        continue;
      }
      const step = m.initializer;
      if (!(ts.isIdentifier(step) && migrationImports.has(step.text))) out.push(`${P} migrations: Wert ${src(step)} ist kein Import aus ./migrations.js`);
    }
  }
  /** Name des Kommandos = Schlüssel der umgebenden PropertyAssignment. */
  const commandName = (call) => (ts.isPropertyAssignment(call.parent) && call.parent.name && 'text' in call.parent.name ? call.parent.name.text : '?');
  const check = (n, cmdName = null) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isNumericLiteral(n)) return;
    if ([ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(n.kind)) return;
    if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(n.operand)) return;
    if (ts.isIdentifier(n)) {
      if (migrationImports.has(n.text)) { out.push(`${P} Bezeichner ${n.text} aus ./migrations.js nur als Wert unter migrations erlaubt`); return; }
      if (!consts.has(n.text)) out.push(`${P} Bezeichner ${n.text} ist keine Konstante dieser Datei`);
      return;
    }
    if (ts.isArrayLiteralExpression(n)) {
      for (const el of n.elements) {
        if (ts.isSpreadElement(el)) out.push(`${P} Spread nicht erlaubt (${src(el)})`);
        else check(el);
      }
      return;
    }
    if (ts.isObjectLiteralExpression(n)) {
      for (const p of n.properties) {
        if (ts.isSpreadAssignment(p)) { out.push(`${P} Spread nicht erlaubt (${src(p)})`); continue; }
        if (p.name && ts.isComputedPropertyName(p.name)) { out.push(`${P} berechneter Schlüssel nicht erlaubt (${src(p.name)})`); continue; }
        const key = p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null;
        if (n === top && (key === 'version' || key === 'migrations')) continue;
        if (cmdName !== null && key === 'run') {
          if (ts.isMethodDeclaration(p)) continue;
          const v = ts.isPropertyAssignment(p) ? p.initializer : null;
          if (v && ts.isArrowFunction(v)) out.push(`${P} run von ${cmdName} ist eine Pfeilfunktion — this muss das reaktive Model sein`);
          else if (v && (ts.isFunctionExpression(v) || (ts.isIdentifier(v) && runImports.has(v.text)))) continue;
          else out.push(`${P} run von ${cmdName}: Funktion, Methode oder Import aus ./commands/ erwartet`);
          continue;
        }
        if (ts.isShorthandPropertyAssignment(p)) { out.push(`${P} Kurzschreibweise nicht erlaubt (${src(p)})`); continue; }
        if (!ts.isPropertyAssignment(p)) { out.push(`${P} Funktion nicht erlaubt (${src(p)}) — Callbacks nur als run`); continue; }
        check(p.initializer);
      }
      return;
    }
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) {
      out.push(`${P} Funktion nicht erlaubt (${src(n)}) — Callbacks nur als run`);
      return;
    }
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && ctors.has(n.expression.text) && ctors.get(n.expression.text) !== 'defineModel') {
      const isCommand = ctors.get(n.expression.text) === 'command';
      for (const a of n.arguments) {
        if (isCommand && ts.isObjectLiteralExpression(a)) check(a, commandName(n));
        else check(a);
      }
      return;
    }
    if (ts.isCallExpression(n)) {
      out.push(`${P} Aufruf ${src(n)} ist kein Konstruktor aus core/model.js`);
      return;
    }
    out.push(`${P} nicht erlaubt: ${src(n)}`);
  };
  check(top);
  return out;
}

/**
 * Specs, die einen Pfad lesen, samt Ort im Schema.
 * @param {object} s @param {string} at @param {Array<{ at: string, path: string }>} acc
 */
function collectPaths(s, at, acc) {
  if (s.kind === 'index' || s.kind === 'idOf') acc.push({ at, path: s.path });
  if (s.kind === 'list') collectPaths(s.item, at, acc);
  if (s.kind === 'record') collectPaths(s.value, at, acc);
  if (s.kind === 'object') for (const v of Object.values(s.shape)) collectPaths(v, at, acc);
}

/**
 * Gate Schema, Teil Pfade: das erste Segment eines Pfads ist ein Feld
 * oder Ansichtsfeld; `[name]` ist ein Parameter des Kommandos (ersatzweise
 * ein Feld).
 * @param {{ fields: object, view: object, commands: object }} schema
 * @returns {string[]}
 */
export function checkSchemaPaths(schema) {
  const P = SCHEMA_PREFIX;
  const known = new Set([...Object.keys(schema.fields), ...Object.keys(schema.view)]);
  const out = [];
  const verify = (at, path, params) => {
    let tokens;
    try { tokens = parsePath(path); } catch (err) { out.push(`${P} ${at}: ${err.message}`); return; }
    const [first, ...rest] = tokens;
    if (!known.has(first.name)) out.push(`${P} ${at}: Pfad ${path}: Feld ${first.name} gibt es nicht`);
    for (const t of rest) {
      if (t.kind === 'ref' && !params.has(t.name) && !known.has(t.name)) out.push(`${P} ${at}: Pfad ${path}: [${t.name}] ist weder Parameter noch Feld`);
    }
  };
  for (const part of ['fields', 'view']) {
    for (const [k, s] of Object.entries(schema[part])) {
      const acc = []; collectPaths(s, `${part}.${k}`, acc);
      for (const { at, path } of acc) verify(at, path, new Set());
    }
  }
  for (const [c, def] of Object.entries(schema.commands)) {
    const params = new Set(Object.keys(def.params ?? {}));
    for (const [p, s] of Object.entries(def.params ?? {})) {
      const acc = []; collectPaths(s, `commands.${c}.params.${p}`, acc);
      for (const { at, path } of acc) verify(at, path, params);
    }
  }
  return out;
}

/** Specs, an die `x-field` binden darf: nur Felder mit Regeln. */
export const RULE_KINDS = Object.freeze(['number', 'index', 'idOf', 'oneOf']);
const BINDING = /\b(x-model(?:\.[\w.]+)?|x-field|x-text)\s*=\s*"\s*model\.([A-Za-z_$][\w$]*)/g;

/**
 * Gate Template ↔ Schema: Bindungen zeigen auf Felder oder Ansichtsfelder,
 * `x-field` nur auf Felder mit Regeln.
 * @param {{ path: string, text: string }[]} files view.html und *.part.html
 * @param {{ fields: object, view: object }} schema
 * @returns {string[]}
 */
export function checkTemplateBindings(files, schema) {
  const all = { ...schema.fields, ...schema.view };
  const out = [];
  for (const { path, text } of files) {
    for (const m of text.matchAll(BINDING)) {
      const [, attr, name] = m;
      const shown = `${attr}="model.${name}"`;
      const spec = all[name];
      if (!spec) { out.push(`template: ${path}: ${shown}: ${name} ist weder Feld noch Ansichtsfeld`); continue; }
      if (attr === 'x-field' && !RULE_KINDS.includes(spec.kind)) {
        out.push(`template: ${path}: ${shown}: ${name} (${spec.kind}) hat keine Regeln — x-model verwenden`);
      }
    }
  }
  return out;
}

/** Ist `n` (PropertyAccess/ElementAccess) ein Ziel unterhalb von `this.model`? */
function isModelTarget(n) {
  let depth = 0;
  while (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) {
    if (ts.isPropertyAccessExpression(n) && n.expression.kind === ts.SyntaxKind.ThisKeyword && n.name.text === 'model') return depth > 0;
    n = n.expression;
    depth += 1;
  }
  return false;
}

/**
 * Gate Schreibweg: im Viewmodel keine Zuweisung an `this.model.…`.
 * @param {{ path: string, text: string }[]} files
 * @returns {string[]}
 */
export function checkWritePath(files) {
  const out = [];
  const HINT = '— über ein Kommando, instance.set oder x-model/x-field schreiben';
  for (const { path, text } of files) {
    if (!path.startsWith('viewmodel/') || !path.endsWith('.js')) continue;
    const sf = parseJs(path, text);
    const visit = (n) => {
      if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment && isModelTarget(n.left)) {
        out.push(`write: ${path}: ${n.left.getText(sf)} ${n.operatorToken.getText(sf)} … ${HINT}`);
      } else if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n))
        && (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken) && isModelTarget(n.operand)) {
        out.push(`write: ${path}: ${n.getText(sf)} ${HINT}`);
      } else if (ts.isDeleteExpression(n) && isModelTarget(n.expression)) {
        out.push(`write: ${path}: ${n.getText(sf)} ${HINT}`);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

/** @param {any} obj @param {string} path @returns {any} */
const at = (obj, path) => path.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);

/**
 * Gate Hilfe: Kontexthilfe für jedes Feld, jedes Kommando und jeden
 * Parameter, in de und en (der Teilbaum steht ohne das Präfix `modules.<id>`).
 * @param {{ fields: object, commands: object }} schema
 * @param {{ de: object|null, en: object|null }} help
 * @param {Record<string, { params?: object }>} [viewmodelCommands] Kommandos aus `createModule({ commands })`
 * @returns {string[]}
 */
export function checkContextHelp(schema, help, viewmodelCommands = {}) {
  const keys = [
    ...Object.keys(schema.fields).map((f) => `fields.${f}.help`),
    ...Object.entries({ ...schema.commands, ...viewmodelCommands }).flatMap(([c, def]) => [
      `actions.${c}.help`,
      ...Object.keys(def.params ?? {}).map((p) => `actions.${c}.params.${p}`),
    ]),
  ];
  const out = [];
  for (const lang of ['de', 'en']) {
    const file = `resources/i18n/context-help.${lang}.json`;
    if (!help[lang]) { out.push(`help: ${file}: Datei fehlt`); continue; }
    for (const k of keys) {
      const v = at(help[lang], k);
      if (typeof v !== 'string' || v.trim() === '') out.push(`help: ${file}: ${k} fehlt`);
    }
  }
  return out;
}

/**
 * Viewmodel-Kommandos aus `commands: { name: command({ params: { … } }) }`
 * in viewmodel/viewmodel.js, ohne das Viewmodel zu laden (es hängt an
 * Alpine und DOM). Was kein erkennbares Literal ist, bleibt außen vor.
 * @param {string} text Inhalt von viewmodel/viewmodel.js
 * @returns {Record<string, { params: Record<string, true> }>}
 */
export function readViewmodelCommands(text) {
  const sf = parseJs('viewmodel.js', text);
  const key = (p) => (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null);
  const prop = (obj, name) => obj.properties.find((p) => ts.isPropertyAssignment(p) && key(p) === name)?.initializer;
  const out = {};
  const visit = (n) => {
    const block = ts.isPropertyAssignment(n) && key(n) === 'commands' && ts.isObjectLiteralExpression(n.initializer) ? n.initializer : null;
    if (block) {
      for (const p of block.properties) {
        const name = ts.isPropertyAssignment(p) ? key(p) : null;
        const call = ts.isPropertyAssignment(p) ? p.initializer : null;
        if (!name || !ts.isCallExpression(call) || !ts.isIdentifier(call.expression) || call.expression.text !== 'command') continue;
        const arg = call.arguments[0];
        const params = arg && ts.isObjectLiteralExpression(arg) ? prop(arg, 'params') : null;
        out[name] = { params: {} };
        if (params && ts.isObjectLiteralExpression(params)) {
          for (const q of params.properties) { const k = ts.isPropertyAssignment(q) || ts.isShorthandPropertyAssignment(q) ? key(q) : null; if (k) out[name].params[k] = true; }
        }
      }
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** @param {string} file @returns {object|null} */
const readJson = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);

/** Blatt-Schlüsselpfade eines JSON-Baums (`a.b.c`). */
function leafPaths(v, at = '', acc = new Set()) {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, x] of Object.entries(v)) leafPaths(x, at ? `${at}.${k}` : k, acc);
  } else if (at) acc.add(at);
  return acc;
}

/**
 * ui-Texte: de und en müssen dieselben Blatt-Schlüssel haben. ModuleResources
 * lädt nur die aktive Sprache, der en-Fallback von `I18n.t` greift dort nicht.
 * @param {string} base Modulordner
 * @returns {string[]}
 */
export function checkUiTexts(base) {
  const dir = join(base, 'resources', 'i18n');
  const files = { de: join(dir, 'ui.de.json'), en: join(dir, 'ui.en.json') };
  if (!existsSync(files.de) && !existsSync(files.en)) return [];
  const out = [];
  const keys = {};
  for (const lang of ['de', 'en']) {
    if (!existsSync(files[lang])) { out.push(`ui: resources/i18n/ui.${lang}.json fehlt`); continue; }
    try { keys[lang] = leafPaths(JSON.parse(readFileSync(files[lang], 'utf8'))); }
    catch (err) { out.push(`ui: resources/i18n/ui.${lang}.json: kein gültiges JSON (${err.message})`); }
  }
  if (keys.de && keys.en) {
    for (const [from, to] of [['de', 'en'], ['en', 'de']]) {
      for (const k of [...keys[from]].sort()) {
        if (!keys[to].has(k)) out.push(`ui: resources/i18n/ui.${to}.json: Schlüssel fehlt: ${k}`);
      }
    }
  }
  return out;
}

const REF_TOKEN = /\{\{ref:([a-z0-9-]+)(?:\|[^}]+)?\}\}/gi;

/** Alle Strings eines JSON-Werts. @param {any} v @param {string[]} [acc] @returns {string[]} */
function allStrings(v, acc = []) {
  if (typeof v === 'string') acc.push(v);
  else if (Array.isArray(v)) v.forEach((x) => allStrings(x, acc));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => allStrings(x, acc));
  return acc;
}

/**
 * Gate Referenzen: jede `book`-Id steht in BOOKS, jede Referenz-Id ist im
 * Modul eindeutig. Liefert dazu die Ids für das Hilfe-Gate.
 * @param {string} base Modulordner
 * @param {Record<string, object>} [books]
 * @returns {{ findings: string[], ids: Set<string> }}
 */
export function checkReferenceFile(base, books = BOOKS) {
  const rel = 'resources/data/references.json';
  const file = readJson(join(base, ...rel.split('/')));
  const findings = [];
  const ids = new Set();
  for (const entry of file?.references ?? []) {
    let id = entry.id;
    if (Object.hasOwn(entry, 'book')) {
      if (!Object.hasOwn(books, entry.book)) {
        findings.push(`references: ${rel}: unbekanntes Buch: ${entry.book} (bekannt: ${Object.keys(books).sort().join(', ')})`);
        continue;
      }
      id = books[entry.book].id;
    }
    if (id === undefined) continue; // fehlende Id meldet das Schema
    if (ids.has(id)) findings.push(`references: ${rel}: Id doppelt: ${id}`);
    ids.add(id);
  }
  return { findings, ids };
}

/**
 * Gate Hilfe-Dateien: help.de.json und help.en.json haben dieselben
 * Abschnitte in derselben Reihenfolge; jedes {{ref:<id>}} steht in references.json.
 * @param {string} base Modulordner
 * @param {Set<string>} refIds  Ids aus checkReferenceFile
 * @returns {string[]}
 */
export function checkHelpFiles(base, refIds) {
  const files = { de: 'resources/i18n/help.de.json', en: 'resources/i18n/help.en.json' };
  const help = { de: readJson(join(base, ...files.de.split('/'))), en: readJson(join(base, ...files.en.split('/'))) };
  if (!help.de && !help.en) return [];
  const out = [];
  for (const lang of ['de', 'en']) if (!help[lang]) out.push(`help: ${files[lang]} fehlt`);
  if (help.de && help.en) {
    const de = Object.keys(help.de.sections ?? {});
    const en = Object.keys(help.en.sections ?? {});
    if (de.join('\n') !== en.join('\n')) {
      out.push(`help: ${files.en}: Abschnitte weichen von help.de.json ab (de: ${de.join(', ')}; en: ${en.join(', ')})`);
    }
  }
  for (const lang of ['de', 'en']) {
    const missing = new Set();
    for (const s of allStrings(help[lang])) {
      for (const m of s.matchAll(REF_TOKEN)) if (!refIds.has(m[1])) missing.add(m[1]);
    }
    for (const id of missing) out.push(`help: ${files[lang]}: {{ref:${id}}} fehlt in resources/data/references.json`);
  }
  return out;
}

/**
 * Alle Gates für ein umgestelltes Modul.
 * @param {string} appDir
 * @param {string} id
 * @param {{ moduleIds?: string[], exampleIds?: string[], exampleOwners?: Map<string, string> }} [ctx] Vorgabe: aus dem Baum
 * @returns {Promise<string[]>}
 */
export async function checkConvertedModule(appDir, id, ctx = {}) {
  const base = join(appDir, 'js', 'modules', id);
  const moduleIds = ctx.moduleIds ?? readdirSync(join(appDir, 'js', 'modules')).filter((d) => statSync(join(appDir, 'js', 'modules', d)).isDirectory());
  // Das geprüfte Modul sieht seine eigenen Beispiele schon vor dem Eintrag in CONVERTED_MODULES.
  const exampleOwners = ctx.exampleOwners ?? readExampleOwners(appDir, [...new Set([...CONVERTED_MODULES, id])]);
  const exampleIds = ctx.exampleIds ?? [...exampleOwners.keys()];
  const paths = listModuleFiles(appDir, id);
  const read = (p) => ({ path: p, text: readFileSync(join(base, p), 'utf8') });
  const js = paths.filter((p) => p.endsWith('.js') && p !== 'domain/model.types.js').map(read);
  const out = [...checkStructure(id, paths)];

  if (paths.includes('module.js')) {
    const text = readFileSync(join(base, 'module.js'), 'utf8');
    out.push(...checkDescriptor(id, text, { moduleIds, exampleIds, paths, exampleOwners }));
    const uses = parseDescriptor(text).fields.get('uses');
    out.push(...checkUses(js.filter((f) => f.path !== 'module.js'), Array.isArray(uses) ? uses : []));
  }
  out.push(...checkLayers(js));
  out.push(...checkWritePath(js));
  out.push(...checkUiTexts(base));
  const refs = checkReferenceFile(base);
  out.push(...refs.findings, ...checkHelpFiles(base, refs.ids));

  if (paths.includes('domain/model.js')) {
    const file = join(base, 'domain', 'model.js');
    out.push(...checkSchemaLiteral(readFileSync(file, 'utf8')));
    let schema = null;
    try {
      ({ schema } = await loadModelSchema(file));
    } catch (err) {
      out.push(`schema: domain/model.js: lässt sich nicht laden (${err.message})`);
    }
    if (schema) {
      out.push(...checkSchemaPaths(schema));
      const views = paths.filter((p) => p === 'resources/view.html' || /^resources\/[^/]+\.part\.html$/.test(p)).map(read);
      out.push(...checkTemplateBindings(views, schema));
      const vmFile = join(base, 'viewmodel', 'viewmodel.js');
      out.push(...checkContextHelp(schema, {
        de: readJson(join(base, 'resources', 'i18n', 'context-help.de.json')),
        en: readJson(join(base, 'resources', 'i18n', 'context-help.en.json')),
      }, existsSync(vmFile) ? readViewmodelCommands(readFileSync(vmFile, 'utf8')) : {}));
    }
  }
  return out;
}
