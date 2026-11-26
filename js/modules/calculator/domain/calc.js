/**
 * D.Mike — Taschenrechner: Rechnungen.
 *
 * Rein, ohne DOM und ohne Texte: der Ausdrucksrechner, die Kennwerte des
 * Statistik- und des Prozessbereichs (Zahlen und Grund-Schlüssel) und der
 * Zahlanfang der Eingabezeile. Symbole, Beschriftungen und Zahlformat macht
 * der Presenter (`viewmodel/present.js`).
 */
import { normalCDF, normalQuantile } from '../../../engines/math-utils.js';
import {
  mean, std as stdSample, median, skewness,
} from '../../../engines/distribution-fit-engine.js';
import { evalExpr } from '../../../engines/expression-eval.js';
import { sigmaWithinMovingRange, normalUpperTail, zBench } from '../../../engines/process-capability-engine.js';
import { factorial } from '../../../engines/factorial.js';

/** Die Rechenbereiche: wissenschaftlich, Statistik, Prozessfähigkeit. */
export const MODES = Object.freeze(['sci', 'stats', 'sixsigma']);

/** Die Winkeleinheiten der Trigonometrie. */
export const ANGLE_MODES = Object.freeze(['DEG', 'RAD']);

/** Die Funktionstasten, so wie das Tastenfeld sie schreibt: mit öffnender Klammer. */
export const FN_TOKENS = Object.freeze([
  'sin(', 'cos(', 'tan(', 'asin(', 'acos(', 'atan(',
  'log(', 'ln(', 'sqrt(', 'cbrt(', 'exp(', 'fact(',
]);

/** Die Kennwerte des Statistikbereichs (Tasten `data-stat`). */
export const STAT_TYPES = Object.freeze([
  'mean', 'median', 'mode', 'range', 'stdS', 'stdP', 'varS', 'varP',
  'sum', 'min', 'max', 'count', 'q1', 'q3', 'iqr', 'skew',
]);

/** Die Kennwerte des Prozessbereichs (Tasten `data-ss`). */
export const SS_TYPES = Object.freeze([
  'cp', 'cpk', 'pp', 'ppk', 'sigma', 'dpmo', 'yield', 'zscore',
  'mean', 'std', 'ucl', 'lcl',
]);

/**
 * Die Zeichen der Eingabezeile. Mehr als ein Zeichen ist erlaubt (eine ganze
 * Zahl wie '42', '-3.5', '1e-7').
 */
export const INPUT_RE = /^[0-9.+\-×÷^()πe]+$/;

/** Gründe, aus denen ein Statistik-Kennwert nicht rechenbar ist. */
export const STAT_REASONS = Object.freeze(['noData', 'noMode', 'needN2', 'needN3']);

/** Gründe, aus denen ein Prozess-Kennwert nicht rechenbar ist. */
export const SS_REASONS = Object.freeze(['needData', 'needN2', 'needDataAndLimits']);

/** Standardabweichung der Grundgesamtheit. @param {number[]} d @returns {number} */
function stdPop(d) {
  const m = mean(d);
  return Math.sqrt(d.reduce((a, v) => a + (v - m) ** 2, 0) / d.length);
}

/** Linear interpoliertes Quantil. @param {number[]} d @param {number} q @returns {number} */
function quantile(d, q) {
  const s = [...d].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return s[base + 1] !== undefined ? s[base] + rest * (s[base + 1] - s[base]) : s[base];
}

/**
 * Die häufigsten Werte, in der Reihenfolge der Schlüssel eines Objekts (ganze
 * Zahlen aufsteigend vorn, sonst Eingabereihenfolge); `null`, wenn jeder Wert
 * nur einmal vorkommt.
 * @param {number[]} d @returns {number[]|null}
 */
function modesOf(d) {
  /** @type {Record<string, number>} */
  const freq = {};
  d.forEach((v) => { freq[v] = (freq[v] || 0) + 1; });
  const maxF = Math.max(...Object.values(freq));
  const modes = Object.keys(freq).filter((k) => freq[k] === maxF);
  return modes.length === d.length ? null : modes.map(Number);
}

/**
 * Einen Ausdruck der Eingabezeile rechnen.
 * @param {string} expr Ausdruck mit den Tastenzeichen (× ÷ π)
 * @param {string} angleMode 'DEG' oder 'RAD'
 * @returns {number} auch ±Infinity
 * @throws {Error} 'invalid' bei falscher Schreibweise, 'error' bei einem Ergebnis, das keine Zahl ist
 */
export function evalExpression(expr, angleMode) {
  const toRad = angleMode === 'DEG' ? Math.PI / 180 : 1;
  const fromRad = angleMode === 'DEG' ? 180 / Math.PI : 1;

  const scope = {
    constants: { PI: Math.PI, e: Math.E },
    functions: {
      sin: (x) => Math.sin(toRad * x),
      cos: (x) => Math.cos(toRad * x),
      tan: (x) => Math.tan(toRad * x),
      asin: (x) => fromRad * Math.asin(x),
      acos: (x) => fromRad * Math.acos(x),
      atan: (x) => fromRad * Math.atan(x),
      log: (x) => Math.log10(x),
      ln: (x) => Math.log(x),
      sqrt: (x) => Math.sqrt(x),
      cbrt: (x) => Math.cbrt(x),
      exp: (x) => Math.exp(x),
      fact: (x) => factorial(x),
    },
    variables: {},
  };

  // π → PI: die Bezeichner der Engine sind nur ASCII.
  const normalized = expr
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/π/g, 'PI');

  let result;
  try {
    result = evalExpr(normalized, scope);
  } catch {
    throw new Error('invalid');
  }
  if (typeof result !== 'number' || isNaN(result)) throw new Error('error');
  return result;
}

/** Zahlanfang wie `parseFloat` (Vorzeichen, Ziffern, Punkt, Exponent). */
const LEADING_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;

/**
 * Die Zahl, mit der die Eingabezeile beginnt — wie `parseFloat` auf den
 * Zeichen des Tastenfelds; `null`, wenn sie mit keiner Zahl beginnt.
 * @param {string} expr
 * @returns {number|null}
 */
export function leadingNumber(expr) {
  const m = LEADING_NUMBER.exec(expr);
  return m ? Number(m[0]) : null;
}

/**
 * Ergebnis eines Statistik-Kennwerts: genau einer von `value`, `modes`,
 * `reason` ist nicht `null`.
 * @typedef {{ value: number|null, modes: number[]|null, reason: string|null }} StatOutcome
 */

/**
 * Ein Kennwert über den Statistikdatensatz.
 * @param {number[]} d @param {string} type ein Wert aus `STAT_TYPES`
 * @returns {StatOutcome}
 */
export function statOf(d, type) {
  const val = (v) => ({ value: v, modes: null, reason: null });
  const no = (reason) => ({ value: null, modes: null, reason });
  if (d.length === 0) return no('noData');
  switch (type) {
    case 'mean': return val(mean(d));
    case 'median': return val(median(d));
    case 'mode': {
      const m = modesOf(d);
      return m === null ? no('noMode') : { value: null, modes: m, reason: null };
    }
    case 'range': return val(Math.max(...d) - Math.min(...d));
    case 'stdS': return d.length < 2 ? no('needN2') : val(stdSample(d));
    case 'stdP': return val(stdPop(d));
    case 'varS': return d.length < 2 ? no('needN2') : val(stdSample(d) ** 2);
    case 'varP': return val(stdPop(d) ** 2);
    case 'sum': return val(d.reduce((a, b) => a + b, 0));
    case 'min': return val(Math.min(...d));
    case 'max': return val(Math.max(...d));
    case 'count': return val(d.length);
    case 'q1': return val(quantile(d, 0.25));
    case 'q3': return val(quantile(d, 0.75));
    case 'iqr': return val(quantile(d, 0.75) - quantile(d, 0.25));
    case 'skew': return d.length < 3 ? no('needN3') : val(skewness(d));
    default: throw new Error(`invalid type ${JSON.stringify(type)}`);
  }
}

/**
 * Ergebnis eines Prozess-Kennwerts: genau einer von `value`, `percent`,
 * `reason` ist nicht `null`.
 * @typedef {{ value: number|null, percent: number|null, reason: string|null }} CapabilityOutcome
 */

/**
 * Ein Kennwert über den Prozessdatensatz und die Spezifikationsgrenzen.
 * @param {number[]} d @param {number|null} lsl @param {number|null} usl
 * @param {string} type ein Wert aus `SS_TYPES`
 * @returns {CapabilityOutcome}
 */
export function capabilityOf(d, lsl, usl, type) {
  const val = (v) => ({ value: v, percent: null, reason: null });
  const no = (reason) => ({ value: null, percent: null, reason });
  const hasLimits = lsl !== null && usl !== null;
  const hasData = d.length >= 2;
  const ready = hasData && hasLimits;
  // Cp/Cpk/Sigma (Z.bench): σ innerhalb = MR̄/d2 in Eingabereihenfolge.
  // Pp/Ppk/DPMO/Yield/Z-Score: Stichproben-Standardabweichung (n − 1).
  switch (type) {
    case 'mean': return d.length ? val(mean(d)) : no('needData');
    case 'std': return hasData ? val(stdSample(d)) : no('needN2');
    case 'ucl': return hasData ? val(mean(d) + 3 * stdSample(d)) : no('needN2');
    case 'lcl': return hasData ? val(mean(d) - 3 * stdSample(d)) : no('needN2');
    default: break;
  }
  if (!SS_TYPES.includes(type)) throw new Error(`invalid type ${JSON.stringify(type)}`);
  if (!ready) return no('needDataAndLimits');
  const lo = /** @type {number} */ (lsl);
  const hi = /** @type {number} */ (usl);
  const m = mean(d);
  switch (type) {
    case 'cp': return val((hi - lo) / (6 * sigmaWithinMovingRange(d)));
    case 'cpk': {
      const s = sigmaWithinMovingRange(d);
      return val(Math.min((hi - m) / (3 * s), (m - lo) / (3 * s)));
    }
    case 'pp': return val((hi - lo) / (6 * stdSample(d)));
    case 'ppk': {
      const s = stdSample(d);
      return val(Math.min((hi - m) / (3 * s), (m - lo) / (3 * s)));
    }
    case 'sigma': {
      const s = sigmaWithinMovingRange(d);
      const p = normalUpperTail((m - lo) / s) + normalUpperTail((hi - m) / s);
      return val(zBench(p));
    }
    case 'dpmo': {
      const s = stdSample(d);
      const pBelow = normalCDF((lo - m) / s);
      const pAbove = 1 - normalCDF((hi - m) / s);
      return val(Math.round((pBelow + pAbove) * 1e6));
    }
    case 'yield': {
      const s = stdSample(d);
      const pOK = normalCDF((hi - m) / s) - normalCDF((lo - m) / s);
      return { value: null, percent: pOK * 100, reason: null };
    }
    default: {
      const s = stdSample(d);
      const pBelow = normalCDF((lo - m) / s);
      const pAbove = 1 - normalCDF((hi - m) / s);
      return val(-normalQuantile(pBelow + pAbove));
    }
  }
}
