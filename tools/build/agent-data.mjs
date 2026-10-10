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
 * `unresolved_model_class:<name>` und `unresolved_base_class:<name>`. Die
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
import { readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createResolver, functionFromMember, isFunctionLike, findCreateModuleMember, memberName } from './agent-resolve.mjs';

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
  const { actions, violations } = readViewmodel(sf, resolver, appDir);

  // Deklarierte Lesefläche hat Vorrang und ERSETZT die Model-Ableitung —
  // nicht ergänzt sie: zwei Quellen für dieselbe Fläche wäre genau die
  // Parallelquelle, die Spec §8 vermeidet. Ohne Deklaration bleibt alles
  // wie bisher (Model-Felder, driftfrei per Konstruktion).
  const declared = readAgentReadTypedef(sf);
  const model = declared ? { fields: declared, violations: [] } : readModelFields(resolver, sf);

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

  const reported = [...violations, ...surface, ...model.violations,
    ...invalidBulkKinds(model.fields), ...collectDomDetours(sf)];
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
  const fields = classFields(resolver, decl.node, decl.sf, violations, new Set(), 0);
  return { fields, violations };
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
      }
      // Eine Klasse auf dem eigenen Pfad ist aufgelöst, nicht unauflösbar —
      // der Abstieg endet hier STILL, wie beim selbstspreizenden Mixin.
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
