/**
 * D.Mike — Scientific Calculator Model (calculator-model.js)
 * State + pure business logic only — no DOM, no i18n, no CSS classes, no view getters.
 *
 * The State holds everything the legacy module persisted (mode, expression,
 * lastResult, memory, angleMode, datasets, spec limits) plus the calculator's
 * editing and computation logic. Display formatting and i18n live in the data-fn.
 */

import { normalCDF, normalQuantile } from '../../engines/math-utils.js';
import {
  mean, std as stdSample, median, skewness,
} from '../../engines/distribution-fit-engine.js';
import { evalExpr } from '../../engines/expression-eval.js';
import { factorial } from '../../engines/factorial.js';
export { factorial };

const MODES = ['sci', 'stats', 'sixsigma'];
const ANGLE_MODES = ['DEG', 'RAD'];

// ═══════════════════════════════════════════════════════════════
// Pure math helpers (exported for unit testing)
// ═══════════════════════════════════════════════════════════════

/** Aliases for validated engine functions */
const normCDF = (z) => normalCDF(z);
const normInv = (p) => normalQuantile(p);

/** Population standard deviation (not in engines) */
function stdPop(d) {
  const m = mean(d);
  return Math.sqrt(d.reduce((a, v) => a + (v - m) ** 2, 0) / d.length);
}

/** Linear-interpolated quantile */
function quantile(d, q) {
  const s = [...d].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return s[base + 1] !== undefined ? s[base] + rest * (s[base + 1] - s[base]) : s[base];
}

/** Mode(s) of a dataset; returns null when every value is unique (no mode). */
function modeCalc(d) {
  const freq = {};
  d.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
  const maxF = Math.max(...Object.values(freq));
  const modes = Object.keys(freq).filter(k => freq[k] === maxF);
  return modes.length === d.length ? null : modes.join(', ');
}

// ═══════════════════════════════════════════════════════════════
// Expression evaluator (exported for unit testing)
// ═══════════════════════════════════════════════════════════════

/**
 * Evaluate a raw display expression.
 * @param {string} expr  Raw display expression
 * @param {string} angleMode  'DEG' or 'RAD'
 * @returns {number}
 * @throws {Error} on invalid syntax or non-numeric result
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

  // Normalize display glyphs the tokenizer does not recognize. π → PI because the
  // engine's identifier rule is ASCII-only; PI is registered as a constant above.
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

// ═══════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════

export class State {
  static VERSION = '1.0';
  static ID = 'calculator';

  constructor() {
    /** @type {'sci'|'stats'|'sixsigma'} */
    this.mode = 'sci';
    /** Raw display expression */
    this.expression = '';
    /** @type {number|null} last evaluated numeric result */
    this.lastResult = null;
    /** Memory register */
    this.memory = 0;
    /** @type {'DEG'|'RAD'} */
    this.angleMode = 'DEG';
    /** @type {number[]} statistics dataset */
    this.dataset = [];
    /** @type {number[]} Six Sigma process dataset */
    this.ssDataset = [];
    /** Lower spec limit (raw input string) */
    this.lsl = '';
    /** Upper spec limit (raw input string) */
    this.usl = '';
  }

  // ── Editing ────────────────────────────────────────────────

  /** Append a text character (digit, operator, constant). */
  inputText(ch) {
    if (this.lastResult !== null && /[0-9.]/.test(ch)) {
      this.expression = '';
      this.lastResult = null;
    }
    if (this.lastResult !== null && /[+\-×÷^]/.test(ch)) {
      this.expression = String(this.lastResult);
      this.lastResult = null;
    }
    this.expression += ch;
  }

  /** Append a function token (sin(, sqrt(, …). */
  inputFn(fn) {
    if (this.lastResult !== null) {
      this.expression = '';
      this.lastResult = null;
    }
    this.expression += fn;
  }

  /** Delete the last character. */
  backspace() {
    this.expression = this.expression.slice(0, -1);
  }

  /** Reset the current expression and last result. */
  clearAll() {
    this.expression = '';
    this.lastResult = null;
  }

  /** Toggle between DEG and RAD. */
  toggleAngle() {
    this.angleMode = this.angleMode === 'DEG' ? 'RAD' : 'DEG';
  }

  /** Store the current value (last result or evaluated expression) to memory. */
  memStore() {
    if (this.lastResult !== null) {
      this.memory = this.lastResult;
    } else {
      try { this.memory = evalExpression(this.expression, this.angleMode); }
      catch { this.memory = 0; }
    }
  }

  /** Switch mode and reset the current expression. */
  switchMode(m) {
    if (!MODES.includes(m)) return;
    this.mode = m;
    this.clearAll();
  }

  // ── Dataset management ─────────────────────────────────────

  /** Parse the current expression and push to the stats dataset.
   *  @returns {number|null} the pushed value, or null if invalid */
  addDataPoint() {
    const v = parseFloat(this.expression);
    if (isNaN(v)) return null;
    this.dataset.push(v);
    this.expression = '';
    return v;
  }

  removeLastData() { this.dataset.pop(); }
  clearData() { this.dataset = []; this.clearAll(); }

  /** Parse the current expression and push to the Six Sigma dataset.
   *  @returns {number|null} */
  addSSDataPoint() {
    const v = parseFloat(this.expression);
    if (isNaN(v)) return null;
    this.ssDataset.push(v);
    this.expression = '';
    return v;
  }

  removeLastSSData() { this.ssDataset.pop(); }
  clearSSData() { this.ssDataset = []; this.clearAll(); }

  // ── Statistics ─────────────────────────────────────────────

  /**
   * Compute a descriptive statistic over the stats dataset.
   * @param {string} type
   * @returns {{value?:number, text?:string, error?:string, symbol?:string, labelKey?:string}}
   *   `value` — numeric result, `text` — non-numeric display string,
   *   `error` — i18n key for an error message,
   *   `symbol` — math symbol label, `labelKey` — i18n key for the label.
   */
  calcStat(type) {
    const d = this.dataset;
    if (d.length === 0) return { error: 'noData' };

    switch (type) {
      case 'mean':   return { value: mean(d), symbol: 'x̄' };
      case 'median': return { value: median(d), symbol: 'x̃' };
      case 'mode': {
        const m = modeCalc(d);
        if (m === null) return { error: 'noMode', soft: true, labelKey: 'statMode' };
        return { text: m, labelKey: 'statMode' };
      }
      case 'range':  return { value: Math.max(...d) - Math.min(...d), labelKey: 'statRange' };
      case 'stdS':
        if (d.length < 2) return { error: 'needN2', soft: true, symbol: 's' };
        return { value: stdSample(d), symbol: 's' };
      case 'stdP':   return { value: stdPop(d), symbol: 'σ' };
      case 'varS':
        if (d.length < 2) return { error: 'needN2', soft: true, symbol: 's²' };
        return { value: stdSample(d) ** 2, symbol: 's²' };
      case 'varP':   return { value: stdPop(d) ** 2, symbol: 'σ²' };
      case 'sum':    return { value: d.reduce((a, b) => a + b, 0), symbol: 'Σ' };
      case 'min':    return { value: Math.min(...d), symbol: 'Min' };
      case 'max':    return { value: Math.max(...d), symbol: 'Max' };
      case 'count':  return { value: d.length, symbol: 'n' };
      case 'q1':     return { value: quantile(d, 0.25), symbol: 'Q1' };
      case 'q3':     return { value: quantile(d, 0.75), symbol: 'Q3' };
      case 'iqr':    return { value: quantile(d, 0.75) - quantile(d, 0.25), symbol: 'IQR' };
      case 'skew':
        if (d.length < 3) return { error: 'needN3', soft: true, labelKey: 'statSkewness' };
        return { value: skewness(d), labelKey: 'statSkewness' };
      default: return { error: 'error' };
    }
  }

  // ── Six Sigma ──────────────────────────────────────────────

  /**
   * Compute a Six Sigma metric over the process dataset + spec limits.
   * @param {string} type
   * @returns {{value?:number, text?:string, error?:string, symbol?:string}}
   */
  calcSS(type) {
    const d = this.ssDataset;
    const lsl = parseFloat(this.lsl);
    const usl = parseFloat(this.usl);
    const hasLimits = !isNaN(lsl) && !isNaN(usl);
    const hasData = d.length >= 2;

    switch (type) {
      case 'mean':
        if (!d.length) return { error: 'needData' };
        return { value: mean(d), symbol: 'x̄' };
      case 'std':
        if (!hasData) return { error: 'needN2' };
        return { value: stdSample(d), symbol: 'σ' };
      case 'cp':
        if (!hasData || !hasLimits) return { error: 'needDataAndLimits' };
        return { value: (usl - lsl) / (6 * stdSample(d)), symbol: 'Cp' };
      case 'cpk': {
        if (!hasData || !hasLimits) return { error: 'needDataAndLimits' };
        const m = mean(d), s = stdSample(d);
        return { value: Math.min((usl - m) / (3 * s), (m - lsl) / (3 * s)), symbol: 'Cpk' };
      }
      case 'pp':
        if (!hasData || !hasLimits) return { error: 'needDataAndLimits' };
        return { value: (usl - lsl) / (6 * stdPop(d)), symbol: 'Pp' };
      case 'ppk': {
        if (!hasData || !hasLimits) return { error: 'needDataAndLimits' };
        const m = mean(d), s = stdPop(d);
        return { value: Math.min((usl - m) / (3 * s), (m - lsl) / (3 * s)), symbol: 'Ppk' };
      }
      case 'sigma': {
        if (!hasData || !hasLimits) return { error: 'needDataAndLimits' };
        const m = mean(d), s = stdSample(d);
        const cpk = Math.min((usl - m) / (3 * s), (m - lsl) / (3 * s));
        return { value: cpk * 3, symbol: 'Sigma' };
      }
      case 'dpmo': {
        if (!hasData || !hasLimits) return { error: 'needDataAndLimits' };
        const m = mean(d), s = stdSample(d);
        const pBelow = normCDF((lsl - m) / s);
        const pAbove = 1 - normCDF((usl - m) / s);
        return { value: Math.round((pBelow + pAbove) * 1e6), symbol: 'DPMO' };
      }
      case 'yield': {
        if (!hasData || !hasLimits) return { error: 'needDataAndLimits' };
        const m = mean(d), s = stdSample(d);
        const pOK = normCDF((usl - m) / s) - normCDF((lsl - m) / s);
        return { text: `${(pOK * 100).toFixed(4)  }%`, symbol: 'Yield' };
      }
      case 'zscore': {
        if (!hasData || !hasLimits) return { error: 'needDataAndLimits' };
        const m = mean(d), s = stdSample(d);
        const pBelow = normCDF((lsl - m) / s);
        const pAbove = 1 - normCDF((usl - m) / s);
        const defectRate = pBelow + pAbove;
        return { value: -normInv(defectRate), symbol: 'Z-Score' };
      }
      case 'ucl':
        if (!hasData) return { error: 'needN2' };
        return { value: mean(d) + 3 * stdSample(d), symbol: 'UCL' };
      case 'lcl':
        if (!hasData) return { error: 'needN2' };
        return { value: mean(d) - 3 * stdSample(d), symbol: 'LCL' };
      default: return { error: 'error' };
    }
  }

  // ── loadExample support ────────────────────────────────────

  hasContent() {
    return this.dataset.length > 0 ||
      this.ssDataset.length > 0 ||
      this.expression !== '' ||
      this.memory !== 0 ||
      this.lsl !== '' ||
      this.usl !== '';
  }

  // ── Persistence ────────────────────────────────────────────

  toJSON() {
    return {
      mode: this.mode,
      expression: this.expression,
      lastResult: this.lastResult,
      memory: this.memory,
      angleMode: this.angleMode,
      dataset: [...this.dataset],
      ssDataset: [...this.ssDataset],
      lsl: this.lsl,
      usl: this.usl,
    };
  }

  static fromJSON(d) {
    const s = new State();
    if (!d || typeof d !== 'object') return s;
    s.mode = MODES.includes(d.mode) ? d.mode : 'sci';
    s.expression = typeof d.expression === 'string' ? d.expression : '';
    s.lastResult = typeof d.lastResult === 'number' ? d.lastResult : null;
    s.memory = typeof d.memory === 'number' ? d.memory : 0;
    s.angleMode = ANGLE_MODES.includes(d.angleMode) ? d.angleMode : 'DEG';
    s.dataset = Array.isArray(d.dataset) ? d.dataset.filter(v => typeof v === 'number') : [];
    s.ssDataset = Array.isArray(d.ssDataset) ? d.ssDataset.filter(v => typeof v === 'number') : [];
    s.lsl = d.lsl != null ? String(d.lsl) : '';
    s.usl = d.usl != null ? String(d.usl) : '';
    return s;
  }
}
