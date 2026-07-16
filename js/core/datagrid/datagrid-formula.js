/**
 * D.Mike — Formula Engine (datagrid-formula.js)
 * Parser & evaluator for cell formulas: SUM, AVG, STDEV, Cpk, IF, etc.
 */

import { parseNumeric } from './datagrid-utils.js';
import { mean, stddev } from '../../engines/process-capability-engine.js';

// ─── Public API ────────────────────────────────────────────

/** @param {*} value @returns {boolean} */
export function isFormula(value) {
  return typeof value === 'string' && value.trim().startsWith('=');
}

/**
 * Evaluate a formula string in the context of a DataGrid.
 * @param {string} formulaStr
 * @param {{ columns: object[], rowCount: number, getColumnByIndex: Function }} grid
 * @returns {{ result: number|string|null, error: string|null }}
 */
export function evaluateFormula(formulaStr, grid) {
  try {
    const raw = formulaStr.trim().substring(1).trim();
    if (!raw) return { result: null, error: '#EMPTY' };
    return _evalExpr(raw, grid);
  } catch {
    return { result: null, error: '#ERROR' };
  }
}

/**
 * Recalculate ALL formula cells in the grid.
 * @param {{ columns: object[], rowCount: number }} grid
 */
export function recalcAllFormulas(grid) {
  for (const col of grid.columns) {
    if (!col.formulas) continue;
    for (let r = 0; r < grid.rowCount; r++) {
      const formula = col.formulas[r];
      if (!formula) continue;
      const { result, error } = evaluateFormula(formula, grid);
      col.values[r] = error ? null : result;
    }
  }
}

// ─── Expression Evaluator (recursive) ──────────────────────

function _evalExpr(rawExpr, grid) {
  const expr = rawExpr.trim();

  // ── Infix arithmetic: + - (lowest precedence) ──────────
  // Find rightmost top-level + or - (skip unary minus at pos 0)
  {
    const idx = _findLastTopLevelAddSub(expr);
    if (idx > 0) {
      const left  = _evalExpr(expr.substring(0, idx), grid);
      const right = _evalExpr(expr.substring(idx + 1), grid);
      if (left.error) return left;
      if (right.error) return right;
      const l = _resolveScalar(left), r = _resolveScalar(right);
      if (l == null || r == null) return { result: null, error: '#VALUE!' };
      const op = expr[idx];
      return { result: op === '+' ? l + r : l - r, error: null };
    }
  }

  // ── Infix arithmetic: * / (higher precedence) ─────────
  {
    const idx = _findLastTopLevel(expr, '*', '/');
    if (idx > 0) {
      const left  = _evalExpr(expr.substring(0, idx), grid);
      const right = _evalExpr(expr.substring(idx + 1), grid);
      if (left.error) return left;
      if (right.error) return right;
      const l = _resolveScalar(left), r = _resolveScalar(right);
      if (l == null || r == null) return { result: null, error: '#VALUE!' };
      const op = expr[idx];
      if (op === '/' && r === 0) return { result: null, error: '#DIV/0' };
      return { result: op === '*' ? l * r : l / r, error: null };
    }
  }

  // ── Unary minus ────────────────────────────────────────
  if (expr.startsWith('-')) {
    const inner = _evalExpr(expr.substring(1), grid);
    if (inner.error) return inner;
    const v = _resolveScalar(inner);
    if (v == null) return { result: null, error: '#VALUE!' };
    return { result: -v, error: null };
  }

  // ── Unary plus ─────────────────────────────────────────
  if (expr.startsWith('+')) {
    return _evalExpr(expr.substring(1), grid);
  }

  // ── Parenthesized expression ───────────────────────────
  if (expr.startsWith('(') && _matchingParen(expr) === expr.length - 1) {
    return _evalExpr(expr.substring(1, expr.length - 1), grid);
  }

  // ── Numeric literal ────────────────────────────────────
  const numLit = parseNumeric(expr);
  if (numLit !== null && expr !== '') return { result: numLit, error: null };

  // Quoted column name: 'Spaltenname'
  if (expr.startsWith("'") && expr.endsWith("'") && expr.length > 2) {
    const name = expr.slice(1, -1);
    const col = grid.columns.find(c => c.name === name);
    if (col) return { result: null, error: null, _colRef: col };
    return { result: null, error: `#NAME? '${name}'` };
  }

  // String literal "..."
  if (expr.startsWith('"') && expr.endsWith('"')) {
    return { result: expr.slice(1, -1), error: null };
  }

  // Cell reference: C2[5]
  const cellRef = expr.match(/^C(\d+)\[(\d+)\]$/i);
  if (cellRef) {
    const col = grid.getColumnByIndex(parseInt(cellRef[1]) - 1);
    const row = parseInt(cellRef[2]) - 1;
    if (!col || row < 0 || row >= grid.rowCount) return { result: null, error: '#REF!' };
    return { result: col.values[row] ?? null, error: null };
  }

  // Quoted name with cell index: 'Name'[5]
  const namedCellRef = expr.match(/^'(.+)'\[(\d+)\]$/);
  if (namedCellRef) {
    const col = grid.columns.find(c => c.name === namedCellRef[1]);
    const row = parseInt(namedCellRef[2]) - 1;
    if (!col || row < 0 || row >= grid.rowCount) return { result: null, error: '#REF!' };
    return { result: col.values[row] ?? null, error: null };
  }

  // Function call: NAME(args...)
  const fnMatch = expr.match(/^([A-Z_]\w*)\s*\((.*)\)$/is);
  if (!fnMatch) return { result: null, error: '#SYNTAX' };

  const fnName = fnMatch[1].toUpperCase();
  const argsRaw = fnMatch[2].trim();
  const argTokens = _splitArgs(argsRaw);

  switch (fnName) {
    // ─── Aggregate functions ───────────────────────────
    case 'SUM': {
      const vals = resolveFormulaArgs(argsRaw, grid);
      return { result: vals.reduce((a, b) => a + b, 0), error: null };
    }
    case 'AVG':
    case 'AVERAGE': {
      const vals = resolveFormulaArgs(argsRaw, grid);
      if (vals.length === 0) return { result: 0, error: null };
      return { result: mean(vals), error: null };
    }
    case 'COUNT': {
      const vals = resolveFormulaArgs(argsRaw, grid);
      return { result: vals.length, error: null };
    }
    case 'MIN': {
      const vals = resolveFormulaArgs(argsRaw, grid);
      if (vals.length === 0) return { result: null, error: '#EMPTY' };
      return { result: Math.min(...vals), error: null };
    }
    case 'MAX': {
      const vals = resolveFormulaArgs(argsRaw, grid);
      if (vals.length === 0) return { result: null, error: '#EMPTY' };
      return { result: Math.max(...vals), error: null };
    }
    case 'STDEV': {
      const vals = resolveFormulaArgs(argsRaw, grid);
      if (vals.length < 2) return { result: null, error: '#N/A' };
      return { result: stddev(vals), error: null };
    }
    case 'VAR': {
      const vals = resolveFormulaArgs(argsRaw, grid);
      if (vals.length < 2) return { result: null, error: '#N/A' };
      const s = stddev(vals);
      return { result: s * s, error: null };
    }
    case 'MEDIAN': {
      const vals = resolveFormulaArgs(argsRaw, grid).slice().sort((a, b) => a - b);
      if (vals.length === 0) return { result: null, error: '#EMPTY' };
      const mid = Math.floor(vals.length / 2);
      const res = vals.length % 2 !== 0 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
      return { result: res, error: null };
    }
    case 'RANGE': {
      const vals = resolveFormulaArgs(argsRaw, grid);
      if (vals.length === 0) return { result: null, error: '#EMPTY' };
      return { result: Math.max(...vals) - Math.min(...vals), error: null };
    }
    case 'PERCENTILE': {
      if (argTokens.length !== 2) return { result: null, error: '#ARG' };
      const vals = _resolveArgToValues(argTokens[0], grid).slice().sort((a, b) => a - b);
      const pRes = _evalExpr(argTokens[1], grid);
      if (pRes.error) return pRes;
      if (vals.length === 0) return { result: null, error: '#EMPTY' };
      const p = pRes.result;
      if (p < 0 || p > 1) return { result: null, error: '#NUM!' };
      if (p === 0) return { result: vals[0], error: null };
      if (p === 1) return { result: vals[vals.length - 1], error: null };
      const rank = p * (vals.length - 1);
      const lo = Math.floor(rank), hi = Math.ceil(rank);
      return { result: vals[lo] + (vals[hi] - vals[lo]) * (rank - lo), error: null };
    }
    case 'QUARTILE': {
      if (argTokens.length !== 2) return { result: null, error: '#ARG' };
      const vals = _resolveArgToValues(argTokens[0], grid).slice().sort((a, b) => a - b);
      const qRes = _evalExpr(argTokens[1], grid);
      if (qRes.error) return qRes;
      if (vals.length === 0) return { result: null, error: '#EMPTY' };
      const q = qRes.result;
      if (q < 0 || q > 4) return { result: null, error: '#NUM!' };
      const p = q / 4;
      if (p === 0) return { result: vals[0], error: null };
      if (p === 1) return { result: vals[vals.length - 1], error: null };
      const rank = p * (vals.length - 1);
      const lo = Math.floor(rank), hi = Math.ceil(rank);
      return { result: vals[lo] + (vals[hi] - vals[lo]) * (rank - lo), error: null };
    }
    case 'IQR': {
      const vals = resolveFormulaArgs(argsRaw, grid).slice().sort((a, b) => a - b);
      if (vals.length < 4) return { result: null, error: '#N/A' };
      const q1Rank = 0.25 * (vals.length - 1);
      const q3Rank = 0.75 * (vals.length - 1);
      const q1 = vals[Math.floor(q1Rank)] + (vals[Math.ceil(q1Rank)] - vals[Math.floor(q1Rank)]) * (q1Rank - Math.floor(q1Rank));
      const q3 = vals[Math.floor(q3Rank)] + (vals[Math.ceil(q3Rank)] - vals[Math.floor(q3Rank)]) * (q3Rank - Math.floor(q3Rank));
      return { result: q3 - q1, error: null };
    }
    case 'MODE': {
      const vals = resolveFormulaArgs(argsRaw, grid);
      if (vals.length === 0) return { result: null, error: '#EMPTY' };
      const freq = new Map();
      for (const v of vals) freq.set(v, (freq.get(v) || 0) + 1);
      let maxCount = 0, modeVal = null;
      for (const [v, c] of freq) { if (c > maxCount) { maxCount = c; modeVal = v; } }
      if (maxCount <= 1) return { result: null, error: '#N/A' };
      return { result: modeVal, error: null };
    }
    case 'SKEW': {
      const vals = resolveFormulaArgs(argsRaw, grid);
      const n = vals.length;
      if (n < 3) return { result: null, error: '#N/A' };
      const m = mean(vals), s = stddev(vals);
      if (s === 0) return { result: null, error: '#DIV/0' };
      const sum3 = vals.reduce((a, v) => a + ((v - m) / s) ** 3, 0);
      return { result: (n / ((n - 1) * (n - 2))) * sum3, error: null };
    }
    case 'KURT': {
      const vals = resolveFormulaArgs(argsRaw, grid);
      const n = vals.length;
      if (n < 4) return { result: null, error: '#N/A' };
      const m = mean(vals), s = stddev(vals);
      if (s === 0) return { result: null, error: '#DIV/0' };
      const sum4 = vals.reduce((a, v) => a + ((v - m) / s) ** 4, 0);
      const excess = (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3)) * sum4
                   - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
      return { result: excess, error: null };
    }

    // ─── Conditional aggregates ───────────────────────
    case 'COUNTA': {
      if (argTokens.length !== 1) return { result: null, error: '#ARG' };
      const col = _resolveArgToCol(argTokens[0], grid);
      if (!col) return { result: null, error: '#REF!' };
      let count = 0;
      for (const v of col.values) { if (v != null && v !== '') count++; }
      return { result: count, error: null };
    }
    case 'COUNTIF': {
      // COUNTIF(criteriaRange; criterion) — counts cells in criteriaRange that match.
      if (argTokens.length !== 2) return { result: null, error: '#ARG' };
      const vals = _resolveArgToValues(argTokens[0], grid);
      const condToken = argTokens[1].trim();
      const { op, threshold } = _parseConditionArg(condToken, grid);
      if (op === null) return { result: null, error: '#VALUE!' };
      let count = 0;
      for (const v of vals) { if (_compareOp(v, op, threshold)) count++; }
      return { result: count, error: null };
    }
    case 'SUMIF':
    case 'AVERAGEIF':
    case 'STDEVIF':
    case 'VARIF': {
      // Excel-Stil: FN(criteriaRange; criterion; [valueRange])
      // Bei nur 2 Argumenten: criteriaRange = valueRange (Bedingung auf den Werten selbst).
      if (argTokens.length < 2 || argTokens.length > 3) return { result: null, error: '#ARG' };
      const condToken = argTokens[1].trim();
      const { op, threshold } = _parseConditionArg(condToken, grid);
      if (op === null) return { result: null, error: '#VALUE!' };

      const matched = _resolveConditionalValues(argTokens[0], argTokens[2] ?? null, op, threshold, grid);
      if (matched.error) return { result: null, error: matched.error };
      const vals = matched.values;

      if (fnName === 'SUMIF') {
        return { result: vals.reduce((a, b) => a + b, 0), error: null };
      }
      if (fnName === 'AVERAGEIF') {
        if (vals.length === 0) return { result: null, error: '#DIV/0' };
        return { result: mean(vals), error: null };
      }
      if (fnName === 'STDEVIF') {
        if (vals.length < 2) return { result: null, error: '#N/A' };
        return { result: stddev(vals), error: null };
      }
      // VARIF
      if (vals.length < 2) return { result: null, error: '#N/A' };
      const s = stddev(vals);
      return { result: s * s, error: null };
    }

    // ─── Utility math ─────────────────────────────────
    case 'MOD': {
      if (argTokens.length !== 2) return { result: null, error: '#ARG' };
      const xR = _evalExpr(argTokens[0], grid);
      const nR = _evalExpr(argTokens[1], grid);
      if (xR.error) return xR;
      if (nR.error) return nR;
      if (nR.result === 0) return { result: null, error: '#DIV/0' };
      return { result: xR.result - nR.result * Math.floor(xR.result / nR.result), error: null };
    }
    case 'SIGN': {
      if (argTokens.length !== 1) return { result: null, error: '#ARG' };
      const r = _evalExpr(argTokens[0], grid);
      if (r.error) return r;
      return { result: Math.sign(r.result), error: null };
    }
    case 'CONCAT': {
      const parts = [];
      for (const t of argTokens) {
        const r = _evalExpr(t, grid);
        if (r.error) return r;
        parts.push(r.result != null ? String(r.result) : '');
      }
      return { result: parts.join(''), error: null };
    }

    // ─── 6 Sigma Capability ─────────────────────────────
    case 'CPKUP': {
      if (argTokens.length !== 2) return { result: null, error: '#ARG' };
      const vals = _resolveArgToValues(argTokens[0], grid);
      const uslRes = _evalExpr(argTokens[1], grid);
      if (uslRes.error) return uslRes;
      if (vals.length < 2) return { result: null, error: '#N/A' };
      const s = stddev(vals);
      if (s === 0) return { result: null, error: '#DIV/0' };
      return { result: (uslRes.result - mean(vals)) / (3 * s), error: null };
    }
    case 'CPKLO': {
      if (argTokens.length !== 2) return { result: null, error: '#ARG' };
      const vals = _resolveArgToValues(argTokens[0], grid);
      const lslRes = _evalExpr(argTokens[1], grid);
      if (lslRes.error) return lslRes;
      if (vals.length < 2) return { result: null, error: '#N/A' };
      const s = stddev(vals);
      if (s === 0) return { result: null, error: '#DIV/0' };
      return { result: (mean(vals) - lslRes.result) / (3 * s), error: null };
    }
    case 'CP': {
      if (argTokens.length !== 3) return { result: null, error: '#ARG' };
      const vals = _resolveArgToValues(argTokens[0], grid);
      const lslRes = _evalExpr(argTokens[1], grid);
      const uslRes = _evalExpr(argTokens[2], grid);
      if (lslRes.error) return lslRes;
      if (uslRes.error) return uslRes;
      if (vals.length < 2) return { result: null, error: '#N/A' };
      const s = stddev(vals);
      if (s === 0) return { result: null, error: '#DIV/0' };
      return { result: (uslRes.result - lslRes.result) / (6 * s), error: null };
    }
    case 'CPK': {
      if (argTokens.length !== 3) return { result: null, error: '#ARG' };
      const vals = _resolveArgToValues(argTokens[0], grid);
      const lslRes = _evalExpr(argTokens[1], grid);
      const uslRes = _evalExpr(argTokens[2], grid);
      if (lslRes.error) return lslRes;
      if (uslRes.error) return uslRes;
      if (vals.length < 2) return { result: null, error: '#N/A' };
      const m = mean(vals), s = stddev(vals);
      if (s === 0) return { result: null, error: '#DIV/0' };
      return { result: Math.min((uslRes.result - m) / (3 * s), (m - lslRes.result) / (3 * s)), error: null };
    }

    // ─── Logic ────────────────────────────────────────
    case 'IF': {
      if (argTokens.length < 2) return { result: null, error: '#ARG' };
      const condRes = _evalCondition(argTokens[0], grid);
      if (condRes.error) return condRes;
      const branch = condRes.result ? (argTokens[1] || '') : (argTokens[2] || '');
      return _evalExpr(branch, grid);
    }
    case 'AND': {
      for (const t of argTokens) {
        const r = _evalCondition(t, grid);
        if (r.error) return r;
        if (!r.result) return { result: 0, error: null };
      }
      return { result: 1, error: null };
    }
    case 'OR': {
      for (const t of argTokens) {
        const r = _evalCondition(t, grid);
        if (r.error) return r;
        if (r.result) return { result: 1, error: null };
      }
      return { result: 0, error: null };
    }
    case 'NOT': {
      if (argTokens.length < 1) return { result: null, error: '#ARG' };
      const r = _evalCondition(argTokens[0], grid);
      if (r.error) return r;
      return { result: r.result ? 0 : 1, error: null };
    }

    // ─── Math ─────────────────────────────────────────
    case 'ABS': {
      if (argTokens.length !== 1) return { result: null, error: '#ARG' };
      const r = _evalExpr(argTokens[0], grid);
      if (r.error) return r;
      return { result: Math.abs(r.result), error: null };
    }
    case 'ROUND':
    case 'ROUNDUP':
    case 'ROUNDDOWN': {
      if (argTokens.length < 1 || argTokens.length > 2) return { result: null, error: '#ARG' };
      const numR = _evalExpr(argTokens[0], grid);
      if (numR.error) return numR;
      const decimals = argTokens[1] ? parseInt(_evalExpr(argTokens[1], grid).result) : 0;
      const factor = Math.pow(10, decimals);
      if (fnName === 'ROUND') return { result: Math.round(numR.result * factor) / factor, error: null };
      const sign = numR.result >= 0 ? 1 : -1;
      const op = fnName === 'ROUNDUP' ? Math.ceil : Math.floor;
      return { result: sign * op(Math.abs(numR.result) * factor) / factor, error: null };
    }
    case 'SQRT': {
      if (argTokens.length !== 1) return { result: null, error: '#ARG' };
      const r = _evalExpr(argTokens[0], grid);
      if (r.error) return r;
      if (r.result < 0) return { result: null, error: '#NUM!' };
      return { result: Math.sqrt(r.result), error: null };
    }
    case 'POWER': {
      if (argTokens.length !== 2) return { result: null, error: '#ARG' };
      const base = _evalExpr(argTokens[0], grid);
      const exp  = _evalExpr(argTokens[1], grid);
      if (base.error) return base;
      if (exp.error) return exp;
      return { result: Math.pow(base.result, exp.result), error: null };
    }
    case 'LN': {
      if (argTokens.length !== 1) return { result: null, error: '#ARG' };
      const r = _evalExpr(argTokens[0], grid);
      if (r.error) return r;
      if (r.result <= 0) return { result: null, error: '#NUM!' };
      return { result: Math.log(r.result), error: null };
    }
    case 'LOG': {
      if (argTokens.length < 1 || argTokens.length > 2) return { result: null, error: '#ARG' };
      const r = _evalExpr(argTokens[0], grid);
      if (r.error) return r;
      if (r.result <= 0) return { result: null, error: '#NUM!' };
      const base = argTokens[1] ? _evalExpr(argTokens[1], grid) : null;
      if (base && base.error) return base;
      const b = base ? base.result : 10;
      if (b <= 0 || b === 1) return { result: null, error: '#NUM!' };
      return { result: Math.log(r.result) / Math.log(b), error: null };
    }
    case 'EXP': {
      if (argTokens.length !== 1) return { result: null, error: '#ARG' };
      const r = _evalExpr(argTokens[0], grid);
      if (r.error) return r;
      return { result: Math.exp(r.result), error: null };
    }
    case 'PI': {
      if (argTokens.length > 1 || (argTokens.length === 1 && argTokens[0] !== '')) return { result: null, error: '#ARG' };
      return { result: Math.PI, error: null };
    }

    // ─── Trigonometric (radians) ──────────────────────
    case 'SIN': case 'COS': case 'TAN':
    case 'ASIN': case 'ACOS': case 'ATAN': {
      if (argTokens.length !== 1) return { result: null, error: '#ARG' };
      const r = _evalExpr(argTokens[0], grid);
      if (r.error) return r;
      if ((fnName === 'ASIN' || fnName === 'ACOS') && (r.result < -1 || r.result > 1))
        return { result: null, error: '#NUM!' };
      const fn = { SIN: Math.sin, COS: Math.cos, TAN: Math.tan, ASIN: Math.asin, ACOS: Math.acos, ATAN: Math.atan };
      return { result: fn[fnName](r.result), error: null };
    }
    case 'ATAN2': {
      if (argTokens.length !== 2) return { result: null, error: '#ARG' };
      const y = _evalExpr(argTokens[0], grid);
      const x = _evalExpr(argTokens[1], grid);
      if (y.error) return y;
      if (x.error) return x;
      return { result: Math.atan2(y.result, x.result), error: null };
    }

    // ─── Trigonometric (degrees) ──────────────────────
    case 'SIND': case 'COSD': case 'TAND':
    case 'ASIND': case 'ACOSD': case 'ATAND': {
      if (argTokens.length !== 1) return { result: null, error: '#ARG' };
      const r = _evalExpr(argTokens[0], grid);
      if (r.error) return r;
      const toRad = Math.PI / 180, toDeg = 180 / Math.PI;
      switch (fnName) {
        case 'SIND':  return { result: Math.sin(r.result * toRad), error: null };
        case 'COSD':  return { result: Math.cos(r.result * toRad), error: null };
        case 'TAND':  return { result: Math.tan(r.result * toRad), error: null };
        case 'ASIND':
          if (r.result < -1 || r.result > 1) return { result: null, error: '#NUM!' };
          return { result: Math.asin(r.result) * toDeg, error: null };
        case 'ACOSD':
          if (r.result < -1 || r.result > 1) return { result: null, error: '#NUM!' };
          return { result: Math.acos(r.result) * toDeg, error: null };
        case 'ATAND': return { result: Math.atan(r.result) * toDeg, error: null };
      }
      break; // unreachable
    }

    // ─── Conversion helpers ───────────────────────────
    case 'RAD': {
      if (argTokens.length !== 1) return { result: null, error: '#ARG' };
      const r = _evalExpr(argTokens[0], grid);
      if (r.error) return r;
      return { result: r.result * Math.PI / 180, error: null };
    }
    case 'DEG': {
      if (argTokens.length !== 1) return { result: null, error: '#ARG' };
      const r = _evalExpr(argTokens[0], grid);
      if (r.error) return r;
      return { result: r.result * 180 / Math.PI, error: null };
    }

    default:
      return { result: null, error: '#FUNC?' };
  }
}

// ─── Argument Splitting ────────────────────────────────────

/** Split top-level semicolon-separated args, respecting nested parens and single-quoted strings. */
function _splitArgs(str) {
  const parts = [];
  let depth = 0, cur = '', inQuote = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "'" && !inQuote) { inQuote = true; cur += ch; }
    else if (ch === "'" && inQuote) { inQuote = false; cur += ch; }
    else if (inQuote) { cur += ch; }
    else if (ch === '(') { depth++; cur += ch; }
    else if (ch === ')') { depth--; cur += ch; }
    else if (ch === ';' && depth === 0) { parts.push(cur.trim()); cur = ''; }
    else { cur += ch; }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

// ─── Scalar Resolution ─────────────────────────────────────

function _resolveScalar(r) {
  if (r._colRef) {
    const nums = [];
    _pushNumericValues(r._colRef, nums);
    return nums.length > 0 ? nums[0] : null;
  }
  return r.result;
}

// ─── Condition Evaluator ───────────────────────────────────

function _evalCondition(rawExpr, grid) {
  const expr = rawExpr.trim();
  const ops = ['>=', '<=', '<>', '!=', '>', '<', '='];
  for (const op of ops) {
    const idx = _findTopLevelOp(expr, op);
    if (idx >= 0) {
      const left  = _evalExpr(expr.substring(0, idx).trim(), grid);
      const right = _evalExpr(expr.substring(idx + op.length).trim(), grid);
      if (left.error) return left;
      if (right.error) return right;
      const l = _resolveScalar(left);
      const r = _resolveScalar(right);
      let res;
      switch (op) {
        case '>':  res = l > r; break;
        case '<':  res = l < r; break;
        case '>=': res = l >= r; break;
        case '<=': res = l <= r; break;
        // Intentional loose equality below: formula scalars may be number or
        // string (e.g. comparing a string cell value against a numeric literal).
        // Strict comparison would change spreadsheet semantics.
        case '=':  res = l == r; break; // eslint-disable-line eqeqeq
        case '<>':
        case '!=': res = l != r; break; // eslint-disable-line eqeqeq
      }
      return { result: res ? 1 : 0, error: null };
    }
  }
  const r = _evalExpr(expr, grid);
  if (r.error) return r;
  const val = _resolveScalar(r);
  return { result: (val && val !== '0' && val !== 0) ? 1 : 0, error: null };
}

/** Find index of operator at top-level (not inside parens or single-quoted strings). */
function _findTopLevelOp(expr, op) {
  let depth = 0, inQuote = false;
  for (let i = 0; i <= expr.length - op.length; i++) {
    const ch = expr[i];
    if (ch === "'" && !inQuote) { inQuote = true;  continue; }
    if (ch === "'" &&  inQuote) { inQuote = false; continue; }
    if (inQuote) continue;
    if (ch === '(') { depth++; continue; }
    if (ch === ')') { depth--; continue; }
    if (depth === 0 && expr.substring(i, i + op.length) === op) return i;
  }
  return -1;
}

// ─── Argument Resolution ───────────────────────────────────

function _resolveArgToValues(rawToken, grid) {
  const token = rawToken.trim();
  const nums = [];
  const namedCol = token.match(/^'(.+)'$/);
  if (namedCol) {
    const col = grid.columns.find(c => c.name === namedCol[1]);
    if (col) _pushNumericValues(col, nums);
    return nums;
  }
  return resolveFormulaArgs(token, grid);
}

/** Resolve a token to a column object (for COUNTA etc.). */
function _resolveArgToCol(rawToken, grid) {
  const token = rawToken.trim();
  const namedCol = token.match(/^'(.+)'$/);
  if (namedCol) return grid.columns.find(c => c.name === namedCol[1]) || null;
  const colMatch = token.match(/^C(\d+)$/i);
  if (colMatch) return grid.getColumnByIndex(parseInt(colMatch[1]) - 1) || null;
  return null;
}

/**
 * Parse a condition argument into { op, threshold }.
 * Supports:
 *   - explicit operators: ">10", "<=5.5", "=0", "<>A"
 *   - implicit equality: "5" → op="=", threshold=5
 *   - cell references and string literals: 'GroupID'[2], "A"
 *   - numeric and text thresholds
 */
function _parseConditionArg(token, grid) {
  let op = '=';
  let valueToken = token;

  const m = token.match(/^(>=|<=|<>|!=|>|<|=)\s*(.+)$/);
  if (m) {
    op = m[1];
    valueToken = m[2].trim();
  }

  if (!valueToken) return { op: null, threshold: null };

  // String literal "..."
  if (valueToken.startsWith('"') && valueToken.endsWith('"') && valueToken.length >= 2) {
    const inner = valueToken.slice(1, -1).trim();
    // Check if operator is INSIDE the string literal (e.g. ">10")
    const innerMatch = inner.match(/^(>=|<=|<>|!=|>|<|=)\s*(.+)$/);
    if (innerMatch) {
      const innerOp = innerMatch[1];
      const innerValToken = innerMatch[2].trim();
      const numVal = parseNumeric(innerValToken);
      return { op: innerOp, threshold: numVal !== null ? numVal : innerValToken };
    }
    return { op, threshold: inner };
  }
  // Numeric literal
  const numVal = parseNumeric(valueToken);
  if (numVal !== null) return { op, threshold: numVal };
  // Otherwise: evaluate as expression (cell ref, formula, etc.) — may yield number or string
  const r = _evalExpr(valueToken, grid);
  if (r.error || r.result == null) return { op: null, threshold: null };
  return { op, threshold: r.result };
}

/** Apply a comparison operator. Numeric and string operands both work via JS coercion. */
function _compareOp(val, op, threshold) {
  if (val == null) return false;
  switch (op) {
    case '>':  return val >  threshold;
    case '<':  return val <  threshold;
    case '>=': return val >= threshold;
    case '<=': return val <= threshold;
    case '=':  return val == threshold;   // eslint-disable-line eqeqeq -- loose equality so 1 == "1" matches Excel-style
    case '<>': case '!=': return val != threshold; // eslint-disable-line eqeqeq -- loose equality, Excel-style
    default: return false;
  }
}

/**
 * Resolve criteriaRange + (optional) valueRange to the numeric values of valueRange
 * at the row indices where criteriaRange satisfies (op, threshold).
 *
 * - If valueArg is null: criteriaRange is also the value source (2-arg compatibility).
 * - Both args must point to a single column reference (named or Cn). Multi-column ranges
 *   are not supported in 3-arg conditional aggregates and return #VALUE!.
 *
 * @returns {{values: number[], error: null} | {values: null, error: string}}
 */
function _resolveConditionalValues(criteriaArg, valueArg, op, threshold, grid) {
  const criteriaCol = _resolveArgToCol(criteriaArg.trim(), grid);
  if (!criteriaCol) {
    // 2-arg fallback: criteriaArg may be a multi-cell range — flat-filter values directly.
    if (valueArg == null) {
      const flat = _resolveArgToValues(criteriaArg, grid);
      const out = [];
      for (const v of flat) if (_compareOp(v, op, threshold)) out.push(v);
      return { values: out, error: null };
    }
    return { values: null, error: '#REF!' };
  }
  const valueCol = (valueArg == null)
    ? criteriaCol
    : _resolveArgToCol(valueArg.trim(), grid);
  if (!valueCol) return { values: null, error: '#REF!' };

  const out = [];
  const n = Math.min(criteriaCol.values.length, valueCol.values.length);
  for (let i = 0; i < n; i++) {
    if (!_compareOp(criteriaCol.values[i], op, threshold)) continue;
    const raw = valueCol.values[i];
    if (raw == null) continue;
    const num = (typeof raw === 'number' && !isNaN(raw))
      ? raw
      : parseNumeric(raw);
    if (num !== null) out.push(num);
  }
  return { values: out, error: null };
}

/**
 * Resolve formula arguments to an array of numeric values.
 * @param {string} argsStr
 * @param {object} grid
 * @returns {number[]}
 */
export function resolveFormulaArgs(argsStr, grid) {
  const nums = [];
  const parts = argsStr.split(';').map(s => s.trim());

  for (const part of parts) {
    // ── Rectangular cell range: C1[2]:C3[5] ──────────
    const cellRange = part.match(/^C(\d+)\[(\d+)\]\s*:\s*C(\d+)\[(\d+)\]$/i);
    if (cellRange) {
      const c1 = parseInt(cellRange[1]) - 1, r1 = parseInt(cellRange[2]) - 1;
      const c2 = parseInt(cellRange[3]) - 1, r2 = parseInt(cellRange[4]) - 1;
      const loC = Math.min(c1, c2), hiC = Math.max(c1, c2);
      const loR = Math.min(r1, r2), hiR = Math.max(r1, r2);
      for (let c = loC; c <= hiC; c++) {
        const col = grid.getColumnByIndex(c);
        if (col) _pushNumericValuesRange(col, loR, hiR, nums);
      }
      continue;
    }

    // ── Rectangular cell range by name: 'A'[2]:'C'[5] ─
    const namedCellRange = part.match(/^'(.+)'\[(\d+)\]\s*:\s*'(.+)'\[(\d+)\]$/);
    if (namedCellRange) {
      const fromCol = grid.columns.find(c => c.name === namedCellRange[1]);
      const toCol   = grid.columns.find(c => c.name === namedCellRange[3]);
      const r1 = parseInt(namedCellRange[2]) - 1, r2 = parseInt(namedCellRange[4]) - 1;
      if (fromCol && toCol) {
        const loC = Math.min(grid.columns.indexOf(fromCol), grid.columns.indexOf(toCol));
        const hiC = Math.max(grid.columns.indexOf(fromCol), grid.columns.indexOf(toCol));
        const loR = Math.min(r1, r2), hiR = Math.max(r1, r2);
        for (let c = loC; c <= hiC; c++) {
          const col = grid.getColumnByIndex(c);
          if (col) _pushNumericValuesRange(col, loR, hiR, nums);
        }
      }
      continue;
    }

    // Single cell: C1[2]
    const singleCell = part.match(/^C(\d+)\[(\d+)\]$/i);
    if (singleCell) {
      const col = grid.getColumnByIndex(parseInt(singleCell[1]) - 1);
      const row = parseInt(singleCell[2]) - 1;
      if (col && row >= 0 && row < col.values.length) {
        const v = col.values[row];
        const n = (typeof v === 'number' && !isNaN(v)) ? v : parseNumeric(v);
        if (n !== null) nums.push(n);
      }
      continue;
    }

    // Single cell by name: 'A'[2]
    const namedSingleCell = part.match(/^'(.+)'\[(\d+)\]$/);
    if (namedSingleCell) {
      const col = grid.columns.find(c => c.name === namedSingleCell[1]);
      const row = parseInt(namedSingleCell[2]) - 1;
      if (col && row >= 0 && row < col.values.length) {
        const v = col.values[row];
        const n = (typeof v === 'number' && !isNaN(v)) ? v : parseNumeric(v);
        if (n !== null) nums.push(n);
      }
      continue;
    }

    // Named column range: 'Durchmesser':'Rundheit'
    const namedRange = part.match(/^'(.+)'\s*:\s*'(.+)'$/);
    if (namedRange) {
      const fromCol = grid.columns.find(c => c.name === namedRange[1]);
      const toCol   = grid.columns.find(c => c.name === namedRange[2]);
      if (fromCol && toCol) {
        const lo = Math.min(grid.columns.indexOf(fromCol), grid.columns.indexOf(toCol));
        const hi = Math.max(grid.columns.indexOf(fromCol), grid.columns.indexOf(toCol));
        for (let c = lo; c <= hi; c++) {
          const col = grid.getColumnByIndex(c);
          if (col) _pushNumericValues(col, nums);
        }
      }
      continue;
    }

    // Single quoted column name
    const namedCol = part.match(/^'(.+)'$/);
    if (namedCol) {
      const col = grid.columns.find(c => c.name === namedCol[1]);
      if (col) _pushNumericValues(col, nums);
      continue;
    }

    // Column range: C1:C3
    const rangeMatch = part.match(/^C(\d+)\s*:\s*C(\d+)$/i);
    if (rangeMatch) {
      const from = parseInt(rangeMatch[1]) - 1;
      const to   = parseInt(rangeMatch[2]) - 1;
      const lo = Math.min(from, to);
      const hi = Math.max(from, to);
      for (let c = lo; c <= hi; c++) {
        const col = grid.getColumnByIndex(c);
        if (col) _pushNumericValues(col, nums);
      }
      continue;
    }

    // Single column: C1
    const colMatch = part.match(/^C(\d+)$/i);
    if (colMatch) {
      const col = grid.getColumnByIndex(parseInt(colMatch[1]) - 1);
      if (col) _pushNumericValues(col, nums);
      continue;
    }

    // Literal number
    const n = parseNumeric(part);
    if (n !== null) {
      nums.push(n);
    }
  }
  return nums;
}

function _pushNumericValues(col, target) {
  for (const v of col.values) {
    if (v != null && typeof v === 'number' && !isNaN(v)) {
      target.push(v);
    } else if (v != null) {
      const n = parseNumeric(v);
      if (n !== null) target.push(n);
    }
  }
}

/** Push numeric values from a column for rows [loR..hiR] (inclusive, 0-based). */
function _pushNumericValuesRange(col, loR, hiR, target) {
  const end = Math.min(hiR, col.values.length - 1);
  for (let r = Math.max(loR, 0); r <= end; r++) {
    const v = col.values[r];
    if (v != null && typeof v === 'number' && !isNaN(v)) {
      target.push(v);
    } else if (v != null) {
      const n = parseNumeric(v);
      if (n !== null) target.push(n);
    }
  }
}

// ─── Arithmetic Helpers ─────────────────────────────────────

/** Find rightmost top-level + or - (not unary: skip pos 0 and after another operator). */
function _findLastTopLevelAddSub(expr) {
  let depth = 0, inQuote = false, last = -1;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === "'") { inQuote = !inQuote; continue; }
    if (inQuote) continue;
    if (ch === '(') { depth++; continue; }
    if (ch === ')') { depth--; continue; }
    if (depth === 0 && (ch === '+' || ch === '-') && i > 0) {
      // Skip if preceded by another operator or opening paren (unary context)
      const prev = expr[i - 1];
      if (prev === '(' || prev === '+' || prev === '-' || prev === '*' || prev === '/') continue;
      last = i;
    }
  }
  return last;
}

/** Find rightmost top-level occurrence of op1 or op2. */
function _findLastTopLevel(expr, op1, op2) {
  let depth = 0, inQuote = false, last = -1;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === "'") { inQuote = !inQuote; continue; }
    if (inQuote) continue;
    if (ch === '(') { depth++; continue; }
    if (ch === ')') { depth--; continue; }
    if (depth === 0 && (ch === op1 || ch === op2)) {
      last = i;
    }
  }
  return last;
}

/** Find index of closing paren that matches the opening paren at position 0. */
function _matchingParen(expr) {
  let depth = 0;
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === '(') depth++;
    else if (expr[i] === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}
