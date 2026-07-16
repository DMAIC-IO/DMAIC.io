/**
 * Unit tests for the expression engine (expression-eval.js).
 * Tokenizer / recursive-descent parser / tree-walking evaluator, against a
 * caller-supplied scope { functions, constants, variables }.
 */

import { suite, test, assertEqual, assertAlmostEqual, assertThrows } from '../test-utils.js';
import { tokenize, parse, evaluate, evalExpr } from '../../js/engines/expression-eval.js';

const SCOPE = {
  constants: { pi: Math.PI, e: Math.E },
  functions: { sin: Math.sin, max: Math.max, neg: (x) => -x },
  variables: { x: 2, y: 3 },
};

// ── tokenizer ─────────────────────────────────────────────────────
suite('expression-eval — tokenize', () => {
  test('numbers and operators', () => {
    const t = tokenize('1 + 2*3');
    assertEqual(t.map(x => x.type).join(','), 'num,op,num,op,num');
  });
  test('decimals', () => assertEqual(tokenize('3.14')[0].value, 3.14));
  test('scientific literal 1e3', () => assertEqual(tokenize('1e3')[0].value, 1000));
  test('identifiers', () => assertEqual(tokenize('sin')[0].type, 'ident'));
  test('parens and comma', () => {
    const t = tokenize('f(1,2)');
    assertEqual(t.map(x => x.type).join(','), 'ident,lparen,num,comma,num,rparen');
  });
  test('unknown char throws', () => assertThrows(() => tokenize('1@2'), /.+/));
});

// ── parser / evaluator ────────────────────────────────────────────
suite('expression-eval — evaluate', () => {
  const run = (s) => evaluate(parse(tokenize(s)), SCOPE);
  test('addition', () => assertEqual(run('1+2'), 3));
  test('precedence mul>add', () => assertEqual(run('2+3*4'), 14));
  test('parens override', () => assertEqual(run('(2+3)*4'), 20));
  test('unary minus', () => assertEqual(run('0-5'), -5));
  test('unary minus prefix', () => assertEqual(run('-5+8'), 3));
  test('^ right-associative', () => assertEqual(run('2^3^2'), 512));
  test('^ binds tighter than *', () => assertEqual(run('2*3^2'), 18));
  test('division by zero → Infinity', () => assertEqual(run('1/0'), Infinity));
  test('constant pi', () => assertAlmostEqual(run('pi'), Math.PI, 1e-12));
  test('variable x', () => assertEqual(run('x'), 2));
  test('variable arithmetic', () => assertEqual(run('x*y+1'), 7));
  test('function call', () => assertAlmostEqual(run('sin(0)'), 0, 1e-12));
  test('multi-arg function', () => assertEqual(run('max(1,9,4)'), 9));
  test('nested calls', () => assertEqual(run('neg(neg(5))'), 5));
  test('whitespace tolerant', () => assertEqual(run('  1  +  2 '), 3));
  // unary binds tighter than ^ (grammar: pow := unary ('^' pow)?), so -2^2 = (-2)^2 = 4.
  // Recorded choice: differs from common calculators where -2^2 = -4.
  test('unary tighter than ^: -2^2 = 4', () => assertEqual(run('-2^2'), 4));
  test('negative exponent: 2^-3 = 0.125', () => assertEqual(run('2^-3'), 0.125));
  test('chained unary minus: --5 = 5', () => assertEqual(run('-(-5)'), 5));
  test('empty function args: max() = -Infinity', () => assertEqual(run('max()'), -Infinity));
  test('result is always a number type', () => assertEqual(typeof run('1+2'), 'number'));
});

// ── errors ────────────────────────────────────────────────────────
suite('expression-eval — errors', () => {
  const run = (s) => evaluate(parse(tokenize(s)), SCOPE);
  test('unknown identifier throws', () => assertThrows(() => run('zzz'), /unknown/i));
  test('unknown function throws', () => assertThrows(() => run('foo(1)'), /unknown/i));
  test('unbalanced paren throws', () => assertThrows(() => run('(1+2'), /.+/));
  test('trailing tokens throw', () => assertThrows(() => run('1 2'), /.+/));
  test('empty input throws', () => assertThrows(() => run(''), /.+/));
});

// ── scope safety & defensive fallbacks ────────────────────────────
suite('expression-eval — scope safety', () => {
  const run = (s, scope) => evaluate(parse(tokenize(s)), scope);
  test('inherited Object.prototype member is NOT resolvable', () =>
    assertThrows(() => run('toString', { constants: {}, functions: {}, variables: {} }), /unknown/i));
  test('inherited constructor is NOT callable', () =>
    assertThrows(() => run('constructor(1)', { constants: {}, functions: {}, variables: {} }), /unknown/i));
  test('missing scope sub-objects default to empty (number literal still evaluates)', () =>
    assertEqual(run('1+2', {}), 3));
  test('missing variables: bare identifier throws unknown', () =>
    assertThrows(() => run('x', {}), /unknown/i));
});

// ── convenience evalExpr ──────────────────────────────────────────
suite('expression-eval — evalExpr facade', () => {
  test('one-shot eval', () => assertEqual(evalExpr('x+y', SCOPE), 5));
});

// ── ** power operator (alias of ^) ────────────────────────────────
suite('expression-eval — ** operator', () => {
  const run = (s) => evaluate(parse(tokenize(s)), SCOPE);
  test('** tokenizes as one op', () => {
    const t = tokenize('2**3');
    assertEqual(t.map(x => x.type).join(','), 'num,op,num');
    assertEqual(t[1].value, '**');
  });
  test('2**3 = 8', () => assertEqual(run('2**3'), 8));
  test('** right-associative: 2**3**2 = 512', () => assertEqual(run('2**3**2'), 512));
  test('** binds tighter than *: 2*3**2 = 18', () => assertEqual(run('2*3**2'), 18));
  test('unary tighter than **: -2**2 = 4', () => assertEqual(run('-2**2'), 4));
  test('** mixes with ^: 2^3**2 = 512', () => assertEqual(run('2^3**2'), 512));
});

// ── dotted identifiers (Math.sin etc.) ────────────────────────────
suite('expression-eval — dotted identifiers', () => {
  test('Math.sin tokenizes as one ident', () => {
    const t = tokenize('Math.sin');
    assertEqual(t.length, 1);
    assertEqual(t[0].type, 'ident');
    assertEqual(t[0].value, 'Math.sin');
  });
  test('dotted call resolves against injected scope', () => {
    const scope = { functions: { 'Math.sqrt': Math.sqrt }, variables: { x: 16 } };
    assertEqual(evalExpr('Math.sqrt(x)', scope), 4);
  });
  test('dotted constant resolves against injected scope', () => {
    const scope = { constants: { 'Math.PI': Math.PI } };
    assertAlmostEqual(evalExpr('Math.PI', scope), Math.PI, 1e-12);
  });
  test('decimals still tokenize as numbers', () => assertEqual(tokenize('3.14')[0].value, 3.14));
});

// ── structured ExprError codes ────────────────────────────────────
suite('expression-eval — ExprError codes', () => {
  const run = (s, scope = SCOPE) => evaluate(parse(tokenize(s)), scope);
  const caught = (fn) => { try { fn(); return null; } catch (e) { return e; } };

  test('ExprError is an Error subclass', () => {
    const e = caught(() => run('zzz'));
    assertEqual(e instanceof Error, true);
    assertEqual(e.name, 'ExprError');
  });
  test('UNKNOWN_IDENTIFIER carries token', () => {
    const e = caught(() => run('zzz'));
    assertEqual(e.code, 'UNKNOWN_IDENTIFIER');
    assertEqual(e.token, 'zzz');
  });
  test('UNKNOWN_FUNCTION carries token', () => {
    const e = caught(() => run('foo(1)'));
    assertEqual(e.code, 'UNKNOWN_FUNCTION');
    assertEqual(e.token, 'foo');
  });
  test('UNEXPECTED_CHAR carries the char', () => {
    const e = caught(() => tokenize('1@2'));
    assertEqual(e.code, 'UNEXPECTED_CHAR');
    assertEqual(e.token, '@');
  });
  test('EMPTY on empty input', () => {
    const e = caught(() => parse(tokenize('')));
    assertEqual(e.code, 'EMPTY');
  });
  test('SYNTAX on unbalanced paren', () => {
    const e = caught(() => run('(1+2'));
    assertEqual(e.code, 'SYNTAX');
  });
  test('TRAILING on extra tokens', () => {
    const e = caught(() => run('1 2'));
    assertEqual(e.code, 'TRAILING');
  });
  test('messages unchanged — regex matchers still work', () =>
    assertThrows(() => run('zzz'), /Unknown identifier/));
});
