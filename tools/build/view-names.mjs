/**
 * D.Mike — Namen des view-Blocks (view-names.mjs)
 *
 * Statische Lesung des `view`-Blocks von `createModule`/`createTile`: das
 * Objektliteral der Fabrik, der Block selbst, das zurückgegebene Objekt und
 * die Namen darin. Ein view-Block aus Teilen (`view: [a, b]`) liefert die
 * Glieder aller Teile; ein Bezeichner wird in der Datei selbst oder über ihren
 * relativen Import aufgelöst (dafür der Pfad der Datei). Genutzt von
 * module-gates.mjs und widget-gates.mjs; hängt von keinem von ihnen ab.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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
  if (!fn || !(ts.isMethodDeclaration(fn) || ts.isArrowFunction(fn) || ts.isFunctionExpression(fn) || ts.isFunctionDeclaration(fn))) return null;
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

const unwrapExpr = (e) => {
  while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression?.(e))) e = e.expression;
  return e;
};

/**
 * Die Funktion hinter einem Bezeichner der Datei: Funktionsdeklaration oder
 * `const name = (ctx) => …` auf oberster Ebene, bei `export` auch so.
 * @param {import('typescript').SourceFile} sf @param {string} name
 * @returns {import('typescript').Node|null}
 */
function localFunction(sf, name) {
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name?.text === name) return st;
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer) return unwrapExpr(d.initializer);
      }
    }
  }
  return null;
}

/**
 * Der Wert hinter einem Bezeichner (Funktion oder Objektliteral): lokal oder
 * über einen relativen Import (`import { a as b } from './a.js'`) der
 * exportierte Wert der Zieldatei.
 * @param {import('typescript').SourceFile} sf @param {string} name @param {string|undefined} file Pfad von `sf`
 * @returns {import('typescript').Node|null}
 */
export function resolvePart(sf, name, file) {
  const local = localFunction(sf, name);
  if (local) return local;
  if (!file) return null;
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const spec = st.moduleSpecifier.text;
    if (!spec.startsWith('.')) continue;
    const named = st.importClause?.namedBindings;
    if (!named || !ts.isNamedImports(named)) continue;
    const el = named.elements.find((e) => e.name.text === name);
    if (!el) continue;
    const target = resolve(dirname(file), spec);
    if (!existsSync(target)) return null;
    const tsf = ts.createSourceFile(target, readFileSync(target, 'utf8'), ts.ScriptTarget.Latest, true);
    return localFunction(tsf, (el.propertyName ?? el.name).text);
  }
  return null;
}

/**
 * Die Funktionen der Teile des view-Blocks: der Block selbst oder, bei
 * `view: [a, (ctx) => ({ … })]`, jedes Element der Liste. Bezeichner werden
 * in der Datei oder über den Import aufgelöst; unauflösbare fallen weg.
 * @param {string} text Quelltext von viewmodel.js oder einer Kachel
 * @param {string} [file] Pfad der Datei, für Importe
 * @returns {import('typescript').Node[]}
 */
export function viewPartNodes(text, file) {
  const sf = ts.createSourceFile(file ?? 'viewmodel.js', text, ts.ScriptTarget.Latest, true);
  const arg = factoryArgument(sf);
  const view = arg?.properties.find((p) => (ts.isMethodDeclaration(p) || ts.isPropertyAssignment(p)) && p.name && ts.isIdentifier(p.name) && p.name.text === 'view');
  if (!view) return [];
  const init = ts.isPropertyAssignment(view) ? unwrapExpr(view.initializer) : null;
  if (init && ts.isArrayLiteralExpression(init)) {
    return init.elements.map((el) => {
      const e = unwrapExpr(el);
      return ts.isIdentifier(e) ? resolvePart(sf, e.text, file) : e;
    }).filter(Boolean);
  }
  if (init && ts.isIdentifier(init)) {
    const fn = resolvePart(sf, init.text, file);
    return fn ? [fn] : [];
  }
  return [view];
}

/**
 * Die Objektliterale, die die Teile des view-Blocks liefern.
 * @param {string} text @param {string} [file]
 * @returns {import('typescript').ObjectLiteralExpression[]}
 */
function viewReturnObjects(text, file) {
  return viewPartNodes(text, file).map(viewReturnObject).filter(Boolean);
}

/**
 * Die Namen des view-Blocks nach Herkunft, gelesen am zurückgegebenen Objekt
 * jedes Teils: Getter, `computed`-Schlüssel und Datenglieder (Eigenschaften
 * und Kurzschreibweise mit Bezeichner-Schlüssel, ausgenommen `computed`).
 * @param {string} text Quelltext von viewmodel.js oder einer Kachel
 * @param {string} [file] Pfad der Datei, für Teile aus Importen
 * @returns {{ getters: string[], computed: string[], data: string[] }}
 */
export function viewNamesDetailOf(text, file) {
  const getters = [];
  const computed = [];
  const data = [];
  for (const top of viewReturnObjects(text, file)) {
    for (const p of top.properties) {
      if (!p.name || !ts.isIdentifier(p.name)) continue;
      const name = p.name.text;
      if (ts.isGetAccessorDeclaration(p)) getters.push(name);
      else if (name === 'computed' && ts.isPropertyAssignment(p) && ts.isObjectLiteralExpression(p.initializer)) {
        for (const c of p.initializer.properties) if (c.name && ts.isIdentifier(c.name)) computed.push(c.name.text);
      } else if (name !== 'computed' && (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p))) data.push(name);
    }
  }
  return { getters, computed, data };
}

/**
 * Die Schlüssel der obersten `computed:`-Objekte im view-Block, statisch gelesen wie zur Laufzeit.
 * @param {string} text Quelltext von viewmodel.js @param {string} [file] Pfad der Datei
 * @returns {string[]}
 */
export function computedNamesOf(text, file) {
  return viewNamesDetailOf(text, file).computed;
}

/** Alle Namen, die ein Template aus dem view-Block lesen darf. @param {string} text @param {string} [file] @returns {Set<string>} */
export function viewNamesOf(text, file) {
  const { getters, computed, data } = viewNamesDetailOf(text, file);
  return new Set([...getters, ...computed, ...data]);
}

/**
 * Alle Glieder des view-Blocks, auch Methoden (für Bezüge, die eine Methode nennen).
 * @param {string} text Quelltext von viewmodel.js @param {string} [file] Pfad der Datei
 * @returns {Set<string>}
 */
export function viewMemberNamesOf(text, file) {
  const out = new Set(viewNamesOf(text, file));
  for (const top of viewReturnObjects(text, file)) {
    for (const p of top.properties) if (p.name && ts.isIdentifier(p.name)) out.add(p.name.text);
  }
  return out;
}
