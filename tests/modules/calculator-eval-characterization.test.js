/**
 * CHARACTERIZATION suite — pins the CURRENT behavior of evalExpression()
 * (calculator-model.js) before the new Function → expression-engine swap (Plan 6).
 *
 * Run GREEN against the existing new Function implementation FIRST. After the
 * 6c swap it must stay green EXCEPT the explicitly-marked divergence cases
 * (D1/D2…), which flip from throw → correct value per the recorded decisions.
 */

import { suite, test, assertEqual, assertAlmostEqual, assertThrows } from '../test-utils.js';
import { evalExpression } from '../../js/modules/calculator/calculator-model.js';

const ev = (s, mode = 'DEG') => evalExpression(s, mode);

// ── Binary operators ──────────────────────────────────────────────
suite('char: evalExpression — binary operators', () => {
  test('addition', () => assertEqual(ev('12+34'), 46));
  test('subtraction', () => assertEqual(ev('50-8'), 42));
  test('multiplication *', () => assertEqual(ev('6*7'), 42));
  test('division /', () => assertEqual(ev('84/2'), 42));
  test('× alias → *', () => assertEqual(ev('6×7'), 42));
  test('÷ alias → /', () => assertEqual(ev('8÷2'), 4));
  test('^ → power', () => assertEqual(ev('2^3'), 8));
  test('chained mixed', () => assertEqual(ev('1+2-3+4'), 4));
  test('division by zero → Infinity (NOT error)', () => assertEqual(ev('1/0'), Infinity));
});

// ── Unary minus ───────────────────────────────────────────────────
suite('char: evalExpression — unary minus', () => {
  test('leading minus', () => assertEqual(ev('0-5'), -5));
  test('minus before paren', () => assertEqual(ev('0-(2+3)'), -5));
  test('decimal with sign', () => assertEqual(ev('0-1.5*2'), -3));
});

// ── Precedence & associativity ────────────────────────────────────
suite('char: evalExpression — precedence', () => {
  test('mul before add', () => assertEqual(ev('2+3*4'), 14));
  test('div before sub', () => assertEqual(ev('20-8/2'), 16));
  test('parens override', () => assertEqual(ev('(2+3)*4'), 20));
  test('^ binds tighter than *', () => assertEqual(ev('2*3^2'), 18));
  test('^ right-associative: 2^3^2 = 512 (not 64)', () => assertEqual(ev('2^3^2'), 512));
});

// ── Functions ─────────────────────────────────────────────────────
suite('char: evalExpression — functions (DEG)', () => {
  test('sin(90)=1', () => assertAlmostEqual(ev('sin(90)'), 1, 1e-9));
  test('cos(0)=1', () => assertAlmostEqual(ev('cos(0)'), 1, 1e-9));
  test('tan(45)=1', () => assertAlmostEqual(ev('tan(45)'), 1, 1e-9));
  test('asin(1)=90', () => assertAlmostEqual(ev('asin(1)'), 90, 1e-9));
  test('acos(1)=0', () => assertAlmostEqual(ev('acos(1)'), 0, 1e-9));
  test('atan(1)=45', () => assertAlmostEqual(ev('atan(1)'), 45, 1e-9));
  test('log(100)=2', () => assertAlmostEqual(ev('log(100)'), 2, 1e-9));
  test('ln(e)=1', () => assertAlmostEqual(ev('ln(e)'), 1, 1e-9));
  test('sqrt(16)=4', () => assertAlmostEqual(ev('sqrt(16)'), 4, 1e-9));
  test('cbrt(27)=3', () => assertAlmostEqual(ev('cbrt(27)'), 3, 1e-9));
  test('exp(1)=E', () => assertAlmostEqual(ev('exp(1)'), Math.E, 1e-9));
  test('fact(5)=120', () => assertEqual(ev('fact(5)'), 120));
});

// ── RAD mode ──────────────────────────────────────────────────────
suite('char: evalExpression — functions (RAD)', () => {
  test('sin(π/2)=1', () => assertAlmostEqual(ev('sin(π/2)', 'RAD'), 1, 1e-9));
  test('cos(π)=-1', () => assertAlmostEqual(ev('cos(π)', 'RAD'), -1, 1e-9));
  test('tan(0)=0', () => assertAlmostEqual(ev('tan(0)', 'RAD'), 0, 1e-9));
  test('asin(1)=π/2', () => assertAlmostEqual(ev('asin(1)', 'RAD'), Math.PI / 2, 1e-9));
  test('atan(1)=π/4', () => assertAlmostEqual(ev('atan(1)', 'RAD'), Math.PI / 4, 1e-9));
});

// ── Constants ─────────────────────────────────────────────────────
suite('char: evalExpression — constants', () => {
  test('π alone', () => assertAlmostEqual(ev('π'), Math.PI, 1e-12));
  test('e alone', () => assertAlmostEqual(ev('e'), Math.E, 1e-12));
  test('π+e', () => assertAlmostEqual(ev('(π+e)'), Math.PI + Math.E, 1e-9));
  test('2*π', () => assertAlmostEqual(ev('2*π'), 2 * Math.PI, 1e-9));
});

// ── Whitespace, nesting, chaining ─────────────────────────────────
suite('char: evalExpression — whitespace & nesting', () => {
  test('whitespace ignored', () => assertEqual(ev('  2  +  3  '), 5));
  test('nested parens', () => assertEqual(ev('((1+2)*(3+4))'), 21));
  test('deep arithmetic', () => assertEqual(ev('((2+3)*4-6)/2'), 7));
});

// ── factorial edge cases ──────────────────────────────────────────
suite('char: evalExpression — factorial edges', () => {
  test('fact(0)=1', () => assertEqual(ev('fact(0)'), 1));
  test('fact(1)=1', () => assertEqual(ev('fact(1)'), 1));
  test('fact(171) → Infinity', () => assertEqual(ev('fact(171)'), Infinity));
  test('fact(-1) → throws error (NaN result → Error("error"))', () =>
    assertThrows(() => ev('fact(0-1)'), /error/));
});

// ── Error contracts (EXACT strings pinned) ────────────────────────
suite('char: evalExpression — error contracts', () => {
  test('disallowed char → Error("invalid")', () =>
    assertThrows(() => ev('2+@'), /^invalid$/));
  // 6c: the engine rejects unknown functions (`Unknown function: foo`), caught and
  // re-thrown as Error('invalid') — the old regex-gate ReferenceError is gone. This
  // is the recorded D-foo divergence: the swap TIGHTENS the gate (adopt-correct).
  test('unknown function → Error("invalid")', () =>
    assertThrows(() => ev('foo(2)'), /^invalid$/));
  test('NaN-producing valid expr → Error("error")', () =>
    assertThrows(() => ev('sqrt(0-1)'), /^error$/));
  test('syntactically broken parens → throws (some Error)', () =>
    assertThrows(() => ev('(2+3'), /.+/));
});

// ── Nested / double-paren cases (D1/D2) — pin CURRENT behavior ────
// SURPRISE: the plan predicted these THROW today (regex quirk). Reality is the
// opposite — the global function-rewrite regexes already produce the CORRECT
// value, so there is no divergence to flip after 6c. Pinned to the real numbers.
suite('char: evalExpression — nested / double parens', () => {
  // sin(cos(0)) in DEG: cos(0°)=1, then sin(1°) ≈ 0.0174524…
  test('D1: sin(cos(0)) → sin(1°) (no throw)', () =>
    assertAlmostEqual(ev('sin(cos(0))'), Math.sin(Math.PI / 180), 1e-12));
  // sin((45)) in DEG: sin(45°) = √2/2 ≈ 0.7071…
  test('D2: sin((45)) → sin(45°) (no throw)', () =>
    assertAlmostEqual(ev('sin((45))'), Math.SQRT1_2, 1e-12));
});
