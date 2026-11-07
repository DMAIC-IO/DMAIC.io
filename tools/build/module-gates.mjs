/**
 * D.Mike — Gates der umgestellten Module (module-gates.mjs)
 *
 * Geprüft werden: Struktur, Beschreibung, `uses`, Layer, Schema,
 * Template ↔ Schema, Kommando-Bezüge, Schreibweg, Hilfe. Gilt NUR für Module in
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
import { parseFieldPath, keyFieldsOf } from '../../js/core/field-path.js';
import { loadModelSchema, loadSettingsSchema, loadFormSchemas, loadStateSchema } from './model-types.mjs';
import { checkWidgetBindings, loadWidgetSchemas } from './widget-gates.mjs';
import { BOOKS } from '../../js/core/references-books.js';
import { readExampleOwners } from './example-catalog.mjs';
import { CONVERTED_MODULES } from './converted-modules.mjs';
import { readViewmodelAsyncTasks, checkAsyncTaskRefs, checkAsyncTaskDecls, asyncTaskHelpKeys } from './async-task-gates.mjs';

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
      { re: /\/core\/(template-module|field-directive|async-task-directives)\.js$/, why: 'Viewmodel-Kern' },
      { re: /^(\.\.\/)+(viewmodel|interaction|io|tile|resources)\//, why: 'höhere Schicht' },
      { re: /\/widgets\/(?![a-z0-9-]+\/schema\.js$)/, why: 'aus js/widgets/ nur schema.js' },
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
 * `io/` ohne Alpine. Ein Befund je Datei und verbotenem Namen. Gemeint ist
 * der Dienst-Kontext des Moduls; `this.context` im Model ist der
 * Modellkontext (schlichte Werte wie der Zyklus) und erlaubt.
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
const WIDGET_SCHEMA_SPEC = /\/widgets\/[a-z0-9-]+\/schema\.js$/;
const CHART_COLORS_SPEC = /\/core\/chart\/chart-colors\.js$/;
/** Präfix aller Schema-Befunde. */
const SCHEMA_PREFIX = 'schema: domain/model.js:';

/**
 * Gate Schema, Teil Literal: `defineModel({ … })` ist ein reines Literal
 * (feste Schlüssel, Konstruktoren aus core/model.js, Literale, Konstanten
 * dieser Datei; Funktionen nur als `run`, `current`, `confirm` und — bei `defineModel` — als `default` (Vorgabe aus dem Kontext)). `version` ist ein String-Literal
 * `MAJOR.MINOR`; `migrations` nur `'a→b': <Import aus ./migrations.js>`.
 * @param {string} text Inhalt von domain/model.js
 * @param {{ define?: string, file?: string }} [opts] Aufruf und Datei (Vorgabe defineModel, domain/model.js); version/migrations nur bei defineModel
 * @returns {string[]}
 */
export function checkSchemaLiteral(text, { define = 'defineModel', file = 'domain/model.js' } = {}) {
  const P = `schema: ${file}:`;
  const sf = parseJs('model.js', text);
  const ctors = new Map(); // lokaler Name → importierter Name
  const runImports = new Set();
  const migrationImports = new Set();
  const consts = new Set();
  const widgetSchemas = new Set(); // Default-Importe von widgets/<name>/schema.js
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && st.importClause?.name && WIDGET_SCHEMA_SPEC.test(st.moduleSpecifier.text)) {
      widgetSchemas.add(st.importClause.name.text);
    }
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && st.importClause?.namedBindings && ts.isNamedImports(st.importClause.namedBindings)) {
      const spec = st.moduleSpecifier.text;
      for (const el of st.importClause.namedBindings.elements) {
        const imported = (el.propertyName ?? el.name).text;
        if (MODEL_SPEC.test(spec)) ctors.set(el.name.text, imported);
        else if (CHART_COLORS_SPEC.test(spec)) consts.add(el.name.text);
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
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && ctors.get(n.expression.text) === define) calls.push(n);
    ts.forEachChild(n, find);
  };
  find(sf);
  if (calls.length !== 1 || !calls[0].arguments[0] || !ts.isObjectLiteralExpression(calls[0].arguments[0])) {
    return [`${P} genau ein Aufruf ${define}({ … }) aus core/model.js erwartet, gefunden ${calls.length}`];
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
    if (define !== 'defineModel' || (key !== 'version' && key !== 'migrations')) continue;
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
  const HOOKS = ['run', 'current', 'confirm'];
  /** `invariants: { <name>: { fields: ['…'], test(m) { … } } }` am obersten Literal. */
  const checkInvariants = (p) => {
    const v = ts.isPropertyAssignment(p) ? p.initializer : null;
    if (!v || !ts.isObjectLiteralExpression(v)) {
      out.push(`${P} invariants muss ein Objekt-Literal { name: { fields: […], test(m) { … } } } sein (${src(p)})`);
      return;
    }
    for (const inv of v.properties) {
      const name = keyOf(inv) ?? '?';
      const body = ts.isPropertyAssignment(inv) ? inv.initializer : null;
      if (!body || !ts.isObjectLiteralExpression(body)) { out.push(`${P} invariants.${name} muss ein Objekt-Literal sein (${src(inv)})`); continue; }
      for (const q of body.properties) {
        const k = keyOf(q);
        if (k === 'test') {
          if (ts.isMethodDeclaration(q)) continue;
          const f = ts.isPropertyAssignment(q) ? q.initializer : null;
          if (f && ts.isArrowFunction(f)) out.push(`${P} test von invariants.${name} ist eine Pfeilfunktion — this muss das Model sein`);
          else if (!(f && ts.isFunctionExpression(f))) out.push(`${P} test von invariants.${name}: Funktion oder Methode erwartet`);
          continue;
        }
        if (k === 'fields' && ts.isPropertyAssignment(q) && ts.isArrayLiteralExpression(q.initializer)
          && q.initializer.elements.every((e) => ts.isStringLiteral(e))) continue;
        out.push(`${P} invariants.${name}: nur fields (String-Literale) und test erlaubt (${src(q)})`);
      }
    }
  };
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
        if (define === 'defineModel' && n === top && (key === 'version' || key === 'migrations')) continue;
        if (define === 'defineModel' && n === top && key === 'invariants') { checkInvariants(p); continue; }
        if (cmdName !== null && HOOKS.includes(key)) {
          if (ts.isMethodDeclaration(p)) continue;
          const v = ts.isPropertyAssignment(p) ? p.initializer : null;
          if (v && ts.isArrowFunction(v)) out.push(`${P} ${key} von ${cmdName} ist eine Pfeilfunktion — this muss das reaktive Model sein`);
          else if (v && (ts.isFunctionExpression(v) || (ts.isIdentifier(v) && runImports.has(v.text)))) continue;
          else out.push(`${P} ${key} von ${cmdName}: Funktion, Methode oder Import aus ./commands/ erwartet`);
          continue;
        }
        // Vorgabe aus dem Kontext des Models: (c) => … — reine Funktion, ihr Rumpf bleibt ungeprüft.
        if (define === 'defineModel' && key === 'default') {
          if (ts.isMethodDeclaration(p)) continue;
          const v = ts.isPropertyAssignment(p) ? p.initializer : null;
          if (v && (ts.isArrowFunction(v) || ts.isFunctionExpression(v))) continue;
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
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && ctors.has(n.expression.text) && ctors.get(n.expression.text) !== define) {
      const isCommand = ctors.get(n.expression.text) === 'command';
      for (const a of n.arguments) {
        if (isCommand && ts.isObjectLiteralExpression(a)) check(a, commandName(n));
        else check(a);
      }
      return;
    }
    // `<WidgetSchema>.edits()` — Bearbeitungsfeld eines Diagramm-Widgets, ohne Argumente.
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ts.isIdentifier(n.expression.expression)
        && widgetSchemas.has(n.expression.expression.text) && n.expression.name.text === 'edits' && n.arguments.length === 0) return;
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
export const RULE_KINDS = Object.freeze(['number', 'index', 'idOf', 'oneOf', 'date', 'time', 'phase', 'columnRef']);
const BINDING = /\b(x-model(?:\.[\w.]+)?|x-text)\s*=\s*"\s*model\.([A-Za-z_$][\w$]*)/g;
/** `x-field`/`x-set` auf ein Feld der obersten Ebene (Listenpfade: checkListBindings). */
const FIELD_BINDING = /\b(x-field|x-set)\s*=\s*"\s*model\.([A-Za-z_$][\w$]*)\s*"/g;

/**
 * Gate Template ↔ Schema: Bindungen zeigen auf Felder oder Ansichtsfelder,
 * `x-field` nur auf Felder mit Regeln.
 * @param {{ path: string, text: string }[]} files view.html und *.part.html
 * @param {{ fields: object, view: object }} schema
 * @param {Map<string, any>} [widgets] registrierte Widgets; eines mit passendem `forKind` macht das Feld für `x-field` bindbar
 * @returns {string[]}
 */
export function checkTemplateBindings(files, schema, widgets = new Map()) {
  const widgetKinds = new Set([...widgets.values()].map((w) => w.forKind).filter(Boolean));
  const all = { ...schema.fields, ...schema.view };
  const out = [];
  for (const { path, text } of files) {
    for (const m of [...text.matchAll(BINDING), ...text.matchAll(FIELD_BINDING)].sort((a, b) => a.index - b.index)) {
      const [, attr, name] = m;
      const shown = `${attr}="model.${name}"`;
      const spec = all[name];
      if (!spec) { out.push(`template: ${path}: ${shown}: ${name} ist weder Feld noch Ansichtsfeld`); continue; }
      const bindable = RULE_KINDS.includes(spec.kind) || (spec.kind === 'list' && spec.item?.kind === 'columnRef')
        || widgetKinds.has(spec.kind) || (spec.kind === 'list' && widgetKinds.has(spec.item?.kind));
      if (attr === 'x-field' && !bindable) {
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

/**
 * Der `view`-Block (Methode oder Eigenschaft `view` im createModule-Literal).
 * @param {string} text
 * @returns {import('typescript').Node|null}
 */
function findViewBlock(text) {
  const sf = ts.createSourceFile('viewmodel.js', text, ts.ScriptTarget.Latest, true);
  /** @type {import('typescript').Node|null} */
  let found = null;
  const visit = (n) => {
    if (found) return;
    if ((ts.isMethodDeclaration(n) || ts.isPropertyAssignment(n)) && n.name && ts.isIdentifier(n.name) && n.name.text === 'view') {
      found = n;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

const VIEW_FORBIDDEN = ['stateManager', 'getModuleState'];

/**
 * Gate Lesezugriff: im view-Block des Viewmodels und der Kachel (auch in `computed`) kein `stateManager`
 * und kein `getModuleState` — Arbeitsblätter nur über `ctx.data`, sonst
 * fehlt die Abhängigkeit und das Ergebnis veraltet.
 * @param {{ path: string, text: string }[]} files
 * @returns {string[]}
 */
export function checkViewReads(files) {
  const out = [];
  for (const { path, text } of files) {
    if (!path.startsWith('viewmodel/') && !path.startsWith('tile/')) continue;
    const view = findViewBlock(text);
    if (!view) continue;
    const seen = new Set();
    const visit = (n) => {
      if (ts.isIdentifier(n) && VIEW_FORBIDDEN.includes(n.text)) seen.add(n.text);
      ts.forEachChild(n, visit);
    };
    visit(view);
    for (const name of VIEW_FORBIDDEN) {
      if (seen.has(name)) out.push(`view: ${path}: ${name} im view-Block — Arbeitsblätter über ctx.data lesen`);
    }
  }
  return out;
}

const PICKER_CLASS = /\.(col-picker[\w-]*)/g;

/**
 * Gate Picker-Vertrag: das Modul-CSS greift nicht in den Spalten-Picker.
 * @param {{ path: string, text: string }|null} css resources/style.css
 * @returns {string[]}
 */
export function checkPickerCss(css) {
  if (!css) return [];
  const names = [...new Set([...css.text.matchAll(PICKER_CLASS)].map((m) => m[1]))];
  return names.map((n) => `css: ${css.path}: .${n} — Klassen des Pickers nicht stylen, nur das Wirtselement`);
}

const CHART_BINDING = /\bx-chart\s*=\s*"([^"]*)"/g;

/**
 * Die Namen des view-Blocks nach Herkunft: Getter (überall im Block),
 * `computed`-Schlüssel und Datenglieder (Eigenschaften mit Bezeichner-Schlüssel
 * am zurückgegebenen Objekt, ausgenommen `computed`).
 * @param {string} text Quelltext von viewmodel.js oder einer Kachel
 * @returns {{ getters: string[], computed: string[], data: string[] }}
 */
export function viewNamesDetailOf(text) {
  const getters = new Set();
  const computed = new Set();
  const data = new Set();
  const view = findViewBlock(text);
  if (!view) return { getters: [], computed: [], data: [] };
  let top = null; // das Objekt, das der view-Block liefert
  const visit = (n) => {
    if (ts.isGetAccessorDeclaration(n) && ts.isIdentifier(n.name)) getters.add(n.name.text);
    if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && n.name.text === 'computed'
        && ts.isObjectLiteralExpression(n.initializer)) {
      for (const p of n.initializer.properties) if (p.name && ts.isIdentifier(p.name)) computed.add(p.name.text);
    }
    if (!top && ts.isReturnStatement(n) && n.expression && ts.isObjectLiteralExpression(n.expression)) top = n.expression;
    ts.forEachChild(n, visit);
  };
  visit(view);
  if (!top && ts.isPropertyAssignment(view) && ts.isObjectLiteralExpression(view.initializer)) top = view.initializer;
  for (const p of top?.properties ?? []) {
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text !== 'computed') data.add(p.name.text);
  }
  return { getters: [...getters], computed: [...computed], data: [...data] };
}

/** Alle Namen, die ein Template aus dem view-Block lesen darf. @param {string} text @returns {Set<string>} */
export function viewNamesOf(text) {
  const { getters, computed, data } = viewNamesDetailOf(text);
  return new Set([...getters, ...computed, ...data]);
}

/**
 * Gate x-chart: die Direktive ist abgelöst, Diagramme laufen über Diagramm-Widgets.
 * @param {{ path: string, text: string }[]} templates
 * @returns {string[]}
 */
export function checkChartBindings(templates) {
  const out = [];
  for (const { path, text } of templates) {
    for (const [, raw] of text.matchAll(CHART_BINDING)) {
      out.push(`template: ${path}: x-chart="${raw}": x-chart ist abgelöst — x-widget mit einem Diagramm-Widget verwenden`);
    }
  }
  return out;
}

/** @param {any} obj @param {string} path @returns {any} */
const at = (obj, path) => path.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);

const STATE_FIELD = /\bx-(?:field|set)\s*=\s*"\s*state\.([A-Za-z_$][\w$]*)\s*"/g;

/**
 * Die UI-State-Felder, die ein Template per `x-field`/`x-set` (`state.<name>`) bindet.
 * @param {{ path: string, text: string }[]} files Templates unter resources/
 * @returns {string[]} Namen, sortiert, ohne Doppel
 */
export function readStateBindings(files) {
  const names = new Set();
  for (const { text } of files) for (const m of text.matchAll(STATE_FIELD)) names.add(m[1]);
  return [...names].sort();
}

/**
 * Gate Hilfe: Kontexthilfe für jedes Feld, jedes Kommando und jeden
 * Parameter, in de und en (der Teilbaum steht ohne das Präfix `modules.<id>`).
 * UI-State-Felder brauchen Hilfe nur, wenn ein Template sie per `x-field` bindet.
 * @param {{ fields: object, commands: object }} schema
 * @param {{ de: object|null, en: object|null }} help
 * @param {Record<string, { params?: object }>} [viewmodelCommands] Kommandos aus `createModule({ commands })`
 * @param {string[]} [stateFields] per `x-field="state.<name>"` gebundene UI-State-Felder
 * @param {string[]} [formKeys] Hilfeschlüssel der Formularfelder (formHelpKeys)
 * @returns {string[]}
 */
export function checkContextHelp(schema, help, viewmodelCommands = {}, stateFields = [], formKeys = []) {
  const keys = [
    ...Object.keys(schema.fields).map((f) => `fields.${f}.help`),
    ...Object.entries({ ...schema.commands, ...viewmodelCommands }).flatMap(([c, def]) => [
      `actions.${c}.help`,
      ...Object.keys(def.params ?? {}).map((p) => `actions.${c}.params.${p}`),
    ]),
    ...stateFields.map((f) => `state.${f}.help`),
    ...formKeys,
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
 * Gate Hilfe, Teil Kachel: je Einstellung `tile.settings.<name>.help` in
 * `context-help.<lang>.json`, eine Beschriftung (`tile.settings.<name>.label`
 * in `ui.<lang>.json` oder `dashboard.tileSettings.<name>` in
 * `i18n/<lang>.json`) und bei `oneOf` jeder Optionstext
 * `tile.settings.<name>.options.<wert>` in `ui.<lang>.json`.
 * @param {Record<string, any>} fields Felder aus `defineSettings`
 * @param {{ help: { de: object|null, en: object|null }, ui: { de: object|null, en: object|null },
 *   global: { de: object|null, en: object|null } }} texts
 * @returns {string[]}
 */
export function checkTileSettings(fields, { help, ui, global }) {
  const has = (tree, key) => { const v = at(tree, key); return typeof v === 'string' && v.trim() !== ''; };
  const out = [];
  for (const lang of ['de', 'en']) {
    for (const [name, s] of Object.entries(fields)) {
      const base = `tile.settings.${name}`;
      if (!has(help[lang], `${base}.help`)) out.push(`help: resources/i18n/context-help.${lang}.json: ${base}.help fehlt`);
      if (!has(ui[lang], `${base}.label`) && !has(global[lang], `dashboard.tileSettings.${name}`)) {
        out.push(`help: ${base}: Beschriftung fehlt (${lang}) — ${base}.label in resources/i18n/ui.${lang}.json oder dashboard.tileSettings.${name} in i18n/${lang}.json`);
      }
      if (s.kind === 'oneOf') {
        for (const v of s.values) if (!has(ui[lang], `${base}.options.${v}`)) out.push(`help: resources/i18n/ui.${lang}.json: ${base}.options.${v} fehlt`);
      }
    }
  }
  return out;
}

const FORM_BLOCK = /<form\b([^>]*)>([\s\S]*?)<\/form>/g;
/** Wörtliches Attribut (nicht `:gebunden`) aus einem Attributtext. */
const plainAttr = (attrs, name) => attrs.match(new RegExp(`(?:^|\\s)${name}="\\s*([^"]*?)\\s*"`))?.[1] ?? null;
const X_PARAM = /\sx-param="\s*([^"]*?)\s*"/g;
const COMMAND_ATTRS = ['x-command', 'x-command-form', 'data-dialog-command', 'data-dialog-delete'];

/**
 * Die Kommando-Formulare der Templates: `<form … x-command-form="cmd" [data-form="Name"]>`
 * mit den `x-param`-Namen darin. Formulare sind in HTML nie verschachtelt.
 * @param {{ path: string, text: string }[]} files Templates unter resources/
 * @returns {{ path: string, command: string, form: string|null, params: string[] }[]}
 */
export function readCommandForms(files) {
  const out = [];
  for (const { path, text } of files) {
    for (const m of text.matchAll(FORM_BLOCK)) {
      const command = plainAttr(m[1], 'x-command-form');
      if (command === null) continue;
      out.push({ path, command, form: plainAttr(m[1], 'data-form'), params: [...m[2].matchAll(X_PARAM)].map((p) => p[1]) });
    }
  }
  return out;
}

/**
 * Gate Kommando-Bezüge: `x-command`, `x-command-form`, `data-dialog-command`,
 * `data-dialog-delete` nennen ein Kommando des Models; `data-form` einen
 * Export aus viewmodel/forms.js; `x-param` einen Parameter des Kommandos
 * bzw. ein Feld des Formulars.
 * @param {{ path: string, text: string }[]} files
 * @param {{ commands: Record<string, { params: object }> }} schema
 * @param {Record<string, { fields: object }>} formSchemas Name → Schema
 * @returns {string[]}
 */
export function checkCommandRefs(files, schema, formSchemas) {
  const out = [];
  const commands = Object.keys(schema.commands);
  for (const { path, text } of files) {
    for (const attr of COMMAND_ATTRS) {
      for (const m of text.matchAll(new RegExp(`\\s${attr}="\\s*([^"]*?)\\s*"`, 'g'))) {
        if (!commands.includes(m[1])) out.push(`command: ${path}: ${attr}="${m[1]}": kein Kommando des Models`);
      }
    }
    for (const m of text.matchAll(/\sdata-form="\s*([^"]*?)\s*"/g)) {
      if (!Object.hasOwn(formSchemas, m[1])) out.push(`command: ${path}: data-form="${m[1]}": kein Export aus viewmodel/forms.js`);
    }
  }
  for (const { path, command, form, params } of readCommandForms(files)) {
    const cmdParams = schema.commands[command]?.params;
    const fields = form !== null ? formSchemas[form]?.fields : cmdParams;
    if (!cmdParams || !fields) continue;
    for (const p of params) {
      if (!Object.hasOwn(fields, p)) out.push(`command: ${path}: x-param="${p}": ${form !== null ? `kein Feld von ${form}` : `kein Parameter von ${command}`}`);
    }
  }
  return out;
}

const LIST_BINDING = /\b(x-field|x-set)\s*=\s*"\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[[^\]"]*\])+)\s*"/g;
const X_FOR = /\bx-for\s*=\s*"\s*\(?\s*([A-Za-z_$][\w$]*)[^"]*?\s+in\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*"/g;

/**
 * Gate Template ↔ Schema, Teil Listen: `x-field`/`x-set` auf Feldern in
 * Listeneinträgen — `model.<liste>[i].<feld>` und `<eintrag>.<feld>` mit
 * `<eintrag>` aus `x-for="… in model.<liste>"` (auch verschachtelt). Prüft
 * Feld gegen die Element-Spec und Schlüsselfelder (`idOf`); liefert die
 * Pflichtanker `fields.<liste>.<feld>.help`.
 * @param {{ path: string, text: string }[]} files Templates unter resources/
 * @param {{ fields: object, view: object, commands: object }} schema
 * @returns {{ findings: string[], helpKeys: string[] }}
 */
export function checkListBindings(files, schema) {
  const all = { ...schema.fields, ...schema.view };
  const keys = keyFieldsOf(schema);
  const findings = [];
  const helpKeys = new Set();
  for (const { path, text } of files) {
    /** @type {{ alias: string, at: number, spec: any, listPath: string }[]} */
    const loops = [];
    /** Nächstliegende vorangehende Schleife mit diesem Eintragsnamen (Dokumentreihenfolge). */
    const aliasAt = (name, pos) => loops.findLast((l) => l.alias === name && l.at < pos);
    for (const { 1: alias, 2: source, index: at } of text.matchAll(X_FOR)) {
      const [head, ...rest] = source.split('.');
      let spec;
      let listPath;
      if (head === 'model' && rest.length > 0) {
        spec = all[rest[0]];
        listPath = rest[0];
        for (const seg of rest.slice(1)) { spec = spec?.kind === 'object' ? spec.shape[seg] : undefined; listPath += `.${seg}`; }
      } else if (rest.length === 1 && aliasAt(head, at)) {
        const a = aliasAt(head, at);
        spec = a.spec.item.shape[rest[0]];
        listPath = `${a.listPath}[].${rest[0]}`;
      }
      if (spec?.kind === 'list' && spec.item?.kind === 'object') loops.push({ alias, at, spec, listPath });
    }
    for (const { 1: attr, 2: expr, index: pos } of text.matchAll(LIST_BINDING)) {
      const shown = `${attr}="${expr}"`;
      let parsed;
      try { parsed = parseFieldPath(expr); } catch (err) { findings.push(`template: ${path}: ${shown}: ${err.message}`); continue; }
      const { root, steps, field } = parsed;
      if (root === 'state' || (root === 'model' && steps.length === 0)) continue;
      let spec;
      let listPath;
      if (root === 'model') {
        const [first, ...rest] = steps;
        spec = first.kind === 'name' ? all[first.name] : undefined;
        let p = first.kind === 'name' ? first.name : '';
        for (const st of rest) {
          if (st.kind === 'index' && spec?.kind === 'list') { spec = spec.item; p += '[]'; }
          else if (st.kind === 'name' && spec?.kind === 'object' && Object.hasOwn(spec.shape, st.name)) { spec = spec.shape[st.name]; p += `.${st.name}`; }
          else { spec = undefined; break; }
        }
        listPath = p.replace(/\[\]$/, '');
      } else if (steps.length === 0 && aliasAt(root, pos)) {
        const a = aliasAt(root, pos);
        ({ listPath } = a);
        spec = a.spec.item;
      } else {
        findings.push(`template: ${path}: ${shown}: ${root} ist weder model, state noch ein Eintrag einer Modell-Liste aus x-for`);
        continue;
      }
      if (spec?.kind !== 'object' || !Object.hasOwn(spec.shape, field)) { findings.push(`template: ${path}: ${shown}: ${field} passt nicht zum Schema`); continue; }
      if (keys.get(listPath)?.has(field)) { findings.push(`template: ${path}: ${shown}: ${field} ist der Schlüssel von ${listPath}`); continue; }
      helpKeys.add(`fields.${listPath.replace(/\[\]/g, '')}.${field}.help`);
    }
  }
  return { findings, helpKeys: [...helpKeys].sort() };
}

const TAG = /<([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const DEFAULT_ARG = /(?:^|\s):?data-default-arg-([\w-]+)=/g;
const camel = (kebabName) => kebabName.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/**
 * Gate Kommando-Bezüge, Teil Startwerte: jedes `data-default-arg-<p>` (auch
 * gebunden, `:data-default-arg-<p>`) an `<form x-command-form>` oder an einem
 * `x-dialog`-Knopf nennt einen Parameter des Kommandos und steht nicht
 * zugleich als `data-arg-<p>`.
 * @param {{ path: string, text: string }[]} files @param {{ commands: object }} schema
 * @returns {string[]}
 */
export function checkDefaultArgRefs(files, schema) {
  const out = [];
  for (const { path, text } of files) {
    const formCommand = new Map();
    for (const [, tag, attrs] of text.matchAll(TAG)) {
      if (tag !== 'form') continue;
      const ref = plainAttr(attrs, 'x-ref');
      const cmd = plainAttr(attrs, 'x-command-form');
      if (ref && cmd) formCommand.set(ref, cmd);
    }
    for (const [, tag, attrs] of text.matchAll(TAG)) {
      const names = [...attrs.matchAll(DEFAULT_ARG)].map((m) => m[1]);
      if (names.length === 0) continue;
      const dialogRef = attrs.match(/(?:^|\s)x-dialog(?:\.[\w]+)*="\s*([^"]*?)\s*"/)?.[1] ?? null;
      const cmd = tag === 'form' ? plainAttr(attrs, 'x-command-form')
        : dialogRef !== null ? (plainAttr(attrs, 'data-dialog-command') ?? formCommand.get(dialogRef) ?? null) : null;
      const params = cmd ? schema.commands[cmd]?.params : undefined;
      if (!params) continue;
      for (const k of names) {
        const p = camel(k);
        if (!Object.hasOwn(params, p)) { out.push(`command: ${path}: data-default-arg-${k}: kein Parameter von ${cmd}`); continue; }
        if (new RegExp(`(?:^|\\s):?data-arg-${k}=`).test(attrs)) out.push(`command: ${path}: data-default-arg-${k}: ${p} steht auch als data-arg-${k}`);
      }
    }
  }
  return out;
}

const GROUP_OPEN = /<([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*\b(x-set|x-param)\s*=\s*"([^"]*)"(?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const FORM_CONTROLS = new Set(['input', 'select', 'textarea']);

/** Inhalt eines Elements ab `from` bis zu seinem schließenden Tag (gleichnamige Tags gezählt). */
function elementBody(html, from, tag) {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
  re.lastIndex = from;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(from, m.index);
  }
  return html.slice(from);
}

/**
 * Gate Knopfgruppen: in einer Gruppe (`x-set`/`x-param` an einem Element,
 * das kein Eingabefeld ist) trägt jede Option (`<button>` mit `value` oder
 * `:value`) `role="radio"`; `<input type="radio">` braucht keine Rolle.
 * @param {{ path: string, text: string }[]} files @returns {string[]}
 */
export function checkChoiceGroups(files) {
  const out = [];
  for (const { path, text } of files) {
    for (const m of text.matchAll(GROUP_OPEN)) {
      const [whole, tag, , attr, value] = m;
      if (FORM_CONTROLS.has(tag.toLowerCase())) continue;
      const body = elementBody(text, m.index + whole.length, tag);
      for (const [, optTag, optAttrs] of body.matchAll(/<(button|input)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g)) {
        if (!/(?:^|\s):?value=/.test(optAttrs)) continue;
        if (optTag === 'input' && /(?:^|\s)type="radio"/.test(optAttrs)) continue;
        if (/(?:^|\s)role="radio"/.test(optAttrs)) continue;
        const shownOpt = `<${optTag}${optAttrs.replace(/\s*type="button"/, '')}>`;
        out.push(`template: ${path}: ${attr}="${value}": Option ${shownOpt.replace(/\s+/g, ' ')} ohne role="radio"`);
      }
    }
  }
  return out;
}

/**
 * Hilfeschlüssel der Formularfelder: ein Feld mit `data-form`, das kein
 * Parameter des Kommandos ist, braucht `forms.<Name>.<feld>.help`.
 * @param {ReturnType<typeof readCommandForms>} commandForms
 * @param {{ commands: Record<string, { params: object }> }} schema
 * @param {Record<string, { fields: object }>} formSchemas
 * @returns {string[]} sortiert, ohne Doppel
 */
export function formHelpKeys(commandForms, schema, formSchemas) {
  const keys = new Set();
  for (const { command, form, params } of commandForms) {
    if (form === null || !formSchemas[form]) continue;
    const cmdParams = schema.commands[command]?.params ?? {};
    for (const p of params) {
      if (Object.hasOwn(formSchemas[form].fields, p) && !Object.hasOwn(cmdParams, p)) keys.add(`forms.${form}.${p}.help`);
    }
  }
  return [...keys].sort();
}

/**
 * Die literalen `key: '…'` in den `confirm`-Haken von domain/model.js.
 * @param {string} text Inhalt von domain/model.js
 * @returns {string[]} in Fundreihenfolge, ohne Doppel
 */
export function readConfirmKeys(text) {
  const keys = new Set();
  const nameOf = (n) => (n.name && (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name)) ? n.name.text : null);
  const visit = (n, inside) => {
    const isConfirm = (ts.isMethodDeclaration(n) || ts.isPropertyAssignment(n)) && nameOf(n) === 'confirm';
    const now = inside || isConfirm;
    if (now && ts.isPropertyAssignment(n) && nameOf(n) === 'key' && ts.isStringLiteral(n.initializer)) keys.add(n.initializer.text);
    ts.forEachChild(n, (c) => visit(c, now));
  };
  visit(parseJs('model.js', text), false);
  return [...keys];
}

/**
 * Gate UI-Texte, Teil Invarianten: je Invariante `invariants.<name>` in
 * `ui.de.json` und `ui.en.json` (Text der Ablehnung am Feld).
 * @param {{ invariants?: Record<string, object> }} schema
 * @param {{ de: object|null, en: object|null }} ui
 * @returns {string[]}
 */
export function checkInvariantTexts(schema, ui) {
  const out = [];
  for (const name of Object.keys(schema.invariants ?? {})) {
    for (const lang of ['de', 'en']) {
      const v = ui[lang]?.invariants?.[name];
      if (typeof v !== 'string' || v.trim() === '') out.push(`ui: resources/i18n/ui.${lang}.json: invariants.${name} fehlt`);
    }
  }
  return out;
}

/**
 * Gate Rückfragetexte: jeder confirm-Schlüssel steht in ui.de.json und ui.en.json.
 * @param {string[]} keys aus readConfirmKeys
 * @param {{ de: object|null, en: object|null }} ui
 * @returns {string[]}
 */
export function checkConfirmKeys(keys, ui) {
  const out = [];
  for (const lang of ['de', 'en']) {
    for (const k of keys) {
      const v = ui[lang] ? at(ui[lang], k) : undefined;
      if (typeof v !== 'string' || v.trim() === '') out.push(`command: domain/model.js: confirm-Schlüssel ${k} fehlt in resources/i18n/ui.${lang}.json`);
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
  const GENERATED = ['domain/model.types.js', 'viewmodel/state.types.js', 'viewmodel/forms.types.js', 'tile/settings.types.js'];
  const js = paths.filter((p) => p.endsWith('.js') && !GENERATED.includes(p) && !/\.bindings\.js$/.test(p)).map(read);
  const out = [...checkStructure(id, paths)];

  if (paths.includes('module.js')) {
    const text = readFileSync(join(base, 'module.js'), 'utf8');
    out.push(...checkDescriptor(id, text, { moduleIds, exampleIds, paths, exampleOwners }));
    const uses = parseDescriptor(text).fields.get('uses');
    out.push(...checkUses(js.filter((f) => f.path !== 'module.js'), Array.isArray(uses) ? uses : []));
  }
  out.push(...checkLayers(js));
  out.push(...checkWritePath(js));
  out.push(...checkViewReads(js));
  out.push(...checkAsyncTaskDecls(js));
  const cssPath = 'resources/style.css';
  out.push(...checkPickerCss(paths.includes(cssPath) ? read(cssPath) : null));
  const chartTemplates = paths.filter((p) => /^resources\/[^/]+\.html$/.test(p)).map(read);
  out.push(...checkChartBindings(chartTemplates));
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
      const widgets = ctx.widgets ?? await loadWidgetSchemas(appDir);
      out.push(...checkTemplateBindings(views, schema, widgets));
      const vmFile = join(base, 'viewmodel', 'viewmodel.js');
      const templates = paths.filter((p) => /^resources\/[^/]+\.html$/.test(p)).map(read);
      let formSchemas = {};
      if (paths.includes('viewmodel/forms.js')) {
        try {
          formSchemas = Object.fromEntries((await loadFormSchemas(join(base, 'viewmodel', 'forms.js'))).map(({ name, schema: s }) => [name, s]));
        } catch (err) {
          out.push(`command: viewmodel/forms.js: lässt sich nicht laden (${err.message})`);
        }
      }
      let stateSchema = null;
      if (paths.includes('viewmodel/state.js')) {
        try {
          ({ schema: stateSchema } = await loadStateSchema(join(base, 'viewmodel', 'state.js')));
        } catch (err) {
          out.push(`state: viewmodel/state.js: lässt sich nicht laden (${err.message})`);
        }
      }
      const tileText = (p) => (paths.includes(p) ? readFileSync(join(base, p), 'utf8') : '');
      const vmNames = paths.includes('viewmodel/viewmodel.js') ? viewNamesOf(tileText('viewmodel/viewmodel.js')) : new Set();
      out.push(...checkWidgetBindings(templates.filter((f) => !/^resources\/tile(\.|$)/.test(f.path)), { widgets, schema, stateSchema, viewNames: vmNames }));
      for (const f of templates) {
        const m = /^resources\/tile(?:\.([a-z0-9-]+))?\.html$/.exec(f.path);
        if (m) out.push(...checkWidgetBindings([f], { widgets, schema, stateSchema: null, viewNames: viewNamesOf(tileText(`tile/${m[1] ?? 'tile'}.js`)) }));
      }
      out.push(...checkCommandRefs(templates, schema, formSchemas));
      const asyncTasks = existsSync(vmFile) ? readViewmodelAsyncTasks(readFileSync(vmFile, 'utf8')) : {};
      out.push(...checkAsyncTaskRefs(templates, asyncTasks));
      const lists = checkListBindings(templates, schema);
      out.push(...lists.findings, ...checkDefaultArgRefs(templates, schema), ...checkChoiceGroups(templates));
      out.push(...checkConfirmKeys(readConfirmKeys(readFileSync(file, 'utf8')), {
        de: readJson(join(base, 'resources', 'i18n', 'ui.de.json')),
        en: readJson(join(base, 'resources', 'i18n', 'ui.en.json')),
      }));
      out.push(...checkInvariantTexts(schema, {
        de: readJson(join(base, 'resources', 'i18n', 'ui.de.json')),
        en: readJson(join(base, 'resources', 'i18n', 'ui.en.json')),
      }));
      out.push(...checkContextHelp(schema, {
        de: readJson(join(base, 'resources', 'i18n', 'context-help.de.json')),
        en: readJson(join(base, 'resources', 'i18n', 'context-help.en.json')),
      }, existsSync(vmFile) ? readViewmodelCommands(readFileSync(vmFile, 'utf8')) : {}, readStateBindings(templates),
      [...formHelpKeys(readCommandForms(templates), schema, formSchemas), ...lists.helpKeys, ...asyncTaskHelpKeys(asyncTasks)]));
    }
  }
  if (paths.includes('tile/settings.js')) {
    const file = join(base, 'tile', 'settings.js');
    out.push(...checkSchemaLiteral(readFileSync(file, 'utf8'), { define: 'defineSettings', file: 'tile/settings.js' }));
    let settings = null;
    try {
      settings = await loadSettingsSchema(file);
    } catch (err) {
      out.push(`schema: tile/settings.js: lässt sich nicht laden (${err.message})`);
    }
    if (settings) {
      const i18nFile = (name) => readJson(join(base, 'resources', 'i18n', name));
      out.push(...checkTileSettings(settings.schema.fields, {
        help: { de: i18nFile('context-help.de.json'), en: i18nFile('context-help.en.json') },
        ui: { de: i18nFile('ui.de.json'), en: i18nFile('ui.en.json') },
        global: { de: readJson(join(appDir, 'i18n', 'de.json')), en: readJson(join(appDir, 'i18n', 'en.json')) },
      }));
    }
  }
  return out;
}
