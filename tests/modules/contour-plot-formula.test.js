/**
 * Unit tests for contour-plot-formula.js — the whitelisted custom-formula scope
 * (evalFormula) and validation (validateFormula) over the expression engine.
 */
import { suite, test, assertEqual, assertAlmostEqual } from '../test-utils.js';
import { evalFormula, validateFormula } from '../../js/modules/contour-plot/contour-plot-formula.js';

suite('contour-plot-formula — evalFormula', () => {
  test('arithmetic x+y', () => assertEqual(evalFormula('x+y', 2, 3), 5));
  test('** power: x**2 + y**2', () => assertEqual(evalFormula('x**2 + y**2', 3, 4), 25));
  test('^ power: x^2 + y^2', () => assertEqual(evalFormula('x^2 + y^2', 3, 4), 25));
  test('default polynomial', () =>
    assertAlmostEqual(evalFormula('50 + 8*x + 5*y - 3*x*x - 2*y*y + 1.5*x*y', 1, 1), 59.5, 1e-9));
  test('bare sin (radians)', () => assertAlmostEqual(evalFormula('sin(x)', Math.PI / 2, 0), 1, 1e-9));
  test('bare log = base-10', () => assertAlmostEqual(evalFormula('log(x)', 100, 0), 2, 1e-9));
  test('bare ln = natural', () => assertAlmostEqual(evalFormula('ln(x)', Math.E, 0), 1, 1e-9));
  test('bare fact', () => assertEqual(evalFormula('fact(x)', 5, 0), 120));
  test('Math.exp', () => assertAlmostEqual(evalFormula('Math.exp(x)', 0, 0), 1, 1e-9));
  test('Math.log = natural (faithful JS)', () =>
    assertAlmostEqual(evalFormula('Math.log(x)', Math.E, 0), 1, 1e-9));
  test('Math.log10 = base-10', () => assertAlmostEqual(evalFormula('Math.log10(x)', 100, 0), 2, 1e-9));
  test('Math.min multi-arg', () => assertEqual(evalFormula('Math.min(x, y)', 3, 7), 3));
  test('constant Math.PI', () => assertAlmostEqual(evalFormula('Math.PI', 0, 0), Math.PI, 1e-12));
  test('bare constant pi', () => assertAlmostEqual(evalFormula('pi', 0, 0), Math.PI, 1e-12));
  test('gaussian Math.exp(-x*x-y*y)', () =>
    assertAlmostEqual(evalFormula('Math.exp(-x*x - y*y)', 0, 0), 1, 1e-12));
  test('unknown Math.foo → 0 (safety net)', () => assertEqual(evalFormula('Math.foo(x)', 1, 1), 0));
  test('empty → 0', () => assertEqual(evalFormula('', 1, 2), 0));
  test('syntax error → 0', () => assertEqual(evalFormula('x +* y', 1, 2), 0));
  test('non-finite (1/0) → Infinity passes through as number', () =>
    assertEqual(evalFormula('1/0', 1, 1), Infinity));
});

suite('contour-plot-formula — validateFormula', () => {
  test('valid arithmetic', () => assertEqual(validateFormula('x*x + y*y').ok, true));
  test('valid Math.* call', () => assertEqual(validateFormula('Math.exp(-x*x - y*y)').ok, true));
  test('valid **', () => assertEqual(validateFormula('x**2').ok, true));
  test('unknown Math.foo → UNKNOWN_FUNCTION + token', () => {
    const r = validateFormula('Math.foo(x)');
    assertEqual(r.ok, false);
    assertEqual(r.code, 'UNKNOWN_FUNCTION');
    assertEqual(r.token, 'Math.foo');
  });
  test('unknown bare foo → UNKNOWN_FUNCTION', () => {
    const r = validateFormula('foo(x)');
    assertEqual(r.code, 'UNKNOWN_FUNCTION');
    assertEqual(r.token, 'foo');
  });
  test('stray variable z → UNKNOWN_IDENTIFIER + token', () => {
    const r = validateFormula('x + z');
    assertEqual(r.code, 'UNKNOWN_IDENTIFIER');
    assertEqual(r.token, 'z');
  });
  test('empty → EMPTY', () => assertEqual(validateFormula('').code, 'EMPTY'));
  test('syntax error → SYNTAX', () => assertEqual(validateFormula('x +* y').code, 'SYNTAX'));
  test('invalid char → UNEXPECTED_CHAR + token', () => {
    const r = validateFormula('x @ y');
    assertEqual(r.code, 'UNEXPECTED_CHAR');
    assertEqual(r.token, '@');
  });
});
