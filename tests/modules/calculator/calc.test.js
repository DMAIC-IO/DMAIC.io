/**
 * Tests for modules/calculator/domain/calc.js — der Ausdrucksrechner (die
 * Fälle der alten Charakterisierungssuite), der Zahlanfang `leadingNumber`
 * gegen `parseFloat`, die Kennwerte beider Bereiche (Zahlen und Gründe, die
 * Fälle der alten Model-Suite) und die Wertemengen gegen das Schema.
 */
import { suite, test, assertEqual, assertAlmostEqual, assertThrows, assertDeepEqual, assertTrue } from '../../test-utils.js';
import {
  evalExpression, leadingNumber, statOf, capabilityOf,
  MODES, ANGLE_MODES, FN_TOKENS, STAT_TYPES, SS_TYPES, STAT_REASONS, SS_REASONS,
} from '../../../js/modules/calculator/domain/calc.js';
import { State } from '../../../js/modules/calculator/domain/model.js';

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

// ── Zahlanfang ────────────────────────────────────────────────────
suite('calc: leadingNumber wie parseFloat', () => {
  const CASES = ['', '12', '12.5', '-3', '+4', '.5', '-.5', '5.', '1e5', '1e-7', '1.5e+21', '2e', '2e+',
    '12+3', '3×4', '-', '.', '+', 'π', 'e', 'e2', '(3)', '0.0000001', '007', '1.2.3', '--3', '4^2', '1e5e3'];
  for (const s of CASES) {
    test(`"${s}"`, () => {
      const p = parseFloat(s);
      assertEqual(leadingNumber(s), Number.isNaN(p) ? null : p);
    });
  }
});

// ── Statistik ─────────────────────────────────────────────────────
suite('calc: statOf', () => {
  const D = [10, 20, 30, 40, 50];
  const v = (type, d = D) => statOf(d, type).value;
  test('mean', () => assertAlmostEqual(v('mean'), 30, 1e-9));
  test('median', () => assertAlmostEqual(v('median'), 30, 1e-9));
  test('range', () => assertAlmostEqual(v('range'), 40, 1e-9));
  test('stdS', () => assertAlmostEqual(v('stdS'), 15.811388, 1e-5));
  test('stdP', () => assertAlmostEqual(v('stdP'), 14.142136, 1e-5));
  test('varS', () => assertAlmostEqual(v('varS'), 250, 1e-6));
  test('varP', () => assertAlmostEqual(v('varP'), 200, 1e-6));
  test('sum', () => assertAlmostEqual(v('sum'), 150, 1e-9));
  test('min/max/count', () => { assertEqual(v('min'), 10); assertEqual(v('max'), 50); assertEqual(v('count'), 5); });
  test('q1/q3/iqr', () => { assertAlmostEqual(v('q1'), 20, 1e-9); assertAlmostEqual(v('q3'), 40, 1e-9); assertAlmostEqual(v('iqr'), 20, 1e-9); });
  test('skew', () => assertAlmostEqual(v('skew'), 0, 1e-6));
  test('leerer Datensatz: noData bei jedem Kennwert', () => {
    for (const t of STAT_TYPES) assertDeepEqual(statOf([], t), { value: null, modes: null, reason: 'noData' }, t);
  });
  test('stdS und varS brauchen 2, skew 3 Werte', () => {
    assertEqual(statOf([1], 'stdS').reason, 'needN2');
    assertEqual(statOf([1], 'varS').reason, 'needN2');
    assertEqual(statOf([1, 2], 'skew').reason, 'needN3');
  });
  test('Modalwerte als Zahlen in der Reihenfolge der Altform', () => {
    assertDeepEqual(statOf([1, 1, 2, 2], 'mode'), { value: null, modes: [1, 2], reason: null });
    assertDeepEqual(statOf([2, 2, 1, 1, 3], 'mode').modes, [1, 2]);
    assertDeepEqual(statOf([2.5, 2.5, 1.5, 1.5], 'mode').modes, [2.5, 1.5]);
    assertEqual(statOf([1, 2, 3], 'mode').reason, 'noMode');
    assertEqual(statOf([7], 'mode').reason, 'noMode');
  });
  test('Schiefe bei s = 0 ist keine Zahl (Befund, bleibt)', () => {
    assertTrue(!Number.isFinite(v('skew', [5, 5, 5])));
  });
});

// ── Prozess ───────────────────────────────────────────────────────
suite('calc: capabilityOf', () => {
  const D = [8, 10, 12];
  const v = (type, d = D, lsl = 4, usl = 16) => capabilityOf(d, lsl, usl, type).value;
  test('mean/std', () => { assertAlmostEqual(v('mean'), 10, 1e-9); assertAlmostEqual(v('std'), 2, 1e-9); });
  test('cp/cpk (σ innerhalb)', () => { assertAlmostEqual(v('cp'), 1.128, 1e-9); assertAlmostEqual(v('cpk'), 1.128, 1e-9); });
  test('pp/ppk', () => { assertAlmostEqual(v('pp'), 1, 1e-9); assertAlmostEqual(v('ppk'), 1, 1e-9); });
  test('sigma', () => assertAlmostEqual(v('sigma'), 3.188777, 1e-5));
  test('sigma, eine Seite vernachlässigbar: gleich 3·Cpk', () => {
    const d = [10, 10.4, 9.8, 10.2, 10.1];
    assertAlmostEqual(v('sigma', d, 0, 11), 3 * v('cpk', d, 0, 11), 1e-6);
  });
  test('cp hängt von der Eingabereihenfolge ab', () => {
    assertTrue(Math.abs(v('cp', [1, 3, 2, 4]) - v('cp', [1, 2, 3, 4])) > 1e-6);
  });
  test('dpmo/ucl/lcl/zscore', () => {
    assertAlmostEqual(v('dpmo'), 2700, 50);
    assertAlmostEqual(v('ucl'), 16, 1e-6);
    assertAlmostEqual(v('lcl'), 4, 1e-6);
    assertAlmostEqual(v('zscore'), 2.7821583, 1e-4);
  });
  test('yield als Prozent, ohne Wert', () => {
    const r = capabilityOf(D, 4, 16, 'yield');
    assertEqual(r.value, null);
    assertEqual(r.percent.toFixed(4), '99.7300');
  });
  test('Gründe wie die Altform', () => {
    assertEqual(capabilityOf([], null, null, 'cp').reason, 'needDataAndLimits');
    assertEqual(capabilityOf([1, 2], 4, null, 'cp').reason, 'needDataAndLimits');
    assertEqual(capabilityOf([10], 4, 16, 'std').reason, 'needN2');
    assertEqual(capabilityOf([], 4, 16, 'mean').reason, 'needData');
    assertEqual(capabilityOf([10], null, null, 'ucl').reason, 'needN2');
  });
  test('Cp bei σ = 0 ist unendlich', () => {
    assertEqual(v('cp', [5, 5, 5]), Infinity);
  });
});

// ── Wertemengen gegen das Schema ──────────────────────────────────
suite('calc: Wertemengen gleich dem Schema', () => {
  const C = State.schema.commands;
  test('Bereiche, Winkel, Funktionen, Kennwerte', () => {
    assertDeepEqual([...State.schema.fields.mode.values], [...MODES]);
    assertDeepEqual([...State.schema.fields.angleMode.values], [...ANGLE_MODES]);
    assertDeepEqual([...C.switchMode.params.m.values], [...MODES]);
    assertDeepEqual([...C.inputFn.params.fn.values], [...FN_TOKENS]);
    assertDeepEqual([...C.calcStat.params.type.values], [...STAT_TYPES]);
    assertDeepEqual([...C.calcSS.params.type.values], [...SS_TYPES]);
  });
  test('Gründe der Rückgaben (das Kommando ergänzt notFinite)', () => {
    assertDeepEqual([...C.calcStat.returns.shape.reason.values], [...STAT_REASONS, 'notFinite']);
    assertDeepEqual([...C.calcSS.returns.shape.reason.values], [...SS_REASONS, 'notFinite']);
  });
});
