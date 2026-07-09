/**
 * D.Mike — Contour custom-formula scope + evaluation (contour-plot-formula.js)
 *
 * Builds the whitelisted scope for user-authored contour formulas z = f(x, y)
 * and exposes pure eval/validate helpers over the shared expression engine.
 * Bare function names mirror the calculator's vocabulary (trig in RADIANS,
 * `log` = base-10, `ln` = natural); the `Math.` namespace is also accepted with
 * faithful JS semantics (`Math.log` = natural). No DOM, no i18n, no Alpine.
 */

import { evalExpr } from '../../engines/expression-eval.js';
import { factorial } from '../../engines/factorial.js';

// Bare-name vocabulary — mirrors the calculator (trig in RADIANS).
const BARE_FNS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  exp: Math.exp, sqrt: Math.sqrt, cbrt: Math.cbrt, pow: Math.pow,
  log: Math.log10,   // calculator convention: base-10
  ln: Math.log,      // natural
  log2: Math.log2, log10: Math.log10,
  abs: Math.abs, sign: Math.sign,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, trunc: Math.trunc,
  min: Math.min, max: Math.max, hypot: Math.hypot,
  fact: factorial,
};

// Faithful Math.* namespace — JS semantics (Math.log is natural).
const MATH_FN_NAMES = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'sinh', 'cosh', 'tanh', 'exp', 'sqrt', 'cbrt', 'pow', 'log', 'log2', 'log10',
  'abs', 'sign', 'floor', 'ceil', 'round', 'trunc', 'min', 'max', 'hypot'];
const MATH_FNS = Object.fromEntries(MATH_FN_NAMES.map(n => [`Math.${  n}`, Math[n]]));

const BARE_CONSTS = {
  PI: Math.PI, pi: Math.PI, E: Math.E, e: Math.E,
  SQRT2: Math.SQRT2, SQRT1_2: Math.SQRT1_2,
  LN2: Math.LN2, LN10: Math.LN10, LOG2E: Math.LOG2E, LOG10E: Math.LOG10E,
};
const MATH_CONST_NAMES = ['PI', 'E', 'SQRT2', 'SQRT1_2', 'LN2', 'LN10', 'LOG2E', 'LOG10E'];
const MATH_CONSTS = Object.fromEntries(MATH_CONST_NAMES.map(n => [`Math.${  n}`, Math[n]]));

const FUNCTIONS = { ...BARE_FNS, ...MATH_FNS };
const CONSTANTS = { ...BARE_CONSTS, ...MATH_CONSTS };

/**
 * Evaluate a custom formula at a point.
 * @param {string} formula
 * @param {number} x
 * @param {number} y
 * @returns {number} a finite number, or 0 on any error / NaN result.
 */
export function evalFormula(formula, x, y) {
  try {
    const v = evalExpr(formula, { functions: FUNCTIONS, constants: CONSTANTS, variables: { x, y } });
    return (typeof v === 'number' && !isNaN(v)) ? v : 0;
  } catch {
    return 0;
  }
}

/**
 * Validate a formula once (probe point x=1, y=1).
 * @param {string} formula
 * @returns {{ok:true} | {ok:false, code:string, token?:string}}
 */
export function validateFormula(formula) {
  try {
    evalExpr(formula, { functions: FUNCTIONS, constants: CONSTANTS, variables: { x: 1, y: 1 } });
    return { ok: true };
  } catch (e) {
    return { ok: false, code: e.code || 'SYNTAX', token: e.token };
  }
}
