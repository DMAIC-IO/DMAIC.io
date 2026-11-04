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
 * @param {{ moduleIds: string[], exampleIds: string[], paths: string[] }} ctx
 * @returns {string[]}
 */
export function checkDescriptor(id, text, { moduleIds, exampleIds, paths }) {
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
    else if (key === 'exampleRefs') for (const e of strings(value)) { if (!exampleIds.includes(e)) bad(`exampleRefs: unbekanntes Beispiel ${e}`); }
  }
  return out;
}

/**
 * Ids aller Beispiele (vorerst aus examples/index.json; später
 * aus dem Beispielkatalog).
 * @param {string} appDir @returns {string[]}
 */
export function readExampleIds(appDir) {
  const file = join(appDir, 'examples', 'index.json');
  if (!existsSync(file)) return [];
  return (JSON.parse(readFileSync(file, 'utf8')).examples ?? []).map((e) => e.id);
}
