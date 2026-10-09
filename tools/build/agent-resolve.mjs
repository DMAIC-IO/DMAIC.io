/**
 * agent-resolve — Auflösung der Viewmodel-Mitglieder für den Agenten-Generator.
 *
 * `agent-data.mjs` las bis hierher nur das Objektliteral, das die `data()`-
 * Funktion eines Moduls unmittelbar zurückgibt. 21 von 72 Modulen holen ihre
 * Viewmodel-Methoden aber ganz oder teilweise aus einem Mixin
 * (`...chartModuleLifecycle(module, {…})`, `...chainViewMixin(module, _t, {…})`,
 * `...renderMethods`, `..._core`) oder reichen die Datenfunktion als Referenz
 * durch (`data: activityFlowchartData`). Nur zu MELDEN, was man nicht sieht,
 * genügt vor der ersten Freigabe nicht: ein solches Modul könnte das Modul-Tag
 * `@agent` tragen, mit null Verstößen durch den Build gehen und
 * `available: true` werden, während zwanzig echte Methoden nie begutachtet
 * wurden (Review-Befund I6/P1).
 *
 * Zwei bewusst GETRENNTE Operationen:
 *
 *  • **Spread-Auflösung** (`...expr`) — gesucht ist das Objekt, zu dem `expr`
 *    auswertet. Ein Objektliteral ist es selbst; ein Identifier führt über
 *    seine Deklaration (`const X = {…}`) zum Literal; ein Aufruf
 *    (`factory(a, b)`) über die Funktionsdeklaration zu deren Return-Literal.
 *    Die **Argumente** eines Aufrufs werden nie betrachtet: das
 *    Konfigurationsobjekt (`{ mountPicker() {} }`) VERBRAUCHT die Fabrik, es
 *    landet nicht auf dem Viewmodel. Ein Spread einer *Funktion* liefert
 *    ebenfalls nichts — `{...fn}` hat keine eigenen Eigenschaften.
 *
 *  • **Funktions-Return-Auflösung** — nur für das `data`-Mitglied, wenn sein
 *    Wert eine benannte Funktion ist (`data: fooData`). Gesucht ist deren
 *    Return-Objektliteral.
 *
 * Was unauflösbar bleibt (fremdes Paket, berechneter Ausdruck, fehlende
 * Datei), wird weiter als `unresolved_spread:<ausdruck>` nach oben gegeben —
 * Stillschweigen ist hier die einzige verbotene Antwort.
 *
 * Die **Deklarations- und Pfadauflösung** (`findDeclaration`,
 * `findLocalDeclaration`, `findImportSource`, `resolveSpecifier`) ist davon
 * unabhängig und wird von der Model-Seite mitbenutzt: `readModelFields` in
 * `agent-data.mjs` verfolgt damit die `extends`-Kette eines Models. Der
 * Parse-Zwischenspeicher wirkt dadurch über beide Seiten — `flowchart-model.js`
 * hängt an vier Modulen und wird trotzdem einmal geparst.
 *
 * Kein Schreibzugriff, keine Netzwerkzugriffe; alles rein lesend über die
 * TypeScript-Compiler-API wie in `agent-data.mjs`.
 */
import ts from 'typescript';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';

/**
 * Obergrenze der Spread-Verschachtelung. Ein Mixin, das ein Mixin spreizt,
 * das ein Mixin spreizt, ist real (chart-module-base → chart-editor); zwölf
 * Ebenen sind weit jenseits des Bestands und halten einen pathologischen Fall
 * trotzdem an. Der Pfadschutz fängt echte Zyklen, die Tiefe fängt Ketten,
 * die zwar nicht kreisen, aber unbegrenzt wachsen.
 *
 * Ein Treffer der Grenze ist ein BEFUND, kein stilles Verwerfen: er wird als
 * `unresolved_spread:<ausdruck>` gemeldet wie jede andere Blindstelle.
 */
const MAX_SPREAD_DEPTH = 12;

/**
 * Ein Auflöser mit Parse-Zwischenspeicher für genau einen Lauf.
 *
 * Der Zwischenspeicher ist nicht Kosmetik: `chart-module-base.js` hängt an elf
 * Modulen und würde sonst elfmal geparst. Er muss dafür LAUFWEIT sein — ein
 * Auflöser je Modul hätte denselben Effekt nicht. `collectAgentData` legt
 * deshalb genau einen an.
 *
 * @param {string} _appDir  Wurzel von app/dev. Heute unbenutzt: die
 *   Herkunftsangaben in den Verstoßcodes werden in `agent-data.mjs` relativ
 *   gemacht, nicht hier. Der Parameter bleibt in der Signatur, weil jeder
 *   Aufrufer ihn übergibt und die Wurzel hier gebraucht würde, sobald der
 *   Resolver selbst Pfade ausgibt.
 * @returns {{
 *   parse: (file: string) => ts.SourceFile,
 *   findDeclaration: (name: string, sf: ts.SourceFile) => { node: ts.Node, sf: ts.SourceFile }|null,
 *   findDataReturnLiteral: (sf: ts.SourceFile) => ts.ObjectLiteralExpression|null,
 *   collectMembers: (literal: ts.ObjectLiteralExpression, sf: ts.SourceFile) =>
 *     { members: Map<string, { member: ts.ObjectLiteralElementLike, sf: ts.SourceFile }>, unresolved: string[] },
 * }}
 */
export function createResolver(_appDir) {
  const cache = new Map();

  /** @returns {ts.SourceFile} geparste Datei, pro absolutem Pfad genau einmal. */
  function parse(file) {
    const key = resolvePath(file);
    let sf = cache.get(key);
    if (!sf) {
      sf = ts.createSourceFile(key, readFileSync(key, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      cache.set(key, sf);
    }
    return sf;
  }

  /**
   * Die Deklaration eines Namens — erst in derselben Datei, dann über einen
   * benannten Import.
   * @returns {{ node: ts.Node, sf: ts.SourceFile }|null}
   */
  function findDeclaration(name, sf) {
    const local = findLocalDeclaration(name, sf);
    if (local) return { node: local, sf };
    const imported = findImportSource(name, sf);
    if (!imported) return null;
    const file = resolveSpecifier(imported.specifier, sf.fileName);
    if (!file) return null;
    let target;
    try {
      target = parse(file);
    } catch {
      return null;                      // unlesbare Datei ist nicht auflösbar, kein Absturz
    }
    const decl = findLocalDeclaration(imported.originalName, target);
    return decl ? { node: decl, sf: target } : null;
  }

  /**
   * Das Objekt hinter einem Spread-Ausdruck.
   * @returns {{ literal: ts.ObjectLiteralExpression, sf: ts.SourceFile }|null}
   */
  function resolveSpread(expression, sf) {
    const expr = unwrap(expression);
    if (ts.isObjectLiteralExpression(expr)) return { literal: expr, sf };

    if (ts.isIdentifier(expr)) {
      const decl = findDeclaration(expr.text, sf);
      if (!decl) return null;
      // Eine Funktionsdeklaration ist hier KEIN Treffer: `{...fn}` liefert
      // keine Methoden. Nur ein Objektwert zählt — direkt oder als Ergebnis
      // eines Fabrikaufrufs (`const _core = chainViewMixin(…)`).
      if (!ts.isVariableDeclaration(decl.node) || !decl.node.initializer) return null;
      const init = unwrap(decl.node.initializer);
      if (ts.isObjectLiteralExpression(init)) return { literal: init, sf: decl.sf };
      if (ts.isCallExpression(init)) return resolveCall(init, decl.sf);
      return null;
    }

    if (ts.isCallExpression(expr)) return resolveCall(expr, sf);
    return null;
  }

  /**
   * Das Return-Literal der Funktion, die ein Aufruf trifft. Argumente werden
   * absichtlich ignoriert.
   * @returns {{ literal: ts.ObjectLiteralExpression, sf: ts.SourceFile }|null}
   */
  function resolveCall(call, sf) {
    const callee = unwrap(call.expression);
    if (!ts.isIdentifier(callee)) return null;   // `a.b()` ist nicht auflösbar
    const decl = findDeclaration(callee.text, sf);
    if (!decl) return null;
    const fn = functionFromDeclaration(decl.node);
    if (!fn) return null;
    const literal = returnObjectLiteral(fn);
    return literal ? { literal, sf: decl.sf } : null;
  }

  /**
   * Das Objektliteral, das die `data`-Funktion des `createModule({…})`-
   * Arguments zurückgibt. Zwei Formen: Methode/Funktionsausdruck an Ort und
   * Stelle, oder `data: fooData` mit einer benannten Funktion — das Muster von
   * `activity-flowchart`, wo die Ansichtstransformationen testbar bleiben
   * sollen.
   * @returns {ts.ObjectLiteralExpression|null}
   */
  function findDataReturnLiteral(sf) {
    const dataMember = findCreateModuleMember(sf, 'data');
    if (!dataMember) return null;

    const direct = functionFromMember(dataMember);
    if (direct) return returnObjectLiteral(direct);

    if (ts.isPropertyAssignment(dataMember)) {
      const init = unwrap(dataMember.initializer);
      if (ts.isIdentifier(init)) {
        const decl = findDeclaration(init.text, sf);
        const fn = decl && functionFromDeclaration(decl.node);
        if (fn) return returnObjectLiteral(fn);
      }
    }
    return null;
  }

  /**
   * Alle Mitglieder eines Viewmodel-Literals, Spreads eingerechnet.
   *
   * Die Mitglieder landen in einer `Map` nach Namen, in Quellreihenfolge:
   * ein späteres `set` gewinnt. Das ist genau die Spread-Semantik zur
   * Laufzeit — ein eigenes Mitglied des Moduls überschreibt das gleichnamige
   * Mixin-Mitglied. Geprüft wird deshalb nur das gewinnende Mitglied.
   *
   * @param {ts.ObjectLiteralExpression} literal
   * @param {ts.SourceFile} sf  Datei, in der `literal` steht
   * @returns {{ members: Map<string, { member: ts.ObjectLiteralElementLike, sf: ts.SourceFile }>, unresolved: string[] }}
   */
  function collectMembers(literal, sf) {
    const members = new Map();
    const unresolved = [];
    // Der Zyklusschutz ist ein PFAD-Set, kein Besuchs-Set: betreten beim
    // Abstieg, freigegeben beim Zurückkehren. Ein Besuchs-Set hätte das
    // zweite Vorkommen desselben Literals übersprungen — und damit genau das
    // laufzeitlich GEWINNENDE (`{ ...A, x() {}, ...A }` ⇒ `A.x` gewinnt).
    // Das wäre ein Widerspruch zur Semantikzusage unten.
    const path = new Set();

    const key = (lit, file) => `${file.fileName}:${lit.pos}`;

    const walk = (lit, file, depth) => {
      path.add(key(lit, file));
      for (const member of lit.properties) {
        if (ts.isSpreadAssignment(member)) {
          const target = resolveSpread(member.expression, file);
          if (!target) { unresolved.push(member.expression.getText()); continue; }
          // Ein Mixin, das sich selbst spreizt
          // (`export const loopMix = { ...loopMix }`), terminiert hier STILL:
          // ein Literal auf dem eigenen Pfad ist aufgelöst, nicht unauflösbar.
          if (path.has(key(target.literal, target.sf))) continue;
          // Die Tiefengrenze dagegen ist eine Blindstelle und wird gemeldet.
          if (depth + 1 > MAX_SPREAD_DEPTH) { unresolved.push(member.expression.getText()); continue; }
          walk(target.literal, target.sf, depth + 1);
          continue;
        }
        const name = memberName(member);
        if (name === null) continue;
        members.set(name, { member, sf: file });
      }
      path.delete(key(lit, file));
    };

    walk(literal, sf, 0);
    return { members, unresolved };
  }

  return { parse, findDeclaration, findDataReturnLiteral, collectMembers };
}

/**
 * Das Mitglied `<name>` des Objektarguments von `createModule({…})`.
 * @returns {ts.ObjectLiteralElementLike|null}
 */
export function findCreateModuleMember(sf, name) {
  let found = null;
  const walk = (node) => {
    if (found) return;
    if (ts.isCallExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === 'createModule'
        && node.arguments[0]
        && ts.isObjectLiteralExpression(node.arguments[0])) {
      for (const property of node.arguments[0].properties) {
        if (memberName(property) === name) { found = property; break; }
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return found;
}

/**
 * Das erste `return <objektliteral>` im Körper einer Funktion — OHNE in
 * verschachtelte Funktionskörper abzusteigen.
 *
 * Der Abstiegsstopp ist der Punkt: eine naive Suche über alle Kindknoten
 * erwischt das Objektliteral eines inneren Rückrufs
 * (`rows.map(r => { return { id: r.id }; })`) und beschreibt dann ein
 * Viewmodel, das es nicht gibt.
 *
 * @param {ts.SignatureDeclaration} fn
 * @returns {ts.ObjectLiteralExpression|null}
 */
export function returnObjectLiteral(fn) {
  const body = fn?.body;
  if (!body) return null;
  if (!ts.isBlock(body)) {
    const expr = unwrap(body);
    return ts.isObjectLiteralExpression(expr) ? expr : null;   // `() => ({…})`
  }
  let found = null;
  const walk = (node) => {
    if (found) return;
    if (isFunctionLike(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node)) return;
    if (ts.isReturnStatement(node)) {
      const expr = node.expression && unwrap(node.expression);
      if (expr && ts.isObjectLiteralExpression(expr)) found = expr;
      return;
    }
    ts.forEachChild(node, walk);
  };
  ts.forEachChild(body, walk);
  return found;
}

/**
 * @returns {boolean} ob der Knoten einen eigenen Funktionskörper aufspannt.
 *
 * Exportiert, weil die Model-Seite denselben Abstiegsstopp braucht: eine
 * `this.x = …`-Zuweisung in einem Rückruf im Konstruktor ist kein Feld.
 */
export function isFunctionLike(node) {
  return ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node)
    || ts.isConstructorDeclaration(node);
}

/**
 * Die Deklaration eines Namens innerhalb einer Datei — auch verschachtelt.
 * Das `_core`-Muster von `process-map` liegt INNERHALB von `data()`, eine
 * Suche nur über `sf.statements` würde es übersehen.
 *
 * Klassendeklarationen zählen mit, seit die Model-Seite die `extends`-Kette
 * verfolgt (`export class State extends FlowchartState`). Für die
 * Spread-Auflösung ändert das nichts: eine Klasse ist weder ein Objektliteral
 * noch eine Funktion, beide Pfade dort verwerfen sie ohnehin.
 *
 * @returns {ts.FunctionDeclaration|ts.VariableDeclaration|ts.ClassDeclaration|null}
 */
export function findLocalDeclaration(name, sf) {
  let found = null;
  const walk = (node) => {
    if (found) return;
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) { found = node; return; }
    if (ts.isClassDeclaration(node) && node.name?.text === name) { found = node; return; }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) { found = node; return; }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return found;
}

/**
 * Der benannte Import eines Namens — `{ a }` wie `{ a as b }`.
 * @returns {{ specifier: string, originalName: string }|null}
 */
export function findImportSource(name, sf) {
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if (element.name.text !== name) continue;
      if (!ts.isStringLiteral(statement.moduleSpecifier)) return null;
      return {
        specifier: statement.moduleSpecifier.text,
        originalName: element.propertyName?.text ?? name,
      };
    }
  }
  return null;
}

/**
 * Ein relativer Modul-Spezifizierer zum Dateipfad. Nur relative Pfade — ein
 * Paketname (`typescript`) ist für diesen Zweck keine Quelle.
 * @returns {string|null} absoluter Pfad einer existierenden Datei
 */
export function resolveSpecifier(specifier, fromFile) {
  if (!specifier.startsWith('.')) return null;
  const base = resolvePath(dirname(fromFile), specifier);
  for (const candidate of [base, `${base}.js`, resolvePath(base, 'index.js')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** @returns {ts.SignatureDeclaration|null} die Funktion hinter einer Deklaration. */
function functionFromDeclaration(node) {
  if (ts.isFunctionDeclaration(node)) return node;
  if (ts.isVariableDeclaration(node) && node.initializer) {
    const init = unwrap(node.initializer);
    if (ts.isFunctionExpression(init) || ts.isArrowFunction(init)) return init;
  }
  return null;
}

/** @returns {ts.SignatureDeclaration|null} die Funktion hinter einem Literal-Mitglied. */
export function functionFromMember(member) {
  if (ts.isMethodDeclaration(member)) return member;
  if (ts.isPropertyAssignment(member)) {
    const init = unwrap(member.initializer);
    if (ts.isFunctionExpression(init) || ts.isArrowFunction(init)) return init;
  }
  return null;
}

/** Klammern abstreifen: `(…)` ist für die Auflösung kein eigener Schritt. */
function unwrap(node) {
  let current = node;
  while (current && ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}

/** @returns {string|null} der Name eines Objektliteral-Mitglieds. */
export function memberName(member) {
  const name = member.name;
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
}
