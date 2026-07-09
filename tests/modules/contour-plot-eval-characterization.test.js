/**
 * CHARACTERIZATION suite — pins the contour _evalModel contract: the custom
 * branch evaluates via contour-plot-formula.evalFormula (whitelisted Math.* +
 * bare names, bad formula → 0); the polynomial branch is the b[] expansion.
 */

import { suite, test, assertEqual, assertAlmostEqual } from '../test-utils.js';
import { evalFormula } from '../../js/modules/contour-plot/contour-plot-formula.js';

function evalPoly(b, x, y) {
  return b[0] + b[1] * x + b[2] * y + b[3] * x * x + b[4] * y * y + b[5] * x * y;
}

suite('char: contour _evalModel — custom formula', () => {
  test('simple x+y', () => assertEqual(evalFormula('x+y', 2, 3), 5));
  test('product x*y', () => assertEqual(evalFormula('x*y', 4, 5), 20));
  test('default model formula', () => {
    const f = '50 + 8*x + 5*y - 3*x*x - 2*y*y + 1.5*x*y';
    assertAlmostEqual(evalFormula(f, 1, 1), 50 + 8 + 5 - 3 - 2 + 1.5, 1e-9);
  });
  test('Math.* in scope: Math.sin(π/2) ≈ 1', () =>
    assertAlmostEqual(evalFormula('Math.sin(x)', Math.PI / 2, 0), 1, 1e-9));
  test('empty formula → 0', () => assertEqual(evalFormula('', 1, 2), 0));
  test('syntax-error formula → 0', () => assertEqual(evalFormula('x +* y', 1, 2), 0));
  test('unknown identifier → 0', () => assertEqual(evalFormula('zzz', 1, 2), 0));
});

suite('char: contour _evalModel — polynomial branch (unchanged)', () => {
  const b = [50, 8, 5, -3, -2, 1.5];
  test('center', () => assertAlmostEqual(evalPoly(b, 0, 0), 50, 1e-9));
  test('at (1,1)', () => assertAlmostEqual(evalPoly(b, 1, 1), 59.5, 1e-9));
  test('at (2,-1)', () => assertAlmostEqual(evalPoly(b, 2, -1), 50 + 16 - 5 - 12 - 2 - 3, 1e-9));
});
