/**
 * agent-data — generate js/core/agent/agent-registry.generated.js.
 *
 * Die Werkzeugbeschreibungen werden zur Build-Zeit ABGELEITET, nicht
 * handgeschrieben — so gibt es keine Parallelquelle, die driften könnte.
 * Zwei Quellen, klar getrennt:
 *   • Struktur (Feldnamen, Typen, Parameter, Ergebnisformen) ← JSDoc im Code
 *   • Text (whenToUse, Kontexthilfen)                       ← i18n, zur Laufzeit
 * Diese Datei liefert ausschließlich die STRUKTUR plus die JSDoc-Prosa als
 * Rückfall; den i18n-Vorrang entscheidet `agent-catalog.js` zur Laufzeit.
 *
 * Zwei Marken, keine dritte Möglichkeit: jede öffentliche METHODE
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
 * ANDEREN Datei, trägt sein Verstoßcode die Herkunft (`@<pfad>`, zeilenfrei) — die
 * Registry-Form bleibt davon unberührt.
 *
 * Auf der MODEL-Seite gilt dasselbe für die Vererbung: ein Model, das von
 * einer Basisklasse erbt (`export class State extends FlowchartState`), erbt
 * auch deren Felder, und ein im Konstruktor annotiertes Feld
 * (`/** @type {…} *\/ this.steps = []`) ist ein Feld. Beides zusammen war die
 * Lücke, durch die die vier Flowchart-Module mit NULL Lesefelder in der
 * Registry standen — eine leere Lesefläche, die wie „kein Zustand" aussah.
 *
 * Was trotzdem unauflösbar bleibt, meldet der Generator als Verstoß statt zu
 * schweigen — auf der Aktionsseite `unresolved_spread:<ausdruck>` und
 * `unresolvable_data_literal`, auf der Modellseite `unresolvable_model_class`,
 * `unresolved_model_class:<name>`, `ambiguous_model_class:<name>`,
 * `self_inheriting_class:<name>` und `unresolved_base_class:<name>`. Die
 * Liste wächst mit jeder neuen Blindstelle; verbindlich ist nicht ihre Länge,
 * sondern die Regel: JEDER Blindstellen-Code bleibt BERICHTEND — wie die
 * DOM-Umweg-Prüfung zählt er erst, wenn das Modul das Modul-Tag trägt („Lücken blockieren nicht"). So kann
 * aber kein Modul freigegeben werden, bevor jemand hingesehen hat.
 *
 * Extraktion über die TypeScript-Compiler-API: sie liest JSDoc aus reinem
 * JavaScript. Eine Dev-Abhängigkeit, kein TypeScript-Umstieg — und besser
 * als ein selbstgebauter Parser oder eine zweite Deklarationsdatei.
 *
 * Mirrors help-data.mjs: collect + render, kein Schreibzugriff hier.
 */
import { readReturnKeys } from './agent-read-return.mjs';
import ts from 'typescript';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep, dirname, basename } from 'node:path';
import { createResolver, functionFromMember, isFunctionMember, isFunctionLike, findCreateModuleMember, memberName, findLocalDeclaration, findImportSource, resolveSpecifier } from './agent-resolve.mjs';

const MODULES_DIR = 'js/modules';

/** Die beiden Marken an einer Viewmodel-Methode. */
export const MARK_AGENT = 'agent';
export const MARK_NOAGENT = 'noagent';
/** Marke an einem Model-Feld: Massendaten, aus `read()` ohne Parameter herausgehalten. */
const MARK_BULK = 'agentBulk';
/**
 * Marke an einem Model-Feld: Teilwerte, die `read()` nie ausliefert
 * (`@agentOmit inScope[].dataUrl outScope[].dataUrl`). Pfade durch
 * Leerraum getrennt; Grammatik siehe `omitTokens`.
 */
const MARK_OMIT = 'agentOmit';
/**
 * Die erlaubten Massendaten-Arten. Dieselbe Menge steht in
 * `js/core/agent/agent-read.js` (`BULK_KINDS`) und als Zusage im Typedef
 * `AgentModuleEntry` (`js/core/agent/agent-contract.js`). Zwei Deklarationen,
 * weil der Build nicht aus `js/` importiert (und `agent-read.js`
 * abhängigkeitsfrei bleibt) — dieser Generator ist die Stelle, die den
 * Verstoß MELDET, damit der Modulautor ihn beim Bauen sieht und nicht ein
 * Agent zur Laufzeit an stillen Spalten.
 */
const BULK_KINDS = ['table', 'tree'];

/** Anlegende Aktionen liefern die id des Angelegten — ein Agent soll nicht nachlesen müssen. */
const CREATING_ACTION_RE = /^(add|append|insert|create|duplicate)(?=[A-Z]|$)/;
/** Rückgabetexte, die nichts liefern. */
const VOID_RETURNS = new Set(['void', 'undefined', 'Promise<void>', 'Promise<undefined>']);
/**
 * Index- oder anzahlbasierte Anlegeaktionen ohne eigene id — begründete Ausnahmen
 * als `"<modul>.<aktion>"`; bei Teil-Viewmodels trägt die Aktion den
 * Teil-Präfix (`"<modul>.<teil>.<aktion>"`, z. B. `doe-planner.factors.insertLevel`).
 * Geprüft wird das letzte Namenssegment.
 * `doe-planner.factors.insertLevel`: Stufen sind Zeichenketten ohne id, nur eine Position.
 * `attribute-test.addRow/addCol`: Tabellenzeile/-spalte ist eine Position, keine Entität.
 * `worksheet.addRows`: legt `count` Zeilen an, Zeilen haben keine id.
 */
export const CREATING_VOID_EXEMPT = new Set(['doe-planner.factors.insertLevel', 'attribute-test.addRow', 'attribute-test.addCol', 'worksheet.addRows']);

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
    // Die Model-DATEI wird hier nicht mehr gesucht: welche Klasse den Zustand
    // hält, sagt `Model:` im `createModule({…})`-Literal — und nur die zählt.
    modules[id] = buildEntry(resolver, appDir, viewmodelFile);
  }
  const total = Object.keys(modules).length;
  const available = Object.values(modules).filter(m => m.available).length;
  return { modules, coverage: { total, available } };
}

/** Ein Registry-Eintrag für genau ein Modul. */
function buildEntry(resolver, appDir, viewmodelFile) {
  const sf = resolver.parse(viewmodelFile);
  const tagged = hasModuleTag(sf);
  const { actions, violations, written, optionSources, subViewModels } = readViewmodel(sf, resolver, appDir);
  const moduleId = basename(viewmodelFile, '.js');
  for (const [name, action] of Object.entries(actions)) {
    if (action.returns != null && CREATING_ACTION_RE.test(name.slice(name.lastIndexOf('.') + 1))
        && VOID_RETURNS.has(String(action.returns).trim())
        && !CREATING_VOID_EXEMPT.has(`${moduleId}.${name}`)) {
      violations.push(`void_creating_action:${name}`);
    }
  }

  // Deklarierte Lesefläche hat Vorrang und ERSETZT die Model-Ableitung —
  // nicht ergänzt sie: zwei Quellen für dieselbe Fläche wäre genau die
  // Parallelquelle, die das Design vermeidet. Ohne Deklaration bleibt alles
  // wie bisher (Model-Felder, driftfrei per Konstruktion).
  const declared = readAgentReadTypedef(sf);
  // Ausgaben: ein erklärtes Feld vom Typ einer Typedef der Datei
  // (`{Result|null} result`) bekommt deren Schlüssel — siehe `typedefKeys`.
  if (declared) {
    for (const field of Object.values(declared)) Object.assign(field, nestedKeys(sf, field.type, new Set()));
  }
  const model = declared ? { fields: declared, violations: [] } : readModelFields(resolver, sf);

  // Die Gegenprobe gilt nur für die ABGELEITETE Lesefläche. Eine erklärte
  // `@typedef AgentRead` lässt absichtlich etwas draußen (worksheet: opake
  // Blobs) — das ist ein geschriebener Akt und braucht keinen Wächter.
  const persistence = declared ? { keys: null, violations: [] } : persistedKeys(resolver, sf);
  const unreadable = (persistence.keys ?? [])
    .filter(k => !k.startsWith('_') && !Object.prototype.hasOwnProperty.call(model.fields, k))
    .map(k => `unreadable_state_key:${k}`);

  // Gegenprobe der ERKLÄRTEN Lesefläche: jeder erklärte
  // Schlüssel muss im Rückgabewert von read() stehen — sonst fehlt er still
  // im read(), weil `projectReadState` nur Vorhandenes ausgibt. Geliefert,
  // aber nicht erklärt, bleibt erlaubt (worksheet: Schwesterfelder).
  const readReturn = [];
  if (declared && Object.prototype.hasOwnProperty.call(actions, 'read')) {
    const returned = readReturnKeys(resolver, sf, () => persistedKeys(resolver, sf).keys);
    if (!returned) readReturn.push('unresolved_read_return');
    else {
      for (const k of Object.keys(declared)) {
        if (!returned.includes(k)) readReturn.push(`declared_not_returned:${k}`);
      }
    }
  }

  // Zwei Hürden, ohne die das Modul-Tag eine unbelegte Behauptung bliebe:
  //   • Null Aktionen: „vollständig über das Viewmodel steuerbar" ist dann
  //     wahr-aber-leer. Befundfrei heißt nicht freigabereif (mosaic,
  //     pie-chart).
  //   • Kein `read()`. Ohne Lesefläche ist ein
  //     Modul für einen Agenten blind bedienbar — er sieht nicht, was er
  //     angerichtet hat.
  // Nur wenn `violations` (Extraktion) bereits leer ist: eine nicht auflösbare
  // Datenfunktion oder ein nicht auflösbarer Spread liefert ebenfalls
  // `actions: {}`, meldet das aber schon selbst (`unresolvable_data_literal`,
  // `unresolved_spread:…`). Beide Codes nochmal draufzusetzen wäre doppelte
  // Meldung desselben Befunds unter neuem Namen, nicht ein zweiter Befund.
  const surface = [];
  if (violations.length === 0) {
    // `read` zählt hier NICHT mit: seit es das geteilte `read()`-Mixin gibt,
    // kostet eine Aktion eine Zeile (`...agentReadMixin(module)`) — ein
    // befundfreies Modul wie `mosaic` wäre mit Tag plus Spread freigegeben,
    // ohne einen einzigen Schreibweg. Genau der Fall, den diese Hürde
    // ausschließen soll. Zählte `read` mit, wäre `no_read_action` unten die
    // stärkere Bedingung und diese Hürde ganz überflüssig.
    if (Object.keys(actions).filter(n => n !== 'read').length === 0) surface.push('module_tag_without_actions');
    if (!Object.prototype.hasOwnProperty.call(actions, 'read')) surface.push('no_read_action');
  }

  // Schreibvollständigkeit (Task 1b): die Vorlage macht über
  // `x-model="model.<feld>"` und einen direkten `model.<methode>()`-Aufruf
  // zwei Schreibwege auf, die am Viewmodel vorbeigehen können. Beide
  // Befunde prüfen gegen das, was die `@agent`-Methoden wirklich zuweisen
  // (`written`) — nicht gegen die Modellfelder, denn ein Feld kann lesbar
  // und trotzdem für die Fläche unerreichbar sein.
  const bindings = templateBindings(dirname(viewmodelFile));
  // Entdoppelt: `bindings.models` trägt einen Eintrag JE Bindung, und eine
  // Vorlage bindet denselben Pfad gern mehrfach (Eingabefeld und Auswahlfeld
  // auf `params.type`, acht Schalter auf `params.enabledRules`). Ohne das
  // `Set` stünde derselbe Code mehrfach in `reported` — die Vertragsfläche,
  // die Gate und Agent lesen, zählte dann Bindungen statt unerreichbarer
  // Felder (Review-Fund). `Set` erhält die Erstsichtungsreihenfolge, die
  // Ausgabereihenfolge bleibt also dieselbe.
  const unreachable = [...new Set(bindings.models)]
    .filter(f => !written.has(f))
    .map(f => `unreachable_write:${f}`);
  const templateCalls = bindings.calls.map(m => `template_model_call:${m}`);
  // Zustandsabhängige Wertemengen (Task 2a): siehe `stateOptionSources`.
  const undeclaredOptions = [...new Set(optionSources
    .filter(o => o.field && !Object.prototype.hasOwnProperty.call(model.fields, o.field))
    .map(o => `undeclared_option_source:${o.action}:${o.arg}`))];

  const moduleStateOptions = [...new Set(optionSources
    .filter(o => o.moduleState)
    .map(o => `module_state_option_source:${o.action}:${o.arg}`))];

  const reported = [...violations, ...surface, ...model.violations,
    ...persistence.violations, ...unreadable, ...readReturn,
    ...invalidBulkKinds(model.fields), ...invalidOmitPaths(model.fields), ...collectDomDetours(sf),
    ...unreachable, ...templateCalls,
    ...subViewModelModelBindings(dirname(viewmodelFile), subViewModels),
    ...undeclaredOptions, ...moduleStateOptions];
  // Verstöße zählen nur, wenn das Modul etwas behauptet.
  const effective = tagged ? reported : [];
  return {
    tagged,
    available: tagged && effective.length === 0,
    violations: effective,
    reported,
    actions,
    fields: model.fields,
  };
}

/**
 * Massenfelder, deren Art nicht in `BULK_KINDS` steht.
 *
 * Beide Wege zum `bulkKind` nehmen den Text, den das Modul hinschreibt:
 * `[bulk:graph]` im Typedef und `@agentBulk die Zeilen` am Model-Feld. Ohne
 * diese Prüfung kam eine erfundene Art stillschweigend durch, obwohl der
 * Vertrag `'table'|'tree'` zusichert — und die Lesefläche beschrieb das Feld
 * dann als Tabelle, ohne es als Tabelle zu ZÄHLEN; dadurch bekamen zwei
 * Massenfelder wieder dieselben (für eines falschen) Spalten. Der Befund
 * gehört hierher und nicht in die Laufzeit: sichtbar ist er nur dem Autor,
 * und nur beim Bauen ist er behebbar.
 *
 * Die Codes sind zeilenfrei, weil `cleanComment` jeden Umbruch im
 * Kommentartext einzieht und `BULK_RE` nur `[a-z]+` als Art durchlässt.
 *
 * @param {Record<string, { bulk: boolean, bulkKind?: string }>} fields
 * @returns {string[]} Codes der Form `invalid_bulk_kind:<feld>:<wert>`
 */
function invalidBulkKinds(fields) {
  const out = [];
  for (const [name, spec] of Object.entries(fields)) {
    if (!spec.bulk) continue;
    const kind = spec.bulkKind ?? 'table';
    if (!BULK_KINDS.includes(kind)) out.push(`invalid_bulk_kind:${name}:${kind}`);
  }
  return out;
}

/**
 * Die Grammatik eines Auslassungspfades. Dieselbe steht in
 * `js/core/agent/agent-read.js` (`OMIT_PATH`) — zwei Deklarationen, weil der
 * Build nicht aus `js/` importiert. Die Laufzeit übergeht einen kaputten
 * Pfad still; gemeldet wird er hier, beim Bauen, wo der Autor ihn beheben kann.
 */
const OMIT_PATH = /^(?:[A-Za-z_$][\w$]*|\[\])(?:\[\]|\.[A-Za-z_$][\w$]*)*$/;

/**
 * Ein Auslassungspfad als Segmentliste, oder `null` bei Verstoß: leer, gegen
 * die Grammatik, oder mit `[]` am Ende (das meinte jedes Element, also das
 * ganze Feld — dafür gibt es `@noagent`-Felder bzw. das `_`-Präfix).
 * @param {string} path
 * @returns {string[]|null}
 */
function omitTokens(path) {
  if (!OMIT_PATH.test(path)) return null;
  const tokens = path.match(/\[\]|[A-Za-z_$][\w$]*/g);
  return tokens[tokens.length - 1] === '[]' ? null : tokens;
}

/**
 * Auslassungspfade, die die Grammatik verletzen oder nicht zum erklärten
 * Typ des Feldes passen.
 * @param {Record<string, { type: string, omit?: string[] }>} fields
 * @returns {string[]} Codes `invalid_omit_path:<feld>:<pfad>` und
 *   `omit_path_mismatch:<feld>:<pfad>`; ein leerer Pfad steht als leerer Rest
 */
function invalidOmitPaths(fields) {
  const out = [];
  for (const [name, spec] of Object.entries(fields)) {
    if (!spec.omit) continue;
    if (spec.omit.length === 0) { out.push(`invalid_omit_path:${name}:`); continue; }
    for (const path of spec.omit) {
      const tokens = omitTokens(path);
      if (!tokens) out.push(`invalid_omit_path:${name}:${path}`);
      else if (!omitPathFitsType(spec.type, tokens)) out.push(`omit_path_mismatch:${name}:${path}`);
    }
  }
  return out;
}

/**
 * Passt ein Auslassungspfad zum erklärten Typ? Geprüft wird nur, was der
 * Typtext statisch hergibt: Objektliterale (`{ a: T }`), Arrays (`T[]`,
 * `Array<T>`), Vereinigungen mit `null`/`undefined` und Primitive. Ein Name
 * (`object`, `any`, eine Typedef) oder eine echte Vereinigung beendet die
 * Prüfung — dort ist der Pfad nicht widerlegbar und gilt als passend: ein
 * falsch behaupteter Befund kostet mehr Vertrauen als ein zugegebenes
 * Nichtwissen.
 * @param {string} typeText  der JSDoc-Typ des Feldes
 * @param {string[]} tokens
 * @returns {boolean}
 */
function omitPathFitsType(typeText, tokens) {
  const sf = ts.createSourceFile('omit.ts', `type T = ${typeText};`, ts.ScriptTarget.Latest, true);
  const alias = sf.statements[0];
  let node = alias && ts.isTypeAliasDeclaration(alias) ? alias.type : null;
  for (const token of tokens) {
    node = withoutNullish(node);
    if (!node) return true;
    const element = arrayElementType(node);
    if (token === '[]') {
      if (element) { node = element; continue; }
      return !(ts.isTypeLiteralNode(node) || isPrimitiveType(node));
    }
    if (element || isPrimitiveType(node)) return false;
    if (!ts.isTypeLiteralNode(node)) return true;
    const member = node.members.find(m => ts.isPropertySignature(m) && m.name?.getText(sf) === token);
    if (!member) return false;
    node = member.type ?? null;
  }
  return true;
}

/** Klammern weg, `T|null|undefined` → `T`; eine echte Vereinigung → `null` (nicht auflösbar). */
function withoutNullish(node) {
  while (node && ts.isParenthesizedTypeNode(node)) node = node.type;
  if (node && ts.isUnionTypeNode(node)) {
    const rest = node.types.filter(t => !isNullishType(t));
    return rest.length === 1 ? withoutNullish(rest[0]) : null;
  }
  return node;
}

/** @returns {boolean} `null` oder `undefined` als Typ */
function isNullishType(node) {
  return node.kind === ts.SyntaxKind.UndefinedKeyword || node.kind === ts.SyntaxKind.NullKeyword
    || (ts.isLiteralTypeNode(node) && node.literal.kind === ts.SyntaxKind.NullKeyword);
}

/** @returns {ts.TypeNode|null} der Elementtyp von `T[]` bzw. `Array<T>` */
function arrayElementType(node) {
  if (ts.isArrayTypeNode(node)) return node.elementType;
  if (ts.isTypeReferenceNode(node) && node.typeName.getText() === 'Array' && node.typeArguments?.length === 1) {
    return node.typeArguments[0];
  }
  return null;
}

/** @returns {boolean} `string`, `number`, `boolean` oder ein Literaltyp */
function isPrimitiveType(node) {
  return node.kind === ts.SyntaxKind.StringKeyword || node.kind === ts.SyntaxKind.NumberKeyword
    || node.kind === ts.SyntaxKind.BooleanKeyword || ts.isLiteralTypeNode(node);
}

/**
 * Eigenschaften, deren Beschreiben Zustand ins DOM legt.
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

/** Zuweisungsoperatoren, die einen DOM-Umweg bedeuten. `+=` zählt mit: es
 *  schreibt genauso in den Zustand, nur additiv. */
const ASSIGN_KINDS = new Set([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
]);

/**
 * Finde zustandsändernde DOM-Zugriffe. Berichtend, nicht beweisend — der
 * eigentliche Beweis ist die dynamische Paritätsprüfung.
 * @param {ts.SourceFile} sf
 * @returns {string[]} Codes der Form `dom_detour:<prop>@<zeile>`
 */
export function collectDomDetours(sf) {
  const hits = [];
  const walk = (node) => {
    if (ts.isBinaryExpression(node) && ASSIGN_KINDS.has(node.operatorToken.kind)) {
      const target = describeTarget(node.left, sf);
      if (target) hits.push(target);
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return hits;
}

/**
 * Das Ziel einer Zuweisung, wenn es ein DOM-Umweg ist.
 *
 * Zwei Zugriffsformen, nicht eine: `el.dataset.key = …` ist ein
 * `PropertyAccessExpression`, `el.dataset['key'] = …` ein
 * `ElementAccessExpression`. Nur die erste zu prüfen heißt, die zweite als
 * Schlupfloch zu lassen — und ein Schlupfloch in einem Wächter ist
 * schlimmer als kein Wächter, weil niemand ihn mehr prüft.
 *
 * @param {ts.Node} left  die linke Seite der Zuweisung
 * @param {ts.SourceFile} sf
 * @returns {string|null} der Verstoßcode, oder null
 */
function describeTarget(left, sf) {
  const line = () => sf.getLineAndCharacterOfPosition(left.getStart(sf)).line + 1;

  if (ts.isPropertyAccessExpression(left)) {
    const prop = left.name.text;
    if (DOM_STATE_PROPS.has(prop)) return `dom_detour:${prop}@${line()}`;
    if (isDatasetAccess(left.expression)) return `dom_detour:dataset.${prop}@${line()}`;
    return null;
  }

  if (ts.isElementAccessExpression(left)) {
    const literal = left.argumentExpression;
    if (!literal || !ts.isStringLiteralLike(literal)) return null;
    const prop = literal.text;
    if (DOM_STATE_PROPS.has(prop)) return `dom_detour:${prop}@${line()}`;
    if (isDatasetAccess(left.expression)) return `dom_detour:dataset.${prop}@${line()}`;
    return null;
  }

  return null;
}

/** @returns {boolean} ob der Ausdruck auf `…dataset` endet, egal in welcher Zugriffsform. */
function isDatasetAccess(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text === 'dataset';
  if (ts.isElementAccessExpression(node)) {
    const literal = node.argumentExpression;
    return Boolean(literal && ts.isStringLiteralLike(literal) && literal.text === 'dataset');
  }
  return false;
}

/**
 * Name des Typedef, mit dem ein Modul seine Agenten-Lesefläche DEKLARIERT,
 * statt sie aus dem Model ableiten zu lassen.
 *
 * Gebraucht wird das, wo die persistierte Form nicht die Lesefläche ist:
 * `worksheet` persistiert opake DataGrid-Blobs, und `hypothesis-test` hält
 * sein Ergebnis transient am Viewmodel. Beide Fälle wären über Model-Felder
 * entweder nutzlos oder riesig.
 *
 * Die Massendaten-Marke kann in einem Typedef-Property nicht als eigener Tag
 * stehen (`@agentBulk` gilt pro Tag, nicht pro Property) — deshalb das
 * Sentinel `[bulk]` bzw. `[bulk:tree]` am Anfang des Property-Kommentars,
 * und NUR dort.
 */
const AGENT_READ_TYPEDEF = 'AgentRead';
/**
 * Das Massendaten-Sentinel samt optionaler Art: `[bulk:tree]` nennt den
 * Umfangs-Deskriptor, `[bulk]` ohne Zusatz heisst `table`. Ohne die Art
 * beschrieb die Lesefläche jeden Baum als Tabelle — Zeilen und Spalten statt
 * Knoten und Tiefe.
 */
const BULK_RE = /^\[bulk(?::([a-z]+))?\]/;

/**
 * Das Auslassungs-Sentinel: `[omit:[][].image]`, mehrere Pfade durch
 * Leerraum getrennt. Der Inhalt darf `[]`-Paare enthalten, sonst keine
 * Klammern. Steht wie `[bulk]` am Anfang des Property-Kommentars, in
 * beliebiger Reihenfolge mit ihm.
 */
const OMIT_RE = /^\[omit:((?:[^[\]]|\[\])*)\]/;

/**
 * Die Sentinels am Anfang eines Property-Kommentars, und der Rest als Hilfe.
 * @param {string} raw
 * @returns {{ bulk: RegExpExecArray|null, omit: string[]|null, help: string }}
 */
function readSentinels(raw) {
  let rest = raw;
  let bulk = null;
  let omit = null;
  for (;;) {
    const b = bulk === null ? BULK_RE.exec(rest) : null;
    if (b) { bulk = b; rest = rest.slice(b[0].length).trimStart(); continue; }
    const o = omit === null ? OMIT_RE.exec(rest) : null;
    if (o) { omit = o[1].split(/\s+/).filter(Boolean); rest = rest.slice(o[0].length).trimStart(); continue; }
    return { bulk, omit, help: rest.trim() };
  }
}

/**
 * Die deklarierte Lesefläche eines Moduls, oder null.
 *
 * Der Block MUSS an einer Anweisung hängen (praktisch: unmittelbar über der
 * `createModule(`-Anweisung). Die TypeScript-Compiler-API hängt JSDoc an die
 * FOLGENDE Anweisung; ein frei stehender Kommentar am Dateiende ist über
 * `getJSDocTags` nicht erreichbar.
 *
 * @param {ts.SourceFile} sf  die Moduldatei
 * @returns {Record<string, { type: string, help: string, bulk: boolean, derived: true }>|null}
 */
export function readAgentReadTypedef(sf) {
  const literal = findTypedefLiteral(sf, AGENT_READ_TYPEDEF);
  if (!literal) return null;
  const found = {};
  for (const property of literal.jsDocPropertyTags ?? []) {
    const name = property.name?.getText(sf);
    if (!name || name.startsWith('_')) continue;
    const raw = cleanComment(property.comment);
    const s = readSentinels(raw);
    found[name] = {
      type: property.typeExpression?.type?.getText(sf) ?? 'any',
      help: s.help,
      bulk: s.bulk !== null,
      // Nur AN einem Massenfeld, nicht als `undefined` an jedem Feld: so
      // bleibt die erzeugte Registry dort unverändert, wo nichts zu sagen
      // ist — und die `deepEqual`-Fälle über die Feldform bleiben wahr.
      ...(s.bulk ? { bulkKind: s.bulk[1] ?? 'table' } : {}),
      ...(s.omit ? { omit: s.omit } : {}),
      derived: true,
    };
  }
  return found;
}

/**
 * Das Typliteral der Typedef `name`, oder null.
 *
 * Der Block MUSS an einer Anweisung hängen — siehe `readAgentReadTypedef`.
 * Gibt es mehrere gleichnamige, gewinnt die letzte (wie bisher).
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
 * Die Properties einer Typedef der Moduldatei als beschreibbare Schlüssel:
 * je Property Typ und JSDoc-Prosa. Ist eine Property selbst vom Typ einer
 * Typedef der Datei (auch als Liste oder mit `|null`), kommen deren
 * Schlüssel verschachtelt dazu (`keysOf`, `keys`). Eine Typedef, die auf dem
 * Pfad schon offen ist, wird nicht erneut aufgelöst — kein Zyklus.
 * Gerufen für die Viewmodel-Datei (`AgentRead`, `keyof`) und für die
 * Model-Datei (Felder einer Model-Klasse, `classFields`).
 *
 * @param {ts.SourceFile} sf
 * @param {string} name  der Typedef-Name
 * @param {Set<string>} [open]  die auf dem Pfad offenen Typedefs
 * @returns {Record<string, { type: string, help: string, optional?: true, keysOf?: string, keys?: object }>|null}
 *   null, wenn die Typedef in der Datei fehlt
 */
function typedefKeys(sf, name, open = new Set()) {
  const literal = findTypedefLiteral(sf, name);
  if (!literal) return null;
  const inner = new Set([...open, name]);
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
 * `keysOf`/`keys` für einen Typ, der eine Typedef der Datei nennt — sonst `{}`.
 * @param {ts.SourceFile} sf
 * @param {string} type
 * @param {Set<string>} open
 * @returns {{ keysOf?: string, keys?: object }}
 */
function nestedKeys(sf, type, open) {
  const ref = typeRefName(type);
  if (!ref || open.has(ref)) return {};
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

/** `keyof <Typedef>` als Typ eines Aktionsparameters. */
const KEYOF_RE = /^keyof\s+([A-Za-z_$][\w$]*)$/;

/**
 * Die Schlüsselfläche eines generischen Setters.
 *
 * `setParam(key, value)` bündelt viele Eingaben unter einer Aktion. Mit
 * `@param {keyof Params} key` erklärt das Modul die Schlüssel als Typedef:
 * je Schlüssel ein Typ (der Wertebereich von `value`) und ein Satz. Daraus
 * werden
 *   • `keys` an der Aktion (Typ + JSDoc-Prosa je Schlüssel; die Laufzeit
 *     legt den i18n-Satz `types.<Typedef>.<schlüssel>` darüber),
 *   • der Typ des Schlüsselparameters als Vereinigung der Schlüssel — der
 *     Agent sieht die konkrete Menge, das Modul schreibt sie nur einmal.
 *
 * Geprüft wird gegen die Laufzeit, damit Deklaration und Code nicht
 * auseinanderlaufen:
 *   • `key_set_mismatch:<aktion>:<schlüssel>` — die per
 *     `requireEnum('…', key, <MENGE>)` geprüfte Menge weicht ab, je
 *     abweichendem Schlüssel ein Befund;
 *   • `unverified_key_set:<aktion>` — keine geprüfte Menge ist auflösbar
 *     (nur `this.activeParams()` o. ä.): fail closed;
 *   • `key_value_mismatch:<aktion>:<schlüssel>` — die Prüfung aus der
 *     Prüftabelle (`PARAM_CHECKS[key](value)`) passt nicht zum Typ:
 *     `requireText` ↔ `string`, `requireNumber` ↔ `number`,
 *     `requireEnum(…, MENGE)` ↔ dieselbe Literalvereinigung. Eine eigene
 *     Prüffunktion oder eine nicht auflösbare Tabelle bleibt ungeprüft
 *     (blinder Fleck, kein Befund).
 *
 * @param {ts.SignatureDeclaration} fn  die Aktion
 * @param {string} action  ihr Name
 * @param {string} keyParam  der Parameter mit `keyof …`
 * @param {string} typedefName
 * @param {ts.SourceFile} sf
 * @returns {{ keys: Record<string, { type: string, help: string }>|null, violations: string[] }}
 */
function readKeySurface(fn, action, keyParam, typedefName, sf) {
  const keys = typedefKeys(sf, typedefName);
  if (!keys) return { keys: null, violations: [`unresolved_key_typedef:${action}:${typedefName}`] };

  const violations = [];
  const runtime = requireEnumKeySets(fn.body, new Set([keyParam]), sf).get(keyParam);
  if (!runtime) {
    violations.push(`unverified_key_set:${action}`);
  } else {
    const declared = Object.keys(keys);
    const differing = [
      ...runtime.filter(k => !declared.includes(k)),
      ...declared.filter(k => !runtime.includes(k)),
    ].sort();
    for (const k of differing) violations.push(`key_set_mismatch:${action}:${k}`);
  }

  const checks = checkTableOf(fn.body, keyParam, sf);
  for (const [name, { type }] of Object.entries(keys)) {
    const check = checks?.get(name);
    if (!check) continue;
    if (!checkMatchesType(check, type, sf)) violations.push(`key_value_mismatch:${action}:${name}`);
  }
  return { keys, violations };
}

/**
 * Die Prüftabelle eines generischen Setters: der Aufruf `<TABELLE>[key](…)`
 * im Methodenkörper, `<TABELLE>` als Objektliteral im Modul. Je Schlüssel
 * die Prüffunktion (Pfeil- oder Funktionsausdruck), oder null.
 * @param {ts.Block|undefined} body
 * @param {string} keyParam
 * @param {ts.SourceFile} sf
 * @returns {Map<string, ts.Node>|null}
 */
function checkTableOf(body, keyParam, sf) {
  let table = null;
  forEachCall(body, call => {
    if (table) return;
    const callee = call.expression;
    if (!ts.isElementAccessExpression(callee)) return;
    if (!ts.isIdentifier(callee.expression)) return;
    if (!ts.isIdentifier(callee.argumentExpression) || callee.argumentExpression.text !== keyParam) return;
    const decl = findLocalDeclaration(callee.expression.text, sf);
    if (!decl || !ts.isVariableDeclaration(decl) || !decl.initializer) return;
    if (!ts.isObjectLiteralExpression(decl.initializer)) return;
    table = new Map();
    for (const prop of decl.initializer.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const name = ts.isStringLiteralLike(prop.name) ? prop.name.text : prop.name.getText(sf);
      table.set(name, prop.initializer);
    }
  });
  return table;
}

/**
 * Passt die Prüffunktion zum deklarierten Typ? Unbekannte Prüfungen gelten
 * als passend — siehe `readKeySurface`.
 * @param {ts.Node} check
 * @param {string} type
 * @param {ts.SourceFile} sf
 * @returns {boolean}
 */
function checkMatchesType(check, type, sf) {
  let verdict = true;
  let seen = false;
  // Der Wert, den die Prüffunktion bekommt. Ein `requireEnum` auf etwas
  // anderem (etwa je Element einer Liste: `for (const m of v)
  // requireEnum('m', m, MENGE)`) sagt nichts über den Typ des Werts selbst.
  const param = (ts.isArrowFunction(check) || ts.isFunctionExpression(check))
    && check.parameters[0] && ts.isIdentifier(check.parameters[0].name)
    ? check.parameters[0].name.text : null;
  forEachCall(check, call => {
    if (seen || !ts.isIdentifier(call.expression)) return;
    const name = call.expression.text;
    if (name === 'requireText') { seen = true; verdict = type === 'string'; }
    else if (name === 'requireNumber') { seen = true; verdict = type === 'number'; }
    else if (name === 'requireBoolean') { seen = true; verdict = type === 'boolean'; }
    else if (name === 'requireNumericText') { seen = true; verdict = type === 'string'; }
    else if (name === 'requireEnum') {
      const subject = call.arguments[1];
      if (param && !(subject && ts.isIdentifier(subject) && subject.text === param)) return;
      seen = true;
      const allowed = call.arguments[2] && resolveStringArray(call.arguments[2], sf);
      if (!allowed) return;                     // nicht auflösbar: ungeprüft
      const literals = literalUnion(type);
      verdict = literals !== null && sameSet(literals, allowed);
    }
  });
  return verdict;
}

/** `'a'|'b'` → `['a', 'b']`; null, sobald ein Glied kein Zeichenkettenliteral ist. */
function literalUnion(type) {
  const parts = type.split('|').map(p => p.trim());
  const out = [];
  for (const part of parts) {
    const m = /^'([^']*)'$|^"([^"]*)"$/.exec(part);
    if (!m) return null;
    out.push(m[1] ?? m[2]);
  }
  return out;
}

/** @returns {boolean} gleiche Elemente, Reihenfolge egal */
function sameSet(a, b) {
  return a.length === b.length && a.every(x => b.includes(x));
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
 * @returns {{ actions: Record<string, object>, violations: string[], written: Set<string>, optionSources: Array<{ action: string, arg: string, field: string }>, subViewModels: string[] }}
 */
function readViewmodel(sf, resolver, appDir) {
  const out = { actions: {}, violations: [], written: new Set(), optionSources: [], subViewModels: [] };
  const literal = resolver.findDataReturnLiteral(sf);
  // Was der Generator NICHT sehen kann, muss er melden — sonst ginge ein
  // solches Modul mit gesetztem Modul-Tag und NULL Verstößen durch den Build
  // und würde `available: true`, obwohl keine einzige seiner Methoden
  // begutachtet wurde (Review-Befund I6/P1). Die Zusage („das
  // Modul-Tag ist maschinell nachgeprüft") wäre sonst eine leere Operation.
  if (!literal) { out.violations.push('unresolvable_data_literal'); return out; }

  const { members, unresolved } = resolver.collectMembers(literal, sf);
  // Die unauflösbaren Spreads stehen VORAN: sie sind der Befund über die
  // Vollständigkeit der folgenden Liste, nicht ein Befund in ihr.
  for (const expression of unresolved) out.violations.push(`unresolved_spread:${compact(expression)}`);

  // Einmal pro Modul aufgelöst, nicht pro Methode: dieselbe Model-Klasse,
  // die `readModelFields` für die Lesefläche auflöst, ist die Zielklasse
  // einer Delegation `this.model.<methode>(…)`. `null`, wenn die Klasse
  // nicht bestimmbar ist — `readModelFields` meldet das bereits über
  // `unresolvable_model_class`/`unresolved_model_class:<name>`, eine
  // Delegation zählt dann einfach nicht als Abdeckung (fail closed).
  const modelDecl = resolveModelClass(resolver, sf);
  const ctx = { resolver, modelDecl, out };

  for (const [name, entry] of members) {
    if (name.startsWith('_')) continue;
    const member = entry.member;
    // `name: new X(…)` mit importierter Klasse ist ein Teil-Viewmodel
    //; `new Map()` und Fabrikaufrufe bleiben Daten.
    const sub = ts.isPropertyAssignment(member) ? classOfNew(member.initializer, entry.sf, resolver) : null;
    if (sub) {
      if (!sub.decl) { out.violations.push(`unresolved_sub_viewmodel:${name}`); continue; }
      out.subViewModels.push(name);
      readSubViewModel(name, sub.decl, appDir, ctx);
      continue;
    }
    if (!isFunctionMember(member)) continue;         // Daten, keine Methode
    // Herkunft nur bei einem Mitglied aus einer ANDEREN Datei: bei einem
    // Mitglied der Moduldatei ist sie Rauschen, und die Codes der Tests 6–8
    // hängen an der kurzen Form.
    inspectMethod(name, member, sf, originSuffix(entry, sf, appDir), ctx);
  }
  return out;
}

/**
 * Prüft EIN Mitglied wie bisher die Schleife in `readViewmodel`: Marken,
 * Parameter, Schlüsselfläche, Rückgabe, Schreibabdeckung, Wertemengen.
 * `sf` ist die Datei, in der Typedefs und Prüfkonstanten eines
 * `keyof`-Setters stehen — an der Wurzel die Moduldatei, im Teil-Viewmodel
 * die Datei der Klasse.
 * @param {string} name  Aktionsname (`addGoal` oder `draft.addQuestion`)
 * @param {ts.Node} member  Literal-Mitglied oder Klassenmethode
 * @param {ts.SourceFile} sf
 * @param {string} from  Herkunftszusatz (`''` oder `@<pfad>`)
 * @param {{ resolver: object, modelDecl: object|null, out: object }} ctx
 */
function inspectMethod(name, member, sf, from, ctx) {
  const { out } = ctx;
  const tags = ts.getJSDocTags(member).map(t => t.tagName.text);
    const isAgent = tags.includes(MARK_AGENT);
    const isNoAgent = tags.includes(MARK_NOAGENT);

    if (!isAgent && !isNoAgent) { out.violations.push(`unmarked_method:${name}${from}`); return; }
    if (isNoAgent) return;

    const fn = functionFromMember(member);
    const params = [];
    for (const parameter of fn.parameters) {
      const paramName = parameter.name.getText();
      const tag = ts.getJSDocParameterTags(parameter)[0];
      if (!tag || !tag.typeExpression) { out.violations.push(`missing_param:${name}.${paramName}${from}`); continue; }
      params.push({
        name: paramName,
        type: tag.typeExpression.type.getText(),
        optional: tag.isBracketed === true,
        help: cleanComment(tag.comment),
      });
    }

    // Generischer Setter mit erklärter Schlüsselfläche (`keyof <Typedef>`).
    let keys = null;
    let keysOf = null;
    for (const param of params) {
      const keyof = KEYOF_RE.exec(param.type);
      if (!keyof) continue;
      const surface = readKeySurface(fn, name, param.name, keyof[1], sf);
      for (const v of surface.violations) out.violations.push(`${v}${from}`);
      if (surface.keys) {
        keys = surface.keys;
        keysOf = keyof[1];
        param.type = Object.keys(keys).map(k => `'${k}'`).join('|');
      }
    }

    const returnTag = ts.getJSDocReturnTag(fn);
    if (!returnTag || !returnTag.typeExpression) { out.violations.push(`missing_returns:${name}${from}`); }

    out.actions[name] = {
      params,
      returns: returnTag?.typeExpression?.type?.getText() ?? 'void',
      help: cleanComment(descriptionOf(member)),
      ...(keys ? { keysOf, keys } : {}),
    };

    // Nur der `@agent`-Zweig zählt als Schreibweg der Fläche (Task 1b): eine
    // `this.model.<feld> = …`-Zuweisung in einer `@noagent`-Methode deckt die
    // Vorlagenbindung NICHT ab — genau das ist der Unterschied zwischen
    // „ein Agent kann das Feld schreiben" und „irgendeine Methode tut es".
    for (const field of writtenModelFields(fn, ctx.resolver, ctx.modelDecl)) out.written.add(field);
    for (const source of stateOptionSources(fn.body, moduleLetNames(sf), fn)) out.optionSources.push({ action: name, ...source });
}

/** Abschnitte unter `actions.<name>` — als Methode eines Teil-Viewmodels kollidierten sie mit dem Hilfeschlüssel. */
const RESERVED_HELP_SEGMENTS = new Set(['help', 'params']);

/**
 * Die Klasse hinter `new X(…)` — Grundlage der Teil-Viewmodel-Erkennung.
 *
 * `null`: kein `new`-Ausdruck, oder eine Klasse, die die Datei weder
 * deklariert noch importiert (`new Map()`, `new Intl.Collator()`) — das
 * bleibt Daten wie bisher. `{ decl: null }`: lokal deklariert oder
 * importiert, aber nicht als Klasse OHNE `extends` auflösbar (fail closed:
 * geerbte Methoden blieben sonst ungeprüft aufrufbar). Sonst `{ decl }`.
 * @param {ts.Expression|undefined} expr
 * @param {ts.SourceFile} sf  die Datei, in der der Ausdruck steht
 * @param {ReturnType<import('./agent-resolve.mjs').createResolver>} resolver
 * @returns {{ decl: { node: ts.ClassDeclaration, sf: ts.SourceFile }|null }|null}
 */
function classOfNew(expr, sf, resolver) {
  let node = expr;
  while (node && ts.isParenthesizedExpression(node)) node = node.expression;
  if (!node || !ts.isNewExpression(node)) return null;
  let root = node.expression;
  while (ts.isPropertyAccessExpression(root)) root = root.expression;
  if (!ts.isIdentifier(root)) return null;
  if (!findLocalDeclaration(root.text, sf) && !findImportSource(root.text, sf)) return null;
  if (!ts.isIdentifier(node.expression)) return { decl: null };
  const decl = resolver.findDeclaration(node.expression.text, sf);
  if (!decl || !ts.isClassDeclaration(decl.node) || baseExpression(decl.node)) return { decl: null };
  return { decl };
}

/**
 * Die Methoden eines Teil-Viewmodels: dieselben
 * Prüfungen wie an der Wurzel, Aktionsname `<teil>.<methode>`, Herkunft
 * immer die Datei der Klasse. Genau eine Ebene: ein Teil-Viewmodel im
 * Teil-Viewmodel ist ein Befund. Die Datei der Klasse wird zusätzlich auf
 * DOM-Umwege geprüft — sonst wäre sie eine Blindstelle des Wächters.
 * @param {string} subName  der Schlüssel im `data()`-Literal
 * @param {{ node: ts.ClassDeclaration, sf: ts.SourceFile }} decl
 * @param {string} appDir
 * @param {{ resolver: object, modelDecl: object|null, out: object }} ctx
 */
function readSubViewModel(subName, decl, appDir, ctx) {
  const { node, sf } = decl;
  const file = relative(appDir, sf.fileName).split(sep).join('/');
  const from = `@${file}`;
  for (const code of collectDomDetours(sf)) ctx.out.violations.push(code.replace(/@(\d+)$/, `@${file}:$1`));
  for (const member of node.members) {
    if (ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Static) continue;
    for (const inner of fieldNews(member)) {
      if (inner.name.startsWith('_')) continue;
      if (classOfNew(inner.expr, sf, ctx.resolver)) ctx.out.violations.push(`nested_sub_viewmodel:${subName}.${inner.name}`);
    }
    if (!ts.isMethodDeclaration(member) || !member.body || !ts.isIdentifier(member.name)) continue;
    const method = member.name.text;
    if (method.startsWith('_')) continue;
    if (RESERVED_HELP_SEGMENTS.has(method)) {
      ctx.out.violations.push(`sub_viewmodel_key_collision:${subName}.${method}${from}`);
      continue;
    }
    inspectMethod(`${subName}.${method}`, member, sf, from, ctx);
  }
}

/**
 * Die Ausdrücke, die ein Klassenmitglied einem Feld zuweist: das Feld
 * selbst (`inner = new X()`) und `this.<feld> = …` auf der obersten Ebene
 * des Konstruktors oder einer Methode.
 * @param {ts.ClassElement} member
 * @returns {Array<{ name: string, expr: ts.Expression }>}
 */
function fieldNews(member) {
  if (ts.isPropertyDeclaration(member) && member.initializer && ts.isIdentifier(member.name)) {
    return [{ name: member.name.text, expr: member.initializer }];
  }
  const body = (ts.isConstructorDeclaration(member) || ts.isMethodDeclaration(member)) ? member.body : null;
  if (!body) return [];
  const out = [];
  for (const statement of body.statements) {
    if (!ts.isExpressionStatement(statement)) continue;
    const e = statement.expression;
    if (!ts.isBinaryExpression(e) || e.operatorToken.kind !== ts.SyntaxKind.EqualsToken) continue;
    if (!ts.isPropertyAccessExpression(e.left) || e.left.expression.kind !== ts.SyntaxKind.ThisKeyword) continue;
    out.push({ name: e.left.name.text, expr: e.right });
  }
  return out;
}

/**
 * Bindungen der Vorlage an `<teil>.model.…`. Ins Model
 * schreibt die Vorlage über `model.…` oder über eine Methode eines
 * Teil-Viewmodels — sonst sähen `unreachable_write` und
 * `template_model_call` den Schreibweg nicht.
 * @param {string} moduleDir
 * @param {string[]} subNames
 * @returns {string[]} Codes `sub_viewmodel_model_binding:<teil>.model.<pfad>`, entdoppelt
 */
function subViewModelModelBindings(moduleDir, subNames) {
  if (subNames.length === 0) return [];
  const out = new Set();
  for (const file of readdirSync(moduleDir)) {
    if (!file.endsWith('.html')) continue;
    const html = readFileSync(join(moduleDir, file), 'utf8');
    for (const name of subNames) {
      const re = new RegExp(`(?<![\\w$.])${name}\\.model\\.([A-Za-z_$][\\w$]*(?:\\.[A-Za-z_$][\\w$]*)*)`, 'g');
      for (const m of html.matchAll(re)) out.add(`sub_viewmodel_model_binding:${name}.model.${m[1]}`);
    }
  }
  return [...out];
}

/**
 * Die Model-Felder, die eine `@agent`-Methode SELBST schreibt, direkt oder
 * eine Ebene über eine Model-Methode delegiert — die Gegenprobe zu
 * `templateBindings().models` (Task 1b).
 *
 * Zwei Formen zählen, und BEIDE verlangen Parameterfluss (Review-Fund,
 * Fix-Runde 3): es reicht nicht, dass IRGENDEINE `@agent`-Methode das Feld
 * zuweist — der zugewiesene Wert muss aus einem Parameter DIESER Methode
 * stammen. Ohne diese Schranke hätte `changed() { this.model.apply(this.model.title); }`
 * (parameterlos, `apply(t) { this.title = t; }`) als Abdeckung gezählt —
 * genau die Form, die R2 an jedem Alpine-`@change`-Handler erzeugt
 * (`control-chart.chartTypeChanged`, `histogram.binModeChanged`), und genau
 * das Gegenteil der Regel („jedes `x-model`-gebundene Feld bekommt einen
 * `@agent`-SETTER" — ein parameterloses `clear()` ist kein Setter):
 *   1. `this.model.<feld> = <ausdruck>` / `+= <ausdruck>` direkt im
 *      `@agent`-Methodenkörper, wenn `<ausdruck>` einen Bezeichner eines
 *      Parameters DIESER Methode enthält (`derivesFromParams`). Eine
 *      Zuweisung an `this.model.<a>.<b>` zählt für den PFAD `<a>.<b>` —
 *      und nur für ihn, nicht mehr für `<a>`: wer bloß `<a>.<b>` setzt,
 *      kann `<a>` nicht als Ganzes setzen. `this.model.<a>[<key>] = …`
 *      zählt für `<a>.<k>` je Schlüssel `<k>` einer im Methodenkörper
 *      per `requireEnum('…', <key>, <MENGE>)` GEPRÜFTEN, im Modul
 *      auflösbaren Schlüsselmenge; ohne diese Prüfung zählt sie für
 *      NICHTS (fail closed). Dasselbe gilt für eine lokale Pfad-Hilfe
 *      (`setAtPath(this.model.<a>, <key>, …)`) — die muss ihrerseits
 *      nachweislich ZUWEISEN (`pathHelperAssigns`), sonst deckt sie nichts
 *      ab: eine nur lesende Hilfe ist kein Schreibweg.
 *   2. `this.model.<methode>(…)` — eine Delegation an eine Model-Methode,
 *      GENAU EINE Ebene tief (`fieldsCoveredByDelegation`): die Model-Methode
 *      muss SELBST `this.<feld> = <ausdruck>` zuweisen, `<ausdruck>` muss
 *      aus einem IHRER Parameter stammen, UND das Argument an genau dieser
 *      Position im Aufruf `this.model.<methode>(…)` muss wiederum aus einem
 *      Parameter der `@agent`-Methode stammen. Ruft die Model-Methode
 *      ihrerseits eine weitere Methode auf, zählt das NICHT — unaufgelöst
 *      bleibt ein Befund, keine Vermutung.
 *
 * @param {ts.SignatureDeclaration} fn
 * @param {ReturnType<import('./agent-resolve.mjs').createResolver>} resolver
 * @param {{ node: ts.ClassDeclaration, sf: ts.SourceFile }|null} modelDecl
 * @returns {Set<string>}
 */
function writtenModelFields(fn, resolver, modelDecl) {
  // `expandDerivedNames` zieht die Kette durch lokale Variablendeklarationen
  // (auch `let`) als Zwischenschritte
  // weiter (`const n = parseFloat(v)` leitet `n` von `v` ab) — ohne das bräche
  // sie bei der ersten Hilfsvariablen, und genau das tut `hypothesis-test`
  // (`setPowerGoal(v) { const n = parseFloat(v); … this.powerGoal = …(n); }`).
  const ownParams = new Set(parameterNames(fn).filter(Boolean));
  const agentParams = expandDerivedNames(fn.body, ownParams);
  // Die Datei der METHODE, nicht die des Moduls: ein Mitglied aus einem Mixin
  // löst seine Konstanten und Hilfsfunktionen in seiner eigenen Datei auf.
  const sf = fn.getSourceFile();
  const keySets = requireEnumKeySets(fn.body, ownParams, sf);
  // Die Pfad-Hilfe läuft IM Walk von `collectCoveredFields` mit: nur dort ist
  // die aktive, um Überschattungen bereinigte Namensmenge bekannt
  // (`xs.forEach(key => setAtPath(this.model.params, key, value))` bindet
  // `key` neu — Abschluss-Review A-M2).
  const fields = collectCoveredFields(fn.body, 'model', agentParams, keySets,
    (node, active) => fieldsCoveredByPathHelper(node, sf, keySets, active));
  forEachCall(fn.body, node => {
    const methodName = modelMethodCallOf(node);
    if (!methodName || !modelDecl) return;
    for (const field of fieldsCoveredByDelegation(resolver, modelDecl, methodName, node.arguments, agentParams)) {
      fields.add(field);
    }
  });
  return fields;
}

/**
 * Die geprüften Schlüsselmengen einer Methode: je Parametername die Liste
 * der Schlüssel, die ein `requireEnum('<name>', <param>, <MENGE>)` im
 * Methodenkörper zusichert.
 *
 * Nur so wird ein dynamischer Schreibweg (`this.model.params[key] = …`)
 * überhaupt entscheidbar — die Laufzeitprüfung IST die statische Grenze der
 * Fläche. Fehlt sie, oder ist `<MENGE>` nicht als Array-Literal aus
 * Zeichenketten auflösbar (ein Ausdruck, ein Methodenaufruf, Zahlen oder
 * Wahrheitswerte), bleibt der Parameter ohne Eintrag und der Schreibweg
 * deckt NICHTS ab (fail closed).
 *
 * @param {ts.Block|undefined} body
 * @param {Set<string>} ownParams  die Parameternamen DIESER Methode
 * @param {ts.SourceFile} sf
 * @returns {Map<string, string[]>}
 */
function requireEnumKeySets(body, ownParams, sf) {
  const sets = new Map();
  forEachCall(body, call => {
    if (!ts.isIdentifier(call.expression) || call.expression.text !== 'requireEnum') return;
    const [, value, allowed] = call.arguments;
    if (!value || !allowed || !ts.isIdentifier(value) || !ownParams.has(value.text)) return;
    const keys = resolveStringArray(allowed, sf);
    if (keys) sets.set(value.text, keys);
  });
  return sets;
}

/**
 * Die Zeichenketten eines Array-Literals — direkt (`['a', 'b']`), über eine
 * im Modul deklarierte Konstante (`PARAM_KEYS`) oder über eine Konstante, die
 * per benanntem Import aus einer relativen Datei kommt (`import { PRINCIPLES }
 * from './x-model.js'`). Der Import erlaubt, die Liste dort zu führen, wo sie
 * fachlich hingehört, statt sie im Viewmodel als zweites Literal zu
 * wiederholen. `null`, sobald ein Element keine Zeichenkette ist oder die
 * Konstante nicht auflösbar ist (Paketimport, fehlende Datei).
 * @param {ts.Expression} expr
 * @param {ts.SourceFile} sf
 * @returns {string[]|null}
 */
function resolveStringArray(expr, sf) {
  let literal = expr;
  if (ts.isIdentifier(expr)) {
    const decl = findDeclarationViaImport(expr.text, sf);
    if (!decl || !ts.isVariableDeclaration(decl) || !decl.initializer) return null;
    literal = decl.initializer;
  }
  if (!ts.isArrayLiteralExpression(literal)) return null;
  const keys = [];
  for (const element of literal.elements) {
    if (!ts.isStringLiteralLike(element)) return null;
    keys.push(element.text);
  }
  return keys;
}

/**
 * Die Deklaration eines Namens — in der Datei selbst, sonst eine Ebene über
 * einen benannten relativen Import. Keine Kette: ein Re-Export im Ziel bleibt
 * unauflösbar (fail closed).
 * @param {string} name
 * @param {ts.SourceFile} sf
 * @returns {ts.Node|null}
 */
function findDeclarationViaImport(name, sf) {
  const local = findLocalDeclaration(name, sf);
  if (local) return local;
  const imported = findImportSource(name, sf);
  const file = imported && resolveSpecifier(imported.specifier, sf.fileName);
  if (!file) return null;
  // Ohne Zwischenspeicher: `build --watch` läuft im selben Prozess weiter,
  // ein Cache sähe eine geänderte Schlüsseldatei nicht.
  let target;
  try {
    target = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  } catch {
    return null;
  }
  return findLocalDeclaration(imported.originalName, target);
}

/**
 * Die Felder, die ein Aufruf einer Pfad-Hilfe abdeckt —
 * `setAtPath(this.model.params, key, value)` zählt wie
 * `this.model.params[key] = value`.
 *
 * Fünf Bedingungen, alle fünf notwendig (fail closed): die gerufene Funktion
 * ist im Modul oder eine Ebene über einen benannten relativen Import als
 * FUNKTION auflösbar (`findDeclarationViaImport` — so liegt die gemeinsame
 * Hilfe in `core/agent/agent-path.js`; ein Paketimport oder unbekannter
 * Name deckt nichts ab, eine gleichnamige Klasse oder eine Konstante ohne
 * Funktionsinitialisierer ebenso nicht), sie WEIST in ihrem Körper
 * tatsächlich zu (`pathHelperAssigns` — Review-Fund: `logKeys(this.model.params, key)`
 * erfüllte sonst alle äußeren Merkmale und gab ein Feld frei, das kein Agent
 * setzen kann), ihr erstes Argument ist eine statische `this.model.<pfad>`-
 * Kette, ein weiteres Argument ist ein Parameter mit geprüfter
 * Schlüsselmenge, der an der Aufrufstelle NICHT überschattet ist, und ein
 * drittes Argument (weder Basis noch Schlüssel) stammt aus den Parametern
 * der `@agent`-Methode (`derivesFromParams` — Abschluss-Review A-I3:
 * `reset(key) { …; setAtPath(this.model.params, key, 0); }` setzt eine
 * Konstante und ist kein Setter, genau wie `this.model.params[key] = 0`).
 * Ein Schlüssel mit Punkt (`'tolerance.LSL'`) wird wörtlich
 * angehängt — damit deckt derselbe Mechanismus die zweite Ebene ab, ohne
 * eine eigene Regel.
 *
 * @param {ts.CallExpression} call
 * @param {ts.SourceFile} sf
 * @param {Map<string, string[]>} keySets
 * @param {Set<string>} active  die an der Aufrufstelle gültigen, aus den
 *   Parametern der `@agent`-Methode abgeleiteten Namen
 * @returns {string[]}
 */
function fieldsCoveredByPathHelper(call, sf, keySets, active) {
  if (keySets.size === 0) return [];
  if (!ts.isIdentifier(call.expression)) return [];
  const decl = findDeclarationViaImport(call.expression.text, sf);
  // Fail closed: ohne auflösbare Deklaration ist der Körper nicht lesbar.
  if (!decl) return [];
  const helper = functionOfDeclaration(decl);
  // Fail closed: `findDeclarationViaImport` liefert auch Klassen und
  // Variablen — nur ein lesbarer Funktionskörper ist prüfbar.
  if (!helper || !pathHelperAssigns(helper)) return [];
  const [base, ...rest] = call.arguments;
  if (!base) return [];
  const target = isModelRoot(base) ? { path: '', key: null } : assignTargetAfterThis(base, 'model');
  if (!target || target.key) return [];
  const keyArg = rest.find(argument => ts.isIdentifier(argument)
    && keySets.has(argument.text) && active.has(argument.text));
  if (!keyArg) return [];
  if (!rest.some(argument => argument !== keyArg && derivesFromParams(argument, active))) return [];
  return keySets.get(keyArg.text).map(key => (target.path ? `${target.path}.${key}` : key));
}

/**
 * Ob ein Ausdruck genau `this.model` ist — die Wurzel des Models als Basis
 * einer Pfad-Hilfe (`setAtPath(this.model, key, value)`).
 * @param {ts.Expression} node
 * @returns {boolean}
 */
function isModelRoot(node) {
  return ts.isPropertyAccessExpression(node) && node.name.text === 'model'
    && node.expression.kind === ts.SyntaxKind.ThisKeyword;
}

/**
 * Die Funktion hinter einer Deklaration — die Deklaration selbst, wenn sie
 * eine `function`-Deklaration ist, sonst der Funktions- oder
 * Pfeilfunktions-Initialisierer einer Variablen (`const setAtPath = (…) => …`).
 * `null` für alles andere (fail closed): eine Klasse, ein Objektliteral oder
 * eine Variable ohne Initialisierer hat keinen Körper, dessen Zuweisungen
 * sich prüfen ließen.
 * @param {ts.FunctionDeclaration|ts.VariableDeclaration|ts.ClassDeclaration} decl
 * @returns {ts.FunctionDeclaration|ts.FunctionExpression|ts.ArrowFunction|null}
 */
function functionOfDeclaration(decl) {
  if (ts.isFunctionDeclaration(decl)) return decl;
  if (!ts.isVariableDeclaration(decl) || !decl.initializer) return null;
  const init = decl.initializer;
  if (ts.isFunctionExpression(init) || ts.isArrowFunction(init)) return init;
  return null;
}

/**
 * Ob eine Pfad-Hilfe wirklich SCHREIBT: ein `<basis>[<schlüssel>] = <wert>`
 * in ihrem Körper, dessen Basis auf ihren ERSTEN Parameter zurückgeht und
 * dessen rechte Seite aus einem ihrer eigenen Parameter stammt.
 *
 * Das ist die Gegenprobe, die `fieldsCoveredByDelegation` für Delegationen
 * längst verlangt (die Model-Methode muss selbst aus einem IHRER Parameter
 * zuweisen) — ohne sie zählte eine rein lesende Hilfe
 * (`logKeys(this.model.params, key)`, `validate(this.model.params, key)`)
 * als volle Abdeckung jedes Schlüssels der geprüften Menge.
 *
 * Die Aliaskette ist dabei ausdrücklich erlaubt, denn die kanonische Form
 * schreibt nicht an `obj` selbst:
 *   `let cur = obj; for (…) cur = cur[p]; cur[letztes] = value;`
 * `expandDerivedNames` zieht `cur` über `let cur = obj` an den ersten
 * Parameter heran; die Neuzuweisung in der Schleife ändert daran nichts, weil
 * sie `cur` aus `cur` ableitet. Verlangt wird ein BERECHNETES Glied
 * (`<basis>[…]`), denn nur ein solches trägt den dynamischen Schlüssel —
 * `obj.feld = wert` wäre ein fester Pfad und keine Pfad-Hilfe.
 *
 * @param {ts.FunctionDeclaration|ts.FunctionExpression|ts.ArrowFunction} fn
 * @returns {boolean}
 */
function pathHelperAssigns(fn) {
  // Fail closed: eine Kurzform-Pfeilfunktion (`(o, k) => o[k]`) hat keinen
  // Block — ein Ausdruck ohne Zuweisung deckt nichts ab.
  if (!fn.body || !ts.isBlock(fn.body)) return false;
  const params = parameterNames(fn).filter(Boolean);
  const [first] = parameterNames(fn);
  // Fail closed: ohne benannten ersten Parameter (destrukturiert, gar keiner)
  // ist nicht entscheidbar, ob die Zuweisung das übergebene Ziel trifft.
  if (!first) return false;
  const bases = expandDerivedNames(fn.body, new Set([first]));
  const values = expandDerivedNames(fn.body, new Set(params));
  let assigns = false;
  const walk = (node) => {
    if (assigns) return;
    if (ts.isBinaryExpression(node) && ASSIGN_KINDS.has(node.operatorToken.kind)
      && ts.isElementAccessExpression(node.left)
      && derivesFromParams(node.left.expression, bases)
      && derivesFromParams(node.right, values)) {
      assigns = true;
      return;
    }
    ts.forEachChild(node, walk);
  };
  walk(fn.body);
  return assigns;
}

/**
 * Erweitert `names` um lokale Variablendeklarationen (auch `let`), deren Initialisierer
 * (bereits bekanntermaßen) aus `names` ableitet — die Kette durch eine
 * Zwischenvariable weiterziehen, statt an ihr abzureißen. Nur TOP-LEVEL-
 * Deklarationen im übergebenen Block zählen, keine in einer Verzweigung
 * oder einer verschachtelten Funktion; alles andere bleibt bei der engen
 * Prüfung (fail closed: eine Zwischenvariable in einem `if`-Zweig wird
 * NICHT verfolgt, lieber ein übersehener Treffer als ein erfundener).
 * Iteriert bis zum Fixpunkt, weil die Deklarationsreihenfolge im
 * Normalfall, aber nicht zwingend, die Ableitungsreihenfolge ist.
 * @param {ts.Block|undefined} body
 * @param {Set<string>} names
 * @returns {Set<string>}
 */
function expandDerivedNames(body, names) {
  if (!body || !ts.isBlock(body)) return names;
  const derived = new Set(names);
  let changed = true;
  while (changed) {
    changed = false;
    for (const statement of body.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const decl of statement.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer || derived.has(decl.name.text)) continue;
        if (derivesFromParams(decl.initializer, derived)) {
          derived.add(decl.name.text);
          changed = true;
        }
      }
    }
  }
  return derived;
}

/**
 * Zustandsabhängige Wertemengen einer `@agent`-Methode: Aufrufe von
 * `requireEnum`/`requireKnownId`, deren drittes Argument an `this` hängt.
 * Dann muss die Lesefläche die Menge nennen — sonst erfährt ein Agent sie
 * nur aus einem Fehlschlag.
 *
 * Erkennung ist FORMGEBUNDEN, nicht fail closed. Das dritte Argument zählt,
 * wenn es auf einen Zugriff an `this` zurückführt: direkt, über einen lokalen
 * `const`-Alias auf der Top-Ebene des Körpers (Kette bis Fixpunkt), über
 * fremde Wrapper-Aufrufe mit genau einem Argument (`Object.keys(this.model.unitKeys())`;
 * beliebig tief verschachtelt — meldet eher zu viel), mit angehängter
 * Projektion (`.map(…)`/`.filter(…)`) oder mit Elementzugriff
 * (`this.pickableColumns()[slot]`). Der abgeleitete Name ist
 * das erste Segment nach `this.model.` bzw. `this.`, ohne `()`:
 *   `this.model.currentOptions`           → `currentOptions`
 *   `Object.keys(this.model.unitKeys())`  → `unitKeys`
 *   `this.pickableColumns()`              → `pickableColumns`
 * Kein Name ergibt sich bei: `_`-Präfix, Aufruf MIT Argumenten
 * (`this.idsFor(x)`), bares `this.model`. DOKUMENTIERTER BLINDER FLECK:
 * Spread im Array-Literal (`['all', ...this.owners()]`), `(x ?? []).map(…)`,
 * ein `let`-Alias (nur `const` wird verfolgt), Parameter-/Cache-Variablen,
 * Konstanten und bares `this.model`
 * (`Object.keys(this.model)`) — all das ist kein Befund.
 * Ob der Name als Lesefeld deklariert ist, entscheidet `buildEntry`.
 *
 * @param {ts.Block|undefined} body
 * @param {Set<string>} [moduleLets]  auf Modulebene mit `let`/`var` deklarierte Namen
 * @param {ts.FunctionLikeDeclaration} [fn]  die Methode; ihre Parameter und lokalen Deklarationen verdecken gleichnamige Modul-lets
 *
 * Blinde Flecken von `module_state_option_source` (falsch negativ, kein Befund):
 * Array-Literal/Spread, `Object.keys(x)`-Wrapper über mehrere Ebenen und
 * Aufrufe mit zwei oder mehr Argumenten werden nicht aufgelöst.
 * @returns {Array<{ arg: string, field?: string, moduleState?: string }>}
 */
function stateOptionSources(body, moduleLets = new Set(), fn = undefined) {
  if (!body || !ts.isBlock(body)) return [];
  const aliases = new Map();
  for (const statement of body.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    if (!(statement.declarationList.flags & ts.NodeFlags.Const)) continue;
    for (const decl of statement.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.initializer) aliases.set(decl.name.text, decl.initializer);
    }
  }
  const shadowed = localBindingNames(fn, body);
  const out = [];
  forEachCall(body, call => {
    if (!ts.isIdentifier(call.expression)) return;
    if (call.expression.text !== 'requireEnum' && call.expression.text !== 'requireKnownId') return;
    const [first, , allowed] = call.arguments;
    if (!first || !allowed) return;
    const arg = ts.isStringLiteralLike(first) ? first.text : first.getText();
    const field = optionFieldOf(allowed, aliases, new Set());
    if (field) { out.push({ arg, field }); return; }
    const root = rootIdentifier(allowed, aliases, new Set());
    if (root && moduleLets.has(root) && !shadowed.has(root)) out.push({ arg, moduleState: root });
  });
  return out;
}

/** Parameter- und lokale Deklarationsnamen (auch destrukturiert, auch in verschachtelten Blöcken) einer Methode. */
function localBindingNames(fn, body) {
  const out = new Set();
  const addName = (name) => {
    if (ts.isIdentifier(name)) { out.add(name.text); return; }
    for (const el of name.elements) if (ts.isBindingElement(el)) addName(el.name);
  };
  for (const p of fn?.parameters ?? []) addName(p.name);
  const walk = (n) => {
    if ((ts.isVariableDeclaration(n) || ts.isParameter(n)) && n !== body) addName(n.name);
    ts.forEachChild(n, walk);
  };
  walk(body);
  return out;
}

/** Namen der auf Modulebene mit `let`/`var` deklarierten Bindungen — veränderlicher Modulzustand. */
function moduleLetNames(sf) {
  const out = new Set();
  for (const statement of sf.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    if (statement.declarationList.flags & ts.NodeFlags.Const) continue;
    for (const decl of statement.declarationList.declarations) {
      if (ts.isIdentifier(decl.name)) out.add(decl.name.text);
    }
  }
  return out;
}

/** Der Wurzel-Bezeichner einer Mengen-Ausdruckskette (`_ids`, `_ids.map(…)`, Alias darauf), sonst null. */
function rootIdentifier(expr, aliases, seen) {
  while (ts.isParenthesizedExpression(expr) || ts.isNonNullExpression(expr) || ts.isAsExpression(expr)) expr = expr.expression;
  if (ts.isIdentifier(expr)) {
    const init = aliases.get(expr.text);
    if (!init) return expr.text;
    if (seen.has(expr.text)) return null;
    seen.add(expr.text);
    return rootIdentifier(init, aliases, seen);
  }
  if (ts.isElementAccessExpression(expr) || ts.isPropertyAccessExpression(expr)) return rootIdentifier(expr.expression, aliases, seen);
  if (ts.isCallExpression(expr)) {
    const callee = expr.expression;
    if (ts.isPropertyAccessExpression(callee)) return rootIdentifier(callee.expression, aliases, seen);
    return expr.arguments.length === 1 ? rootIdentifier(expr.arguments[0], aliases, seen) : null;
  }
  return null;
}

/**
 * Das erste Segment nach `this.model.`/`this.`, wenn `expr` rein aus einer
 * `this`-Kette besteht — oder `null`. Siehe `stateOptionSources`.
 * @param {ts.Expression} expr
 * @param {Map<string, ts.Expression>} aliases
 * @param {Set<string>} seen  Zyklenschutz für Alias-Ketten
 * @returns {string|null}
 */
function optionFieldOf(expr, aliases, seen) {
  while (ts.isParenthesizedExpression(expr) || ts.isNonNullExpression(expr) || ts.isAsExpression(expr)) expr = expr.expression;
  if (ts.isIdentifier(expr)) {
    const init = aliases.get(expr.text);
    if (!init || seen.has(expr.text)) return null;
    seen.add(expr.text);
    return optionFieldOf(init, aliases, seen);
  }
  // `this.pickableColumns()[slot]`: der Elementzugriff wählt nur aus der
  // Menge aus — benannt wird sie am Zugriff davor (Abschluss-Review A-I1).
  if (ts.isElementAccessExpression(expr)) return optionFieldOf(expr.expression, aliases, seen);
  if (ts.isCallExpression(expr)) {
    const callee = expr.expression;
    if (ts.isPropertyAccessExpression(callee) && (callee.name.text === 'map' || callee.name.text === 'filter')) {
      return optionFieldOf(callee.expression, aliases, seen);
    }
    const segments = thisSegments(callee);
    if (segments) return expr.arguments.length === 0 ? firstOptionSegment(segments) : null;
    // Ein fremder Wrapper (`Object.keys(…)`): genau EIN Argument.
    return expr.arguments.length === 1 ? optionFieldOf(expr.arguments[0], aliases, seen) : null;
  }
  const segments = thisSegments(expr);
  return segments ? firstOptionSegment(segments) : null;
}

/** Die Segmente einer reinen `this.a.b`-Kette, sonst `null`. */
function thisSegments(node) {
  const segments = [];
  while (ts.isPropertyAccessExpression(node)) {
    segments.unshift(node.name.text);
    node = node.expression;
  }
  return node.kind === ts.SyntaxKind.ThisKeyword && segments.length > 0 ? segments : null;
}

/** Erstes Segment nach `model.`, ohne `_`-Präfix; `null` bei bares `this.model`. */
function firstOptionSegment(segments) {
  const rest = segments[0] === 'model' ? segments.slice(1) : segments;
  const name = rest[0];
  return name && !name.startsWith('_') ? name : null;
}

/**
 * Die Namen der einfachen (nicht destrukturierten) Parameter einer Funktion,
 * POSITIONSGETREU — `null` an einer destrukturierten Position, damit der
 * Aufrufer die Position trotzdem zählen kann, ohne ihr einen Namen
 * zuzuschreiben.
 * @param {ts.SignatureDeclaration} fn
 * @returns {Array<string|null>}
 */
function parameterNames(fn) {
  return fn.parameters.map(p => (ts.isIdentifier(p.name) ? p.name.text : null));
}

/**
 * Ob `expr` einen Bezeichner aus `names` enthält — die Prüfung „der Wert
 * stammt aus einem Parameter". Bewusst NICHT über verschachtelte
 * Funktionsgrenzen hinweg (eine Closure könnte einen gleichnamigen eigenen
 * Parameter binden, der NICHT der äußere ist; der Aufrufer — `collectCoveredFields`
 * — löst das bereits, indem er `names` beim Abstieg in eine Closure um deren
 * eigene Parameter bereinigt, bevor er hierher kommt, aber diese Funktion
 * selbst bleibt zusätzlich konservativ und steigt nicht noch TIEFER in eine
 * im Ausdruck selbst liegende Closure ab) und bewusst NICHT über den
 * `.name` einer `PropertyAccessExpression` (`this.model.title` enthält
 * keinen Bezeichner `title` in diesem Sinn) ODER den Schlüssel einer
 * `PropertyAssignment` (`{ t: 1 }` — der Schlüssel `t` ist kein Bezeichner-
 * VERWEIS, nur ein Name; sonst bewiese ein Objektliteral mit einem zufällig
 * gleichnamigen Schlüssel einen Parameterfluss, der nicht da ist — Review-
 * Fund, Fix-Runde 4. `{ t }` (Kurzform) bleibt dagegen ein echter Verweis
 * und wird nicht ausgenommen.
 * @param {ts.Node} expr
 * @param {Set<string>} names
 * @returns {boolean}
 */
function derivesFromParams(expr, names) {
  if (names.size === 0) return false;
  let found = false;
  const walk = (node) => {
    if (found || isFunctionLike(node)) return;
    if (ts.isPropertyAccessExpression(node)) { walk(node.expression); return; }
    if (ts.isPropertyAssignment(node)) { walk(node.initializer); return; }
    if (ts.isIdentifier(node)) { if (names.has(node.text)) found = true; return; }
    ts.forEachChild(node, walk);
  };
  walk(expr);
  return found;
}

/**
 * Alle Aufrufe (`ts.CallExpression`) in `node`, ohne Unterscheidung nach
 * Zuweisungen — ergänzt `collectCoveredFields` (Zuweisungen) um den
 * zweiten Knotentyp, den `writtenModelFields` sehen muss.
 * @param {ts.Node} node
 * @param {(call: ts.CallExpression) => void} visit
 */
function forEachCall(node, visit) {
  const walk = (n) => {
    if (ts.isCallExpression(n)) visit(n);
    ts.forEachChild(n, walk);
  };
  if (node) walk(node);
}

/**
 * Die Felder, die `this.<durch>.<feld> = …` zuweist, deren rechte Seite aus
 * `names` ableitet (`derivesFromParams`) — der gemeinsame Walk hinter
 * `writtenModelFields` (direkte Form, `durch = 'model'`) UND
 * `fieldsCoveredByDelegation` (Model-Methodenkörper, `durch = null`).
 *
 * Steigt BEWUSST in verschachtelte Closures ab, um dort liegende
 * Zuweisungen zu finden (`setTimeout(() => { this.model.title = t; })` soll
 * weiter zählen, wie bei `collectDomDetours`) — aber verfolgt dabei die
 * aktive Namensmenge mit, statt sie unverändert durchzureichen: tritt die
 * Funktion in eine Closure oder einen Block ein, der einen Namen aus
 * `names` NEU bindet (ein Closure-Parameter, eine `let`/`const`-Deklaration
 * im Block), fällt dieser Name für den gesamten Rest dieses Teilbaums aus
 * der aktiven Menge — er bezeichnet dort etwas anderes (Review-Fund,
 * Fix-Runde 4: ein Closure-Parameter oder eine Block-lokale Variable mit
 * zufällig demselben Namen bewies bisher denselben Parameterfluss wie der
 * äußere Parameter). Eine `let`-Neuzuweisung (keine Deklaration) entfernt
 * nichts — `let n = t; n = GLOBAL; … = n` bleibt absichtlich ERFASST, denn
 * auf dem Pfad vor der Neuzuweisung ist das Feld wirklich parametererreichbar
 * gewesen; eine pfadsensitive Analyse ist hier ausdrücklich nicht das Ziel.
 *
 * @param {ts.Block|undefined} body
 * @param {string|null} through
 * @param {Set<string>} names
 * @param {Map<string, string[]>} [keySets]  die geprüften Schlüsselmengen
 *   dieser Methode; leer bei der Delegationsauflösung — eine im MODEL
 *   geprüfte Menge zählt nicht, weil die Prüfung dort nicht die Fläche des
 *   Agenten begrenzt (fail closed).
 * @param {(call: ts.CallExpression, active: Set<string>) => string[]} [onCall]
 *   weitere Abdeckung je Aufruf, mit der an dieser Stelle aktiven Namensmenge
 *   (die Pfad-Hilfe)
 * @returns {Set<string>}
 */
function collectCoveredFields(body, through, names, keySets = new Map(), onCall = null) {
  const fields = new Set();
  const walk = (node, active) => {
    if (isFunctionLike(node)) {
      const next = withoutNames(active, parameterNames(node));
      ts.forEachChild(node, child => walk(child, next));
      return;
    }
    if (ts.isBlock(node)) {
      const next = withoutNames(active, topLevelDeclaredNames(node));
      for (const statement of node.statements) walk(statement, next);
      return;
    }
    if (ts.isBinaryExpression(node) && ASSIGN_KINDS.has(node.operatorToken.kind)) {
      const target = assignTargetAfterThis(node.left, through);
      if (target && derivesFromParams(node.right, active)) {
        for (const field of fieldsOfTarget(target, keySets, active)) fields.add(field);
      }
    }
    if (onCall && ts.isCallExpression(node)) {
      for (const field of onCall(node, active)) fields.add(field);
    }
    ts.forEachChild(node, child => walk(child, active));
  };
  if (body) {
    // Die TOP-Ebene von `body` selbst bekommt die Block-Schattierungsprüfung
    // NICHT — ihre eigenen `const`-Deklarationen sind genau die, die
    // `expandDerivedNames` bereits geprüft und in `names` aufgenommen hat
    // (`const n = parseFloat(v)`); sie noch einmal als „neu gebunden" zu
    // behandeln, entzöge der Aufrufer-Prüfung sofort wieder, was sie gerade
    // bestätigt hat. Erst ein tiefer verschachtelter Block (eine
    // Verzweigung, eine Closure) bekommt die Schattierungsprüfung — über
    // den normalen Abstieg der `walk`-Funktion selbst.
    for (const statement of body.statements) walk(statement, names);
  }
  return fields;
}

/**
 * `names` ohne die Einträge aus `toRemove` — gibt `names` selbst zurück,
 * wenn nichts zu entfernen war (keine unnötige Kopie bei jedem Block, der
 * nicht schattiert).
 * @param {Set<string>} names
 * @param {Array<string|null>} toRemove
 * @returns {Set<string>}
 */
function withoutNames(names, toRemove) {
  const hit = toRemove.some(n => n && names.has(n));
  if (!hit) return names;
  const next = new Set(names);
  for (const n of toRemove) if (n) next.delete(n);
  return next;
}

/**
 * Die Namen der `let`/`const`/`var`-Deklarationen UNMITTELBAR in diesem
 * Block (nicht in einem verschachtelten Block) — die „neu gebundenen"
 * Namen, die eine äußere gleichnamige Bindung für den Rest dieses Blocks
 * verdecken.
 * @param {ts.Block} block
 * @returns {string[]}
 */
function topLevelDeclaredNames(block) {
  const names = [];
  for (const statement of block.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const decl of statement.declarationList.declarations) {
      if (ts.isIdentifier(decl.name)) names.push(decl.name.text);
    }
  }
  return names;
}

/**
 * Das Zuweisungsziel hinter `this.<durch>.…` (oder direkt `this.…`, wenn
 * `durch` null ist) als PFAD — `null`, wenn die Kette nicht an `this`
 * (bzw. `this.<durch>`) hängt oder nicht entscheidbar ist.
 *
 * Zwei Formen kommen heraus, und nur diese zwei:
 *   • `{ path: 'a.b', key: null }` für eine durchgehend statische Kette
 *     `this.<durch>.a.b` — der volle Pfad, nicht das erste Segment.
 *   • `{ path: 'a', key: 'key' }` für `this.<durch>.a[key]`, also einen
 *     Bezeichner als LETZTES Glied; welche Felder das trifft, entscheidet
 *     erst die geprüfte Schlüsselmenge (`requireEnumKeySets`).
 * Alles andere ist `null` (fail closed): ein Index MITTEN in der Kette
 * (`this.model.rows[0].a`) nennt kein Feld der Lesefläche, ein berechneter
 * Schlüssel ohne Bezeichner (`this.model.a[i + 1]`) nennt keinen, und
 * `this.<durch>[key]` hat keine Basis, an die ein Schlüssel passte.
 *
 * @param {ts.Node} node  die linke Seite einer Zuweisung
 * @param {string|null} through  das Zwischenglied (`'model'`), oder `null`
 *   für eine direkte `this.<feld>`-Kette (innerhalb der Model-Klasse selbst)
 * @returns {{ path: string, key: string|null }|null}
 */
function assignTargetAfterThis(node, through) {
  const segments = [];
  let current = node;
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    segments.unshift(ts.isPropertyAccessExpression(current)
      ? { name: current.name.text, key: null }
      : { name: null, key: ts.isIdentifier(current.argumentExpression) ? current.argumentExpression.text : null });
    current = current.expression;
  }
  if (current.kind !== ts.SyntaxKind.ThisKeyword) return null;
  if (through) {
    if (segments[0]?.name !== through) return null;
    segments.shift();
  }
  if (segments.length === 0) return null;
  const last = segments.pop();
  if (segments.some(segment => segment.name === null)) return null;
  const base = segments.map(segment => segment.name);
  if (last.name !== null) return { path: [...base, last.name].join('.'), key: null };
  // Leere Basis nur an der Model-Wurzel (`this.model[key]`); `this[key] = …`
  // am Viewmodel ist keine Model-Abdeckung.
  if (last.key === null || (base.length === 0 && through !== 'model')) return null;
  return { path: base.join('.'), key: last.key };
}

/**
 * Die Felder, die ein Zuweisungsziel trifft — der Pfad selbst, oder bei
 * einem dynamischen Schlüssel ein Pfad je geprüftem Schlüssel. Ohne
 * geprüfte Menge: nichts (fail closed). Ebenso nichts, wenn der Schlüssel
 * an dieser Stelle überschattet ist (`xs.forEach(key => { this.model.params[key] = v; })`
 * — das innere `key` ist nicht das geprüfte; Abschluss-Review A-M2).
 * @param {{ path: string, key: string|null }} target
 * @param {Map<string, string[]>} keySets
 * @param {Set<string>} active  die an dieser Stelle gültigen Namen
 * @returns {string[]}
 */
function fieldsOfTarget(target, keySets, active) {
  if (target.key === null) return [target.path];
  if (!active.has(target.key)) return [];
  const keys = keySets.get(target.key);
  if (!keys) return [];
  return keys.map(key => (target.path ? `${target.path}.${key}` : key));
}

/**
 * `this.model.<name>(…)` als Aufrufziel, oder `null`.
 * @param {ts.CallExpression} node
 * @returns {string|null}
 */
function modelMethodCallOf(node) {
  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee)) return null;
  const base = callee.expression;
  if (!ts.isPropertyAccessExpression(base)) return null;
  if (base.name.text !== 'model') return null;
  if (base.expression.kind !== ts.SyntaxKind.ThisKeyword) return null;
  return callee.name.text;
}

/**
 * Die Model-Klasse eines Moduls, aufgelöst wie in `readModelFields` — hier
 * als eigener Einstieg, weil Task 1b sie ein zweites Mal braucht (die
 * Delegationsauflösung), ohne die Lesefläche selbst zu wiederholen.
 * `null` bleibt unauffällig: der zugehörige Befund steht schon über
 * `readModelFields` im Ergebnis, eine Delegation zählt dann nur nicht als
 * Abdeckung.
 *
 * Anders als `readModelFields` ignoriert diese Funktion `decl.node.ambiguous`
 * absichtlich, statt `ambiguous_model_class:<name>` ein zweites Mal zu
 * melden: der Befund steht bereits über `readModelFields` im Ergebnis
 * (blockierend, sobald das Modul getaggt ist) — eine Delegation hier mit
 * derselben mehrdeutigen Klasse aufzulösen ist dieselbe Unsicherheit, nicht
 * eine neue.
 * @param {ReturnType<import('./agent-resolve.mjs').createResolver>} resolver
 * @param {ts.SourceFile} sf  die MODUL-Datei
 * @returns {{ node: ts.ClassDeclaration, sf: ts.SourceFile }|null}
 */
function resolveModelClass(resolver, sf) {
  const name = modelClassName(sf);
  if (!name) return null;
  const decl = resolver.findDeclaration(name, sf);
  if (!decl || !ts.isClassDeclaration(decl.node)) return null;
  return decl;
}

/**
 * Die Felder, die eine bestimmte Model-Methode über `this.<feld> = …`
 * zuweist, UND NUR DIE, deren zugewiesener Wert über die Parameterkette bis
 * zur `@agent`-Methode zurückverfolgbar ist — leer, wenn die Methode nicht
 * auflösbar ist (fail closed: kein Treffer in der Klasse oder ihrer
 * `extends`-Kette, kein lesbares `MethodDeclaration`, kein Körper) oder
 * wenn kein Argument des Aufrufs aus einem Parameter der `@agent`-Methode
 * stammt.
 *
 * Zwei Schritte: erst, WELCHE Positionen der Model-Methode der Aufruf mit
 * einem von-Agent-Parameter-abgeleiteten Argument belegt
 * (`coveredParamNames`); dann, welche `this.<feld> = …`-Zuweisungen im
 * Methodenkörper aus GENAU DIESEN Parametern ableiten. Eine dritte,
 * verworfene Position (ein konstantes oder sonst nicht ableitbares
 * Argument) deckt nichts ab, selbst wenn die Methode sie zuweist.
 *
 * @param {ReturnType<import('./agent-resolve.mjs').createResolver>} resolver
 * @param {{ node: ts.ClassDeclaration, sf: ts.SourceFile }} modelDecl
 * @param {string} methodName
 * @param {ts.NodeArray<ts.Expression>} callArgs  die Argumente am Aufruf `this.model.<methodName>(…)`
 * @param {Set<string>} agentParams  die Parameternamen der `@agent`-Methode
 * @returns {Set<string>}
 */
function fieldsCoveredByDelegation(resolver, modelDecl, methodName, callArgs, agentParams) {
  const found = findClassMethod(resolver, modelDecl.node, modelDecl.sf, methodName, new Set(), 0);
  if (!found) return new Set();

  const coveredParamNames = new Set();
  parameterNames(found.method).forEach((name, i) => {
    if (name && callArgs[i] && derivesFromParams(callArgs[i], agentParams)) coveredParamNames.add(name);
  });
  if (coveredParamNames.size === 0) return new Set();

  const derivedInMethod = expandDerivedNames(found.method.body, coveredParamNames);
  return collectCoveredFields(found.method.body, null, derivedInMethod);
}

/**
 * Die Schreibwege, die die VORLAGE eines Moduls aufmacht.
 *
 * Nur die Wurzelform `x-model="model.<feld>"` ist statisch entscheidbar: ob
 * `step` in `x-model="step.title"` ein Model-Element oder ein
 * Viewmodel-Puffer ist, steht im `x-for`-Geltungsbereich und nicht im
 * Attribut. Im Bestand stehen 29 Wurzelbindungen gegen 79 andere — die
 * anderen prüft der Rauchtest empirisch (kein Lesefeld bleibt stumm).
 *
 * Drei Vorlagen rufen zusätzlich direkt eine Model-Methode auf
 * (`@click="model.removeStep(step.id)"`) — ein Schreibweg der Oberfläche, der
 * am Viewmodel vorbeigeht und den zweiten Code bekommt
 * (`template_model_call:<methode>`).
 *
 * @param {string} moduleDir
 * @returns {{ models: string[], calls: string[] }}
 */
function templateBindings(moduleDir) {
  const models = [];
  const calls = [];
  // Kein `existsSync`-Schutz: `moduleDir` ist `dirname(viewmodelFile)`, und
  // `viewmodelFile` wurde unmittelbar davor erfolgreich geparst — das
  // Verzeichnis existiert damit zwangsläufig.
  for (const file of readdirSync(moduleDir)) {
    if (!file.endsWith('.html')) continue;
    const html = readFileSync(join(moduleDir, file), 'utf8');
    // Der VOLLE Pfad hinter `model.` zählt, nicht nur das erste Segment:
    // `model.params.alpha` bindet `params.alpha`, und nur ein Setter für
    // genau diesen Pfad (oder für `params` als Ganzes über einen
    // dynamischen Schlüssel) deckt die Bindung ab. Indexformen
    // (`model.rows[0]`) bleiben absichtlich DRAUSSEN: ein Index ist kein
    // Feldname, und `writtenModelFields` könnte ihn nicht gegenrechnen.
    for (const m of html.matchAll(/x-model(?:\.[a-z]+)*="model\.([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)"/g)) {
      models.push(m[1]);
    }
    for (const m of html.matchAll(/(?:@|x-on:)[a-z]+(?:\.[a-z]+)*="model\.([A-Za-z_$][\w$]*)\(/g)) calls.push(m[1]);
  }
  return { models, calls };
}

/**
 * Die Herkunft eines Mitglieds aus einer anderen Datei.
 *
 * ZEILENFREI, absichtlich: mit Zeilennummer benannte ein Verstoßcode die
 * Zeile in der Mixin-Datei, und das Umsortieren eines Mixins änderte
 * hunderte Codes, ohne dass sich inhaltlich etwas änderte. Der Pfad führt
 * zur Datei, der Name im Code führt zum Mitglied — das genügt, und es ist
 * die Voraussetzung für eine eingefrorene Befund-Baseline (analog
 * `glyph-baseline.txt`).
 *
 * @param {{ sf: ts.SourceFile, member: ts.Node }} entry
 * @param {ts.SourceFile} moduleSf
 * @param {string} appDir
 * @returns {string} `@<pfad>` oder leer
 */
function originSuffix(entry, moduleSf, appDir) {
  if (entry.sf === moduleSf) return '';
  const file = relative(appDir, entry.sf.fileName).split(sep).join('/');
  return `@${file}`;
}

/**
 * Obergrenze der `extends`-Kette. Der Bestand hat zwei Stufen
 * (`State extends FlowchartState`); zwölf halten einen pathologischen Fall an,
 * ohne je einen echten zu treffen. Wie bei den Spreads fängt der Pfadschutz
 * die Zyklen und die Tiefe die Ketten, die wachsen ohne zu kreisen — und ein
 * Treffer der Grenze ist ein BEFUND, kein stilles Verwerfen.
 */
const MAX_EXTENDS_DEPTH = 12;

/**
 * Model-Felder → Lesestruktur. Deckt sich mit „Models sind für die
 * Persistenz": die Lesefläche IST die persistierte Form.
 * `_`-präfigierte Felder sind privat und erscheinen nicht.
 *
 * Die Wurzel ist GENAU die Klasse, die `createModule({ … Model: State … })`
 * nennt — nicht „alle Klassen der Model-Datei". Der Unterschied ist keine
 * Feinheit: `rest-api-model.js` enthält neben dem Model die Hilfsklasse
 * `Endpoint`, deren Konstruktorfelder (`headers`, `mappings`) auf dem
 * Model-Objekt nicht existieren und in `State.toJSON()` nicht auftauchen.
 * Eine Registry, die Felder behauptet, die es nicht gibt, ist schlimmer als
 * eine, die zu wenige kennt.
 *
 * Zwei Quellen eines Feldes, beide nötig: eine Property-Deklaration
 * (`problem = ''`) UND eine annotierte Konstruktor-Zuweisung
 * (`this.steps = []`). Die vier Flowchart-Module hatten null Felder, weil ihr
 * Zustand über BEIDE Lücken fiel — `FlowchartState` deklariert `steps` im
 * Konstruktor, und die Modelle erben es.
 *
 * @param {ReturnType<import('./agent-resolve.mjs').createResolver>} resolver
 * @param {ts.SourceFile} sf  die MODUL-Datei (`js/modules/<id>/<id>.js`)
 * @returns {{ fields: Record<string, { type: string, help: string, bulk: boolean }>, violations: string[] }}
 */
function readModelFields(resolver, sf) {
  const name = modelClassName(sf);
  // Fehlt `Model:` oder ist der Wert kein Name (`Model: makeModel()`), ist die
  // Lesefläche nicht bestimmbar — melden statt schweigen, wie bei jeder
  // anderen Blindstelle. Ein stiller Rückfall auf „alle Klassen der Datei"
  // wäre genau der Fehler, den dieser Weg behebt.
  if (!name) return { fields: {}, violations: ['unresolvable_model_class'] };
  const decl = resolver.findDeclaration(name, sf);
  if (!decl || !ts.isClassDeclaration(decl.node)) {
    return { fields: {}, violations: [`unresolved_model_class:${name}`] };
  }
  const violations = [];
  // Scope-blinde Namensauflösung, jetzt nachprüfbar: zwei Deklarationen
  // desselben Namens in einer Datei sind kein Fehler des Generators, aber
  // eine Unsicherheit über die Lesefläche — melden statt die Pre-Order-
  // Reihenfolge zur Semantik zu erklären.
  if (decl.node.ambiguous === true) violations.push(`ambiguous_model_class:${name}`);
  const fields = classFields(resolver, decl.node, decl.sf, violations, new Set(), 0);
  return { fields, violations };
}

/**
 * Die Schlüssel, die das Model WIRKLICH persistiert — die Gegenprobe zur
 * Lesefläche. Ohne sie fällt ein `toJSON()`-Schlüssel ohne Registry-Feld
 * lautlos aus `read()`: `projectReadState` iteriert über das Schema, nicht
 * über die Momentaufnahme. Im Bestand trifft das `triz-9-windows`.
 *
 * Drei Rückgabeformen kommen vor und werden entpackt: das Objektliteral
 * selbst, `JSON.parse(JSON.stringify(…))` und eine lokale Variable. Alles
 * andere — ein Spread, ein Funktionsaufruf, eine Verzweigung — ist eine
 * BLINDSTELLE und wird als solche gemeldet, nicht geraten: ein falsch
 * behaupteter Befund kostet mehr Vertrauen als ein zugegebenes Nichtwissen.
 *
 * @param {ReturnType<import('./agent-resolve.mjs').createResolver>} resolver
 * @param {ts.SourceFile} sf  die MODUL-Datei
 * @returns {{ keys: string[]|null, violations: string[] }}
 */
function persistedKeys(resolver, sf) {
  const name = modelClassName(sf);
  // Nicht auflösbar → `readModelFields` meldet denselben Fall schon
  // (`unresolvable_model_class` / `unresolved_model_class:<name>`); zwei
  // Codes für einen Befund wären doppelte Meldung.
  if (!name) return { keys: null, violations: [] };
  const decl = resolver.findDeclaration(name, sf);
  if (!decl || !ts.isClassDeclaration(decl.node)) return { keys: null, violations: [] };

  const toJSON = findToJSON(resolver, decl.node, decl.sf, new Set(), 0);
  if (!toJSON) return { keys: null, violations: ['unresolvable_tojson'] };

  const ret = findReturnStatement(toJSON.method.body);
  if (!ret || !ret.expression) return { keys: null, violations: ['unresolvable_tojson'] };

  const literal = unwrapToObjectLiteral(ret.expression, toJSON.method.body);
  if (!literal) return { keys: null, violations: ['unresolvable_tojson'] };

  const keys = [];
  for (const property of literal.properties) {
    if (ts.isSpreadAssignment(property)) return { keys: null, violations: ['unresolvable_tojson'] };
    if (!property.name || ts.isComputedPropertyName(property.name)) {
      return { keys: null, violations: ['unresolvable_tojson'] };
    }
    keys.push(property.name.getText());
  }
  return { keys, violations: [] };
}

/**
 * Finde `toJSON` an der Klasse, sonst die `extends`-Kette hoch — derselbe
 * Pfadschutz und dieselbe Tiefengrenze wie `classFields`, denn dieselben
 * drei Zeilen (`modelClassName` → `findDeclaration` → Kettenaufstieg) tragen
 * beide Prüfungen: die vier Flowchart-Module haben kein eigenes `toJSON()`
 * und erben es von `FlowchartState`.
 *
 * Ein EIGENES Mitglied namens `toJSON`, das keine `MethodDeclaration` ist
 * (z. B. `toJSON = () => ({…})` als Klassenfeld), beendet den Abstieg HIER,
 * mit `null` — nicht weiter zur Basisklasse klettern: sonst würde deren
 * `toJSON` fälschlich die Schlüssel der überschreibenden Unterklasse
 * beschreiben (Review-Fund I3, 0 Treffer im Bestand, aber latent).
 *
 * @returns {{ method: ts.MethodDeclaration, sf: ts.SourceFile }|null}
 */
function findToJSON(resolver, node, sf, path, depth) {
  return findClassMethod(resolver, node, sf, 'toJSON', path, depth);
}

/**
 * Finde eine Methode namens `methodName` an der Klasse, sonst die
 * `extends`-Kette hoch — derselbe Pfadschutz und dieselbe Tiefengrenze wie
 * `classFields`. Generische Fassung von `findToJSON` (Task 1a): Task 1b
 * braucht denselben Abstieg für eine Delegationsmethode
 * (`this.model.<methodName>(…)`), und zwei Kopien desselben Walks wären
 * genau die Parallelquelle, die dieser Generator sonst vermeidet.
 *
 * Ein EIGENES Mitglied namens `methodName`, das keine `MethodDeclaration`
 * ist (z. B. ein Klassenfeld mit Pfeilfunktion), beendet den Abstieg HIER,
 * mit `null` — nicht weiter zur Basisklasse klettern: sonst würde deren
 * gleichnamige Methode fälschlich als Treffer der überschreibenden
 * Unterklasse gelten (Review-Fund I3, übertragen aus `findToJSON`).
 *
 * @returns {{ method: ts.MethodDeclaration, sf: ts.SourceFile }|null}
 */
function findClassMethod(resolver, node, sf, methodName, path, depth) {
  const self = `${sf.fileName}:${node.pos}`;
  if (path.has(self)) return null; // class State extends State — classFields meldet das bereits
  path.add(self);

  const own = node.members.find(m =>
    !(ts.getCombinedModifierFlags(m) & ts.ModifierFlags.Static)
    && m.name && ts.isIdentifier(m.name) && m.name.text === methodName);
  if (own) {
    path.delete(self);
    return ts.isMethodDeclaration(own) && own.body ? { method: own, sf } : null;
  }

  const base = baseExpression(node);
  let result = null;
  if (base && ts.isIdentifier(base) && depth + 1 <= MAX_EXTENDS_DEPTH) {
    const decl = resolver.findDeclaration(base.text, sf);
    if (decl && ts.isClassDeclaration(decl.node)) {
      result = findClassMethod(resolver, decl.node, decl.sf, methodName, path, depth + 1);
    }
  }
  path.delete(self);
  return result;
}

/**
 * GENAU EINE `return`-Anweisung im ganzen Funktionskörper — Verzweigungen
 * eingeschlossen, aber nicht in einem verschachtelten Funktionsausdruck
 * (wie bei `constructorFields`). Mehr als eine ist eine BLINDSTELLE: welcher
 * Zweig tatsächlich greift, hängt von Laufzeitdaten ab, und die Zweige zu
 * vereinigen wäre Raten statt Lesen (Review-Fund I2) — null signalisiert
 * „nicht genau eine", der Aufrufer behandelt das wie „kein `toJSON`".
 * @param {ts.Block} body
 * @returns {ts.ReturnStatement|null}
 */
function findReturnStatement(body) {
  const returns = [];
  const walk = (node) => {
    if (isFunctionLike(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node)) return;
    if (ts.isReturnStatement(node)) returns.push(node);
    ts.forEachChild(node, walk);
  };
  walk(body);
  return returns.length === 1 ? returns[0] : null;
}

/**
 * Entpacke das `return`-Argument zu einem Objektliteral — die drei bekannten
 * Formen (Regel 3 der Spezifikation):
 *  1. das Objektliteral selbst
 *  2. `JSON.parse(JSON.stringify(X))` → `X`
 *  3. ein Identifier → seine `const`-Initialisierung in derselben Funktion
 * Alles andere bleibt unaufgelöst (`null`).
 * @param {ts.Expression} expr
 * @param {ts.Block} body  der Funktionskörper, für die lokale Variable
 * @returns {ts.ObjectLiteralExpression|null}
 */
function unwrapToObjectLiteral(expr, body) {
  if (ts.isObjectLiteralExpression(expr)) return expr;

  if (ts.isCallExpression(expr) && isPropertyAccessOf(expr.expression, 'JSON', 'parse')
      && expr.arguments.length === 1) {
    const inner = expr.arguments[0];
    if (ts.isCallExpression(inner) && isPropertyAccessOf(inner.expression, 'JSON', 'stringify')
        && inner.arguments.length === 1) {
      return unwrapToObjectLiteral(inner.arguments[0], body);
    }
    return null;
  }

  if (ts.isIdentifier(expr)) {
    for (const statement of body.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === expr.text && declaration.initializer) {
          // Nur `const` ist eine Momentaufnahme — `let`/`var` kann zwischen
          // der Deklaration und dem `return` neu zugewiesen worden sein
          // (Review-Fund I1); das zu ignorieren hieße, einen womöglich
          // späteren Schlüsselsatz lautlos gegen den ursprünglichen
          // auszutauschen. Blindstelle statt Annahme.
          if (!(statement.declarationList.flags & ts.NodeFlags.Const)) return null;
          return unwrapToObjectLiteral(declaration.initializer, body);
        }
      }
    }
    return null;
  }

  return null;
}

/** @returns {boolean} ob `expr` eine Eigenschaft `<obj>.<prop>` ist. */
function isPropertyAccessOf(expr, obj, prop) {
  return ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)
    && expr.expression.text === obj && expr.name.text === prop;
}

/**
 * Der Name der Model-Klasse, wie das Modul sie nennt. Alle 72 Module haben ein
 * `Model:`-Mitglied mit einem Identifier als Wert (69-mal `State`, dazu die
 * drei Flowchart-Modelle); die Kurzform `{ Model }` ist mitgedacht, weil der
 * Name dann im Mitglied selbst steht.
 * @param {ts.SourceFile} sf  die Moduldatei
 * @returns {string|null}
 */
function modelClassName(sf) {
  const member = findCreateModuleMember(sf, 'Model');
  if (!member) return null;
  if (!ts.isPropertyAssignment(member)) return memberName(member);
  return ts.isIdentifier(member.initializer) ? member.initializer.text : null;
}

/** @returns {ts.Expression|null} der `extends`-Ausdruck einer Klasse. */
function baseExpression(node) {
  const clause = node.heritageClauses?.find(h => h.token === ts.SyntaxKind.ExtendsKeyword);
  return clause?.types?.[0]?.expression ?? null;
}

/**
 * Die Felder einer Klasse samt geerbter — Basis ZUERST, eigene darüber: bei
 * Namensgleichheit gewinnt die Unterklasse, das ist die Semantik von
 * Vererbung.
 *
 * Der Zyklusschutz ist derselbe wie bei den Spreads: ein PFAD-Set, betreten
 * beim Abstieg, freigegeben beim Zurückkehren.
 *
 * @returns {Record<string, { type: string, help: string, bulk: boolean }>}
 */
function classFields(resolver, node, sf, violations, path, depth) {
  const self = `${sf.fileName}:${node.pos}`;
  path.add(self);
  const fields = {};
  const base = baseExpression(node);
  if (base) {
    // `extends mixin(Base)` oder `extends ns.Base`: nicht auflösbar, aber
    // auch nicht verschweigen — sonst sieht eine leere Lesefläche aus wie
    // eine Klasse ohne Zustand.
    const label = compact(base.getText());
    if (!ts.isIdentifier(base)) {
      violations.push(`unresolved_base_class:${label}`);
    } else {
      const decl = resolver.findDeclaration(base.text, sf);
      if (!decl || !ts.isClassDeclaration(decl.node)) {
        violations.push(`unresolved_base_class:${label}`);
      } else if (!path.has(`${decl.sf.fileName}:${decl.node.pos}`)) {
        if (depth + 1 > MAX_EXTENDS_DEPTH) violations.push(`unresolved_base_class:${label}`);
        else Object.assign(fields, classFields(resolver, decl.node, decl.sf, violations, path, depth + 1));
      } else {
        // `class State extends State`: syntaktisch gültig, semantisch
        // unmöglich, zur Laufzeit ein Wurf. Darüber zu schweigen war die
        // einzige Blindstelle der Feldauflösung, die schweigt, während
        // alle anderen melden — und ein Autorenfehler, der sich als
        // fehlende Lesefläche tarnt.
        //
        // Anders als beim selbstspreizenden Mixin
        // (`export const loopMix = { ...loopMix }`), das ein
        // nachvollziehbares Versehen in einer Objektliteral-Kette ist.
        violations.push(`self_inheriting_class:${label}`);
      }
    }
  }
  // Ein Feld vom Typ einer Typedef DIESER Datei (`@type {LessonEntry[]}`)
  // bekommt deren Schlüssel wie ein erklärtes `AgentRead`-Feld — ein Satz je
  // Eigenschaft für Agent und Formularbeschriftung. Gesucht wird in der
  // Datei der Klasse, die das Feld deklariert (bei Vererbung die Basis).
  for (const [name, field] of ownFields(node)) fields[name] = { ...field, ...nestedKeys(sf, field.type, new Set()) };
  path.delete(self);
  return fields;
}

/**
 * Die eigenen Felder einer Klasse, in QUELLREIHENFOLGE — Property-
 * Deklarationen und Konstruktor-Zuweisungen im selben Strom.
 *
 * Die Reihenfolge entscheidet bei Namensgleichheit, und zwar absichtlich
 * nicht die Art der Deklaration: wer `problem = ''` deklariert und im
 * Konstruktor `this.problem` mit einer genaueren Annotation überschreibt,
 * meint die zweite Fassung — zur Laufzeit gewinnt sie auch. Class-Member
 * stehen in Quellreihenfolge, der Konstruktor steuert seine Zuweisungen an
 * seiner eigenen Position bei; damit ergibt die Iteration genau diese Folge.
 *
 * @returns {Array<[string, { type: string, help: string, bulk: boolean }]>}
 */
function ownFields(node) {
  const out = [];
  for (const member of node.members) {
    // Ein `static`-Mitglied gehört der Klasse, nicht der Instanz: `static
    // VERSION = '3'` ist Schema-Metadatum, steht in keinem `toJSON()` und
    // wäre in der Lesefläche ein Feld, das das Model nicht hält („die
    // Lesefläche IST die persistierte Form").
    if (ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Static) continue;
    if (ts.isPropertyDeclaration(member)) {
      const name = member.name.getText();
      if (name.startsWith('_')) continue;
      // Ohne `@type` bleibt eine Property-Deklaration ein Feld (`any`): sie
      // IST die Zustandszusage. Nur die Konstruktor-Zuweisung braucht die
      // Annotation als Signal — siehe `constructorFields`.
      out.push([name, fieldFrom(ts.getJSDocTags(member), null)]);
      continue;
    }
    if (ts.isConstructorDeclaration(member)) out.push(...constructorFields(member));
  }
  return out;
}

/**
 * Annotierte `this.<name> = …`-Zuweisungen im Konstruktorkörper.
 *
 * Die `@type`-Annotation ist das Signal „dies ist persistierter Zustand",
 * nicht die Zuweisung selbst: ohne sie entsteht kein Feld. Und nur der
 * Konstruktor — ein `this.x = …` in einer anderen Methode ist in diesem
 * Bestand fast immer ein Ansichtspuffer und wäre ein falscher Positiver.
 *
 * @param {ts.ConstructorDeclaration} ctor
 * @returns {Array<[string, { type: string, help: string, bulk: boolean }]>}
 */
function constructorFields(ctor) {
  const out = [];
  if (!ctor.body) return out;
  const walk = (node) => {
    // Abstiegsstopp an jedem eigenen Funktionskörper: eine Zuweisung in einem
    // Rückruf (`rows.forEach(() => { this.late = 1; })`) ist kein Feld.
    if (isFunctionLike(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node)) return;
    if (ts.isExpressionStatement(node)) {
      const name = assignedThisProperty(node.expression);
      const tags = ts.getJSDocTags(node);
      const typeTag = tags.find(t => t.tagName.text === 'type');
      if (name !== null && !name.startsWith('_') && typeTag) out.push([name, fieldFrom(tags, typeTag)]);
      return;
    }
    ts.forEachChild(node, walk);
  };
  ts.forEachChild(ctor.body, walk);
  return out;
}

/** @returns {string|null} der Name in `this.<name> = …`, sonst `null`. */
function assignedThisProperty(expression) {
  if (!ts.isBinaryExpression(expression)) return null;
  if (expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return null;
  const left = expression.left;
  if (!ts.isPropertyAccessExpression(left) || left.expression.kind !== ts.SyntaxKind.ThisKeyword) return null;
  return left.name.text;
}

/**
 * Die Registry-Form eines Feldes: `{ type, help, bulk }`, an einem
 * Massenfeld zusätzlich `bulkKind` — an einem Feld steht KEINE Herkunft,
 * anders als an einem Verstoßcode: die Form ist Teil des Vertrags von
 * `read()`.
 * @returns {{ type: string, help: string, bulk: boolean, bulkKind?: string, omit?: string[] }}
 */
function fieldFrom(tags, knownTypeTag) {
  const typeTag = knownTypeTag ?? tags.find(t => t.tagName.text === 'type');
  const bulkTag = tags.find(t => t.tagName.text === MARK_BULK);
  const omitTag = tags.find(t => t.tagName.text === MARK_OMIT);
  return {
    type: typeTag?.typeExpression?.type?.getText() ?? 'any',
    help: cleanComment(typeTag?.comment),
    bulk: bulkTag !== undefined,
    // `@agentBulk tree` nennt die Art; `@agentBulk` ohne Zusatz heisst
    // `table`. An einem Nicht-Massenfeld steht der Schlüssel gar nicht.
    ...(bulkTag ? { bulkKind: cleanComment(bulkTag.comment) || 'table' } : {}),
    // `@agentOmit a[].b c` → `['a[].b', 'c']`; ein leeres Tag ergibt `[]`
    // und damit `invalid_omit_path:<feld>:`.
    ...(omitTag ? { omit: cleanComment(omitTag.comment).split(/\s+/).filter(Boolean) } : {}),
  };
}

/**
 * Ein mehrzeiliger Ausdruck als eine Zeile — Verstoßcodes sind einzeilig.
 * @param {string} text
 * @returns {string}
 */
function compact(text) {
  return text.replace(/\s*\n\s*/g, ' ').trim();
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
// Struktur aus JSDoc abgeleitet. Text kommt zur Laufzeit aus i18n.

/** @type {Record<string, import('./agent-contract.js').AgentModuleEntry>} */
export const AGENT_REGISTRY = ${JSON.stringify(sorted, null, 2)};

/** Abdeckung als Zahl: n von m Modulen agentenfähig. */
export const AGENT_COVERAGE = ${JSON.stringify(data.coverage)};
`;
}
