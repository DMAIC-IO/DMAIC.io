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
import { TAG, camel, keyOf, parseJs, bodyEnd, X_FOR, xForAliases } from './template-scan.mjs';
import { parsePath, VERSION, MIGRATION_KEY } from '../../js/core/model.js';
import { parseFieldPath, keyFieldsOf } from '../../js/core/field-path.js';
import { loadModelSchema, loadSettingsSchema, loadFormSchemas, loadStateSchema } from './model-types.mjs';
import { checkWidgetBindings, checkAlgoLinkLiterals, loadAlgoIds, loadWidgetSchemas } from './widget-gates.mjs';
import { factoryArgument, findViewBlock, viewPartNodes, unresolvedViewParts, viewNamesDetailOf, viewNamesOf, viewMemberNamesOf, computedNamesOf, resolvePart } from './view-names.mjs';
export { viewNamesDetailOf, viewNamesOf, computedNamesOf };
import { BOOKS } from '../../js/core/references-books.js';
import { readExampleOwners } from './example-catalog.mjs';
import { CONVERTED_MODULES } from './converted-modules.mjs';
import { VIEW_READ_EXEMPTIONS } from './view-read-exemptions.mjs';
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

export { parseJs };

const DIRS = ['domain', 'viewmodel', 'interaction', 'io', 'tile', 'resources'];
const REQUIRED_FILES = ['module.js', 'domain/model.js', 'viewmodel/viewmodel.js', 'resources/view.html'];
const RESOURCE_TOP = /^(view\.html|[a-z0-9-]+\.part\.html|style\.css|tile(\.[a-z0-9-]+)?\.html)$/;
const I18N_FILE = /^((ui|help|context-help)\.(de|en)|copies)\.json$/;

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
        if (parts.length !== 3 || !I18N_FILE.test(name)) bad('unter resources/i18n/ nur ui|help|context-help.<de|en>.json und copies.json');
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

const DESCRIPTOR_KEYS = ['id', 'version', 'icon', 'phase', 'group', 'cycles', 'allowedPhases', 'singleton', 'hiddenFromMenu', 'uses', 'exampleRefs', 'load', 'tile', 'redact'];
const REQUIRED_KEYS = ['id', 'version', 'icon', 'load'];
const LOADERS = { load: /^\.\/viewmodel\/viewmodel\.js$/, tile: /^\.\/tile\/[a-z0-9-]+\.js$/, redact: /^\.\/domain\/[a-z0-9-]+\.js$/ };
const LOADER_EXPECTED = { load: './viewmodel/viewmodel.js', tile: './tile/<name>.js', redact: './domain/<name>.js' };
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
 * Das Arbeitsblatt: Besitzer der Arbeitsblätter. Das Gate `uses` gilt ihm
 * nicht — es ist Besitzer des Formats, kein Nutzer. Für den Lesezugriff gilt
 * nur die enge Ausnahme in `view-read-exemptions.mjs`.
 */
const WORKSHEET_OWNER = 'worksheet';

/**
 * Gate `uses` vollständig: wer das Datenformat des Worksheets nutzt,
 * erklärt `uses: ['worksheet']`. Ein Befund je Datei (erster Treffer).
 * @param {{ path: string, text: string }[]} files .js-Dateien des Moduls
 * @param {string[]} uses aus module.js
 * @param {string} [id] Modul-id
 * @returns {string[]}
 */
export function checkUses(files, uses, id = '') {
  // Das Arbeitsblatt selbst ist der Besitzer des Formats, kein Nutzer.
  if (id === WORKSHEET_OWNER || uses.includes('worksheet')) return [];
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
    globals: ['document', 'window', 'Alpine', 'context', 'globalThis', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB', 'HTMLElement', 'fetch'],
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
 * Namen, die in einer Funktion bzw. auf Dateiebene deklariert sind
 * (Parameter, Variablen, Funktionen, Klassen, Importe, catch-Bindungen).
 * Keine volle Bindungsanalyse: ein Name gilt in der ganzen umschließenden
 * Funktion als lokal, auch über Blockgrenzen hinweg (konservativ).
 * @param {import('typescript').SourceFile} sf
 * @returns {Map<import('typescript').Node, Set<string>>} Funktion/Datei → Namen
 */
function declaredNames(sf) {
  const byScope = new Map([[sf, new Set()]]);
  const owner = (n) => {
    for (let p = n.parent; p; p = p.parent) if (ts.isFunctionLike(p) || ts.isSourceFile(p)) return p;
    return sf;
  };
  const add = (scope, name) => {
    if (!byScope.has(scope)) byScope.set(scope, new Set());
    if (ts.isIdentifier(name)) { byScope.get(scope).add(name.text); return; }
    if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
      for (const el of name.elements) if (!ts.isOmittedExpression(el)) add(scope, el.name);
    }
  };
  const visit = (n) => {
    if (ts.isParameter(n)) add(owner(n), n.name);
    else if (ts.isVariableDeclaration(n)) add(owner(n), n.name);
    else if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) && n.name) add(owner(n), n.name);
    else if (ts.isImportClause(n) && n.name) add(sf, n.name);
    else if (ts.isImportSpecifier(n) || ts.isNamespaceImport(n)) add(sf, n.name);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return byScope;
}

/** Ist `id` in einer umschließenden Funktion oder auf Dateiebene deklariert? */
function isDeclaredLocally(id, byScope) {
  for (let p = id.parent; p; p = p.parent) {
    if ((ts.isFunctionLike(p) || ts.isSourceFile(p)) && byScope.get(p)?.has(id.text)) return true;
  }
  return false;
}

/**
 * Gate Layer: `domain/` ohne Alpine, DOM, UI, Kontext, höhere Schichten;
 * `io/` ohne Alpine. Ein Befund je Datei und verbotenem Namen. Gemeint ist
 * der Dienst-Kontext des Moduls; `this.context` im Model ist der
 * Modellkontext (schlichte Werte wie der Zyklus) und erlaubt. Ein Name, der in
 * der Datei als Parameter, Variable oder Import deklariert ist, ist kein Global.
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
    const declared = declaredNames(sf);
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
      if (ts.isIdentifier(n) && rule.globals.includes(n.text) && isFreeIdentifier(n) && !isDeclaredLocally(n, declared)) {
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
/** Kommandogruppe eines großen Models: `commands: { ...cellCommands }` aus `./commands-<teil>.js`, dort geprüft wie `commands`. */
const COMMAND_PART_SPEC = /^\.\/commands-[a-z0-9-]+\.js$/;
/** Geschwisterdatei in domain/: ihre Formen (`<NAME>_SHAPE`) gelten als Konstanten, ihr Initialisierer wird dort als Literal geprüft. */
const SIBLING_SPEC = /^\.\/(?!migrations\.js$)[a-z0-9-]+\.js$/;
const SHAPE_NAME = /^[A-Z][A-Z0-9_]*_SHAPE$/;
/** Präfix aller Schema-Befunde. */
const SCHEMA_PREFIX = 'schema: domain/model.js:';

/**
 * Was ein Schema-Literal einer Datei nutzen darf: Konstruktoren aus
 * core/model.js, Importe aus ./commands/ und ./migrations.js,
 * Kommandogruppen aus ./commands-<teil>.js, Formen `<NAME>_SHAPE` aus
 * Geschwistern, Konstanten mit Literal-Initialisierer, Widget-Schemata.
 * @param {import('typescript').SourceFile} sf
 */
function literalScope(sf) {
  const ctors = new Map(); // lokaler Name → importierter Name
  const runImports = new Set();
  const migrationImports = new Set();
  /** @type {Map<string, { spec: string, name: string }>} */
  const commandParts = new Map();
  /** @type {Map<string, { spec: string, name: string }>} */
  const shapes = new Map();
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
        // Große Models (Arbeitsblatt): Kommandogruppen aus ./commands-<teil>.js, Formen aus Geschwisterdateien.
        else if (COMMAND_PART_SPEC.test(spec)) commandParts.set(el.name.text, { spec, name: imported });
        else if (SIBLING_SPEC.test(spec) && SHAPE_NAME.test(imported)) {
          consts.add(el.name.text);
          shapes.set(el.name.text, { spec, name: imported });
        }
      }
    }
    const decl = ts.isVariableStatement(st) ? st.declarationList : null;
    if (decl && (decl.flags & ts.NodeFlags.Const)) {
      for (const d of decl.declarations) if (ts.isIdentifier(d.name) && d.initializer && !ts.isCallExpression(d.initializer)
          && !ts.isArrowFunction(d.initializer) && !ts.isFunctionExpression(d.initializer) && !ts.isClassExpression(d.initializer)) consts.add(d.name.text);
    }
  }
  return { ctors, runImports, migrationImports, commandParts, shapes, consts, widgetSchemas };
}

/**
 * Der Initialisierer von `export const <name> = …` auf oberster Ebene.
 * @param {import('typescript').SourceFile} sf @param {string} name
 * @returns {import('typescript').Expression|null}
 */
function exportedConst(sf, name) {
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st) || !st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === name) return d.initializer ?? null;
  }
  return null;
}

/**
 * Gate Schema, Teil Literal: `defineModel({ … })` ist ein reines Literal
 * (feste Schlüssel, Konstruktoren aus core/model.js, Literale, Konstanten
 * dieser Datei und Formen `<NAME>_SHAPE` aus Geschwisterdateien `./<name>.js`;
 * in `commands` dazu Spreads von Kommandogruppen aus `./commands-<teil>.js`.
 * Beides wird in der Geschwisterdatei geprüft (über `readSibling`): die
 * Kommandogruppe als exportiertes Objekt-Literal `{ name: command({ … }) }`,
 * die Form als exportiertes Objekt-Literal (auch in `Object.freeze`), Formen
 * dort wieder rekursiv;
 * Funktionen nur als `run`, `current`, `confirm` und — bei `defineModel` — als `default` (Vorgabe aus dem Kontext)). `version` ist ein String-Literal
 * `MAJOR.MINOR`; `migrations` nur `'a→b': <Import aus ./migrations.js>`.
 * @param {string} text Inhalt von domain/model.js
 * @param {{ define?: string, file?: string, readSibling?: (path: string) => (string|null) }} [opts] Aufruf und Datei
 *   (Vorgabe defineModel, domain/model.js; version/migrations nur bei defineModel); `readSibling` liest eine
 *   Geschwisterdatei in domain/ (`./x.js`) oder liefert `null`
 * @returns {string[]}
 */
export function checkSchemaLiteral(text, { define = 'defineModel', file = 'domain/model.js', readSibling = () => null } = {}) {
  const P = `schema: ${file}:`;
  const sf = parseJs('model.js', text);
  const scope = literalScope(sf);
  const { ctors, migrationImports } = scope;

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
  const commandsProp = define === 'defineModel' ? top.properties.find((p) => keyOf(p) === 'commands') : undefined;
  const commandsLiteral = commandsProp && ts.isPropertyAssignment(commandsProp) && ts.isObjectLiteralExpression(commandsProp.initializer)
    ? commandsProp.initializer : null;
  for (const p of top.properties) {
    const key = keyOf(p);
    if (define !== 'defineModel' || (key !== 'version' && key !== 'migrations')) continue;
    // Kurzschreibweise, Methode, Getter: keine Zuweisung — die ganze Eigenschaft zeigen.
    const v = ts.isPropertyAssignment(p) ? p.initializer : p;
    if (key === 'version') {
      if (!(ts.isStringLiteral(v) && VERSION.test(v.text))) out.push(`${P} version muss ein String-Literal MAJOR.MINOR sein (${src(v)})`);
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
  /** `invariants: { <name>: { fields: ['…'], test(m) { … }, repair?(m) { … } } }` am obersten Literal. */
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
        if (k === 'repair') {
          if (ts.isMethodDeclaration(q)) continue;
          const f = ts.isPropertyAssignment(q) ? q.initializer : null;
          if (!(f && (ts.isFunctionExpression(f) || ts.isArrowFunction(f)))) out.push(`${P} repair von invariants.${name}: Funktion oder Methode erwartet`);
          continue;
        }
        if (k === 'fields' && ts.isPropertyAssignment(q) && ts.isArrayLiteralExpression(q.initializer)
          && q.initializer.elements.every((e) => ts.isStringLiteral(e))) continue;
        // Nur beim Laden geprüft (O(n)-Invarianten, Ruling R9).
        if (k === 'onLoad' && ts.isPropertyAssignment(q) && q.initializer.kind === ts.SyntaxKind.TrueKeyword) continue;
        out.push(`${P} invariants.${name}: nur fields (String-Literale), test, repair und onLoad: true erlaubt (${src(q)})`);
      }
    }
  };
  /** `derived: { <name>(src, d) { … } }` am obersten Literal: Methoden oder `function`-Ausdrücke, `this` ist das Model. */
  const checkDerived = (p) => {
    const v = ts.isPropertyAssignment(p) ? p.initializer : null;
    if (!v || !ts.isObjectLiteralExpression(v)) {
      out.push(`${P} derived muss ein Objekt-Literal { name(src, d) { … } } sein (${src(p)})`);
      return;
    }
    for (const e of v.properties) {
      if (ts.isSpreadAssignment(e)) { out.push(`${P} derived: Spread nicht erlaubt (${src(e)})`); continue; }
      const name = keyOf(e) ?? '?';
      const fn = ts.isMethodDeclaration(e) ? e : (ts.isPropertyAssignment(e) ? e.initializer : null);
      if (fn && (ts.isMethodDeclaration(fn) || ts.isFunctionExpression(fn)) && (fn.asteriskToken || fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword))) {
        out.push(`${P} derived.${name}: async oder Generator nicht erlaubt — eine Ableitung ist synchron`);
        continue;
      }
      if (ts.isMethodDeclaration(e)) continue;
      const f = ts.isPropertyAssignment(e) ? e.initializer : null;
      if (f && ts.isArrowFunction(f)) out.push(`${P} derived.${name} ist eine Pfeilfunktion — this muss das Model sein`);
      else if (!(f && ts.isFunctionExpression(f))) out.push(`${P} derived.${name}: Funktion oder Methode erwartet (${src(e)})`);
    }
  };
  /** `derivedBulk: ['a', …]` am obersten Literal. */
  const checkDerivedBulk = (p) => {
    const v = ts.isPropertyAssignment(p) ? p.initializer : null;
    if (!(v && ts.isArrayLiteralExpression(v) && v.elements.every((e) => ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)))) {
      out.push(`${P} derivedBulk muss ein Array aus Textliteralen sein (${v ? src(v) : src(p)})`);
    }
  };
  /**
   * Prüfer eines Literals in einer Datei (`domain/model.js` oder einer Geschwisterdatei).
   * `used` sammelt die Formen und Kommandogruppen, die das Literal einbindet.
   */
  const makeCheck = ({ sf: csf, P, scope: { ctors, runImports, migrationImports, commandParts, shapes, consts, widgetSchemas }, top, commandsLiteral, used }) => {
    const src = (n) => n.getText(csf);
    const check = (n, cmdName = null, spec = false) => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isNumericLiteral(n)) return;
      if ([ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(n.kind)) return;
      if (ts.isPrefixUnaryExpression(n) && n.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(n.operand)) return;
      if (ts.isIdentifier(n)) {
        if (migrationImports.has(n.text)) { out.push(`${P} Bezeichner ${n.text} aus ./migrations.js nur als Wert unter migrations erlaubt`); return; }
        if (!consts.has(n.text)) out.push(`${P} Bezeichner ${n.text} ist keine Konstante dieser Datei`);
        else if (shapes.has(n.text)) used.add(shapes.get(n.text));
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
          if (ts.isSpreadAssignment(p) && n === commandsLiteral && ts.isIdentifier(p.expression) && commandParts.has(p.expression.text)) {
            used.add(commandParts.get(p.expression.text));
            continue;
          }
          if (ts.isSpreadAssignment(p)) { out.push(`${P} Spread nicht erlaubt (${src(p)})`); continue; }
          if (p.name && ts.isComputedPropertyName(p.name)) { out.push(`${P} berechneter Schlüssel nicht erlaubt (${src(p.name)})`); continue; }
          const key = p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null;
          if (define === 'defineModel' && n === top && (key === 'version' || key === 'migrations')) continue;
          if (define === 'defineModel' && n === top && key === 'invariants') { checkInvariants(p); continue; }
          if (define === 'defineModel' && n === top && key === 'derived') { checkDerived(p); continue; }
          if (define === 'defineModel' && n === top && key === 'derivedBulk') { checkDerivedBulk(p); continue; }
          if (spec && (key === 'version' || key === 'migrations')) { out.push(`${P} ${key} nur am obersten ${define}-Literal erlaubt (${src(p)})`); continue; }
          if (cmdName !== null && HOOKS.includes(key)) {
            if (key === 'run' && isAsyncRun(p)) { out.push(`${P} command ${cmdName}: async run — use asyncTask`); continue; }
            if (ts.isMethodDeclaration(p)) continue;
            const v = ts.isPropertyAssignment(p) ? p.initializer : null;
            if (v && ts.isArrowFunction(v)) out.push(`${P} ${key} von ${cmdName} ist eine Pfeilfunktion — this muss das reaktive Model sein`);
            else if (v && (ts.isFunctionExpression(v) || (ts.isIdentifier(v) && runImports.has(v.text)))) continue;
            else out.push(`${P} ${key} von ${cmdName}: Funktion, Methode oder Import aus ./commands/ erwartet`);
            continue;
          }
          // Vorgabe aus dem Kontext des Models: (c) => … — reine Funktion, ihr Rumpf bleibt ungeprüft.
          if (spec && define === 'defineModel' && key === 'default') {
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
        // Die Form von object(shape, opts) ist eine Feldliste wie `fields`: `version` ist dort ein Feldname.
        const isShape = (a, i) => i === 0 && ctors.get(n.expression.text) === 'object' && ts.isObjectLiteralExpression(a);
        n.arguments.forEach((a, i) => {
          if (isCommand && ts.isObjectLiteralExpression(a)) check(a, commandName(n));
          else check(a, null, !isCommand && !isShape(a, i));
        });
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
    return check;
  };
  /** @type {Set<{ spec: string, name: string }>} */
  const used = new Set();
  const check = makeCheck({ sf, P, scope, top, commandsLiteral, used });
  check(top);
  // Kommandogruppen und Formen aus Geschwisterdateien: dort als Literal prüfen, Formen rekursiv.
  const done = new Set();
  const follow = (refs, from) => {
    for (const ref of refs) {
      const key = `${ref.spec}#${ref.name}`;
      if (done.has(key)) continue;
      done.add(key);
      const text = readSibling(ref.spec);
      if (text == null) { out.push(`${from} ${ref.name} aus ${ref.spec} nicht lesbar`); continue; }
      const sibling = `schema: domain/${ref.spec.slice(2)}:`;
      const ssf = parseJs(ref.spec.slice(2), text);
      const isShape = SHAPE_NAME.test(ref.name);
      let init = exportedConst(ssf, ref.name);
      if (isShape && init && ts.isCallExpression(init) && init.arguments.length === 1 && init.expression.getText(ssf) === 'Object.freeze') init = init.arguments[0];
      if (!init || !ts.isObjectLiteralExpression(init)) {
        out.push(`${sibling} ${ref.name} muss ein exportiertes Objekt-Literal sein${isShape ? ' (auch in Object.freeze)' : ''}`);
        continue;
      }
      const inner = new Set();
      makeCheck({ sf: ssf, P: sibling, scope: literalScope(ssf), top: null, commandsLiteral: null, used: inner })(init);
      follow(inner, sibling);
    }
  };
  follow(used, P);
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
  if (s.kind === 'map') { collectPaths(s.key, at, acc); collectPaths(s.value, at, acc); }
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
const BINDING = /\b(x-model(?:\.[\w.]+)?|x-text)\s*=\s*["']\s*model\.([A-Za-z_$][\w$]*)/g;
/** `x-field`/`x-set` auf ein Feld der obersten Ebene (Listenpfade: checkListBindings). */
const FIELD_BINDING = /\b(x-field|x-set)\s*=\s*(["'])\s*model\.([A-Za-z_$][\w$]*)\s*\2/g;

/**
 * Getter und Methoden (nicht statisch) der Klassen in `domain/model.js`, die
 * von `defineModel(…)` erben — im Template lesbar, aber kein Bindungsziel.
 * @param {string} text
 * @returns {Set<string>}
 */
export function modelMembersOf(text) {
  const out = new Set();
  const sf = parseJs('domain/model.js', text);
  const extendsModel = (c) => (c.heritageClauses ?? []).some((h) => h.types.some((t) => ts.isCallExpression(t.expression)
    && ts.isIdentifier(t.expression.expression) && t.expression.expression.text === 'defineModel'));
  const visit = (n) => {
    if ((ts.isClassDeclaration(n) || ts.isClassExpression(n)) && extendsModel(n)) {
      for (const m of n.members) {
        const isStatic = m.modifiers?.some((x) => x.kind === ts.SyntaxKind.StaticKeyword);
        if ((ts.isGetAccessorDeclaration(m) || ts.isMethodDeclaration(m)) && !isStatic && m.name && ts.isIdentifier(m.name)) out.add(m.name.text);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/**
 * Gate Template ↔ Schema: Bindungen zeigen auf Felder oder Ansichtsfelder,
 * `x-field` nur auf Felder mit Regeln.
 * @param {{ path: string, text: string }[]} files view.html und *.part.html
 * @param {{ fields: object, view: object }} schema
 * @param {Map<string, any>} [widgets] registrierte Widgets; eines mit passendem `forKind` macht das Feld für `x-field` bindbar
 * @param {Set<string>} [members] Getter/Methoden der Model-Klasse (modelMembersOf) — lesbar für x-text, nicht bindbar
 * @returns {string[]}
 */
export function checkTemplateBindings(files, schema, widgets = new Map(), members = new Set()) {
  const widgetKinds = new Set([...widgets.values()].map((w) => w.forKind).filter(Boolean));
  const all = { ...schema.fields, ...schema.view };
  const out = [];
  for (const { path, text } of files) {
    const hits = [
      ...[...text.matchAll(BINDING)].map((m) => ({ index: m.index, attr: m[1], name: m[2] })),
      ...[...text.matchAll(FIELD_BINDING)].map((m) => ({ index: m.index, attr: m[1], name: m[3] })),
    ].sort((a, b) => a.index - b.index);
    for (const { index, attr, name } of hits) {
      const shown = `${attr}="model.${name}"`;
      const spec = all[name];
      if (!spec && members.has(name)) {
        if (attr !== 'x-text') out.push(`template: ${path}: ${shown}: ${name} ist ein Getter oder eine Methode der Model-Klasse — nur lesbar`);
        continue;
      }
      if (!spec) { out.push(`template: ${path}: ${shown}: ${name} ist weder Feld noch Ansichtsfeld`); continue; }
      const bindable = RULE_KINDS.includes(spec.kind) || (spec.kind === 'list' && spec.item?.kind === 'columnRef')
        || widgetKinds.has(spec.kind) || (spec.kind === 'list' && spec.item?.kind === 'columnRef' && widgetKinds.has('columnRef'));
      if (attr === 'x-field' && !bindable) {
        out.push(`template: ${path}: ${shown}: ${name} (${spec.kind}) hat keine Regeln — x-model verwenden`);
      } else if (attr === 'x-field' && widgetKinds.has(spec.kind)) {
        // Ein Widget besitzt sein Wirtselement; auf einem Eingabefeld wirft x-field zur Laufzeit.
        const tag = /^<([a-z][a-z0-9-]*)/i.exec(text.slice(text.lastIndexOf('<', index)))?.[1]?.toLowerCase();
        if (tag === 'input' || tag === 'select' || tag === 'textarea') {
          out.push(`template: ${path}: ${shown}: ${name} (${spec.kind}) braucht ein Wirtselement (div), kein <${tag}>`);
        }
      }
    }
  }
  return out;
}

/** Mutierende Array-Methoden: ein Aufruf auf einem Model-Ziel schreibt am Kommando vorbei. */
const MUTATORS = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin']);
/** Knoten, die einen eigenen Gültigkeitsbereich für `const`/`let`/Parameter öffnen. */
const isScope = (n) => ts.isBlock(n) || ts.isFunctionLike(n) || ts.isForStatement(n) || ts.isForOfStatement(n) || ts.isForInStatement(n) || ts.isCaseBlock(n) || ts.isCatchClause(n);
const isThisModel = (n) => ts.isPropertyAccessExpression(n) && n.expression.kind === ts.SyntaxKind.ThisKeyword && n.name.text === 'model';
/** Methoden, die ein Element der Liste liefern — das Ergebnis ist selbst ein Model-Objekt. */
const ELEMENT_METHODS = new Set(['find', 'findLast', 'at']);
/** Methoden, deren Callback als ersten Parameter ein Element der Liste bekommt. */
const CALLBACK_METHODS = new Set(['forEach', 'map', 'filter', 'find', 'findLast', 'some', 'every', 'flatMap']);

/**
 * Ist `n` ein Aufruf einer der `methods` auf einem Model-Ziel
 * (`this.model.items.find(…)`, `alias.forEach(…)`)?
 * @param {import('typescript').Node} n
 * @param {Set<string>} methods
 * @param {(name: string) => boolean} isAlias
 */
function callsOnModel(n, methods, isAlias) {
  return ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
    && methods.has(n.expression.name.text) && refersToModel(n.expression.expression, isAlias, true);
}

/**
 * Zeigt `n` auf das Model oder einen Pfad darunter? Ein Alias ist ein
 * Bezeichner, der mit `this.model` oder einem Pfad darunter initialisiert
 * wurde. Ein Listenelement (`this.model.items.find(…)`, `.at(…)`) liegt
 * immer unter dem Model. Ohne `root` zählt nur ein Pfad *unter* `this.model`/dem Alias
 * (Zuweisungsziel), mit `root` auch `this.model`/der Alias selbst
 * (Empfänger eines Aufrufs, Initialisierer eines Alias).
 * @param {import('typescript').Node} n
 * @param {(name: string) => boolean} isAlias
 * @param {boolean} [root]
 */
function refersToModel(n, isAlias, root = false) {
  let depth = 0;
  while (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n) || ts.isParenthesizedExpression(n)) {
    if (isThisModel(n)) return root || depth > 0;
    if (!ts.isParenthesizedExpression(n)) depth += 1;
    n = n.expression;
  }
  if (callsOnModel(n, ELEMENT_METHODS, isAlias)) return true;
  if (n.kind === ts.SyntaxKind.ThisKeyword) return isAlias('this') && (root || depth > 0);
  return ts.isIdentifier(n) && isAlias(n.text) && (root || depth > 0);
}

/**
 * Gate Schreibweg: in `viewmodel/` und `tile/` keine Zuweisung an das Model
 * — weder über `this.model.…` noch über einen Alias (`const m = this.model`,
 * `const { list } = this.model`), auch nicht über mutierende Aufrufe
 * (`push`, `splice`, …, `Object.assign(<Model-Ziel>, …)`). Listenelemente
 * zählen mit: Ergebnisse von `find`/`findLast`/`at`, `for…of`-Variablen und
 * erste Callback-Parameter von `forEach`/`map`/… auf einem Model-Ziel sind
 * Aliase. Eine Kopie (`this.model.items.slice()`) ist keiner.
 * @param {{ path: string, text: string }[]} files
 * @returns {string[]}
 */
export function checkWritePath(files) {
  const out = [];
  const HINT = '— über ein Kommando, instance.set oder x-model/x-field schreiben';
  for (const { path, text } of files) {
    const inDerived = path === 'domain/model.js';
    if (!(path.startsWith('viewmodel/') || path.startsWith('tile/') || inDerived) || !path.endsWith('.js')) continue;
    const sf = parseJs(path, text);
    /** Je Gültigkeitsbereich: Name → ist Alias auf das Model. */
    const scopes = [new Map()];
    const isAlias = (name) => {
      for (let i = scopes.length - 1; i >= 0; i -= 1) if (scopes[i].has(name)) return scopes[i].get(name);
      return false;
    };
    const declare = (name, alias) => {
      if (ts.isIdentifier(name)) { scopes.at(-1).set(name.text, alias); return; }
      for (const el of name.elements) if (!ts.isOmittedExpression(el)) declare(el.name, alias);
    };
    const target = (n) => refersToModel(n, isAlias);
    /** `for (const it of <Model-Ziel>)`: die Schleifenvariable ist ein Listenelement. */
    const elementSource = (decl) => ts.isVariableDeclarationList(decl.parent) && ts.isForOfStatement(decl.parent.parent)
      && decl.parent.parent.initializer === decl.parent && refersToModel(decl.parent.parent.expression, isAlias, true);
    /** Erster Parameter eines Callbacks von `forEach`, `map`, … auf einem Model-Ziel. */
    const isElementCallback = (param) => {
      const fn = param.parent;
      return fn.parameters[0] === param && ts.isCallExpression(fn.parent) && fn.parent.arguments[0] === fn
        && callsOnModel(fn.parent, CALLBACK_METHODS, isAlias);
    };
    /** Die Funktionen unter `derived: { … }` im `defineModel`-Literal: dort ist `this` das Model. */
    const derivedFns = [];
    const findDerived = (n) => {
      if (ts.isPropertyAssignment(n) && keyOf(n) === 'derived' && ts.isObjectLiteralExpression(n.initializer)) {
        for (const e of n.initializer.properties) {
          const f = ts.isPropertyAssignment(e) ? e.initializer : e;
          if (ts.isMethodDeclaration(f) || ts.isFunctionExpression(f)) derivedFns.push(f);
        }
        return;
      }
      ts.forEachChild(n, findDerived);
    };
    const visit = (n) => {
      const scoped = isScope(n);
      if (scoped) scopes.push(new Map());
      if (ts.isVariableDeclaration(n)) declare(n.name, elementSource(n) || (!!n.initializer && refersToModel(n.initializer, isAlias, true)));
      else if (ts.isParameter(n)) declare(n.name, isElementCallback(n));
      if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment && target(n.left)) {
        out.push(`write: ${path}: ${n.left.getText(sf)} ${n.operatorToken.getText(sf)} … ${HINT}`);
      } else if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n))
        && (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken) && target(n.operand)) {
        out.push(`write: ${path}: ${n.getText(sf)} ${HINT}`);
      } else if (ts.isDeleteExpression(n) && target(n.expression)) {
        out.push(`write: ${path}: ${n.getText(sf)} ${HINT}`);
      } else if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
        const callee = n.expression;
        if (MUTATORS.has(callee.name.text) && refersToModel(callee.expression, isAlias, true)) {
          out.push(`write: ${path}: ${callee.getText(sf)}(…) ${HINT}`);
        } else if (ts.isIdentifier(callee.expression) && callee.expression.text === 'Object' && callee.name.text === 'assign'
          && n.arguments[0] && refersToModel(n.arguments[0], isAlias, true)) {
          out.push(`write: ${path}: Object.assign(${n.arguments[0].getText(sf)}, …) ${HINT}`);
        }
      }
      ts.forEachChild(n, visit);
      if (scoped) scopes.pop();
    };
    if (inDerived) {
      findDerived(sf);
      for (const fn of derivedFns) {
        scopes.length = 0;
        scopes.push(new Map([['this', true]]));
        visit(fn);
      }
    } else visit(sf);
  }
  return out;
}

/**
 * Die `run`-Glieder der `asyncTasks`-Deklarationen (Namen aus readViewmodelAsyncTasks).
 * @param {string} text
 * @returns {Array<[string, import('typescript').Node]>}
 */
function asyncTaskRuns(text) {
  const names = Object.keys(readViewmodelAsyncTasks(text));
  const arg = factoryArgument(ts.createSourceFile('viewmodel.js', text, ts.ScriptTarget.Latest, true));
  const block = arg?.properties.find((p) => ts.isPropertyAssignment(p) && keyOf(p) === 'asyncTasks');
  if (!block || !ts.isPropertyAssignment(block) || !ts.isObjectLiteralExpression(block.initializer)) return [];
  const out = [];
  for (const p of block.initializer.properties) {
    const name = ts.isPropertyAssignment(p) ? keyOf(p) : null;
    if (!name || !names.includes(name) || !ts.isCallExpression(p.initializer)) continue;
    const def = p.initializer.arguments[0];
    const run = def && ts.isObjectLiteralExpression(def) ? def.properties.find((q) => (ts.isMethodDeclaration(q) || ts.isPropertyAssignment(q)) && keyOf(q) === 'run') : null;
    if (run) out.push([name, run]);
  }
  return out;
}

/**
 * Gate Verlauf: `history` in `createModule({ … })` ist `true` oder ein Objekt mit
 * `depth` (ganze Zahl ≥ 1) und/oder `mode: 'inverse'` (Verlauf mit Umkehrung, P4).
 * @param {string} text Text des Viewmodels
 * @param {string} [file]
 * @returns {string[]}
 */
export function checkHistoryOption(text, file = 'viewmodel/viewmodel.js') {
  const arg = factoryArgument(ts.createSourceFile('viewmodel.js', text, ts.ScriptTarget.Latest, true));
  const prop = arg?.properties.find((p) => ts.isPropertyAssignment(p) && keyOf(p) === 'history');
  if (!prop || !ts.isPropertyAssignment(prop)) return [];
  const value = literalValue(prop.initializer);
  const keys = value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : null;
  const ok = value === true
    || (keys !== null && keys.length > 0 && keys.every((k) => k === 'depth' || k === 'mode')
      && (!keys.includes('depth') || (Number.isInteger(value.depth) && value.depth >= 1))
      && (!keys.includes('mode') || value.mode === 'inverse'));
  return ok ? [] : [`history: ${file}: history ist true oder { depth?: ganze Zahl ≥ 1, mode?: 'inverse' }`];
}

/**
 * Gate module_reads_ctx_data: der Dienst `ctx.data` ist abgelöst. Kein `ctx.data`,
 * kein `context.data` und kein Parameter `data` in den Funktionen unter
 * `derived: { … }` — fremde Instanzen liest `derived(src, d)` über `src.read`
 * und `core/source-columns.js`, das Viewmodel über `ctx.source`.
 * @param {{ path: string, text: string }[]} files
 * @returns {string[]}
 */
export function checkCtxDataReads(files) {
  const out = [];
  for (const { path, text } of files) {
    const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const seen = new Set();
    const visit = (n) => {
      if (ts.isPropertyAccessExpression(n) && n.name.text === 'data' && ts.isIdentifier(n.expression)
        && (n.expression.text === 'ctx' || n.expression.text === 'context')) {
        const msg = `module_reads_ctx_data: ${path}: ${n.expression.text}.data — über ctx.source / src.read lesen`;
        if (!seen.has(msg)) { seen.add(msg); out.push(msg); }
      }
      if (ts.isVariableDeclaration(n) && ts.isObjectBindingPattern(n.name) && n.initializer
        && ts.isIdentifier(n.initializer) && (n.initializer.text === 'ctx' || n.initializer.text === 'context')
        && n.name.elements.some((el) => (el.propertyName ?? el.name).getText() === 'data')) {
        const msg = `module_reads_ctx_data: ${path}: ${n.initializer.text}.data — über ctx.source / src.read lesen`;
        if (!seen.has(msg)) { seen.add(msg); out.push(msg); }
      }
      if (ts.isPropertyAssignment(n) && keyOf(n) === 'derived' && ts.isObjectLiteralExpression(n.initializer)) {
        for (const e of n.initializer.properties) {
          const fn = ts.isMethodDeclaration(e) ? e : (ts.isPropertyAssignment(e) ? e.initializer : null);
          if (!fn || !(ts.isMethodDeclaration(fn) || ts.isFunctionExpression(fn) || ts.isArrowFunction(fn))) continue;
          if (fn.parameters.some((q) => ts.isIdentifier(q.name) && q.name.text === 'data')) {
            out.push(`module_reads_ctx_data: ${path}: derived.${keyOf(e) ?? '?'} hat einen Parameter data — derived(src, d) liest über src.read`);
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

const VIEW_FORBIDDEN = ['stateManager', 'getModuleState'];

/**
 * Gate Lesezugriff: im view-Block des Viewmodels und der Kachel (auch in `computed`) kein `stateManager`
 * und kein `getModuleState` — Arbeitsblätter nur über `ctx.source`, sonst
 * fehlt die Abhängigkeit und das Ergebnis veraltet. Ein view-Block aus
 * Teilen wird Teil für Teil geprüft, auch Teile aus anderen Dateien des Moduls.
 * Ausnahmen (`view-read-exemptions.mjs`) gelten je Datei, oberstem Glied des
 * Teils und Name; eine Ausnahme, die nichts trifft, ist ein Befund.
 * @param {{ path: string, text: string }[]} files
 * @param {string} [base] Modulordner, um Teile aus Importen zu lesen
 * @param {import('./view-read-exemptions.mjs').ViewReadExemption[]} [exemptions]
 * @returns {string[]}
 */
export function checkViewReads(files, base, exemptions = []) {
  const out = [];
  const used = new Set();
  /** Datei des Knotens relativ zum Modulordner (ohne Ordner: der Dateiname). */
  const fileOf = (n) => {
    const name = n.getSourceFile().fileName;
    return base && name.startsWith(`${base}/`) ? name.slice(base.length + 1) : name;
  };
  /** Das äußerste benannte Glied unterhalb von `root` (Methode, Getter, Eigenschaft). */
  const memberOf = (n, root) => {
    let member = null;
    for (let p = n.parent; p && p !== root; p = p.parent) {
      if ((ts.isMethodDeclaration(p) || ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p)
        || ts.isPropertyAssignment(p)) && p.name) member = keyOf(p) ?? member;
    }
    return member;
  };
  const exempt = (n, root) => {
    const file = fileOf(n);
    const member = memberOf(n, root);
    const hit = exemptions.find((e) => e.file === file && e.member === member && e.names.includes(n.text));
    if (hit) used.add(hit);
    return Boolean(hit);
  };
  for (const { path, text } of files) {
    if (!path.startsWith('viewmodel/') && !path.startsWith('tile/')) continue;
    const scan = (root, where) => {
      const seen = new Set();
      const visit = (n) => {
        if (ts.isIdentifier(n) && VIEW_FORBIDDEN.includes(n.text) && !exempt(n, root)) seen.add(n.text);
        ts.forEachChild(n, visit);
      };
      visit(root);
      for (const name of VIEW_FORBIDDEN) {
        if (seen.has(name)) out.push(`view: ${path}: ${name} ${where} — Arbeitsblätter über ctx.source lesen`);
      }
    };
    const view = findViewBlock(text);
    if (view) {
      const file = base ? join(base, path) : undefined;
      for (const part of unresolvedViewParts(text, file)) out.push(`view: ${path}: ${part} nicht auflösbar — view-Block nicht prüfbar`);
      const parts = viewPartNodes(text, file);
      for (const part of parts.length > 0 ? parts : [view]) scan(part, 'im view-Block');
    } else {
      const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
      let called = null;
      const find = (n) => {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && /^create(Module|Tile)$/.test(n.expression.text)) called ??= n.expression.text;
        ts.forEachChild(n, find);
      };
      find(sf);
      if (called && !factoryArgument(sf)) out.push(`view: ${path}: ${called}-Argument ist kein Objektliteral — view-Block nicht prüfbar`);
    }
    for (const [name, run] of asyncTaskRuns(text)) scan(run, `in asyncTasks.${name}.run`);
  }
  for (const e of exemptions) {
    if (!used.has(e)) out.push(`view: Ausnahme ${e.file} › ${e.member} (${e.names.join(', ')}) trifft nichts — aus view-read-exemptions.mjs entfernen`);
  }
  return out;
}

// Nur der Text vor `{` (Selektoren und At-Regel-Köpfe) zählt; Kommentare und Deklarationen nicht.
const PICKER_CLASS = /\.(col-picker[\w-]*)/g;

/**
 * Gate Picker-Vertrag: das Modul-CSS greift nicht in den Spalten-Picker.
 * @param {{ path: string, text: string }|null} css resources/style.css
 * @returns {string[]}
 */
export function checkPickerCss(css) {
  if (!css) return [];
  const selectors = [...css.text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]*)\{/g)].map((m) => m[1]).join('\n');
  const names = [...new Set([...selectors.matchAll(PICKER_CLASS)].map((m) => m[1]))];
  return names.map((n) => `css: ${css.path}: .${n} — Klassen des Pickers nicht stylen, nur das Wirtselement`);
}

const CHART_BINDING = /\bx-chart\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/**
 * Gate x-chart: die Direktive ist abgelöst, Diagramme laufen über Diagramm-Widgets.
 * @param {{ path: string, text: string }[]} templates
 * @returns {string[]}
 */
export function checkChartBindings(templates) {
  const out = [];
  for (const { path, text } of templates) {
    for (const [, dq, sq] of text.matchAll(CHART_BINDING)) {
      const shown = dq !== undefined ? `"${dq}"` : `'${sq}'`;
      out.push(`template: ${path}: x-chart=${shown}: x-chart ist abgelöst — x-widget mit einem Diagramm-Widget verwenden`);
    }
  }
  return out;
}

const FIELD_ERROR_CALL = /\bfieldError\(\s*'([^']*)'\s*\)/g;
const X_FIELD_EXPR = /\bx-field\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/**
 * Gate fieldError: jedes `fieldError('<pfad>')` braucht ein `x-field="<pfad>"`
 * im selben Template — sonst bleibt die Meldung immer leer.
 * @param {{ path: string, text: string }[]} templates
 * @returns {string[]}
 */
export function checkFieldErrorPaths(templates) {
  const out = [];
  for (const { path, text } of templates) {
    const bound = new Set([...text.matchAll(X_FIELD_EXPR)].map(([, dq, sq]) => (dq ?? sq).trim()));
    const asked = new Set([...text.matchAll(FIELD_ERROR_CALL)].map((m) => m[1].trim()));
    for (const p of asked) {
      if (!bound.has(p)) out.push(`template: ${path}: fieldError('${p}'): kein x-field mit diesem Ausdruck`);
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
 * @param {string[]} [computedNames] Namen der `computed` des view-Blocks (computedNamesOf)
 * @returns {string[]}
 */
export function checkContextHelp(schema, help, viewmodelCommands = {}, stateFields = [], formKeys = [], computedNames = []) {
  const keys = [
    ...Object.keys(schema.fields).map((f) => `fields.${f}.help`),
    ...computedNames.map((c) => `fields.${c}.help`),
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

/**
 * Gate Dateiablage: `x-file-drop="<methode>"` nennt ein Glied des view-Blocks.
 * @param {{ path: string, text: string }[]} files Templates unter resources/
 * @param {Set<string>|string[]} viewNames Namen des view-Blocks (`viewNamesOf`)
 * @returns {string[]}
 */
export function checkFileDropRefs(files, viewNames) {
  const known = new Set(viewNames);
  const out = [];
  for (const { path, text } of files) {
    for (const m of text.matchAll(/\sx-file-drop="\s*([^"]*?)\s*"/g)) {
      if (!known.has(m[1])) out.push(`file-drop: ${path}: x-file-drop="${m[1]}": kein Glied des view-Blocks`);
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
 * Die Kommando-Formulare der Templates: `<form … x-command-form="cmd" [data-command-form-schema="Name"]>`
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
      out.push({ path, command, form: plainAttr(m[1], 'data-command-form-schema'), params: [...m[2].matchAll(X_PARAM)].map((p) => p[1]) });
    }
  }
  return out;
}

/**
 * Gate Kommando-Bezüge: `x-command`, `x-command-form`, `data-dialog-command`,
 * `data-dialog-delete` nennen ein Kommando des Models oder ein
 * Viewmodel-Kommando; `data-command-form-schema` einen
 * Export aus viewmodel/forms.js; `x-param` einen Parameter des Kommandos
 * bzw. ein Feld des Formulars.
 * @param {{ path: string, text: string }[]} files
 * @param {{ commands: Record<string, { params: object }> }} schema
 * @param {Record<string, { fields: object }>} formSchemas Name → Schema
 * @param {Record<string, { params?: object }>} [vmCommands] Viewmodel-Kommandos (`readViewmodelCommands`)
 * @returns {string[]}
 */
export function checkCommandRefs(files, schema, formSchemas, vmCommands = {}) {
  const out = [];
  const known = [...Object.keys(schema.commands), ...Object.keys(vmCommands)];
  for (const { path, text } of files) {
    for (const attr of COMMAND_ATTRS) {
      for (const m of text.matchAll(new RegExp(`\\s${attr}="\\s*([^"]*?)\\s*"`, 'g'))) {
        if (!known.includes(m[1])) out.push(`command: ${path}: ${attr}="${m[1]}": kein Kommando des Models oder Viewmodels`);
      }
    }
    for (const m of text.matchAll(/\sdata-command-form-schema="\s*([^"]*?)\s*"/g)) {
      if (!Object.hasOwn(formSchemas, m[1])) out.push(`command: ${path}: data-command-form-schema="${m[1]}": kein Export aus viewmodel/forms.js`);
    }
  }
  for (const { path, command, form, params } of readCommandForms(files)) {
    const cmdParams = schema.commands[command]?.params ?? vmCommands[command]?.params;
    const fields = form !== null ? formSchemas[form]?.fields : cmdParams;
    if (!cmdParams || !fields) continue;
    for (const p of params) {
      if (!Object.hasOwn(fields, p)) out.push(`command: ${path}: x-param="${p}": ${form !== null ? `kein Feld von ${form}` : `kein Parameter von ${command}`}`);
    }
  }
  return out;
}

const LIST_BINDING = /\b(x-field|x-set)\s*=\s*(?:"\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[[^\]"]*\])+)\s*"|'\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[[^\]']*\])+)\s*')/g;
/** Quelle einer Schleife, die dieses Gate versteht: ein Pfad aus Namen. */
const PATH_SOURCE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;

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
    for (const { 1: loopHead, 2: source, index: at } of text.matchAll(X_FOR)) {
      if (!PATH_SOURCE.test(source)) continue;
      const alias = xForAliases(loopHead)[0];
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
    for (const { 1: attr, 2: dq, 3: sq, index: pos } of text.matchAll(LIST_BINDING)) {
      const expr = dq ?? sq;
      const shown = `${attr}="${expr}"`;
      let parsed;
      try { parsed = parseFieldPath(expr); } catch (err) { findings.push(`template: ${path}: ${shown}: ${err.message}`); continue; }
      const { root, steps, field } = parsed;
      if (typeof field === 'object') {
        const shownIndex = `[${field.ref ?? field.at}]`;
        let mapSpec;
        let mapPath = '';
        if (root === 'model' && steps[0]?.kind === 'name') {
          mapSpec = all[steps[0].name];
          mapPath = steps[0].name;
          for (const st of steps.slice(1)) {
            if (st.kind === 'index' && (mapSpec?.kind === 'list' || mapSpec?.kind === 'map')) { mapSpec = mapSpec.kind === 'list' ? mapSpec.item : mapSpec.value; mapPath += '[]'; }
            else if (st.kind === 'name' && mapSpec?.kind === 'object' && Object.hasOwn(mapSpec.shape, st.name)) { mapSpec = mapSpec.shape[st.name]; mapPath += `.${st.name}`; }
            else { mapSpec = undefined; break; }
          }
        }
        if (mapSpec?.kind !== 'map') findings.push(`template: ${path}: ${shown}: ${shownIndex} passt nicht zum Schema`);
        else helpKeys.add(`fields.${mapPath.replace(/\[\]/g, '')}.help`);
        continue;
      }
      if (root === 'state' || (root === 'model' && steps.length === 0)) continue;
      let spec;
      let listPath;
      if (root === 'model') {
        const [first, ...rest] = steps;
        spec = first.kind === 'name' ? all[first.name] : undefined;
        let p = first.kind === 'name' ? first.name : '';
        let afterMap = false;
        for (const st of rest) {
          if (st.kind === 'index' && spec?.kind === 'map') { afterMap = true; break; }
          if (st.kind === 'index' && spec?.kind === 'list') { spec = spec.item; p += '[]'; }
          else if (st.kind === 'name' && spec?.kind === 'object' && Object.hasOwn(spec.shape, st.name)) { spec = spec.shape[st.name]; p += `.${st.name}`; }
          else { spec = undefined; break; }
        }
        if (afterMap) { findings.push(`template: ${path}: ${shown}: ein Map-Eintrag darf nur der letzte Schritt sein`); continue; }
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

const DEFAULT_ARG = /(?:^|\s):?data-default-arg-([\w-]+)=/g;

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
  return html.slice(from, bodyEnd(html, from, tag));
}

/**
 * Gate Knopfgruppen: in einer Gruppe (`x-set`/`x-param` an einem Element,
 * das kein Eingabefeld ist) trägt jede Option (`<button>` mit `value` oder
 * `:value`) `role="radio"`; `<input type="radio">` braucht keine Rolle, in einer
 * `x-param`-Gruppe auch `<input type="checkbox">` nicht (Listenparameter). In
 * einer `role="tablist"` mit `x-set` sind die Optionen Reiter (`role="tab"`).
 * @param {{ path: string, text: string }[]} files @returns {string[]}
 */
export function checkChoiceGroups(files) {
  const out = [];
  for (const { path, text } of files) {
    for (const m of text.matchAll(GROUP_OPEN)) {
      const [whole, tag, groupAttrs, attr, value] = m;
      if (FORM_CONTROLS.has(tag.toLowerCase())) continue;
      const tablist = attr === 'x-set' && /(?:^|\s)role="tablist"/.test(groupAttrs);
      const body = elementBody(text, m.index + whole.length, tag);
      for (const [, optTag, optAttrs] of body.matchAll(/<(button|input)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g)) {
        if (!/(?:^|\s):?value=/.test(optAttrs)) continue;
        if (optTag === 'input' && /(?:^|\s)type="radio"/.test(optAttrs)) continue;
        if (optTag === 'input' && attr === 'x-param' && /(?:^|\s)type="checkbox"/.test(optAttrs)) continue;
        if (/(?:^|\s)role="radio"/.test(optAttrs)) continue;
        if (tablist && /(?:^|\s)role="tab"/.test(optAttrs)) continue;
        const shownOpt = `<${optTag}${optAttrs.replace(/\s*type="button"/, '')}>`;
        out.push(`template: ${path}: ${attr}="${value}": Option ${shownOpt.replace(/\s+/g, ' ')} ohne role="radio"`);
      }
    }
  }
  return out;
}

/**
 * Hilfeschlüssel der Formularfelder: ein Feld mit `data-command-form-schema`, das kein
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

/** Ist `run` einer Kommando-Definition als `async` geschrieben (Methode, Funktionsausdruck, Pfeil)? */
function isAsyncRun(p) {
  const fn = ts.isPropertyAssignment(p) ? p.initializer : p;
  return !!fn && (ts.isMethodDeclaration(fn) || ts.isFunctionExpression(fn) || ts.isArrowFunction(fn))
    && !!fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
}

/**
 * Viewmodel-Kommandos aus `commands: { name: command({ params: { … } }) }`
 * in viewmodel/viewmodel.js, ohne das Viewmodel zu laden (es hängt an
 * Alpine und DOM). Steht dort `commands` als Bezeichner (`commands,` oder
 * `commands: vmCommands`), wird er in der Datei oder über ihren relativen
 * Import aufgelöst (dafür der Pfad). Was kein erkennbares Literal ist,
 * bleibt außen vor; einen unauflösbaren Bezeichner meldet `checkCommandsRef`.
 * @param {string} text Inhalt von viewmodel/viewmodel.js
 * @param {string} [file] Pfad der Datei, für Kommandos aus Importen
 * @returns {Record<string, { params: Record<string, true> }>}
 */
export function readViewmodelCommands(text, file) {
  return readViewmodelCommandsDetail(text, file).commands;
}

/**
 * Gate Viewmodel-Kommandos: ein `commands`-Bezeichner, der sich nicht zu einem
 * Objektliteral auflösen lässt, ist gemeldet — sonst fehlen seine Kommandos
 * stillschweigend in jedem Gate, das `readViewmodelCommands` liest.
 * @param {{ path: string, text: string }[]} files
 * @param {string} [base] Modulordner, um Importe zu lesen
 * @returns {string[]}
 */
export function checkCommandsRef(files, base) {
  const out = [];
  for (const { path, text } of files) {
    if (path !== 'viewmodel/viewmodel.js') continue;
    for (const name of readViewmodelCommandsDetail(text, base ? join(base, path) : undefined).unresolved) {
      out.push(`command: ${path}: commands (${name}) nicht auflösbar — Viewmodel-Kommandos nicht prüfbar`);
    }
  }
  return out;
}

/**
 * Wie `readViewmodelCommands`, dazu die `commands`-Bezeichner, die sich nicht
 * zu einem Objektliteral auflösen lassen.
 * @param {string} text @param {string} [file]
 * `agentHidden`: ein Parameter trägt das Literal `agentWrite: false` — das
 * Kommando ist nur für die Oberfläche (wie `writableByAgent` zur Laufzeit) und
 * fehlt in der Agentenfläche.
 * @returns {{ commands: Record<string, { params: Record<string, true>, asyncRun?: true, agentHidden?: true }>, unresolved: string[] }}
 */
function readViewmodelCommandsDetail(text, file) {
  const unresolved = [];
  const sf = parseJs('viewmodel.js', text);
  const key = (p) => (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null);
  const prop = (obj, name) => obj.properties.find((p) => ts.isPropertyAssignment(p) && key(p) === name)?.initializer;
  const out = {};
  /** Ein Objektliteral `agentWrite: false` irgendwo im Knoten. */
  const agentWriteFalse = (n) => (ts.isPropertyAssignment(n) && key(n) === 'agentWrite' && n.initializer.kind === ts.SyntaxKind.FalseKeyword)
    || Boolean(ts.forEachChild(n, (c) => agentWriteFalse(c) || undefined));
  const readBlock = (block) => {
    for (const p of block.properties) {
      const name = ts.isPropertyAssignment(p) ? key(p) : null;
      const call = ts.isPropertyAssignment(p) ? p.initializer : null;
      if (!name || !ts.isCallExpression(call) || !ts.isIdentifier(call.expression) || call.expression.text !== 'command') continue;
      const arg = call.arguments[0];
      const params = arg && ts.isObjectLiteralExpression(arg) ? prop(arg, 'params') : null;
      out[name] = { params: {} };
      const run = arg && ts.isObjectLiteralExpression(arg) ? arg.properties.find((q) => key(q) === 'run') : null;
      if (run && isAsyncRun(run)) out[name].asyncRun = true;
      if (params && ts.isObjectLiteralExpression(params)) {
        for (const q of params.properties) { const k = ts.isPropertyAssignment(q) || ts.isShorthandPropertyAssignment(q) ? key(q) : null; if (k) out[name].params[k] = true; }
        if (params.properties.some((q) => ts.isPropertyAssignment(q) && agentWriteFalse(q.initializer))) out[name].agentHidden = true;
      }
    }
  };
  /** Der Bezeichner hinter `commands` (Kurzform oder `commands: x`), sonst null. */
  const identifierOf = (n) => {
    if (ts.isShorthandPropertyAssignment(n) && n.name.text === 'commands') return n.name.text;
    if (ts.isPropertyAssignment(n) && key(n) === 'commands' && ts.isIdentifier(n.initializer)) return n.initializer.text;
    return null;
  };
  const visit = (n) => {
    const block = ts.isPropertyAssignment(n) && key(n) === 'commands' && ts.isObjectLiteralExpression(n.initializer) ? n.initializer : null;
    if (block) {
      readBlock(block);
      return;
    }
    const ref = identifierOf(n);
    if (ref) {
      const target = resolvePart(sf, ref, file);
      if (target && ts.isObjectLiteralExpression(target)) readBlock(target);
      else unresolved.push(ref);
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { commands: out, unresolved };
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
 * Gate x-widget über alle Vorlagen eines Moduls: Ansicht und Teilvorlagen gegen den
 * view-Block des Viewmodels und das State-Schema, jede Kachel-Vorlage gegen den
 * view-Block ihrer Kachel. Eine Kachel hat keinen `state`; jeder Pfad `state.…`
 * in einer Kachel-Vorlage ist ein Befund.
 * @param {{ path: string, text: string }[]} templates
 * @param {{ widgets: Map<string, any>, schema: object, stateSchema: object|null, viewNames: Set<string>, tileText: (p: string) => string, tileFile?: (p: string) => string, algoIds?: Set<string>, commands?: Set<string> }} ctx
 *   `tileFile`: Pfad einer Moduldatei, für view-Teile aus Importen; `commands`: Kommandos des Moduls (Model und
 *   Viewmodel) für die `on*`-Eingaben der Ansicht — Kachel-Vorlagen haben keine
 * @returns {string[]}
 */
export function checkWidgetTemplates(templates, { widgets, schema, stateSchema, viewNames, tileText, tileFile, algoIds, commands }) {
  const out = checkWidgetBindings(templates.filter((f) => !/^resources\/tile(\.|$)/.test(f.path)), { widgets, schema, stateSchema, viewNames, commands });
  if (algoIds) out.push(...checkAlgoLinkLiterals(templates, algoIds));
  for (const f of templates) {
    const m = /^resources\/tile(?:\.([a-z0-9-]+))?\.html$/.exec(f.path);
    if (!m) continue;
    for (const s of f.text.matchAll(/=\s*"\s*(state(?:\.[\w$]+)+)/g)) out.push(`tile: ${f.path}: ${s[1]} — Kacheln haben keinen state`);
    const tileJs = `tile/${m[1] ?? 'tile'}.js`;
    out.push(...checkWidgetBindings([f], { widgets, schema, stateSchema: null, viewNames: viewNamesOf(tileText(tileJs), tileFile?.(tileJs)) })
      .filter((x) => !x.includes('="state.')));
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
    out.push(...checkUses(js.filter((f) => f.path !== 'module.js'), Array.isArray(uses) ? uses : [], id));
  }
  out.push(...checkLayers(js));
  out.push(...checkWritePath(js));
  out.push(...checkViewReads(js, base, VIEW_READ_EXEMPTIONS[id] ?? []));
  out.push(...checkCtxDataReads(js));
  out.push(...checkCommandsRef(js, base));
  out.push(...checkAsyncTaskDecls(js));
  const cssPath = 'resources/style.css';
  out.push(...checkPickerCss(paths.includes(cssPath) ? read(cssPath) : null));
  const chartTemplates = paths.filter((p) => /^resources\/[^/]+\.html$/.test(p)).map(read);
  out.push(...checkChartBindings(chartTemplates));
  out.push(...checkFieldErrorPaths(chartTemplates));
  out.push(...checkUiTexts(base));
  const refs = checkReferenceFile(base);
  out.push(...refs.findings, ...checkHelpFiles(base, refs.ids));

  if (paths.includes('domain/model.js')) {
    const file = join(base, 'domain', 'model.js');
    const readSibling = (spec) => {
      const sibling = join(base, 'domain', spec);
      return existsSync(sibling) ? readFileSync(sibling, 'utf8') : null;
    };
    out.push(...checkSchemaLiteral(readFileSync(file, 'utf8'), { readSibling }));
    let schema = null;
    try {
      ({ schema } = await loadModelSchema(file));
    } catch (err) {
      out.push(`schema: domain/model.js: lässt sich nicht laden (${err.message})`);
    }
    if (schema) {
      out.push(...checkSchemaPaths(schema));
      const views = paths.filter((p) => p === 'resources/view.html' || /^resources\/[^/]+\.part\.html$/.test(p)).map(read);
      let widgets = ctx.widgets;
      if (!widgets) {
        try {
          widgets = await loadWidgetSchemas(appDir);
        } catch (err) {
          widgets = new Map();
          out.push(`widget: js/widgets: Schemas lassen sich nicht laden (${err.message})`);
        }
      }
      out.push(...checkTemplateBindings(views, schema, widgets, modelMembersOf(readFileSync(file, 'utf8'))));
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
      // Ableitungen des Models sind im Viewmodel Zellen unter ihrem Namen.
      const vmNames = new Set([
        ...(paths.includes('viewmodel/viewmodel.js') ? viewNamesOf(tileText('viewmodel/viewmodel.js'), vmFile) : []),
        ...Object.keys(schema?.derived ?? {}),
      ]);
      const vmCommands = existsSync(vmFile) ? readViewmodelCommands(readFileSync(vmFile, 'utf8'), vmFile) : {};
      const commands = new Set([...Object.keys(schema?.commands ?? {}), ...Object.keys(vmCommands)]);
      out.push(...checkWidgetTemplates(templates, { widgets, schema, stateSchema, viewNames: vmNames, tileText, tileFile: (p) => join(base, p), algoIds: loadAlgoIds(appDir), commands }));
      out.push(...checkCommandRefs(templates, schema, formSchemas, vmCommands));
      const asyncTasks = existsSync(vmFile) ? readViewmodelAsyncTasks(readFileSync(vmFile, 'utf8')) : {};
      out.push(...checkAsyncTaskRefs(templates, asyncTasks));
      if (existsSync(vmFile)) out.push(...checkHistoryOption(readFileSync(vmFile, 'utf8')));
      out.push(...checkFileDropRefs(templates, existsSync(vmFile) ? viewMemberNamesOf(tileText('viewmodel/viewmodel.js'), vmFile) : []));
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
      }, existsSync(vmFile) ? readViewmodelCommands(readFileSync(vmFile, 'utf8'), vmFile) : {}, readStateBindings(templates),
      [...formHelpKeys(readCommandForms(templates), schema, formSchemas), ...lists.helpKeys, ...asyncTaskHelpKeys(asyncTasks)],
      existsSync(vmFile) ? computedNamesOf(readFileSync(vmFile, 'utf8'), vmFile) : []));
      if (existsSync(vmFile)) {
        for (const [name, c] of Object.entries(readViewmodelCommands(readFileSync(vmFile, 'utf8'), vmFile))) {
          if (c.asyncRun) out.push(`viewmodel: viewmodel/viewmodel.js: command ${name}: async run — use asyncTask`);
        }
      }
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
