/**
 * agent-data — generate js/core/agent/agent-registry.generated.js.
 *
 * Die Werkzeugbeschreibungen werden zur Build-Zeit ABGELEITET, nicht
 * handgeschrieben — so gibt es keine Parallelquelle, die driften könnte.
 * Zwei Quellen, klar getrennt:
 *   • Struktur (Felder, Kommandos, Parameter, Ergebnisformen) ← Schema und Viewmodel
 *   • Text (whenToUse, Kontexthilfen)                          ← i18n, zur Laufzeit
 *
 * Je Modul aus `CONVERTED_MODULES` entsteht der Eintrag aus dem Schema in
 * `domain/model.js` (Felder, Model-Kommandos, `derived`), den `commands` und
 * `asyncTasks` in `viewmodel/viewmodel.js` — dieselbe Form, die `createModule`
 * zur Laufzeit über `schemaAgentEntry` baut. Ein `derived` mit JSDoc-`@returns`
 * einer Typedef bekommt deren Schlüsselbaum (`keysOf`, `keys`).
 *
 * Mirrors help-data.mjs: collect + render, kein Schreibzugriff hier.
 */
import { CONVERTED_MODULES } from './converted-modules.mjs';
import { loadModelSchema } from './model-types.mjs';
import { readViewmodelCommands } from './module-gates.mjs';
import { readViewmodelAsyncTasks } from './async-task-gates.mjs';
import { schemaAgentEntry } from '../../js/core/agent/agent-schema.js';
import ts from 'typescript';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve as resolvePath } from 'node:path';

const MODULES_DIR = 'js/modules';

/**
 * Sammle die Agenten-Registry über alle Module.
 * @param {string} appDir  Wurzel von app/dev
 * @param {{ converted?: readonly string[] }} [options]  `converted`: die Module mit
 *   Schema (Vorgabe `CONVERTED_MODULES`); ihr Eintrag entsteht in `convertedEntry`
 * @returns {Promise<{ modules: Record<string, object>, coverage: { total: number, available: number } }>}
 */
export async function collectAgentData(appDir, { converted = CONVERTED_MODULES } = {}) {
  const root = join(appDir, MODULES_DIR);
  const modules = {};
  for (const id of readdirSync(root).sort()) {
    if (!statSync(join(root, id)).isDirectory()) continue;
    // core/agent/agent-entries.js ersetzt den Eintrag beim ersten Bedarf
    // durch den Laufzeiteintrag; beide entstehen aus demselben Schema.
    if (converted.includes(id)) modules[id] = await convertedEntry(appDir, id);
  }
  const total = Object.keys(modules).length;
  const available = Object.values(modules).filter(m => m.available).length;
  return { modules, coverage: { total, available } };
}

/**
 * Ein relativer Importpfad als Datei: `x`, `x.js` oder `x/index.js`.
 * @param {string} specifier
 * @param {string} fromFile  die importierende Datei
 * @returns {string|null}  null bei einem Paketnamen oder einer fehlenden Datei
 */
function resolveSpecifier(specifier, fromFile) {
  if (!specifier.startsWith('.')) return null;
  const base = resolvePath(dirname(fromFile), specifier);
  for (const candidate of [base, `${base}.js`, resolvePath(base, 'index.js')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * Platzhalter-Parameter: das Viewmodel ist in Node nicht ladbar, statisch
 * kennt der Build nur die Parameternamen. Jeder bekommt eine regelfreie
 * Feldart, deren Typ `markUnknownKeys` danach auf `unknown` setzt — eine
 * eigene Feldart `unknown` gibt es im Kern nicht.
 * @param {Record<string, { params: Record<string, true> }>} defs
 * @returns {Record<string, { params: Record<string, { kind: 'boolean' }> }>}
 */
function stubParams(defs) {
  return Object.fromEntries(Object.entries(defs).map(([name, def]) => [name, {
    ...def, params: Object.fromEntries(Object.keys(def.params).map((k) => [k, { kind: 'boolean' }])),
  }]));
}

/**
 * Setzt an den Aktionen aus `stubParams` den Schlüsseltyp `unknown`.
 * @param {Record<string, object>} actions
 * @param {Record<string, { params: Record<string, unknown> }>} defs
 */
function markUnknownKeys(actions, defs) {
  for (const [name, def] of Object.entries(defs)) {
    const keys = actions[name]?.keys;
    if (keys) for (const k of Object.keys(def.params)) if (keys[k]) keys[k].type = 'unknown';
  }
}

/**
 * Der Registry-Eintrag eines umgestellten Moduls, aus `domain/model.js`
 * (geladen) und `viewmodel/viewmodel.js` (statisch gelesen) — dieselbe Form,
 * die `createModule` zur Laufzeit über `schemaAgentEntry` baut. Viewmodel-
 * Kommandos und Tasks tragen nur ihre Parameternamen (Typ `unknown`).
 * @param {string} appDir  Wurzel von app/dev
 * @param {string} id  Modul-Id
 * @returns {Promise<object>}
 */
async function convertedEntry(appDir, id) {
  const dir = join(appDir, MODULES_DIR, id);
  const modelFile = join(dir, 'domain', 'model.js');
  const { schema, readFields } = await loadModelSchema(modelFile);
  const vmFile = join(dir, 'viewmodel', 'viewmodel.js');
  const vm = readFileSync(vmFile, 'utf8');
  // Nur-Oberflächen-Kommandos (`agentWrite: false` an einem Parameter) fehlen wie zur Laufzeit.
  const commands = Object.fromEntries(Object.entries(readViewmodelCommands(vm, vmFile)).filter(([, c]) => !c.agentHidden));
  const tasks = readViewmodelAsyncTasks(vm);
  // `schemaAgentEntry` liest das Schema über `schemaOf` an einer Klasse.
  const Model = Object.assign(function Model() {}, { schema });
  const entry = schemaAgentEntry(Model, stubParams(commands), { asyncTasks: stubParams(tasks) });
  markUnknownKeys(entry.actions, { ...commands, ...tasks });
  // Eigene Lesefläche (createModule `readFields`, Export `READ_FIELDS` in domain/model.js).
  if (readFields) entry.fields = structuredClone(readFields);
  const modelText = readFileSync(modelFile, 'utf8');
  attachComputedKeys(entry, modelText, modelFile, readDerivedReturns(modelText));
  return entry;
}

/**
 * Hängt den Schlüsselbaum an abgeleitete Felder, deren Methode (`derived` im
 * Model) ein JSDoc-`@returns {T}` trägt. `T` darf
 * eine Typedef derselben Datei oder ein `import('./x.js').T` sein;
 * Vereinigungen werden in `typedefKeys` gelöst.
 * @param {{ fields: Record<string, object> }} entry
 * @param {string} text  Quelltext der Datei mit den Methoden
 * @param {string} file  Pfad dieser Datei (löst relative Importe auf)
 * @param {Map<string, string>} returns  Name -> Typtext
 * @returns {void}
 */
function attachComputedKeys(entry, text, file, returns) {
  if (returns.size === 0) return;
  // Die Rückgabetypen werden als Alias-Typedef an den Quelltext gehängt, so
  // lösen `typedefKeys` und `findTypedefImport` sie wie jede andere Typedef.
  const alias = [...returns].map(([, type], i) => `\n/** @typedef {${type}} __Returns${i} */\nexport {};`).join('');
  const sf = ts.createSourceFile(file, text + alias, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  [...returns].forEach(([name, type], i) => {
    const field = entry.fields[name];
    if (!field) return;
    const importMatch = /^import\(\s*['"][^'"]+['"]\s*\)\.([A-Za-z_$][\w$]*)$/.exec(type.trim());
    if (importMatch) {
      const keys = typedefKeys(sf, `__Returns${i}`);
      if (keys) entry.fields[name] = { ...field, keysOf: importMatch[1], keys };
      return;
    }
    entry.fields[name] = { ...field, ...nestedKeys(sf, type, new Set()) };
  });
}

/**
 * Die `@returns`-Typen der Methoden unter `derived:` in domain/model.js.
 * @param {string} text  Quelltext von domain/model.js
 * @returns {Map<string, string>}  Name -> Typtext
 */
export function readDerivedReturns(text) {
  return readMethodReturns(text, 'derived');
}

/**
 * Die `@returns`-Typen der Glieder des ersten Objektliterals unter `<key>:`.
 * @param {string} text  Quelltext
 * @param {string} key  `derived`
 * @returns {Map<string, string>}  Name -> Typtext
 */
function readMethodReturns(text, key) {
  const sf = ts.createSourceFile('source.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const out = new Map();
  const visit = (n) => {
    if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && n.name.text === key
        && ts.isObjectLiteralExpression(n.initializer)) {
      for (const p of n.initializer.properties) {
        if (!p.name || !ts.isIdentifier(p.name)) continue;
        const type = ts.getJSDocReturnTag(p)?.typeExpression?.type;
        if (type) out.set(p.name.text, type.getText(sf));
      }
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/**
 * Das Typliteral der Typedef `name`, oder null.
 *
 * Der Block MUSS an einer Anweisung hängen: die TypeScript-Compiler-API
 * hängt JSDoc an die FOLGENDE Anweisung, ein frei stehender Kommentar am
 * Dateiende ist nicht erreichbar. Gibt es mehrere gleichnamige, gewinnt die
 * letzte.
 *
 * @param {ts.SourceFile} sf
 * @param {string} name
 * @returns {ts.JSDocTypeLiteral|null}
 */
function findTypedefLiteral(sf, name) {
  let found = null;
  const walk = (node) => {
    // Der Compiler hängt einen freistehenden Kommentar am Dateiende an das
    // `EndOfFileToken` — ohne diesen Ausschluss wäre JEDER Block im Datei-
    // körper erreichbar, unabhängig davon, ob eine Anweisung folgt. Das
    // `EndOfFileToken` hat ohnehin keine Kinder, der Ausschluss kostet also
    // nichts am eigentlichen Baum.
    if (node.kind === ts.SyntaxKind.EndOfFileToken) return;
    // ALLE an der Anweisung hängenden Blöcke, nicht `ts.getJSDocTags`: das
    // liefert nur die Tags des letzten Blocks, und eine Typedef steht gern
    // über dem Kurzkommentar der Konstante, an der sie hängt.
    for (const doc of node.jsDoc ?? []) {
      for (const tag of doc.tags ?? []) {
        if (!ts.isJSDocTypedefTag(tag)) continue;
        if (tag.name?.text !== name) continue;
        const literal = tag.typeExpression;
        if (literal && ts.isJSDocTypeLiteral(literal)) found = literal;
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return found;
}

/**
 * Die Quelle einer Alias-Typedef `@typedef {import('./x.js').Name} Alias`:
 * die geparste Datei und der Name dort — oder null, wenn `name` kein solcher
 * Alias ist oder die Datei fehlt. So darf ein Modul seine Typedefs in
 * Nachbardateien halten (`viewmodel/present.js`), ohne die Lesefläche zu
 * verlieren.
 *
 * @param {ts.SourceFile} sf
 * @param {string} name
 * @returns {{ sf: ts.SourceFile, name: string }|null}
 */
function findTypedefImport(sf, name) {
  let found = null;
  const walk = (node) => {
    if (node.kind === ts.SyntaxKind.EndOfFileToken) return;
    for (const doc of node.jsDoc ?? []) {
      for (const tag of doc.tags ?? []) {
        if (!ts.isJSDocTypedefTag(tag) || tag.name?.text !== name) continue;
        const type = tag.typeExpression?.type;
        if (!type || !ts.isImportTypeNode(type) || type.typeArguments) continue;
        const arg = type.argument;
        if (!ts.isLiteralTypeNode(arg) || !ts.isStringLiteral(arg.literal)) continue;
        if (!type.qualifier || !ts.isIdentifier(type.qualifier)) continue;
        found = { specifier: arg.literal.text, name: type.qualifier.text };
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  if (!found) return null;
  const file = resolveSpecifier(found.specifier, sf.fileName);
  if (!file) return null;
  // Kein Cache: der Build-Wächter läuft lange, die Datei kann sich ändern.
  const target = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  return { sf: target, name: found.name };
}

/**
 * Die Properties einer Typedef der Moduldatei als beschreibbare Schlüssel:
 * je Property Typ und JSDoc-Prosa. Ist eine Property selbst vom Typ einer
 * Typedef der Datei (auch als Liste oder mit `|null`), kommen deren
 * Schlüssel verschachtelt dazu (`keysOf`, `keys`). Eine Typedef, die auf dem
 * Pfad schon offen ist, wird nicht erneut aufgelöst — kein Zyklus.
 * Gerufen für die `@returns`-Typen der `derived` in domain/model.js.
 *
 * @param {ts.SourceFile} sf
 * @param {string} name  der Typedef-Name
 * @param {Set<string>} [open]  die auf dem Pfad offenen Typedefs (`typedefKey`)
 * @returns {Record<string, { type: string, help: string, optional?: true, keysOf?: string, keys?: object }>|null}
 *   null, wenn die Typedef in der Datei fehlt
 */
function typedefKeys(sf, name, open = new Set()) {
  const literal = findTypedefLiteral(sf, name);
  if (!literal) {
    const members = findTypedefUnion(sf, name);
    if (members) return unionKeys(sf, name, members, open);
    const alias = findTypedefImport(sf, name);
    // Alias-Zyklus: derselbe Name in derselben Datei. Gleichnamige Aliase in
    // verschiedenen Dateien sind eine Kette, kein Zyklus.
    if (open.has(typedefKey(sf, name))) return null;
    return alias ? typedefKeys(alias.sf, alias.name, new Set([...open, typedefKey(sf, name)])) : null;
  }
  const inner = new Set([...open, typedefKey(sf, name)]);
  const keys = {};
  for (const property of literal.jsDocPropertyTags ?? []) {
    const prop = property.name?.getText(sf);
    if (!prop) continue;
    const type = property.typeExpression?.type?.getText(sf) ?? 'any';
    keys[prop] = {
      type,
      help: cleanComment(property.comment),
      // `[Cg]`: die Kennzahl fehlt in manchen Zuständen (Kartentyp,
      // einseitige Toleranz). Nur der wahre Fall steht da — der
      // Laufzeitabgleich vermisst einen optionalen Schlüssel nicht.
      ...(property.isBracketed ? { optional: true } : {}),
      ...nestedKeys(sf, type, inner),
    };
  }
  return keys;
}

/**
 * Die Glieder einer Vereinigungs-Typedef `@typedef {A|B} Name` (ohne `null`
 * und `undefined`) — oder null, wenn `name` keine solche ist.
 * @param {ts.SourceFile} sf
 * @param {string} name
 * @returns {string[]|null}
 */
function findTypedefUnion(sf, name) {
  let found = null;
  const walk = (node) => {
    if (node.kind === ts.SyntaxKind.EndOfFileToken) return;
    for (const doc of node.jsDoc ?? []) {
      for (const tag of doc.tags ?? []) {
        if (!ts.isJSDocTypedefTag(tag) || tag.name?.text !== name) continue;
        const type = tag.typeExpression?.type;
        if (!type || !ts.isUnionTypeNode(type)) continue;
        found = type.types.map(t => t.getText(sf).trim()).filter(t => t !== 'null' && t !== 'undefined');
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return found && found.length > 1 ? found : null;
}

/**
 * Die Schlüssel einer Vereinigung: alle Schlüssel aller Glieder; der Typ ist
 * die Vereinigung der Einzeltypen, `optional`, wo ein Glied den Schlüssel
 * nicht hat oder dort optional ist. Ein Glied, das sich nicht auflösen lässt,
 * macht die ganze Vereinigung unauflösbar (null).
 * @param {ts.SourceFile} sf
 * @param {string} name
 * @param {string[]} members
 * @param {Set<string>} open
 * @returns {Record<string, object>|null}
 */
function unionKeys(sf, name, members, open) {
  const key = typedefKey(sf, name);
  if (open.has(key)) return null;
  const inner = new Set([...open, key]);
  const parts = [];
  for (const member of members) {
    const keys = typedefKeys(sf, member, inner);
    if (!keys) return null;
    parts.push(keys);
  }
  const merged = {};
  for (const keys of parts) {
    for (const [prop, spec] of Object.entries(keys)) {
      const have = merged[prop];
      if (!have) { merged[prop] = { ...spec }; continue; }
      const types = new Set([...have.type.split('|'), ...spec.type.split('|')].map(t => t.trim()));
      have.type = [...types].join('|');
      if (!have.help) have.help = spec.help;
      if (spec.optional) have.optional = true;
      if (!have.keys && spec.keys) { have.keysOf = spec.keysOf; have.keys = spec.keys; }
    }
  }
  for (const [prop, spec] of Object.entries(merged)) {
    if (parts.some(keys => !(prop in keys))) spec.optional = true;
  }
  return merged;
}

/**
 * Der Schlüssel einer Typedef auf dem Auflösungspfad: Datei und Name.
 * @param {ts.SourceFile} sf
 * @param {string} name
 * @returns {string}
 */
function typedefKey(sf, name) {
  return `${sf.fileName}#${name}`;
}

/**
 * `keysOf`/`keys` für einen Typ, der eine Typedef der Datei nennt — sonst `{}`.
 * @param {ts.SourceFile} sf
 * @param {string} type
 * @param {Set<string>} open
 * @returns {{ keysOf?: string, keys?: object }}
 */
function nestedKeys(sf, type, open) {
  const ref = typeRefName(type);
  if (!ref || open.has(typedefKey(sf, ref))) return {};
  const keys = typedefKeys(sf, ref, open);
  return keys ? { keysOf: ref, keys } : {};
}

/**
 * Der Typedef-Name in `T`, `T|null`, `T[]`, `T[]|null` oder einer Map
 * `Object<string, T>` (auch `|null`) — sonst null. Eine Map hat Schlüssel aus
 * den Daten (je Prüfer, je Teil); erklärt wird die Form EINES Eintrags.
 * @param {string} type
 * @returns {string|null}
 */
function typeRefName(type) {
  const parts = type.split('|').map(p => p.trim()).filter(p => p !== 'null' && p !== 'undefined');
  if (parts.length !== 1) return null;
  const map = /^Object<\s*string\s*,\s*([A-Za-z_$][\w$]*)\s*>$/.exec(parts[0]);
  if (map) return map[1];
  const m = /^([A-Za-z_$][\w$]*)(\[\])?$/.exec(parts[0]);
  return m ? m[1] : null;
}

/**
 * JSDoc-Kommentartexte normalisieren: der Compiler liefert `@param`-Texte
 * mit dem führenden Bindestrich der Konvention (`'- the problem statement'`),
 * und Zeilenumbrüche werden zu einem Leerzeichen.
 * @param {string|undefined|object} comment
 * @returns {string}
 */
function cleanComment(comment) {
  if (typeof comment !== 'string') return '';
  return comment.replace(/^\s*-\s*/, '').replace(/\s*\n\s*/g, ' ').trim();
}

/**
 * Rendere das generierte Registry-Modul. Daten-only (kein `import`-
 * Anweisung), damit esbuild es ohne Nebenwirkung in den Bundle legt —
 * Muster wie `licenses-data.generated.js`.
 * @param {{ modules: Record<string, object>, coverage: object }} data
 * @returns {string}
 */
export function renderAgentRegistryModule(data) {
  const sorted = {};
  for (const id of Object.keys(data.modules).sort()) sorted[id] = data.modules[id];
  return `// AUTO-GENERATED by tools/build/agent-data.mjs — do not edit.
// Struktur aus JSDoc abgeleitet. Text kommt zur Laufzeit aus i18n.

/** @type {Record<string, import('./agent-contract.js').AgentModuleEntry>} */
export const AGENT_REGISTRY = ${JSON.stringify(sorted, null, 2)};

/** Abdeckung als Zahl: n von m Modulen agentenfähig. */
export const AGENT_COVERAGE = ${JSON.stringify(data.coverage)};
`;
}
