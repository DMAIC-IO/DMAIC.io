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
 * DOM-Umweg-Prüfung zählt er erst, wenn das Modul das Modul-Tag trägt (Spec §8: „Lücken blockieren nicht"). So kann
 * aber kein Modul freigegeben werden, bevor jemand hingesehen hat.
 *
 * Extraktion über die TypeScript-Compiler-API: sie liest JSDoc aus reinem
 * JavaScript. Eine Dev-Abhängigkeit, kein TypeScript-Umstieg — und besser
 * als ein selbstgebauter Parser oder eine zweite Deklarationsdatei.
 *
 * Mirrors help-data.mjs: collect + render, kein Schreibzugriff hier.
 */
import ts from 'typescript';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';
import { createResolver, functionFromMember, isFunctionMember, isFunctionLike, findCreateModuleMember, memberName, findLocalDeclaration } from './agent-resolve.mjs';

const MODULES_DIR = 'js/modules';

/** Die beiden Marken an einer Viewmodel-Methode. */
export const MARK_AGENT = 'agent';
export const MARK_NOAGENT = 'noagent';
/** Marke an einem Model-Feld: Massendaten, aus `read()` ohne Parameter herausgehalten. */
const MARK_BULK = 'agentBulk';
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
  const { actions, violations, written, optionSources } = readViewmodel(sf, resolver, appDir);

  // Deklarierte Lesefläche hat Vorrang und ERSETZT die Model-Ableitung —
  // nicht ergänzt sie: zwei Quellen für dieselbe Fläche wäre genau die
  // Parallelquelle, die Spec §8 vermeidet. Ohne Deklaration bleibt alles
  // wie bisher (Model-Felder, driftfrei per Konstruktion).
  const declared = readAgentReadTypedef(sf);
  const model = declared ? { fields: declared, violations: [] } : readModelFields(resolver, sf);

  // Die Gegenprobe gilt nur für die ABGELEITETE Lesefläche. Eine erklärte
  // `@typedef AgentRead` lässt absichtlich etwas draußen (worksheet: opake
  // Blobs) — das ist ein geschriebener Akt und braucht keinen Wächter.
  const persistence = declared ? { keys: null, violations: [] } : persistedKeys(resolver, sf);
  const unreadable = (persistence.keys ?? [])
    .filter(k => !k.startsWith('_') && !Object.prototype.hasOwnProperty.call(model.fields, k))
    .map(k => `unreadable_state_key:${k}`);

  // Zwei Hürden, ohne die das Modul-Tag eine unbelegte Behauptung bliebe:
  //   • Null Aktionen: „vollständig über das Viewmodel steuerbar" ist dann
  //     wahr-aber-leer. Befundfrei heißt nicht freigabereif (mosaic,
  //     pie-chart).
  //   • Kein `read()`: Spec §9 Migrationsschritt 3. Ohne Lesefläche ist ein
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
    .filter(o => !Object.prototype.hasOwnProperty.call(model.fields, o.field))
    .map(o => `undeclared_option_source:${o.action}:${o.arg}`))];

  const reported = [...violations, ...surface, ...model.violations,
    ...persistence.violations, ...unreadable,
    ...invalidBulkKinds(model.fields), ...collectDomDetours(sf),
    ...unreachable, ...templateCalls, ...undeclaredOptions];
  // Verstöße zählen nur, wenn das Modul etwas behauptet (Spec §9).
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

/** Zuweisungsoperatoren, die einen DOM-Umweg bedeuten. `+=` zählt mit: es
 *  schreibt genauso in den Zustand, nur additiv. */
const ASSIGN_KINDS = new Set([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
]);

/**
 * Finde zustandsändernde DOM-Zugriffe. Berichtend, nicht beweisend — der
 * eigentliche Beweis ist die dynamische Paritätsprüfung (Spec §10.4).
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
 * statt sie aus dem Model ableiten zu lassen (Entscheidung E1 des Plans).
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
  let found = null;
  const walk = (node) => {
    // Der Compiler hängt einen freistehenden Kommentar am Dateiende an das
    // `EndOfFileToken` — ohne diesen Ausschluss wäre JEDER Block im Datei-
    // körper erreichbar, unabhängig davon, ob eine Anweisung folgt. Das
    // `EndOfFileToken` hat ohnehin keine Kinder, der Ausschluss kostet also
    // nichts am eigentlichen Baum.
    if (node.kind === ts.SyntaxKind.EndOfFileToken) return;
    for (const tag of ts.getJSDocTags(node)) {
      if (!ts.isJSDocTypedefTag(tag)) continue;
      if (tag.name?.text !== AGENT_READ_TYPEDEF) continue;
      const literal = tag.typeExpression;
      if (!literal || !ts.isJSDocTypeLiteral(literal)) continue;
      found = {};
      for (const property of literal.jsDocPropertyTags ?? []) {
        const name = property.name?.getText(sf);
        if (!name || name.startsWith('_')) continue;
        const raw = cleanComment(property.comment);
        const bulkMatch = BULK_RE.exec(raw);
        found[name] = {
          type: property.typeExpression?.type?.getText(sf) ?? 'any',
          help: bulkMatch ? raw.slice(bulkMatch[0].length).trim() : raw,
          bulk: bulkMatch !== null,
          // Nur AN einem Massenfeld, nicht als `undefined` an jedem Feld: so
          // bleibt die erzeugte Registry dort unverändert, wo nichts zu sagen
          // ist — und die `deepEqual`-Fälle über die Feldform bleiben wahr.
          ...(bulkMatch ? { bulkKind: bulkMatch[1] ?? 'table' } : {}),
          derived: true,
        };
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return found;
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
 * @returns {{ actions: Record<string, object>, violations: string[], written: Set<string>, optionSources: Array<{ action: string, arg: string, field: string }> }}
 */
function readViewmodel(sf, resolver, appDir) {
  const actions = {};
  const violations = [];
  const written = new Set();
  const optionSources = [];
  const literal = resolver.findDataReturnLiteral(sf);
  // Was der Generator NICHT sehen kann, muss er melden — sonst ginge ein
  // solches Modul mit gesetztem Modul-Tag und NULL Verstößen durch den Build
  // und würde `available: true`, obwohl keine einzige seiner Methoden
  // begutachtet wurde (Review-Befund I6/P1). Die Zusage aus Spec §9 („das
  // Modul-Tag ist maschinell nachgeprüft") wäre sonst eine leere Operation.
  if (!literal) return { actions, violations: ['unresolvable_data_literal'], written, optionSources };

  const { members, unresolved } = resolver.collectMembers(literal, sf);
  // Die unauflösbaren Spreads stehen VORAN: sie sind der Befund über die
  // Vollständigkeit der folgenden Liste, nicht ein Befund in ihr.
  for (const expression of unresolved) violations.push(`unresolved_spread:${compact(expression)}`);

  // Einmal pro Modul aufgelöst, nicht pro Methode: dieselbe Model-Klasse,
  // die `readModelFields` für die Lesefläche auflöst, ist die Zielklasse
  // einer Delegation `this.model.<methode>(…)`. `null`, wenn die Klasse
  // nicht bestimmbar ist — `readModelFields` meldet das bereits über
  // `unresolvable_model_class`/`unresolved_model_class:<name>`, eine
  // Delegation zählt dann einfach nicht als Abdeckung (fail closed).
  const modelDecl = resolveModelClass(resolver, sf);

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

    // Nur der `@agent`-Zweig zählt als Schreibweg der Fläche (Task 1b): eine
    // `this.model.<feld> = …`-Zuweisung in einer `@noagent`-Methode deckt die
    // Vorlagenbindung NICHT ab — genau das ist der Unterschied zwischen
    // „ein Agent kann das Feld schreiben" und „irgendeine Methode tut es".
    for (const field of writtenModelFields(fn, resolver, modelDecl)) written.add(field);
    for (const source of stateOptionSources(fn.body)) optionSources.push({ action: name, ...source });
  }
  return { actions, violations, written, optionSources };
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
 * das Gegenteil von E2 („jedes `x-model`-gebundene Feld bekommt einen
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
  // `expandDerivedNames` zieht die Kette durch lokale `const`-Zwischenschritte
  // weiter (`const n = parseFloat(v)` leitet `n` von `v` ab) — ohne das bräche
  // sie bei der ersten Hilfsvariablen, und genau das tut `hypothesis-test`
  // (`setPowerGoal(v) { const n = parseFloat(v); … this.powerGoal = …(n); }`).
  const ownParams = new Set(parameterNames(fn).filter(Boolean));
  const agentParams = expandDerivedNames(fn.body, ownParams);
  // Die Datei der METHODE, nicht die des Moduls: ein Mitglied aus einem Mixin
  // löst seine Konstanten und Hilfsfunktionen in seiner eigenen Datei auf.
  const sf = fn.getSourceFile();
  const keySets = requireEnumKeySets(fn.body, ownParams, sf);
  const fields = collectCoveredFields(fn.body, 'model', agentParams, keySets);
  forEachCall(fn.body, node => {
    const methodName = modelMethodCallOf(node);
    if (methodName && modelDecl) {
      for (const field of fieldsCoveredByDelegation(resolver, modelDecl, methodName, node.arguments, agentParams)) {
        fields.add(field);
      }
      return;
    }
    for (const field of fieldsCoveredByPathHelper(node, sf, keySets)) fields.add(field);
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
 * Die Zeichenketten eines Array-Literals — direkt (`['a', 'b']`) oder über
 * eine im Modul deklarierte Konstante (`PARAM_KEYS`). `null`, sobald ein
 * Element keine Zeichenkette ist oder die Konstante nicht auflösbar ist.
 * @param {ts.Expression} expr
 * @param {ts.SourceFile} sf
 * @returns {string[]|null}
 */
function resolveStringArray(expr, sf) {
  let literal = expr;
  if (ts.isIdentifier(expr)) {
    const decl = findLocalDeclaration(expr.text, sf);
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
 * Die Felder, die ein Aufruf einer LOKALEN Pfad-Hilfe abdeckt —
 * `setAtPath(this.model.params, key, value)` zählt wie
 * `this.model.params[key] = value`.
 *
 * Vier Bedingungen, alle vier notwendig (fail closed): die gerufene Funktion
 * ist im Modul als FUNKTION auflösbar (ein importierter oder unbekannter
 * Name deckt nichts ab, eine gleichnamige Klasse oder eine Konstante ohne
 * Funktionsinitialisierer ebenso nicht), sie WEIST in ihrem Körper
 * tatsächlich zu (`pathHelperAssigns` — Review-Fund: `logKeys(this.model.params, key)`
 * erfüllte sonst alle äußeren Merkmale und gab ein Feld frei, das kein Agent
 * setzen kann), ihr erstes Argument ist eine statische `this.model.<pfad>`-
 * Kette, und ein weiteres Argument ist ein Parameter mit geprüfter
 * Schlüsselmenge. Ein Schlüssel mit Punkt (`'tolerance.LSL'`) wird wörtlich
 * angehängt — damit deckt derselbe Mechanismus die zweite Ebene ab, ohne
 * eine eigene Regel.
 *
 * @param {ts.CallExpression} call
 * @param {ts.SourceFile} sf
 * @param {Map<string, string[]>} keySets
 * @returns {string[]}
 */
function fieldsCoveredByPathHelper(call, sf, keySets) {
  if (keySets.size === 0) return [];
  if (!ts.isIdentifier(call.expression)) return [];
  const decl = findLocalDeclaration(call.expression.text, sf);
  // Fail closed: ohne Deklaration im Modul ist der Körper nicht lesbar.
  if (!decl) return [];
  const helper = functionOfDeclaration(decl);
  // Fail closed: `findLocalDeclaration` liefert auch Klassen und
  // Variablen — nur ein lesbarer Funktionskörper ist prüfbar.
  if (!helper || !pathHelperAssigns(helper)) return [];
  const [base, ...rest] = call.arguments;
  if (!base) return [];
  const target = assignTargetAfterThis(base, 'model');
  if (!target || target.key) return [];
  const keyArg = rest.find(argument => ts.isIdentifier(argument) && keySets.has(argument.text));
  if (!keyArg) return [];
  return keySets.get(keyArg.text).map(key => `${target.path}.${key}`);
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
 * Erweitert `names` um lokale `const`-Variablen, deren Initialisierer
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
 * nur aus einem Fehlschlag (Plan E1).
 *
 * Erkennung ist FORMGEBUNDEN, nicht fail closed. Das dritte Argument zählt,
 * wenn es auf einen Zugriff an `this` zurückführt: direkt, über einen lokalen
 * `const`-Alias auf der Top-Ebene des Körpers (Kette bis Fixpunkt), über
 * EINEN fremden Wrapper-Aufruf (`Object.keys(this.model.unitKeys())`) oder mit
 * angehängter Projektion (`.map(…)`/`.filter(…)`). Der abgeleitete Name ist
 * das erste Segment nach `this.model.` bzw. `this.`, ohne `()`:
 *   `this.model.currentOptions`           → `currentOptions`
 *   `Object.keys(this.model.unitKeys())`  → `unitKeys`
 *   `this.pickableColumns()`              → `pickableColumns`
 * Kein Name ergibt sich bei: `_`-Präfix, Aufruf MIT Argumenten
 * (`this.idsFor(x)`), bares `this.model`. DOKUMENTIERTER BLINDER FLECK:
 * Spread im Array-Literal (`['all', ...this.owners()]`), `(x ?? []).map(…)`,
 * Parameter-/Cache-Variablen und Konstanten — all das ist kein Befund.
 * Ob der Name als Lesefeld deklariert ist, entscheidet `buildEntry`.
 *
 * @param {ts.Block|undefined} body
 * @returns {Array<{ arg: string, field: string }>}
 */
function stateOptionSources(body) {
  if (!body || !ts.isBlock(body)) return [];
  const aliases = new Map();
  for (const statement of body.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    if (!(statement.declarationList.flags & ts.NodeFlags.Const)) continue;
    for (const decl of statement.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.initializer) aliases.set(decl.name.text, decl.initializer);
    }
  }
  const out = [];
  forEachCall(body, call => {
    if (!ts.isIdentifier(call.expression)) return;
    if (call.expression.text !== 'requireEnum' && call.expression.text !== 'requireKnownId') return;
    const [first, , allowed] = call.arguments;
    if (!first || !allowed) return;
    const field = optionFieldOf(allowed, aliases, new Set());
    if (!field) return;
    out.push({ arg: ts.isStringLiteralLike(first) ? first.text : first.getText(), field });
  });
  return out;
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
 * @returns {Set<string>}
 */
function collectCoveredFields(body, through, names, keySets = new Map()) {
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
        for (const field of fieldsOfTarget(target, keySets)) fields.add(field);
      }
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
  if (last.key === null || base.length === 0) return null;
  return { path: base.join('.'), key: last.key };
}

/**
 * Die Felder, die ein Zuweisungsziel trifft — der Pfad selbst, oder bei
 * einem dynamischen Schlüssel ein Pfad je geprüftem Schlüssel. Ohne
 * geprüfte Menge: nichts (fail closed).
 * @param {{ path: string, key: string|null }} target
 * @param {Map<string, string[]>} keySets
 * @returns {string[]}
 */
function fieldsOfTarget(target, keySets) {
  if (target.key === null) return [target.path];
  const keys = keySets.get(target.key);
  if (!keys) return [];
  return keys.map(key => `${target.path}.${key}`);
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
 * Persistenz": die Lesefläche IST die persistierte Form (Spec §8).
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
  for (const [name, field] of ownFields(node)) fields[name] = field;
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
    // wäre in der Lesefläche ein Feld, das das Model nicht hält (Spec §8:
    // „die Lesefläche IST die persistierte Form").
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
 * @returns {{ type: string, help: string, bulk: boolean, bulkKind?: string }}
 */
function fieldFrom(tags, knownTypeTag) {
  const typeTag = knownTypeTag ?? tags.find(t => t.tagName.text === 'type');
  const bulkTag = tags.find(t => t.tagName.text === MARK_BULK);
  return {
    type: typeTag?.typeExpression?.type?.getText() ?? 'any',
    help: cleanComment(typeTag?.comment),
    bulk: bulkTag !== undefined,
    // `@agentBulk tree` nennt die Art; `@agentBulk` ohne Zusatz heisst
    // `table`. An einem Nicht-Massenfeld steht der Schlüssel gar nicht.
    ...(bulkTag ? { bulkKind: cleanComment(bulkTag.comment) || 'table' } : {}),
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
// Struktur aus JSDoc abgeleitet (Spec §8). Text kommt zur Laufzeit aus i18n.

/** @type {Record<string, import('./agent-contract.js').AgentModuleEntry>} */
export const AGENT_REGISTRY = ${JSON.stringify(sorted, null, 2)};

/** Abdeckung als Zahl: n von m Modulen agentenfähig (Spec §9). */
export const AGENT_COVERAGE = ${JSON.stringify(data.coverage)};
`;
}
