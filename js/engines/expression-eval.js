/**
 * D.Mike — Expression Engine (expression-eval.js)
 *
 * Zero-dependency arithmetic expression evaluator. Tokenizer → recursive-descent
 * parser → tree-walking evaluator. Resolves identifiers/calls against a
 * caller-supplied scope { functions, constants, variables }; the core knows no
 * specific math functions or constants — callers inject them.
 *
 * Grammar (precedence low→high):
 *   expr   := add
 *   add    := mul (('+'|'-') mul)*
 *   mul    := pow (('*'|'/') pow)*
 *   pow    := unary (('^'|'**') pow)?  // right-associative; '**' aliases '^'
 *   unary  := ('-'|'+')? primary
 *   primary:= number | const | var | ident '(' args? ')' | '(' expr ')'
 *   ident  := name ('.' name)*         // may contain dots, e.g. Math.sin
 *
 * Replaces the former `new Function` formula interpreters (calculator, contour).
 */

// ─── Errors ─────────────────────────────────────────────────

/**
 * Structured engine error: carries a machine-readable `code` and the offending
 * `token` so callers can build localized messages without parsing `.message`.
 * Extends Error and keeps the same messages, so existing catch/regex callers
 * keep working unchanged.
 */
export class ExprError extends Error {
  /**
   * @param {string} code  UNEXPECTED_CHAR | INVALID_NUMBER | EMPTY | SYNTAX |
   *   TRAILING | UNKNOWN_IDENTIFIER | UNKNOWN_FUNCTION
   * @param {string} message  human-readable (unchanged from prior versions)
   * @param {string} [token]  offending name or character
   */
  constructor(code, message, token) {
    super(message);
    this.name = 'ExprError';
    this.code = code;
    this.token = token;
  }
}

// ─── Tokenizer ──────────────────────────────────────────────

/**
 * Split source into tokens.
 * @param {string} src
 * @returns {Array<{type:string, value?:number|string}>}
 * @throws {Error} on an unrecognized character
 */
export function tokenize(src) {
  const tokens = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    // number (incl. scientific notation 1e3, 1.5e-2)
    if (c >= '0' && c <= '9' || (c === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')) {
      let j = i;
      while (j < n && ((src[j] >= '0' && src[j] <= '9') || src[j] === '.')) j++;
      // exponent
      if (src[j] === 'e' || src[j] === 'E') {
        let k = j + 1;
        if (src[k] === '+' || src[k] === '-') k++;
        if (src[k] >= '0' && src[k] <= '9') {
          j = k;
          while (j < n && src[j] >= '0' && src[j] <= '9') j++;
        }
      }
      const text = src.slice(i, j);
      const value = Number(text);
      if (Number.isNaN(value)) throw new ExprError('INVALID_NUMBER', `Invalid number: "${text}"`, text);
      tokens.push({ type: 'num', value });
      i = j;
      continue;
    }
    // identifier (letters, digits, underscore; must start with a letter/_)
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_') {
      let j = i + 1;
      while (j < n) {
        const d = src[j];
        if ((d >= 'a' && d <= 'z') || (d >= 'A' && d <= 'Z') ||
            (d >= '0' && d <= '9') || d === '_' || d === '.') j++;
        else break;
      }
      tokens.push({ type: 'ident', value: src.slice(i, j) });
      i = j;
      continue;
    }
    // operators & punctuation (** before * so 2**3 is one power op)
    if (c === '*' && src[i + 1] === '*') {
      tokens.push({ type: 'op', value: '**' }); i += 2; continue;
    }
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '^') {
      tokens.push({ type: 'op', value: c }); i++; continue;
    }
    if (c === '(') { tokens.push({ type: 'lparen' }); i++; continue; }
    if (c === ')') { tokens.push({ type: 'rparen' }); i++; continue; }
    if (c === ',') { tokens.push({ type: 'comma' }); i++; continue; }
    throw new ExprError('UNEXPECTED_CHAR', `Unexpected character: "${c}"`, c);
  }
  return tokens;
}

// ─── Parser (recursive descent) ─────────────────────────────

/**
 * Parse a token stream into an AST.
 * @param {Array} tokens
 * @returns {object} AST root node
 * @throws {Error} on a syntax error
 */
export function parse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const expect = (type) => {
    const t = next();
    if (!t || t.type !== type) throw new ExprError('SYNTAX', `Expected ${type}`);
    return t;
  };

  function parseExpr() { return parseAdd(); }

  function parseAdd() {
    let node = parseMul();
    while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = next().value;
      node = { type: 'binary', op, left: node, right: parseMul() };
    }
    return node;
  }

  function parseMul() {
    let node = parsePow();
    while (peek() && peek().type === 'op' && (peek().value === '*' || peek().value === '/')) {
      const op = next().value;
      node = { type: 'binary', op, left: node, right: parsePow() };
    }
    return node;
  }

  function parsePow() {
    const base = parseUnary();
    if (peek() && peek().type === 'op' && (peek().value === '^' || peek().value === '**')) {
      next();
      // right-associative: recurse into parsePow for the exponent
      return { type: 'binary', op: '^', left: base, right: parsePow() };
    }
    return base;
  }

  function parseUnary() {
    if (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = next().value;
      return { type: 'unary', op, operand: parseUnary() };
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const t = peek();
    if (!t) throw new ExprError('SYNTAX', 'Unexpected end of input');
    if (t.type === 'num') { next(); return { type: 'num', value: t.value }; }
    if (t.type === 'lparen') {
      next();
      const inner = parseExpr();
      expect('rparen');
      return inner;
    }
    if (t.type === 'ident') {
      next();
      if (peek() && peek().type === 'lparen') {
        next();
        const args = [];
        if (peek() && peek().type !== 'rparen') {
          args.push(parseExpr());
          while (peek() && peek().type === 'comma') { next(); args.push(parseExpr()); }
        }
        expect('rparen');
        return { type: 'call', name: t.value, args };
      }
      return { type: 'ident', name: t.value };
    }
    throw new ExprError('SYNTAX', `Unexpected token: ${t.type}`);
  }

  if (tokens.length === 0) throw new ExprError('EMPTY', 'Empty expression');
  const ast = parseExpr();
  if (pos !== tokens.length) throw new ExprError('TRAILING', 'Unexpected trailing tokens');
  return ast;
}

// ─── Evaluator ──────────────────────────────────────────────

/**
 * Evaluate an AST against a scope.
 * @param {object} node  AST node from parse()
 * @param {{functions?:object, constants?:object, variables?:object}} scope
 * @returns {number}
 * @throws {Error} on an unknown identifier/function
 */
export function evaluate(node, scope) {
  const functions = scope.functions || {};
  const constants = scope.constants || {};
  const variables = scope.variables || {};

  function ev(nd) {
    switch (nd.type) {
      case 'num': return nd.value;
      case 'unary': {
        const v = ev(nd.operand);
        return nd.op === '-' ? -v : v;
      }
      case 'binary': {
        const l = ev(nd.left), r = ev(nd.right);
        switch (nd.op) {
          case '+': return l + r;
          case '-': return l - r;
          case '*': return l * r;
          case '/': return l / r;
          case '^': return l ** r;
          default: throw new Error(`Unknown operator: ${nd.op}`);
        }
      }
      case 'ident': {
        if (Object.hasOwn(variables, nd.name)) return variables[nd.name];
        if (Object.hasOwn(constants, nd.name)) return constants[nd.name];
        throw new ExprError('UNKNOWN_IDENTIFIER', `Unknown identifier: ${nd.name}`, nd.name);
      }
      case 'call': {
        const fn = Object.hasOwn(functions, nd.name) ? functions[nd.name] : undefined;
        if (typeof fn !== 'function') throw new ExprError('UNKNOWN_FUNCTION', `Unknown function: ${nd.name}`, nd.name);
        return fn(...nd.args.map(ev));
      }
      default: throw new Error(`Unknown node: ${nd.type}`);
    }
  }

  return ev(node);
}

/**
 * One-shot convenience: tokenize → parse → evaluate.
 * @param {string} src
 * @param {object} scope
 * @returns {number}
 */
export function evalExpr(src, scope) {
  return evaluate(parse(tokenize(src)), scope);
}
