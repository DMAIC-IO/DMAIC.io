/**
 * Die Schlüssel, die `read()` eines Moduls an `readAgentState` übergibt —
 * die Gegenseite der erklärten `@typedef AgentRead`. Statisch,
 * fail closed: was nicht sicher lesbar ist, ergibt `null` (Blindstelle wird
 * gemeldet, nicht geraten).
 */
import ts from 'typescript';
import { functionFromMember, isFunctionLike } from './agent-resolve.mjs';

const MAX_DEPTH = 3;

/**
 * @param {object} resolver  aus `createResolver`
 * @param {ts.SourceFile} sf  die Moduldatei
 * @param {() => (string[]|null)} toJSONKeys  persistierte Schlüssel des Models
 * @returns {string[]|null}
 */
export function readReturnKeys(resolver, sf, toJSONKeys) {
  const literal = resolver.findDataReturnLiteral(sf);
  if (!literal) return null;
  const { members } = resolver.collectMembers(literal, sf);
  const entry = members.get('read');
  const fn = entry && functionFromMember(entry.member);
  if (!fn?.body || !ts.isBlock(fn.body)) return null;
  const calls = [];
  walkOwn(fn.body, (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'readAgentState') calls.push(n);
  });
  if (calls.length !== 1 || calls[0].arguments.length < 2) return null;
  const ctx = { resolver, members, toJSONKeys };
  return keysOf(calls[0].arguments[1], fn.body, entry.sf, ctx, 0);
}

/** Besucht den Körper, ohne in verschachtelte Funktionen abzusteigen. */
function walkOwn(body, visit) {
  const walk = (n) => {
    if (n !== body && (isFunctionLike(n) || ts.isClassDeclaration(n) || ts.isClassExpression(n))) return;
    visit(n);
    ts.forEachChild(n, walk);
  };
  walk(body);
}

function strip(e) {
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e)) e = e.expression;
  return e;
}

function soleReturnExpression(fn) {
  if (!fn?.body) return null;
  if (!ts.isBlock(fn.body)) return fn.body;
  const returns = [];
  walkOwn(fn.body, (n) => { if (ts.isReturnStatement(n)) returns.push(n); });
  return returns.length === 1 && returns[0].expression ? returns[0].expression : null;
}

function propName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
}

function keysOf(raw, body, sf, ctx, depth) {
  if (depth > MAX_DEPTH) return null;
  const e = strip(raw);

  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
    return keysOf(e.left, body, sf, ctx, depth);
  }

  if (ts.isObjectLiteralExpression(e)) {
    const keys = [];
    for (const p of e.properties) {
      if (ts.isSpreadAssignment(p)) {
        const sub = keysOf(p.expression, body, sf, ctx, depth + 1);
        if (!sub) return null;
        keys.push(...sub);
        continue;
      }
      const name = p.name && propName(p.name);
      if (!name) return null;
      keys.push(name);
    }
    return [...new Set(keys)];
  }

  if (ts.isCallExpression(e)) {
    const callee = strip(e.expression);
    // this.model.toJSON() / module.model.toJSON() (auch über einen lokalen Alias);
    // jeder andere Empfänger liefert nicht die persistierten Schlüssel.
    if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'toJSON' && e.arguments.length === 0) {
      return isModelReceiver(callee.expression, body) ? ctx.toJSONKeys() : null;
    }
    // JSON.parse(JSON.stringify(x))
    if (ts.isPropertyAccessExpression(callee) && callee.getText(sf) === 'JSON.parse' && e.arguments.length === 1) {
      const inner = strip(e.arguments[0]);
      if (ts.isCallExpression(inner) && strip(inner.expression).getText(sf) === 'JSON.stringify') {
        return keysOf(inner.arguments[0], body, sf, ctx, depth + 1);
      }
      return null;
    }
    // this.<helper>()
    if (ts.isPropertyAccessExpression(callee) && callee.expression.kind === ts.SyntaxKind.ThisKeyword) {
      const entry = ctx.members.get(callee.name.text);
      const fn = entry && functionFromMember(entry.member);
      const ret = soleReturnExpression(fn);
      return ret ? keysOf(ret, fn.body, entry.sf, ctx, depth + 1) : null;
    }
    // importierte oder lokale Funktion
    if (ts.isIdentifier(callee)) {
      const decl = ctx.resolver.findDeclaration(callee.text, sf);
      let fn = null;
      if (decl && ts.isFunctionDeclaration(decl.node)) fn = decl.node;
      else if (decl && ts.isVariableDeclaration(decl.node) && decl.node.initializer) {
        const init = strip(decl.node.initializer);
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) fn = init;
      }
      const ret = soleReturnExpression(fn);
      return ret ? keysOf(ret, fn.body, decl.sf, ctx, depth + 1) : null;
    }
    return null;
  }

  if (ts.isIdentifier(e) && ts.isBlock(body)) return localKeys(e.text, body, sf, ctx, depth);
  return null;
}

/** `this.model`, `module.model` oder ein lokaler `const`-Alias darauf. */
function isModelReceiver(raw, body) {
  const e = strip(raw);
  if (ts.isPropertyAccessExpression(e) && e.name.text === 'model') {
    const base = strip(e.expression);
    return base.kind === ts.SyntaxKind.ThisKeyword || (ts.isIdentifier(base) && base.text === 'module');
  }
  if (ts.isIdentifier(e) && body && ts.isBlock(body)) {
    for (const st of body.statements) {
      if (!ts.isVariableStatement(st) || !(st.declarationList.flags & ts.NodeFlags.Const)) continue;
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === e.text && d.initializer) {
          const init = strip(d.initializer);
          return ts.isPropertyAccessExpression(init) && isModelReceiver(init, null);
        }
      }
    }
  }
  return false;
}

/** Eine lokale `const` im selben Körper: Variable oder Rest einer Destrukturierung. */
function localKeys(name, body, sf, ctx, depth) {
  for (const st of body.statements) {
    if (!ts.isVariableStatement(st)) continue;
    if (!(st.declarationList.flags & ts.NodeFlags.Const)) continue;
    for (const d of st.declarationList.declarations) {
      if (!d.initializer) continue;
      if (ts.isIdentifier(d.name) && d.name.text === name) {
        const keys = keysOf(d.initializer, body, sf, ctx, depth + 1);
        if (!keys) return null;
        const deleted = deletedKeys(name, body);
        return keys.filter(k => !deleted.has(k));
      }
      if (ts.isObjectBindingPattern(d.name)) {
        const rest = d.name.elements.find(el => el.dotDotDotToken);
        if (!rest || !ts.isIdentifier(rest.name) || rest.name.text !== name) continue;
        const taken = new Set();
        for (const el of d.name.elements) {
          if (el === rest) continue;
          const key = propName(el.propertyName ?? el.name);
          if (!key) return null;
          taken.add(key);
        }
        const keys = keysOf(d.initializer, body, sf, ctx, depth + 1);
        return keys ? keys.filter(k => !taken.has(k)) : null;
      }
    }
  }
  return null;
}

/** `delete <name>.<key>` als Anweisung im Körper. */
function deletedKeys(name, body) {
  const out = new Set();
  for (const st of body.statements) {
    if (!ts.isExpressionStatement(st) || !ts.isDeleteExpression(st.expression)) continue;
    const target = st.expression.expression;
    if (ts.isPropertyAccessExpression(target) && ts.isIdentifier(target.expression)
        && target.expression.text === name) out.add(target.name.text);
  }
  return out;
}
