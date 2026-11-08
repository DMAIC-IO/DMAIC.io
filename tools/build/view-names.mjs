/**
 * D.Mike — Namen des view-Blocks (view-names.mjs)
 *
 * Statische Lesung des `view`-Blocks von `createModule`/`createTile`: das
 * Objektliteral der Fabrik, der Block selbst, das zurückgegebene Objekt und
 * die Namen darin. Genutzt von module-gates.mjs, widget-gates.mjs und
 * agent-data.mjs; hängt von keinem von ihnen ab.
 */
import ts from 'typescript';

/**
 * Das Objektliteral im Argument von `createModule(…)` bzw. `createTile(…)`.
 * @param {import('typescript').SourceFile} sf
 * @returns {import('typescript').ObjectLiteralExpression|null}
 */
export function factoryArgument(sf) {
  /** @type {import('typescript').ObjectLiteralExpression|null} */
  let found = null;
  const visit = (n) => {
    if (found) return;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && (n.expression.text === 'createModule' || n.expression.text === 'createTile')
        && n.arguments[0] && ts.isObjectLiteralExpression(n.arguments[0])) {
      found = n.arguments[0];
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

/**
 * Der `view`-Block (Methode oder Eigenschaft `view` am Literal, das an `createModule` übergeben wird).
 * @param {string} text
 * @returns {import('typescript').Node|null}
 */
export function findViewBlock(text) {
  const arg = factoryArgument(ts.createSourceFile('viewmodel.js', text, ts.ScriptTarget.Latest, true));
  if (!arg) return null;
  return arg.properties.find((p) => (ts.isMethodDeclaration(p) || ts.isPropertyAssignment(p)) && p.name && ts.isIdentifier(p.name) && p.name.text === 'view') ?? null;
}

/**
 * Das Objektliteral, das der view-Block liefert: das erste `return { … }` der
 * Funktion (verschachtelte Funktionen zählen nicht), bei Pfeilfunktionen der
 * Ausdruckskörper, bei einem Objektliteral als `view` dieses selbst.
 * @param {import('typescript').Node} view
 * @returns {import('typescript').ObjectLiteralExpression|null}
 */
export function viewReturnObject(view) {
  const unwrap = (e) => { while (e && ts.isParenthesizedExpression(e)) e = e.expression; return e; };
  let fn = view;
  if (ts.isPropertyAssignment(view)) {
    const init = unwrap(view.initializer);
    if (init && ts.isObjectLiteralExpression(init)) return init;
    fn = init;
  }
  if (!fn || !(ts.isMethodDeclaration(fn) || ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) return null;
  if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) {
    const body = unwrap(fn.body);
    return ts.isObjectLiteralExpression(body) ? body : null;
  }
  /** @type {import('typescript').ObjectLiteralExpression|null} */
  let direct = null; // letztes return auf oberster Ebene des Rumpfs
  /** @type {import('typescript').ObjectLiteralExpression|null} */
  let nested = null; // erstes return in einem Zweig, falls es kein oberstes gibt
  const body = /** @type {any} */ (fn).body;
  const visit = (n) => {
    if (ts.isFunctionLike(n)) return;
    if (ts.isReturnStatement(n) && n.expression) {
      const e = unwrap(n.expression);
      if (ts.isObjectLiteralExpression(e)) {
        if (n.parent === body) direct = e;
        else nested ??= e;
      }
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(body);
  return direct ?? nested;
}

/**
 * Die Namen des view-Blocks nach Herkunft, gelesen am zurückgegebenen Objekt:
 * Getter, `computed`-Schlüssel und Datenglieder (Eigenschaften und Kurzschreibweise
 * mit Bezeichner-Schlüssel, ausgenommen `computed`).
 * @param {string} text Quelltext von viewmodel.js oder einer Kachel
 * @returns {{ getters: string[], computed: string[], data: string[] }}
 */
export function viewNamesDetailOf(text) {
  const getters = [];
  const computed = [];
  const data = [];
  const view = findViewBlock(text);
  const top = view ? viewReturnObject(view) : null;
  for (const p of top?.properties ?? []) {
    if (!p.name || !ts.isIdentifier(p.name)) continue;
    const name = p.name.text;
    if (ts.isGetAccessorDeclaration(p)) getters.push(name);
    else if (name === 'computed' && ts.isPropertyAssignment(p) && ts.isObjectLiteralExpression(p.initializer)) {
      for (const c of p.initializer.properties) if (c.name && ts.isIdentifier(c.name)) computed.push(c.name.text);
    } else if (name !== 'computed' && (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p))) data.push(name);
  }
  return { getters, computed, data };
}

/**
 * Die Schlüssel des obersten `computed:`-Objekts im view-Block, statisch gelesen wie zur Laufzeit.
 * @param {string} text Quelltext von viewmodel.js
 * @returns {string[]}
 */
export function computedNamesOf(text) {
  return viewNamesDetailOf(text).computed;
}

/** Alle Namen, die ein Template aus dem view-Block lesen darf. @param {string} text @returns {Set<string>} */
export function viewNamesOf(text) {
  const { getters, computed, data } = viewNamesDetailOf(text);
  return new Set([...getters, ...computed, ...data]);
}
