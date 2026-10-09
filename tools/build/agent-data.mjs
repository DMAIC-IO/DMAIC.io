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
 * Mixins werden AUFGELÖST, nicht bloß gemeldet: ein Spread im `data()`-Literal
 * (`...chartModuleLifecycle(module, {…})`, `..._core`, `...renderMethods`) und
 * eine durchgereichte Datenfunktion (`data: activityFlowchartData`) führen über
 * `agent-resolve.mjs` zu den echten Mitgliedern. Stammt ein Mitglied aus einer
 * ANDEREN Datei, trägt sein Verstoßcode die Herkunft (`@<pfad>:<zeile>`) — die
 * Registry-Form bleibt davon unberührt.
 *
 * Was trotzdem unauflösbar bleibt, meldet der Generator als Verstoß statt zu
 * schweigen: `unresolved_spread:<ausdruck>` und `unresolvable_data_literal`.
 * Beide bleiben BERICHTEND — wie die DOM-Umweg-Prüfung zählen sie erst, wenn
 * das Modul das Modul-Tag trägt (Spec §8: „Lücken blockieren nicht"). So kann
 * aber kein Modul freigegeben werden, bevor jemand hingesehen hat.
 *
 * Extraktion über die TypeScript-Compiler-API: sie liest JSDoc aus reinem
 * JavaScript. Eine Dev-Abhängigkeit, kein TypeScript-Umstieg — und besser
 * als ein selbstgebauter Parser oder eine zweite Deklarationsdatei.
 *
 * Mirrors help-data.mjs: collect + render, kein Schreibzugriff hier.
 */
import ts from 'typescript';
import { readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createResolver, functionFromMember } from './agent-resolve.mjs';

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
  // EIN Auflöser für den ganzen Lauf: nur so trägt sein Parse-Zwischenspeicher
  // über Modulgrenzen (`chart-module-base.js` hängt an elf Modulen).
  const resolver = createResolver(appDir);
  const modules = {};
  for (const id of readdirSync(root).sort()) {
    const dir = join(root, id);
    if (!statSync(dir).isDirectory()) continue;
    const viewmodelFile = join(dir, `${id}.js`);
    if (!existsSync(viewmodelFile)) continue;
    const modelFile = join(dir, `${id}-model.js`);
    modules[id] = buildEntry(resolver, appDir, viewmodelFile, existsSync(modelFile) ? modelFile : null);
  }
  const total = Object.keys(modules).length;
  const available = Object.values(modules).filter(m => m.available).length;
  return { modules, coverage: { total, available } };
}

/** Ein Registry-Eintrag für genau ein Modul. */
function buildEntry(resolver, appDir, viewmodelFile, modelFile) {
  const sf = resolver.parse(viewmodelFile);
  const tagged = hasModuleTag(sf);
  const { actions, violations } = readViewmodel(sf, resolver, appDir);
  const fields = modelFile ? readModelFields(resolver.parse(modelFile)) : {};
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
 * Die Mitglieder des Objektliterals, das die `data()`-Funktion zurückgibt —
 * Mixin-Mitglieder eingerechnet.
 * @param {ts.SourceFile} sf  die Moduldatei
 * @param {ReturnType<import('./agent-resolve.mjs').createResolver>} resolver
 * @param {string} appDir  Wurzel von app/dev, Bezugspunkt der Herkunftsangaben
 * @returns {{ actions: Record<string, object>, violations: string[] }}
 */
function readViewmodel(sf, resolver, appDir) {
  const actions = {};
  const violations = [];
  const literal = resolver.findDataReturnLiteral(sf);
  // Was der Generator NICHT sehen kann, muss er melden — sonst ginge ein
  // solches Modul mit gesetztem Modul-Tag und NULL Verstößen durch den Build
  // und würde `available: true`, obwohl keine einzige seiner Methoden
  // begutachtet wurde (Review-Befund I6/P1). Die Zusage aus Spec §9 („das
  // Modul-Tag ist maschinell nachgeprüft") wäre sonst eine leere Operation.
  if (!literal) return { actions, violations: ['unresolvable_data_literal'] };

  const { members, unresolved } = resolver.collectMembers(literal, sf);
  // Die unauflösbaren Spreads stehen VORAN: sie sind der Befund über die
  // Vollständigkeit der folgenden Liste, nicht ein Befund in ihr.
  for (const expression of unresolved) violations.push(`unresolved_spread:${compact(expression)}`);

  for (const [name, entry] of members) {
    if (name.startsWith('_')) continue;
    const member = entry.member;
    if (!isFunctionMember(member)) continue;         // Daten, keine Methode
    // Herkunft nur bei einem Mitglied aus einer ANDEREN Datei: bei einem
    // Mitglied der Moduldatei ist sie Rauschen, und die Codes der Tests 6–8
    // hängen an der kurzen Form.
    const from = originSuffix(entry, sf, appDir);

    const tags = ts.getJSDocTags(member).map(t => t.tagName.text);
    const isAgent = tags.includes(MARK_AGENT);
    const isNoAgent = tags.includes(MARK_NOAGENT);

    if (!isAgent && !isNoAgent) { violations.push(`unmarked_method:${name}${from}`); continue; }
    if (isNoAgent) continue;

    const fn = functionFromMember(member);
    const params = [];
    for (const parameter of fn.parameters) {
      const paramName = parameter.name.getText();
      const tag = ts.getJSDocParameterTags(parameter)[0];
      if (!tag || !tag.typeExpression) { violations.push(`missing_param:${name}.${paramName}${from}`); continue; }
      params.push({
        name: paramName,
        type: tag.typeExpression.type.getText(),
        optional: tag.isBracketed === true,
        help: cleanComment(tag.comment),
      });
    }

    const returnTag = ts.getJSDocReturnTag(fn);
    if (!returnTag || !returnTag.typeExpression) { violations.push(`missing_returns:${name}${from}`); }

    actions[name] = {
      params,
      returns: returnTag?.typeExpression?.type?.getText() ?? 'void',
      help: cleanComment(descriptionOf(member)),
    };
  }
  return { actions, violations };
}

/**
 * Die Herkunftsangabe `@<pfad relativ zu app/dev>:<zeile>` für ein Mitglied
 * aus einer anderen Datei — und der leere String für ein Mitglied der
 * Moduldatei selbst.
 * @returns {string}
 */
function originSuffix(entry, moduleSf, appDir) {
  if (entry.sf === moduleSf) return '';
  const file = relative(appDir, entry.sf.fileName).split(sep).join('/');
  const line = entry.sf.getLineAndCharacterOfPosition(entry.member.getStart(entry.sf)).line + 1;
  return `@${file}:${line}`;
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

/**
 * Ein mehrzeiliger Ausdruck als eine Zeile — Verstoßcodes sind einzeilig.
 * @param {string} text
 * @returns {string}
 */
function compact(text) {
  return text.replace(/\s*\n\s*/g, ' ').trim();
}

/** @returns {boolean} ob das Mitglied eine Funktion ist (Methode oder Funktionswert). */
function isFunctionMember(member) {
  if (ts.isMethodDeclaration(member)) return true;
  if (ts.isPropertyAssignment(member)) {
    return ts.isFunctionExpression(member.initializer) || ts.isArrowFunction(member.initializer);
  }
  return false;
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
