/**
 * agent-data — generate js/core/agent/agent-registry.generated.js.
 *
 * Spec §8: die Werkzeugbeschreibungen werden zur Build-Zeit ABGELEITET, nicht
 * handgeschrieben — so gibt es keine Parallelquelle, die driften könnte.
 * Zwei Quellen, klar getrennt:
 *   • Struktur (Feldnamen, Typen, Parameter, Ergebnisformen) ← JSDoc im Code
 *   • Text (whenToUse, Kontexthilfen)                       ← i18n, zur Laufzeit
 * Diese Datei liefert ausschließlich die STRUKTUR plus die JSDoc-Prosa als
 * Rückfall; den i18n-Vorrang entscheidet `agent-catalog.js` zur Laufzeit.
 *
 * Zwei Marken, keine dritte Möglichkeit (Spec §9): jede öffentliche METHODE
 * der Datenfunktion trägt `@agent` oder `@noagent`. Eine unmarkierte Methode
 * ist ein Verstoß — aber nur dann, wenn das Modul das Modul-Tag `@agent`
 * trägt. Fehlt das Modul-Tag, ist das Modul `available: false` und KEIN
 * Fehler; so hält der Ausbau der Fläche nicht an, bis alle 72 Module
 * umgestellt sind.
 *
 * Nicht-Funktions-Properties (`maxLevel: 5`) und `_`-präfigierte Mitglieder
 * sind keine Methoden und brauchen keine Marke.
 *
 * Extraktion über die TypeScript-Compiler-API: sie liest JSDoc aus reinem
 * JavaScript. Eine Dev-Abhängigkeit, kein TypeScript-Umstieg — und besser
 * als ein selbstgebauter Parser oder eine zweite Deklarationsdatei.
 *
 * Mirrors help-data.mjs: collect + render, kein Schreibzugriff hier.
 */
import ts from 'typescript';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MODULES_DIR = 'js/modules';

/** Die beiden Marken an einer Viewmodel-Methode. */
export const MARK_AGENT = 'agent';
export const MARK_NOAGENT = 'noagent';
/** Marke an einem Model-Feld: Massendaten, aus `read()` ohne Parameter herausgehalten. */
const MARK_BULK = 'agentBulk';

/**
 * Sammle die Agenten-Registry über alle Module.
 * @param {string} appDir  Wurzel von app/dev
 * @returns {{ modules: Record<string, object>, coverage: { total: number, available: number } }}
 */
export function collectAgentData(appDir) {
  const root = join(appDir, MODULES_DIR);
  const modules = {};
  for (const id of readdirSync(root).sort()) {
    const dir = join(root, id);
    if (!statSync(dir).isDirectory()) continue;
    const viewmodelFile = join(dir, `${id}.js`);
    if (!existsSync(viewmodelFile)) continue;
    const modelFile = join(dir, `${id}-model.js`);
    modules[id] = buildEntry(viewmodelFile, existsSync(modelFile) ? modelFile : null);
  }
  const total = Object.keys(modules).length;
  const available = Object.values(modules).filter(m => m.available).length;
  return { modules, coverage: { total, available } };
}

/** Ein Registry-Eintrag für genau ein Modul. */
function buildEntry(viewmodelFile, modelFile) {
  const sf = parse(viewmodelFile);
  const tagged = hasModuleTag(sf);
  const { actions, violations } = readViewmodel(sf);
  const fields = modelFile ? readModelFields(parse(modelFile)) : {};
  const reported = [...violations, ...collectDomDetours(sf)];
  // Verstöße zählen nur, wenn das Modul etwas behauptet (Spec §9).
  const effective = tagged ? reported : [];
  return {
    tagged,
    available: tagged && effective.length === 0,
    violations: effective,
    reported,
    actions,
    fields,
  };
}

/**
 * Eigenschaften, deren Beschreiben Zustand ins DOM legt (Spec §10.2).
 *
 * Absichtlich SEHR eng. Die naheliegende, weite Regel (`value`,
 * `textContent`, `checked`) trifft 52 von 72 Modulen und ist dabei fast
 * immer falsch: der verbreitete Idiom ist ein unkontrolliertes Eingabefeld,
 * das bei `commit` ins Model geschrieben und danach zur Anzeige normalisiert
 * wird. Das ist kein Zustand im DOM, sondern ein Puffer.
 *
 * Was hier bleibt, hält dagegen stand: `innerHTML`/`outerHTML` sind unter
 * der strikten CSP ohnehin verboten, und ein `dataset.*`-Schreibzugriff ist
 * der klassische Fall „Zustand am Viewmodel vorbei im DOM gehalten".
 */
const DOM_STATE_PROPS = new Set(['innerHTML', 'outerHTML']);

/**
 * Finde zustandsändernde DOM-Zugriffe. Berichtend, nicht beweisend — der
 * eigentliche Beweis ist die dynamische Paritätsprüfung (Spec §10.4).
 * @param {ts.SourceFile} sf
 * @returns {string[]} Codes der Form `dom_detour:<prop>@<zeile>`
 */
export function collectDomDetours(sf) {
  const hits = [];
  const walk = (node) => {
    if (ts.isBinaryExpression(node)
        && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
        && ts.isPropertyAccessExpression(node.left)) {
      const prop = node.left.name.text;
      const base = node.left.expression;
      const line = sf.getLineAndCharacterOfPosition(node.left.getStart(sf)).line + 1;
      if (DOM_STATE_PROPS.has(prop)) {
        hits.push(`dom_detour:${prop}@${line}`);
      } else if (ts.isPropertyAccessExpression(base) && base.name.text === 'dataset') {
        hits.push(`dom_detour:dataset.${prop}@${line}`);
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return hits;
}

/** @returns {ts.SourceFile} */
function parse(file) {
  return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
}

/**
 * Trägt der Dateikopf-Kommentar `@agent`? Das ist die Behauptung „dieses
 * Modul ist vollständig über das Viewmodel steuerbar", die der Build
 * nachprüft.
 */
function hasModuleTag(sf) {
  const first = sf.statements[0];
  if (!first) return false;
  return ts.getJSDocTags(first).some(t => t.tagName.text === MARK_AGENT);
}

/**
 * Die Mitglieder des Objektliterals, das die `data()`-Funktion zurückgibt.
 * @returns {{ actions: Record<string, object>, violations: string[] }}
 */
function readViewmodel(sf) {
  const actions = {};
  const violations = [];
  const literal = findDataReturnLiteral(sf);
  if (!literal) return { actions, violations };

  for (const member of literal.properties) {
    const name = memberName(member);
    if (name === null || name.startsWith('_')) continue;
    if (!isFunctionMember(member)) continue;         // Daten, keine Methode

    const tags = ts.getJSDocTags(member).map(t => t.tagName.text);
    const isAgent = tags.includes(MARK_AGENT);
    const isNoAgent = tags.includes(MARK_NOAGENT);

    if (!isAgent && !isNoAgent) { violations.push(`unmarked_method:${name}`); continue; }
    if (isNoAgent) continue;

    const fn = functionOf(member);
    const params = [];
    for (const parameter of fn.parameters) {
      const paramName = parameter.name.getText();
      const tag = ts.getJSDocParameterTags(parameter)[0];
      if (!tag || !tag.typeExpression) { violations.push(`missing_param:${name}.${paramName}`); continue; }
      params.push({
        name: paramName,
        type: tag.typeExpression.type.getText(),
        optional: tag.isBracketed === true,
        help: cleanComment(tag.comment),
      });
    }

    const returnTag = ts.getJSDocReturnTag(fn);
    if (!returnTag || !returnTag.typeExpression) { violations.push(`missing_returns:${name}`); }

    actions[name] = {
      params,
      returns: returnTag?.typeExpression?.type?.getText() ?? 'void',
      help: cleanComment(descriptionOf(member)),
    };
  }
  return { actions, violations };
}

/**
 * Finde das Objektliteral, das die `data`-Methode des `createModule({…})`-
 * Arguments zurückgibt. Das ist der Schreibpfad der UI und damit die
 * Garantie aus Spec §2: der Agent kann nichts, was die UI nicht kann.
 * @returns {ts.ObjectLiteralExpression|null}
 */
function findDataReturnLiteral(sf) {
  let dataMember = null;
  const walk = (node) => {
    if (dataMember) return;
    if (ts.isCallExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === 'createModule'
        && node.arguments[0]
        && ts.isObjectLiteralExpression(node.arguments[0])) {
      for (const property of node.arguments[0].properties) {
        if (memberName(property) === 'data') { dataMember = property; break; }
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  if (!dataMember) return null;

  const fn = functionOf(dataMember);
  if (!fn) return null;
  let literal = null;
  const findReturn = (node) => {
    if (literal) return;
    if (ts.isReturnStatement(node) && node.expression && ts.isObjectLiteralExpression(node.expression)) {
      literal = node.expression;
      return;
    }
    ts.forEachChild(node, findReturn);
  };
  findReturn(fn);
  return literal;
}

/**
 * Model-Felder → Lesestruktur. Deckt sich mit „Models sind für die
 * Persistenz": die Lesefläche IST die persistierte Form (Spec §8).
 * `_`-präfigierte Felder sind privat und erscheinen nicht.
 * @returns {Record<string, { type: string, help: string, bulk: boolean }>}
 */
function readModelFields(sf) {
  const fields = {};
  const walk = (node) => {
    if (ts.isClassDeclaration(node)) {
      for (const member of node.members) {
        if (!ts.isPropertyDeclaration(member)) continue;
        const name = member.name.getText();
        if (name.startsWith('_')) continue;
        const tags = ts.getJSDocTags(member);
        const typeTag = tags.find(t => t.tagName.text === 'type');
        fields[name] = {
          type: typeTag?.typeExpression?.type?.getText() ?? 'any',
          help: cleanComment(typeTag?.comment),
          bulk: tags.some(t => t.tagName.text === MARK_BULK),
        };
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return fields;
}

/** @returns {string|null} der Name eines Objektliteral-Mitglieds. */
function memberName(member) {
  const name = member.name;
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
}

/** @returns {boolean} ob das Mitglied eine Funktion ist (Methode oder Funktionswert). */
function isFunctionMember(member) {
  if (ts.isMethodDeclaration(member)) return true;
  if (ts.isPropertyAssignment(member)) {
    return ts.isFunctionExpression(member.initializer) || ts.isArrowFunction(member.initializer);
  }
  return false;
}

/** @returns {ts.SignatureDeclaration|null} die Funktion hinter einem Mitglied. */
function functionOf(member) {
  if (ts.isMethodDeclaration(member)) return member;
  if (ts.isPropertyAssignment(member)
      && (ts.isFunctionExpression(member.initializer) || ts.isArrowFunction(member.initializer))) {
    return member.initializer;
  }
  return null;
}

/** @returns {string|undefined} die Beschreibungszeile(n) eines JSDoc-Blocks. */
function descriptionOf(node) {
  const doc = ts.getJSDocCommentsAndTags(node).find(ts.isJSDoc);
  return typeof doc?.comment === 'string' ? doc.comment : undefined;
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
// Struktur aus JSDoc abgeleitet (Spec §8). Text kommt zur Laufzeit aus i18n.

/** @type {Record<string, import('./agent-contract.js').AgentModuleEntry>} */
export const AGENT_REGISTRY = ${JSON.stringify(sorted, null, 2)};

/** Abdeckung als Zahl: n von m Modulen agentenfähig (Spec §9). */
export const AGENT_COVERAGE = ${JSON.stringify(data.coverage)};
`;
}
